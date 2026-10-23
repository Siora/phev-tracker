/*
 * Belegtext-Auswertung ohne Netzwerkzugriff und ohne automatische Speicherung.
 * Erkennt nur explizite Werte; unbekannte Felder bleiben unverändert.
 */
'use strict';
(function(root){
 function number(value){
  if(!value)return null;
  let v=String(value).replace(/\s/g,'');
  if(v.includes(',')&&v.includes('.'))v=v.lastIndexOf(',')>v.lastIndexOf('.')?v.replace(/\./g,'').replace(',','.'):v.replace(/,/g,'');
  else if(v.includes(','))v=v.replace(',','.');
  const n=Number(v);
  return Number.isFinite(n)&&n>=0?n:null;
 }
 function parse(text){
  const result={};
  const date=String(text).match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/);
  if(date){const d=Number(date[1]),m=Number(date[2]),y=Number(date[3]);const test=new Date(Date.UTC(y,m-1,d));if(test.getUTCFullYear()===y&&test.getUTCMonth()===m-1&&test.getUTCDate()===d)result.date=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
  const quantity=String(text).match(/(\d+(?:[.,]\d+)?)\s*(kWh|Liter|Litres|Liters|L)\b/i);
  if(quantity){result.amount=number(quantity[1]);result.type=/kWh/i.test(quantity[2])?'charge':'fuel';}
  const lines=String(text).split(/\r?\n/);
  for(const line of lines){
   if(!/(gesamt|total|betrag|summe|amount due|zu zahlen)/i.test(line))continue;
   const match=line.match(/(?:CHF|EUR|Fr\.?|€)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:CHF|EUR|Fr\.?|€)?\s*$/i);
   if(match){result.cost=number(match[1]);if(/EUR|€/.test(line))result.currency='EUR';else if(/CHF|Fr\.?/i.test(line))result.currency='CHF';}
  }
  const unit=String(text).match(/(?:preis\s*(?:pro|\/)|price\s*per)\s*(?:kWh|liter|l)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
  if(unit)result.unit_price=number(unit[1]);
  return result;
 }
 root.PhevReceiptParser={parse};
 if(typeof document==='undefined')return;
 const extract=document.getElementById('receipt-extract');
 const source=document.getElementById('receipt-raw-text');
 const preview=document.getElementById('receipt-extract-preview');
 const fields=document.getElementById('receipt-extract-fields');
 const status=document.getElementById('receipt-extract-status');
 const apply=document.getElementById('receipt-apply');
 const form=document.getElementById('form');
 if(!extract||!source||!preview||!fields||!status||!apply||!form)return;
 const labels={type:'Art',date:'Datum',amount:'Menge',unit_price:'Einzelpreis',cost:'Gesamtkosten',currency:'Währung'};
 let proposal={};
 extract.addEventListener('click',()=>{
  proposal=parse(source.value);
  fields.replaceChildren();
  for(const [key,label] of Object.entries(labels)){
   if(proposal[key]===undefined||proposal[key]===null)continue;
   const p=document.createElement('p');
   p.textContent=label+': '+proposal[key];
   fields.append(p);
  }
  preview.hidden=Object.keys(proposal).length===0;
  status.textContent=preview.hidden?'Keine eindeutigen Werte erkannt. Bitte manuell eintragen.':'Vorschläge erkannt. Bitte vor Übernahme mit dem Beleg abgleichen.';
 });
 apply.addEventListener('click',()=>{
  for(const [key,value] of Object.entries(proposal)){
   const control=form.elements.namedItem(key);
   if(!control||!['type','date','amount','unit_price','cost','currency'].includes(key))continue;
   control.value=String(value);
   control.dispatchEvent(new Event('change',{bubbles:true}));
  }
  status.textContent='Vorschläge ins Formular übertragen. Bitte prüfen und erst dann speichern.';
 });
})(typeof window!=='undefined'?window:globalThis);
