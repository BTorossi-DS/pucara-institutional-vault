# Smart Account environment and architecture

Environment prepared on 2026-10-16. No contracts implemented or deployed.

## Activate the tools

From `/workspaces/stellar-wallet`:

```bash
source .tools/env.sh
rustc --version
cargo --version
stellar --version
rustup target list --installed
```

Installed workspace-local tools:

- rustc 1.99.1 (58cf8f9c3 2026-10-13), stable
- cargo 1.99.1 (5f94df478 2026-08-27)
- Stellar CLI 28.1.0 (c0f4d0da891bbf214c08b8c5035ae6db80e9a3bd)
- Targets: aarch64-unknown-linux-gnu, wasm32v1-none

Rustup and Cargo homes are under `.tools/`; no shell profiles were edited.
The official ARM64 Stellar release archive SHA256 matched GitHub's release
asset digest: b1e6ab53b0dd673400110fbd665a525cd0a969449943a2990a782f20cc7abe98.
The CLI launcher loads the official Debian Bookworm libdbus-1-3
1.14.10-1~deb12u1 from `.tools/sysroot/lib/aarch64-linux-gnu`.
No system packages or Docker settings were changed. `.tools/` is ignored.
These installations are local artifacts, not reproduced by the container config.

## Repository and verification

Initial branch: feat/smart-account-setup; initial working tree clean.
Remote: https://github.com/BTorossi-DS/stellar-institutional-vault
Existing files: AGENTS.md, .gitignore, .devcontainer/devcontainer.json.
No Cargo workspace, package.json, TypeScript configuration, application, or tests exist.
Tool version/target checks and `stellar contract build --help` pass.
No contract build or integration test has been performed; compilation and
Testnet protocol compatibility remain to be verified in the implementation milestone.
TypeScript checks and project tests are not applicable yet.
Final Git status/diff checks failed with Git's dubious ownership protection.
No safe.directory exception or global Git configuration change was applied.

## Proposed dependencies (not installed)

Use the released OpenZeppelin v0.7.2 sources, not the moving main branch:

- stellar-accounts = "=0.7.2": smart_account, verifiers::webauthn,
  policies::simple_threshold.
- soroban-sdk = "=26.1.0": matches the v0.7.2 workspace manifest;
  enable testutils only for native tests. Review the release's
  experimental_spec_shaking_v2 build feature before copying its configuration.
- stellar-contract-utils = "=0.7.2" only if governed upgradeability is selected.
- stellar-access = "=0.7.2" only if application roles beyond account approval are needed.

Commit Cargo.lock when a workspace is approved. Verify published crate metadata
and resolve a single compatible SDK version before implementation. CLI 28.1.0
installation alone does not prove SDK 26.1.0 artifacts work on the target network.

## Proposed account architecture

Start from the tagged multisig-smart-account example. Keep its thin contract
wrapper around SmartAccount, ExecutionEntryPoint, and CustomAccountInterface;
forward __check_auth to smart_account::do_check_auth rather than writing crypto.

Use three independent institutional signers (for example treasury, compliance,
and recovery), each with its own passkey/public key. Register External signers
with the established WebAuthn verifier and attach a simple_threshold policy of
2 to the three-signer context rule. Canonical public-key identity must prevent
one key with different credential IDs from counting twice. Distinct keys should
also have independent custody; synced copies do not establish separate people.
Delegated Stellar addresses are a supported future option if approved separately.

Apply 2-of-3 to transfers, future Blend calls, and all account administration:
signer rotation, policies, context rules, recovery and upgrades. Avoid any weaker
alternate rule or owner bypass. Prefer scoped operation rules with default deny;
review every matching authorization path. Keep verifier contracts immutable.
Decide whether to omit upgradeability initially or govern it with the same quorum.

The client simulates the exact intended invocation, constructs the tagged
AuthPayload/context rule IDs and authorization digest, collects two independent
WebAuthn assertions for that digest, encodes WebAuthnSigData as XDR, and assembles
Soroban authorization entries. Use established SDK encoding/signature adapters.
The verifier calls the host's secp256r1 verification. Soroban authorization binds
nonce, expiration and invocation; test replay, altered arguments, wrong-network
payloads and nested authorization contexts explicitly.

A backend may coordinate public proposals and signatures and later relay them,
but cannot supply the users' passkey signatures or satisfy the quorum alone.
Never store private keys. Signers must see and approve the same transaction intent.

## Security decisions before implementation

The v0.7.2 WebAuthn verifier requires user presence and user verification, but
explicitly omits origin, RP-ID hash, signature counter, registration attestation
and extension validation. It is not a complete institutional enrollment policy.
Define RP-ID/origin binding and enrollment validation, assess whether audited
additional validation is needed, and document counter/backup/attestation policy.
Do not implement new cryptographic primitives. Review release-specific audits
and known issues; the upstream repository labels this software experimental.

Signer and threshold updates must stay consistent and preserve an achievable
quorum. Test that duplicate signers cannot satisfy 2-of-3 and that configuration
changes cannot introduce a weaker authorization path or permanent lockout.
Plan storage TTL maintenance, recovery, event auditing and resource limits.
All eventual network work must explicitly select Testnet and test assets only.

## Next milestone, subject to approval

1. Approve signer custody, recovery, WebAuthn binding and upgrade policy.
2. Create a pinned Rust workspace based on the v0.7.2 examples.
3. Build for wasm32v1-none and run native authorization tests: 0/1/2/3 signers,
   duplicates, malformed assertions, replay, wrong context, governance and rotation.
4. Add client WebAuthn integration and TypeScript checks when frontend code exists.
5. Validate SDK/CLI compatibility and integration against Testnet only in a
   separately authorized milestone. No deployment is authorized by this setup task.

## Official references

- https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup
- https://github.com/stellar/stellar-cli/releases/tag/v28.1.0
- https://github.com/OpenZeppelin/stellar-contracts/releases/tag/v0.7.2
- https://github.com/OpenZeppelin/stellar-contracts/blob/v0.7.2/Cargo.toml
- https://github.com/OpenZeppelin/stellar-contracts/tree/v0.7.2/examples/multisig-smart-account
- https://github.com/OpenZeppelin/stellar-contracts/blob/v0.7.2/packages/accounts/src/verifiers/webauthn.rs
- https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account
- https://docs.openzeppelin.com/stellar-contracts/accounts/signers-and-verifiers
- https://docs.openzeppelin.com/stellar-contracts/accounts/policies
