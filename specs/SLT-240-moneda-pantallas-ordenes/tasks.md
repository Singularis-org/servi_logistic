# SLT-240 — Moneda del país en pantallas: órdenes, novedades e incidentes · tasks

> Requisitos en `requirements.md`; el cómo, en `design.md`. Una task está hecha cuando pasa su criterio
> **y** `pnpm run typecheck` está en verde. `[P]` = puede ir en paralelo con las otras `[P]` de su
> bloque. Cada task de pantalla añade sus casos a `tests/components/moneda-del-pais-ordenes.test.tsx`
> (archivo nuevo, lo crea la primera que llegue). Cada caso se prueba con `MONEDA_DE_PRUEBA`, con
> `MONEDA_CR` y sin proveedor: con `MONEDA_CR` el texto debe ser el mismo que sin proveedor (R12, R13).
> Los tests existentes que solo cambian la forma de llamar pasan `MONEDA_PLATAFORMA` y **no cambian
> ningún valor esperado**.

## Bloque 1 — Formateador de topes (R10)

- [x] **T1.1** Exportar `formatearTopeEn(moneda, max, sinMonto = SIN_MONTO)` en `lib/config/moneda.ts`
  y actualizar su comentario (design §3).
  - En `tests/unit/config/moneda-formato-pais.test.ts`:
    - con `MONEDA_DE_PRUEBA`, `"9999999999.99"` → `€9 999 999 999`;
    - lo recompuesto de un corpus de topes nunca supera la entrada;
    - `null` → `sinMonto`.
  - En `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`, dentro del `it` de
    `moneyTope`: `formatearTopeEn(MONEDA_PLATAFORMA, x) === formatMontoTope(x)` en todo el corpus.
  - *Hecho:* los dos en verde y `CAMINOS_PUBLICOS` sigue en 7.

## Bloque 2 — PDF de etiquetas del navegador (R5, R6, R7, R14)

- [x] **T2.1** `lib/pdf/etiquetas-dibujo.ts`: `moneda: FormatoMoneda` obligatoria en `drawEtiqueta`,
  `datosDeEtiqueta` y `textosConFuenteEmbebida`. `importeDeEtiqueta` sin caída y sin el import de
  `MONEDA_PLATAFORMA` (design §5).
  - Los tests que llaman sin moneda pasan `MONEDA_PLATAFORMA`:
    - `tests/unit/pdf/etiquetas-capacidad.test.ts`;
    - `tests/unit/pdf/etiquetas-diseno-353.test.ts`;
    - `tests/unit/pdf/etiquetas-caracter-no-cubierto.test.ts`.
  - Este último gana el caso de R7: una moneda cuyo símbolo la fuente no cubre lanza
    `ErrorCaracterNoImprimible` antes de escribir.
  - *Hecho:* los tres en verde; `etiquetas-lote-pdf-service.test.ts` verde sin tocarlo.
- [x] **T2.2** `app/(app)/ordenes/_components/etiquetas-pdf.ts`: `moneda` obligatoria en
  `buildEtiquetasPdf` y `descargarEtiquetasPdf`, y se pasa a `drawEtiqueta`. Depende de T2.1.
  - Los llamantes de test pasan `MONEDA_PLATAFORMA`:
    - `tests/unit/components/etiquetas-pdf.test.ts`, con el `@ts-expect-error` de R14 para
      `buildEtiquetasPdf` y `drawEtiqueta` sin moneda;
    - `tests/unit/components/etiquetas-pdf-descarga.test.ts`;
    - `tests/components/EtiquetaFechaEnPantalla.test.tsx`.
  - `tests/unit/pdf/etiquetas-dos-generadores.test.ts` gana el caso de R6 con `MONEDA_DE_PRUEBA`.
  - *Hecho:* los cuatro en verde.
- [x] **T2.3** `EtiquetasGuiaModal.tsx` lee `useMonedaDelPais()` y la pasa a `descargarEtiquetasPdf`.
  `EtiquetaGuia.tsx` pinta con `formatearMontoEn(moneda, montoCobrar)`. Depende de T2.2.
  - `tests/components/EtiquetasGuiaModal.test.tsx`: las dos aserciones `toHaveBeenCalledWith` ganan el
    cuarto argumento (`MONEDA_PLATAFORMA` sin proveedor), más un caso con el proveedor de prueba (R6).
  - `tests/components/EtiquetaGuiaPreview.test.tsx`: paridad vista previa ↔ PDF con la moneda de
    prueba (R6).
  - Casos de R5 en `moneda-del-pais-ordenes.test.tsx`.
  - *Hecho:* en verde, y `tests/components/EtiquetaGuia.test.tsx` verde sin tocarlo.

## Bloque 3 — Pantallas y rótulos (R1–R4, R8–R11, R16) (puede ir en paralelo con el bloque 2; T3.3 depende de T1.1)

- [ ] **T3.1** [P] Carga masiva: `OrdenesCargaResumen.tsx` (R2) y `OrdenesConMontoAjustadoTabla.tsx` con
  la moneda del país a escala 2 (R3, design §4, nota de R3).
  - *Hecho:* casos de R2 y R3 en verde; `OrdenesCargaResumen.test.tsx` y `OrdenesCargaPreview.test.tsx`
    verdes sin tocarlos.
- [ ] **T3.2** [P] `CorregirUbicacionAviso.tsx`: `importe(u, campo, moneda)` (R4). Sus rótulos, en
  T3.6.
  - *Hecho:* casos de R4 en verde; los tests existentes del aviso, verdes sin tocarlos.
- [ ] **T3.3** [P] Incidentes (depende de T1.1).
  - `IncidentesAdminModule.tsx`: el detalle con `formatearMontoEn`, y `montoAyuda(moneda)` /
    `montoExcede(moneda)` en lugar de `MONTO_AYUDA` / `MONTO_EXCEDE` (R9, R10).
  - `IncidentesHistoricoTabla.tsx`: `columnasHistorico(onAbrir, moneda)` (R9).
  - Ninguno de los dos importa ya `money` ni `moneyTope` de `cierre-detalle-shared`.
  - `tests/components/IncidentesAdminModule.test.tsx` pasa a `montoExcede(MONEDA_PLATAFORMA)` y conserva
    el literal entero `₡9.999.999.999,99 (10 dígitos y 2 decimales)…` (R12, R17).
  - `tests/components/DineroIdentidadesEnPantalla.test.tsx`: el test del tope lee
    `montoExcede(MONEDA_PLATAFORMA)`, y `USA_EL_FORMATEADOR` gana `formatearMontoEn|formatearTopeEn`
    (design §6).
  - *Hecho:* casos de R9 y R10 en verde y esos dos tests en verde.
- [ ] **T3.4** [P] Registro de acciones: `columnasHistorialAcciones(moneda)` como función y
  `HistorialAccionesModule.tsx` con `useMemo` sobre el hook (R11).
  - Pasan a `columnasHistorialAcciones(MONEDA_PLATAFORMA)`:
    - `tests/components/HistorialAccionesValorInfo.test.tsx`;
    - `tests/unit/components/historial-acciones-descarga-columnas.test.ts`;
    - `tests/integration/db/455/caracterizacion/snapshot-correccion.test.ts`.
  - *Hecho:* casos de R11 en verde; los tres en verde sin cambiar ningún valor esperado (R15);
    `estado-con-info.guardia.test.ts` verde sin tocarlo.
- [ ] **T3.5** [P] Pantallas que ya cumplen por SLT-235: solo tests.
  - Celdas de `ordenes-columns` (R1).
  - `PosOrderCardDetalle` con `novedadAOrdenCard` (R8).
  - *Hecho:* casos de R1 y R8 en verde, sin tocar producción.
- [ ] **T3.6** Rótulos con impuesto de órdenes (R16, design §5). Va después de T3.2, porque comparte
  `CorregirUbicacionAviso.tsx`.
  - `rotulos-con-impuesto.ts` (nuevo) con `rotuloFleteConImpuesto` y `rotuloComisionConImpuesto`.
  - `ordenes-columns.tsx`: los encabezados de `flete` y `comision` desde
    `rotulo…ConImpuesto(IMPUESTO_ROTULO)`, y `conImpuestoDelPais(columnas, impuesto)`, que con el
    rótulo de la plataforma devuelve el mismo arreglo.
  - `OrdenesModule.tsx`: `useImpuestoDelPais()`, `conImpuestoDelPais` dentro de un `useMemo` sobre lo
    que ya monta, y `columnasDescargaOrdenes(etiquetas, impuesto)`.
  - `ordenes-descarga-columnas.ts`: `COLUMNAS_DESCARGA_ORDENES` con el rótulo de caída, y
    `columnasDescargaOrdenes(etiquetas, impuesto)` sustituye los encabezados de `fleteConIva` y
    `comisionConIva`.
  - `CorregirUbicacionAviso.tsx`: se borran `AVISO_FILA_FLETE` y `AVISO_FILA_COMISION`; las filas pintan
    `rotulo…ConImpuesto(useImpuestoDelPais())`.
  - Tests:
    - `tests/unit/components/ordenes-descarga-columnas.test.ts`: sus dos llamadas pasan
      `IMPUESTO_ROTULO`, la lista de 22 encabezados no cambia, y gana el caso «IGV» y el de
      `conImpuestoDelPais` (mismo arreglo con el rótulo de la plataforma).
    - En `moneda-del-pais-ordenes.test.tsx`: el listado montado por `OrdenesModule` y el aviso con
      «Flete + IGV» / «Comisión + IGV», y el censo «sin IVA» de los cuatro archivos con su
      contraprueba.
  - *Hecho:* esos casos en verde. Siguen verdes sin tocarlos `ordenes-columns.test.tsx`,
    `OrdenesPage.test.tsx`, `OrdenesDescargaColumnas.test.tsx`, `detalle-columnas.test.tsx`,
    `recibidas-columns.test.tsx`, `ordenes-columnas-money-safe.guardia.test.ts` y los de integración de
    descarga (R12).

## Bloque 4 — Guardias y cierre (depende de los bloques 1–3)

- [ ] **T4.1** Censo de R18 de SLT-235: `CENSO_MONEDA_DEL_PAIS` de
  `tests/components/moneda-del-pais-pantallas.test.tsx` gana los 12 archivos de design §7 (R18).
  - *Hecho:* en verde, y rojo si en uno de ellos se reescribe un `money(` o un `formatMonto(` de
    `@/lib/config/moneda`.
- [ ] **T4.2** `pais-sin-literales` (R19): no hay entradas de SLT-240 que quitar y el tope sigue en 19.
  - Caso en `moneda-del-pais-ordenes.test.tsx`: ninguna excepción con `ficha === "SLT-240"`.
  - No se toca `FichaQueLoRetira` (decisión P2: se limpia al cerrar la última rebanada).
  - *Hecho:* `pnpm run test:guardias` en verde.
- [ ] **T4.3** Cierre.
  - `./init.sh` en verde.
  - E2E en local sobre una base desechable (`docs/perfil-agentes.md > E2E en local antes del PR`):
    - el grupo `dinero`;
    - `e2e/etiquetas-lote-tienda.spec.ts`;
    - `e2e/seleccion-entre-busquedas.spec.ts`;
    - `e2e/historial-orden.spec.ts`.
  - El mapa R → test va en `progress/impl_SLT-240.md`.
  - El reviewer comprueba en el diff:
    - R15: de los `*-descarga-columnas.ts` solo cambia `ordenes-descarga-columnas.ts`, y solo en sus
      encabezados;
    - R17: ningún texto de formato de entrada cambiado, ni un «IVA» fuera de los archivos de T3.6;
    - que no hay archivos de plataforma.
  - *Hecho:* todo verde y el mapa con los 19 requisitos.

## Archivos esperados

Producción:
- `lib/config/moneda.ts`
- `lib/pdf/etiquetas-dibujo.ts`
- `app/(app)/ordenes/_components/etiquetas-pdf.ts`
- `app/(app)/ordenes/_components/EtiquetasGuiaModal.tsx`
- `app/(app)/ordenes/_components/EtiquetaGuia.tsx`
- `app/(app)/ordenes/_components/OrdenesCargaResumen.tsx`
- `app/(app)/ordenes/_components/OrdenesConMontoAjustadoTabla.tsx`
- `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx`
- `app/(app)/incidentes/_components/IncidentesAdminModule.tsx`
- `app/(app)/incidentes/_components/IncidentesHistoricoTabla.tsx`
- `app/(app)/historico/acciones/_components/historial-acciones-columnas.ts`
- `app/(app)/historico/acciones/_components/HistorialAccionesModule.tsx`
- `app/(app)/ordenes/_components/rotulos-con-impuesto.ts`
- `app/(app)/ordenes/_components/ordenes-columns.tsx`
- `app/(app)/ordenes/_components/ordenes-descarga-columnas.ts`
- `app/(app)/ordenes/_components/OrdenesModule.tsx`

Tests:
- `tests/components/moneda-del-pais-ordenes.test.tsx`
- `tests/components/moneda-del-pais-pantallas.test.tsx`
- `tests/unit/config/moneda-formato-pais.test.ts`
- `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`
- `tests/unit/pdf/etiquetas-capacidad.test.ts`
- `tests/unit/pdf/etiquetas-diseno-353.test.ts`
- `tests/unit/pdf/etiquetas-caracter-no-cubierto.test.ts`
- `tests/unit/pdf/etiquetas-dos-generadores.test.ts`
- `tests/unit/components/etiquetas-pdf.test.ts`
- `tests/unit/components/etiquetas-pdf-descarga.test.ts`
- `tests/components/EtiquetaFechaEnPantalla.test.tsx`
- `tests/components/EtiquetasGuiaModal.test.tsx`
- `tests/components/EtiquetaGuiaPreview.test.tsx`
- `tests/components/IncidentesAdminModule.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/components/HistorialAccionesValorInfo.test.tsx`
- `tests/unit/components/historial-acciones-descarga-columnas.test.ts`
- `tests/integration/db/455/caracterizacion/snapshot-correccion.test.ts`
- `tests/unit/components/ordenes-descarga-columnas.test.ts`
- `tests/unit/services/etiquetas-lote-pdf-service.test.ts` (añadido el 2026-11-20 al implementar T2.1, aceptado
  por el leader: su caso `montoCobrar` probaba la caída a CR sin moneda que R14 quita; se borra esa aserción
  y el `?` de `moneda?`. Total 36/40)

Grep del 2026-11-20. Si el typecheck o un test señalan otro llamante (de `columnasHistorialAcciones`,
`MONTO_EXCEDE`, `columnasDescargaOrdenes`, `buildEtiquetasPdf` o `drawEtiqueta`), se añade aquí antes
del PR.

## Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 16 | unas 260 |
| Tests | 19 | unas 750 (unas 520 del archivo nuevo) |
| **Total** | **35** | |

Es el 87,5% de `gate.tamano_pr` (40 archivos). Pasa del aviso del 80%, y el humano lo aceptó
(decisión P1, máximo 40). Quedan 5 archivos de margen para algún llamante que aparezca al implementar;
si se pasa de 40, el implementer para y el leader decide. Las líneas quedan muy por debajo de sus dos
topes (1 000 de producción y 3 000 de tests).
