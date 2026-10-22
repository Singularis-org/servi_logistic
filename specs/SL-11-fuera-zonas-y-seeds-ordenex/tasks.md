# SL-11 — Tareas

Todo se hace y se verifica en el worktree `.worktrees/SL-11-fuera-zonas-y-seeds-ordenex`, contra una
base desechable `servi_logistic_sl11`, salvo T13, que es del leader. Cada `./init.sh` va a un log con
`INIT_EXIT=$?` escrito dentro.

## Tareas

- [x] **T0 — Punto de partida.**
  - Rebasar sobre `dev` (trae `60befb1` y SL-10 integrada).
  - `tests/baseline-rojos.json` existe y lleva las dos entradas de zona.
  - `DATABASE_URL` está exportada y no contiene ningún project ref de Ordenex.
  - Crear `servi_logistic_sl11`.

  **Hecho:** las cuatro cosas anotadas en `progress/impl_SL-11.md`. Si falta SL-10 o no se puede
  crear la base, PARA.
- [x] **T1 — Línea base.** Depende de T0.
  - Con el código **sin cambiar**, `prisma migrate deploy` sobre la base vacía. Se espera que aborte
    en `20260918120200`; anotar el error real.
  - `./init.sh` con esa base, con el log en `_trabajo/gate-antes.log` y los rojos heredados anotados.
  - Al acabar, borrar y recrear la base.

  **Hecho:** el comportamiento de partida medido y escrito.
- [x] **T2 — Migraciones** (D2; R5–R8). Depende de T1.
  - Editar `20260709120000` (sin el usuario y sin «Ordenex»), `20260918120100` (comentarios) y
    `20260918120200` (mensaje y cabecera).
  - Borrar las carpetas `20260720150000_*` y `20260713010000_*`.

  **Hecho:** sobre la base vacía, `prisma migrate deploy` sin variables de SINPE termina con 0;
  `prisma migrate status` sale limpio; `zona`, `zona_distrito` y `usuario` tienen 0 filas; hay
  7/84/494 de geografía. Las consultas quedan pegadas en `progress/impl_SL-11.md`.
- [x] **T3 [P] — Fuera el SINPE inicial y el desatasco** (D3; R9, R10). Depende de T0.
  - Borrar `scripts/seed-sinpe-inicial.ts`.
  - Limpiar `scripts/migrate-deploy.ts` y `scripts/migrate-deploy-guardas.ts`.
  - Vaciar la allowlist de la guardia de `NEXT_PUBLIC_SINPE`.
  - Quitar el caso `sembrarSinpe` de `prisma-client-sin-adaptador`.

  **Hecho:** typecheck verde; `jobs-recurrentes-con-siembra` y las dos guardias en verde; la
  contraprueba de inyección SINPE sigue en rojo cuando debe.
- [x] **T4 [P] — Fuera los seeds y los archivos de Ordenex** (D1, D7; R1, R2, R4). Depende de T3.
  - Borrar:
    - los xlsx y las notas de `public/`;
    - `scripts/seed-zonas.ts`, `scripts/seed-usuarios-qa.ts` y `scripts/seed-maestro.ts`;
    - `04_insert_zonas_pago_distrito.sql`;
    - los cinco tests de D7.
  - Bajas en `package.json`.

  **Hecho:** typecheck verde, commiteado, y `tests/unit/guards/test-citado-desaparecido.guardia.test.ts`
  en verde **después del commit**.
- [x] **T5 — Fixture compartido** (D6, R16). Depende de T2. Crear
  `tests/integration/db/_fixtures/orden-minima.ts`.

  **Hecho:** typecheck verde.
- [x] **T6 — Los `zona-*` con sus datos** (D6; R11, R12). Depende de T5.
  - Migrar los seis archivos de R11 a los fixtures.
  - Sacar las dos entradas de `tests/baseline-rojos.json`.

  **Hecho:**
  - los seis en verde contra `servi_logistic_sl11` recién migrada, **sin ningún usuario** y sin
    haber corrido `db:seed`;
  - la mutación de D6 pone en rojo `zona-central-guarda-y-rastro`, y se revierte;
  - la salida queda pegada en `progress/impl_SL-11.md`.
- [x] **T7 [P] — `zona-sinpe-migration` y `geografia-dta-2026-migration`** (D5; R13, R14). Depende de
  T2 y T3.

  **Hecho:** los dos en verde. El caso del aborto se pone en rojo con una copia temporal del `.sql`
  sin el `DO`, restaurada después.
- [x] **T8 [P] — Test de la carga masiva** (D4, R15). Depende de T4.

  **Hecho:** verde, con 494 ternas parseadas. Rojo comprobado cambiando, en una copia temporal, el
  `example` de `provincia` por uno inexistente; restaurado.
- [x] **T9 [P] — Mensajes de los tests restantes** (D6, R3). Depende de T4. Solo el texto de los
  `throw` que nombran `db:seed:maestro`, `db:seed:usuarios` o `db:seed:zonas`.

  **Hecho:** `rg "db:seed:(maestro|usuarios|zonas)" tests scripts lib app README.md` sin resultados.
- [x] **T10 — README** (D1; R3, R17). Depende de T2 y T4.
  - «Base de datos» en dos comandos y la nota de `migrate reset`.
  - Fuera «Usuario maestro (bootstrap)» y, en su lugar, la línea de SL-32.

  **Hecho:** el README no nombra ningún script retirado.
- [x] **T11 — Guardia `fuera-datos-ordenex`** (D7; R1–R3, R6, R9, R16). Depende de T2 a T5, T9 y T10.

  **Hecho:** verde, y las cuatro contrapruebas sintéticas en rojo como deben.
- [x] **T12 — Arranque y gate de cierre** (R17–R19). Depende de T2 a T11.
  - Sobre `servi_logistic_sl11`: `pnpm db:seed`, dev server.
    - `GET /login` responde sin error 5xx;
    - `SELECT count(*) FROM usuario` da 0.
    - Las dos salidas quedan pegadas en `progress/impl_SL-11.md`.
  - `./init.sh` con esa base: `INIT_EXIT=0`, log en `_trabajo/gate-sl11.log`. Un rojo ajeno al diff:
    PARA y repórtalo.
  - `git diff --name-only dev...HEAD`: no toca `specs/` fuera de este spec ni ninguna ruta de
    `arnes.manifest`, y la geografía de CR sigue en sus migraciones.
  - Mapa `R<n> → test` en `progress/impl_SL-11.md`.
  - Borrar `servi_logistic_sl11`.

  **Hecho:** todo lo anterior, con sus logs.
- [ ] **T13 — Base local del checkout principal (leader, tras integrar en `dev`).** Por decisión del
  humano: `prisma migrate reset` sobre la base del `.env`, `pnpm db:seed` y `./init.sh` en el
  checkout principal.

  **Hecho:** `INIT_EXIT=0`.
- [x] **T14 — Ajustes de la review del 2026-10-22** (R20; B1, m1, m4). Depende de T12.
  - `.env.example`: fuera la línea de la cabecera que cita `scripts/seed-sinpe-inicial.ts` → SL-11,
    y el párrafo sobre las variables de SINPE reescrito sin nombrar el script ni una lista de
    permitidos. El resto de comentarios no se toca.
  - La guardia `fuera-datos-ordenex` comprueba R20, con contraprueba sintética.
  - `crearFksDeOrden` deja de crear la orden (D6 corregido); las mutaciones de D6 vuelven a medirse.
  - `docs/limpieza-ordenex.md`: las filas de SL-11 pasan a hechas y dejan de proponer un seed de
    desarrollo.

  **Hecho:** `env-example-sin-valores`, `sinpe-sin-variables-de-entorno` y `fuera-datos-ordenex` en
  verde; los `zona-*` en verde contra una base recién migrada y las dos mutaciones en rojo; gate
  `INIT_EXIT=0`.

## Trazabilidad prevista

| Req | Test o corrida |
|---|---|
| R1 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R2 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R3 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R4 | corrida T4/T12: los cinco archivos fuera del árbol y `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` verde tras el commit |
| R5 | corrida T2: conteos sobre la base recién migrada |
| R6 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R7 | corrida T2: `prisma migrate deploy` y `prisma migrate status` sin variables de SINPE |
| R8 | `tests/integration/db/zona-sinpe-migration.test.ts` |
| R9 | `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts` + `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R10 | `tests/unit/guards/sinpe-sin-variables-de-entorno.guardia.test.ts` |
| R11 | `tests/integration/db/zona-central-guarda-y-rastro.test.ts`, `tests/integration/db/zona-guardado-conserva-inactivos.test.ts`, `tests/integration/db/zona-pago-mensajero-rastro.test.ts`, `tests/integration/db/zona-reconciliacion-ordenes.test.ts`, `tests/integration/db/zona-sinpe-rastro.test.ts`, `tests/integration/db/zona-sinpe-revision.test.ts` (corrida T6 sin usuarios ni siembra) |
| R12 | corrida T6: las dos rutas ausentes de `tests/baseline-rojos.json` y en verde |
| R13 | `tests/integration/db/zona-sinpe-migration.test.ts` |
| R14 | `tests/integration/db/geografia-dta-2026-migration.test.ts` |
| R15 | `tests/unit/scripts/carga-masiva-ejemplos-geo.test.ts` |
| R16 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R17 | corrida T12: `/login` responde sin 5xx y `usuario` vacía |
| R18 | corrida T12: el diff contra `dev`, cruzado con `arnes.manifest` |
| R19 | corrida T12: `INIT_EXIT=0` |
| R20 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |

## Archivos esperados

- `package.json`
- `.env.example`
- `docs/limpieza-ordenex.md`
- `README.md`
- `04_insert_zonas_pago_distrito.sql`
- `public/geografia-cr-completa.xlsx`
- `public/mapa-geografico-costa-rica.xlsx`
- `public/geografia-cr-completa-NOTAS.md`
- `scripts/seed-zonas.ts`
- `scripts/seed-usuarios-qa.ts`
- `scripts/seed-sinpe-inicial.ts`
- `scripts/seed-maestro.ts`
- `scripts/migrate-deploy.ts`
- `scripts/migrate-deploy-guardas.ts`
- `db/migrations/20260709120000_seed_maestro_user/migration.sql`
- `db/migrations/20260709120000_seed_maestro_user/down.sql`
- `db/migrations/20260720150000_drop_default_maestro_user/migration.sql`
- `db/migrations/20260720150000_drop_default_maestro_user/down.sql`
- `db/migrations/20260713010000_seed_zonas_pago_distrito/migration.sql`
- `db/migrations/20260713010000_seed_zonas_pago_distrito/down.sql`
- `db/migrations/20260918120100_zona_sinpe/migration.sql`
- `db/migrations/20260918120100_zona_sinpe/down.sql`
- `db/migrations/20260918120200_zona_sinpe_no_nulo/migration.sql`
- `tests/baseline-rojos.json`
- `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts`
- `tests/unit/guards/sinpe-sin-variables-de-entorno.guardia.test.ts`
- `tests/unit/guards/prisma-client-sin-adaptador.guardia.test.ts`
- `tests/unit/scripts/carga-masiva-ejemplos-geo.test.ts`
- `tests/unit/scripts/seed-zonas.test.ts`
- `tests/unit/scripts/seed-zonas-codigo-dta.test.ts`
- `tests/unit/scripts/seed-sinpe-inicial.test.ts`
- `tests/unit/scripts/migrate-deploy-auto-resolucion.test.ts`
- `tests/integration/db/_fixtures/orden-minima.ts`
- `tests/integration/db/seed-zonas-cruza-por-codigo.test.ts`
- `tests/integration/db/zona-central-guarda-y-rastro.test.ts`
- `tests/integration/db/zona-guardado-conserva-inactivos.test.ts`
- `tests/integration/db/zona-pago-mensajero-rastro.test.ts`
- `tests/integration/db/zona-reconciliacion-ordenes.test.ts`
- `tests/integration/db/zona-sinpe-rastro.test.ts`
- `tests/integration/db/zona-sinpe-revision.test.ts`
- `tests/integration/db/zona-sinpe-migration.test.ts`
- `tests/integration/db/geografia-dta-2026-migration.test.ts`
- `tests/integration/db/premio-ranking-devengo-migration.test.ts`
- `tests/integration/db/api-key-eliminar.test.ts`
- `tests/integration/db/gasto-fijo-cobro-migration.test.ts`
- `tests/integration/db/gasto-fijo-cobro-idempotencia.test.ts`
- `tests/integration/db/gasto-fijo-cobro-aprobacion.test.ts`
- `tests/integration/db/geografia-cascada-reversible.test.ts`
- `tests/integration/db/geografia-registro-accion.test.ts`
- `tests/integration/db/geografia-renombrado.test.ts`
- `tests/integration/db/postulacion-recurso-migration.test.ts`
- `progress/impl_SL-11.md`
- `specs/SL-11-fuera-zonas-y-seeds-ordenex/requirements.md`
- `specs/SL-11-fuera-zonas-y-seeds-ordenex/design.md`
- `specs/SL-11-fuera-zonas-y-seeds-ordenex/tasks.md`
