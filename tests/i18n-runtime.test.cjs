'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const core=fs.readFileSync(path.join(__dirname,'../i18n/core.js'),'utf8');
function setup(){
 const label={dataset:{i18n:'label'},textContent:'Deutsch'};
 const status={dataset:{i18n:'status'},textContent:'Wartet'};
 const document={documentElement:{lang:'de'},querySelectorAll:()=>[label,status],addEventListener:()=>{}};
 const window={PhevTranslations:{de:{label:'Deutsch',status:'Wartet'},en:{label:'English',status:'Waiting'}}};
 vm.runInNewContext(core,{window,document,WeakMap});
 return {label,status,document,i18n:window.PhevI18n};
}
test('static text switches between German and English',()=>{
 const {label,status,i18n,document}=setup();
 i18n.setLanguage('en');
 assert.equal(label.textContent,'English');
 assert.equal(status.textContent,'Waiting');
 assert.equal(document.documentElement.lang,'en');
 i18n.setLanguage('de');
 assert.equal(label.textContent,'Deutsch');
});
test('live status messages are not overwritten on language change',()=>{
 const {label,status,i18n}=setup();
 i18n.setLanguage('de');
 status.textContent='Backup successfully created at 09:00';
 i18n.setLanguage('en');
 assert.equal(status.textContent,'Backup successfully created at 09:00');
 assert.equal(label.textContent,'English');
});
test('fresh translated status continues switching normally',()=>{
 const {status,i18n}=setup();
 i18n.setLanguage('en');
 i18n.setLanguage('de');
 assert.equal(status.textContent,'Wartet');
});
