# iOS-Build – Status und nächste Schritte

## Bereits erreicht
- Produktive PWA Version 56 läuft unabhängig auf `main`.
- iOS-Quellcode und lokale Web-Assets befinden sich auf `ios-app`.
- Manueller Simulator-Build über GitHub Actions wurde erfolgreich ausgeführt (vom Nutzer als grün bestätigt); ein Simulator-Artefakt ist vorhanden.
- Die manuelle Workflow-Steuerdatei liegt inzwischen auch auf `main`, ohne automatische Ausführung oder Deployment.

## Nächster Meilenstein: echtes iPhone
Ein Simulator-Artefakt ist **keine** iPhone-installierbare App. Für ein echtes Gerät sind iOS-Signierung, ein passendes Provisioning Profile und ein Installationsweg nötig.

### Mögliche Wege
1. **Später mit Mac + kostenlosem Apple-Konto:** Xcode kann eine App für das eigene angeschlossene iPhone signieren. Die Signierung ist zeitlich begrenzt; ohne Mac ist dieser Weg hier derzeit nicht nutzbar.
2. **Apple Developer Program + macOS-Cloud-Build:** Erlaubt signierte Builds und TestFlight-Verteilung, sofern Zertifikate, Profile und Geräte-/App-Einstellungen korrekt konfiguriert sind. Dies verursacht Mitgliedschafts- und eventuell Build-Kosten.
3. **Bis dahin:** Bestehende PWA auf dem iPhone nutzen. Keine Datenmigration oder Neuinstallation erforderlich.

## Tests vor einem echten Release
- API-CORS auf dem tatsächlichen PHP-Server gezielt für `capacitor://localhost` erlauben; Änderung ist bislang **nur im Entwicklungszweig** vorbereitet.
- Anmeldung, Sitzung, Cloud-Synchronisierung und Ladeorte/Anbieter testen.
- CSV/JSON/PDF-Export, Import, Fahrzeugfotos und iOS-Berechtigungen testen.
- Native App besitzt eigenen lokalen Speicher, der nicht automatisch aus Safari/PWA übernommen wird. Vor dem Wechsel Cloud-Datenstand und Backups prüfen.
- Native App-Icons und Launch Screen erstellen und App-Store-Mindestfunktionalität prüfen.
- Die JavaScript-Abhängigkeiten mit einem Lockfile reproduzierbar machen.

## Sicherheitsgrenzen
Keine Apple-Schlüssel, Tokens oder Zertifikate ins Repository hochladen. Niemals bestehende Daten oder Fahrzeuge löschen, und die PHP/MySQL-Produktion nicht für Buildtests verändern.
