import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {serveBrandAsset} from './assets.ts';

test('brand assets serve only fixed GET paths with correct MIME and nosniff',()=>{
  for(const [url,type,marker] of [
    ['/assets/pucara.css','text/css; charset=utf-8','--accent:#91432D'],
    ['/assets/logo.svg','image/svg+xml','PUCARÁ'],
    ['/assets/mark.svg','image/svg+xml','<path'],
  ]){
    let headers:Record<string,string>={},body='';
    const res={writeHead(code:number,h:Record<string,string>){assert.equal(code,200);headers=h;},end(data:Buffer){body=data.toString('utf8');}};
    assert.equal(serveBrandAsset({method:'GET',url} as IncomingMessage,res as unknown as ServerResponse),true);
    assert.equal(headers['Content-Type'],type);assert.equal(headers['X-Content-Type-Options'],'nosniff');
    assert.ok(body.includes(marker));
  }
});
test('static asset handler cannot expose arbitrary paths or accept mutation requests',()=>{
  const res={writeHead(){assert.fail('Unexpected response');},end(){assert.fail('Unexpected body');}};
  for(const url of ['/assets/../server.ts','/assets/%2e%2e/server.ts','/assets/logo PUCARA 01.svg','/config','/assets/toString','/assets/__proto__']){
    assert.equal(serveBrandAsset({method:'GET',url} as IncomingMessage,res as unknown as ServerResponse),false);
  }
  assert.equal(serveBrandAsset({method:'POST',url:'/assets/logo.svg'} as IncomingMessage,res as unknown as ServerResponse),false);
});
