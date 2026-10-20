# PHEV Tracker – Hetzner PHP/MySQL backend

**Preparation only.** This server directory is not automatically deployed by GitHub Pages.
The existing app continues to use localStorage until a separate, tested client migration is enabled.

1. In konsoleH, configure HTTPS for tracker.web-produktion.com and ensure PHP 8.5 with PDO MySQL.
2. In phpMyAdmin, import schema.sql into the dedicated database.
3. Upload api.php and .htaccess to a protected server directory such as /api; place config.php alongside them. GitHub Pages cannot run PHP.
4. Copy config.example.php to config.php **on the server only**, fill in database settings. Never upload config.php to GitHub or send credentials in chat.
5. For account creation, temporarily set registration_enabled=true, register intended accounts using a controlled HTTPS client, then set false again. Do not leave public registration open.
6. Keep backups. Use unique strong passwords; add rate limiting at the hosting/proxy layer before exposing public login. Consider an invite-only registration workflow and password reset before wider use.
7. Test with a new account and sample data before importing existing records. Verify that user A cannot access user B's records.
8. Client integration and migration must be implemented and tested separately; do not delete localStorage.

Security notes: TLS is mandatory; bearer tokens expire after seven days and should be kept in memory (not localStorage). This starter API does not yet implement password reset, brute-force rate limiting, or transactional bulk import. These are required before production rollout to multiple users.
