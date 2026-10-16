import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import type {RequestListener} from 'node:http';
import {once} from 'node:events';
import {xdr} from '@stellar/stellar-sdk';
import {authorizationHandler} from './authorization.ts';
import {ProbeSession,probeReport} from '../testnet/probe-authorization.ts';
import {probeFixture} from '../testnet/fixtures/probe.ts';
import {TransferSession,validateTransferRequest} from '../testnet/transfer-authorization.ts';
import {reviewTransfer} from '../testnet/cli.ts';
import {transferFixture} from '../testnet/fixtures/transfer.ts';
import {credentials} from '../testnet/auth.ts';
import {validateProbeRequest} from '../testnet/auth-probe.ts';

test('authorization HTTP mode gates capture behind review, origin, CSRF and immutable proposal; never submits',async()=>{
  const {c,req,assertion}=probeFixture(360);let ledger=1121,reviews=0,captured=0,simulations=0,reports=0;
  const session=new ProbeSession(c,req,async()=>{reviews++;return {ledger,summary:{intent:req.intent,requiredSigners:['ceo','cfo']}};});
  const server=createServer(authorizationHandler(session,req,()=>captured++,async(r,a)=>{
    simulations++;assert.equal(a.length,2);return probeReport(r,'PASS',null,'1100');
  },()=>reports++));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const addr=server.address();if(!addr||typeof addr==='string')throw Error('address');
  const base=`http://127.0.0.1:${addr.port}`;
  try {
    const send=(path:string,method:string,headers:Record<string,string>,body='')=>new Promise<{status:number;text:()=>Promise<string>;json:()=>Promise<any>}>((resolve,reject)=>{
      const outgoing=httpRequest(base+path,{method,headers},response=>{
        let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode!,text:async()=>text,json:async()=>JSON.parse(text)}));
      });outgoing.on('error',reject);outgoing.end(body);
    });
    const get=async(path:string,host='localhost:8443')=>send(path,'GET',{host});
    assert.equal((await get('/','evil.example')).status,403);
    const html=await(await get('/')).text();assert.match(html,/Simular ambas aprobaciones/);
    assert.equal((await get('/assets/pucara.css')).status,200);
    assert.equal((await get('/assets/logo.svg')).status,200);
    assert.equal((await get('/assets/logo.svg','evil.example')).status,403);
    const js=await(await get('/client.js')).text();assert.match(js,/navigator.credentials.get/);
    const config=await(await get('/config')).json();assert.equal(config.mode,'authorization');
    assert.equal(captured,0);assert.equal(reviews,0);assert.equal(simulations,0);
    const post=async(path:string,data:unknown={},origin=c.origin,csrf=config.csrf,proposalId=config.proposalId)=>{
      const res=await send(path,'POST',{host:'localhost:8443',origin,'Content-Type':'application/json'},
        JSON.stringify({...(data as object),csrf,proposalId}));return {status:res.status,body:await res.json()};
    };
    assert.equal((await post('/authorization/options',{role:'ceo'})).status,400);
    assert.equal((await post('/authorization/review',{},'https://evil.example')).status,403);
    assert.equal((await post('/authorization/review',{},c.origin,'wrong')).status,403);
    assert.equal((await post('/authorization/review',{},c.origin,config.csrf,'different')).status,403);
    assert.equal((await post('/authorization/review')).status,200);
    assert.equal((await post('/authorization/simulate')).status,400);
    assert.equal((await post('/challenge',{role:'ceo'})).status,404); // No enrollment in authorization mode.
    assert.equal((await post('/submit')).status,404);
    assert.equal((await post('/authorization/options',{role:'treasury_manager'})).status,400);
    for(const role of ['ceo','cfo'] as const) {
      const options=await post('/authorization/options',{role});assert.equal(options.status,200);
      assert.equal(options.body.challenge,req.challenge);assert.equal(options.body.credentialId,c.signers[role].credentialId);
      const wrong=assertion(role);wrong.credentialId='d3Jvbmc';
      assert.equal((await post('/authorization/assertion',{assertion:wrong})).status,400);
      assert.equal((await post('/authorization/options',{role})).status,200);
      assert.equal((await post('/authorization/assertion',{assertion:assertion(role)})).status,200);
      assert.equal((await post('/authorization/assertion',{assertion:assertion(role)})).status,400);
    }
    assert.equal(captured,2);
    const result=await post('/authorization/simulate');assert.equal(result.status,200);assert.equal(result.body.report.simulation,'PASS');
    assert.equal(simulations,1);assert.equal(reports,1);
    assert.equal((await post('/authorization/simulate')).status,400);
    ledger=req.expirationLedger-5;assert.equal((await post('/authorization/review')).status,400);
  } finally {server.closeAllConnections();server.close();await once(server,'close');}
});

async function readAuthorizationConfig(handler:RequestListener) {
  const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
  const addr=server.address();if(!addr||typeof addr==='string')throw Error('address');
  try {
    return await new Promise<{status:number;body:any}>((resolve,reject)=>{
      const outgoing=httpRequest(`http://127.0.0.1:${addr.port}/config`,{headers:{host:'localhost:8443'}},response=>{
        let raw='';response.on('data',chunk=>raw+=chunk);response.on('end',()=>resolve({status:response.statusCode!,body:JSON.parse(raw)}));
      });outgoing.on('error',reject);outgoing.end();
    });
  }finally{server.closeAllConnections();server.close();await once(server,'close');}
}

for(const optionalMetadata of [true,false])test(`transfer config displays signed expiration with ${optionalMetadata?'matching':'missing'} optional top-level metadata`,async()=>{
  const {c,req}=transferFixture();
  const signedExpiry=credentials(xdr.SorobanAuthorizationEntry.fromXDR(req.entryXdr,'base64')).signatureExpirationLedger;
  if(optionalMetadata)Object.assign(req,{expirationLedger:signedExpiry});
  validateTransferRequest(c,req,0,1001);
  const original=JSON.stringify(req);
  const session=new TransferSession(c,req,async()=>({ledger:1001,summary:{}}));
  const config=await readAuthorizationConfig(authorizationHandler(session,req,()=>{}));
  assert.equal(config.status,200);assert.equal(config.body.purpose,'transfer');
  assert.equal(config.body.expirationLedger,signedExpiry);
  assert.equal(config.body.expirationLedger,config.body.intent.expirationLedger);
  assert.equal(JSON.stringify(req),original);
});

test('transfer rejects conflicting expiration metadata in validation and before serving configuration',()=>{
  const {c,req}=transferFixture();
  for(const expirationLedger of [2120,1119,'1120',null]) {
    const conflicting={...req,expirationLedger};
    assert.throws(()=>validateTransferRequest(c,conflicting,0,1001),/Conflicting transfer expiration metadata/);
    const session=new TransferSession(c,conflicting,async()=>({ledger:1001,summary:{}}));
    assert.throws(()=>authorizationHandler(session,conflicting,()=>{}),/Conflicting transfer expiration metadata/);
  }
  const misleading={...req,intent:{...req.intent,expirationLedger:2120},expirationLedger:2120};
  assert.throws(()=>validateTransferRequest(c,misleading,0,1001),/Misleading intent summary/);
  assert.throws(()=>authorizationHandler(new TransferSession(c,misleading,async()=>({ledger:1001,summary:{}})),misleading,()=>{}),
    /Conflicting transfer expiration metadata/);
});

test('probe config preserves the validated top-level probe expiration',async()=>{
  const {c,req}=probeFixture(360);validateProbeRequest(c,req,0,1001);
  const signedExpiry=credentials(xdr.SorobanAuthorizationEntry.fromXDR(req.entryXdr,'base64')).signatureExpirationLedger;
  const session=new ProbeSession(c,req,async()=>({ledger:1001,summary:{}}));
  const config=await readAuthorizationConfig(authorizationHandler(session,req,()=>{}));
  assert.equal(config.status,200);assert.equal(config.body.purpose,'probe');
  assert.equal(config.body.expirationLedger,1360);
  assert.equal(config.body.expirationLedger,req.expirationLedger);
  assert.equal(config.body.expirationLedger,signedExpiry);
});

test('transfer HTTP capture preserves Host/origin/JSON/CSRF gates, immutable intent and has no finalize/simulate/submit route',async()=>{
  const {c,req,assertion}=transferFixture(),approvals={ceo:assertion('ceo'),cfo:assertion('cfo')};
  let captured=0;
  const session=new TransferSession(c,req,(config,proposal)=>reviewTransfer(config,proposal,{
    network:async()=>{},quorumRule:async()=>0,latestLedger:async()=>({sequence:1001}),nonceEntries:async()=>({entries:[]}),
  }));
  const server=createServer(authorizationHandler(session,req,()=>captured++));
  req.challenge='caller mutation';req.intent.amount='999';
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const addr=server.address();if(!addr||typeof addr==='string')throw Error('address');
  const send=(path:string,method:string,headers:Record<string,string>,body='')=>new Promise<{status:number;body:any}>((resolve,reject)=>{
    const outgoing=httpRequest(`http://127.0.0.1:${addr.port}${path}`,{method,headers},response=>{
      let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode!,body:JSON.parse(text)}));
    });outgoing.on('error',reject);outgoing.end(body);
  });
  try {
    const config=(await send('/config','GET',{host:'localhost:8443'})).body;
    assert.equal(config.purpose,'transfer');assert.equal(config.intent.amount,'10000000');assert.notEqual(config.challenge,req.challenge);
    const post=(path:string,data:object={},headers:Record<string,string>={})=>send(path,'POST',{
      host:'localhost:8443',origin:c.origin,'content-type':'application/json',...headers,
    },JSON.stringify({csrf:config.csrf,proposalId:config.proposalId,...data}));
    assert.equal((await post('/authorization/options',{role:'ceo'})).status,400);
    const badHeaders:Record<string,string>[]=[{host:'evil.example'},{origin:'https://evil.example'},{'content-type':'text/plain'}];
    for(const headers of badHeaders)
      assert.equal((await post('/authorization/review',{},headers)).status,403);
    assert.equal((await post('/authorization/review',{csrf:'wrong'})).status,403);
    assert.equal((await post('/authorization/review',{proposalId:'wrong'})).status,403);
    assert.equal((await send('/authorization/review','POST',{host:'localhost:8443',origin:c.origin,'content-type':'application/json'},'{malformed')).status,400);
    assert.equal((await post('/authorization/review')).status,200);assert.equal(captured,0);
    for(const role of ['ceo','cfo'] as const) {
      assert.equal((await post('/authorization/options',{role})).status,200);
      const bad=await post('/authorization/assertion',{assertion:{...approvals[role],credentialId:'wrong'}});
      assert.equal(bad.status,400);assert.match(bad.body.error,/Transfer authorization failed/);
      assert.equal(JSON.stringify(bad.body).includes(approvals[role].signatureDER),false);
      assert.equal((await post('/authorization/options',{role})).status,200);
      assert.equal((await post('/authorization/assertion',{assertion:approvals[role]})).status,200);
      assert.equal((await post('/authorization/assertion',{assertion:approvals[role]})).status,400);
    }
    assert.equal(captured,2);
    const status=(await send('/config','GET',{host:'localhost:8443'})).body;
    assert.equal(status.completed,true);assert.equal(status.approvalStatus,'CEO and CFO approvals validated.');
    for(const path of ['/authorization/simulate','/authorization/finalize','/submit','/challenge'])assert.equal((await post(path)).status,404);
  }finally{server.closeAllConnections();server.close();await once(server,'close');}
});
