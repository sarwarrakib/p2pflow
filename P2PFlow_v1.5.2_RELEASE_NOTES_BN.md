# P2PFlow v1.5.2

## System Update 403 hotfix

- Shared-hosting/LiteSpeed/ModSecurity false-positive protection added to the final update activation step.
- The browser no longer posts owner credentials to `/api/system-update/apply`.
- Update authorization and activation are split into one-time `/api/system-update/permit` + `/api/system-update/commit` requests.
- The one-time permit is memory-only, bound to Owner + operation + version, expires after 90 seconds, and is consumed once.
- Control payloads use `text/plain` transport while still carrying JSON and still require the normal authenticated session, trusted-device binding, same-origin check, and CSRF token.
- A double-slash transport fallback is attempted only when an upstream HTML HTTP 403 is detected; the Node router treats it as the same authenticated endpoint.
- Legacy `/apply` and `/rollback` API routes remain available for compatibility, but the v1.5.2 UI does not use `/apply`.
- Existing signed GitHub release verification, database backup-before-switch, supervisor restart, and automatic rollback behavior are unchanged.

## Upgrade note from v1.5.1

If the hosting WAF blocks the old v1.5.1 `/api/system-update/apply` request before Node receives it, v1.5.1 cannot install its own fix through that blocked endpoint. Install v1.5.2 once by the normal manual package upload/restart method. After v1.5.2 is active, later signed GitHub updates use the hosting-safe activation flow.
