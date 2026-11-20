# impl SLT-240 «Moneda del país en pantallas: órdenes, novedades e incidentes» — backend_dev, tanda T1.1 + T2.1

## Archivos
- `lib/config/moneda.ts` — `formatearTopeEn(moneda, max, sinMonto = SIN_MONTO)` exportada; comentario actualizado (censo 359, no suma a `CAMINOS_PUBLICOS`).
- `lib/pdf/etiquetas-dibujo.ts` — `moneda: FormatoMoneda` obligatoria en `drawEtiqueta`, `datosDeEtiqueta`, `textosConFuenteEmbebida` e `importeDeEtiqueta`; fuera la caída y el import de `MONEDA_PLATAFORMA`.
- `tests/unit/config/moneda-formato-pais.test.ts` — describe «formatearTopeEn» (R10).
- `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts` — en el `it` de `moneyTope`: `formatearTopeEn(MONEDA_PLATAFORMA, x) === formatMontoTope(x)` en todo `CORPUS_STRING`.
- `tests/unit/pdf/etiquetas-capacidad.test.ts`, `etiquetas-diseno-353.test.ts` — pasan `MONEDA_PLATAFORMA`.
- `tests/unit/pdf/etiquetas-caracter-no-cubierto.test.ts` — pasa `MONEDA_PLATAFORMA` + describe SLT-240 R7 (símbolo U+20BF, cobertura real, `doc.text` no llamado) con control positivo.

## R → test
- R10: `moneda-formato-pais.test.ts > formatearTopeEn — …` (3 casos) y guardia 359 `moneyTope … (cota)`.
- R7: `etiquetas-caracter-no-cubierto.test.ts > SLT-240 — una moneda cuyo simbolo la fuente embebida no cubre`.
- R14 (lado de `lib/pdf`): firma obligatoria; el `@ts-expect-error` es de T2.2.

## Verificación (vitest de la raíz, el worktree no tiene node_modules)
- 5 archivos tocados: verdes (136 pasados, 1 skipped por BD).
- `tests/unit/services/etiquetas-lote-pdf-service.test.ts`: **1 rojo** — «el dato `montoCobrar` … sin ella, en la de CR» llama `datosDeEtiqueta(e)` sin moneda y espera la caída a CR que el design §5 elimina. Choque spec↔test; no tocado (fuera de la lista).
- typecheck: 168 errores; relevantes: `app/(app)/ordenes/_components/etiquetas-pdf.ts` (T2.2, esperado), `tests/unit/components/etiquetas-pdf.test.ts:874` (T2.2), `tests/unit/services/etiquetas-lote-pdf-service.test.ts:587` (inesperado, mismo choque). El resto: cliente Prisma viejo del node_modules compartido (no regenerado).
- lint de los 7 archivos: 0 errores, 1 warning previo (`salidasQueCasan`, línea 252, no es del diff).

Veredicto (tanda 1): T1.1 hecha; T2.1 hecha salvo el choque con `etiquetas-lote-pdf-service.test.ts`, que necesita decisión.

## Cierre de T2.1 (decisión del leader: quitar la caída a CR del test)
- `tests/unit/services/etiquetas-lote-pdf-service.test.ts` — test renombrado a «el dato `montoCobrar` de la etiqueta se pinta en la moneda recibida»; parámetro `moneda: FormatoMoneda` (obligatorio); fuera `expect(monto()).toBe("₡1.234.567")`. Los otros valores esperados no cambian; ningún import quedó sin uso.
- vitest (`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run tests/unit/services/etiquetas-lote-pdf-service.test.ts tests/unit/pdf/`, node_modules del worktree):
  `Test Files  1 failed | 13 passed (14)` / `Tests  9 failed | 238 passed (247)`. `etiquetas-lote-pdf-service.test.ts`: verde. Los 9 rojos son todos de `tests/unit/pdf/etiquetas-dos-generadores.test.ts` (R22): llama `buildEtiquetasPdf` sin moneda → `TypeError: Cannot read properties of undefined (reading 'decimales')` en `importeDeEtiqueta`. Es de T2.2 (generador del navegador).
- typecheck (`tsc --noEmit`, con `--max-old-space-size=8192`; sin él aborta con exit 134 por memoria): 14 errores, todos TS2554 por la moneda obligatoria, en `tests/components/EtiquetaFechaEnPantalla.test.tsx`, `tests/components/EtiquetaGuiaPreview.test.tsx`, `tests/unit/components/etiquetas-pdf.test.ts`, `tests/unit/components/etiquetas-pdf-descarga.test.ts`, `tests/unit/pdf/etiquetas-dos-generadores.test.ts`. Ninguno en `etiquetas-lote-pdf-service.test.ts` ni en `app/`. Ojo: en el worktree hay cambios sin commit de T2.2 que hizo otro agente (`etiquetas-pdf.ts`, `EtiquetaGuia.tsx`, `EtiquetasGuiaModal.tsx`, `etiquetas-pdf-descarga.test.ts`): ya cambiaron la firma de `buildEtiquetasPdf` y por eso los errores se movieron a sus llamadores en los tests.
- lint (`pnpm exec eslint tests/unit/services/etiquetas-lote-pdf-service.test.ts`): 0 problemas.

Veredicto: T2.1 cerrada; los rojos que quedan son de T2.2, que está en curso.

## T2.2–T2.3 (frontend_dev, 2026-11-20)

### Archivos
Producción:
- `app/(app)/ordenes/_components/etiquetas-pdf.ts` — `moneda: FormatoMoneda` obligatoria en `buildEtiquetasPdf` y `descargarEtiquetasPdf`; se pasa a `drawEtiqueta`.
- `app/(app)/ordenes/_components/EtiquetasGuiaModal.tsx` — `useMonedaDelPais()` y cuarto argumento de `descargarEtiquetasPdf`.
- `app/(app)/ordenes/_components/EtiquetaGuia.tsx` — `formatearMontoEn(useMonedaDelPais(), montoCobrar)` (fuera `formatMonto`).

Tests:
- `tests/unit/components/etiquetas-pdf.test.ts` — `construir` y `textosConFuenteEmbebida` con `MONEDA_PLATAFORMA`; nuevo `describe` R14 con `@ts-expect-error` en `buildEtiquetasPdf` y `drawEtiqueta` sin moneda (más un caso de ejecución: sin moneda lanza, no cae a la plataforma).
- `tests/unit/components/etiquetas-pdf-descarga.test.ts` — llamadas con `MONEDA_PLATAFORMA`; el caso R28 (símbolo por entorno) pasa la `MONEDA_PLATAFORMA` reimportada tras `resetModules`.
- `tests/components/EtiquetaFechaEnPantalla.test.tsx` — `MONEDA_PLATAFORMA`.
- `tests/unit/pdf/etiquetas-dos-generadores.test.ts` — `MONEDA_PLATAFORMA` en las dos llamadas; caso R6 con `MONEDA_DE_PRUEBA`.
- `tests/components/EtiquetasGuiaModal.test.tsx` — las dos `toHaveBeenCalledWith` ganan `MONEDA_PLATAFORMA`; caso R6 con el proveedor de prueba.
- `tests/components/EtiquetaGuiaPreview.test.tsx` — dos llamadas con `MONEDA_PLATAFORMA`; caso de paridad R6 con `MONEDA_DE_PRUEBA`.
- `tests/components/moneda-del-pais-ordenes.test.tsx` (nuevo) — casos de R5.

Ningún valor esperado de los tests existentes cambió. `tests/components/EtiquetaGuia.test.tsx` sin tocar.

### R → test
- R5: `moneda-del-pais-ordenes.test.tsx > SLT-240 R5 — vista previa de la etiqueta` (moneda de prueba, sin proveedor, CR = sin proveedor, `null` → `-` en los tres).
- R6: `etiquetas-dos-generadores.test.ts > SLT-240 R6 — …` (navegador = lote = `formatearMontoEn(MONEDA_DE_PRUEBA, v)`); `EtiquetasGuiaModal.test.tsx > SLT-240 R6: dentro del proveedor del pais…` (cuarto argumento `MONEDA_DE_PRUEBA`); `EtiquetaGuiaPreview.test.tsx > SLT-240 R6 — paridad vista previa <-> PDF…`.
- R14: `etiquetas-pdf.test.ts > SLT-240 R14 — sin moneda por defecto…` (`@ts-expect-error` en `buildEtiquetasPdf` y `drawEtiqueta`; lo hace cumplir el typecheck).
- R12/R13 (lo de esta tanda): los tests existentes verdes sin cambiar valores esperados, `EtiquetaGuia.test.tsx` verde sin tocar, y los casos CR/sin proveedor de R5.

### Salida real (worktree, node_modules propio, NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm exec vitest run tests/unit/components/etiquetas-pdf.test.ts tests/unit/components/etiquetas-pdf-descarga.test.ts tests/components/EtiquetaFechaEnPantalla.test.tsx tests/unit/pdf/etiquetas-dos-generadores.test.ts tests/components/EtiquetasGuiaModal.test.tsx tests/components/EtiquetaGuiaPreview.test.tsx tests/components/moneda-del-pais-ordenes.test.tsx tests/components/EtiquetaGuia.test.tsx`:
  `Test Files  8 passed (8)` / `Tests  140 passed (140)`.
- `pnpm run typecheck` (`tsc --noEmit`): 0 errores.
- `pnpm exec eslint` de los 10 archivos: 0 errores, 4 warnings `no-unused-vars` en `etiquetas-pdf.test.ts` (`MAQUETA_BASE`, `PT_A_MM_MAQUETA`, `lineasDe`, `textosConY`), los mismos 4 que en HEAD: previos, no del diff.

Veredicto (T2.2–T2.3): hechas; los cuatro de T2.2 y los de T2.3 en verde, typecheck en 0, sin archivos fuera de la lista.
