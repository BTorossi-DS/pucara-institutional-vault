import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('authorization browser starts no ceremony on page load or review; only explicit officer click calls WebAuthn',async()=>{
  type Element={disabled:boolean;checked:boolean;textContent:string;dataset:{role?:string};listeners:Record<string,()=>Promise<void>|void>;addEventListener:(name:string,fn:()=>Promise<void>|void)=>void};
  const element=(role?:string):Element=>({disabled:true,checked:false,textContent:'',dataset:{role},listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn;}});
  const elements=Object.fromEntries(['review','confirm','simulate','proposal','reviewed','status','report'].map(id=>[id,element()]));
  const buttons=[element('ceo'),element('cfo')];let ceremonies=0,posts=0;
  const config={mode:'authorization',origin:'https://localhost:8443',rpId:'localhost',proposalId:'locked',csrf:'token',
    challenge:'YWJj',intent:{operation:'execute'},network:'Testnet',ruleIds:[0],expirationLedger:1120,captured:[],completed:false};
  runInNewContext(readFileSync('scripts/enrollment/authorization-client.js','utf8'),{
    document:{getElementById:(id:string)=>elements[id],querySelectorAll:()=>buttons},
    window:{isSecureContext:true},location:{origin:config.origin},
    navigator:{credentials:{get:async()=>{ceremonies++;throw Error('Synthetic browser cancellation');}}},
    fetch:async(path:string)=>{if(path!=='/config')posts++;return {ok:true,json:async()=>path==='/authorization/options'?
      {proposalId:'locked',challenge:'YWJj',rpId:'localhost',credentialId:'Y2Vv',publicKey:'public'}:{...config,review:{intent:config.intent}}};},
    atob:(s:string)=>Buffer.from(s,'base64').toString('binary'),btoa:(s:string)=>Buffer.from(s,'binary').toString('base64'),
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ceremonies,0);assert.equal(posts,0);assert.equal(buttons[0].disabled,true);
  await elements.review.listeners.click();assert.equal(ceremonies,0);assert.equal(posts,1);
  elements.confirm.checked=true;await elements.confirm.listeners.change();assert.equal(buttons[0].disabled,false);
  await buttons[0].listeners.click();assert.equal(ceremonies,1);assert.match(elements.status.textContent,/Synthetic browser cancellation/);
  assert.equal(elements.confirm.checked,false);
});

test('transfer browser checks returned credential IDs, captures two approvals and never finalizes or submits',async()=>{
  const element=(role?:string)=>({disabled:true,hidden:false,checked:false,textContent:'',dataset:{role},
    listeners:{} as Record<string,()=>Promise<void>|void>,addEventListener(name:string,fn:()=>Promise<void>|void){this.listeners[name]=fn;}});
  const elements=Object.fromEntries(['review','confirm','simulate','proposal','reviewed','status','report'].map(id=>[id,element()]));
  const buttons=[element('ceo'),element('cfo')],captured:string[]=[],paths:string[]=[];
  const config={mode:'authorization',purpose:'transfer',origin:'https://localhost:8443',rpId:'localhost',proposalId:'locked',csrf:'token',
    challenge:'YWJj',intent:{amount:'10000000'},network:'Testnet',ruleIds:[0],expirationLedger:1120,captured:[],completed:false};
  let ceremonies=0,wrongId=true,currentRole='ceo';
  runInNewContext(readFileSync('scripts/enrollment/authorization-client.js','utf8'),{
    document:{getElementById:(id:string)=>elements[id],querySelectorAll:()=>buttons},window:{isSecureContext:true},location:{origin:config.origin},
    navigator:{credentials:{get:async()=>{
      ceremonies++;return {type:'public-key',rawId:Buffer.from(wrongId?'wrong':currentRole),
        response:{clientDataJSON:Buffer.from('{}'),authenticatorData:Buffer.alloc(37),signature:Buffer.alloc(8)}};
    }}},
    fetch:async(path:string,options?:{body:string})=>{
      paths.push(path);const input=options?JSON.parse(options.body):{};
      const state={...config,captured:[...captured],completed:captured.length===2};
      let body:unknown=state;
      if(path==='/authorization/options'){
        currentRole=input.role;body={proposalId:'locked',role:input.role,challenge:'YWJj',rpId:'localhost',
          credentialId:Buffer.from(input.role).toString('base64url'),publicKey:'synthetic'};
      }else if(path==='/authorization/assertion'){
        captured.push(input.assertion.role);body={...state,captured:[...captured],completed:captured.length===2};
      }
      return {ok:true,json:async()=>body};
    },
    atob:(s:string)=>Buffer.from(s,'base64').toString('binary'),btoa:(s:string)=>Buffer.from(s,'binary').toString('base64'),
  });
  await new Promise(resolve=>setImmediate(resolve));assert.equal(ceremonies,0);
  assert.equal(elements.simulate.hidden,true);assert.equal(elements.simulate.disabled,true);
  await elements.review.listeners.click();assert.equal(ceremonies,0);
  elements.confirm.checked=true;await buttons[0].listeners.click();assert.equal(ceremonies,1);
  assert.match(elements.status.textContent,/Wrong credential returned/);assert.equal(captured.length,0);
  wrongId=false;
  for(const button of buttons){elements.confirm.checked=true;await button.listeners.click();}
  assert.deepEqual(captured,['ceo','cfo']);assert.equal(elements.status.textContent,'CEO and CFO approvals validated.');
  elements.confirm.checked=true;await buttons[0].listeners.click();assert.equal(ceremonies,3);
  await elements.simulate.listeners.click();
  assert.equal(paths.some(path=>/simulate|finalize|submit/.test(path)),false);
});
