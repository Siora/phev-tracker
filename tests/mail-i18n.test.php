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
