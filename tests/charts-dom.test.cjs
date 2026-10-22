/**
 * PHEV Tracker v88 – isolierte DOM-Tests für alle vier Diagrammtypen.
 *
 * charts.js wird unverändert in einer Node-VM ausgeführt. Ein minimaler
 * DOM-Ersatz deckt ausschließlich verwendete APIs ab. Keine Browserdaten,
 * kein localStorage, keine API und keine externen Abhängigkeiten.
 *
 * Ausführung: node --test tests/charts-dom.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'charts.js'), 'utf8');

function node(tag, namespaceURI = null) {
  return {
    tag,
    namespaceURI,
    children: [],
    attributes: {},
    style: {},
    textContent: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
    setAttribute(key, value) { this.attributes[key] = String(value); }
  };
}

function harness() {
  const sandbox = {
    document: {
      createElement: tag => node(tag),
      createElementNS: (namespace, tag) => node(tag, namespace)
    },
    Intl, Map
  };
  vm.runInNewContext(source + '\nthis.charts = AnalyticsCharts;', sandbox, {filename: 'charts.js'});
  return {charts: sandbox.charts, node};
}

const entries = [
  {type:'charge',date:'2026-09-01',amount:10,cost:5,place:'Zuhause'},
  {type:'charge',date:'2026-09-03',amount:20,cost:8,place:'Zuhause'},
  {type:'fuel',date:'2026-10-01',amount:30,cost:45,place:'Tankstelle'}
];
const convert = entry => entry.cost;

test('Alle Diagramme zeigen bei leeren Daten verständliche Platzhalter', () => {
  const {charts} = harness();
  for (const method of ['trend', 'donut', 'price', 'providers']) {
    const target = node('section');
    if (method === 'trend') charts.trend(target, [], 'cost', 'CHF', convert);
    else if (method === 'donut' || method === 'price') charts[method](target, [], 'CHF', convert);
    else charts.providers(target, []);
    assert.equal(target.children[0].className, 'chart-empty', method);
  }
});

test('Monatsverlauf zeichnet Balken und ersetzt bei erneutem Rendering alte Knoten', () => {
  const {charts} = harness();
  const target = node('section');
  charts.trend(target, entries, 'energy', 'CHF', convert);
  assert.equal(target.children[0].className, 'trend-bars');
  assert.equal(target.children[0].children.length, 2);
  assert.equal(target.children[0].children[0].children[1].children[0].style.height, '100%');
  charts.trend(target, [], 'energy', 'CHF', convert);
  assert.equal(target.children.length, 1);
  assert.equal(target.children[0].className, 'chart-empty');
});

test('Kostenring verwendet Strom- und Benzinkosten und zeigt Gesamtsumme', () => {
  const {charts} = harness();
  const target = node('section');
  charts.donut(target, entries, 'CHF', convert);
  const layout = target.children[0];
  assert.equal(layout.className, 'donut-layout');
  const ring = layout.children[0];
  assert.ok(ring.style.background.includes('conic-gradient('));
  assert.ok(ring.title.includes('Strom:'));
  assert.ok(ring.title.includes('Benzin:'));
  assert.ok(ring.children[0].children[1].textContent.includes('58'));
});

test('Strompreiskurve erstellt SVG und gewichteten Monatswert', () => {
  const {charts} = harness();
  const target = node('section');
  charts.price(target, entries, 'CHF', convert);
  assert.equal(target.children[0].tag, 'svg');
  assert.equal(target.children[0].attributes.viewBox, '0 0 600 180');
  assert.equal(target.children[0].children[0].tag, 'polyline');
  assert.equal(target.children[0].children[1].tag, 'circle');
  assert.ok(target.children[0].children[1].children[0].textContent.includes('0.43'));
});

test('Anbieterdiagramm gruppiert kWh und sortiert nach Menge', () => {
  const {charts} = harness();
  const target = node('section');
  charts.providers(target, [
    {type:'charge',date:'2026-10-01',amount:5,place:'B'},
    {type:'charge',date:'2026-10-02',amount:15,place:'A'},
    {type:'charge',date:'2026-10-03',amount:10,place:'B'}
  ]);
  assert.equal(target.children.length, 2);
  assert.equal(target.children[0].children[0].textContent, 'B');
  assert.equal(target.children[1].children[0].textContent, 'A');
  assert.equal(target.children[0].children[1].children[0].style.width, '100%');
});
