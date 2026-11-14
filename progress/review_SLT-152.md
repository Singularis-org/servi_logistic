# Review SLT-152 «Tablas de cierres legibles» — vuelta 1 (ruta ligera, acotada al diff)

Diff revisado: `git diff origin/dev...HEAD` (HEAD `e99557c5`, con origin/dev mergeado). Reviewer, 2026-11-13.

## Checklist

- [x] Ruta ligera correcta: solo pantalla (frontend), sin dinero/permisos/auth/integraciones en el diff.
- [x] **Solo pantalla.** Ningún archivo de descarga, `app/api`, `lib/`, servidor ni `prisma` en el diff
  (`git diff --name-only | grep -iE "descarga|app/api|lib/|server|actions|prisma"` vacío). `textoFiltro`
  solo lo usa `fila-gestion-vista.ts` (pastillas en pantalla); las descargas Excel no cambian.
- [x] **Dos columnas + recorte.** `columnasDe` da `destinatario` + `tienda` en todas las audiencias
  (T5, T6, T7 del inventario pasan por la misma `columnasDe`/`FilaGestion`/`GestionesCierre`). Las tres
  celdas de texto libre (Destinatario, Tienda, Mensajero) usan `TextoRecortado` = `<span class="block min-w-0 truncate" title=texto>`;
  cabecera y fila comparten `plantillaFila` y llevan `data-columna`. N1/N2 fuera, como dice el spec.
- [x] **E2E R446 no pasa en verde sin probar.** `textoSinMontar` (`e2e/cierre-bodega-satelite.spec.ts`)
  afirma primero `max(celda.scrollWidth, texto.scrollWidth) > celda.clientWidth` con un nombre de
  mensajero alargado en `beforeAll`, luego borde derecho de la celda y de todos sus descendientes ≤
  borde izquierdo de la siguiente, en cabecera y primera fila, y al final `texto.scrollWidth > texto.clientWidth`.
  Sin `block`, el span en línea da `scrollWidth`=0 → la última aserción también cae. La bitácora
  registra M1 en rojo por el solape (`457.29 > 375.57`) con la precondición en verde. No re-apliqué la mutación (instrucción).
- [x] **Literales a mano.** Cabeceras escritas a mano en `fila-gestion-vista.test.ts`,
  `CierreBodegaDetalleGestiones.test.tsx` (incl. plantilla `gridTemplateColumns` literal) y
  `DetalleCierreGestiones.test.tsx`; pestañas y pastillas literales («Pendientes (37)», «Todas (4)»…).
- [x] **Regex ajenos no aflojados.** `tarifas-activacion` y `cierre-modelo-nuevo-plan-porcentual`:
  `^${pestana.source}.* \d+$` → `^${pestana.source}.* \(\d+\)$` — mismo anclaje y el mismo `.*` que
  ya tenían; solo exigen además los paréntesis (más estricto, no más laxo). Lo mismo en los helpers
  `pestanaDeCola`/`pestanaDeColaBodega` y en los `/^… \(\d+\)$/` de `cierres-admin*`, `ajuste-pago…`.
- [x] **Commit final lleva los arreglos** (incidente del `git checkout --`): en el diff commiteado
  `ColaCierres.tsx:278` = `` `${p.label} (${p.conteo})` `` y `FilaGestion.tsx` `CELDA_RECORTA = "block min-w-0 truncate"`;
  `fila-gestion-labels.ts` `textoFiltro` = `` `${nombre} (${n})` ``. Árbol limpio (`git status --porcelain` vacío).
- [x] Trazabilidad R440-R450: cada R tiene un test que lo verifica de verdad (mapa en `progress/impl_SLT-152.md`,
  comprobado test por test: R443 plantilla y nº de celdas; R444 clases + `title` + sin hijos; R445 «—»;
  R447-R449 pestañas con `not.toMatch(/^\S.* \d+$/)`; R450 7 pastillas literales + negativo).
- [ ] Tasks: T1-T6 + T4b `[x]`; **T7 «Cierre» sigue `[ ]`** aunque su contenido está hecho (ver menor 1).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → AVISO 33/40 archivos, 51/1000 prod, 528/3000 tests. No pasa del máximo.
- [x] `## Lo que ya existe` presente y no vacía; el diff no re-crea nada de esa lista.
- [x] Perfil reviewer: sin tablas/queries/migraciones; sin literales de país/moneda en código nuevo de
  producción; sin dependencias nuevas; sin Ordenex. Toca pantallas → E2E afectados corridos en local
  (bitácora: 8 specs, `--project=dinero`, 2×54 passed, 0 failed/skipped/flaky).

## Verificación ejecutada por el reviewer

- `pnpm exec tsc --noEmit` → `TSC_EXIT=0`.
- `pnpm exec eslint <ts/tsx del diff>` → `ESLINT_EXIT=0`.
- `pnpm exec vitest run <19 tests del diff>` → `Test Files 19 passed (19)`, `Tests 439 passed (439)`.
- Guardias del módulo de cierres (12 archivos, incl. `cierres-trato-tu.guardia.test.ts`) → `12 passed`, `288 passed`.
- Guardia 420 (`dependencias-declaradas-presentes.guardia.test.ts`) está en `tests/baseline-rojos.json`: rojo heredado, no es hallazgo.

## Hallazgos

1. **menor** — `specs/SLT-152-tablas-cierres-legibles/requirements.md` T7 «Cierre» sin marcar `[x]`
   (gate `INIT_EXIT=0`, E2E y mapa R→test ya hechos). Marcarla al cerrar.
2. **menor** — Comentarios que siguen describiendo el formato viejo «<resultado> <n>» / «<nombre> <n>»:
   `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts:373`, `e2e/cierres-admin.spec.ts:79`,
   `tests/components/CierresAdminModule.test.tsx:215`, y el `motivo` de
   `tests/unit/guards/estado-con-info.guardia.test.ts:218`. No cambian ninguna aserción.

## Veredicto

**OK (APROBADO)** — sin bloqueantes; 2 menores.
