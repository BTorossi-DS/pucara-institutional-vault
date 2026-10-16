# Checkpoint 4.7 — Transfer Authorization Ready

Fecha: 2026-10-16. Rama: `feat/smart-account-setup`.
Base publicada: Checkpoint 4.6 (`b7caecf`). Este registro sustituye el estado actual
de los checkpoints históricos conservados debajo. No modifica contratos Rust,
Wasm, dependencias ni despliegues.

## Integración y revisión de seguridad

- Validación WebAuthn compartida entre probe y transferencia: credencial y clave
  registrada por rol, challenge/origin/RP-ID, UP/UV, codificaciones canónicas,
  límites de tamaño y firma P-256 con el normalizador DER/low-S existente.
- Autorización de transferencia restringida a las instancias Testnet revisadas,
  SAC nativo, importe `10000000`, CEO+CFO, regla 0 y ventana de 120 ledgers. Se
  revisan intención, árbol exacto, nonce no consumido y expiración; la sesión fija
  una propuesta inmutable y vuelve a comprobarla antes y después de cada captura.
- Captura HTTPS explícita: Host/origin/JSON/CSRF y propuesta verificados. Cargar o
  revisar la página no inicia WebAuthn. El modo transferencia termina al validar
  ambas aprobaciones; no ofrece simulación, finalización ni envío desde el browser.
- **Hallazgo de visualización de expiración resuelto:** el valor mostrado procede
  de `signatureExpirationLedger` en la entrada Soroban. Debe coincidir con la
  intención; metadata opcional de nivel superior contradictoria se rechaza. Tests
  sintéticos cubren metadata coincidente, ausente y contradictoria, preservando
  también el comportamiento del probe.
- La finalización separada revalida ambas assertions, red/configuración, nonce y
  expiración, construye transporte nuevo sin firma del fee payer y exige simulación
  `enforce` dentro del límite de fees. Artefactos privados: directorio 0700 y archivos
  0600 bajo `tmp/`, sin sobrescritura ni escape por symlinks en las rutas revisadas.
- Revisión de seguridad de todos los archivos seleccionados completada, sin
  hallazgos bloqueantes abiertos en este alcance. No equivale a auditoría externa
  ni acredita preparación para producción.

Checks de publicación: **TypeScript strict PASS**, **41/41 tests Node PASS** y
**`git diff --check` PASS**. Los tests usan claves sintéticas en memoria, browser/RPC
simulados y ningún registro o assertion WebAuthn real.

## Financiación real de Testnet confirmada — TASK 4.30B

| Dato | Valor confirmado |
| --- | --- |
| Red | Stellar Testnet — `Test SDF Network ; September 2015` |
| Fuente / fee payer | `GDBSP3BBHMZQ6LVNQTFNK6THMXFJDBTIHCY7FVRMJ26AP4VSJAZ6XXX2` |
| Vault receptora | `CB2ZCJX4PB45LRQJ3CRCJ5JZ7O4DHONXMQV6U6RSIMXQ6KHYVNFZYYFH` |
| SAC XLM nativo | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Importe recibido | **10000000 stroops = 1.0000000 XLM Testnet** |
| Transaction hash | `38ad66c749cde2aa735981fe04faae481515aaad232cd35aac3cae354b7eec4d` |
| Ledger / resultado | **5228445 / SUCCESS** |
| Fee efectivamente cobrado | **698244 stroops = 0.0698244 XLM Testnet** |
| Balance final de la vault | **1.0000000 XLM** |
| Balance final del fee payer | **9976.4501656 XLM** |

Estos balances son la verificación posterior a la financiación del 2026-10-16,
ledger 5228454. RPC y Horizon coincidieron; evento, importe y variaciones de saldo
reconciliaron exactamente 1 XLM más el fee real. Hubo un solo envío, sin reintentos.
Fue una entrada desde el fee payer hacia la vault, autorizada por separado; no fue
la primera salida institucional ni necesitó CEO+CFO como receptora. Esta publicación
no ejecuta financiación, firma, envío ni ceremonia adicional.

## Pendiente: primera salida y grabación de demo

La primera transferencia saliente de **1 XLM autorizada por CEO+CFO sigue pendiente**.
El probe real del Checkpoint 4.6 y esta financiación no demuestran su ejecución.
El siguiente paso requiere preparar/revisar una propuesta nueva con HTTPS confiable,
capturar ambas aprobaciones independientes, finalizar y simular en `enforce`, y
obtener la autorización operativa correspondiente antes de firmar/enviar. Después
deberán confirmarse `SUCCESS`, evento y balances. No reutilizar propuestas vencidas
ni assertions de otro challenge.

Se necesita **financiación Testnet adicional para la grabación de demo** y las
repeticiones: el saldo de 1 XLM solo cubre la primera salida prevista. Cualquier
financiación futura requiere **autorización separada y explícita**, importe y fee
revisados, estado fresco y protección contra duplicados; no se autoriza aquí.

Solo se publican fuentes, tests sintéticos y documentación resumida. Quedan fuera
`tmp/`, claves/credenciales, assertions reales, envelopes firmados, material TLS
privado, reportes operativos crudos y archivos de entorno sensibles. Persisten las
limitaciones de custodia no atestada, binding local, TTL/archivo, recuperación,
ausencia de límites de gasto y Blend V2/USDC pendiente. Prototipo sin auditoría,
solo Testnet, sin fondos reales ni garantía de producción.

---

# Checkpoint 4.6 — Real WebAuthn Multisig Authorization Verified (histórico)

Fecha: 2026-10-16. Rama: `feat/smart-account-setup`.
Base publicada: `62a207009fa0161e2247194ca5972fed26035fbd`.
Este registro sustituye el estado pendiente del Checkpoint 4.5 conservado debajo.
No cambia contratos, Wasm, dependencias ni despliegues.

## Evidencia verificada

- CEO Touch ID y CFO YubiKey: assertions reales capturadas y validadas, de dos
  firmantes P-256 registrados distintos, sobre el mismo challenge Soroban.
- Red Stellar Testnet, regla 0 (CEO + CFO), operación exacta:
  `SmartAccount.execute(Verifier, "origin", [])`.
- Verificación WebAuthn exitosa; simulación Soroban `enforce`: **PASS**.
- Simulación enforce independiente: **PASS**. Error de contrato: `null`.
- Fees estimados: **2409780** y **2412774 stroops**, equivalentes a **0.2409780** y
  **0.2412774 XLM Testnet**. Son estimaciones de simulación, no fees cobrados.
- No se envió ninguna transacción del probe, no se cobraron fees y el nonce
  permaneció sin consumir después de la simulación.

## Política de expiración y checks

El probe usa una ventana de 360 ledgers (rango permitido 10–360), configurada antes
de preparar el challenge. Las transferencias conservan el máximo de 120 ledgers
(rango 10–120). Captura y simulación exigen más de cinco ledgers restantes.
Cambiar la expiración cambia el challenge y requiere ambas assertions nuevas;
una sesión conserva su propuesta inmutable. La simulación construye una transacción
nueva con timeout de 300 segundos; no reutiliza la vigencia del envelope de discovery.

- TypeScript strict: **PASS** (`npm run typecheck`).
- Suite Node completa: **25/25 PASS** (`npm test`), con fixtures sintéticos.
- `git diff --check`: **PASS**.

## Límites y siguiente paso

La primera transferencia de **1 XLM Testnet sigue pendiente**: no se afirma ningún
movimiento real de tokens. Simular autorización no persiste cambios ni demuestra
una transferencia enviada y confirmada. Las otras parejas del quorum, rotación,
recuperación y verificación de balances/eventos requieren validación adicional.
No hay attestation que certifique hardware o independencia de custodios; permanecen
el binding local de desarrollo, las limitaciones de TTL/archivo, la ausencia de
límites de gasto y la integración Blend V2/USDC pendiente. Prototipo sin auditoría,
solo Testnet, sin garantía de producción.

Solo se publican código, tests sintéticos y documentación resumida. No se publican
`tmp/`, assertions reales, credential IDs reales, claves, certificados TLS ni
reportes crudos de sesión. Esta publicación no genera challenges ni ceremonias,
no firma ni envía transacciones, no financia cuentas ni realiza transferencias.
Se detiene el trabajo después de publicar este checkpoint.

---

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
