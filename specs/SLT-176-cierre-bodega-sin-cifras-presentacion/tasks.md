# SLT-176 «Sacar de CierreBodegaService las lecturas de cifras de presentación del cierre» — tasks

Requisitos R690-R705 (`requirements.md`). Diseño en `design.md`. Zona backend: todo lo hace
`backend_dev` (`lib/` y `tests/`). `[P]` = paralelizable con la task hermana marcada igual.

**Antes del primer gate:** copiar `.env` al worktree y exportar la base desechable antes de cualquier
`vitest` (los tests de integración tocan la base). Sin `db/` en el diff.

## T1 · El servicio de solo lectura

- [x] Crear `lib/interfaces/services/ICierresBodegaSateliteDescargaService.ts` con la firma de
  `design.md > Contrato` (tipos importados con `import type` de `ICierreBodegaService.ts`).
- [x] Crear `lib/services/CierresBodegaSateliteDescargaService.ts`: constructor con los cuatro puertos de
  lectura (`Pick`) y el método `listarCierresBodegaSolicitadosCompleto` copiado de
  `CierreBodegaService.ts:484-560`, con su comentario. Solo cambia la etiqueta de la operación.

**Hecho:** `pnpm run typecheck` verde; el archivo no importa por valor de `@/lib/repositories/`,
`@/lib/db/` ni `@prisma/client`. (R696, R697)

## T2 · Retirar la lectura de CierreBodegaService (depende de T1)

- [x] `lib/services/CierreBodegaService.ts`: fuera el método (`:484-560`), el parámetro `cifrasLote`
  (`:251-256`), los imports `:32`, `:33-38`, `:39-40` y el tipo de resultado de `:17`.
- [x] `lib/interfaces/services/ICierreBodegaService.ts`: fuera la firma `:415-428`; los tipos se quedan.

**Hecho:** `grep -n "cifras-bodega-descarga\|CierresAdminService\|cifrasLote" lib/services/CierreBodegaService.ts`
vacío. (R699)

## T3 · La acción usa el servicio nuevo (depende de T1, T2)

- [x] `lib/actions/cierre-bodega.ts`: `buildCierreBodegaService` sin `undefined` ni
  `CifrasBodegaLoteRepository`; `buildCierresBodegaSateliteDescargaService()` nuevo;
  `CierreBodegaDeps.cierresBodegaSateliteDescargaService?`; la acción `listarCierresBodegaSolicitadosCompleto`
  lo usa. Nombre, schema y `withErrorHandler` intactos.

**Hecho:** typecheck verde; `lib/actions/_shared/registro-descargas.ts` y la pantalla sin cambios. (R698, R695)

## T4 [P] · Tests unitarios apuntados al servicio nuevo (depende de T3)

Solo cambia cómo se construye el servicio o el doble. **Ningún valor esperado cambia** (R705).

- [x] `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts`: `montar` construye
  `CierresBodegaSateliteDescargaService(repo, ordenRepo, { zonaHoraria }, lote?)`.
- [x] `tests/unit/services/consolidacion-completo.test.ts`: una segunda fábrica para el conjunto «seis»;
  el conjunto «siete» y las comparaciones con la página siguen en `CierreBodegaService`.
- [x] `tests/unit/services/cierres-filtro-folio.test.ts`: el camino «satélite · solicitados (archivo)»
  llama al servicio nuevo con el mismo doble.
- [x] `tests/unit/actions/cierre-bodega-descarga-action.test.ts`: el doble del borde «seis» va en
  `cierresBodegaSateliteDescargaService`.
- [x] `tests/unit/actions/cierre-bodega-cifras-cableado.test.ts`: la acción de la satélite construye
  `CierresBodegaSateliteDescargaService` con 4 argumentos, el cuarto es la lectura en lote real, y
  `CierreBodegaService` NO se construye (`argsSatelite` vacío).

**Hecho:** `pnpm exec vitest related --run` de los cinco en verde. `git diff` de estos archivos sin
cambios en literales esperados. (R690-R695, R698, R705)

## T5 [P] · Tests de integración apuntados al servicio nuevo (depende de T3)

- [x] `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts:495-501`: `svcSatelite` es el
  servicio nuevo con `lote`.
- [x] `tests/integration/db/deudas-d39-d40-modelo-nuevo.test.ts:463-481`: `servicioZona` devuelve las dos
  construcciones; `completo` sale del servicio nuevo, el paginado y `listarConsolidacion` de
  `CierreBodegaService` (sin `cifrasLote`).

**Hecho:** los dos en verde contra la base desechable, **ejecutados, no saltados** (la línea del log lo
muestra). Sin cambios en literales esperados. (R690, R691, R705)

## T6 · Guardia R631 sin excepciones (depende de T2)

En `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`, según `design.md > La guardia R631`:

- [x] `EXCEPCIONES = []`, `TOPE_EXCEPCIONES = 0`; el test «solo encoge» afirma `toBe(0)` con el literal;
  comentario de `:315-320` al día. (R700)
- [x] Caminos del árbol real `toEqual([])`; barrido no vacuo intacto. (R700, R702)
- [x] Sustituir «quitar una excepción da rojo» por la contraprueba con el árbol real y
  `CierreBodegaService.ts` con un import añadido, en sus tres casos. (R701)
- [x] Bloque «SLT-176 R696-R699»: servicio nuevo no es de dinero; sus imports de valor no van a
  repositorios, `db`, Prisma ni servicios de dinero, con contraprueba en memoria; el prototipo de
  `CierreBodegaService` no tiene el método. (R696, R697, R699)

**Hecho:** `pnpm run test:guardias` verde. Mutación a mano: añadir de verdad
`import { cifrasBodegaDescarga } from "@/lib/services/cifras-bodega-descarga";` a `CierreBodegaService.ts`
→ la guardia da rojo con la cadena; se revierte. Anotar la salida en `progress/impl_SLT-176.md`.

## T7 · Mutaciones, gate, E2E y trazabilidad (depende de T4, T5, T6)

- [x] Mutaciones en el servicio nuevo, cada una con su test en rojo (y revertida):
  - quitar `anularEmpresaSiNoCentral` → rojo «R480: la satélite recibe las cifras de la empresa en null» (R692);
  - pasar `{ lectura: "zona", zonaId: "otra" }` → rojo R389 (R691);
  - quitar la comprobación de rol → rojo el `forbidden` de `consolidacion-completo` (R693).
- [x] `git diff --name-only origin/dev` no lista nada de `db/` ni `CierresAdminService.ts` /
  `ICierresAdminService.ts`. (R703, R704)
- [ ] `./init.sh` verde (con `.env`; mirar que la integración no se salta).
- [ ] E2E en local con base desechable y build: `e2e/cierres-rediseno.spec.ts`,
  `e2e/cierre-bodega-satelite.spec.ts` y `--project=dinero`.
- [x] Mapa `R → test` en `progress/impl_SLT-176.md` (abajo, el previsto).

**Hecho:** todo lo anterior en verde y anotado.

## Trazabilidad prevista

| R | Test |
|---|---|
| R690 | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` (R384, R387), `consolidacion-completo.test.ts` (conjunto «seis», tope), `cierres-bodega-cifras-lote-sql-real.test.ts`, `deudas-d39-d40-modelo-nuevo.test.ts` |
| R691 | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` «R389» |
| R692 | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` «R480» |
| R693 | `consolidacion-completo.test.ts` (forbidden, sin zona), `cierres-filtro-folio.test.ts` (folio imposible) |
| R694 | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` «sin la lectura en lote … lanza» |
| R695 | `cierre-bodega-descarga-action.test.ts` |
| R696 | `pago-tienda-no-mueve-dinero.guardia.test.ts` bloque SLT-176 (no es de dinero; puertos `Pick` por typecheck) |
| R697 | `pago-tienda-no-mueve-dinero.guardia.test.ts` bloque SLT-176 (imports + contraprueba) |
| R698 | `cierre-bodega-cifras-cableado.test.ts` |
| R699 | `pago-tienda-no-mueve-dinero.guardia.test.ts` bloque SLT-176 (prototipo); `consolidacion-completo.test.ts`, `cierres-filtro-folio.test.ts`, `cierre-bodega-service.test.ts` sin cambios |
| R700 | `pago-tienda-no-mueve-dinero.guardia.test.ts` «solo encoge» y caminos del árbol real |
| R701 | `pago-tienda-no-mueve-dinero.guardia.test.ts` contraprueba sobre el árbol real |
| R702 | `pago-tienda-no-mueve-dinero.guardia.test.ts` «el barrido no es vacuo» |
| R703, R704 | T7: `git diff --name-only` (lo revisa el reviewer) |
| R705 | T4/T5: `git diff` de los tests sin literales esperados cambiados (lo revisa el reviewer) |

## Archivos esperados

Producción:
- `lib/services/CierresBodegaSateliteDescargaService.ts` (nuevo)
- `lib/interfaces/services/ICierresBodegaSateliteDescargaService.ts` (nuevo)
- `lib/services/CierreBodegaService.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/actions/cierre-bodega.ts`

Tests:
- `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`
- `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts`
- `tests/unit/services/consolidacion-completo.test.ts`
- `tests/unit/services/cierres-filtro-folio.test.ts`
- `tests/unit/actions/cierre-bodega-descarga-action.test.ts`
- `tests/unit/actions/cierre-bodega-cifras-cableado.test.ts`
- `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts`
- `tests/integration/db/deudas-d39-d40-modelo-nuevo.test.ts`

Spec y estado:
- `specs/SLT-176-cierre-bodega-sin-cifras-presentacion/requirements.md`
- `specs/SLT-176-cierre-bodega-sin-cifras-presentacion/design.md`
- `specs/SLT-176-cierre-bodega-sin-cifras-presentacion/tasks.md`
- `progress/features/SLT-176.md`
- `progress/impl_SLT-176.md`
- `progress/review_SLT-176.md`

**No se tocan** (equipo): `lib/services/CierresAdminService.ts`, `lib/interfaces/services/ICierresAdminService.ts`
— 0 líneas; son de SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación».

## Tamaño

Tope por defecto (`gate.tamano_pr`): 40 archivos, 1000 líneas de producción, 3000 de tests.

| | Archivos | Líneas (+/−, estimadas) |
|---|---|---|
| Producción | 5 | ~+150 / ~−110 (el método se mueve con su comentario; el resto es cableado) |
| Tests | 8 | ~+200 / ~−80 (casi todo en la guardia; los demás, construcción del servicio) |
| Spec y progress | 6 | — |
| **Total** | **19** (48% de 40; por debajo del 80%) | producción ~260, tests ~280 |
