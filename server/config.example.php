<?php
declare(strict_types=1);
// Copy to config.php ON YOUR HETZNER SERVER ONLY; never commit config.php.
return [
 'dsn' => 'mysql:host=localhost;dbname=YOUR_DATABASE;charset=utf8mb4',
 'user' => 'YOUR_DATABASE_USER',
 'password' => 'YOUR_DATABASE_PASSWORD',
 'allowed_origin' => 'https://tracker.web-produktion.com',
 'reset_mail_from' => 'noreply@web-produktion.com',
 'smtp_host' => 'mail.web-produktion.com',
 'smtp_port' => 587, // STARTTLS; Port beim Anbieter verifizieren.
 'smtp_username' => 'noreply@web-produktion.com',
 'smtp_password' => 'SET_ONLY_ON_SERVER', // Niemals ins Repository übernehmen.
 'registration_enabled' => false, // Set true temporarily to create accounts, then disable.
];