# P2PFlow v1.4.18

## SMTP / Email Delivery hotfix

- Runtime now reads `P2PFLOW_SMTP_HOST`, `P2PFLOW_SMTP_PORT`, `P2PFLOW_SMTP_SECURE`, `P2PFLOW_SMTP_STARTTLS`, `P2PFLOW_SMTP_USER`, `P2PFLOW_SMTP_PASS`, and `P2PFLOW_SMTP_HELO` directly, with the legacy `CRM_SMTP_*` names kept as fallback aliases.
- Fixed a fresh-install bug where blank SMTP values already persisted in `db.settings` could shadow valid SMTP values in `.env`.
- SMTP is now treated as one configuration bundle: if no real SMTP configuration is saved in the database, the app uses the `.env` SMTP bundle instead of stale blank/default values.
- Existing Settings > Email Delivery configuration still remains supported when it contains a real SMTP host/user/password.
