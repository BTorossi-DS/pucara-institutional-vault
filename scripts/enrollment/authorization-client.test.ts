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
