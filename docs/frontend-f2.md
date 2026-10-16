# Checkpoint F2 — Pucará frontend integration

## Cambios de esta etapa

- `frontend/src/main.tsx`: logo oficial, enlace para saltar al contenido,
  navegación con `aria-current` y etiqueta F2; conserva todas las vistas y lógica F1.
- `frontend/src/style.css`: adaptación de colores, tipografías y componentes
  existentes a la identidad oficial; conserva layout y breakpoints responsive.
- `frontend/src/brand.css`: tokens oficiales y estilos reutilizados de foco,
  marca, navegación, botones y títulos.
- `frontend/public/brand/{logo,mark,logo-original,isologo-original}.svg`: copias
  exactas del commit `7050210`, con procedencia en `public/brand/README.md`.
- `frontend/index.html`: favicon oficial y color terracota del navegador.
- `frontend/README.md`, `README.md`, este informe: integración, evidencia de checks
  y configuración de publicación.

Framework, dependencias, lockfile, Vite, configuración Vercel, servicio Stellar y
pruebas F1 conservados. No se modificaron contratos, scripts Testnet, código de
enrolamiento, credenciales ni políticas. Se preservaron los cambios locales previos.

## Datos y seguridad

Lecturas reales sobre la cuenta pública documentada: red Testnet (ledger 5231962),
0.0000000 XLM, claves públicas de CEO/CFO/Treasury Manager y cuatro reglas.
La política 2-de-3 se mantiene identificada como documentada, sin afirmar una
nueva auditoría on-chain. Las transacciones con hashes `55f316ea…cfddd2` y
`38ad66c7…eec4d` devolvieron SUCCESS en sus ledgers documentados.
No se ejecutaron transacciones; las simulaciones se limitaron a getters de lectura.
Una consulta inicial de reglas agotó el timeout y la consulta posterior pasó.
La interfaz mantiene errores explícitos y no inventa saldos o confirmaciones.

Transfers conserva formulario/revisión en memoria, estados sin iniciar y envío
deshabilitado. No se copiaron llamadas a WebAuthn, firmas, endpoints operativos ni
secretos. No se utiliza un backend para autorizar operaciones.

## Validación

- `npm ci`: PASS, 0 vulnerabilidades reportadas.
- TypeScript: PASS.
- Build de producción: PASS.
- Tests frontend: 5/5 PASS.
- HTML, JS, CSS, favicon y SVG oficiales servidos por preview: HTTP 200.
- Cuatro SVG idénticos byte por byte a la fuente oficial.
- CORS: OPTIONS de RPC y Horizon HTTP 204, métodos/headers admitidos;
  POST getNetwork con un Origin HTTPS de Vercel HTTP 200 y origen permitido.
- Navegación SPA en memoria preservada, sin rutas profundas ni rewrites requeridos.
- Fuentes de aplicación sin dependencias de localhost, APIs WebAuthn o envío/firma.

Limitaciones: sin navegador instalado para validar visualmente escritorio/móvil;
queda ese chequeo para el Preview de Vercel. Se conserva el aviso de tamaño del
bundle del SDK (~788 kB minificado, ~188 kB gzip), que no bloquea el build.
El historial sigue limitado a los hashes documentados y las lecturas dependen de
la disponibilidad y retención de Testnet.

## Configuración exacta de Vercel

| Opción | Valor |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | `Vite` |
| Node.js | `22.x` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Variable opcional | `VITE_SMART_ACCOUNT`, ID público de la cuenta Testnet |

Sin variables obligatorias: el Contract ID documentado es el valor predeterminado.
No configurar secretos, certificados ni credenciales. Publicar solo `frontend/dist`.
Las cabeceras CSP/Permissions-Policy existentes permiten lecturas Testnet y bloquean
uso de credenciales WebAuthn. No hay dependencia del localhost operativo.

Sin bloqueos técnicos conocidos para el Preview. Frontend aún sin publicar en Git;
commit, push y deployment requieren autorización en el siguiente checkpoint.
F2 no realiza ninguna de esas acciones.
