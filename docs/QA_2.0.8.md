# P2PFlow 2.0.8 QA Record

Source/static checks included in this checkpoint:

- Go package compile checks for modified setup/config/worker paths.
- Browser JavaScript parse checks.
- Installer shell syntax checks.
- API/permission/accounting/browser-role/domain static contract audits.
- New installer/browser-setup/GitHub release contract audit.
- PostgreSQL/MySQL/MariaDB migration filename parity through migration 018.
- Setup mode routing and setup-code contract source checks.
- Separate API/worker systemd contract checks.
- GitHub Release workflow contract checks.

The local execution environment cannot download the external Go SQL-driver modules from proxy.golang.org, so the final `-tags dbdrivers` production binary build must be performed by the included GitHub Actions workflow (or another networked Go 1.23 build environment). The production VPS installs that prebuilt Release asset and does not require Go.
