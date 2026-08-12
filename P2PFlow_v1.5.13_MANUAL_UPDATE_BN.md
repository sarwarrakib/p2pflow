# P2PFlow v1.5.13 Manual Update

This patch is intended for an existing P2PFlow v1.5.12 installation.

1. Back up the application files as usual.
2. Upload `P2PFlow_v1.5.13_MANUAL_PATCH.zip` to the P2PFlow application root.
3. Extract it in the application root and overwrite existing files.
4. Restart the Node.js application from the hosting control panel.
5. Open `/ready` and confirm the version is `1.5.13`.
6. On mobile, hard refresh the browser once so the new CSS and Orders module are loaded.

No `npm install` is required because this release adds no dependency.

This update changes application/UI files only. Existing database data, orders, users, mail settings, Binance state and accounting records are not replaced.
