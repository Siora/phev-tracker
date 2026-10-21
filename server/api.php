<?php
/*
 * PHEV Tracker – serverseitige JSON-API
 *
 * Verantwortlich für Authentifizierung, Benutzerverwaltung, Fahrzeuge
 * und fahrzeuggebundene Datensätze. Besitzprüfungen schützen Nutzerdaten.
 * Datenbankschema und API-Verhalten bleiben durch diese Kommentare unverändert.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(int $status, array $body): never { http_response_code($status); echo json_encode($body, JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE); exit; }
function fail(int $code, string $message): never { respond($code, ['error'=>$message]); }
if (!is_file(__DIR__.'/config.php')) fail(503, 'Serverkonfiguration fehlt');
$config = require __DIR__.'/config.php';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && $origin !== $config['allowed_origin']) fail(403, 'Origin nicht erlaubt');
if ($origin) { header('Access-Control-Allow-Origin: '.$origin); header('Vary: Origin'); }
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') respond(200, ['ok'=>true]);
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET','POST'], true)) fail(405, 'Methode nicht erlaubt');
if (($_SERVER['HTTPS'] ?? '') !== 'on' && ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') !== 'https') fail(403, 'HTTPS erforderlich');
try {
 $db = new PDO($config['dsn'], $config['user'], $config['password'], [
  PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
  PDO::ATTR_EMULATE_PREPARES=>false
 ]);
} catch (Throwable $e) { error_log((string)$e); fail(503, 'Datenbank nicht verfügbar'); }
$action = $_GET['action'] ?? '';
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
 if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 2000000) fail(413, 'Anfrage zu gross');
 $body = json_decode(file_get_contents('php://input'), true);
 if (!is_array($body)) fail(400, 'Ungültiges JSON');
}
function email(string $value): string { return mb_strtolower(trim($value)); }
if ($action === 'login') {
 if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'POST erforderlich');
 $mail = email((string)($body['email'] ?? ''));
 $password = (string)($body['password'] ?? '');
 if (!filter_var($mail, FILTER_VALIDATE_EMAIL) || strlen($password) < 12 || strlen($password) > 1024) fail(400, 'E-Mail oder Passwort ungültig (mindestens 12 Zeichen)');
 $stmt=$db->prepare('SELECT id,password_hash,role FROM users WHERE email=?');
 $stmt->execute([$mail]); $user=$stmt->fetch();
 if (!$user || !password_verify($password,$user['password_hash'])) { usleep(250000); fail(401, 'Anmeldung fehlgeschlagen'); }
 $uid=(int)$user['id'];
 $token=bin2hex(random_bytes(32));
 $stmt=$db->prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))');
 $stmt->execute([hash('sha256',$token),$uid]);
 respond(200,['token'=>$token,'email'=>$mail,'role'=>$user['role']]);
}
$auth=$_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if (!preg_match('/^Bearer ([a-f0-9]{64})$/D',$auth,$match)) fail(401,'Anmeldung erforderlich');
$hash=hash('sha256',$match[1]);
$stmt=$db->prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP()');
$stmt->execute([$hash]); $uid=$stmt->fetchColumn();
if (!$uid) fail(401,'Sitzung abgelaufen');
$uid=(int)$uid;
if ($action === 'admin-create-user') {
 if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405,'POST erforderlich');
 $stmt=$db->prepare('SELECT role FROM users WHERE id=?'); $stmt->execute([$uid]);
 if ($stmt->fetchColumn() !== 'admin') fail(403,'Nur Administratoren');
 $mail=email((string)($body['email']??''));
 $password=(string)($body['password']??'');
 $role=(string)($body['role']??'user');
 if (!in_array($role,['admin','user'],true)) fail(400,'Ungültige Rolle');
 if (!filter_var($mail,FILTER_VALIDATE_EMAIL) || strlen($password)<12 || strlen($password)>1024) fail(400,'Ungültige E-Mail oder Passwort');
 try {
  $stmt=$db->prepare("INSERT INTO users(email,password_hash,role) VALUES (?,?,?)");
  $stmt->execute([$mail,password_hash($password,PASSWORD_DEFAULT),$role]);
 } catch (PDOException $e) { fail(409,'Konto konnte nicht erstellt werden'); }
 respond(201,['ok'=>true]);
}
if ($action === 'admin-users') {
 if ($_SERVER['REQUEST_METHOD'] !== 'GET') fail(405,'GET erforderlich');
 $stmt=$db->prepare('SELECT role FROM users WHERE id=?'); $stmt->execute([$uid]);
 if ($stmt->fetchColumn() !== 'admin') fail(403,'Nur Administratoren');
 $stmt=$db->query('SELECT id,email,role,created_at FROM users ORDER BY id');
 respond(200,['users'=>$stmt->fetchAll()]);
}
if ($action === 'logout') {
 if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405,'POST erforderlich');
 $stmt=$db->prepare('DELETE FROM sessions WHERE token_hash=?');$stmt->execute([$hash]);respond(200,['ok'=>true]);
}

if ($action === 'vehicles' && $_SERVER['REQUEST_METHOD'] === 'GET') {
 $stmt=$db->prepare('SELECT id,brand,model,model_year,plate,drivetrain,battery_kwh,tank_liters,notes FROM vehicles WHERE user_id=? ORDER BY brand,model,id');
 $stmt->execute([$uid]);respond(200,['vehicles'=>$stmt->fetchAll()]);
}
if ($action === 'vehicle-save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $v=$body['vehicle']??null;if (!is_array($v)) fail(400,'Fahrzeug fehlt');
 $vid=(int)($v['id']??0);
 $brand=trim((string)($v['brand']??''));$model=trim((string)($v['model']??''));
 $plate=trim((string)($v['plate']??''));$drive=trim((string)($v['drivetrain']??''));$notes=trim((string)($v['notes']??''));
 $year=($v['model_year']??'')===''?null:(int)$v['model_year'];
 $battery=($v['battery_kwh']??'')===''?null:$v['battery_kwh'];
 $tank=($v['tank_liters']??'')===''?null:$v['tank_liters'];
 if (!$brand||!$model||mb_strlen($brand)>100||mb_strlen($model)>100||mb_strlen($plate)>40||mb_strlen($drive)>60||mb_strlen($notes)>5000||
  ($year!==null&&($year<1900||$year>2200))||
  ($battery!==null&&(!is_numeric($battery)||(float)$battery<0||(float)$battery>10000))||
  ($tank!==null&&(!is_numeric($tank)||(float)$tank<0||(float)$tank>10000))) fail(400,'Ungültige Fahrzeugdaten');
 $params=[$brand,$model,$year,$plate,$drive,$battery,$tank,$notes];
 if ($vid>0) {
  $stmt=$db->prepare('UPDATE vehicles SET brand=?,model=?,model_year=?,plate=?,drivetrain=?,battery_kwh=?,tank_liters=?,notes=? WHERE id=? AND user_id=?');
  $stmt->execute([...$params,$vid,$uid]);
  if (!$stmt->rowCount()) { $check=$db->prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?');$check->execute([$vid,$uid]);if (!$check->fetchColumn()) fail(404,'Fahrzeug nicht gefunden'); }
 } else {
  $stmt=$db->prepare('INSERT INTO vehicles(brand,model,model_year,plate,drivetrain,battery_kwh,tank_liters,notes,user_id) VALUES (?,?,?,?,?,?,?,?,?)');
  $stmt->execute([...$params,$uid]);$vid=(int)$db->lastInsertId();
 }
 respond(200,['ok'=>true,'id'=>$vid]);
}
if ($action === 'vehicle-delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $vid=(int)($body['id']??0);if ($vid<=0) fail(400,'Fahrzeug fehlt');
 $stmt=$db->prepare('SELECT COUNT(*) FROM records WHERE user_id=? AND vehicle_id=?');$stmt->execute([$uid,$vid]);
 if ((int)$stmt->fetchColumn()>0) fail(409,'Fahrzeug hat Einträge. Bitte zuerst die Einträge zuordnen oder das Fahrzeug behalten.');
 $stmt=$db->prepare('DELETE FROM vehicles WHERE user_id=? AND id=?');$stmt->execute([$uid,$vid]);
 respond(200,['ok'=>true]);
}
$chargeKindColumn=(bool)$db->query("SHOW COLUMNS FROM records LIKE 'charge_kind'")->fetch();
$hasPreferences=(bool)$db->query("SHOW COLUMNS FROM user_settings LIKE 'prefs_json'")->fetch();
if ($action === 'preferences' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 if (!$hasPreferences) fail(503,'Cloud-Einstellungen noch nicht aktiviert');
 $prefs=$body['preferences']??null;
 if (!is_array($prefs)) fail(400,'Ungültige Einstellungen');
 $json=json_encode($prefs,JSON_UNESCAPED_UNICODE);
 if ($json===false || strlen($json)>30000) fail(400,'Ungültige Einstellungen');
 $stmt=$db->prepare('INSERT INTO user_settings(user_id,prefs_json) VALUES (?,?) ON DUPLICATE KEY UPDATE prefs_json=VALUES(prefs_json)');
 $stmt->execute([$uid,$json]);
 respond(200,['ok'=>true]);
}
if ($action === 'data' && $_SERVER['REQUEST_METHOD'] === 'GET') {
 $stmt=$db->prepare('SELECT id,type,date,time,charge_mode,'.($chargeKindColumn?'charge_kind':'NULL AS charge_kind').',amount,cost,currency,km,place,vehicle_id FROM records WHERE user_id=? ORDER BY date DESC');
 $stmt->execute([$uid]);$rows=$stmt->fetchAll();
 $stmt=$db->prepare('SELECT base,rate FROM user_settings WHERE user_id=?');$stmt->execute([$uid]);
 $settings=$stmt->fetch() ?: ['base'=>'CHF','rate'=>0.94];
 $prefs=null;
 if ($hasPreferences) { $stmt=$db->prepare('SELECT prefs_json FROM user_settings WHERE user_id=?');$stmt->execute([$uid]);$prefs=json_decode((string)$stmt->fetchColumn(),true); }
 respond(200,['records'=>$rows,'settings'=>$settings,'preferences'=>$prefs,'preferences_available'=>$hasPreferences]);
}
if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $r=$body['record'] ?? null;
 if (!is_array($r)) fail(400,'Eintrag fehlt');
 $id=(string)($r['id'] ?? '');
 $date=(string)($r['date'] ?? '');
 $time=(string)($r['time'] ?? '');
 $chargeMode=(string)($r['charge_mode'] ?? '');
 $chargeKind=(string)($r['charge_kind'] ?? '');
 if (!in_array($chargeKind,['','Zuhause','Öffentlich','Arbeitsplatz','Kostenlos'],true)) fail(400,'Ungültiger Ladeort');
 if ($time!=='' && !preg_match('/^[0-2][0-9]:[0-5][0-9]$/D',$time)) fail(400,'Ungültige Uhrzeit');
 if ($time!=='' && (int)substr($time,0,2)>23) fail(400,'Ungültige Uhrzeit');
 if (!in_array($chargeMode,['','AC','DC'],true)) fail(400,'Ungültiger Ladestrom');
 $dt=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
 if (!preg_match('/^[a-zA-Z0-9_-]{1,64}$/D',$id) || !in_array($r['type'] ?? '', ['charge','fuel'],true) ||
  !$dt || $dt->format('Y-m-d')!==$date ||
  !is_numeric($r['amount'] ?? null) || (float)$r['amount']<=0 || (float)$r['amount']>1000000 ||
  !is_numeric($r['cost'] ?? null) || (float)$r['cost']<0 || (float)$r['cost']>1000000 ||
  !in_array($r['currency'] ?? '', ['CHF','EUR'],true) ||
  strlen((string)($r['place'] ?? ''))>255 ||
  (isset($r['km']) && (!is_numeric($r['km']) || (float)$r['km']<0 || (float)$r['km']>100000000))) fail(400,'Ungültiger Eintrag');
 $vehicleId=($r['vehicle_id']??null)===null||($r['vehicle_id']??'')===''?null:(int)$r['vehicle_id'];
 if ($vehicleId!==null) {if ($vehicleId<=0) fail(400,'Ungültiges Fahrzeug');$check=$db->prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?');$check->execute([$vehicleId,$uid]);if (!$check->fetchColumn()) fail(403,'Fahrzeug nicht erlaubt');}
 $columns='id,user_id,type,date,time,charge_mode,amount,cost,currency,km,place,vehicle_id';
 $values='?,?,?,?,?,?,?,?,?,?,?,?';
 $updates='type=VALUES(type),date=VALUES(date),time=VALUES(time),charge_mode=VALUES(charge_mode),amount=VALUES(amount),cost=VALUES(cost),currency=VALUES(currency),km=VALUES(km),place=VALUES(place),vehicle_id=VALUES(vehicle_id)';
 $params=[$id,$uid,$r['type'],$date,$time?:null,$chargeMode?:null,$r['amount'],$r['cost'],$r['currency'],$r['km']??null,$r['place']??'',$vehicleId];
 if ($chargeKindColumn) {
  $columns.=',charge_kind';$values.=',?';$updates.=',charge_kind=VALUES(charge_kind)';$params[]=$chargeKind?:null;
 }
 $stmt=$db->prepare('INSERT INTO records('.$columns.') VALUES ('.$values.') ON DUPLICATE KEY UPDATE '.$updates);
 $stmt->execute($params);
 respond(200,['ok'=>true]);
}
if ($action === 'delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $id=(string)($body['id'] ?? '');
 $stmt=$db->prepare('DELETE FROM records WHERE user_id=? AND id=?');$stmt->execute([$uid,$id]);
 respond(200,['ok'=>true]);
}
if ($action === 'settings' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $base=$body['base']??'';$rate=$body['rate']??null;
 if (!in_array($base,['CHF','EUR'],true) || !is_numeric($rate) || (float)$rate<=0 || (float)$rate>1000) fail(400,'Ungültige Einstellungen');
 $stmt=$db->prepare('INSERT INTO user_settings(user_id,base,rate) VALUES (?,?,?) ON DUPLICATE KEY UPDATE base=VALUES(base),rate=VALUES(rate)');
 $stmt->execute([$uid,$base,$rate]);respond(200,['ok'=>true]);
}
fail(404,'Unbekannte Aktion');
