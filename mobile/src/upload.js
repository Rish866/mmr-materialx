import * as ImageManipulator from 'expo-image-manipulator';
import { api } from './api';

/**
 * Image pipeline for listings:
 *   1. compress()  — resize + JPEG compress locally (factory 4G is slow).
 *   2. uploadOne() — ask backend for signed creds, upload DIRECTLY to storage,
 *                    return the public URL.
 *   3. uploadAll() — run the above for every picked photo (sequentially to be
 *                    gentle on slow uplinks) and return the list of URLs.
 *
 * In UPLOAD_PROVIDER=local (dev), the backend returns { provider: 'local' } and
 * we simply keep the local URI so you can develop without any storage account.
 */

// Client-side compression. Returns a new local uri.
export async function compress(uri, { maxWidth = 1000, quality = 0.6 } = {}) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

function fileNameFromUri(uri) {
  const base = (uri.split('/').pop() || 'photo.jpg').split('?')[0];
  return base.toLowerCase().endsWith('.jpg') || base.toLowerCase().endsWith('.jpeg')
    ? base
    : `${base}.jpg`;
}

// Upload a single already-compressed local uri. Returns a public URL string.
export async function uploadOne(localUri) {
  const fileName = fileNameFromUri(localUri);
  const contentType = 'image/jpeg';

  const creds = await api.signUpload({ fileName, contentType });

  // Dev / no storage configured: keep the local uri.
  if (!creds || creds.provider === 'local') {
    return localUri;
  }

  if (creds.provider === 'cloudinary') {
    return uploadToCloudinary(localUri, fileName, creds);
  }
  if (creds.provider === 'supabase') {
    return uploadToSupabase(localUri, contentType, creds);
  }
  throw new Error(`Unknown upload provider: ${creds.provider}`);
}

// Cloudinary signed upload via multipart/form-data.
async function uploadToCloudinary(localUri, fileName, creds) {
  const form = new FormData();
  // React Native file part
  form.append('file', { uri: localUri, name: fileName, type: 'image/jpeg' });
  Object.entries(creds.params).forEach(([k, v]) => form.append(k, String(v)));

  const res = await fetch(creds.uploadUrl, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`);
  }
  return data[creds.responseUrlField || 'secure_url'];
}

// Supabase Storage signed-URL upload via PUT of the raw bytes.
async function uploadToSupabase(localUri, contentType, creds) {
  // RN fetch needs the bytes; fetch the local file then PUT the blob.
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();

  const res = await fetch(creds.uploadUrl, {
    method: creds.method || 'PUT',
    headers: creds.headers || { 'Content-Type': contentType },
    body: blob,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Supabase upload failed (${res.status}) ${txt}`);
  }
  return creds.publicUrl;
}

/**
 * Compress (if needed) + upload a list of local uris.
 * @param {string[]} uris
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<string[]>} public URLs (or local uris in dev)
 */
export async function uploadAll(uris, onProgress) {
  const urls = [];
  for (let i = 0; i < uris.length; i++) {
    const url = await uploadOne(uris[i]);
    urls.push(url);
    if (onProgress) onProgress(i + 1, uris.length);
  }
  return urls;
}
