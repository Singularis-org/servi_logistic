# impl SLT-115 «Retirar los componentes de cierre sustituidos»

## Tanda 1 (frontend_dev, 2026-11-13): T1 + T5

Grafo no consultado: el spec ya registra que este worktree no tiene índice; inventario con Grep.

### Archivos

- Creado: `tests/unit/guards/cierres-retirados.guardia.test.ts` (T1).
- Modificados (T5):
  - `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts`: salen los cinco catálogos
    por resultado (`AMBITO_`, `COLUMNAS_`, `filaDescargaDia…`), `TIENE_EVIDENCIA_*`,
    `FECHA_GESTION_COL` y los ayudantes privados. Quedan los cuatro exports de R404.
  - `app/(app)/cierres-admin/_components/desglose-pago.ts`: sale `desgloseDescarga` (R405).
  - `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`: quedan los casos de cierres pasados;
    el esperado literal de R406 (orden y encabezados) se copió sin cambios (`diff` de las 24 líneas: igual).
  - `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts`: sale el caso R3 y su
    import (E2).
  - `tests/unit/guards/pagos-captura.guardia.test.ts`: sale la fila de `cierre-dia-descarga-columnas.ts`
    de `MODULOS_DE_DESCARGA`.
  - `tests/components/descarga/CierresDescargaColumnas.test.tsx`: comentario `:679` («hasta SLT-115»).

### La guardia por parte

- R408 (control positivo + contraprueba de las seis formas, alias y relativa, y negativos): VERDE.
- R404, R405: ROJA antes de T5, VERDE después.
- R400 (dos casos): ROJA de verdad, marcada con `it.fails` para no romper el gate. **T4 debe
  cambiar los dos `it.fails` por `it`** al borrar los archivos: si no, `it.fails` se pone rojo solo.

Salida real antes de T5 (con `it.fails`):
```
× R404: cierre-dia-descarga-columnas.ts exporta exactamente lo que tiene consumidor
  AssertionError: expected [ …(23) ] to deeply equal [ …(4) ]
× R405: desglose-pago.ts no exporta desgloseDescarga y sigue exportando lo vivo
  AssertionError: expected [ 'SEPARADOR_DESGLOSE', …(5) ] to not include 'desgloseDescarga'
Tests  2 failed | 3 passed | 2 expected fail (7)   EXIT=1
```

Salida real de R400 con `it` (temporal, revertido a `it.fails`):
```
× ninguno de los cuatro archivos existe
  Existen: CierresAdminHistoricoLista.tsx, CierresBodegaResueltosLista.tsx,
  CierresBodegaSolicitadosLista.tsx, ListaComprobantes.tsx (los cuatro, en app/(app)/cierres-admin/_components/)
× ningún archivo de app/, components/, lib/, tests/ ni e2e/ los importa — 15 hallazgos:
  app/(app)/cierres-admin/_components/CierresAdminHistoricoLista.tsx -> ./ListaComprobantes
  app/(app)/cierres-admin/_components/CierresAdminModule.tsx -> ./CierresAdminHistoricoLista
  app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx -> ./CierresBodegaResueltosLista
  app/(app)/cierres-admin/_components/CierresBodegaResueltosLista.tsx -> ./ListaComprobantes
  app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista.tsx -> ./ListaComprobantes
  app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx -> ./CierresBodegaSolicitadosLista
  tests/components/CierreBodegaMarcaConciliacion.test.tsx -> @/…/CierresBodegaSolicitadosLista
  tests/components/CierreBodegaTarjetaCascada.test.tsx -> @/…/CierresBodegaSolicitadosLista
  tests/components/CierreBodegaTarjetaCascada.test.tsx -> @/…/CierresBodegaResueltosLista
  tests/components/CierreDiaColaPropia.test.tsx -> @/…/ListaComprobantes   (vi.mock)
  tests/components/DeudasD39D40ModeloEnPantalla.test.tsx -> @/…/CierresBodegaResueltosLista
  tests/components/DeudasD39D40ModeloEnPantalla.test.tsx -> @/…/CierresBodegaSolicitadosLista
  tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx -> @/…/CierresBodegaResueltosLista
  tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx -> @/…/CierresBodegaSolicitadosLista
  tests/components/descarga/DescargarResumenModeloNuevo.test.tsx -> @/…/CierresAdminHistoricoLista
Tests  2 failed | 1 passed | 4 skipped (7)   EXIT=1
```
Coincide con el inventario del spec (los importadores de app/ y la tabla de tests).

Después de T5: `Tests 5 passed | 2 expected fail (7)`, EXIT=0.

### Mutación (T5)

- Añadir `export const TIENE_EVIDENCIA_COL = "Tiene evidencia";` a `cierre-dia-descarga-columnas.ts`
  → `× R404` (`+ "TIENE_EVIDENCIA_COL"`), EXIT=1. Revertido.
- Añadir `export function desgloseDescarga()` a `desglose-pago.ts` → `× R405`, EXIT=1. Revertido.
- Tras revertir: `5 passed | 2 expected fail`, EXIT=0.

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R400 | `cierres-retirados.guardia.test.ts` › «ninguno de los cuatro archivos existe», «ningún archivo … los importa» (`it.fails` hasta T4) |
| R404 | `cierres-retirados.guardia.test.ts` › «R404: … exporta exactamente …»; `cierre-dia-descarga-columnas.test.ts` (cierres pasados) |
| R405 | `cierres-retirados.guardia.test.ts` › «R405: …»; `pagos-captura.guardia.test.ts` (fila retirada) |
| R406 | `cierre-dia-descarga-columnas.test.ts` › «el histórico de CIERRES PASADOS declara sus columnas…» (literal sin cambios); `CierresDescargaColumnas.test.tsx` (superficie «Cierres solicitados») |
| R408 | `cierres-retirados.guardia.test.ts` › control positivo y las dos contrapruebas |

### Comandos (salida real)

- `npx tsc --noEmit` (NODE_OPTIONS 8192): **TC_EXIT=0**, 0 errores. (Con el heap por defecto: OOM, exit 134.)
- `npx eslint` de los 7 archivos tocados: **LINT_EXIT=0**.
- `npx vitest related --run` de los 7 tocados: 76 archivos, `Tests 1 failed | 1278 passed | 2 expected fail`,
  **REL_EXIT=1**. El rojo NO es de esta tanda:
  `tests/components/paginacion/paginacion-transversal.test.tsx` › «ninguno de los TRECE proyecta el
  array de la página» — «Cierres de bodega solicitados: … expected … to match /filasDesdeResultado\(/».
  Lee el fuente de `CierresBodegaSolicitadosLista.tsx` (no tocado aquí; su descarga la cambió SLT-141
  «Excel del modelo nuevo: hojas por cierre de bodega», 9e43eeb8). Lo heredan T2/T4 o SLT-141.

### Veredicto

T1 y T5 hechas: guardia con R404/R405/R408 en verde y R400 en rojo esperado (`it.fails`, lo activa T4); un rojo heredado de SLT-141 en `paginacion-transversal`.
