/** Isolierter HTML-Vertrag für die Dashboard-Statistikkacheln. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function renderDashboardStatTiles(');
const end=app.indexOf('\nfunction buildDashboardStatTiles(',start);
assert.ok(start>=0&&end>start,'Kachelrenderer fehlt');
function harness(){
  const target={innerHTML:''};
  const sandbox={$:id=>{assert.equal(id,'stats');return target;}};
  vm.runInNewContext(app.slice(start,end),sandbox);
  return {target,render:tiles=>sandbox.renderDashboardStatTiles(tiles)};
}
test('Die v88-HTML-Struktur der Kacheln bleibt unverändert',()=>{
  const h=harness();
  h.render([['Kosten','12.00 CHF'],['Ladungen','3']]);
  assert.equal(h.target.innerHTML,'<div class="tile"><small>Kosten</small><b>12.00 CHF</b></div><div class="tile"><small>Ladungen</small><b>3</b></div>');
});
test('Leere Kennzahlen löschen alte Kacheln',()=>{
  const h=harness();h.render([['A','B']]);h.render([]);
  assert.equal(h.target.innerHTML,'');
});
test('Erneutes Rendering ersetzt Kacheln statt sie anzuhängen',()=>{
  const h=harness();h.render([['A','B']]);h.render([['C','D']]);
  assert.equal(h.target.innerHTML,'<div class="tile"><small>C</small><b>D</b></div>');
});
test('Übergebene Kacheln bleiben unverändert',()=>{
  const h=harness(),tiles=[['A','B']],before=JSON.stringify(tiles);
  h.render(tiles);assert.equal(JSON.stringify(tiles),before);
});
