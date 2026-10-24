# SL-39 «Wallet: IVA aparte de las ganancias» — tasks

> Aprobado por Carlos el 2026-10-23, con P1 = sí (cierres-admin incluido)

Orden: T0 ∥ C0 → T1 → (T2 ∥ T3 ∥ T4 ∥ C1) → (T5 ∥ C2) → T6 → T7. La tanda C es la del cierre
(`design.md > 12`). `[P]` = paralelizable con las otras `[P]` de su tanda.
Cada task cierra con `pnpm exec vitest related --run <archivos tocados>` en verde, salvo donde se dice
que debe estar en rojo.

## Tanda 0 — El rojo primero

- [x] **T0. Test de integración que hoy falla** (R1, R2, R4, R5, R16).
  - Escribe `tests/integration/db/caja-iva-aparte-sl39.test.ts` según `design.md > 9`, sobre el molde
    de `tests/integration/db/_fixtures/caja-459.ts`, con `WalletService` y
    `WalletMovimientoRepository` reales.
  - Antes, confirma que `enTransaccionRevertida459` y `montarServicios459` fijan la empresa tras SL-17
    (`conEmpresa` o la variable `app.organizacion_id`). Si no la fijan, usa el patrón de
    `aislamiento-wallet.test.ts`.
  - Incluye el control de no vacuidad (las cinco filas existen, leídas con el cliente base) y el caso
    de la empresa B.

  **Hecho cuando:**
  - corre contra Postgres y sale **en rojo** con Δganancia `"2116.00"` en vez de `"1700.00"`;
  - la salida queda pegada en `progress/impl_SL-39.md`. Un `skip` por falta de base no cuenta como rojo.

## Tanda 1 — La clasificación y la cifra (depende de T0)

- [x] **T1. Seeds y derivación** (R1–R5, R8, R18, R20).
  - `lib/types/wallet.ts`:
    - nuevos `WALLET_IVA_SEED`, `WALLET_INGRESO_IVA_SEED`, `WALLET_EGRESO_IVA_SEED` y
      `WALLET_INGRESO_GANANCIA_SEED`, con sus tipos;
    - `WALLET_EGRESO_NOMBRADO_SEED` pierde el reverso de IVA;
    - `WALLET_EGRESO_CON_FILA_SEED` gana `WALLET_EGRESO_IVA_SEED`;
    - `CajaResumenDTO` gana `iva` y `signoIva`, y `ComposicionGananciaDTO` gana `iva` y `totalIva`
      (`design.md > 6`).
  - `lib/utils/caja-tesoreria.ts`:
    - exporta `esCategoriaIva`;
    - `acumular` gana las cubetas de IVA;
    - `derivarCaja` hace la quinta llamada a `derivarBalance`, y `deEmpresa` suma el IVA;
    - `derivarComposicionGanancia` llena `iva` y `totalIva`.
  - `NATURALEZA_POR_CATEGORIA` y `LIQUIDEZ_POR_CATEGORIA` **no cambian**.
  - Tests:
    - nuevo `tests/unit/utils/caja-iva-aparte-sl39.test.ts`;
    - se actualizan `caja-derivaciones.guardia.test.ts` (cuatro llamadas pasan a cinco) y
      `caja-composicion-exhaustiva.guardia.test.ts` (R8 y R18, con autocomprobación);
    - se rehacen las aserciones que fijaban la ganancia con IVA, cada una con su número nuevo
      escrito: `tests/unit/utils/caja-tesoreria.test.ts`, `caja-composicion.test.ts`,
      `caja-derivacion-457.test.ts`, `caja-derivacion-459.test.ts` y `caja-derivacion-461.test.ts`.
      No se cambia ningún literal por su propia fuente.

  **Hecho cuando:**
  - T0 pasa a verde;
  - los tests puros y las guardias salen en verde;
  - cada una de estas mutaciones pone en rojo al menos un test, se prueba y se revierte:
    1. quitar el IVA de `esCategoriaIva`;
    2. no sumar el IVA a `deEmpresa`;
    3. sumar el IVA también a `ingresosPropios`.

## Tanda 2 — Las cifras que repiten la ganancia (dependen de T1)

- [x] **T2. [P] Serie diaria** (R12).
  - En `lib/utils/finanzas-diarias.ts`, `esPropio` pasa a «propio y no IVA», usando `esCategoriaIva`.
  - Se actualiza `tests/unit/analytics/finanzas-diario.test.ts` con un caso con IVA y la suma de los
    días igual a la ganancia de `derivarCaja`.

  **Hecho cuando:** el test sale en verde y la mutación «volver a `=== "propio"`» lo pone en rojo.

- [x] **T3. [P] Métrica `ganancia_empresa`** (R11, R13).
  - En `lib/analytics/metrics.ts`, la lista pierde las cuatro de IVA y la descripción lo dice.
  - `tests/unit/analytics/metrics-caja-naturaleza.guardia.test.ts` compara la lista con «propio menos
    `WALLET_IVA_SEED`».
  - `tests/unit/services/analitica-financiera-service.test.ts` cubre dos cosas:
    - el neto de `ganancia_empresa` es igual a la ganancia de la caja, y el bruto no cuenta IVA;
    - el neto de `ingreso_iva` es igual al IVA de la caja.
  - Se ajustan los fixtures que lo fijaban (`tests/fixtures/dto-financiero-servido.ts`, si lo hace).

  **Hecho cuando:** todos salen en verde y devolver una categoría de IVA a la lista pone la guardia en
  rojo.

- [x] **T4. [P] Textos** (R10).
  - En `app/(app)/wallet/_components/wallet-labels.ts`:
    - `IMPUESTO_ROTULO` y los rótulos y la pista de «IVA cobrado»;
    - la pista de la ganancia, la nota de la diferencia, el nombre accesible de la barra y el mensaje
      `solo_tiendas` (`design.md > 7.3`);
    - `REGIONES_BOLSILLO_EMPRESA`.
  - Se actualiza `tests/unit/components/wallet-labels.test.ts`.

  **Hecho cuando:** el test sale en verde y afirma literalmente las frases nuevas, no contra su propia
  constante.

## Tanda 3 — La pantalla (depende de T1 y T4)

- [x] **T5. Resumen y composición** (R6–R9, R20).
  - `CajaResumenCard.tsx`: las regiones secundarias del bolsillo de la empresa se pintan desde
    `REGIONES_BOLSILLO_EMPRESA`, con «IVA cobrado» antes de «Saldo inicial y aportes».
  - `ComposicionGananciaCard.tsx`:
    - «Ingresos» recorre `WALLET_INGRESO_GANANCIA_SEED`;
    - bloque «IVA cobrado (aparte de la ganancia)» con sus cuatro `FilaComposicion` y el total;
    - descripción nueva.
  - Lo que siga a los tipos nuevos: `DesgloseEgresosLista.tsx` y `composicion-detalle-labels.ts`.
  - Tests:
    - nuevo `tests/components/WalletCajaIvaSL39.test.tsx`: la región con importe, insignia y pista;
      las tres filas fuera de «Ingresos»; el bloque con cuatro filas que se abren; el pie sin IVA;
      ningún `Number(`/`parseFloat` sobre importes;
    - se actualizan `tests/components/ComposicionGananciaCard.test.tsx` y
      `tests/integration/wallet-page.test.tsx`.

  **Hecho cuando:**
  - todos salen en verde;
  - quitar la entrada «IVA» de `REGIONES_BOLSILLO_EMPRESA` pone en rojo el test de la región;
  - el recorrido en el navegador (dev server único) muestra el ejemplo de §1: ganancia 1.700,00 e IVA
    cobrado 416,00. Se apunta en `progress/impl_SL-39.md` con los números medidos.

## Tanda C — El detalle de cierres de `cierres-admin` (P1 = sí)

- [x] **C0. [P] Test de integración del cierre que hoy falla** (R21–R23, R25).
  - Escribe `tests/integration/db/cierre-iva-aparte-sl39.test.ts` según `design.md > 12.7`: los cierres
    A y B, el detalle de bodega en sus dos niveles, la huella de `cierre_detail` y el control de no
    vacuidad.

  **Hecho cuando:**
  - sale **en rojo** contra Postgres, con `ganancia` `"2116.00"` en A y `"160.00"` en B;
  - la salida queda pegada en `progress/impl_SL-39.md`.

- [x] **C1. [P] El minuendo sin IVA** (R21–R23, R25, R26). Depende de C0.
  - Nuevo `lib/utils/iva-cierre.ts` con `ivaFacturado` y `facturadoSinIva`.
  - `CierresAdminService.verCierreDetalle` y `CierresBodegaAdminService.verCierreBodegaDetalle`, este
    en los dos niveles: `gananciaEmpresa` y `netoEmpresa` reciben `facturadoSinIva(totalesIngreso)`, y
    el DTO gana `ivaFacturado`.
  - `ICierresAdminService.ts` e `ICierresBodegaAdminService.ts` ganan el campo.
  - **`lib/utils/ingreso-empresa.ts` no se toca.**
  - Tests:
    - nuevo `tests/unit/utils/iva-cierre.test.ts`;
    - se actualizan `tests/unit/services/cierres-admin-service.test.ts` y
      `tests/unit/services/cierres-bodega-admin-service.test.ts`.

  **Hecho cuando:**
  - C0 pasa a verde;
  - la mutación «volver a `totalesIngreso.total`» pone C0 en rojo (se prueba y se revierte);
  - `git diff dev -- lib/utils/ingreso-empresa.ts` sale vacío.

- [x] **C2. Las cascadas y las notas** (R24, R26, R27). Depende de C1.
  - `CascadasCierreMensajero.tsx` (`lineasNetoEmpresa`) y `CierresBodegaAdminModule.tsx`
    (`lineasCascadaDueno`) ganan la línea «IVA facturado», con signo resta, después de «Lo que la
    empresa facturó».
  - `CierresAdminModule.tsx` pasa `ivaFacturado` hasta las cascadas.
  - Textos:
    - `cierre-labels.ts`: `IVA_FACTURADO_LABEL`, `IVA_FACTURADO_NOTA` y `NETO_EMPRESA_NOTA`;
    - `cierre-detalle-shared.tsx`: `GANANCIA_NOTA` y `GANANCIA_NOTA_BODEGA`.
  - Tests que se actualizan: `tests/components/CierreMensajeroDetalleCascadas.test.tsx`,
    `CierreBodegaDetalleCascadas.test.tsx`, `DineroIdentidadesEnPantalla.test.tsx`, y los fixtures de
    `CierresAdminModule.test.tsx` y `CierresAdminPage.test.tsx` que construyen el DTO.

  **Hecho cuando:**
  - los tests salen en verde y afirman la línea, su posición, su nota literal y la identidad
    facturado − IVA − pago − bodega = neto;
  - el recorrido en el navegador del cierre A muestra «Lo que le queda a la empresa» 1.700,00. Se
    apunta con los números medidos.
  - Seguimiento, en `progress/impl_SL-39.md`: corregir el docstring «ingreso bruto» de
    `gananciaEmpresa` y `netoEmpresa` después del merge de SL-38.

## Tanda 4 — Ayuda, no regresión y gate (depende de T5 y C2)

- [x] **T6. Ayuda** (apoya R6, R7 y R10).
  - `docs/ayuda/oficina/wallet-caja.md`: la ganancia no incluye el IVA, la región y el bloque «IVA
    cobrado», y la línea 365, que ahora dice «la ganancia baja en el flete y el IVA cobrado en su IVA».
  - `docs/ayuda/oficina/wallet-tiendas.md:175`: el IVA cobrado a la tienda no es ganancia, va en «IVA
    cobrado».
  - Actualizar `actualizado:` en los dos.

  **Hecho cuando:** las guardias de ayuda salen en verde con `vitest related` sobre los dos archivos.

- [x] **T7. No regresión y gate** (R14, R15, R17, R19).
  - Sin tocarlos, siguen en verde:
    - `tests/integration/db/libro-kardex-468.test.ts` y
      `tests/components/descarga/WalletDescarga.test.tsx` (R19);
    - `tests/unit/services/wallet-service.test.ts`, el caso `forbidden` antes de la base (R17);
    - `tests/integration/db/aislamiento-wallet.test.ts` (R16, SL-17);
    - `tests/integration/db/caja-caracterizacion-459.test.ts`. Si fijaba la ganancia con IVA, se
      reescribe con el número nuevo y su motivo.
  - R14: `git diff --stat dev -- db/` vacío. R15: `lib/utils/ingreso-empresa.ts` sin cambios.
  - `./init.sh` en verde.
  - En verde, `pnpm exec playwright test e2e/wallet.spec.ts` y los E2E `cierres-admin*`. La wallet y los
    cierres son flujos críticos (`docs/checkpoints-proyecto.md`).
  - El mapa `R<n> -> test` queda en `progress/impl_SL-39.md`.

  **Hecho cuando:**
  - `./init.sh` termina en verde con `INIT_EXIT=0` escrito dentro del log;
  - el E2E pasa;
  - el mapa cubre de R1 a R27.

## Archivos esperados

Código:
- `lib/types/wallet.ts`
- `lib/utils/caja-tesoreria.ts`
- `lib/utils/finanzas-diarias.ts`
- `lib/analytics/metrics.ts`
- `app/(app)/wallet/_components/wallet-labels.ts`
- `app/(app)/wallet/_components/CajaResumenCard.tsx`
- `app/(app)/wallet/_components/ComposicionGananciaCard.tsx`
- `app/(app)/wallet/_components/DesgloseEgresosLista.tsx`
- `app/(app)/wallet/_components/composicion-detalle-labels.ts`
- `lib/utils/iva-cierre.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/interfaces/services/ICierresBodegaAdminService.ts`
- `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/cierre-labels.ts`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`

Ayuda:
- `docs/ayuda/oficina/wallet-caja.md`
- `docs/ayuda/oficina/wallet-tiendas.md`

Tests nuevos:
- `tests/integration/db/caja-iva-aparte-sl39.test.ts`
- `tests/unit/utils/caja-iva-aparte-sl39.test.ts`
- `tests/components/WalletCajaIvaSL39.test.tsx`
- `tests/integration/db/cierre-iva-aparte-sl39.test.ts`
- `tests/unit/utils/iva-cierre.test.ts`

Tests que cambian:
- `tests/unit/guards/caja-derivaciones.guardia.test.ts`
- `tests/unit/guards/caja-composicion-exhaustiva.guardia.test.ts`
- `tests/unit/analytics/metrics-caja-naturaleza.guardia.test.ts`
- `tests/unit/utils/caja-tesoreria.test.ts`
- `tests/unit/utils/caja-composicion.test.ts`
- `tests/unit/utils/caja-derivacion-457.test.ts`
- `tests/unit/utils/caja-derivacion-459.test.ts`
- `tests/unit/utils/caja-derivacion-461.test.ts`
- `tests/unit/analytics/finanzas-diario.test.ts`
- `tests/unit/services/analitica-financiera-service.test.ts`
- `tests/unit/components/wallet-labels.test.ts`
- `tests/components/ComposicionGananciaCard.test.tsx`
- `tests/integration/wallet-page.test.tsx`
- `tests/integration/db/caja-caracterizacion-459.test.ts`
- `tests/fixtures/dto-financiero-servido.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/cierres-bodega-admin-service.test.ts`
- `tests/components/CierreMensajeroDetalleCascadas.test.tsx`
- `tests/components/CierreBodegaDetalleCascadas.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierresAdminPage.test.tsx`

Estado:
- `progress/impl_SL-39.md`
