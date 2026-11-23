# SLT-243 — Moneda e impuesto del país en pantallas: cierres del admin · tasks

> Los requisitos están en `requirements.md` y el cómo, en `design.md`.
>
> Una task está hecha cuando cumple su criterio **y** `pnpm run typecheck` está en verde. `[P]`
> marca las tasks que pueden ir en paralelo con las otras `[P]` de su bloque.
>
> Tests:
> - Cada task añade sus casos a `tests/components/moneda-del-pais-cierres-admin.test.tsx`. Es un
>   archivo nuevo; lo crea la primera task que llegue.
> - Cada caso de pantalla se prueba tres veces: con `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` +
>   «IVA» y sin proveedor. Con CR, el texto debe ser el mismo que sin proveedor (R12, R13).
> - Los tests que ya existían y solo cambian la forma de llamar **no cambian ningún valor esperado**.
>   Excepción, por P2: los literales de **encabezado** con impuesto de las suites de descarga y del
>   E2E de cierres (T4.2), a la columna «Costa Rica» de `design.md §6.0`.
>
> P1–P3 cerradas el 2026-11-23 (`requirements.md > Decisiones cerradas`).

## Bloque 1 — Aviso de cuadre con la moneda obligatoria (R7, R8)

- [x] **T1.1** En `components/shared/DesglosePagoField.tsx`, `mensajeDeCuadre` pierde el default de
  `moneda` y se corrige su comentario (design §4.1). `CorregirPagosDialog.tsx` lee
  `useMonedaDelPais()` y se la pasa.
  - Cambian de forma `GestionarOrdenPanelCentimos.test.tsx` (3 llamadas con `MONEDA_PLATAFORMA`) y
    el caso «sin moneda» de `moneda-del-pais-pantallas.test.tsx`, que pasa a comparar
    `MONEDA_PLATAFORMA` con `MONEDA_CR`.
  - Casos nuevos: R7 (`CorregirPagosDialog` con el proveedor de prueba) y el `@ts-expect-error` de
    `mensajeDeCuadre` (R8).
  - *Hecho:* todo en verde; `CorregirPagosCierre.test.tsx` y `DineroIdentidadesEnPantalla.test.tsx`
    pasan sin tocarlos.

## Bloque 2 — Importes de las pantallas (R1–R5) (en paralelo con el bloque 1)

- [x] **T2.1** [P] `/cierre-dia`: `CierreDiaModule.tsx`, con los 2 totales (design §3).
  - Casos de R1.
  - *Hecho:* en verde; los tests que ya existían de `/cierre-dia` pasan sin cambiar valores.
- [x] **T2.2** [P] `AjustarPagoMensajeroDialog.tsx` y `MarcaAjustado.tsx` (design §3).
  - Casos de R2 y R3.
  - *Hecho:* en verde; `cierre-detalle-ajuste-badge.test.tsx` y los tests del ajuste del pago pasan
    sin cambiar valores.
- [x] **T2.3** [P] Los 4 totales agregados de `ConsolidacionBodegaModule.tsx` y `TotalesPanel` de
  `cierre-detalle-shared.tsx` (solo ese componente; design §3).
  - Casos de R4 y R5.
  - *Hecho:* en verde; `CorregirResultadoCierre.test.tsx`, los tests de consolidación y la guardia
    `liquidacion-money-safe` pasan sin tocarlos.

## Bloque 3 — Pago al mensajero e indemnización (R6, R8, R9) (en paralelo con el bloque 2)

- [x] **T3.1** [P] Pago al mensajero (design §3 y §4.2).
  - En `pago-mensajero-labels.ts`, `registrado(monto, moneda)` y `anulado(pendiente, moneda)`.
  - `PendienteLiquidarBadge.tsx`, `RegistrarPagoMensajeroDialog.tsx` y `PagoMensajeroSeccion.tsx`
    leen el hook.
  - En `CierresAdminPagoMensajero.test.tsx`, `registrado("50000.00", MONEDA_PLATAFORMA)`.
  - Casos de R6 y los dos `@ts-expect-error` de R8.
  - *Hecho:* en verde; `CierrePremioPendiente.test.tsx` y la guardia `liquidacion-alcance` pasan sin
    tocarlos.
- [x] **T3.2** [P] Tope de la indemnización en `CierresAdminModule.tsx`:
  `indemnizacionMontoExcede(moneda)` e `indemnizacionMontoAyuda(moneda)` con `formatearTopeEn`, y
  fuera el import de `moneyTope` (design §4.3).
  - Casos de R9.
  - *Hecho:* en verde; `CierresAdminIndemnizacion.test.tsx` sigue esperando su literal sin cambios.

## Bloque 4 — Encabezados de las descargas (R10, R11) (depende de T2.3 y T3.2: comparte archivos)

- [x] **T4.1** Módulo `encabezados-con-impuesto.ts` con la forma «impuesto (<nombre>)» (design
  §6.0 y §6.1).
  - `impuestoEntreParentesis`, `ENCABEZADO_CON_IMPUESTO` (9 claves), `encabezadoBase`,
    `conImpuestoEnColumnas`, `conImpuestoEnHojas` y `conImpuestoEnResultado`.
  - `cierre-labels.ts` **no se toca**.
  - Casos de R10 (a)–(c), con los 9 encabezados de Perú y los 9 de Costa Rica escritos a mano en el
    test (R12).
  - *Hecho:* en verde; `cierre-resultado-fila-label.test.ts`, `rechazo-nombre-466-app.test.ts`,
    `flete-por-rechazo-censo.guardia.test.ts`, `rechazo-nombre-466.guardia.test.ts`,
    `cierre-bodega-vocabulario.guardia.test.ts` y `CierreDesgloseModeloNuevo.test.tsx` pasan sin
    tocarlos.
- [x] **T4.2** Las cuatro declaraciones de columnas toman sus encabezados con impuesto de
  `encabezadoBase(clave)` (R11), y se actualizan los encabezados esperados. Depende de T4.1.
  - Declaraciones: `cierres-gestiones-modelo-nuevo-descarga-columnas.ts` (5),
    `cierres-resumen-modelo-nuevo-descarga-columnas.ts` (1),
    `cierres-bodega-modelo-nuevo-descarga-columnas.ts` (1) y
    `cierres-gestiones-fundida-descarga-columnas.ts` (3; deja de importar los `*_CON_IVA_LABEL`).
  - Tests: solo los literales de encabezado con impuesto, a la columna «Costa Rica» de design §6.0,
    en las 8 suites de design §7 y en `e2e/cierres-rediseno.spec.ts` (listas de encabezados y
    `celda("IVA facturado")`; no las líneas de pantalla).
  - Censo «sin IVA» de R11 con su contraprueba.
  - *Hecho:* en verde; en el diff de los tests solo cambian literales de encabezado (ninguna celda,
    clave ni cuenta de columnas).
- [x] **T4.3** Aplicación en los componentes (design §6.2). Depende de T4.1.
  - `CierresAdminModule.tsx` (2 sitios), `CierresBodegaAdminModule.tsx` (2),
    `ConsolidacionBodegaModule.tsx` (1), `DescargarGestionesDialog.tsx` y
    `DescargarCierresButton.tsx` (con `useMemo`).
  - Caso R10 (d).
  - *Hecho:* en verde; `DescargarGestionesDialog.test.tsx`, `CierresDescargaColumnas.test.tsx` y
    `paginacion-transversal.test.tsx` pasan sin tocarlos (`CierresDescargaNiveles.test.tsx` ya se
    actualizó en T4.2).

## Bloque 5 — Guardias y cierre (depende de los bloques 1–4)

- [x] **T5.1** Censo de R18 de SLT-235 (design §7).
  - `CENSO_MONEDA_DEL_PAIS` gana el bloque «SLT-243» con los 10 archivos, más un comentario con los
    que quedan fuera y su motivo (P1, P3).
  - El caso de SLT-242 corta 17 entradas.
  - Caso nuevo: «los 10 de SLT-243 dan rojo con `money(` o `formatMontoString(`» (R15).
  - *Hecho:* en verde, y rojo si se reescribe un `money(` en uno de ellos.
- [x] **T5.2** Caso de R16 en `moneda-del-pais-cierres-admin.test.tsx`: ninguna excepción con
  `ficha === "SLT-243"` y `TOPE_EXCEPCIONES` ≤ 12 (`toBeLessThanOrEqual`). No se edita
  `_pais-sin-literales-excepciones.ts`.
  - *Hecho:* `pnpm run test:guardias` en verde.
- [x] **T5.3** Cierre.
  - `./init.sh` en verde.
  - E2E en local sobre una base desechable (`docs/perfil-agentes.md > E2E en local antes del PR`):
    - el grupo `dinero`;
    - los que salgan de `grep -rl` en `e2e/` por `cierres-admin`, `cierre-dia` e `indemniz`. Hoy
      son al menos `cierres-admin.spec.ts`, `cierre-dia.spec.ts`,
      `ajuste-pago-mensajero-cierre.spec.ts`, `cierre-bodega-satelite.spec.ts` y
      `cierres-rediseno.spec.ts`.
  - El mapa R → test va en `progress/impl_SLT-243.md`.
  - El reviewer comprueba en el diff lo de R14 (design §8).
  - *Hecho:* todo verde y el mapa cubre los 16 requisitos.

## Archivos esperados

Producción:
- `components/shared/DesglosePagoField.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `app/(app)/cierres-admin/_components/AjustarPagoMensajeroDialog.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx`
- `app/(app)/cierres-admin/_components/CorregirPagosDialog.tsx`
- `app/(app)/cierres-admin/_components/MarcaAjustado.tsx`
- `app/(app)/cierres-admin/_components/PendienteLiquidarBadge.tsx`
- `app/(app)/cierres-admin/_components/PagoMensajeroSeccion.tsx`
- `app/(app)/cierres-admin/_components/RegistrarPagoMensajeroDialog.tsx`
- `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx` (solo `TotalesPanel`)
- `app/(app)/cierres-admin/_components/encabezados-con-impuesto.ts` (nuevo)
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx`
- `app/(app)/cierres-admin/_components/DescargarCierresButton.tsx`

Tests:
- `tests/components/moneda-del-pais-cierres-admin.test.tsx` (nuevo)
- `tests/components/moneda-del-pais-pantallas.test.tsx`
- `tests/components/GestionarOrdenPanelCentimos.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` (solo encabezados)
- `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` (solo encabezados)
- `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` (solo encabezados)
- `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts` (solo encabezados)
- `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx` (solo encabezados)
- `tests/components/descarga/CierresDescargaNiveles.test.tsx` (solo encabezados)
- `tests/components/descarga/DescargarGestionesModeloNuevo.test.tsx` (solo encabezados)
- `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx` (solo encabezados)
- `e2e/cierres-rediseno.spec.ts` (solo encabezados de descarga)

Grep del 2026-11-23. Si el typecheck o un test señalan otro llamante de `mensajeDeCuadre` o de
`PAGO_MENSAJERO_TEXTO.registrado` / `.anulado`, u otro test que espere un encabezado de descarga con
«IVA», se añade aquí antes del PR (design §9) **y se avisa al leader**: con un archivo más el PR pasa
del 80%.

## Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 20 | unas 340 |
| Tests | 13 (uno E2E) | unas 720 (unas 620 del archivo nuevo, unas 70 de literales de encabezado) |
| **Total** | **33** | |

**Son el 82,5% de `gate.tamano_pr` (40 archivos): pasan del umbral del 80%.** Las líneas quedan muy
por debajo de sus dos topes (1 000 de producción y 3 000 de tests), pero el número de archivos no
cabe. La forma de P2 cambia también Costa Rica, y eso suma 9 archivos de tests que la primera
versión no tocaba. Propuesta de corte en `requirements.md > Preguntas abiertas > P4`:

| Rebanada | Qué lleva | Producción | Tests | Total |
|---|---|---|---|---|
| SLT-243 (esta) | Bloques 1, 2, 3 y 5: R1–R9, R12–R16 sin la parte de descargas | 13 | 4 | 17 |
| Nueva ficha: encabezados de descarga de cierres | Bloque 4: R10, R11 y la parte de descargas de R12–R14 | 7 | 9 | 16 |

Las dos se mergean solas: no comparten ningún archivo salvo `CierresAdminModule.tsx`,
`CierresBodegaAdminModule.tsx` y `ConsolidacionBodegaModule.tsx`, que la segunda toca en otro sitio
(design §6.2) después de que la primera esté en `dev`.
