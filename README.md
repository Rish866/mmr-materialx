# MMR MaterialX

[![CI](https://github.com/Rish866/mmr-materialx/actions/workflows/ci.yml/badge.svg)](https://github.com/Rish866/mmr-materialx/actions/workflows/ci.yml)

Hyper-local **B2B raw material exchange & liquidation** app for Mumbai Metropolitan
Region (MMR) industrial hubs — Rabale, Taloja MIDC, Bhiwandi, Ulwe, Vasai.

**OLX speed + WhatsApp directness.** Factory owners, fabricators, and traders
list excess raw materials (coatings, paints, metal sheets, polymers, packaging,
scrap) in under 60 seconds and close deals locally within 24 hours.

> **Chat strategy:** there is *no in-app messaging and no socket server*. Every
> buyer↔seller conversation happens over a pre-filled WhatsApp deep link
> (`https://wa.me/...`). This is a deliberate architecture decision that removes
> a huge amount of backend complexity for the MVP.

```
mmr-materialx/
├── backend/     Node.js + Express REST API (Auth OTP, Listings, Location filter)
├── mobile/      Expo / React Native app (3 hero screens + login + profile)
└── docs/        Architecture, API reference, 4-week launch roadmap
```

---

## Quick start

### 1. Backend
```bash
cd backend
cp .env.example .env          # fill DATABASE_URL + JWT_SECRET
npm install
npm run migrate               # creates tables + seeds categories
npm run seed                  # (optional) demo listings so the feed isn't empty
npm start                     # API on http://localhost:3000
```
In dev leave `SMS_PROVIDER=console` — OTP codes print to the server log, so you
can test the full login flow without an SMS provider or DLT approval.

### 2. Mobile
```bash
cd mobile
npm install
# point the app at your machine's LAN IP so a real phone can reach the API:
EXPO_PUBLIC_API_BASE=http://<your-lan-ip>:3000 npm start
```
Scan the QR with Expo Go (Android-first — that's what MIDC owners use).
Android emulator reaches localhost at `http://10.0.2.2:3000` (the default).

### Image uploads
Photos are compressed on-device and uploaded **directly** to Cloudinary or
Supabase Storage via a backend-signed credential (`POST /uploads/sign`) — the
storage secret never ships in the app. In dev, `UPLOAD_PROVIDER=local` keeps the
local image URI so you can build without any storage account. See
[`docs/API.md`](docs/API.md#image-uploads--post-uploadssign) to switch providers.

---

## The three hero screens

| Screen | What it does |
|---|---|
| **Home Feed** | Location pill, search, radius chips (10/25/**50**km, default 25), horizontal category scroll, 2-column product grid with distance tags + 🔴 URGENT flags, oversized center **Sell** FAB. |
| **Add Listing** | Single-page form: up to 4 photos compressed on-device and uploaded to cloud storage on submit, title, category, quantity stepper + unit, price with per-unit/total-lot toggle, Urgent Liquidation switch (auto 24h expiry), GPS with MIDC hub fallback. |
| **Listing & Deal** | Photo carousel, urgent countdown, price/qty/distance/seller, **💰 Make Offer** bottom sheet + **💬 WhatsApp** — both open a pre-filled `wa.me` link carrying title, listed price, and offer. |

---

## Testing & CI

A **permanent automated test suite** lives in [`backend/test/`](backend/test)
(Node's built-in `node:test` runner — no extra test dependencies). It runs
**40 integration tests** against a real PostgreSQL database covering auth/OTP,
JWT guards, listings (create/feed/radius/category/search/detail/sold/ownership),
deal-interest + WhatsApp URLs, categories, profiles, and upload-signing.

```bash
cd backend
npm ci
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mmr_test"
export JWT_SECRET="any-test-secret" PGSSL=disable
npm test        # 40 tests, ~2s; non-zero exit on failure
```

See [`backend/README.md`](backend/README.md#testing) for the full guide
(including a one-line Docker command to start a test database).

**Continuous Integration:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
runs lint → migrate → tests against a PostgreSQL 16 service container on every
push and pull request to `main`. It uses only safe, test-only environment
variables — no production secrets.

> Locally, these tests were executed against an embedded PostgreSQL 16/18 and
> the entire CI job (`npm ci → lint → migrate → test`) was simulated end-to-end:
> **40/40 passing, exit code 0.** The GitHub-hosted run will appear under the
> repo's **Actions** tab once pushed.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API.md`](docs/API.md),
and [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Tech stack
- **Mobile:** React Native (Expo), React Navigation, AsyncStorage, expo-location, expo-image-picker/-manipulator.
- **Backend:** Node.js + Express, `pg`, JWT auth, pluggable SMS (console / MSG91).
- **DB:** PostgreSQL (managed — Supabase / Neon / Railway). Haversine radius filter in SQL, no PostGIS needed at MVP scale.
