# MMR MaterialX

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

## Verification status

The schema and backend were **run and tested against a real PostgreSQL 18
instance** during development:

- Migration applies cleanly: 5 tables, 6 seeded categories, 4 indexes.
- A 16-check end-to-end suite against the live Express app passes:
  OTP send/verify → JWT → profile update → create urgent listing (24h expiry)
  → radius-filtered feed (urgent-first, with `distance_km`) → category filter
  → radius narrowing → listing detail with seller phone → deal interest producing
  a correct pre-filled `wa.me` link → mark sold → dropped from feed → 401 auth guard.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API.md`](docs/API.md),
and [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Tech stack
- **Mobile:** React Native (Expo), React Navigation, AsyncStorage, expo-location, expo-image-picker/-manipulator.
- **Backend:** Node.js + Express, `pg`, JWT auth, pluggable SMS (console / MSG91).
- **DB:** PostgreSQL (managed — Supabase / Neon / Railway). Haversine radius filter in SQL, no PostGIS needed at MVP scale.
