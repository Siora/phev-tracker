const cloudApi='https://tracker.web-produktion.com/api/api.php';
let cloudToken=null;
const sessionKey='phev-session-v1';
const ce=id=>document.getElementById(id);
const cs=message=>ce('cloud-status').textContent=message;
async function cloudCall(action,data){
 const response=await fetch(cloudApi+'?action='+encodeURIComponent(action),{
  method:data===undefined?'GET':'POST',
  headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(cloudToken?{'Authorization':'Bearer '+cloudToken}:{})},
  ...(data===undefined?{}:{body:JSON.stringify(data)}),
  cache:'no-store'
 });
 const json=await response.json();
 if(!response.ok)throw Error(json.error||'Serverfehler');
 return json;
}
async function loadCloudOverview(){const d=await cloudCall('data');const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;const queued=JSON.parse(localStorage.getItem('phev-queue-'+email)||'[]');const merged=new Map(d.records.map(r=>[r.id,r]));for(const op of queued){if(op.action==='delete')merged.delete(op.id);else merged.set(op.record.id,op.record);}window.showCloudRecords([...merged.values()]);if(email)localStorage.setItem('phev-cache-'+email,JSON.stringify([...merged.values()]));syncCloudQueue();ce('cloud-count').textContent='Cloud-Einträge: '+d.records.length+' (schreibgeschützt).';}
function showAccount(email,role){ce('cloud-identity').textContent=email+' · '+role;ce('cloud-login').classList.add('hide');ce('cloud-account').classList.remove('hide');ce('cloud-admin').classList.toggle('hide',role!=='admin');}
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
  cloudToken=result.token;
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
 cloudToken=null;
 localStorage.removeItem(sessionKey);
 window.showLocalRecords();
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

(async()=>{try{const saved=JSON.parse(localStorage.getItem(sessionKey)||'null');if(!saved?.token)return;cloudToken=saved.token;await loadCloudOverview();showAccount(saved.email,saved.role);cs('Sitzung wiederhergestellt.');if(saved.role==='admin')await cloudUsers();}catch(e){if(e.message==='Sitzung abgelaufen'||e.message==='Anmeldung erforderlich'){cloudToken=null;localStorage.removeItem(sessionKey);window.showLocalRecords();cs('Bitte erneut anmelden.');}else {const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;const cached=JSON.parse(localStorage.getItem('phev-cache-'+email)||'[]');if(cached.length){window.showCloudRecords(cached);showAccount(saved.email,saved.role);cs('Offline: gespeicherte Einträge verfügbar.');}else cs('Cloud momentan nicht erreichbar.');}}})();

let cloudSyncing=false;
window.queueCloudChanges=function(items){const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;if(!email)return;const cacheKey='phev-cache-'+email,queueKey='phev-queue-'+email;const old=JSON.parse(localStorage.getItem(cacheKey)||'[]');const previous=new Map(old.map(r=>[r.id,r]));const next=new Map(items.map(r=>[r.id,r]));let queue=JSON.parse(localStorage.getItem(queueKey)||'[]');for(const r of items)if(JSON.stringify(previous.get(r.id))!==JSON.stringify(r))queue.push({action:'save',record:r});for(const r of old)if(!next.has(r.id))queue.push({action:'delete',id:r.id});localStorage.setItem(queueKey,JSON.stringify(queue));localStorage.setItem(cacheKey,JSON.stringify(items));syncCloudQueue();};
async function syncCloudQueue(){if(cloudSyncing||!cloudToken||!navigator.onLine)return;const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;if(!email)return;const key='phev-queue-'+email;cloudSyncing=true;try{let queue=JSON.parse(localStorage.getItem(key)||'[]');while(queue.length){const op=queue[0];await cloudCall(op.action,op.action==='save'?{record:op.record}:{id:op.id});const latest=JSON.parse(localStorage.getItem(key)||'[]');latest.shift();localStorage.setItem(key,JSON.stringify(latest));queue=latest;}cs('Alle Änderungen synchronisiert.');}catch(e){cs('Änderungen lokal vorgemerkt: '+e.message);}finally{cloudSyncing=false;}}
window.addEventListener('online',syncCloudQueue);
