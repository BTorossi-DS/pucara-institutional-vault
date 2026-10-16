# First institutional transaction: preparation and validation

Status: **offline Wasm validated; deployment awaits user configuration and explicit approval**.
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
