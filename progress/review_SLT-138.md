# Review SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» — vuelta 1

reviewer, 2026-11-12. Ruta completa. Diff `origin/dev...HEAD` (head `f7f6ab65`, 28 archivos, 22 que
cuentan para el tamaño). PR #143. Grafo MCP no consultado: todo con Grep/Read.

## Checklist

- [x] **Trazabilidad R167-R180.** Cada R tiene al menos un test que lo comprueba de verdad:
  - R167: `tests/components/CierreDiaColaFiltros.test.tsx` (monta `CierreDiaModule`; searchbox
    «Buscar», selector con solo «Fecha de solicitud» y «Estado»); el servidor por R168-R174.
  - R168: `tests/unit/actions/cierre-dia-filtros-borde.test.ts`: claves coladas dentro y fuera
    (`mensajeroId`, `mensajeroIds`, `destinoZonaIds`), `desde > hasta`, en las dos acciones, con el
    servicio doble `not.toHaveBeenCalled()`.
  - R169: integración casos 3 y 4 (bordes 23:59 / 00:00 en hora del país);
    `cierre-dia-pasados-filtros.test.ts` (zona solo con rango).
  - R170: integración caso 5; borde (`[]`, `"consolidado"`).
  - R171: `folio-cierre.test.ts`; integración casos 2 («#3f2a» con espacios, K5 con «3f2a» fuera del
    folio no sale), 7 y 12 (`%`/`_` literales); servicio (imposible sin repo); borde (20 pasa, 21 no).
  - R172: integración casos 5, 6, 8, 9, 11 y 13; `historicos-paginados-where.test.ts`.
  - R173: integración casos 1 y 10 (orden literal `K3,K2,K5,K1,K4`); where sin filtros
    `{ mensajeroId }` exacto; servicio y borde (llamada de antes).
  - R174: integración caso 9 (archivo = todos los aprobados, K6 de otro mensajero fuera);
    componente («Descargar» manda `{ filtros }`, sin filtros `undefined`).
  - R175: componente (desde la página 2 → `{ page: 1, pageSize: 25, filtros }`, pestaña = `total`);
    E2E.
  - R176: componente («Ningún cierre coincide con los filtros.» y negativo del vacío normal); vista
    (literal); E2E.
  - R177: componente (placeholder «Busca por folio», solo dos filtros, sin «Bodega»/«Mensajero», cuatro
    estados sin `group`, sin aviso «Filtro activo»); vista (`opcionesEstadoPropias`). Ver hallazgo 2.
  - R178: componente («Limpiar todo» → campo vacío, sin chip de Estado, `{ page: 1, pageSize: 25 }`);
    E2E.
  - R179: `FiltrosCierresBarra.tsx`, `ColaCierres.tsx`, `BuscadorFiltros.tsx` y `FilterComponent.tsx`
    fuera del diff (comprobado en `git diff --stat`); `FiltrosCierresBarraEstado`,
    `CierresAdminFiltros` y `CierresAdminPage` verdes sin tocar.
  - R180: `cola-propia-vista.test.ts` con el regex Unicode y su control positivo.
- [~] **Tasks.** T0-T2 `[x]`. T3.1 (gate final) y T3.2 (mapa en la bitácora, ya escrito en las dos
  tandas) siguen `[ ]`: son el cierre que depende de esta review (mismo criterio que en SLT-137).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 22/40 archivos, 1557/1000 líneas, con
  `<!-- tamano-pr-aceptado -->` en `progress/features/SLT-138.md`.
- [x] **`design.md > ## Lo que ya existe`** presente (31 líneas). El diff reusa `filtrosWhere`,
  `filtrosConLimites`, `tieneRangoDeFechas`, `fechaCalendario`, `listaDeEstados`, `rangoCoherente`,
  `ATAJOS_CREACION`, `ESTADO_LABEL`, `BuscadorFiltros`, `FilterComponent`, `ColaCierres`,
  `DescargarDatasetButton`. `aFiltrosPropios` repite el patrón del `aFiltros` privado del admin, como
  pide el design (ese archivo no se puede tocar, R179); no es re-creación (hallazgo 4).
- [x] **SQL a mano del folio.** `$queryRaw` con plantilla etiquetada (dos parámetros, nada
  interpolado), `strpos` (sin comodines), acotada por `"mensajero_id"`. La empresa: el
  archivo ya es `porRls` en `lib/db/excepciones-aislamiento.ts:35`; `docs/architecture.md:63-65`
  dice que la RLS (`servi_app`) cubre el SQL a mano, y `lib/db/extension-empresa.ts:15-23` envuelve el
  SQL a mano con la empresa (sin empresa, `EmpresaNoResuelta`). Escribir `organizacion_id` obligaría a
  sacar el archivo de la lista, con el resto de su SQL sin filtrar (design.md:185-189, aprobado). El
  checkpoint «test de integración con dos empresas» lo cubre el caso 13, como `servi_app`: con otra
  empresa la lectura no ve nada. Es correcto apoyarse en la RLS aquí; además, el `WHERE` principal
  (Prisma, con extensión) vuelve a exigir `mensajeroId` y la empresa.
- [x] **Mutación reproducida por mí:** quitar `"mensajero_id" = ${mensajeroId}` del SQL del folio →
  integración `2 failed | 11 passed` (caen 11 y 13, sale K6). Revertida con
  `git checkout -- lib/repositories/CierreDiaRepository.ts`, árbol limpio.
- [x] **Regex de `criterio-unico.guardia.test.ts` (MUTACION 3).** `\(mensajeroId\)` → `\([^)]*\)`:
  solo amplía lo que la mutación sustituye, y `mutar()` (línea 330-338) afirma que el patrón cambió
  algo, así que no puede volverse un no-op silencioso. La guardia sigue igual de estricta; verde.
- [x] **Regex de voseo.** De `\b(...)\b/i` a `(?<!\p{L})(...)(?!\p{L})/iu` y con `usá` añadido: más
  estricto (el viejo no casaba ninguna palabra acabada en tilde), con control positivo «Buscá por
  folio» / «Usá los filtros» y negativo «Busca por folio».
- [x] **Paginación.** `aplicarFiltrosPropios` pone la página 1; los filtros van en la clave de SWR;
  `fallbackData` solo con página 1, tamaño inicial y `sinFiltrosPropios`. Sin filtros, la petición es
  `{ page, pageSize }` y la descarga `undefined` (R173).
- [x] **Literales y negativos.** Literales del spec escritos a mano en vista, componente y E2E.
  Negativos con «ZZ» (imposible en un folio hex), «Filtro activo», «Bodega»/«Mensajero». Trato tú.
- [x] **Calidad.** `pnpm run typecheck` `TC_EXIT=0`, 0 errores. `eslint` de los 18 `.ts/.tsx` del diff:
  `LINT_EXIT=0`, 0 errores (2 avisos ya existentes en `historicos-paginados-where.test.ts:42-43`,
  fuera del diff).
- [x] **Tests corridos por mí** (`DATABASE_URL` → `slt138_filtros`):
  - 16 archivos (integración, folio, borde, servicio, where, criterio-unico, vista, componente,
    descarga-action, CierresDescarga, tres del admin, pasados-completo, pasados-paginado,
    filtros-cierres-alcance): `16 passed`, `216 passed`.
  - Integración sola, verbose: `13 passed (13)`, ninguno skipped.
  - Guardias y vecinos (`ambito-columnas`, `cobertura-tablas`, `liquidacion-money-safe`,
    `sql-a-mano-por-empresa`, `CierreDiaModule`, `CierreDiaColaPropia`, `BajoRiesgoPaginacion`):
    `129 passed`.
- [x] **CI del PR #143:** `gate-completo`, `estatico`, `e2e (dinero|aislamiento|reparto)` en `pass`
  sobre `f7f6ab65`.
- [x] **E2E en local (pantalla tocada):** bitácora tanda 2, `cierres-rediseno` + `cierre-dia`
  `18 passed`; CI también verde.
- [x] Sin migraciones, sin `db/`, sin dependencias nuevas, sin recursos de Ordenex, sin secretos.

## Hallazgos

1. **menor** — `app/(app)/cierre-dia/_components/FiltrosColaPropiaBarra.tsx:46`: comentario nuevo
   «resueltos al calendario de Costa Rica». No es un literal de código (la función
   `ultimosNDiasCalendarioCR` ya existe y la usa el admin), pero nombra el país en código nuevo. Mejor
   «al calendario del país».
2. **menor** — R177, «los mismos atajos de rango que `/cierres-admin`»: ningún test lo comprueba
   (la trazabilidad de `tasks.md:98` dice «atajos»). Se cumple por construcción (las dos barras mapean
   `ATAJOS_CREACION`), así que no bloquea; un `expect` de las opciones del rango lo cerraría.
3. **menor** — `e2e/cierres-rediseno.spec.ts:355-357`: con un solo cierre, el paso «busca 4 caracteres
   del folio» da 1 con o sin filtro; y «ZZ» se corta en el servicio sin llegar al SQL. El E2E no
   recorre `strpos` contra la base real (lo cubre la integración, casos 2, 6 y 11).
4. **menor** — `FiltrosColaPropiaBarra.tsx:47-51` y `cola-propia-vista.ts:61-72` repiten en pequeño
   el mapeo de atajos y el `aFiltros` de `FiltrosCierresBarra.tsx` (privados allí; R179 impide
   exportarlos en esta ficha). Previsto en el design; candidato a compartir cuando se pueda tocar la
   barra del admin.
5. **menor** — `specs/SLT-138-cierre-dia-buscador-filtros/tasks.md:76-82`: T3.1 y T3.2 sin marcar.
   Dependen de esta review; el leader las cierra con el gate final.

## Veredicto

**OK.** Sin bloqueantes: R167-R180 trazados a tests que fallan con su mutación, el SQL del folio
parametrizado y acotado por mensajero y por la RLS (caso 13), la barra del admin intacta y CI verde.
