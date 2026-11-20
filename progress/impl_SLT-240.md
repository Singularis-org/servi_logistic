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

Veredicto: T1.1 hecha; T2.1 hecha salvo el choque con `etiquetas-lote-pdf-service.test.ts`, que necesita decisión.
