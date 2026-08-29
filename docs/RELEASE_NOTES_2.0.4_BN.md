# P2PFlow 2.0.4 Release Notes

## Scope

2.0.4 হলো **Extension Bridge + P2P Market + Web Push + Signed System Update + API contract/performance hardening** checkpoint। 2.0.3-এর SaaS/Super Admin/Billing এবং আগের Binance/financial/security core retained আছে।

## Extension v6.1.9

- tenant-scoped HMAC-derived token
- cross-tenant task/status isolation
- claim lease + stale claim recycle + max attempt policy
- task-specific hashed result token
- direct bridge vs background poll race-এর জন্য `direct_pending` grace state
- failed task cache poisoning বন্ধ; failure order/realtime state-এ যায়
- collector nested Trade Info/Feedback legacy P2P Info fields-এ normalize
- P2P Info realtime refresh + bounded fallback polling
- active/idle adaptive polling + alarm wake fallback
- strict Binance advertiser URL validation
- all-sites static content script removed; configured CRM host optional permission + dynamic bridge registration

## P2P Market

- existing legacy P2P Market frontend module parity-preserved
- documented Binance C2C `/sapi/v1/c2c/ads/search`
- 20 rows/page
- legacy amount/payment/country/pay-time/sort/tradable/merchant filters mapped
- advertiser/ad/payment/verification response normalization
- undocumented public BAPI fallback নেই

## Web Push

- durable notification delivery queue
- cross-DB destination dedupe key
- bounded concurrent delivery + retry/backoff + stale-processing recovery
- category preferences + mandatory Security delivery
- active trusted-device recipient scope
- optional Binance credential notification scope
- RFC8291/RFC8188 AES-128-GCM
- VAPID ES256
- public HTTPS endpoint validation, private/local IP block, DNS rebinding mitigation by validated IP pinning
- 404/410 subscription disable
- Notification Center last-message N+1 database lookup removed

## System Update

- Super Admin-only deployment workflow
- upload-size limit, SHA-256, safe ZIP extraction, VERSION/layout validation
- production-default Ed25519 signature verification
- release history/update event audit tables
- external `p2pflow-updater`, no in-process self overwrite
- atomic symlink activation
- rollback endpoint + UI
- `p2pflow-keygen` for VAPID, Ed25519 release key generation and offline ZIP signing

## Frontend/API hardening

- static API contract audit added
- current audit: **127 frontend API paths / 157 backend route patterns; pass**
- `scripts/qa.sh` checks all web + extension JavaScript
- Web Push frontend response aliases restored (`enabled`, `serverEnabled`, `publicKey`, current-device fields)
- push account scope uses real `binance.chat` / `orders.view` account permissions

## Database

New ordered migration in all three families:

`014_extension_update_delivery_hardening.sql`

Adds delivery queue/dedupe support, extension claim metadata, signed release history and update events; `update_state.current_version` becomes `2.0.4`.

## External/live validation remaining

Real Chrome+Binance extension run, public Push Service run, selected payment gateway adapter, three actual DB servers, full browser role regression, authorized Binance controlled tests, load/failover and backup/restore drill remain environment-dependent launch QA—not claimed as completed in sandbox.
