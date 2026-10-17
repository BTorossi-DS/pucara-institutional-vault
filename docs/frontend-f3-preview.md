# Checkpoint F3.4 — Pucará Vercel Preview

## Contexto y commit de origen

El frontend refinado de `BTorossi-DS/pucara-institutional-vault`, rama
`feat/pucara-web-mvp`, fue desplegado como Preview en el proyecto Vercel `pucara`.
Commit de origen: `50f94ce8ec3778b28048314765e56ff6d625e0cd`.
Este checkpoint registra el estado reportado del Preview; Production todavía
no está publicado.

## Configuración Vercel

| Opción | Valor |
| --- | --- |
| Proyecto | `pucara` |
| Entorno | Preview |
| Framework | Vite |
| Root Directory | `frontend` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

## Resultado del build y evidencia de Preview READY

El deployment fue reportado como exitoso y con estado **READY** en Vercel.
El resultado reportado del build permite servir el frontend en Preview; además,
el Dashboard fue inspeccionado visualmente en navegador.
La evidencia disponible para este checkpoint es la confirmación del deployment
READY y de esa inspección aportada por el responsable del proyecto. No se adjuntaron
URL, identificador del deployment, capturas ni logs de build a este checkpoint.
No se ejecutó un nuevo build, deployment ni inspección de Vercel durante esta
actualización documental. Los checks previos están registrados en
[el informe F2](frontend-f2.md).

## Validación visual inicial

La inspección reportada del Dashboard confirmó:

- Logo Pucará visible, tipografía institucional, paleta y jerarquía visual.
- Sidebar visible y funcional a nivel visual; no constituye validación de todas
  las vistas ni de sus flujos.
- Balance renderizado: **0.0000000 XLM**.
- Stellar Testnet indicado como conectado en la interfaz.
- Smart Account visible y advertencia **DEMO** presente.

El saldo corresponde exclusivamente al valor observado en pantalla. No fue
verificado independientemente contra Stellar en este checkpoint. El indicador
de conexión tampoco constituye una nueva verificación independiente de la red.

## Limitaciones funcionales

Este Preview es un frontend de lectura y demostración sobre Stellar Testnet.
No debe presentarse como capaz de ejecutar transferencias reales. La evidencia
histórica de transacciones del repositorio no valida el envío desde este frontend.
READY y la inspección visual del Dashboard no certifican todos los flujos,
la exactitud de los datos ni la preparación para Production.

## Validaciones pendientes

- Transfers: pendiente de validación del flujo de demostración en Preview.
- Activity: pendiente de validación en Preview.
- Responsive móvil: pendiente de inspección y validación.
- Contraste independiente del saldo mostrado con Stellar Testnet: no realizado
  en este checkpoint.
- Production: pendiente; todavía no publicado.

## Condiciones para Production

Antes de publicar Production se deben completar y documentar las validaciones
pendientes de Transfers, Activity y responsive móvil, y revisar los estados de
carga, error y conexión Testnet. Cualquier afirmación sobre saldos verificados
requiere evidencia independiente y fechada.
La comunicación del producto debe mantener el alcance de lectura/demostración,
la advertencia DEMO y el uso exclusivo de Stellar Testnet, sin fondos reales ni
promesas de ejecución de transferencias. La publicación de Production requiere
una autorización explícita posterior y no forma parte de este checkpoint.

## Alcance de seguridad

Este cambio modifica únicamente documentación. No modifica contratos Soroban,
WebAuthn, código fuente, configuración Vercel ni dependencias; no ejecuta
transacciones Stellar ni lee secretos. No incorpora claves privadas, frases
semilla ni credenciales.
