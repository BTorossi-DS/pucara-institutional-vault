# Checkpoint 4.7 — Transfer Authorization Ready

Current status, 2026-10-16: the protected CEO+CFO transfer authorization workflow
is implemented and reviewed, and the vault has received exactly **1 native Testnet
XLM**. **The first outgoing CEO+CFO-authorized institutional transfer remains
pending.** Funding and the earlier successful authorization probe do not establish
that this outgoing transfer has executed.

Publication checks: **41/41 Node tests PASS**, **TypeScript strict PASS** and
**`git diff --check` PASS**. Security review of every selected source, synthetic test
and documentation file is complete, with no open blocking finding in this scope.
This is a code review of a Testnet prototype, not an external security audit or
production-readiness claim.

The expiration-display finding is resolved: transfer configuration derives the
displayed expiration from the Soroban authorization entry's
`signatureExpirationLedger`, checks the matching intent, and rejects conflicting
optional top-level expiration metadata. Regression tests cover matching, missing
and contradictory metadata and preserve probe expiration behavior. The proposal
and challenge remain immutable; expiry changes require a new proposal and both
new approvals.

Shared WebAuthn validation enforces registered credential/key, challenge, exact
origin, RP-ID hash, UP/UV, canonical encodings, size limits and P-256 verification
using the existing offline DER/low-S normalizer. Transfer review enforces the exact
native SAC operation, CEO+CFO rule 0, 120-ledger window and unused nonce. HTTPS
capture retains Host/origin/JSON/CSRF/proposal gates and explicit officer clicks;
transfer mode has no browser simulation, finalization or submission endpoint.
Separate finalization builds a fresh unsigned fee-payer transaction and requires
successful `enforce` simulation within the unchanged maximum 1 XLM fee policy.

## Confirmed inbound funding — TASK 4.30B

| Field | Confirmed value |
| --- | --- |
| Network | Stellar Testnet — `Test SDF Network ; September 2015` |
| Source / fee payer | `GDBSP3BBHMZQ6LVNQTFNK6THMXFJDBTIHCY7FVRMJ26AP4VSJAZ6XXX2` |
| Vault destination | `CB2ZCJX4PB45LRQJ3CRCJ5JZ7O4DHONXMQV6U6RSIMXQ6KHYVNFZYYFH` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Amount | **10000000 stroops = 1.0000000 Testnet XLM** |
| Transaction hash | `38ad66c749cde2aa735981fe04faae481515aaad232cd35aac3cae354b7eec4d` |
| Ledger / result | **5228445 / SUCCESS** |
| Actual fee charged | **698244 stroops = 0.0698244 Testnet XLM** |
| Final vault balance | **1.0000000 XLM** |
| Final fee-payer balance | **9976.4501656 XLM** |

Balances were verified after funding on 2026-10-16 at ledger 5228454. RPC and Horizon
agreed, with the exact native transfer event and source/vault balance changes
reconciled to the amount plus actual fee. One submission, no automatic retry.
Receiving this deposit required the existing fee payer's authorization, not the
vault's CEO+CFO approvals. No additional funding or transaction is part of this
publication. These recorded balances are a checkpoint snapshot; query fresh state
before any later operation.

The funded 1 XLM covers the planned first outgoing amount; that outgoing transfer
still needs its own proposal, independent CEO+CFO approvals, enforce simulation,
operational authorization, external fee-payer signing and confirmed submission.
**Additional Testnet vault funding is needed for demo recording and repeated
transfers. Every future funding operation requires separate explicit authorization**
with a reviewed amount, fee cap, fresh balances/sequence and duplicate-funding guard.
No future funding is authorized by this checkpoint.

Only reviewed project sources, synthetic regression tests and this summarized
public evidence are published. `tmp/`, private keys, credentials, real WebAuthn
assertions, signed envelopes, TLS private material, raw operational reports and
sensitive environment files are excluded. Synthetic fixture keys stay in memory;
tests initiate no real WebAuthn ceremonies or Testnet transactions. Existing
Testnet-only, localhost binding, independent custody, TTL/recovery and spending
policy limitations remain; Blend V2/USDC is pending. Full history is in
[testnet-progress.md](testnet-progress.md).

## Checkpoint 4.6 — historical authorization status

Real CEO Touch ID and CFO YubiKey assertions from two distinct registered P-256
signers validated against the same Soroban authorization challenge on Stellar
Testnet, rule 0, for exactly `SmartAccount.execute(Verifier, "origin", [])`.
WebAuthn verification, Soroban `enforce` simulation and an independent enforce
simulation passed; contract error was `null`. Estimated fees were **2409780** and
**2412774 stroops** (**0.2409780** and **0.2412774 Testnet XLM**). No probe transaction
was submitted, no fees were charged, and the nonce remained unconsumed afterward.

The probe-specific window is 360 ledgers (allowed 10–360); the transfer maximum
remains 120 ledgers (allowed 10–120). Both require the reviewed expiration policy;
probe capture/simulation requires more than five ledgers remaining. TypeScript
strict and the complete Node suite pass (25/25 tests).

The first **1 XLM Testnet transfer remains pending**. Simulation does not persist
state or establish a submitted token transfer. Other signer pairs, operational
rotation/recovery and transfer event/balance verification remain to be validated.
Hardware identity and independent custody are not attested. Existing unaudited,
Testnet-only, localhost binding, TTL and spending-policy limitations still apply;
Blend V2/USDC remains pending. Real assertions, credential IDs, raw session reports
and TLS/private key material remain local and excluded from publication.

The implementation and deployment preparation sections below record earlier
milestones; their pending statements describe those stages. Current deployment
history and the verified authorization milestone are in
[testnet-progress.md](testnet-progress.md). Runbook commands require separate
explicit authorization; publication does not execute them.

# First institutional transaction: preparation and validation

Current checkpoint: **4.7 — Transfer Authorization Ready**. See
[checkpoint status](testnet-progress.md) for the reviewed transfer capture and
expiration correction, verified local HTTPS, earlier real CEO+CFO probe validation,
confirmed inbound 1 XLM funding and pending first outgoing transfer. Earlier
milestone sections below are historical. Any future capture requires trusted HTTPS
and an explicitly prepared and reviewed valid proposal; never reuse assertions
across challenges. Local certificates, credentials and proposals are not
distributed with this repository.

Historical preparation status: **offline Wasm validated; deployment awaited user configuration and explicit approval**.
No contract was deployed, no transaction was submitted, no Mainnet endpoint was accessed,
and no commit, push, or history edit was performed. Existing uncommitted work was preserved.
Contract implementations and their release hashes are unchanged by this milestone.

## Verification results

| Check | Result |
| --- | --- |
| Release build, `stellar contract build --locked` | Both optimized artifacts compiled |
| Native Rust suite | 20 passed, 0 failed |
| Compiled-Wasm Rust suite | 21 passed, 0 failed |
| Official JavaScript SDK → compiled Wasm | Accepted two approvals; rejected their replay |
| TypeScript strict check | Passed |
| Node integration/encoding/configuration tests | 5 passed, 0 failed |
| Rust format and all-target checks | Passed |
| Browser JavaScript syntax | Passed |
| Hardware/browser ceremony | Requires manual validation with real authenticators |
| Live deployment and signed transfer simulation | Pending actual configuration and deployments |

The Wasm feature switches **both** account and verifier registrations to the optimized
release artifacts; it does not mock their authorization. The small stateful target remains
a native fixture. The asset-transfer test instead uses the host's real Stellar Asset
Contract with a fixture-only authorized mint. Its transfer uses real account authorization.

Coverage includes initialization, immutable verifier getters, constructor re-entry rejection,
every signer pair, all three signers, one signer, duplicate approval, unknown signer,
missing authorization, replay, wrong network, expiry, changed nonce/expiry/arguments/rules,
invalid origin/RP-ID/challenge/type/UV/UP/signature, cross-origin binding, unauthorized
rotation, authorized rotation, and stale-rule invalidation after rotation. Failed operations
are checked for absence of target state changes.

The public SDK interoperability vector contains public keys and already consumed test
assertions only. Private test keys are generated in memory and discarded. Regenerate it
only intentionally, using `node --experimental-strip-types scripts/testnet/auth.test.ts --write-fixture`.
No generated software signer is used as a browser-passkey substitute in deployment.

Reproduce from the workspace:

```bash
source .tools/env.sh
npm ci --ignore-scripts --no-audit --no-fund
bash scripts/validate.sh
```

Pinned tooling: Soroban SDK 26.1.0 / OpenZeppelin stellar-accounts 0.7.2,
Stellar CLI 28.1.0; JavaScript SDK 17.2.1; TypeScript 5.9.3; Node >=22.12.
Registry metadata and the installed SDK interfaces were checked before implementation;
lockfiles preserve dependency versions and integrity. SDK 17 uses immutable XDR property
APIs. Simulation explicitly sets `useUpgradedAuth=false`: the Rust account/host tests use
legacy address credentials and the corresponding authorization preimage. Do not silently
switch to v2 credentials with this client.

| Artifact | Bytes | Required SHA-256 |
| --- | ---: | --- |
| institutional_account.wasm | 27,977 | `33990cee9e300532e9b0b1c5bf0641f07e12c1a3f5f60ad1502561f74721a1e0` |
| institutional_webauthn_verifier.wasm | 14,449 | `c1ac3c76abf9a9a647695c8eba212dc03f2cac079c2b94525a335bd658359564` |

The scripts pin these hashes. A legitimate contract change requires a new build, Wasm
validation, review and deliberate hash update.

## Public interfaces and authorization

Account exports: `__constructor`, `__check_auth`, `execute`, `rotate_signers`, `signers`,
`rule_ids`, `rule`. `__check_auth` forwards to OpenZeppelin `do_check_auth`. There are
no generic rule administration, upgrade, verifier setter, or owner bypass methods.
Verifier exports: `__constructor`, `verify`, `canonicalize_key`, `batch_canonicalize_key`,
`origin`, `rp_id_hash`. Its configuration has no setter or upgrade path.

The atomic account constructor receives three distinct uncompressed P-256 public keys
and one verifier address. It creates four default rules: CEO+CFO, CEO+Treasury,
CFO+Treasury, and all three. Every member of a selected rule must approve. Separate
map keys ensure repeated approvals from one public key count once. `rotate_signers`
authenticates the old account quorum before making any change and creates fresh rule IDs.

For each Soroban address authorization entry:

1. Build the exact authorized invocation tree from recording simulation.
2. Set a short signature-expiration ledger; retain the RPC-generated nonce.
3. Compute `payload = SHA256(XDR(HashIdPreimage::SorobanAuthorization))`, which contains
   the Testnet network hash, nonce, expiration ledger, and full invocation tree.
4. Compute `digest = SHA256(payload || XDR(ScVal::Vec(context_rule_ids)))`.
5. Each signer independently signs a WebAuthn `get` challenge equal to unpadded
   base64url(digest), with user verification required and the configured RP-ID.
6. Encode the low-S compact 64-byte signature, authenticator data and original
   clientDataJSON into the XDR `WebAuthnSigData` struct. DER parsing/low-S conversion
   uses the existing RustCrypto p256 implementation, never custom curve arithmetic.
7. Encode `AuthPayload { context_rule_ids, signers }`. The signer map uses the exact
   `Signer::External(verifier_address, public_key_bytes)` identity and the XDR assertion
   bytes. Preserve Soroban map ordering.
8. Enforce-simulate the actual signed entry, then assemble footprint and fees. Only
   after this should the fee payer sign the transaction envelope externally.

A single direct token transfer has one authorization context, so this client uses one
rule ID. More complex nested invocation trees need one reviewed rule per host-provided
context and are outside the prepared transfer flow. Changing any signed component requires
new independent approvals. Transaction envelope signatures cannot substitute for passkeys.

## Localhost enrollment

```bash
npm run enroll
```

Open `http://localhost:8080`. Use the CEO, CFO and Treasury buttons with three independently
controlled authenticators. Each role performs browser registration followed by a fresh
assertion to prove possession. Download `signers.json` and place the public file at
`tmp/signers.json` inside the workspace. Browser downloads may need manual copying.
The coordinator binds only to loopback, checks Host/Origin, rejects reused challenges,
requires UV/UP and P-256 proof of possession, and rejects duplicate credentials/keys.
It retains public metadata and three-minute challenges in memory; restarting clears them.
It never generates, receives, or persists authenticator private keys.

Enrollment uses attestation `none`. It does **not** certify authenticator hardware,
employment roles, separate humans/devices, backup policies, or attestation trust chains.
This local operator-controlled ceremony is not a production enrollment service. Review
public registrations with each officer before using them as deployment inputs.

Environment variables:

- `WEBAUTHN_ORIGIN`: exact origin, including port when non-default.
- `WEBAUTHN_RP_ID`: RP host/domain without scheme or port.
- `STELLAR_FEE_PAYER`: public G-address of a user-controlled development Testnet account.
- Optional local HTTPS server: `LOCAL_TLS_CERT`, `LOCAL_TLS_KEY`, both workspace paths to
  an existing development certificate/key. No TLS verification bypass is supported.

Enrollment defaults to HTTP localhost because browsers treat localhost as a development
secure context. **The existing on-chain verifier requires HTTPS**, and deployment scripts
also enforce HTTPS. HTTP-localhost enrollment is therefore development-only. For a live
Testnet demo, select trusted HTTPS localhost or an HTTPS application origin, enroll at that
origin, and supply its exact binding explicitly. A different RP-ID requires new passkeys;
changing origin also requires a new immutable verifier/account deployment. No placeholder
origin or RP-ID is used as a deployment default. No contract change weakening origin
validation was made.

## Development fee payer and test asset

The operator creates a separate development account in a user-controlled Testnet wallet
and switches that wallet to Testnet. Keep signing in that wallet; only copy its public
G-address into `STELLAR_FEE_PAYER`. The repository does not generate or store its private key.
Use the wallet's Friendbot funding action, or fund the public address after checking it:

```bash
curl --fail --get https://friendbot.stellar.org --data-urlencode "addr=$STELLAR_FEE_PAYER"
```

This is a documented future funding action, not an action performed in this milestone.
See [Stellar's Testnet wallet setup](https://developers.stellar.org/docs/build/guides/freighter/connect-testnet)
and [account/Friendbot guide](https://developers.stellar.org/docs/build/guides/transactions/create-account).
No production credentials or real assets are needed.

For the first transaction, select a reviewed **Testnet** Stellar Asset Contract and a
Testnet recipient, and give the smart account a test balance. Test XLM can be transferred
to the deployed C-address through its native SAC. A G-recipient for an issued test asset
needs an appropriate trustline. Token contract addresses, asset issuer, decimals, balances,
and recipient trustline must be reviewed; no USDC issuer address is assumed. Blend V2 is
not part of this milestone. The offline transfer covers balance changes, but does not
prove the chosen future Testnet token is correctly configured or funded.

## Deployment and transaction runbook — execute only after explicit approval

All commands below are preparation instructions. `upload`, `deploy`, `prepare`, `review`,
`finalize`, and maintenance commands only read Testnet/simulate/write public files.
`submit` is the **only** network submission path and requires an explicit environment gate.
All network access is pinned to `https://soroban-testnet.stellar.org` and the Testnet passphrase.
There is no Mainnet selection, remote signing service, or secret input.

1. Complete real HTTPS enrollment, review `tmp/signers.json`, and create/fund the public
   Testnet fee payer. Copy `scripts/testnet/config.example.json` to `tmp/testnet.json`.
   Keep `signersFile` pointing to the reviewed public registrations. Fill account/token/
   verifier addresses as they become available, recipient, positive integer base-unit
   amount, desired pair and fee cap. `maxFeeStroops=10000000` is a **1 test-XLM cap**, not
   an estimate. The signer bundle takes precedence over inline example signer values.
   Explicitly export the three environment variables above; never use placeholders.
2. Run `node --experimental-strip-types scripts/testnet/network.ts` to verify Testnet
   protocol/resource settings. Reproduce all local checks before proceeding.
3. Prepare the verifier Wasm upload:
   `npm run testnet -- upload tmp/testnet.json verifier tmp/verifier-upload.json`.
4. Sign `envelopeXdr` using the external Testnet wallet/transaction signer, producing
   `tmp/verifier-upload-signed.json` with the same JSON shape and signed envelope. Review
   the unsigned envelope separately. Submission, once approved:
   `TESTNET_SUBMISSION_APPROVED=yes npm run testnet -- submit tmp/testnet.json tmp/verifier-upload-signed.json tmp/verifier-upload.json`.
   The second file is the reviewed unsigned envelope; only its signatures may differ.
5. Query `npm run testnet -- result tmp/testnet.json TRANSACTION_HASH` until SUCCESS.
   NOT_FOUND or pending is not success. Inspect return-value XDR and result/meta as well
   as status. Upload must return the reviewed Wasm hash.
6. Prepare atomic verifier deployment/configuration:
   `npm run testnet -- deploy tmp/testnet.json verifier tmp/verifier-deploy.json`.
   Sign externally, submit with its reviewed unsigned counterpart, and verify SUCCESS as
   in steps 4–5. Decode the returned ScVal address and set `verifier` in the public config.
   The constructor sets origin and RP-ID hash in the same operation as deployment;
   there is no separate unprotected configuration transaction.
7. Run `npm run testnet -- verify-verifier tmp/testnet.json`. This fetches the executable
   bytes through its contract ID, verifies SHA-256 against the pin, and verifies both
   immutable getters. A mismatch blocks account preparation.
8. Upload the account Wasm with `upload ... account tmp/account-upload.json`, then sign,
   submit and verify as above. Prepare `deploy ... account tmp/account-deploy.json`.
   It atomically initializes all three public institutional signers with the checked
   verifier. Sign/submit/verify, decode its returned C-address, and set `account`.
9. Run `npm run testnet -- verify tmp/testnet.json`; it checks both hashes, verifier
   binding, enrolled public keys and the selected pair's current rule ID. Fund the
   smart account with the selected test token and inspect balances.
10. Prepare the exact direct token transfer:
    `npm run testnet -- prepare tmp/testnet.json tmp/request.json`.
    This records authorization and generates the shared WebAuthn challenge. Default
    expiration is 60 ledgers; configurable range is 10–120. Neither script nor backend
    invents a signer or signs for an officer.
11. Each officer independently reviews the config, asset, recipient, base-unit amount,
    complete entry XDR, network and expiry, then runs
    `npm run testnet -- review tmp/testnet.json tmp/request.json` against their trusted
    proposal/config copy. Confirm the reported challenge. Run the reviewed function in
    `scripts/testnet/collect.js` in the approved RP application's browser console, with
    the request object and own role, to collect that officer's assertion. Example:
    `await collectInstitutionalApproval(request, 'ceo')`. Repeat independently for CFO
    or Treasury, according to the selected pair. This is a developer collector, not a
    finished transaction-review application. Never paste unreviewed console code.
12. Put the two public assertion JSON files inside the workspace. Finalize:
    `npm run testnet -- finalize tmp/testnet.json tmp/request.json tmp/ceo-assertion.json tmp/cfo-assertion.json tmp/transfer.json`.
    This checks the original invocation against current config, recomputes the digest,
    checks current rules/keys and expiration, verifies assertions locally with OpenSSL,
    normalizes DER using RustCrypto, and enforce-simulates real Wasm authorization.
    It aborts on failure, restoration fallback or a fee-cap overrun. The output includes
    total fee, minimum resource fee, footprint keys and transaction-data XDR.
13. Review/sign the final envelope in the external fee-payer wallet. Submit with the
    explicit gate and reviewed unsigned counterpart, then query `result` as above.
    Inspect transaction metadata and the token transfer event, and independently query
    source/recipient token balances (e.g. Testnet Lab or read-only contract calls). A
    nonzero hash, accepted submission or successful signature collection is insufficient.
    On delay/expiry/rotation, discard approvals and prepare a fresh request.

Scripts refuse to overwrite existing output files. Use new filenames for each attempt.
Transaction envelope timeouts are five minutes. `finalize` refreshes fee-payer sequence
and resources without changing the authorized invocation; do not wait to sign/submit.
A distinct fee payer can relay, but cannot authorize a transfer without both approvals.

## Resources, fees, expiration and TTL

Read-only Testnet snapshot on 2026-10-16, ledger **5,221,312**, protocol **29**:

- Contract maximum 131,072 bytes; both artifacts fit.
- Transaction CPU limit 400,000,000 instructions; memory limit 41,943,040 bytes.
- Transaction disk reads: 200 entries / 200,000 bytes; writes: 200 / 132,096 bytes.
- Transaction size limit 132,096 bytes; event limit 16,384 bytes.
- CPU rate: 3 stroops per 10,000 instructions; entry/byte/history/event/rent fees also apply.
- Minimum persistent TTL 120,960 ledgers; temporary TTL 720; maximum TTL 3,110,400.

Re-fetch with `scripts/testnet/network.ts`; these are changeable network settings, not
constants imposed by the scripts. Local host 26.1.3 is older than live Testnet protocol
29. Wasm execution passed under that host, but live protocol compatibility and live fee
assembly are not yet demonstrated. The prepared pre-deployment simulations must pass.

The two-passkey SAC transfer measured **9,866,878 CPU instructions** and **4,023,739 bytes**
of metered memory locally. That is below even the host's 100M CPU / 40MiB default budget.
At the queried CPU rate, the CPU component alone is approximately **2,961 stroops =
0.0002961 test XLM**. A nominal one-operation inclusion bid adds at least 100 stroops
before resource charges. This is **not a total transaction estimate**: storage reads,
writes, bytes, signatures/envelope size, events, rent/extensions, restoration and surge
inclusion prices must be priced by actual Testnet simulation. Upload/deployment costs
also remain unquoted without a funded fee payer and real constructors. The SDK test
helper's historical Mainnet fee snapshot was deliberately not used as a Testnet quote.
[Stellar's fee model](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering)
explains why the final simulation is required.

OpenZeppelin smart-account persistent reads automatically extend accessed rule/signer
entries toward 30 days when below the 29-day threshold (library assumption: 17,280
ledgers/day). This does **not** maintain the account/verifier instance and executable TTL,
unread rules, or every signer-lookup/rotation entry. No instance auto-extension was added
to contract code. Maintain those externally with a funded development fee payer:

```bash
npm run testnet -- inventory tmp/testnet.json tmp/keys.json
npm run testnet -- ttl-status tmp/testnet.json tmp/keys.json
npm run testnet -- ttl tmp/testnet.json tmp/keys.json tmp/ttl-extension.json 120960
```

Inventory reads all current rules, not only the selected pair, and collects their
persistent keys plus both instances/code. Rotation-only lookup entries and token balances
also need monitoring; they are not claimed to be fully inventoried. The final transfer
output exports additional footprint keys. TTL tooling accepts an explicit reviewed list
of persistent contract-data/code ledger keys and excludes temporary nonce keys. Extend
before expiry; keep the duration within the latest network maximum, and review rent via
simulation. Sign/submit maintenance envelopes externally using the same approval gate.

Protocol 23+ simulation normally includes automatic restoration information in the
transaction data. Always preserve that data when assembling the transaction. If RPC
instead returns `restorePreamble`, these scripts stop; prepare a separate restoration
for the reviewed archived persistent/code key list:

```bash
npm run testnet -- restore tmp/testnet.json tmp/archived-keys.json tmp/restore.json
```

Review/sign/submit, wait for SUCCESS, then regenerate and re-simulate the original
operation. Restoration must not reuse an obsolete fee-payer sequence or expired
approvals. Temporary nonce entries cannot be restored; their lifetime is bounded by the
host's expiration/replay rules. See [Stellar state archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival).

## Security findings and blockers

- **Trusted verifier bootstrap:** a malicious verifier can claim signatures are valid
  and defeat the apparent quorum if chosen during account construction. The account
  contract itself does not enforce a verifier code-hash allowlist. Hash/config checks
  in the deployment client are therefore mandatory. A third-party factory or alternate
  deployment tool can bypass those client checks; do not trust arbitrary account IDs.
  The reviewed verifier is immutable and has no upgrade export, closing later swapping
  through its public API. Unknown external signers/verifier addresses cannot be added
  via authorization payloads: OpenZeppelin rejects signers outside the selected rules.
- **Initialization:** deployment and constructor configuration are atomic, with no
  public post-deploy initializer. Host constructor re-entry is tested. Contract key
  validation checks length/prefix and distinctness, not full curve membership; the
  deployment client additionally validates P-256 curve points through OpenSSL. Review
  each enrollment; malformed initial keys can permanently reduce availability.
- **Independent custody:** distinct cryptographic keys are proven; independent humans,
  devices, backups and approval intent remain operator controls. Two credentials on
  one synced account do not establish separate institutional custody.
- **Immutable binding:** deployment must wait for the HTTPS origin/RP-ID and matching
  real passkeys. Environment changes configure future deployments; they cannot change
  an existing verifier. HTTP-localhost assertions cannot satisfy this HTTPS-only verifier.
- **Recovery:** rotation needs an available old quorum. There is no single-owner recovery
  or upgrade escape hatch. Loss of two independent signers can lock the account.
- **Enrollment scope:** no attestation enforcement, authenticator sign-counter/backup
  policy or production identity onboarding. The browser ceremony still needs testing
  on the three intended authenticators. The local development server is not approved
  for public production hosting. The developer collector still requires independent
  intent review; browser WebAuthn prompts do not display token-transfer semantics.
- **Unaudited integration:** the OpenZeppelin release describes itself as experimental;
  this milestone is for Testnet only. No claim of production institutional security.

User action required before deployment: choose the actual HTTPS binding, enroll/review
three independent public registrations at that RP, create/fund a development fee payer,
and choose/fund the test asset and recipient. Then review the concrete unsigned deployment
envelopes and give **explicit approval before any submission**. Deployment, real-browser
quorum collection, live costs, fee-payer signing and on-chain result verification remain
pending. No deployment approval is assumed from this preparation request.

## Step 4.27 — authorization probe preparation and review

Only this operation is supported by the new commands:
`SmartAccount.execute(Verifier, "origin", [])`. It requires the CEO + CFO rule,
`localhost` / `https://localhost:8443`, distinct keys and credential IDs, and a
fee cap no greater than 10,000,000 stroops (1 Testnet XLM). Use the reviewed local
configuration containing the deployed account/verifier and public signer metadata.
Token, recipient and amount placeholders are unused by these commands.

```sh
source .tools/env.sh
npm run testnet -- prepare-probe tmp/account-deploy-step4-24-verification-config.json tmp/step4-27-probe-request.json
npm run testnet -- review-probe tmp/account-deploy-step4-24-verification-config.json tmp/step4-27-probe-request.json
```

Use a new output filename for each preparation; existing files are never overwritten.
Preparation checks Testnet, reviewed Wasm hashes, verifier RP/origin and on-chain
signers/rule, runs a fresh `record` simulation, checks the assembled estimated fee,
and creates a versioned probe request under `tmp/`. It does not assemble a signed
or submission-ready transaction. The unsigned envelope records the exact invocation
used for discovery. Review validates its operation, source, fee, memo, preconditions,
extension and absence of signatures/auth entries, as well as the exact authorization
tree, account/verifier, network, signer metadata, rule, nonce-bound challenge and
expiration. Both commands reject an already consumed nonce. Review repeats the
on-chain configuration checks and requires more than five ledgers of validity.

The WebAuthn challenge uses the existing Soroban authorization preimage and rule
encoding. It binds the operation/tree, network, nonce and expiration, not transaction
transport fields such as the fee payer sequence. The envelope is a checked discovery
template; Step 4.28 must build a fresh transaction for enforce simulation.
Review is against a trusted, independently reviewed configuration; a recomputed
challenge is not evidence of human approval or proof of authenticity of a JSON file.

The review prints exact contract IDs, `execute` / `origin` / empty arguments,
required roles, rule ID, RP/origin, nonce, expiration and challenge. The request
contains public signer metadata; do not publish it or use the transfer collector.
The earlier Step 4.26 inspection artifact has no supported probe version and is
rejected. Existing `prepare`, `review` and `finalize` remain transfer-specific;
transfer validation explicitly rejects versioned probe requests. No probe capture
or finalization command exists in this step.

`record` discovers authorization requirements; it does not prove WebAuthn validity.
The target is a read, but future enforce execution of account authorization can
produce simulated nonce/TTL changes. Simulation does not persist those changes.
Zero account XLM balance does not prevent this probe; no funding is required here.

Before capture: implement probe-specific trusted intent review, independent CEO
Touch ID and CFO YubiKey assertions, strict binding and signature checks, and a
fresh unsigned transaction simulated in `enforce`. Regenerate expired proposals;
never reuse the Step 4.26 challenge. Do not submit transactions as part of this test.

## Step 4.28 — explicit probe authorization mode

The enrollment server now supports `WEBAUTHN_MODE=authorization`. This mode exposes
only the reviewed authorization probe, not enrollment, transfers, transaction signing
or submission. Normal enrollment remains the default mode. No WebAuthn ceremony is
started by server startup, page loading, proposal review or automated tests.

The following commands describe the separately authorized real capture workflow.
Checkpoint 4.6 records its successful completion; do not rerun for publication:

```sh
source .tools/env.sh
export WEBAUTHN_ORIGIN=https://localhost:8443
export WEBAUTHN_RP_ID=localhost
export LOCAL_TLS_CERT=/workspaces/stellar-wallet/tmp/tls/localhost.pem
export LOCAL_TLS_KEY=/workspaces/stellar-wallet/tmp/tls/localhost-key.pem
npm run testnet -- prepare-probe tmp/authorization-probe-360-config.json tmp/step4-28-request.json
npm run testnet -- review-probe tmp/authorization-probe-360-config.json tmp/step4-28-request.json
WEBAUTHN_MODE=authorization \
  AUTHORIZATION_CONFIG=tmp/authorization-probe-360-config.json \
  AUTHORIZATION_REQUEST=tmp/step4-28-request.json \
  npm run enroll
```

Use a new proposal filename each time. The probe-specific configuration
`tmp/authorization-probe-360-config.json` copies the reviewed local config and changes
only `expirationLedgers` to 360 **before preparation**. Probe preparation, review,
simulation and authorization sessions accept 10–360 ledgers; token transfers retain
their 10–120-ledger policy. Capture and simulation require more than five ledgers
remaining. At five seconds per ledger, 360 ledgers is approximately 30 minutes;
the actual validity follows ledger numbers. Each WebAuthn prompt still has a
120-second timeout, and enforce simulation builds a fresh transaction with a
300-second timeout after collecting approvals. Expiration is part of the signed
authorization preimage: extending a proposal requires a new challenge and both new
assertions. A running session cannot replace its immutable proposal or configuration.
The existing certificate must be trusted on the Mac/browser; preserve literal HTTPS localhost:8443
when forwarding the existing listener. Do not bypass TLS verification. The server
requires a successful live `review-probe` equivalent before opening the listener and
checks hashes, rule 0, signers, RP/origin, current ledger and unused nonce again before
each capture and before simulation. Expired/unreviewed proposals cannot enable capture.

At `https://localhost:8443/`, the operator must:

1. Select **Validate and review this proposal**. Inspect account/verifier IDs,
   Testnet network, exact `execute` / `origin` / empty arguments, CEO+CFO rule 0,
   challenge, expiration and proposal ID against an independent proposal copy.
2. Confirm review and select **Approve with CEO Touch ID**. Only this click requests
   the CEO credential, with `userVerification: required` and its exact credential ID.
3. Have the CFO independently review/confirm the same proposal, then select
   **Approve with CFO YubiKey**. Both buttons use the identical immutable challenge.
4. After both assertions validate, select **Simulate both approvals on Testnet**.
   The server constructs a fresh unsigned fee-payer transaction with the exact probe
   invocation and both authorization signatures, calls `simulateTransaction` with
   `authMode=enforce`, and enforces the configured fee cap (maximum 1 Testnet XLM).

The server pins the entire proposal using a SHA-256 proposal ID. It validates the
credential ID, role/public-key mapping, challenge, origin, RP hash, UP/UV, client-data
size, strict base64/DER encoding and P-256 signature. It uses the existing offline
RustCrypto DER/low-S normalizer and existing Soroban `signaturePayload` structure.
No authenticator private key leaves the device. Device model and separate human
custody cannot be established from these non-attested registrations; the officers
must select their intended Touch ID / YubiKey credentials and maintain independent
custody. No new dependency or custom cryptography was added.

The session stores `proposal.json`, `ceo-assertion.json`, `cfo-assertion.json` and
`simulation-report.json` in a newly created `tmp/authorization-<random>/` directory
(mode 0700, files 0600). An optional `AUTHORIZATION_OUTPUT_DIR` must already exist
under `tmp/`. The listener checks Host, exact Origin, JSON content type, session CSRF
token and proposal ID. It does not offer challenge replacement, submission or an
endpoint to download assertions. Do not publish these files. A restart creates a
new session; it does not automatically import captured assertions.

Expired proposals fail closed. Stop and explicitly prepare a new proposal, then
capture **both** assertions again; no challenge is silently regenerated. WebAuthn
cancellation allows retrying the same role on the same still-valid challenge, while
an already accepted role cannot be overwritten or replayed within a session.
Simulation does not consume an on-chain nonce. A completed browser session permits
one simulation attempt; a contract FAIL report is not proof of accepted authorization.

For a deliberate CLI enforce simulation using saved artifacts from that same
proposal, the new command is:

```sh
npm run testnet -- simulate-probe tmp/authorization-probe-360-config.json \
  tmp/authorization-SESSION/proposal.json \
  tmp/authorization-SESSION/ceo-assertion.json \
  tmp/authorization-SESSION/cfo-assertion.json \
  tmp/step4-28-simulation-report.json
```

This command rechecks the live review, nonce, expiration and both assertions. It
never calls `finalize`, signs with the fee payer or submits a transaction. It emits
only a report with operation, contract IDs, network, roles, rule, challenge digest
in hex, proposal ID, fee estimate and PASS/FAIL plus a sanitized contract error.
RPC diagnostics containing assertion bytes are omitted. PASS means enforce
simulation accepted the probe within the fee cap; it does not demonstrate a token
transfer or persist state. Existing transfer commands remain separate and reject
probe requests.

Implementation validation uses synthetic P-256 keys held only in test memory,
mocked Soroban responses and a mocked browser WebAuthn API. It covers bindings,
signature validation, distinct quorum serialization, immutable/replayed/expired
sessions, mandatory enforce mode, unsigned fee payer, fee/error reporting, HTTP
review/CSRF/Host gating, and absence of automatic browser ceremonies. Real CEO+CFO
capture and enforce acceptance by the deployed contracts are verified in Checkpoint
4.6 above; automated tests remain synthetic and do not repeat real ceremonies.

## First 1 XLM transfer — protected authorization capture

The local integration adds `AUTHORIZATION_PURPOSE=transfer` to the existing
`WEBAUTHN_MODE=authorization` HTTPS server. The default purpose remains `probe`.
Transfer capture is restricted to the reviewed Testnet account/verifier, native SAC
`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`, destination/fee payer
`GDBSP3BBHMZQ6LVNQTFNK6THMXFJDBTIHCY7FVRMJ26AP4VSJAZ6XXX2`, amount `10000000`,
CEO+CFO rule 0, and a configured duration of 120 ledgers. The general transfer
configuration policy remains 10–120 ledgers; probes retain 10–360. No contract,
signer registration or dependency changes are required.

For a later separately authorized preparation, first create a private directory
(mode 0700) under `tmp/` and review a dedicated configuration with those parameters,
`localhost` / `https://localhost:8443`, the existing public signer registrations and
a fee cap no greater than 10000000 stroops. Checkpoint 4.7 records confirmed inbound
funding of exactly 1 XLM; query fresh balances before preparing the outbound operation.
This runbook does not authorize another deposit or create a real request. Any later
funding requires separate explicit authorization. Do not reuse the old
configuration's asset/recipient placeholders or the 360-ledger probe configuration.

The existing `prepare CONFIG PRIVATE_DIR/request.json` command creates a private
proposal. `review CONFIG PRIVATE_DIR/request.json` now checks the deployed hashes,
RP/origin, signers, rule, exact invocation/challenge, expiration and unused nonce.
Both officers must independently review the same immutable proposal. At capture,
use the existing TLS environment and set:

```sh
source .tools/env.sh
export WEBAUTHN_MODE=authorization
export AUTHORIZATION_PURPOSE=transfer
export AUTHORIZATION_CONFIG=tmp/REVIEWED-TRANSFER-CONFIG.json
export AUTHORIZATION_REQUEST=tmp/PRIVATE-DIRECTORY/request.json
# Start npm run enroll only during a separately authorized real capture step.
```

Loading or reviewing the page starts no WebAuthn ceremony. Each officer explicitly
clicks their own button after review. The server verifies the exact credential
ID/public key, canonical encodings and limits, origin/RP/challenge, UP/UV and P-256
signature with the existing offline DER/low-S normalizer. It repeats live review
before and after signature validation. Validated assertions and the proposal are
saved only in a new private `tmp/authorization-.../` directory, with files 0600.
A consumed nonce, expired proposal, duplicate signer or changed operation fails
closed. A session cannot replace its proposal or import assertions on restart.

Completion means **CEO and CFO approvals validated.** Transfer mode has no simulation,
finalization or submission endpoint. Run the existing `finalize` command separately
with the saved proposal and both assertion files, writing to a private directory
under `tmp/`. Legacy console downloads lacking role/credential metadata are rejected.
Finalization revalidates live configuration, nonce, expiration and both signatures,
builds a fresh unsigned fee-payer transaction and requires Soroban `enforce`
simulation within the unchanged fee cap. It rechecks validity before saving the
unsigned envelope. Simulation failures omit raw assertion diagnostics.

120 ledgers is approximately ten minutes at five seconds per ledger; ledger
numbers determine validity. Both 120-second browser prompts, validation, external
signing and inclusion must fit. More than five ledgers must remain at checks, but
that minimum is not a sufficient human signing budget. If time is short, stop;
prepare a new proposal and obtain both approvals again only with explicit approval.
Never extend an active challenge. `submit` still requires its separate explicit
approval gate and externally signed envelope; `result` plus event/balance checks
must confirm execution. No real transfer or real transfer authorization has been
performed by the synthetic integration tests. Keep all artifacts local.
