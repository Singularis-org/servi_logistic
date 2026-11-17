# SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» — requirements (ruta ligera)

Zona frontend, complexity low. Rango de requisitos: **R910-R939** (usados R910-R921 y R925-R929).

> **BLOQUEADO: no cabe en un PR.** Con las decisiones de Carlos del 2026-11-17, `## Archivos
> esperados` suma 37 archivos (92,5% del tope de 40; el límite del spec es el 80% = 32). La
> propuesta de corte en dos rebanadas está en `## Preguntas abiertas > P5`. Los requisitos ya van
> agrupados por rebanada para que el corte sea mecánico.

## Alcance

Cierra lo que R493 de SLT-156 «PWA de los mensajeros: tablas usables en el móvil» dejó por debajo de
44 × 44 px. Fuente: `progress/comparacion-canvas-pwa-2026-11-16.md` (filas D9, C6, G1, G2) y el
comentario de la tarjeta sobre el (i) de `EstadoConInfo`. Los tamaños de «Hoy» salen de las clases
(`size="touch"` = `h-11`, `icon-touch` = `size-11`); el informe no midió.

### Rebanada A — controles de la PWA, encabezado y menú

| # | Control | Archivo:línea (rama de hoy) | Hoy |
|---|---|---|---|
| D9 | «Ver detalle completo» (Mosaico) | `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx:273` | texto de 10 px sin alto mínimo |
| G1 | Hamburguesa («Toggle Sidebar») | `app/(app)/layout.tsx:173` → `components/ui/sidebar.tsx:266` | `icon-sm` (28 × 28) |
| G1 | «Instalar la aplicación» (solo icono) | `components/shared/PageHeader.tsx:122` → `components/shared/InstalarPwaButton.tsx:30` | `icon` (32 × 32) |
| G1 | «Ayuda de esta pantalla» | `components/shared/AyudaBoton.tsx:117-123` | `outline`, `h-8` (32 de alto) |
| G1 | «Cambiar tema» | `components/shared/TemaToggle.tsx:58-67` | `h-8` (32 de alto) |
| G1 | «Notificaciones» | `components/shared/NotificationsBell.tsx:254-265` | `p-1` + icono de 20 (28 × 28) |
| G1 | «Salir» | `app/_components/LogoutButton.tsx:66-70` | `h-8` (32 de alto) |
| G2 | Ítems del menú lateral | `components/ui/sidebar.tsx:487` (`h-8`) vía `app/(app)/_components/Sidebar.tsx:390,434` | 32 de alto |
| G2 | Subítems del menú lateral | `components/ui/sidebar.tsx:682` (`h-7`) vía `app/(app)/_components/Sidebar.tsx:406` | 28 de alto |
| — | (i) de `EstadoConInfo` / `NotaAyudaConInfo` / `InfoEstado` | `components/shared/EstadoInfo.tsx:85-86` (`size-4` + `after:-inset-1`); usos abajo | caja de 16, área de 24 × 24 |

Usos del (i):
- **Entran a 44 en todos los anchos** (pantallas solo del mensajero):
  - `pos-card/PosOrderCardMosaico.tsx:129` (estado) y `:139` (nota de ayuda);
  - `pos-card/PosOrderCardDetalle.tsx:104` (nota de ayuda);
  - `pos-card/PosCardHeader.tsx:77` y `:90`;
  - `chat/ChatConversacion.tsx:700`;
  - `chat/ChatOrdenesLista.tsx:169` (`InfoEstado`, sin `className`);
  - `GestionarOrdenPanel.tsx:852`;
  - `HojaParadaMapa.tsx:152`.

  Todos bajo `app/(app)/mis-asignaciones/_components/`.
- **Entran a 44 solo en móvil** (compartido con escritorio): `components/private/cierres/fila/FilaGestion.tsx:223` y `:483`.
- **Excepción, se queda en 24 × 24:** `pos-card/PosOrderCardDetalle.tsx:93`, el (i) que flota sobre el
  chip de estado (`botonFlotante`).
- Lo hace **SLT-190 «Recoger y Recolección según el canvas»** (fuera): el (i) de la fila plegada de
  Recolección.

### Rebanada B — el escáner es un solo componente

Todos los usos de `components/shared/EscanerModal.tsx` (estado tras SLT-190), con el título de su barra:

| Pantalla | Archivo:línea | Disparador | Título de la barra | Tarjeta de dentro | Quién |
|---|---|---|---|---|---|
| Reparto | `app/(app)/mis-asignaciones/_components/EscanerGuiaReparto.tsx:67` | `tactil` | **«Abrir orden por guía»** (título de hoy de su tarjeta, `:24`) | `EscanerGuiaCard` → sin encabezado | SLT-193 |
| Recoger en bodega | `app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx:55` (SLT-190) | `tactil` | «Recoger paquete» | ya sin encabezado | SLT-190 |
| Recolección | `app/(app)/recoleccion/_components/RecoleccionModule.tsx:258` (SLT-190) | `tactil` | «Recolectar en tienda» | ya sin encabezado | SLT-190 |
| Bodega satélite, guía suelta | `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx:188` | por defecto | «Recibir paquete» | `EscanerGuiaCard` (`:195`) → sin encabezado | SLT-193 |
| Órdenes (tienda / bodega central), guía suelta | `app/(app)/ordenes/_components/OrdenesListado.tsx:1409` | por defecto | «Recibir paquete» | `EscanerRecepcionBodegaCentral.tsx:167` y/o `EscanerRecepcionOrigen.tsx:156` → sin encabezado | SLT-193 |
| Recepción continua táctil (satélite, tienda, bodega central) | `components/shared/RecibirPaquetesEntrada.tsx:59` | por defecto | «Recibir paquetes» (`RECIBIR_PAQUETES`) | `TarjetaEscaneoContinuo` de `EscanerRecepcion.tsx:108`, `EscanerRecepcionOrigen.tsx:88` y `EscanerRecepcionBodegaCentral.tsx:90` → sin encabezado | SLT-193 |
| Cámara del buscador | `components/shared/BuscadorFiltros.tsx:700` | `soloIcono` | «Escanear con cámara» (`ESCANEAR_CON_CAMARA`) | `CamaraDelBuscador` (`:75-104`) → sin su `CardHeader` | SLT-193 |

No son diálogos de escáner y no cambian:
- `cierre-confirmacion-fisica.tsx:684` (`app/(app)/cierres-admin/_components/`): `EscanerGuiaCard` dentro
  de otro diálogo, el de la confirmación física.
- `RecepcionContinuaPagina` (modo `pagina`): una página, no un diálogo.

`EscanerGuiaCard` y `EscaneoContinuo` no tienen cierre propio. «Cerrar cámara» de `QrScanner.tsx:281-293`
apaga la cámara: no cierra el diálogo y no entra (ver P6).

**Fuera de las dos rebanadas:**
- «Navegar» de 44 × 44 aparte (D10): no está en la ficha.
- La X de la hoja del mapa (M6): es una acción de más, no un tamaño.

## Cómo se acota

Nada de rediseño: se reutilizan los patrones que ya existen.
- **Pantallas solo del mensajero:** `min-h-11` o `size="touch"` / `size="icon-touch"`
  (`components/ui/button.tsx:120-121`), en todos los anchos (`specs/SLT-156-pwa-mensajero-tablas/design.md §4`).
- **Encabezado y menú:** son de todos los roles. Llevan `TACTIL_MOVIL`
  (`components/shared/texto-entero.ts:19`, `max-md:min-h-11 max-md:min-w-11`), y en el menú
  `max-md:h-11`. Se acota por ancho, no por rol (decisión de Carlos). No se tocan
  `components/ui/sidebar.tsx` ni `components/ui/button.tsx`.
- **(i):** el patrón de SLT-190, `CLASE_INFO_TACTIL = "[&_button]:after:-inset-3.5"`, en el
  `className` del envoltorio (16 + 2 × 14 = 44). Crece el pseudo-elemento, no la caja.
  - `CLASES_BOTON_INFO` (`EstadoInfo.tsx:85`) **no se toca**.
  - En `FilaGestion`, la misma clase con prefijo `max-md:`.
  - Tras el merge de SLT-190, la constante pasa a `texto-entero.ts` junto a `TACTIL_MOVIL`.
    `PosOrderCardDetalle.tsx` la re-exporta, porque su test la importa de ahí.
- **Escáner:** la barra y el «Cerrar» que SLT-190 añadió como opcionales (con `titulo`) pasan a ser
  el comportamiento único de `EscanerModal`.
  - `titulo` deja de ser opcional, así que el typecheck obliga a cada uso.
  - La rama sin `titulo` (título `sr-only` y la X `icon-sm` del `Dialog`) se borra.
  - El «Cerrar» es `size="icon-touch"` en todos los anchos: una sola barra para todos.
  - `components/ui/dialog.tsx` no se toca.
- **`tactil` se queda:** no gobierna el diálogo sino el **disparador** (44 px y todo el ancho en
  Reparto, Recoger y Recolección; `EscanerModal.tsx:176-181` de SLT-190). Quitarlo agrandaría los
  disparadores de escritorio de Órdenes y Recepción, y eso no lo pide nadie.

## Requisitos (EARS)

«Móvil» = viewport de menos de 768 px (`max-md`). Los E2E van a **360 px** con la sesión de mensajero
de `e2e/_pwa-mensajero-fixture.ts`.

### Rebanada A

**«Ver detalle completo» (D9)**

- **R910** — En la tarjeta Mosaico del mensajero, el disparador «Ver detalle completo» DEBE medir al
  menos 44 px de alto y todo el ancho del bloque, en todos los anchos. Su texto, su chevron y el
  despliegue NO DEBEN cambiar.
  - *Test de componente:* `tests/components/botones-44-pwa-mensajero.test.tsx` (`min-h-11` en el disparador; despliega como hoy).
  - *E2E:* alto ≥ 44 en Reparto, vista Mosaico.

**Encabezado (G1)**

- **R911** — MIENTRAS la pantalla es móvil, para **cualquier rol**, estos controles DEBEN medir al
  menos 44 × 44 px cada uno:
  - la hamburguesa;
  - «Instalar la aplicación», cuando se ofrece;
  - «Ayuda de esta pantalla», cuando la pantalla tiene documento;
  - «Cambiar tema»;
  - «Notificaciones», con y sin pendientes;
  - «Salir».

  - *Test de componente:* `tests/components/PageHeader.test.tsx` (cada control lleva `TACTIL_MOVIL`). La hamburguesa vive en el layout de servidor y solo la cubre el E2E.
  - *E2E:* caja ≥ 44 × 44 de cada control a 360 px.
- **R912** — MIENTRAS la pantalla es móvil, el encabezado NO DEBE desbordar en horizontal y el orden
  de sus controles NO DEBE cambiar.
  - *E2E:* a 360 px, `scrollWidth <= clientWidth` del documento.
- **R913** — MIENTRAS la pantalla es de escritorio (768 px o más), los controles del encabezado NO
  DEBEN cambiar de tamaño.
  - *Test de componente:* `PageHeader.test.tsx` (ninguna clase de tamaño nueva sin el prefijo `max-md:`).
  - *E2E:* a 1280 px, «Salir» mide 32 px de alto, como hoy.

**Menú lateral (G2)**

- **R914** — MIENTRAS la pantalla es móvil, para cualquier rol, cada ítem y cada subítem del menú
  lateral abierto DEBE medir al menos 44 px de alto y todo el ancho del menú.
  - *Test de componente:* `tests/components/Sidebar.test.tsx` (`max-md:h-11` en ítems y subítems).
  - *E2E:* se abre con la hamburguesa a 360 px; cada enlace visible mide ≥ 44 de alto.
- **R915** — MIENTRAS la pantalla es de escritorio, ítems y subítems NO DEBEN cambiar (`h-8` / `h-7`,
  rail incluido).
  - *Test de componente:* `Sidebar.test.tsx` (la clase nueva lleva siempre `max-md:`; `h-8` y `h-7` siguen).

**(i) de estado y de nota de ayuda**

- **R916** — En los usos del mensajero que «entran a 44 en todos los anchos» (`## Alcance`), el
  botón (i) DEBE tener un área activable de al menos 44 × 44 px, en todos los anchos. Su caja NO DEBE
  crecer (sigue en 16 × 16) ni cambiar la altura de la fila.
  - *Test de componente:* `tests/components/botones-44-pwa-mensajero.test.tsx` (cada uso lleva `CLASE_INFO_TACTIL` en el envoltorio; `ChatOrdenesLista` con envoltorio nuevo).
  - *E2E:* en Reparto, `elementFromPoint` a 20 px del centro del (i) devuelve el botón, y su caja mide 16 × 16.
- **R917** — CUANDO el mensajero pulsa dentro del área ampliada de un (i), DEBE abrirse su
  explicación y la tarjeta NO DEBE seleccionarse ni desplegarse (es el efecto de hoy, `cortarClick`).
  - *E2E:* se pulsa a 18 px del centro del (i) de una tarjeta Mosaico; aparece la explicación y la tarjeta no cambia de estado.
- **R918** — El (i) que flota sobre el chip de estado en la tarjeta Detalle
  (`PosOrderCardDetalle.tsx:93`, `botonFlotante`) NO DEBE ampliarse: su área sigue en 24 × 24.
  Excepción explícita de Carlos (2026-11-17).
  - *Test de componente:* `botones-44-pwa-mensajero.test.tsx` (el envoltorio del (i) flotante no lleva `CLASE_INFO_TACTIL`; el botón conserva `after:-inset-1`).
- **R919** — En `FilaGestion` (Cierre del día; compartido con escritorio y con otros roles):
  - MIENTRAS la pantalla es móvil, el (i) DEBE tener un área activable de al menos 44 × 44 px;
  - en escritorio NO DEBE cambiar (24 × 24).

  - *Test de componente:* `botones-44-pwa-mensajero.test.tsx` (la clase lleva el prefijo `max-md:`).
  - *E2E:* en Cierre del día a 360 px, `elementFromPoint` a 20 px del centro.
- **R920** — Los demás usos de `EstadoConInfo`, `InfoEstado`, `NotaAyudaConInfo` y
  `SenalPendienteConInfo` NO DEBEN cambiar: siguen con un área de 24 × 24 (landing, rastreo, admin,
  satélite, tienda).
  - *Test de componente:* `tests/components/EstadoInfo.test.tsx` (`CLASES_BOTON_INFO` sigue con `after:-inset-1` y sin `-inset-3.5`; sin `className`, el envoltorio no lleva `CLASE_INFO_TACTIL`).
- **R921** — Ningún control que toca la rebanada A DEBE cambiar su nombre accesible, su texto visible
  ni su acción.
  - *Tests de componente:* cada test busca el control por su rol y su nombre de hoy, y los asertos de hoy siguen en verde.

### Rebanada B — escáner único

- **R925** — CUANDO se abre cualquier diálogo de `EscanerModal`, DEBE mostrar arriba una barra con
  el título visible que pasa la pantalla y un único botón «Cerrar» de al menos 44 × 44 px, en todos
  los anchos y sea cual sea el disparador (`tactil`, `soloIcono` o el de por defecto). NO DEBE
  aparecer la X del `Dialog`.
  - *Test de componente:* uno solo, en `tests/components/EscanerModal.test.tsx`, parametrizado con los tres disparadores. Comprueba la barra con el título, un solo «Cerrar» con `size-11` y ninguna X de `data-slot="dialog-close"`. Sustituye el caso R871 de SLT-190.
  - *E2E:* «Cerrar» mide ≥ 44 × 44 en Reparto a 360 px.
- **R926** — CUANDO el usuario pulsa «Cerrar», el diálogo DEBE cerrarse con el efecto de hoy: la
  cámara se apaga y, si hubo al menos una recepción, la sesión refresca una vez (R598).
  - *Test de componente:* `EscanerModal.test.tsx` (cierra y desmonta la tarjeta).
  - Los casos de refresco de `tests/components/RecibirPaquetesEntrada.test.tsx` siguen en verde.
- **R927** — Cada uso de la tabla de la rebanada B DEBE pasar el título de su fila, y la tarjeta de
  dentro NO DEBE repetir el encabezado (icono, título y descripción). El nombre accesible de la
  sección y el texto del botón de envío NO DEBEN cambiar.
  - *Tests de componente:* `tests/components/EscanerGuiaReparto.test.tsx`, `EscanerRecepcion.test.tsx`, `EscanerRecepcionOrigen.test.tsx`, `EscanerRecepcionBodegaCentral.test.tsx`, `RecibirPaquetesEntrada.test.tsx` y `tests/unit/components/buscador-filtros-escaneo.test.tsx`. Cada uno comprueba el título de la barra, un único encabezado y el nombre de la sección.
- **R928** — Ninguna pantalla DEBE pintar su propio cierre del diálogo del escáner. `EscanerModal`
  DEBE ser el único que lo pinta, y todo `<EscanerModal` del código DEBE llevar `titulo`.
  - *Guardia:* `tests/unit/guards/escaner-un-solo-cierre.guardia.test.ts`. Recorre `app/` y `components/`; en los archivos que montan `EscanerModal` no admite `DialogClose`, `showCloseButton` ni un botón «Cerrar» propio, y exige `titulo=` en cada `<EscanerModal`.
  - El typecheck lo refuerza, porque `titulo` pasa a ser obligatorio.
- **R929** — Los disparadores NO DEBEN cambiar:
  - `tactil`: 44 px y todo el ancho;
  - `soloIcono`: icono de cámara;
  - por defecto: `h-8`.

  En Reparto, al encontrar la orden el diálogo DEBE seguir cerrándose solo (R514).
  - *Tests de componente:* `EscanerModal.test.tsx` (clases de los tres disparadores) y `EscanerGuiaReparto.test.tsx` (R514 sigue en verde).

## Decisiones

- **2026-11-17 · Carlos (P1):** el encabezado y el menú van a 44 px en móvil para **todos los
  roles**. Se acotan por `max-md:`, no por rol, y el escritorio no cambia (R911-R915).
- **2026-11-17 · Carlos (P2):** el (i) que flota sobre el chip de estado en la tarjeta Detalle
  (`PosOrderCardDetalle.tsx:93`) se queda en 24 px. Es una excepción explícita, fijada por R918.
- **2026-11-17 · Carlos (P3):** el (i) de `FilaGestion` va a 44 px en todo el móvil (`max-md:`), sin
  acotar por rol (R919).
- **2026-11-17 · Carlos (P4):** el escáner de Reparto lleva la barra con título y la X de 44 px,
  igual que Recoger y Recolección. Título elegido: **«Abrir orden por guía»**, el que su tarjeta
  ya muestra hoy (`EscanerGuiaReparto.tsx:24`).
- **2026-11-17 · Carlos: el escáner es un solo componente; barra con título y X de 44 px son de
  EscanerModal para todos los usos** (R925-R929). Consecuencias:
  - `titulo` pasa a obligatorio y se borra la rama sin barra.
  - El R871 de SLT-190 («los demás usos, la X de siempre») queda sustituido por R925 y su test se reescribe.
  - `tactil` se queda, porque solo gobierna el disparador.
- **Orden de merge:** primero SLT-190 «Recoger y Recolección según el canvas». Esta ficha parte de su
  `EscanerModal` (barra, `titulo`), de `sinEncabezado` en `EscanerGuiaCard` / `EscaneoContinuo` y de
  `CLASE_INFO_TACTIL`.
- **Origen de los tamaños:** las clases, no una medición (informe, «Notas de método»). Los E2E de este
  spec son la primera medición real.

## Preguntas abiertas

- **P5 (bloquea) — Corte.** 37 archivos son el 92,5% del tope de 40 (límite del spec: 32). Propuesta,
  en rebanadas verticales que se mergean solas:
  - **SLT-193 se queda con la rebanada A** (R910-R921): 16 de producción y 5 de tests, 21 archivos
    (52%). Estimado: ~70 líneas de producción y ~300 de tests.
  - **Ficha nueva con la rebanada B** (R925-R929), «Escáner único: barra con título y Cerrar de 44 px
    en todos los usos», con `depends_on` SLT-190. Son 8 de producción y 9 de tests, 17 archivos
    (42%). Estimado: ~120 líneas de producción y ~450 de tests. Los R925-R929 se mueven a su spec.

  Alternativa: aceptar los 37 en un solo PR con el desglose, como ya se hizo con el tamaño roto por
  tests. Aquí, sin embargo, la producción también crece.
- **P6 (nueva)** — «Cerrar cámara» de `QrScanner.tsx:281-293` (`size="sm"`, 28 de alto) está dentro
  de todos los escáneres, también los de la PWA, y mide menos de 44. Apaga la cámara, no cierra el
  diálogo. ¿Entra a 44 px (con `TACTIL_MOVIL` o `size="touch"`) en la rebanada B, o se deja?
- **P7 (nueva)** — En Órdenes (`OrdenesListado.tsx:1424-1429`), si un usuario puede recibir en bodega
  central **y** escanear QR de tienda, el diálogo monta dos tarjetas que hoy se titulan igual
  («Recibir paquete»). Con una sola barra y las tarjetas sin encabezado, solo las distingue su nombre
  accesible. ¿Puede darse esa combinación de permisos? Si sí, ¿qué título lleva cada una?

## Tasks

Orden: T0 → (T1 ∥ T2 ∥ T3) → T4 en la rebanada A, y T5 → T6 en la rebanada B. `[P]` = paralelizable.

**Rebanada A**
- [ ] **T0 — Base.** Rebasar sobre el merge de SLT-190. Mover `CLASE_INFO_TACTIL` a
  `components/shared/texto-entero.ts` (con re-export en `PosOrderCardDetalle.tsx`) y añadir allí su
  variante `max-md:`.
  *Hecho:* typecheck en verde; el test de SLT-190 que importa `CLASE_INFO_TACTIL` sigue en verde.
- [ ] **T1 [P] — Mosaico y (i) (R910, R916-R920).**
  - `min-h-11` en `PosOrderCardMosaico.tsx:273`.
  - `CLASE_INFO_TACTIL` en cada uso que entra; `ChatOrdenesLista.tsx:169` necesita envoltorio nuevo.
  - Variante `max-md:` en `FilaGestion.tsx:223,483`.
  - `PosOrderCardDetalle.tsx:93` **no** se toca (R918).

  *Hecho:*
  - `botones-44-pwa-mensajero.test.tsx` cubre R910 y R916-R919, y `EstadoInfo.test.tsx` cubre R920.
  - Mutación 1: quitar la clase de un uso deja ese caso en rojo.
  - Mutación 2: ponerla en el flotante deja R918 en rojo.
- [ ] **T2 [P] — Encabezado (R911, R913).** `TACTIL_MOVIL` en la hamburguesa (`layout.tsx:173`) y en
  `InstalarPwaButton`, `AyudaBoton`, `TemaToggle`, `NotificationsBell` y `LogoutButton`.
  *Hecho:* `PageHeader.test.tsx` cubre R911 y R913.
- [ ] **T3 [P] — Menú (R914, R915).** `max-md:h-11` en `SidebarMenuButton` y `SidebarMenuSubButton`
  desde `app/(app)/_components/Sidebar.tsx`.
  *Hecho:* `Sidebar.test.tsx` cubre R914 y R915.
- [ ] **T4 — E2E y gate (R910-R921).** `e2e/pwa-mensajero-botones-44.spec.ts`, a 360 px (y a 1280 px
  para R913). Base desechable nueva (`docs/perfil-agentes.md > Todos los agentes`) y `./init.sh`.
  *Hecho:* E2E en verde en local, `INIT_EXIT=0` y mapa `R<n> -> test` en `progress/features/SLT-193.md`.

**Rebanada B** (si P5 se acepta, se va a la ficha nueva)
- [ ] **T5 — `EscanerModal` único y sus usos (R925-R929).**
  - En `EscanerModal`, `titulo` pasa a obligatorio; se borran la rama sin barra y `showCloseButton`.
  - Cada uso pasa su título según la tabla y monta la tarjeta con `sinEncabezado`.
  - En `BuscadorFiltros` se quita el `CardHeader` de `CamaraDelBuscador`.
  - Se crea la guardia.

  *Hecho:*
  - Los tests de R925-R929 están en verde.
  - Mutación 1: devolver `showCloseButton` en un uso deja la guardia en rojo.
  - Mutación 2: quitar `titulo` a un uso rompe el typecheck y la guardia.
- [ ] **T6 — E2E y gate (R925).** «Cerrar» de 44 × 44 en Reparto a 360 px, en
  `e2e/pwa-mensajero-botones-44.spec.ts` (o en el spec de la ficha nueva). Después, `./init.sh`.
  *Hecho:* E2E en verde en local y `INIT_EXIT=0`.

## Tamaño

37 archivos (24 de producción y 13 de tests): el 92,5% de `max_archivos` (40). **Pasa del 80%**
(ver P5). Estimado: ~190 líneas de producción y ~750 de tests.
- Rebanada A: 21 archivos.
- Rebanada B: 17 archivos (el E2E es compartido).

## Archivos esperados

Marcados **[SLT-190]** los que también toca SLT-190 «Recoger y Recolección según el canvas»; **[B]**,
los de la rebanada B.

Producción:
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx` **[SLT-190]**
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx` **[SLT-190]**
- `app/(app)/mis-asignaciones/_components/pos-card/PosCardHeader.tsx`
- `app/(app)/mis-asignaciones/_components/chat/ChatConversacion.tsx`
- `app/(app)/mis-asignaciones/_components/chat/ChatOrdenesLista.tsx`
- `app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx`
- `app/(app)/mis-asignaciones/_components/HojaParadaMapa.tsx`
- `components/private/cierres/fila/FilaGestion.tsx`
- `components/shared/texto-entero.ts`
- `components/shared/InstalarPwaButton.tsx`
- `components/shared/AyudaBoton.tsx`
- `components/shared/TemaToggle.tsx`
- `components/shared/NotificationsBell.tsx`
- `app/_components/LogoutButton.tsx`
- `app/(app)/layout.tsx`
- `app/(app)/_components/Sidebar.tsx`
- `components/shared/EscanerModal.tsx` **[SLT-190] [B]**
- `app/(app)/mis-asignaciones/_components/EscanerGuiaReparto.tsx` **[B]**
- `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx` **[B]**
- `app/(app)/ordenes/_components/EscanerRecepcionOrigen.tsx` **[B]**
- `app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral.tsx` **[B]**
- `app/(app)/ordenes/_components/OrdenesListado.tsx` **[B]**
- `components/shared/RecibirPaquetesEntrada.tsx` **[B]**
- `components/shared/BuscadorFiltros.tsx` **[B]**

Tests:
- `tests/components/botones-44-pwa-mensajero.test.tsx`
- `tests/components/EstadoInfo.test.tsx`
- `tests/components/PageHeader.test.tsx`
- `tests/components/Sidebar.test.tsx`
- `e2e/pwa-mensajero-botones-44.spec.ts`
- `tests/components/EscanerModal.test.tsx` **[SLT-190] [B]**
- `tests/components/EscanerGuiaReparto.test.tsx` **[B]**
- `tests/components/EscanerRecepcion.test.tsx` **[B]**
- `tests/components/EscanerRecepcionOrigen.test.tsx` **[B]**
- `tests/components/EscanerRecepcionBodegaCentral.test.tsx` **[B]**
- `tests/components/RecibirPaquetesEntrada.test.tsx` **[B]**
- `tests/unit/components/buscador-filtros-escaneo.test.tsx` **[B]**
- `tests/unit/guards/escaner-un-solo-cierre.guardia.test.ts` **[B]**
