# Android Pilot Build & Launch — MMR MaterialX

How to build a directly-installable **Android APK** for pilot sellers/buyers in
the MMR, using Expo Application Services (EAS). The repo already contains the
build config ([`mobile/eas.json`](../mobile/eas.json)) and app config
([`mobile/app.config.js`](../mobile/app.config.js)).

> **Prerequisite:** the backend must already be deployed and reachable over
> HTTPS (see [`DEPLOYMENT.md`](DEPLOYMENT.md)). You need that public URL below.

---

## Build profiles (in `eas.json`)

| Profile | Output | API URL (`EXPO_PUBLIC_API_BASE`) | Use |
|---------|--------|----------------------------------|-----|
| `development` | APK (dev client) | `http://10.0.2.2:3000` (emulator) | local dev with hot reload |
| `preview` | **APK (installable)** | your deployed HTTPS URL | **the pilot build** — share this APK |
| `production` | AAB (Play Store) | your deployed HTTPS URL | future Play Store submission |

The pilot uses **`preview`**: it produces a plain `.apk` that installs directly
by tapping the file on an Android phone (AAB files from `production` cannot be
sideloaded — they're only for the Play Store).

---

## One-time: set the API URL in the build

Open [`mobile/eas.json`](../mobile/eas.json) and replace the placeholder in the
`preview` (and `production`) profile with your deployed URL:

```json
"preview": {
  "distribution": "internal",
  "android": { "buildType": "apk" },
  "env": { "EXPO_PUBLIC_API_BASE": "https://mmr-materialx-api.onrender.com" }
}
```

This URL is a **public API endpoint, not a secret** — it is safe to commit and
to inline into the app (that's why it uses the `EXPO_PUBLIC_` prefix). **Do not**
put the JWT secret, SMS keys, or any storage/API secret into the app or into any
`EXPO_PUBLIC_*` variable — those stay server-side only.

---

## Build the APK with EAS

EAS runs the build in Expo's cloud, so you need a free Expo account and a login.
From your own computer (not required in this repo/sandbox):

```bash
# 1. Install the CLI (once)
npm install -g eas-cli

# 2. Shortest safe login: this opens a prompt for your Expo account.
#    Use a token so no password is typed into the terminal history:
#    - create one at https://expo.dev/settings/access-tokens
#    - then:
export EXPO_TOKEN=<your-expo-access-token>
#    (or run `eas login` and enter your Expo email + password interactively)

# 3. First time only: link the project to your Expo account
cd mobile
eas init          # creates/links an EAS project id (writes extra.eas.projectId)

# 4. Build the pilot APK
eas build --platform android --profile preview
```

When the build finishes (~10–20 min in the cloud), EAS prints a URL like
`https://expo.dev/accounts/<you>/projects/mmr-materialx/builds/<id>`. Open it and
click **Download** to get the `.apk`, or run:

```bash
eas build:list --platform android --profile preview --limit 1
```

> **Login note:** EAS build **requires** an Expo login — it cannot be done
> anonymously. Using `EXPO_TOKEN` (an access token) is the safest method: it
> never stores your password and can be revoked anytime. Do not commit the token.

---

## Share the APK with pilot users

1. Download the `.apk` from the EAS build page.
2. Send it over WhatsApp / Google Drive / a direct link to each pilot seller.
3. On the phone: open the file → Android warns about "unknown sources" → allow
   install for that app → **Install**.
4. First launch may show Expo's default icon/splash unless you added branded
   assets (see [`mobile/assets/README.md`](../mobile/assets/README.md)).

---

## Pre-release checklist

**Backend (must be live first):**
- [ ] API deployed and `GET /health/ready` returns `{"ok":true,"db":"up"}`.
- [ ] `SMS_PROVIDER=msg91` with a working key + an **approved DLT template**
      (otherwise OTP SMS will not arrive — logins will fail for real users).
- [ ] `UPLOAD_PROVIDER=cloudinary` or `supabase` configured (so listing photos
      actually upload; `local` is dev-only and refused in prod).
- [ ] `npm run smoke` against the public URL passes.

**Mobile config:**
- [ ] `eas.json` `preview.env.EXPO_PUBLIC_API_BASE` = your HTTPS URL (no localhost).
- [ ] `app.config.js`: name `MMR MaterialX`, package `com.mmr.materialx`,
      `version` + `android.versionCode` bumped from the last build.
- [ ] (Optional but recommended) real `icon.png` / `adaptive-icon.png` /
      `splash.png` in `mobile/assets/`.
- [ ] No secrets in any `EXPO_PUBLIC_*` var or in the committed config.

**Build:**
- [ ] `eas build -p android --profile preview` completed on EAS (green).
- [ ] APK downloaded and installs on a real Android phone.

---

## On-device smoke-test plan (do this on the installed APK)

Run through the full path on a real phone before handing the APK to pilots:

1. **Login** — enter a mobile number → receive the OTP by SMS → verify → land on the feed.
2. **Location denied path** — when Android asks for location, tap **Deny**; confirm the feed still loads (defaults to Rabale) and that **Add Listing** shows the manual hub chips with the "pick your hub" hint.
3. **Browse** — switch radius chips (10/25/50 km), tap a category, type in search; confirm the grid updates and urgent items show the 🔴 tag.
4. **Create listing** — tap **Sell**, add 1–2 photos (camera/gallery), fill title/qty/price, toggle **Urgent**, pick a hub, **Post**. Confirm it appears in the feed with its photo thumbnail.
5. **Details** — open the listing; confirm photo carousel, price, distance, and the urgent countdown.
6. **Express interest** — tap **Make Offer**, enter an amount → **WhatsApp opens** with a pre-filled message to the seller containing the title, price, and your offer. Also test the plain **WhatsApp** button.
7. **My Listings** — from Profile → **My Listings**: confirm your listing with its status badge; try **Mark Sold** (with confirmation) and verify it leaves the buyer feed.
8. **Photos** — confirm uploaded photos display (requires a real cloud UPLOAD_PROVIDER; with `local` the image shows only on the device that posted it).

If any step fails, check `api.log`/Render logs and the API URL baked into the build.

---

## Verified so far (and what still requires you)

**Locally verified in this repo (not an EAS build):**
- `eas.json` parses with 3 profiles; `preview` emits an APK and injects the
  deployed API URL; `app.config.js` evaluates (name/package/versionCode/apiBase)
  and reads the URL from the environment with no hardcoded localhost in a
  non-dev build.
- The **complete backend-driven path** (login → browse → create → details →
  interest → WhatsApp link → my listings → mark sold), the **location-denied
  hub fallback**, **photo round-trip**, and **OTP flow** were exercised
  end-to-end against a real server+Postgres: **16/16 steps passed**. Backend
  **88/88** tests and mobile **10/10** helper tests pass.

**NOT done here (requires your Expo login / a real device):**
- An actual **EAS cloud build** of the APK — needs your Expo account; cannot be
  run from this repo without a login.
- Installing and tapping through the UI on a **physical Android phone**.
- Real **SMS OTP** delivery and real **cloud photo uploads** — depend on your
  MSG91 and Cloudinary/Supabase accounts being configured on the deployed API.
