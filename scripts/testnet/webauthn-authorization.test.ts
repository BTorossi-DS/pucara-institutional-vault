import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAssertion,validateWebAuthnAssertion} from './webauthn-authorization.ts';
import {validateProbeAssertion} from './probe-authorization.ts';
import type {ProbeAssertion} from './probe-authorization.ts';
import {probeFixture} from './fixtures/probe.ts';

test('shared validation accepts registered assertions without a probe request or role and rejects a different trusted signer',()=>{
  const {c,req,assertion}=probeFixture();
  const binding={challenge:req.challenge,origin:c.origin,rpId:c.rpId};
  for(const role of ['ceo','cfo'] as const) {
    const {role:capturedRole,...a}=assertion(role);
    assert.equal(capturedRole,role);
    const result=validateWebAuthnAssertion(binding,c.signers[role],a);
    assert.match(result.signature,/^[0-9a-f]{128}$/);
    assert.equal(result.publicKey,c.signers[role].publicKey);
    assert.equal(result.clientDataJSON,a.clientDataJSON);
    assert.equal(result.authenticatorData,a.authenticatorData);
    const other=role==='ceo'?'cfo':'ceo';
    assert.throws(()=>validateWebAuthnAssertion(binding,c.signers[other],a),/Credential ID or signer public key mismatch/);
    assert.throws(()=>validateWebAuthnAssertion({...binding,challenge:'different'},c.signers[role],a),/binding/);
  }
  const a=assertion('ceo');
  assert.throws(()=>validateProbeAssertion(c,req,{...a,role:'treasury_manager'} as unknown as ProbeAssertion),/Unknown institutional signer/);
});

test('shared validation keeps canonical encodings and assertion size limits',()=>{
  const {c,req,assertion}=probeFixture(),a=assertion('ceo');
  const binding={challenge:req.challenge,origin:c.origin,rpId:c.rpId},signer=c.signers.ceo;
  const validate=(change:Partial<typeof a>)=>validateWebAuthnAssertion(binding,signer,{...a,...change});
  const noncanonical=a.authenticatorData.replace(/AA==$/,'AB==');
  assert.notEqual(noncanonical,a.authenticatorData);
  assert.deepEqual(Buffer.from(noncanonical,'base64'),Buffer.from(a.authenticatorData,'base64'));
  assert.throws(()=>validate({authenticatorData:noncanonical}),/size\/encoding/);
  assert.throws(()=>validate({authenticatorData:a.authenticatorData.replace(/=+$/,'')}),/base64 encoding/);
  assert.throws(()=>validate({clientDataJSON:a.clientDataJSON+'\n'}),/base64 encoding/);
  assert.throws(()=>validate({authenticatorData:Buffer.alloc(4097).toString('base64')}),/size\/encoding/);
  assert.throws(()=>validateWebAuthnAssertion(binding,{...signer,credentialId:'Zh'},{...a,credentialId:'Zh'}),/registered credential ID encoding/);

  const client=JSON.parse(Buffer.from(a.clientDataJSON,'base64').toString('utf8'));
  const padding=1024-Buffer.byteLength(JSON.stringify({...client,padding:''}));
  const atLimit=assertion('ceo',{padding:'x'.repeat(padding)});
  assert.equal(Buffer.from(atLimit.clientDataJSON,'base64').length,1024);
  assert.doesNotThrow(()=>validateWebAuthnAssertion(binding,signer,atLimit));
  const overLimit=assertion('ceo',{padding:'x'.repeat(padding+1)});
  assert.equal(Buffer.from(overLimit.clientDataJSON,'base64').length,1025);
  assert.throws(()=>validateWebAuthnAssertion(binding,signer,overLimit),/size\/encoding/);
});

test('shared normalization preserves RustCrypto DER rejection and low-S conversion',()=>{
  // Fixed synthetic DER scalars r=1, s=P-256 order minus 1; no key or assertion.
  const highS='3026020101022100ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632550';
  assert.equal(normalizeAssertion(highS),('0'.repeat(63)+'1').repeat(2));
  assert.throws(()=>normalizeAssertion('gg'),/DER signature encoding/);
  assert.throws(()=>normalizeAssertion('00'.repeat(73)),/DER signature encoding/);
  assert.throws(()=>normalizeAssertion('00'.repeat(8)),/DER normalization failed/);
});
