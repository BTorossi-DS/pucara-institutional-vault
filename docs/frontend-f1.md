# Checkpoint F1 — Pucará Web MVP

## Estado inicial

Rama `feat/smart-account-setup`, con modificaciones previas en scripts de
autorización y documentación. F1 conserva esas modificaciones.
No había frontend público React/Vite ni recursos gráficos de marca en el
repositorio. Las páginas HTML de `scripts/enrollment` son utilidades locales de
WebAuthn, vinculadas a localhost; no se publican ni se reutilizan como wallet web.

Se inspeccionaron README, AGENTS, contratos institucional y verifier, scripts de
Testnet, configuración de ejemplo y evidencia pública. Los documentos históricos
conservan etapas pendientes; `testnet-multisig-proof.md` registra la primera
transferencia institucional confirmada y es la referencia pública utilizada.
No se leyeron configuraciones privadas ni registros de passkeys en `tmp/`.

## Implementación

`frontend/` es una aplicación independiente React, Vite, TypeScript y Tailwind.
Dashboard muestra saldo XLM, Contract ID, estado Testnet, política documentada,
firmantes consultados y actividad documentada. Transfers permite completar y
revisar un formulario local; los estados de aprobación y envío están deshabilitados.
Activity permite verificar los hashes públicos en Stellar Expert Testnet.

El SDK oficial 17.2.1 coincide con el existente en el repositorio. Se verificaron
las versiones de dependencias y las APIs del paquete. La integración usa
simulaciones de getters sin firmas ni envío. RPC verifica la passphrase Testnet.
No se importa código de enrolamiento, no se solicitan credenciales y no hay backend.
Las consultas fallidas muestran errores o estados sin verificar; nunca datos ficticios.
La cuenta configurable no hereda el historial ni la política de la cuenta original.

## Lecturas reales de validación

Durante F1, RPC Testnet respondió en ledger 5231734:

- Balance de la Smart Account documentada: `0.0000000 XLM`.
- Tres claves públicas de firmantes consultables.
- Cuatro reglas actuales consultables.
- Ambas transacciones públicas documentadas: `SUCCESS`, ledgers 5230325 y 5228445.

Son resultados observados durante la validación, no valores fijados en la interfaz.
La web realiza consultas nuevas; resets de Testnet, TTL/archivado, retención del
proveedor y disponibilidad de red pueden impedir obtenerlos posteriormente.
Horizon no respondió en la prueba de este entorno; RPC sí verificó los hashes.
El historial es acotado a esos dos hashes, no es un índice exhaustivo de la cuenta.

## Seguridad y publicación

Sin cambios en contratos, despliegues, credenciales, multisig ni secretos.
Sin transferencias, firmas ni ceremonias WebAuthn. Solo Testnet y TLS validado.
El build publica solo `frontend/dist`; los recursos operativos permanecen fuera.
Vercel incluye CSP y otras cabeceras; el servidor de desarrollo restringe acceso
al directorio frontend. No usar el servidor de desarrollo como servidor público.

La política 2-de-3 es documental; consultar las reglas no equivale a auditar su
semántica ni el hash del contrato. La autorización real desde Vercel requiere una
etapa separada, especialmente por el binding inmutable de origin/RP del verifier.
Blend V2, USDC, indexación completa y transferencias están pendientes.

Ver [frontend/README.md](../frontend/README.md) para comandos, variables públicas
y configuración exacta de Vercel. F1 no realiza commit, push ni deployment.

## Validación final

- Instalación de dependencias y lockfile: PASS.
- TypeScript raíz y frontend: PASS.
- Build de producción Vite 7.3.7: PASS.
- Pruebas frontend: 5/5 PASS.
- Suite existente: 72/72 PASS con `.tools/env.sh` cargado, como indica README.
  La primera ejecución sin ese entorno falló por el normalizador Rust local.
- Auditoría npm tras actualizar Vite a la versión corregida: 0 vulnerabilidades.
- Preview de producción: HTML y assets CSS/JS responden HTTP 200.
- `git diff --check`: PASS.

El build advierte un chunk de aproximadamente 787 kB minificado (188 kB gzip),
principalmente por el SDK Stellar. La división/carga diferida del bundle queda
como optimización posterior. No se ejecutó una prueba visual en navegador: este
entorno no dispone de navegador instalado. Validar diseño y CORS desde Vercel
Preview antes de publicar Production.
