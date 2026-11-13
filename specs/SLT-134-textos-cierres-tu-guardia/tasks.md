# SLT-134 «Textos de pantalla de cierres en tú, con guardia» — tasks

> Diseño: `design.md`. Requisitos: `requirements.md` (R56, R142-R146, R390-R394). Todo lo hace
> `frontend_dev` (pantalla y tests; nada de `lib/`, `db/` ni `app/api/`). Cada task se commitea sola
> (`feat(SLT-134): …` / `test(SLT-134): …`), salvo T1.2, que va en el mismo commit que T2.4.
> Va **después** de SLT-139, SLT-140 y SLT-141 en el orden de merge (`design.md > Orden de merge`).

## T0 — Preparación

- [ ] **T0.1** Traer `origin/dev` con SLT-139, SLT-140 y SLT-141 dentro y copiar `.env` al worktree
  **antes** del primer gate.
  *Hecho:* `git log origin/dev..HEAD` vacío al empezar; `./init.sh` verde de partida, con
  `INIT_EXIT=` dentro del log.
- [ ] **T0.2** [P] Repetir el censo de `requirements.md > Inventario re-censado` (voseo en el censo de
  `SLT-103 > Definiciones` y tests que afirman el texto viejo) sobre el árbol de T0.1. Anotar en
  `progress/impl_SLT-134.md` lo que cambió.
  *Hecho:* la lista anotada. Si sale un texto con voseo nuevo, su texto en «tú» se escribe a mano en
  `progress/impl_SLT-134.md` antes de tocarlo. Si `## Archivos esperados` pasa de 32, **parar** y
  avisar al leader (P4: sacar D65 a otra ficha).

## T1 — Guardia de trato (R56, R142-R145, R392-R394)

- [ ] **T1.1** `tests/fixtures/censo-cierres.ts`: `CENSO_PANTALLA_ARBOLES`, `CENSO_PANTALLA_SUELTOS`,
  `CENSO_LIB`, `censoPantalla()`, `censoModulo()` y `textosDeFuente()` (`design.md > Censo`).
  *Hecho:* `censoModulo().length > 60`; un suelto inexistente lanza error; `textosDeFuente` de una muestra
  con `import`, `export … from`, `import()`, comentario y JSX devuelve solo los textos (comprobado en
  T1.2).
- [ ] **T1.2** `tests/unit/guards/cierres-trato-tu.guardia.test.ts` con detección, `EXCEPCIONES`, y todos
  los casos de `design.md > Casos` salvo el de Anexo A. Depende de T1.1.
  *Hecho:* contraprueba, R143, R394 y R393 verdes; el caso «ningún texto del censo…» **rojo con 47
  hallazgos en 12 archivos** (los de `## Inventario re-censado` más lo que añada T0.2), pegados en
  `progress/impl_SLT-134.md`. Si sale un hallazgo que no es voseo, va a `EXCEPCIONES` con motivo (≤ 40).
  No se commitea hasta T2.4.
- [ ] **T1.3** Describe «Anexo A» en la misma guardia: las 40 filas A1-K4 como literales escritos a mano,
  con archivo de hoy y número de apariciones (A4 ×2, A5 ×2, A6 ×6). Depende de T1.2.
  *Hecho:* rojo antes de T2 (ningún texto nuevo existe aún), anotado.

## T2 — Textos (R56, R144, R146)

Cada task cambia los textos de su grupo por el Anexo A **y** actualiza a mano los tests que los afirman.
Solo cadenas: ni constantes nuevas ni ramas nuevas.

- [ ] **T2.1** [P] `/cierres-admin`, mensajero: `CierresAdminModule.tsx` (14), `cierre-confirmacion-fisica.tsx`
  (6), `pago-mensajero-labels.ts` (2), `cierre-labels.ts` (1), `FiltrosCierresBarra.tsx` (1), `error.tsx`
  (2). Tests: `CierresAdminModule`, `CierresAdminPage` (l.363), `CierresAdminDeepLink`,
  `CierresAdminConfirmacionFisica`, `PagoMensajeroAcciones`, `RedDeErrores`,
  `ComprobanteMensajeroOrigenRechazo`, `CierreDiaComprobanteMarcasDeOrigen` (l.72, H1).
  *Hecho:* `pnpm exec vitest related --run <archivos>` verde; esos archivos sin hallazgos en T1.2.
- [ ] **T2.2** [P] `/cierres-admin`, bodega y descarga: `ConsolidacionBodegaModule.tsx` (4),
  `CierresBodegaAdminModule.tsx` (3), `DescargarGestionesDialog.tsx` (4). Tests:
  `ConsolidacionBodegaRefresco`, `CierresBodegaAdminDetalleUnico`, `descarga/DescargarGestionesDialog`.
  *Hecho:* igual que T2.1.
- [ ] **T2.3** [P] `/cierre-dia`: `CierreDiaModule.tsx` (4) y `fila-gestion-labels.ts` (J3, y el comentario
  de l.91-94, P3). Tests: `CierreDiaModule`, `CierreDiaModule477Correccion`,
  `CierreDiaComprobanteMarcasDeOrigen` (l.326), `FilaGestion`, `tests/unit/utils/fila-gestion-vista`.
  *Hecho:* igual que T2.1.
- [ ] **T2.4** Conciliación: `conciliacion-labels.ts` (5). Tests: `ConciliacionAccionesConAsientos`,
  `MarcarRecibidoDeclaradoCero`. Después, la guardia entera. Depende de T1.3, T2.1-T2.3.
  *Hecho:* `cierres-trato-tu.guardia.test.ts` verde entero (0 hallazgos, 40 filas del Anexo A);
  mutaciones 1-6 de `design.md` hechas y anotadas (cada una roja y revertida). Commit de T1 + T2.4.

## T3 — Guardia de diálogos: D65 (R390-R392)

- [ ] **T3.1** `cierres-dialogos-modal.guardia.test.ts` al censo del fixture, imports por AST con las vías
  nuevas, visor por AST (título plegado, `VISOR_EVIDENCIA_TEXTO.titulo`, declaración flecha) y control
  positivo ampliado (`design.md > Guardia de diálogos`). Depende de T1.1.
  *Hecho:* verde sobre el árbol; cada muestra nueva de la contraprueba detectada y, comentada, no;
  mutación: un `import { Sheet } from "@/components/ui/sheet"` en `ConciliacionAcciones.tsx` (local, sin
  commitear) → rojo con ruta y especificador.
- [ ] **T3.2** [P] `progress/deudas.md`: D65 a cerrada, con el commit y los R390-R392.
  *Hecho:* la entrada dice qué hueco cierra cada R.

## T4 — Cierre

- [ ] **T4.1** `./init.sh` verde. `git diff origin/dev -- app components` solo con cambios dentro de
  literales de cadena, plantillas, texto JSX y el comentario de P3 (R146), revisado a ojo y anotado.
  *Hecho:* gate verde con `INIT_EXIT=` en el log; nota «diff solo textos» en `progress/impl_SLT-134.md`.
- [ ] **T4.2** `progress/impl_SLT-134.md` con el mapa `R<n> → test` de `## Trazabilidad`, las mutaciones
  y la lista de Preview de `design.md`.
  *Hecho:* cada R con un test que existe y está verde.

## Trazabilidad

| R | Test |
|---|---|
| R56 | `tests/unit/guards/cierres-trato-tu.guardia.test.ts` («ningún texto del censo tiene voseo ni usted»; mutaciones 1-2) |
| R142 | `cierres-trato-tu.guardia.test.ts` («ningún texto…», «hallazgo nombra ruta, línea y forma», «comentario e import no cuentan», «terminación aguda») |
| R143 | `cierres-trato-tu.guardia.test.ts` («nada de R143 marca», «excepciones con motivo y ≤ 40») |
| R144 | `cierres-trato-tu.guardia.test.ts` describe «Anexo A» (A1-K4); y los 17 tests de componente/unidad actualizados con el literal nuevo |
| R145 | `cierres-trato-tu.guardia.test.ts` («control positivo», «contraprueba por forma»; mutación 5) |
| R146 | los 17 tests actualizados, verdes con solo el literal cambiado; T4.1 (diff solo textos) |
| R390 | `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` («R53: ningún archivo… importa un diálogo» y contraprueba de las vías nuevas; mutación de T3.1) |
| R391 | `cierres-dialogos-modal.guardia.test.ts` («R137: título…», «R137: declaración…», «R137: VISOR_EVIDENCIA_TEXTO.titulo…» y su contraprueba) |
| R392 | `cierres-dialogos-modal.guardia.test.ts` («control positivo», con los cuatro archivos nuevos); `cierres-trato-tu.guardia.test.ts` («control positivo»); los dos importan `tests/fixtures/censo-cierres.ts` |
| R393 | `cierres-trato-tu.guardia.test.ts` («la guardia está en `gate.siempre`»; mutación 6) |
| R394 | `cierres-trato-tu.guardia.test.ts` («sin tilde y posesivos no marcan») |

## Tamaño

Contra `gate.tamano_pr` por defecto (40 archivos, 1 000 líneas añadidas + borradas; `specs/` y
`progress/` no cuentan).

| Bloque | Archivos | Líneas estimadas |
|---|---|---|
| Producción: 47 textos en 12 archivos (+ comentario P3) | 12 | ~110 |
| Tests actualizados: ~45 literales en 17 archivos | 17 | ~100 |
| Guardia de trato nueva (detección, contraprueba, 40 filas del Anexo A) | 1 | ~380 |
| Fixture del censo y de textos | 1 | ~90 |
| Guardia de diálogos (AST, vías nuevas, contraprueba) | 1 | ~120 |
| **Total** | **32** | **~800** |

**32 de 40 archivos: el 80 % justo**, sin pasarlo. Líneas, bajo el tope. No hay margen: si T0.2 suma
un archivo, se para (P4).

## Archivos esperados

Producción:
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx`
- `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx`
- `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts`
- `app/(app)/cierres-admin/_components/cierre-labels.ts`
- `app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx`
- `app/(app)/cierres-admin/error.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `components/private/cierres/fila/fila-gestion-labels.ts`
- `components/shared/conciliacion/conciliacion-labels.ts`

Tests:
- `tests/unit/guards/cierres-trato-tu.guardia.test.ts`
- `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts`
- `tests/fixtures/censo-cierres.ts`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierresAdminPage.test.tsx`
- `tests/components/CierresAdminDeepLink.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`
- `tests/components/ConsolidacionBodegaRefresco.test.tsx`
- `tests/components/descarga/DescargarGestionesDialog.test.tsx`
- `tests/components/PagoMensajeroAcciones.test.tsx`
- `tests/components/RedDeErrores.test.tsx`
- `tests/components/ComprobanteMensajeroOrigenRechazo.test.tsx`
- `tests/components/CierreDiaComprobanteMarcasDeOrigen.test.tsx`
- `tests/components/CierreDiaModule.test.tsx`
- `tests/components/CierreDiaModule477Correccion.test.tsx`
- `tests/components/FilaGestion.test.tsx`
- `tests/components/ConciliacionAccionesConAsientos.test.tsx`
- `tests/components/MarcarRecibidoDeclaradoCero.test.tsx`
- `tests/unit/utils/fila-gestion-vista.test.ts`

Specs y progreso (no cuentan para el tamaño):
- `specs/SLT-134-textos-cierres-tu-guardia/requirements.md`
- `specs/SLT-134-textos-cierres-tu-guardia/design.md`
- `specs/SLT-134-textos-cierres-tu-guardia/tasks.md`
- `progress/impl_SLT-134.md`
- `progress/deudas.md`
