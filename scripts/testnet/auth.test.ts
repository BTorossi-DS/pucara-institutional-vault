import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { challenge, signaturePayload, sha, credentials, withCredentials } from './auth.ts';
const contract = (n:number) => Address.contract(Buffer.alloc(32,n)).toString();
function entry() {
  return new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({address:new Address(contract(1)).toScAddress(),nonce:1n,signatureExpirationLedger:100,signature:xdr.ScVal.scvVoid()})),
    rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({contractAddress:new Address(contract(3)).toScAddress(),functionName:'put',args:[new Address(contract(1)).toScVal(),nativeToScVal(7,{type:'u32'})]})),subInvocations:[]})});
}
function fixture() {
  const unsigned = entry();
  const digest = challenge(unsigned,[0]);
  const keys = Array.from({length:3},() => generateKeyPairSync('ec',{namedCurve:'prime256v1'}));
  const publicKeys = keys.map(k => {const j=k.publicKey.export({format:'jwk'});return Buffer.concat([Buffer.from([4]),Buffer.from(j.x!,'base64url'),Buffer.from(j.y!,'base64url')]).toString('hex');});
  const assertions = keys.slice(0,2).map((k,i) => {
    const client = Buffer.from(JSON.stringify({type:'webauthn.get',challenge:digest.toString('base64url'),origin:'https://vault.example',crossOrigin:false}));
    const ad = Buffer.concat([sha(Buffer.from('vault.example')),Buffer.from([5,0,0,0,0])]);
    const der=sign('sha256',Buffer.concat([ad,sha(client)]),k.privateKey);
    const compact=execFileSync('target/debug/examples/normalize_assertion',[der.toString('hex')],{encoding:'utf8'}).trim();
    return {publicKey:publicKeys[i],signature:compact,authenticatorData:ad.toString('base64'),clientDataJSON:client.toString('base64')};
  });
  return {publicKeys,assertions,entry:withCredentials(unsigned,{signature:signaturePayload(contract(2),[0],assertions)})};
}
test('SDK encoding roundtrips, distinct assertions and compact signature shape', () => {
  const f=fixture();
  const decoded=xdr.SorobanAuthorizationEntry.fromXDR(f.entry.toXDR());
  const payload=scValToNative(credentials(decoded).signature);
  assert.deepEqual(payload.context_rule_ids,[0]);
  const value=credentials(decoded).signature;
  assert.equal(value.type,'scvMap');
  if(value.type !== 'scvMap') throw Error('map');
  const signers=value.map!.find(e=>e.key.type === 'scvSymbol' && e.key.sym.toString() === 'signers')!.val;
  assert.equal(signers.type,'scvMap');
  if(signers.type !== 'scvMap') throw Error('map');
  assert.equal(signers.map!.length,2);
  assert.equal(f.assertions[0].signature.length,128);
  assert.throws(() => signaturePayload(contract(2),[0],[f.assertions[0],f.assertions[0]]),/distinct/);
  assert.throws(() => signaturePayload(contract(2),[0],[f.assertions[0]]),/distinct/);
});
test('challenge binds rule IDs, nonce, expiration and invocation', () => {
  const e=entry(); const original=challenge(e,[0]);
  assert.notDeepEqual(challenge(e,[1]),original);
  assert.notDeepEqual(challenge(withCredentials(e,{signatureExpirationLedger:99}),[0]),original);
  const changed=new xdr.SorobanAuthorizationEntry({...e,credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({...credentials(e),nonce:2n}))});
  assert.notDeepEqual(challenge(changed,[0]),original);
  assert.equal(original.length,32);
});
if (process.argv.includes('--write-fixture')) {
  const f=fixture();
  writeFileSync('scripts/testnet/sdk-auth-vector.txt',[contract(1),contract(2),contract(3),...f.publicKeys,f.entry.toXDR('hex')].join('\n')+'\n');
}
