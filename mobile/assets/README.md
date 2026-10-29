# App icons & splash

Drop these PNG files here and `app.config.js` will pick them up automatically
(it only references each file if it exists, so the build never breaks on a
missing asset). Until you add them, EAS uses Expo's default placeholder art —
fine for an internal pilot, but add real branding before wider distribution.

| File | Size | Purpose |
|------|------|---------|
| `icon.png` | **1024 × 1024** px, square, no transparency | iOS/legacy app icon |
| `adaptive-icon.png` | **1024 × 1024** px, centered logo in the middle ~66% (safe zone), transparent background | Android adaptive icon foreground (background color is `#1565C0`) |
| `splash.png` | ~**1284 × 2778** px (or any tall image) | Splash screen image, shown centered on the `#1565C0` background |

Tips:
- Keep the adaptive-icon logo within the center safe zone — Android crops the
  edges into a circle/rounded-square depending on the launcher.
- Use the brand blue `#1565C0` to match the splash background.
- You can generate all sizes from one 1024×1024 master with any icon tool, or
  let `npx expo-doctor` / the Expo asset tooling resize.
