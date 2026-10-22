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
if ($origin && !in_array($origin, [$config['allowed_origin'], 'capacitor://localhost', 'https://tracker.web-produktion.com'], true)) fail(403, 'Origin nicht erlaubt');
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
 if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > (($_GET['action']??'')==='vehicle-photo-upload'?5500000:2000000)) fail(413, 'Anfrage zu gross');
 if (($_GET['action'] ?? '') !== 'vehicle-photo-upload') {
  $body = json_decode(file_get_contents('php://input'), true);
  if (!is_array($body)) fail(400, 'Ungültiges JSON');
 }
}
function email(string $value): string { return mb_strtolower(trim($value)); }
// Serverkompatible Cookie-Sitzung mit CSRF-Schutz bei POST ohne Bearer-Token.
const PHEV_SESSION_COOKIE = 'phev_session';
function sessionCookie(string $token, int $expires): void {
 setcookie(PHEV_SESSION_COOKIE,$token,['expires'=>$expires,'path'=>'/api/','secure'=>true,'httponly'=>true,'samesite'=>'Lax']);
}
function cookieRequestOriginAllowed(): bool {
 $expected='https://tracker.web-produktion.com';
 $origin=$_SERVER['HTTP_ORIGIN']??'';
 if ($origin!=='') return hash_equals($expected,$origin);
 $referer=$_SERVER['HTTP_REFERER']??'';
 if ($referer!=='') {
  $parts=parse_url($referer);
  return is_array($parts)&&($parts['scheme']??'')==='https'&&($parts['host']??'')==='tracker.web-produktion.com'&&!isset($parts['port']);
 }
 return false;
}
/**
 * Versendet eine Klartext-E-Mail über authentifiziertes SMTP mit STARTTLS.
 * Vertrauliche Zugangsdaten stehen ausschließlich in server/config.php.
 */
function sendResetMail(array $config,string $recipient,string $subject,string $message): bool {
 $host=(string)($config['smtp_host']??'');
 $port=(int)($config['smtp_port']??587);
 $username=(string)($config['smtp_username']??'');
 $password=(string)($config['smtp_password']??'');
 $sender=(string)($config['reset_mail_from']??'');
 if (!$host || !$username || !$password || !filter_var($sender,FILTER_VALIDATE_EMAIL) || !filter_var($recipient,FILTER_VALIDATE_EMAIL) || $port<1 || $port>65535) return false;
 $socket=@stream_socket_client('tcp://'.$host.':'.$port,$errno,$errstr,15,STREAM_CLIENT_CONNECT);
 if (!$socket) return false;
 stream_set_timeout($socket,15);
 $read=function()use($socket): int {
  $response='';
  do {
   $line=fgets($socket,2048);
   if ($line===false) return 0;
   $response.=$line;
  } while (strlen($line)>=4 && $line[3]==='-');
  return (int)substr($response,0,3);
 };
 $send=function(string $command)use($socket): void { fwrite($socket,$command."\r\n"); };
 try {
  if ($read()!==220) return false;
  $send('EHLO tracker.web-produktion.com');if ($read()!==250)return false;
  $send('STARTTLS');if ($read()!==220)return false;
  if (!stream_socket_enable_crypto($socket,true,STREAM_CRYPTO_METHOD_TLS_CLIENT))return false;
  $send('EHLO tracker.web-produktion.com');if ($read()!==250)return false;
  $send('AUTH LOGIN');if ($read()!==334)return false;
  $send(base64_encode($username));if ($read()!==334)return false;
  $send(base64_encode($password));if ($read()!==235)return false;
  $send('MAIL FROM:<'.$sender.'>');if ($read()!==250)return false;
  $send('RCPT TO:<'.$recipient.'>');if (!in_array($read(),[250,251],true))return false;
  $send('DATA');if ($read()!==354)return false;
  $headers="From: PHEV Tracker <".$sender.">\r\nTo: <".$recipient.">\r\nSubject: ".$subject."\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8";
  $payload=$headers."\r\n\r\n".$message;
  $payload=str_replace(["\r\n","\r"],"\n",$payload);
  $payload=preg_replace('/^\./m','..',$payload);
  $send(str_replace("\n","\r\n",$payload)."\r\n.");
  if ($read()!==250)return false;
  $send('QUIT');return true;
 } catch (Throwable $e) { error_log('SMTP transport error');return false; }
 finally {fclose($socket);}
}
// 3.0: Öffentliche Passwort-Wiederherstellung ohne Konten-Offenlegung.
// SMTP-/Mailtransport und Migration müssen vor Freischaltung eingerichtet sein.
if ($action === 'password-reset-request') {
 if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405,'POST erforderlich');
 $mail=email((string)($body['email']??''));
 if (!filter_var($mail,FILTER_VALIDATE_EMAIL)) fail(400,'Ungültige E-Mail-Adresse');
 $sender=(string)($config['reset_mail_from']??'');
 if (!filter_var($sender,FILTER_VALIDATE_EMAIL) || empty($config['smtp_username']) || empty($config['smtp_password'])) fail(503,'Passwort-Wiederherstellung ist noch nicht eingerichtet');
 $stmt=$db->prepare('SELECT id FROM users WHERE email=?');$stmt->execute([$mail]);$target=$stmt->fetchColumn();
 if ($target) {
  $stmt=$db->prepare('SELECT COUNT(*) FROM password_resets WHERE user_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE)');
  $stmt->execute([$target]);
  if (!(int)$stmt->fetchColumn()) {
   $token=bin2hex(random_bytes(32));$hash=hash('sha256',$token);
   $stmt=$db->prepare('DELETE FROM password_resets WHERE user_id=? OR expires_at<UTC_TIMESTAMP()');$stmt->execute([$target]);
   $stmt=$db->prepare('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))');
   $stmt->execute([$target,$hash]);
   $link='https://tracker.web-produktion.com/#reset-token='.$token;
   $subject='PHEV Tracker - Passwort zuruecksetzen';
   $message="Zum Zuruecksetzen des Passworts diesen Link innerhalb von 30 Minuten oeffnen:\n".$link."\nFalls du dies nicht angefordert hast, ignoriere diese E-Mail.\n";
   if (!sendResetMail($config,$mail,$subject,$message)) {
    $stmt=$db->prepare('DELETE FROM password_resets WHERE token_hash=?');$stmt->execute([$hash]);
    error_log('PHEV password reset email delivery failed');
   }
  }
 }
 respond(200,['ok'=>true,'message'=>'Falls das Konto existiert, erhältst du eine E-Mail mit weiteren Schritten.']);
}
if ($action === 'password-reset-confirm') {
 if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405,'POST erforderlich');
 $token=(string)($body['token']??'');$new=(string)($body['new_password']??'');
 if (!preg_match('/^[a-f0-9]{64}$/D',$token)) fail(400,'Ungültiger Reset-Link');
 if (strlen($new)<12 || strlen($new)>1024) fail(400,'Neues Passwort muss 12 bis 1024 Zeichen enthalten');
 $db->beginTransaction();
 try {
  $stmt=$db->prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE');
  $stmt->execute([hash('sha256',$token)]);$target=$stmt->fetchColumn();
  if (!$target){$db->rollBack();fail(400,'Reset-Link ist ungültig oder abgelaufen');}
  $stmt=$db->prepare('UPDATE users SET password_hash=? WHERE id=?');$stmt->execute([password_hash($new,PASSWORD_DEFAULT),$target]);
  $stmt=$db->prepare('DELETE FROM sessions WHERE user_id=?');$stmt->execute([$target]);
  $stmt=$db->prepare('DELETE FROM password_resets WHERE user_id=?');$stmt->execute([$target]);
  $db->commit();
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();error_log((string)$e);fail(500,'Passwort konnte nicht zurückgesetzt werden');}
 sessionCookie('',time()-3600);respond(200,['ok'=>true]);
}
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
 sessionCookie($token,time()+7*86400);
 respond(200,['token'=>$token,'email'=>$mail,'role'=>$user['role']]);
}
$auth=$_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
 $bearerToken=preg_match('/^Bearer ([a-f0-9]{64})$/D',$auth,$match)?$match[1]:null;
$cookieToken=$_COOKIE[PHEV_SESSION_COOKIE]??null;
$cookieToken=is_string($cookieToken)&&preg_match('/^[a-f0-9]{64}$/D',$cookieToken)?$cookieToken:null;
$token=$bearerToken??$cookieToken;
if ($token===null) fail(401,'Anmeldung erforderlich');
if ($bearerToken===null && $_SERVER['REQUEST_METHOD']==='POST' && !cookieRequestOriginAllowed()) fail(403,'Ungültiger Anfragenursprung');
$hash=hash('sha256',$token);
$stmt=$db->prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP()');
$stmt->execute([$hash]); $uid=$stmt->fetchColumn();
if (!$uid) fail(401,'Sitzung abgelaufen');
$uid=(int)$uid;
if ($action === 'session') {
 if ($_SERVER['REQUEST_METHOD'] !== 'GET') fail(405,'GET erforderlich');
 $stmt=$db->prepare('SELECT email,role FROM users WHERE id=?');
 $stmt->execute([$uid]);$account=$stmt->fetch();
 if (!$account) fail(401,'Anmeldung erforderlich');
 respond(200,['email'=>$account['email'],'role'=>$account['role']]);
}
// 3.0: Passwortwechsel nur nach Prüfung des bisherigen Passworts.
// Nach Erfolg werden alle Sitzungen widerrufen; die Anmeldung ist erneut nötig.
if ($action === 'account-change-password') {
 if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405,'POST erforderlich');
 $old=(string)($body['current_password']??'');
 $new=(string)($body['new_password']??'');
 if (strlen($new)<12 || strlen($new)>1024) fail(400,'Neues Passwort muss 12 bis 1024 Zeichen enthalten');
 if (hash_equals($old,$new)) fail(400,'Das neue Passwort muss sich vom bisherigen unterscheiden');
 $stmt=$db->prepare('SELECT password_hash FROM users WHERE id=?');
 $stmt->execute([$uid]);$existing=$stmt->fetchColumn();
 if (!$existing || !password_verify($old,(string)$existing)) {usleep(250000);fail(401,'Aktuelles Passwort ist falsch');}
 $db->beginTransaction();
 try {
  $stmt=$db->prepare('UPDATE users SET password_hash=? WHERE id=?');
  $stmt->execute([password_hash($new,PASSWORD_DEFAULT),$uid]);
  $stmt=$db->prepare('DELETE FROM sessions WHERE user_id=?');$stmt->execute([$uid]);
  $db->commit();
 } catch (Throwable $e) { $db->rollBack();error_log((string)$e);fail(500,'Passwort konnte nicht geändert werden'); }
 sessionCookie('',time()-3600);
 respond(200,['ok'=>true,'reauthenticate'=>true]);
}
// 3.0: Konto nach Passwortprüfung löschen; letzten Administrator schützen.
if ($action === 'account-delete') {
 if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405,'POST erforderlich');
 if (($body['confirmation']??'')!=='KONTO LÖSCHEN') fail(400,'Sicherheitsbestätigung fehlt');
 $password=(string)($body['password']??'');
 $db->beginTransaction();
 try {
  $stmt=$db->prepare('SELECT password_hash,role FROM users WHERE id=? FOR UPDATE');
  $stmt->execute([$uid]);$account=$stmt->fetch();
  if (!$account || !password_verify($password,$account['password_hash'])) { $db->rollBack();usleep(250000);fail(401,'Passwort ist falsch'); }
  if ($account['role']==='admin') {
   $stmt=$db->query("SELECT id FROM users WHERE role='admin' FOR UPDATE");
   if (count($stmt->fetchAll())<=1) { $db->rollBack();fail(409,'Der letzte Administrator kann sein Konto nicht löschen'); }
  }
  $stmt=$db->prepare('DELETE FROM users WHERE id=?');$stmt->execute([$uid]);
  $db->commit();
 } catch (Throwable $e) {if($db->inTransaction())$db->rollBack();error_log((string)$e);fail(500,'Konto konnte nicht gelöscht werden');}
 sessionCookie('',time()-3600);
 respond(200,['ok'=>true]);
}
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
 $stmt=$db->prepare('DELETE FROM sessions WHERE token_hash=?');$stmt->execute([$hash]);sessionCookie('',time()-3600);respond(200,['ok'=>true]);
}


if ($action === 'charging-catalog' && $_SERVER['REQUEST_METHOD'] === 'GET') {
 $result=[];
 foreach (['locations'=>'charging_locations','providers'=>'charging_providers'] as $key=>$table) {
  $stmt=$db->prepare('SELECT id,name,'.($key==='locations'?'kind,':'').'price FROM '.$table.' WHERE user_id=? ORDER BY name,id');
  $stmt->execute([$uid]);$result[$key]=$stmt->fetchAll();
 }
 respond(200,$result);
}
if ($action === 'charging-catalog-save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $category=$body['category']??'';
 $table=['locations'=>'charging_locations','providers'=>'charging_providers'][$category]??null;
 if (!$table) fail(400,'Ungültige Kategorie');
 $entry=$body['entry']??null;
 if (!is_array($entry)) fail(400,'Eintrag fehlt');
 $id=$entry['id']??null;$name=trim((string)($entry['name']??''));
 $price=$entry['price']??null;
 if (!is_string($id) || !preg_match('/^[a-zA-Z0-9-]{1,80}$/D',$id) || $name==='' || mb_strlen($name)>100 || ($price!==null && (!is_numeric($price) || (float)$price<0 || (float)$price>1000))) fail(400,'Ungültiger Eintrag');
 if ($category==='locations') {
  $kind=$entry['kind']??'';
  if (!in_array($kind,['','Zuhause','Öffentlich','Arbeitsplatz','Kostenlos'],true)) fail(400,'Ungültiger Ladeorttyp');
  $stmt=$db->prepare('INSERT INTO charging_locations(id,user_id,name,kind,price) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),kind=VALUES(kind),price=VALUES(price)');
  $stmt->execute([$id,$uid,$name,$kind,$price]);
 } else {
  $stmt=$db->prepare('INSERT INTO charging_providers(id,user_id,name,price) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),price=VALUES(price)');
  $stmt->execute([$id,$uid,$name,$price]);
 }
 respond(200,['ok'=>true]);
}
if ($action === 'charging-catalog-delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $table=['locations'=>'charging_locations','providers'=>'charging_providers'][$body['category']??'']??null;
 $id=$body['id']??null;
 if (!$table || !is_string($id)) fail(400,'Ungültige Anfrage');
 $stmt=$db->prepare('DELETE FROM '.$table.' WHERE user_id=? AND id=?');$stmt->execute([$uid,$id]);
 respond(200,['ok'=>true]);
}

// Authenticated vehicle photos: files are never served from a public folder.
if ($action === 'vehicle-photo-upload' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $vid=filter_var($_POST['vehicle_id']??null,FILTER_VALIDATE_INT);
 if (!$vid || $vid<1) fail(400,'Ungültiges Fahrzeug');
 $stmt=$db->prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?');
 $stmt->execute([$vid,$uid]);if (!$stmt->fetchColumn()) fail(404,'Fahrzeug nicht gefunden');
 if (!isset($_FILES['photo']) || !is_array($_FILES['photo']) || $_FILES['photo']['error']!==UPLOAD_ERR_OK) fail(400,'Bild-Upload fehlgeschlagen');
 $file=$_FILES['photo'];
 if ($file['size']<1 || $file['size']>5000000 || !is_uploaded_file($file['tmp_name'])) fail(413,'Bild darf maximal 5 MB gross sein');
 $type=(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
 if (!in_array($type,['image/jpeg','image/png','image/webp'],true)) fail(415,'Nur JPEG, PNG und WebP erlaubt');
 if (@getimagesize($file['tmp_name'])===false) fail(415,'Ungültiges Bild');
 $dir=__DIR__.'/vehicle-images';
 if (!is_dir($dir) && !mkdir($dir,0700,true)) fail(503,'Bildspeicher nicht verfügbar');
 if (!is_file($dir.'/.htaccess')) file_put_contents($dir.'/.htaccess',"Require all denied\nDeny from all\n");
 $extension=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'][$type];
 $name=$uid.'-'.$vid.'-'.bin2hex(random_bytes(12)).'.'.$extension;
 if (!move_uploaded_file($file['tmp_name'],$dir.'/'.$name)) fail(503,'Bild konnte nicht gespeichert werden');
 @chmod($dir.'/'.$name,0600);
 respond(200,['ok'=>true,'photo_url'=>'/api/api.php?action=vehicle-photo&vehicle_id='.$vid.'&image='.$name]);
}
if ($action === 'vehicle-photo' && $_SERVER['REQUEST_METHOD'] === 'GET') {
 $vid=filter_var($_GET['vehicle_id']??null,FILTER_VALIDATE_INT);
 $name=$_GET['image']??'';
 if (!$vid || $vid<1 || !is_string($name) || !preg_match('/^[0-9]+-[0-9]+-[a-f0-9]{24}\\.(jpg|png|webp)$/D',$name)) fail(404,'Bild nicht gefunden');
 if (!str_starts_with($name,$uid.'-'.$vid.'-')) fail(404,'Bild nicht gefunden');
 $stmt=$db->prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?');
 $stmt->execute([$vid,$uid]);if (!$stmt->fetchColumn()) fail(404,'Bild nicht gefunden');
 $path=__DIR__.'/vehicle-images/'.$name;
 if (!is_file($path)) fail(404,'Bild nicht gefunden');
 header('Content-Type: '.(['jpg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp'][pathinfo($path,PATHINFO_EXTENSION)]));
 header('Content-Length: '.filesize($path));
 header('Cache-Control: private, max-age=3600');
 readfile($path);exit;
}
/*
 * Fahrzeugausgaben werden separat in vehicle_expenses gespeichert.
 * Jede Abfrage ist auf den angemeldeten Benutzer begrenzt. Die Kombination
 * (user_id, vehicle_id) wird beim Speichern explizit geprüft und zusätzlich
 * durch den zusammengesetzten SQL-Fremdschlüssel abgesichert.
 */
if ($action === 'vehicle-expenses' && $_SERVER['REQUEST_METHOD'] === 'GET') {
 $stmt=$db->prepare('SELECT id,vehicle_id,category,expense_date AS date,amount,currency,note,mileage_km,next_service_date FROM vehicle_expenses WHERE user_id=? ORDER BY expense_date DESC,id');
 $stmt->execute([$uid]);
 respond(200,['expenses'=>$stmt->fetchAll()]);
}
if ($action === 'vehicle-expense-save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $e=$body['expense']??null;
 if (!is_array($e)) fail(400,'Ausgabe fehlt');
 $id=$e['id']??null;
 $vid=filter_var($e['vehicle_id']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
 $category=trim((string)($e['category']??''));
 $date=$e['date']??null;
 $amount=$e['amount']??null;
 $currency=$e['currency']??null;
 $note=trim((string)($e['note']??''));
 $mileage=$e['mileage_km']??null;
 $next=$e['next_service_date']??null;
 if (!is_string($id)||!preg_match('/^[a-zA-Z0-9-]{1,64}$/D',$id)||
     !$vid||!in_array($category,['Versicherung','Verkehrssteuer','Service','Reifen','Reparatur','Parken','Sonstiges'],true)||
     !is_string($date)||!preg_match('/^\\d{4}-\\d{2}-\\d{2}$/D',$date)||
     !($parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date))||$parsed->format('Y-m-d')!==$date||
     !is_numeric($amount)||(float)$amount<=0||(float)$amount>9999999999.99||
     !in_array($currency,['CHF','EUR'],true)||mb_strlen($note)>160||
     ($mileage!==null&&(!is_numeric($mileage)||(float)$mileage<0||(float)$mileage>99999999999.9))||
     ($next!==null&&(!is_string($next)||!preg_match('/^\\d{4}-\\d{2}-\\d{2}$/D',$next)||
       !($parsedNext=DateTimeImmutable::createFromFormat('!Y-m-d',$next))||$parsedNext->format('Y-m-d')!==$next)))
   fail(400,'Ungültige Ausgabendaten');
 $owner=$db->prepare('SELECT id FROM vehicles WHERE user_id=? AND id=?');
 $owner->execute([$uid,$vid]);
 if (!$owner->fetchColumn()) fail(404,'Fahrzeug nicht gefunden');
 // Keine Übernahme einer fremden ID: der PRIMARY KEY enthält user_id.
 $stmt=$db->prepare('INSERT INTO vehicle_expenses(user_id,id,vehicle_id,category,expense_date,amount,currency,note,mileage_km,next_service_date) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE vehicle_id=VALUES(vehicle_id),category=VALUES(category),expense_date=VALUES(expense_date),amount=VALUES(amount),currency=VALUES(currency),note=VALUES(note),mileage_km=VALUES(mileage_km),next_service_date=VALUES(next_service_date)');
 $stmt->execute([$uid,$id,$vid,$category,$date,$amount,$currency,$note,$mileage,$next]);
 respond(200,['ok'=>true,'id'=>$id]);
}
if ($action === 'vehicle-expense-delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 $id=$body['id']??null;
 if (!is_string($id)||!preg_match('/^[a-zA-Z0-9-]{1,64}$/D',$id)) fail(400,'Ungültige Ausgaben-ID');
 $stmt=$db->prepare('DELETE FROM vehicle_expenses WHERE user_id=? AND id=?');
 $stmt->execute([$uid,$id]);
 if (!$stmt->rowCount()) fail(404,'Ausgabe nicht gefunden');
 respond(200,['ok'=>true]);
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
 $stmt=$db->prepare('SELECT COUNT(*) FROM vehicle_expenses WHERE user_id=? AND vehicle_id=?');$stmt->execute([$uid,$vid]);
 if ((int)$stmt->fetchColumn()>0) fail(409,'Fahrzeug hat Wartungs- oder Kostenbuchungen. Bitte zuerst diese Einträge entfernen oder das Fahrzeug behalten.');
 $stmt=$db->prepare('DELETE FROM vehicles WHERE user_id=? AND id=?');$stmt->execute([$uid,$vid]);
 respond(200,['ok'=>true]);
}
$chargeKindColumn=(bool)$db->query("SHOW COLUMNS FROM records LIKE 'charge_kind'")->fetch();
$hasPreferences=(bool)$db->query("SHOW COLUMNS FROM user_settings LIKE 'prefs_json'")->fetch();
if ($action === 'preferences' && $_SERVER['REQUEST_METHOD'] === 'POST') {
 if (!$hasPreferences) fail(503,'Cloud-Einstellungen noch nicht aktiviert');
 $prefs=$body['preferences']??null;
 if (!is_array($prefs)) fail(400,'Ungültige Einstellungen');
 $keys=['photos','managed_charging','fuel_energy_factor','cost_comparison','base','rate'];
 foreach ($prefs as $key=>$value) if (!in_array($key,$keys,true)) fail(400,'Unbekannte Einstellung');
 if (isset($prefs['photos'])) {
  if (!is_array($prefs['photos']) || count($prefs['photos'])>100) fail(400,'Ungültige Fotos');
  foreach ($prefs['photos'] as $vid=>$url) {
   if (!ctype_digit((string)$vid) || !is_string($url) || strlen($url)>2048 || ($url!=='' && !preg_match('~^https://[^[:space:]]+$~i',$url))) fail(400,'Ungültige Bildadresse');
   $check=$db->prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?');$check->execute([(int)$vid,$uid]);if (!$check->fetchColumn()) fail(403,'Fahrzeug nicht erlaubt');
  }
 }
 if (isset($prefs['fuel_energy_factor']) && (!is_numeric($prefs['fuel_energy_factor']) || $prefs['fuel_energy_factor']<1 || $prefs['fuel_energy_factor']>20)) fail(400,'Ungültiger Energiefaktor');
 if (isset($prefs['cost_comparison'])) {
  $c=$prefs['cost_comparison'];
  if (!is_array($c) || !is_numeric($c['electric']??null) || !is_numeric($c['fuel']??null) || $c['electric']<=0 || $c['electric']>200 || $c['fuel']<=0 || $c['fuel']>100) fail(400,'Ungültige Verbrauchswerte');
 }
 if (isset($prefs['base']) && !in_array($prefs['base'],['CHF','EUR'],true)) fail(400,'Ungültige Währung');
 if (isset($prefs['rate']) && (!is_numeric($prefs['rate']) || $prefs['rate']<=0 || $prefs['rate']>100)) fail(400,'Ungültiger Kurs');
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
