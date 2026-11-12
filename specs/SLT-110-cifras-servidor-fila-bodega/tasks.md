# SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» — tasks

> Reparto: `backend_dev` T0-T3; `frontend_dev` T4 y T5. Antes del primer gate, copiar `.env` al
> worktree (sin él la integración se salta y el gate sale verde a ciegas). Base desechable para
> integración y E2E, nunca la de desarrollo.

## T0 — Comprobaciones previas (backend_dev)

- [x] **T0.1** Confirmar en `origin/dev` que nadie emitió ya `fulfillmentCargadoAt` ni
  `tarifaFaltante` en `findCierreBodegaConDetalle` (`git fetch` + `git grep` sobre `origin/dev`).
  **Hecho:** resultado anotado en `progress/impl_SLT-110.md`; si ya está, PARA y avisa al leader.
- [x] **T0.2** Calcular a mano los literales del corpus de `design.md > Verificación` con
  `derivarIngresoOrden` leída (no ejecutada) y anotarlos. **Hecho:** los literales casan con los del
  design; si alguno no casa, PARA y reporta (no se cambia el literal para que pase).

## T1 — Helper de la consulta (backend_dev) · depende de T0

- [x] **T1.1** Extraer `cargosFulfillmentVigentes(prisma, cierreIds)` en
  `lib/repositories/CierresAdminRepository.ts` (forma y `where` de `design.md > Servidor 1`);
  `findCierreByIdEnAlcance` lo usa con `[cierreId]`. Renombrar `LecturaDetalleMensajero` →
  `LecturaDetalleFila` con su comentario. **Hecho:** typecheck verde y
  `tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts` (SLT-101) verde contra la base
  sin tocarlo.

## T2 — Detalle de bodega (backend_dev) · depende de T1

- [x] **T2.1** En `lib/repositories/CierresBodegaAdminRepository.ts`: añadir
  `"ordenFulfillmentMovimiento"` al `Pick`; una llamada a `cargosFulfillmentVigentes` con los ids de
  `cierresDiaRows`; pasar `{ cargoFulfillmentAt }` a `toPendienteRowDesdeSnapshot`. **Hecho:**
  typecheck verde; los dobles de Prisma de los tests unitarios que llaman a
  `findCierreBodegaConDetalle` reciben `ordenFulfillmentMovimiento.findMany` (devolviendo `[]`) y
  siguen verdes con sus mismas aserciones.
- [x] **T2.2** Test unitario del repositorio con dobles: un detalle con dos cierres del día hace
  **una** llamada a `ordenFulfillmentMovimiento.findMany` con los dos ids en el `where`, y la gestión
  cuyo último movimiento es cargo lleva su fecha. **Hecho:** test verde; rojo con la llamada movida
  dentro del bucle por cierre del día.

## T3 — Integración contra Postgres real (backend_dev) · depende de T2

- [x] **T3.1** Nuevo `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` con el corpus
  y las aserciones de `design.md > Verificación` (A, B, C, señuelo D, igualdad con el detalle de
  `/cierres-admin`, una consulta, ninguna escritura). Patrón de SLT-101: `describeSiHayBase`, fallo
  ruidoso sin catálogos, nada de `return` temprano. **Hecho:** verde contra la base desechable y
  visible como `passed` (no `skipped`) en la salida.
- [x] **T3.2** Mutaciones de la consulta y del mapper, una a una, con el test de T3.1:
  1. quitar `in: cierreIds` del `where` del helper;
  2. `secuencia: "desc"` → `"asc"`;
  3. `tipo === "cargo"` → `true`;
  4. no pasar `{ cargoFulfillmentAt }` en bodega;
  5. quitar el filtro `actor = mensajero` de `pagosCongelados` en `GESTION_ADMIN_SELECT`.

  **Hecho:** las cinco ponen rojo T3.1 (se anota en `progress/impl_SLT-110.md` qué aserción cae en
  cada una) y el código vuelve al original con el árbol limpio. No correr el gate mientras haya una
  mutación aplicada.

## T4 — La fila de bodega las pinta (frontend_dev) · [P] con T3, depende de T2

- [ ] **T4.1** Nuevo `tests/components/CierresBodegaAdminCifrasFila.test.tsx`: monta
  `CierresBodegaAdminModule` (audiencia admin) con un detalle de dobles; la gestión con
  `fulfillmentCargadoAt` y `tarifaFaltante: true`. Afirma, con literales escritos a mano (nunca
  calculados con `fechaCorta` ni con `textoSenales`): la nota «Se cargó al saldo de la tienda el
  <fecha>, una vez por paquete. No depende de esta gestión ni de este cierre.»; «Sin tarifa de
  pago» en la celda «Señales»; «Con señales 1»; la columna «Señales» de la fila de «Descargar».
  Contraprueba con fecha nula: la nota es solo «No depende de esta gestión ni de este cierre.».
  **Hecho:** verde; rojo si el doble trae `tarifaFaltante: false` o fecha nula en el caso positivo.
  Sin cambios en `components/` ni en `app/`; si hiciera falta uno, PARA y avisa.

## T5 — E2E (frontend_dev) · depende de T2

- [ ] **T5.1** En `e2e/cierres-rediseno.spec.ts`, describe de SLT-104 (escenario B6): un test nuevo,
  o pasos al final del existente, que en el detalle de bodega abre «Gestiones (1)», despliega la
  entrega y lee con literales «de eso, IVA» ₡403, la tarjeta del flete con «+ IVA 13 %» en «Ver cómo
  se calculó», «Por tarifa» ₡2.200 y «Se le paga» ₡2.200, sin línea de ajuste. Sin tocar los
  literales de SLT-104. **Hecho:** verde en local con base desechable y `NEXT_PUBLIC_APP_URL` como
  en `gate.yml`; rojo con `pagoPorTarifa` anulado a mano en el mapper (mutación temporal, revertida
  y anotada en `progress/impl_SLT-110.md`).

## T6 — Cierre (implementer)

- [ ] **T6.1** `./init.sh` verde; E2E de `e2e/cierres-rediseno.spec.ts` y grupo `dinero`
  (`pnpm exec playwright test --project=dinero`) verdes en local. **Hecho:** salida con
  `INIT_EXIT` anotada en `progress/impl_SLT-110.md`.
- [ ] **T6.2** Anotar en `progress/features/SLT-110.md` la herencia para SLT-107 (`design.md > Lo que
  hereda SLT-107`). **Hecho:** línea escrita.
- [ ] **T6.3** Mapa `R → test` en `progress/impl_SLT-110.md`, igual a `## Trazabilidad`. **Hecho:**
  todos los R con un test que existe y está verde.

## Trazabilidad

| R | Test |
|---|---|
| R64 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A: `conceptosTarifa`; C: `[]`) · `e2e/cierres-rediseno.spec.ts` (B6, tarjeta del flete) |
| R65 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A: `ivaIncluido`, `fulfillmentConIva`, `ivaPctFulfillment`, fecha; C: `ivaIncluido`) · `tests/components/CierresBodegaAdminCifrasFila.test.tsx` (nota) · `e2e/cierres-rediseno.spec.ts` («de eso, IVA») |
| R66 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A: `pagoPorTarifa` + ajuste; B: `tarifaFaltante`) · `e2e/cierres-rediseno.spec.ts` («Por tarifa», «Se le paga») |
| R210 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A cargo, B reverso, D no entra) · `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` (T2.2) |
| R211 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A false, B true, C false) |
| R212 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (igualdad con `findCierreByIdEnAlcance`) |
| R213 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (sin escrituras) · tests de bodega existentes sin cambiar aserciones (`tests/unit/services/cierres-bodega-admin-service.test.ts`, `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`) |
| R214 | `tests/components/CierresBodegaAdminCifrasFila.test.tsx` |
| R215 | `tests/unit/services/cierres-bodega-admin-service.test.ts` («R2: rol sin acceso total … forbidden», existente) |
| R216 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (una consulta) · `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` (T2.2) |

## Tamaño

~10 archivos, ~600 líneas (casi todo tests). Por debajo del 80 % de `gate.tamano_pr` (40).

## Archivos esperados

- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts`
- `tests/unit/repositories/cierres-bodega-admin-repository.test.ts`
- `tests/unit/repositories/cierre-pagos-lectura.test.ts`
- `tests/unit/repositories/cierre-bodega-repository.test.ts`
- `tests/components/CierresBodegaAdminCifrasFila.test.tsx`
- `e2e/cierres-rediseno.spec.ts`
- `progress/impl_SLT-110.md`
- `progress/features/SLT-110.md`
