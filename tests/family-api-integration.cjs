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
async function request(action,token,method='GET',body){const url=base+'?action='+action;const response=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'X-Forwarded-Proto':'https',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
test('Familien-API erzwingt Besitz, Mitgliedschaft und Widerruf',async()=>{
 const [owner,member,stranger]=seed();
 assert.equal((await request('family-members&family_id=1',stranger)).status,404);
 assert.equal((await request('family-vehicle-shares&family_id=1',stranger)).status,404);
 assert.equal((await request('family-vehicle-share-save',member,'POST',{family_id:1,vehicle_id:1,access_level:'view'})).status,404);
 assert.equal((await request('family-vehicle-share-save',stranger,'POST',{family_id:1,vehicle_id:2,access_level:'view'})).status,404);
 assert.equal((await request('family-vehicle-share-save',owner,'POST',{family_id:1,vehicle_id:1,access_level:'view'})).status,200);
 let result=await request('family-shared-vehicles',member);assert.equal(result.status,200);assert.deepEqual(result.data.vehicles.map(v=>Number(v.id)),[1]);
 result=await request('family-shared-vehicles',stranger);assert.equal(result.status,200);assert.equal(result.data.vehicles.length,0);
 result=await request('vehicles',member);assert.equal(result.status,200);assert.equal(result.data.vehicles.length,0);
 assert.equal((await request('family-vehicle-share-delete',member,'POST',{family_id:1,vehicle_id:1})).status,404);
 assert.equal((await request('family-vehicle-share-delete',owner,'POST',{family_id:1,vehicle_id:1})).status,200);
 result=await request('family-shared-vehicles',member);assert.equal(result.data.vehicles.length,0);
 assert.equal((await request('family-vehicle-share-save',owner,'POST',{family_id:2,vehicle_id:1,access_level:'view'})).status,404);
});
