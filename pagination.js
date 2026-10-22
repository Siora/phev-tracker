/*
 * PHEV Tracker – Wiederverwendbare Tabellen-Seitennavigation.
 * Keine Änderung an Datensätzen oder Cloud-Operationen.
 * Wird vor cloud.js und app.js geladen, da beide Dateien die Funktion nutzen.
 */

/* V82 — shared client-side pagination; never modifies underlying records. */
const listPageState=new Map();
/**
 * Clientseitige Seitennavigation für vorhandene DOM-Tabellen.
 * @param {HTMLElement} container - Zielbereich inklusive Navigation.
 * @param {HTMLTableElement} table - Bereits angelegte Tabelle mit Kopfzeile.
 * @param {HTMLTableSectionElement} tbody - Zu ersetzende Tabellenzeilen.
 * @param {Array} items - Gesamtliste; wird weder verändert noch gekürzt.
 * @param {number} pageSize - Einträge pro Seite (20 bzw. 5).
 * @param {string} key - Eindeutiger Schlüssel für die aktuelle Seite.
 * @param {Function} makeRow - Erzeugt eine Tabellenzeile mit Aktionen.
 */
window.paginateTable=function(container,table,tbody,items,pageSize,key,makeRow){
 const pages=Math.max(1,Math.ceil(items.length/pageSize));
 let page=Math.min(Math.max(1,listPageState.get(key)||1),pages);
 const controls=document.createElement('nav');controls.className='table-pagination';controls.setAttribute('aria-label','Seitennavigation');
 const previous=document.createElement('button'),next=document.createElement('button'),info=document.createElement('span');
 previous.type=next.type='button';previous.textContent='‹ Zurück';next.textContent='Weiter ›';info.setAttribute('aria-live','polite');
 const show=()=>{
  listPageState.set(key,page);tbody.replaceChildren();
  if(!items.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=table.querySelectorAll('thead th').length;cell.textContent='Keine Einträge vorhanden.';row.append(cell);tbody.append(row);}
  else items.slice((page-1)*pageSize,page*pageSize).forEach(item=>tbody.append(makeRow(item)));
  previous.disabled=page===1;next.disabled=page===pages;
  const first=items.length?(page-1)*pageSize+1:0,last=Math.min(items.length,page*pageSize);
  info.textContent=first+'–'+last+' von '+items.length+' · Seite '+page+' / '+pages;
 };
 previous.onclick=()=>{if(page>1){page--;show();}};
 next.onclick=()=>{if(page<pages){page++;show();}};
 controls.append(previous,info,next);container.append(table,controls);show();
};
