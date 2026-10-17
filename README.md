# Pucará Institutional Vault

Pucará Institutional Vault is a non-custodial institutional wallet on Stellar,
built to coordinate treasury operations through named roles and shared transaction
authorization. The current product is a **Stellar Testnet prototype**, with a
public frontend for on-chain queries and demonstration workflows.

**Production frontend:** [pucara-vault.vercel.app](https://pucara-vault.vercel.app).
“Production” identifies the Vercel hosting environment; the wallet still uses
**Stellar Testnet only** and is not suitable for real funds.

## Architecture and functional status

- **Stellar Testnet** and a **Soroban Smart Account** using OpenZeppelin Stellar
  Accounts **0.7.2** and Soroban SDK **26.1.0**.
- **WebAuthn passkeys** for transaction authorization in the backend flow, with
  institutional **2-of-3 multisig** across **CEO, CFO and Treasury Manager**.
- **React, TypeScript and Vite** frontend with **Dashboard**, **Transfers** and
  **Activity** views. The frontend performs on-chain queries; transfer and approval
  workflows are demonstration-only and do not submit transactions.
- Real WebAuthn authorization is implemented in the backend flow, and a multisig
  transfer has executed on Testnet, as documented below. WebAuthn is **not yet
  integrated into the public frontend browser flow**; the existing local browser
  enrollment/authorization tooling is separate from that frontend.

## Current limitations

- Contracts have **no external audit**.
- The frontend does **not execute real transfers** or collect real passkey approvals.
- Browser WebAuthn integration in the public frontend remains pending.
- **Not suitable for holding real funds.** Use Testnet assets only.
- Anonymous access has not been verified in an independent private session.
- Transfers, Activity and mobile responsiveness require final validation in
  Production. Mobile validation and anonymous access are not confirmed.

See the [R8.3 Production checkpoint](docs/frontend-r8-production.md) for the
reported deployment observations and remaining validation.

## VERIFIED ON-CHAIN TRANSACTION

Pucará completed its first institutional **1 XLM Stellar Testnet transfer** with
independent **CEO + CFO WebAuthn/passkey approvals**, satisfying the smart account's
**2-of-3** institutional policy. Result: **SUCCESS**, ledger **5230325**;
actual fee: **0.2122091 Testnet XLM**. The native transfer event and resulting
balances were verified; RPC and Horizon agree.

Transaction hash:
`55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2`

[View transaction on Stellar Expert (Testnet)](https://stellar.expert/explorer/testnet/tx/55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2)
— [Public multisig transfer evidence](docs/testnet-multisig-proof.md).

This confirms a submitted token transfer, following the earlier authorization-only
probe. Testnet assets only; no production-readiness or hardware-attestation claim.

## Development

See the [checkpoint status and verified deployments](docs/testnet-progress.md) and
[authorization runbook](docs/testnet-readiness.md). Expired proposals must be
explicitly regenerated and reviewed; assertions cannot cross challenges.

```bash
cd /workspaces/stellar-wallet
source .tools/env.sh
cargo test --workspace --locked
cargo check --workspace --all-targets --locked
cargo fmt --all -- --check
stellar contract build --locked
```

Use Stellar CLI for Wasm builds: the published OpenZeppelin dependency enables
`experimental_spec_shaking_v2`, which requires CLI-supported spec processing.
Do not replace this with a raw Cargo Wasm build or manually bypass the SDK check.
The build outputs are in `target/wasm32v1-none/release/` and are not committed.

- `contracts/institutional-account`: exactly three named role keys, 2-of-3
  authorization using OpenZeppelin rules, quorum-protected execution and rotation.
- `contracts/webauthn-verifier`: immutable origin/RP-ID binding plus OpenZeppelin
  WebAuthn challenge, user-presence/verification and host P-256 verification.
- [Security design and limitations](docs/webauthn-security-design.md).
- [Validation results](docs/smart-account-validation.md).
- [Initial environment preparation](docs/smart-account-environment.md).

`Cargo.lock` is part of this workspace. The host SDK's loose `ed25519-dalek >=2`
constraint can resolve to incompatible v3 test dependencies. This lockfile resolves
it to **2.2.0**, which shares the host's rand_core generation. Preserve the lockfile
and use `--locked`; review dependency updates rather than regenerating blindly.

No backend custody, public account factory, recovery bypass or production
credentials are included. The public frontend is hosted in Vercel Production;
no Stellar Mainnet deployment is included. The browser enrollment utility is for local development. The verifier address supplied at account
construction is a trusted bootstrap parameter: verify the reviewed executable hash
and immutable origin/RP configuration before any future account deployment.
The contracts and integration code are unaudited. Real-browser CEO+CFO authorization
and the submitted Testnet token transfer are documented in the public evidence above.
All network integration must explicitly select **Stellar Testnet**.

The repository includes [compiled-Wasm validation and the Testnet runbook](docs/testnet-readiness.md),
a localhost browser enrollment tool (`npm run enroll`), and Testnet-only transaction
preparation scripts. Earlier milestone documents describe their state at the time;
the [Testnet checkpoint](docs/testnet-progress.md) records current deployment status.
Run `bash scripts/validate.sh` for the full native/Wasm/TypeScript build and checks.
The first institutional Testnet transfer is confirmed. Blend V2 / USDC lending
remains pending. Every additional transaction requires explicit approval.

## Public web MVP — Checkpoint F2

The read-only Testnet frontend is in [`frontend/`](frontend/README.md). It includes
Dashboard, demonstration Transfers, and documented Activity with explorer links.
For Vercel select **Root Directory `frontend`**, build `npm run build`, and output
`dist`. No passkeys, credentials, transaction submission or backend are required.

F2 integrates the official PUCARÁ SVG identity from `7050210` into the existing
F1 app. See the [F2 integration report](docs/frontend-f2.md).

## Frontend deployment status

The Production frontend is published at
[https://pucara-vault.vercel.app](https://pucara-vault.vercel.app) in Vercel project
`pucara`. The deployment observed for this checkpoint is `AxSH29q46`, sourced from
commit `242ab1f` on `feat/pucara-web-mvp`, reported **Ready** and promoted to
Production through the Vercel Dashboard. The application loaded at the HTTPS
domain; the Dashboard was verified via a screenshot, with Testnet warnings visible.
These are reported observations supplied for the documentary checkpoint, not new
browser tests performed during this documentation update.

Anonymous access has **not** been verified in an independent private session.
Transfers, Activity and mobile responsiveness still require final Production
validation. The frontend remains a read-only/demo experience and does not execute
real transfers. See the [R8.3 Production checkpoint](docs/frontend-r8-production.md).

The earlier Preview, sourced from commit
`50f94ce8ec3778b28048314765e56ff6d625e0cd`, was reported READY. Its Dashboard
inspection displayed `0.0000000 XLM`, Stellar Testnet as connected, the Smart
Account and the DEMO warning. That displayed balance was not independently
verified against Stellar in that checkpoint. The
[Preview checkpoint and its Production conditions](docs/frontend-f3-preview.md)
remain as historical documentation; publication does not establish completion of
its pending validation tasks.
