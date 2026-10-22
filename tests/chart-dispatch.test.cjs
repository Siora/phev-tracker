/** Regressionstest der vier bestehenden Diagramm-Aufrufe. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function renderDashboardCharts(');
const end=app.indexOf('\nfunction renderDashboardStatTiles(',start);
assert.ok(start>=0&&end>start,'Diagramm-Helfer fehlt');
function harness(){
  const calls=[],nodes=new Map();
  const sandbox={
    $:id=>{if(id==='trendMetric')return {value:'cost'};if(!nodes.has(id))nodes.set(id,{id});return nodes.get(id);},
    AnalyticsCharts:{
      trend:(...args)=>calls.push(['trend',...args]),
      donut:(...args)=>calls.push(['donut',...args]),
      price:(...args)=>calls.push(['price',...args]),
      providers:(...args)=>calls.push(['providers',...args])
    },
    settings:{base:'CHF'},
    conv:r=>r.cost
  };
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {calls,render:(filtered,charges)=>sandbox.renderDashboardCharts(filtered,charges)};
}
test('Alle vier Diagramme werden in der bisherigen Reihenfolge aktualisiert',()=>{
  const h=harness();h.render([],[]);
  assert.deepEqual(h.calls.map(x=>x[0]),['trend','donut','price','providers']);
});
test('Trend bekommt Filter, Kennzahl, Währung und Umrechnung',()=>{
  const h=harness(),filtered=[{cost:4}],charges=[{cost:3}];
  h.render(filtered,charges);
  assert.equal(h.calls[0][1].id,'trendchart');
  assert.equal(h.calls[0][2],filtered);
  assert.equal(h.calls[0][3],'cost');
  assert.equal(h.calls[0][4],'CHF');
  assert.equal(h.calls[0][5](filtered[0]),4);
  assert.equal(h.calls[3][1].id,'providerchart');
  assert.equal(h.calls[3][2],charges);
});
test('Erneuter Aufruf zeichnet alle Diagramme erneut',()=>{
  const h=harness();h.render([],[]);h.render([],[]);
  assert.equal(h.calls.length,8);
});
