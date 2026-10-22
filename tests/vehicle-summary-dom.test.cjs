/** DOM-Regression für die unveränderte v88-Fahrzeugzusammenfassung. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function renderDashboardVehicleSummary(');
const end=app.indexOf('\nfunction renderDashboardFleetOverview(',start);
assert.ok(start>=0&&end>start,'Fahrzeugzusammenfassung fehlt');
function harness(){
  const summary={children:[],replaceChildren(){this.children=[];},append(...nodes){this.children.push(...nodes);}};
  const vehicles=[{id:'v1',name:'Auto Eins',drivetrain:'PHEV',model_year:2024,battery_kwh:12,tank_liters:40}];
  const records=[{vehicle_id:'v1',km:100},{vehicle_id:'v1',km:350},{vehicle_id:'v2',km:900}];
  const sandbox={
    $:id=>{assert.equal(id,'vehicle-summary');return summary;},
    document:{createElement:()=>({textContent:''})},
    vehicles,records,Number,Math,String,
    vehicleName:v=>v.name,
    settings:{base:'CHF'},
    fmt:(value,currency)=>value.toFixed(2)+' '+currency
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {summary,render:(selected,filtered,charges,fuel,cost)=>sandbox.renderDashboardVehicleSummary(selected,filtered,charges,fuel,cost),vehicles,records};
}
test('Ausgewähltes Fahrzeug zeigt Stammdaten und höchste Laufleistung aus allen Einträgen',()=>{
  const h=harness();
  h.render('v1',[{id:1}],[{amount:8}],[{amount:4}],25);
  assert.equal(h.summary.children.length,2);
  assert.ok(h.summary.children[0].textContent.includes('Auto Eins · PHEV'));
  assert.ok(h.summary.children[1].textContent.includes('1 Einträge'));
  assert.ok(h.summary.children[1].textContent.includes('350 km'));
  assert.ok(h.summary.children[1].textContent.includes('25.00 CHF'));
});
test('Alle Fahrzeuge und nicht zugeordnete Einträge zeigen keine Fahrzeugdetails',()=>{
  const h=harness();
  h.render('',[],[],[],0);assert.equal(h.summary.children.length,0);
  h.render('none',[],[],[],0);assert.equal(h.summary.children.length,0);
});
test('Unbekanntes Fahrzeug bleibt leer',()=>{
  const h=harness();h.render('unknown',[],[],[],0);
  assert.equal(h.summary.children.length,0);
});
test('Erneutes Rendern entfernt alte Details und verändert keine Daten',()=>{
  const h=harness(),before=JSON.stringify({vehicles:h.vehicles,records:h.records});
  h.render('v1',[],[],[],0);
  h.render('',[],[],[],0);
  assert.equal(h.summary.children.length,0);
  assert.equal(JSON.stringify({vehicles:h.vehicles,records:h.records}),before);
});
