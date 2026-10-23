const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('receipt-parser.js','utf8'),context);
const parse=context.window.PhevReceiptParser.parse;
test('charge receipt extracts date, energy and labeled total',()=>{
 const r=parse('Datum: 23.10.2026\n24,5 kWh\nTotal CHF 12,80');
 assert.equal(r.date,'2026-10-23');
 assert.equal(r.amount,24.5);
 assert.equal(r.type,'charge');
 assert.equal(r.cost,12.8);
 assert.equal(r.currency,'CHF');
});
test('unlabeled prices and invalid dates are not guessed',()=>{
 const r=parse('31.02.2026\n10.50\n4,0 L');
 assert.equal(r.date,undefined);
 assert.equal(r.cost,undefined);
 assert.equal(r.type,'fuel');
 assert.equal(r.amount,4);
});
test('empty text yields no values',()=>assert.equal(Object.keys(parse('')).length,0));

test('OCR unit price with currency prefix',()=>{
 const r=parse('23.10.2026\n24,50 kWh\nPreis pro kWh CHF 0,45\nGesamtbetrag CHF 11,03');
 assert.equal(r.unit_price,0.45);
 assert.equal(r.cost,11.03);
});

test('charge receipt extracts time and AC charging mode',()=>{
 const r=parse('23.10.2026 14:35 Uhr\n24,5 kWh\nLadestrom: AC\nTotal CHF 11,03');
 assert.equal(r.time,'14:35');
 assert.equal(r.charge_mode,'AC');
});
test('fuel receipts do not receive charging mode',()=>{
 const r=parse('23.10.2026 08:05\n40 L\nLadestrom DC');
 assert.equal(r.time,'08:05');
 assert.equal(r.charge_mode,undefined);
});
