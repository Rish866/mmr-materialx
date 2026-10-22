/**
 * Image upload credential provider.
 *
 * Pattern: the mobile client never holds the storage secret. It asks this
 * backend for short-lived, scoped upload credentials, then uploads the
 * (already client-compressed) image DIRECTLY to the storage provider and
 * sends back the resulting public URL in the listing payload.
 *
 * Providers (set UPLOAD_PROVIDER):
 *   - cloudinary : returns a signed set of params for Cloudinary's upload API.
 *   - supabase   : returns a short-lived signed upload URL + token.
 *   - local      : dev fallback; signing is a no-op and the app keeps the
 *                  local image URI (so you can develop without any account).
 */
const crypto = require('crypto');

const MAX_FILES = 4;

function provider() {
  return (process.env.UPLOAD_PROVIDER || 'local').toLowerCase();
}

// ---------- Cloudinary ----------
// Signed upload: we sign the params with the API secret server-side. The client
// POSTs the file + these params to https://api.cloudinary.com/v1_1/<cloud>/image/upload
function cloudinarySignature(paramsToSign, apiSecret) {
  // Cloudinary signs the sorted "key=value" pairs joined by "&", then appends
  // the api_secret, and takes the SHA-1 hex digest.
  const sorted = Object.keys(paramsToSign)
    .filter((k) => paramsToSign[k] !== undefined && paramsToSign[k] !== null && paramsToSign[k] !== '')
    .sort()
    .map((k) => `${k}=${paramsToSign[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(sorted + apiSecret).digest('hex');
}

function signCloudinary() {
  const {
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
    CLOUDINARY_UPLOAD_FOLDER,
  } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('cloudinary_not_configured');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = CLOUDINARY_UPLOAD_FOLDER || 'mmr-listings';
  // Params that must be signed (order-independent; signed helper sorts them).
  const paramsToSign = { folder, timestamp };
  const signature = cloudinarySignature(paramsToSign, CLOUDINARY_API_SECRET);

  return {
    provider: 'cloudinary',
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    // The client sends these exact fields alongside the file.
    params: {
      api_key: CLOUDINARY_API_KEY,
      timestamp,
      folder,
      signature,
    },
    // where the public URL will appear in the provider's JSON response
    responseUrlField: 'secure_url',
  };
}

// ---------- Supabase Storage ----------
// Creates a short-lived signed upload URL via the Storage REST API. The client
// then PUTs the file bytes to that URL. Requires the service-role key (kept here
// on the server only).
async function signSupabase(fileName, contentType) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('supabase_not_configured');
  }
  const bucket = SUPABASE_BUCKET || 'listings';
  const objectPath = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName(fileName)}`;

  // Ask Supabase for a signed upload URL (valid a few minutes).
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${objectPath}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );
  if (!res.ok) {
    throw new Error(`supabase_sign_failed_${res.status}`);
  }
  const data = await res.json();
  // data.url is a path like /object/upload/sign/<bucket>/<path>?token=...
  const signedUrl = `${SUPABASE_URL}/storage/v1${data.url}`;
  // Public URL assuming the bucket is public; otherwise generate a signed read URL.
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;

  return {
    provider: 'supabase',
    method: 'PUT',
    uploadUrl: signedUrl,
    headers: { 'Content-Type': contentType || 'image/jpeg', 'x-upsert': 'true' },
    publicUrl,
  };
}

function safeName(name) {
  return String(name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
}

/**
 * Returns upload credentials for one file.
 * @param {object} opts { fileName, contentType }
 */
async function getUploadCredentials(opts = {}) {
  switch (provider()) {
    case 'cloudinary':
      return signCloudinary();
    case 'supabase':
      return signSupabase(opts.fileName, opts.contentType);
    case 'local':
    default:
      // Dev no-op: the client keeps the local URI.
      return { provider: 'local' };
  }
}

module.exports = { getUploadCredentials, provider, MAX_FILES, cloudinarySignature, safeName };
