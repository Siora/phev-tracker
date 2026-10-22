/**
 * Regression für das erste, bewusst kleine v88-Refactoring.
 *
 * Führt buildDashboardStatTiles() isoliert mit synthetischen Daten aus.
 * Erwartete Werte stammen aus der unveränderten bisherigen v88-Formel.
 * Keine Browser- oder Cloud-Abhängigkeiten.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('function buildDashboardStatTiles(');
const end = app.indexOf('\n/* Tabellen-Pagination:', start);
assert.ok(start >= 0 && end > start, 'Hilfsfunktion nicht gefunden');
const sandbox = {fmt:(value,currency)=>value.toFixed(2)+' '+currency};
vm.runInNewContext(app.slice(start,end), sandbox);

function input(distance = 100) {
  return {
    averageElectric:'0.40 CHF / kWh',
    averageFuel:'2.00 CHF / Liter',
    charges:[{amount:10},{amount:20}],
    fuel:[{amount:15}],
    cost:47,
    electric:12,
    petrol:35,
    distance,
    currency:'CHF'
  };
}

test('Zehn Kennzahlen bleiben in der v88-Reihenfolge mit identischen Werten', () => {
  const tiles = sandbox.buildDashboardStatTiles(input());
  assert.deepEqual(Array.from(tiles, pair => Array.from(pair)), [
    ['⚡ Ø Preis pro kWh','0.40 CHF / kWh'],
    ['⛽ Ø Preis pro Liter','2.00 CHF / Liter'],
    ['⚡ Geladene Energie','30.00 kWh'],
    ['⛽ Benzin','15.00 l'],
    ['💰 Gesamtkosten','47.00 CHF'],
    ['🔌 Stromkosten','12.00 CHF'],
    ['⛽ Benzinkosten','35.00 CHF'],
    ['🚗 Kosten / 100 km','47.00 CHF'],
    ['Ladevorgänge',2],
    ['Tankungen',1]
  ]);
});

test('Ohne Kilometerstandsspanne erscheint kein erfundener Kostenwert', () => {
  const tiles = sandbox.buildDashboardStatTiles(input(0));
  assert.equal(tiles[7][1], '–');
});

test('Hilfsfunktion verändert weder Einträge noch Eingabeobjekt', () => {
  const data = input();
  const before = JSON.stringify(data);
  sandbox.buildDashboardStatTiles(data);
  assert.equal(JSON.stringify(data), before);
});

test('Leere Lade- und Tanklisten liefern null Mengen und Vorgänge', () => {
  const data = input(0);
  data.charges = [];
  data.fuel = [];
  data.cost = data.electric = data.petrol = 0;
  const tiles = sandbox.buildDashboardStatTiles(data);
  assert.equal(tiles[2][1], '0.00 kWh');
  assert.equal(tiles[3][1], '0.00 l');
  assert.equal(tiles[8][1], 0);
  assert.equal(tiles[9][1], 0);
});
