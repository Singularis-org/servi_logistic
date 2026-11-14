# SLT-156 «PWA de los mensajeros: tablas usables en el móvil» — design

> Requisitos: `requirements.md` (R490-R544). Diseño visual aprobado: canvas
> https://claude.ai/artifact/SNvPjSLv5BApoQTsVQg9GU. Componentes y textos de hoy, con `archivo:línea`:
> `brief-diseno.md`. Este documento dice CÓMO se construye; las rebanadas, en
> `requirements.md > Partir una feature` y `tasks.md`.

## Lo que ya existe

Buscado (2026-11-14) con «PWA», «móvil», «tarjetas», «truncate», «Leaflet», «mapa», «escáner»,
«BuscadorFiltros», «44 px»:

- **Board (`feature_list.json`):** SLT-156 es la única ficha de móvil del mensajero. Aparecieron
  «Capturas e iconos de la PWA con la marca nueva» (iconos y capturas: otro tema) y SLT-152 «Tablas
  de cierres legibles» (cerrada; su «…»+`title` en `FilaGestion` se reemplaza aquí por decisión de
  Carlos, DC10). Nada que se solape.
- **Specs:** ningún spec con R490-R559 ni con vista móvil de estas pantallas.
- **Código** (el grafo no tiene indexado este worktree; se buscó con Grep/Read). Se reutiliza, no
  se re-crea:
  - `hooks/use-mobile.ts` (`useIsMobile`, corte 768 px, `false` en servidor).
  - Precedente de columnas móviles sobre la MISMA `DataTable`:
    `app/(app)/wallet/_components/DetalleFilaComposicion.tsx:203-253`.
  - `components/shared/BuscadorFiltros.tsx` (16 consumidores; ya lo usan `GestionesCierre` y
    `FiltrosColaPropiaBarra`), `FilterComponent` (pastillas con conteo), `Pagination`,
    `EscanerModal` (arranca siempre cerrado: decisión del 2026-07-31, se respeta),
    `CarruselCards` (Embla, evento `select`), `components/ui/sheet.tsx` (hoja), `Modal` (ya trae
    «Cancelar» por defecto, `Modal.tsx:146`).
  - Tarjetas POS (`MA/pos-card/*`), `VistaCardsToggle`, `KpisMensajero`, `GestionarOrdenPanel`,
    `VerificarGuiaGate` (comparación de guía + `QrScanner` click-to-start),
    `mis-asignaciones-buscador.ts` (`coincideBusqueda`: guía, remisión, teléfono, nombre).
  - `RutaMapa`/`RutaMapaInner` (Leaflet + react-leaflet, ya aprobadas en `docs/dependencias.md`).
  - Pie pegajoso del cierre (`DetalleCierre.tsx:338-362`, `sticky bottom-0`) y su diálogo
    (`CierreDiaModule.tsx:635-654`).

`MA/` = `app/(app)/mis-asignaciones/_components/`.

## 0. Lo que esta ficha NO toca

- **Datos:** sin tablas, columnas, migraciones, RLS ni endpoints nuevos. Todo es cliente.
- **Autorización:** sin cambios. Las pantallas ya están limitadas por `menu-visibility.ts` y por
  cada `page.tsx`; ningún componente nuevo hace fetch. Ningún módulo nuevo que encender.
- **País:** los importes siguen saliendo de `money()` con la moneda de la empresa; no se suma
  dinero en el cliente (el resumen del diálogo usa las cifras del servidor, como hoy).
- **Dependencias:** ninguna nueva. Mapa con `leaflet`/`react-leaflet` (aprobadas).
- **Escritorio (≥ 768 px):** mismas columnas y orden (R524). Cambia solo lo que exige R490-R492
  (texto entero, importes en columna fija) y afecta también a `/cierres-admin` (bodega, central).

## 1. Cómo se decide «móvil»

Dos mecanismos, cada uno donde encaja:

1. **CSS (`max-md:` / `md:`)** para todo lo que es maquetación: las filas en rejilla (`FilaGestion`,
   rechazados, sin gestión) pasan a tarjeta reordenando los MISMOS elementos con
   `grid-template-areas`. Un solo DOM: sin parpadeo de hidratación, sin botones duplicados en el
   árbol (los tests por rol no ven dos «Devolver a gestión»).
2. **`useIsMobile()`** solo donde cambia el comportamiento o el contrato de un componente: la
   paginación de 25 y el buscador de «Gestiones» (R526, R527), y las columnas de la `DataTable` de
   «Cierres solicitados» (R535). En el primer render del servidor vale `false` (escritorio): la
   vista móvil aparece en la hidratación; es el comportamiento del precedente de la wallet.

## 2. «Ningún dato se recorta» (R490-R492)

- Se borra `CELDA_RECORTA` y `TextoRecortado` (`FilaGestion.tsx:88-102`). En su lugar, una
  constante compartida `TEXTO_ENTERO = "min-w-0 whitespace-normal wrap-anywhere"` y otra
  `COLUMNA_FIJA = "shrink-0 whitespace-nowrap tabular-nums"` (importes con `text-right`), en
  `components/shared/texto-entero.ts` (dos o más consumidores: cierres y tarjetas POS).
- `FilaGestion`, escritorio: las pistas de importes pasan de `minmax(0,1fr)` a
  `minmax(max-content,1fr)` y la guía a `max-content`; así el importe nunca se monta en la
  columna vecina (el fallo que SLT-152 tapó con el recorte). Las pistas de texto siguen siendo
  `minmax(0,Xfr)` y su texto envuelve.
- Se quita `truncate` de `RechazosDeTiendaCierre.tsx:63-65`, de `FilaSinGestion` y su cabecera
  (`cierre-factura.tsx:2440-2453`, `:2529-2530`) y de las tarjetas POS
  (`PosOrderCardDetalle.tsx:148-170`, `PosOrderCardMosaico.tsx:103-191`, `PosNavBlock.tsx:44`).
  `MensajerosCierreBodega` y el chat no son pantallas del mensajero en este alcance: no se tocan.
- **Guardia estática** `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts`: recorre una
  lista explícita de archivos (`ARCHIVOS_PWA_MENSAJERO`, cada rebanada añade los suyos) y falla si
  aparece `truncate`, `text-ellipsis`, `line-clamp-`, `title={texto}` en una celda de dato, o un
  espaciado fuera de la escala (§3). La lista vive en el test; un archivo nuevo de la ficha que no
  esté en ella lo señala el reviewer.
- La prueba de verdad es el E2E (§12): mide en el navegador, con los textos más largos.

## 3. Escala de espaciado (R494)

Escala de 4 px = clases enteras de Tailwind (`1`=4 px, `2`=8 px, `3`=12 px, `4`=16 px, `6`=24 px…).
Prohibidos en los archivos de la ficha: medios pasos `p|m|gap|space-[xy]?-*(0.5|1.5|2.5|3.5)` y
espaciados arbitrarios `p-[13px]`. Los tamaños de letra no son espaciado y no entran. La guardia
de §2 lo comprueba con una expresión sobre las clases. Canvas v35 (nota «Diseño final» 5): 16 px de
margen, 24 entre secciones, 12 entre tarjetas, 16 de padding; usa 12, así que la escala es de
múltiplos de 4 y la guardia no se endurece (C7).

## 4. Área táctil de 44 px (R493)

- `components/ui/button.tsx`: dos tamaños nuevos, `touch` (`h-11 gap-2 px-4`) e `icon-touch`
  (`size-11`). Los que son solo del mensajero usan `size="touch"` en todos los anchos (son
  pantallas de teléfono).
- Componentes compartidos con escritorio (`FilaGestion`, `TablaColaPropia`, `CorregirCierre`,
  `BuscadorFiltros`): clase `TACTIL_MOVIL = "max-md:min-h-11 max-md:min-w-11"` (en
  `texto-entero.ts`), que no cambia el escritorio.
- Inventario de controles que deben medir ≥ 44 × 44 px en móvil:

| Pantalla | Control | Hoy | Rebanada |
|---|---|---|---|
| Común | Conmutador Mosaico / Detalle (`VistaCardsToggle`) | 28-32 px | A |
| Común | «Filtros», «Limpiar todo», campo de `BuscadorFiltros` (con `tactil`) | 32 px (`h-8`) | A |
| Común | Flotantes reducidos (R497) | 48 / 56 px | A |
| Reparto | «Gestionar», «Gestionar más tarde», «Recuperar», «Conversación» | 28 px (`sm`) | B |
| Reparto | «Confirmar guía», «Volver a la lista», despliegue de aviso de ruta | 32 px | B |
| Reparto | «Escanear o escribir guía» | 32 px | B |
| Reparto | «Ver detalle completo» (Mosaico) | texto | B |
| Recoger / Recolección | «Escanear o escribir guía», pestañas | 32 px | C |
| Cierre | «Devolver a gestión», desplegar (`size-8`), «Ver cálculo» (texto 13 px), «Ver evidencia» | 28-32 px | D |
| Cierre | «Ir a Entregas», «Ver», paginación, pastillas, «Solicitar cierre del día», «Cerrar» | 28-32 px | D |
| Mapa | «Mostrar mapa» (`xs` 24 px), «Pantalla completa», «Salir…», cerrar la hoja | 24 px | E |

## 5. `BuscadorFiltros` (R495, R496)

- Hoy el campo tiene `min-w-[250px]` (`BuscadorFiltros.tsx:512`): con «Filtros» al lado pasa de
  312 px. Cambio: `min-w-0 sm:min-w-[250px]` y la fila envuelve (`flex-wrap`), así a 360 px el
  campo ocupa la línea y «Filtros» baja o queda a su lado según quepa.
- Dos props opcionales, apagadas por defecto (los otros consumidores no cambian, como `siembra` y
  `vistas` de la ficha 453):
  - `fija?: boolean` → `sticky top-0 z-20 bg-background py-2`.
  - `tactil?: boolean` → controles de `h-11` en móvil (`ALTO_CONTROL` condicionado).
- Reparto: `FiltroCantonDistrito` deja de ser una fila aparte; sus dos `Select` se montan como
  `children` de `BuscadorFiltros` con `filtros=[{key:"canton",label:"Cantón"},{key:"distrito",
  label:"Distrito"}]`. Se conservan sus reglas (feature 117: distrito deshabilitado sin cantón,
  reset al cambiar cantón). `leerDeUrl={false}` (Reparto nunca leyó la URL).
- Placeholder «Guía, remisión, teléfono o nombre» (R506) en Reparto, Recoger y Recolección; el
  filtro sigue siendo `coincideBusqueda`. En Recolección es nuevo: se reutiliza la misma función
  (si su tipo no encaja con el ítem de Recolección, se generaliza su firma; no se copia).
- «Gestiones» del cierre (R527, solo móvil): `buscador` pasa a `true` con placeholder «Guía,
  remisión o nombre» (P2) y una función pura `coincideGestion(item, termino)` en
  `fila-gestion-vista.ts` (guía, remisión, destinatario; misma normalización de acentos que
  `coincideBusqueda`: si la normalización es local de `mis-asignaciones-buscador.ts`, se promueve a
  `lib/utils/` porque pasa a tener dos consumidores). En escritorio el buscador no se monta: el
  canvas de SLT-101 no lo dibuja (`BuscadorFiltros.tsx:157-161`).

## 6. Flotantes que se achican (R497-R499, R534)

- Hook nuevo `hooks/use-flotante-compacto.ts`: escucha `scroll` de `window` (pasivo, con
  `requestAnimationFrame`) y devuelve `compacto: boolean` — `true` tras bajar más de 8 px desde el
  último cambio, `false` tras subir más de 8 px o con `scrollY === 0`. Función pura
  `siguienteCompacto(previo, yAnterior, yActual)` exportada para el test unitario.
- `ReporteBugBoton.tsx:561` (`size-12`) y `ChatFlotante.tsx:190` (`size-14`) pasan a `size-11`
  con `compacto`, con `transition-[width,height]`. El nombre accesible, el distintivo y el
  `onClick` no dependen de `compacto`.
- Barra fija inferior (§10): publica su alto en la variable CSS `--alto-barra-inferior` sobre
  `document.documentElement` (efecto con `ResizeObserver`, se limpia al desmontar). Los dos
  flotantes usan `bottom: calc(<offset de hoy> + var(--alto-barra-inferior, 0px))`. Sin barra, la
  variable no existe y la posición es la de hoy.

## 7. Escáner «Escanear o escribir guía» (R500, R514-R516, R522)

- `EscanerModal.tsx`: nueva constante exportada `ESCANER_LABEL_GUIA = "Escanear o escribir guía"`.
  El componente no cambia (sigue arrancando cerrado). Recoger y Recolección le pasan esa etiqueta;
  la tarjeta de dentro conserva su título («Recoger paquete», «Recolectar en tienda») y su flujo
  (R522). Canvas v35 (Recoger, Recolección, EscanerAbierto): disparador de 44 px a todo el ancho,
  icono de cámara, «Escanear o escribir guía» y chevron, bajo el encabezado y encima de
  `BuscadorFiltros`; abre un diálogo con el título de la tarjeta, «Cerrar» (44 px) y el escáner
  único `EscanerGuiaCard`: «Escanear con cámara» / «Apunta al código de la guía», «o», «Número de
  guía» (placeholder «Ej. 1024»), botón con el verbo («Recoger», «Confirmar recolección») y la nota
  «Lee el QR o el código de barras de la etiqueta.».
- Reparto, componente nuevo `MA/EscanerGuiaReparto.tsx`: `EscanerModal` con una tarjeta de campo
  «Número de guía» + `QrScanner` (mismo patrón que `VerificarGuiaGate`). Al confirmar un número:
  función pura `ordenPorGuia(ordenes, numGuia)` en `MA/reparto-escaner.ts` sobre
  `porGestionar` (sin las de ayuda ni las bloqueadas). Si hay orden → cierra el modal y abre
  «¿Gestionar esta orden?» (el mismo diálogo de `GestionarOrdenCardButton`, extraído a un
  componente controlado `ConfirmarGestionDialog` para no duplicarlo); al aceptar → modo foco con
  la guía ya verificada (`gestionarPedido` + paso «resultados»). Si no hay → toast «La guía {n} no
  está en tu lista de reparto.» (C3). Decisión del leader 2026-11-14 (regla de Carlos: misma posición en todas las pantallas): el
  disparador va en Reparto bajo el encabezado y encima de la barra de filtros, en Mosaico y en Detalle
  (R503).
- Bloqueado (R516): ninguna de las tres pantallas monta el disparador (Recoger y Recolección ya lo
  hacen así; Reparto lo hereda).

## 8. Reparto (R502-R513)

- **KPI 2×2:** `KpisMensajero.tsx:58` `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` →
  `grid-cols-2 lg:grid-cols-4`; en móvil (canvas v35) círculo del icono de 36 px, rótulo arriba y
  cifra de 20 px debajo (4 px entre ellos), 16 px de padding y 12 px entre tarjetas, con
  `COLUMNA_FIJA` para que «₡99 999 999» quepa en ~148 px sin partirse.
- **Orden y lista primero (R503, R504):** se quita el `GestionarOrdenPanel` inline de la vista
  completa (`RepartoModule.tsx:809-820`). El panel solo se pinta en modo foco.
- **Modo foco (R510-R513):** hoy `modoFoco` depende del puntero 1-a-1 del servidor
  (`ordenEnGestionId`). Se añade un estado de cliente `ordenEnFocoId` (orden elegida, guía sin
  confirmar). Modo foco = puntero fijado **o** `ordenEnFocoId !== null`. Con `ordenEnFocoId`:
  - el panel monta con el bloque de verificación ya abierto (prop nueva
    `verificacionAbierta`) y **sin** el CTA pegajoso «Gestionar esta orden»
    (`GestionarOrdenPanel.tsx:1311-1331`) ni el `ChevronUp` de ocultar: el bloque es la acción;
  - `VerificarGuiaGate` → botón «Confirmar guía», `size="touch"`; el aviso de no coincidencia es
    el de hoy (R512);
  - «Volver a la lista» (`size="touch"`, variante `outline`) vacía `ordenEnFocoId`; solo se ofrece
    antes de confirmar (después ya existe «Cancelar gestión»).
  - Al confirmar la guía se llama `handleGestionarPedido` de hoy (fija el puntero en el servidor);
    desde ahí el modo foco sigue como ya funciona.
- **«Gestionar» de la tarjeta:** `onConfirmar` deja de seleccionar la orden para el panel inline y
  pasa a fijar `ordenEnFocoId`.
- **Mosaico por defecto (R507):** ya es así (`RepartoModule.tsx:225-233`); se fija con test.
- **Detalle compacto (R508, canvas v35: RepartoDetalle):** `PosOrderCardDetalle` reordena su fila:
  parada | guía (mono) y destinatario debajo (envuelve) | «Valor a cobrar» + monto
  (`COLUMNA_FIJA`). Toda la fila es el disparador (`aria-expanded`); al tocarla se despliegan la
  dirección completa y «Gestionar más tarde» / «Gestionar» (44 px, 12 px entre ellos). Intentos y
  marcas siguen en el despliegue, en líneas propias (no se esconden: R490).
- **Avisos en una línea (R509, canvas v35):** cada `Alert` de ruta se pinta en una fila: título
  (se parte si no cabe), botón «Ver más» (`ghost`, 44 px, `aria-expanded`) que despliega la
  descripción, y «Mostrar mapa» en la misma fila.
- **Botones a 44 px:** `GestionarOrdenCardButton`, `MarcarLuegoToggle`, `RecuperarAyudaButton` y
  «Conversación» → `size="touch"`.

## 9. Recoger en bodega y Recolección (R517-R522)

- `RecogerModule.tsx:281-396` y `RecoleccionModule.tsx:209-315`: se reordenan según R518/R519;
  `RecogerPaqueteCard` y el `EscanerModal` de Recolección pasan `label={ESCANER_LABEL_GUIA}`.
- Buscador de hoy de Recoger (`RecogerModule.tsx:323-344`, `Input` propio) → `BuscadorFiltros`
  `fija tactil leerDeUrl={false}`, sin `filtros`.
- Recolección: `BuscadorFiltros` nuevo; el término filtra `porRecolectar` y la lista de
  `RecolectadasHoyLista` (se le pasa el término o la lista ya filtrada). Conteos de las cabeceras:
  los de hoy (total, sin filtrar). Vacío de búsqueda: «Ninguna guía por recolectar coincide con la
  búsqueda.» (C8, decisión del leader 2026-11-14; el de Recoger no cambia).
- Mosaico por defecto: se verifica con test en las dos.

## 10. Cierre del día (R523-R538)

- **`FilaGestion` (R523-R525):** la plantilla de columnas deja el `style` en línea
  (`plantillaFila`) y pasa a la variable `--plantilla-fila`, aplicada solo con
  `md:[grid-template-columns:var(--plantilla-fila)]`. En móvil la misma rejilla usa
  `grid-template-areas`:
  `"dest ganancia" "guia ganancia" "resultado acciones" "senales senales"`; tienda va junto a la
  guía (`guía · tienda`), «Recibido» y la columna «Mensajero» se ocultan en la tarjeta (están en el
  detalle desplegado: «Recibió el mensajero»; el mensajero, en la cabecera del cierre de bodega).
  La cabecera de columnas de `GestionesCierre` se oculta en móvil (`max-md:hidden`). Chevron y
  «Devolver a gestión» con `TACTIL_MOVIL`; «Ver cálculo» con `min-h-11` en móvil. El detalle
  desplegado ya es `grid-cols-1` en móvil (`FilaGestion.tsx:252`, `:258`).
- **`GestionesCierre` (R526, R527):** con `useIsMobile()`: `BuscadorFiltros` con `buscador`,
  `fija` y `tactil`; filtra `visibles` con `coincideGestion`; pagina con `Pagination`
  (`pageSize=25`, sin selector de tamaño) sobre la lista filtrada; `useEffect` vuelve a página 1 al
  cambiar filtro o término. Escritorio: exactamente lo de hoy.
- **Rechazados y sin gestión (R528, R529):** mismo patrón de áreas (CSS). Fecha del rechazo con
  `COLUMNA_FIJA`.
- **Pestañas (R530):** `TabsList` de `DetalleCierre.tsx:315-318` con `flex-wrap gap-x-6 gap-y-2`.
- **Barra fija (R531, R534):** el `footer` del marco página (`DetalleCierre.tsx:338-342`) en móvil
  pasa de `sticky` a `fixed inset-x-0 bottom-0 z-30 border-t bg-background px-4 py-3` con
  `padding-bottom: env(safe-area-inset-bottom)`; el cuerpo recibe un relleno inferior igual al alto
  de la barra (misma medición que publica `--alto-barra-inferior`). `ACCION_SOLICITAR`
  (`detalle-cierre-labels.ts:129`) → «Solicitar cierre del día»; solo lo usa la audiencia
  mensajero (`detalle-cierre-vista.ts:541`). Canvas v35: botón negro de 52 px a todo el ancho con el
  contador «{n} gestiones» a la derecha dentro del botón (sustituye la línea «Recaudado {monto} ·
  {n} gestiones»); sin gestiones, desactivado (gris) con «0 gestiones» y «No tienes gestiones
  pendientes» encima.
- **Diálogo (R533):** el de hoy (`CierreDiaModule.tsx:635-654`) ya tiene título «Solicitar cierre
  del día», resumen y «Cancelar» (por defecto de `Modal`); se fija con test. El botón de confirmar
  queda «Solicitar cierre» (C8).
- **`Solicitar cierre del día` solo aquí (R532):** hoy ya es así; un test de las tres pantallas del
  portal lo fija.
- **Cola «Cierres solicitados» (R535, R536):** `columnasTablaPropiaMovil(acciones)` en
  `TablaColaPropia.tsx`, dos columnas: «Cierre» (fecha de solicitud + `EstadoCierreBadge`, destino
  debajo) y «Ganancia» (importe con `COLUMNA_FIJA` + «Ver» con `TACTIL_MOVIL`); folio, recaudado y
  pago por `renderExpanded` de la misma `DataTable`. `ColaCierres` elige el juego con
  `useIsMobile()` solo para `tipo="propios"`. **Una sola instancia de `DataTable`**: el censo
  (`tests/unit/descarga/censo-tablas.ts`) y la descarga no cambian (R538).
- **«Ver» (R537):** `DetalleCierre` marco modal, en móvil `h-dvh w-screen max-w-none rounded-none`
  (hoy `h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)]`, `DetalleCierre.tsx:377`). Las tarjetas
  salen solas: son los mismos componentes. Canvas v35 (CierreVer): «Volver» (44 px, flecha) en la
  barra superior del panel en lugar de «Cerrar».
- **Trato:** los textos nuevos de cierres van en «tú» (guardia `cierres-trato-tu`).

## 11. Mapa de ruta (R539-R544)

- **Colores (R539):** función pura `htmlMarcador(tipo, numero?)` en `MA/ruta-mapa-iconos.ts`
  (parada, parada activa, origen) que arma el HTML del `L.divIcon` con variables CSS de la paleta
  (`var(--navy)` parada, `var(--brand-light)` activa, `var(--success)` origen; texto
  `var(--card)`), en lugar de `#2563eb`/`#16a34a` (`RutaMapaInner.tsx:38-50`). El `divIcon` vive en
  el DOM, así que las variables y el tema oscuro aplican.
- **Colores en el canvas v35 (RepartoMapa):** siguiente parada `#FFD000` con número negro y anillo;
  pendientes `#111111` con número blanco; gestionadas `#a8a29e` con check; origen «Tú» (círculo con
  borde blanco y etiqueta «Tú»). Leyenda bajo el mapa: «Siguiente · Pendiente · Gestionada · Tú».
  Debajo, la nota del punto de partida de hoy y los botones «Ver mapa completo» / «Ocultar mapa»
  (44 px). Bajo el carrusel, «El mapa se centra en la orden del carrusel.».
- **Hoja inferior (R540):** `MA/HojaParadaMapa.tsx` sobre `Sheet side="bottom"` con asa
  («Arrastrar para ampliar la hoja»); recibe la orden de la parada y muestra número, remisión,
  destinatario, estado, dirección, «COBRAR» + monto, y «Navegar» (abre la fila «Abrir en:» de
  `AbrirEnAppNavegacion`) y el `GestionarOrdenCardButton` de su tarjeta (mismo flujo que R510). El
  marcador abre la hoja vía `eventHandlers.click`.
- **Pantalla completa (R541):** el MISMO contenedor del mapa alterna a `fixed inset-0 z-50` y llama
  `map.invalidateSize()`; se entra con «Ver mapa completo» y se sale con «Cerrar» en la barra
  superior, junto a «Paradas {n} de {total}»; botón flotante «Centrar en mi ubicación»
  (`size="icon-touch"`, `aria-label`). Un solo `MapContainer`.
- **Centrado con el carrusel (R542):** `CarruselCards` gana `onIndiceChange?(indice)` (ya escucha
  `select`, `CarruselCards.tsx:47`). `RepartoModule` traduce índice → parada y pasa
  `paradaActivaId` a `RutaMapa`; `RutaMapaInner` hace `map.panTo` y pinta esa parada como activa.
- **Sin coordenadas (R543):** `paradasMapa` ya filtra; se fija con test.

## 12. Verificación

- **E2E por rebanada** en `e2e/pwa-mensajero-*.spec.ts`, con `page.setViewportSize({ width: 360,
  height: 780 })` y repetición a 414 (precedente `e2e/cierre-dia.spec.ts:179-200`). Utilidad común
  en `e2e/_pwa-mensajero-fixture.ts`:
  - `sinDesborde(page, selector)`: `scrollWidth <= clientWidth` del documento y del contenedor.
  - `sinElipsis(page, region)`: recorre los elementos con texto de la región y falla si alguno
    tiene `getComputedStyle(el).textOverflow === "ellipsis"`, `-webkit-line-clamp` distinto de
    `none`, o `overflow: hidden` con `scrollWidth > clientWidth`.
  - `sinSolapes(page, fila)`: las cajas (`getBoundingClientRect`) de los datos de una fila no se
    intersectan (R492).
  - `tactil(locator)`: caja ≥ 44 × 44.
  - Datos largos (fijos en el fixture, no leídos de la fuente que se prueba): destinatario de 80
    caracteres con una palabra de 40 sin espacios; tienda de 60; dirección de 200; producto de 120;
    motivo de rechazo de 300; importe ₡99 999 999,99; guía de la mayor longitud que admite el alta.
  - Base desechable y `NEXT_PUBLIC_APP_URL` como en `gate.yml` (`docs/perfil-agentes.md`).
- **Mutaciones** (en `tasks.md`, una por regla que el test debe matar): devolver `truncate` a una
  celda; quitar `wrap-anywhere`; volver la pista de importe a `minmax(0,1fr)`; `size="sm"` en un
  botón de tarjeta; `size-12` fijo en el flotante; quitar `fija`; volver el `min-w-[250px]`; volver
  el panel inline; volver «Gestionar» en el gate; `pageSize` 50; `sticky` en vez de `fixed`; hex en
  el marcador.
- **Unitarios/componentes**: funciones puras (`siguienteCompacto`, `ordenPorGuia`,
  `coincideGestion`, `htmlMarcador`) y componentes con Testing Library (orden de secciones por
  `compareDocumentPosition`, textos, ausencia de botones duplicados por `getAllByRole`).

## 13. Alternativas descartadas

1. **Modo `vista="tarjetas"` dentro de `DataTable`.** Evitaría repetir la columna apilada, pero
   `DataTable` tiene decenas de consumidores y un censo que cuenta instancias; un modo nuevo
   obliga a revisar todos y solo lo usaría una tabla de esta ficha (T5). Se sigue el precedente de
   la wallet: columnas alternativas en el consumidor, una sola instancia.
2. **Pintar dos árboles (tabla y tarjetas) y esconder uno con CSS.** Duplica botones en el DOM
   (`getByRole` encuentra dos «Devolver a gestión»; lectores de pantalla), duplica el estado de
   desplegado y dobla el coste de render en listas de cientos de gestiones. Se reordena el mismo
   árbol con `grid-template-areas`.
3. **`useIsMobile` para todo el cambio a tarjetas.** El servidor pinta escritorio y el teléfono vería
   la rejilla aplastada hasta hidratar; con CSS la tarjeta sale desde el primer pintado. Se usa el
   hook solo donde cambia el comportamiento (paginación, buscador, columnas de `DataTable`).
4. **Pantalla completa con la Fullscreen API o el plugin `leaflet.fullscreen`.** La API de elemento
   no funciona en Safari de iPhone fuera de vídeo, y el plugin es una dependencia nueva (regla 7).
   Se alterna el contenedor a `fixed inset-0` e `invalidateSize()`.
5. **Mantener el panel de gestión inline y solo achicarlo.** Es lo que Carlos pidió quitar
   (lista primero, gestión en foco, sin botón duplicado).
