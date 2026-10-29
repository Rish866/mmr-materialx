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
- `npm test` — run the automated test suite (needs a test database — see below)
- `npm run test:watch` — re-run tests on change
- `npm run lint` — fast dependency-free syntax gate (`node --check` on every file)

## Testing

The suite uses **Node's built-in test runner** (`node:test`) — no extra test
dependencies. Tests are **integration tests** against a **real PostgreSQL**
database, so they need a throwaway database to point at.

### What is covered
`test/auth.test.js`, `test/listings.test.js`, `test/misc.test.js`,
`test/uploads.test.js`, `test/my-listings.test.js` — **61 tests** covering:
health & 404 handling; OTP send/verify incl. invalid, expired, reused codes;
JWT guards (no/bad token); listing create (valid + invalid); feed with radius /
category / title-search filters and urgent-first ordering; sold/expired/withdrawn
hiding; listing detail; mark-sold ownership checks; deal-interest + safe
WhatsApp URL generation; categories; profile get/patch; upload-signing for
`local`, `cloudinary` (signed params, signature verified, secret never leaked),
plus `503` on a misconfigured `cloudinary`/`supabase` provider; **and the seller
management flow** — `GET /listings/mine` (own-only, all statuses, lazy expiry),
`PATCH /listings/:id` (owner-only edit, valid + every invalid-input path), and
the `withdrawn` lifecycle (feed hide + re-activate).

### Listing lifecycle (`status` column)
`active` → shown to buyers · `sold` · `expired` (auto, when an urgent listing's
24h window passes) · `withdrawn` (seller took it off the market; reversible).
`withdrawn` was **added to the route's allow-list** in Phase 2 — no migration
was needed because `status` is a free-text column; the public feed already
shows only `active`.

Tests **never** send SMS, upload to a real cloud, or spend money: they force
`SMS_PROVIDER=console` and `UPLOAD_PROVIDER=local`, and exercise the cloud
*signing* logic with dummy credentials only.

### Run the tests from a clean checkout

1. Have a PostgreSQL instance available (local install, Docker, or a managed
   dev DB). **Use a dedicated test database — the suite `TRUNCATE`s tables
   between tests.**

   Quick Docker option:
   ```bash
   docker run --rm -d --name mmr-test-db \
     -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=mmr_test -p 5432:5432 postgres:16
   ```

2. Install deps and run:
   ```bash
   npm ci
   export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mmr_test"
   export JWT_SECRET="any-test-secret"
   export PGSSL=disable
   npm test
   ```
   The harness applies the real migration automatically; you do not need to run
   `migrate` first. A non-zero exit code means at least one test failed.

### Notes on the test setup
- `TEST_DATABASE_URL` is preferred; if unset, the harness falls back to
  `DATABASE_URL`. Point it at a test DB only.
- Tests run **serially** (`--test-concurrency=1`) because they share one
  database; the whole suite finishes in ~2 seconds.

## Notes
- The feed uses a Haversine distance query (no PostGIS needed at MVP scale).
- **Image uploads** use signed, direct client→storage uploads via
  `POST /uploads/sign` (see `src/lib/uploads.js`). Set `UPLOAD_PROVIDER=cloudinary`
  or `supabase` and fill the matching env vars; the storage secret stays on the
  server. `local` (default) is a dev no-op that keeps the local image URI.
- Before launch: add rate-limiting on `/auth/otp/send` and verify-attempt caps.
