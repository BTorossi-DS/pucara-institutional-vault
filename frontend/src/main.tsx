import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StrKey } from '@stellar/stellar-sdk';
import { DEFAULT_ACCOUNT, explorer, formatXlm, validAddress, validAmount } from './domain';
import * as stellar from './stellar';
import './style.css';
const account = import.meta.env.VITE_SMART_ACCOUNT || DEFAULT_ACCOUNT;
const configured = StrKey.isValidContract(account);
const short = (s: string) => `${s.slice(0, 9)}…${s.slice(-7)}`;
const roleNames: Record<string, string> = { ceo: 'CEO', cfo: 'CFO', treasury_manager: 'Treasury Manager' };
type Snapshot = {
    network: stellar.ReadResult<number>;
    balance: stellar.ReadResult<string>;
    signers: stellar.ReadResult<Record<string, string>>;
    rules: stellar.ReadResult<number>;
    activity: stellar.Activity;
    at: string;
};
function App() {
    const refreshing = useRef(false);
    const [page, setPage] = useState('Dashboard');
    const [data, setData] = useState<Snapshot>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [destination, setDestination] = useState('');
    const [amount, setAmount] = useState('');
    const [review, setReview] = useState(false);
    async function refresh() { if (refreshing.current)
        return; refreshing.current = true; setBusy(true); setError(''); setData(undefined); try {
        if (!configured)
            throw Error('VITE_SMART_ACCOUNT debe ser un Contract ID válido de Testnet.');
        const network = await stellar.attempt(stellar.network);
        if (network.error)
            throw Error('No se pudo verificar Stellar Testnet. Las consultas de cuenta están detenidas.');
        const [balance, signers, rules, activity] = await Promise.all([stellar.attempt(() => stellar.balance(account)), stellar.attempt(() => stellar.signers(account)), stellar.attempt(() => stellar.rules(account)), account === DEFAULT_ACCOUNT ? stellar.activity() : Promise.resolve([])]);
        setData({ network, balance, signers, rules, activity, at: new Date().toLocaleString('es-AR') });
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo consultar la red.');
    }
    finally {
        refreshing.current = false;
        setBusy(false);
    } }
    useEffect(() => { void refresh(); }, []);
    const pending = busy ? 'Consultando…' : 'Sin datos';
    const activityView = <><div className="section-head"><div><h2>{page === 'Dashboard' ? 'Última actividad documentada' : 'Actividad verificable'}</h2><p>Operaciones documentadas del vault · Stellar Testnet</p></div><span className="tag">Evidencia pública</span></div><p className="muted">Registro acotado a los hashes publicados en el repositorio. No representa un historial completo ni garantiza la última operación de la cuenta.</p>{data?.activity.map(tx => <a className="transaction" href={explorer('tx', tx.hash)} key={tx.hash} target="_blank" rel="noreferrer"><span className="tx-icon">↗</span><div><strong>{tx.label}</strong><code>{short(tx.hash)} · Ledger documentado {tx.ledger}</code><small>{tx.result.value ? new Date(tx.result.value.date).toLocaleString('es-AR') : tx.result.error}</small></div><span className={tx.result.value?.successful ? 'tag' : 'tag neutral'}>{tx.result.value ? (tx.result.value.successful ? 'Confirmada' : 'Fallida') : 'No verificada'}</span><span>↗</span></a>)}{data?.activity.length === 0 && <p className="empty">Sin evidencia histórica configurada para esta cuenta.</p>}{!data && <p className="empty">{pending}. No se presentan transacciones como verificadas sin una consulta exitosa.</p>}</>;
    return <><a className="skip" href="#main">Saltar al contenido</a><div className="shell"><aside><a className="brand" href="#" aria-label="Pucará · Dashboard" onClick={() => setPage('Dashboard')}><img src="/brand/logo.svg" alt="PUCARÁ" width="152" height="108" /></a><p className="eyebrow sidebar-label">INSTITUTIONAL VAULT</p><nav aria-label="Navegación principal">{['Dashboard', 'Transfers', 'Activity'].map((p, i) => <button className={page === p ? 'active' : ''} aria-current={page === p ? 'page' : undefined} key={p} onClick={() => setPage(p)}><span>{['◫', '↗', '◷'][i]}</span>{p}<span className="nav-arrow">{page === p ? '›' : ''}</span></button>)}</nav><div className="aside-bottom"><span className="network-dot"/> Stellar Testnet<p>Infraestructura abierta.<br />Control institucional.</p><small>Prototipo · Checkpoint F2</small></div></aside><main id="main" tabIndex={-1}><header><div className="breadcrumb">Workspace <span>/</span> Tesorería institucional</div><span className="tag neutral">SOLO TESTNET</span></header><div className="content"><div className="page-heading"><div><p className="eyebrow">PUCARÁ / TESORERÍA</p><h1>{page === 'Dashboard' ? 'Tu tesorería, bajo control.' : page === 'Transfers' ? 'Preparar transferencia.' : 'Cada movimiento, verificable.'}</h1><p>{page === 'Dashboard' ? 'Visibilidad on-chain. Gobernanza compartida.' : page === 'Transfers' ? 'Explorá el flujo de revisión institucional en modo demostración.' : 'Evidencia pública de las operaciones documentadas.'}</p></div><button className="button secondary" disabled={busy} onClick={() => void refresh()}>{busy ? 'Consultando…' : '↻ Actualizar'}</button></div><div className="notice"><span>◈</span><div><strong>Entorno de demostración</strong> · Solo activos de Stellar Testnet. Las transferencias y aprobaciones desde esta web están deshabilitadas.</div></div>{error && <div role="alert" className="error">{error}</div>}
    {page === 'Dashboard' && <><div className="dashboard-grid"><section className="balance-card"><p className="eyebrow">BALANCE DISPONIBLE</p><h2>{data?.balance.value !== undefined ? formatXlm(BigInt(data.balance.value)) : pending}<span> XLM</span></h2><p>Stellar Lumens · Testnet</p>{data?.balance.error && <p role="alert">{data.balance.error}</p>}<div className="balance-footer"><span>Smart Account</span><span>LECTURA ON-CHAIN ↗</span></div></section><section className="card network-card"><p className="eyebrow">ESTADO DE RED</p><h2><span className="network-dot"/>{data ? 'Conectada a Testnet' : busy ? 'Verificando red' : 'Sin conexión verificada'}</h2><p>Stellar · Soroban</p><div className="divider"/><div className="row"><span>Último ledger consultado</span><strong>{data?.network.value?.toLocaleString('es-AR') ?? '—'}</strong></div><small>{data ? `Consulta: ${data.at}` : 'Actualizá para verificar el estado.'}</small></section></div><section className="card address-card"><div><p className="eyebrow">SMART ACCOUNT</p><code>{account}</code></div>{configured && <a href={explorer('contract', account)} target="_blank" rel="noreferrer">Ver contrato ↗</a>}</section><div className="dashboard-grid lower"><section className="card"><div className="section-head"><h2>Política multisig</h2><span className="tag neutral">Passkeys</span></div><div className="quorum">{account === DEFAULT_ACCOUNT ? <>2 <span>de</span> 3</> : '—'}</div><p>{account === DEFAULT_ACCOUNT ? 'Política documentada del contrato institucional.' : 'Sin política documentada para esta cuenta.'}</p><p className="muted">La consulta de reglas no constituye una auditoría del quorum.</p><div className="divider"/><div className="row"><span>Reglas actuales consultables</span><strong>{data?.rules.value ?? '—'}</strong></div>{data?.rules.error && <small role="alert">{data.rules.error}</small>}</section><section className="card"><div className="section-head"><h2>Firmantes institucionales</h2><span className="tag neutral">WebAuthn</span></div>{Object.entries(roleNames).map(([role, label], i) => <div className="signer" key={role}><span className="avatar">{['CE', 'CF', 'TM'][i]}</span><div><strong>{label}</strong><code title={data?.signers.value?.[role]}>{data?.signers.value?.[role] ? short(data.signers.value[role]) : 'Clave pública no disponible'}</code></div><span className="signer-state">{data?.signers.value ? 'Leído on-chain' : 'Sin verificar'}</span></div>)}{data?.signers.error && <small role="alert">{data.signers.error}</small>}</section></div><section className="card">{activityView}</section></>}
    {page === 'Activity' && <section className="card">{activityView}</section>}
    {page === 'Transfers' && <section className="card transfer-card"><div className="section-head"><h2>{review ? 'Revisión de demostración' : 'Nueva propuesta visual'}</h2><span className="tag neutral">DEMO</span></div>{!review ? <form onSubmit={e => { e.preventDefault(); if (validAddress(destination) && validAmount(amount))
        setReview(true); }}><label>Cuenta de origen<code className="field-readonly">{account}</code></label><label htmlFor="destination">Destino Stellar</label><input maxLength={56} id="destination" value={destination} onChange={e => setDestination(e.target.value.trim())} placeholder="Dirección pública G… o C…" required aria-invalid={!!destination && !validAddress(destination)}/>{destination && !validAddress(destination) && <small role="alert">Ingresá una dirección pública Stellar válida.</small>}<label htmlFor="amount">Importe · XLM Testnet</label><input maxLength={30} id="amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0000000" required aria-invalid={!!amount && !validAmount(amount)}/><p className="muted">Hasta 7 decimales. El importe es ilustrativo; no se consulta disponibilidad ni se estima un fee.</p><button className="button" disabled={!configured || !validAddress(destination) || !validAmount(amount)}>Revisar demostración →</button></form> : <><dl><dt>Origen</dt><dd>{account}</dd><dt>Destino ingresado · sin verificar red</dt><dd>{destination}</dd><dt>Importe ilustrativo</dt><dd>{amount} XLM Testnet</dd></dl><h3>Estados de aprobación · demostración</h3>{['CEO', 'CFO', 'Ejecución Soroban'].map(r => <div className="approval" key={r}><span>{r}</span><span>Sin iniciar · deshabilitada</span></div>)}<p className="muted">No se creó una propuesta on-chain ni se solicitaron passkeys. No hay aprobaciones reales.</p><button className="button secondary" onClick={() => setReview(false)}>← Editar</button> <button className="button" disabled>Envío deshabilitado</button></>}</section>}
    <footer><span>PUCARÁ · Institutional Vault</span><span>No custodial · Sin fondos reales · Blend V2 próximamente</span></footer></div></main></div></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
