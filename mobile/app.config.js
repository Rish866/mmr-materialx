// Expo dynamic config. Replaces app.json so we can inject the production API
// base URL from the environment at build time (no hardcoded localhost in
// production builds).
//
// API base resolution (also see src/api.js):
//   1. EXPO_PUBLIC_API_BASE env var (set by the EAS build profile, see
//      eas.json), else
//   2. a dev fallback for the Android emulator (http://10.0.2.2:3000).
//
// For a real build the EAS "preview"/"production" profiles set
// EXPO_PUBLIC_API_BASE to your deployed HTTPS URL. For `expo start` locally:
//   EXPO_PUBLIC_API_BASE=https://your-api.onrender.com npx expo start

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://10.0.2.2:3000';

// Only reference icon / splash image files if they actually exist, so the build
// never fails on a missing asset. Drop PNGs into mobile/assets/ (see
// assets/README.md for the exact sizes) and they are picked up automatically.
const assetsDir = path.join(__dirname, 'assets');
const hasIcon = fs.existsSync(path.join(assetsDir, 'icon.png'));
const hasAdaptive = fs.existsSync(path.join(assetsDir, 'adaptive-icon.png'));
const hasSplash = fs.existsSync(path.join(assetsDir, 'splash.png'));

const splash = {
  resizeMode: 'contain',
  backgroundColor: '#1565C0',
  ...(hasSplash ? { image: './assets/splash.png' } : {}),
};

module.exports = {
  expo: {
    name: 'MMR MaterialX',
    slug: 'mmr-materialx',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    ...(hasIcon ? { icon: './assets/icon.png' } : {}),
    splash,
    assetBundlePatterns: ['**/*'],
    ios: { supportsTablet: false },
    android: {
      package: 'com.mmr.materialx',
      // Integer build number for Android. Bump on every new pilot build.
      versionCode: 1,
      ...(hasAdaptive
        ? { adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1565C0' } }
        : {}),
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA'],
      // Android 11+ package visibility: declare the intents we query so
      // Linking.canOpenURL() for WhatsApp deep links works on real devices.
      intentFilters: [],
    },
    plugins: [
      ['expo-image-picker', { photosPermission: 'Allow MMR MaterialX to access your photos so you can add pictures to your material listings.' }],
      ['expo-location', { locationWhenInUsePermission: 'MMR MaterialX uses your location to show nearby materials and tag your listing. You can also pick your industrial hub manually.' }],
    ],
    extra: {
      apiBase: API_BASE,
      // eas.projectId is filled in by `eas init` on first build (per-account).
    },
  },
};
