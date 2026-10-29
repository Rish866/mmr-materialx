# Security Hardening — MMR MaterialX (Phase 3)

Hardening applied to the Express backend for a **controlled pilot**. This
document is an honest checklist: what is implemented, what is tested, and what
risks remain. **Passing tests does not mean the system is "production‑secure"** —
see "Unresolved risks" before any public launch.

## Implemented protections

| # | Protection | Where |
|---|------------|-------|
| 1 | **OTP send rate limiting** by IP and by normalized phone, plus a per‑phone cooldown. All limits/windows configurable via env. | `routes/auth.js`, `lib/ratelimit.js`, `config.js` |
| 2 | **OTP verify brute‑force protection**: per‑phone verify limit (independent of any single code) + per‑code attempt cap that consumes the code when exceeded. Expiry + one‑time‑use enforced. | `routes/auth.js`, migration `002` (`attempts` column) |
| 3 | **Shared rate‑limit store** in PostgreSQL (`rate_events`) so limits hold across multiple backend replicas — not in‑memory. | `lib/ratelimit.js`, migration `002` |
| 4 | **Dev console OTP gated to non‑production**; production refuses to start with `SMS_PROVIDER=console` or missing MSG91 key. | `config.js`, `lib/sms.js` |
| 5 | **Strong JWT secret enforced in production** (required, ≥32 chars, rejects known weak/default values). Never silently replaced in prod. | `config.js`, `middleware/auth.js` |
| 6 | **Input validation**: phone, numeric ids, non‑negative bounded price/quantity, lat/lng ranges, title length, and **image URL scheme** (https‑only in prod; `javascript:`/`data:` rejected), max 4 photos. | `lib/validate.js`, `routes/listings.js` |
| 7 | **Ownership/authorization** enforced in SQL `WHERE user_id = <caller>` on every listing mutation (edit, status, withdraw); non‑owner → 404. | `routes/listings.js` |
| 8 | **CORS allowlist** (prod denies unknown browser origins), **security headers** (`X‑Content‑Type‑Options`, `X‑Frame‑Options`, `Referrer‑Policy`, `CSP`, HSTS in prod), **request‑size limit**, `x-powered-by` disabled, **generic 500** responses, explicit 400 for malformed JSON / 413 for oversized bodies. | `server.js`, `config.js` |
| 9 | **Parameterized queries everywhere** (no string interpolation of user input into SQL). WhatsApp deep links are fully `encodeURIComponent`‑encoded. INSERT/UPDATE use explicit column whitelists (no mass assignment). | `routes/*.js` |
| 10 | **Log hygiene**: OTP codes never logged (dev console masks the phone); SMS failures log status only; request logger logs method+path only (no bodies/headers/query). | `lib/sms.js`, `routes/auth.js`, `server.js` |
| 11 | **Upload signing**: short‑lived (Cloudinary timestamp signature; Supabase signed URL). Storage **secret never returned** to the client. | `lib/uploads.js`, `routes/uploads.js` |
| — | **Resilience**: async route errors are caught (`asyncHandler`) → a single failing query returns a generic 500 instead of crashing the process. | `lib/asyncHandler.js` |

## Configuration (production)
See [`backend/.env.example`](../backend/.env.example) for every variable and its
purpose. In `NODE_ENV=production` the server **refuses to start** unless:
- `JWT_SECRET` is set, ≥32 chars, and not a known weak value;
- `SMS_PROVIDER` is a real provider with its key (not `console`);
- `UPLOAD_PROVIDER` is `cloudinary`/`supabase` (not `local`).

Set `CORS_ORIGINS` to your web origins, and put the API behind HTTPS (a proxy
that terminates TLS; `trust proxy` is enabled so client IPs are read from
`X‑Forwarded‑For`).

## Tests executed (all run against a real PostgreSQL)
`backend/test/security.test.js` + `backend/test/config.test.js`, part of the full
**87‑test** suite (run with `npm test`):
- OTP send blocked at per‑phone and per‑IP limits; cooldown enforced; invalid phone rejected.
- OTP code locks after the per‑code attempt cap; a **new OTP does not reset** the per‑phone verify limit (old records cannot bypass); expired/ malformed codes rejected.
- Security headers present; `x‑powered‑by` absent; malformed JSON → 400.
- Listing create rejects non‑https photo URLs, out‑of‑range coordinates, negative price, >4 photos.
- WhatsApp URL stays fully percent‑encoded for hostile titles; non‑numeric offer rejected.
- Upload‑sign response contains no secret.
- DB error → generic 500, process stays alive.
- **Production config failures**: missing/weak/short JWT secret, console SMS, msg91 without key, local uploads → the process refuses to start (verified in child processes).

## Unresolved risks / limitations (be honest before launch)
- **No WAF / global IP throttle**: limits are per‑endpoint (OTP). A determined
  attacker could still hammer other endpoints; put a reverse proxy / platform
  rate limit in front for a public launch.
- **Rate‑limit store growth**: `rate_events` is append‑only; `lib/ratelimit.js`
  exposes `cleanup()` but no scheduler runs it yet. Add a periodic cleanup
  (cron/`pg_cron`) or a retention job before sustained traffic.
- **SMS cost abuse**: per‑phone/IP limits reduce but do not eliminate OTP‑pumping
  cost. Consider provider‑side spend caps and monitoring.
- **No account lockout/audit beyond OTP**: there is no per‑user audit log or
  anomaly detection.
- **JWT revocation**: tokens are stateless with a 90‑day TTL; there is no
  revocation list. Shorten TTL and/or add revocation for higher assurance.
- **Upload abuse**: signing is authenticated but a logged‑in user could request
  many signatures; constrain with per‑user limits and provider upload caps if needed.
- **HTTPS/TLS** is assumed to be terminated by the deployment platform; the app
  does not itself serve TLS.
- This hardening targets a **controlled pilot**, not an unauthenticated public
  launch. A full pen‑test and a dependency/secret audit are recommended before
  wider release.
