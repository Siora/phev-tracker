# PHEV Tracker iOS v0.1.0 — erste Testversion

**Status:** Vorbereitete, unsignierte iOS-Simulator-Testversion. Kein App-Store-Release und keine installierbare iPhone-IPA.

## Umfang
- Capacitor-7-App mit lokal eingebundenen Webdateien auf Basis der PWA Version 56
- Native iPhone-Safe-Areas, größere Touch-Flächen und Unterstützung für „Bewegung reduzieren“
- Cloud-API-Anbindung mit verständlicheren Verbindungs- und Serverfehlermeldungen
- Automatisierte Bundle-, JavaScript- und Integrationsprüfungen

## Build
GitHub Actions → **iOS simulator build (manual)** → **Run workflow** → Zweig `ios-app` → **Run workflow**.

Nach erfolgreichem Build unter **Artifacts** das ZIP `phev-tracker-ios-simulator` herunterladen. Es enthält eine **unsignierte Simulator-App** und kann **nicht auf einem echten iPhone installiert** werden. Artifacts werden nach sieben Tagen gelöscht.

## Noch nicht bestätigt
- Die neuesten iOS-Bedienungsverbesserungen wurden noch nicht erneut im CI-Build geprüft.
- Cloud-Anmeldung, Datensynchronisierung und Export sind nicht auf einem echten iOS-Gerät getestet.
- Die PHP-API wurde vom Nutzer per SFTP aktualisiert; PWA und unauthentifizierte API antworteten anschließend. Ein echter Capacitor-Origin-Test steht noch aus.
- Native App-Daten werden nicht automatisch aus der bestehenden Safari-PWA übernommen.

## Sicherheit
Produktive PWA und Datenbank bleiben unverändert. Keine automatische Veröffentlichung, keine Apple-Zertifikate und kein Deployment aus dem iOS-Zweig.
