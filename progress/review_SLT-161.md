# Review SLT-161 «Descargas de la satélite sin el dinero de la empresa»

> Reviewer, 2026-11-15. Worktree `.worktrees/SLT-161-descargas-satelite-sin-dinero`, rama
> `feature/SLT-161-descargas-satelite-sin-dinero`, HEAD `ddd84a89`, diff contra `origin/dev`: 29
> archivos (+1721/-174). Ruta completa. El grafo no indexa este worktree: revisión con Grep/Read.

## Checklist

- [x] **Ruta:** completa (toca dinero de presentación, complejidad medium). Respeta el suelo.
- [x] **Spec:** `requirements.md` (R480-R489 EARS), `design.md` con `## Lo que ya existe` no vacía y
      cuatro alternativas descartadas, `tasks.md`. Decisión de Carlos (la «Indemnización» se queda)
      registrada en `requirements.md:149-150` y respetada: R482/R483 la conservan, la fundida de la
      satélite la lleva (`cierres-gestiones-fundida-descarga-columnas.test.ts`, lista de 26).
- [x] **Lo que ya existe:** el diff reusa `anularEmpresaSiNoCentral` / `ClasificacionDinero` /
      `esAccesoTotal` y el patrón `columnas…Para(audiencia)`; `ocultarDineroEmpresaDescargaSiNoCentral`
      es la gemela prevista en el design, no una re-creación. No hace falta `anular-empresa.ts` (no hay
      ciclo: `cifras-bodega-descarga.ts` importa solo el tipo).
- [ ] **Tasks:** ninguna de `tasks.md` está marcada `[x]` (T1.1-T4.4), aunque T1-T4.3 están hechas y
      verificadas aquí. Ver menor 1.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → 24/40 archivos, 300/1000 líneas de producción,
      868/3000 de tests. Bajo el tope (la estimación de 22-23 contaba sin los 4 tests de componentes;
      los 29 del `--stat` incluyen 5 docs de spec/progress que el script no cuenta).
- [x] **Trazabilidad:** R480-R489 → test concreto que existe y prueba lo que dice (tabla abajo); mapa en
      `progress/impl_SLT-161.md` (dos tablas, T1-T2 y T3).
- [x] **Typecheck:** `pnpm run typecheck` → exit 0.
- [x] **Lint** de los 24 `.ts/.tsx` del diff: 0 errores, 1 aviso preexistente
      (`DescargarGestionesModeloNuevo.test.tsx:166`, `_recorte`).
- [x] **Tests** (base desechable `servi_slt161_desechable`, `NODE_OPTIONS=--max-old-space-size=8192`):
      `tests/unit/descarga`, `tests/components/descarga`, los 3 de `tests/unit/services` y los 2
      `*-sql-real.test.ts` → 82 archivos, 805 tests, 805 passed, **0 skipped** (la integración corrió).
- [x] **Guardias:** `pnpm run test:guardias` → 351/352 archivos; el único rojo es
      `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (marcadores de `init.sh`),
      que está en `tests/baseline-rojos.json` y el diff no toca `init.sh`. No es hallazgo.
      `columnas-sensibles.guardia` y `ambito-columnas.guardia` verdes sin tocarlas.
- [x] Sin migración, sin tablas, sin queries nuevas; el alcance (`WHERE`) no cambia: se recorta qué
      campos salen, no qué filas.
- [x] Sin dependencias nuevas; sin literales de país/moneda en código nuevo; sin Ordenex, secretos ni
      `console.log`.
- [x] **Autorización en el servidor:** el corte vive en los servicios con el actor de la sesión, criterio
      único `!esAccesoTotal` (R488): F3 `CierreBodegaService.ts:556-558`, F4
      `CierresAdminService.ts:944-955`, F5 `CierresAdminService.ts:1024`. El cliente no decide nada.
- [x] Capas: lógica en `lib/services/`, proyección en módulos puros de `_components/`; ningún `.tsx`
      de producción cambia.
- [~] **E2E del flujo crítico** (`cierre-bodega-satelite`, `cierres-admin*`, grupo `dinero`): sin
      correr; es T4.4, lo corre el leader antes del PR. Ver «Condición para el PR».
- [ ] `gate-completo` en CI y `./init.sh` final: pendientes del PR (la bitácora anota `INIT_EXIT=0`
      en las dos tandas).

## Trazabilidad verificada

| R | Test | Comprobado |
|---|---|---|
| R480 | `cierres-bodega-cifras-lote-sql-real.test.ts` «R480: «Solicitados» de S: BN…»; `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` «R480: la satélite recibe…» | `toEqual` literal: gestiones 3/1 y 1/0, cinco EMP `null`, sin clave `pagoEntregado`. El cálculo de R387 sigue afirmado con literales sobre `cifrasBodegaDescarga` y, en integración, por la central (`:536`, `cifrasBN` + «Pago entregado» 3000.00). |
| R481 | `cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` «R481…»; `cierres-resumen-modelo-nuevo-descarga-service.test.ts` «R481…» | Resueltos **y** Pendientes, objeto literal entero (7 EMP `null`, gestiones 2). |
| R482 | sql-real «R482: las gestiones de S1…»; `cierres-admin-fulfillment-solo-central.test.ts` «R482: la descarga de gestiones anula…» | Bloque `null`, `montoCobrar` y `tarifaModelo` literales del bloque, central con el bloque entero (total 5650.00 calculado a mano). Ver menor 2. |
| R483 | `cierres-gestiones-fundida-descarga-columnas.test.ts` «R483: la satélite, 26 columnas…» + 10 casos de monto/pago/ingreso | Lista literal de 26 encabezados (contados: 26) con «Indemnización»; casos del nuevo con `ingresoEmpresa: null` y modelo aparte. |
| R484 | `cierres-gestiones-modelo-nuevo-descarga.test.ts` «R484: la satélite, 21 columnas en su orden» | Lista literal de 21; `toHaveLength(21)`. |
| R485 | `cierres-resumen-modelo-nuevo-descarga.test.ts` «R485… 14»; `cierres-bodega-modelo-nuevo-descarga.test.ts` «R485… 21» | Listas literales. |
| R486 | los dos anteriores «R486…» + componentes (`hojasAdicionales` sin «Por tienda») | Solo nuevo y mixto. |
| R487 | «R487: la central, como antes» en los 4 de `tests/unit/descarga/` (31/35/19/26 literales + «Por tienda» con filas); servidor: «R487: %s recibe… tal cual» (maestro, admin) y los casos R380/R387/R388 de los sql-real sin cambio | La central recibe el mismo objeto; `FILA_N1_CENTRAL` y `ENCABEZADOS_CENTRAL` (literales previos) siguen verdes. El escritor no depende del orden de claves de la fila (sin `Object.keys` sobre `DescargaFila`). |
| R488 | `cierres-admin-fulfillment-solo-central.test.ts` «R488… (%s)» con adminTienda, mensajero, adminSatelite + clasificación a mano; `satisfies ClasificacionDinero<…>` | Typecheck verde; mutación M7 de la bitácora lo pone rojo. |
| R489 | `Object.keys(...).sort()` literal + señuelos 731957.4x / 846213.5x / 583914.6x en los tres módulos; fundida: 4 celdas `null` en los 5 resultados | Los negativos usan señuelos imposibles de encontrar por casualidad (no `not.toContain("7")`). |

Recuentos: todos literales escritos a mano, ninguno comparado contra la función que los genera. El
cambio de `CierresDescargaNiveles.test.tsx` mejora lo anterior (de `length - 1` a `26`).

## Corte en el servidor: lecturas revisadas

Todas las lecturas `*Completo` que puede pedir la satélite en `/cierres-admin`:

- F3 `listarCierresBodegaSolicitadosCompleto`: cortada. F4 `listarHistorico/PendientesCierresAdminCompleto`
  (por `completoConCifras`): cortadas las dos. F5 `listarGestionesCierresAdminCompleto`: bloque entero.
- `listarConsolidablesCompleto` (`CierreBodegaService.ts:584`): solo `CierreConsolidableCola` (totales
  recaudados, pago al mensajero, ingreso de bodega, «para la central»): SAT, sin cambio (spec).
- `items` de F3/F4 (`CierreBodegaResumen`, `CierreAdminResumen`): solo SAT.
- `rechazosDeTienda` de F5: sin importes (`RechazoTiendaDescargaDTO`).
- `CierresBodegaAdminService.*Completo`: `forbidden` sin acceso total (`:336`, `:380`, `:419`).
- F1/F2/modal: SLT-154 «Vista de la bodega satélite: solo lo suyo», sin regresión (sus tests de
  R463/R464 siguen verdes en el mismo archivo).

No encontré ninguna lectura de descarga de la satélite que se saltara el corte.

## Tests existentes reescritos

- R386/R387 (`cierre-bodega-solicitados…service.test.ts`): R387 conserva sus literales, ahora sobre
  `cifrasBodegaDescarga` (la función que también alimenta a la central); R386 sigue en el caso R480.
  No se debilitó.
- 481, SLT-52 R46, SLT-101 R94 (`cierres-admin-fulfillment-solo-central.test.ts`): de «bloque con el
  fulfillment anulado» a «bloque `null`», más `not.toContain` de los valores que el fixture sí tenía
  (1500.00, 450.00, 58.50, 508.50, la fecha del cargo). Es más estricto que antes.
- Los 4 de `tests/components/descarga/`: los fixtures de central y satélite pasan a ser literales
  separados (antes la central derivaba de la satélite), y el de bodega mete cifras pobladas en la
  respuesta para comprobar que el libro de la satélite no las cuela. No se debilitó.

## Hallazgos

Ningún BLOQUEANTE.

1. **menor** — `specs/SLT-161-descargas-satelite-sin-dinero/tasks.md:10-66`: ninguna task está marcada
   `[x]`. T1.1-T4.3 están hechas (lo verifiqué arriba); T4.4 es del leader. Hay que marcarlas antes de
   cerrar (`CHECKPOINTS.md > Especificacion`). Lo dejo como menor, como en los precedentes SLT-152
   «Tablas de cierres legibles» y SLT-153 «Cabecera del detalle del cierre con rótulos y folio
   buscable», porque el contenido está hecho y verificado.
2. **menor** — R482 «lo demás llega sin cambio» no tiene un test que pueda fallar justo donde Carlos
   decidió. En `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts:321-322` y en
   `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts:569,583` la
   indemnización llega `null` y el pago al mensajero `"0.00"` (los fixtures `:148`, `:183`). Una
   mutación que anulara `indemnizacion` o `pagoMensajero` en `ocultarDineroEmpresaDescargaSiNoCentral`
   seguiría en verde. Tampoco se afirma `ingresoBodegaRechazo`, que `tasks.md:38` pedía. Hoy el código
   está bien (usa spread), pero falta la protección contra una regresión. Arreglo: un caso de la
   satélite con indemnización, pago e ingreso de bodega distintos de cero, con valores escritos a mano.
3. **menor** — `lib/services/CierresAdminService.ts:145`: `ocultarFulfillmentSiNoCentral` se queda
   exportada y sin uso, ni en producción ni en tests. La bitácora (`progress/impl_SLT-161.md:20`) dice
   que «la usan tests», pero no es así. O se borra o se anota como deuda.
4. **menor** — `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts:1106`: el R487
   de la fundida afirma el recuento (31) y dos tramos (`slice(24, 28)` y el índice 15), no la lista
   entera. El orden completo de la central lo cubren los tests previos del archivo, así que no hay
   hueco real. Solo lo anoto.

## Condición para el PR (no es hallazgo de esta vuelta)

`docs/perfil-agentes.md > reviewer` y `docs/checkpoints-proyecto.md > Flujos críticos`: el diff toca
la descarga de los cierres de la satélite. Antes de abrir el PR tienen que constar en
`progress/impl_SLT-161.md`, en verde y en local, sobre una base desechable nueva,
`e2e/cierre-bodega-satelite.spec.ts` y `pnpm exec playwright test --project=dinero` (T4.4, lo corre el
leader). Después, la aprobación de Carlos en Preview con el usuario demo de la satélite (D5).

## Veredicto

**OK**, con dos condiciones: marcar las tasks y correr los E2E de T4.4 antes del PR.
