# SLT-124 «Ranking de la central sin mensajeros de satélite» — tasks

> Todo lo hace `backend_dev` salvo T0 (leader). Dependencias entre corchetes; `[P]` = paralelizable
> con las de su mismo nivel. Antes de cualquier `vitest`: exportar la base desechable y copiar `.env`
> al worktree.

- [x] **T0 — Medida en prod (leader, solo lectura).** Hecha el 2026-11-11 con `BEGIN READ ONLY`, con
  la `DATABASE_URL` de `.env.prod` sin imprimirla y solo conteos por empresa (id). Resultado:
  - 0 premios y 0 incentivos colgados de cierres de satélite (vigentes o anulados);
  - 0 filas de podio con premio de mensajeros fuera de la zona central;
  - 0 mensajeros y 0 días con cierres de los dos destinos.

  *Hecho:* D5 de `requirements.md`. No hay nada que anular ni migrar.
- [x] **T1 — Lectura (sin código).** Confirmar contra la rama cada cita archivo:línea de
  `requirements.md > Alcance` y de `design.md`. *Hecho:* tabla en `progress/impl_SLT-124.md` con cada
  cita y si sigue igual.
- [x] **T2 — Repositorio del cierre del día [T1].** En `resolverCierreDelDia`, añadir el parámetro
  `alcance: Alcance` (obligatorio) y `...alcanceWhere(alcance)` en el `where`. Reescribir la cabecera
  de `ICierreDelDiaRepository`. *Hecho:* typecheck verde y `premio-ranking-lecturas.test.ts` fija el
  `where` literal con `destinoTipo: "bodega_central"`. El literal no se importa de `alcanceWhere`: es
  el contrato.
- [x] **T3 — Servicio del premio [T2].** `PremioRankingDevengoService` pasa `ALCANCE_ACCESO_TOTAL` al
  listar y al registrar. *Hecho:*
  - `premio-ranking-devengo-service.test.ts` afirma el alcance pasado en las dos rutas (R4, R5);
  - los tests existentes siguen verdes sin cambiar lo que afirman (R6).
- [x] **T4 — Servicio del incentivo [T1] [P con T2].** `registrar` usa
  `listarCierresImputablesEnAlcance` y `obtenerCierreParaPagoEnAlcance` con `ALCANCE_ACCESO_TOTAL`;
  ajustar el `Pick`; `anular` no se toca. Comprobar que el composition root pasa el repositorio.
  *Hecho:* `incentivo-mensajero-service.test.ts` cubre R8, R9 y R10 (alcance pasado; la relectura
  fuera de alcance da `sin_cierre_aprobado` sin escribir) y los tests existentes siguen verdes.
- [x] **T5 — Universo del ranking [T1] [P con T2].** `UserRepository.listMensajeros` añade
  `zona: { esCentral: true }` al `where`; actualizar la cabecera de `IUserRepository.listMensajeros`.
  Los servicios del ranking no cambian. *Hecho:* `user-repository.mensajeros.test.ts` fija el `where`
  literal, y los tests `ranking-service` y `ranking-snapshot-service` siguen verdes sin tocarlos.
- [x] **T6 — Guardia de criterio único [T2] [P].** Añadir `CierreDelDiaRepository` a los
  consumidores de `alcanceWhere` en `criterio-unico.guardia.test.ts`, con el import exacto y 1 uso.
  *Hecho:* la guardia sale verde y se pone roja si se redeclara el filtro a mano.
- [x] **T7 — Llamadores existentes [T2] [P].** `premio-ranking-idempotencia.test.ts` pasa el alcance
  a `resolverCierreDelDia`, sin cambiar lo que afirma (sus fixtures ya son `bodega_central`).
  *Hecho:* verde.
- [x] **T8 — Integración contra Postgres real [T3, T4, T5].** Test nuevo
  `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts`, con servicios y repositorios
  reales, modelado sobre `pago-mensajero-bodega-duena.test.ts`. Cada `it` comprueba primero que lo
  sembrado existe (nada de `if (!x) return`). Escenarios:
  - (a) solo cierre `aprobado` de satélite el día del podio → premio `sin_cierre`, con 0 filas nuevas
    en el libro, en la caja y en las acciones del snapshot (R2);
  - (b) el mismo día, un cierre de satélite `aprobado` pedido antes y uno central `aprobado` → el
    premio se imputa al central (R1, R3);
  - (c) satélite `aprobado` y central `solicitado` → `cierre_no_aprobado` con estado `solicitado` (R3);
  - (d) el listado de esa fecha con a, b y c (R4);
  - (e) un incentivo con un cierre de satélite aprobado más reciente que el central → se imputa al
    central (R8);
  - (f) un incentivo con solo cierres de satélite → `sin_cierre_aprobado`, 0 filas (R9);
  - (g) anular un premio y un incentivo sembrados contra un cierre de satélite → ok (R7, R11);
  - (h) un mensajero de zona satélite con más entregas no aparece en el ranking en vivo ni en el
    congelado, y el podio lo ocupa uno de la central (R12);
  - (i) un snapshot sembrado antes se lee igual (R13);
  - (j) una empresa sin zona `es_central` → el vivo sale sin filas, el congelado escribe la cabecera
    con 0 filas y el listado de premios dice «ranking congelado, sin podio» (R14).

  **Tres mutaciones obligatorias**, anotando el rojo observado de cada una y revirtiéndola:
  1. quitar `...alcanceWhere(alcance)` de `resolverCierreDelDia` → rojos a, b, c y d;
  2. volver a `listarCierresImputables` sin alcance en el incentivo → rojos e y f;
  3. quitar `zona: { esCentral: true }` de `listMensajeros` → rojos h y j.

  *Hecho:* verde y las tres mutaciones registradas en `progress/impl_SLT-124.md`.
- [x] **T9 — E2E [T8].** En base desechable nueva y con `NEXT_PUBLIC_APP_URL` como en el CI, correr:
  - `pnpm exec playwright test --project=dinero`;
  - `e2e/incentivo-mensajero-slt68.spec.ts`;
  - `e2e/dos-empresas-humo.spec.ts`.

  Si un fixture siembra mensajeros sin zona central, se corrige el fixture y se anota.
  *Hecho:* verdes, con comandos y resultados en `progress/impl_SLT-124.md`.
- [x] **T10 — Cierre [T9].** Correr `./init.sh` y escribir la salida a archivo con `INIT_EXIT=$?`
  dentro del log. Escribir el mapa `R<n> -> test` en `progress/impl_SLT-124.md`. Anotar las deudas:
  `listarCierresImputables` sin alcance se queda sin consumidores en `lib/`, y R14 queda marcado para
  Preview. *Hecho:* `INIT_EXIT=0` y todos los R con su test.

## Trazabilidad

| R | Test previsto |
|---|---|
| R1 | `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (b) + mutación 1 |
| R2 | `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (a) |
| R3 | `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (b, c) |
| R4 | `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (d) + `tests/unit/services/premio-ranking-devengo-service.test.ts` |
| R5 | `tests/unit/repositories/premio-ranking-lecturas.test.ts` (WHERE literal) + `tests/unit/repositories/criterio-unico.guardia.test.ts` + mutación 1 |
| R6 | `tests/unit/services/premio-ranking-devengo-service.test.ts` + `tests/integration/db/premio-ranking-idempotencia.test.ts`, sin cambiar lo que afirman |
| R7 | `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (g) |
| R8 | `tests/unit/services/incentivo-mensajero-service.test.ts` + `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (e) + mutación 2 |
| R9 | `tests/unit/services/incentivo-mensajero-service.test.ts` + `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (f) + mutación 2 |
| R10 | `tests/unit/services/incentivo-mensajero-service.test.ts` |
| R11 | `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (g) |
| R12 | `tests/unit/repositories/user-repository.mensajeros.test.ts` + `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (h) + mutación 3 |
| R13 | `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (i) |
| R14 | `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (j) + mutación 3; [Preview] con Carlos |

## Archivos esperados

- `lib/interfaces/repositories/ICierreDelDiaRepository.ts`
- `lib/repositories/CierreDelDiaRepository.ts`
- `lib/services/PremioRankingDevengoService.ts`
- `lib/services/IncentivoMensajeroService.ts`
- `lib/interfaces/repositories/IUserRepository.ts`
- `lib/repositories/UserRepository.ts`
- `tests/unit/repositories/premio-ranking-lecturas.test.ts`
- `tests/unit/services/premio-ranking-devengo-service.test.ts`
- `tests/unit/services/incentivo-mensajero-service.test.ts`
- `tests/unit/repositories/user-repository.mensajeros.test.ts`
- `tests/unit/repositories/criterio-unico.guardia.test.ts`
- `tests/integration/db/premio-ranking-idempotencia.test.ts`
- `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts`
- `specs/SLT-124-ranking-sin-satelite/requirements.md`
- `specs/SLT-124-ranking-sin-satelite/design.md`
- `specs/SLT-124-ranking-sin-satelite/tasks.md`
- `progress/features/SLT-124.md`
- `progress/impl_SLT-124.md`

Tamaño estimado: 18 archivos (45% de `gate.tamano_pr` = 40), +1-2 si algún fixture E2E necesita
zona central. Unas 500-800 líneas, la mayor parte en el test de integración.
