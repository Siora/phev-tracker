/*
 * PHEV Tracker – Verbrauchs- und Energiebilanz (v86)
 *
 * Enthält Verbrauchstrends, Energieäquivalenz Benzin, Kostenvergleich
 * und die Gruppierung von AC/DC-Ladevorgängen.
 *
 * Abhängigkeiten: globale App-Helfer ($, n, conv, fmt), records,
 * vehicles und settings aus app.js. Funktionen werden erst nach der
 * Initialisierung der App aufgerufen. Keine Veränderung der Datenschemata.
 *
 * Änderungen an Vergleichsfaktoren und Ladearten verwenden weiterhin
 * die bestehenden LocalStorage-Schlüssel und Cloud-Preferences.
 */

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

