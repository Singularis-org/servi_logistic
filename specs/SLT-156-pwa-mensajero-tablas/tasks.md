# SLT-156 «PWA de los mensajeros: tablas usables en el móvil» — tasks

> Requisitos: `requirements.md` (R490-R544). Diseño: `design.md`. Las tareas van agrupadas por
> rebanada (`requirements.md > Partir una feature`); cada rebanada es su propio PR, con su gate y
> su E2E a 360 px. `[P]` = paralelizable dentro de la rebanada. `MA/` =
> `app/(app)/mis-asignaciones/_components/`.
>
> **Regla de todas las tareas:** cada test nuevo se verifica con la mutación indicada (el test debe
> ponerse ROJO con la mutación y VERDE sin ella; se anota en `progress/impl_SLT-156.md`). Un E2E
> que no encuentra datos falla, no se salta (sin `if (!datos) return`). Exporta la base
> desechable antes de cualquier `vitest`. E2E en local antes del PR
> (`docs/perfil-agentes.md > E2E en local antes del PR`).

## Rebanada A — base común (R490-R499, R501)

- [x] **A1 [P] Utilidades de texto y táctil.** Crear `components/shared/texto-entero.ts` con
  `TEXTO_ENTERO`, `COLUMNA_FIJA`, `TACTIL_MOVIL` (`design.md §2, §4`). Añadir los tamaños `touch` e
  `icon-touch` a `components/ui/button.tsx`.
  *Hecho:* test `tests/unit/components/button-tactil.test.tsx` comprueba que `size="touch"` e
  `icon-touch` llevan `h-11`/`size-11`. *Mutación:* `h-10` → rojo.
- [x] **A2 Ningún dato se recorta en cierres (R490-R492).** Depende de A1. `FilaGestion.tsx`: borrar
  `CELDA_RECORTA`/`TextoRecortado`, usar `TEXTO_ENTERO`; pistas de importe
  `minmax(max-content,1fr)` y guía `max-content`. Quitar `truncate` de `RechazosDeTiendaCierre.tsx`
  y de `FilaSinGestion`/cabecera en `cierre-factura.tsx`.
  *Hecho:* `tests/components/FilaGestion.test.tsx` actualizado: destinatario, tienda y mensajero
  sin clase `truncate` ni atributo `title`; la plantilla tiene `max-content` en las pistas de
  importe. `CierreRechazosDeTienda.test.tsx` sin `truncate`. *Mutaciones:* devolver `truncate`;
  volver `minmax(0,1fr)` en «ganancia» → rojo.
- [x] **A3 [P] Tarjetas POS sin recorte (R490, R492).** Depende de A1. `PosOrderCardDetalle.tsx`,
  `PosOrderCardMosaico.tsx`, `PosNavBlock.tsx`: `truncate` → `TEXTO_ENTERO`; monto con
  `COLUMNA_FIJA`. `VistaCardsToggle.tsx` a 44 px.
  *Hecho:* `tests/components/PosOrderCard.estado-455.test.tsx` (o uno nuevo
  `tests/components/PosOrderCardSinRecorte.test.tsx`) afirma destinatario y dirección sin
  `truncate`. *Mutación:* devolver `truncate` al destinatario → rojo.
- [x] **A4 [P] `BuscadorFiltros` en 312 px (R495, R496).** `min-w-0 sm:min-w-[250px]`, fila que
  envuelve; props `fija` y `tactil` apagadas por defecto (`design.md §5`).
  *Hecho:* `tests/unit/components/buscador-filtros-movil.test.tsx`: con `fija` lleva `sticky
  top-0`; con `tactil` los controles `h-11`; sin props, las clases de hoy (otros consumidores sin
  cambio). *Mutaciones:* quitar `sticky`; volver `min-w-[250px]` sin `sm:` → rojo.
- [x] **A5 [P] Flotantes que se achican (R497-R499).** `hooks/use-flotante-compacto.ts` con la
  función pura `siguienteCompacto`; aplicar en `components/shared/ReporteBugBoton.tsx` y
  `MA/chat/ChatFlotante.tsx`; leer `--alto-barra-inferior` en `bottom` (`design.md §6`).
  *Hecho:* `tests/unit/hooks/use-flotante-compacto.test.ts` (bajar 9 px → `true`; subir 9 px →
  `false`; `scrollY 0` → `false`; 5 px no cambia) y `tests/components/FlotantesCompactos.test.tsx`
  (con `compacto` el botón tiene `size-11` y conserva `aria-label` y distintivo).
  *Mutaciones:* umbral a 0; `size-12` fijo → rojo.
- [x] **A6 [P] Constante del escáner (R500).** `ESCANER_LABEL_GUIA` en
  `components/shared/EscanerModal.tsx`. *Hecho:* `tests/components/EscanerModal.test.tsx` con la
  etiqueta «Escanear o escribir guía» arranca cerrado. *Mutación:* `defaultOpen` → rojo.
- [x] **A7 Guardia estática (R490, R494).** Depende de A2-A5.
  `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts` con `ARCHIVOS_PWA_MENSAJERO`
  (archivos de A) y las reglas de `design.md §2-§3`.
  *Hecho:* verde sobre los archivos de A. *Mutaciones:* `truncate` en `FilaGestion.tsx`; `gap-1.5`
  en `PosOrderCardDetalle.tsx` → rojo, cada una.
- [ ] **A8 E2E base a 360 px (R490-R493, R497, R501).** Depende de A1-A7.
  `e2e/_pwa-mensajero-fixture.ts` (utilidades `sinDesborde`, `sinElipsis`, `sinSolapes`, `tactil` y
  datos largos de `design.md §12`) y `e2e/pwa-mensajero-base.spec.ts`: Reparto a 360 y 414 px sin
  desborde ni «…» en tarjetas; al bajar, los flotantes miden 44 px; `/cierre-dia` a 1280 px sin «…»
  ni solapes en «Gestiones».
  *Hecho:* verde en local con base desechable. *Mutación:* devolver `truncate` a
  `PosOrderCardDetalle` → rojo.

## Rebanada B — Reparto (R500 en Reparto, R502-R516)

- [ ] **B1 [P] KPI 2×2 (R502).** `MA/KpisMensajero.tsx`. *Hecho:*
  `tests/components/KpisMensajero.test.tsx` comprueba `grid-cols-2` sin `grid-cols-1`.
  *Mutación:* volver `grid-cols-1` → rojo.
- [ ] **B2 [P] Botones de tarjeta a 44 px (R493).** `MA/GestionarOrdenCardButton.tsx`,
  `MA/MarcarLuegoToggle.tsx`, `MA/RecuperarAyudaButton.tsx`, «Conversación» en
  `MA/RepartoModule.tsx`: `size="touch"`. Extraer `MA/ConfirmarGestionDialog.tsx` (diálogo
  «¿Gestionar esta orden?» controlado). *Hecho:* test de componente con los cuatro botones `h-11`.
  *Mutación:* `size="sm"` en uno → rojo.
- [ ] **B3 `BuscadorFiltros` en Reparto (R495, R505, R506).** Depende de A4. `MA/RepartoModule.tsx`
  y `MA/FiltroCantonDistrito.tsx` como `children`. *Hecho:* `tests/components/RepartoModule.test.tsx`:
  un solo `searchbox`, placeholder «Guía, remisión, teléfono o nombre», «Filtros» ofrece «Cantón» y
  «Distrito», distrito deshabilitado sin cantón, cambiar cantón vacía distrito, búsqueda por
  teléfono filtra. *Mutación:* no resetear distrito → rojo.
- [ ] **B4 Orden, lista primero, Mosaico, avisos en una línea (R503, R504, R507, R509).**
  `MA/RepartoModule.tsx`. *Hecho:* test nuevo `tests/components/RepartoMovil.test.tsx`: orden de
  secciones por `compareDocumentPosition`; sin región «Detalle de la orden» fuera de foco; vista
  inicial Mosaico; aviso de ruta en una fila con «Ver más» (`aria-expanded=false`) y descripción
  oculta hasta tocarlo.
  *Mutaciones:* volver el panel inline; vista inicial «detalle» → rojo.
- [ ] **B5 Detalle compacto (R508).** `MA/pos-card/PosOrderCardDetalle.tsx`. *Hecho:* test con la
  fila principal: parada, guía, destinatario y «Valor a cobrar» con `COLUMNA_FIJA`; al tocar,
  dirección y «Gestionar más tarde» / «Gestionar».
  *Mutación:* quitar `COLUMNA_FIJA` del monto → rojo.
- [ ] **B6 Modo foco con «Confirmar guía» (R510-R513).** Depende de B2. `MA/RepartoModule.tsx`
  (`ordenEnFocoId`), `MA/GestionarOrdenPanel.tsx` (`verificacionAbierta`, sin CTA pegajoso),
  `MA/VerificarGuiaGate.tsx` («Confirmar guía»). *Hecho:* test nuevo
  `tests/components/RepartoModoFoco.test.tsx`: tras «Gestionar» + «Aceptar» solo hay el panel, el
  bloque de verificación abierto, un único botón «Confirmar guía» y ningún «Gestionar»/«Gestionar
  esta orden» (`queryAllByRole`); guía correcta → «¿Cómo terminó la gestión?»; incorrecta → «La
  guía {n} no corresponde a esta orden.»; «Volver a la lista» restaura la vista completa sin
  llamar a la acción del servidor. `VerificarGuiaGate.test.tsx`, `GestionarOrdenPanelIncidente.test.tsx`,
  `RepartoModule477Correccion.test.tsx` y `ChatContactoAntesDeRecoger.test.tsx` actualizados.
  *Mutaciones:* dejar el CTA «Gestionar esta orden»; «Volver a la lista» que llama a
  `gestionarPedido` → rojo.
- [ ] **B7 Escáner de la lista (R500, R514-R516).** Desbloqueada: decisión del leader 2026-11-14 (C1, C3). Depende de A6, B6. `MA/EscanerGuiaReparto.tsx`
  y `MA/reparto-escaner.ts` (`ordenPorGuia`). *Hecho:* `tests/unit/utils/reparto-escaner.test.ts`
  (encuentra por guía; ignora las de ayuda; `null` si no está) y
  `tests/components/EscanerGuiaReparto.test.tsx` (guía propia → diálogo → foco en «¿Cómo terminó
  la gestión?»; ajena → «La guía {n} no está en tu lista de reparto.»; bloqueado → sin
  disparador). *Mutación:* `ordenPorGuia` que incluye las de ayuda → rojo.
- [ ] **B8 E2E de Reparto a 360 px.** Depende de B1-B7. `e2e/pwa-mensajero-reparto.spec.ts`
  (KPI en 2 columnas, sin desborde ni «…» con el destinatario largo, botones ≥ 44, Gestionar →
  foco → Confirmar guía → resultado). Actualizar `e2e/mis-asignaciones.spec.ts`,
  `e2e/tope-intentos-por-empresa.spec.ts` y `e2e/reintentos-escalado.spec.ts` al flujo nuevo;
  añadir los archivos de B a la guardia de A7. *Hecho:* verde en local. *Mutación:* volver
  `grid-cols-1` en KPI → rojo en el E2E.

## Rebanada C — Recoger en bodega y Recolección (R500, R506, R516, R517-R522)

- [ ] **C1 [P] Recoger en bodega (R517, R518, R521, R522).** `MA/RecogerModule.tsx`,
  `MA/RecogerPaqueteCard.tsx` (`ESCANER_LABEL_GUIA`). *Hecho:* `tests/components/RecogerModule.test.tsx`
  (orden de secciones; un solo `BuscadorFiltros` fijo; placeholder; Mosaico inicial; vacío de
  búsqueda) y `RecogerPaqueteCard.test.tsx`, `RecogerModuleRefrescoAlVolver.test.tsx` actualizados.
  *Mutación:* escáner debajo del buscador → rojo.
- [ ] **C2 [P] Recolección (R517, R519-R522).** `app/(app)/recoleccion/_components/RecoleccionModule.tsx`,
  `RecolectadasHoyLista.tsx`; reutilizar `MA/mis-asignaciones-buscador.ts` (generalizar la firma si
  hace falta). *Hecho:* `tests/components/RecoleccionModule.test.tsx`: el término filtra las dos
  listas; vacío de búsqueda distinto del vacío sin órdenes; Mosaico inicial; bloqueado sin
  disparador. `RecoleccionPage.test.tsx` actualizado. *Mutación:* filtrar solo «Por recolectar» →
  rojo.
- [ ] **C3 E2E a 360 px.** Depende de C1-C2. `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` (las dos
  pantallas con textos largos, sin desborde ni «…», búsqueda en Recolección). Añadir archivos de C
  a la guardia. *Hecho:* verde en local. *Mutación:* `truncate` en `RecolectadasHoyLista` → rojo.

## Rebanada D — Cierre del día (R523-R538)

- [ ] **D1 Tarjeta de gestión (R523-R525).** `components/private/cierres/fila/FilaGestion.tsx`
  (`--plantilla-fila`, áreas en móvil, `TACTIL_MOVIL`), `GestionesCierre.tsx` (cabecera
  `max-md:hidden`). *Hecho:* `tests/components/FilaGestion.test.tsx` y
  `tests/components/DetalleCierreGestiones.test.tsx`: la rejilla de escritorio solo con `md:`; los
  mismos botones una sola vez. *Mutación:* volver el `style` en línea → rojo.
- [ ] **D2 Buscador y paginación de 25 (R526, R527).** Depende de D1. `GestionesCierre.tsx`,
  `fila-gestion-vista.ts` (`coincideGestion`), `fila-gestion-labels.ts`. *Hecho:* test nuevo
  `tests/components/GestionesCierreMovil.test.tsx` con `useIsMobile` simulado: 30 gestiones → 25 +
  `Pagination`; cambiar pastilla o término vuelve a página 1; búsqueda por remisión; en escritorio
  sin buscador ni paginación. `tests/unit/utils/coincide-gestion.test.ts`. *Mutaciones:*
  `pageSize` 50; no resetear página → rojo.
- [ ] **D3 [P] Rechazados, sin gestión y pestañas (R528-R530).** `RechazosDeTiendaCierre.tsx`,
  `cierre-factura.tsx` (`FilaSinGestion`), `DetalleCierre.tsx` (`TabsList` envuelve). *Hecho:*
  `CierreRechazosDeTienda.test.tsx` y `DetalleCierre.test.tsx` actualizados. *Mutación:* quitar
  `flex-wrap` → rojo en el E2E (D7).
- [ ] **D4 Barra fija y «Solicitar cierre del día» (R531-R534).** `DetalleCierre.tsx` (pie `fixed` en
  móvil, publica `--alto-barra-inferior`), `detalle-cierre-labels.ts`. *Hecho:*
  `tests/unit/utils/detalle-cierre-vista.test.ts`, `CierreDiaModule.test.tsx` y
  `CierreDiaPagina.test.tsx` actualizados («Solicitar cierre del día» con «{n} gestiones» en el
  botón; desactivado con «No tienes gestiones pendientes»; diálogo con «Solicitar cierre» y
  «Cancelar» que no envía); test de las tres pantallas del portal sin ese botón. *Mutaciones:* `sticky` en vez de
  `fixed`; «Cancelar» que envía → rojo.
- [ ] **D5 [P] Cola en tarjetas (R535, R536, R538).** `cola/TablaColaPropia.tsx`
  (`columnasTablaPropiaMovil`), `cola/cola-propia-vista.ts`, `cola/ColaCierres.tsx`,
  `app/(app)/cierre-dia/_components/FiltrosColaPropiaBarra.tsx`. *Hecho:*
  `tests/components/CierreDiaColaPropia.test.tsx` y `ColaCierres.test.tsx`: en móvil 2 columnas y
  `renderExpanded` con folio, recaudado y pago; una sola `DataTable` (censo verde); descarga igual.
  *Mutación:* dos instancias de `DataTable` → rojo en el censo.
- [ ] **D6 [P] «Ver» a pantalla completa (R537).** `DetalleCierre.tsx` marco modal. *Hecho:* test
  con `h-dvh w-screen` en móvil y «Volver» de 44 px. *Mutación:* volver `calc(100dvh-2rem)` → rojo.
- [ ] **D7 E2E a 360 px.** Depende de D1-D6. `e2e/pwa-mensajero-cierre-dia.spec.ts` (30 gestiones
  con textos largos: tarjetas, paginación, sin desborde ni «…», barra fija visible y flotantes
  encima, «Ver»); `e2e/cierre-dia.spec.ts` actualizado. Archivos de D en la guardia. *Hecho:*
  verde en local; también el grupo `dinero` si el diff lo dispara. *Mutación:* `truncate` en la
  fecha del rechazo → rojo.

## Rebanada E — mapa de ruta (R539-R544)

- [ ] **E1 [P] Marcadores con la paleta (R539).** `MA/ruta-mapa-iconos.ts`, `MA/RutaMapaInner.tsx`.
  *Hecho:* `tests/unit/utils/ruta-mapa-iconos.test.ts`: el HTML usa `var(--navy)`,
  `var(--brand-light)`, `var(--success)` y ningún `#hex`. *Mutación:* `#2563eb` → rojo.
- [ ] **E2 [P] Carrusel → mapa (R542).** `components/shared/CarruselCards.tsx` (`onIndiceChange`),
  `MA/RepartoModule.tsx`, `MA/RutaMapa.tsx`. *Hecho:* `tests/components/CarruselCards.test.tsx`
  (emite el índice al cambiar) y `RutaMapaInner.test.tsx` (con `paradaActivaId` llama `panTo`).
  *Mutación:* no emitir en `select` → rojo.
- [ ] **E3 Hoja inferior y pantalla completa (R540, R541, R543, R544).** Depende de E1.
  `MA/HojaParadaMapa.tsx`, `MA/RutaMapaInner.tsx`, `MA/RepartoModule.tsx`. *Hecho:* test nuevo
  `tests/components/HojaParadaMapa.test.tsx` (datos de la parada, «Navegar» → «Abrir en:» y
  «Gestionar» → diálogo) y `RutaMapaInner.test.tsx` («Ver mapa completo» alterna clase y llama
  `invalidateSize`; «Cerrar» vuelve; «Centrar en mi ubicación» con `aria-label`; parada sin
  coordenadas fuera). *Mutación:* no llamar `invalidateSize` → rojo.
- [ ] **E4 E2E a 360 px.** Depende de E1-E3. `e2e/pwa-mensajero-mapa.spec.ts` (mapa abierto sin
  desborde; marcador → hoja; pantalla completa y vuelta; «Mostrar mapa» ≥ 44). Archivos de E en la
  guardia. *Hecho:* verde en local. *Mutación:* `size="xs"` en «Mostrar mapa» → rojo.

## Trazabilidad prevista (R → test)

| Requisitos | Tests |
|---|---|
| R490-R492 | `FilaGestion.test.tsx`, `CierreRechazosDeTienda.test.tsx`, `PosOrderCardSinRecorte.test.tsx`, guardia `pwa-mensajero-sin-recorte`, E2E de cada rebanada (`sinElipsis`, `sinSolapes`) |
| R493 | `button-tactil.test.tsx`, tests de B2/D1/E4, E2E (`tactil`) |
| R494 | guardia `pwa-mensajero-sin-recorte` |
| R495-R496 | `buscador-filtros-movil.test.tsx`, `RepartoModule.test.tsx`, `RecogerModule.test.tsx`, `RecoleccionModule.test.tsx`, `GestionesCierreMovil.test.tsx` |
| R497-R499 | `use-flotante-compacto.test.ts`, `FlotantesCompactos.test.tsx`, `pwa-mensajero-base.spec.ts` |
| R500 | `EscanerModal.test.tsx`, `EscanerGuiaReparto.test.tsx`, `RecogerModule.test.tsx`, `RecoleccionModule.test.tsx` |
| R501 | E2E de cada rebanada (`sinDesborde` a 360 y 414) |
| R502-R516 | B1-B8 |
| R517-R522 | C1-C3 |
| R523-R538 | D1-D7 |
| R539-R544 | E1-E4 |

El implementer lo concreta (archivo y nombre del test) en `progress/impl_SLT-156.md`.

## Archivos esperados

Del conjunto (todas las rebanadas). La rebanada de cada uno, entre corchetes.

Producción:
- `components/ui/button.tsx` [A]
- `components/shared/texto-entero.ts` [A]
- `components/shared/BuscadorFiltros.tsx` [A]
- `components/shared/EscanerModal.tsx` [A]
- `components/shared/ReporteBugBoton.tsx` [A]
- `hooks/use-flotante-compacto.ts` [A]
- `app/(app)/mis-asignaciones/_components/chat/ChatFlotante.tsx` [A]
- `app/(app)/mis-asignaciones/_components/VistaCardsToggle.tsx` [A]
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx` [A, B]
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx` [A, B]
- `app/(app)/mis-asignaciones/_components/pos-card/PosNavBlock.tsx` [A]
- `components/private/cierres/fila/FilaGestion.tsx` [A, D]
- `components/private/cierres/detalle/RechazosDeTiendaCierre.tsx` [A, D]
- `app/(app)/cierres-admin/_components/cierre-factura.tsx` [A, D]
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx` [B, E]
- `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx` [B]
- `app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx` [B]
- `app/(app)/mis-asignaciones/_components/VerificarGuiaGate.tsx` [B]
- `app/(app)/mis-asignaciones/_components/GestionarOrdenCardButton.tsx` [B]
- `app/(app)/mis-asignaciones/_components/ConfirmarGestionDialog.tsx` [B]
- `app/(app)/mis-asignaciones/_components/MarcarLuegoToggle.tsx` [B]
- `app/(app)/mis-asignaciones/_components/RecuperarAyudaButton.tsx` [B]
- `app/(app)/mis-asignaciones/_components/FiltroCantonDistrito.tsx` [B]
- `app/(app)/mis-asignaciones/_components/EscanerGuiaReparto.tsx` [B]
- `app/(app)/mis-asignaciones/_components/reparto-escaner.ts` [B]
- `app/(app)/mis-asignaciones/_components/RecogerModule.tsx` [C]
- `app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx` [C]
- `app/(app)/mis-asignaciones/_components/mis-asignaciones-buscador.ts` [C]
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx` [C]
- `app/(app)/recoleccion/_components/RecolectadasHoyLista.tsx` [C]
- `components/private/cierres/fila/GestionesCierre.tsx` [D]
- `components/private/cierres/fila/fila-gestion-vista.ts` [D]
- `components/private/cierres/fila/fila-gestion-labels.ts` [D]
- `components/private/cierres/detalle/DetalleCierre.tsx` [D]
- `components/private/cierres/detalle/detalle-cierre-labels.ts` [D]
- `components/private/cierres/detalle/CorregirCierre.tsx` [D]
- `components/private/cierres/cola/TablaColaPropia.tsx` [D]
- `components/private/cierres/cola/cola-propia-vista.ts` [D]
- `components/private/cierres/cola/ColaCierres.tsx` [D]
- `app/(app)/cierre-dia/_components/FiltrosColaPropiaBarra.tsx` [D]
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` [D]
- `app/(app)/mis-asignaciones/_components/ruta-mapa-iconos.ts` [E]
- `app/(app)/mis-asignaciones/_components/RutaMapaInner.tsx` [E]
- `app/(app)/mis-asignaciones/_components/RutaMapa.tsx` [E]
- `app/(app)/mis-asignaciones/_components/HojaParadaMapa.tsx` [E]
- `components/shared/CarruselCards.tsx` [E]

Tests:
- `tests/unit/components/button-tactil.test.tsx` [A]
- `tests/unit/components/buscador-filtros-movil.test.tsx` [A]
- `tests/unit/hooks/use-flotante-compacto.test.ts` [A]
- `tests/components/FlotantesCompactos.test.tsx` [A]
- `tests/components/ReporteBugBoton.test.tsx` [A]
- `tests/components/EscanerModal.test.tsx` [A]
- `tests/components/PosOrderCardSinRecorte.test.tsx` [A]
- `tests/components/PosOrderCard.estado-455.test.tsx` [A]
- `tests/components/FilaGestion.test.tsx` [A, D]
- `tests/components/CierreRechazosDeTienda.test.tsx` [A, D]
- `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts` [A, B, C, D, E]
- `e2e/_pwa-mensajero-fixture.ts` [A]
- `e2e/pwa-mensajero-base.spec.ts` [A]
- `tests/components/KpisMensajero.test.tsx` [B]
- `tests/components/RepartoModule.test.tsx` [B, E]
- `tests/components/RepartoMovil.test.tsx` [B]
- `tests/components/RepartoModoFoco.test.tsx` [B]
- `tests/components/RepartoModule477Correccion.test.tsx` [B]
- `tests/components/GestionarOrdenPanelIncidente.test.tsx` [B]
- `tests/components/ChatContactoAntesDeRecoger.test.tsx` [B]
- `tests/components/VerificarGuiaGate.test.tsx` [B]
- `tests/components/EscanerGuiaReparto.test.tsx` [B]
- `tests/unit/utils/reparto-escaner.test.ts` [B]
- `e2e/pwa-mensajero-reparto.spec.ts` [B]
- `e2e/mis-asignaciones.spec.ts` [B]
- `e2e/tope-intentos-por-empresa.spec.ts` [B]
- `e2e/reintentos-escalado.spec.ts` [B]
- `tests/components/RecogerModule.test.tsx` [C]
- `tests/components/RecogerPaqueteCard.test.tsx` [C]
- `tests/components/RecogerModuleRefrescoAlVolver.test.tsx` [C]
- `tests/components/RecoleccionModule.test.tsx` [C]
- `tests/components/RecoleccionPage.test.tsx` [C]
- `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` [C]
- `tests/components/DetalleCierreGestiones.test.tsx` [D]
- `tests/components/GestionesCierreMovil.test.tsx` [D]
- `tests/unit/utils/coincide-gestion.test.ts` [D]
- `tests/components/DetalleCierre.test.tsx` [D]
- `tests/unit/utils/detalle-cierre-vista.test.ts` [D]
- `tests/components/CierreDiaModule.test.tsx` [D]
- `tests/components/CierreDiaPagina.test.tsx` [D]
- `tests/components/CierreDiaColaPropia.test.tsx` [D]
- `tests/components/ColaCierres.test.tsx` [D]
- `e2e/pwa-mensajero-cierre-dia.spec.ts` [D]
- `e2e/cierre-dia.spec.ts` [D]
- `tests/unit/utils/ruta-mapa-iconos.test.ts` [E]
- `tests/components/CarruselCards.test.tsx` [E]
- `tests/components/RutaMapaInner.test.tsx` [E]
- `tests/components/HojaParadaMapa.test.tsx` [E]
- `e2e/pwa-mensajero-mapa.spec.ts` [E]

Total: 46 de producción + 49 de tests = 95 rutas (el tope por PR es 40): por eso las rebanadas.

## Tamaño

| Rebanada | Archivos | Producción (líneas) | Tests (líneas) | % de 40 archivos |
|---|---|---|---|---|
| A | 14 + 13 = 27 | ~300 | ~900 | 68 % |
| B | 13 + 15 = 28 | ~600 | ~1 400 | 70 % |
| C | 5 + 7 = 12 | ~220 | ~600 | 30 % |
| D | 14 + 14 = 28 | ~650 | ~1 500 | 70 % |
| E | 6 + 7 = 13 | ~380 | ~550 | 33 % |

Topes: 40 archivos, 1 000 líneas de producción, 3 000 de tests. Las cifras son estimaciones; si
una rebanada avisa del 80 % al implementarla, D se parte en D1/D2 como dice
`requirements.md > Partir una feature`, y B puede sacar B7 (escáner de lista) a una rebanada propia.
