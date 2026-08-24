# P2PFlow v1.6.4 Release Notes

## GitHub Actions publish hotfix

- Version advanced from `1.6.3` to `1.6.4`.
- Fixed the GitHub Actions `Run build self-tests` failure caused by a stale tracked `public/assets/order-filter.png` that can remain when a new Unified ZIP is copied over an existing repository without deleting old files.
- Orders continues to reuse the P2P Market inline SVG filter icon; the obsolete uploaded PNG is not used by the UI.
- Added `scripts/cleanup-obsolete-assets.js` and wired it to `prebuild` and `pretest`. CI and release jobs now remove the obsolete PNG before validation and packaging.
- The stability self-test still verifies that the obsolete PNG is absent after cleanup.
- No database/schema migration is required.

## GitHub update

Extract `P2PFlow_v1.6.4_UNIFIED.zip` into the repository root, commit all changes, and push. If GitHub Desktop shows `public/assets/order-filter.png` as deleted, include that deletion in the commit. Even if the old tracked file remains in a checkout, the new prebuild/pretest cleanup prevents it from blocking CI or release publishing.
