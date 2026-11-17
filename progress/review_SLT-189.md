# Review SLT-189 «Reparto del mensajero según el canvas» — vuelta 1

Ruta **ligera**, acotada al diff `origin/dev...HEAD` (HEAD `ead0c40f`). Reviewer, 2026-11-16.
Solo presentación: el diff no toca `lib/`, `db/`, `app/api/`, permisos ni dinero (la ruta ligera vale).

## Checklist

- [x] **Trazabilidad R790-R802**: cada R tiene un test que falla si se rompe (tabla abajo). Literales
  escritos a mano (`1001`/`REM-7731`, `2002`/`REM-002`, «Beto Ruiz · Tienda Sur», la dirección larga).
- [ ] **Tasks**: T1-T3 `[x]`; **T4 `[ ]`** (`requirements.md:167`). Ver hallazgo M1.
- [x] **Tamaño**: `tamano-pr.mjs` → 10/40 archivos, 59/1000 producción, 375/3000 tests.
- [x] **Lo que ya existe**: presente; el diff reutiliza `PosOrderCardDetalle` (`compacta`),
  `VistaCardsToggle` tal cual y las acciones de ayuda; no re-crea nada.
- [x] **Checkpoints** (`CHECKPOINTS.md`, `docs/checkpoints-proyecto.md`): typecheck y lint verdes; sin
  tablas, queries, migraciones, literales de país/moneda ni recursos de Ordenex; flujo crítico
  `mis-asignaciones` cubierto por `e2e (reparto)` verde en CI (run 44008541078).
- [x] **Verificación propia**:
  - `pnpm exec vitest run tests/components/Reparto* PosOrderCard* Recog* Recolec* tests/unit/components/buscador-filtros*`
    → 25 archivos, 489 tests, `VT_EXIT=0`.
  - `tsc --noEmit -p .` → `TSC_EXIT=0`, 0 líneas. `eslint` de los 10 archivos tocados → `LINT_EXIT=0`.
- [x] **Reglas del perfil (reviewer)**: sin dependencias nuevas; comentarios dicen el porqué.
- [ ] **E2E en local antes del PR** (`docs/perfil-agentes.md:23-27, 78`): no corrido en local por
  instrucción del leader; `e2e (reparto)` pasa en CI. Ver M1.

## Trazabilidad

| R | Test(s) | Mata la mutación |
|---|---|---|
| R790 | `PosOrderCardDetalleCompacta` «R790…»; `RepartoMovil` R507 (`/1001/`) y R796 | M1 |
| R791 | `PosOrderCardDetalleCompacta` «R791…» | M1 |
| R792 | `PosOrderCardDetalleCompacta` «R792…» (con y sin dirección) | M5 (bitácora) |
| R793 | `PosOrderCardDetalleCompacta` «R793…» | — (ver m2) |
| R794 | `PosOrderCardDetalleCompacta` «R794…» + `grep`: solo `RepartoModule` pasa `filaReparto` | M6 (bitácora) |
| R795 | `RepartoMovil` «R795…»; `buscador-filtros-movil` «SLT-189 R795» (×2) | M4 |
| R796 | `RepartoMovil` «R796…» (clases `sticky top-0` + cambio de vista); E2E (c) | M4 |
| R797 | `RepartoMovil` «R797…» (clases); E2E (a) a 360/414 | — (clases; medida en E2E) |
| R798 | `RepartoModoFoco` (antes y tras confirmar, DS4); `RepartoMovil` foco; E2E (b) | M2 |
| R799 | `RepartoModoFoco` «…sin barra, conmutador, escáner ni tarjetas»; `RepartoMovil` foco | — |
| R800 | `RepartoAyuda` «R800 Mosaico», «R800 Detalle»; `PosOrderCardDetalleCompacta` «R800 (fila)» | M1, M3 |
| R801 | `RepartoAyuda` «R801 plegada/desplegada», «R801 bloqueado» | M3 |
| R802 | `RepartoMovil` «SLT-189 R802…» | M7 (bitácora) |

## Mutaciones propias (restauradas con `git checkout --`, árbol limpio al final)

Sobre `tests/components/Reparto*` + `PosOrderCardDetalleCompacta` (200 tests):

| Mutación | Resultado |
|---|---|
| M1 `lineaArriba` vuelve a `orden.numRemision` (`PosOrderCardDetalle.tsx:184`) | 7 rojos |
| M2 quitar solo el `{kpis}` del foco (`RepartoModule.tsx:801`) | 3 rojos (RepartoModoFoco ×2, RepartoMovil foco) |
| M3 fila de ayuda sin `compacta` (`RepartoModule.tsx:702`) | 5 rojos |
| M4 `{trasFiltros}` → `{null}` en `BuscadorFiltros` (el conmutador desaparece de la barra) | 6 rojos |
| M5 `filaReparto="direccion"` → `undefined` en la lista de reparto | 2 rojos |

## Lo pedido por el leader

- **R794 / Recoger, Recolección, RecolectadasHoyLista**: ningún archivo suyo en el diff; `filaReparto` y
  `trasFiltros` solo los pasa `RepartoModule` (`grep` en `app/ components/ lib/`). Sin `trasFiltros`,
  `BuscadorFiltros` renderiza `{undefined}`: mismo DOM (lo prueba «sin la prop la fila no gana ningún
  hijo»). Tests de Recoger/Recolección y los 7 archivos de `buscador-filtros*` verdes.
- **Tests reescritos, sin debilitar** (vs `origin/dev`): RepartoAyuda 18→22 casos, 39→60 `expect`;
  RepartoModoFoco 6→6, 27→33; RepartoMovil 9→13, 29→46; buscador-filtros-movil 6→8, 14→18;
  PosOrderCardDetalleCompacta 3→9, 21→42. Las únicas líneas borradas son los asertos «sin KPI en
  foco» (cambian a R798 aprobado por Carlos, DS4, con orden KPI→«Volver»→panel), `/REM-G1/`→`/1001/`
  (R790) y `seccionAyuda()`→`desplegarAyuda()`. Los casos 235/R15 y R16 ahora miran la fila
  **desplegada**, que es más fuerte (plegada no habría nada que encontrar). R493 sigue midiendo los
  mismos cuatro botones, tras desplegar la fila de ayuda.
- **Accesibilidad de la fila de ayuda**: disparador `<button>` con `aria-expanded`/`aria-controls`,
  `min-h-11` y `focus-visible:outline` (`PosOrderCardDetalle.tsx:198-203`); el `article` conserva su
  nombre accesible (remisión); «Recuperar» y «Conversación» conservan nombre y `h-11` (R493 en verde);
  «Recuperar» sigue pulsable con bloqueo (R801).
- **Cambios mínimos** en los archivos del choque aceptado (épica de geografía): `RepartoModule` +15/-5
  netas (dos props, `{kpis}` en el foco, el conmutador movido), `BuscadorFiltros` +10 (una prop
  opcional), `PosOrderCardDetalle` +14/-2.

## Hallazgos

- **M1 — mayor (cierre, no código).** T4 sigue `[ ]` (`requirements.md:167`) y su «Hecho» no está
  cumplido tal como se escribió: no hay constancia del E2E `pwa-mensajero-reparto` corrido **en local**
  (`progress/impl_SLT-189.md:54`), que `docs/perfil-agentes.md:78` marca como bloqueante para un PR que
  toca pantallas, y el mapa `R → test` está en `impl_SLT-189.md`, no en `progress/features/SLT-189.md`
  como pide T4. Atenuante comprobado: `e2e (reparto)` está **verde en CI** en el PR #191 (run
  44008541078) e `INIT_EXIT=0` del leader. Para cerrar (lo hace el leader, no el implementer): o correr
  el E2E en local, o anotar en `progress/features/SLT-189.md > Decisiones` la excepción con la
  evidencia de CI; copiar el mapa R→test allí y marcar T4 `[x]`.
- **m1 — menor.** Comentario desfasado en `RepartoModule.tsx:697`: «el nº de remisión, el
  destinatario… siguen intactos»; ahora la fila de ayuda muestra la guía y «destinatario · tienda».
- **m2 — menor.** El test de R793 (`PosOrderCardDetalleCompacta.test.tsx:199`) no comprueba «estado y
  marcas» en el despliegue (sí ubicación, navegar, intentos y acciones); lo cubre en parte el test
  SLT-156 previo del mismo archivo y R801 en `RepartoAyuda`.
- **m3 — menor.** R797 y R796 en componente se apoyan en clases (`max-md:[&>button]:h-11`,
  `sticky top-0`); la medida real la da el E2E (a)/(c), que solo corrió en CI.

## Veredicto

**CAMBIOS** — el código y los tests están bien (R790-R802 trazados, mutaciones en rojo, Recoger y
Recolección intactos, sin debilitar tests); falta solo el cierre de T4 (M1), que resuelve el leader
sin volver al implementer.
