import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
const origin='http://localhost:18746';
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest();
test('enrollment verifies possession/binding, rejects CSRF, duplicates, replay and invalid assertions',async()=>{
  const child=spawn(process.execPath,['--experimental-strip-types','scripts/enrollment/server.ts'],{
    cwd:'/workspaces/stellar-wallet',env:{...process.env,WEBAUTHN_ORIGIN:origin,WEBAUTHN_RP_ID:'localhost'},stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Enrollment server exited');}),
      new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Server startup timeout')),10000);t.unref();})]);
    const post=async(path:string,data:unknown,from=origin)=>{
      const res=await fetch(origin+path,{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify(data)});
      return {status:res.status,body:await res.json()};
    };
    const get=async(path:string)=>fetch(origin+path,{});
    assert.equal((await get('/')).status,200);
    assert.equal((await post('/challenge',{role:'ceo'},'https://evil.example')).status,403);
    const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    const make=(pending:any, options:{origin?:string;rp?:string;flags?:number;badSignature?:boolean;credentialId?:string;key?:ReturnType<typeof generateKeyPairSync>}={})=>{
      const key=options.key ?? keys;
      const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:pending.get,origin:options.origin ?? origin,crossOrigin:false}));
      const ad=Buffer.concat([hash(options.rp ?? 'localhost'),Buffer.from([options.flags ?? 5,0,0,0,0])]);
      const signature=sign('sha256',Buffer.concat([ad,hash(client)]),key.privateKey);
      if(options.badSignature) signature[signature.length-1]^=1;
      return {id:pending.id,credentialId:options.credentialId ?? 'ZGV2LWNlbw',publicKeySPKI:key.publicKey.export({format:'der',type:'spki'}).toString('base64'),
        creationClientDataJSON:Buffer.from(JSON.stringify({type:'webauthn.create',challenge:pending.create,origin,crossOrigin:false})).toString('base64'),
        clientDataJSON:client.toString('base64'),authenticatorData:ad.toString('base64'),signatureDER:signature.toString('base64')};
    };
    for(const options of [{origin:'https://evil.example'},{rp:'evil.example'},{flags:1},{badSignature:true}]) {
      const c=await post('/challenge',{role:'ceo'});assert.equal(c.status,200);
      assert.equal((await post('/register',make(c.body,options))).status,400);
    }
    const c=await post('/challenge',{role:'ceo'});const registration=make(c.body);
    assert.equal((await post('/register',registration)).status,200);
    assert.equal((await post('/register',registration)).status,400);
    assert.equal((await post('/challenge',{role:'ceo'})).status,400);
    let cfo=await post('/challenge',{role:'cfo'});
    assert.equal((await post('/register',make(cfo.body,{credentialId:'ZGV2LWNmbw'}))).status,400); // Same key under a second role.
    for(const [role,id] of [['cfo','ZGV2LWNmbw'],['treasury_manager','ZGV2LXRyZWFzdXJ5']]) {
      const c=await post('/challenge',{role});
      const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
      assert.equal((await post('/register',make(c.body,{key,credentialId:id}))).status,200);
    }
    const config=await (await get('/config')).json();
    assert.equal(Object.keys(config.registrations).length,3);
    assert.equal(new Set(Object.values(config.registrations).map((r:any)=>r.publicKey)).size,3);
  } finally {child.kill('SIGTERM');await once(child,'exit');}
});
