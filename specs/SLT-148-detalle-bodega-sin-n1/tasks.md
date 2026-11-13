# SLT-148 «Detalle del cierre de bodega sin N+1» — tasks

> Todo backend (`backend_dev`). Antes del primer gate: copiar `.env` al worktree y exportar la base
> desechable antes de cualquier `vitest` (los tests de integración tocan la base). Sin `.env` el
> gate sale verde saltando la integración: no vale.

## T0 — Medir hoy (código sin tocar)

- [x] **T0.1** Con el corpus de T1 ya sembrado, medir con `crearPrismaDeTestConEspia` las sentencias
  que emite `findCierreBodegaConDetalle` **con el código de hoy** para: B1 (N = 1), BX (N = 3), B0
  (N = 0) y un id fuera de alcance para S.
  **Hecho:** los cuatro números y el SHA medido, en `progress/impl_SLT-148.md > T0`. Se espera
  `BX > B1` (el N+1); si no lo es, PARA y avisa al leader: la deuda no se reproduce.
- [x] **T0.2** Fijar la línea base de R421 = sentencias de B1 medidas en T0.1, como constante
  `CONSULTAS_DETALLE_UNO_LINEA_BASE` en el test, con comentario que cite T0.1.
  **Hecho:** constante escrita; su valor coincide con `impl_SLT-148.md > T0`.

## T1 — Corpus y paridad contra el código de hoy (depende de T0 en el mismo archivo; va antes de T2)

- [x] **T1.1** Crear `tests/integration/db/cierre-bodega-detalle-lote-sql-real.test.ts` con el corpus
  de `design.md > Verificación` (BX, B1, BZ, B0, BF; zonas C y N; S = satélite de C), sembrado entero
  en `enTransaccionRevertida` + `serializarEscriturasReales`. Sin base, `describe.skip` visible; con
  base y sin catálogos, falla ruidosamente (patrón de `cierres-bodega-cifras-lote-sql-real.test.ts`).
- [x] **T1.2** R422/R423/R424: la respuesta entera de BX, para la central y para S, con `toEqual`
  contra un objeto escrito **a mano**: cabecera, los tres resúmenes en orden `solicitadoAt desc`,
  cada gestión con todos sus campos y en orden `createdAt desc` dentro de su cierre del día. El
  cálculo a mano de cada importe va en un comentario junto al literal y en
  `progress/impl_SLT-148.md > T1`. Nunca copiado de la salida.
- [x] **T1.3** R425: id de BZ con S → `null` y **una** sentencia; id inexistente con la central →
  `null` y una sentencia.
- [x] **T1.4** R426: el detalle de BX no trae ninguna gestión ni fila congelada de BZ (aunque BZ
  comparta orden O1); y los parámetros de las sentencias sobre `gestion_orden` y `cierre_detail`
  son solo ids de cierres del día de BX (con `parametrosDe`).
- [x] **T1.5** R427: BF → rechaza con `CierreDetalleFaltanteError` cuyo mensaje/campos nombran su
  cierre del día y su orden.
- [x] **T1.6** R428: B0 → cabecera correcta y `cierresDia: []`.
- [x] **T1.7** R429: ninguna sentencia de escritura (`/^\s*(INSERT|UPDATE|DELETE)\b/i`) en ninguna
  llamada del archivo.
- [x] **T1.8** Correr el archivo **contra el código de hoy**.
  **Hecho:** T1.2-T1.7 verdes antes de tocar producción (esa es la prueba de que los literales
  describen la respuesta de hoy). Commit solo de tests. Si algún literal sale rojo, se revisa el
  cálculo a mano, no se copia la salida.

## T2 — El método en lote (depende de T1.8)

- [x] **T2.1** `lib/repositories/CierresBodegaAdminRepository.ts > findCierreBodegaConDetalle`:
  pasos 3-5 de `design.md > El método, en lote` (corte con N = 0; tres lecturas en paralelo con
  `cierreId: { in: idsDia }`; agrupado por `cierreId`; fila congelada por `${cierreId}:${ordenId}`;
  mismo error en el mismo orden). Actualizar el comentario del método y el de
  `findGestionesDeCierresBodegaCompleto` que cita «su bucle por `cierre_dia`».
  **Hecho:** typecheck y lint verdes; la firma y la interfaz no cambian (`git diff` no toca
  `lib/interfaces/`).
- [x] **T2.2** Añadir a `cierre-bodega-detalle-lote-sql-real.test.ts` los casos de consultas:
  R420 — sentencias(BX, N = 3) **===** sentencias(B1, N = 1); R421 — sentencias(B1) ≤
  `CONSULTAS_DETALLE_UNO_LINEA_BASE`.
  **Hecho:** T1.x y T2.2 verdes con el código nuevo; los números nuevos, en `impl_SLT-148.md > T2`.

## T3 — Dobles de Prisma de las pruebas de unidad (depende de T2.1) [P con T4]

- [x] **T3.1** `tests/unit/repositories/cierres-bodega-admin-repository.test.ts`: las fábricas
  `gestionDbRow` y `detalleDbRow` ganan `cierreId`; el caso «R11: por cada cierre_dia…» pasa a
  afirmar **una** llamada a `gestionOrden.findMany` y **una** a `cierreDetail.findMany`, con `where`
  exacto `{ cierreId: { in: ["cd1", "cd2"] } }`, y que cada gestión cae en su cierre del día; los
  `mockResolvedValueOnce` por cierre se sustituyen por una sola respuesta con las filas de los dos.
  El caso de SLT-110 (cargos) igual. Los casos R19 y SLT-107 R280/R281 no cambian.
- [x] **T3.2** `tests/unit/repositories/cierre-pagos-lectura.test.ts`: `filaAdmin()` y
  `filaSnapshot()` del doble del detalle de bodega ganan `cierreId: "cd1"`; la aserción
  `select toBe(GESTION_ADMIN_SELECT)` pasa a `toEqual({ ...GESTION_ADMIN_SELECT, cierreId: true })`
  (sigue prohibiendo una proyección propia: cualquier campo de más o de menos la pone roja).
  **Hecho T3:** `pnpm exec vitest related --run lib/repositories/CierresBodegaAdminRepository.ts`
  verde.

## T4 — Regresión de los consumidores (depende de T2.1) [P con T3]

- [ ] **T4.1** Correr sin tocar sus aserciones: `cierres-bodega-cifras-lote-sql-real.test.ts`,
  `cierre-bodega-desglose-por-tienda-sql-real.test.ts`, `cierre-bodega-cifras-fila-sql-real.test.ts`,
  `cierre-reparto-porcentajes-sql-real.test.ts`, `ajuste-pago-mensajero-lectura.int.test.ts`,
  `486-evidencias-cierres-sql-real.test.ts`, `slt76-desmarcable.int.test.ts` y
  `tests/unit/services/cierres-bodega-admin-service.test.ts`.
  **Hecho:** todos verdes, con base (no `skip`); si alguno necesita tocar una aserción, PARA: es un
  cambio de forma (E1).

## T5 — Mutaciones (depende de T2-T4). Obligatorias

Cada mutación se aplica a mano sobre `CierresBodegaAdminRepository.ts`, se corre el archivo de
integración **con base** (comprobar que no se saltó: el informe lista los `it` ejecutados) y se
revierte. **Hecho:** tabla «mutación → test que se puso rojo» en `progress/impl_SLT-148.md > T5`;
ninguna sobrevive. Un «todo rojo» o «todo verde» sin la lista de tests ejecutados no vale.

| # | Mutación | Debe ponerse rojo |
|---|---|---|
| M1 | Volver a una lectura de gestiones y de filas congeladas por cierre del día (el bucle de hoy) | R420 (contador N = 3 ≠ N = 1) |
| M2 | Buscar la fila congelada solo por `ordenId` | R424 / R422 (O1 toma la `direccion` del otro cierre del día) |
| M3 | Quitar el `cierreId: { in }` de la lectura de gestiones (leerlas por `cierre: { cierreBodegaId }` sin más o sin `where`) | R426 / R422 |
| M4 | Ordenar las gestiones `createdAt asc`, o no agruparlas por cierre del día | R423 |
| M5 | Saltar la gestión sin fila congelada en vez de lanzar | R427 |
| M6 | Quitar el corte con N = 0 y leer igualmente | R428 (o R421 si el conteo lo ve) — si sobrevive, el caso de B0 debe afirmar también el número de sentencias |
| M7 | Mover el filtro de zona del `where` de la cabecera a un filtro en memoria | R425 (más de una sentencia) |
| M8 | Pasar `cargoFulfillmentAt: null` a todas las gestiones | R422 |
| M9 | Dejar `cierreId` en el DTO de la gestión | R422 (`toEqual` entero) |

## T6 — Cierre

- [x] **T6.1** `progress/impl_SLT-148.md`: mapa `R420…R429 → test` (nombre del `it`), T0, T2 y T5.
- [ ] **T6.2** `progress/deudas.md`: D67 como resuelta por SLT-148 «Detalle del cierre de bodega sin
  N+1» con los números de T0 y T2 (si la entrada D67 no existe, se crea ya resuelta con origen
  `feature_list.json`; ver `requirements.md > Preguntas abiertas`).
- [ ] **T6.3** `./init.sh` verde con `.env` y la base desechable. E2E: el diff no toca `db/`, ni
  pantallas, ni escribe dinero; sí lee dinero, así que corre en local el grupo `dinero`
  (`pnpm exec playwright test --project=dinero`) y los E2E que abren el detalle de un cierre de bodega
  (`grep -rl` en `e2e/` por «cierre de bodega»/`cierres-bodega`).
  **Hecho:** los tres verdes y anotados en `impl_SLT-148.md`.

## Archivos esperados

Producción:

- `lib/repositories/CierresBodegaAdminRepository.ts`

Tests (los dos de unidad son **dobles de Prisma** del repositorio de bodega; ninguno es doble de
`ICierresAdminRepository` ni de `ICierresBodegaAdminRepository`):

- `tests/integration/db/cierre-bodega-detalle-lote-sql-real.test.ts` (nuevo)
- `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` (doble de Prisma)
- `tests/unit/repositories/cierre-pagos-lectura.test.ts` (doble de Prisma)

Documentación:

- `progress/impl_SLT-148.md`
- `progress/deudas.md`
- `specs/SLT-148-detalle-bodega-sin-n1/requirements.md`
- `specs/SLT-148-detalle-bodega-sin-n1/design.md`
- `specs/SLT-148-detalle-bodega-sin-n1/tasks.md`

## Tamaño

| Tipo | Archivos | Detalle |
|---|---|---|
| Producción | 1 | `CierresBodegaAdminRepository.ts` (un método, ~40 líneas cambiadas) |
| Tests | 3 | 1 de integración nuevo (corpus + ~9 casos); 2 de unidad con dobles de Prisma ajustados |
| Docs | 5 | 3 del spec + `impl_SLT-148.md` + `deudas.md` |
| **Total** | **9** | Muy por debajo del 80 % de `gate.tamano_pr` (40). |
