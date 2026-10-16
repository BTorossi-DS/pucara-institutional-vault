import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {authorizationHandler} from './authorization.ts';
import {ProbeSession,probeReport} from '../testnet/probe-authorization.ts';
import {probeFixture} from '../testnet/fixtures/probe.ts';

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
    const html=await(await get('/')).text();assert.match(html,/Simulate both approvals/);
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
