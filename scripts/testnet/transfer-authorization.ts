import {Address,Asset,Operation,nativeToScVal,xdr} from '@stellar/stellar-sdk';
import type {Config,Request} from './cli.ts';
import {NETWORK,challenge,credentials,sha,signaturePayload,withCredentials} from './auth.ts';
import {validateWebAuthnAssertion} from './webauthn-authorization.ts';
import type {WebAuthnAssertion} from './webauthn-authorization.ts';

const address=(value:string)=>new Address(value).toScVal();
export const FIRST_TRANSFER = Object.freeze({
  account:'CB2ZCJX4PB45LRQJ3CRCJ5JZ7O4DHONXMQV6U6RSIMXQ6KHYVNFZYYFH',
  verifier:'CAZS2AXQZGPMSV2NWLTMPNUE6IJJ65F6G3QWEKMGXKQAPCAWROWQRYEP',
  token:Asset.native().contractId(NETWORK),
  recipient:'GDBSP3BBHMZQ6LVNQTFNK6THMXFJDBTIHCY7FVRMJ26AP4VSJAZ6XXX2',
  amount:'10000000',
} as const);
export type TransferRole='ceo'|'cfo';
export interface TransferAssertion extends WebAuthnAssertion {role:TransferRole}

export function transferPolicy(c:Config,rule:number) {
  if(c.account!==FIRST_TRANSFER.account || c.verifier!==FIRST_TRANSFER.verifier || c.token!==FIRST_TRANSFER.token ||
    c.recipient!==FIRST_TRANSFER.recipient || c.feePayer!==FIRST_TRANSFER.recipient || c.amount!==FIRST_TRANSFER.amount ||
    c.origin!=='https://localhost:8443' || c.rpId!=='localhost' || rule!==0 ||
    JSON.stringify(c.pair)!==JSON.stringify(['ceo','cfo'])) throw Error('Not the reviewed first native XLM transfer');
  if(c.expirationLedgers!==120)throw Error('First transfer requires 120 ledgers; transfer policy remains 10..120');
  if(BigInt(c.maxFeeStroops)<=0n || BigInt(c.maxFeeStroops)>10000000n)throw Error('Transfer fee cap must be at most 1 XLM');
  if(new Set(Object.values(c.signers).map(s=>s.publicKey.toLowerCase())).size!==3 ||
    new Set(c.pair.map(r=>c.signers[r].credentialId)).size!==2)throw Error('Distinct registered signers required');
}

export function transfer(c: Config, auth?: xdr.SorobanAuthorizationEntry[]) {
  address(c.token); address(c.account); address(c.recipient);
  if (!/^[1-9][0-9]*$/.test(c.amount) || BigInt(c.amount) >= 2n ** 127n) throw Error('Positive i128 base-unit amount required');
  const args = [address(c.account), address(c.recipient),
    nativeToScVal(BigInt(c.amount), {type:'i128'})];
  return Operation.invokeContractFunction({contract: c.token, function: 'transfer', args, auth});
}
export function validateRequest(c: Config, req: Request, rule: number) {
  if ('kind' in req || 'unsignedEnvelopeXdr' in req) throw Error('Probe requests cannot use transfer review/finalization');
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(req.entryXdr, 'base64');
  const body = transfer(c).body;
  if (body.type !== 'invokeHostFunction' || body.invokeHostFunctionOp.hostFunction.type !== 'hostFunctionTypeInvokeContract') throw Error('Expected contract invocation');
  const expected = body.invokeHostFunctionOp.hostFunction.invokeContract;
  if (req.network !== NETWORK || req.origin !== c.origin || req.rpId !== c.rpId ||
      JSON.stringify(req.signers) !== JSON.stringify(c.signers) || JSON.stringify(req.pair) !== JSON.stringify(c.pair) ||
      JSON.stringify(req.ruleIds) !== JSON.stringify([rule]) ||
      Address.fromScAddress(credentials(entry).address).toString() !== c.account ||
      entry.rootInvocation.function.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
      !Buffer.from(entry.rootInvocation.function.contractFn.toXDR()).equals(expected.toXDR()) || entry.rootInvocation.subInvocations.length !== 0 ||
      req.challenge !== challenge(entry, [rule]).toString('base64url')) throw Error('Proposal differs from reviewed configuration');
  if (JSON.stringify(req.intent) !== JSON.stringify({account:c.account,token:c.token,recipient:c.recipient,amount:c.amount,
      expirationLedger:credentials(entry).signatureExpirationLedger})) throw Error('Misleading intent summary');
  return entry;
}

export function validateTransferRequest(c:Config,req:Request,rule:number,ledger:number) {
  transferPolicy(c,rule);
  const entry=validateRequest(c,req,rule),cred=credentials(entry);
  if('expirationLedger' in req && req.expirationLedger!==cred.signatureExpirationLedger)
    throw Error('Conflicting transfer expiration metadata');
  if(cred.signature.type!=='scvVoid')throw Error('Pre-signed authorization entries are not proposals');
  if(!Number.isSafeInteger(ledger) || ledger<0 || cred.signatureExpirationLedger<=ledger+5 ||
    cred.signatureExpirationLedger>ledger+120)throw Error('Authorization expired or outside policy');
  return entry;
}
export function validateTransferAssertion(c:Config,req:Request,a:TransferAssertion) {
  if(!a || !['ceo','cfo'].includes(a.role))throw Error('Unknown institutional signer');
  return validateWebAuthnAssertion({challenge:req.challenge,origin:c.origin,rpId:c.rpId},c.signers[a.role],a);
}
export function authorizedTransferOperation(c:Config,req:Request,assertions:TransferAssertion[],ledger:number) {
  const entry=validateTransferRequest(c,req,0,ledger);
  if(assertions.length!==2 || new Set(assertions.map(a=>a?.role)).size!==2)throw Error('CEO + CFO assertions required exactly once');
  const validated=assertions.map(a=>validateTransferAssertion(c,req,a));
  return transfer(c,[withCredentials(entry,{signature:signaturePayload(c.verifier,[0],validated)})]);
}
export type TransferCheck=(c:Config,req:Request)=>Promise<{ledger:number;summary:unknown}>;

// One immutable transfer proposal; capture cannot finalize, simulate or submit.
export class TransferSession {
  readonly id:string;
  private readonly config:Config;
  private readonly request:Request;
  private reviewed=false;
  private busy=false;
  private pending=new Set<TransferRole>();
  private assertions=new Map<TransferRole,TransferAssertion>();
  private readonly check:TransferCheck;
  constructor(c:Config,req:Request,check:TransferCheck) {
    this.config=structuredClone(c);this.request=structuredClone(req);this.check=check;
    this.id=sha(Buffer.from(JSON.stringify({purpose:'transfer',config:this.config,request:this.request}))).toString('hex');
  }
  private async current() {
    const result=await this.check(structuredClone(this.config),structuredClone(this.request));
    validateTransferRequest(this.config,this.request,0,result.ledger);return result;
  }
  status() {
    const completed=this.assertions.size===2;
    return {proposalId:this.id,reviewed:this.reviewed,captured:[...this.assertions.keys()],completed,
      approvalStatus:completed?'CEO and CFO approvals validated.':'Approvals pending.'};
  }
  async review() {
    if(this.busy || this.status().completed)throw Error('Session unavailable');
    this.reviewed=false;const {summary}=await this.current();this.reviewed=true;return summary;
  }
  async options(role:TransferRole) {
    if(!this.reviewed || this.busy || this.status().completed || !['ceo','cfo'].includes(role) || this.assertions.has(role) || this.pending.has(role))
      throw Error('Review required, role already captured/pending or session unavailable');
    this.pending.add(role);
    try {await this.current();}catch(error){this.pending.delete(role);throw error;}
    return {proposalId:this.id,role,challenge:this.request.challenge,rpId:this.config.rpId,...this.config.signers[role]};
  }
  cancel(role:TransferRole){this.pending.delete(role);}
  async capture(input:TransferAssertion,persist:(a:TransferAssertion)=>void) {
    if(!input)throw Error('Malformed assertion');
    const a:TransferAssertion={role:input.role,credentialId:input.credentialId,publicKey:input.publicKey,
      clientDataJSON:input.clientDataJSON,authenticatorData:input.authenticatorData,signatureDER:input.signatureDER};
    if(!a || !this.reviewed || this.busy || this.status().completed || !this.pending.delete(a.role) || this.assertions.has(a.role))
      throw Error('No pending capture or signer already captured');
    this.busy=true;
    try {
      await this.current();validateTransferAssertion(this.config,this.request,a);
      await this.current(); // Recheck live expiration/nonce after signature normalization.
      persist(structuredClone(a));this.assertions.set(a.role,a);
    }finally{this.busy=false;}
  }
}
