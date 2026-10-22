/**
 * PHEV Tracker v88 – DOM-Regression für Timeline und Fahrzeugübersicht.
 *
 * Der unveränderte Dashboard-Abschnitt aus render() wird in einer isolierten
 * VM mit künstlichen Einträgen und Fahrzeugen ausgeführt. Keine echten
 * Benutzer-, Browser- oder Cloud-Daten werden gelesen oder geschrieben.
 *
 * Der Test umfasst bewusst nur den DOM-Abschnitt nach den Diagrammen:
 * Die vollständige render()-Initialisierung benötigt zusätzliche Browser-APIs.
 *
 * Ausführung: node --test tests/dashboard-dom.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf("  const recent=$('recent-entries');");
const end = app.indexOf('  // Full record history lives', start);
assert.ok(start >= 0 && end > start, 'Dashboard-Timeline/Fahrzeugübersicht nicht gefunden');
const source = app.slice(start, end);

function element(tag) {
  return {
    tag,
    children: [],
    style: {},
    textContent: '',
    setAttribute(key, value) { this[key] = value; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; }
  };
}

const vehicles = [
  {id:'v1',name:'Auto Eins'},
  {id:'v2',name:'Auto Zwei'}
];
const records = [
  {id:'r1',type:'charge',date:'2026-10-01',amount:10,cost:5,place:'Zuhause',vehicle_id:'v1'},
  {id:'r2',type:'fuel',date:'2026-10-02',amount:20,cost:30,place:'Tankstelle',vehicle_id:'v2'},
  {id:'r3',type:'charge',date:'2026-10-03',amount:15,cost:7,place:'Öffentlich',vehicle_id:'v1'}
];

function harness() {
  const elements = new Map();
  for (const id of ['recent-entries','fleet-overview','month-compare','vehicleFilter']) {
    elements.set(id, element('section'));
  }
  let renderCalls = 0;
  let scrollCalls = 0;
  const sandbox = {
    document: {createElement: element},
    $: id => elements.get(id),
    records,
    vehicles,
    settings: {base:'CHF'},
    conv: record => record.cost,
    fmt: (cost, currency) => cost.toFixed(2) + ' ' + currency,
    compareRecordDateTime: (a,b) => b.date.localeCompare(a.date),
    recordDateTime: record => record.date + ' 12:00',
    vehicleName: vehicle => vehicle.name,
    getChargeMode: () => 'AC',
    render: () => {renderCalls++;},
    window: {scrollTo: () => {scrollCalls++;}},
    Map, Math, Number, String
  };
  const run = filtered => {
    sandbox.filtered = filtered;
    // Jeder Renderdurchlauf erhält seinen eigenen lexikalischen Funktionsscope.
    // Dadurch können die const-Deklarationen aus render() erneut laufen,
    // genau wie bei wiederholten Funktionsaufrufen im Browser.
    vm.runInNewContext('(() => {\n' + source + '\n})()', sandbox, {filename:'app.js:dashboard-section'});
  };
  return {
    run,
    elements,
    get renderCalls() {return renderCalls;},
    get scrollCalls() {return scrollCalls;}
  };
}

test('Timeline zeigt Ladungen und Tankungen in absteigender Reihenfolge', () => {
  const view = harness();
  view.run(records);
  const items = view.elements.get('recent-entries').children;
  assert.equal(items.length, 3);
  assert.ok(items[0].className.includes('timeline-charge'));
  assert.ok(items[1].className.includes('timeline-fuel'));
  assert.equal(items[0].children[1].children[0].children[1].textContent, '2026-10-03 · 12:00');
});

test('Filterwechsel zeichnet Timeline neu, Fahrzeugübersicht bleibt vollständig', () => {
  const view = harness();
  view.run(records);
  view.run(records.filter(record => record.vehicle_id === 'v2'));
  const timeline = view.elements.get('recent-entries').children;
  const fleet = view.elements.get('fleet-overview').children;
  assert.equal(timeline.length, 1);
  assert.ok(timeline[0].className.includes('timeline-fuel'));
  assert.equal(fleet.length, 2);
  assert.ok(fleet[0].textContent.includes('2 Einträge'));
  assert.ok(fleet[1].textContent.includes('1 Einträge'));
});

test('Leerer Zeitraum zeigt Hinweis, Fahrzeugübersicht bleibt sichtbar', () => {
  const view = harness();
  view.run([]);
  const timeline = view.elements.get('recent-entries').children;
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].className, 'timeline-empty');
  assert.equal(view.elements.get('fleet-overview').children.length, 2);
  assert.equal(view.elements.get('month-compare').textContent, 'Noch keine Monatsdaten.');
});

test('Fahrzeugauswahl setzt Filter und stößt erneutes Rendering an', () => {
  const view = harness();
  view.run(records);
  const button = view.elements.get('fleet-overview').children[1];
  button.onclick();
  assert.equal(view.elements.get('vehicleFilter').value, 'v2');
  assert.equal(view.renderCalls, 1);
  assert.equal(view.scrollCalls, 1);
});

test('Ohne Fahrzeuge erscheint ein verständlicher Platzhalter', () => {
  const view = harness();
  const original = vehicles.splice(0);
  try {
    view.run([]);
    assert.equal(view.elements.get('fleet-overview').textContent, 'Bitte ein Fahrzeug anlegen.');
  } finally {
    vehicles.push(...original);
  }
});
