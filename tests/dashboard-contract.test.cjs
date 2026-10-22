/**
 * PHEV Tracker v88 – Schutzvertrag für Dashboard-Renderkette.
 *
 * Statische Regressionstests: Sie erkennen versehentlich entfernte, vertauschte
 * oder wieder ausgelagerte Render-Aufrufe. Sie simulieren keinen Browser und
 * beweisen daher nicht, dass jede Diagrammfunktion zur Laufzeit erfolgreich ist.
 *
 * Ausführung: node --test tests/dashboard-contract.test.cjs
 * Kein Netzwerk, kein Storage, keine API und keine produktiven Datensätze.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('app.js');
const cloud = read('cloud.js');
const html = read('index.html');

function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0, 'Abschnittsanfang fehlt: ' + start);
  assert.ok(b > a, 'Abschnittsende fehlt: ' + end);
  return source.slice(a, b);
}

function inOrder(source, tokens) {
  let cursor = -1;
  for (const token of tokens) {
    const next = source.indexOf(token, cursor + 1);
    assert.ok(next > cursor, 'Fehlender oder verschobener Aufruf: ' + token);
    cursor = next;
  }
}

test('Dashboard enthält Verbrauch, Diagramme, Timeline und Fahrzeugübersicht', () => {
  const render = section(app, 'function render(){', '\nfunction escapeHTML(');
  inOrder(render, [
    'renderVehicleExpenses();',
    'renderConsumptionInsights(filtered,charges,fuel,distance);',
    'renderEnergyBalance(filtered);',
    'renderConsumptionTrend();',
    'renderCostComparison(charges,fuel);',
    'renderChargingTypes(charges);',
    'renderDashboardCharts(filtered,charges);',
    'renderDashboardTimeline(filtered);',
    'renderDashboardFleetOverview();',
    "$('entries')",
    'window.paginateTable(entries,table,tbody,ordered,20,'
  ]);
});

test('Timeline-Helfer zeichnet weiterhin den vorgesehenen DOM-Container', () => {
  const helper = section(app, 'function renderDashboardTimeline(filtered){', '\nfunction renderMonthComparison(');
  assert.ok(helper.includes("$('recent-entries')"));
  assert.ok(helper.includes('filtered.slice().sort(compareRecordDateTime).slice(0,8)'));
});

test('Flottenübersicht bleibt separat an ihren DOM-Container gebunden', () => {
  const fleet = section(app, 'function renderDashboardFleetOverview(){', '\nfunction renderDashboardTimeline(');
  assert.ok(fleet.includes("$('fleet-overview')"));
  assert.ok(fleet.includes('vehicles.forEach('));
  assert.ok(fleet.includes('render();'));
  assert.ok(fleet.includes('Bitte ein Fahrzeug anlegen.'));
});

test('Diagramm-Helfer ruft alle vier Diagramme in v88-Reihenfolge auf', () => {
  const charts = section(app, 'function renderDashboardCharts(filtered,charges){', '\nfunction renderDashboardStatTiles(');
  inOrder(charts, [
    "const metric = $('trendMetric').value;",
    'AnalyticsCharts.trend(',
    'AnalyticsCharts.donut(',
    'AnalyticsCharts.price(',
    'AnalyticsCharts.providers('
  ]);
});

test('Cloud-Datenübernahme und Preferences stoßen weiterhin Rendering an', () => {
  const vehicles = section(app, 'window.setVehicles=function(items)', '\n// Lokale Bildwahl');
  assert.ok(vehicles.includes('refreshVehicles();'));
  assert.ok(vehicles.includes('render();'));

  const preferences = section(app, 'window.applyCloudPreferences=function(prefs)', '\nwindow.showCloudRecords=');
  assert.ok(preferences.includes('render();'));

  const records = section(app, 'window.showCloudRecords=function(items)', '\nwindow.showLocalRecords=');
  assert.ok(records.includes('scheduleAutomaticBackup();render();'));
  assert.ok(records.includes('updateBulkCount();'));
});

test('Cloud-Initialisierung respektiert Cache, Offline-Queue und Preferences', () => {
  const overview = section(cloud, 'async function loadCloudOverview(){', '\n/**\n * Lädt Fahrzeuge');
  inOrder(overview, [
    'await loadVehicles()',
    "cloudCall('data')",
    "'phev-queue-'",
    "op.action==='delete'",
    'window.showCloudRecords(',
    'syncCloudQueue();',
    'await loadChargingCatalog();',
    'window.applyCloudPreferences('
  ]);
  const startup = section(cloud, '(async()=>{', '\nlet cloudSyncing=false;');
  assert.ok(startup.includes("cloudCall('session')"));
  assert.ok(startup.includes('window.setVehicles(cachedVehicles)'));
  assert.ok(startup.includes('window.showCloudRecords(cachedRecords)'));
  assert.ok(startup.includes('await loadCloudOverview()'));
});

test('Gefährliche v86-Extraktion bleibt deaktiviert', () => {
  assert.ok(!html.includes('src="consumption-analysis.js'));
  assert.ok(app.includes('function renderConsumptionInsights('));
  assert.ok(app.includes('function renderEnergyBalance('));
  assert.ok(app.includes('function renderConsumptionTrend('));
});

test('Cloud-Queue entfernt Operationen erst nach bestätigtem Request', () => {
  const sync = section(cloud, 'async function syncCloudQueue(){', '\nwindow.addEventListener(');
  inOrder(sync, [
    'while(queue.length)',
    'await cloudCall(op.action,',
    'latest.shift();',
    'localStorage.setItem(key,JSON.stringify(latest))'
  ]);
  assert.ok(sync.includes('catch(e)'));
  assert.ok(sync.includes('finally{cloudSyncing=false;'));
});
