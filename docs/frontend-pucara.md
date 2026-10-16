# PUCARÁ frontend

This change updates the two existing browser tools on `feat/smart-account-setup`: enrollment and authorization. It does not add a dashboard, transaction submission UI or simulated balances.

## Interface

- Original PUCARÁ logo and isologo are preserved verbatim in `scripts/enrollment/assets/`. The served logo/mark retain their vector geometry, with a tighter viewBox and charcoal fill.
- Approximate composition guide: 60% paper/white (`#F7F5EF` / `#FFFFFF`), 30% stone (`#E8E4DA`), up to 10% terracotta actions (`#91432D`, hover `#733322`). Text is charcoal `#292C2B`, secondary text `#595C58`.
- Responsive layout, Spanish page copy, visible keyboard focus, skip link, labeled proposal/output regions and live feedback. Existing backend validation messages remain in English.
- Role buttons are disabled until configuration loads. Authorization retains the full proposal, explicit review, independent-copy confirmation and one explicit click per officer. Confirmation resets after each authorization attempt. Transfer sessions do not display probe simulation.
- Static assets use an exact allowlist served after the existing Host gate. No arbitrary file routing, external fonts or third-party runtime assets. Existing CSP, origin, RP-ID, CSRF, signer verification and transaction boundaries remain in place.

## Run

Run `npm ci`, then `npm run enroll` for enrollment at `http://localhost:8080`. Follow the existing Testnet runbook for authorization at `https://localhost:8443`; its certificates, proposal and Rust normalizer still require the existing Linux workspace. UI assets resolve relative to their source modules so enrollment can also run from this authorized Windows checkout. Secure artifact/TLS path restrictions were not relaxed.

## Validation on Windows, 2026-10-16

- `npm run typecheck`: passed. This project has no separate frontend build command; the server serves HTML/CSS/JS directly.
- `node --test scripts/enrollment/assets.test.ts scripts/enrollment/authorization-client.test.ts scripts/enrollment/server.test.ts`: 5/5 passed (localhost tests require network permission in the sandbox).
- Headless Edge with synthetic configuration and stubbed authenticators: both screens passed at 1440px and 390px. Checked logo loading under CSP, no horizontal overflow, no WebAuthn on load/review, explicit ceremony initiation, cancellation feedback, confirmation reset and no simulation/finalization/submission requests in transfer mode. This is not evidence of a new hardware ceremony or on-chain transfer.
- Full TypeScript suite: 15/43 passed, 28 failed in this Windows checkout. Failures include the missing Linux RustCrypto normalizer/binary, protected Linux artifact paths and CRLF in the existing SDK vector fixture. The normalization failure was reproduced against unchanged original sources. Backend cryptographic code and fixture contents were not modified to make these tests pass. The full suite must be rerun in the documented Linux workspace before merge.
- No Rust contract changes, no new dependencies, no secrets, no Testnet transactions initiated.

## Delivery

Based on `feat/smart-account-setup` at `cb99d85`. The connected GitHub account reports `push: false`; the local branch and patch can be reviewed and applied by a maintainer. Target this feature branch, not the empty bootstrap `main`, when opening the frontend PR.
