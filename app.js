const $=x=>document.getElementById(x),key='phev-records-1';
let cloudView=false;
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
function tab(t){
  ['home','add','csv','options','cloud'].forEach(x=>$(x).classList.toggle('hide',x!==t));
  document.querySelectorAll('.sidebar nav button').forEach((b,i)=>b.classList.toggle('active',['home','add','csv','options','cloud'][i]===t));
  render();
  window.scrollTo(0,0)
}
function save(){
  if(cloudView){window.queueCloudChanges(records);render();return;}
  localStorage.setItem(key,JSON.stringify(records));
  render()
}
function render(){
  const now=new Date(),period=$('period').value;
  let y=now.getFullYear(),m=now.getMonth();
  $('customdates').classList.toggle('hide',period!=='custom');
  let provider=$('provider'),current=provider.value,providers=[...new Set(records.filter(x=>x.type==='charge').map(x=>x.place||'Unbekannt'))].sort();
  provider.replaceChildren(new Option('Alle Anbieter',''),...providers.map(x=>new Option(x,x)));
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
  let all=records.filter(x=>{
    let d=new Date(x.date+'T12:00:00');return d>=from&&d<to
  }),filtered=all.filter(x=>!provider.value||(x.type==='charge'&&(x.place||'Unbekannt')===provider.value)),charges=filtered.filter(x=>x.type==='charge'),fuel=filtered.filter(x=>x.type==='fuel'),km=filtered.map(x=>x.km).filter(x=>x>0),distance=km.length>1?Math.max(...km)-Math.min(...km):0,cost=filtered.reduce((v,x)=>v+conv(x),0),electric=charges.reduce((v,x)=>v+conv(x),0),petrol=fuel.reduce((v,x)=>v+conv(x),0);
  let tiles=[['⚡ Geladene Energie',charges.reduce((v,x)=>v+x.amount,0).toFixed(2)+' kWh'],['⛽ Benzin',fuel.reduce((v,x)=>v+x.amount,0).toFixed(2)+' l'],['💰 Gesamtkosten',fmt(cost,settings.base)],['🔌 Stromkosten',fmt(electric,settings.base)],['⛽ Benzinkosten',fmt(petrol,settings.base)],['🚗 Kosten / 100 km',distance?fmt(cost/distance*100,settings.base):'–'],['Ladevorgänge',charges.length],['Tankungen',fuel.length]];
  $('stats').innerHTML=tiles.map(x=>'<div class="tile"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join('');
  const metric = $('trendMetric').value;
  AnalyticsCharts.trend($('trendchart'), filtered, metric, settings.base, conv);
  AnalyticsCharts.donut($('donutchart'), filtered, settings.base, conv);
  AnalyticsCharts.price($('pricechart'), filtered, settings.base, conv);
  AnalyticsCharts.providers($('providerchart'), charges);
  $('entries').replaceChildren();
  filtered.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(x=>{
    let div=document.createElement('div'),btn=document.createElement('button'),edit=document.createElement('button');div.className='item';div.textContent=x.date+' · '+(x.type==='charge'?'⚡ ':'⛽ ')+x.amount+(x.type==='charge'?' kWh · ':' l · ')+fmt(x.cost,x.currency)+' · '+(x.place||'');edit.textContent='Bearbeiten';edit.onclick=()=>{
      let f=$('form');f.elements.type.value=x.type;f.elements.date.value=x.date;f.elements.amount.value=x.amount;f.elements.cost.value=x.cost;f.elements.currency.value=x.currency;f.elements.km.value=x.km||'';f.elements.place.value=x.place||'';f.dataset.editId=x.id;f.querySelector('button').textContent='Änderungen speichern';tab('add')
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
$('form').onsubmit=e=>{
  e.preventDefault();
  let f=new FormData(e.target),x={
    id:crypto.randomUUID(),type:f.get('type'),date:f.get('date'),amount:n(f.get('amount')),cost:n(f.get('cost')),currency:f.get('currency'),km:f.get('km')?n(f.get('km')):null,place:f.get('place')||''
  };
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
  save();
  e.target.reset();
  tab('home')
};
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
window.showCloudRecords=function(items){cloudView=true;records=items.map(x=>({...x,amount:Number(x.amount),cost:Number(x.cost),km:x.km===null?null:Number(x.km)}));tab('home');};
window.showLocalRecords=function(){cloudView=false;records=JSON.parse(localStorage.getItem(key)||'[]');tab('home');};
function exportCSV(){
 const columns=['id','type','date','amount','cost','currency','km','place'];
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
    records,settings
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
  let updated=0,added=0;
  pending.forEach(x=>{
    let i=records.findIndex(r=>r.type==='charge'&&r.date===x.date&&r.place.trim().toLowerCase()===x.place.trim().toLowerCase()&&Math.abs(r.cost-x.cost)<0.011&&r.currency===x.currency);if(i>=0){
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
