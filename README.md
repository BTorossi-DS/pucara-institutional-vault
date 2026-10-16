# Stellar Institutional Vault

Institutional Soroban Smart Account prototype using
OpenZeppelin Stellar Accounts **0.7.2** and Soroban SDK **26.1.0**.

**Checkpoint 4.6 — Real WebAuthn Multisig Authorization Verified:** CEO Touch ID
and CFO YubiKey assertions from two distinct registered P-256 signers validated
against the same Soroban challenge on **Stellar Testnet**, using rule 0 for exactly
`SmartAccount.execute(Verifier, "origin", [])`. Soroban `enforce` simulation and an
independent enforce simulation both passed, with contract error `null` and estimated
fees of **2,409,780** and **2,412,774 stroops** (0.2409780 and 0.2412774 Testnet XLM).
No probe transaction was submitted, no fees were charged, and the nonce remained
unconsumed. TypeScript strict and 25/25 Node tests pass. Probes support a 360-ledger
expiration window (10–360 ledgers); transfers retain their 10–120-ledger policy. The first **1 XLM
Testnet transfer remains pending**.

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
The contracts and integration code are unaudited; real-browser multisig authorization is verified only for the
Testnet probe simulation, not a submitted token transfer.
All network integration must explicitly select **Stellar Testnet**.

The repository includes [compiled-Wasm validation and the Testnet runbook](docs/testnet-readiness.md),
a localhost browser enrollment tool (`npm run enroll`), and Testnet-only transaction
preparation scripts. Earlier milestone documents describe their state at the time;
the [Testnet checkpoint](docs/testnet-progress.md) records current deployment status.
Run `bash scripts/validate.sh` for the full native/Wasm/TypeScript build and checks.
The next milestone is the separately authorized first 1 XLM Testnet transfer,
including submission and on-chain result/balance verification. Blend V2 / USDC
lending remains pending. Every additional transaction requires explicit approval.
