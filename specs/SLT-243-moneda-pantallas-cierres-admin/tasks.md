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
>
> Escrito con las recomendaciones de P1, P2 y P3 (`requirements.md > Preguntas abiertas`). Si el
> humano cierra alguna distinto, se ajusta según `design.md §11` antes de empezar.

## Bloque 1 — Aviso de cuadre con la moneda obligatoria (R7, R8)

- [ ] **T1.1** En `components/shared/DesglosePagoField.tsx`, `mensajeDeCuadre` pierde el default de
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

- [ ] **T2.1** [P] `/cierre-dia`: `CierreDiaModule.tsx`, con los 2 totales (design §3).
  - Casos de R1.
  - *Hecho:* en verde; los tests que ya existían de `/cierre-dia` pasan sin cambiar valores.
- [ ] **T2.2** [P] `AjustarPagoMensajeroDialog.tsx` y `MarcaAjustado.tsx` (design §3).
  - Casos de R2 y R3.
  - *Hecho:* en verde; `cierre-detalle-ajuste-badge.test.tsx` y los tests del ajuste del pago pasan
    sin cambiar valores.
- [ ] **T2.3** [P] Los 4 totales agregados de `ConsolidacionBodegaModule.tsx` y `TotalesPanel` de
  `cierre-detalle-shared.tsx` (solo ese componente; design §3).
  - Casos de R4 y R5.
  - *Hecho:* en verde; `CorregirResultadoCierre.test.tsx`, los tests de consolidación y la guardia
    `liquidacion-money-safe` pasan sin tocarlos.

## Bloque 3 — Pago al mensajero e indemnización (R6, R8, R9) (en paralelo con el bloque 2)

- [ ] **T3.1** [P] Pago al mensajero (design §3 y §4.2).
  - En `pago-mensajero-labels.ts`, `registrado(monto, moneda)` y `anulado(pendiente, moneda)`.
  - `PendienteLiquidarBadge.tsx`, `RegistrarPagoMensajeroDialog.tsx` y `PagoMensajeroSeccion.tsx`
    leen el hook.
  - En `CierresAdminPagoMensajero.test.tsx`, `registrado("50000.00", MONEDA_PLATAFORMA)`.
  - Casos de R6 y los dos `@ts-expect-error` de R8.
  - *Hecho:* en verde; `CierrePremioPendiente.test.tsx` y la guardia `liquidacion-alcance` pasan sin
    tocarlos.
- [ ] **T3.2** [P] Tope de la indemnización en `CierresAdminModule.tsx`:
  `indemnizacionMontoExcede(moneda)` e `indemnizacionMontoAyuda(moneda)` con `formatearTopeEn`, y
  fuera el import de `moneyTope` (design §4.3).
  - Casos de R9.
  - *Hecho:* en verde; `CierresAdminIndemnizacion.test.tsx` sigue esperando su literal sin cambios.

## Bloque 4 — Encabezados de las descargas (R10, R11) (depende de T2.3 y T3.2: comparte archivos)

- [ ] **T4.1** Módulo `encabezados-con-impuesto.ts` y su base en `cierre-labels.ts` (design §6.1).
  - En el módulo: `ENCABEZADO_CON_IMPUESTO`, `encabezadoBase`, `conImpuestoEnColumnas`,
    `conImpuestoEnHojas` y `conImpuestoEnResultado`.
  - En `cierre-labels.ts`: `rotuloFleteDevConImpuesto` y `rotuloImpuestoFacturado`, y las cuatro
    constantes calculadas con `IMPUESTO_ROTULO`.
  - Casos de R10 (a)–(c).
  - *Hecho:* en verde; `cierre-resultado-fila-label.test.ts`, `rechazo-nombre-466-app.test.ts`,
    `cierre-bodega-vocabulario.guardia.test.ts` y `CierreDesgloseModeloNuevo.test.tsx` pasan sin
    tocarlos.
- [ ] **T4.2** Las declaraciones de columnas toman sus encabezados con impuesto de
  `encabezadoBase(clave)` (R11).
  - Son `cierres-gestiones-modelo-nuevo-descarga-columnas.ts`,
    `cierres-resumen-modelo-nuevo-descarga-columnas.ts` y
    `cierres-bodega-modelo-nuevo-descarga-columnas.ts`. Depende de T4.1.
  - Censo «sin IVA» de R11 con su contraprueba.
  - *Hecho:* en verde; todas las suites de `tests/unit/descarga/cierres-*` y
    `tests/components/descarga/*` pasan sin tocarlas.
- [ ] **T4.3** Aplicación en los componentes (design §6.2). Depende de T4.1.
  - `CierresAdminModule.tsx` (2 sitios), `CierresBodegaAdminModule.tsx` (2),
    `ConsolidacionBodegaModule.tsx` (1), `DescargarGestionesDialog.tsx` y
    `DescargarCierresButton.tsx` (con `useMemo`).
  - Caso R10 (d).
  - *Hecho:* en verde; `DescargarGestionesDialog.test.tsx`, `CierresDescargaColumnas.test.tsx`,
    `CierresDescargaNiveles.test.tsx` y `paginacion-transversal.test.tsx` pasan sin tocarlos.

## Bloque 5 — Guardias y cierre (depende de los bloques 1–4)

- [ ] **T5.1** Censo de R18 de SLT-235 (design §7).
  - `CENSO_MONEDA_DEL_PAIS` gana el bloque «SLT-243» con los 10 archivos, más un comentario con los
    que quedan fuera y su motivo (P1, P3).
  - El caso de SLT-242 corta 17 entradas.
  - Caso nuevo: «los 10 de SLT-243 dan rojo con `money(` o `formatMontoString(`» (R15).
  - *Hecho:* en verde, y rojo si se reescribe un `money(` en uno de ellos.
- [ ] **T5.2** Caso de R16 en `moneda-del-pais-cierres-admin.test.tsx`: ninguna excepción con
  `ficha === "SLT-243"` y `TOPE_EXCEPCIONES` ≤ 12 (`toBeLessThanOrEqual`). No se edita
  `_pais-sin-literales-excepciones.ts`.
  - *Hecho:* `pnpm run test:guardias` en verde.
- [ ] **T5.3** Cierre.
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
- `app/(app)/cierres-admin/_components/cierre-labels.ts`
- `app/(app)/cierres-admin/_components/encabezados-con-impuesto.ts` (nuevo)
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx`
- `app/(app)/cierres-admin/_components/DescargarCierresButton.tsx`

Tests:
- `tests/components/moneda-del-pais-cierres-admin.test.tsx` (nuevo)
- `tests/components/moneda-del-pais-pantallas.test.tsx`
- `tests/components/GestionarOrdenPanelCentimos.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`

Grep del 2026-11-23. Si el typecheck o un test señalan otro llamante de `mensajeDeCuadre` o de
`PAGO_MENSAJERO_TEXTO.registrado` / `.anulado`, se añade aquí antes del PR (design §9).

## Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 20 | unas 350 |
| Tests | 4 | unas 650 (unas 600 del archivo nuevo) |
| **Total** | **24** | |

Son el 60% de `gate.tamano_pr` (40 archivos): quedan 16 de margen, por debajo del umbral del 80%.
Las líneas quedan muy por debajo de sus dos topes (1 000 de producción y 3 000 de tests).

- Con P1 = sí: +2 archivos y unas +300 líneas de producción. Seguiría por debajo del 80%.
- Con P2 = no: −8 archivos.
