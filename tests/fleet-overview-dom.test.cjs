/**
 * v88 Flottenübersicht: echte Renderfunktion mit künstlichen Fahrzeugdaten.
 * Keine produktiven Datensätze, keine API, kein Storage.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function renderDashboardFleetOverview(');
const end=app.indexOf('\nfunction renderDashboardTimeline(',start);
assert.ok(start>=0&&end>start,'Flotten-Helfer fehlt');
function element(tag){
  return {tag,children:[],className:'',textContent:'',type:'',onclick:null,
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=[...nodes];this.textContent='';}
  };
}
function harness(vehicles,records){
  const fleet=element('section'),filter=element('select');
  let renders=0,scrolls=0;
  const sandbox={
    $:id=>id==='fleet-overview'?fleet:id==='vehicleFilter'?filter:undefined,
    document:{createElement:element},
    vehicles,records,
    vehicleName:v=>v.name,
    render:()=>renders++,
    window:{scrollTo:options=>{assert.equal(options.top,0);scrolls++;}},
    String
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {fleet,filter,run:()=>sandbox.renderDashboardFleetOverview(),renders:()=>renders,scrolls:()=>scrolls};
}
const vehicles=[{id:'v1',name:'Fahrzeug Eins'},{id:'v2',name:'Fahrzeug Zwei'}];
const records=[{vehicle_id:'v1'},{vehicle_id:'v1'},{vehicle_id:'v2'},{vehicle_id:null}];

test('Jedes Fahrzeug erscheint unabhängig vom Filter mit Gesamtzahl aller Einträge',()=>{
  const h=harness(vehicles,records);h.run();
  assert.equal(h.fleet.children.length,2);
  assert.equal(h.fleet.children[0].textContent,'🚘 Fahrzeug Eins · 2 Einträge');
  assert.equal(h.fleet.children[1].textContent,'🚘 Fahrzeug Zwei · 1 Einträge');
});

test('Fahrzeugklick setzt Filter und startet Rendern sowie Scrollen',()=>{
  const h=harness(vehicles,records);h.run();
  h.fleet.children[1].onclick();
  assert.equal(h.filter.value,'v2');
  assert.equal(h.renders(),1);
  assert.equal(h.scrolls(),1);
});

test('Leere Fahrzeugliste zeigt Platzhalter statt leerer Fläche',()=>{
  const h=harness([],records);h.run();
  assert.equal(h.fleet.textContent,'Bitte ein Fahrzeug anlegen.');
  assert.equal(h.fleet.children.length,0);
});

test('Wiederholtes Rendern dupliziert keine Fahrzeuge und verändert keine Daten',()=>{
  const h=harness(vehicles,records);
  const before=JSON.stringify({vehicles,records});
  h.run();h.run();
  assert.equal(h.fleet.children.length,2);
  assert.equal(JSON.stringify({vehicles,records}),before);
});
