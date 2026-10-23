/*
 * PHEV Tracker – Anwendungslogik
 *
 * Zuständig für lokale Einträge, Fahrzeugauswahl, Filter, Auswertungen,
 * Import/Export sowie die Darstellung des Dashboards.
 * Die Cloud-Anbindung ist in cloud.js gekapselt.
 */

const $=x=>document.getElementById(x),key='phev-records-1';
const costComparisonKey='phev-cost-comparison-v1';
const fuelEnergyKey='phev-fuel-energy-factor-v1';

/* Uhrzeiten bleiben als lokale Zusatzdaten erhalten, ohne das Cloud-Datumsschema zu ändern. */

function chargeModeKey(){let email='local';try{email=JSON.parse(localStorage.getItem('phev-session-v1')||'null')?.email||'local';}catch{}return 'phev-charge-modes-'+email;}
function chargeModes(){try{return JSON.parse(localStorage.getItem(chargeModeKey())||'{}')||{};}catch{return {};}}
function getChargeMode(id){const record=records.find(r=>r.id===id);return record?.charge_mode||chargeModes()[id]||'';}
function setChargeMode(id,mode){const data=chargeModes();if(mode==='AC'||mode==='DC')data[id]=mode;else delete data[id];localStorage.setItem(chargeModeKey(),JSON.stringify(data));}

function recordTimeKey(){let email='local';try{email=JSON.parse(localStorage.getItem('phev-session-v1')||'null')?.email||'local';}catch{}return 'phev-record-times-'+email;}
function recordTimes(){try{return JSON.parse(localStorage.getItem(recordTimeKey())||'{}')||{};}catch{return {};}}
function recordTime(id){const record=records.find(r=>r.id===id);return String(record?.time||'').slice(0,5)||recordTimes()[id]||'';}
function setRecordTime(id,time){const times=recordTimes();if(/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time))times[id]=time;else delete times[id];localStorage.setItem(recordTimeKey(),JSON.stringify(times));}
function recordDateTime(r){return String(r.date||'')+(recordTime(r.id)?' '+recordTime(r.id):'');}
function compareRecordDateTime(a,b){const av=String(a.date||'')+'T'+(recordTime(a.id)||'00:00');const bv=String(b.date||'')+'T'+(recordTime(b.id)||'00:00');const result=av.localeCompare(bv);return ($('entry-sort')?.value==='asc'?1:-1)*result || String(a.id).localeCompare(String(b.id));}
function localClock(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}

let cloudView=false;
function toggleMobileMenu(){const nav=$('primary-nav'),button=$('mobile-menu-toggle');if(!nav||!button)return;const open=nav.classList.toggle('menu-open');button.setAttribute('aria-expanded',String(open));button.textContent=open?'✕ Menü schliessen':'☰ Menü öffnen';}
document.addEventListener('click',event=>{if(event.target.closest('#primary-nav button')){const nav=$('primary-nav'),button=$('mobile-menu-toggle');nav?.classList.remove('menu-open');if(button){button.setAttribute('aria-expanded','false');button.textContent='☰ Menü öffnen';}}});
function updateLoginNotice(){const el=$('login-required-notice');if(el)el.hidden=!!localStorage.getItem('phev-session-v1');}
window.updateLoginNotice=updateLoginNotice;
let vehicles=[];
window.setVehicles=function(items){vehicles=items;refreshVehicles();scheduleAutomaticBackup();render();};
// Lokale Bildwahl: Die Cloud-Fahrzeugdaten bleiben unverändert.
window.setVehiclePhoto=function(vehicleId,url){
 const clean=String(url||'').trim();
 if(clean&&!/^https:\/\/[^\s]+$/i.test(clean))throw Error('Bitte eine gültige HTTPS-Bildadresse eingeben.');
 const key='phev-photo-'+vehicleId;
 if(clean)localStorage.setItem(key,clean);else localStorage.removeItem(key);
 window.currentPhotoVehicle=null;
 window.scheduleCloudPreferences?.();
 render();
};
function vehicleName(v){return v.brand+' '+v.model+(v.plate?' · '+v.plate:'');}

// Fahrzeugbilder: Modellnamen streng abgleichen, Ergebnisse zwischenspeichern.
// Bei fehlendem Treffer bleibt die neutrale Fahrzeuggrafik sichtbar.
const vehiclePhotoCache=new Map();
let photoRequest=0;
function displayVehiclePhoto(result){
 for(const id of ['heroVehicleImage','sidebarVehicleImage']){
  const img=$(id),fallback=img.parentElement.querySelector('.vehicle-photo-fallback');
  img.hidden=!result;fallback.hidden=!!result;
  if(result){img.src=result.src;img.alt=result.alt;img.onerror=()=>{img.hidden=true;fallback.hidden=false;};}
  else img.removeAttribute('src');
 }
 const credit=$('vehicleImageCredit');credit.hidden=!result||!!result.custom;credit.href=result?.custom?'#':(result?.page||'#');
}
async function updateVehiclePhoto(vehicle){
 const request=++photoRequest;
 if(!vehicle){displayVehiclePhoto(null);return;}
 const custom=localStorage.getItem('phev-photo-'+vehicle.id);
 if(custom){displayVehiclePhoto({src:custom,page:custom,custom:true,alt:'Eigenes Fahrzeugfoto: '+vehicleName(vehicle)});return;}
 const key=(vehicle.brand+' '+vehicle.model).trim().toLowerCase();
 if(vehiclePhotoCache.has(key)){displayVehiclePhoto(vehiclePhotoCache.get(key));return;}
 displayVehiclePhoto(null);
 try{
  const normalize=text=>String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
  const brand=normalize(vehicle.brand),model=normalize(vehicle.model);
  const requested=normalize(vehicle.brand+' '+vehicle.model);
  // Nur exakte Modellbezeichnungen; keine unscharfen Treffer anderer Baureihen.
  const expected=[requested];
  if(brand==='byd'&&model==='seal u dm i')expected.push('byd seal u');
  const endpoint='https://de.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent('"'+vehicle.brand+' '+vehicle.model+'"')+'&gsrlimit=15&prop=pageimages|info&inprop=url&pithumbsize=900&format=json&origin=*';
  const response=await fetch(endpoint,{mode:'cors'});
  if(!response.ok)throw Error('Bildsuche fehlgeschlagen');
  const data=await response.json();
  const pages=Object.values(data.query?.pages||{});
  const candidates=pages.filter(p=>p.thumbnail?.source&&expected.includes(normalize(p.title)));
  candidates.sort((a,b)=>expected.indexOf(normalize(a.title))-expected.indexOf(normalize(b.title)));
  const match=candidates[0];
  const result=match?{src:match.thumbnail.source,page:match.fullurl||'https://de.wikipedia.org/wiki/'+encodeURIComponent(match.title),alt:'Foto: '+match.title}:null;
  vehiclePhotoCache.set(key,result);
  if(request===photoRequest)displayVehiclePhoto(result);
 }catch(e){if(request===photoRequest)displayVehiclePhoto(null);}
}

// Aktualisiert sämtliche Fahrzeug-Auswahllisten nach Anmeldung oder Änderungen.
/**
 * Aktualisiert alle Fahrzeug-Auswahllisten, ohne eine noch gültige Auswahl
 * zurückzusetzen. Das Einzelfahrzeug wird im Eingabeformular und in
 * Schnellformularen automatisch ausgewählt, falls nur eines vorhanden ist.
 * Die Aktualisierung des Sammelformularzählers bleibt der letzte Schritt.
 */
function refreshVehicles(){
  const filter=$('vehicleFilter');
  const selected=filter.value;
  const entry=$('entryVehicle');
  const chosen=entry.value;
  replaceVehicleOptions(filter,'Alle Fahrzeuge',selected,false);
  const reportVehicle=$('report-vehicle');
  if(reportVehicle)replaceVehicleOptions(reportVehicle,'Alle Fahrzeuge',reportVehicle.value,false);
  replaceVehicleOptions(entry,'Bitte Fahrzeug auswählen',chosen,true);
  document.querySelectorAll('.quick-form select[name=vehicle_id]').forEach(sel=>{
    replaceVehicleOptions(sel,'Fahrzeug auswählen',sel.value,true);
  });
  updateBulkCount();
}

/**
 * Schreibt Fahrzeugoptionen in eine Select-Liste.
 * Die bisherige Auswahl hat Vorrang; nur Eingabeformulare wählen bei genau
 * einem Fahrzeug automatisch dessen ID. Dashboard/Report bleiben auf „Alle“.
 */
function replaceVehicleOptions(select,placeholder,previous,autoSelectSingle){
  select.replaceChildren(
    new Option(placeholder,''),
    ...vehicles.map(v=>new Option(vehicleName(v),String(v.id)))
  );
  const valid=(!autoSelectSingle||previous!=='')&&[...select.options].some(option=>option.value===previous);
  select.value=valid?previous:(autoSelectSingle&&vehicles.length===1?String(vehicles[0].id):'');
}

function updateBulkCount(){const el=$('bulk-count');if(el)el.textContent=records.filter(r=>!r.vehicle_id).length+' Einträge ohne Fahrzeugzuordnung.';}
// Ordnet ausschließlich bisher nicht zugewiesene Einträge einem Fahrzeug zu.
window.assignUnassignedToVehicle=function(vehicleId){
 if(!vehicles.some(v=>String(v.id)===String(vehicleId)))throw Error('Fahrzeug nicht gefunden');
 let count=0;records=records.map(r=>{if(r.vehicle_id)return r;count++;return {...r,vehicle_id:Number(vehicleId)};});
 if(count)save();updateBulkCount();return count;
};

let records=JSON.parse(localStorage.getItem(key)||'[]'),settings=JSON.parse(localStorage.getItem('phev-settings-1')||'{"base":"CHF","rate":0.94}'),pending=[];
const n=x=>{
  let s=String(x??'').replace(/[^0-9,.-]/g,'');
  if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else s=s.replace(',','.');
  return Number(s)||0
};
const id=x=>[x.type,x.date,x.amount.toFixed(3),x.cost.toFixed(2),x.currency,(x.place||'').toLowerCase()].join('|');
const fmt=(v,c)=>v.toFixed(2)+' '+c;
const conv=x=>x.currency===settings.base?x.cost:settings.base==='CHF'?x.cost*settings.rate:x.cost/settings.rate;
/**
 * Aktive Seite innerhalb des aktuellen Browser-Tabs behalten.
 *
 * sessionStorage übersteht einen Reload, wird aber normalerweise beim Schliessen
 * des Tabs verworfen. Die Whitelist verhindert, dass veraltete oder fremde Werte
 * zu einer leeren Ansicht führen. Auch die Konto-Seite verwendet diesen Weg.
 */
const navigationStorageKey='phev-active-page-v1';
const navigationPages=['home','intelligence','add','csv','vehicles','charging-management','options','cloud','family','cloud-settings'];
function restoredPage(){
 try{
  const page=sessionStorage.getItem(navigationStorageKey);
  return navigationPages.includes(page)?page:'home';
 }catch{return 'home';}
}
function rememberPage(page){
 try{sessionStorage.setItem(navigationStorageKey,page);}catch{/* Private Mode: Navigation bleibt nutzbar. */}
}
// Wechsel zwischen den Bereichen der Single-Page-Anwendung.

/**
 * Analyseseite: Daten werden beim Öffnen und nach Änderungen frisch berechnet.
 * Die Auswertung nutzt ausschliesslich vorhandene Cloud-/Lokal-Datensätze.
 * DOM-Inhalte werden über textContent erstellt (kein ungeprüftes HTML).
 */
function renderIntelligence(){
 const panel=$('intelligence');
 if(!panel||panel.classList.contains('hide')||!window.PhevIntelligence)return;
 const yearSelect=$('intelligence-year'),vehicleSelect=$('intelligence-vehicle');
 const currentYear=new Date().getFullYear();
 const years=[...new Set([currentYear,...records.map(r=>Number(String(r.date||'').slice(0,4))),...vehicleExpenses.map(r=>Number(String(r.date||'').slice(0,4)))])].filter(y=>Number.isInteger(y)&&y>=2020&&y<=2100).sort((a,b)=>b-a);
 const selectedYear=yearSelect.value||String(currentYear);
 yearSelect.replaceChildren(...years.map(y=>new Option(String(y),String(y))));
 yearSelect.value=years.includes(Number(selectedYear))?selectedYear:String(currentYear);
 const selectedVehicle=vehicleSelect.value;
 vehicleSelect.replaceChildren(new Option('Alle Fahrzeuge',''),...vehicles.map(v=>new Option(vehicleName(v),String(v.id))));
 vehicleSelect.value=selectedVehicle;
 const result=window.PhevIntelligence.analyze(records,vehicleExpenses,vehicleSelect.value,Number(yearSelect.value),conv,e=>expenseCurrency(Number(e.amount),e.currency));
 const summary=$('intelligence-summary'),chart=$('intelligence-chart'),insights=$('intelligence-insights'),body=$('intelligence-months');
 summary.replaceChildren();chart.replaceChildren();insights.replaceChildren();body.replaceChildren();
 const money=v=>new Intl.NumberFormat('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v))+' '+settings.base;
 for(const [label,value] of [['Gesamtkosten',money(result.total)],['Stromkosten',money(result.energyCost)],['Benzinkosten',money(result.fuelCost)],['Weitere Ausgaben',money(result.otherCost)],['Geladene Energie',result.kwh.toFixed(1)+' kWh'],['Benzinmenge',result.liters.toFixed(1)+' l']]){
  const card=document.createElement('article');card.className='quick-card';
  const title=document.createElement('strong');title.textContent=label;
  const number=document.createElement('p');number.textContent=value;
  card.append(title,number);summary.append(card);
 }
 // Prognose bewusst separat anzeigen: eine Hochrechnung ist keine Ist-Ausgabe.
 const forecastPanel=$('intelligence-forecast');
 if(forecastPanel){
  forecastPanel.replaceChildren();
  const forecast=result.forecast;
  const line=document.createElement('p');
  line.textContent=forecast.available
   ?(forecast.final?'Erfasste Jahreskosten: ':'Voraussichtliche Jahreskosten: ')+money(forecast.projected)
   :forecast.reason;
  forecastPanel.append(line);
  if(forecast.available){
   const detail=document.createElement('small');
   detail.textContent=forecast.final
    ?'Abgeschlossenes Jahr; keine Hochrechnung.'
    :'Durchschnitt pro abgeschlossenem Monat: '+money(forecast.average)+' · Hochrechnung aus '+forecast.completed+' Monaten mit '+forecast.active+' aktiven Kostenmonaten.'+(forecast.partial?' Achtung: Monate ohne Einträge können unvollständig sein.':'');
   forecastPanel.append(detail);
  }
 }
 const max=Math.max(1,...result.months.map(m=>m.total));
 for(const month of result.months){
  const bar=document.createElement('div');bar.className='intelligence-bar';
  const track=document.createElement('div');track.className='intelligence-track';
  const fill=document.createElement('div');fill.className='intelligence-fill';
  fill.style.height=(month.total/max*100)+'%';
  track.title=month.month+': '+money(month.total);
  track.setAttribute('aria-label',track.title);
  const label=document.createElement('small');label.textContent=month.month;
  bar.append(track,label);track.append(fill);chart.append(bar);
  const tr=document.createElement('tr');
  for(const [index,value] of [month.month,money(month.charge),money(month.fuel),money(month.extra),money(month.total)].entries()){
   const td=document.createElement(index===0?'th':'td');
   if(index===0)td.scope='row';
   td.textContent=value;tr.append(td);
  }
  if(month.total>0)tr.classList.add('intelligence-month-active');
  body.append(tr);
 }
 for(const insight of result.messages){
  const card=document.createElement('article');card.className='insight-item';
  const heading=document.createElement('strong');heading.textContent=insight.title;
  const detail=document.createElement('p');detail.textContent=insight.detail;
  card.append(heading,detail);insights.append(card);
 }
}
window.renderIntelligence=renderIntelligence;

function tab(t){
  if(!navigationPages.includes(t))t='home';
  navigationPages.forEach(x=>$(x).classList.toggle('hide',x!==t));
  document.querySelectorAll('.sidebar nav button').forEach((b,i)=>b.classList.toggle('active',navigationPages[i]===t || ((t==='family'||t==='cloud-settings') && navigationPages[i]==='cloud')));
  rememberPage(t);
  render();
  renderIntelligence();
  window.scrollTo(0,0)
}
/**
 * Persistiert Änderungen an Lade-/Tankeinträgen und aktualisiert die Anzeige.
 * Die Cloud-Warteschlange wird getrennt in cloud.js verarbeitet: ein Verbindungsfehler
 * darf keine lokal noch ausstehenden Änderungen beseitigen.
 */
function save(){
  if(cloudView){window.queueCloudChanges(records);scheduleAutomaticBackup();render();return;}
  localStorage.setItem(key,JSON.stringify(records));
  scheduleAutomaticBackup();
  render();updateBulkCount()
}
$('entry-sort')?.addEventListener('change',render);

function renderConsumptionInsights(items,charges,fuel,distance){
 const target=$('consumption-insights');if(!target)return;
 target.replaceChildren();
 const add=(title,value,note)=>{
  const card=document.createElement('div');card.className='insight-item';
  const heading=document.createElement('strong');heading.textContent=title;
  const figure=document.createElement('b');figure.textContent=value;
  const detail=document.createElement('small');detail.textContent=note;
  card.append(heading,figure,detail);target.append(card);
 };
 if(!items.length){add('Noch keine Daten','–','Erfasse Ladungen oder Tankungen für eine Auswertung.');return;}
 const total=items.reduce((sum,r)=>sum+conv(r),0);
 add('Gesamtkosten',fmt(total,settings.base),items.length+' Einträge im gewählten Zeitraum');
 if(distance>0)add('Kosten je 100 km',fmt(total/distance*100,settings.base),'Näherung aus '+distance.toLocaleString('de-CH')+' km Kilometerstandsspanne');
 else add('Kosten je 100 km','–','Mindestens zwei unterschiedliche Kilometerstände erforderlich');
 const valid=charges.filter(r=>Number(r.amount)>0&&Number.isFinite(conv(r))&&conv(r)>=0);
 const sumKwh=valid.reduce((a,r)=>a+Number(r.amount),0);
 const sumCost=valid.reduce((a,r)=>a+conv(r),0);
 if(sumKwh>0){
  const avg=sumCost/sumKwh;
  add('Gewichteter Strompreis',fmt(avg,settings.base)+' / kWh',valid.length+' Ladevorgänge berücksichtigt');
  const costly=valid.filter(r=>Number(r.amount)>=1&&conv(r)/Number(r.amount)>avg*1.5&&conv(r)/Number(r.amount)>avg+0.05).sort((a,b)=>conv(b)/Number(b.amount)-conv(a)/Number(a.amount));
  if(valid.length>=3&&costly.length){
   const highest=costly[0],price=conv(highest)/Number(highest.amount);
   add('Auffälliger Ladepreis',fmt(price,settings.base)+' / kWh',(highest.place||'Unbekannter Ladeort')+' · '+highest.date+' · über 50 % über dem Durchschnitt');
  }else add('Ladepreis-Prüfung','Keine Auffälligkeit',valid.length<3?'Ab 3 Ladevorgängen wird auf hohe Einzelpreise geprüft.':'Kein Einzelpreis liegt deutlich über dem Durchschnitt.');
 }
 const sorted=items.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)).slice().sort((a,b)=>a.date.localeCompare(b.date));
 if(sorted.length>=4){
  const midpoint=Math.floor(sorted.length/2),earlier=sorted.slice(0,midpoint),later=sorted.slice(midpoint);
  const avgCost=arr=>arr.reduce((sum,r)=>sum+conv(r),0)/arr.length;
  const before=avgCost(earlier),after=avgCost(later);
  if(before>0){
   const delta=(after/before-1)*100;
   add('Kostenentwicklung je Eintrag',(delta>0?'+':'')+delta.toFixed(1)+' %','Vergleich der früheren und neueren Hälfte der Einträge; kein Verbrauchstrend pro km');
  }
 }
 const liters=fuel.reduce((sum,r)=>sum+Number(r.amount||0),0);
 if(liters>0)add('Erfasste Benzinmenge',liters.toFixed(1)+' Liter','Tankmenge ist nicht gleich tatsächlichem Motorverbrauch.');
}

/**
 * Baut ausschließlich die zehn Kennzahlen-Kacheln für das Dashboard.
 *
 * Eingabe: bereits gefilterte Lade-/Tankvorgänge, aggregierte Kosten,
 * Kilometerstandsspanne und formatierte Durchschnittspreise.
 * Ausgabe: neues Array aus [Beschriftung, Anzeigewert] ohne DOM-Zugriff,
 * Storage-Schreibzugriff oder Veränderung der übergebenen Einträge.
 *
 * Die Reihenfolge und Formeln entsprechen exakt der bisherigen v88-Logik.
 * Eine Auslagerung der Verbrauchsdiagramme ist ausdrücklich nicht enthalten.
 */
/**
 * Rendert die drei kostenstärksten Monate des aktuell gefilterten Zeitraums.
 *
 * Der Helfer greift ausschließlich auf die bereits gefilterten Einträge zu;
 * der globale Filterzustand, die Datensätze und die Cloud bleiben unverändert.
 * Die Monatsaggregation, Sortierung (neuester Monat zuerst), Skalierung und
 * Leermeldung entsprechen der bisherigen v88-Implementierung.
 */
/**
 * Zeichnet die letzten acht Lade- und Tankvorgänge im Dashboard.
 *
 * Erwartet die bereits nach Zeitraum, Fahrzeug und Ort gefilterten Einträge.
 * Sortierung, Anzeigeformat, Ladeart, Fahrzeugname und Leermeldung entsprechen
 * der v88-Ansicht. Die übergebene Liste wird nicht sortiert oder verändert.
 *
 * Keine Cloud-Zugriffe und keine Änderungen an der Fahrzeugübersicht.
 */
/**
 * Rendert die Fahrzeugübersicht im Dashboard unabhängig vom Zeitraumfilter.
 *
 * Verwendet wie in v88 alle Fahrzeuge und alle Einträge zur Zählung.
 * Die Schaltflächen setzen den Fahrzeugfilter, rendern das Dashboard erneut
 * und scrollen an den Seitenanfang. Es werden keine Daten verändert.
 *
 * Wichtig: Diese Funktion ist nicht an den Timeline- oder Monatsvergleich-
 * Container gekoppelt, damit die Fahrzeugübersicht stets sichtbar bleibt.
 */
/**
 * Rendert die Detailzusammenfassung des explizit ausgewählten Fahrzeugs.
 *
 * Die Übersicht bleibt bei "Alle Fahrzeuge" und "Ohne Fahrzeugzuordnung"
 * wie bisher leer. Der höchste Kilometerstand wird bewusst aus allen
 * gespeicherten Einträgen des Fahrzeugs ermittelt, während Anzahl, Kosten und
 * Mengen den aktuell gefilterten Zeitraum abbilden. Keine Datenmutation.
 */
/**
 * Aktualisiert die Orts-/Tankstellen-Auswahl für das Dashboard.
 *
 * Verwendet weiterhin alle gespeicherten Einträge als Optionsquelle,
 * behält eine gültige Auswahl bei und setzt eine veraltete Auswahl zurück.
 * Die zurückgegebene Select-Referenz wird anschließend für den Datensatzfilter
 * verwendet. Keine Änderung an den Einträgen oder an der Cloud.
 */
/**
 * Baut die vollständige Eintragshistorie unabhängig von Dashboard-Filtern auf.
 *
 * Behält die v88-Sortierung, die sieben Spalten, Bearbeiten-/Löschen-Aktionen
 * und die Seitengröße von 20 Einträgen bei. Keine Cloud-Aktion beim Rendern.
 * Änderungen an Datensätzen erfolgen ausschließlich über die vorhandenen
 * Benutzeraktionen und ihre bestehenden Speicher-/Bestätigungswege.
 */
/**
 * Überträgt einen vorhandenen Lade- oder Tankvorgang ins Bearbeitungsformular.
 *
 * Die Reihenfolge ist bewusst identisch mit v88: erst Art/Ortsanzeige,
 * anschließend Werte, Preisberechnung, Zusatzangaben und Formularnavigation.
 * Es wird hier weder gespeichert noch ein Cloud-Aufruf ausgeführt.
 */
/**
 * Löscht einen Eintrag ausschließlich nach Bestätigung des Benutzers.
 *
 * Entspricht dem bisherigen v88-Verhalten: Abbruch verändert keine Daten;
 * Bestätigung entfernt alle Einträge mit der angegebenen ID und ruft genau
 * einmal den bestehenden Speicherweg auf. Kein direktes Cloud-API.
 */
function deleteEntryWithConfirmation(id){
  if(confirm('Eintrag löschen?')){
    records=records.filter(r=>r.id!==id);
    save();
  }
}

function beginEntryEdit(x){
  const f=$('form');
  f.elements.type.value=x.type;
  updateEntryPlaceVisibility();
  f.elements.date.value=x.date;
  f.elements.time.value=recordTime(x.id);
  f.elements.amount.value=x.amount;
  f.elements.cost.value=x.cost;
  setUnitPriceFromTotal(f);
  f.elements.currency.value=x.currency;
  f.elements.km.value=x.km||'';
  f.elements.place.value=x.place||'';
  f.elements.managed_location.value='';
  f.elements.managed_provider.value='';
  f.elements.charge_kind.value=getChargingType(x.id);
  f.elements.charge_mode.value=getChargeMode(x.id);
  f.elements.vehicle_id.value=x.vehicle_id||'';
  f.dataset.editId=x.id;
  f.querySelector('button').textContent='Änderungen speichern';
  tab('add');
}

function renderEntryHistory(){
  // Full record history lives on the Ladungen / Tankungen page, independent of dashboard filters.
  const entries=$('entries');
  entries.replaceChildren();
  const table=document.createElement('table');
  table.className='entry-history-table';
  const head=document.createElement('thead'),heading=document.createElement('tr');
  for(const label of ['Datum / Zeit','Art','Fahrzeug','Menge','Kosten','Ort','Aktionen']){
  const th=document.createElement('th');th.scope='col';th.textContent=label;heading.append(th);
  }
  head.append(heading);table.append(head);
  const tbody=document.createElement('tbody');
  const ordered=records.slice().sort(compareRecordDateTime);
  if(!ordered.length){
  const tr=document.createElement('tr'),td=document.createElement('td');
  td.colSpan=7;td.textContent='Noch keine Einträge vorhanden.';tr.append(td);tbody.append(tr);
  }
  const makeEntryRow=x=>{
  const tr=document.createElement('tr');
  const vehicle=vehicles.find(v=>String(v.id)===String(x.vehicle_id));
  const values=[
  recordDateTime(x),
  x.type==='charge'?'⚡ Ladung':'⛽ Tankung',
  vehicle?vehicleName(vehicle):'Ohne Fahrzeug',
  String(x.amount)+(x.type==='charge'?' kWh':' l'),
  fmt(x.cost,x.currency),
  x.place||'–'
  ];
  for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}
  const actions=document.createElement('td');actions.className='entry-table-actions';
  const edit=document.createElement('button');edit.type='button';edit.textContent='Bearbeiten';
  edit.onclick=()=>beginEntryEdit(x);
  const remove=document.createElement('button');remove.type='button';remove.textContent='Löschen';
  remove.onclick=()=>deleteEntryWithConfirmation(x.id);
  actions.append(edit,remove);tr.append(actions);return tr;
  };
  table.append(tbody);window.paginateTable(entries,table,tbody,ordered,20,'entries',makeEntryRow);
}

function renderDashboardProviderFilter(){
  const provider=$('provider');
  const current=provider.value;
  const providers=[...new Set(records.map(x=>x.place||'Unbekannt'))].sort();
  provider.replaceChildren(
    new Option('Alle Orte / Tankstellen',''),
    ...providers.map(x=>new Option(x,x))
  );
  provider.value=providers.includes(current)?current:'';
  return provider;
}

function renderDashboardVehicleSummary(selectedVehicle,filtered,charges,fuel,cost){
  const summary=$('vehicle-summary');summary.replaceChildren();
  if(selectedVehicle&&selectedVehicle!=='none'){
  const v=vehicles.find(v=>String(v.id)===selectedVehicle);
  if(v){
  const details=document.createElement('p');details.textContent='🚗 '+vehicleName(v)+' · '+(v.drivetrain||'Antrieb nicht angegeben')+(v.model_year?' · Baujahr '+v.model_year:'')+(v.battery_kwh?' · Batterie '+v.battery_kwh+' kWh':'')+(v.tank_liters?' · Tank '+v.tank_liters+' l':'');
  const mileage=records.filter(r=>String(r.vehicle_id)===selectedVehicle&&Number(r.km)>0).map(r=>Number(r.km));
  const latest=document.createElement('p');latest.textContent='Ausgewählter Zeitraum: '+filtered.length+' Einträge · '+fmt(cost,settings.base)+' Kosten · '+charges.reduce((v,r)=>v+r.amount,0).toFixed(2)+' kWh · '+fuel.reduce((v,r)=>v+r.amount,0).toFixed(2)+' Liter. Höchster erfasster Kilometerstand: '+(mileage.length?Math.max(...mileage).toLocaleString('de-CH')+' km':'–')+'.';
  summary.append(details,latest);
  }
  }
}

function renderDashboardFleetOverview(){
  const fleet=$('fleet-overview');
  fleet.replaceChildren();
  vehicles.forEach(v=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='fleet-row';
    const count=records.filter(r=>String(r.vehicle_id)===String(v.id)).length;
    btn.textContent='🚘 '+vehicleName(v)+' · '+count+' Einträge';
    btn.onclick=()=>{
      $('vehicleFilter').value=String(v.id);
      render();
      window.scrollTo({top:0,behavior:'smooth'});
    };
    fleet.append(btn);
  });
  if(!vehicles.length)fleet.textContent='Bitte ein Fahrzeug anlegen.';
}

function renderDashboardTimeline(filtered){
  const recent=$('recent-entries');recent.replaceChildren();
  filtered.slice().sort(compareRecordDateTime).slice(0,8).forEach(r=>{
    const isCharge=r.type==='charge';
    const item=document.createElement('article');item.className='timeline-event '+(isCharge?'timeline-charge':'timeline-fuel');
    const marker=document.createElement('span');marker.className='timeline-marker';marker.textContent=isCharge?'⚡':'⛽';marker.setAttribute('aria-hidden','true');
    const content=document.createElement('div');content.className='timeline-content';
    const head=document.createElement('div');head.className='timeline-head';
    const title=document.createElement('strong');title.textContent=isCharge?'Ladung':'Tankung';
    const date=document.createElement('time');date.textContent=recordDateTime(r).replace(' ',' · ');
    head.append(title,date);
    const details=document.createElement('div');details.className='timeline-details';
    const amount=Number(r.amount)||0;
    details.textContent=amount.toLocaleString('de-CH',{maximumFractionDigits:2})+(isCharge?' kWh':' Liter')+' · '+fmt(conv(r),settings.base);
    const notes=document.createElement('small');notes.className='timeline-notes';
    const v=vehicles.find(v=>String(v.id)===String(r.vehicle_id));
    notes.textContent=[v?vehicleName(v):'',isCharge?getChargeMode(r.id):'',r.place||''].filter(Boolean).join(' · ');
    content.append(head,details);if(notes.textContent)content.append(notes);
    item.append(marker,content);recent.append(item);
    });
  if(!recent.children.length){const empty=document.createElement('p');empty.className='timeline-empty';empty.textContent='Noch keine Lade- oder Tankvorgänge im ausgewählten Zeitraum.';recent.append(empty);}
}

function renderMonthComparison(filtered){
  const compare=$('month-compare');
  compare.replaceChildren();
  const monthsMap=new Map();
  filtered.forEach(r=>{
    const month=r.date.slice(0,7);
    monthsMap.set(month,(monthsMap.get(month)||0)+conv(r));
  });
  const maxMonth=Math.max(1,...monthsMap.values());
  [...monthsMap].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,3).forEach(([month,value])=>{
    const line=document.createElement('div');line.className='compare-row';
    const label=document.createElement('span');label.textContent=month;
    const track=document.createElement('div');track.className='compare-track';
    const bar=document.createElement('div');bar.className='compare-fill';
    bar.style.width=(value/maxMonth*100)+'%';track.append(bar);
    const amount=document.createElement('strong');amount.textContent=fmt(value,settings.base);
    line.append(label,track,amount);compare.append(line);
  });
  if(!monthsMap.size)compare.textContent='Noch keine Monatsdaten.';
}

/**
 * Schreibt die vorbereiteten Dashboard-Kennzahlen in den bestehenden Container.
 *
 * Die HTML-Struktur bleibt exakt wie in v88. Dieser Helfer berechnet keine
 * Werte und verändert weder Einträge noch Filter oder Cloud-Zustand.
 */
/**
 * Aktualisiert die vier Dashboard-Diagramme in der bisherigen Reihenfolge.
 *
 * Übergibt ausschließlich bereits gefilterte Daten an die vorhandenen
 * AnalyticsCharts-Funktionen. Die Diagrammberechnung selbst bleibt unangetastet,
 * insbesondere die kritischen Verbrauchs- und Fahrzeugübersichten.
 */
function renderDashboardCharts(filtered,charges){
  const metric = $('trendMetric').value;
  AnalyticsCharts.trend($('trendchart'), filtered, metric, settings.base, conv);
  AnalyticsCharts.donut($('donutchart'), filtered, settings.base, conv);
  AnalyticsCharts.price($('pricechart'), filtered, settings.base, conv);
  AnalyticsCharts.providers($('providerchart'), charges);
}

function renderDashboardStatTiles(tiles){
  $('stats').innerHTML=tiles.map(x=>'<div class="tile"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join('');
}

function buildDashboardStatTiles({
  averageElectric, averageFuel, charges, fuel, cost, electric, petrol,
  distance, currency
}){
  return [
    ['⚡ Ø Preis pro kWh',averageElectric],
    ['⛽ Ø Preis pro Liter',averageFuel],
    ['⚡ Geladene Energie',charges.reduce((v,x)=>v+x.amount,0).toFixed(2)+' kWh'],
    ['⛽ Benzin',fuel.reduce((v,x)=>v+x.amount,0).toFixed(2)+' l'],
    ['💰 Gesamtkosten',fmt(cost,currency)],
    ['🔌 Stromkosten',fmt(electric,currency)],
    ['⛽ Benzinkosten',fmt(petrol,currency)],
    ['🚗 Kosten / 100 km',distance?fmt(cost/distance*100,currency):'–'],
    ['Ladevorgänge',charges.length],
    ['Tankungen',fuel.length]
  ];
}

/* Tabellen-Pagination: siehe pagination.js. */
/**
 * Rendert Dashboard, Tabellen und Auswertungen aus dem aktuellen Datenbestand.
 * Nebenwirkung: ersetzt DOM-Inhalte; speichert keine Datensätze und sendet keine API-Anfrage.
 * Die vollständige Eintragsliste wird erst beim Tabellenaufbau paginiert.
 */
function render(){
  updateLoginNotice();
  renderIntelligence();
  const now=new Date(),period=$('period').value;
  let y=now.getFullYear(),m=now.getMonth();
  $('customdates').classList.toggle('hide',period!=='custom');
  const provider=renderDashboardProviderFilter();
  let months=Number(period)||1;
  let chosenYear=Number($('chosenYear').value||y),chosenMonth=Number($('chosenMonth').value||m);
  let from,to;
  if(period==='custom'){
    from=new Date(chosenYear,chosenMonth,1);
    to=new Date(chosenYear,chosenMonth+1,1)
  }
  else{
    from=new Date(y,m-months+1,1);
    to=new Date(y,m+1,1)
  }
  let selectedVehicle=$('vehicleFilter').value;
  const active=vehicles.find(v=>String(v.id)===selectedVehicle);
  if(window.currentPhotoVehicle!==String(active?.id||'')){window.currentPhotoVehicle=String(active?.id||'');updateVehiclePhoto(active);}
  const title=active?vehicleName(active):(selectedVehicle==='none'?'Ohne Fahrzeugzuordnung':'Alle Fahrzeuge');
  $('brandVehicle').textContent=title;
  $('footerVehicle').textContent=title;
  $('topVehicle').textContent='⚡ '+title;
  $('heroVehicle').textContent=title;
  $('heroVehicleDetails').textContent=active?(active.drivetrain||'Fahrzeug')+' · Energie & Kosten':'Energie & Kosten';
  let all=records.filter(x=>{
    let d=new Date(x.date+'T12:00:00');return d>=from&&d<to&&(!selectedVehicle||(selectedVehicle==='none'?!x.vehicle_id:String(x.vehicle_id)===selectedVehicle))
  }),filtered=all.filter(x=>!provider.value||(x.place||'Unbekannt')===provider.value),charges=filtered.filter(x=>x.type==='charge'),fuel=filtered.filter(x=>x.type==='fuel'),km=filtered.map(x=>x.km).filter(x=>x>0),distance=km.length>1?Math.max(...km)-Math.min(...km):0,cost=filtered.reduce((v,x)=>v+conv(x),0),electric=charges.reduce((v,x)=>v+conv(x),0),petrol=fuel.reduce((v,x)=>v+conv(x),0);
  renderVehicleExpenses();
  renderDashboardVehicleSummary(selectedVehicle,filtered,charges,fuel,cost);
  // Die Werte beziehen sich auf die Kilometerstandsspanne im gewählten Zeitraum.
  // Geladene/getankte Mengen sind Näherungen, kein gemessener Antriebsverbrauch.
  const consumption=$('consumption-stats');
  if(consumption){
    const energyKwh=charges.reduce((total,r)=>total+Number(r.amount||0),0);
    const fuelLiters=fuel.reduce((total,r)=>total+Number(r.amount||0),0);
    const values=distance>0
      ? [
          ['⚡ Geladen / 100 km',(energyKwh*100/distance).toFixed(2)+' kWh'],
          ['⛽ Getankt / 100 km',(fuelLiters*100/distance).toFixed(2)+' l'],
          ['⚡ Stromkosten / 100 km',fmt(electric*100/distance,settings.base)],
          ['⛽ Benzinkosten / 100 km',fmt(petrol*100/distance,settings.base)],
          ['💰 Energiekosten / 100 km',fmt(cost*100/distance,settings.base)]
        ]
      : [];
    consumption.replaceChildren();
    for(const [label,value] of values){
      const tile=document.createElement('div');tile.className='tile';
      const small=document.createElement('small');small.textContent=label;
      const bold=document.createElement('b');bold.textContent=value;
      tile.append(small,bold);consumption.append(tile);
    }
    $('consumption-note').textContent=distance>0
      ? 'Näherungswerte: '+distance.toLocaleString('de-CH')+' km zwischen dem kleinsten und größten erfassten Kilometerstand im gewählten Zeitraum. Erfasste Ladungen und Tankungen müssen nicht vollständig zu dieser Fahrstrecke gehören. Die getrennten Kosten sind keine gemessenen Antriebsverbräuche.'
      : 'Für die Berechnung werden mindestens zwei unterschiedliche Kilometerstände im ausgewählten Zeitraum benötigt.';
  }
  renderConsumptionInsights(filtered,charges,fuel,distance);
  renderEnergyBalance(filtered);
  renderConsumptionTrend();
  renderCostComparison(charges,fuel);
  renderChargingTypes(charges);
  // Gewichteter Durchschnitt: Gesamtkosten geteilt durch Gesamtmenge, in der gewählten Auswertungswährung.
  const chargedKwh=charges.reduce((sum,r)=>sum+Number(r.amount||0),0);
  const fueledLiters=fuel.reduce((sum,r)=>sum+Number(r.amount||0),0);
  const averageElectric=chargedKwh>0?fmt(electric/chargedKwh,settings.base)+' / kWh':'–';
  const averageFuel=fueledLiters>0?fmt(petrol/fueledLiters,settings.base)+' / Liter':'–';
  const tiles=buildDashboardStatTiles({
    averageElectric, averageFuel, charges, fuel, cost, electric, petrol,
    distance, currency:settings.base
  });
  renderDashboardStatTiles(tiles);
  renderDashboardCharts(filtered,charges);
  renderDashboardTimeline(filtered);
  renderDashboardFleetOverview();
  renderMonthComparison(filtered);
  renderEntryHistory();
}
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }
  [c]))
}
for(let i=0;i<12;i++)$('chosenMonth').add(new Option(new Date(2026,i,1).toLocaleString('de-CH',{
  month:'long'
}),i));
$('chosenMonth').value=new Date().getMonth();
for(let i=new Date().getFullYear();i>=2020;i--)$('chosenYear').add(new Option(i,i));
$('form').elements.date.value=new Date().toISOString().slice(0,10);
$('form').elements.time.value=localClock();
// Neuer Lade-/Tank-Eintrag oder Aktualisierung eines vorhandenen Eintrags.

// v51: Preis pro Einheit ist ein Eingabehelfer; die Gesamtkosten bleiben das gespeicherte Cloud-Feld.
function setUnitPriceFromTotal(form){
 const amount=Number(form.elements.amount.value),cost=Number(form.elements.cost.value);
 form.elements.unit_price.value=amount>0&&Number.isFinite(cost)?String(Math.round(cost/amount*1000000)/1000000):'';
}
function installPriceCalculator(form){
 const amount=form.elements.amount,unit=form.elements.unit_price,cost=form.elements.cost;
 if(!amount||!unit||!cost)return;
 let mode='total';
 function calculate(){
  if(mode!=='unit'||unit.value==='')return;
  const qty=Number(amount.value),price=Number(unit.value);
  if(!Number.isFinite(qty)||!Number.isFinite(price)||qty<0||price<0)return;
  cost.value=(Math.round((qty*price+Number.EPSILON)*100)/100).toFixed(2);
 }
 unit.addEventListener('input',()=>{mode=unit.value===''?'total':'unit';calculate();});
 amount.addEventListener('input',calculate);
 cost.addEventListener('input',()=>{mode='total';});
 form.addEventListener('reset',()=>{mode='total';});
}

const managedChargingKey='phev-managed-charging-v1';
function chargingAccountKey(){try{return JSON.parse(localStorage.getItem('phev-session-v1')||'null')?.email||'local';}catch{return 'local';}}
function chargingData(){try{const d=JSON.parse(localStorage.getItem(managedChargingKey+'-'+chargingAccountKey())||'null');return {locations:Array.isArray(d?.locations)?d.locations:[],providers:Array.isArray(d?.providers)?d.providers:[]};}catch{return {locations:[],providers:[]};}}
function storeChargingData(d){localStorage.setItem(managedChargingKey+'-'+chargingAccountKey(),JSON.stringify(d));window.syncManagedCharging?.(d);renderChargingManagement();}
window.getManagedCharging=()=>chargingData();
window.setManagedCharging=d=>{if(d&&Array.isArray(d.locations)&&Array.isArray(d.providers)){localStorage.setItem(managedChargingKey+'-'+chargingAccountKey(),JSON.stringify(d));renderChargingManagement();}};
/**
 * Baut die Verwaltungstabellen für Ladeorte und Anbieter auf.
 * Je Liste werden fünf Datensätze angezeigt; Bearbeiten/Löschen referenziert
 * weiterhin das unveränderte Originalobjekt aus chargingData().
 */
/**
 * Füllt das Formular für einen bestehenden Ladeort oder Anbieter.
 * Übernimmt unverändert die v88-Felder und scrollt zum Bearbeitungsformular.
 */
function beginManagedChargingEdit(type,item){
  const form=$(type==='locations'?'managed-location-form':'managed-provider-form');
  form.dataset.editId=item.id;
  form.elements.name.value=item.name;
  form.elements.price.value=item.price??'';
  if(type==='locations')form.elements.kind.value=item.kind||'';
  form.querySelector('button[type=submit]').textContent='Änderungen speichern';
  form.scrollIntoView({behavior:'smooth',block:'start'});
}

/**
 * Löscht einen verwalteten Ladeort/Anbieter erst nach Bestätigung.
 * Bestehende Ladungen werden nicht verändert. Der vorhandene Speicherweg
 * übernimmt anschließend die weitere Synchronisierung.
 */
function deleteManagedChargingItem(data,type,id){
  if(!confirm('Eintrag aus der Verwaltung löschen? Bestehende Ladungen bleiben erhalten.'))return;
  data[type]=data[type].filter(x=>x.id!==id);
  storeChargingData(data);
}

function renderChargingManagement(){
 const data=chargingData();
 for(const [type,field,listId] of [['locations','managed_location','managed-locations-list'],['providers','managed_provider','managed-providers-list']]){
  const list=$(listId);if(!list)continue;list.replaceChildren();
  const table=document.createElement('table');table.className='management-table';
  const thead=document.createElement('thead'),heading=document.createElement('tr');
  for(const title of (type==='locations'?['Ladeort','Typ','Preis / kWh','Aktionen']:['Anbieter','Preis / kWh','Aktionen'])){const th=document.createElement('th');th.scope='col';th.textContent=title;heading.append(th);}
  thead.append(heading);table.append(thead);
  const tbody=document.createElement('tbody');
  if(!data[type].length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=type==='locations'?4:3;td.textContent=type==='locations'?'Noch keine Ladeorte angelegt.':'Noch keine Anbieter angelegt.';tr.append(td);tbody.append(tr);}
  const makeManagedRow=item=>{
   const row=document.createElement('tr');
   const values=type==='locations'?[item.name,item.kind||'–',item.price===null?'–':item.price+' '+settings.base]:[item.name,item.price===null?'–':item.price+' '+settings.base];
   for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
   const actions=document.createElement('td');actions.className='management-actions';
   const edit=document.createElement('button'),del=document.createElement('button');
   edit.textContent='Bearbeiten';edit.type='button';edit.onclick=()=>beginManagedChargingEdit(type,item);
   del.textContent='Löschen';del.type='button';del.onclick=()=>deleteManagedChargingItem(data,type,item.id);
   actions.append(edit,del);row.append(actions);return row;
  };
  table.append(tbody);window.paginateTable(list,table,tbody,data[type],5,'managed-'+type,makeManagedRow);
  document.querySelectorAll('form#form, form.quick-form[data-type="charge"]').forEach(form=>{const select=form.elements[field];if(!select)return;const previous=select.value;select.replaceChildren(new Option(type==='locations'?'Kein gespeicherter Ladeort':'Kein Anbieter',''),...data[type].map(x=>new Option(x.name,x.id)));select.value=data[type].some(x=>x.id===previous)?previous:'';});
 }
}
for(const [type,id] of [['locations','managed-location-form'],['providers','managed-provider-form']]){
 const form=$(id);if(!form)continue;
 form.addEventListener('reset',()=>{delete form.dataset.editId;form.querySelector('button[type=submit]').textContent='Speichern';});
 form.addEventListener('submit',e=>{e.preventDefault();const data=chargingData(),name=form.elements.name.value.trim(),priceRaw=form.elements.price.value,price=priceRaw===''?null:Number(priceRaw);if(!name||name.length>100||price!==null&&(!Number.isFinite(price)||price<0||price>1000))return alert('Name oder Preis ungültig.');const id=form.dataset.editId||crypto.randomUUID(),item={id,name,price,...(type==='locations'?{kind:form.elements.kind.value}:{})};const index=data[type].findIndex(x=>x.id===id);if(index>=0)data[type][index]=item;else data[type].push(item);form.reset();storeChargingData(data);$('managed-charging-status').textContent='Gespeichert. Cloud-Synchronisierung wird gestartet.';});
}
function managedPlace(form){
 if(form.elements.type?.value==='fuel')return String(form.elements.place?.value||'').trim();
 const data=chargingData(),loc=data.locations.find(x=>x.id===form.elements.managed_location?.value),provider=data.providers.find(x=>x.id===form.elements.managed_provider?.value);
 const note=String(form.elements.place?.value||'').trim();
 return [loc?.name||note,provider?.name?'Anbieter: '+provider.name:''].filter(Boolean).join(' · ');
}
function applyManagedPrice(form){
 const data=chargingData(),loc=data.locations.find(x=>x.id===form.elements.managed_location?.value),provider=data.providers.find(x=>x.id===form.elements.managed_provider?.value);
 if(loc&&form.elements.charge_kind)form.elements.charge_kind.value=loc.kind||'';
 const price=provider?.price??loc?.price;
 if(price!==null&&price!==undefined){const unit=form.elements.unit_price;unit.value=String(price);unit.dispatchEvent(new Event('input',{bubbles:true}));}
}
document.querySelectorAll('form#form, form.quick-form[data-type="charge"]').forEach(form=>{for(const field of ['managed_location','managed_provider'])form.elements[field]?.addEventListener('change',()=>applyManagedPrice(form));});
renderChargingManagement();
function updateEntryPlaceVisibility(){
 const form=$('form'),fuel=form.elements.type.value==='fuel';
 $('entry-place-label').hidden=!fuel;
 for(const name of ['managed_location','managed_provider','charge_mode','charge_kind']){
  const control=form.elements[name];
  if(control)control.closest('label').hidden=fuel;
 }
}
$('form').elements.type.addEventListener('change',updateEntryPlaceVisibility);
updateEntryPlaceVisibility();

installPriceCalculator($('form'));
document.querySelectorAll('.quick-form').forEach(installPriceCalculator);

$('form').onsubmit=e=>{
  e.preventDefault();
  let f=new FormData(e.target),x={
    id:crypto.randomUUID(),type:f.get('type'),date:f.get('date'),amount:n(f.get('amount')),cost:n(f.get('cost')),currency:f.get('currency'),km:f.get('km')?n(f.get('km')):null,place:managedPlace(e.target),vehicle_id:f.get('vehicle_id')?Number(f.get('vehicle_id')):null
  };
  const chargeKind=x.type==='charge'?String(f.get('charge_kind')||''):'';
  if(!x.vehicle_id||!vehicles.some(v=>String(v.id)===String(x.vehicle_id))){alert('Bitte zuerst ein Fahrzeug auswählen.');return;}
  if(!x.amount)return;
  if(e.target.dataset.editId){
    let i=records.findIndex(r=>r.id===e.target.dataset.editId);
    if(i>=0){
      x.id=records[i].id;
      records[i]=x
    }
    delete e.target.dataset.editId;
    e.target.querySelector('button').textContent='Speichern'
  }
  else records.push(x);
  x.time=String(f.get('time')||'');
  x.charge_mode=x.type==='charge'?String(f.get('charge_mode')||''):'';
  setRecordTime(x.id,x.time);
  setChargeMode(x.id,x.charge_mode);
  x.charge_kind=x.type==='charge'?chargeKind:'';
  setChargingType(x.id,x.charge_kind);
  save();
  e.target.reset();
  $('entryVehicle').value=vehicles.length===1?String(vehicles[0].id):'';
  $('provider').value='';
  $('vehicleFilter').value='';
  $('period').value='12';
  // Remain on the entry form after saving.
};
// Schnellformulare im Dashboard verwenden dieselbe zentrale Speicherlogik.
document.querySelectorAll('.quick-form').forEach(form=>{form.elements.date.value=new Date().toISOString().slice(0,10);form.elements.time.value=localClock();form.onsubmit=e=>{e.preventDefault();const f=e.currentTarget;const vid=Number(f.elements.vehicle_id.value);if(!vehicles.some(v=>Number(v.id)===vid)){alert('Bitte ein Fahrzeug auswählen.');return;}const record={id:crypto.randomUUID(),type:f.dataset.type,date:f.elements.date.value,amount:n(f.elements.amount.value),cost:n(f.elements.cost.value),currency:settings.base,km:null,place:managedPlace(f),vehicle_id:vid};if(record.amount<=0)return;record.time=f.elements.time.value;record.charge_mode=record.type==='charge'?f.elements.charge_mode.value:'';record.charge_kind=record.type==='charge'?f.elements.charge_kind.value:'';records.push(record);setRecordTime(record.id,record.time);if(record.type==='charge'){setChargingType(record.id,f.elements.charge_kind.value);setChargeMode(record.id,f.elements.charge_mode.value);}save();f.reset();f.elements.date.value=new Date().toISOString().slice(0,10);f.elements.time.value=localClock();f.elements.vehicle_id.value=String(vid);alert('Eintrag gespeichert.');};});
$('base').value=settings.base;
$('rate').value=settings.rate;
function settingsSave(){
  let r=n($('rate').value);
  if(r<=0)return alert('Ungültiger Kurs');
  settings={
    base:$('base').value,rate:r
  };
  localStorage.setItem('phev-settings-1',JSON.stringify(settings));
  window.scheduleCloudPreferences?.();
  render();
  alert('Gespeichert')
}

// Cloud preferences are applied only after a successful authenticated fetch.

/* Operating costs are stored per account in existing cloud preferences, without database migrations. */
let vehicleExpenses=[];
function expenseCurrency(amount,currency){return window.PhevTco.convert(amount,currency,settings);}
function applyVehicleExpenses(value){if(!Array.isArray(value))return;vehicleExpenses=value.filter(x=>x&&typeof x.id==='string'&&Number.isFinite(Number(x.amount))&&Number(x.amount)>0);renderVehicleExpenses();renderIntelligence();}
window.setVehicleExpenses=applyVehicleExpenses;
window.getVehicleExpenses=()=>[...vehicleExpenses];
/**
 * Stellt zusätzliche Fahrzeugausgaben und die daraus abgeleitete TCO-Näherung dar.
 * Beträge werden in die eingestellte Basiswährung umgerechnet; Kosten/km basieren
 * nur auf vorhandenen Kilometerständen und sind keine vollständige Abschreibung.
 */
function renderVehicleExpenses(){
 const form=$('expense-form'),list=$('expense-list'),summary=$('expense-summary');if(!form||!list||!summary)return;
 const select=form.elements.vehicle_id,previous=select.value;
 select.replaceChildren(new Option('Fahrzeug wählen',''),...vehicles.map(v=>new Option(vehicleName(v),String(v.id))));
 if(vehicles.some(v=>String(v.id)===previous))select.value=previous;
 else if(vehicles.length===1)select.value=String(vehicles[0].id);
 list.replaceChildren();summary.replaceChildren();
 const selected=select.value;
 // Nur die reine Berechnung wurde ausgelagert; DOM und Cloud-Speicherung bleiben hier.
 const {expenses,extra,running,distance}=window.PhevTco.summarize(
  vehicleExpenses,records,selected,settings,conv
 );
 const caption=document.createElement('p');caption.className='expense-total';caption.textContent='Gesamtkosten aller erfassten Zeiträume: '+fmt(extra+running,settings.base);
 const detail=document.createElement('small');detail.textContent='Strom & Benzin: '+fmt(running,settings.base)+' · Weitere Ausgaben: '+fmt(extra,settings.base)+(distance>0?' · '+fmt((extra+running)/distance,settings.base)+' / km (Näherung)':' · Für Kosten/km fehlen Kilometerstände.');
 summary.append(caption,detail);
 /**
  * Wartungserinnerungen verwenden vorhandene SQL-Ausgaben und deren
  * nächste Fälligkeit. Sie erzeugen selbst keine zusätzlichen Kosten.
  */
 const reminders=$('expense-reminders');
 if(reminders){
  reminders.replaceChildren();
  const due=window.PhevTco.reminders(vehicleExpenses,selected);
  if(due.length){
   const heading=document.createElement('h4');heading.textContent='Anstehende Wartungen (30 Tage)';
   reminders.append(heading);
   for(const item of due){
    const row=document.createElement('p');row.className='insight-item';
    const vehicle=vehicles.find(v=>String(v.id)===String(item.vehicle_id));
    const label=vehicle?vehicleName(vehicle)+' · ':'';
    row.textContent=label+item.category+' · '+item.next_service_date+' · '+(item.days<0?'Seit '+Math.abs(item.days)+' Tagen überfällig':item.days===0?'Heute fällig':'In '+item.days+' Tagen fällig');
    reminders.append(row);
   }
  }
 }
 
 /**
  * Die Kategorieübersicht verwendet dieselbe Fahrzeugauswahl und dieselbe
  * Währungsumrechnung wie die Gesamtsumme. Sie enthält alle erfassten
  * Zeiträume und vermischt keine gefilterten Dashboard-Monatswerte damit.
  */
 const breakdown=window.PhevTco.breakdown(vehicleExpenses,records,selected,settings,conv);
 if(breakdown.length){
  const heading=document.createElement('h4');heading.textContent='Kosten nach Kategorie';
  const breakdownList=document.createElement('div');breakdownList.className='expense-breakdown';
  const total=breakdown.reduce((sum,item)=>sum+item.amount,0);
  for(const item of breakdown){
   const row=document.createElement('div');row.className='expense-row';
   const name=document.createElement('span');name.textContent=item.category;
   const value=document.createElement('strong');
   value.textContent=fmt(item.amount,settings.base)+' · '+(total>0?(item.amount/total*100).toFixed(1):'0.0')+' %';
   row.append(name,value);breakdownList.append(row);
  }
  summary.append(heading,breakdownList);
 }
 /**
  * Wartungskosten als sortierte, paginierte Tabelle.
  * Die reine DOM-Seitennavigation verändert weder die SQL-Datensätze noch
  * die Summenberechnung. Beide Navigationsleisten bleiben synchron.
  */
 const table=document.createElement('table');
 table.className='expense-table';
 table.setAttribute('aria-label','Wartungs- und Fahrzeugkosten');
 const thead=document.createElement('thead');
 const headRow=document.createElement('tr');
 for(const heading of ['Datum','Kategorie','Betrag','Kilometerstand','Nächste Wartung','Notiz','Aktionen']){
  const th=document.createElement('th');th.scope='col';th.textContent=heading;headRow.append(th);
 }
 thead.append(headRow);table.append(thead);
 const tbody=document.createElement('tbody');table.append(tbody);
 const sorted=[...expenses].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.id).localeCompare(String(a.id)));
 const makeExpenseRow=x=>{
  const row=document.createElement('tr');
  const fields=[
   x.date||'–',x.category||'–',fmt(Number(x.amount),x.currency),
   x.mileage_km===null||x.mileage_km===undefined||x.mileage_km===''?'–':Number(x.mileage_km).toLocaleString('de-CH')+' km',
   x.next_service_date||'–',x.note||'–'
  ];
  for(const value of fields){
   const cell=document.createElement('td');cell.textContent=value;row.append(cell);
  }
  const actionCell=document.createElement('td');actionCell.className='expense-table-actions';
const edit=document.createElement('button');edit.type='button';edit.textContent='Bearbeiten';
    edit.onclick=()=>{
     form.dataset.editId=x.id;
     form.elements.vehicle_id.value=String(x.vehicle_id);
     form.elements.category.value=x.category;
     form.elements.date.value=x.date;
     form.elements.amount.value=x.amount;
     form.elements.currency.value=x.currency;
     form.elements.note.value=x.note||'';
     form.elements.mileage_km.value=x.mileage_km??'';
     form.elements.next_service_date.value=x.next_service_date||'';
     form.querySelector('button[type=submit]').textContent='Änderungen speichern';
     form.scrollIntoView({behavior:'smooth',block:'start'});
    };
    const remove=document.createElement('button');remove.type='button';remove.textContent='Löschen';remove.setAttribute('aria-label','Ausgabe vom '+x.date+' löschen');
    remove.onclick=async()=>{if(!confirm('Diese Ausgabe wirklich löschen?'))return;remove.disabled=true;try{await window.deleteVehicleExpense(x.id);$('expense-status').textContent='Ausgabe gelöscht.';}catch(e){$('expense-status').textContent='Löschen fehlgeschlagen: '+e.message;remove.disabled=false;}};
  
  actionCell.append(edit,remove);row.append(actionCell);
  return row;
 };
 window.paginateTable(list,table,tbody,sorted,10,'vehicle-expenses',makeExpenseRow);
}
$('expense-form').elements.vehicle_id.addEventListener('change',renderVehicleExpenses);
$('expense-form').onsubmit=async e=>{
 e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type=submit]'),el=form.elements;
 if(!el.vehicle_id.value)return $('expense-status').textContent='Bitte ein Fahrzeug wählen.';
 const amount=Number(el.amount.value);if(!Number.isFinite(amount)||amount<=0)return;
 const item={
  id:form.dataset.editId||(crypto.randomUUID?.()||String(Date.now())+'-'+Math.random()),
  vehicle_id:el.vehicle_id.value,category:el.category.value,date:el.date.value,
  amount,currency:el.currency.value,note:el.note.value.trim(),
  mileage_km:el.mileage_km.value===''?null:Number(el.mileage_km.value),
  next_service_date:el.next_service_date.value||null
 };
 button.disabled=true;$('expense-status').textContent='Ausgabe wird gespeichert …';
 try{await window.saveVehicleExpense(item);const v=el.vehicle_id.value;form.reset();delete form.dataset.editId;form.querySelector('button[type=submit]').textContent='Ausgabe speichern';el.vehicle_id.value=v;$('expense-status').textContent='Ausgabe sicher in der Cloud gespeichert.';}
 catch(error){$('expense-status').textContent='Speichern fehlgeschlagen: '+error.message;}
 finally{button.disabled=false;}
};

$('expense-form').addEventListener('reset',e=>{delete e.currentTarget.dataset.editId;e.currentTarget.querySelector('button[type=submit]').textContent='Ausgabe speichern';});

window.collectCloudPreferences=function(){
 const photos={};
 for(const vehicle of vehicles){const url=localStorage.getItem('phev-photo-'+vehicle.id);if(url)photos[String(vehicle.id)]=url;}
 return {photos,fuel_energy_factor:fuelEnergyFactor(),cost_comparison:getCostComparison(),base:settings.base,rate:settings.rate,dashboard_layout:window.getDashboardLayoutPreferences?.()};
};
window.applyCloudPreferences=function(prefs){
 if(!prefs||typeof prefs!=='object')return;
 window.applyDashboardLayoutPreferences?.(prefs.dashboard_layout);
 
 if(prefs.photos&&typeof prefs.photos==='object'){
  for(const vehicle of vehicles){
   const id=String(vehicle.id),url=prefs.photos[id];
   if(typeof url==='string'&&/^https:\/\/[^\s]+$/i.test(url))localStorage.setItem('phev-photo-'+id,url);
  }
 }
 const factor=Number(prefs.fuel_energy_factor);
 if(factor>=1&&factor<=20)localStorage.setItem(fuelEnergyKey,String(factor));
 const comp=prefs.cost_comparison;
 if(comp&&Number(comp.electric)>0&&Number(comp.fuel)>0)localStorage.setItem(costComparisonKey,JSON.stringify(comp));
 if(['CHF','EUR'].includes(prefs.base)&&Number(prefs.rate)>0){
  settings={base:prefs.base,rate:Number(prefs.rate)};
  localStorage.setItem('phev-settings-1',JSON.stringify(settings));
  $('base').value=settings.base;$('rate').value=settings.rate;
 }
 $('fuel-energy-factor').value=fuelEnergyFactor();
 const values=getCostComparison();$('comparison-electric').value=values.electric;$('comparison-fuel').value=values.fuel;
 render();
};
window.showCloudRecords=function(items){cloudView=true;records=items.map(x=>({...x,time:String(x.time||'').slice(0,5),charge_mode:x.charge_mode||'',charge_kind:x.charge_kind||'',amount:Number(x.amount),cost:Number(x.cost),km:x.km===null?null:Number(x.km)}));scheduleAutomaticBackup();render();updateBulkCount();};
window.showLocalRecords=function(){cloudView=false;vehicles=[];records=JSON.parse(localStorage.getItem(key)||'[]');refreshVehicles();render();};
// CSV-Export mit neutralisierten Tabellenformeln (Schutz vor CSV-Injection).
function exportCSV(){
 const columns=['id','type','date','amount','cost','currency','km','place','vehicle_id'];
 const cell=value=>{
  let s=String(value??'');
  if(/^[=+@\-\t\r]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 };
 const lines=[columns.join(';'),...records.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r=>columns.map(k=>cell(r[k])).join(';'))];
 const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='phev-export-'+new Date().toISOString().slice(0,10)+'.csv';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function backup(){
  let b=new Blob([JSON.stringify({
    records,settings,vehicles
  },null,2)],{
    type:'application/json'
  }),a=document.createElement('a');
  a.href=URL.createObjectURL(b);
  a.download='phev-backup.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}
$('restore').onchange=async e=>{
  try{
    let x=JSON.parse(await e.target.files[0].text());
    if(!Array.isArray(x.records))throw Error();
    if(confirm('Bestehende Einträge ersetzen?')){
      records=x.records;
      settings=x.settings||settings;
      save();
      tab('home')
    }
  }
  catch{
    alert('Ungültige Sicherung')
  }
};
/* CSV-Parser: csv-import-utils.js; Importdialog und Speicherung bleiben hier. */
$('file').onchange=async e=>{
  let rows=csvRows(await e.target.files[0].text());
  let h=(rows.shift()||[]).map(x=>x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')),find=(...terms)=>h.findIndex(x=>terms.some(t=>x.includes(t))),d=find('datum','date','start'),a=h.indexOf('energiekwh')>=0?h.indexOf('energiekwh'):h.indexOf('energykwh')>=0?h.indexOf('energykwh'):find('charged','energy'),c=find('gesamtbetragingewahlterwahrung','totalcost','totalprice','gesamtkosten','cost','kosten'),p=find('ort','location','station','place','ladeort','provider','anbieter'),w=h.indexOf('wahrung')>=0?h.indexOf('wahrung'):find('currency'),k=find('odometer','kilometerstand');
  if(d<0||a<0||c<0){
    $('preview').textContent='Spalten nicht erkannt: '+h.join(', ');
    return
  }
  let seen=new Set();
  pending=[];
  rows.forEach(r=>{
    let x={
      id:crypto.randomUUID(),type:'charge',date:date(r[d]),amount:n(r[a]),cost:n(r[c]),currency:w>=0&&/EUR/i.test(r[w])?'EUR':'CHF',place:p>=0?r[p]:'ChargeLog',km:k>=0?n(r[k]):null
    };if(!x.date||x.amount<=0||x.cost<0||seen.has(id(x)))return;seen.add(id(x));pending.push(x)
  });
  $('preview').textContent=pending.length+' CSV-Ladevorgänge erkannt (bereits vorhandene werden anhand von Datum, Ort und Kosten aktualisiert; CSV-Zeilen: '+rows.length+', Datum-Spalte: '+d+', Energie-Spalte: '+a+', Kosten-Spalte: '+c+'). Vorschau: '+pending.slice(0,8).map(x=>x.date+' / '+x.amount+' kWh / '+fmt(x.cost,x.currency)).join(' | ')+'. Prüfe insbesondere Kosten und Währung.';
  $('import').classList.toggle('hide',!pending.length)
};
$('import').onclick=()=>{
  const target=$('entryVehicle').value;
  if(!target||!vehicles.some(v=>String(v.id)===String(target))){alert('Bitte vor dem CSV-Import unter Eintragen ein Fahrzeug auswählen.');return;}
  let updated=0,added=0;
  pending.forEach(x=>{x.vehicle_id=Number(target);
    let i=records.findIndex(r=>r.type==='charge'&&String(r.vehicle_id||'')===String(x.vehicle_id||'')&&r.date===x.date&&r.place.trim().toLowerCase()===x.place.trim().toLowerCase()&&Math.abs(r.cost-x.cost)<0.011&&r.currency===x.currency);if(i>=0){
      records[i]={
        ...records[i],amount:x.amount
      };updated++
    }
    else{
      records.push(x);added++
    }
  });
  pending=[];
  save();
  alert(added+' neu importiert, '+updated+' bestehende Einträge aktualisiert.');
  tab('home')
};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{
});
$('trendMetric').addEventListener('change', render);
tab(restoredPage());


/* Energiegehalt von Benzin: chemische Energie, keine nutzbare Radenergie. */

function fuelEnergyFactor(){const v=Number(localStorage.getItem(fuelEnergyKey));return v>=1&&v<=20?v:8.8;}
function saveFuelEnergyFactor(){
 const v=Number($('fuel-energy-factor').value);
 if(!Number.isFinite(v)||v<1||v>20){alert('Bitte einen Faktor zwischen 1 und 20 eingeben.');return;}
 localStorage.setItem(fuelEnergyKey,String(v));window.scheduleCloudPreferences?.();render();alert('Umrechnungsfaktor gespeichert.');
}
function energyBalance(items){
 const km=items.map(r=>Number(r.km)).filter(v=>v>0);
 const distance=km.length>1?Math.max(...km)-Math.min(...km):0;
 const electric=items.filter(r=>r.type==='charge').reduce((a,r)=>a+Number(r.amount||0),0);
 const liters=items.filter(r=>r.type==='fuel').reduce((a,r)=>a+Number(r.amount||0),0);
 const fuelKwh=liters*fuelEnergyFactor();
 return {distance,electric,liters,fuelKwh,total:electric+fuelKwh};
}

/* 12-Monats-Trend: nur Monate mit mindestens zwei Kilometerständen vergleichen. */
function consumptionTrendRows(vehicleId,year,month){
 const result=[];
 for(let offset=11;offset>=0;offset--){
  const d=new Date(year,month-offset,1),key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  const items=records.filter(r=>String(r.date||'').startsWith(key)&&(!vehicleId||String(r.vehicle_id)===vehicleId));
  const b=energyBalance(items);
  result.push({key,label:String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getFullYear()).slice(2),valid:b.distance>0&&items.length>0,electric:b.distance?b.electric*100/b.distance:0,fuel:b.distance?b.fuelKwh*100/b.distance:0,total:b.distance?b.total*100/b.distance:0,cost:b.distance?items.reduce((n,r)=>n+conv(r),0)*100/b.distance:0});
 }
 return result;
}
function renderConsumptionTrend(){
 const target=$('consumption-trend');if(!target)return;
 const now=new Date(),period=$('period').value;
 const year=period==='custom'?Number($('chosenYear').value||now.getFullYear()):now.getFullYear();
 const month=period==='custom'?Number($('chosenMonth').value||now.getMonth()):now.getMonth();
 const rows=consumptionTrendRows($('vehicleFilter').value,year,month);
 target.replaceChildren();
 const valid=rows.filter(r=>r.valid);
 if(!valid.length){target.textContent='Noch keine Monate mit ausreichenden Kilometerständen für eine Verbrauchskurve vorhanden.';return;}
 const legend=document.createElement('p');legend.textContent='🔵 Strom · 🟠 Benzin (umgerechnet) · Gesamtenergie in kWh/100 km';target.append(legend);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 600 240');svg.setAttribute('role','img');svg.setAttribute('aria-label','Kombinierte Energieverbrauchsentwicklung der letzten zwölf Monate');svg.style.cssText='width:100%;height:auto;max-height:290px';
 const max=Math.max(1,...valid.map(r=>r.total))*1.12;
 const make=(tag,attrs)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));svg.append(el);return el;};
 for(let i=0;i<=4;i++){const y=195-i*43;make('line',{x1:42,y1:y,x2:585,y2:y,stroke:'#dce5ef'});const t=make('text',{x:2,y:y+4,'font-size':11,fill:'#52657d'});t.textContent=(max*i/4).toFixed(0);}
 rows.forEach((r,i)=>{const x=48+i*48;const t=make('text',{x,y:218,'font-size':10,'text-anchor':'middle',fill:'#52657d'});t.textContent=r.label;});
 const draw=(key,color)=>{let segment=[];const flush=()=>{if(segment.length>1)make('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});segment=[];};rows.forEach((r,i)=>{if(!r.valid){flush();return;}const x=48+i*48,y=195-r[key]/max*172;segment.push(x+','+y.toFixed(1));make('circle',{cx:x,cy:y,r:3.5,fill:color});});flush();};
 draw('electric','#168fbe');draw('fuel','#e39b38');draw('total','#283e63');
 target.append(svg);
 const table=document.createElement('div');table.style.cssText='overflow-x:auto';const inner=document.createElement('table');inner.style.cssText='width:100%;font-size:12px;border-collapse:collapse';const head=document.createElement('tr');for(const h of ['Monat','Strom','Benzin','Gesamt','Kosten']){const th=document.createElement('th');th.textContent=h;th.style.padding='6px';head.append(th);}inner.append(head);
 for(const r of rows){const tr=document.createElement('tr');for(const value of [r.label,r.valid?r.electric.toFixed(1):'–',r.valid?r.fuel.toFixed(1):'–',r.valid?r.total.toFixed(1):'–',r.valid?r.cost.toFixed(2)+' '+settings.base:'–']){const td=document.createElement('td');td.textContent=value;td.style.cssText='padding:6px;border-top:1px solid #e2eaf3;text-align:center';tr.append(td);}inner.append(tr);}table.append(inner);target.append(table);
}

function renderEnergyBalance(items){
 const target=$('energy-balance');if(!target)return;
 const b=energyBalance(items);
 if(!b.distance){target.textContent='Für kWh/100 km werden mindestens zwei unterschiedliche Kilometerstände im Zeitraum benötigt.';$('energy-balance-note').textContent='Erfasste Lade- und Tankmengen sind Näherungswerte.';return;}
 const f=v=>(100*v/b.distance).toFixed(2);
 target.replaceChildren();
 const p=document.createElement('p');p.textContent='⚡ Strom: '+f(b.electric)+' kWh/100 km · ⛽ Benzin: '+f(b.fuelKwh)+' kWh/100 km · Gesamt: '+f(b.total)+' kWh/100 km';target.append(p);
 const bar=document.createElement('div');bar.style.cssText='display:flex;height:16px;border-radius:8px;overflow:hidden;background:#e5e7eb';
 const e=document.createElement('div');e.style.cssText='background:#1795be;width:'+(b.total?b.electric/b.total*100:0)+'%';
 const g=document.createElement('div');g.style.cssText='background:#e9a145;flex:1';bar.append(e,g);target.append(bar);
 $('energy-balance-note').textContent='Benzin: '+b.liters.toFixed(2)+' l × '+fuelEnergyFactor().toFixed(1)+' kWh/l = '+b.fuelKwh.toFixed(2)+' kWh. Berechnet aus '+b.distance.toLocaleString('de-CH')+' km Kilometerstandsspanne; keine Messung des tatsächlichen Fahrverbrauchs.';
}
try{$('fuel-energy-factor').value=fuelEnergyFactor();}catch(error){console.warn(error);}

/* Modellvergleich: keine Änderung der gespeicherten Lade- oder Tankdatensätze. */

function getCostComparison(){
 try{
  const values=JSON.parse(localStorage.getItem(costComparisonKey)||'{}');
  return {electric:Number(values.electric)>0?Number(values.electric):20,fuel:Number(values.fuel)>0?Number(values.fuel):7};
 }catch{return {electric:20,fuel:7};}
}
function saveCostComparison(){
 const electric=Number($('comparison-electric').value),fuel=Number($('comparison-fuel').value);
 if(!Number.isFinite(electric)||!Number.isFinite(fuel)||electric<=0||fuel<=0||electric>200||fuel>100){
  alert('Bitte gültige Verbrauchswerte eingeben.');return;
 }
 localStorage.setItem(costComparisonKey,JSON.stringify({electric,fuel}));
 window.scheduleCloudPreferences?.();
 render();
 alert('Vergleichswerte gespeichert.');
}
function renderCostComparison(charges,fuel){
 const target=$('cost-comparison-result');
 if(!target)return;
 const chargeKwh=charges.reduce((total,r)=>total+Number(r.amount||0),0);
 const fuelLiters=fuel.reduce((total,r)=>total+Number(r.amount||0),0);
 if(!chargeKwh||!fuelLiters){
  target.textContent='Für den Vergleich werden mindestens eine Stromladung und eine Tankung im gewählten Zeitraum benötigt.';
  return;
 }
 const assumptions=getCostComparison();
 const electricity=charges.reduce((total,r)=>total+conv(r),0)/chargeKwh*assumptions.electric;
 const petrol=fuel.reduce((total,r)=>total+conv(r),0)/fuelLiters*assumptions.fuel;
 const difference=petrol-electricity;
 target.textContent='Strom: '+fmt(electricity,settings.base)+'/100 km · Benzin: '+fmt(petrol,settings.base)+'/100 km · '+(difference>=0?'Strom günstiger um ':'Benzin günstiger um ')+fmt(Math.abs(difference),settings.base)+'/100 km.';
}
try{
 const comparison=getCostComparison();
 $('comparison-electric').value=comparison.electric;
 $('comparison-fuel').value=comparison.fuel;
}catch(error){console.warn('Vergleichseinstellungen nicht geladen',error);}

/* Ladearten: zusätzliche lokale Metadaten, unabhängig vom Cloud-Datensatz. */
function chargingTypeStorageKey(){
 let email='local';
 try{email=JSON.parse(localStorage.getItem('phev-session-v1')||'null')?.email||'local';}catch{}
 return 'phev-charge-types-'+email;
}
function chargingTypes(){
 try{return JSON.parse(localStorage.getItem(chargingTypeStorageKey())||'{}')||{};}catch{return {};}
}
function getChargingType(id){const record=records.find(r=>r.id===id);return record?.charge_kind||chargingTypes()[id]||'';}
function setChargingType(id,type){
 const allowed=['Zuhause','Öffentlich','Arbeitsplatz','Kostenlos'];
 const data=chargingTypes();
 if(allowed.includes(type))data[id]=type;else delete data[id];
 localStorage.setItem(chargingTypeStorageKey(),JSON.stringify(data));
}
function renderChargingTypes(charges){
 const target=$('charging-types-report');
 if(!target)return;
 const groups=new Map();
 for(const record of charges){
  const type=getChargingType(record.id)||'Nicht angegeben';
  const value=groups.get(type)||{count:0,energy:0,cost:0};
  value.count++;
  value.energy+=Number(record.amount||0);
  value.cost+=conv(record);
  groups.set(type,value);
 }
 target.replaceChildren();
 if(!groups.size){target.textContent='Noch keine Ladungen im gewählten Zeitraum.';return;}
 for(const [type,data] of groups){
  const row=document.createElement('p');
  row.textContent=type+': '+data.count+' Ladungen · '+data.energy.toFixed(1)+' kWh · '+fmt(data.cost,settings.base);
  target.append(row);
 }
}



/* Eigenständiger PDF-Export ohne externe Bibliothek oder Serverübertragung. */

/* Druckfertiger A4-Bericht: Vektordiagramme, Kennzahlen und paginierte Tabellen. */
/**
 * Erstellt Monats- oder Jahresberichte vollständig im Browser mit jsPDF.
 * Datenbasis: erfasste Ladungen/Tankungen und zusätzliche Fahrzeugausgaben.
 * Keine serverseitige PDF-Erstellung und keine Änderung der Quelldaten.
 * @param {'month'|'year'} mode - Berichtszeitraum.
 */
function exportPdfReport(mode){
 const year=Number($('report-year').value),month=$('report-month').value,vehicleId=$('report-vehicle').value;
 if(!Number.isInteger(year)||year<2020||year>2100){alert('Bitte gültiges Jahr auswählen.');return;}
 const period=String(year)+(mode==='month'?'-'+month:'');
 const data=records.filter(r=>String(r.date||'').startsWith(period)&&(!vehicleId||String(r.vehicle_id)===vehicleId));
 const chosen=vehicles.find(v=>String(v.id)===vehicleId);
 const title=mode==='month'?'Monatsbericht '+month+'.'+year:'Jahresbericht '+year;
 if(!window.jspdf?.jsPDF){alert('Die PDF-Bibliothek ist noch nicht geladen. Bitte Internetverbindung prüfen und die Seite neu öffnen.');return;}
 const pdf=new PhevPdfReport(title,chosen?vehicleName(chosen):'Alle Fahrzeuge',settings.base);
 const charges=data.filter(r=>r.type==='charge'),fuel=data.filter(r=>r.type==='fuel');
 const sum=(arr,fn)=>arr.reduce((n,r)=>n+fn(r),0);
 const total=sum(data,conv),energy=sum(charges,r=>Number(r.amount||0)),liters=sum(fuel,r=>Number(r.amount||0));
 const extraExpenses=vehicleExpenses.filter(x=>String(x.date||'').startsWith(period)&&(!vehicleId||String(x.vehicle_id)===vehicleId));
 const extras=extraExpenses.reduce((n,x)=>n+expenseCurrency(Number(x.amount),x.currency),0);
 const combined=total+extras;
 // Für mehrere Fahrzeuge Kilometerstandsspannen getrennt ermitteln.
 // Eine gemeinsame Min/Max-Spanne würde verschiedene Tachostände vermischen.
 const vehicleGroups=new Map();
 for(const row of data){
  const key=String(row.vehicle_id??'');
  const km=Number(row.km);
  if(!Number.isFinite(km)||km<=0)continue;
  if(!vehicleGroups.has(key))vehicleGroups.set(key,[]);
  vehicleGroups.get(key).push(km);
 }
 const spans=[...vehicleGroups.values()].map(values=>values.length>=2?Math.max(...values)-Math.min(...values):0);
 const kmSpan=spans.reduce((a,b)=>a+b,0);
 const providers=new Map();
 for(const row of charges){const name=String(row.place||'Unbekannt');const p=providers.get(name)||{name,energy:0,cost:0,count:0};p.energy+=Number(row.amount||0);p.cost+=conv(row);p.count++;providers.set(name,p);}
 const ranked=[...providers.values()].sort((a,b)=>b.energy-a.energy);
 const best=charges.filter(x=>Number(x.amount)>0).slice().sort((a,b)=>conv(a)/Number(a.amount)-conv(b)/Number(b.amount))[0];
 pdf.coverOverview({period:mode==='month'?month+'.'+year:String(year),total:combined,energy,liters,chargeCost:sum(charges,conv),fuelCost:sum(fuel,conv),extras,kmSpan,charges,providers:ranked,best});
 pdf.heading('Fahrzeugkosten im Berichtszeitraum');
 pdf.metrics([['Strom und Benzin',total.toFixed(2)+' '+settings.base],['Weitere Ausgaben',extras.toFixed(2)+' '+settings.base],['Kosten gesamt',combined.toFixed(2)+' '+settings.base],['Kosten / km',kmSpan>0?(combined/kmSpan).toFixed(2)+' '+settings.base:'–']]);
 pdf.note('Kosten/km: Näherung aus Kilometerstandsspanne. Keine Abschreibung oder nicht erfassten Kosten enthalten.');
 if(extraExpenses.length){
  pdf.heading('Weitere Fahrzeugausgaben');
  pdf.table(['Datum','Kategorie','Fahrzeug','Kosten '+settings.base],extraExpenses.slice().sort((x,y)=>x.date.localeCompare(y.date)).map(x=>{const v=vehicles.find(v=>String(v.id)===String(x.vehicle_id));return [x.date,x.category,v?vehicleName(v):'–',expenseCurrency(Number(x.amount),x.currency).toFixed(2)];}),[95,140,165,95]);
 }
 const balance=energyBalance(data);
 pdf.heading('Kombinierte Energiebilanz');
 if(balance.distance){pdf.metrics([['Strom / 100 km',(balance.electric*100/balance.distance).toFixed(1)+' kWh'],['Benzin / 100 km',(balance.fuelKwh*100/balance.distance).toFixed(1)+' kWh'],['Gesamt / 100 km',(balance.total*100/balance.distance).toFixed(1)+' kWh'],['Benzinfaktor',fuelEnergyFactor().toFixed(1)+' kWh/l']]);}else{pdf.note('kWh/100 km: mindestens zwei unterschiedliche Kilometerstände nötig.');}
 pdf.note('Chemischer Benzin-Energiegehalt; Verbrauch aus erfassten Mengen geschätzt.');
 pdf.heading('Energieanteile');
 pdf.donut([balance.electric,balance.fuelKwh],['Strom','Benzin'],'kWh');
 pdf.heading('Kostenverteilung');
 pdf.donut([sum(charges,conv),sum(fuel,conv),extras],['Strom','Benzin','Weitere Ausgaben']);
 pdf.heading(mode==='year'?'Kosten nach Monat':'Kosten nach Tag');
 const buckets=mode==='year'?Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')):[...new Set([...data.map(r=>r.date.slice(8,10)),...extraExpenses.map(x=>x.date.slice(8,10))])].sort();
 const points=buckets.map(k=>sum(data.filter(r=>(mode==='year'?r.date.slice(5,7):r.date.slice(8,10))===k),conv)+extraExpenses.filter(x=>(mode==='year'?x.date.slice(5,7):x.date.slice(8,10))===k).reduce((n,x)=>n+expenseCurrency(Number(x.amount),x.currency),0));
 pdf.bars(buckets,points);
 if(mode==='year'){
  pdf.heading('Monatsübersicht');
  pdf.table(['Monat','Ladungen','Tankungen','Kosten '+settings.base],buckets.map((k,i)=>{const rows=data.filter(r=>r.date.slice(5,7)===k);return [k,String(rows.filter(r=>r.type==='charge').length),String(rows.filter(r=>r.type==='fuel').length),(sum(rows,conv)+extraExpenses.filter(x=>x.date.slice(5,7)===k).reduce((n,x)=>n+expenseCurrency(Number(x.amount),x.currency),0)).toFixed(2)];}),[70,125,125,165]);
 }
 /**
  * Erweiterter Jahresbericht (v92).
  *
  * Die Jahresstatistik nutzt dieselben bereits nach Jahr und Fahrzeug
  * gefilterten Datensätze wie der bisherige Bericht. Zusatzkosten stammen
  * ausschliesslich aus den bestätigten SQL-Fahrzeugausgaben. Die Summen
  * werden in die eingestellte Basiswährung umgerechnet.
  *
  * Kilometerstände dürfen niemals über mehrere Fahrzeuge hinweg als
  * gemeinsame Spanne interpretiert werden: pro Fahrzeug wird separat
  * gerechnet. Ohne mindestens zwei gültige Stände bleibt der Wert offen.
  */
 if(mode==='year'){
  const months=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const money=value=>Number(value).toFixed(2);
  const expenseValue=x=>expenseCurrency(Number(x.amount),x.currency);
  const monthly=buckets.map((key,index)=>{
   const monthRecords=data.filter(r=>String(r.date||'').slice(5,7)===key);
   const monthExpenses=extraExpenses.filter(x=>String(x.date||'').slice(5,7)===key);
   const chargeRows=monthRecords.filter(r=>r.type==='charge');
   const fuelRows=monthRecords.filter(r=>r.type==='fuel');
   const electricity=sum(chargeRows,conv),petrol=sum(fuelRows,conv);
   const other=sum(monthExpenses,expenseValue);
   return {name:months[index],electricity,petrol,other,total:electricity+petrol+other,
    kwh:sum(chargeRows,r=>Number(r.amount||0)),liters:sum(fuelRows,r=>Number(r.amount||0))};
  });
  pdf.heading('Jahresvergleich: Strom, Benzin und Zusatzkosten');
  pdf.table(['Monat','Strom','Benzin','Weitere','Gesamt'],
   monthly.map(m=>[m.name,money(m.electricity),money(m.petrol),money(m.other),money(m.total)]),
   [65,105,105,105,115]);
  pdf.note('Alle Beträge in '+settings.base+'. Monatswerte entsprechen den erfassten Daten.');
  pdf.heading('Energieverbrauch pro Monat');
  pdf.table(['Monat','Strom kWh','Benzin Liter','Gesamt '+settings.base],
   monthly.map(m=>[m.name,m.kwh.toFixed(1),m.liters.toFixed(1),money(m.total)]),
   [80,130,130,155]);
  const categories=new Map();
  for(const expense of extraExpenses){
   const name=String(expense.category||'Sonstiges');
   categories.set(name,(categories.get(name)||0)+expenseValue(expense));
  }
  pdf.heading('Weitere Ausgaben nach Kategorie');
  const categoryRows=[...categories].sort((a,b)=>b[1]-a[1]);
  pdf.table(['Kategorie','Betrag '+settings.base,'Anteil an Zusatzkosten'],
   categoryRows.map(([name,amount])=>[name,money(amount),extras>0?(amount/extras*100).toFixed(1)+' %':'–']),
   [210,135,150]);
  if(categoryRows.length)pdf.bars(categoryRows.map(([name])=>name.slice(0,7)),categoryRows.map(([,amount])=>amount));
  const selectedVehicles=vehicleId?vehicles.filter(v=>String(v.id)===vehicleId):vehicles;
  const comparisons=selectedVehicles.map(v=>{
   const id=String(v.id);
   const rows=data.filter(r=>String(r.vehicle_id)===id);
   const additions=extraExpenses.filter(x=>String(x.vehicle_id)===id);
   const cost=sum(rows,conv)+sum(additions,expenseValue);
   const readings=rows.map(r=>Number(r.km)).filter(k=>Number.isFinite(k)&&k>0);
   const span=readings.length>=2?Math.max(...readings)-Math.min(...readings):0;
   return {name:vehicleName(v),cost,span,perKm:span>0?cost/span:null,
    kwh:sum(rows.filter(r=>r.type==='charge'),r=>Number(r.amount||0)),
    liters:sum(rows.filter(r=>r.type==='fuel'),r=>Number(r.amount||0))};
  });
  pdf.heading('Fahrzeugvergleich im Jahr');
  pdf.table(['Fahrzeug','Kosten','km-Spanne','Kosten/km'],
   comparisons.map(v=>[v.name,money(v.cost),v.span>0?v.span.toFixed(0):'–',v.perKm===null?'–':money(v.perKm)]),
   [195,105,90,105]);
  pdf.table(['Fahrzeug','Strom kWh','Benzin Liter'],
   comparisons.map(v=>[v.name,v.kwh.toFixed(1),v.liters.toFixed(1)]),
   [245,125,125]);
  pdf.note('Kosten/km und km-Spanne sind Naeherungen je Fahrzeug aus den vorhandenen Kilometerstaenden. Bei fehlenden oder identischen Staenden kein Wert. Keine Abschreibung oder nicht erfasste Kosten.');
  pdf.heading('Jahresfazit');
  const activeMonths=monthly.filter(m=>m.total>0);
  const highest=activeMonths.slice().sort((a,b)=>b.total-a.total)[0];
  pdf.note('Erfasste Gesamtkosten: '+money(combined)+' '+settings.base+'; Strom: '+money(sum(charges,conv))+'; Benzin: '+money(sum(fuel,conv))+'; Zusatzkosten: '+money(extras)+'.');
  pdf.note('Aktive Kostenmonate: '+activeMonths.length+' von 12.'+(highest?' Kostenintensivster Monat: '+highest.name+' ('+money(highest.total)+' '+settings.base+').':''));
  pdf.note('Der Bericht beruecksichtigt nur erfasste Vorgänge und Ausgaben. Wechselkurse entsprechen den aktuellen App-Einstellungen.');
 }
 pdf.heading('Einzelne Einträge');
 const sorted=data.slice().sort((x,y)=>recordDateTime(x).localeCompare(recordDateTime(y)));
 pdf.table(['Datum / Zeit','Art','Menge','Ort','Kosten '+settings.base],sorted.map(r=>[recordDateTime(r),r.type==='charge'?'Strom':'Benzin',Number(r.amount||0).toFixed(2)+(r.type==='charge'?' kWh':' l'),r.place||'–',conv(r).toFixed(2)]),[105,65,90,145,90]);
 if(!data.length)pdf.note('Keine Einträge im gewählten Zeitraum.');
 pdf.note('Beträge gemäß aktuellen Währungseinstellungen umgerechnet. Diagramme zeigen erfasste Vorgänge.');
 const url=URL.createObjectURL(new Blob([pdf.finish()],{type:'application/pdf'}));
 const link=document.createElement('a');link.href=url;link.download='phev-'+(mode==='month'?'monat-':'jahr-')+period+'.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}


/**
 * Individuelle Dashboard-Anordnung (2.3).
 *
 * Die bestehenden Kacheln und ihre Diagramme bleiben im DOM. Es werden nur
 * ihre Sichtbarkeit und Reihenfolge geändert; Berechnungen, Cloud-Daten und
 * Formulare bleiben unberührt. localStorage ist gerätebezogen und wird nicht
 * als benutzerübergreifende Cloud-Einstellung ausgegeben.
 */
function initializeDashboardLayout(){
 const root=$('dashboard-layout-controls'),reset=$('dashboard-layout-reset');
 if(!root||!reset)return;
 const key='phev-dashboard-layout-v1';
 const widgets=[...document.querySelectorAll('#home [data-dashboard-widget]')];
 const defaults=widgets.map(w=>w.dataset.dashboardWidget);
 const read=()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(key)||'null');
   if(!saved||!Array.isArray(saved.order)||!Array.isArray(saved.hidden))return {order:defaults,hidden:[]};
   return {order:[...new Set([...saved.order.filter(id=>defaults.includes(id)),...defaults])],hidden:saved.hidden.filter(id=>defaults.includes(id))};
  }catch{return {order:defaults,hidden:[]};}
 };
 let state=read();
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{/* Private Browsing: aktuelle Auswahl bleibt erhalten. */}};
 const apply=()=>{
  for(const id of state.order){
   const widget=widgets.find(w=>w.dataset.dashboardWidget===id);
   if(!widget)continue;
   widget.hidden=state.hidden.includes(id);
   // Nur innerhalb des ursprünglichen Kachelbereichs verschieben.
   const siblings=widgets.filter(w=>w.parentElement===widget.parentElement);
   if(siblings.length>1)widget.parentElement.append(widget);
  }
 };
 const controls=()=>{
  root.replaceChildren();
  for(const [index,id] of state.order.entries()){
   const row=document.createElement('div');row.className='dashboard-layout-row';
   const label=document.createElement('label');
   const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!state.hidden.includes(id);
   toggle.onchange=()=>{state.hidden=toggle.checked?state.hidden.filter(x=>x!==id):[...state.hidden,id];persist();apply();};
   label.append(toggle,document.createTextNode(' '+id));
   const up=document.createElement('button');up.type='button';up.textContent='↑';up.setAttribute('aria-label',id+' nach oben');up.disabled=index===0;
   const down=document.createElement('button');down.type='button';down.textContent='↓';down.setAttribute('aria-label',id+' nach unten');down.disabled=index===state.order.length-1;
   const move=offset=>{const target=index+offset;[state.order[index],state.order[target]]=[state.order[target],state.order[index]];persist();apply();controls();};
   up.onclick=()=>move(-1);down.onclick=()=>move(1);
   row.append(label,up,down);root.append(row);
  }
 };
 window.getDashboardLayoutPreferences=()=>({order:[...state.order],hidden:[...state.hidden]});
 window.applyDashboardLayoutPreferences=value=>{
  if(!value||!Array.isArray(value.order)||!Array.isArray(value.hidden))return;
  state={order:[...new Set([...value.order.filter(id=>defaults.includes(id)),...defaults])],hidden:value.hidden.filter(id=>defaults.includes(id))};
  persist();apply();controls();
 };
 reset.onclick=()=>{state={order:[...defaults],hidden:[]};persist();apply();controls();};
 apply();controls();
}
initializeDashboardLayout();

/* PDF-Layout: siehe pdf-report.js; Berechnung verbleibt in exportPdfReport(). */

$('report-year').value=new Date().getFullYear();
$('report-month').value=String(new Date().getMonth()+1).padStart(2,'0');

/* Backup-Helfer: auto-backup.js. Initialisierung nach App-Start. */
updateAutomaticBackupStatus();
