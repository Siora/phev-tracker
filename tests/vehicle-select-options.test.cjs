/** Fahrzeugauswahl-Regressionsvertrag für Dashboard, Report und Formulare. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function refreshVehicles(');
const end=app.indexOf('\nfunction updateBulkCount(',start);
assert.ok(start>=0&&end>start,'Fahrzeugauswahl fehlt');
function select(value=''){
  return {value,options:[],replaceChildren(...options){this.options=options;}};
}
function harness(vehicles,values={}){
  const nodes={
    vehicleFilter:select(values.filter||''),
    entryVehicle:select(values.entry||''),
    'report-vehicle':select(values.report||'')
  };
  const quick=[select(values.quick||'')],calls=[];
  const sandbox={
    vehicles,
    $:id=>nodes[id],
    document:{querySelectorAll:()=>quick},
    Option:function(label,value){this.label=label;this.value=value;},
    vehicleName:v=>v.name,
    updateBulkCount:()=>calls.push('bulk')
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {nodes,quick,calls,refresh:()=>sandbox.refreshVehicles()};
}
test('Ein Fahrzeug wird nur in Eingabe- und Schnellformular automatisch ausgewählt',()=>{
  const h=harness([{id:'v1',name:'Auto'}]);h.refresh();
  assert.equal(h.nodes.vehicleFilter.value,'');
  assert.equal(h.nodes['report-vehicle'].value,'');
  assert.equal(h.nodes.entryVehicle.value,'v1');
  assert.equal(h.quick[0].value,'v1');
  assert.deepEqual(h.calls,['bulk']);
});
test('Gültige Fahrzeugauswahl bleibt in allen Listen erhalten',()=>{
  const h=harness([{id:'v1',name:'Eins'},{id:'v2',name:'Zwei'}],{filter:'v2',entry:'v2',report:'v2',quick:'v2'});
  h.refresh();
  assert.equal(h.nodes.vehicleFilter.value,'v2');
  assert.equal(h.nodes.entryVehicle.value,'v2');
  assert.equal(h.nodes['report-vehicle'].value,'v2');
  assert.equal(h.quick[0].value,'v2');
});
test('Entfernte Fahrzeugauswahl wird auf leere Auswahl zurückgesetzt',()=>{
  const h=harness([{id:'v1',name:'Eins'},{id:'v2',name:'Zwei'}],{filter:'missing',entry:'missing',report:'missing',quick:'missing'});
  h.refresh();
  for(const x of Object.values(h.nodes))assert.equal(x.value,'');
  assert.equal(h.quick[0].value,'');
});
test('Leere Fahrzeugliste zeigt nur die Platzhalter',()=>{
  const h=harness([]);h.refresh();
  assert.equal(h.nodes.vehicleFilter.options.length,1);
  assert.equal(h.nodes.entryVehicle.options.length,1);
  assert.equal(h.quick[0].options.length,1);
});
