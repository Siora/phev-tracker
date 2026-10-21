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
 let response;
 try{response=await fetch(cloudApi+'?action='+encodeURIComponent(action),{
  method:data===undefined?'GET':'POST',
  headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(cloudToken?{'Authorization':'Bearer '+cloudToken}:{})},
  ...(data===undefined?{}:{body:JSON.stringify(data)}),
  cache:'no-store'
 });}
 catch{throw Error('Keine Verbindung zur Cloud-API. Bitte Internet und Serverfreigabe prüfen.');}
 let json;
 try{json=await response.json();}
 catch{throw Error('Ungültige Serverantwort (HTTP '+response.status+').');}
 if(!response.ok)throw Error(json.error||'Serverfehler (HTTP '+response.status+')');
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

async function loadCloudOverview(){syncError='';updateSyncIndicator();const d=await cloudCall('data');const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;const queued=JSON.parse(localStorage.getItem('phev-queue-'+email)||'[]');const merged=new Map(d.records.map(r=>[r.id,r]));for(const op of queued){if(op.action==='delete')merged.delete(op.id);else merged.set(op.record.id,op.record);}window.showCloudRecords([...merged.values()]);if(email)localStorage.setItem('phev-cache-'+email,JSON.stringify([...merged.values()]));syncCloudQueue();await loadVehicles();try{await loadChargingCatalog();}catch(error){console.warn('Ladeorte/Anbieter konnten nicht geladen werden',error);syncError='Ladeorte/Anbieter: '+error.message;}cloudPreferences=d.preferences||null;cloudPreferencesReady=!!d.preferences_available&&!!d.preferences;if(cloudPreferencesReady)window.applyCloudPreferences(cloudPreferences);updateSyncIndicator();ce('cloud-count').textContent='Cloud-Einträge: '+d.records.length+'.';}

async function loadVehicles(){
 try {
  const data=await cloudCall('vehicles');
  window.setVehicles(data.vehicles);
  ce('vehicle-status').textContent=data.vehicles.length+' Fahrzeuge in deinem Konto.';
  const list=ce('vehicle-list');list.replaceChildren();
  for(const v of data.vehicles){
   const p=document.createElement('p'),edit=document.createElement('button'),del=document.createElement('button');
   p.append(document.createTextNode(v.brand+' '+v.model+(v.plate?' · '+v.plate:'')+' '));
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
   p.append(edit,photo,del);list.append(p);
  }
 }catch(e){ce('vehicle-status').textContent='Fahrzeuge konnten nicht geladen werden: '+e.message;}
}
ce('bulk-assign').onclick=async()=>{
 const status=ce('bulk-status'),target=ce('bulkVehicle').value;
 if(!cloudToken)return status.textContent='Bitte zuerst anmelden.';
 if(!target)return status.textContent='Bitte ein Fahrzeug auswählen.';
 const count=Number(ce('bulk-count').textContent.match(/^\d+/)?.[0]||0);
 if(!count)return status.textContent='Alle Einträge sind bereits zugeordnet.';
 if(!confirm(count+' bisher nicht zugeordnete Einträge dem ausgewählten Fahrzeug zuweisen?'))return;
 const button=ce('bulk-assign');button.disabled=true;
 try{
  const changed=window.assignUnassignedToVehicle(target);
  status.textContent=changed+' Einträge zugeordnet. Die Cloud-Synchronisierung läuft; bitte die App geöffnet lassen, bis „Alle Änderungen synchronisiert“ erscheint.';
  ce('vehicleFilter').value=target;ce('period').value='12';render();
 }catch(e){status.textContent=e.message;}
 finally{button.disabled=false;}
};
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

function showAccount(email,role){document.body.classList.remove('login-locked');ce('cloud-identity').textContent=email+' · '+role;ce('cloud-login').classList.add('hide');ce('cloud-account').classList.remove('hide');ce('cloud-admin').classList.toggle('hide',role!=='admin');}
async function cloudUsers(){
 const result=await cloudCall('admin-users');
 ce('cloud-users').replaceChildren();
 result.users.forEach(user=>{
  const p=document.createElement('p');
  p.textContent=user.email+' · '+user.role;
  ce('cloud-users').append(p);
 });
}
ce('cloud-login').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('button');
 button.disabled=true;cs('Anmeldung läuft …');
 try{
  const result=await cloudCall('login',{email:form.elements.email.value,password:form.elements.password.value});
  cloudToken=result.token;updateSyncIndicator();
  localStorage.setItem(sessionKey,JSON.stringify({token:result.token,email:result.email,role:result.role}));
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

(async()=>{try{const saved=JSON.parse(localStorage.getItem(sessionKey)||'null');if(!saved?.token)return;cloudToken=saved.token;await loadCloudOverview();showAccount(saved.email,saved.role);cs('Sitzung wiederhergestellt.');if(saved.role==='admin')await cloudUsers();}catch(e){if(e.message==='Sitzung abgelaufen'||e.message==='Anmeldung erforderlich'){cloudToken=null;localStorage.removeItem(sessionKey);window.showLocalRecords();document.body.classList.add('login-locked');cs('Bitte erneut anmelden.');}else {const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;const cached=JSON.parse(localStorage.getItem('phev-cache-'+email)||'[]');if(cached.length){window.showCloudRecords(cached);showAccount(saved.email,saved.role);document.body.classList.add('login-locked');loadVehicles();cs('Offline: gespeicherte Einträge verfügbar.');}else cs('Cloud momentan nicht erreichbar.');}}})();


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
