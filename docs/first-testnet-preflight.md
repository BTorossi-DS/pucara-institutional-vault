# HTTPS enrollment and first Testnet deployment preflight

Review date: 2026-10-16. No deployment, funding, key generation, signing, commit,
or push was performed for this review. No host trust settings were changed.
Existing uncommitted files were preserved. This document supplements
`docs/testnet-readiness.md`; its deployment approval gate still applies.

## 1. Recommended HTTPS configuration

Use the existing Node HTTPS listener with **https://localhost:8443**, RP-ID
**localhost**, and a certificate trusted by the browser's machine. No server or
contract change is necessary. Prefer a current desktop Chrome/Edge with three
separately controlled ES256 security keys for the first ceremony. Other passkey
authenticators may work, but require actual browser validation.

Prerequisite: obtain a localhost certificate and leaf TLS key from an already
trusted development CA. If using mkcert, install it from its official project
and establish trust on the browser's machine through your normal administrator
process. Its documented trust command is `mkcert -install`; this changes host
trust and is an operator prerequisite, NOT an action authorized for this agent.
Installing the CA inside a container alone does not establish browser trust.

With mkcert already trusted, generate the leaf certificate on the browser's
machine, in the project's mounted workspace if available:

```bash
cd /workspaces/stellar-wallet
mkdir -p tmp/tls
umask 077
mkcert -cert-file tmp/tls/localhost.pem -key-file tmp/tls/localhost-key.pem localhost 127.0.0.1 ::1
```

If the browser machine does not have this workspace path, generate the two leaf
files in an operator-controlled location and copy only those files into
`/workspaces/stellar-wallet/tmp/tls/`. Never copy the CA private key into the
workspace. The leaf TLS key is server TLS material, not a Stellar/passkey key;
keep it private and ignored by Git.

Run in the workspace:

```bash
cd /workspaces/stellar-wallet
export WEBAUTHN_ORIGIN=https://localhost:8443
export WEBAUTHN_RP_ID=localhost
export LOCAL_TLS_CERT=/workspaces/stellar-wallet/tmp/tls/localhost.pem
export LOCAL_TLS_KEY=/workspaces/stellar-wallet/tmp/tls/localhost-key.pem
npm run enroll
```

For a remote/dev-container IDE, use a private TCP port forward from browser-host
localhost:8443 to container 127.0.0.1:8443, preserving the port and TLS stream.
In VS Code Ports, forward 8443 and use local port 8443. Open the literal URL
`https://localhost:8443/`, not a generated forwarded-domain URL. A proxy that
rewrites Host, terminates TLS incorrectly, or exposes another browser origin
will fail the existing checks. Do not make the port public.

Confirm no certificate warning and evaluate in the browser console:

```js
location.origin === 'https://localhost:8443'
window.isSecureContext
typeof PublicKeyCredential !== 'undefined'
```

All must be true. Do not bypass certificate warnings or TLS verification.
If local TCP forwarding is unavailable, a stable trusted HTTPS application
domain is the alternative, but its listener/proxy and exact Host/Origin must be
configured deliberately; the current server does not support an HTTP tunnel
backend for an HTTPS origin. An ephemeral public tunnel is not the recommended
ceremony origin.

Keep the exact origin, including port, for subsequent transaction approvals.
The verifier's origin/RP binding is immutable. Moving to a different RP-ID needs
new credentials; moving to a different origin needs a new verifier/account
deployment even where credentials remain valid for the RP-ID.

## 2. Real browser enrollment

1. Open the trusted HTTPS URL above. Verify the displayed origin and RP-ID.
2. CEO clicks the CEO button and uses their own authenticator. Complete both
   the registration prompt and the following assertion/proof-of-possession
   prompt with user verification.
3. CFO repeats using an independently controlled authenticator.
4. Treasury Manager repeats using an independently controlled authenticator.
5. All three roles must report success. Download `signers.json` and place it
   at `/workspaces/stellar-wallet/tmp/signers.json`. Do not substitute test
   vectors or software-generated test keys.
6. Review the public file with each officer. It must contain `ceo`, `cfo`, and
   `treasury_manager`, each with a distinct `publicKey` and `credentialId`.
   Public keys are uncompressed P-256: `04` followed by 128 hex digits (65 bytes).
   Credential IDs are unpadded base64url. Record the exact origin/RP-ID alongside
   the file; the downloaded JSON itself does not include them.

The browser requests only ES256 (-7), UV required, attestation none; it exports
SPKI, then proves possession with a fresh assertion restricted to the new ID.
The server checks the create/get challenges, exact origin, RP hash, UV/UP,
P-256 key, signature, expiration, replay and duplicate key/ID. It converts SPKI
to the contract's uncompressed key format. Credential IDs are browser lookup
metadata and are NOT contract constructor arguments.

The coordinator does not validate an attestation trust chain or certify role,
device, hardware provenance or separate humans. Its registration ID comes from
the trusted browser client; proof of possession authenticates the key, not an
attested binding between that ID and the creation attestation object. Treat
this as a supervised local development ceremony. The enrollment tests use
synthetic assertions only inside tests and do not establish browser readiness.

Challenges last three minutes total for both prompts. If canceled/expired,
retry the role. Successful roles cannot be replaced without restarting the
server; restart clears ALL in-memory registrations. Download before stopping.
Keep a public backup. Stop the coordinator after use, and restart at the exact
same origin when collecting transfer approvals. The file retains credential
IDs even if the coordinator's memory is cleared.

## 3. Fee payer and network: operator instructions only

Keep fee-payer custody in an operator-controlled external wallet/OS secure
store. The application and agent must never receive or persist its private key.
The following key-generation command is for an operator's existing Stellar
CLI 28.1.0 environment with a working OS credential store, not for this headless
container. Do not fall back to plaintext file storage if secure-store fails.
Do not use `keys secret`, `--as-secret`, a seed argument, or shell tracing.

```bash
stellar keys generate institutional-testnet-fee-payer --secure-store --network testnet
export STELLAR_FEE_PAYER="$(stellar keys public-key institutional-testnet-fee-payer)"
```

Only copy the resulting PUBLIC G-address into the workspace terminal:

```bash
cd /workspaces/stellar-wallet
source .tools/env.sh
export STELLAR_FEE_PAYER='REPLACE_WITH_PUBLIC_G_ADDRESS'
export STELLAR_RPC_URL=https://soroban-testnet.stellar.org
export STELLAR_NETWORK_PASSPHRASE='Test SDF Network ; September 2015'
export STELLAR_NETWORK=testnet
stellar network add --config-dir /workspaces/stellar-wallet/.stellar testnet \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "$STELLAR_NETWORK_PASSPHRASE"
```

The repository CLI itself hardcodes Testnet RPC/passphrase, verifies the
reported network and has no network selection switch. These exported network
variables also make future operator CLI commands explicit; the network alias
above is workspace-local. No secret is placed in `.stellar/` by these commands.

Validate the public address, fund via Friendbot, and verify the account balance:

```bash
node --input-type=module -e 'import {StrKey} from "@stellar/stellar-sdk"; if (!StrKey.isValidEd25519PublicKey(process.env.STELLAR_FEE_PAYER ?? "")) throw Error("Invalid public fee payer");'
curl --fail --silent --show-error --get https://friendbot.stellar.org \
  --data-urlencode "addr=$STELLAR_FEE_PAYER"
curl --fail --silent --show-error \
  "https://horizon-testnet.stellar.org/accounts/$STELLAR_FEE_PAYER" \
  | node --input-type=module -e 'let s=""; for await (const c of process.stdin) s+=c; const a=JSON.parse(s); const b=a.balances.find(b=>b.asset_type==="native"); if(a.account_id!==process.env.STELLAR_FEE_PAYER || !b || Number(b.balance)<=0) throw Error("Unfunded/mismatched account"); console.log(JSON.stringify({account:a.account_id,testXlm:b.balance,sequence:a.sequence},null,2));'
node --experimental-strip-types scripts/testnet/network.ts
```

Friendbot failure is not proof of zero balance (an already funded account may
not be eligible); independently inspect the balance query. Test XLM only.
If no operator secure store is available, create a new development account in
an external Testnet wallet instead, then use only its public address above.

## 4. Deployment review and approval boundary

| Item | Review result |
| --- | --- |
| Verifier Wasm | Local SHA-256 matches `c1ac3c76abf9a9a647695c8eba212dc03f2cac079c2b94525a335bd658359564` |
| Account Wasm | Local SHA-256 matches `33990cee9e300532e9b0b1c5bf0641f07e12c1a3f5f60ad1502561f74721a1e0` |
| Origin/RP-ID | CLI requires HTTPS, canonical exact origin and domain binding; verifier stores exact origin and SHA-256(RP-ID) atomically |
| Account initialization | Atomic constructor registers three distinct keys and reviewed verifier; no exposed owner/configuration bypass |
| Thresholds | Four fixed rules: each pair and all three; every member of selected rule must sign. Effective 2-of-3 minimum |
| Runtime verification | Scripts fetch deployed Wasm and compare hashes, verifier getters and enrolled keys before preparing a transfer |
| Rule verification limit | `quorumRule` selects by member identities; it does not separately assert every rule field/policy. Pinned executable and constructor provide that invariant; review all four rules after deployment |
| Transfer | Direct token `transfer(account, recipient, i128 amount)`; positive base-unit amount; exact invocation tree, nonce, expiry, network and rule-bound challenge |
| Simulation | Upload/deploy use enforced simulation; transfer records auth then enforces real assertions in final simulation; restoration and fee-cap errors stop preparation |
| Envelope | Exports unsigned XDR, fee and footprint; fee payer signs externally; submit compares transaction body hashes with reviewed envelope and requires explicit gate |

Before any signature, decode `envelopeXdr` with the official SDK/CLI or a trusted
Testnet transaction viewer and check source, sequence, operation, constructor
arguments, code hash, salt, network, time bounds, fees, footprint and auth entries.
The JSON is not itself evidence that a human reviewed the decoded envelope.
The submit check prevents body changes after review; it does not replace human
review. The fee payer pays fees but cannot authorize institutional transfers.

Prepare the public config only after genuine enrollment:

```bash
cp -n scripts/testnet/config.example.json tmp/testnet.json
```

Preserve `signersFile: "tmp/signers.json"`; export `WEBAUTHN_ORIGIN`,
`WEBAUTHN_RP_ID`, and `STELLAR_FEE_PAYER` in every new terminal. TLS variables
are needed only by the enrollment server. Set the reviewed Testnet token,
recipient, amount, pair, expiration and fee cap in the config. Verifier/account
addresses are filled from successful future deployment results. The default
fee cap is 1 test XLM, not a fee prediction. Never set
`TESTNET_SUBMISSION_APPROVED` during this preflight.

The existing numbered runbook in `testnet-readiness.md` covers unsigned Wasm
upload, atomic deployments, independent officer review, assertion collection,
final simulation, external fee signing and result verification. Its `upload`
and `deploy` commands prepare/simulate envelopes; only `submit` broadcasts.
None were executed in this review.

## 5. Remaining blockers and estimate

- Browser-trusted localhost TLS and private port forwarding have not been
  demonstrated in the user's browser.
- Three real independent passkeys have not been enrolled or reviewed.
- Public fee payer, funding and external envelope signer are still required.
- Actual constructor/upload simulations and live protocol compatibility are
  unproven; local host validation is not a live Testnet simulation.
- Choose/review a Testnet SAC, recipient, decimals and amount; fund the future
  C-address with test assets. Start with native test XLM to avoid an issued-asset
  trustline/issuer dependency. No Blend or USDC integration is assumed.
- After deployment, verify hashes/configuration/all rules, token balances and
  signed transfer simulation. After transfer, require SUCCESS, token events and
  independently queried source/recipient balance changes.
- Current transaction approval collection is a reviewed browser-console helper,
  not a complete transaction-review UI. Default authorization lifetime is 60
  ledgers; collect the pair promptly and prepare again if expired.
- Explicit user deployment approval remains mandatory.

Planning estimate, not measured: **60–120 minutes to first confirmed Testnet
transfer** once three signers, trusted TLS, external fee signing and approval
are available. Allow additional time for host certificate provisioning,
authenticator incompatibilities, remote forwarding or live simulation failures.

## Sources

- https://github.com/FiloSottile/mkcert — trusted development certificates and leaf output options.
- https://developers.stellar.org/docs/tools/cli/agent-cli/quickstart — secure-store account generation.
- https://developers.stellar.org/docs/build/guides/transactions/create-account — Friendbot account funding.
- https://developers.stellar.org/docs/networks — Testnet endpoints and network separation.

Installed CLI help was checked for `keys generate`, `keys public-key`,
`network add` and `tx sign`; no dependencies were installed or upgraded.
