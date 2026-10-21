# PHEV Tracker – iOS development branch

Experimental native iOS packaging via Capacitor. **Do not deploy this branch to GitHub Pages or PHP hosting.** Production PWA remains on `main`.

## Current status

- The app's HTML/CSS/JavaScript assets are copied into `www/`.
- Capacitor loads local bundled assets (`webDir: "www"`), not a remote `server.url`.
- The existing authenticated HTTPS PHP/MySQL API remains unchanged.
- No iOS binary has been built or tested yet.

## Windows preparation (later)

Install Node.js LTS, then in the cloned `ios-app` branch:

```bash
npm install
npx cap add ios
npx cap sync ios
```

Creating and compiling the iOS project requires a macOS/Xcode environment (local or cloud). TestFlight/App Store distribution requires Apple Developer Program membership.

## Before first iPhone build

- Test HTTPS API connectivity, login, token persistence and Cloud sync in WKWebView.
- Check photo handling, file export/import, offline behavior and iOS permissions.
- Review storage migration: localStorage inside the native app is **not automatically the same** as Safari/PWA localStorage. Cloud-synced records should be reloaded after login; do not assume unsynced local data migrates.
- Prepare native icon, launch screen, signing and bundle identifier.
- Verify that native packaging adds meaningful functionality and meets Apple's review requirements.
- Pin and audit dependency versions, then generate and commit an npm lockfile.

Never reset the production database or delete existing entries.
