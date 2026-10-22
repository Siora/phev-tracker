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
 * @param {number} pageSize - Einträge pro Seite (5, 10 oder 20).
 * @param {string} key - Eindeutiger Schlüssel für die aktuelle Seite.
 * @param {Function} makeRow - Erzeugt eine Tabellenzeile mit Aktionen.
 */
window.paginateTable=function(container,table,tbody,items,pageSize,key,makeRow){
 const pages=Math.max(1,Math.ceil(items.length/pageSize));
 let page=Math.min(Math.max(1,listPageState.get(key)||1),pages);
 /**
  * Beide Navigationsleisten verwenden denselben Seitenzustand.
  * Die obere Leiste wird unmittelbar vor der Tabelle eingefügt, die untere
  * danach. Ein Klick aktualisiert beide Anzeigen und denselben tbody.
  */
 const createControls=(position)=>{
  const nav=document.createElement('nav');
  nav.className='table-pagination';
  nav.setAttribute('aria-label','Seitennavigation '+position);
  const previous=document.createElement('button');
  const next=document.createElement('button');
  const info=document.createElement('span');
  previous.type=next.type='button';
  previous.textContent='‹ Zurück';
  next.textContent='Weiter ›';
  info.setAttribute('aria-live','polite');
  previous.onclick=()=>changePage(-1);
  next.onclick=()=>changePage(1);
  nav.append(previous,info,next);
  return {nav,previous,next,info};
 };
 const top=createControls('oben');
 const bottom=createControls('unten');
 // Bei nur einer Seite werden beide Navigationsleisten vollständig verborgen.
 // Die Tabellenzeilen werden unabhängig davon wie bisher angezeigt.
 const hasMultiplePages=pages>1;
 top.nav.hidden=!hasMultiplePages;
 bottom.nav.hidden=!hasMultiplePages;

 /** Aktualisiert den gemeinsamen Seitenzustand und rendert beide Leisten. */
 const show=()=>{
  listPageState.set(key,page);
  tbody.replaceChildren();
  if(!items.length){
   const row=document.createElement('tr');
   const cell=document.createElement('td');
   cell.colSpan=table.querySelectorAll('thead th').length;
   cell.textContent='Keine Einträge vorhanden.';
   row.append(cell);
   tbody.append(row);
  }else{
   items.slice((page-1)*pageSize,page*pageSize).forEach(item=>tbody.append(makeRow(item)));
  }
  const first=items.length?(page-1)*pageSize+1:0;
  const last=Math.min(items.length,page*pageSize);
  const label=first+'–'+last+' von '+items.length+' · Seite '+page+' / '+pages;
  for(const controls of [top,bottom]){
   controls.previous.disabled=page===1;
   controls.next.disabled=page===pages;
   controls.info.textContent=label;
  }
 };

 /** Blättert unabhängig vom angeklickten Navigationsbereich. */
 const changePage=(delta)=>{
  const target=Math.min(pages,Math.max(1,page+delta));
  if(target!==page){page=target;show();}
 };
 container.append(top.nav,table,bottom.nav);
 show();
};
