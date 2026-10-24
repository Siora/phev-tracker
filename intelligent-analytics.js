/**
 * PHEV Tracker – Intelligentes Analyse-Dashboard (v93).
 *
 * Reine Berechnungen, ohne DOM, Browser-Speicher oder Cloud-Zugriff.
 * Alle Beträge werden vom Aufrufer in die konfigurierte Basiswährung
 * umgerechnet. Die Analyse ist regelbasiert, keine KI-Vorhersage.
 * Monatsvergleiche sind nur für vollständige Kalendermonate sinnvoll.
 */
window.PhevIntelligence=Object.freeze({
 /**
  * Vorsichtige Jahreshochrechnung auf Basis abgeschlossener Monate.
  * Aktueller und zukünftige Monate werden nicht als Nullkosten interpretiert.
  * Bei weniger als drei beobachteten Monaten wird keine Zahl prognostiziert.
  */
 /**
  * Wirtschaftlichkeitsszenario mit frei wählbarer jährlicher Fahrleistung,
  * Verbrauchswerten und Energiepreisen. Keine Nutzerdaten, keine Seiteneffekte.
  * Preis- und Kostenwerte müssen bereits in derselben Basiswährung vorliegen.
  * Es handelt sich um einen hypothetischen Vergleich, nicht um Ist-Kosten.
  */
 /**
  * Vergleicht identische abgeschlossene Kalendermonate zweier aufeinanderfolgender
  * Jahre. Fehlende Buchungen sind keine nachgewiesenen Nullkosten.
  */
 /**
  * Auffällige Einheitspreise gegenüber dem Median der übrigen Buchungen.
  * Mindestens vier Vergleichswerte je Energieart; Ausreißer werden nicht
  * als Fehler behauptet. Mengen und Kosten müssen positiv und endlich sein.
  */
 priceAnomalies(records,vehicleId,year,convertRecord){
  const scoped=records.filter(r=>(!vehicleId||String(r.vehicle_id)===String(vehicleId))&&
   (r.type==='charge'||r.type==='fuel')&&String(r.date||'').slice(0,4)<=String(year));
  const items=scoped.map(r=>{
   const amount=Number(r.amount),cost=Number(convertRecord(r));
   return {date:String(r.date||''),type:r.type,price:cost/amount};
  }).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&r.date.slice(0,4)<=String(year)&&
   Number.isFinite(r.price)&&r.price>0);
  const median=values=>{
   const sorted=values.slice().sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
   return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  };
  const alerts=[];
  for(const item of items.filter(r=>r.date.startsWith(String(year)+'-'))){
   const peers=items.filter(r=>r!==item&&r.type===item.type&&r.date<item.date).map(r=>r.price);
   if(peers.length<4)continue;
   const baseline=median(peers);
   const deviation=(item.price/baseline-1)*100;
   if(Math.abs(deviation)<35)continue;
   alerts.push({type:item.type,date:item.date,price:item.price,baseline,deviation});
  }
  return alerts.sort((a,b)=>Math.abs(b.deviation)-Math.abs(a.deviation)).slice(0,5);
 },
 compareYears(current,previous,year,today=new Date()){
  const count=year===today.getFullYear()?today.getMonth():year<today.getFullYear()?12:0;
  if(count===0)return {available:false,reason:'Noch keine abgeschlossenen Vergleichsmonate.'};
  const sum=(months,key)=>months.slice(0,count).reduce((n,m)=>n+(Number(m[key])||0),0);
  const currentTotal=sum(current,'total'),previousTotal=sum(previous,'total');
  if(previousTotal<=0)return {available:false,reason:'Im Vorjahreszeitraum sind keine Vergleichskosten erfasst.'};
  const difference=currentTotal-previousTotal;
  return {available:true,months:count,currentTotal,previousTotal,difference,percent:difference/previousTotal*100,
   partial:count<12,breakdown:['charge','fuel','extra'].map(key=>({key,current:sum(current,key),previous:sum(previous,key)}))};
 },
 economicsScenario(input){
  const n=key=>Number(input[key]);
  const fields=['annualKm','electricShare','kwhPer100','litersPer100','priceKwh','priceLiter','fixedAnnual'];
  if(!input||fields.some(key=>!Number.isFinite(n(key))))return {available:false,reason:(globalThis.window?.PhevI18n?.t('analytics.invalidAssumptions')||'Bitte alle Annahmen als gültige Zahlen eingeben.')};
  if(n('annualKm')<=0||n('annualKm')>150000||n('electricShare')<0||n('electricShare')>100||
   n('kwhPer100')<0||n('kwhPer100')>100||n('litersPer100')<0||n('litersPer100')>100||
   n('priceKwh')<0||n('priceLiter')<0||n('fixedAnnual')<0)return {available:false,reason:'Die Annahmen liegen außerhalb des zulässigen Bereichs.'};
  const electricKm=n('annualKm')*n('electricShare')/100;
  const fuelKm=n('annualKm')-electricKm;
  const electricity=electricKm/100*n('kwhPer100')*n('priceKwh');
  const fuel=fuelKm/100*n('litersPer100')*n('priceLiter');
  const fixed=n('fixedAnnual');
  const annual=electricity+fuel+fixed;
  return {available:true,electricKm,fuelKm,electricity,fuel,fixed,annual,costPer100:annual/n('annualKm')*100};
 },
 forecast(months,year,today=new Date()){
  const currentYear=today.getFullYear();
  const completed=year<currentYear?12:year===currentYear?today.getMonth():0;
  if(year>currentYear||completed===0)return {available:false,reason:"Für diesen Zeitraum gibt es noch keine abgeschlossenen Monate."};
  const observed=months.slice(0,completed);
  const active=observed.filter(m=>m.total>0);
  if(active.length<3)return {available:false,reason:"Mindestens drei Monate mit erfassten Kosten sind für eine Hochrechnung erforderlich."};
  const actual=observed.reduce((sum,m)=>sum+m.total,0);
  const average=actual/completed;
  const projected=year<currentYear?actual:average*12;
  return {available:true,actual,average,projected,remaining:Math.max(0,projected-actual),completed,active:active.length,partial:active.length<completed,final:year<currentYear};
 },
 analyze(records,expenses,vehicleId,year,convertRecord,convertExpense){
  const valid=records.filter(r=>String(r.date||'').startsWith(String(year)+'-')&&(!vehicleId||String(r.vehicle_id)===String(vehicleId)));
  const extra=expenses.filter(r=>String(r.date||'').startsWith(String(year)+'-')&&(!vehicleId||String(r.vehicle_id)===String(vehicleId)));
  const months=Array.from({length:12},(_,i)=>({month:String(i+1).padStart(2,'0'),charge:0,fuel:0,extra:0,kwh:0,liters:0,charges:0,fuels:0}));
  for(const r of valid){
   const index=Number(String(r.date).slice(5,7))-1;
   if(index<0||index>11)continue;
   const value=Number(convertRecord(r));
   if(!Number.isFinite(value))continue;
   if(r.type==='charge'){months[index].charge+=value;months[index].kwh+=Number(r.amount)||0;months[index].charges++;}
   if(r.type==='fuel'){months[index].fuel+=value;months[index].liters+=Number(r.amount)||0;months[index].fuels++;}
  }
  for(const e of extra){
   const index=Number(String(e.date).slice(5,7))-1;
   const value=Number(convertExpense(e));
   if(index>=0&&index<12&&Number.isFinite(value))months[index].extra+=value;
  }
  months.forEach(m=>{m.total=m.charge+m.fuel+m.extra;});
  const sum=key=>months.reduce((n,m)=>n+m[key],0);
  const total=sum('total'),energyCost=sum('charge'),fuelCost=sum('fuel'),otherCost=sum('extra');
  const active=months.filter(m=>m.total>0);
  const expensive=active.slice().sort((a,b)=>b.total-a.total)[0]||null;
  const today=new Date();
  const completed=year<today.getFullYear()?12:year===today.getFullYear()?today.getMonth():0;
  const current=months.slice(0,completed);
  const previous=current.length>=2?current[current.length-2]:null;
  const last=current.length?current[current.length-1]:null;
  const change=previous&&previous.total>0&&last?(last.total-previous.total)/previous.total*100:null;
  const messages=[];
  if(!valid.length&&!extra.length)messages.push({type:'info',title:'Noch keine Daten',detail:(globalThis.window?.PhevI18n?.t('analytics.addRecords')||'Erfasse Ladungen, Tankungen oder Fahrzeugausgaben für dieses Jahr.')});
  else{
   if(expensive)messages.push({type:'info',title:'Kostenintensivster Monat',detail:expensive.month+'/'+year+' mit '+expensive.total.toFixed(2)+' in der Basiswährung.'});
   if(change!==null&&Math.abs(change)>=20)messages.push({type:'warning',title:(globalThis.window?.PhevI18n?.t('analytics.significantChange')||'Deutliche Kostenänderung'),detail:(globalThis.window?.PhevI18n?.t('analytics.previousMonth')||'Letzter abgeschlossener Monat gegenüber dem Vormonat: ')+(change>0?'+':'')+change.toFixed(1)+' %. Die Anzahl der Vorgänge kann variieren.'});
   if(sum('kwh')>0&&sum('liters')>0)messages.push({type:'info',title:'Gemischter Energieeinsatz',detail:'Strom und Benzin wurden beide erfasst. Ohne Fahrstrecken pro Antriebsart ist kein elektrischer Fahranteil bestimmbar.'});
  }
  const forecast=window.PhevIntelligence.forecast(months,year,today);
  return {forecast,year,months,total,energyCost,fuelCost,otherCost,kwh:sum('kwh'),liters:sum('liters'),charges:sum('charges'),fuels:sum('fuels'),expensive,change,messages};
 }
});
