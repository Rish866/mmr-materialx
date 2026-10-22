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

## Image uploads (direct, signed)
The client never holds the storage secret. Flow:
1. Mobile picks + compresses the photo locally (`expo-image-manipulator`, resize
   to 1000px / JPEG q0.6 — factory 4G is slow).
2. Mobile calls `POST /uploads/sign` → backend returns short-lived, scoped creds
   (`src/lib/uploads.js`, pluggable like the SMS provider).
3. Mobile uploads the bytes **directly** to Cloudinary (multipart) or Supabase
   Storage (PUT to a signed URL) — the API never proxies image bytes.
4. Mobile sends the resulting public URLs in the listing's `photos` array.

Provider is chosen by `UPLOAD_PROVIDER` (`local` | `cloudinary` | `supabase`);
`local` is a dev no-op that keeps the local URI so you can build with no account.

## Security notes (MVP → production)
- OTP: rate-limit `/auth/otp/send` per phone/IP before launch; cap attempts on verify.
- JWT secret must be long & random; tokens expire in 90 days.
- Validate/normalise all numeric inputs server-side (done for price/qty/offer).
- Image uploads are signed server-side; the storage secret never ships in the app.
  For Supabase, keep the bucket public for reads, or switch `publicUrl` to a
  signed read URL if listings should be private.

## Deployment
- **DB:** Supabase / Neon / Railway (managed Postgres). Run `npm run migrate`.
- **API:** Railway / Render (push-to-deploy). Set env from `.env.example`.
- **Mobile:** EAS build → distribute Android APK to pilot users; OTA hot-fixes via Expo.
