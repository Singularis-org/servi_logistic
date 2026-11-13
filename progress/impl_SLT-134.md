# SLT-134 «Textos de pantalla de cierres en tú, con guardia» — bitácora de implementación

Tanda 1 (frontend_dev, 2026-11-13): T0.1 (anotada), T0.2, T1.1-T1.3, T2.1-T2.4. T3 y T4 no son de esta tanda.

## T0.1 — Partida (hecha por el leader)

La rama trae `origin/dev` y, encima, la rama de SLT-141 «Excel del modelo nuevo: hojas por cierre de
bodega» (PR #153, sin mergear): rama **apilada**. Por eso `git log origin/dev..HEAD` no está vacío (trae
los commits de SLT-141) y el gate de partida solo sale rojo por el tamaño del PR (3 324 líneas de
SLT-141); ningún otro rojo. `.env` y `node_modules` ya estaban.

## T0.2 — Re-censo sobre el árbol actual (con SLT-139, SLT-140 y SLT-141 dentro)

Hecho con la propia guardia (T1.2) sobre `censoModulo()` = 102 archivos (88 de árboles + 2 sueltos + 12 de `lib/`), y Grep de los textos viejos en
`tests/` y `e2e/`.

- **Voseo: 47 textos en 12 archivos (59 formas). «Usted»: 0.** Los mismos 12 archivos y las mismas
  47 filas del inventario re-censado. **Ningún texto nuevo**: los archivos nuevos de SLT-140/141
  (`cierres-bodega-modelo-nuevo-descarga*.ts`, `cierres-gestiones-modelo-nuevo-descarga*.ts`, …) no
  tienen voseo. Ningún falso positivo: `EXCEPCIONES` se queda en las 24 de partida.
- Lo único que cambió son líneas: `CierresAdminModule.tsx` A1 371 · A2 389 · A3 391 · A4 675 · A5 734,
  778 · A6 775, 858, 1101 · A7 856 · A8 860 · A9 1099 · A10 1103 · A11 1488; `CierresBodegaAdminModule.tsx`
  D1 363 · A6 367 · D2 371. Los demás, en la línea del inventario.
- Hallazgo aparte: `ConsolidacionBodegaModule.tsx` l.358 ya tenía «Tu sesión expiró. Inicia sesión de
  nuevo.» en «tú» (no es fila del inventario). Tras T2 el texto A6 aparece **2** veces en ese archivo; la
  fila A6 del test lo cuenta así.
- **Tests que afirman el texto viejo: los mismos 17 archivos.** Las otras coincidencias de Grep son de
  otros módulos (Incidentes, Novedades, Wallet, Reparto, Anular movimiento, asistente) o la
  contraprueba de `cola-propia-vista.test.ts` l.138 («Usá los filtros» como muestra de voseo): fuera.
  Ningún E2E.
- **`## Archivos esperados` = 32: P4 no salta.**

## T1 — Guardia de trato

- T1.1 `tests/fixtures/censo-cierres.ts`: censo compartido + `textosDeFuente` por AST.
- T1.2/T1.3 `tests/unit/guards/cierres-trato-tu.guardia.test.ts`.

### Rojo antes de T2 (la prueba de que muerde)

`vitest run tests/unit/guards/cierres-trato-tu.guardia.test.ts` → `Tests 44 failed | 110 passed (154)`,
`EXIT=1`:
- «R56/R142: ningún texto del censo…»: **59 hallazgos (47 textos, 12 archivos)**:
  - `app/(app)/cierre-dia/_components/CierreDiaModule.tsx:211` podés
  - `app/(app)/cierre-dia/_components/CierreDiaModule.tsx:212` intentá
  - `app/(app)/cierre-dia/_components/CierreDiaModule.tsx:417` tenés
  - `app/(app)/cierre-dia/_components/CierreDiaModule.tsx:418` intentá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:371` indicá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:389` revisá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:391` escribí
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:675` tenés
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:675` contactá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:734` intentá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:775` iniciá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:778` intentá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:856` tenés
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:858` iniciá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:860` intentá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:1099` tenés
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:1101` iniciá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:1103` intentá
  - `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:1488` indicá
  - `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx:363` tenés
  - `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx:367` iniciá
  - `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx:371` intentá
  - `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx:392` tenés
  - `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx:394` iniciá
  - `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx:396` intentá
  - `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx:423` tenés
  - `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx:423` contactá
  - `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx:154` vaciá
  - `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx:174` elegí
  - `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx:195` ampliá
  - `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx:195` vaciá
  - `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx:195` volvé
  - `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx:197` elegí
  - `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx:197` volvé
  - `app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx:394` usá
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:45` tené
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:45` confirmá
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:45` escaneá
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:45` escribí
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:51` escaneá
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:51` escribí
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:69` avisá
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:119` escaneá
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:119` escribí
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:138` rechazá
  - `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:139` rechazá
  - `app/(app)/cierres-admin/_components/cierre-labels.ts:171` vos
  - `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts:50` podés
  - `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts:52` revisá
  - `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts:52` intentá
  - `app/(app)/cierres-admin/error.tsx:38` mirá
  - `app/(app)/cierres-admin/error.tsx:39` volvé
  - `app/(app)/cierres-admin/error.tsx:39` revisá
  - `components/private/cierres/fila/fila-gestion-labels.ts:97` escribile
  - `components/shared/conciliacion/conciliacion-labels.ts:56` escribí
  - `components/shared/conciliacion/conciliacion-labels.ts:61` escribí
  - `components/shared/conciliacion/conciliacion-labels.ts:77` tenés
  - `components/shared/conciliacion/conciliacion-labels.ts:78` iniciá
  - `components/shared/conciliacion/conciliacion-labels.ts:79` intentá
- Anexo A: 43 de 44 casos rojos (el único verde, A6 en `ConsolidacionBodegaModule.tsx`, por la l.358 que
  ya estaba en «tú»; al terminar T2 esa fila exige 2).
- Contraprueba, R143, R394, R393 y control positivo: verdes.

## T2 — Textos (47 textos en 12 archivos, Anexo A)

Cada texto viejo cambiado en su sitio por el literal del Anexo A, con un script de un solo uso que exigía
el número exacto de apariciones de cada texto viejo (`cambios=47 fallos=0 archivos=12`). Solo cadenas;
las plantillas A2 y B6 conservan su interpolación; el JSX de A4 conserva su sangría. Comentario de P3
corregido en `fila-gestion-labels.ts` (J3 y L4: misma regla y mismo imperativo, la frase de pantalla nombra
la pantalla de ayuda). Diff de producción: `12 files changed, 52 insertions(+), 51 deletions(-)` (47
literales + 5/4 líneas del comentario).

Tests: literales viejos → texto nuevo escrito a mano, sin tocar comentarios de historia
(`CierresAdminConfirmacionFisica.test.tsx` l.409, `CierreDiaModule.test.tsx` l.1503) ni la negación de
`CierresAdminPage.test.tsx` l.273. 33 literales en **16** archivos (no 17):

- **Corrección del inventario:** `PagoMensajeroAcciones.test.tsx` l.290 NO afirma F2: monta
  `app/(app)/wallet/mensajeros/_components/PagoMensajeroAcciones.tsx`, cuyo texto es
  `wallet-mensajeros-labels.ts` l.214 (`PAGO_MENSAJERO_WALLET.noRegistrado`, mismo texto que F2 pero fuera
  del censo). Lo cambié por error y `vitest related` lo puso rojo; revertido. Queda con voseo, fuera de
  alcance (como P2: trato en las pantallas de wallet). **Archivos de la ficha: 31, no 32.**
- `RedDeErrores.test.tsx` l.268 afirmaba G2 por regex (`/revisá el estado/i`), que el Grep de literales no
  vio: `vitest related` lo puso rojo; ahora `/revisa el estado/i`.
- `CierreDiaComprobanteMarcasDeOrigen.test.tsx` (H1 l.72 y J3 l.326) va entero en el commit de T2.3.

## T2.4 — Guardia verde y mutaciones

`vitest run tests/unit/guards/cierres-trato-tu.guardia.test.ts` → `Tests 154 passed (154)`, `GUARD_EXIT=0`
(0 hallazgos; 44 casos del Anexo A = 40 filas, A6 con 4 archivos y A4 con 2).

Mutaciones (cada una aplicada sobre una copia, corrida la guardia y restaurada; sin commitear):

1. «Intentá» en `CierreDiaModule.tsx` l.212 → `EXIT=1`, 2 rojos: «ningún texto…» con
   `app/(app)/cierre-dia/_components/CierreDiaModule.tsx:212 intentá «No se pudo deshacer la gestión. Intentá de nuevo.»`
   y J2.
2. «Escribile» en `fila-gestion-labels.ts` → `EXIT=1`, 2 rojos: `…/fila-gestion-labels.ts:98 escribile «…»`
   (regla 3) y J3.
3. `palabras` con `/\w+/g` (sin bandera `u` ni `\p{L}`) → `EXIT=1`, 44 rojos, entre ellos «terminación
   aguda» y toda la contraprueba con tilde.
4. Borrar `esté` de `EXCEPCIONES` → `EXIT=1`: `app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx:150
   esté «Cada estado vive en una sola de las dos listas, …»` (subjuntivo real en un texto: la excepción hace
   falta).
5. Quitar `lib/services/CierreDiaService.ts` de `CENSO_LIB` → `EXIT=1`, «R145: control positivo» rojo.
6. Mover la guardia a `tests/unit/utils/` **con el mismo nombre** → R393 verde (`EXIT=0`): el nombre
   `*.guardia.test.ts` ya contiene `guard`, y `test-rapido.mjs` casa por subcadena de la ruta, así que el
   gate rápido la sigue corriendo. Moverla **y** quitarle `guard` del nombre
   (`tests/unit/utils/cierres-trato-tu.test.ts`) → `EXIT=1`: «tests/unit/utils/cierres-trato-tu.test.ts no
   casa con ["guard"]». Restaurada.

## Comandos (salida real)

- `pnpm run typecheck` → `TC_EXIT=0` (sin errores).
- `pnpm exec eslint <29 tocados + fixture + guardia>` → `LINT_EXIT=0`, `0 errors, 2 warnings`
  (`_recorte` sin usar en `DescargarGestionesDialog.test.tsx` l.137/150; ya estaban, no son de esta ficha).
- `pnpm exec vitest related --run <12 de producción + 17 tests + fixture + guardia>` →
  `Test Files 3 failed | 233 passed (236)`, `Tests 3 failed | 3886 passed (3889)`, `EXIT=1`:
  - `PagoMensajeroAcciones` y `RedDeErrores`: los dos de arriba, arreglados; re-corridos →
    `2 passed`.
  - `tests/components/paginacion/paginacion-transversal.test.tsx` («ninguno de los TRECE proyecta el array
    de la página»: `CierresBodegaSolicitadosLista.tsx` no casa con `/filasDesdeResultado\(/`): **rojo
    heredado de SLT-141** (ese archivo lo cambia `9e43eeb8 feat(SLT-141): …`; esta ficha no lo toca). Re-corrido:
    sigue rojo, `EXIT=1`. Abierto para el leader / SLT-141.
- Guardia final: `Tests 154 passed (154)`, `GUARD_EXIT=0`.

## Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R56 | `cierres-trato-tu.guardia.test.ts` «R56/R142: ningún texto del censo…» (mutaciones 1-2) |
| R142 | idem + «la terminación aguda marca…», «el hallazgo nombra ruta, línea y forma», «en un comentario o en un especificador de import no cuenta» |
| R143 | «R143: no marca formas de «tú»…», «R143: cada excepción lleva motivo y no pasan de 40» |
| R144 | describe «SLT-134 · Anexo A (R144)» (40 filas, 44 casos) + los 16 tests de componente/unidad con el literal nuevo |
| R145 | «R145: control positivo del censo…» (mutación 5) y las 5 contraprueba `it.each` por lista |
| R146 | diff de producción solo literales + comentario P3; los 16 tests verdes con solo el literal cambiado (T4.1 lo revisa) |
| R392 | la guardia de trato importa `tests/fixtures/censo-cierres.ts` (la de diálogos, en T3) |
| R393 | «R393: la guardia corre en el gate rápido…» (mutación 6) |
| R394 | «R394: ni la tilde que falta ni los posesivos marcan» |

## Veredicto

Tanda 1 hecha: 47 textos en «tú» con el Anexo A, guardia de trato ROJA (59 hallazgos / 47 textos / 12
archivos) → VERDE, mutaciones 1-6 anotadas; P4 no salta (31 archivos); un rojo heredado de SLT-141 abierto.
