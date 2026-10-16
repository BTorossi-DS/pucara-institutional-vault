import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Account,Address,BASE_FEE,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {buildProbeRequest,probeOperation,probeReview,validateProbeRequest} from './auth-probe.ts';
import {validateRequest} from './cli.ts';
import type {Config,Request} from './cli.ts';
import type {ProbeRequest} from './auth-probe.ts';
import {NETWORK,challenge,credentials,withCredentials} from './auth.ts';
const v=readFileSync('scripts/testnet/sdk-auth-vector.txt','utf8').trim().split('\n');
const c: Config={feePayer:'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',origin:'https://localhost:8443',rpId:'localhost',
  account:v[0],verifier:v[1],token:'unused',recipient:'unused',amount:'unused',pair:['ceo','cfo'],expirationLedgers:60,maxFeeStroops:'10000000',
  signers:{ceo:{publicKey:v[3],credentialId:'Y2Vv'},cfo:{publicKey:v[4],credentialId:'Y2Zv'},treasury_manager:{publicKey:v[5],credentialId:'dHJlYXN1cnk'}}};
function fixture(nonce=42n) {
  const op=probeOperation(c),b=op.body;
  if(b.type!=='invokeHostFunction'||b.invokeHostFunctionOp.hostFunction.type!=='hostFunctionTypeInvokeContract')throw Error('invoke');
  const entry=new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
    address:new Address(c.account).toScAddress(),nonce,signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()})),
    rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(b.invokeHostFunctionOp.hostFunction.invokeContract),subInvocations:[]})});
  const tx=new TransactionBuilder(new Account(c.feePayer,'1'),{fee:BASE_FEE,networkPassphrase:NETWORK}).addOperation(op).setTimeout(300).build();
  return {entry,tx,req:buildProbeRequest(c,tx,[entry],0,1000)};
}
function rewritten(req:ProbeRequest,entry:xdr.SorobanAuthorizationEntry):ProbeRequest {
  return {...req,entryXdr:entry.toXDR('base64'),challenge:challenge(entry,[0]).toString('base64url')};
}
test('probe preparation creates a fresh operation-bound unsigned request and exact human review',()=>{
  const {req}=fixture();
  assert.equal(req.kind,'webauthn-authorization-probe-v1');
  assert.deepEqual(req.intent,{operation:'execute',account:c.account,target:c.verifier,targetFunction:'origin',targetArgs:[]});
  assert.equal(credentials(validateProbeRequest(c,req,0,1001)).signature.type,'scvVoid');
  assert.notEqual(req.challenge,fixture(43n).req.challenge);
  assert.deepEqual(probeReview(c,req,0,1001).requiredSigners,['ceo','cfo']);
  assert.equal(probeReview(c,req,0,1001).remainingLedgers,59);
  assert.throws(()=>validateRequest(c,req as unknown as Request,0),/cannot use transfer/);
});
test('probe duration accepts 10 through 360 ledgers and rejects invalid bounds and numbers',()=>{
  const {entry,tx,req}=fixture();
  for(const duration of [10,360]) {
    const config={...c,expirationLedgers:duration};
    const proposal=buildProbeRequest(config,tx,[entry],0,1000);
    assert.equal(proposal.expirationLedger,1000+duration);
    assert.equal(probeReview(config,proposal,0,1000).remainingLedgers,duration);
  }
  for(const duration of [9,0,-1,361,10.5,NaN,Infinity,-Infinity]) {
    const config={...c,expirationLedgers:duration};
    assert.throws(()=>buildProbeRequest(config,tx,[entry],0,1000),/expiration/);
    assert.throws(()=>validateProbeRequest(config,req,0,1001),/expiration/);
  }
});
test('360-ledger review rejects expired proposals and preserves the five-ledger safety buffer',()=>{
  const {entry,tx}=fixture(),config={...c,expirationLedgers:360};
  const req=buildProbeRequest(config,tx,[entry],0,1000);
  assert.equal(probeReview(config,req,0,1354).remainingLedgers,6);
  for(const ledger of [1355,1356,1360,1361])assert.throws(()=>validateProbeRequest(config,req,0,ledger),/expiration/);
});
test('expiration is included before challenge derivation; changing config cannot extend an existing proposal',()=>{
  const {entry,tx,req}=fixture();
  const changedEntry=withCredentials(xdr.SorobanAuthorizationEntry.fromXDR(req.entryXdr,'base64'),{signatureExpirationLedger:req.expirationLedger+1});
  assert.throws(()=>validateProbeRequest(c,{...req,entryXdr:changedEntry.toXDR('base64'),expirationLedger:req.expirationLedger+1},0,1001),/challenge/);
  const config={...c,expirationLedgers:61};
  const changed=buildProbeRequest(config,tx,[entry],0,1000);
  assert.notEqual(changed.challenge,req.challenge);
  assert.equal(changed.challenge,challenge(changedEntry,[0]).toString('base64url'));
  assert.throws(()=>validateProbeRequest(config,req,0,1001),/expiration/);
  assert.throws(()=>validateProbeRequest(c,changed,0,1001),/expiration/);
});
test('probe rejects changed operation bodies, extra calls, contract IDs and preexisting signatures',()=>{
  const {req,entry,tx}=fixture();
  for(const field of ['account','verifier'] as const) assert.throws(()=>validateProbeRequest({...c,[field]:v[2]},req,0,1001));
  const b=probeOperation(c).body;
  if(b.type!=='invokeHostFunction'||b.invokeHostFunctionOp.hostFunction.type!=='hostFunctionTypeInvokeContract')throw Error('invoke');
  for(const change of [{functionName:'rotate_signers'},{contractAddress:new Address(c.verifier).toScAddress()},
    {args:[new Address(c.account).toScVal(),xdr.ScVal.scvSymbol('origin'),xdr.ScVal.scvVec([])]},
    {args:[new Address(c.verifier).toScVal(),xdr.ScVal.scvSymbol('rp_id_hash'),xdr.ScVal.scvVec([])]},
    {args:[new Address(c.verifier).toScVal(),xdr.ScVal.scvSymbol('origin'),xdr.ScVal.scvVec([xdr.ScVal.scvVoid()])]}]) {
    const changed=new xdr.SorobanAuthorizationEntry({...entry,rootInvocation:new xdr.SorobanAuthorizedInvocation({
      function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({...b.invokeHostFunctionOp.hostFunction.invokeContract,...change})),subInvocations:[]})});
    assert.throws(()=>validateProbeRequest(c,rewritten(req,withCredentials(changed,{signatureExpirationLedger:1060})),0,1001),/authorization/);
  }
  const nested=new xdr.SorobanAuthorizationEntry({...entry,rootInvocation:new xdr.SorobanAuthorizedInvocation({...entry.rootInvocation,subInvocations:[entry.rootInvocation]})});
  assert.throws(()=>buildProbeRequest(c,tx,[nested],0,1000),/authorization/);
  assert.throws(()=>buildProbeRequest(c,tx,[],0,1000),/count/);
  assert.throws(()=>buildProbeRequest(c,tx,[entry,entry],0,1000),/count/);
  assert.throws(()=>buildProbeRequest(c,tx,[withCredentials(entry,{signature:xdr.ScVal.scvBytes(Buffer.from('old'))})],0,1000),/reuse/);
  const envelope=xdr.TransactionEnvelope.fromXDR(req.unsignedEnvelopeXdr,'base64');
  if(envelope.type!=='envelopeTypeTx')throw Error('v1');
  for(const body of [new xdr.Transaction({...envelope.v1.tx,operations:[probeOperation({...c,verifier:v[2]})]}),
    new xdr.Transaction({...envelope.v1.tx,operations:[probeOperation(c),probeOperation(c)]}),
    new xdr.Transaction({...envelope.v1.tx,fee:101})]) {
    const modified=xdr.TransactionEnvelope.envelopeTypeTx(new xdr.TransactionV1Envelope({tx:body,signatures:[]})).toXDR('base64');
    assert.throws(()=>validateProbeRequest(c,{...req,unsignedEnvelopeXdr:modified},0,1001),/transaction body/);
  }
});
test('probe review rejects network, signer, intent, challenge, nonce, rule and expiration tampering',()=>{
  const {req}=fixture();
  for(const change of [{kind:'transfer'},{network:'Public Global Stellar Network ; September 2015'},
    {origin:'https://evil.example'},{rpId:'evil.example'},{challenge:'old'},{ruleIds:[1]},
    {requiredSigners:[...req.requiredSigners].reverse()},{intent:{...req.intent,targetFunction:'rp_id_hash'}},
    {preparedAtLedger:999},{expirationLedger:1061}])
    assert.throws(()=>validateProbeRequest(c,{...req,...change} as ProbeRequest,0,1001));
  assert.throws(()=>validateProbeRequest(c,req,1,1001));
  assert.throws(()=>validateProbeRequest(c,req,0,1055),/expiration/);
  assert.throws(()=>validateProbeRequest(c,req,0,999),/expiration/);
  const entry=xdr.SorobanAuthorizationEntry.fromXDR(req.entryXdr,'base64');
  const changed=new xdr.SorobanAuthorizationEntry({...entry,credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({...credentials(entry),nonce:99n}))});
  assert.throws(()=>validateProbeRequest(c,{...req,entryXdr:changed.toXDR('base64')},0,1001),/challenge/);
  assert.throws(()=>probeOperation({...c,pair:['ceo','treasury_manager']}),/CEO/);
  assert.throws(()=>probeOperation({...c,maxFeeStroops:'10000001'}),/1 XLM/);
  assert.throws(()=>probeOperation({...c,origin:'https://localhost:8444'}),/binding/);
  assert.throws(()=>probeOperation({...c,signers:{...c.signers,cfo:{...c.signers.cfo,credentialId:c.signers.ceo.credentialId}}}),/distinct/);
});
