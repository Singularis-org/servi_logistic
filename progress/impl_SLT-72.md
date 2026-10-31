# SLT-72 — implementación del spec 451 (confirmación física de las órdenes sin gestionar)

Spec vigente: `specs/451-confirmacion-fisica-sin-gestionar/` (R1–R40), tal cual (Carlos, 2026-10-31,
Q1 = (a)). Decisión vigente: si falta una orden por escanear, el servidor NO aprueba; sin puerta de
escape (D2 de 238/451).

## Backend (T1–T4)

Hecho por `backend_dev` el 2026-10-31 en `.worktrees/SLT-72-hotfix`, rama
`hotfix/SLT-72-confirmacion-fisica-sin-gestionar`. Tasks cerradas: T1.1–T1.3, T2.1–T2.2, T3.1–T3.4,
T4.1–T4.6 (marcadas `[x]` en `tasks.md`). Fuera de mi alcance: T0.1 (consulta a producción), T5
(pantalla) y T6.

### Archivos

Producción:
- `lib/types/gestion-retorno.ts`: se añaden `OrigenDelPaquete`, `RETORNO_POR_ORIGEN` (`as const satisfies Record<OrigenDelPaquete, "siempre" | "nunca" | "segun_resultado">`), `PaqueteDelCierre` y `vuelveABodegaElPaquete`. Las líneas 1-61 (eje de resultados) no cambian: `git diff` solo añade a partir de la 62.
- `lib/types/cierres-admin.ts`: `confirmacionFisicaSchema` pasa a `z.discriminatedUnion("origen", …)`. El `.default([])` de `aprobarCierreSchema` se conserva.
- `lib/interfaces/services/ICierresAdminService.ts`: `ConfirmacionFisicaInput` pasa a ser la union.
- `lib/interfaces/repositories/ICierresAdminRepository.ts`:
  - nuevos `BarridaDelCierre`, `ConfirmacionFisicaBarrida` y `findBarridasDelCierre`;
  - `ResolverCierreInput.confirmacionFisica` (rama `aprobado`) acepta `ConfirmacionFisicaGestion | ConfirmacionFisicaBarrida`.
- `lib/repositories/CierresAdminRepository.ts`:
  - `findBarridasDelCierre`, con `where { cierreId, cierre: alcanceWhere(alcance) }`;
  - en `resolverCierre`, la lista se parte por origen y se añade el `updateMany` sobre `tx.cierreSinGestion`, pegado al de la 238. Va guardado por `cierreId` + `ordenId IN`, con `data` de una sola clave y fallo cerrado.
- `lib/services/CierresAdminService.ts`:
  - `validarConfirmacionFisica` lee las dos fuentes, monta un solo mapa por clave y comprueba que el origen coincide;
  - el atajo de R18 se amplía a «ni gestiones ni barridas ni entradas»;
  - `aprobarCierre` pasa `{gestionId}` o `{ordenId}` según el origen.
- `db/schema.prisma`: `CierreSinGestion.confirmadaFisicaAt DateTime? @map("confirmada_fisica_at")`.
- `db/migrations/20261031130000_cierre_sin_gestion_confirmacion_fisica/{migration.sql,down.sql}`: es aditiva (`ADD COLUMN … TIMESTAMP(3)`, nullable, sin default). El `down.sql` se escribió a mano con `DROP COLUMN IF EXISTS`.

Tests nuevos:
- `tests/integration/db/cierre-sin-gestion-confirmacion-migration.test.ts` (T4.4).
- `tests/integration/db/cierre-sin-gestion-confirmacion-sql-real.test.ts` (T4.5): siembra sus propios datos en una transacción revertida.

Tests extendidos:
- `tests/unit/types/gestion-retorno.test.ts` (T1.2)
- `tests/unit/guards/confirmacion-incidentes-excluidos.guardia.test.ts` (T1.3): dos casos más el bloque de autocomprobación.
- `tests/unit/repositories/cierres-admin-confirmacion-fisica.test.ts` (T2.2 y T4.3)
- `tests/unit/types/cierres-admin-confirmacion-schema.test.ts` (T3.2)
- `tests/unit/services/cierres-admin-confirmacion-fisica.test.ts` (T3.4)
- `tests/unit/services/cierres-admin-service.aprobar.sin-gestion.test.ts` (T4.6)
- `tests/unit/guards/aprobacion-escrituras-cubiertas.guardia.test.ts`: entrada de inventario para `tx.cierreSinGestion.updateMany`.

Dobles y fixtures que el contrato obliga a tocar:
- Se añade `findBarridasDelCierre` al doble de `ICierresAdminRepository` en 12 suites de `tests/unit/services/`.
- Se añade `cierreSinGestion.findMany` a los dos dobles de prisma de `cierres-admin-service.test.ts`.
- Se añade `origen: "gestion"` a las entradas literales de `tests/integration/actions/cierres-admin-action.test.ts`, `_fixtures/caja-459.ts` y `cierre-rechazo-tienda-aprobacion.test.ts`.
- `confirmacionDe` de `454/_escenario.ts` y `aprobarCierre` de `tests/fabricas/escenarios/cierres.ts` ahora también confirman las barridas. Esa fábrica la usan el E2E y la demo de QA.
- `454/caracterizacion/confirmacion-fisica-238.test.ts`: se ajusta el tipo en un `map`.

`tests/unit/repositories/cierres-admin-caja-cod.test.ts` **no se tocó** (R39): `git diff --quiet` → limpio, 12/12 verde.

### Desviaciones respecto al spec 451

1. **`confirmacionBarridas` no es un campo hermano del repo (design §5.4/T4.2).**
   - Las barridas viajan en la MISMA lista `confirmacionFisica` como `{ ordenId }`, con `gestionId?: never`. El repo las parte en dos `updateMany`, uno por tabla, como pide §9-F.
   - Motivo: un campo obligatorio nuevo rompía el typecheck de `cierres-admin-caja-cod.test.ts`, que R39 exige verde **sin modificarse**. R39 es requisito y §5.4 es diseño.
   - Lo que el diseño quería se conserva:
     - el campo sigue siendo obligatorio al aprobar y `?: never` al rechazar (R27);
     - el servicio no puede cablear un elemento del borde sin decidir su origen, porque la rama `barrida` no tiene `gestionId` y un mapeo sin `origen` no compila.
   - No cambia el comportamiento de ningún R.
2. **La lectura de barridas no es «perezosa» (design §5.2, T3.3 «ni una consulta más que antes»).**
   - Es imposible cumplir eso y R10 a la vez: un cierre sin gestiones que vuelvan y con la lista vacía puede tener barridas, y solo se sabe leyéndolas.
   - Coste: UNA consulta por aprobación, en paralelo con la de gestiones y acotada por el índice `(cierre_id, orden_id)`. Se mide contando llamadas: `findBarridasDelCierre` se llama 1 vez y `findGestionesRetornablesDelCierre` 1 vez (caso «R7/R18…»).
   - R18 (mismo comportamiento y mismo payload) se cumple.
3. **Comprobación de origen en la cobertura.**
   - La entrada `{origen:"gestion", gestionId: <ordenId de una barrida>}` casaría la fila de la barrida en el mapa por clave. Se añade `esperada.origen !== entrada.origen → ajena`.
   - Es el mismo mensaje `MSG_CONFIRMACION_AJENA`; no hay mensaje nuevo.
4. **T4.5 no usa `prepararMundo` de la 454.**
   - Ese andamiaje cae hoy en este repo con «referencia a otra empresa: orden.zona_id -> zona», y sus suites (484, 454, `cierre-sin-gestion-tope-sql-real`) están en `tests/baseline-rojos.json`.
   - El test nuevo siembra sus propios datos (zona, usuarios, órdenes, intentos, cierre y `cierre_sin_gestion`) dentro de `enTransaccionRevertida`, con el patrón de SLT-63.
   - Corre contra una base solo con catálogos y no necesita entrar al baseline. Usa `montarServicios` de la 454, que sí funciona.
5. **Commits.** Se hicieron en dos tandas de código, T1 y T2–T4 juntas: los archivos de T2, T3 y T4 se cruzan (interfaz, repo y servicio) y separarlos dejaba un commit intermedio que no compila.
6. **Números de línea.** Los del spec, escrito el 2026-09-21, ya no coinciden: `validarConfirmacionFisica` está en ~1290 y la marca de la 238 en ~2400. Los nombres sí coinciden. `ESTADOS_RESOLUBLES` es `["solicitado"]`, así que el cierre vencido se reabre (re-solicitud o válvula) antes de aprobar.

**Para frontend (T5.4, obligatorio):** el borde ahora EXIGE `origen` en cada entrada. La pantalla actual manda `{gestionId, numGuia}` sin `origen` (`CierresAdminModule.tsx`, `listaConfirmacionFisica`), así que hasta T5.4 la aprobación de un cierre con retornables devuelve `VALIDATION_ERROR`. Compila igual porque la action recibe `unknown`, y por eso no toqué UI. `tests/components/CierresAdminConfirmacionFisica.test.tsx` sigue verde (34/34).

### Mapa R<n> → test (los que cubre backend)

Abreviaturas de archivo:
- `RET`: `tests/unit/types/gestion-retorno.test.ts`
- `GUA`: `tests/unit/guards/confirmacion-incidentes-excluidos.guardia.test.ts`
- `REPO`: `tests/unit/repositories/cierres-admin-confirmacion-fisica.test.ts`
- `SVC`: `tests/unit/services/cierres-admin-confirmacion-fisica.test.ts`
- `SCH`: `tests/unit/types/cierres-admin-confirmacion-schema.test.ts`
- `SG`: `tests/unit/services/cierres-admin-service.aprobar.sin-gestion.test.ts`
- `MIG`: `tests/integration/db/cierre-sin-gestion-confirmacion-migration.test.ts`
- `SQL`: `tests/integration/db/cierre-sin-gestion-confirmacion-sql-real.test.ts`

| R | Archivo · caso |
|---|---|
| R1 | RET · «R1/R3: nombra EXACTAMENTE los dos origenes», «R1: la barrida vuelve SIEMPRE…», «R1/R2: una gestion `%s` -> vuelve = %s» |
| R2 | RET · «R1/R2: una gestion `%s`…» (los 5 resultados) + casos 238 previos sin editar; RET · «R3: el eje nuevo conserva su red…» (también `satisfies Record<GestionResultado, boolean>`) |
| R3 | RET · «R3: el eje nuevo conserva su red de compilacion»; GUA · «R3: el punto unico conserva la red del eje nuevo» |
| R4 | GUA · «ningun archivo de produccion fuera del punto unico declara su propia regla de origen» + autocomprobación («se pone ROJO ante una regla de origen plantada», «NO ladra ante quien CONSULTA la regla…»); RET · «R4: la gestion DELEGA…» |
| R5 | REPO · «R5/R6: devuelve TODAS las barridas registradas del cierre…» |
| R6 | REPO · «R6: el WHERE sale del registro…»; SQL · «R6/R9: la lista barrida no crece ni cambia entre validar y aprobar…» |
| R7 | REPO · «R7: un cierre sin barridas registradas devuelve `[]`…»; SVC · «R7/R18: sin gestiones que vuelvan NI barridas…», «R7: con gestiones que vuelven y SIN barridas…» |
| R8 | REPO · «R8: fuera de alcance -> `[]`…»; SVC · «R8: las barridas se leen con el ALCANCE del satelite» |
| R9 | REPO · «R9: NO devuelve la barrida de otro cierre…», «R9: el `cierreId` es GUARDA…»; SQL · «R6/R9…» (cierre anterior testigo) |
| R10 | SVC · «R10: cierre SOLO con barridas y confirmacion vacia…» |
| R11 | SVC · «R11: gestiones completas y una barrida faltante…», «R11: barridas completas y una gestion faltante…»; SQL · «R11/R12: con una barrida sin confirmar NO aprueba…» |
| R12 | SVC · «R12: falta UNA barrida…»; SQL · «R11/R12…» |
| R13 | SVC · «R13: una barrida que este cierre NO barrio…», «R13: la MISMA barrida dos veces…», «R13: una entrada no puede cubrir la fila del OTRO origen…» |
| R14 | SVC · «R14: la guia leida no es la CONGELADA…» |
| R15 | SVC · «R15: barrida SIN guia…»; REPO · «R5/R6…» (la nula no se omite) |
| R16 | SVC · todos los rojos afirman `repo.resolverCierre` no llamado |
| R17 | SVC · «R17: la peticion SIN el campo…»; SCH · bloque «451/R17 (forma)» (5 casos) |
| R18 | SVC · «R7/R18: sin gestiones que vuelvan NI barridas…»; SCH · casos 238 «sin `confirmacionFisica` -> valido…» |
| R19 | SVC · «R19: CUALQUIER lista a la que le falte una fila no aprueba…» |
| R20 | REPO · «R20: marca EXACTAMENTE las barridas confirmadas…»; SVC · «R20/R26: con la cobertura EXACTA…»; SQL · «R20/R26…» |
| R21 | REPO · «R21: una barrida que no es de ESTE cierre -> `count` corto -> LANZA…»; SQL · «R21: una barrida ajena en la escritura LANZA y revierte…» |
| R22 | REPO · «R22: el `data` lleva EXACTAMENTE `confirmadaFisicaAt`…»; SQL · «R22: la marca no altera los descriptivos congelados»; SG · «R22/R38: confirmar las barridas no cambia NI UN movimiento»; `[=]` `cierre-sin-gestion-sin-dinero.guardia.test.ts` |
| R23 | MIG · «R23: existe, es NULLABLE, sin DEFAULT…», «R23: NULLABLE, sin default y sin backfill…» |
| R24 | `[=]` `tests/unit/guards/confirmacion-sin-lectores.guardia.test.ts` (verde sin tocar) |
| R25 | REPO · «R25: segunda aprobacion…» |
| R26 | SG · «R26: el conjunto liberado es IGUAL al conjunto marcado»; SQL · «R20/R26: … TODA orden que la aprobacion movio quedo marcada» (ramas bodega y tope) |
| R27 | REPO · «R27/R28: rechazar … no escribe ninguna marca» (y `confirmacionFisica?: never` en el tipo) |
| R28 | REPO · «R27/R28…» (`forzarSolicitudVencido` no recibe confirmación); SQL · el cierre se re-solicita y la aprobación posterior exige la lista completa |
| R37 | SVC · «R37: el satelite tampoco aprueba con una barrida sin confirmar» |
| R38 | SG · «R22/R38…»; `[=]` `cierres-admin-caja-cod.test.ts` |
| R39 | `[=]` `tests/unit/repositories/cierres-admin-caja-cod.test.ts`: sin modificar, 12/12 |
| R40 | MIG · «R40: el `down.sql` REAL suelta la columna, es idempotente…» + round trip `db:rollback` (abajo) |

R29–R36 son de la pantalla (T5, frontend).

### Mutaciones (rojo → verde), todas revertidas

`cmp` contra la copia previa de cada archivo → «RESTAURADO».

1. **Quitar `cierreId` del WHERE de `findBarridasDelCierre`.**
   - REPO: `4 failed | 21 passed`. Fallan «R5/R6…», «R9: NO devuelve…», «R6: el WHERE…» y «R7…».
   - SQL: `Test Files 1 failed` (`ConfirmacionFisicaNoAplicableError` en `beforeAll`). El conjunto esperado arrastra la barrida del cierre anterior testigo.
   - Antes de añadir ese testigo, la SQL seguía verde ante esta mutación, y por eso se añadió.
   - Revertida → verde.
2. **Escritura de la marca.**
   - 2a. Quitar `cierreId` del WHERE del `updateMany` de `cierreSinGestion`:
     - REPO: `4 failed | 21 passed`, entre ellos «R9: el `cierreId` es GUARDA…»;
     - SQL: `1 failed | 5 passed` («R21…»).
   - 2b. Quitar el fallo cerrado (`count !== ordenIds.length`):
     - REPO: `1 failed` («R21: … LANZA y la tx revierte»);
     - SQL: `1 failed` («R21…»).
   - Revertidas → verde.
3. **Quitar las barridas del conjunto esperado en `validarConfirmacionFisica`.**
   - SVC: `11 failed | 21 passed` (R10, R17, R12, R13, R14, R15, R11 x2, R20/R26, R37, R8).
   - SQL: `2 failed | 4 passed` («R11/R12…», «R20/R26…»).
   - Revertida → verde.
4. **Cobertura exacta y lista que no crece, contra SQL real.**
   - 4a. Que la marca de barridas no se escriba nunca: SQL `2 failed | 4 passed` («R20/R26…» y «R21…»).
   - 4b. Que el barrido de faltantes ignore las barridas (aprobación parcial):
     - SVC: `7 failed | 25 passed`, incluido «R19…»;
     - SQL: `1 failed` («R11/R12…»).
   - Revertidas → verde.
5. **Quitar la comprobación de origen (`esperada.origen !== entrada.origen`).** SVC: `1 failed` («R13: una entrada no puede cubrir la fila del OTRO origen…»). Revertida → verde.

### Base de datos

- Base local propia: **`servi_slt72`**, en el mismo Postgres local del `.env`. Se comprobó solo por categorías: `localhost`, no supabase. `DATABASE_URL` se pasó por variable de entorno en cada comando. El `.env` no se editó.
- Migraciones aplicadas con `prisma migrate deploy` (todas, más la nueva).
- Catálogos con `pnpm run db:seed`.
- Para T4.1, `prisma migrate status` antes de aplicar dijo `PostgreSQL database "servi_slt72" … at "localhost:5432"` y «Following migration have not yet been applied: 20261031130000_cierre_sin_gestion_confirmacion_fisica».
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma` → «This is an empty migration» (sin drift).
- Round trip:
  - estado inicial: `columna: 1 fila_migracion: 1`;
  - `pnpm run db:rollback` → «Rollback completado: 20261031130000_cierre_sin_gestion_confirmacion_fisica», `columna: 0 fila_migracion: 0`;
  - `migrate deploy` → «All migrations have been successfully applied», `columna: 1 fila_migracion: 1`.
- Para probar `prepararMundo` sembré una empresa demo local con `tests/fabricas`. Fue un script temporal, ya borrado y no versionado. Después descarté ese camino (desviación 4); esa empresa queda en `servi_slt72` y no afecta a los tests nuevos.

### `prisma generate`

`pnpm exec prisma generate` el **2026-10-31 a las 13:37:10** (hora local), tras añadir la columna en `db/schema.prisma`. «Generated Prisma Client (v7.8.0)». Ojo: `node_modules` es un junction compartido con el checkout principal y con otros worktrees.

### Salida real (resumida)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `TC_EXIT=0`, 0 `error TS`. Sin `NODE_OPTIONS`, `tsc` cae por falta de memoria (heap de 4 GB); el CI ya usa 8192.
- `pnpm run lint` → `LINT_EXIT=0`, «0 errors, 232 warnings». Ninguno en archivos de este diff.
- `pnpm run test:guardias`:
  - resultado: `Test Files 1 failed | 317 passed (318)`, `Tests 4 failed | 4437 passed | 1 skipped`;
  - los 4 rojos son **preexistentes y ajenos**: `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` busca en `init.sh` el marcador `>>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<`, y `init.sh` en HEAD tiene `>>> FIN PASO 2: DEPENDENCIAS <<<`. Ninguno de los dos archivos está en este diff;
  - la guardia `aprobacion-escrituras-cubiertas` se puso roja por la escritura nueva y quedó verde al declararla en el inventario.
- Suites tocadas (unit + action + las dos de integración nuevas + componente), contra `servi_slt72`: `Test Files 23 passed (23)`, `Tests 463 passed (463)`.
- Integración nuevas: `cierre-sin-gestion-confirmacion-migration` 11/11 y `cierre-sin-gestion-confirmacion-sql-real` 6/6, **0 skipped**.
- `vitest related` de los 6 archivos de `lib/` tocados, excluyendo `tests/integration/**` y `e2e/**`: `Test Files 233 passed (233)`, `Tests 3469 passed (3469)`.
- `cierres-admin-caja-cod.test.ts`: 12/12, sin modificar.
- Usuarios no baselineados de `_fixtures/caja-459.ts` (`caja-estado-459`, `caja-iva-aparte-sl39`, `cobro-tienda-461-completar-migration`, `deuda-plataforma-wallet`, `pago-plataforma-sl45`) y `cierres-admin-action`: verdes.

### Veredicto

Backend T1–T4 completo y verde: el servidor exige confirmar cada barrida para aprobar, la marca se escribe en la misma tx y con fallo cerrado, y la migración es aditiva y reversible. Falta T5 (pantalla), que es **obligatoria antes de desplegar**: sin ella, la pantalla actual no manda `origen`.
