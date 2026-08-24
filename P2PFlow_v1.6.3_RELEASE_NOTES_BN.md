# P2PFlow v1.6.3 Release Notes

## GitHub Actions / VAPID CI hotfix

- Fixed an intermittent `npm test` / GitHub Actions failure that ended with `Process completed with exit code 1`.
- Root cause: Node/OpenSSL can return a valid P-256 private scalar in a 31-byte representation when its leading byte is zero. The VAPID validator required exactly 32 bytes and therefore rejected a mathematically valid generated key with `Invalid VAPID private key.`
- VAPID private keys are now canonicalized to a fixed 32-byte P-256 scalar by left-padding short encodings with zero bytes.
- Existing short-form VAPID keys remain compatible and are normalized during validation.
- Added a deterministic regression test using a valid 31-byte scalar so the CI bug cannot silently return.
- Added explicit names to GitHub CI steps so future failures identify whether install, audit, build, or test failed instead of showing only the generic exit-code footer.

## Version

- Version advanced from `1.6.2` to `1.6.3` under the project patch-version rule.
