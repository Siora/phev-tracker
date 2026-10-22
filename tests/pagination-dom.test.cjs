/**
 * PHEV Tracker v88 – isolierte DOM-Regressionstests für die Seitennavigation.
 *
 * Ausführung: node --test tests/pagination-dom.test.cjs
 * Nur Node-Bordmittel: keine API, kein Browser, keine echten Benutzerdaten,
 * kein localStorage. Die DOM-Attrappen implementieren ausschließlich die
 * von pagination.js tatsächlich benötigten Operationen.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pagination.js'), 'utf8');

function element(tag) {
  return {
    tagName: tag.toUpperCase(),
    children: [],
    attributes: {},
    disabled: false,
    textContent: '',
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelectorAll(selector) {
      assert.equal(selector, 'thead th');
      return Array.from({length: 3}, () => ({}));
    }
  };
}

function harness() {
  const context = {
    window: {},
    document: {createElement: element},
    Map
  };
  vm.runInNewContext(source, context, {filename: 'pagination.js'});
  const paginate = context.window.paginateTable;
  function mount(items, size, key = 'entries') {
    const container = element('section');
    const table = element('table');
    const tbody = element('tbody');
    const calls = [];
    const makeRow = item => {calls.push(item); const row = element('tr'); row.item = item; return row;};
    paginate(container, table, tbody, items, size, key, makeRow);
    const nav = container.children[1];
    const [previous, info, next] = nav.children;
    return {container, table, tbody, previous, info, next, calls};
  }
  return {mount};
}

test('20 Einträge je Seite; Reihenfolge und Originaldaten bleiben erhalten', () => {
  const {mount} = harness();
  const items = Array.from({length: 43}, (_, id) => ({id}));
  const snapshot = JSON.stringify(items);
  const view = mount(items, 20);
  assert.equal(view.tbody.children.length, 20);
  assert.equal(view.info.textContent, '1–20 von 43 · Seite 1 / 3');
  assert.equal(view.previous.disabled, true);
  view.next.onclick();
  assert.equal(view.tbody.children.length, 20);
  assert.equal(view.tbody.children[0].item.id, 20);
  assert.equal(view.info.textContent, '21–40 von 43 · Seite 2 / 3');
  view.next.onclick();
  assert.equal(view.tbody.children.length, 3);
  assert.equal(view.info.textContent, '41–43 von 43 · Seite 3 / 3');
  assert.equal(view.next.disabled, true);
  view.previous.onclick();
  assert.equal(view.tbody.children[0].item.id, 20);
  assert.equal(JSON.stringify(items), snapshot);
});

test('5 Fahrzeuge je Seite und Seitenstand nach erneutem Rendering', () => {
  const {mount} = harness();
  const items = Array.from({length: 12}, (_, id) => ({id}));
  const first = mount(items, 5, 'vehicles');
  first.next.onclick();
  const refreshed = mount(items, 5, 'vehicles');
  assert.equal(refreshed.info.textContent, '6–10 von 12 · Seite 2 / 3');
  assert.equal(refreshed.tbody.children[0].item.id, 5);
  const shortened = mount(items.slice(0, 2), 5, 'vehicles');
  assert.equal(shortened.info.textContent, '1–2 von 2 · Seite 1 / 1');
  assert.equal(shortened.next.disabled, true);
});

test('Leere Liste zeigt Platzhalter ohne Datenänderung', () => {
  const {mount} = harness();
  const items = [];
  const view = mount(items, 20, 'users');
  assert.equal(view.tbody.children.length, 1);
  assert.equal(view.tbody.children[0].children[0].colSpan, 3);
  assert.equal(view.tbody.children[0].children[0].textContent, 'Keine Einträge vorhanden.');
  assert.equal(view.info.textContent, '0–0 von 0 · Seite 1 / 1');
  assert.equal(items.length, 0);
});

test('Getrennte Tabellen haben unabhängige Seitenstände', () => {
  const {mount} = harness();
  const items = Array.from({length: 26}, (_, id) => ({id}));
  const entries = mount(items, 20, 'entries');
  entries.next.onclick();
  const users = mount(items, 20, 'users');
  assert.equal(users.info.textContent, '1–20 von 26 · Seite 1 / 2');
  assert.equal(mount(items, 20, 'entries').info.textContent, '21–26 von 26 · Seite 2 / 2');
});
