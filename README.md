# PUCARÁ

Bóveda institucional con passkeys y autorización compartida sobre Stellar.

PUCARÁ permite que una organización autorice operaciones mediante una smart account con una política de **2 de 3 firmantes**. El MVP cuenta con una transferencia de **1 XLM en Stellar Testnet** confirmada.

## Video y presentación

| Material | Enlace |
| --- | --- |
| Video demo v2 | [Ver o descargar el video MP4](https://github.com/BTorossi-DS/pucara-institutional-vault/blob/feat/pucara-frontend/presentacion/pucara-demo-v2.mp4) |
| Pitch deck | [Abrir o descargar el PDF](https://github.com/BTorossi-DS/pucara-institutional-vault/blob/feat/pucara-frontend/presentacion/pucara-pitch-nea-tech.pdf) |
| Carpeta de presentación | [Ver todos los materiales](https://github.com/BTorossi-DS/pucara-institutional-vault/tree/feat/pucara-frontend/presentacion) |

Si GitHub no reproduce el video en la página del archivo, usar **Download raw file** para abrirlo o descargarlo.

## Las cuatro características

- **Independencia = Autocustodia:** el control requiere las claves de los firmantes.
- **Seguridad = Multisig:** dos aprobaciones distintas para autorizar.
- **Programabilidad = Smart accounts:** el contrato aplica las reglas de la bóveda.
- **Usabilidad = Passkeys:** cada responsable utiliza su propio autenticador.

## Código del MVP

El código funcional y el frontend actualizado están en la rama **`feat/pucara-frontend`**. Esta portada de `main` reúne los accesos al proyecto.

- [Explorar el código completo](https://github.com/BTorossi-DS/pucara-institutional-vault/tree/feat/pucara-frontend)
- [README técnico e instrucciones](https://github.com/BTorossi-DS/pucara-institutional-vault/blob/feat/pucara-frontend/README.md)
- [Contratos Soroban](https://github.com/BTorossi-DS/pucara-institutional-vault/tree/feat/pucara-frontend/contracts)
- [Estado, validaciones y límites del frontend](https://github.com/BTorossi-DS/pucara-institutional-vault/blob/feat/pucara-frontend/docs/frontend-pucara.md)

Para obtener el código funcional:

```bash
git clone --branch feat/pucara-frontend https://github.com/BTorossi-DS/pucara-institutional-vault.git
cd pucara-institutional-vault
npm ci
npm run enroll
```

El registro local abre en `http://localhost:8080`. La autorización y el flujo operativo completo requieren el entorno Linux, HTTPS local y la configuración descritos en la documentación técnica. El frontend no envía transferencias automáticamente.

## Evidencia en Stellar Testnet

- **Transacción:** [ver confirmación en Stellar Expert](https://stellar.expert/explorer/testnet/tx/55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2)
- **Hash:** `55f316eaf9d1290aa08746401fe7a7ec44fe820d54245047389483f292cfddd2`
- **Resultado:** SUCCESS · ledger `5230325`
- **Importe documentado:** 1 XLM Testnet · autorización CEO + CFO
- **Smart account:** `CB2ZCJX4PB45LRQJ3CRCJ5JZ7O4DHONXMQV6U6RSIMXQ6KHYVNFZYYFH`
- **Verificador WebAuthn:** `CAZS2AXQZGPMSV2NWLTMPNUE6IJJ65F6G3QWEKMGXKQAPCAWROWQRYEP`
- **SAC XLM nativo:** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- **Destinatario / fee payer:** `GDBSP3BBHMZQ6LVNQTFNK6THMXFJDBTIHCY7FVRMJ26AP4VSJAZ6XXX2`

[Consultar la evidencia y el alcance de la transferencia](https://github.com/BTorossi-DS/pucara-institutional-vault/blob/feat/pucara-frontend/docs/testnet-multisig-proof.md).

## Stack

Soroban · Rust · Stellar SDK · TypeScript · WebAuthn / passkeys · OpenZeppelin Stellar Accounts.

## v2.0 propuesta

- Multisig **3 de 5**.
- **Timelocks**.
- **Earn conectado a Blend**.

Estas funcionalidades forman parte del roadmap; no están implementadas en el MVP actual.

## Alcance

Prototipo de desarrollo en **Stellar Testnet**, sin fondos reales ni auditoría externa. La operación demostrada está restringida a una transferencia específica; la preparación, finalización y firma del fee payer son pasos supervisados.

Se utilizó asistencia de IA (Codex) para revisión, frontend, investigación secundaria y preparación de materiales.

