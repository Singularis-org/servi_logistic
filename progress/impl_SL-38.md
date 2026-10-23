# SL-38 «Distritos de zona especial por empresa» — bitácora de implementación

Spec: `specs/SL-38-zona-especial-por-empresa/` (commit `b16688a`), aprobado por Carlos el 2026-10-23
con P1: el Excel de cobertura queda con «Sí»/«No».

## Entorno

- Worktree `.worktrees/SL-38-zona-especial-por-empresa`, rama `feature/SL-38-zona-especial-por-empresa`.
- `node_modules` es un junction al del checkout principal, compartido con SL-32. `prisma generate`,
  el gate y el e2e corren dentro de un lock fuera del repo.
- Bases: Postgres local, solo bases desechables `sl38_*`. La base `servi-logistic` no se toca.

## T0 — Timestamps y base

- `origin/dev` (`197039c`): última migración `20261023090000_unicos_por_empresa`.
- `origin/feature/SL-32-rol-superadmin`: última migración `20261023100200_usuario_empresa_o_superadmin`.
- Las de SL-38, `20261023120000` y `20261023120100`, son posteriores a las dos. No se renumera nada.
- Base `sl38_base` recién creada + `prisma migrate deploy` (233 migraciones):
  `SELECT count(*) FROM distrito WHERE zona_especial IS TRUE` → **0** (de 494 distritos).

## T1-T2 — El modelo de la empresa

### Archivos

- Nuevos: `db/migrations/20261023120000_distrito_zona_especial_por_empresa/{migration,down}.sql`
  (SQL de design §2.1), `tests/integration/db/distrito-zona-especial-por-empresa.test.ts`.
- Modificados: `db/schema.prisma` (modelo `DistritoZonaEspecial`, `Distrito.zonasEspeciales`,
  `Organizacion.distritoZonasEspeciales`; `Distrito.zonaEspecial` sigue hasta T7),
  `lib/db/modelos-de-negocio.ts` (entrada en «Zonas y tarifas», cabecera 74),
  `tests/unit/guards/rls-por-empresa.guardia.test.ts` (`toBe(74)`), `lib/db/fk-de-negocio.ts`
  (solo el comentario «Hoy los 74 caben»).
- Otras cuentas de 73 a mano: `scripts/verificar-rls-despliegue.ts` (`POLITICAS_POR_EMPRESA` y
  `TRIGGERS_SIN_CAMBIO`). No se toca aqui: es T10/R23, que la deriva de `MODELOS_DE_NEGOCIO.length`.

### Base `sl38_base`

- `prisma migrate deploy`: aplica solo `20261023120000_distrito_zona_especial_por_empresa`.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` →
  `-- This is an empty migration.` (antes y despues de las mutaciones).
- Tras restaurar las mutaciones: 1 politica en `pg_policies`, el trigger
  `distrito_zona_especial_sin_cambio_de_empresa` en `pg_trigger`, 0 filas en la tabla.

### R → test (`distrito-zona-especial-por-empresa.test.ts`)

| R | Caso |
|---|---|
| R1 | «una segunda marca del mismo (empresa, distrito) falla con 23505; la misma marca en otra empresa pasa» |
| R3 | «con comoApp(B), la tabla, el join desde distrito y el join desde orden no traen la marca de A; B si ve la suya» · «con comoApp(B), insertar una marca con la empresa de A da 42501» · «el cliente de la app con la empresa B lee el distrito D y la orden de B sin la marca de A; con A, la trae» |
| R4 | «cambiar el organizacion_id de una marca da SL017 como dueno» · «con comoApp(B), mover la marca propia de B a la empresa A da SL017» |
| R10 | «con comoApp(B), B marca y desmarca D: borra solo la suya, la de A sigue y la fila de distrito no cambia» |
| R2 | guardias `organizacion-en-modelos`, `rls-por-empresa` (74) y `fk-misma-empresa`, en verde |

Desviacion del design §6: T2 va antes que el repositorio (T6), asi que la lectura anidada se mide
con el cliente de la app (`conAislamientoPorEmpresa` + `conEmpresa`), no con un repositorio. Las
lecturas por repositorio real son de T8. Un caso de `app.distritoZonaEspecial.deleteMany` desde B se
escribio y se quito: la extension ya filtra por empresa y ninguna mutacion de la base lo mataba.

### Verde (`vitest run --reporter=verbose`, base `sl38_base`)

```
 ✓ R1: una segunda marca del mismo (empresa, distrito) falla con 23505; la misma marca en otra empresa pasa
 ✓ R3: con comoApp(B), la tabla, el join desde distrito y el join desde orden no traen la marca de A; B si ve la suya
 ✓ R3: con comoApp(B), insertar una marca con la empresa de A da 42501 y no escribe nada
 ✓ R3: el cliente de la app con la empresa B lee el distrito D y la orden de B sin la marca de A; con A, la trae
 ✓ R4: cambiar el organizacion_id de una marca da SL017 como dueno, y la marca no cambia
 ✓ R4: con comoApp(B), mover la marca propia de B a la empresa A da SL017 (el trigger va antes que la politica)
 ✓ R10: con comoApp(B), B marca y desmarca D: borra solo la suya, la de A sigue y la fila de distrito no cambia
 Tests  7 passed (7)
```

### Mutaciones (en `sl38_base` por SQL, restauradas despues; la migracion commiteada no se toca)

1. `DROP POLICY "distrito_zona_especial_por_empresa"` (RLS sin politica = deniega todo a servi_app):
   ```
    ✓ R1   × R3 tabla/joins   × R3 insert 42501   × R3 cliente de la app
    ✓ R4 dueno   × R4 comoApp(B)   × R10
    Tests  5 failed | 2 passed (7)
   ```
2. Politica abierta (`USING (true) WITH CHECK (true)`): B ve y escribe lo de A.
   ```
    ✓ R1   × R3 tabla/joins   × R3 insert 42501   × R3 cliente de la app
    ✓ R4 dueno   ✓ R4 comoApp(B)   × R10
    Tests  4 failed | 3 passed (7)
   ```
3. `DROP TRIGGER "distrito_zona_especial_sin_cambio_de_empresa"`:
   ```
    ✓ R1   ✓ R3 (x3)   × R4 dueno   × R4 comoApp(B)   ✓ R10
    Tests  2 failed | 5 passed (7)
   ```
4. `DROP INDEX "distrito_zona_especial_organizacion_id_distrito_id_key"` (el unico de R1):
   ```
    × R1   ✓ el resto
    Tests  1 failed | 6 passed (7)
   ```
5. Sin sembrar la marca de A (el `create` del `beforeAll` cambiado por un id fijo, y restaurado):
   ```
   AssertionError: expected [] to deeply equal [ { id: 'sin-sembrar', …(2) } ]
    Test Files  1 failed (1)    Tests  7 skipped (7)    EXIT=1
   ```
   El archivo FALLA en el `beforeAll`; no hay `return` ni skip silencioso que lo deje verde.

Cada caso del archivo cae con al menos una mutacion: R1 con la 4, R3 con la 1 y la 2, R4 con la 3,
R10 con la 1 y la 2.

### Verificacion

- `pnpm run typecheck` → exit 0 (con el cliente regenerado bajo el lock).
- `pnpm exec eslint` sobre los archivos tocados → `No issues found`.
- `pnpm run test:guardias` → `Test Files 1 failed | 299 passed (300)`, `Tests 4 failed | 4096 passed |
  1 skipped`. Los 4 rojos son de `dependencias-declaradas-presentes.guardia.test.ts`, que esta en
  `tests/baseline-rojos.json` (init.sh del arnes v2, ajeno). `organizacion-en-modelos`,
  `rls-por-empresa` y `fk-misma-empresa` en verde.
- Incidencia de entorno: en la segunda corrida el `rmdir` del lock dijo que ya no existia (otro
  proceso lo quito mientras corria el test). El test salio en verde igual y las corridas siguientes
  tomaron y soltaron el lock sin problema.

Veredicto T1-T2: tabla por empresa con RLS, unico y trigger en su sitio, sin drift; 7/7 en verde y
cada caso muerto por una mutacion.
