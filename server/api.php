<?php
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
if ($action === 'register' || $action === 'login') {
 if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'POST erforderlich');
 $mail = email((string)($body['email'] ?? ''));
 $password = (string)($body['password'] ?? '');
 if (!filter_var($mail, FILTER_VALIDATE_EMAIL) || strlen($password) < 12 || strlen($password) > 1024) fail(400, 'E-Mail oder Passwort ungültig (mindestens 12 Zeichen)');
 if ($action === 'register') {
  if (empty($config['registration_enabled'])) fail(403, 'Registrierung deaktiviert');
  try {
   $stmt=$db->prepare('INSERT INTO users(email,password_hash) VALUES (?,?)');
   $stmt->execute([$mail,password_hash($password,PASSWORD_DEFAULT)]);
   $uid=(int)$db->lastInsertId();
  } catch (PDOException $e) { fail(409, 'Konto kann nicht erstellt werden'); }
 } else {
  $stmt=$db->prepare('SELECT id,password_hash FROM users WHERE email=?');
  $stmt->execute([$mail]); $user=$stmt->fetch();
  if (!$user || !password_verify($password,$user['password_hash'])) { usleep(250000); fail(401, 'Anmeldung fehlgeschlagen'); }
  $uid=(int)$user['id'];
 }
 $token=bin2hex(random_bytes(32));
 $stmt=$db->prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))');
 $stmt->execute([hash('sha256',$token),$uid]);
 respond(200,['token'=>$token,'email'=>$mail]);
}
$auth=$_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if (!preg_match('/^Bearer ([a-f0-9]{64})$/D',$auth,$match)) fail(401,'Anmeldung erforderlich');
$hash=hash('sha256',$match[1]);
$stmt=$db->prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP()');
$stmt->execute([$hash]); $uid=$stmt->fetchColumn();
if (!$uid) fail(401,'Sitzung abgelaufen');
$uid=(int)$uid;
if ($action === 'logout') {
 if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405,'POST erforderlich');
 $stmt=$db->prepare('DELETE FROM sessions WHERE token_hash=?');$stmt->execute([$hash]);respond(200,['ok'=>true]);
}
if ($action === 'data' && $_SERVER['REQUEST_METHOD'] === 'GET') {
 $stmt=$db->prepare('SELECT id,type,date,amount,cost,currency,km,place FROM records WHERE user_id=? ORDER BY date DESC');
 $stmt->execute([$uid]);$rows=$stmt->fetchAll();
 $stmt=$db->prepare('SELECT base,rate FROM user_settings WHERE user_id=?');$stmt->execute([$uid]);
 respond(200,['records'=>$rows,'settings'=>$stmt->fetch() ?: ['base'=>'CHF','rate'=>0.94]]);
}
if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $r=$body['record'] ?? null;
 if (!is_array($r)) fail(400,'Eintrag fehlt');
 $id=(string)($r['id'] ?? '');
 $date=(string)($r['date'] ?? '');
 $dt=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
 if (!preg_match('/^[a-zA-Z0-9_-]{1,64}$/D',$id) || !in_array($r['type'] ?? '', ['charge','fuel'],true) ||
  !$dt || $dt->format('Y-m-d')!==$date ||
  !is_numeric($r['amount'] ?? null) || (float)$r['amount']<=0 || (float)$r['amount']>1000000 ||
  !is_numeric($r['cost'] ?? null) || (float)$r['cost']<0 || (float)$r['cost']>1000000 ||
  !in_array($r['currency'] ?? '', ['CHF','EUR'],true) ||
  strlen((string)($r['place'] ?? ''))>255 ||
  (isset($r['km']) && (!is_numeric($r['km']) || (float)$r['km']<0 || (float)$r['km']>100000000))) fail(400,'Ungültiger Eintrag');
 $stmt=$db->prepare('INSERT INTO records(id,user_id,type,date,amount,cost,currency,km,place) VALUES (?,?,?,?,?,?,?,?,?)
 ON DUPLICATE KEY UPDATE type=VALUES(type),date=VALUES(date),amount=VALUES(amount),cost=VALUES(cost),currency=VALUES(currency),km=VALUES(km),place=VALUES(place)');
 $stmt->execute([$id,$uid,$r['type'],$date,$r['amount'],$r['cost'],$r['currency'],$r['km']??null,$r['place']??'']);
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
