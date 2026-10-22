/** Regressionen für Ladeort-/Anbieter-Aktionen ohne Cloud-Daten. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function beginManagedChargingEdit(');
const end=app.indexOf('\nfunction renderChargingManagement(',start);
assert.ok(start>=0&&end>start,'Verwaltungsaktionen fehlen');
function harness(approve=true){
  const forms={},calls=[];
  for(const id of ['managed-location-form','managed-provider-form']){
    const form={elements:{name:{},price:{},kind:{}},dataset:{},querySelector:()=>({set textContent(v){form.buttonText=v;}}),scrollIntoView:o=>calls.push(['scroll',o.behavior,o.block])};
    forms[id]=form;
  }
  const sandbox={
    $:id=>forms[id],
    confirm:message=>{calls.push(['confirm',message]);return approve;},
    storeChargingData:data=>calls.push(['store',data])
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {forms,calls,edit:(type,item)=>sandbox.beginManagedChargingEdit(type,item),remove:(data,type,id)=>sandbox.deleteManagedChargingItem(data,type,id)};
}
test('Ladeort-Bearbeiten übernimmt Typ, Preis und Name',()=>{
  const h=harness();h.edit('locations',{id:'l1',name:'Zuhause',kind:'home',price:0});
  const f=h.forms['managed-location-form'];
  assert.equal(f.dataset.editId,'l1');
  assert.equal(f.elements.name.value,'Zuhause');
  assert.equal(f.elements.kind.value,'home');
  assert.equal(f.elements.price.value,0);
  assert.equal(f.buttonText,'Änderungen speichern');
  assert.deepEqual(h.calls[0],['scroll','smooth','start']);
});
test('Anbieter-Bearbeiten übernimmt fehlenden Preis als leeren Wert',()=>{
  const h=harness();h.edit('providers',{id:'p1',name:'Provider',price:null});
  const f=h.forms['managed-provider-form'];
  assert.equal(f.elements.price.value,'');
  assert.equal(f.dataset.editId,'p1');
});
test('Abgebrochenes Löschen speichert nicht',()=>{
  const h=harness(false),data={locations:[{id:'l1'}],providers:[]};
  h.remove(data,'locations','l1');
  assert.equal(data.locations.length,1);
  assert.equal(h.calls.filter(x=>x[0]==='store').length,0);
});
test('Bestätigtes Löschen entfernt nur gewählten Anbieter und speichert',()=>{
  const h=harness(true),data={locations:[{id:'l1'}],providers:[{id:'p1'},{id:'p2'}]};
  h.remove(data,'providers','p1');
  assert.deepEqual(data.providers.map(x=>x.id),['p2']);
  assert.equal(data.locations.length,1);
  assert.equal(h.calls.filter(x=>x[0]==='store').length,1);
});
