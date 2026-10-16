import {createPublicKey, verify} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sha} from './auth.ts';
import type {Assertion} from './auth.ts';

export interface RegisteredWebAuthnSigner {
  credentialId: string; publicKey: string;
}
export interface WebAuthnBinding {
  challenge: string; origin: string; rpId: string;
}
export interface WebAuthnAssertion extends RegisteredWebAuthnSigner {
  clientDataJSON: string; authenticatorData: string; signatureDER: string;
}

export function normalizeAssertion(signatureDER: string) {
  if (typeof signatureDER !== 'string' || !/^(?:[0-9a-f]{2}){8,72}$/i.test(signatureDER)) throw Error('Invalid P-256 DER signature encoding');
  try {
    // Existing RustCrypto parser/low-S normalizer; no handwritten cryptography or downloads.
    const compact = execFileSync('/workspaces/stellar-wallet/.tools/cargo/bin/cargo',[
      'run','--quiet','--locked','--offline','-p','institutional-account','--example','normalize_assertion','--',signatureDER,
    ],{cwd:'/workspaces/stellar-wallet',encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim();
    if (!/^[0-9a-f]{128}$/.test(compact)) throw Error('Invalid compact signature');
    return compact;
  } catch { throw Error('P-256 DER normalization failed; check the existing offline normalizer'); }
}
function base64(value: string, maxBytes: number) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw Error('Invalid assertion base64 encoding');
  const raw=Buffer.from(value,'base64');
  if (raw.length > maxBytes || raw.toString('base64') !== value) throw Error('Invalid assertion size/encoding');
  return raw;
}

// The caller supplies the independently reviewed binding and registered signer.
// Role selection, proposal validation, quorum and session policy stay with the caller.
export function validateWebAuthnAssertion(binding: WebAuthnBinding, signer: RegisteredWebAuthnSigner, a: WebAuthnAssertion): Assertion {
  if (typeof signer.credentialId !== 'string' || signer.credentialId.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/.test(signer.credentialId) || Buffer.from(signer.credentialId,'base64url').toString('base64url') !== signer.credentialId)
    throw Error('Invalid registered credential ID encoding');
  if (a.credentialId !== signer.credentialId || a.publicKey !== signer.publicKey) throw Error('Credential ID or signer public key mismatch');
  const rawClient=base64(a.clientDataJSON,1024), ad=base64(a.authenticatorData,4096);
  const client=JSON.parse(rawClient.toString('utf8'));
  if (client.type !== 'webauthn.get' || client.challenge !== binding.challenge || client.origin !== binding.origin ||
      (client.crossOrigin !== undefined && client.crossOrigin !== false) || client.topOrigin !== undefined ||
      ad.length < 37 || !ad.subarray(0,32).equals(sha(Buffer.from(binding.rpId))) || (ad[32]&5) !== 5)
    throw Error('Invalid WebAuthn challenge/origin/RP/UP/UV binding');
  const compact=normalizeAssertion(a.signatureDER);
  const pk=Buffer.from(signer.publicKey,'hex');
  const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:pk.subarray(1,33).toString('base64url'),y:pk.subarray(33).toString('base64url')}});
  if (!verify('sha256',Buffer.concat([ad,sha(rawClient)]),{key,dsaEncoding:'ieee-p1363'},Buffer.from(compact,'hex')))
    throw Error('Invalid passkey signature');
  return {publicKey:signer.publicKey,signature:compact,authenticatorData:a.authenticatorData,clientDataJSON:a.clientDataJSON};
}
