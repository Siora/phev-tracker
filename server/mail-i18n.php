<?php
/**
 * Server-side transactional mail localization.
 * The recipient's stored account language takes precedence over the sender's.
 * No language preference from unauthenticated request bodies is trusted.
 */
declare(strict_types=1);

function phevMailLanguage(mixed $value): string {
 return $value === 'en' ? 'en' : 'de';
}

function phevUserMailLanguage(PDO $db, int $userId): string {
 // Older installations without the language migration must remain functional.
 static $hasLanguage = null;
 if ($hasLanguage === null) {
  $hasLanguage = (bool)$db->query("SHOW COLUMNS FROM users LIKE 'language'")->fetch();
 }
 if (!$hasLanguage) return 'de';
 $stmt=$db->prepare('SELECT language FROM users WHERE id=?');
 $stmt->execute([$userId]);
 return phevMailLanguage($stmt->fetchColumn());
}

/**
 * The invitation recipient may not yet have an account. In that case use the
 * inviting account's language; a future account's own preference overrides it.
 */
function phevInvitationMailLanguage(PDO $db, string $recipient, int $inviterId): string {
 $stmt=$db->prepare('SELECT id FROM users WHERE email=?');
 $stmt->execute([$recipient]);
 $recipientId=$stmt->fetchColumn();
 return phevUserMailLanguage($db, $recipientId ? (int)$recipientId : $inviterId);
}

function phevMailContent(string $type, string $language, string $link): array {
 $language=phevMailLanguage($language);
 if ($type === 'password-reset') {
  if ($language === 'en') return [
   'PHEV Tracker - Reset your password',
   "To reset your password, open this link within 30 minutes:\n".$link."\nIf you did not request this, ignore this email.\n"
  ];
  return [
   'PHEV Tracker - Passwort zurücksetzen',
   "Öffne zum Zurücksetzen deines Passworts diesen Link innerhalb von 30 Minuten:\n".$link."\nFalls du dies nicht angefordert hast, ignoriere diese E-Mail.\n"
  ];
 }
 if ($type === 'family-invite') {
  if ($language === 'en') return [
   'PHEV Tracker - Family invitation',
   "You have been invited to join a family in PHEV Tracker.\nSign in with this email address and open the link within 7 days:\n".$link."\nIf you do not want to join, ignore this message.\n"
  ];
  return [
   'PHEV Tracker - Familieneinladung',
   "Du wurdest zu einer Familie im PHEV Tracker eingeladen.\nMelde dich mit dieser E-Mail-Adresse an und öffne den Link innerhalb von 7 Tagen:\n".$link."\nWenn du nicht teilnehmen möchtest, ignoriere diese Nachricht.\n"
  ];
 }
 throw new InvalidArgumentException('Unknown transactional email type');
}

/** Encode non-ASCII subjects according to RFC 2047 for SMTP headers. */
function phevMailSubjectHeader(string $subject): string {
 if (preg_match('/[\r\n]/', $subject)) throw new InvalidArgumentException('Invalid email subject');
 return preg_match('/[^\x20-\x7E]/', $subject)
  ? '=?UTF-8?B?'.base64_encode($subject).'?='
  : $subject;
}
