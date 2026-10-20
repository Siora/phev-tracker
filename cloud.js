const cloudApi='https://tracker.web-produktion.com/api/api.php';
let cloudToken=null;
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
  ce('cloud-identity').textContent=result.email+' · '+result.role;
  ce('cloud-login').classList.add('hide');
  ce('cloud-account').classList.remove('hide');
  ce('cloud-admin').classList.toggle('hide',result.role!=='admin');
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
  await cloudCall('admin-create-user',{email:form.elements.email.value,password:form.elements.password.value});
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
 }catch(e){cs('Import unterbrochen: '+e.message);}
 finally{btn.disabled=false;}
};
