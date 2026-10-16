# Checkpoint 3 — progreso en Stellar Testnet

Fecha: 2026-10-16. Rama: `feat/smart-account-setup`.

## Estado confirmado

- WebAuthn Verifier Wasm publicado en Stellar Testnet.
- Upload `SUCCESS`, verificado on-chain mediante el resultado de la transacción
  y la recuperación del Wasm publicado.
- Transaction hash:
  `c9e2f3172deadff59766d23b75d6213ad2db2b63dbe08eec636918fe42502eec`.
- Ledger de inclusión: `5222864`.
- Wasm hash SHA-256:
  `c1ac3c76abf9a9a647695c8eba212dc03f2cac079c2b94525a335bd658359564`.
- Fee real cobrado: `90028122` stroops, equivalentes a **9,0028122 XLM Testnet**.
- Se envió una única transacción `uploadContractWasm`; no se desplegaron instancias.
- Fee payer existente y financiado:
  `GDBSP3BBHMZQ6LVNQTFNK6THMXFJDBTIHCY7FVRMJ26AP4VSJAZ6XXX2`.
- Tres passkeys registradas: CEO, CFO y Treasury Manager.
- Network passphrase: `Test SDF Network ; September 2015`.
- Límite general de fees restaurado a `10000000` stroops (**1 XLM**).
  El máximo temporal de 12 XLM se aplicó exclusivamente al upload autorizado.

## Bloqueo actual

- Deploy de la instancia del WebAuthn Verifier no ejecutado.
- La simulación de `createContractV2` falla con
  `HostError: Error(Auth, InvalidAction)` y el diagnóstico
  `Unauthorized function call for address` para el fee payer.
- El fallo ocurre durante la simulación con autorización `enforce`.
- No se obtuvo estimación de fees para el deploy.
- No existe envelope de deploy.
- Contract ID previsto para ese intento:
  `CBJPE2MXKZTEEVO65RAVGBAN246ZJZ2GQUG2STVBDKZNRKSQRVMXYAWY`.
  Ese Contract ID **NO está desplegado**. Se calculó a partir de Testnet,
  el fee payer y el salt público de ese intento:
  `eba319ef0b827d6183a31ad08e3b229638992d3764bee1ec24611b2133cf7009`.
  Un nuevo intento puede utilizar otro salt y producir otra dirección.
- Constructor: `__constructor(rp_id: Bytes, origin: Bytes)`.
- Argumentos exactos, en orden y como bytes UTF-8:
  1. RP-ID: `localhost`.
  2. Origin: `https://localhost:8443`.

## Código y validación del checkpoint

- El rechazo por exceso de fees informa el total estimado y el límite en
  stroops y XLM, además de los componentes expuestos por el SDK.
- Se conserva el bloqueo de fees antes de guardar el envelope.
- El test específico comprueba el diagnóstico, el rechazo por exceso y la
  aceptación en el límite exacto.
- TypeScript strict: PASS (`npm run typecheck`).
- Tests Node: 6/6 PASS (`npm test`).
- No se modificaron contratos Rust ni archivos Wasm para este checkpoint.
- `tmp/`, claves privadas, certificados TLS, envelopes firmados, archivos XDR
  y demás datos sensibles quedan fuera del commit.

## Próximo paso

Diagnosticar la autorización de `createContractV2` y corregir exclusivamente
lo necesario para conseguir una simulación exitosa.

No se investigó ni corrigió ese bloqueo durante este checkpoint. No se
autoriza con este documento ninguna firma, envío ni despliegue adicional.
