# 4-Week MVP Launch Roadmap

Goal: go from code → live pilot with **10 real factory owners in Rabale / Taloja MIDC**.

> **Two risks to manage from Day 1 (they kill pilots silently):**
> 1. **MSG91 DLT/SMS template approval takes days** — start it in Week 1.
> 2. **Empty marketplace = instant churn** — commit to manually seeding the feed in Week 3.

---

## Week 1 — Foundations & backend
- Set up repos + managed Postgres (Supabase). Run `npm run migrate` (+ seed categories).
- Deploy backend to Railway: Auth (OTP), Post Listing, Location Filter. Health check green.
- **Start MSG91 DLT template approval now.**
- **Field work in parallel:** visit Rabale/Taloja MIDC, recruit 10 owners, record their
  top material categories + real pain points (de-risks PMF before code is done).
- *Exit:* APIs testable via Postman/curl; 10 pilot users verbally committed.

## Week 2 — Core mobile screens
- Expo app shell + navigation + OTP login wired to backend.
- Build the 3 hero screens: Home Feed, Add Listing, Listing/Deal.
- Wire WhatsApp deep link + client-side image compression.
- *Exit:* end-to-end on a real phone — post a listing, see it in the feed, tap WhatsApp.

## Week 3 — Polish, seed & internal test
- High-contrast pass, big buttons, bilingual labels, urgent flag + 24h expiry countdown.
- **Seed 20–30 realistic listings** from Week-1 interviews so pilots never see an empty app.
- Wire real photo uploads (Supabase Storage / Cloudinary).
- Dogfood with 2–3 friendly owners; fix the top 5 confusion points.
- EAS build → Android APK (+ TestFlight if needed).
- *Exit:* installable APK, pre-seeded feed, zero blockers in the post→WhatsApp flow.

## Week 4 — Pilot launch & learn
- On-ground onboarding: visit the 10 owners, install the app, watch their first post
  (your highest-value UX data).
- Create a WhatsApp support/feedback group for the pilots.
- Track **3 metrics only:** listings posted, WhatsApp deal-clicks, time-to-post.
- Daily bug triage + OTA hot-fixes via Expo.
- *Exit:* 10 active sellers, measurable deal-interest clicks, a ranked "build next" list.

---

### Definition of done for the MVP
- A factory owner can sign in with their mobile number and post a listing with photos in **under 60 seconds**.
- A buyer can filter by 10/25/50 km, see nearest + urgent items first, and reach the seller on WhatsApp in **two taps**.
- Urgent liquidation listings auto-expire after 24 hours.
