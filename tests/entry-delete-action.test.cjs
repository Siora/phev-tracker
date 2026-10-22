/** Isolierte Regression für bestätigtes und abgebrochenes Löschen. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function deleteEntryWithConfirmation(');
const end=app.indexOf('\nfunction beginEntryEdit(',start);
assert.ok(start>=0&&end>start,'Lösch-Helfer fehlt');
function harness(approved){
  const initial=[{id:'a'},{id:'b'},{id:'a'}],calls=[];
  const sandbox={
    records:initial,
    confirm:message=>{calls.push('confirm:'+message);return approved;},
    save:()=>calls.push('save')
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {sandbox,calls,remove:id=>sandbox.deleteEntryWithConfirmation(id),initial};
}
test('Abbruch verändert weder Datensätze noch Speicherzustand',()=>{
  const h=harness(false);h.remove('a');
  assert.equal(h.sandbox.records,h.initial);
  assert.deepEqual(h.calls,['confirm:Eintrag löschen?']);
});
test('Bestätigung entfernt nur passende IDs und speichert einmal',()=>{
  const h=harness(true);h.remove('a');
  assert.deepEqual(h.sandbox.records.map(x=>x.id),['b']);
  assert.deepEqual(h.calls,['confirm:Eintrag löschen?','save']);
});
test('Nicht vorhandene ID verwendet unverändert den bestehenden Speicherpfad',()=>{
  const h=harness(true);h.remove('missing');
  assert.equal(h.sandbox.records.length,3);
  assert.equal(h.calls.filter(x=>x==='save').length,1);
});
