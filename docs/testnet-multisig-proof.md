# Pucará — Verified institutional multisig transfer

Checkpoint 5.4 completed the first institutional E2E transfer on **Stellar Testnet**.
The existing Soroban smart account authorized a native-XLM transfer using the
registered CEO and CFO WebAuthn/passkey signers, satisfying its **2-of-3** policy
through **rule 0 (CEO + CFO)**. This was an executed transaction, not only a simulation.

## Public transaction evidence

| Field | Verified value |
| --- | --- |
| Network | Stellar Testnet |
| Network passphrase | `Test SDF Network ; September 2015` |
| Transaction hash | `55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2` |
| Result | **SUCCESS** (`txSuccess`) |
| Confirmation ledger | **5230325** |
| Smart Account Contract ID / sender | `CB2ZCJX4PB45LRQJ3CRCJ5JZ7O4DHONXMQV6U6RSIMXQ6KHYVNFZYYFH` |
| WebAuthn verifier | `CAZS2AXQZGPMSV2NWLTMPNUE6IJJ65F6G3QWEKMGXKQAPCAWROWQRYEP` |
| Native XLM Stellar Asset Contract | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Recipient / fee payer | `GDBSP3BBHMZQ6LVNQTFNK6THMXFJDBTIHCY7FVRMJ26AP4VSJAZ6XXX2` |
| Authorization | CEO + CFO WebAuthn approvals; institutional 2-of-3 policy |
| Amount | **1.0000000 Testnet XLM** / **10000000 stroops** |
| Actual fee | **0.2122091 Testnet XLM** / **2122091 stroops** |
| Final vault balance | **0.0000000 Testnet XLM** |
| Recipient / fee-payer balance after execution | **9977.2379565 Testnet XLM** |
| Submission count | **1**, no automatic resubmission |

[Verify the transaction on Stellar Expert (Testnet)](https://stellar.expert/explorer/testnet/tx/55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2).
The public [Horizon transaction record](https://horizon-testnet.stellar.org/transactions/55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2)
provides an additional independently queryable confirmation.

## Authorization and execution flow

**Proposal → CEO Passkey → CFO Passkey → Multisig Authorization → Soroban Execution → On-chain Confirmation**

1. A fresh proposal bound the exact Testnet transfer invocation, rule, nonce and
   signature-expiration ledger into the authorization challenge.
2. CEO and CFO independently reviewed that proposal and approved it using their
   registered passkeys. The coordinator validated both WebAuthn signatures and
   their origin, RP-ID and challenge bindings before persisting the approvals.
3. The client checked the two distinct signers, current quorum, proposal validity
   and unused nonce, then required successful Soroban `enforce` simulation.
4. The fee payer signed the transaction envelope separately. Fee payment could
   not substitute for the smart account's CEO+CFO authorization.
5. One submission executed on-chain. RPC confirmed `SUCCESS`; Horizon agreed
   on the ledger and actual fee. The exact native-SAC `transfer` event matched
   the sender, recipient and 10000000-stroop amount.

The vault balance changed from **1 XLM to 0 XLM**. The recipient was also the fee
payer: its balance changed from **9976.4501656 XLM** to **9977.2379565 XLM**,
reconciling the 1 XLM receipt minus the 0.2122091 XLM transaction fee.
Before publication, a fresh read-only RPC lookup again confirmed the transaction
hash, `SUCCESS`, ledger 5230325 and 2122091-stroop fee.

## Scope and privacy

Only public addresses and summarized execution evidence are included here.
Private keys, credential IDs, WebAuthn assertions, challenges, signed XDR,
internal receipts and operational artifacts are not included in this publication.
CEO/CFO names describe the supervised institutional signer mapping; this evidence
does not attest authenticator hardware provenance or independent human custody.
The contracts remain unaudited, this is Testnet-only evidence, and Blend V2 / USDC
integration remains pending. No additional transaction was executed to publish it.
