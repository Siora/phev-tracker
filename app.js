/*
 * PHEV Tracker – Anwendungslogik
 *
 * Zuständig für lokale Einträge, Fahrzeugauswahl, Filter, Auswertungen,
 * Import/Export sowie die Darstellung des Dashboards.
 * Die Cloud-Anbindung ist in cloud.js gekapselt.
 */

const $=x=>document.getElementById(x),key='phev-records-1';
let cloudView=false;
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

/* Modellvergleich: keine Änderung der gespeicherten Lade- oder Tankdatensätze. */
const costComparisonKey='phev-cost-comparison-v1';
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
function exportPdfReport(mode){
 const year=Number($('report-year').value),month=$('report-month').value,vehicleId=$('report-vehicle').value;
 if(!Number.isInteger(year)||year<2020||year>2100){alert('Bitte ein gültiges Jahr auswählen.');return;}
 const period=String(year)+(mode==='month'?'-'+month:'');
 const data=records.filter(r=>r.date.startsWith(period)&&(!vehicleId||String(r.vehicle_id)===vehicleId));
 const chosen=vehicles.find(v=>String(v.id)===vehicleId);
 const title=mode==='month'?'Monatsbericht '+month+'.'+year:'Jahresbericht '+year;
 const heading=chosen?vehicleName(chosen):'Alle Fahrzeuge';
 const lines=[title,'Fahrzeug: '+heading,'Erstellt: '+new Date().toLocaleDateString('de-CH'),'Waehrung: '+settings.base,''];
 const addStats=(label,items)=>{
  const charges=items.filter(r=>r.type==='charge'),fuel=items.filter(r=>r.type==='fuel');
  const amount=arr=>arr.reduce((total,r)=>total+Number(r.amount||0),0);
  const cost=arr=>arr.reduce((total,r)=>total+conv(r),0);
  lines.push(label);
  lines.push('Ladungen: '+charges.length+' | Energie: '+amount(charges).toFixed(2)+' kWh | Kosten: '+fmt(cost(charges),settings.base));
  lines.push('Tankungen: '+fuel.length+' | Benzin: '+amount(fuel).toFixed(2)+' l | Kosten: '+fmt(cost(fuel),settings.base));
  lines.push('Gesamtkosten: '+fmt(cost(items),settings.base),'');
 };
 addStats('Zusammenfassung',data);
 if(mode==='year'){
  for(let m=1;m<=12;m++){
   const prefix=year+'-'+String(m).padStart(2,'0');
   addStats('Monat '+String(m).padStart(2,'0'),data.filter(r=>r.date.startsWith(prefix)));
  }
 }else{
  lines.push('Einzelne Vorgaenge (Datum | Art | Menge | Kosten)');
  for(const r of data.slice().sort((a,b)=>a.date.localeCompare(b.date))){
   lines.push(r.date+' | '+(r.type==='charge'?'Strom':'Benzin')+' | '+Number(r.amount).toFixed(2)+(r.type==='charge'?' kWh':' l')+' | '+fmt(conv(r),settings.base));
  }
 }
 if(!data.length)lines.push('Keine Eintraege im ausgewaehlten Zeitraum.');
 lines.push('Hinweis: Umrechnung gemaess den aktuell gespeicherten Waehrungseinstellungen.');
 const pdf=makeSimplePdf(lines);
 const url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'}));
 const a=document.createElement('a');a.href=url;a.download='phev-'+(mode==='month'?'monat-':'jahr-')+period+'.pdf';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function makeSimplePdf(lines){
 // PDF-Standardfont Helvetica mit WinAnsi-kompatibler ASCII-Umschrift.
 const plain=text=>String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^\x20-\x7e]/g,'?');
 const esc=text=>plain(text).replace(/[\\()]/g,'\\$&');
 const pages=[];
 for(let i=0;i<lines.length;i+=49)pages.push(lines.slice(i,i+49));
 if(!pages.length)pages.push([]);
 const objects=['','<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const kids=[];
 for(const page of pages){
  const pageId=objects.length,contentId=pageId+1;kids.push(pageId+' 0 R');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents '+contentId+' 0 R >>');
  const content='BT /F1 11 Tf 45 790 Td 15 TL '+page.map((line,i)=>(i?'T* ':'')+'('+esc(line.slice(0,95))+') Tj').join('\n')+' ET';
  objects.push('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
 }
 objects[2]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+kids.length+' >>';
 let out='%PDF-1.4\n',offsets=[0];
 for(let i=1;i<objects.length;i++){offsets[i]=out.length;out+=i+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const start=out.length;
 out+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
 for(let i=1;i<objects.length;i++)out+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 out+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
 return new TextEncoder().encode(out);
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
