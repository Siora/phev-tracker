# PHEV Tracker – iOS development branch

This branch is an **experimental Capacitor iOS wrapper**. Production web deployment remains on `main`.

## Requirements

- Node.js on Windows for npm install and project preparation
- macOS/Xcode build environment (local or cloud) for native iOS compilation
- Apple Developer Program membership for TestFlight/App Store distribution

## Prepare

```bash
npm install
```

The initial Capacitor configuration loads the existing HTTPS-hosted PWA via `server.url` as a development prototype. This is **not yet an App Store-ready implementation**: production should bundle local assets in `www`, remove `server.url`, review native navigation/auth/storage/camera behavior, and verify Apple's app review requirements.

The backend/database remain unchanged. Do not deploy this branch to GitHub Pages or the PHP server.

## Next

Prepare a local `www` distribution, integrate assets and dependencies, then generate the native iOS project in a macOS build environment and test before any App Store submission.
