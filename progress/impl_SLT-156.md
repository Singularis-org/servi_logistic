# impl SLT-156 «PWA de los mensajeros: tablas usables en el móvil» — rebanada A «Base común»

Tanda 2026-11-14 · frontend_dev · tasks A1-A7 (A8 escrita, sin ejecutar) · commit 04136d80.

## Archivos

Producción (creados): `components/shared/texto-entero.ts`, `hooks/use-flotante-compacto.ts`.
Producción (modificados): `components/ui/button.tsx`, `components/shared/BuscadorFiltros.tsx`,
`components/shared/EscanerModal.tsx`, `components/shared/ReporteBugBoton.tsx`,
`app/(app)/mis-asignaciones/_components/chat/ChatFlotante.tsx`,
`app/(app)/mis-asignaciones/_components/VistaCardsToggle.tsx`,
`app/(app)/mis-asignaciones/_components/pos-card/{PosOrderCardDetalle,PosOrderCardMosaico,PosNavBlock}.tsx`,
`components/private/cierres/fila/FilaGestion.tsx`,
`components/private/cierres/detalle/RechazosDeTiendaCierre.tsx`,
`app/(app)/cierres-admin/_components/cierre-factura.tsx` (solo `FilaSinGestion`/`SeccionSinGestion`).

Tests (creados): `tests/unit/components/button-tactil.test.tsx`,
`tests/unit/components/buscador-filtros-movil.test.tsx`, `tests/unit/hooks/use-flotante-compacto.test.ts`,
`tests/components/FlotantesCompactos.test.tsx`, `tests/components/PosOrderCardSinRecorte.test.tsx`,
`tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts`, `e2e/_pwa-mensajero-fixture.ts`,
`e2e/pwa-mensajero-base.spec.ts`.
Tests (modificados): `tests/components/FilaGestion.test.tsx`, `tests/components/CierreRechazosDeTienda.test.tsx`,
`tests/components/ReporteBugBoton.test.tsx`, `tests/components/EscanerModal.test.tsx`.

Fuera de `## Archivos esperados` (y por qué):
- `playwright.config.ts`: el spec nuevo tiene que estar en un proyecto (guardia `e2e-sin-saltos`). Va en `dinero`.
- `tests/unit/guards/impresion-flujo.guardia.test.ts`: es una foto de las clases de las piezas con
  `break-inside-avoid`; `FilaSinGestion` pasó de `py-2.5` a `py-3` (R494).

## R → test (y la mutación que lo mató)

| R | Test | Mutación → rojo |
|---|---|---|
| R490, R491 | `FilaGestion.test.tsx` «R490, R491: destinatario, tienda y mensajero enteros…» | `TextoCelda` vuelve a `block min-w-0 truncate` (M2) |
| R490, R491 | `CierreRechazosDeTienda.test.tsx` «SLT-156 R490, R491 — Rechazados…» | `truncate` en el destinatario de `RechazosDeTiendaCierre` (M4) |
| R490, R491 | `CierreRechazosDeTienda.test.tsx` «SLT-156 R490, R491 — Órdenes sin gestión…» | `truncate` en la tienda de `FilaSinGestion` (M5) |
| R490 | `PosOrderCardSinRecorte.test.tsx` (Mosaico, Detalle, bloque de navegación) | `truncate` en el destinatario de Detalle (M6); en la dirección de Mosaico (M7) |
| R492 | `FilaGestion.test.tsx` «R492: guía en pista `max-content` e importes…» | `ganancia: "minmax(0,1fr)"` (M3) |
| R492 | `CierreRechazosDeTienda.test.tsx` «R492: la guía y la fecha van en columna fija» | la fecha pierde `COLUMNA_FIJA` (M17) |
| R492 | `PosOrderCardSinRecorte.test.tsx` «R492: el monto va en columna fija» | (cubierto con M6/M7 en el mismo archivo; no mutado aparte) |
| R493 | `button-tactil.test.tsx` (touch, icon-touch, VistaCardsToggle) | `touch` `h-11` → `h-10` (M1); quitar `VISTA_TOGGLE_TACTIL` (M16) |
| R493 | `buscador-filtros-movil.test.tsx` «`tactil`» | `alto` ignora `tactil` (M18) |
| R494 | guardia `pwa-mensajero-sin-recorte` | `gap-1.5` en `PosOrderCardDetalle` (M15) |
| R490 | guardia `pwa-mensajero-sin-recorte` | `truncate` de prueba en `FilaGestion` (M14) |
| R495, R496 | `buscador-filtros-movil.test.tsx` | quitar `sticky` de `BARRA_FIJA` (M8); `min-w-[250px]` sin `sm:` (M9) |
| R497, R498 | `use-flotante-compacto.test.ts` | `UMBRAL_FLOTANTE_PX = 0` (M10) |
| R497-R499 | `FlotantesCompactos.test.tsx` | `size-12` fijo en `ReporteBugBoton` (M11); `size-14` fijo en `ChatFlotante` (M12) |
| R500 | `EscanerModal.test.tsx` «R500: con la etiqueta «Escanear o escribir guía» arranca cerrado…» | `useState(true)` (M13) |
| R501 (+R490-R492, R497) | `e2e/pwa-mensajero-base.spec.ts` (escrito, NO ejecutado: lo corre el leader) | pendiente: devolver `truncate` a `PosOrderCardDetalle` |

Cada mutación se aplicó, se corrió solo su archivo de test (`pnpm exec vitest run <archivo>`), se
vio ROJO y se restauró el archivo (script de un solo uso, fuera del repo). Las 18 dieron rojo.

## Comandos (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → EXIT=0. Sin `NODE_OPTIONS`, `tsc` se
  queda sin memoria (heap de 4 GB) en esta máquina; el CI usa el mismo 8192 (`gate.yml:56`).
- `pnpm exec eslint <27 archivos del diff>` → LINT_EXIT=0.
- Tests nuevos y tocados: 5 archivos / 103 tests verdes; los otros 5 / 30 verdes; guardia 17/17.
- Gate `./init.sh` (con el mismo `NODE_OPTIONS`) → `INIT_EXIT=1`. Typecheck y lint pasan;
  `test:rapido` 1 failed | 1324 passed. El único rojo NO es del diff:
  `FAIL tests/integration/db/zona-central-guarda-y-rastro.test.ts > … Q4` —
  `Invalid tx.cierreDia.create() invocation … The column (not available) does not exist in the
  current database.` La base local del `.env` no tiene una columna que el cliente de Prisma del
  esquema actual espera (base sin migrar); entra por `gate.siempre: guard` («guarda»). No se
  migró (prohibido en esta tanda).
- Tamaño del PR según el gate: 29/40 archivos, 374/1000 líneas de producción, 1140/3000 de tests.

## Decisiones y desvíos

- `CierreRechazosDeTienda.test.tsx` probaba el comprobante (`CierreFacturaDetalle`), que no se monta en
  ninguna pantalla. Los casos de A2 se añadieron ahí pero sobre los componentes que SÍ se pintan
  (`RechazosDeTiendaCierre` y `SeccionSinGestion`). El `FilaRechazoDeTienda` del comprobante sigue con
  `truncate`: no es pantalla del mensajero (la guardia solo mira `FilaSinGestion`/`SeccionSinGestion`).
- Guía de `RechazosDeTiendaCierre`: de `80px` fijos a `minmax(80px,max-content)` para que una guía larga
  no se monte en el destinatario. Cabecera y filas son rejillas distintas: una guía de más de 80 px
  desalinea esa fila. Lo rehace D (tarjetas).
- `VistaCardsToggle` a 44 px con `[&>button]:h-11 [&>button]:px-4` en el grupo, sin tocar
  `SegmentedToggle` (compartido con escritorio).
- `BuscadorFiltros` entra en la guardia solo con la regla de escala: su `text-ellipsis` es del
  placeholder y su `truncate`, del rótulo de un filtro en el selector (no son datos). Su opción del
  selector pasó de `py-1.5` a `py-2`. `button.tsx` (primitiva con medios pasos en sus tamaños de
  siempre) no entra en la guardia.
- Escala de 4 px: los chips de las tarjetas POS pasan de `px-1.5 py-0.5` a `px-2 py-1`, las tarjetas
  de `p-2.5` a `p-3`; `FilaGestion` de `py-2.5` a `py-3`. Es el cambio mínimo que exige R494.
- Flotantes reducidos: `size-11` + `opacity-80` (el grado de transparencia no está en el spec; se
  eligió 80 %).
- `--alto-barra-inferior`: los flotantes ya la leen en `bottom`; quien la publica (la barra fija) llega
  con D.
- E2E: el escenario (`crearOrden`) solo deja fijar destinatario, remisión y monto; la dirección, el
  producto y la tienda largos de `design.md §12` quedan en el fixture para cuando el escenario los admita.

Veredicto: A1-A7 hechas y commiteadas con sus mutaciones en rojo; el gate solo cae por una prueba de
integración de base sin migrar, ajena al diff; A8 queda para el leader.

## Tanda 2 — E2E de A8 y review (commit 3b139af1)

- (a) «el texto recortado con «…»» no era un recorte: es la vista previa de Playwright en el error de
  *strict mode*, que acorta el texto del elemento a ~50 caracteres. El `filter({ hasText })` con el
  texto ENTERO casaba, así que el DOM lo tenía entero. El fallo real era el localizador ambiguo (`p` de
  la tarjeta y `dd` del detalle plegado): ahora `locator("p").filter(...)` + `toHaveText`. No hay
  función de abreviar que quitar.
- (b) El hook no reducía en el navegador porque en `next dev` la página se pintaba (HTML del servidor)
  y el gesto ocurría ANTES de hidratar: el `scroll` ya había pasado cuando se puso el listener. Ahora el
  hook mide también al montar, con la referencia en 0. Test nuevo «montado con la página ya
  desplazada…»; mutación: quitar la medida al montar → rojo. El E2E además afirma que la ventana bajó y
  espera `data-compacto`.
- (c) `IMPORTE_LARGO` pasa a 99 999 999: `monto_cobrar` es entero (`orden_monto_cobrar_entero_check`) y
  el monto recibido tiene que cuadrar con él.
- B1: `sinDesborde` mide cada descendiente visible del `SidebarInset` contra su borde derecho
  (salta `fixed`, scroll horizontal propio; en carrusel, diapositiva ≤ vista y contenido ≤ diapositiva).
  Mutación `min-w-[500px]` en la tarjeta de Mosaico → rojo («article… acaba en 525 > 335»). `sinElipsis`
  cuenta `overflow: clip`.
- B2: literal de `CierreBodegaDetalleGestiones.test.tsx` (R443) actualizado a mano con R492.
- m1: `max-md:` en el conmutador (no cambia `/novedades` en escritorio). m8: `;`.
- E2E con mutación de A8: `truncate` de vuelta al destinatario de las tarjetas → rojo (`ellipsis: «Ana María…»`).
- Gate con la base desechable: `INIT_EXIT=0`. El log va fuera del árbol: dentro, la guardia
  `sin-nombre-heredado` lo leía (rojo falso de la tanda anterior).
- E2E `pwa-mensajero-base.spec.ts`: 4 passed, `E2E_EXIT=0`.
