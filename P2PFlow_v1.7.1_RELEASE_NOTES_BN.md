# P2PFlow v1.7.1 Release Notes

## System Update transport hotfix

The System Update page could show `Hosting 403 detected: Network request failed for /api/session-step/: timeout` even when no HTTP 403 was actually returned. The page performed a POST readiness probe on the neutral owner update route with a 5-second timeout. Shared-hosting/LiteSpeed/proxy delay could abort that probe, and the UI mislabeled every probe failure as a hosting 403.

### Fixed

- Removed the render-time POST probe from the System Update page. A normal authenticated `GET /api/system-update` already proves the page/server session is reachable.
- Release verification status polling now uses the existing read-only `GET /api/system-update/stage-status` route instead of POSTing `{a:"g"}` to `/api/session-step`.
- The neutral `/api/session-step` text/plain transport is preserved for actual owner-initiated mutation operations (check/stage/config/permit/commit/signing-key), where its WAF-safe envelope is still needed.
- Own request timeouts are now distinguished from navigation cancellation. Timeout errors are typed as timeout/network failures instead of being silently treated as a cancelled UI request.
- Removed the unconditional `Hosting 403 detected` banner. A timeout/network failure is no longer presented as proof of HTTP 403. Real HTML 403 hosting/WAF responses continue to receive the dedicated hosting-security diagnosis inside the mutation transport.
- Read-only stage-status timeout allowance is 12 seconds and does not block normal System Update page rendering.

### Regression protection

- Added `system-update-transport-v171-self-test.js`.
- Updated the WAF transport and release self-tests so GET stage-status is explicitly allowed while direct WAF-sensitive mutation routes remain forbidden.
- The v1.6.4 byte-protected Binance order ingestion core remains unchanged.
- Database schema remains 37; no migration is required.

### Verification

- JavaScript syntax suite: PASS.
- `npm run build`: PASS.
- Full `npm test`: PASS.
- Final unified ZIP is extracted into a clean directory and build/test are repeated before delivery.
