# SLT-43 «Geografía jerárquica: modelo y migración» — bitácora del implementer

Worktree: `.worktrees/SLT-43-geo-jerarquica-modelo` · rama `feature/SLT-43-geo-jerarquica-modelo`.
Spec: `specs/SLT-43-geo-jerarquica-modelo/` (aprobado por Camilo el 2026-10-29).

## T0 — Precondiciones (2026-10-29)

- T0.1: PR #29 mergeado en `dev` (merge `cbd538b`). Guardia: `tests/guards/migraciones-destructivas.guard.test.ts`,
  corte `20261027120000`; solo mira `migration.sql`, nunca `down.sql`.
- T0.2: `git merge-base HEAD origin/dev` = `cbd538b` = `origin/dev`.

## Base de datos de la feature

Base local propia `logistic_slt43` en `localhost:5432` (no la de desarrollo `logistic`). Postgres
local 16.1, base UTF-8 con collation/ctype `Spanish_Colombia.1252`.

Creada el 2026-10-29 con `pg` (no hay `psql`): `CREATE DATABASE logistic_slt43` conectando a la base
`postgres` con las credenciales del `.env` principal; luego, con `DATABASE_URL` apuntando a
`…/logistic_slt43?schema=public` y `DIRECT_URL=` vacía, `pnpm exec prisma migrate deploy` y
`pnpm run db:seed`. El `.env` no se copia al worktree: la URL se exporta en cada comando.

**(Resuelto en la tanda 2.)** `20261029120200_nodo_geografico` estaba aplicada en `logistic_slt43`
solo con la función de T2.1. Al completarla en T2.2 cambia su checksum: antes de `migrate deploy`,
`DROP FUNCTION geo_normalizar_nombre(text)` y borrar su fila de `_prisma_migrations` (o recrear la base).

## Tandas

### Tanda 1 — T1.1, T1.2, T1.3, T2.1 (2026-10-29)

**Archivos creados**
- `db/migrations/20261029120000_geo_enums_nodo_geografico/{migration,down}.sql`
- `db/migrations/20261029120100_tipo_nivel_geografico/{migration,down}.sql`
- `db/migrations/20261029120200_nodo_geografico/{migration,down}.sql` (solo `geo_normalizar_nombre`; T2.2 completa)
- `tests/unit/types/historial-accion-entidades.test.ts`
- `tests/integration/db/geo-tipo-nivel.test.ts`
- `tests/integration/db/geo-normalizar-nombre.test.ts`

**Archivos modificados**
- `db/schema.prisma`: `nodo_geografico` en los dos enums; modelo `TipoNivelGeografico`; `Pais.tiposDeNivel`.
- `lib/types/historial-accion.ts`: `nodo_geografico` en `HISTORIAL_ACCION_ENTIDADES` y `ENTIDAD_LABELS`.
- `lib/types/historial-accion-etiquetas.ts`: `FuentesEtiqueta.nodo_geografico = { nombres }` y su constructor.
- `app/(app)/historico/acciones/_components/historial-acciones-filtros-def.ts`: `ENTIDADES_SIN_ESCRITOR`
  y el filtro de entidad sin `nodo_geografico`.
- `lib/db/modelos-de-negocio.ts`: `TipoNivelGeografico` en `MODELOS_DE_PLATAFORMA` (cabecera 23 → 24).
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`: recuento de entidades 27 → 28 (seis
  aserciones de recuento; el enum crece por diseño).
- `tests/unit/components/historial-acciones-filtros-def.test.ts`: el filtro ofrece las entidades menos
  `ENTIDADES_SIN_ESCRITOR`.

**Decisiones de implementación**
- `down.sql` de 120000 es `SELECT 1;` con la explicación (design §3).
- Ids de `tipo_nivel_geografico` sin DEFAULT en la base (`@default(uuid())` en Prisma; el SQL usa
  `gen_random_uuid()::text`): así el diff de Prisma sale vacío.
- `geo_normalizar_nombre`: marcas U+0300–U+036F (design) y la lista exacta de espacios de `\s` de JS en
  vez de `[[:space:]]`, que depende de la configuración regional.
- R10: idéntica a `normalizeName` en los 585 nombres de la geografía de `logistic_slt43` y en la lista
  de casos. Fuera de la geografía, con `Spanish_Colombia.1252`, `lower()` no pasa a minúscula el
  dígrafo `ǅ` (U+01C5) y JS sí; no aparece en ningún nombre. Repetir R10 en el ensayo (design §9).

**Mapa R → test (esta tanda)**
| R | Test |
|---|---|
| R1, R2, R3 | `tests/integration/db/geo-tipo-nivel.test.ts` |
| R10 | `tests/integration/db/geo-normalizar-nombre.test.ts` |
| R12 (lado tipos) | `tests/integration/db/geo-tipo-nivel.test.ts` (el de nodos va en `geo-nodo-rls.test.ts`, T2.2) |
| R23 (lado TS) | `tests/unit/types/historial-accion-entidades.test.ts` (el lado base va en la ida y vuelta, T6.1) |

**Verificación (salida real, `DATABASE_URL` → `logistic_slt43`, `NODE_OPTIONS=--max-old-space-size=8192`)**
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`: `-- This is an
  empty migration.` tras 120000, tras 120100 y tras 120200.
- `pnpm run typecheck`: exit 0. `eslint` sobre los 9 archivos tocados: sin salida (limpio).
- `geo-tipo-nivel.test.ts` 6/6 · `geo-normalizar-nombre.test.ts` 4/4 · `historial-accion-entidades.test.ts`
  4/4 · `catalogo-y-choke-point.test.ts` + `historial-acciones-filtros-def.test.ts` 66/66.
- Guardias: `organizacion-en-modelos`, `rls-por-empresa`, `plataforma-solo-en-lista`, `fk-misma-empresa`
  verdes. `migraciones-destructivas` ROJA por `20261028120000_modulo_wallet_nucleo` (de `dev`, sin
  `DESTRUCTIVA.md`; ninguna de SLT-43 aparece). No es de esta rama: no se toca.
- Suites SL-20/374 (`geografia-*`, `pais-*`, `carga-division`, `migracion-sl20-ida-y-vuelta`): 17/21
  archivos verdes. Rojos: `geografia-superadmin-sin-empresa` (por SLT-43, ver pregunta), `carga-division`
  (arrastre: el anterior dejó su superadmin al fallar la limpieza; limpiado a mano en `logistic_slt43`),
  `geografia-historico-intacto` y `geografia-ordenes-sin-entregar` (base sin órdenes; ajeno).
- `vitest related` sobre `lib/db/modelos-de-negocio.ts` / `lib/types/historial-accion*.ts` arrastra casi
  toda la suite de base (los importa la extensión de Prisma): se cortó. Sus rojos vistos son de base
  vacía («`orden` esta vacia», «faltan la zona central…»), ninguno menciona objetos de SLT-43.

**Pregunta abierta (bloquea T1.3):** la FK `tipo_nivel_geografico.pais_id → pais` es
`RESTRICT/RESTRICT` (design §2.1) y el trigger crea tipos para todo país nuevo. La limpieza de
`geografia-superadmin-sin-empresa.test.ts` (`limpiarPais`, SL-20) hace `DELETE FROM pais` tras borrar
geografía e historial, y ahora falla con `23503 tipo_nivel_geografico_pais_id_fkey`. R36 pide esa suite
verde sin tocarla. Opciones: (a) FK `ON DELETE CASCADE` hacia `pais` (los nodos siguen en `RESTRICT`, así
que un país con geografía sigue sin poder borrarse); (b) añadir `tipo_nivel_geografico` a la limpieza
del test; (c) otra que decida el humano.

**Veredicto:** T1.1, T1.2 y T2.1 hechas; T1.3 implementada según design pero bloqueada por la pregunta.

### Tanda 2 — regresión, T1.3 (enmienda), T2.2, T2.3 (2026-10-29)

**Comprobación de regresión (antes de nada).** `geografia-historico-intacto` y
`geografia-ordenes-sin-entregar` fallan igual en `origin/dev` (`cbd538b`) sin SLT-43: base aparte
`logistic_slt43_dev` (migrate deploy + db:seed desde un worktree temporal de `origin/dev`) → 2 suites
rotas, 16 saltados, «hay DATABASE_URL pero `orden` esta vacia». En `logistic_slt43` con esta rama: lo
mismo, 2 rotas, 16 saltados, mismo mensaje. **Veredicto: entorno (base sin órdenes), no regresión.**
El worktree temporal se creó en `%TEMP%\wd43` y no en el scratchpad: allí la ruta a
`.prisma/client/package.json` pasa de 260 caracteres y Node no lee su `imports` (`ERR_PACKAGE_IMPORT_NOT_DEFINED`).
Worktree eliminado y base `logistic_slt43_dev` borrada al terminar.

**Archivos creados**
- `tests/integration/db/_fixtures/geo-43.ts` (T2.3): `tiposDeNivel`, `insertarNodo`/`SQL_INSERTAR_NODO`/
  `argumentosDeNodo` y `crearEscenarioGeo43` (país `XA`, empresa, provincia «1» y cantón «1», dos
  distritos, orden con y sin distrito, `zona_distrito`, `distrito_zona_especial`, cierre con dos filas
  de `cierre_detail`, una con `distrito_nombre` y otra sin él).
- `tests/integration/db/geo-nodo-invariantes.test.ts` (R4–R9, R11).
- `tests/integration/db/geo-nodo-rls.test.ts` (R12, lado nodos).

**Archivos modificados**
- `db/migrations/20261029120100_tipo_nivel_geografico/migration.sql`: FK a `pais` `ON DELETE CASCADE ON
  UPDATE RESTRICT` (enmienda de Camilo, opción (a)). `down.sql` sin cambios (la FK cae con la tabla).
- `db/migrations/20261029120200_nodo_geografico/{migration,down}.sql`: completa (design §2.2, §3). La
  función de T2.1 conserva sus bytes exactos (md5 comparado con el commit `3e871f5`).
- `db/schema.prisma`: `TipoNivelGeografico.pais` `onDelete: Cascade` y back-relation `nodos`; modelo
  `NodoGeografico`; `Pais.nodosGeograficos`.
- `lib/db/modelos-de-negocio.ts`: `NodoGeografico` en `MODELOS_DE_PLATAFORMA` (cabecera 24 → 25).
- `tests/integration/db/geo-tipo-nivel.test.ts`: caso CASCADE (sin nodos borra los tipos; con nodos 23503).
- `specs/SLT-43-geo-jerarquica-modelo/tasks.md`: T1.3 y T2.2 `[x]`; T2.3 creado, sin marcar (su criterio
  es que lo usen T3–T6).

**Decisiones de implementación**
- Plan A de design §2.2 funciona: la auto-relación `[padreId, paisId]` con `padreId` opcional y `paisId`
  obligatorio deja `prisma migrate diff` vacío, sin `dbgenerated()`. No hizo falta el plan B.
- `ruta TEXT[] NOT NULL`: Prisma genera `TEXT[]` sin NOT NULL para `String[]`, pero el diff sale vacío
  con el NOT NULL del SQL. `nombre_normalizado` y `ruta` sin DEFAULT: los pone siempre el trigger.
- R14: las comprobaciones van después de crear `geo_normalizar_nombre` (la necesitan) y antes de la
  tabla; todo en una transacción, así que si abortan no queda nada. SQLSTATE `SLT43` con las tres cifras.
- R7: SQLSTATE `SLT43`. Con padre inexistente el trigger no lanza: deja que la FK compuesta dé 23503.
- R8 (descendientes): un `UPDATE` por nivel de profundidad, de arriba abajo, y no uno para todo el
  subárbol como decía design §2.2. Motivo: el trigger de invariantes de cada fila recalcula la ruta
  leyendo la de su padre, y dentro de una sentencia el orden de filas no está garantizado (un nieto
  podría leer la ruta vieja de su padre). Sigue usando el GIN (`ruta @> ARRAY[id]`). El test mueve un
  nodo con dos niveles por debajo.
- Copia (R13): 7 provincias, 84 cantones, 494 distritos de CR → 585 nodos, `cardinality(ruta) =
  profundidad` en los 585.

**Base `logistic_slt43`:** 120100 y 120200 reaplicadas (DROP de la función, el trigger y la tabla de
tipos + borrado de sus dos filas de `_prisma_migrations`, luego `migrate deploy`).

**Mapa R → test (esta tanda)**
| R | Test |
|---|---|
| R4, R5, R6, R7, R8, R9, R11 | `tests/integration/db/geo-nodo-invariantes.test.ts` |
| R12 (lado nodos) | `tests/integration/db/geo-nodo-rls.test.ts` |
| Enmienda FK CASCADE (design §2.1) | `tests/integration/db/geo-tipo-nivel.test.ts` |

**Verificación (salida real, `DATABASE_URL` → `logistic_slt43`)**
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`: `-- This is an
  empty migration.`
- `pnpm run typecheck`: exit 0. `eslint` sobre los 5 TS tocados: «No issues found».
- `geo-nodo-invariantes` 8/8 · `geo-nodo-rls` 2/2 · `geo-tipo-nivel` 7/7 · `geo-normalizar-nombre` 4/4
  (21/21).
- Guardias: `organizacion-en-modelos`, `rls-por-empresa`, `fk-misma-empresa`, `plataforma-solo-en-lista`
  verdes; `migraciones-destructivas` roja solo por `20261028120000_modulo_wallet_nucleo` (ajena; ninguna
  `202610291*`). 62/63.
- SL-20 (`geografia-*`, `pais-*`, `carga-division`, `migracion-sl20-ida-y-vuelta`): 19/21 archivos, 217
  pasados, 16 saltados. Verdes incluidos `geografia-superadmin-sin-empresa` (sin tocarlo) y
  `carga-division`. Rojos: `geografia-historico-intacto` y `geografia-ordenes-sin-entregar` (entorno, ver
  arriba).
- `vitest related` sobre `db/schema.prisma`/`lib/db/modelos-de-negocio.ts` no se corrió: arrastra casi
  toda la suite de base (visto en la tanda 1).

**Veredicto:** regresión descartada; T1.3 y T2.2 hechas; T2.3 creado y en uso, a marcar cuando lo usen T3–T6.
