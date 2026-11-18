# SLT-185 «aporte-capital sin empresa en contexto» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1140–R1149**

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`.

**Solo tests.** El diff toca `tests/` y `tests/baseline-rojos.json`. La action que falla cerrado sin
empresa (`EmpresaNoResuelta` → `INTERNAL` o `unauthenticated`) se comporta **como debe** en
producción: la empresa sale de la sesión, y en un test que llama a la action fuera de una petición
la tiene que poner el test. Si al implementar hiciera falta tocar `lib/`, `app/`, `db/` o
`scripts/`, se para (ver R1148).

## Origen

- SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31», T1 (run de CI
  43973243440): `aporte-capital` sale «otra causa / sin empresa en contexto»
  (`progress/medicion_SLT-177.md:86`).
- Decisión de Carlos del 2026-11-16 (`progress/features/SLT-177.md:21`, tarjeta del board): el
  alcance se amplía a las 8 entradas que, tras sembrar sus helpers en SLT-177, caen por la misma
  familia de causa. Total: **9 entradas** del baseline que hoy citan «La retira SLT-185».

## Lo que ya existe

Buscado `EmpresaNoResuelta`, `conEmpresa459`, `sembrarComprometido`, `reglasPaisFijas`, `conEmpresa`
en `feature_list.json`, `specs/`, `tests/` y `lib/` (Grep/Read; no se usó el grafo: se buscan
fixtures de test, no símbolos de producto).

| Dónde | Qué hay | Qué se hace |
|---|---|---|
| `tests/integration/db/_fixtures/escrituras-459.ts:134-140` | `conEmpresa459(p, cuerpo)`: «Sin esto, la action falla cerrado (`EmpresaNoResuelta` → `INTERNAL`) y el test no mide nada». Lo usan 10 archivos (p. ej. `pago-por-cuenta-tienda.test.ts:70`). | **Se reutiliza** en `aporte-capital` y `ajuste-caja-anulacion-461`. |
| `tests/fabricas/reglas-pais.ts` (`reglasPaisFijas`) y `lib/actions/_shared/zona-del-borde.ts:9-11` | El borde acepta `deps.reglasPais`; sin él lee el país de la empresa en curso con el cliente global. | **Se reutiliza** en `picking-resumen-tiendas`. |
| `tests/integration/db/419/_escenario-419.ts:298-324` (`conEscenario419`) y `tests/fabricas/organizaciones.ts` (`crearOrganizacion`, `fijarEmpresa`) | Patrón ya probado para fijar la empresa en una tx. | **Se reutiliza** para los escenarios CONFIRMADOS. |
| Board | Ninguna otra ficha cubre estas 9 entradas. SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)» cubre otras del mismo helper 454 (no se tocan). SLT-188 «Tests que dejan filas fuera de su transacción» vigila las filas confirmadas que deja un test. | Se sigue; R1145 cuida la frontera con SLT-188. |

## Alcance: las 9 entradas y su causa diagnosticada

| # | archivo (`tests/integration/db/…`) | causa con evidencia | lado |
|---|---|---|---|
| 1 | `aporte-capital.test.ts` | `conPersonas` (`:65-75`) siembra con `sembrarPersonas459` y llama a `registrarAporteCapitalAction` **sin** `conEmpresa459`: `WalletMovimiento.aggregate` sin empresa → `toActionError` lanza `AppErrorCode inesperado INTERNAL` (`lib/actions/aporte-capital.ts:70`). Además, tras arreglar el contexto: el caso R71 (`:229-250`) exige «movimientos de caja anteriores a hoy» (`:234`) que una base nueva no tiene, y `haySaldoInicialVigente()`/`primerDiaDeLaCaja` (`:81`, `:124`, `:231`) leen con el cliente del dueño, **sin acotar a la empresa**. | test |
| 2 | `ajuste-caja-anulacion-461.test.ts` | Mismo patrón: `conPersonas` (`:239-249`) sin `conEmpresa459`; `registrarMovimientoManualAction` → `EmpresaNoResuelta` en `WalletMovimiento.createMany`. | test |
| 3 | `picking-resumen-tiendas.test.ts` | Llama a `listarTiendasPicking` (`:41`, `:70`, `:93`) sin `reglasPais` en `deps`; `zonaDelBorde` (`lib/actions/informe-picking.ts:56`) lee el país con el cliente global → `EmpresaNoResuelta: … Pais.zonaHoraria`. | test |
| 4 | `premio-ranking-idempotencia.test.ts` | 16/17 verdes; el caso «293/T2.5» (`:1067-1088`) llama a la action real `listarCierresAdmin` sin `deps.service` y sin empresa en contexto → `EmpresaNoResuelta` en `CierreDia.findMany` → `unauthenticated` (`:1080` espera `ok`). | test |
| 5 | `454/registro-gestion-concurrencia-sql-real.test.ts` | `sembrarComprometido` (`454/_escenario.ts:804-825`) abre `mundo.prisma.$transaction` **sin fijar empresa**: `zona.create` viola `organizacion_id NOT NULL` (SL-17). Llamada en `:44`. | test (helper) |
| 6 | `454/caracterizacion/corte-concurrencia.test.ts` | Ídem, `:52`. | test (helper) |
| 7 | `454/caracterizacion/no-doble-gestion.test.ts` | Ídem, `:49`. | test (helper) |
| 8 | `419/confirmar-entrega-lote-sql-real.test.ts` | 9 casos verdes; el bloque «R8 — concurrencia real» (`:265-319`) siembra CONFIRMADO con `crearPersonas419(mundo, mundo.prisma)` (`:277`) sin empresa: `zona.create` de la central (`419/_escenario-419.ts:160`) viola `organizacion_id NOT NULL`. Los clientes `c1`/`c2` (`:275-276`) tampoco llevan empresa. | test |
| 9 | `454/senales-gestion-lectores-sql-real.test.ts` | **El motivo del baseline no cuadra con el código**: cita `sembrarComprometido`, pero el archivo no lo llama. Hipótesis a medir en T1: el escenario «hermano» `crearEscenario(e.mundo, e.tx, e.cliente)` (`:119`) siembra una **segunda zona central en la misma empresa** (`454/_escenario.ts:410-419`) y choca con el único `(organizacion_id, es_central)` (`db/migrations/20261023090000_unicos_por_empresa/migration.sql:92`); y/o `obtenerHistorialOrden` (`:199`) sin empresa. | test (a confirmar) |

Efectos que el arreglo tiene que vigilar:
- Los helpers CONFIRMADOS (`sembrarComprometido`/`limpiarComprometido`, `crearPersonas419`/`limpiar419`)
  hoy fallan antes de escribir; arreglados, **commitearán** una empresa, su zona central y su
  satélite. `limpiarComprometido` (`454/_escenario.ts:828-868`) solo borra `zonaId` (la satélite):
  la central de SLT-177 y la organización quedarían huérfanas. Eso es justo lo que persigue SLT-188.
- `454/_escenario.ts` y `escrituras-459.ts` tienen muchos usuarios fuera del alcance (R738 de SLT-177).

**Fuera:** código de producción; las entradas de SLT-195 y de otras fichas; cambiar la semántica de
`conEscenario`/`enTransaccionRevertida`.

## Requisitos (EARS)

- **R1140** — CUANDO cada uno de los 9 archivos del alcance corre contra una base desechable migrada
  con catálogos (`migrate deploy` + `db:seed`) y sin filas de negocio, DEBE ejecutar todos sus casos y
  pasarlos: ninguno fallido y ninguno saltado.
- **R1141** — Cada llamada de estos tests a una Server Action o a un servicio construido con el cliente
  global (`getPrismaClient()`) DEBE correr con la empresa de los datos sembrados en contexto
  (`conEmpresa`/`conEmpresa459`) o con sus dependencias de país inyectadas (`reglasPais`). Ningún caso
  DEBE esperar `ok` de una action que corre sin empresa.
- **R1142** — Las lecturas de verificación de `aporte-capital` que deciden el resultado
  (`haySaldoInicialVigente`, `primerDiaDeLaCaja`, estado de la caja) DEBEN quedar acotadas a la
  empresa sembrada por el test; SI la base tiene datos de otra empresa (saldo inicial, movimientos),
  ENTONCES el resultado del archivo NO DEBE cambiar.
- **R1143** — El caso R71 de `aporte-capital` DEBE sembrar él mismo, en la empresa del test, el
  movimiento de caja anterior a hoy que necesita, y DEBE afirmar que ese movimiento existe (control
  positivo) antes de medir el rechazo; NO DEBE depender de movimientos preexistentes en la base.
- **R1144** — CUANDO un escenario CONFIRMADO (`sembrarComprometido`, el bloque R8 de 419) se siembra,
  DEBE crear y fijar su propia empresa, y los clientes de concurrencia (`c1`, `c2`, o los que use el
  caso) DEBEN escribir con esa empresa como en producción.
- **R1145** — CUANDO termina un archivo que siembra CONFIRMADO, NO DEBE quedar en la base ninguna fila
  que haya creado: ni `organizacion`, ni `zona` (central incluida), ni `usuario`, ni `orden`, ni filas
  que cuelguen de ellas. La limpieza DEBE correr también si el caso falla (`finally`/`afterAll`) y DEBE
  borrar la organización la última, de modo que una fila olvidada haga fallar el borrado en vez de
  quedarse muda.
- **R1146** — Cada archivo tocado DEBE tener un control positivo que afirme el número exacto de filas
  sembradas de las que depende (p. ej. `organizacion.count({ id }) === 1`, zona central sembrada `=== 1`)
  y, para los arreglos de contexto, que la empresa en contexto es la sembrada. SI se quita el arreglo
  (el `conEmpresa`, la inyección de `reglasPais` o la empresa del escenario confirmado), ENTONCES al
  menos un caso del archivo DEBE volver a rojo (mutación en T6).
- **R1147** — Al arreglar un archivo NO DEBE quitarse ni debilitarse ninguna aserción, NO DEBE cambiarse
  un literal esperado por la función que lo genera, y el número de casos (`it`/`test`) NO DEBE bajar.
  SI un helper compartido cambia (`454/_escenario.ts`, `419/_escenario-419.ts`, `_fixtures/escrituras-459.ts`),
  ENTONCES todos sus usuarios DEBEN seguir verdes en la base desechable.
- **R1148** — SI el diagnóstico de un archivo muestra que la causa es un fallo real de producción (la
  action o el servicio no resuelve la empresa cuando SÍ la tiene en contexto, o escribe sin ella),
  ENTONCES la implementación DEBE parar en ese archivo, escribir la evidencia en
  `progress/impl_SLT-185.md` y preguntar al leader, sin tocar `lib/`.
- **R1149** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna de las 9 entradas que
  queden verdes según R1140. SI una sigue roja por otra causa, ENTONCES se queda con un `motivo` nuevo
  medido (clase, mensaje, `archivo:línea`, fecha) y la ficha que la retira, y `desde` no cambia.

## Verificación

- **Base DESECHABLE** creada para la ficha, por el wrapper `con-desechable.cjs` del scratchpad (fuera
  del repo; nunca se lee ni se imprime la URL): `pnpm exec prisma migrate deploy` + `pnpm run db:seed`.
  **Nunca** la base del `.env` ni `prisma migrate reset`.
- Dos corridas: (a) base vacía recién migrada; (b) la misma base con datos de OTRA empresa confirmados
  (como `scratchpad/scripts/slt177-otra-empresa.tmp.ts` de SLT-177), para R1142.
- Evidencia: JSON de vitest (`--reporter=json`) con casos p/f/s por archivo; 0 saltados.
- R1145: tras la corrida, `count` de `organizacion`, `zona`, `usuario` y `orden` igual al de antes.

## Tasks

- [x] **T1 — Medir** (R1140, R1148). Correr los 9 archivos en la desechable vacía; anotar en
  `progress/impl_SLT-185.md` el primer error real de cada uno con `archivo:línea`. Confirmar o
  descartar la hipótesis de `senales-gestion-lectores` (#9). Si alguno es fallo de producción, parar.
  *Hecho:* tabla de 9 filas con causa medida.
- [x] **T2 — Familia 459** (R1141-R1143, R1146). `aporte-capital` y `ajuste-caja-anulacion-461` con
  `conEmpresa459`; lecturas acotadas a la empresa; siembra del movimiento previo de R71 con su control.
  *Hecho:* los 2 archivos verdes en (a) y (b).
- [x] **T3 — Bordes con país y action real** (R1141, R1146). `picking-resumen-tiendas` con `reglasPais`;
  `premio-ranking-idempotencia` caso T2.5 con empresa sembrada en contexto. *Hecho:* verdes, 17/17 el
  segundo.
- [x] **T4 — Escenarios confirmados** (R1144, R1145, R1147). `sembrarComprometido`/`limpiarComprometido`
  y el bloque R8 de 419 con empresa propia y limpieza completa (central y organización incluidas).
  *Hecho:* #5-#8 verdes; conteos antes = después.
- [x] **T5 — `senales-gestion-lectores`** (R1140, R1147). Arreglo según T1. *Hecho:* verde.
- [x] **T6 — Mutaciones y usuarios de helpers** (R1146, R1147). Quitar cada arreglo uno a uno → rojo;
  restaurar desde copia. Correr todos los usuarios de los helpers tocados. *Hecho:* tabla de
  mutaciones y lista de usuarios verdes en la bitácora.
- [x] **T7 — Baseline** (R1149). Retirar las entradas verdes; reescribir el motivo de las que queden.
- [ ] **T8 — Cierre.** `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:guardias`,
  `git diff --name-only origin/dev -- lib app components hooks db scripts` vacío,
  `node scripts/tamano-pr.mjs`, mapa R → test en `progress/impl_SLT-185.md`, `./init.sh` (leader) y CI
  del PR con `gate-completo` verde.

## Archivos esperados

- `tests/integration/db/aporte-capital.test.ts`
- `tests/integration/db/ajuste-caja-anulacion-461.test.ts`
- `tests/integration/db/picking-resumen-tiendas.test.ts`
- `tests/integration/db/premio-ranking-idempotencia.test.ts`
- `tests/integration/db/454/registro-gestion-concurrencia-sql-real.test.ts`
- `tests/integration/db/454/caracterizacion/corte-concurrencia.test.ts`
- `tests/integration/db/454/caracterizacion/no-doble-gestion.test.ts`
- `tests/integration/db/454/senales-gestion-lectores-sql-real.test.ts`
- `tests/integration/db/454/_escenario.ts`
- `tests/integration/db/419/confirmar-entrega-lote-sql-real.test.ts`
- `tests/integration/db/419/_escenario-419.ts`
- `tests/integration/db/_fixtures/escrituras-459.ts`
- `tests/baseline-rojos.json`
- `progress/impl_SLT-185.md`
- `progress/features/SLT-185.md`

Tamaño estimado: 15/40 archivos; 0 líneas de producción; ~400 de tests.

## Preguntas abiertas

- Ninguna bloqueante. Si T1 muestra que la causa de `senales-gestion-lectores` no es de empresa (p. ej.
  la segunda central), se arregla aquí igual porque su entrada cita SLT-185; el leader puede moverla.
