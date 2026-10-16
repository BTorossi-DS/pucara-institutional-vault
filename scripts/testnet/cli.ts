import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createPublicKey, verify as verifySignature } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Address, BASE_FEE, Contract, Networks, Operation, SorobanDataBuilder, Transaction, TransactionBuilder, rpc, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { NETWORK, RPC, bytes, challenge, credentials, withCredentials, external, sha, signaturePayload, struct, u32 } from './auth.ts';
import type { Assertion } from './auth.ts';

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
export function configuration(file: string): Config {
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
  if (!Number.isInteger(c.expirationLedgers) || c.expirationLedgers < 10 || c.expirationLedgers > 120) throw Error('Expiry must be 10..120 ledgers');
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
async function unsigned(c: Config, op: xdr.Operation, output: string, data?: xdr.SorobanTransactionData) {
  const tx = await transaction(c, op, data);
  const sim = await simulate(tx);
  const built = rpc.assembleTransaction(tx, sim).build();
  if (BigInt(built.fee) > BigInt(c.maxFeeStroops)) throw Error('Fee cap exceeded');
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
export function transfer(c: Config, auth?: xdr.SorobanAuthorizationEntry[]) {
  address(c.token); address(c.account); address(c.recipient);
  if (!/^[1-9][0-9]*$/.test(c.amount) || BigInt(c.amount) >= 2n ** 127n) throw Error('Positive i128 base-unit amount required');
  const args = [address(c.account), address(c.recipient),
    nativeToScVal(BigInt(c.amount), {type:'i128'})];
  return Operation.invokeContractFunction({contract: c.token, function: 'transfer', args, auth});
}
async function prepare(c: Config, output: string) {
  const rule = await quorumRule(c);
  const tx = await transaction(c, transfer(c));
  const sim = await simulate(tx, 'record');
  const auth = sim.result?.auth;
  if (!auth || auth.length !== 1 || Address.fromScAddress(credentials(auth[0]).address).toString() !== c.account) throw Error('Unexpected authorization tree');
  const entry = withCredentials(auth[0], {signatureExpirationLedger:sim.latestLedger + c.expirationLedgers});
  save(output, {network: NETWORK, entryXdr: entry.toXDR('base64'), ruleIds: [rule],
    challenge: challenge(entry, [rule]).toString('base64url'), origin: c.origin, rpId: c.rpId,
    signers: c.signers, pair: c.pair,
    intent: {account: c.account, token: c.token, recipient: c.recipient, amount: c.amount,
      expirationLedger: credentials(entry).signatureExpirationLedger}} satisfies Request);
}
export function validateRequest(c: Config, req: Request, rule: number) {
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
function assertion(c: Config, req: Request, file: string): Assertion {
  const a = load(file);
  if (!c.pair.some(r => c.signers[r].publicKey.toLowerCase() === a.publicKey.toLowerCase())) throw Error('Unapproved signer');
  const rawClient = Buffer.from(a.clientDataJSON, 'base64');
  const client = JSON.parse(rawClient.toString());
  const ad = Buffer.from(a.authenticatorData, 'base64');
  if (client.type !== 'webauthn.get' || client.challenge !== req.challenge || client.origin !== c.origin ||
      client.crossOrigin === true || client.topOrigin !== undefined || ad.length < 37 ||
      !ad.subarray(0,32).equals(sha(Buffer.from(c.rpId))) || (ad[32] & 5) !== 5) throw Error('Invalid WebAuthn binding/UV');
  const compact = execFileSync(resolve(ROOT, '.tools/cargo/bin/cargo'),
    ['run', '--quiet', '--locked', '-p', 'institutional-account', '--example', 'normalize_assertion', '--', a.signatureDER],
    {cwd: ROOT, encoding: 'utf8'}).trim();
  const pk = Buffer.from(a.publicKey, 'hex');
  const key = createPublicKey({format:'jwk', key:{kty:'EC', crv:'P-256', x:pk.subarray(1,33).toString('base64url'), y:pk.subarray(33).toString('base64url')}});
  if (!verifySignature('sha256', Buffer.concat([ad, sha(rawClient)]), {key,dsaEncoding:'ieee-p1363'}, Buffer.from(compact,'hex'))) throw Error('Invalid passkey signature');
  return {...a, signature:compact};
}
async function finalize(c: Config, requestFile: string, files: string[], output: string) {
  const rule = await quorumRule(c);
  const req: Request = load(requestFile);
  const entry = validateRequest(c, req, rule);
  const ledger = (await server.getLatestLedger()).sequence;
  const expiry = credentials(entry).signatureExpirationLedger;
  if (expiry <= ledger + 5 || expiry > ledger + 120) throw Error('Authorization expired or outside policy');
  const assertions = files.map(f => assertion(c, req, f));
  const signedEntry = withCredentials(entry, {signature:signaturePayload(c.verifier,[rule],assertions)});
  // Mandatory second simulation executes __check_auth with actual assertions.
  await unsigned(c, transfer(c,[signedEntry]), output);
}
async function main() {
  const [cmd, configFile, ...args] = process.argv.slice(2);
  if (!cmd || !configFile) throw Error('Usage: npm run testnet -- COMMAND CONFIG [ARGS]; see docs/testnet-readiness.md');
  const c = configuration(configFile);
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
    await unsigned(c,Operation.createCustomContract({address:new Address(c.feePayer),wasmHash:Buffer.from(artifact.hash,'hex'),salt,constructorArgs}),args[1]);
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
  } else if (cmd === 'review') {
    const req: Request = load(args[0]);
    const entry = validateRequest(c,req,await quorumRule(c));
    console.log(JSON.stringify({intent:req.intent,challenge:challenge(entry,req.ruleIds).toString('base64url')},null,2));
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
