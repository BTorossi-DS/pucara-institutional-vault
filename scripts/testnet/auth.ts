import { Address, hash, nativeToScVal, xdr } from '@stellar/stellar-sdk';

export const NETWORK = 'Test SDF Network ; September 2015';
export const RPC = 'https://soroban-testnet.stellar.org';
export const sha = (b: Uint8Array) => Buffer.from(hash(Buffer.from(b)));
export const bytes = (b: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(b));
export const sym = (s: string) => xdr.ScVal.scvSymbol(s);
export const u32 = (n: number) => nativeToScVal(n, { type: 'u32' });
// ScMap keys here are symbols; XDR lexical ordering is required.
export const struct = (fields: Record<string, xdr.ScVal>) => xdr.ScVal.scvMap(
  Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => new xdr.ScMapEntry({key: sym(k), val})),
);
export function external(verifier: string, publicKey: string) {
  if (!/^04[0-9a-f]{128}$/i.test(publicKey)) throw Error('Expected uncompressed P-256 public key');
  return xdr.ScVal.scvVec([sym('External'), new Address(verifier).toScVal(), bytes(Buffer.from(publicKey, 'hex'))]);
}
export function challenge(entry: xdr.SorobanAuthorizationEntry, ruleIds: number[]) {
  const c = credentials(entry);
  const payload = sha(xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({networkId: sha(Buffer.from(NETWORK)), nonce: c.nonce,
      signatureExpirationLedger: c.signatureExpirationLedger, invocation: entry.rootInvocation}),
  ).toXDR());
  const rules = xdr.ScVal.scvVec(ruleIds.map(u32));
  return sha(Buffer.concat([payload, rules.toXDR()]));
}
export interface Assertion {
  publicKey: string; signature: string; authenticatorData: string; clientDataJSON: string;
}
export function signaturePayload(verifier: string, rules: number[], assertions: Assertion[]) {
  if (assertions.length !== 2 || new Set(assertions.map(a => a.publicKey.toLowerCase())).size !== 2)
    throw Error('Exactly two distinct signer assertions required');
  const entries = assertions.map(a => new xdr.ScMapEntry({key: external(verifier, a.publicKey), val: bytes(struct({
    signature: bytes(Buffer.from(a.signature, 'hex')),
    authenticator_data: bytes(Buffer.from(a.authenticatorData, 'base64')),
    client_data: bytes(Buffer.from(a.clientDataJSON, 'base64')),
  }).toXDR())}));
  entries.sort((a,b) => Buffer.compare(a.key.toXDR(), b.key.toXDR()));
  return struct({context_rule_ids: xdr.ScVal.scvVec(rules.map(u32)), signers: xdr.ScVal.scvMap(entries)});
}

export function credentials(entry: xdr.SorobanAuthorizationEntry) {
  if (entry.credentials.type !== 'sorobanCredentialsAddress') throw Error('Expected legacy address authorization credentials');
  return entry.credentials.address;
}
export function withCredentials(entry: xdr.SorobanAuthorizationEntry, update: Partial<{signature: xdr.ScVal; signatureExpirationLedger: number}>) {
  return new xdr.SorobanAuthorizationEntry({rootInvocation:entry.rootInvocation, credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({...credentials(entry), ...update}))});
}
