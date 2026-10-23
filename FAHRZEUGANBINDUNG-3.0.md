# Fahrzeuganbindung für PHEV Tracker 3.0

Stand: 23. Oktober 2026. **Architekturentwurf – keine aktive Fahrzeugverbindung.**

## Ziel und Pilot

Erstes Pilotfahrzeug ist ein **BYD SEAL U DM-i, Modelljahr 2026, Schweiz**.
Weitere Hersteller sollen später über denselben Adaptervertrag unterstützt werden.
Die BYD-App zeigt beim Pilotfahrzeug Kilometerstand, Verbrauchskennzahlen und Fahrzeugstatus. Dies belegt **nicht**, dass ein externer Anbieter diese Felder tatsächlich auslesen kann.

## Phasen und Abnahmekriterien

1. **Anbieter verifizieren:** Enode und Smartcar anhand aktueller Dokumentation, unterstützter Fahrzeug-/Länderkombination, Datenfeldern, Kosten, Datenschutz und Nutzungsbedingungen vergleichen. Eine echte Konto-Verbindung erfordert Zustimmung des Fahrzeughalters. Keine Zugangsdaten in GitHub, Chat, Logs oder Frontend.
2. **BYD-Pilot mit echten Daten:** Nach expliziter Autorisierung prüfen, ob Kilometerstand, SoC, Ladestatus und jeweilige Zeitstempel geliefert werden. Werte und Aktualisierungsintervalle mit der BYD-App vergleichen. Fehlende Felder als „nicht verfügbar“ darstellen.
3. **Lesende Integration:** Provideradapter, OAuth-/Hosted-Link-Rückleitung, geschützte Tokenverwaltung und getrennte Zuordnung zum eigenen Fahrzeug. Verbindungsstatus und zuletzt erfolgreiche Synchronisierung im Fahrzeugbereich anzeigen.
4. **Ausbau:** Erst nach Pilotabnahme weitere Marken und zusätzliche Datenfelder prüfen.

## Vorgeschlagene Architektur

```text
Fahrzeugbereich (PWA)
  -> bestehende authentifizierte PHP-API
    -> VehicleConnectionService (Besitzprüfung, Consent, Rate Limits)
      -> VehicleProviderAdapter (einheitliche Schnittstelle)
        -> EnodeAdapter (Pilot, vorbehaltlich Verifikation)
        -> WeitereAdapter (später)
    -> verschlüsselte Provider-Tokens (nur Server)
    -> letzte Messwerte und Zeitstempel (nur berechtigte Benutzer)
```

Adaptervertrag (konzeptionell): `startAuthorization`, `completeAuthorization`, `getVehicleCapabilities`, `readVehicleSnapshot`, `disconnect`. Ein Snapshot enthält optionale `odometerKm`, `batterySocPercent`, `chargingState`, `observedAt`, `provider` und `sourceVehicleId`. Keine Datenfelder als verfügbar voraussetzen.

## Datenschutz und Sicherheit

- Zugangsdaten niemals selbst abfragen; ausschließlich die dokumentierte Autorisierung des Providers nutzen.
- Refresh-/Access-Tokens serverseitig verschlüsseln, Schlüssel außerhalb des Repositorys halten, Berechtigungen und Löschung dokumentieren.
- Besitzprüfung bei **jeder** Verbindung, Synchronisierung und Trennung; Familienfreigabe bedeutet nicht automatisch Zugang zu Telematikdaten.
- Daten sparsam speichern; Standort und Fernsteuerungsbefehle sind **nicht** Teil des Piloten.
- Fehlgeschlagene Synchronisierung darf keinen alten Wert als aktuell ausgeben. Messzeitpunkt und Abfragezeitpunkt getrennt führen.
- Bestehende Einträge und Kilometerstände niemals automatisch überschreiben; manuelle Eingabe bleibt möglich.
- Migration und Backend-Deployment erst nach Backup und ausdrücklicher Abnahme.
- Providerkosten, Datenresidenz, Auftragsverarbeitung, Widerruf und Löschfristen vor Aktivierung klären.

## Offene Entscheidungen

- Tatsächlich unterstützte Datenfelder und Schweizer Konten für BYD SEAL U DM-i 2026
- API-Verfügbarkeit, Preis- und Nutzungsbedingungen des Providers
- Synchronisierungsintervall und Aufbewahrungsfrist
- Ob automatische Kilometerstände nur angezeigt oder nach separater Zustimmung als neuer Messpunkt übernommen werden

**Nicht enthalten:** automatisches Anlegen von Lade-/Tankbuchungen, Remote-Befehle, Herstellerpasswortspeicherung, automatisches Überschreiben vorhandener Datensätze.
