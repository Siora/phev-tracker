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
  // Uhrzeit nur mit Stunden und Minuten; keine Beträge als Zeit interpretieren.
  const time=String(text).match(/(?:\b(?:uhrzeit|zeit|beginn|start|ladebeginn|datum\s*\/\s*zeit)\s*[:\-]?\s*)?\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:uhr)?\b/i);
  if(time)result.time=String(time[1]).padStart(2,'0')+':'+time[2];
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
  // Beleg-OCR: „Preis pro kWh CHF 0,45“ und „CHF 0,45 / kWh“.
  if(result.unit_price===undefined){
   const labeled=String(text).match(/(?:preis\s*(?:pro|je|\/)\s*(?:kWh|liter|l)|(?:kWh|liter|l)\s*[-:]?\s*preis)\s*[:=]?\s*(?:CHF|EUR|Fr\.?|€)?\s*(\d+(?:[.,]\d+)?)/i);
   const reversed=String(text).match(/(?:CHF|EUR|Fr\.?|€)?\s*(\d+(?:[.,]\d+)?)\s*(?:CHF|EUR|Fr\.?|€)?\s*\/\s*(?:kWh|liter|l)\b/i);
   const found=labeled||reversed;
   if(found)result.unit_price=number(found[1]);
  }
  // Nur eindeutig bezeichnete Stromart übernehmen, niemals aus kW ableiten.
  if(result.type==='charge'){
   const mode=String(text).match(/\b(?:ladestrom|ladeart|stromart|charging\s*type|ladeleistung\s*typ)\s*[:=\-]?\s*(AC|DC)\b|\b(AC|DC)\s*[-–]?\s*(?:ladung|laden|charging)\b/i);
   if(mode)result.charge_mode=(mode[1]||mode[2]).toUpperCase();
  }
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
 const labels={type:'Art',date:'Datum',time:'Uhrzeit',amount:'Menge',unit_price:'Einzelpreis',cost:'Gesamtkosten',currency:'Währung',charge_mode:'Ladestrom (AC/DC)'};
 let proposal={};
 source.addEventListener('input',()=>{
  proposal={};
  preview.hidden=true;
  fields.replaceChildren();
  status.textContent='Belegtext geändert. Bitte Werte erneut prüfen.';
 });
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
   if(!control||!['type','date','time','amount','unit_price','cost','currency','charge_mode'].includes(key))continue;
   control.value=String(value);
   control.dispatchEvent(new Event('change',{bubbles:true}));
  }
  status.textContent='Vorschläge ins Formular übertragen. Bitte prüfen und erst dann speichern.';
 });
})(typeof window!=='undefined'?window:globalThis);
