/** End-to-end API authorization tests against ephemeral MySQL (never production). */
const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const crypto=require('node:crypto');
const base='http://127.0.0.1:8766/api.php';
function sql(query){return execFileSync('mysql',['-h','127.0.0.1','-uroot','-ptest-root-only','-N','-B','phev_family_test','-e',query],{encoding:'utf8'}).trim();}
function seed(){
 const hash=crypto.createHash('sha256');
 sql("INSERT INTO users(email,password_hash) VALUES ('owner@test.invalid','x'),('member@test.invalid','x'),('stranger@test.invalid','x')");
 sql("INSERT INTO vehicles(user_id,brand,model) VALUES (1,'Owner','Private'),(3,'Stranger','Private')");
 sql("INSERT INTO family_groups(name,created_by) VALUES ('Test family',1),('Other family',3)");
 sql("INSERT INTO family_members(family_id,user_id,role) VALUES (1,1,'owner'),(1,2,'member'),(2,3,'owner')");
 const tokens=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)];
 tokens.forEach((token,i)=>sql("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('"+crypto.createHash('sha256').update(token).digest('hex')+"',"+(i+1)+",DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))"));
 return tokens;
}
async function request(action,token,method='GET',body){const url=base+'?action='+action;const response=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'X-Forwarded-Proto':'https',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:JSON.parse((await response.text())||'null')};}
test('Familien-API erzwingt Besitz, Mitgliedschaft und Widerruf',async()=>{
 const [owner,member,stranger]=seed();
 assert.equal((await request('family-members&family_id=1',stranger)).status,404);
 assert.equal((await request('family-vehicle-shares&family_id=1',stranger)).status,404);
 assert.equal((await request('family-vehicle-share-save',member,'POST',{family_id:1,vehicle_id:1,access_level:'view'})).status,404);
 assert.equal((await request('family-vehicle-share-save',stranger,'POST',{family_id:1,vehicle_id:2,access_level:'view'})).status,404);
 assert.equal((await request('family-vehicle-share-save',owner,'POST',{family_id:1,vehicle_id:1,access_level:'view'})).status,200);
 let result=await request('family-shared-vehicles',member);assert.equal(result.status,200);assert.deepEqual(result.data.vehicles.map(v=>Number(v.id)),[1]);
 sql("INSERT INTO records(id,user_id,type,date,amount,cost,currency,vehicle_id) VALUES ('shared-charge',1,'charge','2026-10-01',10,5,'CHF',1),('private-charge',3,'charge','2026-10-01',20,10,'CHF',2)");
 result=await request('family-shared-records',member);
 assert.equal(result.status,200);
 assert.deepEqual(result.data.records.map(record=>record.id),['shared-charge']);
 result=await request('family-shared-records',stranger);
 assert.equal(result.status,200);
 assert.equal(result.data.records.length,0);
 result=await request('family-shared-vehicles',stranger);assert.equal(result.status,200);assert.equal(result.data.vehicles.length,0);
 result=await request('vehicles',member);assert.equal(result.status,200);assert.equal(result.data.vehicles.length,0);
 assert.equal((await request('family-vehicle-share-delete',member,'POST',{family_id:1,vehicle_id:1})).status,404);
 assert.equal((await request('family-vehicle-share-delete',owner,'POST',{family_id:1,vehicle_id:1})).status,200);
 result=await request('family-shared-vehicles',member);assert.equal(result.data.vehicles.length,0);
 result=await request('family-shared-records',member);assert.equal(result.data.records.length,0);
 assert.equal((await request('family-vehicle-share-save',owner,'POST',{family_id:2,vehicle_id:1,access_level:'view'})).status,404);
});

test('Familie verlassen: nur Mitglieder, Besitzer und Fremde geschützt',async()=>{
 const owner='a'.repeat(64),member='b'.repeat(64),stranger='c'.repeat(64);
 assert.equal((await request('family-leave',owner,'POST',{family_id:1})).status,409);
 assert.equal((await request('family-leave',stranger,'POST',{family_id:1})).status,404);
 assert.equal((await request('family-leave',member,'POST',{family_id:0})).status,400);
 assert.equal((await request('family-leave',member,'POST',{family_id:1})).status,200);
 assert.equal(sql('SELECT COUNT(*) FROM family_members WHERE family_id=1 AND user_id=2'),'0');
 assert.equal((await request('family-members&family_id=1',member)).status,404);
 assert.equal((await request('family-leave',member,'POST',{family_id:1})).status,404);
 assert.equal(sql('SELECT COUNT(*) FROM family_members WHERE family_id=1 AND user_id=1'),'1');
});

test('Nur Besitzer dürfen andere Familienmitglieder entfernen',async()=>{
 sql("INSERT INTO family_members(family_id,user_id,role) VALUES (1,2,'member')");
 const owner='a'.repeat(64),member='b'.repeat(64),stranger='c'.repeat(64);
 assert.equal((await request('family-member-remove',member,'POST',{family_id:1,user_id:1})).status,404);
 assert.equal((await request('family-member-remove',stranger,'POST',{family_id:1,user_id:2})).status,404);
 assert.equal((await request('family-member-remove',owner,'POST',{family_id:1,user_id:1})).status,409);
 assert.equal((await request('family-member-remove',owner,'POST',{family_id:1,user_id:2})).status,200);
 assert.equal(sql('SELECT COUNT(*) FROM family_members WHERE family_id=1 AND user_id=2'),'0');
 assert.equal((await request('family-members&family_id=1',member)).status,404);
 assert.equal((await request('family-member-remove',owner,'POST',{family_id:1,user_id:2})).status,404);
});

test('Familiengründer erhält beim Kontolöschen einen erklärenden Konflikt',async()=>{
 const passwordHash=execFileSync('php',['-r',"echo password_hash('correct-password-123', PASSWORD_DEFAULT);"],{encoding:'utf8'});
 sql("UPDATE users SET password_hash='"+passwordHash+"' WHERE id=1");
 const result=await request('account-delete','a'.repeat(64),'POST',{confirmation:'KONTO LÖSCHEN',password:'correct-password-123'});
 assert.equal(result.status,409);
 assert.match(result.data.error,/Familie/);
 assert.equal(sql('SELECT COUNT(*) FROM users WHERE id=1'),'1');
});

test('Familie auflösen erfordert Gründer und Bestätigung; Fahrzeuge bleiben',async()=>{
 const owner='a'.repeat(64),member='b'.repeat(64),stranger='c'.repeat(64);
 assert.equal((await request('family-delete',member,'POST',{family_id:1,confirmation:'FAMILIE LÖSCHEN'})).status,404);
 assert.equal((await request('family-delete',stranger,'POST',{family_id:1,confirmation:'FAMILIE LÖSCHEN'})).status,404);
 assert.equal((await request('family-delete',owner,'POST',{family_id:1,confirmation:'falsch'})).status,400);
 assert.equal((await request('family-delete',owner,'POST',{family_id:1,confirmation:'FAMILIE LÖSCHEN'})).status,200);
 assert.equal(sql('SELECT COUNT(*) FROM family_groups WHERE id=1'),'0');
 assert.equal(sql('SELECT COUNT(*) FROM vehicles WHERE id=1'),'1');
});

