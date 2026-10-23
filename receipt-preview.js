/*
 * Beleg-Vorschau: ausschließlich lokales Foto, keine OCR und kein Upload.
 * Object-URLs werden beim Entfernen, Wechseln und Verlassen freigegeben.
 */
'use strict';
(function(){
 const input=document.getElementById('receipt-photo');
 const preview=document.getElementById('receipt-photo-preview');
 const status=document.getElementById('receipt-photo-status');
 const clear=document.getElementById('receipt-photo-clear');
 if(!input||!preview||!status||!clear)return;
 let url=null;
 function reset(){
  if(url){URL.revokeObjectURL(url);url=null;}
  preview.removeAttribute('src');
  preview.hidden=true;
  clear.hidden=true;
  input.value='';
  status.textContent='Noch kein Beleg ausgewählt.';
 }
 input.addEventListener('change',()=>{
  resetPreview();
  const file=input.files&&input.files[0];
  if(!file)return;
  const allowed=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
  if(!allowed.includes(file.type)){
   status.textContent='Bitte ein JPEG-, PNG-, WebP- oder HEIC-Bild auswählen.';
   input.value='';
   return;
  }
  if(file.size>15*1024*1024){
   status.textContent='Das Belegfoto darf höchstens 15 MB groß sein.';
   input.value='';
   return;
  }
  url=URL.createObjectURL(file);
  preview.src=url;
  preview.hidden=false;
  clear.hidden=false;
  status.textContent='Lokale Vorschau: '+file.name+'. Keine Daten übertragen.';
 });
 function resetPreview(){
  if(url){URL.revokeObjectURL(url);url=null;}
  preview.removeAttribute('src');
  preview.hidden=true;
  clear.hidden=true;
 }
 clear.addEventListener('click',reset);
 window.addEventListener('pagehide',resetPreview);
})();
