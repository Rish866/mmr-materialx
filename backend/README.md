# MMR MaterialX — Backend

Node.js + Express REST API. See [`../docs/API.md`](../docs/API.md) for the full endpoint reference.

## Setup
```bash
cp .env.example .env     # set DATABASE_URL + JWT_SECRET
npm install
npm run migrate          # tables + seed categories
npm run seed             # optional demo listings
npm start                # or: npm run dev  (node --watch)
```

## Environment
| Var | Purpose |
|---|---|
| `PORT` | API port (default 3000) |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | signing secret for auth tokens |
| `OTP_TTL_MINUTES` | OTP validity window (default 5) |
| `SMS_PROVIDER` | `console` (dev, prints OTP to log) or `msg91` |
| `MSG91_AUTH_KEY` / `MSG91_SENDER_ID` / `MSG91_DLT_TEMPLATE_ID` | MSG91 config for prod SMS |
| `UPLOAD_PROVIDER` | `local` (dev no-op) / `cloudinary` / `supabase` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` / `CLOUDINARY_UPLOAD_FOLDER` | Cloudinary signed uploads |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_BUCKET` | Supabase Storage signed uploads |
| `PGSSL` | set to `disable` for local/socket Postgres |

## Scripts
- `npm start` — run the API
- `npm run dev` — run with `--watch`
- `npm run migrate` — apply SQL migrations in `migrations/`
- `npm run seed` — insert demo sellers + listings around MMR hubs

## Notes
- The feed uses a Haversine distance query (no PostGIS needed at MVP scale).
- **Image uploads** use signed, direct client→storage uploads via
  `POST /uploads/sign` (see `src/lib/uploads.js`). Set `UPLOAD_PROVIDER=cloudinary`
  or `supabase` and fill the matching env vars; the storage secret stays on the
  server. `local` (default) is a dev no-op that keeps the local image URI.
- Before launch: add rate-limiting on `/auth/otp/send` and verify-attempt caps.
