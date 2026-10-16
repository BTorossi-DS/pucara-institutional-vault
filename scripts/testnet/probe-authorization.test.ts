import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SorobanDataBuilder,scValToNative,xdr} from '@stellar/stellar-sdk';
import type {rpc} from '@stellar/stellar-sdk';
import {simulateProbe} from './cli.ts';
import type {ProbeSimulationServices} from './cli.ts';
import {credentials} from './auth.ts';
import {ProbeSession,authorizedProbeOperation,validateProbeAssertion,proposalId,probeReport} from './probe-authorization.ts';
import {probeFixture} from './fixtures/probe.ts';

test('probe assertions validate P-256 and reject credential/key/binding/UP/UV/encoding/signature mismatches',()=>{
  const {c,req,assertion}=probeFixture(),a=assertion('ceo');
  assert.equal(validateProbeAssertion(c,req,a).signature.length,128);
  for(const change of [{credentialId:c.signers.cfo.credentialId},{publicKey:c.signers.cfo.publicKey},{role:'cfo' as const},
    {signatureDER:'00010203'},{signatureDER:'gg'},{authenticatorData:'!bad'},{clientDataJSON:'e30='}])
    assert.throws(()=>validateProbeAssertion(c,req,{...a,...change}));
  for(const change of [{challenge:'different'},{type:'webauthn.create'},{origin:'http://localhost:8443'},
    {crossOrigin:true},{crossOrigin:'false'},{topOrigin:c.origin}])
    assert.throws(()=>validateProbeAssertion(c,req,assertion('ceo',change)));
  for(const flags of [0,1,4])assert.throws(()=>validateProbeAssertion(c,req,assertion('ceo',{},flags)),/UP\/UV/);
  assert.throws(()=>validateProbeAssertion(c,req,assertion('ceo',{},5,'evil.example')),/RP/);
  const sig=Buffer.from(a.signatureDER,'hex');sig[sig.length-1]^=1;
  assert.throws(()=>validateProbeAssertion(c,req,{...a,signatureDER:sig.toString('hex')}));
  assert.throws(()=>validateProbeAssertion(c,{...req,challenge:'other'},a),/challenge/);
});
test('two distinct assertions serialize into the reviewed operation; invalid quorum and expired/altered proposals fail',()=>{
  const {c,req,assertion}=probeFixture(),ceo=assertion('ceo'),cfo=assertion('cfo');
  const b=authorizedProbeOperation(c,req,[ceo,cfo],1001).body;
  if(b.type!=='invokeHostFunction')throw Error('invoke');
  assert.equal(b.invokeHostFunctionOp.auth.length,1);
  const payload=scValToNative(credentials(b.invokeHostFunctionOp.auth[0]).signature);
  assert.deepEqual(payload.context_rule_ids,[0]);
  const signature=credentials(b.invokeHostFunctionOp.auth[0]).signature;
  if(signature.type!=='scvMap')throw Error('map');
  const signers=signature.map!.find(e=>e.key.type==='scvSymbol'&&e.key.sym.toString()==='signers')!.val;
  if(signers.type!=='scvMap')throw Error('signers map');
  assert.equal(signers.map!.length,2);
  assert.throws(()=>authorizedProbeOperation(c,req,[ceo,ceo],1001),/exactly once/);
  assert.throws(()=>authorizedProbeOperation(c,req,[ceo],1001),/exactly once/);
  assert.throws(()=>authorizedProbeOperation(c,req,[ceo,cfo],1115),/expiration/);
  assert.throws(()=>authorizedProbeOperation(c,{...req,challenge:'other'},[ceo,cfo],1001));
});
test('immutable session requires review, rejects replay/replacement and rechecks expiration before capture/simulation',async()=>{
  const {c,req,assertion}=probeFixture();let ledger=1001,checks=0,persisted=0,runs=0;
  const originalChallenge=req.challenge;
  const session=new ProbeSession(c,req,async()=>{checks++;return {ledger,summary:{accepted:true}};});
  const id=session.id;req.challenge='caller mutation'; // The session owns a deep copy.
  await assert.rejects(session.options('ceo'),/Review/);
  await session.review();await session.options('ceo');
  await assert.rejects(session.options('ceo'),/pending/);
  req.challenge=originalChallenge;
  await session.capture(assertion('ceo'),()=>persisted++);
  await assert.rejects(session.capture(assertion('ceo'),()=>persisted++),/pending/);
  await assert.rejects(session.simulate(async r=>{runs++;return probeReport(r,'PASS',null);}),/Two/);
  await session.options('cfo');ledger=1115;
  await assert.rejects(session.capture(assertion('cfo'),()=>persisted++),/expiration/);
  assert.equal(persisted,1);assert.equal(runs,0);assert.equal(session.id,id);
  assert.notEqual(proposalId({...req,challenge:'other'}),id);assert.ok(checks>=4);
});
test('complete session passes exactly two same-proposal assertions to simulation once',async()=>{
  const {c,req,assertion}=probeFixture();
  const session=new ProbeSession(c,req,async()=>({ledger:1001,summary:{accepted:true}}));
  await session.review();
  for(const role of ['ceo','cfo'] as const){await session.options(role);await session.capture(assertion(role),()=>{});}
  const report=await session.simulate(async(r,a)=>{assert.equal(proposalId(r),session.id);assert.deepEqual(a.map(a=>a.role),['ceo','cfo']);return probeReport(r,'PASS',null);});
  assert.equal(report.simulation,'PASS');assert.equal(session.status().completed,true);
  await assert.rejects(session.simulate(async r=>probeReport(r,'PASS',null)),/Two/);
});
test('enforce orchestration uses a fresh unsigned transaction, preserves both assertions and reports fees/errors',async()=>{
  const {c,req,assertion,transaction}=probeFixture();const a=[assertion('ceo'),assertion('cfo')];
  let calls=0;
  let result:rpc.Api.SimulateTransactionResponse={id:'test',latestLedger:1001,events:[],_parsed:true,
    minResourceFee:'1000',transactionData:new SorobanDataBuilder().setResourceFee('1000'),
    result:{auth:[],retval:xdr.ScVal.scvVoid()}};
  const services:ProbeSimulationServices={review:async()=>({ledger:1001,summary:{} as Awaited<ReturnType<ProbeSimulationServices['review']>>['summary']}),
    transaction:async(_c,op)=>transaction(op),simulate:async(tx,_resources,mode,upgraded)=>{
      calls++;assert.equal(mode,'enforce');assert.equal(upgraded,false);assert.equal(tx.signatures.length,0);
      const envelope=xdr.TransactionEnvelope.fromXDR(tx.toXDR(),'base64');
      if(envelope.type!=='envelopeTypeTx')throw Error('v1');
      const b=envelope.v1.tx.operations[0].body;
      if(b.type!=='invokeHostFunction')throw Error('invoke');
      assert.equal(b.invokeHostFunctionOp.auth.length,1);
      assert.equal(credentials(b.invokeHostFunctionOp.auth[0]).signature.type,'scvMap');
      return result;
    }};
  let report=await simulateProbe(c,req,a,services);assert.equal(report.simulation,'PASS');assert.equal(calls,1);
  result={id:'error',latestLedger:1001,events:[],_parsed:true,error:'HostError: Error(Contract, #3)\nprivate assertion diagnostics'};
  report=await simulateProbe(c,req,a,services);assert.equal(report.simulation,'FAIL');assert.equal(report.contractError,'HostError: Error(Contract, #3)');
  result={id:'fee',latestLedger:1001,events:[],_parsed:true,minResourceFee:'10000000',
    transactionData:new SorobanDataBuilder().setResourceFee('10000000'),result:{auth:[],retval:xdr.ScVal.scvVoid()}};
  report=await simulateProbe(c,req,a,services);assert.equal(report.simulation,'FAIL');assert.match(report.contractError!,/fee/);
  const before=calls;await assert.rejects(simulateProbe(c,req,[a[0],a[0]],services));assert.equal(calls,before);
});
