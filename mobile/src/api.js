import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Resolve the API base URL, in priority order:
//   1. EXPO_PUBLIC_API_BASE env var (inlined at build time), else
//   2. expo config `extra.apiBase` (set in app.config.js from the same env), else
//   3. a dev-only fallback for the Android emulator.
// For a real device on the same wifi use your machine's LAN IP (e.g.
// http://192.168.1.5:3000); for production set EXPO_PUBLIC_API_BASE to the
// deployed HTTPS URL. See docs/DEPLOYMENT.md.
const extra = (Constants.expoConfig && Constants.expoConfig.extra) || {};
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE || extra.apiBase || 'http://10.0.2.2:3000';

// Guardrail: a shipped (non-dev) build must not point at localhost/emulator.
if (!__DEV__ && /^(https?:\/\/)?(localhost|127\.0\.0\.1|10\.0\.2\.2)/.test(API_BASE)) {
  console.warn(
    '[api] WARNING: production build is using a local API base (' + API_BASE +
    '). Set EXPO_PUBLIC_API_BASE to your deployed HTTPS URL before releasing.'
  );
}

let token = null;

export async function loadToken() {
  token = await AsyncStorage.getItem('token');
  return token;
}
export async function setToken(t) {
  token = t;
  if (t) await AsyncStorage.setItem('token', t);
  else await AsyncStorage.removeItem('token');
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // auth
  sendOtp: (phone) => request('/auth/otp/send', { method: 'POST', body: { phone } }),
  verifyOtp: (phone, code) => request('/auth/otp/verify', { method: 'POST', body: { phone, code } }),
  me: () => request('/me', { auth: true }),
  updateMe: (patch) => request('/me', { method: 'PATCH', body: patch, auth: true }),

  // catalog
  categories: () => request('/categories'),

  // uploads — get short-lived credentials for a direct client->storage upload
  signUpload: ({ fileName, contentType } = {}) =>
    request('/uploads/sign', { method: 'POST', body: { fileName, contentType }, auth: true }),

  // listings
  feed: ({ lat, lng, radius_km = 25, category, q }) => {
    const p = new URLSearchParams({ lat, lng, radius_km });
    if (category && category !== 'all') p.append('category', category);
    if (q) p.append('q', q);
    return request(`/listings?${p.toString()}`);
  },
  listing: (id) => request(`/listings/${id}`),
  myListings: () => request('/listings/mine', { auth: true }),
  createListing: (payload) => request('/listings', { method: 'POST', body: payload, auth: true }),
  updateListing: (id, patch) => request(`/listings/${id}`, { method: 'PATCH', body: patch, auth: true }),
  setStatus: (id, status) => request(`/listings/${id}/status`, { method: 'PATCH', body: { status }, auth: true }),
  interest: (id, offer_price) => request(`/listings/${id}/interest`, { method: 'POST', body: { offer_price }, auth: true }),
};
