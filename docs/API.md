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
| POST | `/listings` | ✅ | listing payload (below) | `{ listing }` |
| GET  | `/listings` | – | `lat, lng, radius_km=25, category?, q?` | `[ listing + distance_km + category ]` |
| GET  | `/listings/:id` | – | – | listing + seller contact |
| PATCH| `/listings/:id/status` | ✅ owner | `{ status: active\|sold\|expired }` | `{ id, status }` |
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
- Hides `sold`/`expired` listings and urgent listings past `expires_at`.

### Deal interest → WhatsApp
`POST /listings/:id/interest` logs the interest (analytics in `deal_interests`)
and returns a deep link, e.g.:
```
https://wa.me/919820012345?text=Hi%2C%20I%20saw%20your%20%22Leftover%20Epoxy%20Primer%2020L%22%20(%E2%82%B912000)%20on%20MMR%20MaterialX.%20My%20offer%3A%20%E2%82%B910500.%20Is%20it%20still%20available%3F
```

### Phone normalisation
`/auth/otp/*` accepts a 10-digit Indian number or a full `91XXXXXXXXXX`; both are
normalised to bare E.164 digits (no `+`) before storage.
