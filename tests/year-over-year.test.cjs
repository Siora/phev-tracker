const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('intelligent-analytics.js','utf8'),context);
const compare=context.window.PhevIntelligence.compareYears;
const months=(value)=>Array.from({length:12},()=>({total:value,charge:value/2,fuel:value/2,extra:0}));
test('current year compares only completed months',()=>{
 const result=compare(months(20),months(10),2026,new Date('2026-10-23T12:00:00'));
 assert.equal(result.available,true);
 assert.equal(result.months,9);
 assert.equal(result.currentTotal,180);
 assert.equal(result.previousTotal,90);
 assert.equal(result.percent,100);
 assert.equal(result.partial,true);
});
test('past year compares twelve months',()=>{
 const result=compare(months(5),months(10),2025,new Date('2026-10-23T12:00:00'));
 assert.equal(result.months,12);
 assert.equal(result.percent,-50);
 assert.equal(result.partial,false);
});
test('missing baseline and future year are not compared',()=>{
 assert.equal(compare(months(10),months(0),2025,new Date('2026-10-23')).available,false);
 assert.equal(compare(months(10),months(10),2027,new Date('2026-10-23')).available,false);
});
