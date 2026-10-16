import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Address,SorobanDataBuilder,Transaction,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {reviewTransfer,finalizeTransfer,saveTransferArtifact,loadTransferArtifact} from './cli.ts';
import type {TransferReviewServices,TransferFinalizationServices,Request} from './cli.ts';
import {TransferSession,authorizedTransferOperation,validateTransferAssertion,validateTransferRequest} from './transfer-authorization.ts';
import {validateProbeRequest} from './auth-probe.ts';
import type {ProbeRequest} from './auth-probe.ts';
import {NETWORK,challenge,credentials,withCredentials} from './auth.ts';
import {transferFixture} from './fixtures/transfer.ts';
import {probeFixture} from './fixtures/probe.ts';

function reviewServices():TransferReviewServices {
  return {network:async()=>{},quorumRule:async()=>0,latestLedger:async()=>({sequence:1001}),nonceEntries:async()=>({entries:[]})};
}
test('transfer authorization requires valid, distinct CEO+CFO registered assertions and strict WebAuthn bindings',()=>{
  const {c,req,assertion}=transferFixture(),ceo=assertion('ceo'),cfo=assertion('cfo');
  const op=authorizedTransferOperation(c,req,[ceo,cfo],1001);
  if(op.body.type!=='invokeHostFunction')throw Error('invoke');
  const entries=op.body.invokeHostFunctionOp.auth;
  assert.equal(entries.length,1);assert.equal(credentials(entries[0]).signature.type,'scvMap');
  assert.equal(challenge(entries[0],[0]).toString('base64url'),req.challenge);
  for(const a of [[],[ceo],[ceo,ceo],[ceo,cfo,ceo]])assert.throws(()=>authorizedTransferOperation(c,req,a,1001),/exactly once/);
  for(const a of [
    {...ceo,credentialId:cfo.credentialId},{...ceo,publicKey:cfo.publicKey},{...ceo,role:'cfo' as const},
    {...ceo,clientDataJSON:'!bad'},{...ceo,authenticatorData:'!bad'},{...ceo,signatureDER:'gg'},
    assertion('ceo',{origin:'https://evil.example'}),assertion('ceo',{crossOrigin:true}),assertion('ceo',{crossOrigin:'false'}),
    assertion('ceo',{challenge:'another'}),assertion('ceo',{},1),assertion('ceo',{},4),assertion('ceo',{},5,'evil.example'),
  ])assert.throws(()=>validateTransferAssertion(c,req,a));
  const client=JSON.parse(Buffer.from(ceo.clientDataJSON,'base64').toString('utf8'));
  const forged={...ceo,clientDataJSON:Buffer.from(JSON.stringify({...client,extra:'unsigned change'})).toString('base64')};
  assert.throws(()=>validateTransferAssertion(c,req,forged),/signature/);
});

test('transfer request rejects changed intent, nonce, expiration, signed entries and cross-purpose requests',()=>{
  const {c,req}=transferFixture();validateTransferRequest(c,req,0,1001);
  for(const field of ['account','token','recipient','amount'] as const) {
    assert.throws(()=>validateTransferRequest({...c,[field]:field==='amount'?'20000000':c.verifier},req,0,1001));
    assert.throws(()=>validateTransferRequest(c,{...req,intent:{...req.intent,[field]:'changed'}},0,1001));
  }
  for(const changed of [{...req,network:'Mainnet'},{...req,ruleIds:[1]},{...req,challenge:'changed'}])
    assert.throws(()=>validateTransferRequest(c,changed,0,1001));
  assert.throws(()=>validateTransferRequest(c,req,1,1001));
  for(const ledger of [1115,1120,1121])assert.throws(()=>validateTransferRequest(c,req,0,ledger),/expired/);
  assert.throws(()=>validateTransferRequest({...c,expirationLedgers:360},req,0,1001),/120/);
  const entry=xdr.SorobanAuthorizationEntry.fromXDR(req.entryXdr,'base64');
  const changedNonce=new xdr.SorobanAuthorizationEntry({rootInvocation:entry.rootInvocation,
    credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({...credentials(entry),nonce:43n}))});
  assert.throws(()=>validateTransferRequest(c,{...req,entryXdr:changedNonce.toXDR('base64')},0,1001),/differs/);
  const changedExpiry=withCredentials(entry,{signatureExpirationLedger:1121});
  assert.throws(()=>validateTransferRequest(c,{...req,entryXdr:changedExpiry.toXDR('base64')},0,1001),/differs/);
  const signed=withCredentials(entry,{signature:xdr.ScVal.scvVec([])});
  assert.throws(()=>validateTransferRequest(c,{...req,entryXdr:signed.toXDR('base64')},0,1001),/Pre-signed/);
  assert.throws(()=>validateTransferRequest(c,probeFixture().req as unknown as Request,0,1001),/Probe requests/);
  assert.throws(()=>validateProbeRequest(c,req as unknown as ProbeRequest,0,1001),/Probe differs/);
});

test('live transfer review checks network, deployed quorum, current expiration and the exact unused nonce',async()=>{
  const {c,req}=transferFixture(),services=reviewServices();let networkChecks=0,quorumChecks=0,nonceChecks=0;
  services.network=async()=>{networkChecks++;};services.quorumRule=async()=>{quorumChecks++;return 0;};
  services.nonceEntries=async key=>{
    nonceChecks++;assert.equal(key.type,'contractData');
    if(key.type!=='contractData')throw Error('data');
    assert.equal(Address.fromScAddress(key.contractData.contract).toString(),c.account);
    if(key.contractData.key.type!=='scvLedgerKeyNonce')throw Error('nonce key');
    assert.equal(key.contractData.key.nonceKey.nonce,42n);return {entries:[]};
  };
  const reviewed=await reviewTransfer(c,req,services);
  assert.equal(reviewed.summary.remainingLedgers,119);assert.equal(reviewed.summary.nonce,'42');
  assert.equal(networkChecks,1);assert.equal(quorumChecks,1);assert.equal(nonceChecks,1);
  await assert.rejects(reviewTransfer(c,req,{...services,nonceEntries:async()=>({entries:[{}]})}),/consumed/);
  await assert.rejects(reviewTransfer(c,req,{...services,quorumRule:async()=>1}));
  await assert.rejects(reviewTransfer(c,req,{...services,network:async()=>{throw Error('Wrong network');}}),/Wrong network/);
  await assert.rejects(reviewTransfer(c,req,{...services,latestLedger:async()=>({sequence:1115})}),/expired/);
});

test('transfer session captures one immutable proposal without finalization or submission',async()=>{
  const {c,req,assertion}=transferFixture(),ceo=assertion('ceo'),cfo=assertion('cfo');
  const originalChallenge=req.challenge;let saved=0,checks=0;
  const session=new TransferSession(c,req,async(config,proposal)=>{
    checks++;assert.equal(config.amount,'10000000');assert.equal(proposal.challenge,originalChallenge);
    return reviewTransfer(config,proposal,reviewServices());
  });
  await assert.rejects(session.options('ceo'),/Review/);
  await session.review();await session.options('ceo');
  await assert.rejects(session.options('ceo'),/pending/);
  req.challenge='caller mutation';c.amount='999';
  await session.capture(ceo,a=>{saved++;a.publicKey='callback mutation';});
  await assert.rejects(session.capture(ceo,()=>saved++));
  assert.equal((await session.options('cfo')).challenge,originalChallenge);
  await session.capture(cfo,()=>saved++);
  assert.equal(saved,2);assert.equal(checks,7);
  assert.equal(session.status().completed,true);
  assert.equal(session.status().approvalStatus,'CEO and CFO approvals validated.');
  assert.equal('simulate' in session,false);assert.equal('submit' in session,false);assert.equal('finalize' in session,false);
  await assert.rejects(session.options('ceo'));await assert.rejects(session.review());
});

test('capture rechecks expiration and nonce after signature processing before persisting',async()=>{
  for(const failure of ['expiration','nonce']) {
    const {c,req,assertion}=transferFixture();let checks=0,saved=0;
    const session=new TransferSession(c,req,async(config,proposal)=>{
      checks++;const services=reviewServices();
      if(checks>=4){
        if(failure==='expiration')services.latestLedger=async()=>({sequence:1115});
        else services.nonceEntries=async()=>({entries:[{}]});
      }
      return reviewTransfer(config,proposal,services);
    });
    await session.review();await session.options('ceo');
    await assert.rejects(session.capture(assertion('ceo'),()=>saved++),/expired|consumed/);
    assert.equal(saved,0);assert.deepEqual(session.status().captured,[]);
  }
});

test('transfer finalization uses shared verification, fresh unsigned transport and mandatory enforce; never submits',async()=>{
  const {c,req,assertion,transaction}=transferFixture(),a=[assertion('ceo'),assertion('cfo')];
  let reviews=0,builds=0,simulations=0;
  const services:TransferFinalizationServices={
    review:async(config,proposal)=>{reviews++;return reviewTransfer(config,proposal,reviewServices());},
    transaction:async(config,op)=>{builds++;assert.equal(config.feePayer,c.feePayer);return transaction(op);},
    simulate:async(tx,_resources,mode,upgraded)=>{
      simulations++;assert.equal(mode,'enforce');assert.equal(upgraded,false);assert.equal(tx.signatures.length,0);
      return {id:'synthetic',latestLedger:1001,events:[],_parsed:true,minResourceFee:'1000',
        transactionData:new SorobanDataBuilder().setResourceFee('1000'),result:{auth:[],retval:xdr.ScVal.scvVoid()}};
    },
  };
  const artifact=await finalizeTransfer(c,req,a,services);
  assert.equal(reviews,3);assert.equal(builds,1);assert.equal(simulations,1);assert.equal(artifact.feeStroops,'1100');
  const envelope=TransactionBuilder.fromXDR(artifact.envelopeXdr,NETWORK);
  if(!(envelope instanceof Transaction))throw Error('v1');
  assert.equal(envelope.signatures.length,0);assert.equal(envelope.source,c.feePayer);
  const x=xdr.TransactionEnvelope.fromXDR(artifact.envelopeXdr,'base64');
  if(x.type!=='envelopeTypeTx')throw Error('v1');
  const body=x.v1.tx.operations[0].body;if(body.type!=='invokeHostFunction')throw Error('invoke');
  assert.equal(challenge(body.invokeHostFunctionOp.auth[0],[0]).toString('base64url'),req.challenge);
  const before=builds;
  await assert.rejects(finalizeTransfer(c,req,[a[0],a[0]],services),/exactly once/);assert.equal(builds,before);
  await assert.rejects(finalizeTransfer(c,req,[{...a[0],credentialId:'wrong'},a[1]],services),/mismatch/);assert.equal(builds,before);
  await assert.rejects(finalizeTransfer(c,req,a,{...services,review:(config,proposal)=>reviewTransfer(config,proposal,
    {...reviewServices(),nonceEntries:async()=>({entries:[{}]})})}),/consumed/);assert.equal(builds,before);
  await assert.rejects(finalizeTransfer(c,req,a,{...services,simulate:async()=>({id:'fail',latestLedger:1001,events:[],_parsed:true,error:'private assertion diagnostics'})}),
    {message:'Transfer enforce simulation failed'});
  await assert.rejects(finalizeTransfer(c,req,a,{...services,simulate:async()=>({id:'fee',latestLedger:1001,events:[],_parsed:true,minResourceFee:'10000000',
    transactionData:new SorobanDataBuilder().setResourceFee('10000000'),result:{auth:[],retval:xdr.ScVal.scvVoid()}})}),/Fee cap exceeded/);
  let lateReviews=0;
  await assert.rejects(finalizeTransfer(c,req,a,{...services,review:(config,proposal)=>reviewTransfer(config,proposal,
    {...reviewServices(),latestLedger:async()=>({sequence:++lateReviews===3?1115:1001})})}),/expired/);
});

test('transfer artifact output is private, tmp-only and cannot overwrite or escape through a parent symlink',()=>{
  mkdirSync('tmp',{recursive:true});const dir=mkdtempSync(resolve('tmp/transfer-output-'));
  const file=resolve(dir,'synthetic.json');saveTransferArtifact(file,{synthetic:true});
  assert.equal(statSync(dir).mode & 0o777,0o700);assert.equal(statSync(file).mode & 0o777,0o600);
  assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),{synthetic:true});
  assert.deepEqual(loadTransferArtifact(file),{synthetic:true});
  const publicFile=resolve(dir,'public.json');writeFileSync(publicFile,'{}',{mode:0o644});
  assert.throws(()=>loadTransferArtifact(publicFile),/private files/);
  assert.throws(()=>saveTransferArtifact(file,{}),/EEXIST/);
  assert.throws(()=>saveTransferArtifact('tmp/unprotected.json',{}),/private directory/);
  symlinkSync(resolve('scripts'),resolve(dir,'escape'));
  assert.throws(()=>saveTransferArtifact(resolve(dir,'escape','must-not-exist.json'),{}),/private directory/);
  symlinkSync(resolve('package.json'),resolve(dir,'escaped-file.json'));
  assert.throws(()=>loadTransferArtifact(resolve(dir,'escaped-file.json')),/private directory/);
});
