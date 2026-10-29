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

**Ojo para la tanda siguiente:** `20261029120200_nodo_geografico` está aplicada en `logistic_slt43`
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
