/** v88 DOM-Vertrag für die Orts- und Tankstellenfilter-Auswahl. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function renderDashboardProviderFilter(');
const end=app.indexOf('\nfunction renderDashboardVehicleSummary(',start);
assert.ok(start>=0&&end>start,'Provider-Filter-Helfer fehlt');
function harness(records,current=''){
  const select={value:current,children:[],replaceChildren(...nodes){this.children=nodes;}};
  const sandbox={
    $:id=>{assert.equal(id,'provider');return select;},
    records,Set,
    Option:function(label,value){this.label=label;this.value=value;}
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {select,render:()=>sandbox.renderDashboardProviderFilter()};
}
test('Orte werden alphabetisch sortiert und dedupliziert',()=>{
  const h=harness([{place:'Zuhause'},{place:'Arbeit'},{place:'Zuhause'},{place:''}]);
  assert.equal(h.render(),h.select);
  assert.deepEqual(h.select.children.map(x=>x.label),['Alle Orte / Tankstellen','Arbeit','Unbekannt','Zuhause']);
});
test('Gültige Auswahl bleibt erhalten',()=>{
  const h=harness([{place:'Zuhause'}],'Zuhause');
  h.render();assert.equal(h.select.value,'Zuhause');
});
test('Entfernte Auswahl wird auf alle Orte zurückgesetzt',()=>{
  const h=harness([{place:'Arbeit'}],'Zuhause');
  h.render();assert.equal(h.select.value,'');
});
test('Leere Datensätze zeigen nur die Gesamtauswahl',()=>{
  const h=harness([],'Zuhause');h.render();
  assert.deepEqual(h.select.children.map(x=>x.value),['']);
  assert.equal(h.select.value,'');
});
