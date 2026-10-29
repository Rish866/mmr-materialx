# Deployment Guide — MMR MaterialX (Phase 4)

A **beginner-friendly, step-by-step** guide to deploy the backend to a managed
host with managed PostgreSQL, and point the mobile app at it.

- **API host:** Render (free tier) — recommended; config is committed as
  [`render.yaml`](../render.yaml). Railway alternative at the bottom.
- **Database:** Neon (serverless Postgres, free tier) — recommended. Supabase
  alternative (use it if you also want Supabase Storage for photos).

> **Nothing here needs a credit card** for a small pilot. Never paste real
> secrets into the repository — all secrets go in the provider dashboards.

---

## What the code already does for you
- `npm start` runs the API (`backend/src/server.js`).
- `npm run migrate` applies the schema — **separately** from startup, idempotent
  and non-destructive (it refuses `DROP/TRUNCATE/DELETE` unless explicitly
  allowed). Render runs it automatically as a **pre-deploy** step.
- Health checks: `GET /health` (liveness) and `GET /health/ready` (database up).
- SSL to the database is enabled automatically for managed Postgres.
- Graceful shutdown on redeploy (drains requests, closes the DB pool).
- In `NODE_ENV=production` the server **refuses to start** with an insecure
  config (weak/missing JWT secret, dev SMS, local uploads) — this is on purpose.

---

## Step 1 — Create the database (Neon)

1. Go to **https://neon.tech** and sign up (GitHub login is easiest).
2. Click **Create project** → name it `mmr-materialx` → region closest to India
   (e.g. **AWS ap-southeast-1 / Singapore**) → **Create**.
3. On the project dashboard, find **Connection string** and copy the
   **psql / URI** value. It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. **Keep this string safe** — it is a secret. You'll paste it into Render as
   `DATABASE_URL` in Step 3. (The `?sslmode=require` suffix is good; the app
   also enables SSL automatically.)

> Supabase instead? Create a project at https://supabase.com, then
> **Project Settings → Database → Connection string (URI)**. If you also want
> Supabase Storage for photos, note **Project URL** and the **service_role**
> key for the upload env vars below.

---

## Step 2 — Generate a strong JWT secret

On your computer (or any online Node sandbox) run:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Copy the long random string it prints. You'll paste it as `JWT_SECRET` in
Step 3. (Production requires ≥32 characters and rejects known weak values.)

---

## Step 3 — Deploy the API to Render

1. Push this repository to GitHub (already done if you're reading this there).
2. Go to **https://render.com** → sign up → **New** → **Blueprint**.
3. Connect your GitHub and select the **mmr-materialx** repo. Render detects
   [`render.yaml`](../render.yaml) and proposes the **mmr-materialx-api** web
   service. Click **Apply**.
4. Render will ask you to fill the env vars marked `sync: false` (they have no
   value in the repo). Enter them from the **checklist below**. At minimum for a
   first boot you need `DATABASE_URL` and `JWT_SECRET`; set the SMS and upload
   vars before real pilot users sign in.
5. Click **Create / Deploy**. Render will:
   - `npm ci` (install), then
   - run **`npm run migrate`** (pre-deploy — creates tables), then
   - `npm start` (launch), then
   - probe **`/health`** until it's green.

If the deploy fails immediately with a config error in the logs, that's the
safety guardrail — re-check the env vars in the checklist.

---

## Step 4 — Environment variable checklist (set in the Render dashboard)

| Variable | Required? | What to put | Notes |
|----------|-----------|-------------|-------|
| `NODE_ENV` | yes | `production` | already set in `render.yaml` |
| `DATABASE_URL` | **yes** | Neon/Supabase connection string | secret |
| `JWT_SECRET` | **yes** | the random string from Step 2 | ≥32 chars; secret |
| `JWT_TTL` | no | e.g. `90d` | token lifetime (default 90d) |
| `OTP_TTL_MINUTES` | no | `5` | OTP validity window |
| `SMS_PROVIDER` | **yes (prod)** | `msg91` | `console` is refused in prod |
| `MSG91_AUTH_KEY` | yes if msg91 | from MSG91 dashboard | secret |
| `MSG91_SENDER_ID` | yes if msg91 | e.g. `MMRMTX` | your approved sender |
| `MSG91_DLT_TEMPLATE_ID` | yes if msg91 | your DLT template id | India DLT |
| `UPLOAD_PROVIDER` | **yes (prod)** | `cloudinary` or `supabase` | `local` refused in prod |
| `CLOUDINARY_CLOUD_NAME` | if cloudinary | from Cloudinary | |
| `CLOUDINARY_API_KEY` | if cloudinary | from Cloudinary | |
| `CLOUDINARY_API_SECRET` | if cloudinary | from Cloudinary | secret (never sent to app) |
| `CLOUDINARY_UPLOAD_FOLDER` | no | `mmr-listings` | |
| `SUPABASE_URL` | if supabase | project URL | |
| `SUPABASE_SERVICE_ROLE_KEY` | if supabase | service_role key | secret (server-side only) |
| `SUPABASE_BUCKET` | if supabase | `listings` | |
| `CORS_ORIGINS` | no | web origins, comma-separated | mobile app needs none |
| `PG_POOL_MAX` | no | `10` | keep small on free tiers |
| `PG_CONNECT_TIMEOUT_MS` | no | `10000` | fail fast if DB unreachable |

**How to set a secret in Render:** open the service → **Environment** tab →
**Add Environment Variable** → paste key and value → **Save Changes** (triggers
a redeploy). Secrets are stored by Render and never appear in the repo.

---

## Step 5 — Find your public API URL

After the first successful deploy, Render shows the service URL at the top of
the service page, like:
```
https://mmr-materialx-api.onrender.com
```
Verify it in a browser or terminal:
```bash
curl https://mmr-materialx-api.onrender.com/health
# {"ok":true,"service":"mmr-materialx"}
curl https://mmr-materialx-api.onrender.com/health/ready
# {"ok":true,"db":"up"}
```
Then run the full smoke test from your machine:
```bash
cd backend
SMOKE_BASE_URL=https://mmr-materialx-api.onrender.com npm run smoke
```
All checks should pass (the OTP step is skipped unless you opt in).

> Free Render services sleep after inactivity; the first request may take
> ~30–60s to wake. That's normal on the free plan.

---

## Step 6 — Point the mobile app at the deployed API

The app reads its API base from `EXPO_PUBLIC_API_BASE` (no localhost is baked
into production builds). Use your Render URL:

**Run in Expo Go against production:**
```bash
cd mobile
EXPO_PUBLIC_API_BASE=https://mmr-materialx-api.onrender.com npx expo start
```

**For an installable build (EAS):** set the variable as an EAS build-time env
var (e.g. in `eas.json` under the build profile's `env`, or via
`eas env:create`), so each build bakes in the right URL:
```json
{ "build": { "production": { "env": { "EXPO_PUBLIC_API_BASE": "https://mmr-materialx-api.onrender.com" } } } }
```
If a non-dev build ever starts with a local URL, the app logs a visible warning.

---

## Seeding demo listings (optional, for a non-empty pilot feed)
Run once after the first deploy, pointing at the production DB **you control**:
```bash
cd backend
DATABASE_URL="<your Neon/Supabase URL>" npm run seed
```
This inserts a few demo sellers/listings. Skip it if you want a clean start.

---

## Railway (alternative to Render)
Railway has no committed blueprint here, but the same commands apply:
1. https://railway.app → **New Project** → **Deploy from GitHub repo**.
2. Set the service **Root Directory** to `backend`.
3. **Build:** `npm ci` · **Start:** `npm start`.
4. Add a **pre-deploy / one-off** command `npm run migrate` (Railway: a separate
   deploy step or run it once from the Railway shell).
5. Add a managed **PostgreSQL** plugin (gives `DATABASE_URL` automatically) or
   paste a Neon URL.
6. Set the same environment variables from the Step 4 checklist.
7. Health check path: `/health`. Find the public URL under the service's
   **Settings → Networking → Public Domain**.

---

## Troubleshooting
- **Deploy fails instantly, logs mention "refusing to start"** → an env var is
  missing/weak. Re-check `JWT_SECRET` (≥32 chars), `SMS_PROVIDER` (not
  `console`), `UPLOAD_PROVIDER` (not `local`).
- **`/health` ok but `/health/ready` is 503** → `DATABASE_URL` is wrong or the
  DB is unreachable. Confirm the string and that the DB is awake.
- **App can't reach the API** → make sure you used the **https** Render URL in
  `EXPO_PUBLIC_API_BASE`, and the service isn't asleep (hit `/health` once).
- **OTP never arrives** → MSG91 not configured or DLT template not approved;
  until then, sign-in SMS won't send. (Dev console OTP is disabled in prod.)
