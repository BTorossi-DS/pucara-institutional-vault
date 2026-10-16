import {createPublicKey, verify} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Operation, xdr} from '@stellar/stellar-sdk';
import type {Config} from './cli.ts';
import {probeOperation, validateProbeRequest} from './auth-probe.ts';
import type {ProbeRequest} from './auth-probe.ts';
import {sha, signaturePayload, withCredentials} from './auth.ts';
import type {Assertion} from './auth.ts';

export type ProbeRole = 'ceo' | 'cfo';
export interface ProbeAssertion {
  role: ProbeRole; credentialId: string; publicKey: string;
  clientDataJSON: string; authenticatorData: string; signatureDER: string;
}
export function proposalId(req: ProbeRequest) {
  // Locks the entire reviewed proposal, including its discovery transaction and signer metadata.
  return sha(Buffer.from(JSON.stringify(req))).toString('hex');
}
export function normalizeAssertion(signatureDER: string) {
  if (typeof signatureDER !== 'string' || !/^(?:[0-9a-f]{2}){8,72}$/i.test(signatureDER)) throw Error('Invalid P-256 DER signature encoding');
  try {
    // Existing RustCrypto parser/low-S normalizer; no handwritten cryptography or downloads.
    const compact = execFileSync('/workspaces/stellar-wallet/.tools/cargo/bin/cargo',[
      'run','--quiet','--locked','--offline','-p','institutional-account','--example','normalize_assertion','--',signatureDER,
    ],{cwd:'/workspaces/stellar-wallet',encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim();
    if (!/^[0-9a-f]{128}$/.test(compact)) throw Error('Invalid compact signature');
    return compact;
  } catch { throw Error('P-256 DER normalization failed; check the existing offline normalizer'); }
}
function base64(value: string, maxBytes: number) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw Error('Invalid assertion base64 encoding');
  const raw=Buffer.from(value,'base64');
  if (raw.length > maxBytes || raw.toString('base64') !== value) throw Error('Invalid assertion size/encoding');
  return raw;
}
export function validateProbeAssertion(c: Config, req: ProbeRequest, a: ProbeAssertion): Assertion {
  if (!a || !['ceo','cfo'].includes(a.role)) throw Error('Unknown institutional signer');
  const signer=c.signers[a.role];
  if (typeof signer.credentialId !== 'string' || signer.credentialId.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/.test(signer.credentialId) || Buffer.from(signer.credentialId,'base64url').toString('base64url') !== signer.credentialId)
    throw Error('Invalid registered credential ID encoding');
  if (a.credentialId !== signer.credentialId || a.publicKey !== signer.publicKey) throw Error('Credential ID or signer public key mismatch');
  const rawClient=base64(a.clientDataJSON,1024), ad=base64(a.authenticatorData,4096);
  const client=JSON.parse(rawClient.toString('utf8'));
  if (client.type !== 'webauthn.get' || client.challenge !== req.challenge || client.origin !== c.origin ||
      (client.crossOrigin !== undefined && client.crossOrigin !== false) || client.topOrigin !== undefined ||
      ad.length < 37 || !ad.subarray(0,32).equals(sha(Buffer.from(c.rpId))) || (ad[32]&5) !== 5)
    throw Error('Invalid WebAuthn challenge/origin/RP/UP/UV binding');
  const compact=normalizeAssertion(a.signatureDER);
  const pk=Buffer.from(signer.publicKey,'hex');
  const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:pk.subarray(1,33).toString('base64url'),y:pk.subarray(33).toString('base64url')}});
  if (!verify('sha256',Buffer.concat([ad,sha(rawClient)]),{key,dsaEncoding:'ieee-p1363'},Buffer.from(compact,'hex')))
    throw Error('Invalid passkey signature');
  return {publicKey:signer.publicKey,signature:compact,authenticatorData:a.authenticatorData,clientDataJSON:a.clientDataJSON};
}
export function authorizedProbeOperation(c: Config, req: ProbeRequest, assertions: ProbeAssertion[], ledger: number) {
  const entry=validateProbeRequest(c,req,0,ledger);
  if (assertions.length !== 2 || new Set(assertions.map(a=>a.role)).size !== 2) throw Error('CEO + CFO assertions required exactly once');
  const validated=assertions.map(a=>validateProbeAssertion(c,req,a));
  const signed=withCredentials(entry,{signature:signaturePayload(c.verifier,[0],validated)});
  const op=probeOperation(c), b=op.body;
  if (b.type !== 'invokeHostFunction' || b.invokeHostFunctionOp.hostFunction.type !== 'hostFunctionTypeInvokeContract') throw Error('Expected probe invocation');
  return Operation.invokeContractFunction({contract:c.account,function:'execute',args:b.invokeHostFunctionOp.hostFunction.invokeContract.args,auth:[signed]});
}

export interface ProbeReport {
  operation: ProbeRequest['intent']; account: string; verifier: string; network: string;
  signerRoles: ProbeRole[]; rule: 0; challengeHash: string; proposalId: string;
  simulation: 'PASS' | 'FAIL'; contractError: string | null; feeStroops?: string;
}
export function probeReport(req: ProbeRequest, simulation: 'PASS'|'FAIL', contractError: string|null, feeStroops?: string): ProbeReport {
  return {operation:req.intent,account:req.account,verifier:req.verifier,network:req.network,signerRoles:['ceo','cfo'],rule:0,
    challengeHash:Buffer.from(req.challenge,'base64url').toString('hex'),proposalId:proposalId(req),simulation,contractError,...(feeStroops ? {feeStroops} : {})};
}

// A session has one immutable proposal. It can neither generate nor replace challenges.
export class ProbeSession {
  readonly id: string;
  private readonly request: ProbeRequest;
  private readonly config: Config;
  private reviewed=false;
  private busy=false;
  private completed=false;
  private pending=new Set<ProbeRole>();
  private assertions=new Map<ProbeRole,ProbeAssertion>();
  private check: (req:ProbeRequest)=>Promise<{ledger:number; summary:unknown}>;
  constructor(c:Config,req:ProbeRequest,check:(req:ProbeRequest)=>Promise<{ledger:number;summary:unknown}>) {
    this.config=structuredClone(c);this.request=structuredClone(req);this.id=proposalId(this.request);this.check=check;
  }
  private async current() {
    const result=await this.check(structuredClone(this.request));
    validateProbeRequest(this.config,this.request,0,result.ledger);
    return result;
  }
  async review() {
    this.reviewed=false;
    const {summary}=await this.current();this.reviewed=true;return summary;
  }
  status() {return {proposalId:this.id,reviewed:this.reviewed,captured:[...this.assertions.keys()],completed:this.completed};}
  async options(role:ProbeRole) {
    if (!this.reviewed || this.busy || this.completed || !['ceo','cfo'].includes(role) || this.assertions.has(role) || this.pending.has(role))
      throw Error('Review required, role already captured/pending or session unavailable');
    this.pending.add(role);
    try {await this.current();} catch(error) {this.pending.delete(role);throw error;}
    const signer=this.config.signers[role];
    return {proposalId:this.id,role,challenge:this.request.challenge,rpId:this.config.rpId,credentialId:signer.credentialId,publicKey:signer.publicKey};
  }
  cancel(role:ProbeRole) {this.pending.delete(role);}
  async capture(a:ProbeAssertion, persist:(a:ProbeAssertion)=>void) {
    if (!this.reviewed || this.busy || this.completed || !this.pending.delete(a.role) || this.assertions.has(a.role)) throw Error('No pending capture or signer already captured');
    this.busy=true;
    try {
      await this.current();validateProbeAssertion(this.config,this.request,a);
      persist(a);this.assertions.set(a.role,structuredClone(a));
    } finally {this.busy=false;}
  }
  async simulate(run:(req:ProbeRequest,a:ProbeAssertion[])=>Promise<ProbeReport>) {
    if (!this.reviewed || this.busy || this.completed || this.assertions.size !== 2 || this.pending.size !== 0) throw Error('Two completed independent assertions required');
    this.busy=true;
    try {
      const {ledger}=await this.current();const a=[...this.assertions.values()];
      authorizedProbeOperation(this.config,this.request,a,ledger);
      const report=await run(structuredClone(this.request),structuredClone(a));this.completed=true;return report;
    } finally {this.busy=false;}
  }
}
