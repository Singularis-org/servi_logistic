# SLT-240 — Moneda del país en pantallas: órdenes, novedades e incidentes · tasks

> Requisitos en `requirements.md`; el cómo, en `design.md`. Una task está hecha cuando pasa su criterio
> **y** `pnpm run typecheck` está en verde. `[P]` = puede ir en paralelo con las otras `[P]` de su
> bloque. Cada task de pantalla añade sus casos a `tests/components/moneda-del-pais-ordenes.test.tsx`
> (archivo nuevo, lo crea la primera que llegue). Cada caso se prueba con `MONEDA_DE_PRUEBA`, con
> `MONEDA_CR` y sin proveedor: con `MONEDA_CR` el texto debe ser el mismo que sin proveedor (R12, R13).
> Los tests existentes que solo cambian la forma de llamar pasan `MONEDA_PLATAFORMA` y **no cambian
> ningún valor esperado**.

## Bloque 1 — Formateador de topes (R10)

- [ ] **T1.1** Exportar `formatearTopeEn(moneda, max, sinMonto = SIN_MONTO)` en `lib/config/moneda.ts`
  y actualizar su comentario (design §3).
  - En `tests/unit/config/moneda-formato-pais.test.ts`:
    - con `MONEDA_DE_PRUEBA`, `"9999999999.99"` → `€9 999 999 999`;
    - lo recompuesto de un corpus de topes nunca supera la entrada;
    - `null` → `sinMonto`.
  - En `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`, dentro del `it` de
    `moneyTope`: `formatearTopeEn(MONEDA_PLATAFORMA, x) === formatMontoTope(x)` en todo el corpus.
  - *Hecho:* los dos en verde y `CAMINOS_PUBLICOS` sigue en 7.

## Bloque 2 — PDF de etiquetas del navegador (R5, R6, R7, R14)

- [ ] **T2.1** `lib/pdf/etiquetas-dibujo.ts`: `moneda: FormatoMoneda` obligatoria en `drawEtiqueta`,
  `datosDeEtiqueta` y `textosConFuenteEmbebida`. `importeDeEtiqueta` sin caída y sin el import de
  `MONEDA_PLATAFORMA` (design §5).
  - Los tests que llaman sin moneda pasan `MONEDA_PLATAFORMA`:
    - `tests/unit/pdf/etiquetas-capacidad.test.ts`;
    - `tests/unit/pdf/etiquetas-diseno-353.test.ts`;
    - `tests/unit/pdf/etiquetas-caracter-no-cubierto.test.ts`.
  - Este último gana el caso de R7: una moneda cuyo símbolo la fuente no cubre lanza
    `ErrorCaracterNoImprimible` antes de escribir.
  - *Hecho:* los tres en verde; `etiquetas-lote-pdf-service.test.ts` verde sin tocarlo.
- [ ] **T2.2** `app/(app)/ordenes/_components/etiquetas-pdf.ts`: `moneda` obligatoria en
  `buildEtiquetasPdf` y `descargarEtiquetasPdf`, y se pasa a `drawEtiqueta`. Depende de T2.1.
  - Los llamantes de test pasan `MONEDA_PLATAFORMA`:
    - `tests/unit/components/etiquetas-pdf.test.ts`, con el `@ts-expect-error` de R14 para
      `buildEtiquetasPdf` y `drawEtiqueta` sin moneda;
    - `tests/unit/components/etiquetas-pdf-descarga.test.ts`;
    - `tests/components/EtiquetaFechaEnPantalla.test.tsx`.
  - `tests/unit/pdf/etiquetas-dos-generadores.test.ts` gana el caso de R6 con `MONEDA_DE_PRUEBA`.
  - *Hecho:* los cuatro en verde.
- [ ] **T2.3** `EtiquetasGuiaModal.tsx` lee `useMonedaDelPais()` y la pasa a `descargarEtiquetasPdf`.
  `EtiquetaGuia.tsx` pinta con `formatearMontoEn(moneda, montoCobrar)`. Depende de T2.2.
  - `tests/components/EtiquetasGuiaModal.test.tsx`: las dos aserciones `toHaveBeenCalledWith` ganan el
    cuarto argumento (`MONEDA_PLATAFORMA` sin proveedor), más un caso con el proveedor de prueba (R6).
  - `tests/components/EtiquetaGuiaPreview.test.tsx`: paridad vista previa ↔ PDF con la moneda de
    prueba (R6).
  - Casos de R5 en `moneda-del-pais-ordenes.test.tsx`.
  - *Hecho:* en verde, y `tests/components/EtiquetaGuia.test.tsx` verde sin tocarlo.

## Bloque 3 — Pantallas (R1–R4, R8–R11) (puede ir en paralelo con el bloque 2; T3.3 depende de T1.1)

- [ ] **T3.1** [P] Carga masiva: `OrdenesCargaResumen.tsx` (R2) y `OrdenesConMontoAjustadoTabla.tsx` con
  la moneda del país a escala 2 (R3, design §4, nota de R3).
  - *Hecho:* casos de R2 y R3 en verde; `OrdenesCargaResumen.test.tsx` y `OrdenesCargaPreview.test.tsx`
    verdes sin tocarlos.
- [ ] **T3.2** [P] `CorregirUbicacionAviso.tsx`: `importe(u, campo, moneda)` (R4). Los rótulos «IVA» no
  cambian (R16).
  - *Hecho:* casos de R4 en verde; los tests existentes del aviso, verdes sin tocarlos.
- [ ] **T3.3** [P] Incidentes (depende de T1.1).
  - `IncidentesAdminModule.tsx`: el detalle con `formatearMontoEn`, y `montoAyuda(moneda)` /
    `montoExcede(moneda)` en lugar de `MONTO_AYUDA` / `MONTO_EXCEDE` (R9, R10).
  - `IncidentesHistoricoTabla.tsx`: `columnasHistorico(onAbrir, moneda)` (R9).
  - Ninguno de los dos importa ya `money` ni `moneyTope` de `cierre-detalle-shared`.
  - `tests/components/IncidentesAdminModule.test.tsx` pasa a `montoExcede(MONEDA_PLATAFORMA)` y conserva
    el literal entero `₡9.999.999.999,99 (10 dígitos y 2 decimales)…` (R12, R16).
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

## Bloque 4 — Guardias y cierre (depende de los bloques 1–3)

- [ ] **T4.1** Censo de R18 de SLT-235: `CENSO_MONEDA_DEL_PAIS` de
  `tests/components/moneda-del-pais-pantallas.test.tsx` gana los 11 archivos de design §6 (R17).
  - *Hecho:* en verde, y rojo si en uno de ellos se reescribe un `money(` o un `formatMonto(` de
    `@/lib/config/moneda`.
- [ ] **T4.2** `pais-sin-literales` (R18): no hay entradas de SLT-240 que quitar y el tope sigue en 19.
  - Caso en `moneda-del-pais-ordenes.test.tsx`: ninguna excepción con `ficha === "SLT-240"`.
  - P2 queda para el humano; no se toca `FichaQueLoRetira`.
  - *Hecho:* `pnpm run test:guardias` en verde.
- [ ] **T4.3** Cierre.
  - `./init.sh` en verde.
  - E2E en local sobre una base desechable (`docs/perfil-agentes.md > E2E en local antes del PR`):
    - el grupo `dinero`;
    - `e2e/etiquetas-lote-tienda.spec.ts`;
    - `e2e/seleccion-entre-busquedas.spec.ts`;
    - `e2e/historial-orden.spec.ts`.
  - El mapa R → test va en `progress/impl_SLT-240.md`.
  - El reviewer comprueba en el diff R15 (ningún `*-descarga-columnas.ts`), R16 (ningún texto «IVA»
    ni de formato de entrada cambiado) y que no hay archivos de plataforma.
  - *Hecho:* todo verde y el mapa con los 18 requisitos.

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

Grep del 2026-11-20. Si el typecheck o un test señalan otro llamante (de `columnasHistorialAcciones`,
`MONTO_EXCEDE`, `buildEtiquetasPdf` o `drawEtiqueta`), se añade aquí antes del PR.

## Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 12 | unas 200 |
| Tests | 18 | unas 650 (unas 450 del archivo nuevo) |
| **Total** | **30** | |

Es el 75% de `gate.tamano_pr` (40 archivos): quedan 2 archivos antes del aviso del 80%. Las líneas
quedan muy por debajo de sus dos topes (1 000 de producción y 3 000 de tests). Si P1 se resuelve
metiendo los rótulos «IVA» aquí (opción b), la ficha pasa del 80% y el leader decide.
