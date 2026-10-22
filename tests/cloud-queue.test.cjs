/**
 * PHEV Tracker v88 – Offline-Queue mit vollständig isolierten Testdaten.
 *
 * Es wird nur die unveränderte Funktion syncCloudQueue() aus cloud.js
 * ausgeführt. cloudCall ist ein Stub; localStorage ist ein In-Memory-Map.
 * Weder Browser-Storage noch reale Server werden kontaktiert.
 *
 * Ausführung: node --test tests/cloud-queue.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const cloud = fs.readFileSync(path.join(__dirname, '..', 'cloud.js'), 'utf8');
const start = cloud.indexOf('async function syncCloudQueue(){');
const end = cloud.indexOf("\nwindow.addEventListener('online'", start);
assert.ok(start >= 0 && end > start, 'Cloud-Queue-Funktion nicht gefunden');
const source = cloud.slice(start, end);

function harness(operations, options = {}) {
  const email = 'test@example.invalid';
  const key = 'phev-queue-' + email;
  const state = new Map([
    ['phev-session-v1', JSON.stringify({email})],
    [key, JSON.stringify(operations)]
  ]);
  const calls = [];
  const statuses = [];
  let callCount = 0;
  const context = {
    sessionKey: 'phev-session-v1',
    cloudToken: options.token === undefined ? 'cookie' : options.token,
    cloudSyncing: false,
    syncError: '',
    navigator: {onLine: options.online !== false},
    localStorage: {
      getItem(name) { return state.has(name) ? state.get(name) : null; },
      setItem(name, value) { state.set(name, value); }
    },
    async cloudCall(action, payload) {
      calls.push({action, payload});
      callCount++;
      if (callCount === options.failAt) throw Error('Netzwerkfehler');
    },
    updateSyncIndicator() { statuses.push('indicator'); },
    cs(message) { statuses.push(message); },
    JSON
  };
  vm.runInNewContext(source, context, {filename: 'cloud.js:syncCloudQueue'});
  return {
    context,
    calls,
    statuses,
    key,
    remaining: () => JSON.parse(state.get(key)),
    run: () => context.syncCloudQueue()
  };
}

test('Erfolgreich bestätigte Save/Delete-Operationen werden nacheinander entfernt', async () => {
  const operations = [
    {action:'save',record:{id:'synthetic-1',amount:10}},
    {action:'delete',id:'synthetic-2'}
  ];
  const queue = harness(operations);
  await queue.run();
  assert.equal(queue.calls.length, 2);
  assert.equal(queue.calls[0].action, 'save');
  assert.equal(queue.calls[0].payload.record.id, 'synthetic-1');
  assert.equal(queue.calls[1].action, 'delete');
  assert.equal(queue.calls[1].payload.id, 'synthetic-2');
  assert.equal(queue.remaining().length, 0);
  assert.equal(queue.context.cloudSyncing, false);
});

test('Bei einem Fehler bleiben unbestätigte Operationen erhalten', async () => {
  const operations = [
    {action:'save',record:{id:'synthetic-1'}},
    {action:'save',record:{id:'synthetic-2'}},
    {action:'delete',id:'synthetic-3'}
  ];
  const queue = harness(operations, {failAt: 2});
  await queue.run();
  assert.equal(queue.calls.length, 2);
  assert.equal(queue.remaining().length, 2);
  assert.equal(queue.remaining()[0].record.id, 'synthetic-2');
  assert.equal(queue.remaining()[1].id, 'synthetic-3');
  assert.equal(queue.context.syncError, 'Netzwerkfehler');
  assert.equal(queue.context.cloudSyncing, false);
});

test('Offline und ohne Sitzung werden weder Requests noch Queue-Änderungen ausgeführt', async () => {
  const operations = [{action:'save',record:{id:'synthetic-1'}}];
  for (const options of [{online:false}, {token:null}]) {
    const queue = harness(operations, options);
    await queue.run();
    assert.equal(queue.calls.length, 0);
    assert.equal(queue.remaining().length, 1);
  }
});

test('Bei leerer Warteschlange erfolgen keine Requests', async () => {
  const queue = harness([]);
  await queue.run();
  assert.equal(queue.calls.length, 0);
  assert.equal(queue.remaining().length, 0);
});
