'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
test('localized option labels keep stable stored values',()=>{
 const options=[...html.matchAll(/<option\b([^>]*)\bdata-i18n="selectOption\.\d+"([^>]*)>([^<]*)<\/option>/g)];
 assert.ok(options.length>=25,'expected translated select options');
 for(const option of options){
  const attributes=option[1]+option[2];
  assert.match(attributes,/\bvalue="[^"]*"/,'missing stable option value: '+option[0]);
 }
});
