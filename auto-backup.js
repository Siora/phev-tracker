/*
 * PHEV Tracker – Automatische lokale Sicherungen (v85)
 *
 * Rotierende Snapshots (maximal fünf) pro Konto im localStorage.
 * Diese Datei enthält ausschließlich die bisherige Backup-Logik.
 * Der initiale Aufruf von updateAutomaticBackupStatus() bleibt in app.js,
 * damit die dort definierten Zustandsvariablen bereits initialisiert sind.
 * Niemals die Cloud-Queue, Einträge oder Fotos automatisch löschen.
 */

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
  const snapshot={createdAt:new Date().toISOString(),source:cloudView?'cloud':'local',records:JSON.parse(JSON.stringify(records)),settings:JSON.parse(JSON.stringify(settings)),vehicles:JSON.parse(JSON.stringify(vehicles)),chargingTypes:chargingTypes(),recordTimes:recordTimes(),chargeModes:chargeModes(),comparison:getCostComparison()};
  const signature=JSON.stringify([snapshot.records,snapshot.settings,snapshot.vehicles,snapshot.chargingTypes,snapshot.recordTimes,snapshot.chargeModes,snapshot.comparison]);
  if(previous.length&&previous[0].signature===signature){updateAutomaticBackupStatus();return;}
  previous.unshift({...snapshot,signature});
  localStorage.setItem(automaticBackupKey(),JSON.stringify(previous.slice(0,5)));
  updateAutomaticBackupStatus();
 }catch(error){
  const status=$('auto-backup-status');
  if(status)status.textContent=(globalThis.window?.PhevI18n?.t('backup.autoFailed')||'Automatische Sicherung fehlgeschlagen (möglicherweise zu wenig Gerätespeicher). Bitte manuell exportieren.');
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
