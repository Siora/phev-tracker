/**
 * PHEV Tracker – Refactoring-Schutztests.
 *
 * Ausführung: node --test tests/refactoring.test.cjs
 * Keine Datenbank, keine Zugangsdaten, kein Browser-Storage und kein Netzwerk.
 * Die Tests prüfen die gefährlichen Modul-Abhängigkeiten und den Deploy-Vertrag.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const sw = read('sw.js');
const workflow = read('.github/workflows/deploy-pwa-hetzner.yml');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1].split('?')[0]);
const version = html.match(/<script src="app\.js\?v=(\d+)"/)?.[1];

test('alle eingebundenen lokalen Skripte liegen im Repository (jsPDF wird beim Deploy erzeugt)', () => {
  for (const script of scripts.filter(name => name !== 'jspdf.umd.min.js')) {
    assert.ok(fs.existsSync(path.join(root, script)), script);
    assert.doesNotThrow(() => new vm.Script(read(script), {filename: script}), script);
  }
});

test('Modul-Reihenfolge: Helfer vor app.js; Cloud vor App', () => {
  for (const dependency of ['charts.js','pagination.js','pdf-report.js','csv-import-utils.js','auto-backup.js','vehicle-costs.js','cloud.js']) {
    assert.ok(scripts.indexOf(dependency) >= 0 && scripts.indexOf(dependency) < scripts.indexOf('app.js'), dependency);
  }
  assert.ok(scripts.indexOf('jspdf.umd.min.js') < scripts.indexOf('pdf-report.js'));
  assert.ok(!scripts.includes('consumption-analysis.js'), 'Rollback v87 darf nicht unbeabsichtigt reaktiviert werden');
});

test('Versionen im HTML und Offline-Cache sind identisch', () => {
  assert.ok(version, 'Versionsparameter für app.js fehlt');
  assert.ok(sw.includes("phev-tracker-v" + version));
  for (const name of scripts.filter(name => name !== 'charts.js')) {
    assert.ok(html.includes(name + '?v=' + version), name + ': falscher HTML-Parameter');
    assert.ok(sw.includes("'./" + name + "?v=" + version + "'"), name + ': fehlt im Offline-Cache');
  }
});

test('Deployment lädt PWA-Skripte hoch und behandelt die API separat', () => {
  const upload = workflow.match(/- name: Upload only PWA files[\s\S]*$/)?.[0] || '';
  assert.ok(upload, 'Upload-Schritt fehlt');
  for (const name of scripts) assert.ok(upload.includes(name), name + ' fehlt beim SFTP-Upload');
  assert.ok(!/\b(?:put|rm|rmdir|delete)\s+[^\n]*api\//i.test(upload), 'API-Verzeichnis darf nicht verändert werden');
  assert.ok(!upload.includes('rm -rf'), 'Kein rekursives Löschen');
  assert.ok(workflow.includes('php -l server/api.php'), 'PHP-Syntaxprüfung erforderlich');
  assert.ok(workflow.includes('phev-api-previous.php'), 'API-Rollback erforderlich');
  assert.ok(!workflow.includes('put "server/config.php"'), 'Konfiguration darf nicht übertragen werden');
});

test('Fahrzeugkosten-Modul bleibt rein und rechnet unverändert', () => {
  const sandbox = {window: {}};
  vm.runInNewContext(read('vehicle-costs.js'), sandbox);
  const tco = sandbox.window.PhevTco;
  assert.equal(typeof tco.summarize, 'function');
  const expenses = [
    {id:'a',vehicle_id:1,date:'2026-01-01',amount:100,currency:'EUR'},
    {id:'b',vehicle_id:2,date:'2026-02-01',amount:40,currency:'CHF'}
  ];
  const records = [
    {vehicle_id:1,km:100,cost:10},
    {vehicle_id:1,km:300,cost:20},
    {vehicle_id:2,km:500,cost:30}
  ];
  const result = tco.summarize(expenses, records, '1', {base:'CHF',rate:0.95}, r=>r.cost);
  assert.equal(result.extra,95);
  assert.equal(result.running,30);
  assert.equal(result.distance,200);
  assert.equal(result.total,125);
  assert.equal(expenses.length,2);
  assert.equal(records.length,3);
});

test('Cloud-Queue und bestätigte Speicherwege bleiben vorhanden', () => {
  const cloud = read('cloud.js');
  const app = read('app.js');
  assert.ok(cloud.includes('syncCloudQueue'));
  assert.ok(cloud.includes('phev-queue-'));
  assert.ok(cloud.includes('saveVehicleExpense'));
  assert.ok(cloud.includes('deleteVehicleExpense'));
  assert.ok(cloud.includes("cloudCall('vehicle-expenses')"));
  assert.ok(app.includes('window.collectCloudPreferences'));
  assert.ok(app.includes('window.applyCloudPreferences'));
  assert.ok(app.includes('window.paginateTable'));
});

test('Fahrzeugausgaben: 10 Zeilen je Seite, Navigation oben und unten, Aktionen bleiben erhalten', () => {
  const app = read('app.js');
  const pagination = read('pagination.js');
  const start = app.indexOf('function renderVehicleExpenses(){');
  const end = app.indexOf("\n$('expense-form').elements.vehicle_id", start);
  assert.ok(start >= 0 && end > start, 'Kostenübersicht fehlt');
  const section = app.slice(start, end);
  assert.match(section, /document\.createElement\('table'\)/);
  assert.match(section, /document\.createElement\('thead'\)/);
  assert.match(section, /document\.createElement\('tbody'\)/);
  assert.match(section, /paginateTable\(list,table,tbody,sorted,10,'vehicle-expenses',makeExpenseRow\)/);
  assert.match(section, /window\.deleteVehicleExpense\(x\.id\)/);
  assert.match(section, /form\.dataset\.editId=x\.id/);
  assert.ok(pagination.includes("createControls('oben')"));
  assert.ok(pagination.includes("createControls('unten')"));
});

test('Seitennavigation erscheint erst ab mehr als einer Seite', () => {
  const pagination=read('pagination.js');
  const styles=read('styles.css');
  assert.match(pagination, /const hasMultiplePages=pages>1/);
  assert.match(pagination, /top\.nav\.hidden=!hasMultiplePages/);
  assert.match(pagination, /bottom\.nav\.hidden=!hasMultiplePages/);
  assert.match(styles, /\.table-pagination\[hidden\]\{display:none!important\}/);
});

test('Erweiterter Jahresbericht enthält Monatsspalten, Energiebilanz, Kostenkategorien und Fahrzeugvergleich', () => {
 const app=read('app.js');
 const index=read('index.html');
 const start=app.indexOf("if(mode==='year'){",app.indexOf('function exportPdfReport(mode)'));
 assert.ok(start>0,'Jahresbericht fehlt');
 const section=app.slice(start,app.indexOf("pdf.heading('Einzelne Einträge')",start));
 for(const label of ['Jahresvergleich: Strom, Benzin und Zusatzkosten','Energieverbrauch pro Monat',
  'Weitere Ausgaben nach Kategorie','Fahrzeugvergleich im Jahr','Jahresfazit']){
  assert.ok(section.includes(label),'Fehlende Berichtsrubrik: '+label);
 }
 assert.ok(section.includes('vehicleExpenses')===false,'SQL-Daten wurden bereits vorher gefiltert');
 assert.ok(section.includes('expenseValue'),'Währungsumrechnung für Zusatzkosten fehlt');
 assert.ok(section.includes("String(x.vehicle_id)===id"),'Fahrzeugvergleich filtert nicht je Fahrzeug');
 assert.ok(app.includes('const vehicleGroups=new Map()'),'Kilometerstände müssen je Fahrzeug getrennt sein');
 assert.ok(index.includes('erweiterte Jahresberichte'));
});
