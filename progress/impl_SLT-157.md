# SLT-157 «Guía única leída por cámara o pistola» — implementación (frontend_dev)

Tanda 1 · 2026-11-14 · T1-T4 · commit 6963a951.

## Archivos
- Producción: `lib/utils/paquete-url.ts` (`leerGuia`; se retira `extractNumGuiaFromScan`),
  `components/shared/QrScanner.tsx`, las siete superficies (`EscanerRecepcionBodegaCentral`,
  `EscanerRecepcionOrigen`, `EscanerRecepcion` satélite, `cierre-confirmacion-fisica`,
  `RecogerPaqueteCard`, `RecoleccionModule`, `VerificarGuiaGate`).
- Fuera de `## Archivos esperados`, con su porqué:
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`: consumía `MedioDeCaptura` e
    `interpretarLectura(texto, medio, …)`; T3 quita `medio`, así que su llamada cambia. Su función
    local `leerGuia` pasa a `aplicarLectura` para no confundirse con la de `lib/`.
  - `app/(app)/recoleccion/_components/useRecolectarPorGuia.ts`: solo comentario; citaba
    `/^\d+$/` y `extractNumGuiaFromScan`, y la guardia R567 lo habría marcado.
  - `useRecogerPorGuia.ts` (sí esperado): solo comentario.
- Tests: `tests/unit/utils/paquete-url.test.ts`, `tests/components/QrScanner.test.tsx`, los siete
  de superficie y `tests/unit/guards/lectura-guia-unica.guardia.test.ts` (nuevo).

## R → test → mutación que lo mata
| R | Test | Mutación (rojo confirmado) |
| --- | --- | --- |
| R560 | paquete-url «R560» | quitar la rama de dígitos de `leerGuia` |
| R561 | paquete-url «R561» ×2 | `/?$` → `$` (barra final); ruta `/([^/]+)/?$` (regla vieja: cualquier ruta) |
| R562 | paquete-url «R562» | relleno `\s` sin `\p{Cc}`; quitar la rama `#`; `#` recursivo (acepta `#https://…`) |
| R563 | paquete-url «R563» | `#` recursivo (acepta `##1024`); quitar `isSafeInteger` |
| R564 | QrScanner «R564» | `[0, 5, 9]`; `[0]` |
| R565 | 7 archivos, bloque «SLT-157» | por superficie: cámara solo URL; teclado solo dígitos (14 mutaciones) |
| R566 | 7 archivos, bloque «SLT-157» | por superficie: teclado silencioso; cámara silenciosa (14 mutaciones) |
| R567 | guardia lectura-guia-unica | reponer `/^\d+$/` en `EscanerRecepcion.tsx`; citar `extractNumGuiaFromScan`; reimplementación local sin import; `Number(valor)` en `EscanerRecepcionOrigen` |
| R568 | paquete-url «R568» | aceptar solo `https:` (rompe el origen `http://localhost:3000`) |

Una mutación sobrevivió y se descartó por **equivalente**: `import { leerGuia as lg }` sigue
importando `leerGuia`; se cambió por una reimplementación local, que sí mata.

## Comandos
- `tsc --noEmit` con `NODE_OPTIONS=--max-old-space-size=8192` (el de `gate.yml`): EXIT=0. Sin él,
  tsc revienta por memoria (4 GB) en este equipo, también dentro de `./init.sh`.
- `eslint` de los archivos tocados: 0 errores (2 warnings previos en `RecoleccionModule.tsx`:
  `useMemo` y `ContactoButtons` sin usar, no de este cambio).
- `./init.sh` (con el NODE_OPTIONS de CI): INIT_EXIT=1. Lote de tests relacionados: 100 archivos,
  1475 tests, todos en verde. Rojo en el lote de disparadores de base, ajeno a este cambio:
  4 archivos de `tests/integration/db/` (`demo-qa`, `dos-empresas-entradas`, `tarifa-empresa-nueva`,
  `zona-central-guarda-y-rastro`) con `P2022 The column (not available) does not exist in the
  current database` en `tx.cierreDia.create()`: la base local va por detrás del esquema. No se
  migra desde aquí (prohibido para este agente).

## Pendiente (no de este agente)
- T5 (dispositivo, Preview) y T6 (E2E locales) los corre el leader.

Veredicto: T1-T4 hechas con cada R mapeado a un test que una mutación pone en rojo; el gate solo
sale rojo por la base local desfasada.
