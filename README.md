# Stellar Institutional Vault

Institutional Soroban Smart Account prototype using
OpenZeppelin Stellar Accounts **0.7.2** and Soroban SDK **26.1.0**.

**Checkpoint 4.5 — WebAuthn Authorization Ready:** the WebAuthn Verifier and
Institutional Smart Account remain deployed on **Stellar Testnet**. Safe probe
preparation/review and explicit CEO + CFO browser authorization are implemented;
TypeScript strict and 16/16 Node tests pass. The authorization page responded over
verified HTTPS localhost, and the local TLS key permissions are 0600. Certificate
trust on the Mac, real CEO + CFO assertions, real probe `enforce` acceptance and
the first **1 XLM Testnet transfer** remain pending.

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
This code is unaudited; real-browser multisig authorization has not yet been validated.
All network integration must explicitly select **Stellar Testnet**.

The repository includes [compiled-Wasm validation and the Testnet runbook](docs/testnet-readiness.md),
a localhost browser enrollment tool (`npm run enroll`), and Testnet-only transaction
preparation scripts. Earlier milestone documents describe their state at the time;
the [Testnet checkpoint](docs/testnet-progress.md) records current deployment status.
Run `bash scripts/validate.sh` for the full native/Wasm/TypeScript build and checks.
The next milestone is an end-to-end Smart Account operation approved by two real
passkeys; deployment verification alone does not establish that flow. Blend V2 / USDC
lending remains pending. Every additional transaction requires explicit approval.
