<?php
declare(strict_types=1);
require __DIR__.'/../server/mail-i18n.php';
function check(bool $condition,string $message): void {
 if (!$condition) { fwrite(STDERR,$message."\n");exit(1); }
}
$link='https://tracker.web-produktion.com/#reset-token=example';
foreach (['de','en'] as $language) {
 [$subject,$body]=phevMailContent('password-reset',$language,$link);
 check(str_contains($body,$link),'Reset link missing');
 check(str_contains($body,'30'),'Reset expiry missing');
 check(str_contains($body,$language==='en'?'password':'Passwort'),'Reset language wrong');
 check(!str_contains(phevMailSubjectHeader($subject),"\n"),'Invalid subject');
 [$subject,$body]=phevMailContent('family-invite',$language,'https://tracker.web-produktion.com/#family-invite=example');
 check(str_contains($body,'7'),'Invitation expiry missing');
 check(str_contains($body,$language==='en'?'invited':'eingeladen'),'Invitation language wrong');
}
check(phevMailLanguage('fr')==='de','Unknown language must fall back to German');
check(str_starts_with(phevMailSubjectHeader('Passwort zurücksetzen'),'=?UTF-8?B?'),'UTF-8 subject encoding missing');
echo "Transactional email localization: OK\n";

// Each transactional template must be selected by the recipient language,
// independent of the language used for the previous email.
foreach (['en','de','en','de'] as $language) {
 foreach (['password-reset','family-invite'] as $type) {
  [$subject,$body]=phevMailContent($type,$language,$link);
  check(str_contains($subject,$language==='en'?($type==='password-reset'?'Reset your password':'Family invitation'):($type==='password-reset'?'Passwort zurücksetzen':'Familieneinladung')),'Subject language mismatch');
  check(str_contains($body,$language==='en'?($type==='password-reset'?'To reset your password':'You have been invited'):($type==='password-reset'?'Öffne zum Zurücksetzen':'Du wurdest zu einer Familie')),'Body language mismatch');
 }
}


/**
 * Regression protection: messages must be built independently for each recipient.
 * A language change between two sends must not leak the previous template.
 */
foreach (['en','de','en','de','en'] as $language) {
 foreach (['password-reset','family-invite'] as $type) {
  $uniqueLink='https://tracker.web-produktion.com/#'.rawurlencode($language.'-'.$type);
  [$subject,$body]=phevMailContent($type,$language,$uniqueLink);
  check(str_contains($body,$uniqueLink),'Recipient-specific link was lost');
  check(str_starts_with($subject,'PHEV Tracker - '),'Mail subject prefix missing');
  check(!str_contains($body,$language==='en'?'Öffne':'To reset your password'),'Wrong language leaked into email body');
 }
}
check(phevMailLanguage('EN')==='de','Only supported exact language codes are accepted');
check(phevMailLanguage(null)==='de','Missing language must use German');
check(phevMailLanguage('')==='de','Empty language must use German');
check(phevMailLanguage(['en'])==='de','Array input must not influence language');
$rejected=false;
try { phevMailContent('unsupported','en',$link); }
catch (InvalidArgumentException $error) { $rejected=true; }
check($rejected,'Unknown transactional mail type must be rejected');
foreach (["Injected\rSubject","Injected\nSubject"] as $unsafe) {
 $rejected=false;
 try { phevMailSubjectHeader($unsafe); }
 catch (InvalidArgumentException $error) { $rejected=true; }
 check($rejected,'CR/LF in email subject must be rejected');
}
$encoded=phevMailSubjectHeader('Familieneinladung für dich');
check(str_starts_with($encoded,'=?UTF-8?B?'),'Non-ASCII email subject must be RFC 2047 encoded');
check(phevMailSubjectHeader('PHEV Tracker - Family invitation')==='PHEV Tracker - Family invitation','ASCII subject must remain readable');
