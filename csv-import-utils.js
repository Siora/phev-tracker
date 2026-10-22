/*
 * PHEV Tracker – CSV-Import-Helfer (v85)
 *
 * csvRows: verarbeitet Trennzeichen, Anführungszeichen und Zeilenumbrüche.
 * date: normalisiert unterstützte Datumsangaben nach JJJJ-MM-TT.
 * Beide Funktionen sind reine Parser: keine Speicherung, keine API-Zugriffe.
 * Die Import-Vorschau und die ausdrückliche Bestätigung bleiben in app.js.
 */

function csvRows(s){
  s=s.replace(/^\uFEFF/,'');
  let line=s.split(/\r?\n/)[0]||'',sep=(line.match(/;/g)||[]).length>=(line.match(/,/g)||[]).length?';':',',rows=[],row=[],v='',q=false;
  for(let i=0;i<s.length;i++){
    let c=s[i];
    if(c==='"'){
      if(q&&s[i+1]==='"'){
        v+='"';
        i++
      }
      else q=!q
    }
    else if(c===sep&&!q){
      row.push(v);
      v=''
    }
    else if((c==='\r'||c==='\n')&&!q){
      if(c==='\r'&&s[i+1]==='\n')i++;
      row.push(v);
      if(row.some(Boolean))rows.push(row);
      row=[];
      v=''
    }
    else v+=c
  }
  row.push(v);
  if(row.some(Boolean))rows.push(row);
  return rows
}
function date(s){
  let m=String(s||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
  m=String(s||'').match(/^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})/);
  return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):''
}
