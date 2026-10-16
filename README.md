# Pucará — Stellar Institutional Vault

Institutional Soroban Smart Account prototype using
OpenZeppelin Stellar Accounts **0.7.2** and Soroban SDK **26.1.0**.

## Demo y presentación

El video y el deck están reunidos en la carpeta [presentacion/](presentacion/README.md).

| Material | Archivo |
| --- | --- |
| Video demo v2 | [Ver o descargar el video MP4](presentacion/pucara-demo-v2.mp4) |
| Pitch deck | [Abrir el deck PDF](presentacion/pucara-pitch-nea-tech.pdf) |

Material del prototipo en Stellar Testnet. El deck distingue el MVP actual de la v2.0 propuesta: multisig 3 de 5, timelocks y Earn conectado a Blend.

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

No backend custody, public account factory, recovery bypass, production
credentials or production deployment is included. The browser enrollment utility is for local development. The verifier address supplied at account
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

## PUCARÁ browser interface

The enrollment and authorization tools now share the PUCARÁ identity and responsive layout. See [frontend changes, run instructions and validation limits](docs/frontend-pucara.md).
