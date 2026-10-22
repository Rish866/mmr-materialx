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
| `PGSSL` | set to `disable` for local/socket Postgres |

## Scripts
- `npm start` — run the API
- `npm run dev` — run with `--watch`
- `npm run migrate` — apply SQL migrations in `migrations/`
- `npm run seed` — insert demo sellers + listings around MMR hubs

## Notes
- The feed uses a Haversine distance query (no PostGIS needed at MVP scale).
- Photos: the mobile app currently sends local URIs as a stub. For the pilot,
  upload images to Supabase Storage / Cloudinary and send the resulting URLs.
- Before launch: add rate-limiting on `/auth/otp/send` and verify-attempt caps.
