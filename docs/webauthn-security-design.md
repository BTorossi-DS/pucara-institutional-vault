# Institutional Smart Account: authorization and WebAuthn security

## Milestone scope

This is an offline, unaudited first implementation. No deployment, account creation
on a network, backend custody, or frontend enrollment is included. Only Testnet
is permitted for future integration. Passing synthetic signature tests does not
establish a complete passkey product or hardware-backed institutional custody.

## Released framework decision

The implementation uses the published `stellar-accounts =0.7.2` and
`soroban-sdk =26.1.0`, with Cargo.lock recording transitive dependencies.
The inspected release implements:

- `CustomAccountInterface` with `Signature = AuthPayload`.
- `smart_account::do_check_auth`, which authenticates all submitted signers,
  rejects signers outside selected rules, and validates each authorization context.
- Rules without policies require **every signer in the rule**.
- The signed digest is `SHA256(host_signature_payload || XDR(context_rule_ids))`.
- `ExecutionEntryPoint::execute` authenticates the account before invoking a target.

The release supports the requested model without a new threshold implementation:
create rules for CEO+CFO, CEO+Treasury Manager, CFO+Treasury Manager, and all three.
Clients choose the rule corresponding to their approving subset. Each rule has
at least two independent public keys. A default rule here means the chosen quorum
may authorize any host-provided context; it does not bypass the quorum. There
are no spending caps or protocol allowlists in this milestone.

This intentionally avoids a separate mutable threshold-policy deployment and its
signer-set divergence risks. The generic `SmartAccount` management trait is not
exported: otherwise authorized callers could create a single-signer rule.
The account exposes only read methods, authenticated execution, and atomic
replacement of the three role keys. The threshold remains fixed at two;
"configurable" means the three role keys are configurable, not an arbitrary M-of-N.
There are no upgrade, threshold-reduction, verifier-change, or owner-bypass methods.

## Signers, duplicate handling, and governance

The constructor accepts exactly one public key for each named institutional role.
Keys must be distinct 65-byte uncompressed P-256 keys. Only public keys are stored;
credential IDs remain client-side metadata, preventing credential-ID aliases from
counting twice. `AuthPayload.signers` is a map keyed by signer identity, so repeated
approvals from one key occupy only one entry. OpenZeppelin also checks canonical
duplicates while registering rules. All identities use the same immutable verifier.

Distinct keys are cryptographic identities, not evidence of distinct people.
Enrollment must establish role ownership and independent custody. Three synced
passkeys controlled by one person or one cloud account do not provide institutional
separation of duties. Validate actual P-256 curve points and proof of possession
in enrollment; constructor key shape checks alone do not prove possession or
liveness. Invalid or lost keys can make quorum unavailable.

`rotate_signers` calls the account's `require_auth` before any mutation. The old
quorum authorizes the exact new role assignments. Rotation removes the old rules
and creates four fresh, monotonically increasing IDs in one atomic invocation.
Outstanding approvals cannot be applied to a new configuration, including a
rotation back to earlier keys. Invalid duplicate-role replacements revert entirely.
No unilateral recovery exists: losing two roles locks the account.

## Exact operation binding and replay

Clients first simulate the intended invocation and obtain the Soroban authorization
tree, nonce and expiration. The host payload binds the network, nonce, expiration,
and exact authorized invocation tree (addresses, function names, arguments and
sub-invocations). OpenZeppelin additionally binds the selected rule IDs. Every
approver signs this same resulting 32-byte digest as the WebAuthn challenge.

The host enforces nonce consumption and expiration; the contract does not duplicate
host replay bookkeeping. A direct unit call of `__check_auth` cannot prove replay
protection. Tests therefore submit real `SorobanAuthorizationEntry` values through
`Env::set_auths` and trigger `require_auth` in stateful target/admin operations.
They do not use mock authorization or a verifier that unconditionally returns true.

The account itself is not a transaction-intent display. The client must decode and
show the exact operations, amounts, assets, destination, network and expiration
before collecting each signature. A biometric prompt alone is insufficient for
informed institutional approval. Coordinators must not substitute an opaque digest
without independently reviewable transaction details.

## WebAuthn binding implemented here

OpenZeppelin's released verifier explicitly omits origin and RP-ID hash checks.
Our separate verifier uses its cryptographic implementation and adds:

1. Constructor-configured exact HTTPS origin and `SHA256(RP ID)` stored immutably.
2. Exact origin comparison against signed `clientDataJSON`.
3. Exact RP-ID hash comparison against the first 32 authenticator-data bytes.
4. Rejection of `crossOrigin=true` and any `topOrigin` field. Missing crossOrigin
   is interpreted as false, consistent with ordinary non-embedded assertions.
5. Bounded client JSON, required fields, rejection of malformed/duplicate binding
   fields and non-whitespace trailing JSON data.
6. Exactly 65-byte uncompressed key data, without credential-ID suffixes.

OpenZeppelin then enforces `webauthn.get`, exact base64url challenge, user presence,
user verification, backup flag consistency, and host P-256 verification over
`authenticatorData || SHA256(clientDataJSON)`. No cryptographic primitive is
implemented locally. Test signing uses RustCrypto P-256 and ephemeral keys generated
in memory; private test keys are not embedded in source or written to files.

Configuration must be reviewed before deploying: the constructor performs basic
size/HTTPS checks, not full URL parsing, public-suffix checks, or validation that
the chosen RP ID is the origin host or a valid parent domain. Use a dedicated,
canonical, exact HTTPS origin without path/query/fragment and the matching RP ID.
Escaped/noncanonical JSON origins may be rejected; integration must confirm browser
serialization compatibility. RP configuration cannot be changed after construction.

## Verifier deployment trust boundary

The account receives a verifier address at construction, as required by the
released External signer model. It does not cryptographically pin that address to
a particular Wasm artifact. Before creating any account, deployment tooling MUST
verify the supplied address's executable hash against the reviewed verifier build
and inspect its RP/origin configuration. A malicious or upgradeable replacement
verifier could accept fabricated signatures. Constructor configuration is therefore
a trusted bootstrap step, not an untrusted public account factory. No deployment
or factory is included or approved in this milestone. This verifier has no upgrade
or configuration setters. Any future public factory must pin the verified artifact
and intended immutable RP configuration rather than accepting arbitrary verifiers.

## Work still required for complete passkey authentication

- Browser registration and authentication ceremonies, credential discovery/storage,
  established COSE key and DER-signature adapters, and signature normalization.
- Secure role enrollment, proof of possession, recovery policy, and rotation UI.
- A documented attestation and authenticator policy (including hardware-backed
  keys versus synced credentials) for institutional roles.
- Signature-counter monitoring where supported. The on-chain verifier does not
  enforce counters; nonce protection prevents transaction replay, not cloning.
- Browser/device tests for correct origin, RP ID, user verification, challenge,
  signing, cross-origin rejection, and user-visible transaction intent.
- Wasm/runtime integration, resource-budget measurements, storage TTL restoration
  and maintenance, deployment artifact/configuration verification, independent review,
  and Testnet-only integration. Native tests do not replace these checks.

## Official sources inspected

- https://github.com/OpenZeppelin/stellar-contracts/blob/v0.7.2/packages/accounts/src/smart_account/storage.rs
- https://github.com/OpenZeppelin/stellar-contracts/blob/v0.7.2/packages/accounts/src/smart_account/mod.rs
- https://github.com/OpenZeppelin/stellar-contracts/blob/v0.7.2/packages/accounts/src/verifiers/webauthn.rs
- https://github.com/OpenZeppelin/stellar-contracts/tree/v0.7.2/examples/multisig-smart-account
- https://github.com/stellar/rs-soroban-sdk/tree/v26.1.0
