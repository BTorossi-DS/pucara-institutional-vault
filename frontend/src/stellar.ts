import { Account, Address, BASE_FEE, Contract, Horizon, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative } from '@stellar/stellar-sdk';
import { assertTestnet, EVIDENCE, NATIVE_TOKEN } from './domain.ts';
const server = new rpc.Server('https://soroban-testnet.stellar.org', { timeout: 15000 });
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');
server.httpClient.defaults.timeout = 15000;
horizon.httpClient.defaults.timeout = 15000;
// Public source address used only to construct unsigned read simulations. No key exists in this app.
const SOURCE = 'GDBSP3BBHMZQ6LVNQTFNK6THMXFJDBTIHCY7FVRMJ26AP4VSJAZ6XXX2';
export type ReadResult<T> = {
    value: T;
    error?: never;
} | {
    value?: never;
    error: string;
};
export async function attempt<T>(work: () => Promise<T>): Promise<ReadResult<T>> { try {
    return { value: await work() };
}
catch {
    return { error: 'Consulta no disponible. El servicio puede estar fuera de línea o el estado archivado. Reintentá actualizar.' };
} }
export async function network() { const n = await server.getNetwork(); assertTestnet(n.passphrase); const ledger = await server.getLatestLedger(); return ledger.sequence; }
async function read(account: string, method: string, args: Parameters<Contract['call']>[1][] = []) {
    const tx = new TransactionBuilder(new Account(SOURCE, '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(new Contract(account).call(method, ...args)).setTimeout(30).build();
    const sim = await server.simulateTransaction(tx, undefined, 'enforce', false);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result || rpc.Api.isSimulationRestore(sim))
        throw Error('Lectura o restauración requerida');
    return scValToNative(sim.result.retval);
}
export async function balance(account: string): Promise<string> { const n: unknown = await read(NATIVE_TOKEN, 'balance', [new Address(account).toScVal()]); if (typeof n !== 'bigint' || n < 0n)
    throw Error('Balance inválido'); return n.toString(); }
export async function signers(account: string): Promise<Record<string, string>> {
    const s = await read(account, 'signers');
    const output: Record<string, string> = {};
    for (const role of ['ceo', 'cfo', 'treasury_manager']) {
        const bytes = s?.[role];
        if (!(bytes instanceof Uint8Array) || bytes.length !== 65 || bytes[0] !== 4)
            throw Error('Firmantes inválidos');
        output[role] = Array.from(bytes, (b: number) => b.toString(16).padStart(2, '0')).join('');
    }
    return output;
}
export async function rules(account: string): Promise<number> {
    const ids: unknown = await read(account, 'rule_ids');
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !Number.isInteger(id) || id < 0))
        throw Error('Reglas inválidas');
    // Read each live rule; the documented quorum is displayed separately, without asserting an audit.
    await Promise.all(ids.map(id => read(account, 'rule', [nativeToScVal(id, { type: 'u32' })])));
    return ids.length;
}
export async function activity() {
    return Promise.all(EVIDENCE.map(async evidence => ({
        ...evidence,
        result: await attempt(async () => {
            try {
                const tx = await server.getTransaction(evidence.hash);
                if (tx.status !== rpc.Api.GetTransactionStatus.NOT_FOUND && tx.txHash === evidence.hash && tx.ledger === evidence.ledger) {
                    return { successful: tx.status === rpc.Api.GetTransactionStatus.SUCCESS,
                        date: new Date(tx.createdAt * 1000).toISOString(), ledger: tx.ledger };
                }
            } catch { /* Horizon can still retain a record that RPC cannot return. */ }
            const tx = await horizon.transactions().transaction(evidence.hash).call();
            if (tx.hash !== evidence.hash || tx.ledger_attr !== evidence.ledger) throw Error('Evidencia no coincide');
            return { successful: tx.successful, date: tx.created_at, ledger: tx.ledger_attr };
        })
    })));
}
export type Activity = Awaited<ReturnType<typeof activity>>;
