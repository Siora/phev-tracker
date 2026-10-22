#!/usr/bin/env node
/**
 * PHEV Tracker – sichere, reproduzierbare Release-Versionspflege.
 *
 * Beispiele:
 *   node scripts/release-version.cjs --check
 *   node scripts/release-version.cjs --set 2.4
 *
 * Aktualisiert ausschließlich bekannte Versionsstellen. Nutzerdaten, Cloud,
 * Datenbank, Cache-Inhalte und Backend werden nicht angefasst.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const manifest=path.join(root,'release.json');
const htmlPath=path.join(root,'index.html');
const workerPath=path.join(root,'sw.js');

function releaseCode(version){
  if(!/^[0-9]+\.[0-9]{1,2}$/.test(version)) throw new Error('Version muss MAJOR.MINOR sein (z. B. 2.4)');
  const [major,minor]=version.split('.').map(Number);
  return major*100+minor;
}
function requireReplace(source,regex,replacement,description){
  const matches=[...source.matchAll(new RegExp(regex.source,regex.flags.includes('g')?regex.flags:regex.flags+'g'))];
  if(!matches.length) throw new Error('Versionsstelle fehlt: '+description);
  return source.replace(regex,replacement);
}
function updateFiles(version){
  const code=releaseCode(version);
  const html=fs.readFileSync(htmlPath,'utf8');
  const worker=fs.readFileSync(workerPath,'utf8');
  const nextHtml=requireReplace(
    requireReplace(html,/Version [0-9]+\.[0-9]+/g,'Version '+version,'sichtbare Version'),
    /\?v=[0-9]+/g,'?v='+code,'HTML-Assets'
  );
  let nextWorker=requireReplace(worker,/phev-tracker-v[0-9]+/g,'phev-tracker-v'+code,'Cache-Name');
  nextWorker=requireReplace(nextWorker,/\?v=[0-9]+/g,'?v='+code,'Offline-Assets');
  nextWorker=requireReplace(nextWorker,/Service Worker \(v[0-9]+\)/,'Service Worker (v'+code+')','Worker-Kommentar');
  const nextManifest=JSON.stringify({version,cacheCode:code},null,2)+'\n';
  return [[htmlPath,nextHtml],[workerPath,nextWorker],[manifest,nextManifest]];
}
function main(args){
  const check=args.length===1&&args[0]==='--check';
  const set=args.length===2&&args[0]==='--set';
  if(!check&&!set) throw new Error('Verwendung: --check oder --set MAJOR.MINOR');
  const current=JSON.parse(fs.readFileSync(manifest,'utf8'));
  const version=check?current.version:args[1];
  const files=updateFiles(version);
  if(check){
    const mismatches=files.filter(([file,expected])=>fs.readFileSync(file,'utf8')!==expected);
    if(mismatches.length) throw new Error('Inkonsistente Release-Dateien: '+mismatches.map(([file])=>path.basename(file)).join(', '));
    console.log('Release '+version+' / Cache '+releaseCode(version)+' konsistent.');
    return;
  }
  // Alle Zielinhalte werden vor dem ersten Schreibzugriff geprüft.
  for(const [file,value] of files) fs.writeFileSync(file,value);
  console.log('Release '+version+' aktualisiert. Jetzt Tests ausführen und PR erstellen.');
}
if(require.main===module){
  try{main(process.argv.slice(2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={releaseCode,updateFiles};
