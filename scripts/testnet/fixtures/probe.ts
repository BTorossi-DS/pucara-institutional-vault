// Synthetic P-256 fixtures only. Private keys are ephemeral and never serialized.
import {generateKeyPairSync,sign} from 'node:crypto';
import {Account,Address,BASE_FEE,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import type {Config} from '../cli.ts';
import {NETWORK,sha} from '../auth.ts';
import {buildProbeRequest,probeOperation} from '../auth-probe.ts';
import type {ProbeAssertion,ProbeRole} from '../probe-authorization.ts';
export function probeFixture(expirationLedgers = 120) {
  const keys=Array.from({length:3},()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'}));
  const publicKeys=keys.map(k=>{const j=k.publicKey.export({format:'jwk'});return Buffer.concat([
    Buffer.from([4]),Buffer.from(j.x!,'base64url'),Buffer.from(j.y!,'base64url')]).toString('hex');});
  const contract=(n:number)=>Address.contract(Buffer.alloc(32,n)).toString();
  const c:Config={feePayer:'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',account:contract(1),verifier:contract(2),
    origin:'https://localhost:8443',rpId:'localhost',pair:['ceo','cfo'],expirationLedgers,maxFeeStroops:'10000000',
    token:'unused',recipient:'unused',amount:'unused',signers:{ceo:{publicKey:publicKeys[0],credentialId:'Y2Vv'},
      cfo:{publicKey:publicKeys[1],credentialId:'Y2Zv'},treasury_manager:{publicKey:publicKeys[2],credentialId:'dHJlYXN1cnk'}}};
  const transaction=(op:xdr.Operation)=>new TransactionBuilder(new Account(c.feePayer,'5'),{fee:BASE_FEE,networkPassphrase:NETWORK}).addOperation(op).setTimeout(300).build();
  const op=probeOperation(c),b=op.body;
  if(b.type!=='invokeHostFunction'||b.invokeHostFunctionOp.hostFunction.type!=='hostFunctionTypeInvokeContract')throw Error('invoke');
  const entry=new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
    address:new Address(c.account).toScAddress(),nonce:42n,signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()})),
    rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(b.invokeHostFunctionOp.hostFunction.invokeContract),subInvocations:[]})});
  const req=buildProbeRequest(c,transaction(op),[entry],0,1000);
  function assertion(role:ProbeRole,clientChange:Record<string,unknown>={},flags=5,rp='localhost'):ProbeAssertion {
    const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:req.challenge,origin:c.origin,crossOrigin:false,...clientChange}));
    const ad=Buffer.concat([sha(Buffer.from(rp)),Buffer.from([flags,0,0,0,0])]);
    return {role,...c.signers[role],clientDataJSON:client.toString('base64'),authenticatorData:ad.toString('base64'),
      signatureDER:sign('sha256',Buffer.concat([ad,sha(client)]),keys[role==='ceo'?0:1].privateKey).toString('hex')};
  }
  return {c,req,assertion,transaction};
}
