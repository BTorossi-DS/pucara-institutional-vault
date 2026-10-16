import { Networks, StrKey } from '@stellar/stellar-sdk';
export const DEFAULT_ACCOUNT = 'CB2ZCJX4PB45LRQJ3CRCJ5JZ7O4DHONXMQV6U6RSIMXQ6KHYVNFZYYFH';
export const NATIVE_TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
export const EVIDENCE = [
    { hash: '55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2', label: 'Salida institucional · CEO + CFO', ledger: 5230325 },
    { hash: '38ad66c749cde2aa735981fe04faae481515aaad232cd35aac3cae354b7eec4d', label: 'Financiación de la Smart Account', ledger: 5228445 },
];
export const explorer = (kind: 'contract' | 'tx', id: string) => `https://stellar.expert/explorer/testnet/${kind}/${id}`;
export function validAddress(value: string) { return StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value); }
export function validAmount(value: string) { return /^\d+(\.\d{1,7})?$/.test(value) && BigInt(value.replace('.', '').padEnd(value.includes('.') ? value.indexOf('.') + 7 : value.length + 7, '0')) > 0n; }
export function formatXlm(value: bigint) { const sign = value < 0n ? '-' : ''; const n = value < 0n ? -value : value; return `${sign}${n / 10000000n}.${(n % 10000000n).toString().padStart(7, '0')}`; }

export function assertTestnet(passphrase: string) {
    if (passphrase !== Networks.TESTNET) throw Error("Red distinta de Testnet");
}
