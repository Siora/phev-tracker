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
 const credit=$('vehicleImageCredit');credit.hidden=!result;credit.href=result?.page||'#';
}
async function updateVehiclePhoto(vehicle){
 const request=++photoRequest;
 if(!vehicle){displayVehiclePhoto(null);return;}
 const custom=localStorage.getItem('phev-photo-'+vehicle.id);
 if(custom){displayVehiclePhoto({src:custom,page:custom,alt:'Eigenes Fahrzeugfoto: '+vehicleName(vehicle)});return;}
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
 const bulk=$('bulkVehicle'),old=bulk.value;
 bulk.replaceChildren(new Option('Fahrzeug auswählen',''),...vehicles.map(v=>new Option(vehicleName(v),String(v.id))));
 bulk.value=[...bulk.options].some(o=>o.value===old)?old:'';
 document.querySelectorAll('.quick-form select[name=vehicle_id]').forEach(sel=>{const prev=sel.value;sel.replaceChildren(new Option('Fahrzeug auswählen',''),...vehicles.map(v=>new Option(vehicleName(v),String(v.id))));sel.value=vehicles.some(v=>String(v.id)===prev)?prev:(vehicles.length===1?String(vehicles[0].id):'');});
 updateBulkCount();
}
function updateBulkCount(){const count=records.filter(r=>!r.vehicle_id).length; $('bulk-count').textContent=count+' Einträge ohne Fahrzeugzuordnung.';}
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
  ['home','add','csv','vehicles','options','cloud'].forEach(x=>$(x).classList.toggle('hide',x!==t));
  document.querySelectorAll('.sidebar nav button').forEach((b,i)=>b.classList.toggle('active',['home','add','csv','vehicles','options','cloud'][i]===t));
  render();
  window.scrollTo(0,0)
}
function save(){
  if(cloudView){window.queueCloudChanges(records);scheduleAutomaticBackup();render();return;}
  localStorage.setItem(key,JSON.stringify(records));
  scheduleAutomaticBackup();
  render();updateBulkCount()
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
  renderEnergyBalance(filtered);
  renderCostComparison(charges,fuel);
  renderChargingTypes(charges);
  let tiles=[['⚡ Geladene Energie',charges.reduce((v,x)=>v+x.amount,0).toFixed(2)+' kWh'],['⛽ Benzin',fuel.reduce((v,x)=>v+x.amount,0).toFixed(2)+' l'],['💰 Gesamtkosten',fmt(cost,settings.base)],['🔌 Stromkosten',fmt(electric,settings.base)],['⛽ Benzinkosten',fmt(petrol,settings.base)],['🚗 Kosten / 100 km',distance?fmt(cost/distance*100,settings.base):'–'],['Ladevorgänge',charges.length],['Tankungen',fuel.length]];
  $('stats').innerHTML=tiles.map(x=>'<div class="tile"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join('');
  const metric = $('trendMetric').value;
  AnalyticsCharts.trend($('trendchart'), filtered, metric, settings.base, conv);
  AnalyticsCharts.donut($('donutchart'), filtered, settings.base, conv);
  AnalyticsCharts.price($('pricechart'), filtered, settings.base, conv);
  AnalyticsCharts.providers($('providerchart'), charges);
  const recent=$('recent-entries');recent.replaceChildren();
  filtered.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).forEach(r=>{const p=document.createElement('p');p.className='recent-row';p.textContent=(r.type==='charge'?'⚡ ':'⛽ ')+r.date+' · '+r.amount+(r.type==='charge'?' kWh':' l')+' · '+fmt(r.cost,r.currency);recent.append(p);});
  if(!recent.children.length)recent.textContent='Noch keine Einträge im Zeitraum.';
  const fleet=$('fleet-overview');fleet.replaceChildren();vehicles.forEach(v=>{const btn=document.createElement('button');btn.type='button';btn.className='fleet-row';const count=records.filter(r=>String(r.vehicle_id)===String(v.id)).length;btn.textContent='🚘 '+vehicleName(v)+' · '+count+' Einträge';btn.onclick=()=>{$('vehicleFilter').value=String(v.id);render();window.scrollTo({top:0,behavior:'smooth'});};fleet.append(btn);});if(!vehicles.length)fleet.textContent='Bitte ein Fahrzeug anlegen.';
  const compare=$('month-compare');compare.replaceChildren();const monthsMap=new Map();filtered.forEach(r=>{const month=r.date.slice(0,7);monthsMap.set(month,(monthsMap.get(month)||0)+conv(r));});const maxMonth=Math.max(1,...monthsMap.values());[...monthsMap].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,3).forEach(([month,value])=>{const line=document.createElement('div');line.className='compare-row';const label=document.createElement('span');label.textContent=month;const track=document.createElement('div');track.className='compare-track';const bar=document.createElement('div');bar.className='compare-fill';bar.style.width=(value/maxMonth*100)+'%';track.append(bar);const amount=document.createElement('strong');amount.textContent=fmt(value,settings.base);line.append(label,track,amount);compare.append(line);});if(!monthsMap.size)compare.textContent='Noch keine Monatsdaten.';
  $('entries').replaceChildren();
  filtered.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(x=>{
    let div=document.createElement('div'),btn=document.createElement('button'),edit=document.createElement('button');div.className='item';div.textContent=x.date+' · '+(x.type==='charge'?'⚡ ':'⛽ ')+x.amount+(x.type==='charge'?' kWh · ':' l · ')+fmt(x.cost,x.currency)+' · '+(x.place||'')+' · '+(vehicles.find(v=>String(v.id)===String(x.vehicle_id))?vehicleName(vehicles.find(v=>String(v.id)===String(x.vehicle_id))):'Ohne Fahrzeug');edit.textContent='Bearbeiten';edit.onclick=()=>{
      let f=$('form');f.elements.type.value=x.type;f.elements.date.value=x.date;f.elements.amount.value=x.amount;f.elements.cost.value=x.cost;f.elements.currency.value=x.currency;f.elements.km.value=x.km||'';f.elements.place.value=x.place||'';f.elements.charge_kind.value=getChargingType(x.id);f.elements.vehicle_id.value=x.vehicle_id||'';f.dataset.editId=x.id;f.querySelector('button').textContent='Änderungen speichern';tab('add')
    };div.append(edit);btn.textContent='Löschen';btn.onclick=()=>{
      if(confirm('Eintrag löschen?')){
        records=records.filter(r=>r.id!==x.id);save()
      }
    };div.append(btn);$('entries').append(div)
  })
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
// Neuer Lade-/Tank-Eintrag oder Aktualisierung eines vorhandenen Eintrags.
$('form').onsubmit=e=>{
  e.preventDefault();
  let f=new FormData(e.target),x={
    id:crypto.randomUUID(),type:f.get('type'),date:f.get('date'),amount:n(f.get('amount')),cost:n(f.get('cost')),currency:f.get('currency'),km:f.get('km')?n(f.get('km')):null,place:f.get('place')||'',vehicle_id:f.get('vehicle_id')?Number(f.get('vehicle_id')):null
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
  setChargingType(x.id,chargeKind);
  save();
  e.target.reset();
  $('entryVehicle').value=vehicles.length===1?String(vehicles[0].id):'';
  $('provider').value='';
  $('vehicleFilter').value='';
  $('period').value='12';
  tab('home')
};
// Schnellformulare im Dashboard verwenden dieselbe zentrale Speicherlogik.
document.querySelectorAll('.quick-form').forEach(form=>{form.elements.date.value=new Date().toISOString().slice(0,10);form.onsubmit=e=>{e.preventDefault();const f=e.currentTarget;const vid=Number(f.elements.vehicle_id.value);if(!vehicles.some(v=>Number(v.id)===vid)){alert('Bitte ein Fahrzeug auswählen.');return;}const record={id:crypto.randomUUID(),type:f.dataset.type,date:f.elements.date.value,amount:n(f.elements.amount.value),cost:n(f.elements.cost.value),currency:settings.base,km:null,place:f.elements.place.value||'',vehicle_id:vid};if(record.amount<=0)return;records.push(record);if(record.type==='charge')setChargingType(record.id,f.elements.charge_kind.value);save();f.reset();f.elements.date.value=new Date().toISOString().slice(0,10);f.elements.vehicle_id.value=String(vid);alert('Eintrag gespeichert.');};});
$('base').value=settings.base;
$('rate').value=settings.rate;
function settingsSave(){
  let r=n($('rate').value);
  if(r<=0)return alert('Ungültiger Kurs');
  settings={
    base:$('base').value,rate:r
  };
  localStorage.setItem('phev-settings-1',JSON.stringify(settings));
  render();
  alert('Gespeichert')
}
window.showCloudRecords=function(items){cloudView=true;records=items.map(x=>({...x,amount:Number(x.amount),cost:Number(x.cost),km:x.km===null?null:Number(x.km)}));scheduleAutomaticBackup();tab('home');updateBulkCount();};
window.showLocalRecords=function(){cloudView=false;vehicles=[];records=JSON.parse(localStorage.getItem(key)||'[]');refreshVehicles();tab('home');};
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
 localStorage.setItem(fuelEnergyKey,String(v));render();alert('Umrechnungsfaktor gespeichert.');
}
function energyBalance(items){
 const km=items.map(r=>Number(r.km)).filter(v=>v>0);
 const distance=km.length>1?Math.max(...km)-Math.min(...km):0;
 const electric=items.filter(r=>r.type==='charge').reduce((a,r)=>a+Number(r.amount||0),0);
 const liters=items.filter(r=>r.type==='fuel').reduce((a,r)=>a+Number(r.amount||0),0);
 const fuelKwh=liters*fuelEnergyFactor();
 return {distance,electric,liters,fuelKwh,total:electric+fuelKwh};
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
function getChargingType(id){return chargingTypes()[id]||'';}
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
 pdf.heading('Übersicht');
 pdf.metrics([['Gesamtkosten',total.toFixed(2)+' '+settings.base],['Strom',energy.toFixed(1)+' kWh'],['Benzin',liters.toFixed(1)+' l'],['Vorgänge',String(data.length)]]);
 const balance=energyBalance(data);
 pdf.heading('Kombinierte Energiebilanz');
 if(balance.distance){pdf.metrics([['Strom / 100 km',(balance.electric*100/balance.distance).toFixed(1)+' kWh'],['Benzin / 100 km',(balance.fuelKwh*100/balance.distance).toFixed(1)+' kWh'],['Gesamt / 100 km',(balance.total*100/balance.distance).toFixed(1)+' kWh'],['Benzinfaktor',fuelEnergyFactor().toFixed(1)+' kWh/l']]);}else{pdf.note('kWh/100 km: mindestens zwei unterschiedliche Kilometerstände nötig.');}
 pdf.note('Chemischer Benzin-Energiegehalt; Verbrauch aus erfassten Mengen geschätzt.');
 pdf.heading('Energieanteile');
 pdf.donut([balance.electric,balance.fuelKwh],['Strom kWh','Benzin kWh']);
 pdf.heading('Kostenverteilung');
 pdf.donut([sum(charges,conv),sum(fuel,conv)],['Strom','Benzin']);
 pdf.heading(mode==='year'?'Kosten nach Monat':'Kosten nach Tag');
 const buckets=mode==='year'?Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')):[...new Set(data.map(r=>r.date.slice(8,10)))].sort();
 const points=buckets.map(k=>sum(data.filter(r=>(mode==='year'?r.date.slice(5,7):r.date.slice(8,10))===k),conv));
 pdf.bars(buckets,points);
 if(mode==='year'){
  pdf.heading('Monatsübersicht');
  pdf.table(['Monat','Ladungen','Tankungen','Kosten '+settings.base],buckets.map((k,i)=>{const rows=data.filter(r=>r.date.slice(5,7)===k);return [k,String(rows.filter(r=>r.type==='charge').length),String(rows.filter(r=>r.type==='fuel').length),sum(rows,conv).toFixed(2)];}),[70,125,125,165]);
 }
 pdf.heading('Einzelne Einträge');
 const sorted=data.slice().sort((x,y)=>String(x.date).localeCompare(String(y.date)));
 pdf.table(['Datum','Art','Menge','Ort','Kosten '+settings.base],sorted.map(r=>[r.date,r.type==='charge'?'Strom':'Benzin',Number(r.amount||0).toFixed(2)+(r.type==='charge'?' kWh':' l'),r.place||'–',conv(r).toFixed(2)]),[75,65,90,175,90]);
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
 newPage(){this.ops=[];this.pages.push(this.ops);this.y=745;this.rect(0,786,595,56,[0.06,0.17,0.28]);this.text(40,807,'PHEV TRACKER  /  '+this.title,17,[1,1,1],true);this.text(40,766,this.vehicle+'   |   '+new Date().toLocaleDateString('de-CH'),9);this.rect(40,42,515,1,[0.85,0.88,0.91]);this.text(40,27,'PHEV Tracker  -  Persönlicher Fahrzeugbericht',8,[0.45,0.49,0.55]);}
 space(h){if(this.y-h<70)this.newPage();}
 heading(v){this.space(42);this.y-=23;this.text(40,this.y,v,14,[0.07,0.22,0.36],true);this.y-=18;}
 metrics(items){this.space(83);const w=124;items.forEach((a,i)=>{const x=40+i*130;this.rect(x,this.y-60,w,63,[0.94,0.96,0.98]);this.text(x+9,this.y-20,a[0],9);this.text(x+9,this.y-44,a[1],13,[0.05,0.36,0.53],true);});this.y-=84;}
 donut(values,labels){this.space(115);const sum=values.reduce((a,b)=>a+b,0);const x=105,y=this.y-49,r=42;let start=-Math.PI/2;values.forEach((v,i)=>{if(v<=0)return;const n=Math.max(2,Math.ceil(v/sum*70)),end=start+2*Math.PI*v/sum;const points=[[x,y]];for(let j=0;j<=n;j++){const t=start+(end-start)*j/n;points.push([x+r*Math.cos(t),y+r*Math.sin(t)]);}this.color(i?[0.96,0.63,0.25]:[0.1,0.57,0.72]);this.cmd(points.map((p,k)=>p[0].toFixed(2)+' '+p[1].toFixed(2)+(k?' l':' m')).join(' ')+' h f');start=end;});if(!sum){this.text(75,y,'Keine Daten',10);}values.forEach((v,i)=>{this.rect(195,this.y-27-i*30,11,11,i?[0.96,0.63,0.25]:[0.1,0.57,0.72]);this.text(216,this.y-24-i*30,labels[i]+': '+v.toFixed(2)+' '+this.currency,11);});this.y-=113;}
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
  const snapshot={createdAt:new Date().toISOString(),source:cloudView?'cloud':'local',records:JSON.parse(JSON.stringify(records)),settings:JSON.parse(JSON.stringify(settings)),vehicles:JSON.parse(JSON.stringify(vehicles)),chargingTypes:chargingTypes(),comparison:getCostComparison()};
  const signature=JSON.stringify([snapshot.records,snapshot.settings,snapshot.vehicles,snapshot.chargingTypes,snapshot.comparison]);
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
