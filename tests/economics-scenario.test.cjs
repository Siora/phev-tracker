const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('intelligent-analytics.js','utf8'),context);
const calculate=context.window.PhevIntelligence.economicsScenario;
const base={annualKm:12000,electricShare:50,kwhPer100:20,litersPer100:6,priceKwh:0.3,priceLiter:1.8,fixedAnnual:600};
test('scenario calculates annual costs',()=>{
 const result=calculate(base);
 assert.equal(result.available,true);
 assert.equal(result.electricity,360);
 assert.equal(result.fuel,648);
 assert.equal(result.annual,1608);
 assert.equal(result.costPer100,13.4);
});
test('invalid assumptions are rejected',()=>{
 assert.equal(calculate({...base,annualKm:0}).available,false);
 assert.equal(calculate({...base,electricShare:101}).available,false);
 assert.equal(calculate({...base,priceLiter:-1}).available,false);
 assert.equal(calculate(null).available,false);
});
