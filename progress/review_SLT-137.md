# Review SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» — vuelta 1

reviewer, 2026-11-12. Ruta completa. Diff `origin/dev...HEAD` (head `ab00d07b`, 27 archivos).
Alcance: cola «Cierres solicitados» con rol mensajero y pendiente de pago en el servidor. R167-R179 son
de SLT-138 y no están implementados (no hay barra: `barra={null}`, sin schema de filtros, sin
`BuscadorFiltros` en el diff). Grafo MCP no consultado: todo con Grep/Read.

## Checklist

- [x] **Trazabilidad.** Cada R en alcance tiene un test que lo comprueba:
  - R60, R155, R156, R157, R158, R166, R181: `tests/components/CierreDiaColaPropia.test.tsx` (monta
    `CierreDiaModule`, literales a mano: `#AAAA1111`, `2026-07-11 04:00`, `₡12.500`; `disabled` +
    `aria-busy` solo en la fila leída; marcadores `…-Q7` imposibles por casualidad) +
    `tests/unit/utils/cola-propia-vista.test.ts` (ocho casos de R157, «Sin dato» incluido) + E2E
    `e2e/cierres-rediseno.spec.ts` («Liquidado», «Motivo: «Faltan paquetes»», «Ver» abre el detalle).
  - R71: `liquidacion-money-safe.test.ts` censa `cola-propia-vista.ts` y `TablaColaPropia.tsx`
    (mutación `Number(pendiente)` matada, según bitácora).
  - R72: integración aserción 4 (snapshots iguales) y el diff no toca `db/`, migraciones ni actions de
    escritura (comprobado en `git diff --stat`).
  - R159: `CierresDescarga.test.tsx` sin cambios y `CierresDescargaColumnas.test.tsx` adaptado.
  - R160: vacío, error y paginación en `CierreDiaColaPropia.test.tsx`; relectura tras solicitar en
    `CierreDiaModule.test.tsx` (con la espera de la revalidación de montaje que hacía sobrevivir la
    mutación); `BajoRiesgoPaginacion.test.tsx`.
  - R163: `ColaCierres.test.tsx`, `ColaCierresBodega.test.tsx`, `ColaCierresConsolidar.test.tsx` sin
    cambios y verdes.
  - R164, R165: integración Postgres real (5 aserciones, 0 skipped), unit del servicio (una llamada por
    lectura con página de 1 y de 10) y test de cableado de `buildService()`.
  - R180: los textos nuevos como literales en `cola-propia-vista.test.ts` (ver hallazgo 2).
- [~] **Tasks.** Todas `[x]` salvo T1.4 y las de cierre (gate final, review, Preview), que dependen de
  esta review. T1.4 (hallazgo 4).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 22/40 archivos, 1465/1000 líneas, con
  `<!-- tamano-pr-aceptado -->` en `progress/features/SLT-137.md` (hallazgo 5).
- [x] **`design.md > ## Lo que ya existe`** presente y con contenido; el diff no re-crea nada de la
  lista (reusa `derivarPendienteCierre`, las dos lecturas en lote, `DESTINO_TIPO_LABEL`,
  `hayPendienteDeLiquidar`, `folioDe`/`fechaHora`, `EstadoCierreBadge`, `money`, `TablaCola`).
- [x] **Calidad de código.** `pnpm run typecheck` exit 0; eslint de los 7 archivos de producción
  exit 0.
- [x] **Tests corridos por mí** (`DATABASE_URL` → `slt137_cola`):
  - servidor: integración + unit + cableado → 3/3 archivos, 13/13 tests, **0 skipped**;
  - pantalla y guardias afectados (17 archivos: cola propia, módulo, descargas, paginaciones,
    `ColaCierres*`, detalle único, evidencias, marcas de origen, `cobertura-tablas`, `cascada-central`,
    `cierres-fecha-cr`, `liquidacion-money-safe`) → 17/17, 268/268;
  - `pagos-captura.guardia` y `superficie-de-uso.guardia` → 2/2, 42/42.
- [x] **Mutación reproducida.** `cierresDeMensajeroWhere` devuelve `{}`
  (`lib/repositories/CierreDiaRepository.ts:791`): MATADA, caen el caso 1 («length of 4 but got 5») y
  el 3 (incluye el cierre de M2). Archivo restaurado desde copia, `git diff --quiet` limpio. Las otras
  cuatro y la de cableado de la bitácora son coherentes con lo que afirma cada test (C1 con pago
  anulado, C4 con premio, C3 `null`, args[8] del constructor).
- [x] **`ColaCierres.tsx`.** Cambio aditivo: tipo nuevo en la unión, `aria-label` con ternario por
  `tipo === "propios"` y una rama más antes de `bodega`. Las ramas `bodega`/satélite (SLT-106) y
  `mensajeros` (SLT-102/127) quedan con el mismo código; sus tests siguen verdes sin tocarlos (R163).
- [x] **Servidor.** `conPendientePago` sigue el patrón de `CierresAdminService.conPendiente`: ids solo
  de aprobados que ya salieron del `WHERE` del actor, dos lecturas una vez cada una, `null` fuera de
  aprobado, sin lecturas no hay campo (R165). Dinero en strings y `Prisma.Decimal`, sin floats.
- [x] **Datos y seguridad.** Sin tablas, migraciones ni queries nuevas: las dos lecturas existentes
  reciben ids ya acotados por mensajero y la empresa la pone la extensión de Prisma. Sin recursos de
  Ordenex, sin `console.log`.
- [x] **Permisos.** El rol se valida en el servicio (`forbidden` si no es mensajero), sin cambios.
- [x] **E2E con constancia.** Bitácora: proyecto `dinero` 101 passed (incluye `cierre-dia` y
  `cierres-rediseno` con el caso nuevo) y `mis-asignaciones` 4 passed, base desechable, `--retries=0`.
- [x] **Trato en tú, negativos y literales.** Textos nuevos en tú; negativos con marcadores
  imposibles por casualidad; los tests adaptados conservan lo que vigilaban (el ingreso de bodega
  `₡2.100` sigue sin verse; la fecha pasa a `2026-07-11 04:00`, más estricta).

## Desvíos declarados

- `TablaColaPropia.tsx` exporta columnas y no un `<DataTable>`: **correcto**. La cola sigue siendo una
  instancia de `DataTable` en el censo (`cobertura-tablas`), y el render lo hace `TablaCola`, la misma
  que usan las otras variantes.
- `VER_DETALLE_LABEL` → `VER_PROPIA`: **correcto**. Su único uso se mudó a la cola; dejarla sería una
  constante muerta. El nombre accesible «Ver del cierre del <día>» no cambia.
- `CierresDescargaColumnas.test.tsx` fuera de la lista: **correcto**. Ya lo marcó T0.2. El ámbito por
  `seccion` (la `<section>` del `h2`) sigue acotando el «Descargar» a «Cierres solicitados» y no se
  confunde con los de las otras cinco secciones.
- `LecturasPendienteCierre` declarada por forma: **correcto**. Las firmas coinciden con las de los
  repositorios (lo comprueba `tsc` en `buildService()` y en la integración), y `Pick<IRepo>` metía
  `@prisma/client` en el grafo del navegador (`pagos-captura` verde ahora).

## Hallazgos

1. **menor** — `components/private/cierres/cola/cola-propia-vista.ts:19` define `ERROR_PROPIA`, pero
   la pantalla pinta `ERROR_PASADOS` (`app/(app)/cierre-dia/_components/CierreDiaModule.tsx:451`),
   con el mismo texto: un texto con dos nombres, y la constante de la vista solo la usa el test. El
   texto en pantalla sí lo comprueba `CierreDiaColaPropia.test.tsx:170`. Usa una sola (SLT-138 o
   SLT-115).
2. **menor** — `tests/unit/utils/cola-propia-vista.test.ts:109`: el regex de voseo
   `\b(…|hacé|buscá|mirá)\b` no detecta las formas que acaban en vocal con tilde (`\b` sin flag `u`
   trata «á» como no-palabra). Comprobado: `"Buscá por folio"` → `false`. R180 queda cubierto por los
   literales del mismo archivo, pero esa aserción no vigila lo que dice. SLT-138 lo va a heredar con
   «Busca por folio»: conviene arreglarlo allí (`(?<![\p{L}])…(?![\p{L}])` con flag `u`).
3. **menor** — `components/private/cierres/cola/TablaColaPropia.tsx:204`: el comentario nombra «el
   calendario de Costa Rica». Es un comentario sobre la utilidad que ya existía, `fechaCalendarioCR`,
   y ya estaba en `CierreDiaModule`, así que no es un literal de configuración. Aun así, en código
   nuevo mejor «la zona de la empresa».
4. **menor** — `specs/SLT-137-cierre-dia-cola-filtros/tasks.md:86`: T1.4 sigue `[ ]`. Lo que pide ya
   está hecho: el tamaño se midió y lo aceptó Carlos, y `./init.sh` dio `init OK` en T2.6
   (`progress/impl_SLT-137.md:235`). Márcala al cerrar.
5. **menor** — `progress/features/SLT-137.md` (línea `tamano-pr-aceptado`): Carlos aceptó una
   proyección de ~1 250-1 290 líneas, y el PR mide 1 465. El script lo da por aceptado. Conviene que el
   PR diga la cifra real para que Carlos la vea.
6. **menor (spec)** — `requirements.md:212` (R164) dice que el pendiente es «`min(P, E)` …». La
   función, el código, la integración y el E2E usan `P − min(P, E)` (C2: P 2 000 / E 5 000 → 0.00).
   Lo que se implementó es correcto; el texto del requisito, copiado de SLT-108, está mal redactado.
   Corrígelo en SLT-138 al copiar.
7. **menor** — no consta `e2e/dos-empresas-humo.spec.ts`. El diff no añade queries: reusa dos
   lecturas con ids ya acotados, y ese E2E no visita `/cierre-dia`. No hace falta para este PR; queda
   anotado.

## Veredicto

**OK.** Sin bloqueantes. Los hallazgos 1-7 son menores y no frenan el PR.
