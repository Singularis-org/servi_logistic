# SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» — requirements (ruta ligera)

Zona frontend, complexity low. Rango de requisitos: **R910-R939** (usados R910-R922).

## Alcance

Cierra lo que R493 de SLT-156 «PWA de los mensajeros: tablas usables en el móvil» dejó por debajo de
44 × 44 px en la PWA del mensajero. Fuente: `progress/comparacion-canvas-pwa-2026-11-16.md` (filas D9,
C6, G1, G2) y el comentario de la tarjeta sobre el (i) de `EstadoConInfo`. Los tamaños de «Hoy» salen
de las clases (jsdom y el informe no miden; `size="touch"` = `h-11`, `icon-touch` = `size-11`).

| # | Control | Archivo:línea (rama de hoy) | Hoy | Quién |
|---|---|---|---|---|
| D9 | «Ver detalle completo» (Mosaico) | `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx:273` | texto de 10 px sin alto mínimo | SLT-193 |
| C6 | «Cerrar» del diálogo del escáner en **Recoger y Recolección** | `components/ui/dialog.tsx:66-69` vía `components/shared/EscanerModal.tsx:105` | `icon-sm` (28 × 28) | **SLT-190** (R869), fuera |
| C6 | «Cerrar» del diálogo del escáner en **Reparto** | mismo; montado en `app/(app)/mis-asignaciones/_components/EscanerGuiaReparto.tsx:67` (`tactil`) | `icon-sm` (28 × 28) | SLT-193 |
| G1 | Hamburguesa («Toggle Sidebar») | `app/(app)/layout.tsx:173` → `components/ui/sidebar.tsx:266` | `icon-sm` (28 × 28) | SLT-193 |
| G1 | «Instalar la aplicación» (solo icono) | `components/shared/PageHeader.tsx:122` → `components/shared/InstalarPwaButton.tsx:30` | `icon` (32 × 32) | SLT-193 |
| G1 | «Ayuda de esta pantalla» | `components/shared/AyudaBoton.tsx:117-123` | `outline` por defecto, `h-8` (32 alto) | SLT-193 |
| G1 | «Cambiar tema» | `components/shared/TemaToggle.tsx:58-67` | `h-8` (32 alto) | SLT-193 |
| G1 | «Notificaciones» | `components/shared/NotificationsBell.tsx:254-265` | `p-1` + icono 20 px (28 × 28) | SLT-193 |
| G1 | «Salir» | `app/_components/LogoutButton.tsx:66-70` | `h-8` (32 alto) | SLT-193 |
| G2 | Ítems del menú lateral | `components/ui/sidebar.tsx:487` (`h-8`) vía `app/(app)/_components/Sidebar.tsx:390,434` | 32 alto | SLT-193 |
| G2 | Subítems del menú lateral | `components/ui/sidebar.tsx:682` (`h-7`) vía `app/(app)/_components/Sidebar.tsx:406` | 28 alto | SLT-193 |
| — | (i) de la fila plegada de Recolección | SLT-190 `PosOrderCardDetalle.tsx` (`CLASE_INFO_TACTIL`) | 24 × 24 | **SLT-190**, fuera |
| — | (i) de `EstadoConInfo` / `NotaAyudaConInfo` / `InfoEstado` en el resto de la PWA | `components/shared/EstadoInfo.tsx:85-86` (`size-4` + `after:-inset-1`); usos abajo | caja 16, área 24 × 24 | SLT-193 |

Usos del (i) que entran (todos en pantallas del mensajero):
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx:129` (estado) y `:139` (nota de ayuda);
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx:93` (estado, `botonFlotante`) y `:104` (nota de ayuda);
- `app/(app)/mis-asignaciones/_components/pos-card/PosCardHeader.tsx:77` y `:90`;
- `app/(app)/mis-asignaciones/_components/chat/ChatConversacion.tsx:700`;
- `app/(app)/mis-asignaciones/_components/chat/ChatOrdenesLista.tsx:169` (`InfoEstado`, sin `className`);
- `app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx:852`;
- `app/(app)/mis-asignaciones/_components/HojaParadaMapa.tsx:152`;
- `components/private/cierres/fila/FilaGestion.tsx:223` y `:483` (**compartido con escritorio**).

**Fuera:** todo lo que SLT-190 «Recoger y Recolección según el canvas» ya hace (su R869 y el (i) de la
fila de Recolección); «Navegar» de 44 × 44 aparte (D10, no está en la ficha); la X de la hoja del mapa
(M6, es una acción de más, no un tamaño); el escritorio y los otros roles salvo lo dicho en cada R.

## Cómo se acota (componentes compartidos)

Nada de rediseño: se reutilizan los patrones que ya existen.
- Pantallas solo del mensajero: `size="touch"` / `size="icon-touch"` (`components/ui/button.tsx:120-121`)
  o `min-h-11`, en todos los anchos (`specs/SLT-156-pwa-mensajero-tablas/design.md §4`).
- (i): el patrón de SLT-190, `CLASE_INFO_TACTIL = "[&_button]:after:-inset-3.5"` en el `className`
  del envoltorio (16 + 2 × 14 = 44): crece el pseudo-elemento, no la caja. `CLASES_BOTON_INFO`
  (`EstadoInfo.tsx:85`) **no se toca**: landing, admin y escritorio siguen en 24 × 24.
  En `FilaGestion` (compartido) la misma clase con prefijo `max-md:` (como `TACTIL_MOVIL`).
  La constante se mueve, tras el merge de SLT-190, a `components/shared/texto-entero.ts` junto a
  `TACTIL_MOVIL`, y `PosOrderCardDetalle.tsx` la re-exporta (su test la importa de ahí).
- Encabezado: es común a todos los roles. Se acota con el `data-rol` que el layout ya pone en
  `SidebarInset` (`app/(app)/layout.tsx:170`, mismo mecanismo que `FONDO_POR_ROL` de
  `PageHeader.tsx:34-40`) más `max-md:` de `TACTIL_MOVIL`:
  `group-data-[rol=mensajero]/app:max-md:min-h-11 group-data-[rol=mensajero]/app:max-md:min-w-11`.
  Queda como constante en `texto-entero.ts`.
- Menú lateral: en móvil es un `Sheet` portaleado **fuera** de `SidebarInset`, así que el `data-rol`
  no le llega. El layout (que ya resuelve `actor.rol`, `layout.tsx:44`) le pasa a `Sidebar` una prop
  booleana; con ella, ítems y subítems llevan `max-md:h-11`. `components/ui/sidebar.tsx` no se toca.
- Escáner de Reparto: `EscanerModal` con `tactil` y **sin** `titulo` (tras SLT-190) cambia la X del
  `Dialog` por un «Cerrar» de `size="icon-touch"` en la misma esquina (`showCloseButton={false}` +
  `DialogPrimitive.Close`, igual que la barra de SLT-190). Sin `tactil`, la X de siempre (recepciones,
  `OrdenesListado`, satélite). `components/ui/dialog.tsx` no se toca.

## Requisitos (EARS)

Cada uno con su test previsto. «Móvil» = viewport < 768 px (`max-md`); los E2E van a **360 px** con la
sesión de mensajero de `e2e/_pwa-mensajero-fixture.ts`.

### «Ver detalle completo» (D9)

- **R910** — En la tarjeta Mosaico del mensajero, el disparador «Ver detalle completo» DEBE medir al
  menos 44 px de alto y todo el ancho del bloque, en todos los anchos; su texto, su chevron y el
  despliegue NO DEBEN cambiar.
  *Test:* componente (`tests/components/botones-44-pwa-mensajero.test.tsx`: clase `min-h-11` en el
  disparador, despliega como hoy) + E2E (alto ≥ 44 en Reparto, vista Mosaico).

### «Cerrar» del escáner de Reparto (C6)

- **R911** — CUANDO el mensajero abre «Escanear o escribir guía» en Reparto, el diálogo DEBE tener un
  solo botón «Cerrar», de al menos 44 × 44 px, en la esquina superior derecha, sin solaparse con el
  contenido del diálogo; CUANDO lo pulsa, el diálogo DEBE cerrarse con el efecto de hoy (cámara
  apagada).
  *Test:* `tests/components/EscanerModal.test.tsx` (con `tactil` y sin `titulo`: un solo «Cerrar»,
  `size-11`, cierra y desmonta) + `tests/components/EscanerGuiaReparto.test.tsx` + E2E (caja ≥ 44 ×
  44 y sin intersección con la tarjeta de escaneo).
- **R912** — Los usos de `EscanerModal` sin `tactil` NO DEBEN cambiar: misma X del `Dialog`
  (`icon-sm`).
  *Test:* `tests/components/EscanerModal.test.tsx` (sin `tactil`: X sin `size-11`; el caso R871 de
  SLT-190 sigue en verde).

### Encabezado (G1)

- **R913** — MIENTRAS el usuario tiene rol mensajero y la pantalla es móvil, la hamburguesa,
  «Instalar la aplicación» (cuando se ofrece), «Ayuda de esta pantalla» (cuando la pantalla tiene
  documento), «Cambiar tema», «Notificaciones» (con y sin pendientes) y «Salir» DEBEN medir al menos
  44 × 44 px cada uno.
  *Test:* componentes (`tests/components/PageHeader.test.tsx`: cada control del encabezado lleva la
  clase acotada por rol y `max-md`; la hamburguesa vive en el layout de servidor y solo la cubre el
  E2E) + E2E (caja ≥ 44 × 44 de cada uno a 360 px).
- **R914** — MIENTRAS la pantalla es móvil y el usuario tiene rol mensajero, el encabezado NO DEBE
  desbordar en horizontal (sin barra de desplazamiento lateral de la página) y su orden de controles
  NO DEBE cambiar.
  *Test:* E2E a 360 px (`scrollWidth <= clientWidth` del documento con el encabezado completo).
- **R915** — MIENTRAS la pantalla es de escritorio (≥ 768 px), o el usuario tiene otro rol, los
  controles del encabezado NO DEBEN cambiar de tamaño.
  *Test:* componente (`PageHeader.test.tsx`: ninguna clase de tamaño sin el prefijo de rol y
  `max-md`) + E2E (mensajero a 1280 px: alto de «Salir» igual que hoy, 32 px).

### Menú lateral (G2)

- **R916** — MIENTRAS el usuario tiene rol mensajero y la pantalla es móvil, cada ítem y cada subítem
  del menú lateral abierto DEBE medir al menos 44 px de alto (y todo el ancho del menú).
  *Test:* `tests/components/Sidebar.test.tsx` (con la prop: `max-md:h-11` en ítems y subítems) + E2E
  (abrir con la hamburguesa a 360 px; alto ≥ 44 de cada enlace visible).
- **R917** — SI `Sidebar` se monta sin la prop (otro rol), ENTONCES ítems y subítems NO DEBEN cambiar
  (`h-8` / `h-7`), y el rail de escritorio NO DEBE cambiar en ningún rol.
  *Test:* `tests/components/Sidebar.test.tsx` (sin la prop: sin `h-11`; la clase lleva `max-md:`, así
  que el escritorio no la aplica).

### (i) de estado y de nota de ayuda

- **R918** — En las tarjetas, filas, hoja del mapa, panel de gestión y chat del mensajero (usos
  listados en `## Alcance`, salvo `FilaGestion`), el botón (i) DEBE tener un área activable de al
  menos 44 × 44 px, en todos los anchos, sin que su caja crezca (sigue en 16 × 16) ni cambie la
  altura de la fila.
  *Test:* `tests/components/botones-44-pwa-mensajero.test.tsx` (cada uso lleva `CLASE_INFO_TACTIL`
  en el envoltorio del botón; `ChatOrdenesLista` con envoltorio nuevo) + E2E (en Reparto, el punto a
  20 px del centro del (i) en horizontal devuelve el botón con `elementFromPoint`; caja del botón
  16 × 16).
- **R919** — CUANDO el mensajero pulsa dentro del área ampliada de un (i), DEBE abrirse su
  explicación y NO DEBE seleccionarse ni desplegarse la tarjeta (efecto de hoy, `cortarClick`).
  *Test:* E2E (pulsar a 18 px del centro del (i) de una tarjeta Detalle: aparece la explicación y la
  tarjeta no cambia `aria-expanded`).
- **R920** — En `FilaGestion` (Cierre del día; compartido con escritorio), MIENTRAS la pantalla es
  móvil, el (i) DEBE tener un área activable de al menos 44 × 44 px; en escritorio NO DEBE cambiar
  (24 × 24).
  *Test:* `tests/components/botones-44-pwa-mensajero.test.tsx` (la clase lleva el prefijo
  `max-md:`) + E2E en Cierre del día a 360 px (`elementFromPoint` a 20 px del centro).
- **R921** — Los demás usos de `EstadoConInfo`, `InfoEstado`, `NotaAyudaConInfo` y
  `SenalPendienteConInfo` (landing, rastreo, admin, satélite, tienda) NO DEBEN cambiar: área de
  24 × 24.
  *Test:* `tests/components/EstadoInfo.test.tsx` (`CLASES_BOTON_INFO` sigue con `after:-inset-1` y
  sin `-inset-3.5`; sin `className`, el envoltorio no lleva `CLASE_INFO_TACTIL`).

### Transversal

- **R922** — Ningún control que toca esta ficha DEBE cambiar su nombre accesible, su texto visible ni
  su acción respecto a hoy.
  *Test:* los mismos tests de componente buscan cada control por su rol y nombre de hoy («Ver detalle
  completo», «Cerrar», «Toggle Sidebar», «Ayuda de esta pantalla», «Salir»…); los asertos de hoy
  siguen en verde.

## Decisiones

- **Orden de merge:** SLT-190 «Recoger y Recolección según el canvas» primero. SLT-193 parte de su
  `EscanerModal` (prop `titulo`) y de `CLASE_INFO_TACTIL`; comparte con ella 4 archivos (marcados
  abajo). Si SLT-193 empieza antes, el implementer rebasa sobre la rama de SLT-190 en cuanto mergee.
- R911 enmienda a propósito el R871 de SLT-190 **solo** para Reparto («misma X del diálogo»): la ficha
  pide el «Cerrar» de 44 px en el escáner y Reparto es el único uso con `tactil` que SLT-190 no cubre.
  El test R871 de SLT-190 monta `EscanerModal` sin `tactil`, así que sigue en verde (R912).
- Origen de los tamaños: clases, no medición (informe, «Notas de método»). Los E2E de este spec son
  la primera medición real.

## Preguntas abiertas

- **P1 (R913-R917)** — Encabezado y menú se acotan al rol mensajero en móvil. ¿Deben ir también a
  44 px en móvil para los demás roles (tienda, satélite, admin)? Si sí, se quita el prefijo de rol y
  la prop de `Sidebar`; el resto no cambia.
- **P2 (R918)** — En la tarjeta Detalle (`PosOrderCardDetalle.tsx:93`) el (i) va **flotante** en la
  esquina del chip de estado, entre las marcas: un área de 44 × 44 tapa parte del chip y quizá de la
  marca vecina (las marcas no son botones, pero sí la fila desplegable). ¿Se acepta, o ahí se queda
  en 24 × 24? Si se excluye, R918 pierde ese uso y lo demás no cambia.
- **P3 (R920)** — `FilaGestion` también la usan admin y satélite en móvil; con `max-md:` les llega el
  área ampliada. ¿Correcto, o se acota además al rol mensajero?
- **P4 (R911)** — Reparto no tiene artboard del escáner (D1: el canvas no lo dibuja). Se propone solo
  agrandar la X; ¿o Reparto debe llevar la barra con título de SLT-190 (`titulo`)?

## Tasks

Orden: T0 → (T1 ∥ T2 ∥ T3 ∥ T4) → T5. `[P]` = paralelizable.

- [ ] **T0 — Base.** Esperar/rebasar sobre el merge de SLT-190. Mover `CLASE_INFO_TACTIL` a
  `components/shared/texto-entero.ts` (re-export en `PosOrderCardDetalle.tsx`) y añadir ahí la
  variante `max-md:` y la constante del encabezado acotada por rol.
  *Hecho:* typecheck verde; el test de SLT-190 que importa `CLASE_INFO_TACTIL` sigue verde.
- [ ] **T1 [P] — Mosaico y (i) (R910, R918-R921).** `min-h-11` en el disparador de
  `PosOrderCardMosaico.tsx:273`; `CLASE_INFO_TACTIL` en cada uso listado (envoltorio nuevo en
  `ChatOrdenesLista.tsx:169`); variante `max-md:` en `FilaGestion.tsx:223,483`. Según P2, incluir o
  no `PosOrderCardDetalle.tsx:93`.
  *Hecho:* `tests/components/botones-44-pwa-mensajero.test.tsx` cubre R910, R918, R920;
  `EstadoInfo.test.tsx` cubre R921. Mutación: quitar la clase de un uso deja su caso en rojo.
- [ ] **T2 [P] — Escáner de Reparto (R911, R912).** `EscanerModal.tsx`: con `tactil` y sin `titulo`,
  «Cerrar» `size="icon-touch"` en la esquina y `showCloseButton={false}`.
  *Hecho:* `EscanerModal.test.tsx` y `EscanerGuiaReparto.test.tsx` cubren R911 y R912; el caso R871
  de SLT-190 sigue verde.
- [ ] **T3 [P] — Encabezado (R913, R915).** Clase acotada en `layout.tsx:173` (hamburguesa),
  `InstalarPwaButton`, `AyudaBoton`, `TemaToggle`, `NotificationsBell` y `LogoutButton`.
  *Hecho:* `PageHeader.test.tsx` cubre R913 y R915 (clase con prefijo de rol y `max-md`).
- [ ] **T4 [P] — Menú (R916, R917).** Prop booleana en `Sidebar` desde `layout.tsx:147`
  (`actor?.rol === "mensajero"`); `max-md:h-11` en `SidebarMenuButton` y `SidebarMenuSubButton`.
  *Hecho:* `Sidebar.test.tsx` cubre R916 y R917.
- [ ] **T5 — E2E y gate (R910-R922).** `e2e/pwa-mensajero-botones-44.spec.ts` a 360 px (y «Salir» a
  1280 px para R915): cajas ≥ 44, `elementFromPoint` del (i), sin desborde del encabezado, menú
  abierto, «Cerrar» del escáner de Reparto. Base desechable nueva (`docs/perfil-agentes.md > Todos
  los agentes`), luego `./init.sh`.
  *Hecho:* E2E en verde en local; `INIT_EXIT=0`; mapa `R<n> -> test` completo en
  `progress/features/SLT-193.md`.

## Tamaño

24 archivos (17 de producción, 7 de tests; 60% de `max_archivos` = 40). Estimado: ~90 líneas de
producción (clases y una prop) y ~380 de tests.

## Archivos esperados

Marcados **[SLT-190]** los que también toca SLT-190 «Recoger y Recolección según el canvas».

Producción:
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx` **[SLT-190]**
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx` **[SLT-190]**
- `app/(app)/mis-asignaciones/_components/pos-card/PosCardHeader.tsx`
- `app/(app)/mis-asignaciones/_components/chat/ChatConversacion.tsx`
- `app/(app)/mis-asignaciones/_components/chat/ChatOrdenesLista.tsx`
- `app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx`
- `app/(app)/mis-asignaciones/_components/HojaParadaMapa.tsx`
- `components/private/cierres/fila/FilaGestion.tsx`
- `components/shared/EscanerModal.tsx` **[SLT-190]**
- `components/shared/texto-entero.ts`
- `components/shared/InstalarPwaButton.tsx`
- `components/shared/AyudaBoton.tsx`
- `components/shared/TemaToggle.tsx`
- `components/shared/NotificationsBell.tsx`
- `app/_components/LogoutButton.tsx`
- `app/(app)/layout.tsx`
- `app/(app)/_components/Sidebar.tsx`

Tests:
- `tests/components/botones-44-pwa-mensajero.test.tsx`
- `tests/components/EscanerModal.test.tsx` **[SLT-190]**
- `tests/components/EscanerGuiaReparto.test.tsx`
- `tests/components/EstadoInfo.test.tsx`
- `tests/components/PageHeader.test.tsx`
- `tests/components/Sidebar.test.tsx`
- `e2e/pwa-mensajero-botones-44.spec.ts`
