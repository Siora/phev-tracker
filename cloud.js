/*
 * PHEV Tracker – Cloud-Synchronisierung und Benutzerverwaltung
 *
 * Enthält Anmeldung, Cloud-Datenabgleich, Warteschlange und Admin-Funktionen.
 * Bestehende Datensätze dürfen bei Synchronisierung nicht verloren gehen.
 */

const cloudApi='https://tracker.web-produktion.com/api/api.php';
let cloudToken=null;
let cloudPreferences=null;
let cloudPreferencesReady=false;
let preferencesTimer=null;
const sessionKey='phev-session-v1';
const ce=id=>document.getElementById(id);
const cs=message=>ce('cloud-status').textContent=message;
let syncError='';
let syncingPreferences=false;
function pendingCount(){
 const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;
 if(!email)return 0;
 try{return JSON.parse(localStorage.getItem('phev-queue-'+email)||'[]').length;}catch{return 0;}
}
function updateSyncIndicator(){
 const el=ce('cloud-sync-indicator');if(!el)return;
 const pending=pendingCount();
 let message='Nicht angemeldet',state='idle';
 if(cloudToken){
  if(!navigator.onLine){message='Offline – Änderungen warten auf Verbindung';state='waiting';}
  else if(cloudSyncing||syncingPreferences){message='Synchronisierung läuft …';state='syncing';}
  else if(syncError){message='Synchronisierungsfehler – '+syncError;state='error';}
  else if(pending){message=pending+' Änderung(en) warten auf Synchronisierung';state='waiting';}
  else{message='Synchronisiert';state='ok';}
 }
 el.textContent=message;el.dataset.state=state;
}
async function cloudCall(action,data){
 const response=await fetch(cloudApi+'?action='+encodeURIComponent(action),{
  method:data===undefined?'GET':'POST',
  headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(/^[a-f0-9]{64}$/.test(cloudToken||'')?{'Authorization':'Bearer '+cloudToken}:{})},
  ...(data===undefined?{}:{body:JSON.stringify(data)}),
  credentials:'same-origin',
  cache:'no-store'
 });
 const json=await response.json();
 if(!response.ok)throw Error(json.error||'Serverfehler');
 return json;
}

let catalogSynced={locations:[],providers:[]};
async function loadChargingCatalog(){
 const catalog=await cloudCall('charging-catalog');
 window.setManagedCharging(catalog);
 catalogSynced=structuredClone(catalog);
}
window.syncManagedCharging=async function(next){
 if(!cloudToken)return;
 syncingPreferences=true;updateSyncIndicator();
 try{
  for(const category of ['locations','providers']){
   const previous=catalogSynced[category]||[];
   const current=next[category]||[];
   for(const item of current){
    const old=previous.find(x=>x.id===item.id);
    if(!old || old.name!==item.name || (old.kind||'')!==(item.kind||'') || String(old.price??'')!==String(item.price??'')){
     await cloudCall('charging-catalog-save',{category,entry:item});
    }
   }
   for(const item of previous)if(!current.some(x=>x.id===item.id))await cloudCall('charging-catalog-delete',{category,id:item.id});
  }
  catalogSynced=structuredClone(next);
  syncError='';
  ce('managed-charging-status').textContent='Ladeorte und Anbieter in MySQL synchronisiert.';
 }catch(e){syncError=e.message;ce('managed-charging-status').textContent='Cloud-Speicherung fehlgeschlagen: '+e.message;}
 finally{syncingPreferences=false;updateSyncIndicator();}
};

async function loadCloudOverview(){syncError='';updateSyncIndicator();await loadVehicles();const d=await cloudCall('data');const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;const queued=JSON.parse(localStorage.getItem('phev-queue-'+email)||'[]');const merged=new Map(d.records.map(r=>[r.id,r]));for(const op of queued){if(op.action==='delete')merged.delete(op.id);else merged.set(op.record.id,op.record);}window.showCloudRecords([...merged.values()]);if(email)localStorage.setItem('phev-cache-'+email,JSON.stringify([...merged.values()]));syncCloudQueue();await loadChargingCatalog();cloudPreferences=d.preferences||null;cloudPreferencesReady=!!d.preferences_available&&!!d.preferences;if(cloudPreferencesReady)window.applyCloudPreferences(cloudPreferences);updateSyncIndicator();ce('cloud-count').textContent='Cloud-Einträge: '+d.records.length+'.';}

async function loadVehicles(){
 try {
  const data=await cloudCall('vehicles');
  window.setVehicles(data.vehicles);
  const accountEmail=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;
  if(accountEmail)localStorage.setItem('phev-vehicles-cache-'+accountEmail,JSON.stringify(data.vehicles));
  ce('vehicle-status').textContent=data.vehicles.length+' Fahrzeuge in deinem Konto.';
  const list=ce('vehicle-list');list.replaceChildren();
  const table=document.createElement('table');table.className='management-table vehicle-management-table';
  const thead=document.createElement('thead'),heading=document.createElement('tr');
  for(const title of ['Fahrzeug','Baujahr','Kennzeichen','Antrieb','Batterie','Tank','Aktionen']){const th=document.createElement('th');th.scope='col';th.textContent=title;heading.append(th);}
  thead.append(heading);table.append(thead);
  const tbody=document.createElement('tbody');
  if(!data.vehicles.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='Noch keine Fahrzeuge angelegt.';tr.append(td);tbody.append(tr);}
  for(const v of data.vehicles){
   const row=document.createElement('tr');
   for(const value of [[v.brand,v.model].filter(Boolean).join(' '),v.model_year||'–',v.plate||'–',v.drivetrain||'–',v.battery_kwh==null?'–':v.battery_kwh+' kWh',v.tank_liters==null?'–':v.tank_liters+' l']){
    const cell=document.createElement('td');cell.textContent=value;row.append(cell);
   }
   const actions=document.createElement('td');actions.className='management-actions';
   const edit=document.createElement('button'),del=document.createElement('button');
   edit.textContent='Bearbeiten';edit.onclick=()=>{
    const f=ce('vehicle-form');f.dataset.id=v.id;
    for(const key of ['brand','model','model_year','plate','drivetrain','battery_kwh','tank_liters','notes'])f.elements[key].value=v[key]??'';
    f.querySelector('button[type=submit]').textContent='Änderungen speichern';
   };
   del.textContent='Löschen';del.onclick=async()=>{
    if(!confirm('Fahrzeug löschen? Fahrzeuge mit Einträgen können nicht gelöscht werden.'))return;
    try{await cloudCall('vehicle-delete',{id:v.id});await loadVehicles();}catch(e){ce('vehicle-status').textContent=e.message;}
   };
   const photo=document.createElement('button');
   photo.type='button';photo.textContent='Foto festlegen';
   photo.onclick=()=>{
    const previous=localStorage.getItem('phev-photo-'+v.id)||'';
    const url=prompt('HTTPS-Adresse eines Fahrzeugfotos eingeben. Leer lassen, um wieder das automatische Bild zu verwenden:',previous);
    if(url===null)return;
    try{window.setVehiclePhoto(v.id,url);ce('vehicle-status').textContent=url.trim()?'Fahrzeugfoto gespeichert.':'Automatische Bildauswahl wieder aktiviert.';}
    catch(error){ce('vehicle-status').textContent=error.message;}
   };

   actions.append(edit,photo,del);row.append(actions);tbody.append(row);
  }
  table.append(tbody);list.append(table);
 }catch(e){ce('vehicle-status').textContent='Fahrzeuge konnten nicht geladen werden: '+e.message;}
}
ce('vehicle-cancel').onclick=()=>{
 const f=ce('vehicle-form');f.reset();delete f.dataset.id;f.querySelector('button[type=submit]').textContent='Fahrzeug speichern';
};
ce('vehicle-form').onsubmit=async e=>{
 e.preventDefault();
 if(!cloudToken)return ce('vehicle-status').textContent='Bitte zuerst anmelden.';
 const f=e.currentTarget,button=f.querySelector('button[type=submit]');button.disabled=true;
 try{
  const v={id:f.dataset.id?Number(f.dataset.id):null};
  for(const key of ['brand','model','model_year','plate','drivetrain','battery_kwh','tank_liters','notes'])v[key]=f.elements[key].value;
  await cloudCall('vehicle-save',{vehicle:v});
  ce('vehicle-cancel').click();await loadVehicles();
 }catch(error){ce('vehicle-status').textContent=error.message;}
 finally{button.disabled=false;}
};

function showAccount(email,role){document.body.classList.remove('login-locked');ce('cloud-identity').textContent=email+' · '+role;ce('cloud-login').classList.add('hide');ce('cloud-account').classList.remove('hide');ce('cloud-admin').classList.toggle('hide',role!=='admin');if(!ce('cloud-status').textContent||/^(Nicht angemeldet\.?|Bitte erneut anmelden\.?)/.test(ce('cloud-status').textContent))cs('Angemeldet.');updateSyncIndicator();}
async function cloudUsers(){
 const result=await cloudCall('admin-users');
 const container=ce('cloud-users');container.replaceChildren();
 const table=document.createElement('table');table.className='management-table';
 const thead=document.createElement('thead'),heading=document.createElement('tr');
 for(const label of ['E-Mail-Adresse','Rolle']){const th=document.createElement('th');th.scope='col';th.textContent=label;heading.append(th);}
 thead.append(heading);table.append(thead);
 const tbody=document.createElement('tbody');
 if(!result.users.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=2;cell.textContent='Noch keine Benutzer vorhanden.';row.append(cell);tbody.append(row);}
 for(const user of result.users){
  const row=document.createElement('tr');
  for(const value of [user.email,user.role==='admin'?'Administrator':'Benutzer']){
   const cell=document.createElement('td');cell.textContent=value;row.append(cell);
  }
  tbody.append(row);
 }
 table.append(tbody);container.append(table);
}

ce('cloud-login').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('button');
 button.disabled=true;cs('Anmeldung läuft …');
 try{
  const result=await cloudCall('login',{email:form.elements.email.value,password:form.elements.password.value});
  cloudToken='cookie';updateSyncIndicator();
  localStorage.setItem(sessionKey,JSON.stringify({email:result.email,role:result.role}));
  showAccount(result.email,result.role);
  await loadCloudOverview();
  form.elements.password.value='';
  cs('Angemeldet. Lokale Einträge bleiben unverändert.');
  if(result.role==='admin')await cloudUsers();
 }catch(error){cs(error.message);}
 finally{button.disabled=false;}
};
ce('cloud-create').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('button');
 button.disabled=true;
 try{
  await cloudCall('admin-create-user',{email:form.elements.email.value,password:form.elements.password.value,role:form.elements.role.value});
  form.reset();cs('Benutzer erstellt.');await cloudUsers();
 }catch(error){cs(error.message);}
 finally{button.disabled=false;}
};
ce('cloud-check').onclick=async()=>{
 try{
  const result=await cloudCall('data');
  ce('cloud-count').textContent='Cloud-Einträge: '+result.records.length+'. Keine lokalen Änderungen.';
 }catch(error){cs(error.message);}
};
ce('cloud-logout').onclick=async()=>{
 try{await cloudCall('logout',{});}catch(error){}
 cloudToken=null;cloudPreferencesReady=false;cloudPreferences=null;syncError='';updateSyncIndicator();
 document.body.classList.add('login-locked');
 localStorage.removeItem(sessionKey);
 window.showLocalRecords();
 ce('vehicle-status').textContent='Bitte anmelden, um Fahrzeuge zu verwalten.';
 ce('cloud-account').classList.add('hide');
 ce('cloud-login').classList.remove('hide');
 ce('cloud-count').textContent='';
 cs('Abgemeldet.');
};

ce('cloud-upload').onclick=async()=>{
 const btn=ce('cloud-upload');
 if(!cloudToken)return;
 const local=JSON.parse(localStorage.getItem('phev-records-1')||'[]');
 const remote=await cloudCall('data');
 const ids=new Set(remote.records.map(r=>r.id));
 const todo=local.filter(r=>!ids.has(r.id));
 if(!todo.length)return cs('Keine neuen lokalen Einträge.');
 if(!confirm(todo.length+' Einträge hochladen?'))return;
 btn.disabled=true;
 try{
  for(const record of todo)await cloudCall('save',{record});
  const check=await cloudCall('data');
  ce('cloud-upload-info').textContent='Cloud-Einträge: '+check.records.length;
  cs('Import abgeschlossen. Lokale Daten unverändert.');
  await loadCloudOverview();
 }catch(e){cs('Import unterbrochen: '+e.message);}
 finally{btn.disabled=false;}
};

(async()=>{
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem(sessionKey)||'null');}catch{}
 // A legacy bearer token remains supported until the next normal login.
 cloudToken=/^[a-f0-9]{64}$/.test(saved?.token||'')?saved.token:'cookie';
 try{
  const account=await cloudCall('session');
  const email=account.email,role=account.role;
  localStorage.setItem(sessionKey,JSON.stringify(cloudToken==='cookie'?{email,role}:{token:cloudToken,email,role}));
  showAccount(email,role);
  try{
   const cachedVehicles=JSON.parse(localStorage.getItem('phev-vehicles-cache-'+email)||'null');
   if(Array.isArray(cachedVehicles)){window.setVehicles(cachedVehicles);ce('vehicle-status').textContent=cachedVehicles.length+' gespeicherte Fahrzeuge (Cloud wird aktualisiert).';}
   const cachedRecords=JSON.parse(localStorage.getItem('phev-cache-'+email)||'null');
   if(Array.isArray(cachedRecords))window.showCloudRecords(cachedRecords);
  }catch(cacheError){console.warn('Cloud cache could not be restored',cacheError);}
  await loadCloudOverview();
  cs('Sitzung wiederhergestellt.');
  if(role==='admin')await cloudUsers();
 }catch(e){
  const message=String(e?.message||'');
  if(message==='Sitzung abgelaufen'||message==='Anmeldung erforderlich'){
   cloudToken=null;
   // Do not discard the account identity, queues or caches on expiry.
   if(saved?.email)localStorage.setItem(sessionKey,JSON.stringify({email:saved.email,role:saved.role}));
   ce('cloud-account').classList.add('hide');
   ce('cloud-login').classList.remove('hide');
   ce('cloud-admin').classList.add('hide');
   updateSyncIndicator();
   document.body.classList.add('login-locked');
   cs('Bitte erneut anmelden. Gespeicherte Einträge bleiben erhalten.');
  }else{
   // Keep locally cached data and session identity when server is unreachable.
   const email=saved?.email;
   if(email){
    try{
     const cachedVehicles=JSON.parse(localStorage.getItem('phev-vehicles-cache-'+email)||'null');
     if(Array.isArray(cachedVehicles))window.setVehicles(cachedVehicles);
     const cachedRecords=JSON.parse(localStorage.getItem('phev-cache-'+email)||'null');
     if(Array.isArray(cachedRecords))window.showCloudRecords(cachedRecords);
    }catch{}
   }
   if(saved?.email&&saved?.role){showAccount(saved.email,saved.role);ce('cloud-admin').classList.add('hide');}
   cs('Verbindung momentan nicht verfügbar. Anmeldung bleibt gespeichert; bitte später erneut versuchen.');
   syncError=message||'Verbindung unterbrochen';updateSyncIndicator();
  }
 }
})();

window.scheduleCloudPreferences=function(){
 if(!cloudPreferencesReady||!cloudToken)return;
 clearTimeout(preferencesTimer);
 syncingPreferences=true;updateSyncIndicator();
 preferencesTimer=setTimeout(async()=>{
  try{
   const current=window.collectCloudPreferences();
   const merged={...cloudPreferences,...current,photos:{...(cloudPreferences?.photos||{}),...(current.photos||{})}};
   await cloudCall('preferences',{preferences:merged});
   cloudPreferences=merged;syncError='';
   cs('Einstellungen in der Cloud gespeichert.');
  }catch(e){syncError=e.message;cs('Einstellungen lokal gespeichert; Cloud-Sync fehlgeschlagen: '+e.message);}
  finally{syncingPreferences=false;updateSyncIndicator();}
 },700);
};
ce('cloud-preferences-upload').onclick=async()=>{
 if(!cloudToken)return cs('Bitte zuerst anmelden.');
 if(!confirm('Lokale Einstellungen und Fahrzeugfoto-Links in dein Cloud-Konto übernehmen? Vorhandene Cloud-Einstellungen können dadurch ersetzt werden.'))return;
 const button=ce('cloud-preferences-upload');button.disabled=true;
 try{
  const current=window.collectCloudPreferences();
  const merged={...(cloudPreferences||{}),...current,photos:{...(cloudPreferences?.photos||{}),...(current.photos||{})}};
  await cloudCall('preferences',{preferences:merged});
  cloudPreferences=merged;cloudPreferencesReady=true;syncError='';updateSyncIndicator();
  cs('Lokale Einstellungen erfolgreich in die Cloud übernommen.');
 }catch(e){cs('Übernahme fehlgeschlagen: '+e.message);}
 finally{button.disabled=false;}
};

let cloudSyncing=false;
window.queueCloudChanges=function(items){const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;if(!email)return;const cacheKey='phev-cache-'+email,queueKey='phev-queue-'+email;const old=JSON.parse(localStorage.getItem(cacheKey)||'[]');const previous=new Map(old.map(r=>[r.id,r]));const next=new Map(items.map(r=>[r.id,r]));let queue=JSON.parse(localStorage.getItem(queueKey)||'[]');for(const r of items)if(JSON.stringify(previous.get(r.id))!==JSON.stringify(r))queue.push({action:'save',record:r});for(const r of old)if(!next.has(r.id))queue.push({action:'delete',id:r.id});localStorage.setItem(queueKey,JSON.stringify(queue));localStorage.setItem(cacheKey,JSON.stringify(items));syncError='';updateSyncIndicator();syncCloudQueue();};
async function syncCloudQueue(){if(cloudSyncing||!cloudToken||!navigator.onLine)return;const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;if(!email)return;const key='phev-queue-'+email;cloudSyncing=true;updateSyncIndicator();try{let queue=JSON.parse(localStorage.getItem(key)||'[]');while(queue.length){const op=queue[0];await cloudCall(op.action,op.action==='save'?{record:op.record}:{id:op.id});const latest=JSON.parse(localStorage.getItem(key)||'[]');latest.shift();localStorage.setItem(key,JSON.stringify(latest));queue=latest;}syncError='';cs('Alle Änderungen synchronisiert.');}catch(e){syncError=e.message;cs('Änderungen lokal vorgemerkt: '+e.message);}finally{cloudSyncing=false;updateSyncIndicator();}}
window.addEventListener('online',()=>{syncError='';updateSyncIndicator();syncCloudQueue();});
window.addEventListener('offline',updateSyncIndicator);
window.addEventListener('storage',updateSyncIndicator);
updateSyncIndicator();
