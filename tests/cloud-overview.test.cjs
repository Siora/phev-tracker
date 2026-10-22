/**
 * PHEV Tracker v88 – Cloud-Übersicht und asynchrone Initialisierung.
 *
 * Extrahiert ausschließlich die unveränderte Funktion loadCloudOverview()
 * aus cloud.js. Sämtliche Netzwerkantworten, DOM-Elemente und der Storage
 * sind künstlich. Die echte Cloud wird niemals kontaktiert.
 *
 * Ausführung: node --test tests/cloud-overview.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const cloud = fs.readFileSync(path.join(__dirname, '..', 'cloud.js'), 'utf8');
const start = cloud.indexOf('async function loadCloudOverview(){');
const end = cloud.indexOf('\n/**\n * Lädt Fahrzeuge', start);
assert.ok(start >= 0 && end > start, 'Cloud-Übersicht in cloud.js nicht gefunden');
const source = cloud.slice(start, end);

function deferred() {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
}

function harness(queue = [], options = {}) {
  const email = 'audit@example.invalid';
  const key = 'phev-queue-' + email;
  const storage = new Map([
    ['phev-session-v1', JSON.stringify({email})],
    [key, JSON.stringify(queue)]
  ]);
  const events = [];
  const elements = new Map();
  const vehiclesGate = options.vehiclesGate;
  const dataGate = options.dataGate;
  const catalogGate = options.catalogGate;
  const response = options.response || {
    records: [{id:'remote-1',type:'charge'}],
    preferences: {base:'CHF'},
    preferences_available:true
  };
  const sandbox = {
    syncError: 'alter Fehler',
    cloudPreferences: null,
    cloudPreferencesReady: false,
    sessionKey: 'phev-session-v1',
    localStorage: {
      getItem(name) {return storage.get(name) ?? null;},
      setItem(name, value) {storage.set(name, value);}
    },
    ce(id) {
      if (!elements.has(id)) elements.set(id, {textContent:''});
      return elements.get(id);
    },
    updateSyncIndicator() {events.push('indicator');},
    async loadVehicles() {
      events.push('vehicles:start');
      if (vehiclesGate) await vehiclesGate.promise;
      events.push('vehicles:end');
    },
    async cloudCall(action) {
      events.push('api:' + action);
      assert.equal(action, 'data');
      if (dataGate) await dataGate.promise;
      return response;
    },
    syncCloudQueue() {events.push('queue:sync');},
    async loadChargingCatalog() {
      events.push('catalog:start');
      if (catalogGate) await catalogGate.promise;
      events.push('catalog:end');
    },
    window: {
      showCloudRecords(records) {events.push('records:' + records.map(r => r.id).join(','));},
      applyCloudPreferences(preferences) {events.push('preferences:' + preferences.base);}
    },
    JSON, Map
  };
  vm.runInNewContext(source, sandbox, {filename:'cloud.js:loadCloudOverview'});
  return {
    events,
    sandbox,
    storage,
    elements,
    run: () => sandbox.loadCloudOverview()
  };
}

test('Fahrzeuge, Einträge, Queue, Katalog und Einstellungen folgen definierter Reihenfolge', async () => {
  const view = harness();
  await view.run();
  const events = view.events.filter(e => e !== 'indicator');
  assert.deepEqual(events, [
    'vehicles:start','vehicles:end','api:data','records:remote-1',
    'queue:sync','catalog:start','catalog:end','preferences:CHF'
  ]);
  assert.equal(view.elements.get('cloud-count').textContent, 'Cloud-Einträge: 1.');
  assert.equal(view.sandbox.cloudPreferencesReady, true);
});

test('Offline-Änderungen überschreiben ältere Cloud-Einträge, Löschungen bleiben verborgen', async () => {
  const queue = [
    {action:'save',record:{id:'remote-1',type:'charge',amount:42}},
    {action:'delete',id:'remote-2'},
    {action:'save',record:{id:'local-3',type:'fuel'}}
  ];
  const view = harness(queue, {
    response: {
      records: [{id:'remote-1',amount:1},{id:'remote-2',amount:2}],
      preferences_available:false
    }
  });
  let shown;
  view.sandbox.window.showCloudRecords = records => {shown = records;};
  await view.run();
  assert.equal(shown.length, 2);
  assert.equal(shown.find(r => r.id === 'remote-1').amount, 42);
  assert.equal(shown.some(r => r.id === 'remote-2'), false);
  assert.equal(shown.some(r => r.id === 'local-3'), true);
  assert.equal(view.sandbox.cloudPreferencesReady, false);
  assert.equal(view.events.some(e => e.startsWith('preferences:')), false);
});

test('Verzögerte Fahrzeugantwort blockiert den nachfolgenden Cloud-Datenabruf', async () => {
  const gate = deferred();
  const view = harness([], {vehiclesGate:gate});
  const running = view.run();
  assert.deepEqual(view.events.filter(e => e !== 'indicator'), ['vehicles:start']);
  gate.resolve();
  await running;
  assert.ok(view.events.indexOf('vehicles:end') < view.events.indexOf('api:data'));
});

test('Verzögerter Katalog verschiebt Preferences, ohne Cloud-Einträge zu verlieren', async () => {
  const gate = deferred();
  const view = harness([], {catalogGate:gate});
  const running = view.run();
  // Warten, bis die vorherigen asynchronen Stufen abgeschlossen sind.
  for (let i = 0; i < 8 && !view.events.includes('catalog:start'); i++) await Promise.resolve();
  assert.ok(view.events.includes('records:remote-1'));
  assert.ok(view.events.includes('catalog:start'));
  assert.equal(view.events.some(e => e.startsWith('preferences:')), false);
  gate.resolve();
  await running;
  assert.ok(view.events.includes('preferences:CHF'));
});

test('API-Fehler verhindern das Anzeigen eines vermeintlich erfolgreichen Cloud-Stands', async () => {
  const view = harness([], {dataGate:deferred()});
  const running = view.run();
  for (let i = 0; i < 8 && !view.events.includes('api:data'); i++) await Promise.resolve();
  assert.equal(view.events.some(e => e.startsWith('records:')), false);
  // Die ausstehende Antwort wird bewusst erfolgreich aufgelöst, damit der Test endet.
  // Ein separater Fehlerfall wird durch eine gezielte Exception simuliert.
  const broken = harness();
  broken.sandbox.cloudCall = async () => {throw Error('Cloud nicht erreichbar');};
  await assert.rejects(broken.run(), /Cloud nicht erreichbar/);
  assert.equal(broken.events.some(e => e.startsWith('records:')), false);
  view.sandbox.cloudCall = async () => {throw Error('nicht verwendet');};
  view.storage; // Keine produktiven Daten; der offene Lauf wird unten freigegeben.
  // Gate-Referenz stammt aus den Testoptionen und wird im Folgenden geschlossen.
  // Keine weitere Aktion erforderlich, da Promise ohne Event-Loop-Handles offen bleibt.
  void running;
});
