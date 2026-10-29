// Expo dynamic config. Replaces app.json so we can inject the production API
// base URL from the environment at build time (no hardcoded localhost in
// production builds).
//
// Resolution order for the API base:
//   1. EXPO_PUBLIC_API_BASE env var (set at build/start time), else
//   2. a dev fallback for the Android emulator (http://10.0.2.2:3000).
//
// For a real build you MUST set EXPO_PUBLIC_API_BASE to your deployed HTTPS URL:
//   EXPO_PUBLIC_API_BASE=https://mmr-materialx-api.onrender.com npx expo start
//   (or configure it as an EAS build environment variable).

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://10.0.2.2:3000';

module.exports = {
  expo: {
    name: 'MMR MaterialX',
    slug: 'mmr-materialx',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    splash: { resizeMode: 'contain', backgroundColor: '#1565C0' },
    assetBundlePatterns: ['**/*'],
    ios: { supportsTablet: false },
    android: {
      package: 'com.mmr.materialx',
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA'],
    },
    plugins: [
      ['expo-image-picker', { photosPermission: 'Allow MMR MaterialX to access your photos to post listings.' }],
      ['expo-location', { locationAlwaysAndWhenInUsePermission: 'Allow MMR MaterialX to use your location to show nearby materials.' }],
    ],
    // Surfaced to the app at runtime via expo-constants.
    extra: {
      apiBase: API_BASE,
    },
  },
};
