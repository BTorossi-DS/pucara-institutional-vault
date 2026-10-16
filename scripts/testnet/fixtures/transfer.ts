// Synthetic assertions only; all private fixture keys stay in memory.
import {Account,Address,BASE_FEE,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {probeFixture} from './probe.ts';
import {FIRST_TRANSFER,transfer} from '../transfer-authorization.ts';
import type {TransferRole} from '../transfer-authorization.ts';
import type {Config,Request} from '../cli.ts';
import {NETWORK,challenge} from '../auth.ts';
export function transferFixture() {
  const base=probeFixture();
  const c:Config={...base.c,...FIRST_TRANSFER,feePayer:FIRST_TRANSFER.recipient};
  const b=transfer(c).body;
  if(b.type!=='invokeHostFunction' || b.invokeHostFunctionOp.hostFunction.type!=='hostFunctionTypeInvokeContract')throw Error('invoke');
  const original=xdr.SorobanAuthorizationEntry.fromXDR(base.req.entryXdr,'base64');
  const cred=original.credentials;
  if(cred.type!=='sorobanCredentialsAddress')throw Error('credentials');
  const updated=new xdr.SorobanAuthorizationEntry({rootInvocation:new xdr.SorobanAuthorizedInvocation({
    function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(b.invokeHostFunctionOp.hostFunction.invokeContract),subInvocations:[]}),
    credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({...cred.address,address:new Address(c.account).toScAddress()}))});
  const req:Request={network:NETWORK,entryXdr:updated.toXDR('base64'),ruleIds:[0],challenge:challenge(updated,[0]).toString('base64url'),
    origin:c.origin,rpId:c.rpId,signers:c.signers,pair:c.pair,intent:{account:c.account,token:c.token,recipient:c.recipient,amount:c.amount,expirationLedger:1120}};
  const assertion=(role:TransferRole,clientChange:Record<string,unknown>={},flags=5,rp='localhost')=>
    base.assertion(role,{challenge:req.challenge,...clientChange},flags,rp);
  const transaction=(op:xdr.Operation)=>new TransactionBuilder(new Account(c.feePayer,'6'),{fee:BASE_FEE,networkPassphrase:NETWORK}).addOperation(op).setTimeout(300).build();
  return {c,req,assertion,transaction};
}
