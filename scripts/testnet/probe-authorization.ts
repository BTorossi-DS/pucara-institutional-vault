import {Operation, xdr} from '@stellar/stellar-sdk';
import type {Config} from './cli.ts';
import {probeOperation, validateProbeRequest} from './auth-probe.ts';
import type {ProbeRequest} from './auth-probe.ts';
import {sha, signaturePayload, withCredentials} from './auth.ts';
import type {Assertion} from './auth.ts';
import {validateWebAuthnAssertion} from './webauthn-authorization.ts';
import type {WebAuthnAssertion} from './webauthn-authorization.ts';
export {normalizeAssertion} from './webauthn-authorization.ts';

export type ProbeRole = 'ceo' | 'cfo';
export interface ProbeAssertion extends WebAuthnAssertion {
  role: ProbeRole;
}
export function proposalId(req: ProbeRequest) {
  // Locks the entire reviewed proposal, including its discovery transaction and signer metadata.
  return sha(Buffer.from(JSON.stringify(req))).toString('hex');
}
export function validateProbeAssertion(c: Config, req: ProbeRequest, a: ProbeAssertion): Assertion {
  if (!a || !['ceo','cfo'].includes(a.role)) throw Error('Unknown institutional signer');
  return validateWebAuthnAssertion({challenge:req.challenge,origin:c.origin,rpId:c.rpId},c.signers[a.role],a);
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
