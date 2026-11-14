# Review SLT-156 «PWA de los mensajeros: tablas usables en el móvil» — rebanada A «Base común»

Reviewer · 2026-11-14 · ruta completa, zona frontend · diff `origin/dev...HEAD` (código en 04136d80;
bitácora en 17567791). Alcance: tasks A1-A7 (A8 = E2E escrito, lo ejecuta el leader) y R490-R499,
R501 de `requirements.md > Base común [A]`.

## Checklist

### Ruta y especificación
- [x] Ruta completa; el diff no toca dinero en servidor, permisos, auth, integraciones ni webhooks
      (solo clases y un hook de cliente).
- [x] `requirements.md` (EARS R490-R544), `design.md` (con `## 13. Alternativas descartadas`),
      `tasks.md` existen.
- [x] `design.md` abre con `## Lo que ya existe`; el diff no re-crea nada de la lista
      (reusa `BuscadorFiltros`, `EscanerModal`, `VistaCardsToggle`, `SegmentedToggle`, `useIsMobile`
      no hace falta aún). `texto-entero.ts` y `use-flotante-compacto.ts` son nuevos y previstos en
      `design.md §2, §6`.
- [x] Tasks A1-A7 `[x]`; A8 `[ ]` (pendiente del leader, por acuerdo de la tanda).

### Tamaño
- [x] `node scripts/tamano-pr.mjs`: 28/40 archivos, 359/1000 líneas de producción, 1132/3000 de tests.

### Trazabilidad (R → test)
| R | Test | Juicio |
|---|---|---|
| R490 | `PosOrderCardSinRecorte.test.tsx`, `FilaGestion.test.tsx`, `CierreRechazosDeTienda.test.tsx` (casos SLT-156), guardia `pwa-mensajero-sin-recorte`, E2E (a)/(c) `sinElipsis` | OK |
| R491 | `FilaGestion.test.tsx` «R490, R491…» (destinatario, tienda, mensajero sin `title`), `CierreRechazosDeTienda.test.tsx` (rechazados y sin gestión) | OK |
| R492 | `FilaGestion.test.tsx` «R492: guía `max-content`…» y «importe en columna fija», `CierreRechazosDeTienda.test.tsx` «R492…», `PosOrderCardSinRecorte.test.tsx` «R492…», E2E (c) `sinSolapes` a 1280 | OK |
| R493 | `button-tactil.test.tsx` (touch, icon-touch, `VistaCardsToggle`), `buscador-filtros-movil.test.tsx` «`tactil`», `FlotantesCompactos.test.tsx` (`size-11`) | OK |
| R494 | guardia `pwa-mensajero-sin-recorte` (regla «escala») | OK (ver m4) |
| R495 | — en A solo cambia `BuscadorFiltros`; la «única instancia por lista» la prueban B/C/D | OK para A |
| R496 | `buscador-filtros-movil.test.tsx` (`min-w-0 sm:min-w-[250px]`, `flex-wrap`, `fija` → `sticky top-0`) | OK |
| R497, R498 | `use-flotante-compacto.test.ts` (función pura + hook con scroll real), `FlotantesCompactos.test.tsx`, E2E (b) | OK |
| R499 | `FlotantesCompactos.test.tsx` «R499» (nombre, distintivo «4», `onClick`) | OK |
| R500 | `EscanerModal.test.tsx` «R500…» (solo la constante; el montaje es de B/C) | OK para A |
| R501 | E2E (a) `sinDesborde(page)` | **NO lo protege** (B1) |

### Checkpoints (`CHECKPOINTS.md` + `docs/checkpoints-proyecto.md`)
- [x] Typecheck, lint y guardias: gate local del leader VERDE (INIT_EXIT=0). No los repetí enteros.
- [x] Tests del diff corridos por mí: 11 archivos / 202 tests verdes (vitest, base desechable).
- [ ] `vitest related` de los 12 archivos de producción: un rojo nuevo fuera del baseline (B2).
- [ ] Flujo crítico (cierres de día, `mis-asignaciones`): hay E2E (`e2e/pwa-mensajero-base.spec.ts`),
      pero sin ejecutar; su salida local tiene que quedar en `progress/impl_SLT-156.md` antes del PR
      (`docs/perfil-agentes.md > reviewer`: pantallas sin constancia de E2E local = bloqueante en el PR).
      Además de este spec, los que tocan las pantallas cambiadas: `cierre-dia`, `cierres-admin*`,
      `mis-asignaciones` (proyecto `dinero` y `reparto`).
- [x] Sin dependencias nuevas, sin secretos, sin `db/`, sin queries, sin literales de país/moneda en
      producción (los de Costa Rica que aparecen son datos de prueba en tests/E2E).
- [x] Sin recursos de Ordenex.
- [x] Comentarios explican el porqué.
- [ ] `gate-completo` de CI: pendiente (no hay PR).

## Hallazgos

### BLOQUEANTE

**B1 — `sinDesborde(page)` no puede ponerse rojo: R501 queda sin test real.**
`e2e/_pwa-mensajero-fixture.ts:43-60`, usado sin selector en `e2e/pwa-mensajero-base.spec.ts:76` y `:126`.
Mide `document.documentElement.scrollWidth <= clientWidth`. Pero todo el contenido de `(app)` vive
dentro de `SidebarInset` con `overflow-x-clip` (`app/(app)/layout.tsx:171`) y `min-w-0`
(`components/ui/sidebar.tsx:310`): lo que se sale por la derecha se RECORTA en silencio y no llega
nunca al `scrollWidth` del documento. La comprobación es verde con cualquier desborde; justo lo que
R501 pide detectar (y lo que convertiría un dato en invisible, R490). Nadie la mató con una
mutación (la de A8 es `truncate`, que caza `sinElipsis`, no `sinDesborde`). Como esta utilidad la
heredan B-E, el agujero se multiplica.
*Qué falta:* que `sinDesborde` mida dentro del contenido, no el documento: p. ej. que ningún
descendiente de la región tenga `getBoundingClientRect().right` mayor que el borde derecho de
`[data-slot=sidebar-inset]` (o del viewport), y/o `scrollWidth <= clientWidth` de cada lista por
selector obligatorio. Y la prueba de que puede fallar: una mutación (p. ej. `min-w-[500px]` o
`whitespace-nowrap` en el destinatario de `PosOrderCardMosaico`) que ponga (a) en ROJO, anotada en
`progress/impl_SLT-156.md`. Añadir también `overflow: clip` a la condición de `sinElipsis`
(`e2e/_pwa-mensajero-fixture.ts:77`), que hoy solo mira `hidden`.

**B2 — Un test de componente queda en ROJO por el diff y no está en el baseline.**
`tests/components/CierreBodegaDetalleGestiones.test.tsx:445-447` («R443: la cabecera y cada fila tienen el
mismo número de celdas y el mismo gridTemplateColumns», SLT-152 «Tablas de cierres legibles»). Corrido
a mano: 1 failed | 21 passed.
```
Expected: "auto minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.1fr) minmax(110px,1.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr) auto"
Received: "max-content minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.1fr) minmax(110px,1.2fr) minmax(max-content,1fr) minmax(max-content,1fr) minmax(max-content,1fr) minmax(0,1.3fr) auto"
```
`tests/baseline-rojos.json` no lo lista. El gate local lo dejó pasar (el `vitest related` del diff
excede el presupuesto del rápido); en CI saldría rojo.
*Qué falta:* actualizar ese literal a la plantilla nueva, **escrito a mano** (es el contrato de la
rejilla de bodega: no sustituirlo por `plantillaFila(...)`, que lo dejaría siempre verde), con una
línea que cite SLT-156 R492. Correr `vitest related` completo de `FilaGestion.tsx` y anotar la
salida. Y como es un rojo que el local no vio, el leader valora un disparador
(`docs/gate.md > Disparadores`) para `components/private/cierres/fila/`.

### menor

- **m1 — `VistaCardsToggle` a 44 px también en escritorio, fuera del mensajero.**
  `app/(app)/mis-asignaciones/_components/VistaCardsToggle.tsx:31` (`VISTA_TOGGLE_TACTIL`) se aplica en todos los anchos y el
  componente también lo monta `/novedades` (`app/(app)/novedades/_components/NovedadesModule.tsx:705`), que no es pantalla
  del mensajero: allí el conmutador pasa de 32 a 44 px en escritorio. R493 solo lo pide «en móvil»;
  `max-md:` (como `TACTIL_MOVIL`) lo deja como estaba en escritorio. `SegmentedToggle` y `button.tsx`
  (solo añade `touch`/`icon-touch`) no cambian: bien.
- **m2 — `BuscadorFiltros` cambia algo en escritorio para sus 16 consumidores.**
  `components/shared/BuscadorFiltros.tsx:626` (opción del selector `py-1.5` → `py-2`, 4 px más por opción). Lo exige
  R494 sobre un componente tocado; es aceptable, pero va al PR como cambio visible fuera del mensajero.
  El resto (`sm:min-w-[250px]`, `fija`, `tactil` apagadas por defecto) deja el escritorio igual: lo
  prueba `buscador-filtros-movil.test.tsx` «sin la prop…».
- **m3 — E2E sin dirección, producto ni tienda largos.** `e2e/pwa-mensajero-base.spec.ts:36-39`. R501 pide
  medir «con los textos más largos de `design.md §12`»; la vista Mosaico (la de por defecto en
  Reparto) pinta dirección y producto, que son los más largos. Aceptable diferirlo porque el
  escenario no los admite, pero B8 (`tasks.md:105`) tiene que llevarlo como condición de hecho, no
  como «cuando se pueda».
- **m4 — `button.tsx` fuera de la guardia de escala.** `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts:38-64`.
  R494 dice «componentes que toca esta ficha», y A1 toca `button.tsx`. Pasarlo a la escala cambiaría
  todos los botones de la app; la exclusión es razonable, pero tiene que quedar escrita en
  `design.md §3` o en las decisiones de la ficha, no solo en la bitácora.
- **m5 — Rechazados: cabecera y fila pueden desalinearse.** `components/private/cierres/detalle/RechazosDeTiendaCierre.tsx:29`
  (`minmax(80px,max-content)` en rejillas separadas). Con guías de 8 dígitos (≈ 63 px) no pasa;
  lo rehace D (tarjetas). Aceptado como transitorio.
- **m6 — «Gestiones» en el móvil hasta que llegue D.** `components/private/cierres/fila/FilaGestion.tsx:81-84`: con
  importes `minmax(max-content,1fr)` la rejilla ya no se aplasta (R492 cumple), pero a 360 px su
  mínimo pasa del ancho y el panel de la pestaña hace scroll horizontal (`DetalleCierre.tsx:330`,
  `overflow-auto`). Es mejor que el solape de hoy y R501 en `/cierre-dia` es de D; anotarlo para que
  A no salga a producción sola mucho tiempo antes que D.
- **m7 — guardia: lo que no ve.** `pwa-mensajero-sin-recorte.guardia.test.ts:71`. `TITLE_CON_DATO` solo reconoce
  `texto`, `g.`, `r.`, `o.`, `orden.`, `mensajeroNombre`; y no mira `overflow-hidden`/`text-clip`.
  Para A basta (los archivos no los usan en datos); B-E deben ampliar el patrón si traen otros
  nombres de variable.
- **m8 — `components/shared/texto-entero.ts:10,13,19`** sin `;` final, distinto del resto del repo (lint verde, solo estilo).

### Desvíos declarados, juzgados
- `playwright.config.ts`: spec en `dinero` — aceptado (el caso (c) es `/cierre-dia`, que vive ahí; la
  guardia `e2e-sin-saltos` exige un proyecto).
- `impresion-flujo.guardia.test.ts`: foto de clases `py-2.5` → `py-3` — aceptado; es el contrato de
  la pieza 6 y el cambio viene de R494.
- Casos de A2 sobre `RechazosDeTiendaCierre`/`SeccionSinGestion` — aceptado. `CierreFacturaDetalle`
  (y su `FilaRechazoDeTienda` con `truncate`) no lo importa ningún archivo de `app/`, `components/`
  ni `lib/`: hoy no se ve en ninguna pantalla. Si alguien lo vuelve a montar, entra en la guardia.
- Guía de rechazados `minmax(80px,max-content)`: aceptado como transitorio (m5).
- Conmutador con `[&>button]:h-11` en `VistaCardsToggle`: técnica correcta (los botones son hijos
  directos del `ButtonGroup`, lo comprueba el test; la especificidad gana a `h-8`), pero ver m1.
- Escala de 4 px en lo tocado: correcto; la guardia lo hace cumplir.
- Flotantes `opacity-80`: aceptado (R497 dice «semitransparentes» sin cifra). No tapan más que hoy:
  el layout ya reserva `pb-40` bajo `lg` (`layout.tsx:171`) y al reducirse ocupan menos.
- E2E sin textos largos de dirección/producto/tienda: ver m3.

### Lo que pedía mirar el leader
- **Ningún dato recortado en lo que pinta la PWA:** en `app/(app)/mis-asignaciones/` solo quedan
  `truncate` en el chat (fuera de alcance) y en `PosOrderCard.tsx`, que no monta ninguna pantalla;
  en `components/private/cierres/` solo `MensajerosCierreBodega` (fuera, por `design.md §2`);
  `app/(app)/recoleccion/` limpio.
- **Guardia A7:** lee los archivos de disco (no su propia fuente), falla si un segmento queda vacío
  (`> 40` caracteres) o una función se renombra (`throw`), y trae autocomprobación de cada regla. Bien.
- **Escritorio:** `SegmentedToggle` sin cambios; `button.tsx` solo añade dos tamaños (el `default`
  sigue en `h-8`, con test); `BuscadorFiltros` igual salvo m2. `VistaCardsToggle`: m1.
- **Fijos/flotantes:** `BARRA_FIJA` no la usa nadie todavía (llega con B); cuando se use, comprobar
  que `top-0` no queda bajo `SidebarTrigger` en móvil. Flotantes: ver arriba.

## Verificación ejecutada
- `pnpm exec vitest run` de los 11 archivos de test del diff → 11 passed / 202 tests, VT_EXIT=0.
- `pnpm exec vitest related --run` de los 12 archivos de producción (base desechable): hasta donde
  llegó la salida, 22 archivos con rojos; 21 son `tests/integration/db/*` de wallet/estado de cuenta
  (todos en `tests/baseline-rojos.json`, fallan en el montaje: «Sin empresa en contexto»), y 1 nuevo:
  `tests/components/CierreBodegaDetalleGestiones.test.tsx` (B2), confirmado corriéndolo solo.
- `node scripts/tamano-pr.mjs` → dentro del tope.
- Lectura de `layout.tsx`/`sidebar.tsx` para B1; greps de `truncate|line-clamp|text-ellipsis` en las
  carpetas de la PWA; usos de `CierreFacturaDetalle`, `VistaCardsToggle`, `BuscadorFiltros`.
- No corrí `./init.sh`, Playwright, prisma ni dev server (prohibido en esta tanda).
- MCP del grafo: no usado (el índice no tiene este worktree, según `design.md`); Grep/Read.

## Veredicto

**RECHAZADO** — por B1 (R501 no tiene un test que pueda fallar: arreglar `sinDesborde` para que mida
dentro de `SidebarInset`, probarlo con una mutación en rojo y anotarlo) y B2 (rojo nuevo en
`CierreBodegaDetalleGestiones.test.tsx` por la plantilla de `FilaGestion`). Los menores no bloquean;
m1 es barato y conviene hacerlo en la misma vuelta.
