# P2PFlow 2.0.8 Release Notes

Checkpoint: Installer / Browser Setup / GitHub Release / Runtime Separation hardening.

## Added

- Functional one-time browser first-install flow protected by a random setup code.
- Normal application/API routes are gated while setup is incomplete.
- Prepared local PostgreSQL database test from the browser wizard.
- First Owner/Super Admin creation with password and 6-digit PIN hashing.
- Atomic runtime environment update and permanent setup lock after completion.
- Automatic API restart after browser setup and worker restart handoff.
- Separate systemd units for user-facing API and background worker.
- Loopback-only NATS systemd service for API/worker events on a single VPS.
- Ubuntu 24.04 amd64 native first-install script with PostgreSQL, Nginx, Certbot and optional swap bootstrap.
- GitHub Release downloader/installer that verifies SHA-256 before installation.
- GitHub Actions workflow that builds Linux amd64 binaries from the v2.0.8 tag.
- `.gitignore` rules for production secrets, databases, keys, setup codes and build output.
- Migration 018 release checkpoint in PostgreSQL, MySQL and MariaDB families.

## Deployment target

Validated code/static target is Linux x86_64/amd64 with systemd. The supplied target VPS information was Ubuntu 24.04.3 LTS, 6 CPU, 11 GiB RAM and sufficient disk. Production binaries are intended to be built on GitHub Actions, so Go is not required on the VPS.

## External verification still required

This release does not claim live verification of a real production database backup/restore drill, live Binance destructive actions, a selected payment gateway, public push delivery, or real browser sessions for all roles.
