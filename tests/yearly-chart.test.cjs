const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('styles.css','utf8');
test('annual chart uses existing filtered totals and table remains',()=>{
 assert.match(app,/const annualData=yearSet\.map/);
 assert.match(app,/renderYearlyCostChart\(annualData,money,currentYear\)/);
 assert.match(app,/for\(const \{year,totals\} of annualData\)/);
 assert.match(html,/id="intelligence-yearly-chart"/);
 assert.match(html,/id="intelligence-years"/);
});
test('chart separates categories and labels incomplete current year',()=>{
 assert.match(app,/\['energyCost','electric'\]/);
 assert.match(app,/\['fuelCost','fuel'\]/);
 assert.match(app,/\['otherCost','other'\]/);
 assert.match(app,/Laufendes, unvollständiges Jahr/);
 assert.match(app,/setAttribute\('aria-label',description\)/);
 assert.match(css,/\.yearly-cost-electric/);
});
