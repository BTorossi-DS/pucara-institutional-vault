# Pucará Web · Checkpoint F2

Frontend público React + Vite + TypeScript + Tailwind CSS. Solo Stellar Testnet.
No requiere backend, claves, wallet de navegador ni credenciales WebAuthn.

## Desarrollo y validación

Node.js 22.12+ (recomendado Node 22).

```bash
cd /workspaces/stellar-wallet/frontend
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

## Variables públicas

`.env.example` contiene únicamente `VITE_SMART_ACCOUNT`, el Contract ID público
opcional. Sin variable se usa la cuenta documentada en
`../docs/testnet-multisig-proof.md`. Toda variable `VITE_*` se incluye en el bundle:
no colocar claves, secretos, credential IDs ni assertions. Una cuenta alternativa
no utiliza la evidencia histórica de la cuenta predeterminada.

RPC `https://soroban-testnet.stellar.org`, Horizon
`https://horizon-testnet.stellar.org`, SAC XLM y passphrase Testnet están fijados
en el código. El servicio comprueba la passphrase antes de consultar la cuenta.
La dirección pública de origen de simulaciones es la del fee payer documentado;
se usa con secuencia sintética 0 para lecturas, nunca se firma ni se envía.
Las consultas son simulaciones de `balance`, `signers`, `rule_ids` y `rule`.
No se restauran contratos ni se renueva TTL. Los errores no se convierten en saldo 0.

## Alcance de los datos

- Balance XLM actual: retorno del SAC nativo, con precisión entera de 7 decimales.
- Firmantes: claves públicas actuales obtenidas de `signers`; sin credential IDs.
- Política 2 de 3: documentada en el contrato y la evidencia. Se consulta la
  disponibilidad de cada regla actual, pero no se presenta como auditoría del quorum.
- Actividad: dos hashes públicos conocidos, verificados individualmente con RPC y fallback a Horizon
  (hash, ledger, éxito y fecha). No es un indexador ni un historial exhaustivo.
  La operación de mayor ledger es la última documentada, no necesariamente la
  última operación real de la cuenta. Si el proveedor ya no retiene los datos,
  se muestra «No verificada» con enlace al explorador.
- Transfers: formulario y revisión locales en memoria. No persisten propuestas,
  no solicitan passkeys, no firman, no simulan transferencias y no envían operaciones.
- Recargar datos es manual; la fecha visible indica la consulta, no una conexión
  permanente. El estado se vacía al actualizar para evitar mostrar saldos obsoletos.

## Publicar en Vercel

1. Importar el repositorio cuando esté autorizado su commit/push.
2. **Root Directory: `frontend`**. No seleccionar la raíz del repositorio.
3. Framework Preset: **Vite**. Node.js: **22.x**.
4. Install Command: `npm ci`.
5. Build Command: `npm run build`.
6. Output Directory: `dist`.
7. Opcional: configurar `VITE_SMART_ACCOUNT` como variable pública antes del build.
8. Crear un Preview y verificar las tres pestañas y las consultas desde el navegador.
   Publicar Production cuando esté aprobado.

No es necesario configurar rutas SPA: la navegación de las tres vistas es local.
Vercel publica únicamente `frontend/dist`. Nunca subir la raíz, `tmp/`, `.stellar/`,
archivos de enrolamiento, certificados ni configuraciones operativas.
El `vercel.json` fija cabeceras de seguridad y conexiones a los dos servicios Testnet.
El dominio Vercel no se registra como origin/RP de las passkeys existentes: este MVP
no incluye autenticación ni autorización. Una futura integración requiere diseño
separado y revisión del binding WebAuthn.

## Pendiente

Indexación completa de actividad, auditoría de políticas on-chain, flujos de
aprobación reales, transferencias y Blend V2/USDC. No están habilitados en F2.
Contratos sin auditoría; no usar fondos reales.

## Branding oficial integrado en F2

Se conserva F1 completo: React/Vite/TypeScript/Tailwind, dependencias y lockfile,
configuración Vite, tres vistas, servicio Stellar y revisión de transferencias demo.
Los recursos oficiales se extrajeron del commit
`7050210241d88446672048e30967f7ade4be1e15` de `feat/pucara-frontend`.

`public/brand/` incluye logo, isologo y los dos originales sin modificaciones.
`src/brand.css` adapta la paleta papel `#F7F5EF`, piedra `#E8E4DA`, terracota
`#91432D`, tipografías Segoe UI/Arial y Georgia, foco de teclado, navegación y
botones. No se usan fuentes externas. El isologo se usa como favicon y en el saldo.
No se copiaron endpoints, código de enrolamiento ni autorizaciones WebAuthn.

## Validación F2

- `npm ci`: PASS; auditoría reportada por npm: 0 vulnerabilidades.
- `npm run typecheck`, `npm run build`, `npm test`: PASS (5/5 pruebas).
- Preview local de producción: HTML, CSS, JS y cuatro SVG con HTTP 200.
- SVG idénticos byte por byte a los de `7050210`.
- Preflight CORS RPC/Horizon: HTTP 204, admiten los headers del SDK.
- POST RPC `getNetwork` con Origin HTTPS de Vercel: HTTP 200, Testnet y
  `Access-Control-Allow-Origin` compatible. Se usó un origen de prueba, no un deployment.
- Lecturas reales: ledger de red 5231962, balance 0 XLM, tres roles de firmantes,
  cuatro reglas; ambas transacciones documentadas confirmadas por RPC.
- Una lectura inicial de reglas agotó el timeout; la verificación posterior pasó.
  Los fallos se muestran como errores, no se sustituyen por datos ficticios.
- Flujo demo conserva revisión local, mensajes de demostración y envío deshabilitado.

No hay dependencias de localhost en el código de la aplicación ni servicios de
backend requeridos. La navegación de Dashboard/Transfers/Activity sigue en memoria:
la URL pública es `/`; recargar vuelve a Dashboard. No se implementaron rutas
`/transfers` o `/activity`, por lo que no se necesitan rewrites SPA adicionales.
Las cabeceras CSP permiten únicamente los dos servicios Testnet necesarios.

No hay bloqueos técnicos conocidos para preparar un Vercel Preview. Falta autorizar
commit/push/publicación en el próximo checkpoint. Validar visualmente escritorio y
móvil en ese Preview: este entorno no dispone de navegador para una comprobación
visual automatizada. El build mantiene el aviso de chunk del SDK, aproximadamente
788 kB minificado / 188 kB gzip, sin impedir compilar.
