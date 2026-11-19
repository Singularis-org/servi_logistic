# impl SLT-209 «Cierre del mensajero: la barra de búsqueda, filtros y descarga flota sobre la lista»

Ruta directa (aprobada por Carlos). Test en ROJO primero, después el arreglo.

## Causa
En el detalle del cierre a pantalla completa («Ver» en «Cierres solicitados»; en el teléfono también el
modal de `/cierres-admin`), el panel de la pestaña es el contenedor que desplaza y llevaba `pt-4`. Un
`sticky top-0` se pega al borde del CONTENIDO de quien desplaza, así que la barra fija de «Gestiones»
quedaba 16 px por debajo del borde visible: las tarjetas asomaban por esa franja y la barra parecía
flotar a mitad de la lista. Además el campo quedaba en 77-93 px al lado de «Filtros» y «Descargar».
Viene de SLT-156/SLT-165 (barra `fija` dentro del panel con `overflow-auto` del modal).

Medido con el E2E nuevo antes del arreglo (`next build` del código de hoy):
- página: `{"separacion":0,"asoman":0,"alfa":1,"ancho":77,...}` → rojo por el ancho.
- detalle «Ver»: `{"separacion":16,"asoman":1,"alfa":1,"ancho":93,...}` → rojo por la franja y el ancho.

## Arreglo
- `components/private/cierres/detalle/DetalleCierre.tsx`: `PANEL_MODAL = "overflow-auto max-md:mt-4 max-md:pt-0"`.
  En el teléfono el hueco es margen y no relleno; desde `md` las clases de siempre (`pt-4 overflow-auto`).
- `components/shared/BuscadorFiltros.tsx`: prop opt-in `campoLineaPropia` → `max-md:basis-full` en el campo
  (Filtros y Descargar bajan a la línea siguiente). Desde `md` nada cambia; los demás consumidores, igual.
- `components/private/cierres/fila/GestionesCierre.tsx`: la barra móvil pasa `campoLineaPropia`.

Pantallas tocadas por el arreglo: `/cierre-dia` (página y «Ver»), y por compartir `DetalleCierre` modal +
`GestionesCierre`: el detalle de `/cierres-admin` (mensajero y bodega, `DetalleCierreBodegaAbierto`) en el
teléfono. Revisadas sin el defecto: `ColaCierres` propios (sticky a la ventana), Reparto, Recoger y
Recolección (`fija` a la ventana), `cierre-confirmacion-fisica` (no es `BuscadorFiltros`).

## Punto 5 (Carlos, 2026-11-18): «Terminar recepción (n)» debajo de los contadores
- `components/shared/RecepcionContinuaPagina.tsx` (`/ordenes/recibir` y `/recepcion-satelite/recibir`): el
  botón sale de `actions` del encabezado y va en `[data-columna-resumen]`, debajo de `ContadoresEscaneo`,
  `w-full`; tamaño por defecto (`h-8`, 32 px) desde `md` y `max-md:h-11` en el móvil. Mismo comportamiento
  (navega a `volverA` y refresca). Nota: hoy no tenía diálogo de confirmación ni deshabilitado, y medía 44 px
  en todos los anchos (`size="touch"`); se deja en 32 px de escritorio como pidió el coordinador.

## Punto 6 (Carlos, 2026-11-19): Wallet › Satélites
- `satelites-labels.ts`: `SATELITES_PAGINA.descripcion` = «Dinero que las bodegas ya cobraron y todavía no han
  entregado a la central.»; fuera `SALDO_NO_ES_CAJA_*` (y el import de `EMPRESA`, que quedó sin uso); nuevo
  `RESUMEN_SATELITES.pendienteInfo` con el texto literal y el comentario de por qué existe la nota.
- `SaldosSatelitesTable.tsx`: fuera el `<p role="note">` del pie; la tarjeta «Pendiente de conciliar» lleva el (i).
- `components/shared/EstadoInfo.tsx`: `InfoConTexto`, el mismo `BotonInfo` de los (i) de estado (popover de
  Base UI: hover 200 ms / foco / toque; sin dependencia nueva) para un rótulo que no es estado.
- Tamaños: la tarjeta no cambia (el botón es de 16 px dentro de la línea de 20 px del rótulo).

## Archivos
- app/(app)/wallet/satelites/_components/satelites-labels.ts
- app/(app)/wallet/satelites/_components/SaldosSatelitesTable.tsx
- components/shared/EstadoInfo.tsx
- tests/integration/wallet-satelites.test.tsx
- components/private/cierres/detalle/DetalleCierre.tsx
- components/private/cierres/fila/GestionesCierre.tsx
- components/shared/BuscadorFiltros.tsx
- components/shared/RecepcionContinuaPagina.tsx
- e2e/pwa-mensajero-cierre-barra-fija.spec.ts (nuevo; proyecto `dinero` en playwright.config.ts)
- e2e/recibir-paquetes.spec.ts
- playwright.config.ts
- tests/components/DetalleCierre.test.tsx
- tests/components/GestionesCierreMovil.test.tsx
- tests/components/RecepcionContinuaPagina.test.tsx
- progress/features/SLT-209.md, progress/impl_SLT-209.md

## Mapa requisito → test
- Barra pegada al borde visible, sin tarjetas por encima, opaca (página y «Ver», 360 px) →
  `e2e/pwa-mensajero-cierre-barra-fija.spec.ts` (a)/(b); componente: `DetalleCierre.test.tsx > SLT-209 — el panel del modal…`.
- Campo con ancho útil en el móvil → mismo E2E (`ancho >= 280`); `GestionesCierreMovil.test.tsx > SLT-209 — el campo…`.
- Punto 5 → `RecepcionContinuaPagina.test.tsx > SLT-209: «Terminar recepción» debajo de los contadores`;
  `e2e/recibir-paquetes.spec.ts` (bodega central: no en `header`, dentro de la columna, debajo de «No encontradas», ancho de la columna, 32 px).

- Punto 6 → `tests/integration/wallet-satelites.test.tsx > SLT-209 (Carlos, 2026-11-19) — LA NOTA … vive en el (i)…`
  (subtítulo literal, sin `role="note"`, un solo (i) y en la tarjeta «Pendiente de conciliar», abre con el texto literal).

## Rojo antes / verde después (salida real)
- Punto 6 con el código de hoy: `Tests 1 failed | 38 passed (39)` (`Expected: "Dinero que las bodegas ya cobraron…" Received: "Dinero consolidado que todavía no ha llegado a la central"`).
  Con el cambio: `Test Files 4 passed (4) · Tests 62 passed (62)` (wallet-satelites, SaldosSatelitesTable, WalletListados464, wallet-sin-uuid).
- E2E nuevo, código de hoy: `1 failed` (separacion 16, asoman 1, ancho 77/93). Tras el arreglo: `1 passed (14.2s)`.
- `recibir-paquetes` con el botón en el encabezado: `expect(locator).toHaveCount(expected) failed  Expected: 0  Received: 1`.
- Componente con los fuentes de hoy (`git stash` de los dos archivos): `Tests 2 failed | 62 passed (64)`;
  `RecepcionContinuaPagina` con el de hoy: `Tests 1 failed | 5 passed (6)`. Con el arreglo: `Tests 70 passed (70)`.
- Proyecto `reparto` tras `next build`: `51 passed (2.2m)`, EXIT=0.
- `pwa-mensajero-cierre-dia` + `pwa-mensajero-base` (no regresión de la barra): `9 passed (40.8s)`.

## Gate
Ver la línea final de abajo.

## Gate (salida real)
- 1.ª corrida de `bash ./init.sh`: INIT_EXIT=1 por `e2e-sin-saltos` (`spec-sin-proyecto`): el comentario del
  proyecto en `playwright.config.ts` llevaba un paréntesis y el lector de la guardia corta `specs(` en el primer `)`.
  Arreglado (comentario sin paréntesis).
- 2.ª corrida: `✗ feature_list.json invalido: zona frontend: SLT-202, SLT-206, SLT-209 (3 in_progress, max 2)` →
  INIT_EXIT=1. Es el `feature_list.json` del leader (raíz del repo), no del código de esta rama; lo cierra el leader.
- Los pasos de código del gate, a mano por la misma base desechable: `TYPECHECK_OK`, `LINT_OK`,
  `test:rapido` (4 shards) `100/100/100/78 files passed`, `1368 + 1712 + 1717 + 1004 passed | 1 skipped` → `RAPIDO_OK`, `PASOS_EXIT=0`.

Veredicto: arreglo y tests en verde; INIT_EXIT=1 solo por el cupo frontend del board (leader).

## Vuelta 3 — rojo de CI (run 44471124331, proyecto dinero, sobre e208b17b)
CI: en «Ver», `ajenos: 3` (la fila de abajo de la barra). Reproducido en local a 360 × 667: el panel de la
pestaña del modal medía 124 px y la barra fija 132, así que quedaba recortada y el punto lo recibía el modal
(`"listaVisible":-41`); a 780 px solo quedaban 72 px de lista a la vista. En CI pasaba a 780 porque las
fuentes de Linux hacen más alta la cabecera. Era un defecto real, no de la medida: en el teléfono el modal
tenía cabecera, cifras, pestañas y pie fijos, y el único scroll era un panel de 124-204 px.

Arreglo (`DetalleCierre.tsx`, solo `max-md`; desde `md` sin cambios, el panel sigue siendo el único scroll):
el modal desplaza entero (`max-md:overflow-y-auto max-md:py-0`); cabecera `max-md:pt-4`; pestañas y panel
con su alto (`max-md:min-h-auto`, panel `max-md:overflow-visible`); pie `max-md:sticky bottom-0` con fondo.

E2E: añade `listaVisible >= 150` y una segunda medida a 667 px. Espera a que se vaya el aviso «Cierre
solicitado correctamente.» (`fixed`, `z-[100]`, 5 s), que con la barra ya arriba tapaba sus puntos; es
pasajero, por eso se espera y no se excluye de la medida. La medida sale en el log también en verde.
- Rojo con el código anterior: `listaVisible` 72 (780 px) y -41 con `ajenos: 3` (667 px) → `1 failed`.
- Verde: `listaVisible` 535 / 422, `ajenos` 0 → `1 passed (20.2s)`.
- Componente: `DetalleCierre.test.tsx > SLT-209 — en el teléfono el modal desplaza entero…`; los 4 de DetalleCierre: `85 passed`.
- Proyecto `dinero` tras `next build` (base desechable nueva): `119 passed, 3 failed`. Ninguno es de esta ficha:
  `pwa-mensajero-cierre-dia` (a) 360 fue un cierre del worker (`code=3221226505`) y pasa al repetirlo
  (`5 passed` con el spec entero); `facturas-plataforma:316` (`Expected "₡300" Received "-₡300"`) y
  `pago-plataforma-confirmacion:229` (`el total 0.00 debe pasar de 100`) fallan igual al repetirlos solos.
  En CI (run 44471124331) los dos pasaron, y no tocan nada de este diff (Mi plan / cobro de plataforma).
  Rojo solo en local, sin investigar más.
- Gate rápido: INIT_EXIT=0 (typecheck, lint, test:rapido 100/100/100/78 archivos).
