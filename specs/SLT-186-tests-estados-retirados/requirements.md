# SLT-186 «Tests con estados retirados del catálogo» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1150–R1159**

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`.

**Solo tests.** El diff toca dos tests (y si acaso su helper) y `tests/baseline-rojos.json`. Si
hiciera falta tocar `lib/`, `app/`, `db/` o `scripts/`, se para (R1157).

## Origen

SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31», T1 (run de CI
43973243440): 2 entradas «otra causa / estado retirado del catálogo»
(`progress/medicion_SLT-177.md:87`). Las dos siguen en el baseline y citan «La retira SLT-186»
(`tests/baseline-rojos.json:108-111` y `:508-511`).

## Lo que ya existe

Buscado `ayuda_tienda`, `en_fulfillment`, `ESTATUS_RETIRADOS_454`, `asegurarRetirados`, `huerfano` en
`feature_list.json`, `specs/`, `tests/` y `lib/types/order-status.ts` (Grep/Read).

| Dónde | Qué hay | Qué se hace |
|---|---|---|
| `lib/types/order-status.ts:46-55` | La 155 retira el estado de fulfillment del seed; la migración `20260729140000_order_status_retiro_en_fulfillment` solo borra la fila si nadie la referencia: en una base con historial **sobrevive huérfana**; en una nueva, no existe. | Explica el rojo de `analytics-daily-job`. |
| `lib/types/order-status.ts:87-96` | La 454 saca `ayuda_tienda` del seed: «la ayuda pasa a ser un evento (`orden_evento`), no un estado»; ninguna orden viva lo tiene tras M3. | Explica el rojo de `satelite-bodega-alcance-real`. |
| `tests/integration/db/454/_escenario.ts:363-383` (`asegurarRetirados`) | Siembra un estado retirado DENTRO de la tx revertida (`INSERT … WHERE NOT EXISTS`) y nunca en un escenario confirmado. | **Patrón a reutilizar** para el estado huérfano de R45. |
| `tests/unit/guards/censo-order-status-rename.test.ts:118` | `analytics-daily-job.test.ts` está en la allowlist del censo para nombrar el literal antiguo. | No se toca; el literal se queda en ese archivo. |
| Board | Ninguna otra ficha cubre estas 2 entradas. | Se sigue. |

## Alcance: causa diagnosticada

| archivo (`tests/integration/db/…`) | causa con evidencia | arreglo previsto |
|---|---|---|
| `analytics-daily-job.test.ts` | El caso «el estatus HUERFANO del catalogo no descarta la orden ni hace fallar la corrida (R45)» (`:321-350`) pide la transición a `en_fulfillment` (`:333`) y `estatusId` explota: «el catalogo local no tiene el estatus …» (`_semilla-rollup.ts:85`). El caso prueba un comportamiento VIGENTE (una fila de `order_status` fuera de `ORDER_STATUS_SEED` no rompe el rollup); lo que falta es el dato, no el comportamiento. | El caso siembra en su tx la fila huérfana si falta (como `asegurarRetirados`), con control positivo. |
| `satelite-bodega-alcance-real.test.ts` | El escenario crea `crearOrden("propia-ayuda", zonaPropia, "ayuda_tienda", …)` (`:270`) y `estatus()` explota (`:178`). El caso «lo que no es de esta bodega no sale» (`:356-386`) usa esas órdenes para probar que quedan fuera **por alcance**, no por estado (comentario `:262-266`, ficha 357). Desde la 454 una orden viva no puede estar en `ayuda_tienda`: sembrar el estado probaría un estado imposible. | Sustituir `ayuda_tienda` por un estado **vigente** que el listado de la bodega muestre por su estado (misma premisa del comentario), elegido leyendo el filtro real del listado y justificado en el test. `toHaveLength(4)` (`:373`) se mantiene. |

**Fuera:** código de producción, el catálogo y sus migraciones, la allowlist del censo.

## Requisitos (EARS)

- **R1150** — CUANDO `analytics-daily-job.test.ts` y `satelite-bodega-alcance-real.test.ts` corren
  contra una base desechable migrada con catálogos y sin filas de negocio, DEBEN ejecutar todos sus casos
  y pasarlos: ninguno fallido y ninguno saltado.
- **R1151** — Los dos archivos DEBEN pasar también contra una base que SÍ tenga la fila huérfana del
  estado de fulfillment en `order_status` (base con historial). El resultado NO DEBE depender de si la
  fila existe antes de empezar.
- **R1152** — El caso R45 de `analytics-daily-job` DEBE crear dentro de su transacción revertida la fila
  de `order_status` huérfana que usa cuando falte, y NO DEBE confirmarla nunca fuera de esa transacción.
- **R1153** — El caso R45 DEBE afirmar, antes de correr el rollup, que el estado que usa existe en
  `order_status` y NO está en `ORDER_STATUS_SEED` (control positivo de que es huérfano). SI la siembra no
  llega a la base, ENTONCES ese control DEBE fallar.
- **R1154** — `satelite-bodega-alcance-real` NO DEBE usar un estado retirado del catálogo
  (`ESTADO_RETIRADO`, `ESTATUS_RETIRADOS_454` o el de la 155). El estado que sustituye a `ayuda_tienda`
  DEBE ser uno que el listado de la bodega muestre por su estado, de modo que la orden quede fuera solo
  por el alcance; el test DEBE decirlo en un comentario con la referencia al filtro del listado.
- **R1155** — SI se quita la condición de alcance del listado de la bodega (mutación en el repositorio,
  restaurada después), ENTONCES la orden que sustituye a «propia-ayuda» DEBE aparecer en el listado y el
  caso «lo que no es de esta bodega no sale» DEBE fallar.
- **R1156** — Al arreglar los dos archivos NO DEBE quitarse ni debilitarse ninguna aserción, NO DEBE
  cambiarse un literal esperado por la función que lo genera, y el número de casos NO DEBE bajar.
- **R1157** — SI el diagnóstico muestra un fallo real de producción (el rollup descarta la orden con
  estado huérfano o falla la corrida; el listado deja ver órdenes fuera de su alcance), ENTONCES la
  implementación DEBE parar, escribir la evidencia en `progress/impl_SLT-186.md` y preguntar al leader,
  sin tocar `lib/`.
- **R1158** — `tests/baseline-rojos.json > archivos` NO DEBE contener las entradas de
  `analytics-daily-job.test.ts` ni de `satelite-bodega-alcance-real.test.ts` si quedan verdes según
  R1150. SI una sigue roja por otra causa (hoy oculta tras el primer error), ENTONCES se queda con motivo
  nuevo medido y ficha, y `desde` no cambia.

## Verificación

- Base DESECHABLE por `con-desechable.cjs` (scratchpad, fuera del repo; sin leer ni imprimir la URL):
  `pnpm exec prisma migrate deploy` + `pnpm run db:seed`. **Nunca** la base del `.env` ni `migrate reset`.
- Corrida (a) en base vacía; corrida (b) con la fila huérfana insertada a mano y CONFIRMADA en la
  desechable (R1151), borrada al terminar.
- Mutaciones de R1153 (quitar la siembra) y R1155 (quitar el alcance), restauradas desde copia.

## Tasks

- [ ] **T1 — Medir** (R1150, R1157). Correr los 2 archivos en la desechable; anotar el primer error y,
  con un arreglo provisional, si aparecen errores de segundo nivel. *Hecho:* tabla en
  `progress/impl_SLT-186.md`.
- [ ] **T2 — `analytics-daily-job`** (R1151-R1153, R1156). Siembra en la tx + control positivo.
  *Hecho:* verde en (a) y (b); mutación de R1153 roja.
- [ ] **T3 — `satelite-bodega-alcance-real`** (R1154-R1156). Elegir el estado vigente leyendo el filtro
  del listado; justificar en el test. *Hecho:* verde en (a) y (b); mutación de R1155 roja.
- [ ] **T4 — Baseline** (R1158). Retirar las entradas verdes.
- [ ] **T5 — Cierre.** typecheck, lint, `pnpm run test:guardias` (el censo de estados incluido),
  diff de producción vacío, `node scripts/tamano-pr.mjs`, mapa R → test en la bitácora, `./init.sh`
  (leader) y `gate-completo` verde en el PR.

## Archivos esperados

- `tests/integration/db/analytics-daily-job.test.ts`
- `tests/integration/db/_semilla-rollup.ts`
- `tests/integration/db/satelite-bodega-alcance-real.test.ts`
- `tests/baseline-rojos.json`
- `progress/impl_SLT-186.md`
- `progress/features/SLT-186.md`

Tamaño estimado: 6/40 archivos; 0 de producción; ~80 líneas de tests.

## Preguntas abiertas

- Ninguna.
