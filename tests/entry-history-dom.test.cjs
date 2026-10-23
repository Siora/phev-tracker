/** Regression für die vollständige Eintragstabelle (20 Zeilen je Seite). */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function renderEntryHistory(');
const end=app.indexOf('\nfunction renderDashboardProviderFilter(',start);
assert.ok(start>=0&&end>start,'Eintragstabelle fehlt');
function element(tag){
  return {tag,children:[],textContent:'',className:'',dataset:{},elements:{},
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=[...nodes];},
    querySelector(){return {textContent:''};}
  };
}
function harness(records){
  const entries=element('div'),calls=[];
  const sandbox={
    $:id=>id==='entries'?entries:element('form'),
    document:{createElement:element},
    records,vehicles:[{id:'v1',name:'Auto'}],
    compareRecordDateTime:(a,b)=>b.date.localeCompare(a.date),
    recordDateTime:r=>r.date+' 12:00',
    vehicleName:v=>v.name,
    fmt:(cost,currency)=>cost.toFixed(2)+' '+currency,
    window:{paginateTable:(...args)=>calls.push(args)},
    String
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {entries,calls,render:()=>sandbox.renderEntryHistory()};
}
test('Tabelle hat sieben Spalten und 20 Einträge je Seite',()=>{
  const h=harness([{id:'1',date:'2026-10-01',type:'charge',amount:5,cost:2,currency:'CHF',vehicle_id:'v1'}]);
  h.render();
  const [entries,table,tbody,ordered,pageSize,key,rowFactory]=h.calls[0];
  assert.equal(entries,h.entries);
  assert.equal(table.className,'entry-history-table');
  assert.equal(table.children[0].children[0].children.length,7);
  assert.equal(pageSize,20);assert.equal(key,'entries');
  assert.equal(ordered.length,1);
  const row=rowFactory(ordered[0]);
  assert.equal(row.children.length,7);
  assert.equal(row.children[0].textContent,'2026-10-01 12:00');
  assert.equal(row.children[3].textContent,'5 kWh');
  assert.equal(row.children[6].children[0].textContent,'✎');
  assert.equal(row.children[6].children[0].ariaLabel,'Bearbeiten');
  assert.equal(row.children[6].children[1].textContent,'🗑');
  assert.equal(row.children[6].children[1].ariaLabel,'Löschen');
});
test('Eintragshistorie nutzt alle Einträge statt Dashboard-Filter',()=>{
  const input=[{id:'1',date:'2026-10-01'},{id:'2',date:'2026-10-03'}];
  const h=harness(input);h.render();
  assert.deepEqual(h.calls[0][3].map(x=>x.id),['2','1']);
  assert.deepEqual(input.map(x=>x.id),['1','2']);
});
test('Leere Eintragshistorie erzeugt die vorhandene Leermeldung',()=>{
  const h=harness([]);h.render();
  assert.equal(h.calls[0][2].children[0].children[0].textContent,'Noch keine Einträge vorhanden.');
});
test('Erneutes Rendern leert den Container vor dem Tabellenaufbau',()=>{
  const h=harness([]);h.entries.append(element('p'));h.render();h.render();
  assert.equal(h.entries.children.length,0);
  assert.equal(h.calls.length,2);
});
