import AsyncStorage from '@react-native-async-storage/async-storage';

// For a real device on the same wifi use your machine's LAN IP, e.g.
// http://192.168.1.5:3000 . Android emulator uses 10.0.2.2.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE || 'http://10.0.2.2:3000';

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

  // listings
  feed: ({ lat, lng, radius_km = 25, category, q }) => {
    const p = new URLSearchParams({ lat, lng, radius_km });
    if (category && category !== 'all') p.append('category', category);
    if (q) p.append('q', q);
    return request(`/listings?${p.toString()}`);
  },
  listing: (id) => request(`/listings/${id}`),
  createListing: (payload) => request('/listings', { method: 'POST', body: payload, auth: true }),
  setStatus: (id, status) => request(`/listings/${id}/status`, { method: 'PATCH', body: { status }, auth: true }),
  interest: (id, offer_price) => request(`/listings/${id}/interest`, { method: 'POST', body: { offer_price }, auth: true }),
};
