const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('intelligent-analytics.js','utf8'),context);
const detect=context.window.PhevIntelligence.priceAnomalies;
const row=(date,amount,cost,vehicle_id=1,type='charge')=>({date,amount,cost,vehicle_id,type});
const base=[1,2,3,4].map(n=>row(`2026-01-0${n}`,10,3));
test('flags unusually expensive charge after sufficient baseline',()=>{
 const results=detect([...base,row('2026-02-01',10,6)],'1',2026,r=>r.cost);
 assert.equal(results.length,1);
 assert.equal(results[0].deviation,100);
});
test('does not compare other vehicles or zero quantities',()=>{
 const results=detect([...base.map(r=>({...r,vehicle_id:2})),row('2026-02-01',10,6),row('2026-02-02',0,100)],'1',2026,r=>r.cost);
 assert.equal(results.length,0);
});
test('needs four historical prices and ignores future years',()=>{
 const results=detect([...base.slice(0,3),row('2026-02-01',10,6),row('2027-01-01',10,100)],'1',2026,r=>r.cost);
 assert.equal(results.length,0);
});

// Same-day prices must not count as historical comparison entries.
test('same-day bookings are not used as earlier baseline',()=>{
 const sameDay=[...base.slice(0,3),row('2026-02-01',10,3),row('2026-02-01',10,6)];
 assert.equal(detect(sameDay,'1',2026,r=>r.cost).length,0);
});
