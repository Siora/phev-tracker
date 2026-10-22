/** Isolierte Regression für die Übernahme von Einträgen ins Bearbeitungsformular. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function beginEntryEdit(');
const end=app.indexOf('\nfunction renderEntryHistory(',start);
assert.ok(start>=0&&end>start,'Bearbeitungs-Helfer fehlt');
const fields=['type','date','time','amount','cost','currency','km','place','managed_location','managed_provider','charge_kind','charge_mode','vehicle_id'];
function harness(){
  const elements=Object.fromEntries(fields.map(x=>[x,{value:'initial'}]));
  const form={elements,dataset:{},querySelector:()=>({set textContent(value){form.buttonText=value;}})};
  const calls=[];
  const sandbox={
    $:id=>{assert.equal(id,'form');return form;},
    updateEntryPlaceVisibility:()=>calls.push('visibility'),
    recordTime:id=>{calls.push('time:'+id);return '08:15';},
    setUnitPriceFromTotal:f=>{assert.equal(f,form);calls.push('price');},
    getChargingType:id=>{calls.push('chargeType:'+id);return 'public';},
    getChargeMode:id=>{calls.push('chargeMode:'+id);return 'AC';},
    tab:name=>calls.push('tab:'+name)
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {form,calls,edit:x=>sandbox.beginEntryEdit(x)};
}
const record={id:'r1',type:'charge',date:'2026-10-22',amount:12,cost:6,currency:'CHF',km:200,place:'Zuhause',vehicle_id:'v1'};
test('Alle relevanten Formularfelder werden übernommen und Bearbeitungsmodus aktiviert',()=>{
  const h=harness();h.edit(record);
  assert.equal(h.form.elements.type.value,'charge');
  assert.equal(h.form.elements.date.value,'2026-10-22');
  assert.equal(h.form.elements.time.value,'08:15');
  assert.equal(h.form.elements.amount.value,12);
  assert.equal(h.form.elements.cost.value,6);
  assert.equal(h.form.elements.km.value,200);
  assert.equal(h.form.elements.place.value,'Zuhause');
  assert.equal(h.form.elements.vehicle_id.value,'v1');
  assert.equal(h.form.elements.charge_kind.value,'public');
  assert.equal(h.form.elements.charge_mode.value,'AC');
  assert.equal(h.form.dataset.editId,'r1');
  assert.equal(h.form.buttonText,'Änderungen speichern');
});
test('Abhängige Aktualisierungen und Navigation behalten ihre Reihenfolge',()=>{
  const h=harness();h.edit(record);
  assert.deepEqual(h.calls,['visibility','time:r1','price','chargeType:r1','chargeMode:r1','tab:add']);
});
test('Optionale Werte und Verwaltungs-Auswahl werden wie bisher geleert',()=>{
  const h=harness();h.edit({...record,km:null,place:null,vehicle_id:null});
  for(const key of ['km','place','vehicle_id','managed_location','managed_provider'])assert.equal(h.form.elements[key].value,'');
});
test('Bearbeiten verändert den Originaleintrag nicht',()=>{
  const h=harness(),before=JSON.stringify(record);
  h.edit(record);assert.equal(JSON.stringify(record),before);
});
