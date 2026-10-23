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
  assert.ok(!scripts.includes('consumption-analysis.js'), 'Entferntes v87-Modul darf nicht unbeabsichtigt reaktiviert werden');
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

test('Intelligentes Dashboard besitzt eigenen Menüpunkt, sichere DOM-Ausgabe und Offline-Modul', () => {
 const html=read('index.html'),app=read('app.js'),sw=read('sw.js'),analytics=read('intelligent-analytics.js');
 assert.match(html,/tab\('intelligence'\)/);
 assert.match(html,/<section id="intelligence"/);
 assert.match(html,/intelligent-analytics\.js\?v=204/);
 assert.match(sw,/intelligent-analytics\.js\?v=203/);
 assert.match(app,/window\.renderIntelligence=renderIntelligence/);
 assert.match(app,/td\.textContent=value/);
 assert.match(analytics,/window\.PhevIntelligence/);
 assert.match(analytics,/Array\.from\(\{length:12\}/);
});

test('v94: mobile analysis table has sticky month column and all chart bars fit', () => {
 const html=read('index.html'),css=read('styles.css'),app=read('app.js');
 assert.match(html,/class="intelligence-table-scroll"/);
 assert.match(html,/class="intelligence-table"/);
 assert.match(css,/\.intelligence-table th:first-child\{position:sticky/);
 assert.match(css,/\.intelligence-chart\{width:100%;height:240px;overflow-x:hidden/);
 assert.match(app,/intelligence-month-active/);
});

test('Navigation merkt die zuletzt gewählte Seite und nutzt sichere Standardwerte', () => {
 const app=read('app.js'),html=read('index.html');
 assert.match(app,/const navigationStorageKey='phev-active-page-v1'/);
 assert.match(app,/sessionStorage\.setItem\(navigationStorageKey,page\)/);
 assert.match(app,/navigationPages\.includes\(page\)\?page:'home'/);
 assert.match(app,/tab\(restoredPage\(\)\)/);
 assert.match(html,/onclick="tab\('cloud'\)">Konto/);
});
test('Version und PWA-Cache werden aus der zentralen Release-Konfiguration geprüft', () => {
 const release=JSON.parse(read('release.json'));
 assert.match(release.version,/^[0-9]+[.][0-9]+$/);
 const [major,minor]=release.version.split('.').map(Number);
 assert.equal(release.cacheCode,major*100+minor);
 assert.ok(html.includes('Version '+release.version),'Sichtbare Version muss release.json entsprechen');
 assert.ok(sw.includes('phev-tracker-v'+release.cacheCode),'Service-Worker-Cache muss release.json entsprechen');
 const versions=[...html.matchAll(new RegExp('[?]v=([0-9]+)', 'g'))].map(m=>m[1]);
 assert.ok(versions.length>0,'HTML muss versionierte Assets enthalten');
 assert.ok(versions.every(v=>v===String(release.cacheCode)),'HTML-Assets verwenden einheitlichen Cache-Code');
 const cached=[...sw.matchAll(new RegExp('[?]v=([0-9]+)', 'g'))].map(m=>m[1]);
 assert.ok(cached.length>0,'Service Worker muss versionierte Assets enthalten');
 assert.ok(cached.every(v=>v===String(release.cacheCode)),'Offline-Assets verwenden einheitlichen Cache-Code');
});

test('Kostenprognose vermeidet Schätzung bei zu wenig Daten und rechnet volle Monate hoch',()=>{
 const sandbox={window:{},Date};
 vm.runInNewContext(read('intelligent-analytics.js'),sandbox);
 const forecast=sandbox.window.PhevIntelligence.forecast;
 const months=Array.from({length:12},(_,i)=>({total:i<3?100:0}));
 assert.equal(forecast(months,2026,new Date('2026-04-15')).projected,1200);
 assert.equal(forecast(months,2026,new Date('2026-03-15')).available,false);
 assert.equal(forecast(months,2027,new Date('2026-10-15')).available,false);
 assert.equal(forecast(months,2025,new Date('2026-10-15')).projected,300);
 assert.match(read('index.html'),/id="intelligence-forecast"/);
});

test('Serviceerinnerungen verwenden vorhandene Ausgaben ohne Doppelzählung',()=>{
 const sandbox={window:{},Date};
 vm.runInNewContext(read('vehicle-costs.js'),sandbox);
 const reminders=sandbox.window.PhevTco.reminders;
 const entries=[
  {id:'old',vehicle_id:1,category:'Service',date:'2025-01-01',next_service_date:'2026-10-01'},
  {id:'new',vehicle_id:1,category:'Service',date:'2026-06-01',next_service_date:'2026-11-01'},
  {id:'other',vehicle_id:2,category:'Reifen',date:'2026-07-01',next_service_date:'2026-10-20'}
 ];
 const result=reminders(entries,'1',new Date(2026,9,22));
 assert.equal(result.length,1);
 assert.equal(result[0].id,'new');
 assert.equal(result[0].days,10);
 assert.equal(reminders(entries,'2',new Date(2026,9,22))[0].overdue,true);
 assert.match(read('index.html'),/id="expense-reminders"/);
});

test('Dashboard-Layout kann Kacheln verbergen, verschieben und zurücksetzen',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('styles.css');
 assert.match(html,/id="dashboard-layout-controls"/);
 assert.match(html,/id="dashboard-layout-reset"/);
 assert.match(html,/data-dashboard-widget="Monatlicher Verlauf"/);
 assert.match(app,/function initializeDashboardLayout\(\)/);
 assert.match(app,/localStorage\.setItem\(key,JSON\.stringify\(state\)\)/);
 assert.match(app,/widget\.hidden=state\.hidden\.includes\(id\)/);
 assert.match(css,/\[data-dashboard-widget\]\[hidden\]\{display:none!important\}/);
});

test('Entfernte Altmodule bleiben aus dem produktiven Lade- und Cachepfad',()=>{
 const html=read('index.html'),worker=read('sw.js');
 assert.doesNotMatch(html,/src="consumption-analysis\.js/);
 assert.doesNotMatch(worker,/['"]\.\/consumption-analysis\.js/);
 assert.match(read('app.js'),/function render\(/);
});
