/**
 * Fahrzeugkosten: Kategorie-Aufschlüsselung mit synthetischen Datensätzen.
 * Testet Währungsumrechnung, Fahrzeugfilter und unveränderte Eingaben.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('vehicle-costs.js','utf8'),context);
const tco=context.window.PhevTco;
const settings={base:'CHF',rate:2};
const expenses=[
 {vehicle_id:'a',category:'Service',amount:100,currency:'CHF'},
 {vehicle_id:'a',category:'Service',amount:20,currency:'EUR'},
 {vehicle_id:'a',category:'Reifen',amount:50,currency:'CHF'},
 {vehicle_id:'b',category:'Service',amount:999,currency:'CHF'}
];
const records=[
 {vehicle_id:'a',type:'charge',cost:30},
 {vehicle_id:'a',type:'fuel',cost:70},
 {vehicle_id:'b',type:'charge',cost:888}
];
test('Kosten nach Kategorie und Fahrzeug korrekt aufsummieren',()=>{
 const before=JSON.stringify({expenses,records});
 const result=tco.breakdown(expenses,records,'a',settings,r=>r.cost);
 assert.deepEqual(Array.from(result,x=>[x.category,x.amount]),[
  ['Service',140],['Benzin',70],['Reifen',50],['Strom',30]
 ]);
 assert.equal(result.reduce((sum,x)=>sum+x.amount,0),290);
 assert.equal(JSON.stringify({expenses,records}),before,'Eingaben unverändert');
});
test('Gesamtübersicht ohne Fahrzeugfilter und leere Eingaben',()=>{
 const result=tco.breakdown(expenses,records,'',settings,r=>r.cost);
 assert.equal(result.reduce((sum,x)=>sum+x.amount,0),2177);
 assert.equal(tco.breakdown([],[],'a',settings,r=>r.cost).length,0);
});
