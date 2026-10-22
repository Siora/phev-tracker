/**
 * Öffentliche, ausschließlich lesende Produktions-Smoketests.
 *
 * Kein Login, keine Cookies, keine Zugangsdaten und KEINE Schreib-Requests.
 * Prüft HTML, kritische statische Assets und den erwarteten Schutz der API.
 * Testet ausdrücklich NICHT den authentifizierten Cloud-Datenabgleich.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const origin='https://tracker.web-produktion.com';
const timeout=AbortSignal.timeout(12000);

async function get(path){
  const response=await fetch(origin+path,{method:'GET',redirect:'error',signal:timeout,headers:{'Cache-Control':'no-cache'}});
  return {response,body:await response.text()};
}

test('Produktiv-PWA ist über HTTPS erreichbar und enthält v88-Navigation',async()=>{
  const {response,body}=await get('/');
  assert.equal(response.status,200,'Startseite HTTP 200');
  assert.match(response.headers.get('content-type')||'',/text\/html/i);
  assert.match(body,/<title>PHEV Tracker<\/title>/);
  assert.match(body,/id="vehicleFilter"/);
  assert.match(body,/src="app\.js\?v=88"/);
});

for(const file of ['app.js?v=88','cloud.js?v=88','pagination.js?v=88','charts.js','sw.js']){
  test('Produktiv-Asset erreichbar: '+file,async()=>{
    const {response,body}=await get('/'+file);
    assert.equal(response.status,200,file);
    assert.ok(body.length>100,file+' leer');
  });
}

test('API verweigert anonyme Sitzungsabfrage ohne personenbezogene Ausgabe',async()=>{
  const {response,body}=await get('/api/api.php?action=session');
  assert.ok([401,403].includes(response.status),'API session muss ohne Login 401/403 liefern; tatsächlich '+response.status);
  let json;
  assert.doesNotThrow(()=>{json=JSON.parse(body);},'API liefert JSON');
  assert.equal(typeof json.error,'string','Fehlermeldung ohne Sitzung');
  assert.equal(json.token,undefined,'Keine Tokens ohne Login');
  assert.equal(json.records,undefined,'Keine Datensätze ohne Login');
});
