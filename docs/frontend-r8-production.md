# Checkpoint R8.3 — Pucará Production

## Identificación

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-16 |
| Producto | Pucará Institutional Vault |
| Repositorio oficial | `BTorossi-DS/pucara-institutional-vault` |
| Proyecto Vercel | `pucara` |
| Project ID | `prj_lGzY9vKFzdRl28vcsaXqNLoaFNFV` |
| Deployment observado | `AxSH29q46` |
| Commit desplegado | `242ab1f` (`242ab1f705bb43be07382c3ca5fa86480c26b506`) |
| Rama | `feat/pucara-web-mvp` |
| Entorno de hosting | Production |
| Dominio Production | https://pucara-vault.vercel.app |
| Red de la aplicación | Stellar Testnet exclusivamente |

## Observaciones reportadas de Production

Este checkpoint exclusivamente documental registra las observaciones aportadas
por el responsable del proyecto para el deployment indicado:

- Deployment en estado **Ready** observado en Vercel.
- Promoción a **Production** realizada desde el Dashboard de Vercel.
- Aplicación cargando correctamente en el dominio Production.
- Dashboard verificado mediante captura.
- **HTTPS** observado en el dominio.
- Advertencias **Testnet** visibles en la aplicación.

La captura se registra como observación reportada; no se adjunta un nuevo archivo
de imagen en este checkpoint. No se realizó una nueva inspección de Vercel ni
validación de navegador durante esta actualización documental. El estado Ready,
la carga y la captura del Dashboard no verifican por sí solos todos los flujos ni
la exactitud de los datos on-chain mostrados.

## Estado funcional y evidencia on-chain

Pucará es una wallet institucional no custodial sobre Stellar Testnet, basada en
Soroban Smart Account, WebAuthn Passkeys y una política multisig **2-de-3** para
**CEO, CFO y Treasury Manager**. El frontend usa React, TypeScript y Vite, y ofrece
Dashboard, Transfers y Activity.

El frontend realiza consultas on-chain. Sus transferencias y aprobaciones son
exclusivamente de demostración: no ejecuta transferencias reales ni solicita
aprobaciones WebAuthn reales. La autorización WebAuthn real está implementada en
el flujo backend; su integración en el navegador del frontend público sigue
pendiente. Las herramientas locales de navegador existentes son un flujo separado.

Una transferencia multisig fue ejecutada en Stellar Testnet con aprobaciones
independientes CEO + CFO:

- Transaction hash:
  `55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2`.
- Ledger: **5230325**.
- Resultado documentado: **SUCCESS**, transferencia de **1 XLM Testnet**.
- [Evidencia pública de la transferencia](testnet-multisig-proof.md).
- [Transacción en Stellar Expert (Testnet)](https://stellar.expert/explorer/testnet/tx/55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2).

Esta evidencia histórica no acredita ejecución de transferencias desde el frontend
publicado. No se ejecutaron nuevas transacciones en este checkpoint.

## Validaciones pendientes en Production

**El acceso anónimo todavía no fue verificado mediante una sesión privada
independiente.**

**Transfers, Activity y responsive móvil requieren validación final en
Production.** Estas pruebas no se consideran completadas. La inspección reportada
del Dashboard no sustituye dichas validaciones.

El [checkpoint anterior de Preview](frontend-f3-preview.md) conserva su valor
histórico. La publicación de Production no implica que las condiciones de
validación allí enumeradas se hayan completado.

## Limitaciones y seguridad

- Contratos sin auditoría externa.
- Frontend sin ejecución de transferencias reales.
- WebAuthn todavía no integrado al navegador del frontend público.
- No apto para custodiar fondos reales; uso exclusivo de Stellar Testnet.
- Acceso anónimo y validación móvil pendientes de confirmación final.

Production describe el entorno de hosting, no una habilitación para operar en
Stellar Mainnet ni una certificación de seguridad.

## Alcance documental

Este checkpoint actualiza únicamente `README.md` y
`docs/frontend-r8-production.md`. No modifica código frontend, contratos Soroban,
WebAuthn, dependencias ni configuración Vercel. No crea deployments, no ejecuta
transacciones Stellar y no lee ni incorpora secretos. Las instrucciones técnicas,
la evidencia on-chain y los checkpoints anteriores se conservan.
