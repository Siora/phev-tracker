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
function refreshVehicles(){
 const filter=$('vehicleFilter'),selected=filter.value,entry=$('entryVehicle'),chosen=entry.value;
 filter.replaceChildren(new Option('Alle Fahrzeuge',''),...vehicles.map(v=>new Option(vehicleName(v),String(v.id))));
 filter.value=[...filter.options].some(o=>o.value===selected)?selected:'';
 const reportVehicle=$('report-vehicle');if(reportVehicle){const prev=reportVehicle.value;reportVehicle.replaceChildren(new Option('Alle Fahrzeuge',''),...vehicles.map(v=>new Option(vehicleName(v),String(v.id))));reportVehicle.value=[...reportVehicle.options].some(o=>o.value===prev)?prev:'';}
 entry.replaceChildren(new Option('Bitte Fahrzeug auswählen',''),...vehicles.map(v=>new Option(vehicleName(v),String(v.id))));
 entry.value=[...entry.options].some(o=>o.value===chosen)?chosen:(vehicles.length===1?String(vehicles[0].id):'');
 document.querySelectorAll('.quick-form select[name=vehicle_id]').forEach(sel=>{const prev=sel.value;sel.replaceChildren(new Option('Fahrzeug auswählen',''),...vehicles.map(v=>new Option(vehicleName(v),String(v.id))));sel.value=vehicles.some(v=>String(v.id)===prev)?prev:(vehicles.length===1?String(vehicles[0].id):'');});
 updateBulkCount();
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
// Wechsel zwischen den Bereichen der Single-Page-Anwendung.
function tab(t){
  ['home','add','csv','vehicles','charging-management','options','cloud'].forEach(x=>$(x).classList.toggle('hide',x!==t));
  document.querySelectorAll('.sidebar nav button').forEach((b,i)=>b.classList.toggle('active',['home','add','csv','vehicles','charging-management','options','cloud'][i]===t));
  render();
  window.scrollTo(0,0)
}
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

function render(){
  updateLoginNotice();
  const now=new Date(),period=$('period').value;
  let y=now.getFullYear(),m=now.getMonth();
  $('customdates').classList.toggle('hide',period!=='custom');
  let provider=$('provider'),current=provider.value,providers=[...new Set(records.map(x=>x.place||'Unbekannt'))].sort();
  provider.replaceChildren(new Option('Alle Orte / Tankstellen',''),...providers.map(x=>new Option(x,x)));
  provider.value=providers.includes(current)?current:'';
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
  // Die Werte beziehen sich auf die Kilometerstandsspanne im gewählten Zeitraum.
  // Geladene/getankte Mengen sind Näherungen, kein gemessener Antriebsverbrauch.
  const consumption=$('consumption-stats');
  if(consumption){
    const energyKwh=charges.reduce((total,r)=>total+Number(r.amount||0),0);
    const fuelLiters=fuel.reduce((total,r)=>total+Number(r.amount||0),0);
    const values=distance>0
      ? [['⚡ Geladen / 100 km',(energyKwh*100/distance).toFixed(2)+' kWh'],['⛽ Getankt / 100 km',(fuelLiters*100/distance).toFixed(2)+' l'],['💰 Kosten / 100 km',fmt(cost*100/distance,settings.base)]]
      : [];
    consumption.replaceChildren();
    for(const [label,value] of values){
      const tile=document.createElement('div');tile.className='tile';
      const small=document.createElement('small');small.textContent=label;
      const bold=document.createElement('b');bold.textContent=value;
      tile.append(small,bold);consumption.append(tile);
    }
    $('consumption-note').textContent=distance>0
      ? 'Basis: '+distance.toLocaleString('de-CH')+' km zwischen dem kleinsten und größten erfassten Kilometerstand. Lade- und Tankmengen sind nur Näherungswerte.'
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
  let tiles=[['⚡ Ø Preis pro kWh',averageElectric],['⛽ Ø Preis pro Liter',averageFuel],['⚡ Geladene Energie',charges.reduce((v,x)=>v+x.amount,0).toFixed(2)+' kWh'],['⛽ Benzin',fuel.reduce((v,x)=>v+x.amount,0).toFixed(2)+' l'],['💰 Gesamtkosten',fmt(cost,settings.base)],['🔌 Stromkosten',fmt(electric,settings.base)],['⛽ Benzinkosten',fmt(petrol,settings.base)],['🚗 Kosten / 100 km',distance?fmt(cost/distance*100,settings.base):'–'],['Ladevorgänge',charges.length],['Tankungen',fuel.length]];
  $('stats').innerHTML=tiles.map(x=>'<div class="tile"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join('');
  const metric = $('trendMetric').value;
  AnalyticsCharts.trend($('trendchart'), filtered, metric, settings.base, conv);
  AnalyticsCharts.donut($('donutchart'), filtered, settings.base, conv);
  AnalyticsCharts.price($('pricechart'), filtered, settings.base, conv);
  AnalyticsCharts.providers($('providerchart'), charges);
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

  const fleet=$('fleet-overview');fleet.replaceChildren();vehicles.forEach(v=>{const btn=document.createElement('button');btn.type='button';btn.className='fleet-row';const count=records.filter(r=>String(r.vehicle_id)===String(v.id)).length;btn.textContent='🚘 '+vehicleName(v)+' · '+count+' Einträge';btn.onclick=()=>{$('vehicleFilter').value=String(v.id);render();window.scrollTo({top:0,behavior:'smooth'});};fleet.append(btn);});if(!vehicles.length)fleet.textContent='Bitte ein Fahrzeug anlegen.';
  const compare=$('month-compare');compare.replaceChildren();const monthsMap=new Map();filtered.forEach(r=>{const month=r.date.slice(0,7);monthsMap.set(month,(monthsMap.get(month)||0)+conv(r));});const maxMonth=Math.max(1,...monthsMap.values());[...monthsMap].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,3).forEach(([month,value])=>{const line=document.createElement('div');line.className='compare-row';const label=document.createElement('span');label.textContent=month;const track=document.createElement('div');track.className='compare-track';const bar=document.createElement('div');bar.className='compare-fill';bar.style.width=(value/maxMonth*100)+'%';track.append(bar);const amount=document.createElement('strong');amount.textContent=fmt(value,settings.base);line.append(label,track,amount);compare.append(line);});if(!monthsMap.size)compare.textContent='Noch keine Monatsdaten.';
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
  for(const x of ordered){
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
    edit.onclick=()=>{
      let f=$('form');f.elements.type.value=x.type;updateEntryPlaceVisibility();f.elements.date.value=x.date;f.elements.time.value=recordTime(x.id);f.elements.amount.value=x.amount;f.elements.cost.value=x.cost;setUnitPriceFromTotal(f);f.elements.currency.value=x.currency;f.elements.km.value=x.km||'';f.elements.place.value=x.place||'';f.elements.managed_location.value='';f.elements.managed_provider.value='';f.elements.charge_kind.value=getChargingType(x.id);f.elements.charge_mode.value=getChargeMode(x.id);f.elements.vehicle_id.value=x.vehicle_id||'';f.dataset.editId=x.id;f.querySelector('button').textContent='Änderungen speichern';tab('add')
    };
    const remove=document.createElement('button');remove.type='button';remove.textContent='Löschen';
    remove.onclick=()=>{if(confirm('Eintrag löschen?')){records=records.filter(r=>r.id!==x.id);save();}};
    actions.append(edit,remove);tr.append(actions);tbody.append(tr);
  }
  table.append(tbody);entries.append(table);
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
  for(const item of data[type]){
   const row=document.createElement('tr');
   const values=type==='locations'?[item.name,item.kind||'–',item.price===null?'–':item.price+' '+settings.base]:[item.name,item.price===null?'–':item.price+' '+settings.base];
   for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
   const actions=document.createElement('td');actions.className='management-actions';
   const edit=document.createElement('button'),del=document.createElement('button');
   edit.textContent='Bearbeiten';edit.type='button';edit.onclick=()=>{const form=$(type==='locations'?'managed-location-form':'managed-provider-form');form.dataset.editId=item.id;form.elements.name.value=item.name;form.elements.price.value=item.price??'';if(type==='locations')form.elements.kind.value=item.kind||'';form.querySelector('button[type=submit]').textContent='Änderungen speichern';form.scrollIntoView({behavior:'smooth',block:'start'});};
   del.textContent='Löschen';del.type='button';del.onclick=()=>{if(!confirm('Eintrag aus der Verwaltung löschen? Bestehende Ladungen bleiben erhalten.'))return;data[type]=data[type].filter(x=>x.id!==item.id);storeChargingData(data);};
   actions.append(edit,del);row.append(actions);tbody.append(row);
  }
  table.append(tbody);list.append(table);
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
function expenseCurrency(amount,currency){return currency===settings.base?amount:settings.base==='CHF'?amount*settings.rate:amount/settings.rate;}
function applyVehicleExpenses(value){if(!Array.isArray(value))return;vehicleExpenses=value.filter(x=>x&&typeof x.id==='string'&&Number.isFinite(Number(x.amount))&&Number(x.amount)>0);renderVehicleExpenses();}
window.setVehicleExpenses=applyVehicleExpenses;
function renderVehicleExpenses(){
 const form=$('expense-form'),list=$('expense-list'),summary=$('expense-summary');if(!form||!list||!summary)return;
 const select=form.elements.vehicle_id,previous=select.value;
 select.replaceChildren(new Option('Fahrzeug wählen',''),...vehicles.map(v=>new Option(vehicleName(v),String(v.id))));
 if(vehicles.some(v=>String(v.id)===previous))select.value=previous;
 else if(vehicles.length===1)select.value=String(vehicles[0].id);
 list.replaceChildren();summary.replaceChildren();
 const selected=select.value;
 const expenses=vehicleExpenses.filter(x=>!selected||String(x.vehicle_id)===selected).slice().sort((a,b)=>b.date.localeCompare(a.date));
 const extra=expenses.reduce((sum,x)=>sum+expenseCurrency(Number(x.amount),x.currency),0);
 const matching=records.filter(x=>!selected||String(x.vehicle_id)===selected);
 const running=matching.reduce((sum,x)=>sum+conv(x),0);
 const distances=matching.map(x=>Number(x.km)).filter(x=>Number.isFinite(x)&&x>0);
 const distance=distances.length>1?Math.max(...distances)-Math.min(...distances):0;
 const caption=document.createElement('p');caption.className='expense-total';caption.textContent='Gesamtkosten aller erfassten Zeiträume: '+fmt(extra+running,settings.base);
 const detail=document.createElement('small');detail.textContent='Strom & Benzin: '+fmt(running,settings.base)+' · Weitere Ausgaben: '+fmt(extra,settings.base)+(distance>0?' · '+fmt((extra+running)/distance,settings.base)+' / km (Näherung)':' · Für Kosten/km fehlen Kilometerstände.');
 summary.append(caption,detail);
 for(const x of expenses){
  const row=document.createElement('div');row.className='expense-row';
  const info=document.createElement('span');info.textContent=x.date+' · '+x.category+' · '+fmt(Number(x.amount),x.currency)+(x.note?' · '+x.note:'');
  const remove=document.createElement('button');remove.type='button';remove.textContent='Löschen';remove.setAttribute('aria-label','Ausgabe vom '+x.date+' löschen');
  remove.onclick=async()=>{if(!confirm('Diese Ausgabe wirklich löschen?'))return;remove.disabled=true;try{await window.saveVehicleExpenses(vehicleExpenses.filter(item=>item.id!==x.id));$('expense-status').textContent='Ausgabe gelöscht.';}catch(e){$('expense-status').textContent='Löschen fehlgeschlagen: '+e.message;remove.disabled=false;}};
  row.append(info,remove);list.append(row);
 }
 if(!expenses.length){const empty=document.createElement('p');empty.textContent='Noch keine zusätzlichen Fahrzeugausgaben erfasst.';list.append(empty);}
}
$('expense-form').elements.vehicle_id.addEventListener('change',renderVehicleExpenses);
$('expense-form').onsubmit=async e=>{
 e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type=submit]'),el=form.elements;
 if(!el.vehicle_id.value)return $('expense-status').textContent='Bitte ein Fahrzeug wählen.';
 const amount=Number(el.amount.value);if(!Number.isFinite(amount)||amount<=0)return;
 const item={id:(crypto.randomUUID?.()||String(Date.now())+'-'+Math.random()),vehicle_id:el.vehicle_id.value,category:el.category.value,date:el.date.value,amount,currency:el.currency.value,note:el.note.value.trim()};
 button.disabled=true;$('expense-status').textContent='Ausgabe wird gespeichert …';
 try{await window.saveVehicleExpenses([...vehicleExpenses,item]);const v=el.vehicle_id.value;form.reset();el.vehicle_id.value=v;$('expense-status').textContent='Ausgabe sicher in der Cloud gespeichert.';}
 catch(error){$('expense-status').textContent='Speichern fehlgeschlagen: '+error.message;}
 finally{button.disabled=false;}
};

window.collectCloudPreferences=function(){
 const photos={};
 for(const vehicle of vehicles){const url=localStorage.getItem('phev-photo-'+vehicle.id);if(url)photos[String(vehicle.id)]=url;}
 return {photos,vehicle_expenses:vehicleExpenses,fuel_energy_factor:fuelEnergyFactor(),cost_comparison:getCostComparison(),base:settings.base,rate:settings.rate};
};
window.applyCloudPreferences=function(prefs){
 if(!prefs||typeof prefs!=='object')return;
 
 if(Array.isArray(prefs.vehicle_expenses))applyVehicleExpenses(prefs.vehicle_expenses);
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
function csvRows(s){
  s=s.replace(/^\uFEFF/,'');
  let line=s.split(/\r?\n/)[0]||'',sep=(line.match(/;/g)||[]).length>=(line.match(/,/g)||[]).length?';':',',rows=[],row=[],v='',q=false;
  for(let i=0;i<s.length;i++){
    let c=s[i];
    if(c==='"'){
      if(q&&s[i+1]==='"'){
        v+='"';
        i++
      }
      else q=!q
    }
    else if(c===sep&&!q){
      row.push(v);
      v=''
    }
    else if((c==='\r'||c==='\n')&&!q){
      if(c==='\r'&&s[i+1]==='\n')i++;
      row.push(v);
      if(row.some(Boolean))rows.push(row);
      row=[];
      v=''
    }
    else v+=c
  }
  row.push(v);
  if(row.some(Boolean))rows.push(row);
  return rows
}
function date(s){
  let m=String(s||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
  m=String(s||'').match(/^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})/);
  return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):''
}
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
tab('home');


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
function exportPdfReport(mode){
 const year=Number($('report-year').value),month=$('report-month').value,vehicleId=$('report-vehicle').value;
 if(!Number.isInteger(year)||year<2020||year>2100){alert('Bitte gültiges Jahr auswählen.');return;}
 const period=String(year)+(mode==='month'?'-'+month:'');
 const data=records.filter(r=>String(r.date||'').startsWith(period)&&(!vehicleId||String(r.vehicle_id)===vehicleId));
 const chosen=vehicles.find(v=>String(v.id)===vehicleId);
 const title=mode==='month'?'Monatsbericht '+month+'.'+year:'Jahresbericht '+year;
 const pdf=new PhevPdfReport(title,chosen?vehicleName(chosen):'Alle Fahrzeuge',settings.base);
 const charges=data.filter(r=>r.type==='charge'),fuel=data.filter(r=>r.type==='fuel');
 const sum=(arr,fn)=>arr.reduce((n,r)=>n+fn(r),0);
 const total=sum(data,conv),energy=sum(charges,r=>Number(r.amount||0)),liters=sum(fuel,r=>Number(r.amount||0));
 const extraExpenses=vehicleExpenses.filter(x=>String(x.date||'').startsWith(period)&&(!vehicleId||String(x.vehicle_id)===vehicleId));
 const extras=extraExpenses.reduce((n,x)=>n+expenseCurrency(Number(x.amount),x.currency),0);
 const combined=total+extras;
 const kmValues=data.map(x=>Number(x.km)).filter(x=>Number.isFinite(x)&&x>0);
 const kmSpan=kmValues.length>1?Math.max(...kmValues)-Math.min(...kmValues):0;
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
 pdf.heading('Einzelne Einträge');
 const sorted=data.slice().sort((x,y)=>recordDateTime(x).localeCompare(recordDateTime(y)));
 pdf.table(['Datum / Zeit','Art','Menge','Ort','Kosten '+settings.base],sorted.map(r=>[recordDateTime(r),r.type==='charge'?'Strom':'Benzin',Number(r.amount||0).toFixed(2)+(r.type==='charge'?' kWh':' l'),r.place||'–',conv(r).toFixed(2)]),[105,65,90,145,90]);
 if(!data.length)pdf.note('Keine Einträge im gewählten Zeitraum.');
 pdf.note('Beträge gemäß aktuellen Währungseinstellungen umgerechnet. Diagramme zeigen erfasste Vorgänge.');
 const url=URL.createObjectURL(new Blob([pdf.finish()],{type:'application/pdf'}));
 const link=document.createElement('a');link.href=url;link.download='phev-'+(mode==='month'?'monat-':'jahr-')+period+'.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
class PhevPdfReport{
 constructor(title,vehicle,currency){this.title=title;this.vehicle=vehicle;this.currency=currency;this.pages=[];this.newPage();}
 clean(v){return String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^\x20-\x7e]/g,'?');}
 esc(v){return this.clean(v).replace(/[\\()]/g,'\\$&');}
 cmd(s){this.ops.push(s);}
 color(rgb){this.cmd(rgb.join(' ')+' rg');}
 rect(x,y,w,h,rgb){this.color(rgb);this.cmd(x+' '+y+' '+w+' '+h+' re f');}
 text(x,y,v,size=10,rgb=[0.13,0.2,0.3],bold=false){this.color(rgb);this.cmd('BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x+' '+y+' Tm ('+this.esc(v)+') Tj ET');}
 coverOverview(o){
  this.ops.length=0;
  const blue=[0.08,0.42,0.78],dark=[0.08,0.13,0.21],muted=[0.48,0.52,0.57],line=[0.85,0.88,0.92];
  this.rect(0,0,595,842,[1,1,1]);
  this.rect(40,779,5,32,blue);this.text(55,793,'PHEV Tracker',23,dark,true);
  this.text(56,780,'FAHRZEUGREPORT',9,blue,true);
  this.text(40,754,'Zeitraum: '+o.period,10,muted);
  this.text(310,754,'Fahrzeug: '+this.vehicle,10,muted);
  this.rect(40,740,515,1,line);
  const tile=(x,y,label,value,accent=false)=>{
   this.rect(x,y,247,66,accent?[0.93,0.96,1]:[0.96,0.97,0.98]);
   if(accent)this.rect(x,y,3,66,blue);
   this.text(x+13,y+44,label.toUpperCase(),8,muted,true);
   this.text(x+13,y+17,value,18,accent?blue:dark,true);
  };
  tile(40,651,'Gesamtkosten',o.total.toFixed(2)+' '+this.currency,true);
  tile(308,651,'Geladene Energie',o.energy.toFixed(2)+' kWh');
  tile(40,574,'Strompreis / kWh',o.energy>0?(o.chargeCost/o.energy).toFixed(2)+' '+this.currency:'–');
  tile(308,574,'Kosten / 100 km',o.kmSpan>0?(o.total*100/o.kmSpan).toFixed(2)+' '+this.currency:'–');
  const ring=(cx,cy,values,label,unit)=>{
   const palette=[[0.08,0.53,0.9],[0.52,0.56,0.62],[0.62,0.79,0.26],[0.96,0.63,0.25]];
   const sum=values.reduce((a,v)=>a+v,0);
   let start=-Math.PI/2;
   values.forEach((v,i)=>{if(v<=0||sum<=0)return;const end=start+Math.PI*2*v/sum,n=Math.max(2,Math.ceil(55*v/sum));for(let k=0;k<n;k++){const t=start+(end-start)*k/n,t2=start+(end-start)*(k+1)/n;const ro=44,ri=27;
    const pts=[[cx+ri*Math.cos(t),cy+ri*Math.sin(t)],[cx+ro*Math.cos(t),cy+ro*Math.sin(t)],[cx+ro*Math.cos(t2),cy+ro*Math.sin(t2)],[cx+ri*Math.cos(t2),cy+ri*Math.sin(t2)]];
    this.color(palette[i%4]);this.cmd(pts.map((p,j)=>p[0].toFixed(2)+' '+p[1].toFixed(2)+(j?' l':' m')).join(' ')+' h f');
   }start=end;});
   this.text(cx-24,cy-3,sum.toFixed(0),15,dark,true);this.text(cx-17,cy-17,unit,9,muted);
   this.text(cx-61,cy+72,label,9,muted,true);
  };
  this.rect(40,351,247,200,[0.985,0.989,0.996]);this.rect(308,351,247,200,[0.985,0.989,0.996]);
  ring(163,449,o.providers.map(p=>p.energy),'NACH ANBIETER','kWh');
  ring(431,449,[o.chargeCost,o.fuelCost,o.extras],'KOSTENMIX',this.currency);
  const legendColors=[[0.08,0.53,0.9],[0.52,0.56,0.62],[0.62,0.79,0.26],[0.96,0.63,0.25]];
  o.providers.slice(0,3).forEach((p,i)=>{const y=409-i*17;this.rect(53,y-3,7,7,legendColors[i]);this.text(65,y-1,p.name.slice(0,22)+' '+(o.energy?Math.round(p.energy/o.energy*100):0)+'%',8,muted);});
  if(o.providers.length>3)this.text(65,353,'+'+(o.providers.length-3)+' weitere Anbieter',8,muted);
  [['Strom',o.chargeCost],['Benzin',o.fuelCost],['Sonstige',o.extras]].forEach((p,i)=>{const y=409-i*17;this.rect(320,y-3,7,7,legendColors[i]);this.text(332,y-1,p[0]+': '+p[1].toFixed(2)+' '+this.currency,8,muted);});
  this.rect(40,107,247,226,[0.965,0.974,0.992]);this.rect(40,107,4,226,blue);
  this.rect(308,107,247,226,[0.965,0.974,0.992]);
  this.text(54,310,'FINANZIELLE AUFSCHLUESSELUNG',10,blue,true);
  const lines=[['Strom',o.chargeCost],['Benzin',o.fuelCost],['Weitere Ausgaben',o.extras],['Gesamt',o.total]];
  lines.forEach((a,i)=>{const y=278-i*35;this.text(54,y,a[0],10,dark,i===3);this.text(175,y,a[1].toFixed(2)+' '+this.currency,10,i===3?blue:dark,i===3);if(i<3)this.rect(54,y-12,219,0.5,line);});
  this.text(322,310,'ZEITRAUMUEBERSICHT',10,blue,true);
  this.text(322,278,'AKTIVITAET',8,muted,true);
  this.text(322,261,o.charges.length+' Ladungen / '+o.providers.length+' Anbieter',11,dark,true);
  this.text(322,233,'HAUPTANBIETER',8,muted,true);
  this.text(322,216,o.providers[0]?.name||'Keine Angaben',10,dark,true);
  this.text(322,188,'BESTER STROMPREIS',8,muted,true);
  this.text(322,171,o.best?(conv(o.best)/Number(o.best.amount)).toFixed(2)+' '+this.currency+'/kWh':'–',11,dark,true);
  this.text(322,143,'Kosten/100 km: Kilometerstand-Naeherung',8,muted);
  this.text(289,40,'1',9,muted);
  this.newPage();
 }
 newPage(){this.ops=[];this.pages.push(this.ops);this.y=745;this.rect(0,786,595,56,[0.06,0.17,0.28]);this.text(40,807,'PHEV TRACKER  /  '+this.title,17,[1,1,1],true);this.text(40,766,this.vehicle+'   |   '+new Date().toLocaleDateString('de-CH'),9);this.rect(40,42,515,1,[0.85,0.88,0.91]);this.text(40,27,'PHEV Tracker  -  Persönlicher Fahrzeugbericht',8,[0.45,0.49,0.55]);}
 space(h){if(this.y-h<70)this.newPage();}
 heading(v){this.space(42);this.y-=23;this.text(40,this.y,v,14,[0.07,0.22,0.36],true);this.y-=18;}
 metrics(items){this.space(83);const w=124;items.forEach((a,i)=>{const x=40+i*130;this.rect(x,this.y-60,w,63,[0.94,0.96,0.98]);this.text(x+9,this.y-20,a[0],9);this.text(x+9,this.y-44,a[1],13,[0.05,0.36,0.53],true);});this.y-=84;}
 donut(values,labels,unit=this.currency){this.space(Math.max(115,labels.length*30+40));const sum=values.reduce((a,b)=>a+b,0);const x=105,y=this.y-49,r=42;let start=-Math.PI/2;values.forEach((v,i)=>{if(v<=0)return;const n=Math.max(2,Math.ceil(v/sum*70)),end=start+2*Math.PI*v/sum;const points=[[x,y]];for(let j=0;j<=n;j++){const t=start+(end-start)*j/n;points.push([x+r*Math.cos(t),y+r*Math.sin(t)]);}this.color([[0.1,0.57,0.72],[0.96,0.63,0.25],[0.43,0.72,0.64]][i%3]);this.cmd(points.map((p,k)=>p[0].toFixed(2)+' '+p[1].toFixed(2)+(k?' l':' m')).join(' ')+' h f');start=end;});if(!sum){this.text(75,y,'Keine Daten',10);}values.forEach((v,i)=>{this.rect(195,this.y-27-i*30,11,11,[[0.1,0.57,0.72],[0.96,0.63,0.25],[0.43,0.72,0.64]][i%3]);this.text(216,this.y-24-i*30,labels[i]+': '+v.toFixed(2)+' '+unit,11);});this.y-=Math.max(113,labels.length*30+24);}
 bars(labels,values){this.space(160);const x=45,y=this.y-126,w=500,h=112,max=Math.max(1,...values);this.rect(x,y,w,1,[0.72,0.77,0.82]);if(!labels.length){this.text(x+8,y+52,'Keine Daten',10);}else{const step=w/labels.length,bw=Math.min(26,step*0.65);labels.forEach((k,i)=>{const bar=values[i]/max*(h-18);this.rect(x+i*step+(step-bw)/2,y,bw,Math.max(0.1,bar),[0.1,0.57,0.72]);if(labels.length<=12||i%Math.ceil(labels.length/12)===0)this.text(x+i*step+step/2-6,y-14,k,8);});this.text(x,y+h-2,'Max. '+max.toFixed(2)+' '+this.currency,9);}this.y-=161;}
 table(headers,rows,widths){const rowH=23;const drawHeader=()=>{this.space(34);this.rect(40,this.y-25,515,26,[0.08,0.25,0.4]);let x=45;headers.forEach((v,i)=>{this.text(x,this.y-17,v,8,[1,1,1],true);x+=widths[i];});this.y-=26;};drawHeader();if(!rows.length){this.note('Keine Einträge vorhanden.');return;}for(let i=0;i<rows.length;i++){if(this.y-rowH<70){this.newPage();drawHeader();}if(i%2===0)this.rect(40,this.y-rowH,515,rowH,[0.95,0.97,0.98]);let x=45;rows[i].forEach((v,j)=>{const limit=Math.max(5,Math.floor((widths[j]-10)/4.7));let t=this.clean(v);if(t.length>limit)t=t.slice(0,limit-2)+'..';this.text(x,this.y-15,t,8);x+=widths[j];});this.y-=rowH;}this.y-=15;}
 note(v){this.space(24);this.text(42,this.y-12,v,8,[0.4,0.44,0.5]);this.y-=23;}
 finish(){const objs=['','<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];const kids=[];for(const ops of this.pages){const p=objs.length,c=p+1;kids.push(p+' 0 R');objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents '+c+' 0 R >>');const stream=ops.join('\n');objs.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');}objs[2]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+kids.length+' >>';let out='%PDF-1.4\n',offsets=[0];for(let i=1;i<objs.length;i++){offsets[i]=out.length;out+=i+' 0 obj\n'+objs[i]+'\nendobj\n';}const pos=out.length;out+='xref\n0 '+objs.length+'\n0000000000 65535 f \n';for(let i=1;i<objs.length;i++)out+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';out+='trailer\n<< /Size '+objs.length+' /Root 1 0 R >>\nstartxref\n'+pos+'\n%%EOF';return new TextEncoder().encode(out);}
}
$('report-year').value=new Date().getFullYear();
$('report-month').value=String(new Date().getMonth()+1).padStart(2,'0');

/* Lokale automatische Sicherungen: rotierende Snapshots, niemals Cloud-Daten ersetzen. */
const automaticBackupPrefix='phev-auto-snapshots-';
function automaticBackupKey(){
 let email='local';
 try{email=JSON.parse(localStorage.getItem('phev-session-v1')||'null')?.email||'local';}catch{}
 return automaticBackupPrefix+email;
}
function automaticBackupHistory(){
 try{const result=JSON.parse(localStorage.getItem(automaticBackupKey())||'[]');return Array.isArray(result)?result:[];}catch{return [];}
}
function scheduleAutomaticBackup(){
 try{
  // Nicht unmittelbar beim Start leere Cloud-Daten über bestehende Sicherungen schreiben.
  if(cloudView&&records.length===0)return;
  const previous=automaticBackupHistory();
  const snapshot={createdAt:new Date().toISOString(),source:cloudView?'cloud':'local',records:JSON.parse(JSON.stringify(records)),settings:JSON.parse(JSON.stringify(settings)),vehicles:JSON.parse(JSON.stringify(vehicles)),chargingTypes:chargingTypes(),recordTimes:recordTimes(),chargeModes:chargeModes(),comparison:getCostComparison()};
  const signature=JSON.stringify([snapshot.records,snapshot.settings,snapshot.vehicles,snapshot.chargingTypes,snapshot.recordTimes,snapshot.chargeModes,snapshot.comparison]);
  if(previous.length&&previous[0].signature===signature){updateAutomaticBackupStatus();return;}
  previous.unshift({...snapshot,signature});
  localStorage.setItem(automaticBackupKey(),JSON.stringify(previous.slice(0,5)));
  updateAutomaticBackupStatus();
 }catch(error){
  const status=$('auto-backup-status');
  if(status)status.textContent='Automatische Sicherung fehlgeschlagen (möglicherweise zu wenig Gerätespeicher). Bitte manuell exportieren.';
  console.warn('Automatische Sicherung fehlgeschlagen',error);
 }
}
function updateAutomaticBackupStatus(){
 const status=$('auto-backup-status');if(!status)return;
 const history=automaticBackupHistory();
 status.textContent=history.length?'Letzte Sicherung: '+new Date(history[0].createdAt).toLocaleString('de-CH')+' · '+history[0].records.length+' Einträge · '+history.length+' Sicherung(en) vorhanden.':'Noch keine automatische Sicherung vorhanden.';
}
function downloadLatestAutoBackup(){
 const snapshot=automaticBackupHistory()[0];
 if(!snapshot){alert('Noch keine automatische Sicherung vorhanden.');return;}
 const {signature,...data}=snapshot;
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='phev-auto-backup-'+snapshot.createdAt.slice(0,10)+'.json';
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
updateAutomaticBackupStatus();
