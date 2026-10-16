import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { xdr } from '@stellar/stellar-sdk';
import { configuration, enforceFeeCap, transfer, validateRequest } from './cli.ts';
import type { Config, Request } from './cli.ts';
import { NETWORK, challenge, credentials } from './auth.ts';
const vector=readFileSync('scripts/testnet/sdk-auth-vector.txt','utf8').trim().split('\n');
const base: Config={feePayer:'',origin:'https://vault.example',rpId:'vault.example',
  signers:{ceo:{publicKey:vector[3],credentialId:'Y2Vv'},cfo:{publicKey:vector[4],credentialId:'Y2Zv'},treasury_manager:{publicKey:vector[5],credentialId:'dHJlYXN1cnk'}},
  account:vector[0],verifier:vector[1],token:vector[2],recipient:vector[1],amount:'7',pair:['ceo','cfo'],expirationLedgers:60,maxFeeStroops:'10000000'};
test('360-ledger configuration is probe-only; transfer preparation and finalization retain the 120-ledger cap',()=>{
  mkdirSync('tmp',{recursive:true});
  const dir=mkdtempSync(resolve('tmp/expiration-policy-'));
  const saved={origin:process.env.WEBAUTHN_ORIGIN,rp:process.env.WEBAUTHN_RP_ID,payer:process.env.STELLAR_FEE_PAYER};
  let index=0;
  const config=(expirationLedgers:unknown)=>{
    const file=resolve(dir,`${index++}.json`);
    writeFileSync(file,JSON.stringify({...base,feePayer:'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',expirationLedgers}),{flag:'wx'});
    return file;
  };
  try {
    delete process.env.WEBAUTHN_ORIGIN;delete process.env.WEBAUTHN_RP_ID;delete process.env.STELLAR_FEE_PAYER;
    for(const duration of [10,120])assert.equal(configuration(config(duration)).expirationLedgers,duration);
    for(const duration of [10,120,360])assert.equal(configuration(config(duration),'probe').expirationLedgers,duration);
    for(const duration of [121,360,361])assert.throws(()=>configuration(config(duration)),/10\.\.120/);
    for(const duration of [9,0,-1,361,10.5,null,'360'])assert.throws(()=>configuration(config(duration),'probe'),/10\.\.360/);
    const longConfig=config(360);
    for(const command of ['prepare','review','finalize']) {
      const child=spawnSync(process.execPath,['--experimental-strip-types','scripts/testnet/cli.ts',command,longConfig],{encoding:'utf8',timeout:5000});
      assert.ifError(child.error);assert.equal(child.status,1);assert.match(child.stderr,/Expiry must be 10\.\.120 ledgers/);
    }
  } finally {
    for(const [key,value] of [['WEBAUTHN_ORIGIN',saved.origin],['WEBAUTHN_RP_ID',saved.rp],['STELLAR_FEE_PAYER',saved.payer]]) {
      if(value===undefined)delete process.env[key!];else process.env[key!]=value;
    }
  }
});
test('fee cap rejects excess with exact costs and accepts the boundary',()=>{
  assert.throws(()=>enforceFeeCap('12345678', base.maxFeeStroops, '12345578', 12345578n), {
    message: 'Fee cap exceeded: estimated total 12345678 stroops (1.2345678 XLM); ' +
      'configured limit 10000000 stroops (1.0000000 XLM); ' +
      'simulation minResourceFee 12345578 stroops; assembled resourceFee 12345578 stroops; ' +
      'inclusion fee (total - resourceFee) 100 stroops'
  });
  assert.throws(()=>enforceFeeCap('10000001', base.maxFeeStroops, '9999901', 9999901n), /1\.0000001 XLM/);
  assert.doesNotThrow(()=>enforceFeeCap('10000000', base.maxFeeStroops, '9999900', 9999900n));
  assert.doesNotThrow(()=>enforceFeeCap('9999999', base.maxFeeStroops, '9999899', 9999899n));
});
test('transfer proposal rejects changed intent, signer configuration, challenge and nested calls',()=>{
  const original=xdr.SorobanAuthorizationEntry.fromXDR(vector[6],'hex');
  const operation=transfer(base);
  const b=operation.body;
  if(b.type!=='invokeHostFunction' || b.invokeHostFunctionOp.hostFunction.type!=='hostFunctionTypeInvokeContract')throw Error('Invocation');
  const entry=new xdr.SorobanAuthorizationEntry({credentials:original.credentials,rootInvocation:new xdr.SorobanAuthorizedInvocation({
    function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(b.invokeHostFunctionOp.hostFunction.invokeContract),subInvocations:[]})});
  const req: Request={network:NETWORK,entryXdr:entry.toXDR('base64'),ruleIds:[0],challenge:challenge(entry,[0]).toString('base64url'),origin:base.origin,rpId:base.rpId,
    signers:base.signers,pair:base.pair,intent:{account:base.account,token:base.token,recipient:base.recipient,amount:base.amount,expirationLedger:credentials(entry).signatureExpirationLedger}};
  assert.doesNotThrow(()=>validateRequest(base,req,0));
  assert.throws(()=>validateRequest({...base,amount:'8'},req,0),/differs/);
  assert.throws(()=>validateRequest(base,{...req,challenge:'bad'},0),/differs/);
  assert.throws(()=>validateRequest(base,{...req,intent:{...req.intent,amount:'8'}},0),/Misleading/);
  assert.throws(()=>validateRequest(base,req,1),/differs/);
  const nested=new xdr.SorobanAuthorizationEntry({credentials:entry.credentials,rootInvocation:new xdr.SorobanAuthorizedInvocation({...entry.rootInvocation,subInvocations:[entry.rootInvocation]})});
  assert.throws(()=>validateRequest(base,{...req,entryXdr:nested.toXDR('base64'),challenge:challenge(nested,[0]).toString('base64url')},0),/differs/);
});
test('deployment configuration uses explicit env binding and rejects HTTP localhost',()=>{
  // This test stops at the first relevant validation rule; it never calls RPC.
  mkdirSync('tmp',{recursive:true});
  const dir=mkdtempSync(resolve('tmp/preflight-'));
  const config=resolve(dir,'public-config.json');
  writeFileSync(config,JSON.stringify({...base,origin:'',rpId:''}));
  const saved={origin:process.env.WEBAUTHN_ORIGIN,rp:process.env.WEBAUTHN_RP_ID,payer:process.env.STELLAR_FEE_PAYER};
  try {
    delete process.env.WEBAUTHN_ORIGIN;delete process.env.WEBAUTHN_RP_ID;delete process.env.STELLAR_FEE_PAYER;
    assert.throws(()=>configuration(config),/Set WEBAUTHN/);
    process.env.WEBAUTHN_ORIGIN='http://localhost:8080';process.env.WEBAUTHN_RP_ID='localhost';
    // A fixed public development address, no corresponding private material.
    process.env.STELLAR_FEE_PAYER='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    assert.throws(()=>configuration(config),/HTTPS/);
    process.env.WEBAUTHN_ORIGIN='https://vault.example';process.env.WEBAUTHN_RP_ID='vault.example';
    assert.equal(configuration(config).origin,'https://vault.example');
  } finally {
    for(const [key,value] of [['WEBAUTHN_ORIGIN',saved.origin],['WEBAUTHN_RP_ID',saved.rp],['STELLAR_FEE_PAYER',saved.payer]]) {
      if(value === undefined) delete process.env[key!];else process.env[key!]=value;
    }
  }
});
