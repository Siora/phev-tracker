/** Static authorization contracts; database integration tests remain necessary. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const api=fs.readFileSync('server/api.php','utf8');
function section(start,end){const a=api.indexOf(start),b=api.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return api.slice(a,b);}
test('Share modifications require family membership and vehicle ownership',()=>{
 const code=section("if (in_array($action,['family-vehicle-shares'","if ($action==='family-members')");
 assert.ok(code.includes('family_members WHERE family_id=? AND user_id=?'));
 assert.ok(code.includes('vehicles WHERE id=? AND user_id=?'));
 assert.ok(code.includes('owner_user_id=?'));
 assert.ok(code.includes("['view','edit']"));
});
test('Shared vehicles require explicit share and active membership',()=>{
 const code=section("if ($action === 'family-shared-vehicles')","if ($action === 'vehicle-save'");
 assert.ok(code.includes('JOIN family_members m ON m.family_id=s.family_id AND m.user_id=?'));
 assert.ok(code.includes('JOIN vehicles v ON v.id=s.vehicle_id AND v.user_id=s.owner_user_id'));
 assert.ok(code.includes('s.owner_user_id<>?'));
 assert.ok(code.includes("'GET'"));
});
test('Private vehicle listing stays owner-scoped',()=>{
 const code=section("if ($action === 'vehicles'","if ($action === 'family-shared-vehicles')");
 assert.ok(code.includes('FROM vehicles WHERE user_id=?'));
});
test('Family members endpoint checks membership',()=>{
 const code=section("if ($action==='family-members')","if (in_array($action,['family-list'");
 assert.ok(code.includes('SELECT role FROM family_members WHERE family_id=? AND user_id=?'));
 assert.ok(code.includes("fail(404,'Familie nicht gefunden')"));
});
