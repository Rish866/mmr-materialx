/**
 * Centralised configuration + environment validation.
 *
 * Fails fast and loudly in production when critical security settings are
 * missing or insecure, so the server can never silently start with an unsafe
 * default (weak JWT secret, dev SMS in prod, etc.). In dev/test we allow
 * convenient defaults so local work and CI stay friction-free.
 */

const ENV = process.env.NODE_ENV || 'development';
const isProd = ENV === 'production';
const isTest = ENV === 'test';

function num(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const errors = [];

// ---- JWT secret: required + strong in production ----
const JWT_SECRET = process.env.JWT_SECRET;
const WEAK_SECRETS = new Set([
  'change-me-to-a-long-random-string',
  'test-secret-do-not-use-in-prod',
  'test-secret-ci',
  'secret', 'changeme', 'password',
]);
if (isProd) {
  if (!JWT_SECRET) {
    errors.push('JWT_SECRET is required in production.');
  } else if (JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in production.');
  } else if (WEAK_SECRETS.has(JWT_SECRET)) {
    errors.push('JWT_SECRET is a known weak/default value; set a strong random secret.');
  }
}

// ---- SMS provider: no console OTP in production ----
const SMS_PROVIDER = (process.env.SMS_PROVIDER || 'console').toLowerCase();
if (isProd) {
  if (SMS_PROVIDER === 'console') {
    errors.push('SMS_PROVIDER must be a real provider (e.g. msg91) in production, not "console".');
  }
  if (SMS_PROVIDER === 'msg91' && !process.env.MSG91_AUTH_KEY) {
    errors.push('MSG91_AUTH_KEY is required when SMS_PROVIDER=msg91 in production.');
  }
}

// ---- Upload provider: no local no-op uploads in production ----
const UPLOAD_PROVIDER = (process.env.UPLOAD_PROVIDER || 'local').toLowerCase();
if (isProd && UPLOAD_PROVIDER === 'local') {
  errors.push('UPLOAD_PROVIDER must be a real provider (cloudinary|supabase) in production, not "local".');
}

if (errors.length) {
  const msg = 'Invalid configuration:\n  - ' + errors.join('\n  - ');
  if (isProd) {
    // In production, refuse to start with an insecure config.
    console.error('[config] ' + msg);
    throw new Error('Insecure or incomplete production configuration; refusing to start.');
  } else {
    // In dev/test, warn but allow convenient defaults.
    console.warn('[config] ' + msg + '\n(allowed in ' + ENV + ')');
  }
}

module.exports = {
  ENV,
  isProd,
  isTest,
  isDev: !isProd && !isTest,

  // Dev falls back to a clearly-labelled insecure secret; prod is validated above.
  JWT_SECRET: JWT_SECRET || 'dev-only-insecure-secret-change-me',
  JWT_TTL: process.env.JWT_TTL || '90d',

  SMS_PROVIDER,
  UPLOAD_PROVIDER,

  OTP_TTL_MINUTES: num('OTP_TTL_MINUTES', 5),

  // Rate limits (all configurable via env). Windows in seconds.
  rate: {
    otpSendPerIp:      num('RL_OTP_SEND_IP_MAX', 10),      // max OTP sends per IP per window
    otpSendPerIpWin:   num('RL_OTP_SEND_IP_WINDOW_SEC', 3600),
    otpSendPerPhone:   num('RL_OTP_SEND_PHONE_MAX', 5),    // max OTP sends per phone per window
    otpSendPerPhoneWin:num('RL_OTP_SEND_PHONE_WINDOW_SEC', 3600),
    otpSendCooldownSec:num('RL_OTP_SEND_COOLDOWN_SEC', 30),// min gap between sends to one phone
    otpVerifyPerPhone: num('RL_OTP_VERIFY_PHONE_MAX', 10), // max verify attempts per phone per window
    otpVerifyWin:      num('RL_OTP_VERIFY_WINDOW_SEC', 900),
    otpMaxAttempts:    num('RL_OTP_MAX_ATTEMPTS', 5),      // max guesses against a single code
  },

  // Request + CORS hardening
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  // Comma-separated allowlist of origins. Empty in dev => allow all (convenient).
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
};
