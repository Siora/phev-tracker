/**
 * Sicherheits-Vertragstests für Familienfreigaben.
 * Diese statischen Prüfungen ergänzen, ersetzen aber keine DB-Integrationstests.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const api=fs.readFileSync('server/api.php','utf8');
function endpoint(start,end){const a=api.indexOf(start);const b=api.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'API-Endpunktgrenzen vorhanden');return api.slice(a,b);}
test('Freigabeänderungen benötigen Familienmitgliedschaft und Fahrzeugeigentum',()=>{
 const code=endpoint("if (in_array($action,['family-vehicle-shares'","if ($action==='family-members')");
 assert.match(code,/family_members WHERE family_id=\\? AND user_id=\\?/);
 assert.match(code,/vehicles WHERE id=\\? AND user_id=\\?/);
 assert.match(code,/owner_user_id=\\?/);
 assert.match(code,/in_array\\(\\$access,\\['view','edit'\\]/);
});
test('Geteilte Fahrzeuge erfordern aktive Mitgliedschaft und explizite Freigabe',()=>{
 const code=endpoint("if ($action === 'family-shared-vehicles')","if ($action === 'vehicle-save'");
 assert.match(code,/JOIN family_members m ON m.family_id=s.family_id AND m.user_id=\\?/);
 assert.match(code,/JOIN vehicles v ON v.id=s.vehicle_id AND v.user_id=s.owner_user_id/);
 assert.match(code,/s.owner_user_id<>\\?/);
 assert.match(code,/REQUEST_METHOD'\\]!==?'GET'/);
});
test('Private Fahrzeugliste bleibt eigentümergebunden',()=>{
 const code=endpoint("if ($action === 'vehicles'","if ($action === 'family-shared-vehicles')");
 assert.match(code,/FROM vehicles WHERE user_id=\\?/);
});
test('Mitgliederliste verlangt authentifizierte Mitgliedschaft',()=>{
 const code=endpoint("if ($action==='family-members')","if (in_array($action,['family-list'");
 assert.match(code,/SELECT role FROM family_members WHERE family_id=\\? AND user_id=\\?/);
 assert.match(code,/if \\(\\!\\$stmt->fetchColumn\\(\\)\\) fail\\(404/);
});
