# SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» — implementación

## Tanda 1 — servidor (backend_dev, 2026-11-12): T0 y T1

### T0
- T0.1: rama al día con `origin/dev` (`git log origin/dev..HEAD` = solo los commits del spec), `.env`
  ya en el worktree, junction de `node_modules` creado. `./init.sh` **no** sale verde de partida por
  algo ajeno a la rama: `feature_list.json` (de la raíz) tiene 7 fichas `fullstack` in_progress con
  tope 5. Lo resuelve el leader; typecheck, lint, guardias y tests se corrieron a mano (abajo).
- T0.2: censo con Grep (`DESCARGA_CIERRES_PASADOS`, `listarCierresPasadosCompleto`,
  `cierresDeMensajeroWhere`, `components/private/cierres/`, `barra={null}`). Cambian de verdad en T1:
  - `tests/unit/actions/cierre-dia-descarga-action.test.ts`: solo el comentario de cabecera.
  - `tests/unit/repositories/criterio-unico.guardia.test.ts`: **no estaba en `## Archivos esperados`**
    y se añadió allí antes de tocarlo. Su MUTACION 3 buscaba el literal
    `cierresDeMensajeroWhere(mensajeroId);`; con los dos parámetros nuevos su regex pasa a
    `cierresDeMensajeroWhere\([^)]*\);`. La guardia sigue exigiendo que página y archivo lean la misma
    declaración (por eso el `where` va en línea en los dos métodos y no en un helper).
  - `tests/unit/services/cierre-dia-pasados-completo.test.ts` afirma
    `listarCierresPasadosCompleto.length === 1`: no se toca; el parámetro nuevo lleva valor por
    defecto (`filtros: … = undefined`) para que solo el actor siga siendo obligatorio.
  - `CierresDescarga.test.tsx`, `censo-tablas.ts`, `liquidacion-money-safe.test.ts`: son de T2 (no se
    tocan en esta tanda).

### Archivos
Producción: `lib/utils/folio-cierre.ts` (nuevo), `lib/types/filtros-cierres.ts`, `lib/types/cierre.ts`,
`lib/actions/cierre-dia.ts`, `lib/interfaces/repositories/ICierreDiaRepository.ts`,
`lib/interfaces/services/ICierreDiaService.ts`, `lib/repositories/CierreDiaRepository.ts`,
`lib/services/CierreDiaService.ts`.

Tests: `tests/unit/utils/folio-cierre.test.ts`, `tests/unit/actions/cierre-dia-filtros-borde.test.ts`,
`tests/unit/services/cierre-dia-pasados-filtros.test.ts` (nuevos);
`tests/integration/db/cierre-dia-filtros-propios.test.ts` (nuevo);
`tests/unit/repositories/historicos-paginados-where.test.ts` (2 casos nuevos),
`tests/unit/repositories/criterio-unico.guardia.test.ts` (regex de la MUTACION 3),
`tests/unit/actions/cierre-dia-descarga-action.test.ts` (comentario).

### Decisiones técnicas
- **SQL del folio:** `strpos(upper(right("id", 8)), $texto) > 0`, parametrizada con `$queryRaw`
  (plantilla etiquetada, nada interpolado). `strpos` no interpreta `%`/`_`, así que no hay que
  escaparlos; además `normalizarFolio` solo deja pasar `0-9A-F`. Casos 12 de la integración: `%` y
  `_` devuelven cero filas.
- **Empresa en el SQL a mano:** no se escribe `organizacion_id` (design: el archivo es `porRls` en
  `lib/db/excepciones-aislamiento.ts`). Se prueba en el caso 13 de la integración: como `servi_app`
  con la empresa propia salen K1/K2; con otra empresa, nada.
- `normalizarFolio` sigue la regla del design al pie: `trim` → quita UN «#» → mayúsculas. «# 3F2A»
  queda con un espacio interior → imposible (está en el test).
- Un bloque que tras normalizar no recorta nada (`{}`, `{ folio: "  " }`, `{ folio: "#" }`) llega al
  repositorio como `undefined`: la llamada es la de antes (R173).
- Folio imposible corta antes de leer la zona y el repositorio.

### R → test (servidor)
| R | Test |
|---|---|
| R168 | `tests/unit/actions/cierre-dia-filtros-borde.test.ts` (claves coladas dentro y fuera, `desde > hasta`, mismo bloque en las dos acciones) |
| R169 | integración casos 3 y 4; `tests/unit/services/cierre-dia-pasados-filtros.test.ts` (zona solo con rango) |
| R170 | integración caso 5; `cierre-dia-filtros-borde.test.ts` (`[]`, `"consolidado"`) |
| R171 | `tests/unit/utils/folio-cierre.test.ts`; integración casos 2, 7 y 12; `cierre-dia-filtros-borde.test.ts` (20 pasa, 21 no); `cierre-dia-pasados-filtros.test.ts` (imposible sin repo) |
| R172 | integración casos 5, 6, 8, 11 y 13; `historicos-paginados-where.test.ts` (alcance dentro del `AND`, mismo `where` en `findMany`/`count`/archivo) |
| R173 | integración casos 1 y 10; `historicos-paginados-where.test.ts` (sin filtros `{ mensajeroId }`); `cierre-dia-pasados-filtros.test.ts`; `cierre-dia-filtros-borde.test.ts` |
| R174 | integración caso 9 |

R167, R175-R180 son de T2 (pantalla).

### Mutaciones (T1.6), contra `slt138_filtros`, una a una, revertidas (`git status` limpio tras cada una)
| # | Mutación | Resultado | Caso que cae |
|---|---|---|---|
| 1 | quitar `{ mensajeroId }` del `AND` | MATADA | 3, 4, 5, 8, 9 (sale K6) |
| 2 | no añadir `id in idsPorFolio` | MATADA | 2 (devuelve 5) |
| 3 | `strpos(upper("id"), …)` (id entero) | MATADA | 2 (sale K5), 11, 13 |
| 4 | `lt` → `lte` en `filtrosWhere` (CierresAdminRepository, solo en local) | MATADA | 3 (sale K3) |
| 5 | quitar la condición de `estados` (`filtrosWhere`, solo en local) | MATADA | 5, 8, 9 |
| 6 | quitar `"mensajero_id" = …` de `idsDeCierresPorFolio` | MATADA | 11, 13 (sale K6) |
| 7 | sin `toUpperCase` en `normalizarFolio` | MATADA | 2 (devuelve 0) |
| 8 | `findCierresByMensajero` con el `where` de hoy | MATADA | 9 (devuelve 5) |

### Salidas (base desechable `slt138_filtros`: base nueva + `migrate deploy` + `db:seed`)
- `pnpm run typecheck` (NODE_OPTIONS 8192): `TC_EXIT=0`, 0 errores.
- `pnpm run lint`: `✖ 243 problems (0 errors, 243 warnings)`, ninguno en archivos de esta rama.
- Unit tocados (10 archivos: folio, borde, servicio-filtros, where, descarga-action, pasados-paginado,
  pasados-completo, pendiente-pago, filtros-cierres-alcance, criterio-unico): `Test Files 10 passed`,
  `Tests 115 passed`.
- Integración `cierre-dia-filtros-propios.test.ts`: `Tests 13 passed (13)`, ninguno skipped.
- `pnpm run test:guardias`: `Tests 4 failed | 4851 passed | 1 skipped`. Los 4 rojos son todos de
  `dependencias-declaradas-presentes.guardia.test.ts` («init.sh ya no tiene el marcador FIN PASO 2»).
  `init.sh` y ese test son idénticos a `origin/dev`: el rojo ya está en dev y no viene de esta rama.
- `./init.sh`: corta en `feature_list.json invalido` (cupo fullstack 7/5), antes de los tests.

### Incidencias de entorno
- **Cliente Prisma compartido:** a las 15:12 el worktree de SLT-123 corrió `prisma generate`; el
  cliente espera `cierre_dia.pago_independiente_efectivo`. Siguiendo el aviso del leader, se añadió la
  columna SOLO en `slt138_filtros` (`ALTER TABLE cierre_dia ADD COLUMN IF NOT EXISTS
  pago_independiente_efectivo boolean NOT NULL DEFAULT false`). Ningún archivo de la rama la usa. Los
  13 casos y las 8 mutaciones corrieron antes de esa regeneración; tras la columna, los 13 casos
  vuelven a salir verdes.
- **`vitest related` sobre `lib/types/cierre.ts`** arrastra casi toda la suite de integración: se cortó
  a mano. En paralelo sobre una sola base, sus tests de migración alteraron el esquema. La base se
  recreó. Muestra de sus rojos, uno a uno en base limpia: `cierre-dia-pendiente-pago`,
  `cierre-incluye-modelo-nuevo` y `nucleo-sin-modulos` salen verdes. `aporte-capital` y
  `wallet-origen-legible` siguen rojos («base sin sembrar», «EmpresaNoResuelta»), igual que en un
  worktree de `origin/dev` contra la misma base: es el entorno, no esta rama.

### Veredicto
T0 y T1 hechas: servidor de filtros con R168-R174 probados y las 8 mutaciones matadas. Falta T2 (pantalla).

## Tanda 2 — pantalla (frontend_dev, 2026-11-12): T2

### Archivos
Producción: `app/(app)/cierre-dia/_components/FiltrosColaPropiaBarra.tsx` (nuevo),
`app/(app)/cierre-dia/_components/CierreDiaModule.tsx`, `components/private/cierres/cola/cola-propia-vista.ts`.

Tests: `tests/components/CierreDiaColaFiltros.test.tsx` (nuevo, 7 casos),
`tests/unit/utils/cola-propia-vista.test.ts` (regex de voseo + 6 casos), `tests/components/descarga/CierresDescarga.test.tsx`
(solo el comentario de cabecera del caso del archivo), `e2e/cierres-rediseno.spec.ts` (1 caso en el escenario A).

Sin tocar (R179): `FiltrosCierresBarra.tsx`, `ColaCierres.tsx`, `BuscadorFiltros.tsx`, `FilterComponent.tsx`.
Censo de T0.2: `censo-tablas.ts` y las guardias de descarga siguen viendo `ambitoColumnas:` como propiedad
del objeto que devuelve `descargaCierresPasados(filtros)`; no cambian.

### Decisiones técnicas
- La barra sigue la lectura de URL por defecto de `BuscadorFiltros` (como la del admin): `q`, `fecha` y
  `estado` se leen al entrar y «Limpiar todo» los retira.
- `aFiltrosPropios` omite toda clave vacía; `leerCierresPasados` manda `filtros` solo si
  `!sinFiltrosPropios(filtros)` (R173: sin filtros la petición es `{ page, pageSize }`, la de antes).
- Voseo: el regex viejo `\b(...)\b/i` NO casa «Buscá por folio» ni «Usá los filtros»; el nuevo
  `(?<!\p{L})(...)(?!\p{L})/iu` sí, y no casa «Busca por folio» (comprobado una vez con node, y queda
  como control positivo en el test).

### R → test (pantalla)
| R | Test |
|---|---|
| R167 | `CierreDiaColaFiltros.test.tsx` («la barra usa el buscador y los filtros de la app, con folio, fecha y estado») |
| R174 | `CierreDiaColaFiltros.test.tsx` («Descargar» con filtro manda `{ filtros }`; sin filtros, sin entrada) |
| R175 | `CierreDiaColaFiltros.test.tsx` (desde la página 2 → página 1 con filtros, pestaña = `total`; folio con foco y texto); `e2e/cierres-rediseno.spec.ts` |
| R176 | `CierreDiaColaFiltros.test.tsx` (vacío filtrado); `cola-propia-vista.test.ts` (texto); `e2e/cierres-rediseno.spec.ts` |
| R177 | `CierreDiaColaFiltros.test.tsx` (placeholder, solo dos filtros, cuatro estados sin grupo, sin aviso); `cola-propia-vista.test.ts` (`opcionesEstadoPropias`) |
| R178 | `CierreDiaColaFiltros.test.tsx` («Limpiar todo» → página 1 sin `filtros`); `e2e/cierres-rediseno.spec.ts` |
| R179 | `FiltrosCierresBarraEstado.test.tsx`, `CierresAdminFiltros.test.tsx`, `CierresAdminPage.test.tsx` sin tocar y verdes |
| R180 | `cola-propia-vista.test.ts` («ningún texto usa voseo» con el regex Unicode y su control positivo) |

### Mutaciones (pantalla), una a una sobre `CierreDiaModule.tsx`, restauradas desde copia (sin stash)
| # | Mutación | Resultado | Caso que cae |
|---|---|---|---|
| P1 | `aplicarFiltrosPropios` sin `setPasadosPage(1)` | MATADA | R175 «desde la página 2…» |
| P2 | `leerCierresPasados` sin `filtros` en la acción | MATADA | 6 de 7 (R174-R178) |
| P3 | `descargaCierresPasados` sin `{ filtros }` | MATADA | R174 |

### Salidas (unit/componente contra `slt138_filtros`; E2E contra `slt138_e2e`)
- `pnpm run typecheck` (NODE_OPTIONS 8192): `TC_EXIT=0`, 0 errores.
- `eslint` de los 6 archivos tocados: `LINT_EXIT=0`, sin avisos.
- Nuevos: `CierreDiaColaFiltros.test.tsx` + `cola-propia-vista.test.ts`: `Tests 27 passed (27)`.
- Tocados y vecinos (23 archivos: los dos nuevos, `CierreDiaModule`, `CierreDiaColaPropia`, `BajoRiesgoPaginacion`,
  `FiltrosCierresBarraEstado`, `CierresAdminFiltros`, `CierresAdminPage`, `CierresDescarga`, `CierresDescargaColumnas`,
  `CierreDiaPage`, `CierreDiaDetalleUnico`, `CierreDiaModuleIncidente`, `CierreDiaModule477Correccion`,
  `CierreDiaMotivoRechazoAutomatico`, `CierreDiaComprobanteMarcasDeOrigen`, `CierreEvidenciasVarias486`,
  `paginacion-transversal`, `liquidacion-money-safe` y las guardias de descarga `ambito-columnas`, `cobertura-tablas`,
  `contadores-cabecera`, `adaptador-conjunto`): `Test Files 23 passed`, `Tests 298 passed (298)`.
- `pnpm run test:guardias`: `Tests 4 failed | 4851 passed | 1 skipped`; los 4 rojos son los mismos de la tanda 1
  (`dependencias-declaradas-presentes.guardia.test.ts`, ya en `origin/dev`).
- E2E (candado `e2e.lock`, puerto 3000, `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3000` como en
  `gate.yml`), `--project=dinero e2e/cierres-rediseno.spec.ts e2e/cierre-dia.spec.ts`: `18 passed (2.4m)`, el caso nuevo
  incluido («mensajero A: busca por folio, ve el vacío filtrado y «Limpiar todo» devuelve su cierre»).
- Base E2E `slt138_e2e`: nueva + `migrate deploy` + `db:seed` + la columna `cierre_dia.pago_independiente_efectivo`
  añadida SOLO ahí (`ALTER TABLE … ADD COLUMN IF NOT EXISTS … DEFAULT false`), porque el cliente Prisma compartido
  lo exige desde SLT-123. Ningún archivo de la rama la usa.
- `node scripts/tamano-pr.mjs`: `22/40 archivos, 1557/1000 líneas`, aceptado por el humano (2026-11-12).

### Veredicto
T2 hecha: barra de folio, fecha y estado sobre `BuscadorFiltros`, filtros en la clave y en «Descargar», R167 y
R174-R180 probados en pantalla y E2E, 3 mutaciones matadas. Falta T3 (cierre).

## Sync con SLT-109

`git merge origin/dev` (entró SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página»), merge
`b3d2479e`. Un solo archivo en conflicto; el resto (incluido `tests/components/descarga/CierresDescarga.test.tsx`)
se mezcló solo.

- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`: cuatro trozos. Base = estructura de SLT-109 (`DetalleCierre`
  en marco página arriba, cola «Cierres solicitados» abajo). De SLT-138 se conservan: imports de
  `FiltrosColaPropiaBarra` y `sinFiltrosPropios`/`FiltrosColaPropia`, `descargaCierresPasados(filtros)`,
  `leerCierresPasados(page, pageSize, filtros)`, filtros en la clave SWR, `fallbackData` solo sin filtros, reset a la
  página 1, `barra`, vacío según filtros. Los JSDoc toman el texto corto de SLT-109 más la nota de SLT-138. Se quitó
  el import de `BotonesEvidencia`: SLT-109 lo dejó de usar. Todo lo de SLT-138 tiene sitio en la estructura nueva.

Verificación (base `slt138_filtros`):
- `pnpm run typecheck`: exit 0. `eslint` de `CierreDiaModule.tsx`, `FiltrosColaPropiaBarra.tsx`,
  `CierresDescarga.test.tsx`: `No issues found`.
- `CierreDiaColaFiltros`, `cola-propia-vista`, `CierreDiaModule`, `CierreDiaPagina`, `CierreDiaColaPropia`,
  `CierresDescarga*`, integración `cierre-dia-filtros-propios` (13/13 contra Postgres), guardias `cierres-*`,
  `cierre-*`, `tests/unit/descarga/`, `descargas-por-registro`, `filtros-cierres-alcance`, `criterio-unico`,
  `pago-mensajero-money-safe`: `Test Files 63 passed (63)`, `Tests 757 passed (757)`. Guardias `money-safe`:
  `Tests 63 passed (63)`.
- Mutaciones (sobre `CierreDiaColaFiltros` + `CierresDescarga*`), revertidas con `git checkout`:
  sin reset de página → 1 rojo; sin pasar filtros a la acción → 6 rojos; descarga sin filtros → 1 rojo.
- E2E (candado, puerto 3000, base nueva `slt138_e2e_b` + `migrate deploy` + `db:seed` + columna
  `pago_independiente_efectivo` solo ahí, `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3000`):
  `--project=dinero e2e/cierres-rediseno.spec.ts e2e/cierre-dia.spec.ts`: `19 passed (1.4m)`.
- `node scripts/tamano-pr.mjs`: `22/40 archivos, 1556/1000 líneas`, aceptado por el humano (2026-11-12).

Veredicto: sync con SLT-109 hecho sin perder nada de SLT-138; verde en typecheck, lint, tests, mutaciones y E2E.
