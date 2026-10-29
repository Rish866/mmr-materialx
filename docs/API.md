# API Reference — MMR MaterialX

Base URL (dev): `http://localhost:3000`
Auth: `Authorization: Bearer <jwt>` on protected routes.

| Method | Path | Auth | Body / Query | Returns |
|---|---|---|---|---|
| GET  | `/health` | – | – | `{ ok, service }` |
| POST | `/auth/otp/send` | – | `{ phone }` | `{ ok: true }` |
| POST | `/auth/otp/verify` | – | `{ phone, code }` | `{ token, user }` |
| GET  | `/me` | ✅ | – | user profile |
| PATCH| `/me` | ✅ | `{ name?, business_name?, latitude?, longitude?, hub_name? }` | updated profile |
| GET  | `/categories` | – | – | `[ {id,name,slug,icon} ]` |
| POST | `/uploads/sign` | ✅ | `{ fileName?, contentType? }` | provider-specific upload credentials |
| POST | `/listings` | ✅ | listing payload (below) | `{ listing }` |
| GET  | `/listings` | – | `lat, lng, radius_km=25, category?, q?` | `[ listing + distance_km + category ]` |
| GET  | `/listings/mine` | ✅ owner | – | `[ seller's own listings, all statuses + category ]` |
| GET  | `/listings/:id` | – | – | listing + seller contact |
| PATCH| `/listings/:id` | ✅ owner | partial editable fields (below) | `{ listing }` |
| PATCH| `/listings/:id/status` | ✅ owner | `{ status: active\|sold\|expired\|withdrawn }` | `{ id, status }` |
| POST | `/listings/:id/interest` | ✅ | `{ offer_price? }` | `{ whatsapp_url }` |

### Create-listing payload
```json
{
  "title": "Leftover Epoxy Primer 20L",
  "category_id": 1,
  "quantity": 200,
  "unit": "litres",
  "price": 12000,
  "price_type": "total",          // "per_unit" | "total"
  "is_urgent": true,               // true -> expires_at set to now()+24h
  "latitude": 19.082,
  "longitude": 73.100,
  "hub_name": "Taloja MIDC",
  "photos": ["https://.../1.jpg"]  // upload to storage first, send URLs
}
```

### Feed behaviour
- Requires `lat` & `lng` (buyer's location). `radius_km` defaults to 25.
- Distance computed via Haversine in SQL; each row carries `distance_km`.
- Sort order: `is_urgent DESC, distance_km ASC, created_at DESC`.
- Shows only `active` listings and hides urgent listings past `expires_at`
  (so `sold`, `expired`, and `withdrawn` never appear to buyers).

### Seller listing management
- **`GET /listings/mine`** — the authenticated seller's own listings across
  **all** statuses (active/sold/expired/withdrawn), newest first, each with
  `category_slug`/`category_name`. On each call it lazily flips any of *that
  seller's* urgent listings whose `expires_at` has passed from `active` to
  `expired` — a safe, infra-free cleanup scoped to the caller's own rows (no
  cron/worker needed). The public feed already excludes past-expiry listings
  regardless.
- **`PATCH /listings/:id`** — partial edit, **owner-only** (ownership enforced
  in the SQL `WHERE user_id = <caller>`; a non-owner gets `404
  not_found_or_not_owner`). Editable fields: `title`, `category_id`, `quantity`,
  `unit`, `price`, `price_type`, `is_urgent`, `hub_name`, `photos`. Toggling
  `is_urgent` on sets a fresh 24h `expires_at`; toggling it off clears it.
  Validation errors return `400` with codes like `invalid_title`,
  `invalid_price_type`, `invalid_price`, `invalid_category`, `invalid_photos`,
  or `no_fields`.
- **`PATCH /listings/:id/status`** — owner-only status change. `withdrawn`
  removes a listing from the market **without deleting it** (history + analytics
  preserved); it can later be set back to `active` to re-list.

### Editable fields payload (PATCH /listings/:id)
```json
{
  "title": "Updated title",
  "price": 9000,
  "price_type": "total",
  "quantity": 150,
  "unit": "litres",
  "is_urgent": false,
  "photos": ["https://.../existing.jpg", "https://.../new.jpg"]
}
```

### Deal interest → WhatsApp
`POST /listings/:id/interest` logs the interest (analytics in `deal_interests`)
and returns a deep link, e.g.:
```
https://wa.me/919820012345?text=Hi%2C%20I%20saw%20your%20%22Leftover%20Epoxy%20Primer%2020L%22%20(%E2%82%B912000)%20on%20MMR%20MaterialX.%20My%20offer%3A%20%E2%82%B910500.%20Is%20it%20still%20available%3F
```

### Image uploads — `POST /uploads/sign`
The client never holds the storage secret. It asks the backend for short-lived,
scoped upload credentials, uploads the (already client-compressed) image
**directly** to the storage provider, and sends the resulting public URL(s) in
the `photos` array of the create-listing call.

Controlled by `UPLOAD_PROVIDER`:

- **`local`** (dev default) — returns `{ "provider": "local" }`; the app keeps the
  local image URI so you can develop with no storage account.
- **`cloudinary`** — returns a signed param set:
  ```json
  {
    "provider": "cloudinary",
    "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud>/image/upload",
    "params": { "api_key": "…", "timestamp": 1699999999, "folder": "mmr-listings", "signature": "…" },
    "responseUrlField": "secure_url"
  }
  ```
  Client POSTs `multipart/form-data` (file + these params) to `uploadUrl`; the
  public URL is `response.secure_url`. Signature = SHA-1 of the sorted
  `key=value&…` params with the API secret appended (matches the official SDK).
- **`supabase`** — returns a short-lived signed upload URL:
  ```json
  {
    "provider": "supabase",
    "method": "PUT",
    "uploadUrl": "https://<proj>.supabase.co/storage/v1/object/upload/sign/listings/…?token=…",
    "headers": { "Content-Type": "image/jpeg", "x-upsert": "true" },
    "publicUrl": "https://<proj>.supabase.co/storage/v1/object/public/listings/…"
  }
  ```
  Client PUTs the raw bytes to `uploadUrl`; the stored URL is `publicUrl`.

Returns `503 { error: "<provider>_not_configured" }` if the chosen provider's
env vars are missing.

### Phone normalisation
`/auth/otp/*` accepts a 10-digit Indian number or a full `91XXXXXXXXXX`; both are
normalised to bare E.164 digits (no `+`) before storage.
