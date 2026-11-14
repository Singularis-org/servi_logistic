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
