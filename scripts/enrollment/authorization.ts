import type {RequestListener} from 'node:http';
import {mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {xdr} from '@stellar/stellar-sdk';
import {credentials} from '../testnet/auth.ts';
import {configuration,reviewProbe,simulateProbe,reviewTransfer,loadTransferArtifact} from '../testnet/cli.ts';
import {ProbeSession} from '../testnet/probe-authorization.ts';
import {TransferSession} from '../testnet/transfer-authorization.ts';
import type {ProbeAssertion,ProbeRole,ProbeReport} from '../testnet/probe-authorization.ts';
import type {ProbeRequest} from '../testnet/auth-probe.ts';
import type {Config,Request} from '../testnet/cli.ts';
const ROOT='/workspaces/stellar-wallet';
function workspace(file:string) {
  const path=resolve(file);
  if (!path.startsWith(ROOT+'/') || !realpathSync(path).startsWith(ROOT+'/')) throw Error('Authorization files must be inside workspace');
  return path;
}
export function authorizationHandler(session:ProbeSession|TransferSession, req:ProbeRequest|Request, persist:(a:ProbeAssertion)=>void,
  simulate?:(req:ProbeRequest,a:ProbeAssertion[])=>Promise<ProbeReport>, saveReport?:(r:ProbeReport)=>void):RequestListener {
  const proposal=structuredClone(req),purpose=session instanceof TransferSession?'transfer':'probe';
  const expirationLedger=purpose==='transfer'?
    credentials(xdr.SorobanAuthorizationEntry.fromXDR(proposal.entryXdr,'base64')).signatureExpirationLedger:
    (proposal as ProbeRequest).expirationLedger;
  if(purpose==='transfer' && ((proposal as Request).intent.expirationLedger!==expirationLedger ||
    ('expirationLedger' in proposal && proposal.expirationLedger!==expirationLedger)))
    throw Error('Conflicting transfer expiration metadata');
  const csrf=randomBytes(32).toString('hex');
  const sameToken=(value:unknown)=>typeof value==='string' && value.length===csrf.length && timingSafeEqual(Buffer.from(value),Buffer.from(csrf));
  return async (request,response)=>{
    const json=(status:number,data:unknown)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(data));};
    try {
      if(request.headers.host!=='localhost:8443') return json(403,{error:'Wrong host'});
      if(request.method==='GET' && (request.url==='/' || request.url==='/client.js')) {
        const html=request.url==='/';
        response.writeHead(200,{'Content-Type':html?'text/html':'text/javascript','Cache-Control':'no-store',
          'Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          'Permissions-Policy':'publickey-credentials-get=(self)','X-Content-Type-Options':'nosniff'});
        return response.end(readFileSync(resolve(ROOT,'scripts/enrollment',html?'authorization.html':'authorization-client.js')));
      }
      if(request.method==='GET' && request.url==='/config') return json(200,{mode:'authorization',purpose,origin:proposal.origin,rpId:proposal.rpId,
        intent:proposal.intent,network:proposal.network,ruleIds:proposal.ruleIds,challenge:proposal.challenge,expirationLedger,csrf,...session.status()});
      if(request.method!=='POST' || request.headers.origin!==proposal.origin || request.headers['content-type']!=='application/json') return json(403,{error:'Same-origin JSON request required'});
      let body='';for await(const chunk of request){body+=chunk;if(body.length>32768)throw Error('Request too large');}
      const input=JSON.parse(body);
      if(!sameToken(input.csrf) || input.proposalId!==session.id) return json(403,{error:'Wrong session/proposal'});
      if(request.url==='/authorization/review') return json(200,{review:await session.review(),...session.status()});
      if(request.url==='/authorization/options') return json(200,await session.options(input.role as ProbeRole));
      if(request.url==='/authorization/cancel') {session.cancel(input.role as ProbeRole);return json(200,session.status());}
      if(request.url==='/authorization/assertion') {
        await session.capture(input.assertion,persist);return json(200,session.status());
      }
      if(request.url==='/authorization/simulate') {
        if(!(session instanceof ProbeSession) || !simulate || !saveReport)return json(404,{error:'Capture only; finalize separately'});
        const report=await session.simulate(simulate);saveReport(report);return json(200,{report,...session.status()});
      }
      return json(404,{error:'Not found'});
    } catch(error) {json(400,{error:purpose==='transfer'?'Transfer authorization failed; review proposal, credentials, nonce and expiration':error instanceof Error ? error.message : 'Authorization failed'});}
  };
}
export async function createAuthorizationMode() {
  const purpose=process.env.AUTHORIZATION_PURPOSE ?? 'probe';
  if(purpose!=='probe' && purpose!=='transfer')throw Error('Unknown authorization purpose');
  const c:Config=configuration(workspace(process.env.AUTHORIZATION_CONFIG!),purpose);
  const requestFile=workspace(process.env.AUTHORIZATION_REQUEST!);
  const req=purpose==='transfer'?loadTransferArtifact(requestFile):JSON.parse(readFileSync(requestFile,'utf8'));
  if(process.env.WEBAUTHN_ORIGIN!==c.origin || process.env.WEBAUTHN_RP_ID!==c.rpId) throw Error('Explicit matching authorization RP/origin required');
  if(purpose==='transfer')await reviewTransfer(c,req);else await reviewProbe(c,req);
  const parent=resolve(process.env.AUTHORIZATION_OUTPUT_DIR ?? ROOT+'/tmp');
  const realParent=realpathSync(parent);
  if(!(parent===ROOT+'/tmp'||parent.startsWith(ROOT+'/tmp/')) ||
    !(realParent===ROOT+'/tmp'||realParent.startsWith(ROOT+'/tmp/'))) throw Error('Authorization artifacts must remain under tmp/');
  const dir=resolve(parent,'authorization-'+randomBytes(12).toString('hex'));
  if(dirname(dir)!==parent)throw Error('Invalid session directory');
  mkdirSync(dir,{mode:0o700});
  const save=(file:string,data:unknown)=>writeFileSync(resolve(dir,file),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
  save('proposal.json',req);
  const persist=(a:ProbeAssertion)=>save(a.role+'-assertion.json',a);
  const handler=purpose==='transfer'?
    authorizationHandler(new TransferSession(c,req,reviewTransfer),req,persist):
    authorizationHandler(new ProbeSession(c,req,r=>reviewProbe(c,r)),req,persist,
      (r,a)=>simulateProbe(c,r,a),r=>save('simulation-report.json',r));
  console.log(`Authorization ${purpose}: immutable proposal; artifacts ${dir}. No automatic WebAuthn ceremonies, finalization or submissions.`);
  return handler;
}
