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
 const cloudButton=ce('open-cloud-page');
 if(cloudButton)cloudButton.hidden=!cloudToken;
 const familyButton=ce('open-family-page');
 if(familyButton)familyButton.hidden=!cloudToken;
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
/**
 * Zentrale HTTP-Schnittstelle zur PHP-API.
 * GET bei fehlendem data-Argument, sonst JSON-POST; Cookie-Sitzung bleibt aktiv.
 * Fehler werden an den Aufrufer weitergegeben, statt lokale Daten zu löschen.
 */
async function cloudCall(action,data,query={}){
 const params=new URLSearchParams({action,...query});
 const response=await fetch(cloudApi+'?'+params.toString(),{
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

/**
 * Lädt die Cloud-Gesamtansicht und berücksichtigt zuvor vorgemerkte lokale
 * Änderungen. Wichtig: die Offline-Warteschlange hat Vorrang vor einem
 * möglicherweise älteren Serverstand und wird anschließend synchronisiert.
 */
async function loadCloudOverview(){syncError='';updateSyncIndicator();await loadVehicles();const d=await cloudCall('data');const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;const queued=JSON.parse(localStorage.getItem('phev-queue-'+email)||'[]');const merged=new Map(d.records.map(r=>[r.id,r]));for(const op of queued){if(op.action==='delete')merged.delete(op.id);else merged.set(op.record.id,op.record);}window.showCloudRecords([...merged.values()]);if(email)localStorage.setItem('phev-cache-'+email,JSON.stringify([...merged.values()]));syncCloudQueue();await loadChargingCatalog();const expenseData=await cloudCall('vehicle-expenses');window.setVehicleExpenses(expenseData.expenses||[]);cloudPreferences=d.preferences||null;cloudPreferencesReady=!!d.preferences_available&&!!d.preferences;if(cloudPreferencesReady)window.applyCloudPreferences(cloudPreferences);updateSyncIndicator();ce('cloud-count').textContent='Cloud-Einträge: '+d.records.length+'.';}

/**
 * Lädt Fahrzeuge aus dem Konto und aktualisiert die Verwaltungstabelle.
 * Die Pagination begrenzt nur sichtbare Zeilen; Fahrzeug-Caches bleiben erhalten.
 */
async function loadVehicles(){
 try {
  const data=await cloudCall('vehicles');
  window.setVehicles(data.vehicles);
  // Geteilte Fahrzeuge nie in die Liste der eigenen Fahrzeuge mischen.
  void loadSharedVehicleOverview();
  const accountEmail=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;
  if(accountEmail)localStorage.setItem('phev-vehicles-cache-'+accountEmail,JSON.stringify(data.vehicles));
  ce('vehicle-status').textContent=data.vehicles.length+(window.PhevI18n?.t('vehicles.countSuffix')||' Fahrzeuge in deinem Konto.');
  const list=ce('vehicle-list');list.replaceChildren();
  const table=document.createElement('table');table.className='management-table vehicle-management-table';
  const thead=document.createElement('thead'),heading=document.createElement('tr');
  for(const title of ['Fahrzeug','Baujahr','Kennzeichen','Antrieb','Batterie','Tank','Aktionen']){const th=document.createElement('th');th.scope='col';th.textContent=title;heading.append(th);}
  thead.append(heading);table.append(thead);
  const tbody=document.createElement('tbody');
  if(!data.vehicles.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent=(window.PhevI18n?.t('vehicles.empty')||'Noch keine Fahrzeuge angelegt.');tr.append(td);tbody.append(tr);}
  const makeVehicleRow=v=>{
   const row=document.createElement('tr');
   for(const value of [[v.brand,v.model].filter(Boolean).join(' '),v.model_year||'–',v.plate||'–',v.drivetrain||'–',v.battery_kwh==null?'–':v.battery_kwh+' kWh',v.tank_liters==null?'–':v.tank_liters+' l']){
    const cell=document.createElement('td');cell.textContent=value;row.append(cell);
   }
   const actions=document.createElement('td');actions.className='management-actions';
   const edit=document.createElement('button'),del=document.createElement('button');
   edit.textContent='✎';edit.className='action-icon-button action-edit';edit.ariaLabel=(window.PhevI18n?.t('expenses.edit')||'Bearbeiten');edit.title=(window.PhevI18n?.t('expenses.edit')||'Bearbeiten');edit.onclick=()=>{
    const f=ce('vehicle-form');f.dataset.id=v.id;
    for(const key of ['brand','model','model_year','plate','drivetrain','battery_kwh','tank_liters','notes'])f.elements[key].value=v[key]??'';
    f.querySelector('button[type=submit]').textContent=(window.PhevI18n?.t('expenses.saveChanges')||'Änderungen speichern');
    vehicleFormView(true);
   };
   del.textContent='🗑';del.className='action-icon-button action-delete';del.ariaLabel=(window.PhevI18n?.t('expenses.delete')||'Löschen');del.title=(window.PhevI18n?.t('expenses.delete')||'Löschen');del.onclick=async()=>{
    if(!confirm((window.PhevI18n?.t('vehicles.confirmDelete')||'Fahrzeug löschen? Fahrzeuge mit Einträgen können nicht gelöscht werden.')))return;
    try{await cloudCall('vehicle-delete',{id:v.id});await loadVehicles();}catch(e){ce('vehicle-status').textContent=e.message;}
   };
   const photo=document.createElement('button');
   photo.type='button';photo.textContent=(window.PhevI18n?.t('vehicles.uploadPhoto')||'Bild hochladen');
   photo.onclick=()=>{
    const picker=document.createElement('input');
    picker.type='file';picker.accept='image/jpeg,image/png,image/webp';picker.style.display='none';
    document.body.append(picker);
    picker.onchange=async()=>{
     const file=picker.files?.[0];picker.remove();
     if(!file)return;
     if(!['image/jpeg','image/png','image/webp'].includes(file.type)){ce('vehicle-status').textContent=(window.PhevI18n?.t('vehicles.photoInvalidType')||'Bitte JPEG, PNG oder WebP auswählen.');return;}
     if(file.size>5000000){ce('vehicle-status').textContent=(window.PhevI18n?.t('vehicles.photoTooLarge')||'Das Bild darf höchstens 5 MB gross sein.');return;}
     photo.disabled=true;ce('vehicle-status').textContent=(window.PhevI18n?.t('vehicles.photoUploading')||'Bild wird hochgeladen …');
     try{
      const body=new FormData();body.append('vehicle_id',String(v.id));body.append('photo',file);
      const headers=/^[a-f0-9]{64}$/.test(cloudToken||'')?{'Authorization':'Bearer '+cloudToken}:{};
      const response=await fetch(cloudApi+'?action=vehicle-photo-upload',{method:'POST',credentials:'same-origin',headers,body,cache:'no-store'});
      const result=await response.json();
      if(!response.ok||!result.photo_url)throw Error(result.error||'Bild-Upload fehlgeschlagen');
      const url=new URL(result.photo_url,location.origin).href;
      const current=window.collectCloudPreferences();
      const merged={...cloudPreferences,...current,photos:{...(cloudPreferences?.photos||{}),...(current.photos||{}),[String(v.id)]:url}};
      await cloudCall('preferences',{preferences:merged});
      cloudPreferences=merged;cloudPreferencesReady=true;
      window.setVehiclePhoto(v.id,url);
      ce('vehicle-status').textContent=(window.PhevI18n?.t('vehicles.photoSaved')||'Fahrzeugbild auf dem Server gespeichert.');
     }catch(error){ce('vehicle-status').textContent=(window.PhevI18n?.t('vehicles.photoSaveFailed')||'Bild konnte nicht vollständig gespeichert werden: ')+error.message;}
     finally{photo.disabled=false;}
    };
    picker.oncancel=()=>picker.remove();
    picker.click();
   };

   actions.append(edit,photo,del);row.append(actions);return row;
  };
  table.append(tbody);window.paginateTable(list,table,tbody,data.vehicles,5,'vehicles',makeVehicleRow);
 }catch(e){ce('vehicle-status').textContent=(window.PhevI18n?.t('vehicles.loadFailed')||'Fahrzeuge konnten nicht geladen werden: ')+e.message;}
}
function vehicleFormView(open){
 ce('vehicle-form-panel').classList.toggle('hide',!open);
 ce('vehicle-list-panel').classList.toggle('hide',open);
 if(open)ce('vehicle-form-panel').scrollIntoView({block:'start'});
}
ce('vehicle-new').onclick=()=>{
 const f=ce('vehicle-form');f.reset();delete f.dataset.id;
 f.querySelector('button[type=submit]').textContent=(window.PhevI18n?.t('vehicles.save')||'Fahrzeug speichern');
 vehicleFormView(true);
};
ce('vehicle-cancel').onclick=()=>{
 const f=ce('vehicle-form');
 if((f.dataset.id||['brand','model','model_year','plate','drivetrain','battery_kwh','tank_liters','notes'].some(key=>f.elements[key].value))&&!confirm((window.PhevI18n?.t('expenses.confirmDiscard')||'Ungespeicherte Änderungen verwerfen?')))return;
 f.reset();delete f.dataset.id;f.querySelector('button[type=submit]').textContent=(window.PhevI18n?.t('vehicles.save')||'Fahrzeug speichern');
 vehicleFormView(false);
};
function resetVehicleAfterSave(){
 const f=ce('vehicle-form');f.reset();delete f.dataset.id;f.querySelector('button[type=submit]').textContent=(window.PhevI18n?.t('vehicles.save')||'Fahrzeug speichern');
};
ce('vehicle-form').onsubmit=async e=>{
 e.preventDefault();
 if(!cloudToken)return ce('vehicle-status').textContent=(window.PhevI18n?.t('vehicles.loginRequired')||'Bitte zuerst anmelden.');
 const f=e.currentTarget,button=f.querySelector('button[type=submit]');button.disabled=true;
 try{
  const v={id:f.dataset.id?Number(f.dataset.id):null};
  for(const key of ['brand','model','model_year','plate','drivetrain','battery_kwh','tank_liters','notes'])v[key]=f.elements[key].value;
  await cloudCall('vehicle-save',{vehicle:v});
  resetVehicleAfterSave();vehicleFormView(false);await loadVehicles();
 }catch(error){ce('vehicle-status').textContent=error.message;}
 finally{button.disabled=false;}
};


/** Familienverwaltung: ausschließlich serverseitig autorisierte Daten anzeigen. */
function prepareFamilyInviteLink(){
 const match=/^#family-invite=([a-f0-9]{64})$/.exec(location.hash);
 if(!match)return;
 ce('family-accept-form').elements.token.value=match[1];
 history.replaceState(null,'',location.pathname+location.search);
 ce('family-status').textContent='Einladung erkannt. Bitte anmelden und Annahme bestätigen.';
}
prepareFamilyInviteLink();
window.addEventListener('hashchange',prepareFamilyInviteLink);
/** Freigaben sind Metadaten; gemeinsame Fahrzeugdatensätze bleiben vorerst gesperrt. */
/** Geteilte Fahrzeuge in der Fahrzeugübersicht bleiben vollständig getrennt von
 * eigenen Fahrzeugen, Editierformularen, Synchronisation und lokalen Caches. */
/** Familienstatistik bleibt bewusst von eigenen Datensätzen und Caches getrennt.
 * Die API prüft Mitgliedschaft und Freigabe bei jedem Aufruf erneut. */
window.loadSharedAnalytics=async function(){
 // Freigegebene Datensätze werden weiterhin geladen und für Dashboard und Analyse
 // bereitgestellt. Die redundanten Tabellen oberhalb der Ansichten entfallen.
 if(!cloudToken){window.setFamilyAnalyticsData?.([],[]);return;}
 try{
  const [vehiclesResponse,recordsResponse]=await Promise.all([
   cloudCall('family-shared-vehicles'),cloudCall('family-shared-records')
  ]);
  const vehicles=[...new Map((vehiclesResponse.vehicles||[]).map(v=>[String(v.id),v])).values()];
  window.setFamilyAnalyticsData?.(vehicles,recordsResponse.records||[]);
 }catch(error){
  console.warn('Familienfreigaben konnten nicht geladen werden:',error);
  window.setFamilyAnalyticsData?.([],[]);
 }
};
async function loadSharedVehicleOverview(){
 const status=ce('shared-vehicle-overview-status'),list=ce('shared-vehicle-overview-list');
 if(!cloudToken){status.textContent=(window.PhevI18n?.t('familyVehicles.login')||'Bitte anmelden, um Familienfahrzeuge zu sehen.');list.replaceChildren();return;}
 try{
  const result=await cloudCall('family-shared-vehicles');
  const shared=result.vehicles||[];
  status.textContent=shared.length?shared.length+(window.PhevI18n?.t('familyVehicles.countSuffix')||' Familienfahrzeug(e) für dich freigegeben.'):(window.PhevI18n?.t('familyVehicles.empty')||'Noch keine Familienfahrzeuge für dich freigegeben.');
  // Nur bereits autorisierte Fahrzeugstammdaten; keine Kosten oder Einträge.
  const rows=shared.map(v=>{
   const details=document.createElement('details');
   details.className='shared-vehicle-details';
   const summary=document.createElement('summary');
   summary.textContent=(window.PhevI18n?.t('familyVehicles.viewDetails')||'Details ansehen');
   details.append(summary);
   const dl=document.createElement('dl');
   const fields=[['Fahrzeug',v.brand+' '+v.model],['Baujahr',v.model_year],['Kennzeichen',v.plate],['Antrieb',v.drivetrain],['Batterie',v.battery_kwh==null?null:v.battery_kwh+' kWh'],['Tank',v.tank_liters==null?null:v.tank_liters+' l'],['Berechtigung',v.access_level==='edit'?(window.PhevI18n?.t('familyVehicles.editPending')||'Bearbeiten (noch nicht aktiv)'):(window.PhevI18n?.t('familyVehicles.readOnly')||'Nur lesen')]];
   for(const [label,value] of fields){
    const dt=document.createElement('dt');dt.textContent=label;
    const dd=document.createElement('dd');dd.textContent=value==null||value===''?'–':String(value);
    dl.append(dt,dd);
   }
   details.append(dl);
   return [v.brand+' '+v.model,v.model_year||'–',v.drivetrain||'–',details];
  });
  familyTable(list,['Fahrzeug','Baujahr','Antrieb','Details'],rows);
 }catch(error){status.textContent=(window.PhevI18n?.t('familyVehicles.loadFailed')||'Familienfahrzeuge konnten nicht geladen werden: ')+error.message;list.replaceChildren();}
}
/** Geteilte Fahrzeuge werden nur angezeigt, nie in eigene Fahrzeuge übernommen. */
/** Tabellen verwenden ausschließlich textContent; API-Daten werden nie als HTML interpretiert. */
function familyTable(target,columns,rows){
 target.replaceChildren();
 if(!rows.length){target.textContent='Keine Einträge vorhanden.';return null;}
 const wrapper=document.createElement('div');wrapper.className='family-table-scroll';
 const table=document.createElement('table');table.className='management-table family-table';
 const thead=document.createElement('thead'),head=document.createElement('tr');
 for(const label of columns){const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);}
 thead.append(head);table.append(thead);
 const tbody=document.createElement('tbody');
 for(const cells of rows){const tr=document.createElement('tr');for(const cell of cells){const td=document.createElement('td');if(cell instanceof Node)td.append(cell);else td.textContent=String(cell??'');tr.append(td);}tbody.append(tr);}
 table.append(tbody);wrapper.append(table);target.append(wrapper);return table;
}
/** Geteilte Fahrzeuge werden nur angezeigt, nie in eigene Fahrzeuge übernommen. */
async function loadSharedVehicles(){
 const list=ce('family-shared-vehicles');if(!cloudToken)return;
 try{
  const result=await cloudCall('family-shared-vehicles');
  familyTable(list,['Fahrzeug','Berechtigung'],(result.vehicles||[]).map(v=>[v.brand+' '+v.model,v.access_level==='edit'?'Bearbeiten (noch nicht aktiv)':'Lesen']));
 }catch(error){list.textContent='Geteilte Fahrzeuge derzeit nicht verfügbar: '+error.message;}
}
async function loadFamilyShares(){
 const familyId=Number(ce('family-shares-group').value),list=ce('family-shares-list');
 list.replaceChildren();if(!familyId||!cloudToken)return;
 try{
  const response=await cloudCall('family-vehicle-shares',undefined,{family_id:String(familyId)});
  const rows=(response.shares||[]).map(share=>{
   let action='—';
   // Der Server prüft den Fahrzeugbesitz erneut; die UI allein vergibt keine Rechte.
   if(Number(share.can_manage)===1){
    const revoke=document.createElement('button');revoke.type='button';revoke.textContent='Widerrufen';
    revoke.onclick=async()=>{
     if(!confirm('Freigabe für '+share.brand+' '+share.model+' wirklich widerrufen?'))return;
     revoke.disabled=true;
     try{await cloudCall('family-vehicle-share-delete',{family_id:familyId,vehicle_id:Number(share.vehicle_id)});await loadFamilyShares();await loadSharedVehicles();}
     catch(error){revoke.disabled=false;list.textContent='Widerruf fehlgeschlagen: '+error.message;}
    };action=revoke;
   }
   return [share.brand+' '+share.model,share.access_level==='edit'?'Bearbeiten (noch nicht aktiv)':'Lesen',action];
  });
  familyTable(list,['Fahrzeug','Berechtigung','Aktion'],rows);
 }catch(error){list.textContent='Freigaben konnten nicht geladen werden: '+error.message;}
}
ce('family-shares-refresh').onclick=loadFamilyShares;
ce('family-share-form').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
 try{
  await cloudCall('family-vehicle-share-save',{family_id:Number(ce('family-shares-group').value),vehicle_id:Number(form.elements.vehicle_id.value),access_level:form.elements.access_level.value});
  await loadFamilyShares();
  await loadSharedVehicles();
  await loadFamilyMembers();
 }catch(error){ce('family-shares-list').textContent='Freigabe fehlgeschlagen: '+error.message;}
 finally{button.disabled=false;}
};
/** Mitgliederdaten ausschließlich über den autorisierten Familien-Endpunkt laden. */
async function loadFamilyMembers(){
 const list=ce('family-members-list'),familyId=Number(ce('family-members-group').value);
 list.replaceChildren();if(!cloudToken||!familyId)return;
 try{
  const result=await cloudCall('family-members',undefined,{family_id:String(familyId)});
  if(!(result.members||[]).length){list.textContent='Keine Mitglieder vorhanden.';return;}
  const isOwner=[...ce('family-invite-group').options].some(option=>Number(option.value)===familyId);
  const rows=result.members.map(member=>{
   let action='–';
   if(isOwner&&member.role==='member'){
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Entfernen';
    button.onclick=async()=>{
     if(!confirm('Mitglied „'+member.email+'“ aus der Familie entfernen? Der Zugriff auf freigegebene Fahrzeuge endet sofort.'))return;
     button.disabled=true;
     try{await cloudCall('family-member-remove',{family_id:familyId,user_id:Number(member.id)});await loadFamilyMembers();}
     catch(error){list.textContent='Mitglied konnte nicht entfernt werden: '+error.message;}
    };
    action=button;
   }
   return [member.email,member.role==='owner'?'Besitzer':'Mitglied',action];
  });
  familyTable(list,['E-Mail','Rolle','Aktion'],rows);
 }catch(error){list.textContent='Mitglieder konnten nicht geladen werden: '+error.message;}
}
ce('family-members-refresh').onclick=loadFamilyMembers;
ce('family-members-group').onchange=loadFamilyMembers;
async function loadFamilies(){
 if(!cloudToken)return;
 const status=ce('family-status'),list=ce('family-list'),select=ce('family-invite-group');
 try{
  const result=await cloudCall('family-list');
  list.replaceChildren();select.replaceChildren();
  const shareSelect=ce('family-shares-group');shareSelect.replaceChildren();
  const membersSelect=ce('family-members-group');membersSelect.replaceChildren();
  for(const family of result.families||[]){
   const shareOption=document.createElement('option');shareOption.value=String(family.id);shareOption.textContent=family.name;shareSelect.append(shareOption);
   const memberOption=document.createElement('option');memberOption.value=String(family.id);memberOption.textContent=family.name;membersSelect.append(memberOption);
   const item=document.createElement('div');item.className='family-summary-item';const name=document.createElement('strong');name.textContent=family.name;const role=document.createElement('span');role.textContent=family.role==='owner'?'Besitzer':'Mitglied';item.append(name,role);
   if(family.role==='owner'){
    const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Familie auflösen';
    remove.onclick=async()=>{
     const confirmation=prompt('Familie „'+family.name+'“ endgültig auflösen? Alle Mitgliedschaften, Einladungen und Freigaben werden entfernt. Persönliche Fahrzeuge bleiben erhalten. Zur Bestätigung FAMILIE LÖSCHEN eingeben:');
     if(confirmation!=='FAMILIE LÖSCHEN')return;
     remove.disabled=true;
     try{await cloudCall('family-delete',{family_id:Number(family.id),confirmation});await loadFamilies();await loadSharedVehicles();await loadSharedVehicleOverview();}
     catch(error){status.textContent='Familie konnte nicht aufgelöst werden: '+error.message;remove.disabled=false;}
    };
    item.append(remove);
   }
   if(family.role!=='owner'){
    const leave=document.createElement('button');leave.type='button';leave.className='secondary';leave.textContent='Familie verlassen';
    leave.onclick=async()=>{
     if(!confirm('Familie „'+family.name+'“ wirklich verlassen? Du verlierst den Zugriff auf alle dort freigegebenen Fahrzeuge.'))return;
     leave.disabled=true;
     try{await cloudCall('family-leave',{family_id:Number(family.id)});await loadFamilies();await loadSharedVehicles();await loadSharedVehicleOverview();}
     catch(error){status.textContent='Familie konnte nicht verlassen werden: '+error.message;leave.disabled=false;}
    };
    item.append(leave);
   }
   list.append(item);
   if(family.role==='owner'){
    const option=document.createElement('option');option.value=String(family.id);option.textContent=family.name;select.append(option);
   }
  }
  ce('family-invite-form').classList.toggle('hide',!select.options.length);
  status.textContent=(result.families||[]).length+' Familie(n) vorhanden.';
  const vehicles=await cloudCall('vehicles');const vehicleSelect=ce('family-share-vehicle');vehicleSelect.replaceChildren();
  for(const vehicle of vehicles.vehicles||[]){const option=document.createElement('option');option.value=String(vehicle.id);option.textContent=vehicle.brand+' '+vehicle.model;vehicleSelect.append(option);}
  ce('family-share-form').classList.toggle('hide',!vehicleSelect.options.length||!shareSelect.options.length);
  await loadFamilyShares();
 }catch(error){status.textContent='Familienverwaltung derzeit nicht verfügbar: '+error.message;}
}
ce('family-create-form').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
 try{await cloudCall('family-create',{name:form.elements.name.value.trim()});form.reset();await loadFamilies();}
 catch(error){ce('family-status').textContent='Familie konnte nicht erstellt werden: '+error.message;}
 finally{button.disabled=false;}
};
ce('family-invite-form').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
 try{await cloudCall('family-invite',{family_id:Number(form.elements.family_id.value),email:form.elements.email.value.trim()});form.elements.email.value='';ce('family-status').textContent='Einladung wurde versendet.';}
 catch(error){ce('family-status').textContent='Einladung fehlgeschlagen: '+error.message;}
 finally{button.disabled=false;}
};
ce('family-accept-form').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
 try{await cloudCall('family-invite-accept',{token:form.elements.token.value.trim()});form.reset();ce('family-status').textContent='Einladung angenommen.';await loadFamilies();}
 catch(error){ce('family-status').textContent='Einladung konnte nicht angenommen werden: '+error.message;}
 finally{button.disabled=false;}
};
// Die Sprache kommt ausschließlich aus dem angemeldeten MySQL-Konto.
function applyAccountLanguage(account){
 const select=ce('account-language'),status=ce('account-language-status');
 if(!select)return;
 const available=account.language_available===true;
 select.disabled=!available;
 select.value=account.language==='en'?'en':'de';
 window.PhevI18n?.setLanguage(select.value);
 status.textContent=available?'':'Datenbankmigration für die Sprachauswahl steht noch aus.';
}
ce('account-language')?.addEventListener('change',async event=>{
 const select=event.currentTarget,previous=window.PhevI18n?.getLanguage()||'de';
 select.disabled=true;
 try{
  const result=await cloudCall('account-language',{language:select.value});
  window.PhevI18n?.setLanguage(result.language);
  ce('account-language-status').textContent='Gespeichert.';
 }catch(error){select.value=previous;ce('account-language-status').textContent=error.message;}
 finally{select.disabled=false;}
});
function showAccount(email,role){void loadFamilies();
 const admin=role==='admin';
 const adminNav=ce('admin-nav');if(adminNav)adminNav.hidden=!admin;
 if(!admin&&ce('administration')&&!ce('administration').classList.contains('hide'))window.tab?.('cloud');document.body.classList.remove('login-locked');ce('cloud-identity').textContent=email+' · '+role;ce('cloud-login').classList.add('hide');ce('cloud-account').classList.remove('hide');ce('cloud-admin').classList.toggle('hide',!admin);if(!ce('cloud-status').textContent||/^(Nicht angemeldet\.?|Bitte erneut anmelden\.?)/.test(ce('cloud-status').textContent))cs('Angemeldet.');updateSyncIndicator();}
/**
 * Benutzerformulare sind exklusive Unteransichten der Administration.
 * Die Listenposition bleibt erhalten, bis die Daten neu geladen werden.
 */
let adminEditingId=null;
let adminCurrentView='list';
function adminView(view){
 adminCurrentView=view;
 ce('admin-create-panel').classList.toggle('hide',view!=='create');
 ce('admin-edit-panel').classList.toggle('hide',view!=='edit');
 ce('admin-users-panel').classList.toggle('hide',view!=='list');
 ce('admin-new-user').hidden=view!=='list';
 window.scrollTo(0,0);
}
ce('admin-new-user').onclick=()=>{ce('cloud-create').reset();adminView('create');};
ce('admin-create-cancel').onclick=()=>{
 const form=ce('cloud-create');
 if((form.elements.email.value||form.elements.password.value||form.elements.role.value!=='user')&&!confirm('Ungespeicherte Eingaben verwerfen?'))return;
 form.reset();adminView('list');
};
ce('admin-edit-cancel').onclick=()=>adminView('list');
ce('admin-edit-form').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,save=form.querySelector('[type=submit]');
 save.disabled=true;
 try{
  await cloudCall('admin-update-user',{id:adminEditingId,email:form.elements.email.value,role:form.elements.role.value});
  cs('Benutzer aktualisiert.');await cloudUsers();adminView('list');
 }catch(error){cs(error.message);}
 finally{save.disabled=false;}
};
function adminActionIcon(name,label){
 const button=document.createElement('button');button.type='button';
 button.className='admin-icon-action';
 button.setAttribute('aria-label',label);button.title=label;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','19');svg.setAttribute('height','19');
 svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');
 svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');
 path.setAttribute('d',name==='edit'?'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z':'M3 6h18 M8 6V4h8v2 M5 6l1 14h12l1-14 M10 10v7 M14 10v7');
 svg.append(path);button.append(svg);return button;
}
async function cloudUsers(){
 const result=await cloudCall('admin-users');
 const container=ce('cloud-users');container.replaceChildren();
 const table=document.createElement('table');table.className='management-table admin-users-table';
 const thead=document.createElement('thead'),heading=document.createElement('tr');
 for(const label of ['E-Mail-Adresse','Rolle','Aktionen']){const th=document.createElement('th');th.scope='col';th.textContent=label;heading.append(th);}
 thead.append(heading);table.append(thead);
 const tbody=document.createElement('tbody');
 if(!result.users.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=3;cell.textContent='Noch keine Benutzer vorhanden.';row.append(cell);tbody.append(row);}
 const makeUserRow=user=>{
  const row=document.createElement('tr');
  const emailCell=document.createElement('td');emailCell.textContent=user.email;
  const roleCell=document.createElement('td');roleCell.textContent=user.role==='admin'?'Administrator':'Benutzer';
  const actions=document.createElement('td');actions.className='admin-user-actions';
  const edit=adminActionIcon('edit','Benutzer '+user.email+' bearbeiten');
  edit.onclick=()=>{
   adminEditingId=user.id;
   const form=ce('admin-edit-form');
   form.elements.email.value=user.email;form.elements.role.value=user.role;
   adminView('edit');
  };
  const remove=adminActionIcon('delete','Benutzer '+user.email+' löschen');
  remove.onclick=async()=>{
   if(!confirm('Benutzer '+user.email+' dauerhaft löschen? Zugehörige Cloud-Daten können unwiderruflich verloren gehen.'))return;
   if(prompt('Zur Bestätigung LÖSCHEN eingeben:')!=='LÖSCHEN')return;
   remove.disabled=true;
   try{await cloudCall('admin-delete-user',{id:user.id});cs('Benutzer gelöscht.');await cloudUsers();}
   catch(error){cs(error.message);remove.disabled=false;}
  };
  actions.append(edit,remove);row.append(emailCell,roleCell,actions);return row;
 };
 table.append(tbody);window.paginateTable(container,table,tbody,result.users,20,'users',makeUserRow);
}

// Der Reset-Token steht ausschließlich im URL-Fragment und wird sofort entfernt.
let pendingResetToken=null;
const resetMatch=location.hash.match(/^#reset-token=([a-f0-9]{64})$/);
if(resetMatch){
 pendingResetToken=resetMatch[1];
 history.replaceState(null,'',location.pathname+location.search);
 ce('cloud-login').classList.add('hide');ce('cloud-reset-request').classList.add('hide');ce('cloud-reset-confirm').classList.remove('hide');
}
ce('cloud-forgot-password').onclick=()=>{
 ce('cloud-login').classList.add('hide');ce('cloud-reset-request').classList.remove('hide');
};
ce('cloud-reset-cancel').onclick=()=>{
 ce('cloud-reset-request').classList.add('hide');ce('cloud-login').classList.remove('hide');
};
ce('cloud-reset-request').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]');
 button.disabled=true;
 try{const result=await cloudCall('password-reset-request',{email:form.elements.email.value});cs(result.message);form.reset();}
 catch(error){cs(error.message);}
 finally{button.disabled=false;}
};
ce('cloud-reset-confirm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]');
 if(form.elements.new_password.value!==form.elements.confirm_password.value){cs('Neue Passwörter stimmen nicht überein.');return;}
 button.disabled=true;
 try{
  await cloudCall('password-reset-confirm',{token:pendingResetToken,new_password:form.elements.new_password.value});
  pendingResetToken=null;form.reset();ce('cloud-reset-confirm').classList.add('hide');
  ce('cloud-login').classList.remove('hide');cs('Passwort zurückgesetzt. Bitte erneut anmelden.');
 }catch(error){cs(error.message);}
 finally{button.disabled=false;}
};
ce('cloud-login').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('button');
 button.disabled=true;cs('Anmeldung läuft …');
 try{
  const result=await cloudCall('login',{email:form.elements.email.value,password:form.elements.password.value});
  cloudToken='cookie';updateSyncIndicator();
  localStorage.setItem(sessionKey,JSON.stringify({email:result.email,role:result.role}));
  showAccount(result.email,result.role);
  try{applyAccountLanguage(await cloudCall('session'));}catch(error){ce('account-language-status').textContent=error.message;}
  await loadCloudOverview();
  form.elements.password.value='';
  cs('Angemeldet. Lokale Einträge bleiben unverändert.');
  if(result.role==='admin')await cloudUsers();
 }catch(error){cs(error.message);}
 finally{button.disabled=false;}
};
// 3.0: Passwortwechsel. Der Server widerruft nach Erfolg sämtliche Sitzungen.
ce('cloud-change-password').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('button[type=submit]');
 const current=form.elements.current_password.value;
 const next=form.elements.new_password.value;
 if(next!==form.elements.confirm_password.value){cs('Neue Passwörter stimmen nicht überein.');return;}
 if(next===current){cs('Bitte ein anderes neues Passwort wählen.');return;}
 button.disabled=true;
 try{
  await cloudCall('account-change-password',{current_password:current,new_password:next});
  form.reset();cloudToken=null;cloudPreferencesReady=false;cloudPreferences=null;syncError='';
  localStorage.removeItem(sessionKey);updateSyncIndicator();
  document.body.classList.add('login-locked');
  ce('cloud-account').classList.add('hide');ce('cloud-login').classList.remove('hide');
  ce('cloud-count').textContent='';window.showLocalRecords();
  cs('Passwort geändert. Alle Sitzungen wurden beendet. Bitte erneut anmelden.');
 }catch(error){cs(error.message);}
 finally{button.disabled=false;}
};
// Sicherheitsbestätigung und erneute Authentifizierung vor irreversibler Löschung.
ce('cloud-delete-account').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('button[type=submit]');
 if(form.elements.confirmation.value!=='KONTO LÖSCHEN'){cs('Bitte KONTO LÖSCHEN eingeben.');return;}
 if(!window.confirm('Konto und zugehörige Cloud-Daten unwiderruflich löschen?'))return;
 button.disabled=true;
 try{
  const deletedEmail=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;
  await cloudCall('account-delete',{password:form.elements.password.value,confirmation:form.elements.confirmation.value});
  // Nur den kontobezogenen Offline-Cache entfernen; Daten anderer Konten bleiben erhalten.
  if(deletedEmail){for(const prefix of ['phev-cache-','phev-queue-','phev-vehicles-cache-'])localStorage.removeItem(prefix+deletedEmail);}
  form.reset();cloudToken=null;cloudPreferencesReady=false;cloudPreferences=null;syncError='';
  localStorage.removeItem(sessionKey);updateSyncIndicator();
  document.body.classList.add('login-locked');
  ce('cloud-account').classList.add('hide');ce('cloud-login').classList.remove('hide');
  ce('cloud-count').textContent='';window.showLocalRecords();
  cs('Konto gelöscht. Kontobezogene Cloud-Caches auf diesem Gerät wurden entfernt; unabhängige lokale Daten bleiben erhalten.');
 }catch(error){cs(error.message);}
 finally{button.disabled=false;}
};
ce('cloud-create').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('button');
 button.disabled=true;
 try{
  await cloudCall('admin-create-user',{email:form.elements.email.value,password:form.elements.password.value,role:form.elements.role.value});
  form.reset();cs('Benutzer erstellt.');await cloudUsers();adminView('list');
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
 cloudToken=null;cloudPreferencesReady=false;cloudPreferences=null;syncError='';
 if(ce('admin-nav'))ce('admin-nav').hidden=true;
 if(ce('cloud-admin'))ce('cloud-admin').classList.add('hide');
 updateSyncIndicator();
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
 // Bei einem Reset-Link keine Sitzung wiederherstellen: das Reset-Formular bleibt exklusiv.
 if(pendingResetToken!==null){
  ce('cloud-login').classList.add('hide');
  ce('cloud-account').classList.add('hide');
  ce('cloud-admin').classList.add('hide');
  ce('cloud-reset-confirm').classList.remove('hide');
  document.body.classList.add('login-locked');
  cs('Bitte lege dein neues Passwort fest.');
  return;
 }
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem(sessionKey)||'null');}catch{}
 // A legacy bearer token remains supported until the next normal login.
 cloudToken=/^[a-f0-9]{64}$/.test(saved?.token||'')?saved.token:'cookie';
 try{
  const account=await cloudCall('session');
  const email=account.email,role=account.role;
  localStorage.setItem(sessionKey,JSON.stringify(cloudToken==='cookie'?{email,role}:{token:cloudToken,email,role}));
  showAccount(email,role);
  applyAccountLanguage(account);
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

/**
 * Speichert die vollständige Ausgabenliste in den Cloud-Preferences.
 * Serverbestätigung erfolgt VOR dem Ersetzen der lokalen Liste, damit ein
 * fehlgeschlagener Request keine fälschliche Erfolgsmeldung erzeugt.
 */
/**
 * Einzelne Ausgaben werden ausschliesslich in der SQL-Tabelle gespeichert.
 * Der Server bestätigt den Schreibvorgang, bevor der lokale Zustand wechselt.
 * Es wird keine komplette Liste mehr in prefs_json überschrieben.
 */
window.saveVehicleExpense=async function(item){
 if(!cloudToken)throw Error('Bitte anmelden.');
 const result=await cloudCall('vehicle-expense-save',{expense:item});
 const current=window.getVehicleExpenses();
 window.setVehicleExpenses([...current.filter(x=>x.id!==item.id),item]);
 return result;
};
window.deleteVehicleExpense=async function(id){
 if(!cloudToken)throw Error('Bitte anmelden.');
 await cloudCall('vehicle-expense-delete',{id});
 window.setVehicleExpenses(window.getVehicleExpenses().filter(x=>x.id!==id));
};
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
/**
 * Arbeitet die kontobezogene Offline-Warteschlange sequenziell ab.
 * Eine Operation wird erst nach erfolgreichem API-Request entfernt.
 * Bei Fehlern bleiben alle noch nicht bestätigten Operationen erhalten.
 */
async function syncCloudQueue(){if(cloudSyncing||!cloudToken||!navigator.onLine)return;const email=JSON.parse(localStorage.getItem(sessionKey)||'null')?.email;if(!email)return;const key='phev-queue-'+email;cloudSyncing=true;updateSyncIndicator();try{let queue=JSON.parse(localStorage.getItem(key)||'[]');while(queue.length){const op=queue[0];await cloudCall(op.action,op.action==='save'?{record:op.record}:{id:op.id});const latest=JSON.parse(localStorage.getItem(key)||'[]');latest.shift();localStorage.setItem(key,JSON.stringify(latest));queue=latest;}syncError='';cs('Alle Änderungen synchronisiert.');}catch(e){syncError=e.message;cs('Änderungen lokal vorgemerkt: '+e.message);}finally{cloudSyncing=false;updateSyncIndicator();}}
window.addEventListener('online',()=>{syncError='';updateSyncIndicator();syncCloudQueue();});
window.addEventListener('offline',updateSyncIndicator);
window.addEventListener('storage',updateSyncIndicator);
updateSyncIndicator();
