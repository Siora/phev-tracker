/**
 * DOM-Vertrag der ausgelagerten v88-Dashboard-Timeline.
 * Lädt den echten Helfer in eine künstliche VM; keine Cloud- oder Nutzerdaten.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function renderDashboardTimeline(');
const end=app.indexOf('\nfunction renderMonthComparison(',start);
assert.ok(start>=0&&end>start,'Timeline-Helfer fehlt');

function element(tag){
  return {tag,children:[],className:'',textContent:'',attributes:{},
    setAttribute(k,v){this.attributes[k]=v;},
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=[...nodes];this.textContent='';}
  };
}
function harness(){
  const target=element('section');
  const sandbox={
    $:id=>{assert.equal(id,'recent-entries');return target;},
    document:{createElement:element},
    settings:{base:'CHF'},
    vehicles:[{id:'v1',name:'Auto Eins'}],
    vehicleName:v=>v.name,
    getChargeMode:()=> 'AC',
    compareRecordDateTime:(a,b)=>b.date.localeCompare(a.date),
    recordDateTime:r=>r.date+' 12:00',
    conv:r=>r.cost,
    fmt:(value,currency)=>value.toFixed(2)+' '+currency,
    Number,String
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {target,render:items=>sandbox.renderDashboardTimeline(items)};
}
const record=(id,date,type='charge')=>({id,date,type,amount:12,cost:5,vehicle_id:'v1',place:'Zuhause'});

test('Höchstens acht neueste Ereignisse und Eingabe unverändert',()=>{
  const h=harness();
  const entries=Array.from({length:10},(_,i)=>record('r'+i,'2026-10-'+String(i+1).padStart(2,'0')));
  const before=JSON.stringify(entries);
  h.render(entries);
  assert.equal(h.target.children.length,8);
  assert.equal(h.target.children[0].children[1].children[0].children[1].textContent,'2026-10-10 · 12:00');
  assert.equal(JSON.stringify(entries),before);
});

test('Ladung und Tankung haben passende Klassen und Mengen-Einheiten',()=>{
  const h=harness();
  h.render([record('c','2026-10-01'),record('f','2026-10-02','fuel')]);
  const [fuel,charge]=h.target.children;
  assert.equal(fuel.className,'timeline-event timeline-fuel');
  assert.ok(fuel.children[1].children[1].textContent.includes(' Liter'));
  assert.equal(charge.className,'timeline-event timeline-charge');
  assert.ok(charge.children[1].children[1].textContent.includes(' kWh'));
});

test('Leere Auswahl zeigt den bestehenden Hinweis',()=>{
  const h=harness();h.render([]);
  assert.equal(h.target.children.length,1);
  assert.equal(h.target.children[0].textContent,'Noch keine Lade- oder Tankvorgänge im ausgewählten Zeitraum.');
});

test('Erneutes Rendern ersetzt Ereignisse vollständig',()=>{
  const h=harness();
  h.render([record('a','2026-10-01'),record('b','2026-10-02')]);
  h.render([record('c','2026-10-03')]);
  assert.equal(h.target.children.length,1);
});
