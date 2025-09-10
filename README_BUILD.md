# Build Instructions (APK)

This guide explains how to build a standalone Android APK for the StockNewsPrototype client.

## Option A — GitHub Actions (Auto Build)

1. Push this repo to GitHub.
2. Go to Settings → Secrets → Actions.
   - Add secret `EXPO_TOKEN` (generate via `expo token:generate`).
   - Add secret `FIREBASE_SERVICE_ACCOUNT` (paste full JSON of service account) — optional for push.
3. GitHub Actions workflow `.github/workflows/build-apk.yml` is already set up.
4. Push code → Actions → run workflow → download APK artifact.

## Option B — Local Build

1. Install Node.js (v18+), npm, and Expo CLI.
2. Install EAS CLI: `npm install -g eas-cli`.
3. Inside `client/`: run `npm install`.
4. Place your `google-services.json` file at `client/android/google-services.json` (use example file as guide).
5. Run `eas login` then `eas build -p android --profile production`.
6. After build, EAS will give you a download URL for APK.

## Troubleshooting
- Push notifications: ensure `google-services.json` is configured.
- Keystore issues: allow EAS to manage credentials or pre-provide via Expo.
