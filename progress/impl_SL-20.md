# impl SL-20 «pais-geografia-configurable» — bitácora

Rama `feature/SL-20-pais-geografia-configurable`, worktree `.worktrees/SL-20-pais-geografia-configurable/`.
Spec: `specs/SL-20-pais-geografia-configurable/`. Base local propia `servi_logistic_sl20` (localhost,
mismo Postgres que el repo principal; nunca QA, dev compartido ni producción).

## Tanda T1 — Base de datos (backend_dev)

**Estado: T1.1–T1.7 cerradas, sin commitear.** T1.1 la hizo el agente anterior; T1.2–T1.7 se
retomaron tras la decisión del humano sobre el bloqueo de orden (`progress/features/SL-20.md >
Decisiones`, «F2.1, bloqueo de T1»).

### Decisiones aplicadas (F2.1, enmiendan el design)

1. **Orden, opción A.** `organizacion_pais` corre antes que `geografia_por_pais`, porque las políticas
   `*_del_pais` leen `organizacion.pais_id`. Las carpetas quedan:
   `20261026120000_pais` → `20261026120100_organizacion_pais` → `20261026120200_geografia_por_pais`
   → `20261026120300_geografia_del_pais_de_la_empresa` → `20261026120400_historial_plataforma`.
   `tasks.md` (T1.2, T1.3) y `design.md §3` siguen nombrando los timestamps viejos: no se editó el
   spec; manda la decisión.
2. **FK compuestas `ON UPDATE RESTRICT`** (cantón → provincia, distrito → cantón), `ON DELETE RESTRICT`
   como las simples de antes. Medido: mover de país una provincia con cantones, o un cantón con
   distritos a una provincia de otro país, da 23503.
3. **Demo QA en CR:** no se tocó `scripts/demo-qa/` más allá del `geoDe` del agente anterior. Las
   empresas demo nacen en CR por el `DEFAULT 'CR'`; el país explícito en el alta lo cierra T6.4.

### Decisiones de implementación (no fijadas por el design)

- `geografia_pais_del_padre` pisa siempre `NEW.pais_id` con el del padre: un `INSERT` de cantón con
  `pais_id` de otro país no falla, queda en el país del padre (R11 se cumple: el nodo nunca queda en
  otro país). Con un padre inexistente lanza `23503` con `CONSTRAINT` = la FK compuesta, para que el
  llamador vea la misma violación de FK de antes (P2003) y no un `23502` de NOT NULL.
- El down de `geografia_por_pais` aborta con `RAISE` (P0001) si hay nombres de provincia o códigos
  repetidos entre países, antes de tocar nada (el design solo decía «aborta»). Los nodos de otros
  países que no chocan se quedan, sin país.
- Las migraciones 120200–120400 y todos los downs nuevos van entre `BEGIN`/`COMMIT`.
- `traducirErrorDePais` recorre el mismo grafo `cause`/`meta`/`driverAdapterError` que
  `traducirErrorDeEmpresa`; el detector se copió (privado en `contexto-empresa.ts`) en vez de
  exportarlo de allí, para no tocar SL-17.
- `tests/fixtures/api-key-dependencias-usuario.ts`: la relación nueva `HistorialPlataforma.actor` →
  `usuario` se clasifica `no_alcanzable` (solo la escribe el superadmin). Sin esto
  `api-key-dependencias-usuario.guardia` cae (4 casos).

### Archivos creados/modificados

- `db/migrations/20261026120100_organizacion_pais/{migration.sql,down.sql}` — T1.3.
- `db/migrations/20261026120200_geografia_por_pais/{migration.sql,down.sql}` — T1.2.
- `db/migrations/20261026120300_geografia_del_pais_de_la_empresa/{migration.sql,down.sql}` — T1.4.
- `db/migrations/20261026120400_historial_plataforma/{migration.sql,down.sql}` — T1.5.
- `db/migrations/20261026120000_pais/down.sql` — solo el comentario de orden (el `migration.sql`
  aplicado no se tocó).
- `lib/db/errores-pais.ts` — T1.4: `PaisInmutable` (SL020), `GeografiaDeOtroPais` (SL021),
  `traducirErrorDePais`.
- `lib/repositories/registrar-accion-plataforma.ts` — T1.5: `appendAccionPlataforma(tx, entradas)`,
  tipos `HistorialPlataformaTxClient`, `EntradaAccionPlataforma`, `ActorPlataformaCongelado`.
- `db/schema.prisma`, `lib/db/modelos-de-negocio.ts` (T1.6), `scripts/demo-qa/receta.ts` — del agente
  anterior, sin cambios en esta tanda.
- `tests/fabricas/paises.ts` — `crearPaisDePrueba(tx, "XA")`, `crearGeografiaDePrueba(tx, paisId)`,
  `crearOrganizacionEnPais(tx, paisId)`.
- `tests/integration/db/_fixtures/pais-20.ts` — `revertida` (con el lock de la 227), `intentar`,
  `errorEnSavepoint`, `sqlstateDe`, `comoDueno`.
- `tests/integration/db/pais-tabla.test.ts`, `geografia-por-pais.test.ts`,
  `organizacion-pais-inmutable.test.ts`, `historial-plataforma-rls.test.ts`,
  `migracion-sl20-ida-y-vuelta.test.ts` — T1.7.
- `tests/unit/db/errores-pais.test.ts` — formas de error que no llegan por Postgres.
- `tests/fixtures/api-key-dependencias-usuario.ts` — censo (arriba).

### Base y `migrate diff`

`DATABASE_URL` → `servi_logistic_sl20`, exportada por comando. `pnpm exec prisma migrate deploy` aplicó
120100–120400 («All migrations have been successfully applied»); `prisma generate` regenerado.

```
$ pnpm exec prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script
-- This is an empty migration.
```

Riesgo §12 de la FK compuesta con `dbgenerated()` sin `DEFAULT` en la base: diff vacío, **el plan B
de §2.3 (DEFAULT `''`) no hace falta**. Tras migrar: 7/84/494 nodos con `pais_id = 'CR'` y las dos
empresas de la base en `CR`.

### Mapa R → test

| R | Test |
|---|---|
| R1 | `pais-tabla.test.ts` › «el código tiene que ser ISO alfa-2…», «el código y el nombre son únicos», «la regla de código va en los tres niveles o en ninguno» |
| R2 | `pais-tabla.test.ts` › «Costa Rica está cargado…»; `geografia-por-pais.test.ts` › «los 585 nodos de la migración están en CR…»; `migracion-sl20-ida-y-vuelta.test.ts` › «R2/R5: … sin cambiar id, nombre, estado ni código» |
| R3 | `pais-tabla.test.ts` › «una empresa lee los países pero no puede crear, cambiar ni borrar ninguno (42501)» |
| R4 | `organizacion-pais-inmutable.test.ts` › «R4/R5: ninguna empresa … sin país, y una con un país inexistente no entra» |
| R5 | `migracion-sl20-ida-y-vuelta.test.ts` › «R2/R5 …» (empresa creada ANTES de SL-20 queda en CR) |
| R7 | `organizacion-pais-inmutable.test.ts` › «cambiar el país … falla con SL020 como dueño…», «el SL020 … se traduce a PaisInmutable» |
| R10 | `organizacion-pais-inmutable.test.ts` › «una empresa creada sin país … nace en CR»; `geografia-por-pais.test.ts` › «una provincia creada sin país queda en CR» |
| R11 | `geografia-por-pais.test.ts` › «heredan el país del padre…», «un nodo en otro país que su padre lo rechaza la base (23503)…», «mover un cantón a una provincia de otro país…» |
| R12 (base) | `geografia-por-pais.test.ts` › «con la RLS, una empresa de XA solo ve la geografía de XA…» (la suite de R39 por repositorio es T6.1) |
| R13 | `geografia-por-pais.test.ts` › «una orden … con geografía de XA falla con SL021…», «cambiar la geografía de una orden…», «una empresa de XA tampoco apunta a CR…», «el SL021 … se traduce a GeografiaDeOtroPais» |
| R14 (base) | `geografia-por-pais.test.ts` › «R13/R14: … sin distrito, entra» |
| R15 (base) / R16 | `geografia-por-pais.test.ts` › «nombre de provincia y códigos únicos dentro del país; otro país puede repetirlos» |
| R33 (base) | `historial-plataforma-rls.test.ts` › «appendAccionPlataforma escribe una fila por entrada…», «una fila con un país inexistente no entra» (lo que escribe cada acción: T3.4/T4.1) |
| R34 | `historial-plataforma-rls.test.ts` › «una empresa no puede leer, escribir, cambiar ni borrar … (42501)», «la RLS sin políticas le deja ver cero filas» |
| R38 (base) | `geografia-por-pais.test.ts` › «R13/R38: … marca de zona especial fallan con SL021» |
| Ida y vuelta | `migracion-sl20-ida-y-vuelta.test.ts` (orden + down.sql, abort con segundo país, 5 downs = esquema previo, reaplicar = igual) |

Nota R34: `tasks.md` T1.5 dice «`SELECT` da 0 filas». Con el `REVOKE ALL` del design, el `SELECT` de
`servi_app` da **42501**, no 0 filas; R34 admite las dos («cero filas o rechazar»). Las 0 filas se
miden aparte devolviendo el `SELECT` dentro de la transacción del test (la RLS sin políticas).

### Salida real

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → limpio, exit 0.
- `pnpm run lint` → `✖ 231 problems (0 errors, 231 warnings)` (los mismos 231 de antes); `eslint` sobre
  los archivos de esta tanda → sin salida.
- Tests de la tanda:
  `pnpm exec vitest run tests/unit/db/errores-pais.test.ts tests/integration/db/{pais-tabla,geografia-por-pais,organizacion-pais-inmutable,historial-plataforma-rls,migracion-sl20-ida-y-vuelta}.test.ts`
  → `Test Files 6 passed (6) · Tests 34 passed (34)`.
- Guardias que leen migraciones o modelos (las 24 que nombran `db/migrations`/`down.sql` +
  organizacion-en-modelos, fk-misma-empresa, historial-accion-*, plataforma-solo-en-lista,
  sql-a-mano-por-empresa, catalogo-postgres-acota-esquema, geografia-*, zona-especial-punto-unico,
  p2003-detector-unico, prisma-client-sin-adaptador, guard-dependencias-aprobadas)
  → `Test Files 38 passed (38) · Tests 558 passed (558)`.
- `pnpm run test:guardias` → `Test Files 2 failed | 306 passed | 2 skipped (310)`. Rojos:
  `api-key-dependencias-usuario` (arreglado con el censo; después `Tests 12 passed (12)`) y
  `dependencias-declaradas-presentes` (baseline conocido).
- `tests/integration/db/demo-qa.test.ts`, `distrito-zona-especial-por-empresa`,
  `zona-especial-dos-empresas` → `Test Files 3 passed (3) · Tests 32 passed (32)`.
- `migracion-sl17-ida-y-vuelta` (aplica también las migraciones posteriores) → `Tests 7 passed (7)`.
- `geografia-*.test.ts` + `zona-*.test.ts` + `zonas-migration` (26 archivos, juntos) →
  `Test Files 8 failed | 18 passed (26) · Tests 24 failed | 295 passed | 16 skipped`. Desglose:
  - `geografia-alta`, `zona-reconciliacion-ordenes`, `zona-sinpe-rastro`: verdes por separado
    (9/9, 28/28, 6/6); caen solo en paralelo (contención entre archivos), no por SL-20.
  - `geografia-registro-accion`, `geografia-renombrado`, `geografia-cascada-reversible` (21 casos):
    `DriverAdapterError: referencia a otra empresa: historial_accion.actor_usuario_id -> usuario`
    (SL017). Toman el actor con `usuario.findFirst()` (un usuario de otra empresa de la base) y
    `GeoRepository` escribe en `historial_accion` con él. No lo causa SL-20 (no toca `usuario`,
    `historial_accion` ni `verificar_misma_empresa`); **corresponde a T4.1**, que pasa esas escrituras
    a `appendAccionPlataforma` y adapta esos tres archivos. No se tocaron.
  - `geografia-historico-intacto`, `geografia-ordenes-sin-entregar`: abortan en `beforeAll` con «hay
    DATABASE_URL pero `orden` esta vacia»: la base de SL-11 nace sin órdenes (categoría de
    `tests/baseline-rojos.json`). Ajeno a SL-20.

### Preguntas abiertas

1. `design.md §3` y `tasks.md` T1.2/T1.3 siguen con los timestamps viejos. ¿El leader/spec_author
   los alinea con la decisión F2.1, o basta la entrada de Decisiones?
2. R34 en `tasks.md` T1.5 dice «0 filas»; la base da 42501 (ver nota del mapa). ¿Se acepta así?

Veredicto: T1.1–T1.7 cerradas, diff vacío, tests de la tanda 34/34 en verde; los rojos de
geografía que quedan son de T4.1 o ajenos.

## Tanda 1 (implementer, 2026-10-26) — consolidado

- Commit `43d950f` (pushed): T3.1, T3.2, T3.3, T5.4, T6.2. Detalle, mapa R<n> -> test y salida en
  `progress/impl_SL-20-T3.md` y `progress/impl_SL-20-T5.4.md`. Incluye el ajuste de
  `pwa-manifiesto-atajos.guardia` (superadmin 1 -> 2 destinos por `/plataforma/geografia`).
- Verificacion del commit (con el WIP de T1 apartado): `./init.sh` corta en el paso 1 por el rojo
  ajeno conocido del validador de features (SLT, ids duplicados), asi que el resto se corrio a mano:
  typecheck 0 errores (`NODE_OPTIONS=--max-old-space-size=8192`); lint 0 errores / 231 avisos;
  tests de la tanda `Test Files 7 passed (7) · Tests 138 passed (138)`; guardias
  `Test Files 1 failed | 307 passed | 2 skipped` — el unico rojo es
  `dependencias-declaradas-presentes.guardia` (en `tests/baseline-rojos.json`).
- T1 sin commitear (BLOQUEADO): T1.1 hecha en el worktree; T1.2–T1.7 esperan decision sobre el
  orden de migraciones (ver arriba). `db/schema.prisma` ya trae T1.2/T1.3/T1.5 sin sus migraciones.

- Arreglo ficha 421 (catalogo-postgres-acota-esquema): `tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts` acota `pg_class` con `JOIN pg_namespace ... n.nspname = 'public'` y `pg_policies` con `schemaname = 'public'`; los demas tests SL-20 de `tests/integration/db/` no tenian consultas sin acotar. Guardia: 7/7 passed; `migracion-sl20-ida-y-vuelta` contra `servi_logistic_sl20`: 5/5 passed (10.19s).
