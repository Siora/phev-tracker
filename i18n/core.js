/* Gemeinsame Übersetzungs-API. Keine Browser- oder Kontospeicherung als Ersatz für MySQL. */
(function(){
 const languages=['de','en'];
 let active='de';
 // Remember only text written by i18n; never overwrite live status updates.
 const translatedText=new WeakMap();
 const translatedAttributes=new WeakMap();
 function translate(key,variables){
  const dictionaries=window.PhevTranslations||{};
  const value=dictionaries[active]?.[key]??dictionaries.de?.[key]??key;
  return String(value).replace(/\{(\w+)\}/g,(_,name)=>String(variables?.[name]??''));
 }
 function translateElement(element){
  const previous=translatedText.get(element);
  if(previous!==undefined && element.textContent!==previous)return;
  const next=translate(element.dataset.i18n);
  if(element.textContent!==next)element.textContent=next;
  translatedText.set(element,next);
 }
 function setLanguage(code){
  if(!languages.includes(code))return false;
  active=code;document.documentElement.lang=code;
  document.querySelectorAll('[data-i18n]').forEach(translateElement);
  // Translate attributes without replacing form controls or their current values.
  for(const attribute of ['placeholder','aria-label','alt']){
   document.querySelectorAll('[data-i18n-'+attribute+']').forEach(element=>{
    const key=element.getAttribute('data-i18n-'+attribute);
    const next=translate(key);
    const previous=translatedAttributes.get(element)?.[attribute];
    if(previous!==undefined && element.getAttribute(attribute)!==previous)return;
    element.setAttribute(attribute,next);
    const state=translatedAttributes.get(element)||{};
    state[attribute]=next;
    translatedAttributes.set(element,state);
   });
  }
  return true;
 }
 window.PhevI18n=Object.freeze({t:translate,setLanguage,getLanguage:()=>active,locale:()=>active==='en'?'en-CH':'de-CH',languages});
 // Components may be rendered after the language preference was loaded.
 // Translate newly inserted labels without changing user-edited status text.
 document.addEventListener('DOMContentLoaded',()=>{
  setLanguage(active);
  if(typeof MutationObserver==='undefined')return;
  const observer=new MutationObserver(records=>{
   for(const record of records){
    for(const node of record.addedNodes){
     if(node.nodeType!==1)continue;
     if(node.matches?.('[data-i18n]'))translateElement(node);
     node.querySelectorAll?.('[data-i18n]').forEach(translateElement);
    }
   }
  });
  observer.observe(document.body,{childList:true,subtree:true});
 });
})();
