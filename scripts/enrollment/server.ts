import {serveBrandAsset} from './assets.ts';
// Local enrollment coordinator. Public metadata only; challenges expire in memory.
import { createServer as httpServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash, createPublicKey, verify } from 'node:crypto';
import { resolve } from 'node:path';
import { createAuthorizationMode } from './authorization.ts';
const ROOT = '/workspaces/stellar-wallet';
const origin = process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:8080';
const rpId = process.env.WEBAUTHN_RP_ID ?? 'localhost';
const url = new URL(origin);
if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) ||
    (url.protocol === 'http:' && url.hostname !== 'localhost') ||
    !(url.hostname === rpId || url.hostname.endsWith('.'+rpId))) throw Error('Invalid local origin/RP binding');
const roles = ['ceo','cfo','treasury_manager'];
const challenges = new Map<string,{role:string;create:string;get:string;expires:number}>();
const registrations = new Map<string,{publicKey:string;credentialId:string}>();
const hash = (b: Uint8Array|string) => createHash('sha256').update(b).digest();
function binding(encoded:string, type:string, challenge:string) {
  const raw=Buffer.from(encoded,'base64');
  const client=JSON.parse(raw.toString('utf8'));
  if (client.type !== type || client.challenge !== challenge || client.origin !== origin ||
      client.crossOrigin === true || client.topOrigin !== undefined) throw Error('Invalid ceremony binding');
  return raw;
}
function workspaceCert(file:string) {
  const path=resolve(file);
  if(!path.startsWith(ROOT+'/')) throw Error('TLS files must be inside workspace');
  return readFileSync(path);
}
const handler: RequestListener = async (req,res) => {
  const json = (code:number,data:unknown) => {res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if (req.headers.host !== url.host) return json(403,{error:'Wrong host'});
    if (serveBrandAsset(req,res)) return;
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});
      return res.end(readFileSync(new URL('./index.html',import.meta.url)));
    }
    if(req.method === 'GET' && req.url === '/client.js') {
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
      return res.end(readFileSync(new URL('./client.js',import.meta.url)));
    }
    if(req.method === 'GET' && req.url === '/config') return json(200,{origin,rpId,registrations:Object.fromEntries(registrations)});
    if(req.method !== 'POST' || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return json(403,{error:'Same-origin JSON request required'});
    let body='';for await (const chunk of req) {body+=chunk; if(body.length>32768) throw Error('Request too large');}
    const input=JSON.parse(body);
    if(req.url === '/challenge') {
      if(!roles.includes(input.role) || registrations.has(input.role)) throw Error('Unknown or already enrolled role; restart to replace');
      for(const [id,c] of challenges) if(c.expires < Date.now() || c.role === input.role) challenges.delete(id);
      const id=randomBytes(24).toString('base64url');
      const create=randomBytes(32).toString('base64url'),get=randomBytes(32).toString('base64url');
      challenges.set(id,{role:input.role,create,get,expires:Date.now()+180000});
      return json(200,{id,create,get,userId:randomBytes(32).toString('base64url'),rpId,
        excludeCredentials:[...registrations.values()].map(r=>r.credentialId)});
    }
    if(req.url === '/register') {
      const pending=challenges.get(input.id);challenges.delete(input.id);
      if(!pending || pending.expires < Date.now() || registrations.has(pending.role)) throw Error('Expired or reused enrollment challenge');
      binding(input.creationClientDataJSON,'webauthn.create',pending.create);
      const client=binding(input.clientDataJSON,'webauthn.get',pending.get);
      const ad=Buffer.from(input.authenticatorData,'base64');
      if(ad.length<37 || !ad.subarray(0,32).equals(hash(rpId)) || (ad[32]&5)!==5) throw Error('Invalid RP binding/presence/verification');
      if(!/^[A-Za-z0-9_-]+$/.test(input.credentialId) || input.credentialId.length>2048) throw Error('Invalid credential ID');
      const key=createPublicKey({format:'der',type:'spki',key:Buffer.from(input.publicKeySPKI,'base64')});
      if(key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw Error('ES256 P-256 required');
      if(!verify('sha256',Buffer.concat([ad,hash(client)]),key,Buffer.from(input.signatureDER,'base64'))) throw Error('Proof of possession failed');
      const jwk=key.export({format:'jwk'});
      const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x!,'base64url'),Buffer.from(jwk.y!,'base64url')]).toString('hex');
      if([...registrations.values()].some(r=>r.publicKey===publicKey || r.credentialId===input.credentialId)) throw Error('Each role needs a distinct passkey');
      registrations.set(pending.role,{publicKey,credentialId:input.credentialId});
      return json(200,{role:pending.role,registration:registrations.get(pending.role)});
    }
    return json(404,{error:'Not found'});
  } catch(error) {json(400,{error:error instanceof Error ? error.message : 'Enrollment failed'});}
};
const mode=process.env.WEBAUTHN_MODE ?? 'enrollment';
if (!['enrollment','authorization'].includes(mode)) throw Error('Unknown WebAuthn mode');
if (mode === 'authorization' && origin !== 'https://localhost:8443') throw Error('Authorization requires https://localhost:8443');
const activeHandler=mode === 'authorization' ? await createAuthorizationMode() : handler;
const server=url.protocol === 'https:' ? httpsServer({cert:workspaceCert(process.env.LOCAL_TLS_CERT!),key:workspaceCert(process.env.LOCAL_TLS_KEY!)},activeHandler) : httpServer(activeHandler);
server.listen(Number(url.port || (url.protocol==='https:' ? 443 : 80)),'127.0.0.1',()=>console.log(`${mode}: ${origin}; RP-ID: ${rpId}. No browser ceremonies start automatically.`));
