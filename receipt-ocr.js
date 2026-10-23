/*
 * Lokale Beleg-OCR: kein Upload, keine CDN-Pfade, keine automatische Übernahme.
 * Der Worker wird nur nach ausdrücklichem Klick gestartet und danach beendet.
 */
'use strict';
(function(){
 const button=document.getElementById('receipt-ocr-start');
 const fileInput=document.getElementById('receipt-photo');
 const text=document.getElementById('receipt-raw-text');
 const status=document.getElementById('receipt-ocr-status');
 const extract=document.getElementById('receipt-extract');
 if(!button||!fileInput||!text||!status)return;
 let running=false;
 let worker=null;
 const local=(name)=>new URL(name,document.baseURI).href;
 button.addEventListener('click',async()=>{
  if(running)return;
  const file=fileInput.files&&fileInput.files[0];
  if(!file){status.textContent='Bitte zuerst ein Belegfoto auswählen.';return;}
  running=true;
  button.disabled=true;
  status.textContent='Texterkennung wird vorbereitet. Das Foto bleibt auf diesem Gerät.';
  let stage='Bibliothek laden';
  try{
   if(!window.Tesseract){
    await new Promise((resolve,reject)=>{
     const script=document.createElement('script');
     script.src=local('tesseract.min.js?v=220');
     script.onload=resolve;
     script.onerror=()=>reject(new Error('ocr-library-unavailable'));
     document.head.append(script);
    });
   }
   if(!window.Tesseract||typeof window.Tesseract.createWorker!=='function')throw new Error('ocr-library-unavailable');
   // Frühzeitig unterscheiden: fehlende Deployment-Datei, HTTP-Fehler oder Worker-Initialisierung.
   for(const asset of ['tesseract-worker.min.js','deu.traineddata.gz','tesseract-core-simd-lstm.wasm.js']){
    stage='OCR-Datei prüfen: '+asset;
    const response=await fetch(local(asset+'?v=220'),{cache:'no-store'});
    if(!response.ok)throw new Error(asset+': HTTP '+response.status);
    const type=response.headers.get('content-type')||'';
    if(/text\/html/i.test(type))throw new Error(asset+': HTML statt OCR-Datei geliefert');
   }
   stage='OCR-Sprachdaten/Worker laden';
   // Safari kann mit der automatisch gewählten SIMD-WASM-Variante scheitern.
   // Den nicht-SIMD-Kern gezielt verwenden und Worker-Fehler als Promise sichtbar machen.
   const workerFailure={};
   workerFailure.promise=new Promise((_,reject)=>{workerFailure.reject=reject;});
   workerFailure.promise.catch(()=>{});
   worker=await Promise.race([window.Tesseract.createWorker('deu',1,{
    workerPath:local('tesseract-worker.min.js?v=220'),
    workerBlobURL:false,
    corePath:local('tesseract-core-lstm.wasm.js'),
    langPath:local(''),
    gzip:true,
    errorHandler:(error)=>workerFailure.reject(error instanceof Error?error:new Error(String(error||'Worker-Fehler'))),
    logger:(message)=>{
     if(message&&message.status)status.textContent='OCR wird vorbereitet: '+message.status;
     if(message.status==='recognizing text'&&typeof message.progress==='number')
      status.textContent='Texterkennung: '+Math.round(message.progress*100)+' %';
    }
   }),workerFailure.promise]);
   stage='Foto auswerten';
   const result=await worker.recognize(file);
   const recognized=result&&result.data&&result.data.text||'';
   if(!recognized.trim())throw new Error('empty-result');
   stage='Erkannte Werte anzeigen';
   text.value=recognized;
   text.dispatchEvent(new Event('input',{bubbles:true}));
   if(extract){extract.click();}
   status.textContent='Text erkannt. Die Werte stehen unten zur Prüfung bereit; bitte erst nach Kontrolle ins Formular übernehmen.';
   const review=document.getElementById('receipt-extract-preview');
   if(review&&!review.hidden)review.scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(error){
   const detail=error&&error.message?String(error.message).slice(0,160):'Unbekannter Fehler';
   console.error('Lokale Beleg-OCR fehlgeschlagen bei '+stage,error);
   status.textContent=error&&error.message==='empty-result'
    ?'Kein lesbarer Text erkannt. Bitte ein schärferes Foto verwenden.'
    :'Texterkennung fehlgeschlagen ('+stage+'). Technischer Hinweis: '+detail+'. Bitte Seite neu laden und erneut versuchen.';
  }finally{
   if(worker){try{await worker.terminate();}catch(_error){}worker=null;}
   running=false;
   button.disabled=false;
  }
 });
 window.addEventListener('pagehide',()=>{if(worker)worker.terminate();});
})();
