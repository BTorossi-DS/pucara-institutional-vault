# Smart Account milestone validation

Validated offline on 2026-10-16, branch `feat/smart-account-setup`.

## Toolchain and commands

Activate `source /workspaces/stellar-wallet/.tools/env.sh` first.
Rust/Cargo: 1.99.1. Stellar CLI: 28.1.0. Target: wasm32v1-none.

| Check | Result |
| --- | --- |
| `cargo test --workspace --locked` | 18 passed, 0 failed; doc tests also passed (none defined) |
| `stellar contract build --locked` | Both contracts compiled and optimized successfully |
| `cargo fmt --all -- --check` | Passed |
| `cargo check --workspace --all-targets --locked` | Passed |
| Git whitespace check, scoped repository trust | Passed |
| TypeScript | Not applicable: no TypeScript application/configuration exists |

Verifier coverage lives in the account's cross-contract tests; the verifier crate
has no separate unit tests. Authorization is not mocked. Real P-256 signatures
are generated in memory and checked through the verifier and Soroban test host.

## Coverage

- Every 2-of-3 pair, plus all-three authorization.
- Single signer rejected under every rule; duplicate signer map entries count once.
- Unauthorized extra signer and missing authorization rejected.
- Exact invocation arguments bound, including attacker-rewritten authorization trees.
- Changed nonce, expiration, network and selected rule IDs rejected.
- Consumed nonce replay rejected; a freshly signed nonce accepted.
- Expired authorization rejected.
- Administrative rotation requires old quorum; single signer fails without mutation.
- Successful rotation uses fresh rule IDs and invalidates old pending approvals.
- Duplicate initial role keys and duplicate replacement keys rejected.
- Execution entry point requires quorum and invokes a stateful target correctly.
- Wrong origin, RP ID, user presence, user verification and P-256 signature rejected.
- Correctly re-signed assertions with wrong challenge/type, cross-origin embedding,
  topOrigin, trailing JSON or duplicate origin fields rejected.

## Optimized artifacts

| Contract | Bytes | SHA-256 |
| --- | ---: | --- |
| institutional_account.wasm | 27,977 | `33990cee9e300532e9b0b1c5bf0641f07e12c1a3f5f60ad1502561f74721a1e0` |
| institutional_webauthn_verifier.wasm | 14,449 | `c1ac3c76abf9a9a647695c8eba212dc03f2cac079c2b94525a335bd658359564` |

Files are under `target/wasm32v1-none/release/` (ignored by Git).
Account exports: __constructor, __check_auth, execute, rotate_signers, rule,
rule_ids, signers. There are no generic rule mutators or upgrade methods.
Verifier exports: __constructor, verify, canonicalize_key, batch_canonicalize_key,
origin, rp_id_hash. There are no configuration setters or upgrade methods.

## Compatibility decisions

The published stellar-accounts crate enables experimental_spec_shaking_v2.
A raw Cargo Wasm check was rejected by the SDK's build-script guard. The supported
`stellar contract build --locked` path succeeded; the guard was not bypassed.

The initial native dependency resolution selected ed25519-dalek 3.0.0 through
soroban-env-host's `>=2.0.0` constraint and failed on incompatible rand_core traits.
Cargo.lock was corrected to use 2.2.0, already used by the SDK. All tests then passed.
No upstream dependency source or cryptographic implementation was patched.

## Git ownership diagnosis

Git intermittently reported dubious ownership. A diagnostic showed worktree root
UID:GID 0:0, `.git` UID:GID 1000:1000, process UID:GID 1000:1000. The minimal
correction used only for inspection was:

```bash
git -c safe.directory=/workspaces/stellar-wallet status --short --branch
git -c safe.directory=/workspaces/stellar-wallet diff --check
```

This trusts only this path for that command. No ownership, global configuration,
persistent trust, Git history or remote state was changed.

## Limits

Tests execute native contract implementations in Soroban's host, not browser
ceremonies or deployed Wasm. No network access to Stellar RPC, deployment,
production key generation or real funds were used. Wasm execution compatibility,
resource budgets, storage TTL operations, client integration, verifier bootstrap
verification and independent security review remain. See
[WebAuthn security design](webauthn-security-design.md) for the threat model.
