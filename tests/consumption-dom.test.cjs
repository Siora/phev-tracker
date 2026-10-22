/**
 * PHEV Tracker v88 – ausführbare, isolierte Verbrauchs-Regressionstests.
 *
 * Die unveränderte Funktion renderConsumptionInsights wird direkt aus app.js
 * entnommen und in einer VM mit künstlichen DOM-Knoten ausgeführt.
 * Kein Browser, kein API-Zugriff, kein Storage und keine echten Kontodaten.
 *
 * Ausführung: node --test tests/consumption-dom.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const begin = app.indexOf('function renderConsumptionInsights(');
const end = app.indexOf('\n/* Tabellen-Pagination:', begin);
assert.ok(begin >= 0 && end > begin, 'Originalfunktion muss in app.js vorhanden bleiben');
const source = app.slice(begin, end);

function node(tag) {
  return {
    tag,
    children: [],
    textContent: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; }
  };
}

function setup(base = 'CHF') {
  const target = node('section');
  const sandbox = {
    document: {createElement: node},
    settings: {base, rate: 0.95},
    $: () => target,
    conv: record => record.cost,
    fmt: (value, currency) => value.toFixed(2) + ' ' + currency,
    Number
  };
  vm.runInNewContext(source, sandbox, {filename: 'app.js:renderConsumptionInsights'});
  return {
    target,
    render: sandbox.renderConsumptionInsights,
    values: () => target.children.map(card => ({
      title: card.children[0].textContent,
      value: card.children[1].textContent,
      note: card.children[2].textContent
    }))
  };
}

test('Leere Daten liefern einen Hinweis statt eines Dashboard-Abbruchs', () => {
  const view = setup();
  view.render([], [], [], 0);
  assert.equal(view.values().length, 1);
  assert.equal(view.values()[0].title, 'Noch keine Daten');
});

test('Strompreis ist nach Energiemenge gewichtet und Daten bleiben unverändert', () => {
  const view = setup();
  const charges = [
    {id:'a',type:'charge',date:'2026-10-01',amount:10,cost:5,place:'A'},
    {id:'b',type:'charge',date:'2026-10-02',amount:20,cost:6,place:'B'}
  ];
  const before = JSON.stringify(charges);
  view.render(charges, charges, [], 100);
  const values = view.values();
  assert.equal(values.find(v => v.title === 'Gesamtkosten').value, '11.00 CHF');
  assert.equal(values.find(v => v.title === 'Kosten je 100 km').value, '11.00 CHF');
  assert.equal(values.find(v => v.title === 'Gewichteter Strompreis').value, '0.37 CHF / kWh');
  assert.equal(JSON.stringify(charges), before);
});

test('Ohne Kilometerstandsspanne wird keine Verbrauchskennzahl erfunden', () => {
  const view = setup();
  const items = [{id:'a',type:'fuel',date:'2026-10-01',amount:12,cost:20}];
  view.render(items, [], items, 0);
  assert.equal(view.values().find(v => v.title === 'Kosten je 100 km').value, '–');
  assert.equal(view.values().find(v => v.title === 'Erfasste Benzinmenge').value, '12.0 Liter');
});

test('Auffälliger Ladepreis wird erst ab drei Vorgängen angezeigt', () => {
  const view = setup();
  const charges = [
    {id:'a',type:'charge',date:'2026-10-01',amount:10,cost:2},
    {id:'b',type:'charge',date:'2026-10-02',amount:10,cost:2},
    {id:'c',type:'charge',date:'2026-10-03',amount:10,cost:12,place:'Teuer'}
  ];
  view.render(charges, charges, [], 100);
  const warning = view.values().find(v => v.title === 'Auffälliger Ladepreis');
  assert.ok(warning);
  assert.equal(warning.value, '1.20 CHF / kWh');
  assert.ok(warning.note.includes('Teuer'));
});
