import { readFileSync, writeFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createPublicKey } from 'node:crypto';
import { Address, BASE_FEE, Contract, Networks, Operation, SorobanDataBuilder, Transaction, TransactionBuilder, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { NETWORK, RPC, bytes, challenge, credentials, withCredentials, external, sha, struct, u32 } from './auth.ts';
import { PROBE_MAX_EXPIRATION_LEDGERS, probeOperation, buildProbeRequest, probeReview } from './auth-probe.ts';
import { authorizedProbeOperation, probeReport } from './probe-authorization.ts';
import type { ProbeAssertion, ProbeReport } from './probe-authorization.ts';
import type { ProbeRequest } from './auth-probe.ts';
import {transfer,validateTransferRequest,transferPolicy,authorizedTransferOperation} from './transfer-authorization.ts';
import type {TransferAssertion} from './transfer-authorization.ts';
export {transfer,validateRequest} from './transfer-authorization.ts';

const ROOT = '/workspaces/stellar-wallet';
const ARTIFACTS = {
  verifier: {file: 'institutional_webauthn_verifier.wasm', hash: 'c1ac3c76abf9a9a647695c8eba212dc03f2cac079c2b94525a335bd658359564'},
  account: {file: 'institutional_account.wasm', hash: '33990cee9e300532e9b0b1c5bf0641f07e12c1a3f5f60ad1502561f74721a1e0'},
};
type Role = 'ceo' | 'cfo' | 'treasury_manager';
export interface Config {
  feePayer: string; rpId: string; origin: string;
  signers: Record<Role, {publicKey: string; credentialId: string}>; signersFile?: string;
  verifier: string; account: string; token: string; recipient: string; amount: string;
  pair: Role[]; expirationLedgers: number; maxFeeStroops: string;
}
export interface Request {
  network: string; entryXdr: string; ruleIds: number[]; challenge: string;
  origin: string; rpId: string; signers: Config['signers']; pair: Role[];
  intent: {account: string; token: string; recipient: string; amount: string; expirationLedger: number};
}
const roles: Role[] = ['ceo', 'cfo', 'treasury_manager'];
const server = new rpc.Server(RPC);
const observedKeys = new Map<string,xdr.LedgerKey>();
function workspaceFile(file: string) {
  const path = resolve(file);
  if (!path.startsWith(ROOT + '/')) throw Error('Files must remain inside workspace');
  return path;
}
const load = (file: string) => JSON.parse(readFileSync(workspaceFile(file), 'utf8'));
const save = (file: string, data: unknown) => writeFileSync(workspaceFile(file), JSON.stringify(data, null, 2) + '\n', {flag: 'wx'});
const address = (a: string) => new Address(a).toScVal();
export function configuration(file: string, purpose: 'transfer' | 'probe' = 'transfer'): Config {
  const c: Config = load(file);
  c.origin = process.env.WEBAUTHN_ORIGIN ?? c.origin;
  c.rpId = process.env.WEBAUTHN_RP_ID ?? c.rpId;
  c.feePayer = process.env.STELLAR_FEE_PAYER ?? c.feePayer;
  if (c.signersFile) c.signers = load(c.signersFile);
  if (!c.origin || !c.rpId) throw Error('Set WEBAUTHN_ORIGIN and WEBAUTHN_RP_ID explicitly; no deployment defaults');
  if (!c.feePayer.startsWith('G')) throw Error('Public Testnet fee payer required');
  address(c.feePayer);
  const origin = new URL(c.origin);
  if (origin.protocol !== 'https:' || origin.origin !== c.origin ||
      !(origin.hostname === c.rpId || origin.hostname.endsWith('.' + c.rpId))) throw Error('Invalid HTTPS origin/RP binding');
  if (new Set(roles.map(r => c.signers[r].publicKey.toLowerCase())).size !== 3) throw Error('Three distinct public keys required');
  for (const r of roles) {
    if (!/^04[0-9a-f]{128}$/i.test(c.signers[r].publicKey)) throw Error('Expected P-256 key');
    const pk = Buffer.from(c.signers[r].publicKey,'hex');
    createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:pk.subarray(1,33).toString('base64url'),y:pk.subarray(33).toString('base64url')}});
  }
  if (c.pair.length !== 2 || new Set(c.pair).size !== 2 || c.pair.some(r => !roles.includes(r))) throw Error('Select two roles');
  const maxExpirationLedgers = purpose === 'probe' ? PROBE_MAX_EXPIRATION_LEDGERS : 120;
  if (!Number.isInteger(c.expirationLedgers) || c.expirationLedgers < 10 || c.expirationLedgers > maxExpirationLedgers)
    throw Error(`Expiry must be 10..${maxExpirationLedgers} ledgers`);
  if (BigInt(c.maxFeeStroops) <= 0n) throw Error('Positive fee cap required');
  return c;
}
async function network() {
  const info = await server.getNetwork();
  if (info.passphrase !== NETWORK || Networks.TESTNET !== NETWORK) throw Error('Testnet network mismatch');
  console.error(`Testnet protocol ${info.protocolVersion}`);
}
async function transaction(c: Config, operation: xdr.Operation, data?: xdr.SorobanTransactionData) {
  return new TransactionBuilder(await server.getAccount(c.feePayer), {fee: BASE_FEE, networkPassphrase: NETWORK, sorobanData:data})
    .addOperation(operation).setTimeout(300).build();
}
async function simulate(tx: Transaction, mode: rpc.Api.SimulationAuthMode = 'enforce') {
  const result = await server.simulateTransaction(tx, undefined, mode, false);
  if (!rpc.Api.isSimulationSuccess(result)) throw Error(JSON.stringify(result));
  if ('restorePreamble' in result && result.restorePreamble) throw Error('Separate restoration required; review restorePreamble and rebuild after restoration');
  return result;
}
export function enforceFeeCap(fee: string, cap: string, minResourceFee: string, resourceFee: bigint) {
  const total = BigInt(fee);
  const limit = BigInt(cap);
  const xlm = (stroops: bigint) => `${stroops / 10000000n}.${(stroops % 10000000n).toString().padStart(7, '0')}`;
  if (total > limit) throw Error(
    `Fee cap exceeded: estimated total ${total} stroops (${xlm(total)} XLM); ` +
    `configured limit ${limit} stroops (${xlm(limit)} XLM); ` +
    `simulation minResourceFee ${minResourceFee} stroops; ` +
    `assembled resourceFee ${resourceFee} stroops; ` +
    `inclusion fee (total - resourceFee) ${total - resourceFee} stroops`
  );
}
async function unsigned(c: Config, op: xdr.Operation, output: string, data?: xdr.SorobanTransactionData, authMode: rpc.Api.SimulationAuthMode = 'enforce') {
  const tx = await transaction(c, op, data);
  const sim = await simulate(tx, authMode);
  const built = rpc.assembleTransaction(tx, sim).build();
  enforceFeeCap(built.fee, c.maxFeeStroops, sim.minResourceFee, sim.transactionData.build().resourceFee);
  save(output, {network: NETWORK, envelopeXdr: built.toXDR(), feeStroops: built.fee,
    minResourceFee: sim.minResourceFee,
    footprintKeys: [...sim.transactionData.build().resources.footprint.readOnly,...sim.transactionData.build().resources.footprint.readWrite].map(k=>k.toXDR('base64')),
    transactionDataXdr: sim.transactionData.build().toXDR('base64')});
}
async function read(c: Config, id: string, fn: string, args: xdr.ScVal[] = []) {
  const sim = await simulate(await transaction(c, new Contract(id).call(fn, ...args)));
  if (!sim.result) throw Error('Missing read result');
  const footprint = sim.transactionData.build().resources.footprint;
  for (const key of [...footprint.readOnly,...footprint.readWrite]) observedKeys.set(key.toXDR('base64'),key);
  return sim.result.retval;
}
async function executable(id: string, type: keyof typeof ARTIFACTS) {
  const wasm = await server.getContractWasmByContractId(id);
  if (sha(wasm).toString('hex') !== ARTIFACTS[type].hash) throw Error(`${type} executable hash mismatch`);
}
async function verifier(c: Config) {
  await executable(c.verifier, 'verifier');
  if (!Buffer.from(scValToNative(await read(c, c.verifier, 'origin'))).equals(Buffer.from(c.origin)) ||
      !Buffer.from(scValToNative(await read(c, c.verifier, 'rp_id_hash'))).equals(sha(Buffer.from(c.rpId)))) throw Error('Verifier configuration mismatch');
}
async function quorumRule(c: Config) {
  await verifier(c);
  await executable(c.account, 'account');
  const enrolled = scValToNative(await read(c, c.account, 'signers'));
  for (const r of roles) if (Buffer.from(enrolled[r]).toString('hex') !== c.signers[r].publicKey.toLowerCase()) throw Error('On-chain signer mismatch');
  const ids: number[] = scValToNative(await read(c, c.account, 'rule_ids'));
  const expected = c.pair.map(r => external(c.verifier, c.signers[r].publicKey).toXDR('base64')).sort();
  for (const id of ids) {
    const rule = await read(c, c.account, 'rule', [u32(id)]);
    if (rule.type !== 'scvMap') throw Error('Expected rule map');
    const signerValue = rule.map!.find(e => e.key.type === 'scvSymbol' && e.key.sym.toString() === 'signers')!.val;
    if (signerValue.type !== 'scvVec' || !signerValue.vec) throw Error('Expected signer vector');
    const signers = signerValue.vec;
    if (JSON.stringify(signers.map(s => s.toXDR('base64')).sort()) === JSON.stringify(expected)) return id;
  }
  throw Error('Selected pair has no on-chain rule');
}
async function prepare(c: Config, output: string) {
  protectedTransferPath(output);
  transferPolicy(c,0);
  const rule = await quorumRule(c);
  const tx = await transaction(c, transfer(c));
  const sim = await simulate(tx, 'record');
  const auth = sim.result?.auth;
  if (!auth || auth.length !== 1 || Address.fromScAddress(credentials(auth[0]).address).toString() !== c.account) throw Error('Unexpected authorization tree');
  const entry = withCredentials(auth[0], {signatureExpirationLedger:sim.latestLedger + c.expirationLedgers});
  const req:Request = {network: NETWORK, entryXdr: entry.toXDR('base64'), ruleIds: [rule],
    challenge: challenge(entry, [rule]).toString('base64url'), origin: c.origin, rpId: c.rpId,
    signers: c.signers, pair: c.pair,
    intent: {account: c.account, token: c.token, recipient: c.recipient, amount: c.amount,
      expirationLedger: credentials(entry).signatureExpirationLedger}};
  await reviewTransfer(c,req);
  saveTransferArtifact(output,req);
}
export function protectedTransferPath(file:string) {
  const path=workspaceFile(file),parent=realpathSync(dirname(path));
  if(!parent.startsWith(ROOT+'/tmp/') || (statSync(parent).mode & 0o077)!==0)
    throw Error('Transfer artifacts require an existing private directory (0700) under tmp/');
  return resolve(parent,basename(path));
}
export function saveTransferArtifact(file:string,data:unknown) {
  writeFileSync(protectedTransferPath(file),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
}
export function loadTransferArtifact(file:string) {
  const path=protectedTransferPath(realpathSync(workspaceFile(file)));
  if((statSync(path).mode & 0o077)!==0)throw Error('Transfer artifacts require private files (0600)');
  return JSON.parse(readFileSync(path,'utf8'));
}
export interface TransferReviewServices {
  network:()=>Promise<unknown>;
  quorumRule:(c:Config)=>Promise<number>;
  latestLedger:()=>Promise<{sequence:number}>;
  nonceEntries:(key:xdr.LedgerKey)=>Promise<{entries:unknown[]}>;
}
export async function reviewTransfer(c:Config,req:Request,services:TransferReviewServices={
  network,quorumRule,latestLedger:()=>server.getLatestLedger(),nonceEntries:key=>server.getLedgerEntries(key),
}) {
  transferPolicy(c,0);
  await services.network();
  const rule=await services.quorumRule(c);
  const ledger=(await services.latestLedger()).sequence;
  const entry=validateTransferRequest(c,req,rule,ledger),cred=credentials(entry);
  const key=xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:cred.address,
    key:xdr.ScVal.scvLedgerKeyNonce(new xdr.ScNonceKey({nonce:cred.nonce})),durability:xdr.ContractDataDurability.temporary}));
  if((await services.nonceEntries(key)).entries.length!==0)throw Error('Transfer nonce already consumed');
  return {ledger,summary:{network:NETWORK,intent:req.intent,requiredSigners:['ceo','cfo'],ruleIds:[rule],
    origin:c.origin,rpId:c.rpId,nonce:cred.nonce.toString(),expirationLedger:cred.signatureExpirationLedger,
    remainingLedgers:cred.signatureExpirationLedger-ledger,challenge:req.challenge}};
}
export interface TransferFinalizationServices {
  review:typeof reviewTransfer;
  transaction:(c:Config,op:xdr.Operation)=>Promise<Transaction>;
  simulate:rpc.Server['simulateTransaction'];
}
export async function finalizeTransfer(config:Config,request:Request,input:TransferAssertion[],services:TransferFinalizationServices={
  review:reviewTransfer,transaction,simulate:server.simulateTransaction.bind(server),
}) {
  const c=structuredClone(config),req=structuredClone(request),assertions=structuredClone(input);
  const {ledger}=await services.review(c,req);
  const op=authorizedTransferOperation(c,req,assertions,ledger);
  await services.review(c,req);
  const tx=await services.transaction(c,op);
  let sim:rpc.Api.SimulateTransactionResponse;
  try {sim=await services.simulate(tx,undefined,'enforce',false);}
  catch {throw Error('Testnet transfer enforce RPC unavailable');}
  if(!rpc.Api.isSimulationSuccess(sim))throw Error('Transfer enforce simulation failed');
  if('restorePreamble' in sim && sim.restorePreamble)throw Error('Separate restoration required');
  if(!sim.result || sim.result.retval.type!=='scvVoid')throw Error('Unexpected transfer simulation return value');
  const built=rpc.assembleTransaction(tx,sim).build();
  enforceFeeCap(built.fee,c.maxFeeStroops,sim.minResourceFee,sim.transactionData.build().resourceFee);
  await services.review(c,req); // Never save a now-expired or consumed proposal.
  return {network:NETWORK,envelopeXdr:built.toXDR(),feeStroops:built.fee,minResourceFee:sim.minResourceFee,
    footprintKeys:[...sim.transactionData.build().resources.footprint.readOnly,...sim.transactionData.build().resources.footprint.readWrite].map(k=>k.toXDR('base64')),
    transactionDataXdr:sim.transactionData.build().toXDR('base64')};
}
async function finalize(c:Config,requestFile:string,files:string[],output:string) {
  protectedTransferPath(output);
  // Invalid assertion files and RPC diagnostics are never echoed to the terminal.
  let artifact:Awaited<ReturnType<typeof finalizeTransfer>>;
  try {artifact=await finalizeTransfer(c,loadTransferArtifact(requestFile),files.map(f=>loadTransferArtifact(f)));}
  catch {throw Error('Transfer finalization failed; check proposal, registered approvals, nonce, expiration and fee cap');}
  saveTransferArtifact(output,artifact);
}
async function unusedProbeNonce(req: ProbeRequest) {
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(req.entryXdr,'base64');
  const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract:credentials(entry).address,
    key:xdr.ScVal.scvLedgerKeyNonce(new xdr.ScNonceKey({nonce:credentials(entry).nonce})),
    durability:xdr.ContractDataDurability.temporary,
  }));
  const result = await server.getLedgerEntries(key);
  if (result.entries.length !== 0) throw Error('Probe nonce already consumed');
}
export async function reviewProbe(c: Config, req: ProbeRequest) {
  await network();
  const rule = await quorumRule(c);
  if (rule !== 0) throw Error('Authorization probe requires on-chain rule 0');
  const ledger = (await server.getLatestLedger()).sequence;
  const summary = probeReview(c,req,rule,ledger);
  await unusedProbeNonce(req);
  return {ledger,summary};
}
export interface ProbeSimulationServices {
  review: typeof reviewProbe;
  transaction: (c:Config,op:xdr.Operation)=>Promise<Transaction>;
  simulate: rpc.Server['simulateTransaction'];
}
export async function simulateProbe(c: Config, req: ProbeRequest, assertions: ProbeAssertion[], services: ProbeSimulationServices = {
  review:reviewProbe,transaction,simulate:server.simulateTransaction.bind(server),
}): Promise<ProbeReport> {
  const {ledger} = await services.review(c,req);
  const operation = authorizedProbeOperation(c,req,assertions,ledger);
  const tx = await services.transaction(c,operation); // Fresh source sequence/time bounds, zero fee-payer signatures.
  let result: rpc.Api.SimulateTransactionResponse;
  try { result = await services.simulate(tx,undefined,'enforce',false); }
  catch { return probeReport(req,'FAIL','Testnet enforce RPC unavailable'); }
  if (!rpc.Api.isSimulationSuccess(result)) {
    // Do not echo diagnostic events containing assertion data.
    const error = 'error' in result ? String(result.error).split('\n')[0].slice(0,512) : 'Unexpected simulation response';
    return probeReport(req,'FAIL',error);
  }
  if ('restorePreamble' in result && result.restorePreamble) return probeReport(req,'FAIL','Separate restoration required');
  if (!result.result || result.result.retval.type !== 'scvVoid') return probeReport(req,'FAIL','Unexpected probe simulation return value');
  const assembled = rpc.assembleTransaction(tx,result).build();
  try { enforceFeeCap(assembled.fee,c.maxFeeStroops,result.minResourceFee,result.transactionData.build().resourceFee); }
  catch { return probeReport(req,'FAIL','Simulation fee exceeds configured limit (maximum 1 XLM)',assembled.fee); }
  return probeReport(req,'PASS',null,assembled.fee);
}
async function main() {
  const [cmd, configFile, ...args] = process.argv.slice(2);
  if (!cmd || !configFile) throw Error('Usage: npm run testnet -- COMMAND CONFIG [ARGS]; see docs/testnet-readiness.md');
  const c = configuration(configFile, ['prepare-probe','review-probe','simulate-probe'].includes(cmd) ? 'probe' : 'transfer');
  await network();
  if (cmd === 'network') console.log(await server.getLatestLedger());
  else if (cmd === 'verify-verifier') { await verifier(c); console.log('Reviewed verifier hash and immutable RP/origin verified'); }
  else if (cmd === 'verify') { await quorumRule(c); console.log('Reviewed hashes, verifier binding, signers and quorum verified'); }
  else if (cmd === 'upload') {
    const type = args[0] as keyof typeof ARTIFACTS;
    const artifact = ARTIFACTS[type]; if (!artifact) throw Error('Expected verifier or account');
    const wasm = readFileSync(resolve(ROOT,'target/wasm32v1-none/release',artifact.file));
    if (sha(wasm).toString('hex') !== artifact.hash) throw Error('Local artifact hash mismatch; review rebuilt artifacts');
    await unsigned(c, Operation.uploadContractWasm({wasm}), args[1]);
  } else if (cmd === 'deploy') {
    const type = args[0] as keyof typeof ARTIFACTS;
    const artifact = ARTIFACTS[type]; if (!artifact) throw Error('Expected verifier or account');
    if (type === 'account') await verifier(c);
    const constructorArgs = type === 'verifier' ? [bytes(Buffer.from(c.rpId)),bytes(Buffer.from(c.origin))] :
      [struct(Object.fromEntries(roles.map(r => [r,bytes(Buffer.from(c.signers[r].publicKey,'hex'))]))),address(c.verifier)];
    const salt = randomBytes(32); console.error('Deployment salt (public):',salt.toString('hex'));
    // Discover deployer authorization; recording does not validate authorization.
    await unsigned(c,Operation.createCustomContract({address:new Address(c.feePayer),wasmHash:Buffer.from(artifact.hash,'hex'),salt,constructorArgs}),args[1],undefined,'record');
  } else if (cmd === 'inventory') {
    await quorumRule(c);
    const ids: number[] = scValToNative(await read(c,c.account,'rule_ids'));
    for (const id of ids) await read(c,c.account,'rule',[u32(id)]);
    const persistentKeys = [...observedKeys].filter(([,k])=> k.type === 'contractCode' ||
      (k.type === 'contractData' && k.contractData.durability.name === 'persistent')).map(([encoded])=>encoded);
    save(args[0],persistentKeys);
    console.log('Account/verifier instance, code and current rule/signer keys inventoried. Token balances and rotation-only lookup entries require separate monitoring.');
  } else if (cmd === 'ttl-status') {
    const keys = (load(args[0]) as string[]).map(k=>xdr.LedgerKey.fromXDR(k,'base64'));
    const result = await server.getLedgerEntries(...keys);
    console.log(JSON.stringify({latestLedger:result.latestLedger,entries:result.entries.map(e=>({key:e.key.toXDR('base64'),
      liveUntilLedger:e.liveUntilLedgerSeq,ttl:e.liveUntilLedgerSeq === undefined ? undefined : e.liveUntilLedgerSeq-result.latestLedger}))},null,2));
    if (result.entries.length !== keys.length) throw Error('Missing entries: inspect archival state and restore before extending');
  } else if (cmd === 'ttl' || cmd === 'restore') {
    // Explicit public LedgerKey XDR list. Never include temporary nonce keys in maintenance.
    const encoded: string[] = load(args[0]);
    const keys = encoded.map(k => xdr.LedgerKey.fromXDR(k,'base64'));
    if (keys.length === 0 || keys.some(k => k.type !== 'contractCode' &&
        !(k.type === 'contractData' && k.contractData.durability.name === 'persistent'))) throw Error('Persistent contract keys only');
    const ttl = Number(args[2] ?? '120960');
    if (!Number.isInteger(ttl) || ttl < 1) throw Error('Invalid TTL');
    const data = new SorobanDataBuilder().setFootprint(cmd === 'ttl' ? keys : [], cmd === 'restore' ? keys : []).build();
    await unsigned(c,cmd === 'ttl' ? Operation.extendFootprintTtl({extendTo:ttl}) : Operation.restoreFootprint(),args[1],data);
  } else if (cmd === 'prepare-probe') {
    const output = workspaceFile(args[0]);
    if (!output.startsWith(ROOT + '/tmp/')) throw Error('Probe artifacts must remain under tmp/');
    const op = probeOperation(c);
    const rule = await quorumRule(c);
    const tx = await transaction(c,op);
    const sim = await simulate(tx,'record');
    const built = rpc.assembleTransaction(tx,sim).build();
    enforceFeeCap(built.fee,c.maxFeeStroops,sim.minResourceFee,sim.transactionData.build().resourceFee);
    const req = buildProbeRequest(c,tx,sim.result?.auth ?? [],rule,sim.latestLedger);
    await unusedProbeNonce(req);
    save(output,req);
    console.log(JSON.stringify(probeReview(c,req,rule,sim.latestLedger),null,2));
  } else if (cmd === 'review-probe') {
    const req: ProbeRequest = load(args[0]);
    console.log(JSON.stringify((await reviewProbe(c,req)).summary,null,2));
  } else if (cmd === 'simulate-probe') {
    const output = workspaceFile(args[3]);
    if (!output.startsWith(ROOT + '/tmp/')) throw Error('Probe artifacts must remain under tmp/');
    const report = await simulateProbe(c,load(args[0]),[load(args[1]),load(args[2])]);
    save(output,report);
    console.log(JSON.stringify(report,null,2));
    if (report.simulation !== 'PASS') process.exitCode = 1;
  } else if (cmd === 'review') {
    const req: Request = load(args[0]);
    console.log(JSON.stringify((await reviewTransfer(c,req)).summary,null,2));
  } else if (cmd === 'prepare') await prepare(c,args[0]);
  else if (cmd === 'finalize') await finalize(c,args[0],[args[1],args[2]],args[3]);
  else if (cmd === 'submit') {
    if (process.env.TESTNET_SUBMISSION_APPROVED !== 'yes') throw Error('Submission disabled; explicit approval required');
    const tx = TransactionBuilder.fromXDR(load(args[0]).envelopeXdr,NETWORK);
    if (!(tx instanceof Transaction) || tx.source !== c.feePayer || tx.signatures.length === 0 || BigInt(tx.fee) > BigInt(c.maxFeeStroops)) throw Error('Invalid externally signed envelope/fee');
    const approved = TransactionBuilder.fromXDR(load(args[1]).envelopeXdr,NETWORK);
    if (!Buffer.from(tx.hash()).equals(approved.hash())) throw Error('Signed envelope differs from reviewed unsigned transaction');
    console.log(JSON.stringify(await server.sendTransaction(tx),null,2));
  } else if (cmd === 'result') {
    const result = await server.getTransaction(args[0]);
    console.log(JSON.stringify(result,(_k,v) => typeof v === 'bigint' ? v.toString() : v,2));
    if (result.status !== 'SUCCESS') throw Error(`Transaction ${result.status}; do not assume execution`);
    if (result.returnValue) console.log('Return value XDR:',result.returnValue.toXDR('base64'));
  } else throw Error('Unknown command');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
