/**
 * Isolierte DOM-Regressionstests der Monatsvergleichsansicht (v88).
 * Keine Browser- oder Cloud-Aufrufe, keine produktiven Einträge.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function renderMonthComparison(');
const end=app.indexOf('\nfunction buildDashboardStatTiles(',start);
assert.ok(start>=0&&end>start,'Monatsvergleichs-Helfer nicht gefunden');

function element(tag='div'){
  return {
    tagName:tag,textContent:'',className:'',style:{},children:[],
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=[...nodes];this.textContent='';}
  };
}
function harness(){
  const target=element();
  const sandbox={
    $:id=>{assert.equal(id,'month-compare');return target;},
    document:{createElement:element},
    settings:{base:'CHF'},
    conv:r=>r.cost,
    fmt:(value,currency)=>value.toFixed(2)+' '+currency,
    Map,Math
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {target,render:records=>sandbox.renderMonthComparison(records)};
}
function row(target){
  return target.children.map(node=>({
    month:node.children[0].textContent,
    width:node.children[1].children[0].style.width,
    amount:node.children[2].textContent
  }));
}

test('Drei neueste Monate erscheinen mit identischer relativer Balkenbreite',()=>{
  const h=harness();
  h.render([
    {date:'2026-01-10',cost:10},
    {date:'2026-02-10',cost:20},
    {date:'2026-03-10',cost:30},
    {date:'2026-04-10',cost:40},
    {date:'2026-04-20',cost:10}
  ]);
  assert.deepEqual(row(h.target),[
    {month:'2026-04',width:'100%',amount:'50.00 CHF'},
    {month:'2026-03',width:'60%',amount:'30.00 CHF'},
    {month:'2026-02',width:'40%',amount:'20.00 CHF'}
  ]);
});

test('Leere Auswahl zeigt v88-Leermeldung',()=>{
  const h=harness();h.render([]);
  assert.equal(h.target.textContent,'Noch keine Monatsdaten.');
  assert.equal(h.target.children.length,0);
});

test('Erneutes Rendern ersetzt Balken statt sie zu duplizieren',()=>{
  const h=harness();
  h.render([{date:'2026-01-10',cost:12}]);
  h.render([{date:'2026-02-10',cost:8}]);
  assert.deepEqual(row(h.target),[{month:'2026-02',width:'100%',amount:'8.00 CHF'}]);
});

test('Eingabereihenfolge bleibt unverändert',()=>{
  const h=harness();
  const records=[{date:'2026-03-01',cost:2},{date:'2026-01-01',cost:4}];
  const before=JSON.stringify(records);
  h.render(records);
  assert.equal(JSON.stringify(records),before);
});
