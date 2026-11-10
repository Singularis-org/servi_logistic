# impl SLT-89 — geo-jerarquica-zonas

> Bitácora del implementer. Base de pruebas: `logistic_slt89` en localhost (desechable, creada para esta
> feature con `prisma migrate deploy`; sin siembra de catálogos ni usuarios). Memoria baja:
> `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=8192`. Sin push (lo hace el leader).

## Tanda 1 (2026-11-10): T0.1, T1, T2

Sha de partida: `0d4d7d99` (docs(SLT-89): F2.0, aprobado y choque con Tarifas aceptado), apilada sobre
`origin/feature/SLT-46-geo-jerarquica-admin` @ `51c0345e` (PR #107). T0.2 (maqueta) y T7 (UI) fuera de
esta tanda.

### T0.1 — la rama arranca en verde

Sin `./init.sh` (pila de horas en esta máquina, por instrucción del leader); en su lugar, sobre el sha
de partida:
- `pnpm install --frozen-lockfile` + `prisma generate`: limpios.
- `prisma migrate deploy` sobre `logistic_slt89` recién creada: «All migrations have been successfully
  applied» (última: `20261106120200_slt46_pais_tipos_de_nivel_opcional`).
- `pnpm run typecheck`: exit 0, sin errores.
- Contrato v1 congelado: `tests/integration/api/contrato-v1.route.test.ts` (modo comparar) →
  `Test Files 1 passed (1) · Tests 22 passed (22)`.
- CI: el PR #107 de SLT-46 «Geografía jerárquica: administración de países» (mismo sha `51c0345e` que
  la base de esta rama) no tiene corrida de `gate-completo` en `gh pr checks` (solo Vercel, verde). El
  verde de CI de la base queda pendiente de esa corrida.

Decisión del implementer (a revisar): `origin/dev` ya tiene `20261109120000_cobro_plataforma_traza`,
mismo timestamp que la migración del spec. Las migraciones de SLT-89 pasan a
`20261110130000_slt89_zona_nodo` y `20261110130100_slt89_historial_zona_nodo` (revisado contra `dev` y
todas las ramas remotas: SLT-81 usa `20261109130000`, `dev` `20261110120000`, SLT-97 `20261111120000`).


### T1.1 — migración `20261110130000_slt89_zona_nodo` (= `20261109120000_slt89_zona_nodo` del spec)

Archivos: `db/migrations/20261110130000_slt89_zona_nodo/{migration.sql,down.sql}`.

- Tablas `zona_nodo` y `grupo_distritos_nodo` (design §2.1, §2.2) con `organizacion_id` + DEFAULT de
  empresa, FK, índices, RLS `<t>_por_empresa` y GRANT a `servi_app` (molde `20261103120100`). Nombres de
  índices y FK sacados de `prisma migrate diff` contra el schema (el único de `grupo_distritos_nodo`
  va recortado a 63 como lo recorta Prisma: `…_nodo_geografic_key`).
- Triggers de validación, `SECURITY DEFINER` + `search_path` fijo (precedente
  `geografia_del_pais_de_la_empresa`): `zona_nodo_valido` (SL021; profundidad 3 → 23514),
  `grupo_distritos_nodo_valido` (SL021; distrito con fila en `zona_distrito` de esa zona → 23514) y,
  en la tabla existente, `grupo_distritos_distrito_sin_duplicado` (23505).
- Triggers de misma empresa: pegados tal cual de `pnpm exec tsx scripts/generar-misma-empresa.ts
  --faltantes` (2 FK `sme_*` + 2 `*_sin_cambio_de_empresa`).
- `CREATE OR REPLACE FUNCTION orden_nodo_geografico()` (§2.3). El `down.sql` lo devuelve al cuerpo de
  SLT-43 copiado carácter por carácter de `20261104120400` (líneas 46-51).

Decisiones a revisar (reviewer):
1. **Rama extra en el trigger de `orden`, no escrita en el pseudocódigo de §2.3.** En un UPDATE que
   mueve el lugar (`COALESCE(distrito_id, canton_id)` cambia) sin tocar `nodo_geografico_id`, el nodo
   que trae NEW es el VIEJO: se pone el lugar, como SLT-43. Sin esa rama, pasar `distrito_id` a NULL
   (lo que hace la FK de `orden.distrito_id` al borrar un distrito, cabecera de 20261104120400) dejaría
   el distrito viejo como nodo —cuelga del cantón, «se conserva» según el pseudocódigo— y la FK
   RESTRICT `orden_nodo_geografico_id_fkey` impediría el borrado: rompería R29. Lo cubre T1.5.
2. `grupo_distritos_distrito_sin_duplicado` se dispara en `INSERT OR UPDATE OF zona_id, distrito_id`
   (el design dice `BEFORE INSERT`); `grupo_distritos_nodo_valido` en `INSERT OR UPDATE OF
   nodo_geografico_id, zona_id`. Solo cierra el hueco de un UPDATE por SQL a mano; la app no actualiza
   esas filas.
3. `scripts/db-rollback.ts` revierte la ÚLTIMA carpeta en disco, no la última aplicada: dos
   `db:rollback` seguidos corren dos veces el down de `20261110130100` (no-op) y nunca el de
   `20261110130000`. El down de `20261110130000` se corrió con `prisma db execute --file` + borrado de
   su fila en `_prisma_migrations` (lo mismo que hace el script). Es del script, no de SLT-89.

Comprobación en `logistic_slt89` (local, desechable):
- `prisma migrate deploy` → «All migrations have been successfully applied» (las dos de SLT-89).
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → «This is an
  empty migration.» (sin drift, con el schema de T1.3).
- Vuelta: down de `20261110130100` (no-op) + down de `20261110130000` → «Script executed
  successfully»; comprobación por SQL: sin `zona_nodo`/`grupo_distritos_nodo`, sin las tres funciones,
  `orden_nodo_geografico` sin el cuerpo nuevo. `migrate status`: las dos pendientes.
- Reaplicadas con `migrate deploy` → aplicadas; `migrate diff` otra vez vacío.

### T1.2 — migración `20261110130100_slt89_historial_zona_nodo` (= `20261109120100_…` del spec)

Archivos: `db/migrations/20261110130100_slt89_historial_zona_nodo/{migration.sql,down.sql}`;
`specs/SLT-89-geo-jerarquica-zonas/tasks.md` (T1.1 y T1.2 marcadas, con la nota del timestamp).

- Sola en su migración (55P04): `ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS
  'zona_nodo_cambiado';`.
- `down.sql` = `SELECT 1;` con el comentario de por qué el valor se queda (molde SLT-46
  `20261106120000`). Aplicada, revertida (no-op) y reaplicada en `logistic_slt89` junto con T1.1.
