/**
 * Browser-Integration mit Chromium und vollständig abgefangener Cloud-API.
 *
 * Kein Request erreicht die produktive PHP-API. Alle Fahrzeuge, Einträge,
 * Ladeorte, Anbieter und Benutzer sind ausschließlich synthetische Fixtures.
 * Testet echte HTML-/DOM-/Event-Integration, nicht den echten Cloud-Server.
 *
 * Lokal: npm install --no-save playwright && npx playwright install chromium
 *        python3 -m http.server 8765 &
 *        node --test tests/browser-integration.test.cjs
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base='http://127.0.0.1:8765';
const vehicles=Array.from({length:7},(_,i)=>({
  id:'vehicle-'+i,brand:'Test',model:'Modell '+i,model_year:2024,
  plate:'TEST-'+i,drivetrain:'PHEV',battery_kwh:12,tank_liters:45
}));
const records=Array.from({length:25},(_,i)=>({
  id:'record-'+i,date:'2026-10-'+String(1+i%22).padStart(2,'0'),
  time:'12:00',type:i%2?'fuel':'charge',vehicle_id:vehicles[i%7].id,
  amount:10+i,cost:5+i,currency:'CHF',km:1000+i*100,place:'Testort '+i
}));
const locations=Array.from({length:7},(_,i)=>({id:'location-'+i,name:'Ladeort '+i,kind:'home',price:0.25}));
const providers=Array.from({length:7},(_,i)=>({id:'provider-'+i,name:'Anbieter '+i,price:0.5}));
const users=Array.from({length:25},(_,i)=>({email:'test'+i+'@example.invalid',role:'user'}));

async function openFixture(browser){
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage();
  const calls=[];
  await page.route('**/api/api.php?**',async route=>{
    const url=new URL(route.request().url());
    const action=url.searchParams.get('action');
    calls.push({action,method:route.request().method()});
    const payload={
      session:{email:'audit@example.invalid',role:'admin'},
      vehicles:{vehicles},
      data:{records,preferences:null,preferences_available:false},
      'charging-catalog':{locations,providers},
      'admin-users':{users}
    }[action];
    if(payload===undefined)throw new Error('Unexpected API action: '+action);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
    if(response.url().includes('/api/api.php'))return;
    if(response.status()>=400&&response.url().startsWith(base))errors.push('HTTP '+response.status()+' '+response.url());
  });
  await page.goto(base+'/index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#cloud-status')?.textContent.includes('Sitzung wiederhergestellt'),{timeout:15000});
  return {page,context,calls,errors};
}
test('Browser: Dashboard, Tabellen-Pagination und Bearbeitungsnavigation mit synthetischer Cloud',async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  let fixture;
  try{
    fixture=await openFixture(browser);
    const {page,calls,errors}=fixture;
    assert.equal(await page.locator('body.login-locked').count(),0,'Login-Sperre muss entfernt sein');
    assert.equal(await page.locator('#vehicleFilter option').count(),8);
    assert.equal(await page.locator('#vehicle-list tbody tr').count(),5,'Fahrzeuge: 5 pro Seite');
    assert.equal(await page.locator('#entries tbody tr').count(),20,'Einträge: 20 pro Seite');
    // Beide Navigationsleisten müssen existieren und dieselbe Seite steuern.
    for(const selector of ['#entries','#vehicle-list','#cloud-users','#managed-locations-list','#managed-providers-list']){
      assert.equal(await page.locator(selector+' > nav.table-pagination').count(),2,selector+': oben und unten');
    }
    await page.evaluate(()=>tab('add'));
    const entryNav=page.locator('#entries > nav.table-pagination');
    await entryNav.first().locator('button').last().click();
    assert.equal(await page.locator('#entries tbody tr').count(),5,'Einträge: zweite Seite mit 5 Zeilen');
    assert.equal(await entryNav.first().locator('span').text(),await entryNav.last().locator('span').text(),'Seitentexte synchron');
    assert.match(await entryNav.last().locator('span').text(),/Seite 2 \/ 2/);
    await entryNav.last().locator('button').first().click();
    assert.equal(await page.locator('#entries tbody tr').count(),20,'Untere Navigation führt zurück');
    assert.match(await entryNav.first().locator('span').text(),/Seite 1 \/ 2/);
    await page.evaluate(()=>tab('add'));
    await page.locator('#entries tbody tr button').first().click();
    assert.equal(await page.locator('#form').getAttribute('data-edit-id')!==null,true);
    assert.equal(await page.locator('#form button').first().textContent(),'Änderungen speichern');
    await page.evaluate(()=>tab('charging-management'));
    assert.equal(await page.locator('#managed-locations-list tbody tr').count(),5,'Ladeorte: 5 pro Seite');
    assert.equal(await page.locator('#managed-providers-list tbody tr').count(),5,'Anbieter: 5 pro Seite');
    assert.equal(await page.locator('#cloud-users tbody tr').count(),20,'Benutzer: 20 pro Seite');
    assert.deepEqual(calls.filter(x=>x.method!=='GET'),[],'Browser-Test darf keine Cloud-Schreiboperation auslösen');
    assert.deepEqual(errors,[],'Keine Laufzeit- oder lokale HTTP-Fehler');
  }finally{
    if(fixture)await fixture.context.close();
    await browser.close();
  }
});
