// Preparation/review only. This request is deliberately incompatible with the transfer collector.
import { Address, BASE_FEE, Operation, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { NETWORK, challenge, credentials, withCredentials } from './auth.ts';
import type { Config } from './cli.ts';

export interface ProbeRequest {
  kind: 'webauthn-authorization-probe-v1';
  network: string; account: string; verifier: string; origin: string; rpId: string;
  requiredSigners: {role: 'ceo' | 'cfo'; publicKey: string; credentialId: string}[];
  ruleIds: number[]; entryXdr: string; unsignedEnvelopeXdr: string; challenge: string;
  preparedAtLedger: number; expirationLedger: number;
  intent: {operation: 'execute'; account: string; target: string; targetFunction: 'origin'; targetArgs: []};
}
export function probeOperation(c: Config) {
  if (JSON.stringify(c.pair) !== JSON.stringify(['ceo','cfo'])) throw Error('Probe requires CEO + CFO');
  if (c.rpId !== 'localhost' || c.origin !== 'https://localhost:8443') throw Error('Probe requires localhost HTTPS binding');
  if (new Set(c.pair.map(r=>c.signers[r].publicKey.toLowerCase())).size !== 2 ||
      new Set(c.pair.map(r=>c.signers[r].credentialId)).size !== 2 ||
      c.pair.some(r=>!c.signers[r].credentialId)) throw Error('Probe requires distinct keys and credential IDs');
  if (BigInt(c.maxFeeStroops) <= 0n || BigInt(c.maxFeeStroops) > 10000000n) throw Error('Probe fee cap must be at most 1 XLM');
  return Operation.invokeContractFunction({contract:c.account,function:'execute',args:[
    new Address(c.verifier).toScVal(), xdr.ScVal.scvSymbol('origin'), xdr.ScVal.scvVec([]),
  ]});
}
function intent(c: Config): ProbeRequest['intent'] {
  return {operation:'execute',account:c.account,target:c.verifier,targetFunction:'origin',targetArgs:[]};
}
function signers(c: Config): ProbeRequest['requiredSigners'] {
  return (['ceo','cfo'] as const).map(role=>({role,...c.signers[role]}));
}
export function validateProbeRequest(c: Config, req: ProbeRequest, rule: number, ledger: number) {
  const op = probeOperation(c);
  if (rule !== 0) throw Error('Probe requires rule 0');
  if (req.kind !== 'webauthn-authorization-probe-v1' || req.network !== NETWORK ||
      req.account !== c.account || req.verifier !== c.verifier || req.origin !== c.origin || req.rpId !== c.rpId ||
      JSON.stringify(req.requiredSigners) !== JSON.stringify(signers(c)) ||
      JSON.stringify(req.ruleIds) !== JSON.stringify([rule]) || JSON.stringify(req.intent) !== JSON.stringify(intent(c)))
    throw Error('Probe differs from reviewed configuration');
  const tx = TransactionBuilder.fromXDR(req.unsignedEnvelopeXdr, NETWORK);
  if (!(tx instanceof Transaction) || tx.signatures.length !== 0 || tx.source !== c.feePayer ||
      tx.fee !== BASE_FEE || tx.operations.length !== 1 || tx.memo.type !== 'none' ||
      !tx.timeBounds || tx.timeBounds.minTime !== '0' || !/^[1-9][0-9]*$/.test(tx.timeBounds.maxTime))
    throw Error('Unexpected probe transaction body');
  // Reject source overrides, auth entries, extra operations, preconditions or extension data.
  const envelope = xdr.TransactionEnvelope.fromXDR(req.unsignedEnvelopeXdr,'base64');
  if (envelope.type !== 'envelopeTypeTx') throw Error('Expected v1 transaction');
  const body = envelope.v1.tx;
  const expected = new xdr.Transaction({...body, operations:[op], ext:xdr.TransactionExt.v0(),
    cond:xdr.Preconditions.precondTime(new xdr.TimeBounds({minTime:0n,maxTime:BigInt(tx.timeBounds.maxTime)}))});
  if (!Buffer.from(body.toXDR()).equals(expected.toXDR())) throw Error('Modified probe transaction body');
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(req.entryXdr,'base64');
  const cred = credentials(entry);
  const b = op.body;
  if (b.type !== 'invokeHostFunction' || b.invokeHostFunctionOp.hostFunction.type !== 'hostFunctionTypeInvokeContract') throw Error('Expected invocation');
  if (Address.fromScAddress(cred.address).toString() !== c.account || cred.signature.type !== 'scvVoid' ||
      entry.rootInvocation.function.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
      !Buffer.from(entry.rootInvocation.function.contractFn.toXDR()).equals(b.invokeHostFunctionOp.hostFunction.invokeContract.toXDR()) ||
      entry.rootInvocation.subInvocations.length !== 0 || req.challenge !== challenge(entry,[rule]).toString('base64url'))
    throw Error('Unexpected probe authorization or challenge');
  if (!Number.isSafeInteger(req.preparedAtLedger) || !Number.isSafeInteger(ledger) || req.preparedAtLedger > ledger ||
      req.expirationLedger !== cred.signatureExpirationLedger ||
      req.expirationLedger !== req.preparedAtLedger + c.expirationLedgers ||
      req.expirationLedger <= ledger + 5 || req.expirationLedger > ledger + 120)
    throw Error('Probe expiration outside policy');
  return entry;
}
export function buildProbeRequest(c: Config, tx: Transaction, auth: xdr.SorobanAuthorizationEntry[], rule: number, ledger: number): ProbeRequest {
  if (auth.length !== 1 || !Number.isInteger(c.expirationLedgers) || c.expirationLedgers < 10 || c.expirationLedgers > 120)
    throw Error('Unexpected probe authorization count or expiration');
  if (credentials(auth[0]).signature.type !== 'scvVoid') throw Error('Probe must not reuse signatures');
  const entry = withCredentials(auth[0],{signatureExpirationLedger:ledger+c.expirationLedgers});
  const req: ProbeRequest = {kind:'webauthn-authorization-probe-v1',network:NETWORK,account:c.account,verifier:c.verifier,
    origin:c.origin,rpId:c.rpId,requiredSigners:signers(c),ruleIds:[rule],entryXdr:entry.toXDR('base64'),
    unsignedEnvelopeXdr:tx.toXDR(),challenge:challenge(entry,[rule]).toString('base64url'),preparedAtLedger:ledger,
    expirationLedger:credentials(entry).signatureExpirationLedger,intent:intent(c)};
  validateProbeRequest(c,req,rule,ledger);
  return req;
}
export function probeReview(c: Config, req: ProbeRequest, rule: number, ledger: number) {
  const entry = validateProbeRequest(c,req,rule,ledger);
  return {status:'PREPARATION_AND_REVIEW_ONLY',network:req.network,intent:req.intent,
    requiredSigners:req.requiredSigners.map(s=>s.role),ruleIds:req.ruleIds,origin:req.origin,rpId:req.rpId,
    nonce:credentials(entry).nonce.toString(),preparedAtLedger:req.preparedAtLedger,expirationLedger:req.expirationLedger,
    remainingLedgers:req.expirationLedger-ledger,challenge:req.challenge,
    authorization:'Unsigned; record simulation does not validate WebAuthn signatures',
    nextStep:'Use explicit authorization mode for capture and enforce simulation; no transaction submission'};
}
