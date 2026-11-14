# impl SLT-165 «PWA del mensajero: Cierre del día en tarjetas» — rebanada D de SLT-156

Tanda 2026-11-14 · frontend_dev · tasks D1-D6 (D7 escrita, SIN ejecutar: la corre el leader).
Spec: `specs/SLT-156-pwa-mensajero-tablas/` (R523-R538). Commits: `feat(SLT-165)` + `docs(SLT-165)`.

## Archivos

Producción (modificados): `components/private/cierres/fila/{FilaGestion,GestionesCierre}.tsx`,
`components/private/cierres/fila/{fila-gestion-vista,fila-gestion-labels}.ts`,
`components/private/cierres/detalle/{DetalleCierre,RechazosDeTiendaCierre,CorregirCierre}.tsx`,
`components/private/cierres/detalle/detalle-cierre-labels.ts`,
`components/private/cierres/cola/{TablaColaPropia,ColaCierres}.tsx`, `components/private/cierres/cola/cola-propia-vista.ts`,
`app/(app)/cierre-dia/_components/{CierreDiaModule,FiltrosColaPropiaBarra}.tsx`,
`app/(app)/cierres-admin/_components/cierre-factura.tsx` (solo `FilaSinGestion`/`SeccionSinGestion` y su constante).

Tests (creados): `tests/components/GestionesCierreMovil.test.tsx`, `tests/unit/utils/coincide-gestion.test.ts`,
`e2e/pwa-mensajero-cierre-dia.spec.ts`.
Tests (modificados): `FilaGestion`, `DetalleCierreGestiones`, `DetalleCierre`, `CierreDiaModule`, `CierreDiaPagina`,
`CierreDiaColaPropia`, `CierreRechazosDeTienda`, `CierreBodegaDetalleGestiones` (`tests/components/`),
`tests/unit/utils/detalle-cierre-vista.test.ts`, `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts`,
`e2e/_pwa-mensajero-fixture.ts`, `e2e/cierre-dia.spec.ts`.

Fuera de `## Archivos esperados` (y por qué):
- `playwright.config.ts`: el spec nuevo tiene que estar en un proyecto (guardia `e2e-sin-saltos`); va en `dinero`, como el de A.
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`: su R443 leía `style.gridTemplateColumns`; ahora la
  plantilla viaja en `--plantilla-fila` (R523/R524). Mismo literal a mano, leído de la variable, y además exige
  que NO haya `gridTemplateColumns` en línea.
- No se tocó `CierreDiaColaPropia`/`ColaCierres.test.tsx` más allá de lo listado: `ColaCierres.test.tsx` no
  cambia (las colas de central/satélite no cambian); el censo de `DataTable` es `cobertura-tablas.guardia`.

## Tests viejos cambiados (contrato nuevo, sin ablandar)

- «Solicitar cierre» → R531: el botón del pie es «Solicitar cierre del día» con el contador DENTRO, que entra
  en el nombre accesible («Solicitar cierre del día 3 gestiones»). En `DetalleCierre`, `CierreDiaModule` y
  `CierreDiaPagina` el botón del pie pasa a `/^Solicitar cierre del día \d+ gesti(?:ón|ones)$/`; el del diálogo
  sigue «Solicitar cierre» (C8). Las AUSENCIAS (`queryByRole(...).toBeNull()`, 5 casos) pasan al prefijo
  `/^Solicitar cierre del día/`: con el nombre exacto viejo habrían quedado verdes sin mirar nada.
- `detalle-cierre-vista.test.ts`: la tabla de R12 dice «Solicitar cierre del día».
- `FilaGestion.test.tsx` (R492) y `CierreBodegaDetalleGestiones.test.tsx` (R443): leen `--plantilla-fila`.
- E2E: `cierre-dia.spec.ts (d)` pide el nombre con contador y que el pie toque el borde inferior. Los demás E2E
  con `{ name: "Solicitar cierre" }` siguen valiendo (Playwright compara por subcadena dentro de la región).

## R → test (y la mutación que lo mató)

Runner: `mutar.py` (scratchpad del leader): por cada mutación corre el test SIN mutar (exige verde), muta,
corre (exige rojo) y restaura. 28/28 MATA; `git status` limpio al terminar.

| R | Test | Mutación → rojo |
|---|---|---|
| R523 | `FilaGestion.test.tsx` «R523: en la tarjeta…», «…cualquier audiencia…», «sin señales…» | `ganancia: null` en el área de la tarjeta |
| R523, R493 | `FilaGestion.test.tsx` «…una sola vez y de 44 px…» | quitar `TACTIL_MOVIL` de «Devolver a gestión» |
| R524 | `FilaGestion.test.tsx` «R524: la plantilla… solo `md:`», `DetalleCierreGestiones.test.tsx` «SLT-165 R523, R524» | `plantillaFila` vuelve a `gridTemplateColumns` en línea |
| R525 | `FilaGestion.test.tsx` «R525: desplegada…», «R493: Ver cómo se calculó…» | (clases a mano; cubierto por las de arriba en el mismo describe) |
| R526 | `GestionesCierreMovil.test.tsx` «30 gestiones…», «cambiar el término…», «cambiar el resultado…»; `coincide-gestion.test.ts` | `GESTIONES_POR_PAGINA = 50`; no resetear la página al buscar; ni al filtrar |
| R527 | `GestionesCierreMovil.test.tsx` «fija arriba…», «busca por guía…», «Filtros ({n})…»; `coincide-gestion.test.ts` | quitar `fija`; `coincideGestion` sin destinatario |
| R528 | `CierreRechazosDeTienda.test.tsx` «R528: cada rechazo es una tarjeta…» | fecha sin `max-md:[grid-area:fecha]` |
| R524 (m5) | `CierreRechazosDeTienda.test.tsx` «…`subgrid` de UNA rejilla…» | `FILA_SUBGRID = "md:grid"` |
| R529, R524 | `CierreRechazosDeTienda.test.tsx` «R529…», «R524: la cabecera… desde 768 px» | quitar `max-md:contents` |
| R530 | `DetalleCierre.test.tsx` «SLT-165 R530» | quitar `flex-wrap` del `TabsList` |
| R531 | `DetalleCierre.test.tsx` «…19 gestiones dentro», «barra fija abajo…», «sin gestiones pendientes…»; `CierreDiaModule.test.tsx` «lleva el contador» | `max-md:sticky` en vez de `fixed`; sin contador; sin gestiones habilitado; rótulo «Solicitar cierre» |
| R532 | `detalle-cierre-vista.test.ts` «SLT-165 R532» (lee de disco los árboles de Reparto/Recoger y Recolección) | comentario «Solicitar cierre del día» en `RepartoModule.tsx` |
| R533 | `CierreDiaModule.test.tsx` «R533: abre…», «R533: «Cancelar» cierra… sin enviar nada» | «Cancelar» (cerrar el diálogo) que llama a `confirmarSolicitud` |
| R534 | `DetalleCierre.test.tsx` «SLT-165 R534» (`--alto-barra-inferior` en `<html>`, se quita al desmontar; no existe en escritorio) | `usePublicarAltoBarra(pieRef, false)` |
| R535 | `CierreDiaColaPropia.test.tsx` «dos columnas…», «al desplegar…» | columnas de escritorio en el móvil; sin `renderExpanded` |
| R536 | `CierreDiaColaPropia.test.tsx` «R536…» | `siblingCount={1}` también en el móvil |
| R537 | `DetalleCierre.test.tsx` «SLT-165 R537» (×2) | `h-[calc(100dvh-2rem)]` en vez de `max-md:h-dvh`; sin «Volver» |
| R538 | `CierreDiaColaPropia.test.tsx` «R538…», `GestionesCierreMovil.test.tsx` «en escritorio…»; censo `cobertura-tablas.guardia` | segunda `<DataTable>` en `ColaCierres.tsx` |
| R490, R494 (D, m7) | `pwa-mensajero-sin-recorte.guardia.test.ts` (archivos de D + regla `oculta` + `title` con `c.`/`p.`/`s.`…) | `title={c.destinoTipo}` en `TablaColaPropia`; `overflow-hidden` en `GestionesCierre`; `truncate` en la fecha del rechazo |
| R501, R523-R537 (E2E) | `e2e/pwa-mensajero-cierre-dia.spec.ts` (a) 360/414, (b) 360 | SIN EJECUTAR (leader) |

## m9 / m10 (`sinDesborde`) — para que el leader los mate con Playwright

Hecho en `e2e/_pwa-mensajero-fixture.ts`: `revisados++` va DESPUÉS de `if (exento(el)) continue` (m9) y se
mide también `caja.left < limiteIzquierdo - 1` contra el inset o la diapositiva (m10). No hay unit posible: la
función vive en `page.evaluate`. Mutaciones propuestas para el leader al correr `pwa-mensajero-cierre-dia`:
(m9) poner `position: fixed` al `SidebarInset` entero por `page.addStyleTag` → debe fallar «nada visible (y no
exento) que medir»; (m10) `-ml-8` en la tarjeta de gestión → debe fallar «… empieza en -… < …».

## Desvíos y notas

- Botón de desplegar de la `DataTable` (cola, R535) mide ~24 px: es de `components/shared/DataTable.tsx`, fuera
  de los archivos de D; no se tocó. Pendiente de decidir si entra en R493.
- Paginación de «Cierres solicitados» en el móvil sin números de página (con 44 px no cabían 11 botones en
  312 px; R536). «Gestiones»: solo «« ‹ › »».
- «Recibido», «Cobro» y «Mensajero» no se pintan en la tarjeta (`design.md §10`); el «Pago» de la
  administración ocupa el sitio de la Ganancia (es `pagoMensajero`).
- Detalle desplegado y tarjetas de dinero: de `sm:` a `md:` (R525: una columna por debajo de 768 px).
- Marco modal: el tramo 640-767 px pasa también a pantalla completa (móvil = < 768 px).
- `DetalleCierre.tsx` entra en la guardia de escala: `gap-1.5`, `gap-x-2.5`, `px-3.5 py-2.5`, `px-0.5 py-2.5`
  → `gap-2`, `gap-x-3`, `px-4 py-3`, `px-1 py-3` (R494; ±2 px en escritorio).
- `TabsContent` de la página: `overflow-auto` solo desde `lg` (modal: siempre). Por debajo, fluye con la ventana:
  así la barra de «Gestiones» queda fija arriba y no hay scroll lateral (m6).
- Al imprimir por debajo de 768 px de ancho, «Órdenes sin gestión» sale en tarjetas (media query); el
  comprobante imprimible (`CierreFacturaDetalle`) no lo monta ninguna pantalla.
- D7 sin datos de «Rechazados por la tienda» ni «Órdenes sin gestión» ni tienda/dirección/producto largos: el
  escenario E2E no los deja crear (`crearOrden` solo fija destinatario, remisión y monto). La mutación de D7
  («`truncate` en la fecha del rechazo») la mata la guardia, no el E2E.
- Scratchpad compartido: el primer `mut.log` lo sobrescribió otra sesión (líneas de SLT-154); se repitió en
  `slt165-mutaciones.log`.
- MCP del grafo: no usado (worktree recién creado); Grep/Read.

## Salida de los comandos

- `pnpm run typecheck` → exit 0.
- `pnpm run lint` → exit 0 (0 errores; 251 avisos, ninguno en archivos de este diff).
- `vitest run` de 95 tests de componentes de cierres + guardias + utils tocados → 99 archivos, 1755 tests, VT_EXIT=0.
- Mutaciones → 28/28 MATA.
- `node scripts/tamano-pr.mjs` → 30/40 archivos, 676/1000 líneas de producción, 1054/3000 de tests.
- `./init.sh` (1.ª) → INIT_EXIT=1: `ancla-de-carga.guardia` (un `waitFor` solo con conteo en
  `GestionesCierreMovil.test.tsx:165`). Arreglado con ancla de contenido.
- `./init.sh` (2.ª) → INIT_EXIT=1: `e2e-sin-saltos.guardia` «spec-sin-proyecto»: el lector de
  `playwright.config.ts` corta `specs(...)` en el primer `)` y mi comentario llevaba paréntesis. Comentario sin
  paréntesis.
- `./init.sh` (3.ª) → INIT_EXIT=0 (tamaño del PR 30/40 · 676/1000 · 1054/3000).

## Veredicto

Rebanada D implementada (D1-D6) con R→test y 28 mutaciones muertas; D7 escrita para el leader.
