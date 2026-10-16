# Checkpoint 4.5 — WebAuthn Authorization Ready

Fecha: 2026-10-16. Rama: `feat/smart-account-setup`.
Base publicada: Checkpoint 4 (`8475bc1b858e7c0b8950e719da7be91d2f9b9683`).
Este checkpoint conserva los contratos e instancias Testnet del registro histórico
incluido debajo. No modifica contratos Rust, Wasm, dependencias ni despliegues.

## Integración completada

- `prepare-probe` y `review-probe` reconocen exclusivamente la operación
  `SmartAccount.execute(Verifier, "origin", [])`, con CEO + CFO, regla 0,
  RP-ID `localhost` y origin `https://localhost:8443`.
- Se verifican red Testnet, hashes revisados, contratos, firmantes, árbol exacto,
  nonce no consumido, expiración, challenge y cuerpo de la operación. El challenge
  Soroban vincula invocación, red, nonce, expiración y regla; no vincula campos de
  transporte como secuencia del fee payer. El límite sigue en 1 XLM de fees Testnet.
- El servidor de enrolamiento ofrece un modo de autorización explícito, con revisión
  antes de la captura, credenciales por rol, UP/UV, binding de origin/RP/challenge,
  validación P-256 y normalización DER/low-S mediante las dependencias existentes.
- Cada sesión fija una propuesta; no reemplaza challenges ni sobrescribe un rol
  aceptado. Cargar la página o revisar no inicia WebAuthn. Ambas aprobaciones
  requieren acciones manuales independientes sobre el mismo challenge.
- `simulate-probe` y el botón de simulación construyen una transacción nueva sin
  firmas del fee payer, reutilizan el payload Soroban existente y solicitan
  `authMode=enforce`. Producen un reporte; este checkpoint no demuestra todavía
  aceptación del quorum real por los contratos desplegados.
- El flujo de transferencias se conserva y rechaza propuestas probe.

## HTTPS y validación

El preflight 4.28B.2 preparó y revisó una propuesta local y arrancó el servidor
existente en modo autorización. La página, JavaScript y configuración devolvieron
HTTP 200 con validación TLS activa y confianza explícita en el certificado local
existente. No se desactivó TLS. El certificado cubre localhost y está vigente.
La clave TLS local se restringió a 0600 sin cambiar su contenido; no se versiona.
El contenedor no confía en la CA por defecto y la confianza en el navegador del Mac
sigue pendiente. El servidor se detuvo después de peticiones GET, sin ceremonias.

Checks de publicación:

- TypeScript strict: PASS (`npm run typecheck`).
- Node: 16/16 PASS (`npm test`): firmas sintéticas en memoria, serialización de quorum,
  rechazos por binding, expiración/replay, sesiones inmutables, gating HTTP/CSRF/Host,
  ausencia de inicio automático de WebAuthn, enforce obligatorio y límite de fees.
- Sintaxis JavaScript del cliente y `git diff --check`: PASS.
- Las pruebas de integración usan navegador y RPC simulados; no son una prueba real
  del CEO Touch ID y CFO YubiKey contra Testnet.
- Se mantienen los hashes Wasm del Checkpoint 4; no se reconstruyeron contratos.

## Límites, artefactos y siguiente paso

Solo se publican código, tests sintéticos y documentación. Quedan fuera de Git:
`tmp/`, registros de passkeys reales, propuestas/challenges, assertions, reportes
locales, envelopes, certificados, claves TLS, identidades CLI, seeds y secretos.
Los archivos de test contienen identidades sintéticas; las claves privadas de los
fixtures se generan en memoria y nunca se serializan. No se cambió `.gitignore`.

Estado pendiente:

1. Confirmar HTTPS confiable en el Mac, preservando el origin literal localhost.
2. En una etapa autorizada, consultar el ledger y regenerar explícitamente cualquier
   propuesta vencida, usando un nombre nuevo y ejecutando `review-probe` otra vez.
   El servidor requiere más de cinco ledgers restantes. No reutilizar automáticamente
   las propuestas del preflight ni trasladar assertions entre challenges.
3. Capturar CEO Touch ID y CFO YubiKey reales sobre la misma propuesta revisada.
   La independencia de personas/dispositivos es operativa: no hay attestation que
   certifique el modelo de hardware o la custodia independiente.
4. Validar ambas assertions y obtener PASS en simulación Soroban `enforce` del probe
   contra las instancias desplegadas, sin firmar con el fee payer ni enviar.
5. Después, preparar y autorizar por separado la primera transferencia de **1 XLM
   Testnet**. Su ejecución sigue pendiente y no está autorizada por esta publicación.

El proyecto sigue siendo un prototipo solo Testnet, sin auditoría y sin garantía de
producción. Persisten las limitaciones del Checkpoint 4: recuperación, TTL/archivo,
ausencia de límites de gasto en el contrato, custodia de los roles y Blend V2/USDC
pendiente. Se pausa el desarrollo tras publicar este checkpoint.

---

# Checkpoint 4 — vault institucional desplegada en Stellar Testnet

Fecha: 2026-10-16. Rama: `feat/smart-account-setup`.

Este checkpoint sustituye el bloqueo de deploy documentado en el Checkpoint 3.
Ambos Wasm están publicados y ambas instancias están desplegadas, con resultados
`SUCCESS` y configuración verificada on-chain. Sigue siendo un prototipo Testnet
sin auditoría, no una wallet institucional lista para producción.

## Red, artefactos e instancias definitivas

- Red: **Stellar Testnet**, passphrase `Test SDF Network ; September 2015`.
- Fee payer público:
  `GDBSP3BBHMZQ6LVNQTFNK6THMXFJDBTIHCY7FVRMJ26AP4VSJAZ6XXX2`.
- Límite general: `10000000` stroops (**1 XLM**), sin cambios permanentes.
- WebAuthn Verifier:
  `CAZS2AXQZGPMSV2NWLTMPNUE6IJJ65F6G3QWEKMGXKQAPCAWROWQRYEP`.
- Institutional Smart Account:
  `CB2ZCJX4PB45LRQJ3CRCJ5JZ7O4DHONXMQV6U6RSIMXQ6KHYVNFZYYFH`.

| Artefacto | SHA-256 Wasm publicado |
| --- | --- |
| WebAuthn Verifier | `c1ac3c76abf9a9a647695c8eba212dc03f2cac079c2b94525a335bd658359564` |
| Institutional Smart Account | `33990cee9e300532e9b0b1c5bf0641f07e12c1a3f5f60ad1502561f74721a1e0` |

Estas son las instancias realmente desplegadas; las direcciones calculadas en
intentos de preparación anteriores no identifican estos despliegues.

## Transacciones confirmadas

Todos los fees de la tabla son los importes efectivamente cobrados en Testnet,
obtenidos de los resultados on-chain, no las estimaciones de simulación.

| Operación | Transaction hash | Ledger | Fee real (stroops) | Fee real (XLM Testnet) |
| --- | --- | --- | --- | --- |
| Upload Wasm Verifier | `c9e2f3172deadff59766d23b75d6213ad2db2b63dbe08eec636918fe42502eec` | `5222864` | `90028122` | `9.0028122` |
| Deploy Verifier | `6ce4b321cc98e24291ec7c1441af4ea6d11a8ac892612311efd6e5f18b531591` | `5225658` | `172969` | `0.0172969` |
| Upload Wasm Smart Account | `18b510a0092f853e7207098991f91839793486147e4387c40263cdf9c33c9749` | `5225759` | `131349976` | `13.1349976` |
| Deploy Smart Account | `345aad9d488cf0e5b030dfd6f47450b53fa95219018ffce2ca4d858a7e0862d1` | `5225936` | `3249033` | `0.3249033` |

Cada transacción fue autorizada por separado y terminó en `SUCCESS`. Los uploads
usaron límites excepcionales de 12 XLM para el Verifier y 18 XLM para Smart Account;
no cambiaron el límite general de 1 XLM. Los dos deploys respetaron ese límite.
El último deploy tenía un fee estimado de `3737817` stroops (**0.3737817 XLM**).

## Constructores y configuración institucional

El Verifier se creó mediante `createContractV2` con el constructor
`__constructor(rp_id: Bytes, origin: Bytes)`, en este orden:

1. `rp_id`: bytes UTF-8 de `localhost`.
2. `origin`: bytes UTF-8 de `https://localhost:8443`.

El origin y el hash SHA-256 del RP ID se consultaron después del deploy y
coinciden con esos valores. La configuración del Verifier es inmutable.

Smart Account se creó atómicamente mediante `createContractV2` con el constructor
`__constructor(signers: InstitutionalSigners, verifier: Address)`, en este orden:

1. Un struct Soroban con campos `ceo`, `cfo` y `treasury_manager`. Cada campo es
   una clave pública P-256 no comprimida de exactamente 65 bytes (`BytesN<65>`).
2. La dirección definitiva del Verifier indicada arriba, como `Address`.

Se validaron los tres roles CEO, CFO y Treasury Manager, las tres claves públicas
distintas y su pertenencia a P-256, y tres credential IDs distintos de los registros
locales. Los valores de las claves y los credential IDs no se publican aquí.
El constructor recibe las claves públicas; los credential IDs permanecen como
metadatos del cliente y no se almacenan en el contrato.

La política **2 de 3** usa reglas OpenZeppelin sin políticas adicionales:

| Rule ID inicial | Firmantes requeridos |
| --- | --- |
| `0` | CEO + CFO |
| `1` | CEO + Treasury Manager |
| `2` | CFO + Treasury Manager |
| `3` | CEO + CFO + Treasury Manager |

Cada regla exige todos sus firmantes. No hay regla de un solo firmante. Los tres
signers son de tipo `External` y están vinculados al mismo Verifier verificado.
La firma Ed25519 del fee payer autoriza el deploy; no sustituye las aprobaciones
WebAuthn del quorum en futuras operaciones de la Smart Account.

## Flujo de simulación y validación

El cambio incluido en `scripts/testnet/cli.ts`, usado durante los despliegues,
permite seleccionar el modo de simulación en `unsigned`; conserva `enforce`
como valor predeterminado y usa `record` al preparar un deploy nuevo.

El orden validado es:

1. Construir una transacción nueva, sin autorizaciones Soroban preexistentes.
2. Simular en `record` y ensamblar las autorizaciones registradas.
3. Simular el envelope ensamblado en `enforce` antes de firmar.
4. Validar una única operación `createContractV2`, Wasm, argumentos, fee payer,
   passphrase Testnet, autorización `sourceAccount`, fee, secuencia y vigencia.
5. Firmar localmente con la identidad CLI existente y verificar con Stellar SDK
   una firma Ed25519 válida, cuerpo/hash intactos y autorización Soroban intacta.
6. Tras autorización explícita, enviar una única transacción y consultar su hash.
   Ante un resultado ambiguo, consultar antes de considerar cualquier nuevo envío.

`record` descubre autorizaciones, pero **no las valida**. No debe ejecutarse sobre
un envelope ya ensamblado con un auth footprint: el RPC rechaza esa combinación.
La validación posterior `enforce` se realizó antes de cada deploy. El cambio de
script prepara `record`; la simulación `enforce` posterior se realizó por separado
con Stellar SDK. No se modificaron contratos Rust ni Wasm para corregir el orden.

Después del deploy de Smart Account se verificaron:

- Estado `SUCCESS`, Contract ID devuelto por la operación, ledger y fee cobrado.
- Código Wasm recuperado por Contract ID idéntico al artefacto local revisado.
- Las once entradas de estado creadas, iguales al estado previsto por `enforce`:
  instancia, cuatro reglas, tres registros de signer y tres índices de búsqueda.
- Claves y roles enrolados, cuatro reglas del quorum, dirección del Verifier y
  executable Wasm almacenados en la instancia.
- Lecturas del Verifier y ejecución del comando existente `verify`, que comprobó
  los hashes revisados, el binding del Verifier, los firmantes y el quorum.

## Checks del checkpoint

- TypeScript strict: PASS (`npm run typecheck`).
- Tests Node: 6/6 PASS (`npm test`).
- Rust nativo: 20/20 PASS (`cargo test --workspace --locked --offline`).
- Rust sobre los Wasm existentes: 21/21 PASS
  (`cargo test --workspace --locked --offline --features institutional-account/wasm-tests`).
- No se reinstalaron dependencias ni se modificaron contratos Rust o Wasm.
- Este checkpoint no ejecuta transacciones, financiación ni transferencias.

Solo se versionan código y documentación. `tmp/`, `signers.json` local, envelopes
firmados, credenciales WebAuthn, identidades CLI, claves privadas, seeds y
configuraciones sensibles no forman parte del checkpoint. Los artefactos de
validación locales permanecen ignorados por Git; las identidades CLI están fuera
del repositorio. Este documento publica únicamente identificadores on-chain y
configuración de desarrollo no secreta.

## Limitaciones y próximo paso

- Solo Testnet. Contratos sin auditoría y dependencias experimentales; no se
  afirma preparación para producción ni se usan fondos reales.
- Binding de desarrollo fijo a `localhost` / `https://localhost:8443`. Un RP u
  origin diferente requiere otro Verifier y una cuenta vinculada a él.
- El deploy y la inspección del estado no prueban un flujo completo de operación
  on-chain autorizado por dos passkeys reales. Falta validar ese recorrido en los
  navegadores y dispositivos de los tres roles, con revisión independiente de la
  intención antes de cada aprobación.
- Claves distintas no demuestran custodios independientes. No hay política de
  attestation, monitoreo de contadores ni recuperación unilateral; perder dos
  roles puede impedir recuperar el quorum.
- La vinculación a un Verifier confiable depende de los checks de despliegue; el
  constructor de Smart Account no aplica una allowlist de hashes del Verifier.
- No hay límites de gasto ni allowlists de protocolos en esta política. La
  integración Blend V2 / préstamos USDC sigue pendiente.
- TTL, archivado/restauración, rotación operativa y mantenimiento requieren
  procedimientos revisados; no se autoriza aquí ninguna transacción adicional.

Próximo paso recomendado: preparar y simular una operación inocua que exija
autorización de la Smart Account con dos passkeys reales, mostrando la intención
completa a ambos roles. Validar las tres parejas y rechazos relevantes antes de
solicitar autorización para cualquier envío. No financiar ni transferir fondos
como parte de este checkpoint.
