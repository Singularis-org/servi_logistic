# SLT-187 «Tests de migración desfasados tras SL-17» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1160–R1169**

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`.

**Solo tests.** No se toca ninguna migración, ni `db/schema.prisma`, ni código de producción: el
estado actual de la base (RLS por empresa, únicos por empresa, columnas nuevas, enums ampliados) es
**el correcto**, fijado a propósito por SL-17 «Tabla organizacion y aislamiento por empresa» y fichas
posteriores. Lo que está desfasado es lo que afirman los tests. Si al implementar resultara que la
base NO tiene lo que esas migraciones dicen, se para (R1168).

## Origen

- SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31», T1 (run de CI
  43973243440): 4 entradas «otra causa / migración» (`progress/medicion_SLT-177.md:88-90`).
- Tras sembrar sus helpers en SLT-177, dos más salieron con la misma clase de causa, y el leader mandó
  `454/retiro-estados-migration` aquí (`progress/impl_SLT-177.md:155`, `:282-291`). Hoy **7 entradas**
  de `tests/baseline-rojos.json` citan «La retira SLT-187». La tarjeta dice 4 (ver Preguntas abiertas).

## Lo que ya existe

Buscado `pg_policies`, `_por_empresa`, `clave_idempotencia_key`, `etiquetasDeEnum`, `orden_evento`,
`vista_filtro` en `feature_list.json`, `specs/`, `tests/` y `db/migrations/` (Grep/Read).

| Dónde | Qué hay | Qué se hace |
|---|---|---|
| Board | SL-28 «Consolidar las migraciones en una línea base limpia» está cancelada y no cubre estas entradas. Ninguna otra ficha las cubre. | Se sigue. |
| `db/migrations/20261022130100_organizacion_id_en_negocio/migration.sql:104-110, :239` | Policies `<tabla>_por_empresa` (`FOR ALL TO servi_app`, `USING`/`WITH CHECK` sobre `organizacion_id`); `orden_evento.organizacion_id NOT NULL`. | Es el estado que los tests deben afirmar, con literales. |
| `db/migrations/20261023090000_unicos_por_empresa/migration.sql:43-49` | Los únicos de `clave_idempotencia` pasan a `(organizacion_id, clave_idempotencia)`. | Ídem. |
| `tests/integration/db/_postgres-real.ts:69` (`crearPrismaDeTestEnEsquema`) | Cliente sobre un esquema desechable para probar DDL real sin tocar `public`. | Opción para aislar `retiro-estados-migration` (T6). |

## Alcance: causa diagnosticada

| # | archivo (`tests/integration/db/…`) | qué afirma | qué cambió (a propósito) |
|---|---|---|---|
| 1 | `historial-accion-migration.test.ts:81-91` | «R8: y NO tiene policies» → `expect(filas).toEqual([])` (`:90`). | SL-17 añadió `historial_accion_por_empresa` (su `DROP` está en `20261022130100…/down.sql:39`). |
| 2 | `postulacion-recurso-migration.test.ts:251-262` | «R22: la RLS esta ENCENDIDA y hay CERO policies» (`:261`). | SL-17 añadió `postulacion_recurso_por_empresa` (`20261022130100…/migration.sql:108-110`). |
| 3 | `vista-filtro-migration.test.ts:149-163` | «ningun `down.sql` ANTERIOR fue tocado», pero el bucle recorre **todas** las carpetas salvo la propia (`:152`), también las POSTERIORES. | `20261022130100_organizacion_id_en_negocio/down.sql` (posterior a `20260921120000_vista_filtro`) nombra `vista_filtro`. El test no filtra lo que su título dice. |
| 4 | `wallet-458-migration.test.ts:90-105` | Los dos valores de la 458 son los **últimos** de cada enum (`slice(-2)`, `:101-103`) y los tamaños son `[27, 18, 14, 65, 24]` (`:105`). | Migraciones posteriores añadieron valores al final (`egreso_reverso_fulfillment`, …). |
| 5 | `wallet-461-idempotencia-clave.test.ts:169-181` | `indexdef` literal de los dos únicos sobre `(clave_idempotencia)` (`:179-180`). | `20261023090000_unicos_por_empresa` los rehízo sobre `(organizacion_id, clave_idempotencia)`. |
| 6 | `454/orden-evento-migration.test.ts:140-163` | Lista exacta de columnas de `orden_evento` (`:146-159`). | SL-17 añadió `organizacion_id` (`20261022130100…/migration.sql:239`). |
| 7 | `454/retiro-estados-migration.test.ts:66-…` | El bloque «M3 contra Postgres real» aplica `20260923120200_retiro_estados_454` sobre **toda** la base. | No es un cambio de esquema: depende de los datos. En base vacía pasa 13/13 (por eso CI avisa «ya pasa»); con una orden AJENA en `ayuda_tienda` sin solicitud, `P0001` (`:155`; `progress/impl_SLT-177.md:282-291`). |

**Fuera:** migraciones, esquema, código de producción; las demás entradas del baseline.

## Requisitos (EARS)

- **R1160** — CUANDO los 7 archivos del alcance corren contra una base desechable migrada con catálogos
  (base vacía), DEBEN ejecutar todos sus casos y pasarlos: ninguno fallido ni saltado.
- **R1161** — Cada afirmación actualizada DEBE comparar lo que hay en la base (o en el archivo de
  migración) contra un **literal escrito en el test** que describe el estado vigente: nombres de policy,
  rol, comando y expresión; `indexdef` completo; lista de columnas; posiciones del enum. NO DEBE
  obtener el valor esperado de la misma fuente que mide (leer el `migration.sql` o `pg_policies` para
  construir lo esperado), ni de una función que lo genere.
- **R1162** — Los tests de policies (#1, #2) DEBEN afirmar que su tabla tiene la RLS encendida y
  **exactamente** una policy, `<tabla>_por_empresa`, `FOR ALL`, `TO servi_app`, con `USING` y
  `WITH CHECK` sobre `organizacion_id`; y DEBEN conservar la intención original: ninguna policy para
  otro rol (la autorización sigue en el servidor). El nombre del caso DEBE dejar de decir «NO tiene
  policies» / «CERO policies».
- **R1163** — `vista-filtro-migration` DEBE recorrer solo las carpetas de migración **anteriores** a
  `20260921120000_vista_filtro` (por orden de nombre), y DEBE tener dos controles: el recuento de
  anteriores es mayor que un literal medido (autocomprobación ya existente, `:155`) y una carpeta
  **posterior** conocida que sí nombra `vista_filtro` (`20261022130100_organizacion_id_en_negocio`) queda
  fuera del barrido. SI el filtro se quita, ENTONCES el caso DEBE volver a rojo.
- **R1164** — `wallet-458-migration` DEBE afirmar la huella de la 458, no «lo último del enum»: los
  valores de `VALORES_458` en las posiciones literales que les dio la 458-B (los dos últimos de los
  primeros 27 / 18 / 65 valores, según el comentario `:104`), y que `wallet_origen_tipo` e
  `historial_accion_entidad` no los recibieron. SI una migración posterior inserta un valor ANTES de los
  de la 458, ENTONCES el caso DEBE fallar. La comparación ordenada contra los SEED de código (`:96-100`)
  se mantiene.
- **R1165** — `wallet-461-idempotencia-clave` DEBE afirmar el `indexdef` literal sobre
  `(organizacion_id, clave_idempotencia)` en los dos libros y DEBE seguir probando con INSERT directos
  que la clave repetida choca (23505) **dentro de la misma empresa**; y DEBE añadir el caso que el
  cambio hizo posible: la misma clave en OTRA empresa no choca. `454/orden-evento-migration` DEBE
  incluir `organizacion_id` en la lista literal y afirmar que es `NOT NULL`.
- **R1166** — `454/retiro-estados-migration` DEBE dar el mismo resultado en una base vacía y en una base
  con datos de otra empresa, incluida una orden ajena en `ayuda_tienda` sin fila de solicitud: el bloque
  M3 NO DEBE aplicar la migración sobre filas que no sembró el propio test (p. ej. en un esquema
  desechable con `crearPrismaDeTestEnEsquema`, o con otra forma de aislarlo que T6 justifique). Los casos
  (a)-(g) DEBEN seguir midiendo lo mismo.
- **R1167** — Al actualizar NO DEBE quitarse ninguna aserción sin sustituirla por la del estado vigente,
  NO DEBE debilitarse (`toContain` donde había igualdad exacta, `>=` donde había `===`) salvo lo que
  R1164 sustituye explícitamente, y el número de casos NO DEBE bajar. Cada afirmación actualizada DEBE
  tener una mutación que la ponga en rojo (cambiar el literal esperado, o soltar/crear la policy o el
  índice dentro de una tx revertida).
- **R1168** — SI la base migrada NO tiene lo que dicen las migraciones de SL-17 (falta una policy, un
  índice por empresa o la columna), o un cambio no fue a propósito (no está en una migración ni en un
  spec), ENTONCES la implementación DEBE parar, escribir la evidencia en `progress/impl_SLT-187.md` y
  preguntar al leader. No se toca `db/`.
- **R1169** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna de las 7 entradas que
  queden verdes según R1160 (y, para #7, también según R1166). SI una sigue roja por otra causa,
  ENTONCES se queda con motivo nuevo medido y ficha, y `desde` no cambia.

## Verificación

- Base DESECHABLE por `con-desechable.cjs` (scratchpad, fuera del repo; sin leer ni imprimir la URL):
  `pnpm exec prisma migrate deploy` + `pnpm run db:seed`. **Nunca** la base del `.env` ni `migrate reset`.
- #7 se corre además con una empresa ajena CONFIRMADA en la desechable que tenga una orden en
  `ayuda_tienda` sin solicitud (como `scratchpad/scripts/slt177-retirados.tmp.ts` de SLT-177), borrada al
  terminar.
- Mutaciones de R1163 y R1167 una a una, restauradas desde copia, con su resultado en la bitácora.

## Tasks

- [ ] **T1 — Medir** (R1160, R1168). Correr los 7 en la desechable; anotar cada primer error y, con el
  primero corregido en local, si hay más. Confirmar en `pg_policies`/`pg_indexes`/`information_schema`
  que la base tiene lo que dicen las migraciones. *Hecho:* tabla en `progress/impl_SLT-187.md`.
- [ ] **T2 [P] — Policies** (#1, #2; R1161, R1162, R1167). *Hecho:* verdes + mutación roja por archivo.
- [ ] **T3 [P] — `vista-filtro-migration`** (#3; R1163). *Hecho:* verde + mutación del filtro roja.
- [ ] **T4 [P] — Enum de la 458** (#4; R1164). *Hecho:* verde + mutación roja.
- [ ] **T5 [P] — Índices y columnas** (#5, #6; R1165). *Hecho:* verdes + caso nuevo «otra empresa» +
  mutación roja.
- [ ] **T6 — `retiro-estados-migration`** (#7; R1166). Elegir y justificar el aislamiento. *Hecho:*
  13/13 en base vacía y con la orden ajena. Si no hay forma sin coste desproporcionado, parar y
  preguntar (la entrada se quedaría con su motivo).
- [ ] **T7 — Baseline** (R1169).
- [ ] **T8 — Cierre.** typecheck, lint, `pnpm run test:guardias`, `git diff --name-only origin/dev -- lib
  app components hooks db scripts` vacío, `node scripts/tamano-pr.mjs`, mapa R → test, `./init.sh`
  (leader) y `gate-completo` verde en el PR.

## Archivos esperados

- `tests/integration/db/historial-accion-migration.test.ts`
- `tests/integration/db/postulacion-recurso-migration.test.ts`
- `tests/integration/db/vista-filtro-migration.test.ts`
- `tests/integration/db/wallet-458-migration.test.ts`
- `tests/integration/db/wallet-461-idempotencia-clave.test.ts`
- `tests/integration/db/454/orden-evento-migration.test.ts`
- `tests/integration/db/454/retiro-estados-migration.test.ts`
- `tests/baseline-rojos.json`
- `progress/impl_SLT-187.md`
- `progress/features/SLT-187.md`

Tamaño estimado: 10/40 archivos; 0 de producción; ~250 líneas de tests.

## Preguntas abiertas

1. **Alcance 4 → 7.** La tarjeta habla de 4 tests; el baseline de `dev` asigna 7 a esta ficha
   (`wallet-461-idempotencia-clave`, `454/orden-evento-migration` y `454/retiro-estados-migration`
   añadidos en SLT-177, el último por instrucción del leader). El spec cubre las 7. Si el leader prefiere
   4, #5-#7 salen del alcance y sus entradas pasan a otra ficha.
