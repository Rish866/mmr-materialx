# Architecture — MMR MaterialX

## Principles
1. **Lightweight MVP, not microservices.** One Express process, one Postgres DB.
2. **WhatsApp is the chat layer.** No sockets, no message store, no push infra.
   We only log that a buyer showed interest (for analytics) and hand back a
   pre-filled `wa.me` deep link.
3. **Hyper-local by KM radius.** A Haversine distance query (no PostGIS) is more
   than fast enough for a single metro at MVP scale; add PostGIS later only if
   volume demands it.
4. **Built for busy factory owners.** 56dp+ buttons, minimum typing, bilingual
   hints (English + Hindi/Marathi), Android-first.

## System diagram
```
 ┌──────────────┐     HTTPS/JSON      ┌─────────────────┐      SQL      ┌────────────┐
 │  Expo app     │ ──────────────────▶ │  Express API     │ ───────────▶ │ PostgreSQL  │
 │ (React Native)│ ◀────────────────── │  (Node.js)       │ ◀─────────── │  (managed)  │
 └──────┬────────┘                     └───────┬─────────┘               └────────────┘
        │                                      │
        │  wa.me deep link                     │  SMS OTP (MSG91)
        ▼                                      ▼
   WhatsApp (seller)                      SMS gateway
        │
        ▼
   Image storage (Supabase/Cloudinary)  ◀── photos uploaded client-side
```

## Data model
Five tables (see `backend/migrations/001_init.sql`):
- **categories** — fixed catalog, seeded.
- **users** — phone (unique), profile, home hub + lat/lng.
- **otp_codes** — ephemeral one-time codes with expiry + consumed flag.
- **listings** — the core entity; location captured at post time, `photos TEXT[]`,
  `status`, and `expires_at` (set to +24h when `is_urgent`).
- **deal_interests** — analytics log of WhatsApp/offer clicks.

## Backend layout
```
backend/src/
├── server.js            express bootstrap + error handler
├── db.js                pg Pool (SSL auto-on for managed, off for local/socket)
├── lib/sms.js           pluggable SMS: console (dev) | msg91 (prod)
├── middleware/auth.js   JWT bearer guard
└── routes/
    ├── auth.js          OTP send/verify, phone normalisation, user upsert
    ├── users.js         GET/PATCH /me
    ├── categories.js    GET /categories
    └── listings.js      create / feed(Haversine) / detail / status / interest
```

## Security notes (MVP → production)
- OTP: rate-limit `/auth/otp/send` per phone/IP before launch; cap attempts on verify.
- JWT secret must be long & random; tokens expire in 90 days.
- Validate/normalise all numeric inputs server-side (done for price/qty/offer).
- Move photo uploads to signed uploads (Supabase Storage / Cloudinary) — the app
  currently sends local URIs as a stub; wire real upload before the pilot.

## Deployment
- **DB:** Supabase / Neon / Railway (managed Postgres). Run `npm run migrate`.
- **API:** Railway / Render (push-to-deploy). Set env from `.env.example`.
- **Mobile:** EAS build → distribute Android APK to pilot users; OTA hot-fixes via Expo.
