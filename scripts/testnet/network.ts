// Read-only Testnet configuration snapshot; no account or credentials required.
import {rpc, xdr} from '@stellar/stellar-sdk';
import {NETWORK, RPC} from './auth.ts';
const server = new rpc.Server(RPC);
const network = await server.getNetwork();
if (network.passphrase !== NETWORK) throw Error('Wrong network');
const names = ['configSettingContractMaxSizeBytes', 'configSettingContractComputeV0',
  'configSettingContractLedgerCostV0', 'configSettingContractHistoricalDataV0',
  'configSettingContractEventsV0', 'configSettingContractBandwidthV0', 'configSettingStateArchival'] as const;
const keys = names.map(n => xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({configSettingId:xdr.ConfigSettingId[n]})));
const entries = await server.getLedgerEntries(...keys);
console.log(JSON.stringify({network, latestLedger:entries.latestLedger,
  settings:entries.entries.map(e=>e.val.toXdrObject())}, (_k,v)=>typeof v === 'bigint' ? v.toString() : v, 2));
