/* Gemeinsame Übersetzungs-API. Keine Browser- oder Kontospeicherung als Ersatz für MySQL. */
(function(){
 const languages=['de','en'];
 let active='de';
 function translate(key,variables){
  const dictionaries=window.PhevTranslations||{};
  const value=dictionaries[active]?.[key]??dictionaries.de?.[key]??key;
  return String(value).replace(/\{(\w+)\}/g,(_,name)=>String(variables?.[name]??''));
 }
 function setLanguage(code){
  if(!languages.includes(code))return false;
  active=code;document.documentElement.lang=code;
  document.querySelectorAll('[data-i18n]').forEach(element=>{
   element.textContent=translate(element.dataset.i18n);
  });
  return true;
 }
 window.PhevI18n=Object.freeze({t:translate,setLanguage,getLanguage:()=>active,languages});
 document.addEventListener('DOMContentLoaded',()=>setLanguage(active));
})();
