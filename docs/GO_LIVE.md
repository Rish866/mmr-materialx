# MMR MaterialX — Go-Live Readiness Checklist

This is the single checklist to take the consolidated code (all 5 phases merged
to `main`) to a real controlled pilot in the MMR. Items marked **[you]** need
your account access / approval and cannot be automated. Items marked **[done]**
are already implemented and verified in the repo.

Detailed guides: [`DEPLOYMENT.md`](DEPLOYMENT.md) (backend) ·
[`ANDROID_PILOT.md`](ANDROID_PILOT.md) (APK) · [`SECURITY.md`](SECURITY.md) (risks).

---

## 1. Live API and database
- [done] Backend code, `render.yaml` blueprint, idempotent non-destructive migrations, `/health` + `/health/ready` endpoints, graceful shutdown.
- **[you]** Create a **Neon** Postgres project → copy its `DATABASE_URL`.
- **[you]** Create the **Render** service from `render.yaml`, set env vars (checklist in `DEPLOYMENT.md`), deploy.
- **[you]** Verify live: `curl https://<your-api>/health/ready` returns `{"ok":true,"db":"up"}`, then `cd backend && SMOKE_BASE_URL=https://<your-api> npm run smoke`.

## 2. Production SMS OTP
- [done] Pluggable SMS; production **refuses to start** with `console` SMS (no accidental dev OTP in prod); OTP never logged.
- **[you]** Create an **MSG91** account; complete **DLT registration** (India regulatory requirement — can take several days); get an **approved OTP template**, sender ID, and auth key.
- **[you]** Set `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_DLT_TEMPLATE_ID` in Render. Credentials live only in the dashboard — never in the repo.
- *Impact if skipped:* real users cannot receive OTP and cannot log in.

## 3. Real image upload
- [done] Signed, direct client→storage uploads; storage secret never returned to the app; production refuses `local` uploads.
- **[you]** Pick **Cloudinary** (fastest) or **Supabase Storage**. Create the account/bucket.
- **[you]** Set the matching env vars in Render (`CLOUDINARY_*` or `SUPABASE_*`). Secrets stay in the dashboard.
- *Impact if skipped:* listing photos won't persist to the cloud (they'd only show on the posting device).

## 4. Android APK
- [done] `eas.json` with `development`/`preview`/`production`; `preview` emits an installable APK and injects the API URL via `EXPO_PUBLIC_API_BASE` (no secrets).
- **[you]** After the API is live, edit `mobile/eas.json` → set the `preview` (and `production`) `EXPO_PUBLIC_API_BASE` to your real HTTPS URL (replace the `REPLACE-WITH-YOUR-API` placeholder) and commit.
- **[you]** `npm i -g eas-cli`, log in (`export EXPO_TOKEN=<token>`), `cd mobile && eas init && eas build -p android --profile preview`, then download the `.apk`.
- *(Optional)* Add branded `icon.png`/`adaptive-icon.png`/`splash.png` to `mobile/assets/` (specs in that folder's README).

## 5. Installation on a real phone
- **[you]** Send the `.apk` to a pilot user; they allow "unknown sources" and install.
- **[you]** Confirm the app opens and reaches the API (feed loads).

## 6. End-to-end on the real device (the pilot flow)
- [done] The full path is verified at the API level (16/16 flow steps + 88 backend tests).
- **[you]** On the phone, run the 8-step on-device smoke test in `ANDROID_PILOT.md`:
  login → (deny location → pick hub) → browse → create listing with photos → details → **Make Offer → WhatsApp opens** → My Listings → Mark Sold.

## 7. Seller listing management
- [done] `GET /listings/mine`, owner-only edit (`PATCH /listings/:id`), status lifecycle incl. `withdrawn`, lazy expiry; ownership enforced server-side (non-owner → 404). Covered by tests.
- **[you]** Spot-check on the device that a seller sees only their own listings and can edit/withdraw/mark-sold.

## 8. Backups, logs, monitoring, recovery
- [done] App logs method+path only (no OTP/JWT/PII); generic 500s; DB errors don't crash the process.
- **[you]** Enable **Neon** point-in-time restore / confirm automated backups are on (free tier includes a retention window).
- **[you]** Use **Render** dashboard logs + set up a free uptime monitor (e.g. a cron hitting `/health/ready`, or UptimeRobot) so you're alerted if the API sleeps or the DB drops.
- **[you]** Know the recovery path: redeploy on Render (migrations are idempotent and safe to re-run), restore the DB from Neon if needed.
- *Known gaps (see `SECURITY.md`):* no WAF/global throttle, `rate_events` needs a periodic cleanup job, no JWT revocation, no alerting beyond logs. Acceptable for a controlled pilot; address before a public launch.

---

## Recommended order
1. Neon DB → 2. Render deploy (API live, smoke test green) → 3. MSG91 (start DLT early — it's the long pole) → 4. Cloudinary/Supabase → 5. Set APK URL + EAS build → 6. Install + on-device smoke test → 7. Hand to pilot users with a WhatsApp support group.
