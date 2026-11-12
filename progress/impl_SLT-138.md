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
