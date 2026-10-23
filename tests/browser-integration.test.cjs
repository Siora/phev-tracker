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
      'vehicle-expenses':{expenses:[]},
      data:{records,preferences:null,preferences_available:false},
      'charging-catalog':{locations,providers},
      'admin-users':{users},
      'family-list':{families:[]},
      'family-shared-vehicles':{vehicles:[{id:987,brand:'Familie',model:'Testauto',model_year:2025,drivetrain:'PHEV',access_level:'view'}]},
      'family-shared-records':{records:[{id:'family-charge',vehicle_id:987,type:'charge',date:'2026-10-12',amount:25,cost:12.5,currency:'CHF',km:4000,place:'Familien-Ladeort'}]}
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
  // Geteilte Fahrzeuge dürfen nur in der separaten Leseübersicht auftauchen.
  await page.waitForFunction(()=>document.querySelector('#shared-vehicle-overview-list')?.textContent.includes('Familie Testauto'));
  assert.equal(await page.locator('#vehicle-list').getByText('Familie Testauto').count(),0);
  return {page,context,calls,errors};
}
test('Browser: Dashboard, Tabellen-Pagination und Bearbeitungsnavigation mit synthetischer Cloud',async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  let fixture;
  try{
    fixture=await openFixture(browser);
    const {page,calls,errors}=fixture;
    assert.equal(await page.locator('body.login-locked').count(),0,'Login-Sperre muss entfernt sein');
    assert.equal(await page.locator('#vehicleFilter option').count(),9);
    assert.equal(await page.locator('#vehicleFilter option[value="family:987"]').count(),1);
    assert.equal(await page.locator('#entryVehicle option[value="family:987"]').count(),0);
    await page.locator('#vehicleFilter').selectOption('family:987');
    await page.waitForFunction(()=>document.querySelector('#vehicle-summary')?.textContent.includes('1 Einträge'));
    assert.match(await page.locator('#vehicle-summary').innerText(),/12\.50 CHF/,'Freigegebene Energiekosten müssen im Dashboard erscheinen');
    assert.match(await page.locator('#vehicle-summary').innerText(),/25\.00 kWh/,'Freigegebene Lademenge muss im Dashboard erscheinen');
    await page.locator('#vehicleFilter').selectOption('');
    assert.equal(await page.locator('#vehicle-list tbody tr').count(),5,'Fahrzeuge: 5 pro Seite');
    assert.equal(await page.locator('#entries tbody tr').count(),20,'Einträge: 20 pro Seite');
    // Vorhandene Lade-/Tankdaten werden ohne neue Pflichtfelder getrennt ausgewertet.
    const consumptionLabels=await page.locator('#consumption-stats .tile small').allTextContents();
    assert.ok(consumptionLabels.includes('⚡ Stromkosten / 100 km'));
    assert.ok(consumptionLabels.includes('⛽ Benzinkosten / 100 km'));
    assert.ok(consumptionLabels.includes('💰 Energiekosten / 100 km'));
    assert.match(await page.locator('#consumption-note').textContent(),/Näherungswerte/);

    // Beide Navigationsleisten müssen existieren und dieselbe Seite steuern.
    for(const selector of ['#entries','#vehicle-list','#cloud-users','#managed-locations-list','#managed-providers-list']){
      assert.equal(await page.locator(selector+' > nav.table-pagination').count(),2,selector+': oben und unten');
    }
    await page.evaluate(()=>tab('add'));
    await page.evaluate(()=>tab('add')); // Die Eintragstabelle liegt auf dem Eingabe-Tab.
    const entryNav=page.locator('#entries > nav.table-pagination');
    await entryNav.first().locator('button').last().click();
    assert.equal(await page.locator('#entries tbody tr').count(),5,'Einträge: zweite Seite mit 5 Zeilen');
    assert.equal(await entryNav.first().locator('span').textContent(),await entryNav.last().locator('span').textContent(),'Seitentexte synchron');
    assert.match(await entryNav.last().locator('span').textContent(),/Seite 2 \/ 2/);
    await entryNav.last().locator('button').first().click();
    assert.equal(await page.locator('#entries tbody tr').count(),20,'Untere Navigation führt zurück');
    assert.match(await entryNav.first().locator('span').textContent(),/Seite 1 \/ 2/);
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
