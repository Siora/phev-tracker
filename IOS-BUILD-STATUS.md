# iOS-Build – aktueller Stand

## Ziel
Die produktive PWA bleibt auf `main`. Alle iOS-Änderungen erfolgen ausschließlich im Zweig `ios-app`.

## Vorbereitung ohne Windows-PC
- Capacitor-Konfiguration mit lokalen `www/`-Dateien
- Native iOS-Simulator-Buildanleitung in `.github/workflows/ios-simulator.yml`
- Build **ohne Signierung**, kein Upload zu Apple, keine Veröffentlichung

## GitHub-Actions-Hinweis
Der Workflow liegt vorerst nur im Entwicklungszweig. GitHub zeigt manuell startbare `workflow_dispatch`-Workflows normalerweise erst dann in der Actions-Oberfläche an, wenn die Workflow-Datei auf dem Standardzweig vorhanden ist. Wir übernehmen sie deshalb **nicht** ungeprüft auf `main`, da dort bereits die produktiven Deployments laufen. Ein Build kann später über eine sichere CI-Konfiguration oder eine externe macOS-Buildumgebung ausgelöst werden.

## Grenzen
- Der Simulator-Build ist keine auf einem physischen iPhone installierbare IPA.
- TestFlight und App Store erfordern Apple-Developer-Mitgliedschaft, Signierung und App-Store-Konfiguration.
- App-interne Browserdaten sind getrennt von Safari-PWA-Daten; Cloud-Synchronisierung muss vor produktiver Nutzung getestet werden.
- Der lokale WebView-Build ist noch nicht getestet. Besonders Authentifizierung, CORS, Dateidownloads, Fotos, Kamera und Offline-Verhalten benötigen echte iOS-Tests.
- Der Bundle-Identifier `com.siora.phevtracker` ist vorläufig und muss vor der Veröffentlichung geprüft werden.

## Sicherheit
Keine Zugangsdaten, API-Schlüssel oder Apple-Zertifikate in GitHub-Dateien eintragen. Die produktive MySQL-Datenbank bleibt unangetastet.
