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
 const document={documentElement:{lang:'de'},querySelectorAll:(selector)=>selector==='[data-i18n]'?[label,status]:[],addEventListener:()=>{}};
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

test('regional date and number formatting follows account language',()=>{
 const {i18n}=setup();
 assert.equal(i18n.locale(),'de-CH');
 i18n.setLanguage('en');
 assert.equal(i18n.locale(),'en-CH');
 i18n.setLanguage('de');
 assert.equal(i18n.locale(),'de-CH');
});

test('placeholder, aria-label and alt attributes switch without overwriting user edits',()=>{
 const elements={};
 for(const attribute of ['placeholder','aria-label','alt']){
  const key='data-i18n-'+attribute;
  const values={[key]:'label',[attribute]:'Deutsch'};
  elements[attribute]={
   getAttribute:name=>values[name]??null,
   setAttribute:(name,value)=>{values[name]=value;},
   values
  };
 }
 const document={
  documentElement:{lang:'de'},
  querySelectorAll:selector=>{
   const match=selector.match(/^\\[data-i18n-(placeholder|aria-label|alt)\\]$/);
   return match?[elements[match[1]]]:[];
  },
  addEventListener:()=>{}
 };
 const window={PhevTranslations:{de:{label:'Deutsch'},en:{label:'English'}}};
 vm.runInNewContext(core,{window,document,WeakMap});
 const i18n=window.PhevI18n;
 i18n.setLanguage('en');
 for(const attr of Object.keys(elements))assert.equal(elements[attr].values[attr],'English');
 elements.placeholder.values.placeholder='Custom placeholder';
 i18n.setLanguage('de');
 assert.equal(elements.placeholder.values.placeholder,'Custom placeholder');
 assert.equal(elements['aria-label'].values['aria-label'],'Deutsch');
 assert.equal(elements.alt.values.alt,'Deutsch');
});
