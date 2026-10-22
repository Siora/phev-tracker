/*
 * PHEV Tracker – PDF-Layout und Seitenverwaltung.
 * Enthält ausschließlich die Darstellung. Die Datenaggregation und
 * Auswahl von Monat/Jahr verbleiben in exportPdfReport() in app.js.
 * Abhängigkeit: jsPDF wird vorher geladen.
 */

/**
 * Layout-Helfer für die jsPDF-Bibliothek. Koordinaten der bestehenden Berichte
 * werden von unten nach oben angegeben und in text()/rect() auf PDF-Koordinaten
 * umgerechnet. Seitenwechsel und Tabellenkopf werden zentral verwaltet.
 */
class PhevPdfReport{
 constructor(title,vehicle,currency){
  if(!window.jspdf?.jsPDF)throw Error('PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.');
  this.pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'pt',format:'a4',compress:true});
  this.title=title;this.vehicle=vehicle;this.currency=currency;this.page=1;this.y=96;
  this.pdf.setProperties({title:'PHEV Tracker – '+title,author:'PHEV Tracker'});
 }
 ink(rgb){return rgb.map(x=>Math.round(x*255));}
 rect(x,y,w,h,rgb){this.pdf.setFillColor(...this.ink(rgb));this.pdf.rect(x,842-y-h,w,h,'F');}
 text(x,y,value,size=10,rgb=[0.13,0.2,0.3],bold=false){
  this.pdf.setTextColor(...this.ink(rgb));this.pdf.setFont('helvetica',bold?'bold':'normal');this.pdf.setFontSize(size);
  const valueText=String(value??'').replace(/[\u2013\u2014]/g,'-');
  this.pdf.text(valueText,x,842-y,{baseline:'alphabetic'});
 }
 newPage(){
  this.pdf.addPage();this.page++;this.y=742;
  this.rect(0,786,595,56,[0.06,0.17,0.28]);
  this.text(40,807,'PHEV TRACKER / '+this.title,16,[1,1,1],true);
  this.text(40,766,this.vehicle+' | '+new Date().toLocaleDateString('de-CH'),9);
  this.rect(40,42,515,1,[0.85,0.88,0.91]);
  this.text(40,27,'PHEV Tracker - Fahrzeugbericht',8,[0.45,0.49,0.55]);
 }
 space(h){if(this.y-h<70)this.newPage();}
 heading(v){this.space(42);this.y-=23;this.text(40,this.y,v,14,[0.07,0.22,0.36],true);this.y-=18;}
 coverOverview(o){
  const blue=[0.08,0.42,0.78],dark=[0.08,0.13,0.21],muted=[0.48,0.52,0.57];
  this.rect(0,0,595,842,[1,1,1]);
  this.rect(40,779,5,32,blue);this.text(55,793,'PHEV Tracker',23,dark,true);
  this.text(55,780,'FAHRZEUGREPORT',9,blue,true);
  this.text(40,754,'Zeitraum: '+o.period,10,muted);this.text(308,754,'Fahrzeug: '+this.vehicle,10,muted);
  this.rect(40,740,515,1,[0.85,0.88,0.92]);
  const tile=(x,y,label,value)=>{
   this.rect(x,y,247,70,[0.94,0.96,0.98]);
   this.text(x+13,y+46,label.toUpperCase(),9,muted,true);
   this.text(x+13,y+18,value,19,dark,true);
  };
  tile(40,643,'Gesamtkosten',o.total.toFixed(2)+' '+this.currency);
  tile(308,643,'Geladene Energie',o.energy.toFixed(2)+' kWh');
  tile(40,562,'Strompreis / kWh',o.energy>0?(o.chargeCost/o.energy).toFixed(2)+' '+this.currency:'Keine Daten');
  tile(308,562,'Kosten / 100 km',o.kmSpan>0?(o.total*100/o.kmSpan).toFixed(2)+' '+this.currency:'Keine Daten');
  this.text(40,529,'LADEORTE UND ANBIETER',12,blue,true);
  const providers=o.providers.slice(0,5);
  if(!providers.length)this.text(40,505,'Keine Ladevorgaenge vorhanden.',10,muted);
  providers.forEach((p,i)=>{
   const y=503-i*29;
   this.text(42,y,p.name.slice(0,31),10,dark);
   this.text(320,y,p.energy.toFixed(1)+' kWh / '+(o.energy?Math.round(p.energy/o.energy*100):0)+'%',10,dark,true);
   this.rect(42,y-15,450,5,[0.9,0.93,0.96]);
   this.rect(42,y-15,450*(o.energy?p.energy/o.energy:0),5,[0.08,0.53,0.9]);
  });
  this.text(40,325,'FINANZIELLE AUFSCHLUESSELUNG',12,blue,true);
  const lines=[['Strom',o.chargeCost],['Benzin',o.fuelCost],['Weitere Ausgaben',o.extras],['Gesamt',o.total]];
  lines.forEach((item,i)=>{const y=298-i*35;this.rect(40,y-12,515,30,i%2?[0.96,0.97,0.98]:[0.93,0.96,0.98]);this.text(52,y,item[0],11,dark,i===3);this.text(390,y,item[1].toFixed(2)+' '+this.currency,11,dark,true);});
  this.text(40,128,o.charges.length+' Ladungen / '+o.providers.length+' Ladeorte',10,muted);
  this.text(40,108,'Kosten pro Kilometer sind Naeherungswerte aus Kilometerstaenden.',9,muted);
  this.text(290,40,'1',9,muted);
  this.newPage();
 }
 metrics(items){
  this.space(90);const top=this.y;
  items.forEach((item,i)=>{const x=40+i*130;this.rect(x,top-64,124,66,[0.94,0.96,0.98]);});
  items.forEach((item,i)=>{const x=48+i*130;const label=String(item[0]);this.text(x,top-22,label.length>21?label.slice(0,20):label,8,[0.13,0.2,0.3],true);this.text(x,top-47,String(item[1]),11,[0.08,0.25,0.4],true);});
  this.y-=91;
 }
 donut(values,labels,unit=this.currency){
  const height=Math.max(100,labels.length*28+24);this.space(height);
  const sum=values.reduce((a,v)=>a+v,0);
  if(!sum)this.text(50,this.y-30,'Keine Daten vorhanden',10);
  values.forEach((v,i)=>{
   const y=this.y-25-i*28;
   this.rect(45,y-4,10,10,[[0.08,0.53,0.9],[0.96,0.63,0.25],[0.43,0.72,0.64]][i%3]);
   this.text(65,y,labels[i]+': '+v.toFixed(2)+' '+unit,11);
   if(sum>0){this.rect(325,y-2,195,7,[0.9,0.93,0.96]);this.rect(325,y-2,195*v/sum,7,[0.08,0.53,0.9]);}
  });
  this.y-=height;
 }
 bars(labels,values){
  this.space(164);const x=45,y=this.y-127,w=500,h=110,max=Math.max(1,...values);
  this.rect(x,y,w,1,[0.72,0.77,0.82]);
  if(!labels.length)this.text(x+10,y+50,'Keine Daten',10);
  else{const step=w/labels.length,bw=Math.min(26,step*0.65);labels.forEach((label,i)=>{
   const bh=values[i]/max*(h-18);this.rect(x+i*step+(step-bw)/2,y,bw,Math.max(0.2,bh),[0.1,0.57,0.72]);
   if(labels.length<=12||i%Math.ceil(labels.length/12)===0)this.text(x+i*step+step/2-6,y-14,label,8);
  });this.text(x,y+h-2,'Max. '+max.toFixed(2)+' '+this.currency,9);}
  this.y-=164;
 }
 table(headers,rows,widths){
  const header=()=>{this.space(35);this.rect(40,this.y-25,515,26,[0.08,0.25,0.4]);let x=45;headers.forEach((v,i)=>{this.text(x,this.y-17,v,8,[1,1,1],true);x+=widths[i];});this.y-=26;};
  header();if(!rows.length){this.note('Keine Eintraege vorhanden.');return;}
  rows.forEach((row,i)=>{if(this.y-23<70){this.newPage();header();}
   if(i%2===0)this.rect(40,this.y-23,515,23,[0.95,0.97,0.98]);
   let x=45;row.forEach((v,j)=>{const limit=Math.max(5,Math.floor((widths[j]-10)/4.7));let t=String(v??'');if(t.length>limit)t=t.slice(0,limit-2)+'..';this.text(x,this.y-15,t,8);x+=widths[j];});this.y-=23;
  });this.y-=15;
 }
 note(v){const lines=this.pdf.splitTextToSize(String(v),505);this.space(lines.length*12+12);lines.forEach(line=>{this.text(42,this.y-12,line,8,[0.4,0.44,0.5]);this.y-=12;});this.y-=9;}
 finish(){return this.pdf.output('arraybuffer');}
}
