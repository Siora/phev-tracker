'use strict';
/**
 * Prevent incomplete translations and destructive data-i18n placement.
 * Runs without dependencies or a browser.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dictionaries=Object.fromEntries(['de','en'].map(lang=>{
 const source=fs.readFileSync(path.join(root,'i18n',lang+'.js'),'utf8');
 const keys=[...source.matchAll(/'([^']+)'\s*:/g)].map(m=>m[1]);
 assert.equal(keys.length,new Set(keys).size,lang+': duplicate translation keys');
 return [lang,new Set(keys)];
}));
test('German and English dictionaries have identical keys',()=>{
 assert.deepEqual([...dictionaries.de].sort(),[...dictionaries.en].sort());
});
test('all static data-i18n keys exist in both languages',()=>{
 const keys=[...new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map(m=>m[1]))];
 for(const lang of ['de','en']){
  const missing=keys.filter(key=>!dictionaries[lang].has(key));
  assert.deepEqual(missing,[],lang+': missing translations');
 }
});
test('translation targets never contain form controls',()=>{
 // Static labels should wrap their text in a span, not the input/select itself.
 const unsafe=[...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)]
  .filter(m=>/\bdata-i18n=/.test(m[1])&&/<(?:input|select|textarea|button)\b/i.test(m[2]))
  .map(m=>m[0].slice(0,130));
 assert.deepEqual(unsafe,[],'data-i18n on a label would delete its controls');
});
