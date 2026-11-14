# impl SLT-154 «Vista de la bodega satélite: solo lo suyo» — tanda 1, servidor (T0, T1, T2)

Rebanada 1 (R460-R478). Esta tanda: el corte en el servidor de los dos detalles (R460-R465), «La
central debe» (R466) y lo que va a la central del cierre del mensajero (R467). Sin migración ni
cambio de esquema. La vista (T3), los tests existentes que cambian (T4) y el E2E (T5) son de la
tanda 2. El grafo de código no indexa este worktree: todo con Grep/Read.

## T0 — Inventario

### T0.1 Tests que esperan, con un lector sin acceso total, cifras de la empresa en los dos detalles

El cruce de `grep` de la tarea da 50 archivos (casi todos por coincidencia de palabras: descargas,
analítica, E2E de la central). La lista que vale es la MEDIDA tras T2 (typecheck + `vitest related`),
abajo en `## Rojos fuera de alcance (T3/T4)`. No se tocó ninguna expectativa salvo las de
`cierres-admin-fulfillment-solo-central.test.ts`, que T2.6 pide.

### T0.2 Corpus del E2E `e2e/cierre-bodega-satelite.spec.ts`

Recalculado a mano desde la cabecera y la fábrica (`tests/fabricas/escenarios/reparto.ts`,
`TARIFA_POR_DEFECTO`: flete 2 500, devuelto 1 250, comisión 0, IVA 0): recaudado 9 000; pago 1 500;
gana la bodega 500; debe llegar 9 000 − 1 500 − 500 = 7 000; facturado 2 500 + 1 250 = 3 750; le
queda 3 750 − 0 − 1 500 − 500 = 1 750. **No medido en una base de corrida**: la siembra del E2E solo
existe corriendo Playwright, prohibido en esta tanda. Queda para T5, con su corrida.

## T1 — Integración contra Postgres real

`tests/integration/db/satelite-detalle-sin-dinero-empresa-sql-real.test.ts`, por las Server Actions
(`verCierreBodegaDetalle`, `verCierreDetalle`) y commiteando, como
`satelite-cierre-bodega-lectura.int.test.ts`: así pasa por `getPrismaClient()` (RLS) y el composition
root real. Sin base, `describe.skip`; sin catálogos, `throw`. Ningún `if (!dato) return`: el helper
`ok()` lanza si el estado no es `ok`.

Corpus (los literales y su cuenta también están en la cabecera del archivo; ajustado en `25f16393`
para que la regla del EFECTIVO se distinga del general, ver M12):

- Tarifa vieja: flete 2 000, devuelto 1 500, IVA 13 %, sin comisión.
- BX (snapshot efectivo 1 400, SINPE 3 000, general 4 400, pago 6 500, bodega 100):
  - A (viejo): efectivo 500 + SINPE 2 500 = 3 000; pago 700; bodega 100. gA1 entregada 3 000
    (2 000 + 260 = 2 260); gA2 rechazada, bodega 100 (1 500 + 195 = 1 695).
  - B (viejo): efectivo 900; pago 800. gB1 entregada 900 (2 260).
  - N (nuevo): SINPE 500; pago 5 000. gN1 entregada, `tienda_flete_entregado` 3 500 + 13 % = 3 955.
- A: facturado 3 955, IVA 455, sin IVA 3 500 → le queda 3 500 − 700 − 100 = **2 700**; se le paga
  a la tienda 3 000 − 2 260 = **740**; gana la tienda 3 000 − 3 955 = **−955**; reparto [740, 2 260]
  / 3 000 → pisos 24 y 75, restos 0,67 y 0,33 → **[25, 75]**.
- A hacia la central: 3 000 − 700 − 100 = **2 200**; efectivo 500 < 800 → **no cubre** (el general
  3 000 sí alcanzaría); reparto [2 200, 700, 100] / 3 000 → pisos 73, 23, 3 (99), restos iguales,
  gana el primero → **[74, 23, 3]**.
- B: 900 − 800 = **100**; 900 ≥ 800 → **cubre**; reparto [100, 800, 0] / 900 → pisos 11, 88, 0,
  mayor resto el de 800 → **[11, 89, 0]**. N: 500 − 5 000 = **−4 500**, reparto `null`.
- BX: facturado 3 955 + 2 260 + 3 955 = **10 170**; IVA 1 170; sin IVA 9 000 → le queda
  9 000 − 6 500 − 100 = **2 400**; se le paga a las tiendas 4 400 − 8 475 = **−4 075**;
  debe llegar 4 400 − 6 500 − 100 = **−2 200**.
- La central debe de BX: efectivo A + B = 1 400; pagos [700, 800] → 700 se paga, 1 500 > 1 400 →
  **800.00**. Con N mal contado: [700, 800, 5 000] → 5 800.

### T1.3 Contra el código de hoy

Commit `440dbe82` (solo el test). Repetido con el corpus de `25f16393` sobre el `lib/` de
`440dbe82`: mismo resultado.

```
 × R460 · × R461 · × R462 · × R463 · × R466 · × R467
 ✓ la siembra existe · ✓ R465
 Tests  6 failed | 2 passed (8)
```

Lo esperado: rojos los que la ficha cambia, verde R465 (la central ya es así). R464 es de unidad
(T2.6): contra el código de hoy no compila (no existe `ocultarDineroEmpresaSiNoCentral`).

## T2 — Servidor

Commit `65e90193`.

### Archivos

Producción (11):
- `lib/interfaces/services/ICierresAdminService.ts` — `CierreDetalleAdminServiceResult`: las diez
  cifras de R462 pasan a `T | null`; nuevos `paraLaCentral?`, `efectivoCubreDescuentos?`,
  `porcentajesRepartoCentral?` (R467).
- `lib/interfaces/services/ICierresBodegaAdminService.ts` — las ocho del agregado a `T | null`;
  nuevo `centralDebe?` (R466).
- `lib/interfaces/services/ICierreBodegaService.ts` — `CierreBodegaDetalleCierre`: las ocho a
  `T | null` (R461). **No estaba en `tasks.md > Archivos esperados`**: el tipo vive aquí, no en
  `ICierresBodegaAdminService.ts`; solo lo usa este detalle (comprobado con grep).
- `lib/interfaces/services/ICierreDiaService.ts` — `CierreDetalleGestion.tarifaModelo?` (D1).
- `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts` — `pagoIndependienteEfectivo`.
- `lib/repositories/CierresBodegaAdminRepository.ts` — la columna en `DETALLE_CIERRE_SELECT` y en
  `toDetalleCierreRow` (también le llega a `CifrasBodegaLoteRepository`, aditivo).
- `lib/services/CierreBodegaService.ts` — `export` de `repartirEfectivo` (cuerpo sin cambio).
- `lib/services/CierresAdminService.ts` — `ocultarDineroEmpresaSiNoCentral`, `ClasificacionDinero`,
  `anularEmpresa`, `anularEmpresaSiNoCentral`, `CLASE_DETALLE_MENSAJERO`; en `verCierreDetalle` el
  corte por gestión, R467 y el recorte final.
- `lib/services/CierresBodegaAdminService.ts` — `CLASE_DETALLE_BODEGA`,
  `CLASE_CIERRE_DEL_DIA_BODEGA`; corte por gestión, por cierre del día y del agregado; `centralDebe`.
- `app/(app)/cierres-admin/_components/cierre-labels.ts` — `hayGestionEnModeloNuevo` lee
  `g.tarifaModelo ?? g.ingresoEmpresa?.tarifaModelo` (T2.5).

Tests (2): `tests/integration/db/satelite-detalle-sin-dinero-empresa-sql-real.test.ts` (nuevo) y
`tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` (T2.6: las tres expectativas
de la satélite en el DETALLE pasan a `ingresoEmpresa: null` + `tarifaModelo`, citando R463; las del
Excel no cambian; bloque nuevo R464 y clasificación).

### Desvíos del diseño (anotados, no inventados)

1. **Campos nuevos opcionales en el tipo** (`paraLaCentral?`, `efectivoCubreDescuentos?`,
   `porcentajesRepartoCentral?`, `centralDebe?`). El diseño los daba obligatorios. Medido:
   obligatorios rompían el typecheck de **17 tests de componentes más** (dobles que construyen el
   resultado entero), y eso llevaba T4 muy por encima de 32 archivos (T0.1 manda parar). Se sigue el
   precedente del propio contrato (`porcentajesReparto?`: «opcional solo para que los dobles no
   tengan que construirlo»). El servicio los emite SIEMPRE (lo prueba la integración: R466, R467).
   **Para T3:** ausentes = sin dato → falla cerrado (sin tarjeta ni cuenta), nunca «₡0».
   La clasificación exhaustiva no pierde nada: `ClasificacionDinero` usa `-?` y obliga a clasificar
   también los opcionales.
2. **Un solo predicado** `anularEmpresaSiNoCentral(r, clase, actor)` en vez de
   `esAccesoTotal(actor.rol) ? r : anularEmpresa(r, …)` repetido en tres sitios: así R464 se prueba
   en unidad sobre la función que usan los tres llamadores (las lecturas de hoy dejan pasar solo a
   la central y a la satélite, así que otro rol no llega por el servicio). M4b y M7 se aplicaron ahí.
3. **Integración por las Server Actions y commiteando** (como `satelite-cierre-bodega-lectura`),
   no en `enTransaccionRevertida`: las actions arman su cliente con RLS y no se pueden envolver en
   una transacción revertida. La siembra se borra en el `afterAll`.
4. `ClasificacionDinero` solo admite `"empresa"` en campos que aceptan `null` (tipo condicional):
   el `as T` de `anularEmpresa` queda respaldado por el tipo.

## Mapa R → test (parcial, R460-R467)

| R | Test | Mutación que lo pone rojo |
|---|---|---|
| R460 | `satelite-detalle-sin-dinero-empresa-sql-real.test.ts` > «R460: la satélite recibe el detalle de bodega sin las ocho cifras de la empresa» | M1 |
| R461 | mismo > «R461: cada cierre del día llega sin cifras de la empresa y con sus cifras propias» | M9 |
| R462 | mismo > «R462: la satélite recibe el detalle del cierre del mensajero sin las cifras de la empresa»; `cierres-admin-fulfillment-solo-central.test.ts` > «R462: las diez cifras de la empresa del detalle del cierre del mensajero» | M2, M10 |
| R463 | integración > «R463: cada gestión llega sin cobro a la tienda y con su modelo de tarifa»; unidad > «adminSatelite: el cobro a la tienda llega null entero…» (×2) | M3, M6 |
| R464 | unidad > «un rol sin acceso total que no es la satélite también recibe el recorte (adminTienda / mensajero / adminSatelite)» y «R460/R461: las ocho cifras de la empresa…» | M4a, M4b |
| R465 | integración > «R465: el maestro recibe los dos detalles con las cifras de la empresa de antes»; unidad > «maestro/admin: la fila y el detalle salen tal cual…» | M7 |
| R466 | integración > «R466: La central debe del cierre de bodega: reparte el efectivo de los cierres del modelo anterior» (S y M) | M5, M8 |
| R467 | integración > «R467: el detalle del cierre del mensajero trae lo que debe llegar a la central y su reparto» | M11, M12 |

R468-R478 (vista, fila, descarga, E2E): tanda 2.

## T2.7 — Mutaciones

Una a una con un script del scratchpad de la sesión (`mut154/mutar.py`: aplica, corre los dos
archivos, anota los `×`, `git checkout` del archivo). Tras la última, `git diff` de `lib/` limpio.
Corrida final, con el corpus de `25f16393`:

| M | Mutación | Rojo |
|---|---|---|
| M1 | `verCierreBodegaDetalle` devuelve el agregado sin recorte | R460 (1) |
| M2 | `verCierreDetalle` devuelve sin recorte | R462 (1) |
| M3 | el detalle del mensajero vuelve a `ocultarFulfillmentSiNoCentral` | R463 integración + 3 de unidad (4) |
| M4a | `ocultarDineroEmpresaSiNoCentral` con `rol !== "adminSatelite"` | R464 adminTienda y mensajero (2) |
| M4b | `anularEmpresaSiNoCentral` con `rol !== "adminSatelite"` | R464 adminTienda y mensajero (2) |
| M5 | `centralDebe` sin filtrar los cierres nuevos («5800.00») | R466 (1) |
| M6 | sin `tarifaModelo` aparte | R463 integración + unidad (6) |
| M7 | recorte también para la central | R465 + maestro/admin de unidad (3) |
| M8 | el mapper pierde `pagoIndependienteEfectivo` (siempre `false`) | R466 (1) |
| M9 | cada cierre del día sin recorte | R461 (1) |
| M10 | `netoEmpresa` clasificado `"propio"` en el detalle del mensajero | R462 integración + clasificación (2) |
| M11 | reparto central con pago y central cambiados de orden | R467 (1) |
| M12 | `efectivoCubreDescuentos` del mensajero con el general en vez del efectivo | R467 (1) |

M12 **sobrevivió** en la primera corrida: con el corpus del diseño (A efectivo 1 000 ≥ 800) el
general y el efectivo daban lo mismo en A, B y N. Se cambió el corpus (A efectivo 500, B efectivo
900) y se repitieron las trece: todas muertas. En la corrida de M4a el worker de la integración cayó
(error del pool de vitest); la mató la unidad igual.

## Verificación

- Integración nueva: **8/8 verdes**; contra el `lib/` de hoy, 6 rojos (R460-R463, R466, R467) y 2
  verdes (siembra, R465).
- `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts`: **20/20 verdes**.
- `pnpm run lint`: **0 errores** (1 aviso en `lib/interfaces/repositories/IOrdenRepository.ts`, no
  tocado).
- `pnpm run test:guardias`: 350/351 archivos; **rojo preexistente** en
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (4 tests: `init.sh` sin el
  marcador «FIN PASO 2: DEPENDENCIAS (ficha 420)»). `init.sh` y la guardia son idénticos a
  `origin/dev`: no es de esta tanda.
- `./init.sh` → **`INIT_EXIT=1`**: corta en `pnpm run typecheck`. Rojo esperado por el spec (T2.1:
  «typecheck solo con errores en los consumidores que tocan T2–T3»). Los pasos previos, verdes
  (tamaño del PR 12/40 archivos, 306/1000 líneas de producción, 661/3000 de tests).

## Rojos fuera de alcance (T3/T4), medidos

Typecheck (134 errores, todos por las cifras que pasan a `T | null`):

- Producción, **T3**: `components/private/cierres/detalle/detalle-cierre-vista.ts` (14:
  `vistaBodegaDesdeAdmin`, `vistaMensajeroDesdeAdmin`) y
  `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` (9: `abrirDetalle`).
- Tests, **T4**: `tests/unit/services/cierres-bodega-admin-service.test.ts` (65),
  `tests/unit/services/cierres-admin-service.test.ts` (27),
  `tests/fixtures/detalle-cierre-admin-anterior.tsx` (12),
  `tests/integration/db/cierre-iva-aparte-sl39.test.ts` (5),
  `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` (2). Son accesos a
  cifras ahora nulables en lecturas de la central, o la fixture del panel antiguo.

`vitest related` de lo tocado (494 archivos, base desechable): 113 archivos rojos; de ellos, **~100
por la base sin siembra** (`tabla orden vacia: corre pnpm run db:seed`, `usuario esta vacia`, zona
central ausente): fallan en el `beforeAll`, antes de tocar código de esta ficha. Los que SÍ cambian
por esta ficha (expectativa de la satélite con dinero de la empresa, o literal del repositorio sin
la columna nueva), para T4:

- `tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts` — R280/R283 y R284 (la satélite
  ya no recibe `ingresoEmpresa`; la paridad con la central cambia). Previsto en T4.1.
- `tests/unit/services/cierres-bodega-admin-service.test.ts` — R280/R283 y R284 de SLT-107. Previsto.
- `tests/integration/db/cierre-iva-aparte-sl39.test.ts` — R21–R23 leen ganancia y neto con
  `adminSatelite` (`expected null to be '1700.00'`, `'-100.00'`). **No previsto en T4.1.**
- `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` — «MB (satelite): [89, 11] igual
  para la central y para el adminSatelite» (`porcentajesReparto` de la satélite ahora `null`, R462).
  **No previsto.**
- `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` — «R387 paridad … con la
  central y con S» (la satélite recibe `null`). **No previsto.**
- `tests/integration/db/cierre-bodega-detalle-lote-sql-real.test.ts` — R420 y R422/R423 comparan la
  fila del repositorio contra un literal sin `pagoIndependienteEfectivo` (T2.3). **No previsto.**

Ajenos (base o entorno, no tocan este código): `premio-ranking-idempotencia` (siembra),
`total-a-cobrar-sin-cerrado-sql-real` («referencia a otra empresa: orden.zona_id»),
`wallet-458-migration` (catálogo de conceptos).

Recuento para T0.1: a los 5 previstos se suman 4 integraciones no previstas y
`ICierreBodegaService.ts` en producción. Estimado: 17 de producción + 13 de tests de la lista + 4 =
**~34 archivos, por encima del 80 % (32)**. Lo decide el leader: pedir el OK del tamaño o mover
algo.

## Veredicto

Servidor de la rebanada 1 hecho y probado contra Postgres real (R460-R467 verdes, 13/13 mutaciones
muertas); el gate queda rojo en typecheck por los consumidores de T3 y los tests de T4, como prevé
el spec.

---

# Tanda 2 — vista (T3), frontend_dev, 2026-11-14

## Archivos

Producción (todos en `## Archivos esperados`):

- `components/private/cierres/detalle/detalle-cierre-vista.ts` — `NivelCentral`; `DetalleBodegaVista`
  con las cifras de la empresa `| null` y `centralDebe?`; `DetalleMensajeroVista.haciaLaCentral?`;
  `cifrasDe` (S4 = `tarjetasAConsolidar`, S6 = recaudado/pago/gana bodega/debe llegar; central sin
  tarjetas de la empresa si no llegan); `cuentaCentral(nivel, rotuloPago)` + `repartoCentral`;
  `lineasDinero` decide por los datos (D4); `pestanasDe` con la rama satélite; `empresaDe` (todo o
  `null`) y `haciaLaCentralDe` en `vistaMensajeroDesdeAdmin`; `centralDebe` en `vistaBodegaDesdeAdmin`.
  Ningún `CifraId` nuevo.
- `components/private/cierres/fila/fila-gestion-vista.ts` — `veDineroEmpresa` (y `veFulfillment`
  delega), `ColumnaId "ganaBodega"`, `columnasDe` con tercer parámetro obligatorio,
  `montoDeColumna("ganaBodega")`, `tarjetasDe` con el cobro solo para la central.
- `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts` — `columnasDescargaDetalle`,
  `ganaBodega` en la fila.
- Cableado: `GestionesCierre.tsx`, `FilaGestion.tsx` (+ ancho de la pista `ganaBodega`, que el
  `Record<ColumnaId>` exige), `DetalleCierreBodegaAbierto.tsx`, `CierresAdminModule.tsx`
  (`DetalleAbierto` nulable + los tres campos de R467; columnas de descarga).

Tests:

- En la lista: `tests/unit/utils/detalle-cierre-vista.test.ts`, `tests/unit/utils/fila-gestion-vista.test.ts`,
  `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`, `tests/components/DetalleCierre.test.tsx`,
  `tests/components/FilaGestion.test.tsx`, `tests/components/CierresAdminDetalleUnico.test.tsx` (T4.1).
- **Fuera de la lista** (los pidió el typecheck o el rojo que causa T3; cada cambio cita su `R`):
  - `tests/fixtures/detalle-cierre-admin-anterior.tsx` — typecheck (12): el panel antiguo recibe las
    cifras ya nulables; `exigir()` falla ruidoso si un doble trae `null` (no pinta nada inventado).
  - `tests/components/CierresAdminModule.test.tsx` (7 tests), `CierreBodegaDesglosePorTienda.test.tsx`
    (21), `CierreBodegaDetalleCascadas.test.tsx` (25), `DineroIdentidadesEnPantalla.test.tsx` (4):
    montaban el módulo con su audiencia POR DEFECTO, `"satelite"`, y verificaban el dinero de la
    empresa: justo la fuga que esta ficha cierra. Pasan a `audiencia="admin"` (R477), sin tocar un
    solo esperado.
  - `tests/components/ConsolidacionBodegaRefresco.test.tsx` (1): las pestañas de la satélite pasan a
    `["Gestiones (1)", "Lo que va a la central", "Mensajeros (1)", "Conciliación"]` (R470).

## Desvíos

1. `haciaLaCentral?` y `centralDebe?` **opcionales** en la vista (el diseño los daba obligatorios),
   por la misma razón que la tanda 1: obligatorios rompían los dobles de 4 tests de componentes más.
   Ausente = `null` = sin dato: no se pinta nada de la central; nunca «₡0». `centralDebe` es
   `string | null` (no `string`): sin dato del servidor no hay tarjeta, y así se distingue de «0.00».
   `vistaMensajeroDesdeCierreDia` y `vistaMensajeroEnCurso` NO escriben `haciaLaCentral: null`
   explícito (ausente = lo mismo) para no cambiar el `toEqual` de SLT-108.
2. S4 sin `centralDebe` llama a `tarjetasAConsolidar` con `"0.00"`: esa función omite la caja en cero,
   así que el resultado es el mismo que «sin dato» (ninguna caja, ningún «₡0»). Probado (R478).
3. Tamaño: `scripts/tamano-pr.mjs` da **31/40 archivos** (692/1000 de producción, 1447/3000 de
   tests). Con T4 (servicios + integraciones) y T5 (E2E) pasa del 80 % (32) y probablemente de 40:
   lo decide el leader.

## Mapa R → test (T3)

| R | Test | Mutación que lo pone rojo |
|---|---|---|
| R468 | `detalle-cierre-vista.test.ts` › SLT-154 › S4 › «R468 — cuatro tarjetas…», «…La central debe 800…»; `DetalleCierre.test.tsx` › SLT-154 › S4 | M8 |
| R469 | `detalle-cierre-vista.test.ts` › S4 › «R469 — «Lo que va a la central»…»; `DetalleCierre.test.tsx` › S4 | M11, M16 (las cuentas de la empresa) |
| R470 | `detalle-cierre-vista.test.ts` › S4 › «R470 — pestañas…»; `DetalleCierre.test.tsx` › S4; `ConsolidacionBodegaRefresco` (d) | M12 |
| R471 | `detalle-cierre-vista.test.ts` › S6 › «R471 — recaudado…», «…aunque llegara…»; `DetalleCierre.test.tsx` › S6 | M8b |
| R472 | `detalle-cierre-vista.test.ts` › S6 › «R472 — la barra…», «R472, R478 — sin empresa ni…» | M15 (sin datos), M17 |
| R473 | `detalle-cierre-vista.test.ts` › S6 › «R473 — pestañas…» y `pestanasDe` › «mensajero · satélite»; `DetalleCierre.test.tsx` › S6; `CierresAdminDetalleUnico` › «SLT-154 (R473, R471)» | M12b |
| R474 | `fila-gestion-vista.test.ts` › SLT-154 › «R474 — …» (3); `FilaGestion.test.tsx` › SLT-154 › «R474 — la cabecera…», «…₡500…» | M9, M18 |
| R475 | `fila-gestion-vista.test.ts` › SLT-154 › «R475 — …» y R25; `FilaGestion.test.tsx` › SLT-154 › «R475 — desplegada…»; `CierresAdminDetalleUnico` › «satélite: sin Fulfillment…» | M10 |
| R476 | `detalle-cierre-descarga-columnas.test.ts` › SLT-154 › «R476 — …» (3) | M13 |
| R477 | `detalle-cierre-vista.test.ts` › «la central (R477)…» (2); `fila-gestion-vista.test.ts` › «R477 — …» (2); `FilaGestion.test.tsx` › «R477 — …»; descarga › «R477 — la central…»; los 4 de componentes que pasan a `admin` | (contraprueba de M9/M10/M13: con la central siguen verdes) |
| R478 | `detalle-cierre-vista.test.ts` › «R478 — …» (8: centralDebe, haciaLaCentral, empresa con una `null`, netoEmpresa, cobradoSobreRecaudado, totalesIngreso, mensajero central sin empresa) | M11, M14, M15, M16, M17, M19 |

Literales a mano: corpus del E2E (recaudado 9 000 − pago 1 500 − bodega 500 = debe llegar 7 000;
`money()` sin «,00»: «₡9.000», «₡1.500», «₡500», «₡7.000»). Reparto de entrada [78, 17, 5] =
7000/9000 = 77,8 · 1500/9000 = 16,7 · 500/9000 = 5,6 por restos mayores (es entrada del doble; la
vista solo lo pasa).

## T3.6 — Mutaciones (aplicar, correr, anotar, `git checkout`, diff limpio; las 15)

| M | Mutación | Rojo |
|---|---|---|
| M8 | `cifrasDe` bodega satélite → `cifrasBodega` | R468 ×3 (unidad) + S4 (componente) |
| M8b | sin la rama satélite del mensajero | R471 ×2 + S6 (componente) |
| M9 | `columnasDe` ignora `quienMiraEsCentral` (`true ?`) | R474 ×2 (unidad) + ×2 (componente) |
| M10 | `tarjetasDe` siempre con cobro (`!esMensajero`) | R25, R95, R475 (unidad y componente; 6) |
| M11 | `cuentaQueda` sin exigir `netoEmpresa` | R478 «con `netoEmpresa: null`…» |
| M12 | `pestanasDe` bodega sin la rama satélite | R470 + S4 (componente) |
| M12b | `pestanasDe` mensajero sin la rama satélite | R473 ×2 + S6 (componente) |
| M13 | `columnasDescargaDetalle` ignora `veDineroEmpresa` | R476 ×2 |
| M14 | `empresaDe` sin mirar `netoEmpresa` | R478 «basta UNA cifra…» |
| M15 | `haciaLaCentralDe` sin la guarda de ausentes | R478 «sin los campos de R467…» |
| M16 | `cuentaFactura` sin exigir `cobradoSobreRecaudado` | **sobrevivió** la 1.ª vez → se añadió «R478 — sin `cobradoSobreRecaudado`…» → rojo |
| M17 | central sin `empresa` sin cortar las dos tarjetas | R478 «mensajero · central sin `empresa`…» |
| M18 | `montoDeColumna("ganaBodega")` quitado | R474 «₡500» (componente) + unidad |
| M19 | `centralDebe ?? "0.00"` en `vistaBodegaDesdeAdmin` | R466 «`centralDebe` pasa tal cual; ausente, `null`» |

Ninguna sobrevive al final.

## Verificación (tanda 2)

- `pnpm run typecheck`: de 134 a **99 errores**, todos de T4 (servicios e integración, no tocados):
  `tests/unit/services/cierres-bodega-admin-service.test.ts` 65, `tests/unit/services/cierres-admin-service.test.ts` 27,
  `tests/integration/db/cierre-iva-aparte-sl39.test.ts` 5,
  `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` 2. Producción: 0.
- `pnpm run lint`: **0 errores** (251 avisos, ninguno en líneas de esta tanda; el de
  `DineroIdentidadesEnPantalla.test.tsx:541` es anterior).
- vitest (base desechable exportada): los 5 de T3.5 → 5/5 archivos, 241 tests verdes; 70 archivos de
  componentes/unidad de cierres (`grep` de `components/private/cierres`, los módulos y `cierre-labels`)
  + 12 más de cierres de bodega → todos verdes tras los cambios de arriba (antes: 36 + 25 rojos, todos
  por montar la satélite por defecto con el dinero de la empresa).
- `git diff --diff-filter=A --name-only origin/dev -- '*.tsx'` → vacío (y contra el merge-base,
  vacío). Ningún `CifraId` nuevo; ninguna prop nueva en `DineroCierre`, `Cuenta`, `CifrasCierre`,
  `DetalleCierre`, `GestionesCierre` ni `FilaGestion`.
- No corrido (fuera de la tanda): `./init.sh` (rojo por T4), E2E, dev server.

## Veredicto (tanda 2)

Vista de T3 hecha y probada con literales a mano (R468-R478, 15 mutaciones muertas); typecheck de
producción en cero; quedan los 99 errores y los rojos de servicios/integración de T4.

---

# Tanda 3 — tests existentes (T4), E2E escrito (T5) y cierre (T6), backend_dev, 2026-11-14

El grafo no indexa este worktree: todo con Grep/Read.

## T4 — Archivos (solo tests; cada cambio cita su `R` de SLT-154)

| Archivo | Qué cambia | R |
|---|---|---|
| `tests/unit/services/cierres-bodega-admin-service.test.ts` | asercion `exigirDineroEmpresa` (lanza si la central recibe en `null` alguna de las ocho, en el agregado o en un cierre del día) tras el `ok` de 13 lecturas del MAESTRO; ningún esperado tocado. Doble `detalleCierreRow` con `pagoIndependienteEfectivo: false` (columna nueva; modelo anterior, como todos sus casos). SLT-107 R280/R283: la gestión de la satélite llega con `ingresoEmpresa: null` y `tarifaModelo: "viejo"`. SLT-107 R284: la central igual que antes + `exigirDineroEmpresa`; la satélite con las ocho en `null` en el agregado y en el cierre del día (mirado por nombre); paridad del resto con `centralDebe` a mano «0.00» (efectivo 10,00 ≥ pago 5,00) | R463, R460, R461, R465, R466 |
| `tests/unit/services/cierres-admin-service.test.ts` | `exigirDineroEmpresa` (nueve cifras; `porcentajesReparto` no, ya admitía `null`) tras 12 lecturas del MAESTRO; ningún esperado tocado | R462, R465 |
| `tests/integration/db/cierre-iva-aparte-sl39.test.ts` | SL-39 R21–R23 cierre A y B: las cifras se leen con el maestro (mismos literales 1.700 / −100 / 416 / 260 / 3.616 / 2.260); la satélite, en la misma siembra, recibe `[null, null, null, null]`. Bodega (maestro): `?.` solo por el tipo | R462, R465 |
| `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` | paridad R380/R382 con el maestro: `throw` si llega `null` (no una paridad que se cumple sola) | R465 |
| `tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts` | SLT-107 R280/R283: gestiones con `ingresoEmpresa: null` y modelo aparte (A «nuevo», C «viejo», la siembra). R284: la central con las ocho, la satélite con las ocho en `null` (agregado y cierre del día), paridad del resto. Fuera `sinFulfillment` y su import | R463, R460, R461, R465 |
| `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` | SLT-111 MB: la central `[89, 11]` sin cambio; la satélite `porcentajesReparto: null` y sus dos partes `null` | R462, R465 |
| `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` | SLT-141 R387: el lote leído con el alcance de CADA lector (toda la empresa / la zona de S) se compara con el detalle de la CENTRAL; los literales (94 350 / 3 500 / 92 090 / partes) sobre la central; S, las ocho en `null` | R460, R465 |
| `tests/integration/db/cierre-bodega-detalle-lote-sql-real.test.ts` | SLT-148 R420/R422: la fila del repositorio lleva `pagoIndependienteEfectivo: false` (la siembra `nuevoDia` la escribe así) | R466 (T2.3) |

Los títulos de los casos de SLT-107, SL-39, SLT-111, SLT-141 y SLT-148 no se cambian (son su
trazabilidad); el comentario junto a cada cambio dice qué R de esta ficha lo pide.
`CierresAdminDetalleUnico.test.tsx` y `CierresBodegaAdminDetalleUnico.test.tsx` (lista de T4.1): ya
verdes desde la tanda 2, sin cambio aquí.

### Mutaciones de T4 (aplicar, correr los 8 archivos, `git checkout`; `git diff -- lib/` limpio al final)

| M | Mutación | Rojo |
|---|---|---|
| X1 | `verCierreBodegaDetalle` devuelve el agregado sin recorte | unidad R284, integración R284, R387 |
| X2 | cada cierre del día de bodega sin recorte | unidad R284, integración R284 |
| X3 | `ocultarDineroEmpresaSiNoCentral` devuelve la fila siempre | unidad R280/R283, integración R280/R283 |
| X4 | `verCierreDetalle` sin recorte | SL-39 A y B, SLT-111 MB |
| X5 | `anularEmpresaSiNoCentral` recorta también a la central | 49 casos (todas las `exigirDineroEmpresa`, SL-39, SLT-111, SLT-140, SLT-141, SLT-107) |

Ninguna sobrevive.

## T5 — E2E (escrito, SIN ejecutar: lo corre el leader)

`e2e/cierre-bodega-satelite.spec.ts` › «4 — la satélite ve solo lo suyo», último del `describe.serial`
(tras el 3; «Solicitados» lista los cierres de la zona en cualquier estado, `cierresBodegaDeZonaWhere`).
S4 desde «Solicitados» → «Ver el cierre de bodega #FOLIO»: tarjetas `recaudado` ₡9.000, `pago`
₡1.500, `ganaBodega` ₡500, `paraCentral` ₡7.000, sin `leQueda` ni `centralDebe`; abre en «Gestiones
(2)», sin pestaña «Dinero»; cabecera con «Gana bodega» y sin «Cobro a la tienda»; fila del rechazo
₡500; desplegada con «Recibió el mensajero», sin «Se le cobra a la tienda» ni «Ver cómo se calculó»;
pestaña «Lo que va a la central» (`tab`) con su cuenta (`region`): Total general ₡9.000, − Pago
₡1.500, − Gana la bodega ₡500, Debe llegar ₡7.000; sin las regiones de factura y «le queda», y el
diálogo sin «Le queda a la empresa», «Lo que se le factura a la tienda», «₡3.750» ni «₡1.750». S6 por
«Ver su cierre» (R294 de SLT-107): mismas cuatro tarjetas, sin `paraTienda` ni `leQueda`, sin «Se le
paga hoy a la tienda». T5.2: los pasos de la satélite usan `irA` (rol `tab`) y `montoDeCuenta` (rol
`region`); los pasos 2 y 3 de la central, sin cambio (R477). Typecheck y lint verdes.

## T6.2 — Mapa R → test completo (R460-R478)

Integración = `tests/integration/db/satelite-detalle-sin-dinero-empresa-sql-real.test.ts`; vista =
`tests/unit/utils/detalle-cierre-vista.test.ts`; fila = `tests/unit/utils/fila-gestion-vista.test.ts`;
E2E = `e2e/cierre-bodega-satelite.spec.ts` › «4 — la satélite ve solo lo suyo» (escrito, sin ejecutar).

| R | Test(s) |
|---|---|
| R460 | integración › «R460: la satélite recibe el detalle de bodega sin las ocho cifras de la empresa»; `cierres-bodega-admin-service.test.ts` › «R284: mismo doble leido por central y satelite…»; `satelite-cierre-bodega-lectura.int.test.ts` › «R284: S1 y el maestro leen CB1 igual…»; `cierres-bodega-cifras-lote-sql-real.test.ts` › «R387 paridad…» |
| R461 | integración › «R461: cada cierre del día llega sin cifras de la empresa y con sus cifras propias»; las dos R284 de arriba (cierre del día) |
| R462 | integración › «R462: la satélite recibe el detalle del cierre del mensajero sin las cifras de la empresa»; `cierres-admin-fulfillment-solo-central.test.ts` › «R462: las diez cifras…»; `cierre-iva-aparte-sl39.test.ts` › «R21–R23 cierre A…», «R22 cierre B…»; `cierre-reparto-porcentajes-sql-real.test.ts` › «R263/R260 MB (satelite)…» |
| R463 | integración › «R463: cada gestión llega sin cobro a la tienda y con su modelo de tarifa»; `cierres-admin-fulfillment-solo-central.test.ts` › «adminSatelite: el cobro a la tienda llega null entero…» (×2); `cierres-bodega-admin-service.test.ts` › «R280/R283: satelite de su zona…»; `satelite-cierre-bodega-lectura.int.test.ts` › «R280/R283: S1 lee CB1…» |
| R464 | `cierres-admin-fulfillment-solo-central.test.ts` › «un rol sin acceso total que no es la satélite también recibe el recorte (adminTienda / mensajero / adminSatelite)» y la clasificación exhaustiva |
| R465 | integración › «R465: el maestro recibe los dos detalles con las cifras de la empresa de antes»; `exigirDineroEmpresa` en `cierres-bodega-admin-service.test.ts` (13 casos) y `cierres-admin-service.test.ts` (12); SL-39, SLT-111 MA/MB/MC, SLT-140 R380/R382, SLT-141 R387 con el maestro |
| R466 | integración › «R466: La central debe del cierre de bodega…» (S y M); `cierres-bodega-admin-service.test.ts` › R284 (`centralDebe` «0.00»); `cierre-bodega-detalle-lote-sql-real.test.ts` › R420, R422 (la columna en la fila); vista › «`centralDebe` pasa tal cual; ausente, `null`» |
| R467 | integración › «R467: el detalle del cierre del mensajero trae lo que debe llegar a la central y su reparto» |
| R468 | vista › SLT-154 › S4 › «R468 — cuatro tarjetas…», «…La central debe 800…»; `DetalleCierre.test.tsx` › SLT-154 › S4; E2E |
| R469 | vista › S4 › «R469 — «Lo que va a la central»…»; `DetalleCierre.test.tsx` › S4; E2E |
| R470 | vista › S4 › «R470 — pestañas…»; `DetalleCierre.test.tsx` › S4; `ConsolidacionBodegaRefresco.test.tsx` (d); E2E |
| R471 | vista › S6 › «R471 — recaudado…», «…aunque llegara…»; `DetalleCierre.test.tsx` › S6; E2E |
| R472 | vista › S6 › «R472 — la barra…», «R472, R478 — sin empresa ni…» |
| R473 | vista › S6 › «R473 — pestañas…» y `pestanasDe` › «mensajero · satélite»; `DetalleCierre.test.tsx` › S6; `CierresAdminDetalleUnico.test.tsx` › «SLT-154 (R473, R471)» |
| R474 | fila › SLT-154 › «R474 — …» (3); `FilaGestion.test.tsx` › «R474 — la cabecera…», «R474 — la fila del rechazo muestra ₡500…»; E2E |
| R475 | fila › «R475 — …» y R25; `FilaGestion.test.tsx` › «R475 — desplegada…»; `CierresAdminDetalleUnico.test.tsx` › «satélite: sin Fulfillment…»; E2E |
| R476 | `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` › SLT-154 › «R476 — …» (3) |
| R477 | vista › «la central (R477)…» (2); fila › «R477 — …» (2); `FilaGestion.test.tsx` › «R477 — …»; descarga › «R477 — la central…»; los 4 de componentes que pasan a `admin`; E2E pasos 2 y 3 (sin cambio) |
| R478 | vista › «R478 — …» (8) |

## T6.3 — Reuso

- `git diff --diff-filter=A --name-only origin/dev -- '*.tsx'` → vacío.
- `detalle-cierre-vista.ts`: el diff no añade miembros a `CifraId` (0 líneas `+  | "…"`).
- `DineroCierre.tsx`, `Cuenta.tsx`, `CifrasCierre.tsx`, `DetalleCierre.tsx`: sin diff. `GestionesCierre.tsx`
  y `FilaGestion.tsx`: solo el tercer argumento de `columnasDe` y el ancho de la pista `ganaBodega`;
  ninguna prop nueva en sus `…Props`.

## T6.4 — Tamaño

`node scripts/tamano-pr.mjs`: **40/40 archivos**, 692/1000 líneas de producción, 1821/3000 de tests
(AVISO, no rojo). Por encima del 80 % de archivos (32); no se anota como aceptado (lo decide el
leader). Desglose: producción 17 archivos (`lib/` 9: 297 líneas; vista y cableado 8: 395); E2E 1 (75);
tests 22 (tanda 1: 2 archivos, 661 líneas; tanda 2: 12, 786; tanda 3: 8, 299).

## Verificación (tanda 3)

- `pnpm run typecheck`: **0 errores** (de 99).
- `pnpm exec eslint` de los 9 archivos tocados: sin problemas.
- Los 9 archivos de T4 + la integración nueva: **9/9 archivos, 220/220 tests** verdes (base desechable).
- TODOS los de `tests/integration/db/` y `tests/unit/services/` que nombran cierre o bodega (130
  archivos): 33 rojos, 32 de ellos en `tests/baseline-rojos.json` («La app nace vacia (SL-11)…»: la
  suite asume órdenes, usuarios y zonas sembrados; en esta base fallan con «referencia a otra empresa»
  o «falta el estatus … corre db:seed» porque la base tiene restos de corridas anteriores de otras
  empresas y el catálogo `order_status` sin `ayuda_tienda` ni `devolucion_por_confirmar`, aunque sus
  migraciones constan aplicadas). El único fuera del baseline,
  `notificacion-evento-bloqueo-cierre-migration.test.ts` (ejercita el DOWN de una migración), falla
  igual SOLO: la base tiene 2 filas `notificacion` con `cierre_dia_rechazado`, que el enum recreado por
  ese DOWN no admite. Datos de la base, no de esta rama (no toca `db/` ni notificaciones).
- `./init.sh` → **`INIT_EXIT=0`** (typecheck, lint, 369 tests relacionados en 4 tandas verdes, guardias;
  «245 rojo(s) heredado(s) del baseline no cuentan»). La guardia
  `dependencias-declaradas-presentes.guardia.test.ts` está en el baseline; `init.sh` y la guardia son
  idénticos a `origin/dev`.
- No corrido: E2E (lo corre el leader), dev server.

## Veredicto (tanda 3)

T4-T6 hechos: los tests que la ficha cambia, ajustados con su R y sin debilitar (5 mutaciones
muertas), gate verde; E2E escrito sin ejecutar; el tamaño queda en 40/40 archivos, a decidir.
