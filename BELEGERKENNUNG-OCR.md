# Belegerkennung – lokale OCR (Vorbereitung für 2.18)

## Ziel
Belegfoto aus dem vorhandenen Eingabeformular erkennen und erkannten Text in
`receipt-raw-text` einsetzen. Der bestehende Parser schlägt anschließend Datum,
Menge und Kosten vor. Ohne Prüfung und Bestätigung darf nichts gespeichert werden.

## Technische Entscheidung
- Kandidat: Tesseract.js mit Browser-WebWorker und WebAssembly.
- **Keine CDN-Standardpfade verwenden**: Tesseract.js lädt ohne eigene Konfiguration
  Worker, Core und Sprachdateien teilweise von externen Servern.
- Alle erforderlichen Laufzeitdateien selbst hosten: Tesseract-JS-Browserbundle,
  Worker, alle vier Core-Varianten (JS und WASM) und Sprachmodelle.
- Versionen und Prüfsummen festhalten; Lizenzen und Größe prüfen.
- Die App muss mit expliziten relativen Pfaden für `workerPath`, `corePath`
  und `langPath` initialisieren. Kein automatischer Fallback auf CDNs.
- OCR erst durch einen expliziten Button starten; Ergebnis als **bearbeitbaren**
  Text anzeigen. Der Parser darf nur auf Nutzeraktion hin Werte vorschlagen.
- Bilder bleiben im Browser. Keine Uploads, keine Analytics oder Logging von
  Belegtext, keine Speicherung von Foto oder OCR-Text im Backend.
- Bei Fehlern (fehlende Dateien, Speichergrenze, Browserunterstützung) verständliche
  Fehlermeldung und bestehende manuelle Eingabe anbieten.

## Sicherheits- und Qualitätsschranken
1. iPhone Safari/PWA mit echter Testquittung: deutscher Text, CHF, Kommawerte.
2. Mobilfunk/Offline: Kein Netzaufruf an Drittdomains. Bereits gecachte OCR-Dateien
   dürfen offline genutzt werden; andernfalls bleibt die manuelle Eingabe nutzbar.
3. HEIC auf iOS separat testen. Bei nicht dekodierbarem Bild muss ein Hinweis
   erscheinen, statt eine scheinbar erfolgreiche Erkennung zu melden.
4. OCR-Worker bei Abbruch und Seitenwechsel beenden; Bild-Object-URLs freigeben.
5. Werte wie Preis, Menge und Datum nur als Vorschlag; fehlende oder unsichere
   Angaben nicht erfinden. Bestehende Cloud- und Eintragslogik unangetastet.
6. Deployment: Große OCR-Assets getrennt und nachvollziehbar ausliefern, bevor
   ein OCR-Button produktiv aktiviert wird.

## Stand
Version 2.17 kann Belegbilder lokal anzeigen und eingefügten Text auswerten.
Eine echte automatische Bilderkennung ist **noch nicht aktiviert**.
Dieser Entwurf bereitet die kontrollierte Implementierung vor.
