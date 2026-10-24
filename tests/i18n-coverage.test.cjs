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

test('all translated attribute keys exist in both dictionaries',()=>{
 const keys=[...new Set([...html.matchAll(/data-i18n-(?:placeholder|aria-label|alt|title)="([^"]+)"/g)].map(m=>m[1]))];
 for(const lang of ['de','en']) assert.deepEqual(keys.filter(key=>!dictionaries[lang].has(key)),[]);
});

test('all literal JavaScript translation keys exist in both languages',()=>{
 const sources=['app.js','cloud.js'].map(name=>fs.readFileSync(path.join(root,name),'utf8'));
 const keys=[...new Set(sources.flatMap(source=>[...source.matchAll(/PhevI18n\?\.t\('([^']+)'/g)].map(m=>m[1]).filter(key=>!key.endsWith('.'))))];
 for(const lang of ['de','en'])assert.deepEqual(keys.filter(key=>!dictionaries[lang].has(key)),[],lang+': missing dynamic translations');
});

test('translation placeholders match across languages',()=>{
 const values=Object.fromEntries(['de','en'].map(lang=>{
  const source=fs.readFileSync(path.join(root,'i18n',lang+'.js'),'utf8');
  const window={PhevTranslations:{}};
  require('node:vm').runInNewContext(source,{window});
  return [lang,window.PhevTranslations[lang]];
 }));
 const placeholders=value=>[...String(value).matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
 for(const key of dictionaries.de){
  assert.deepEqual(placeholders(values.en[key]),placeholders(values.de[key]),key);
 }
});
