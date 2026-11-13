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

## Tanda 2 (frontend_dev, 2026-11-13): T0 + T2 + T3 + T4

Grafo no consultado (el worktree no tiene índice, ver spec); Grep/Read.

### T0 — medir antes de tocar

- Rebase: la rama ya trae SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (#153) y
  SLT-134 «Textos de pantalla de cierres en tú, con guardia» (#155) por el merge `25f399a5`; ese merge
  cuenta como el rebase de T0 (las dos aprobadas, sin mergear aún a `dev`). `.env` presente.
- Grep de los cuatro nombres en `app/ components/ lib/ tests/ e2e/` (77 líneas): los mismos 15
  importadores que la tanda 1 (lista de arriba) y los mismos consumidores de lo que se muda
  (`CierresAdminModule.tsx:121-127`, `CierresBodegaAdminModule.tsx:52-55`,
  `ConsolidacionBodegaModule.tsx:52-57,538`). Ningún importador nuevo.

Mapa de cobertura de los casos que se borran:

| Caso borrado | Lo cubre |
|---|---|
| `CierreBodegaTarjetaCascada` «la satélite y el maestro ven el MISMO rótulo y valor (R38)» | sin pantalla viva: la tarjeta no la monta ninguna pantalla (R409, `cascada-central…guardia`); su valor lo siguen midiendo R20/R26 del mismo archivo |
| `CierreBodegaMarcaConciliacion` «ve el estado, el monto recibido y la diferencia (Q7)» | `ColaCierresConsolidar.test.tsx` › «Solicitados»: tabla › «recibido incompleto: lo recibido y la Falta resaltada»; `ConciliacionSateliteCascada.test.tsx` › R236 «con marca: debe llegar, − recibido y falta por recibir» |
| `CierreBodegaMarcaConciliacion` «NO puede marcar ni desmarcar (R25/R27)» | `ConsolidacionBodegaRefresco.test.tsx` › SLT-107 «Ver» (d) sin marca / con marca: pie solo «Cerrar» |
| `CierreBodegaMarcaConciliacion` «satélite y central leen la MISMA tarjeta» | sin pantalla viva (la tarjeta, R409) |
| `DeudasD39D40ModeloEnPantalla` «satélite y maestro leen la misma nota» | sin pantalla viva (la tarjeta); la nota del modelo nuevo en la satélite: `ConciliacionSateliteCascada.test.tsx` › R235 «con modelo nuevo, las notas del modelo nuevo» |
| `CierreDiaColaPropia` `vi.mock(ListaComprobantes)` + aserción `:163` | `cierres-retirados.guardia.test.ts` (R400) |

Ningún caso con comportamiento vivo sin cubrir.

### Archivos

- Borrados: `app/(app)/cierres-admin/_components/{CierresAdminHistoricoLista,CierresBodegaResueltosLista,CierresBodegaSolicitadosLista,ListaComprobantes}.tsx`.
- Modificados (producción): `CierresAdminModule.tsx`, `CierresBodegaAdminModule.tsx`,
  `ConsolidacionBodegaModule.tsx` (mudanza + R403), `components/private/cierres/cola/cola-cierres-labels.ts` (comentario).
- Modificados (tests): `ConsolidacionBodegaRefresco`, `CierreBodegaTarjetaCascada`, `CierreBodegaMarcaConciliacion`,
  `DeudasD39D40ModeloEnPantalla`, `CierreDiaColaPropia`, `CierresAdminPagoMensajero`,
  `descarga/DescargarResumenModeloNuevo`, `descarga/CierresBodegaResumenModeloNuevo`,
  `paginacion/paginacion-transversal`, `unit/config/paginacion-dominios`,
  `guards/{cierre-bodega-vocabulario,cascada-central-en-las-dos-pantallas,liquidacion-money-safe,cierres-retirados}`.

### T2 — mudanza sin cambiar una línea

Rangos movidos con un script por número de línea (sin reescribir) y comprobados contra `HEAD` con
`node scratchpad/verificar-mudanza.mjs` (por cada rango: `git show HEAD:<lista>` líneas a-b, buscadas
contiguas e idénticas en el módulo):

```
CierresAdminHistoricoLista.tsx:53-58 -> CierresAdminModule.tsx:336-341 (6 lineas, identicas: true)
CierresAdminHistoricoLista.tsx:73-79 -> CierresAdminModule.tsx:343-349 (7 lineas, identicas: true)
CierresAdminHistoricoLista.tsx:85-129 -> CierresAdminModule.tsx:351-395 (45 lineas, identicas: true)
CierresBodegaResueltosLista.tsx:43-48 -> CierresBodegaAdminModule.tsx:215-220 (6 lineas, identicas: true)
CierresBodegaResueltosLista.tsx:57-58 -> CierresBodegaAdminModule.tsx:222-223 (2 lineas, identicas: true)
CierresBodegaResueltosLista.tsx:79-114 -> CierresBodegaAdminModule.tsx:225-260 (36 lineas, identicas: true)
CierresBodegaSolicitadosLista.tsx:44-49 -> ConsolidacionBodegaModule.tsx:238-243 (6 lineas, identicas: true)
CierresBodegaSolicitadosLista.tsx:56-60 -> ConsolidacionBodegaModule.tsx:245-249 (5 lineas, identicas: true)
CierresBodegaSolicitadosLista.tsx:77-107 -> ConsolidacionBodegaModule.tsx:251-281 (31 lineas, identicas: true)
MUDANZA IDENTICA   EXIT=0
```

Fuera de los rangos, el diff de los módulos solo quita el import de la lista y añade a imports ya
existentes los símbolos de columnas (y `obtenerResumenCierresBodega` + el tipo `CierreBodegaResumen`
en `ConsolidacionBodegaModule`). Lo no mudado (`PAGE_SIZE_OPTIONS`, `ERROR_CARGA`, la etiqueta sin
export de resueltos, `leerPagina`) era solo del componente borrado.

`paginacion-transversal`: las filas «histórico» y «solicitados» apuntan a su módulo; sale `lector`
(ya ninguna fila lo usa: la anti-vacuidad pasa a `[]`). Como el módulo monta DOS descargas, la fila
declara `descarga` y R52 se mide sobre el cuerpo de esa función, que además debe leer solo acciones
`…Completo`; las dos mitades negativas siguen sobre el archivo entero.

### T3 — R403

Sale el montaje `{sinZona ? <CierresBodegaSolicitadosLista …/> : null}` y su comentario, y el
comentario de `cola-cierres-labels.ts` que lo citaba. `ConsolidacionBodegaRefresco`: el caso de R202
pasa a afirmar aviso presente y región/vacío ausentes; (g) afirma que sin zona no se pide ninguna página.

### T4 — R400/R409

Los dos `it.fails` de R400 pasan a `it` (verdes). `cascada-central…`: superficies esperadas `[]`; los
dos `it.each` (vacíos con cero usos) pasan a funciones `problemasR38/R21` afirmadas sobre el barrido y
sobre fuentes de muestra (contraprueba: literal y sin `cierre` → hallazgo; `cascadaCentral` en un
ajeno → hallazgo; prefijos distinguidos).

### Mutaciones (salida real)

- `descargaBodegaSolicitados` con `listarCierresBodegaSolicitadosPaginado` → `paginacion-transversal`
  «ninguno de los TRECE…» ROJO («lee una acción que no es la del conjunto»), EXIT=1. Revertido.
- `descargaHistoricoCierres` con `listarHistoricoCierresAdminPaginado` → ROJO, EXIT=1. Revertido →
  `9 passed`, EXIT=0; `verificar-mudanza` vuelve a dar MUDANZA IDENTICA.
- Restaurar `CierresBodegaSolicitadosLista.tsx` desde `HEAD` → guardia R400 ROJA en los dos casos
  («Existen: …», «… -> ./ListaComprobantes»), EXIT=1. Borrado de nuevo → `7 passed`, EXIT=0.
- Clave SWR de solicitados sin `sinZona ? null` → R403 (g) ROJO, EXIT=1. Revertido.

### Comandos (salida real)

- `pnpm run typecheck` (NODE_OPTIONS 8192): **TC_EXIT=0**.
- `pnpm exec eslint` de los 21 archivos tocados (A/M): **LINT_EXIT=0**.
- `vitest run` de los tests tocados + guardias de cierres (incl. `cierres-trato-tu`,
  `cierres-dialogos-modal`, `cierres-fecha-cr`, `cierre-detalle-superficies`) + `tests/components/descarga`
  + `tests/unit/descarga`: `Test Files 97 passed (97)`, `Tests 1153 passed (1153)`, **VITEST_EXIT=0**.
- `vitest related --run` de los 4 archivos de producción tocados: `Test Files 61 passed (61)`,
  `Tests 1209 passed (1209)`, **RELATED_EXIT=0**. El rojo heredado de la tanda 1 (`paginacion-transversal`)
  queda resuelto.

### Mapa R → test (completo)

| R | Test |
|---|---|
| R400 | `cierres-retirados.guardia.test.ts` › «ninguno de los cuatro archivos existe», «ningún archivo … los importa» |
| R401 | `descarga/DescargarResumenModeloNuevo.test.tsx`, `descarga/CierresBodegaResumenModeloNuevo.test.tsx` (solo ruta del import), `descarga/CierresDescargaColumnas.test.tsx` |
| R402 | `paginacion/paginacion-transversal.test.tsx` (filas al módulo, sin `lector`), `unit/config/paginacion-dominios.test.ts` |
| R403 | `ConsolidacionBodegaRefresco.test.tsx` › «SLT-115 R403 (sustituye a R202)…» y «(g) SLT-115 R403…» |
| R404 | `cierres-retirados.guardia.test.ts` › R404; `cierre-dia-descarga-columnas.test.ts` |
| R405 | `cierres-retirados.guardia.test.ts` › R405; `pagos-captura.guardia.test.ts` |
| R406 | `cierre-dia-descarga-columnas.test.ts` (literal); `CierresDescargaColumnas.test.tsx` |
| R407 | T6 (`git diff --name-only`): esta tanda no toca `lib/`, `db/` ni `e2e/` |
| R408 | `cierres-retirados.guardia.test.ts` › control positivo y contrapruebas |
| R409 | `cascada-central-en-las-dos-pantallas.guardia.test.ts` › superficies `[]`, `problemasR38/R21` + contrapruebas |

### Abierto

- Los comentarios mudados sin tocar dicen aún «Vive AQUÍ / aquí, con el listado» (regla «sin cambiar
  una línea»); se pueden reescribir en otra ficha.
- `cierre-bodega-vocabulario` deja de vigilar el texto de la descarga de solicitados (pasó a
  `ConsolidacionBodegaModule`, que esa guardia excluye a propósito); sigue en el censo de trato de SLT-134.

### Veredicto

T0, T2, T3 y T4 hechas: mudanza idéntica, sin zona solo el aviso, cuatro archivos borrados y guardia R400 en verde; queda T6 para el leader.
