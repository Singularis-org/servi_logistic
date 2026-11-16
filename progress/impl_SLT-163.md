# impl SLT-163 «PWA del mensajero: Reparto en el móvil» — rebanada B de SLT-156 «PWA de los mensajeros: tablas usables en el móvil»

## Tanda 1 (B1-B5) · frontend_dev · 2026-11-15

Spec: `specs/SLT-156-pwa-mensajero-tablas/` (R493, R495, R496, R502-R509 en Reparto). Grafo no consultado:
el worktree es nuevo y lo tocado en esta tanda no estaba indexado; se exploró con Grep/Read.

### Archivos

Producción (`MA/` = `app/(app)/mis-asignaciones/_components/`):
- `MA/KpisMensajero.tsx` — B1: `grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4`; una rejilla para los dos anchos
  (icono 36 px + rótulo en la primera fila y la cifra, 20 px y `COLUMNA_FIJA`, sola en la segunda en el
  teléfono; desde `md` el icono abarca las dos filas, como antes).
- `MA/ConfirmarGestionDialog.tsx` (nuevo) — B2: «¿Gestionar esta orden?» controlado, botones `touch`.
- `MA/GestionarOrdenCardButton.tsx`, `MA/MarcarLuegoToggle.tsx`, `MA/RecuperarAyudaButton.tsx` — B2: `size="touch"`.
- `MA/FiltroCantonDistrito.tsx` — B3: ya no es una fila con «Limpiar filtros»; monta solo los `Select` de los
  filtros PUESTOS, como `children` de `BuscadorFiltros` (44 px en el teléfono, sin `labelPrefix` que recorta).
- `MA/AvisoRutaLinea.tsx` (nuevo) — B4: aviso de ruta en una línea (título + «Ver más»/«Ver menos» de 44 px con
  `aria-expanded` + acción en la misma fila).
- `MA/RepartoModule.tsx` — B2 «Conversación» `touch`; B3 una `BuscadorFiltros` (`fija`, `tactil`,
  `leerDeUrl={false}`, `debounceMs={0}`, filtros Cantón/Distrito con rótulos del país); B4 orden
  aviso → `kpis` → barra → «En reparto» (Sincronizar + conmutador, avisos en una línea, mapa, lista, «Con
  ayuda»), sin panel inline, `ordenEnFocoId`, KPI ocultos en foco; B5 `compacta` en Detalle.
- `MA/pos-card/PosOrderCard.tsx` — prop opcional `compacta` en `PosOrderCardProps`.
- `MA/pos-card/PosOrderCardDetalle.tsx` — B5: con `compacta`, fila-botón (`aria-expanded`) parada · guía (mono)
  y destinatario · «Valor a cobrar» en `COLUMNA_FIJA`; despliega chip y marcas, navegar + dirección
  entera, intentos, reserva y acciones. Sin `compacta`, la fila de siempre (Novedades, Recoger,
  Recolección no cambian).
- `app/(app)/mis-asignaciones/reparto/page.tsx` — los KPI entran como `kpis={<KpisMensajero …/>}`.

Tests:
- `tests/components/RepartoMovil.test.tsx` (nuevo) — R503, R504, R507, R509, R493, R496.
- `tests/components/PosOrderCardDetalleCompacta.test.tsx` (nuevo) — R508.
- `tests/components/KpisMensajero.test.tsx` — R502 (2 casos nuevos).
- `tests/components/RepartoModule.test.tsx` — describe nuevo R495/R505/R506 (5 casos) + migración al
  flujo nuevo: `abrirGestion` lleva la primera card al foco si no hay panel, `elegirEnSelect` pone el
  filtro en «Filtros» antes de usar su `Select`, helper `ponerFiltroZona`; reescritos los casos que
  afirmaban el panel inline («la PRIMERA orden en el PANEL por default», «Gestionar DESHABILITADO en la
  del panel», «Abierta en detalle»), los de «Limpiar filtros» (ahora «Limpiar todo»), 117/R14 (lista y
  mapa, sin panel), 261/R12 «por el panel tampoco» (la reservada ya no llega al panel) y 265/R38-R40
  (cuerpo tras «Ver más»). Caso nuevo «Volver a la lista sale del foco sin llamar al servidor».
- `tests/components/RepartoAyuda.test.tsx`, `GestionarOrdenPanelHilo.test.tsx` — el panel se abre desde la card.
- `ChatContactoAntesDeRecoger`, `MarcarLuegoToggle`, `RepartoAyudaResueltaPorLaTienda`,
  `RepartoModule477Correccion` — solo `kpis={null}` (prop requerida).

### R → test

| R | Test | Mutación que lo mata |
|---|---|---|
| R502 | `KpisMensajero.test.tsx` «2 × 2 en el móvil» (rejilla; cifra en `COLUMNA_FIJA`) | M1 `grid-cols-1` |
| R493 (Reparto) | `RepartoMovil.test.tsx` «R493» (Gestionar, Gestionar más tarde, Recuperar, Conversación; Cancelar/Aceptar del diálogo) | M2a-e `size="sm"` en cada uno |
| R495, R506 | `RepartoModule.test.tsx` «R495/R506: un solo campo…», «R506: buscar por teléfono…» | M3c placeholder viejo |
| R505 | `RepartoModule.test.tsx` «R505: Filtros ofrece…», «distrito deshabilitado… cambiar de cantón lo vacía», «quitar el cantón…»; 117/R8 «Limpiar todo» | M3a no resetear distrito; M3d quitar cantón sin vaciarlo |
| R496 (Reparto) | `RepartoMovil.test.tsx` «la barra está pegada arriba… hija directa del módulo» | M3b sin `fija` |
| R503 | `RepartoMovil.test.tsx` «bloqueado: aviso → KPI → barra → En reparto → Con ayuda» | M4e KPI bajo la barra; M3b |
| R504 | `RepartoMovil.test.tsx` «R504» (2); `RepartoModule.test.tsx` «SLT-156 R504…» (3) | M4a panel inline de vuelta |
| R507 | `RepartoMovil.test.tsx` «R507» | M4b vista inicial «detalle»; M5c Detalle sin `compacta` |
| R508 | `PosOrderCardDetalleCompacta.test.tsx` (3) | M5a monto sin `COLUMNA_FIJA`; M5b despliegue abierto de entrada |
| R509 | `RepartoMovil.test.tsx` «R509» (2) | M4c aviso abierto de entrada; M4d «Mostrar mapa» fuera del aviso |

### Mutaciones

Arnés en el scratchpad: copia el archivo, aplica el cambio (exige que el texto aparezca UNA vez), corre el
test, restaura y compara byte a byte. Las 18 en ROJO, las 18 con `restaurado_identico=True`:

```
M1-kpi-1col: ROJO · 1 failed | 6 passed (7)
M2a-gestionar-sm / M2b-luego-sm / M2c-recuperar-sm / M2d-conversacion-sm / M2e-dialogo-aceptar-sm: ROJO · 1 failed | 8 passed (9) cada una
M3a-no-reset-distrito: ROJO · 1 failed | 112 passed (113)
M3b-sin-fija: ROJO · 2 failed | 7 passed (9)
M3c-placeholder: ROJO · 1 failed | 112 passed (113)
M3d-quitar-canton-no-vacia: ROJO · 1 failed | 112 passed (113)
M4a-panel-inline: ROJO · 1 failed | 8 passed (9)
M4b-vista-detalle: ROJO · 4 failed | 5 passed (9)
M4c-aviso-abierto: ROJO · 1 failed | 8 passed (9)
M4d-mapa-fuera-del-aviso: ROJO · 1 failed | 8 passed (9)
M4e-kpi-bajo-la-barra: ROJO · 1 failed | 8 passed (9)
M5a-monto-sin-columna-fija: ROJO · 1 failed | 2 passed (3)
M5b-compacta-abierta: ROJO · 2 failed | 1 passed (3)
M5c-reparto-detalle-no-compacta: ROJO · 1 failed | 8 passed (9)
```

### Comandos

- `npx tsc --noEmit -p .`: verde.
- `npx eslint` sobre los archivos tocados: 0 errores, 2 avisos ya existentes (`ordenCardsEnReparto` sin uso
  en `RepartoModule.test.tsx` y uno en `GestionarOrdenPanel.tsx`, que no se tocó).
- vitest de los 19 archivos afectados + `tests/unit/guards`: todo verde salvo
  `dependencias-declaradas-presentes.guardia.test.ts` (4 casos: `init.sh` de HEAD no llama a
  `scripts/verificar-dependencias.mjs`); ajeno al diff (`init.sh` sin tocar) y el gate no lo cuenta.
- Base desechable `slt163_gate` en el servidor local del `.env` (creada con `pg`, URL a un archivo fuera
  del árbol, nunca impresa) + `prisma migrate deploy` (MIGR_EXIT=0).
- `./init.sh` con `DATABASE_URL` a la desechable, log fuera del árbol: `INIT_EXIT=0`. Corrió los 4 tests
  nuevos/cambiados de la tanda entre los 100 relacionados. Tamaño: **21/40 archivos, 996/1000 líneas de
  producción, 819/3000 de tests** (aviso amarillo del 80 %).

### Decisiones y desviaciones

- **`ordenEnFocoId` y «Volver a la lista» entran en esta tanda (adelanto parcial de B6).** R504 quita el
  panel inline; sin un foco de cliente, «Gestionar» de la card no llevaría a ningún sitio y la gestión
  quedaba inalcanzable entre tandas. Va lo mínimo: la card fija `ordenEnFocoId`, el foco monta el
  `GestionarOrdenPanel` de hoy (con su CTA «Gestionar esta orden» y el gate de guía de hoy) y un «Volver a
  la lista» (`outline`, `touch`) mientras el puntero no esté fijado. Queda para B6: `verificacionAbierta`,
  quitar el CTA pegajoso, «Confirmar guía» y su test `RepartoModoFoco.test.tsx`.
- **KPI dentro del módulo**: R503 los pone bajo el aviso de bloqueo, que pinta el módulo. Entran por la
  prop REQUERIDA `kpis: ReactNode` (la página pasa `<KpisMensajero/>`; los tests, `null`). En modo foco no
  se pintan (R510: solo el panel).
- **Conmutador Mosaico/Detalle** pasa a la cabecera de «En reparto / por gestionar», junto a «Sincronizar
  ruta»: la barra fija es `BuscadorFiltros` y sus `children` van delante del campo.
- **«Mostrar mapa»** sube a la fila del PRIMER aviso cuando hay avisos y mapa; sin avisos, la cabecera del
  mapa queda como hoy. Su tamaño (`xs`) es de la rebanada E (inventario de `design.md §4`).
- **Guía de la tarjeta compacta** = `numRemision`, el identificador que ya pintan todas las tarjetas POS; el
  diseño reordena, no cambia el dato.
- **`compacta` es opcional** en `PosOrderCardDetalle`: solo Reparto la enciende. Novedades (tienda) no
  cambia; Recoger y Recolección la adoptan en C (R517). Las cards de «Con ayuda solicitada» siguen con la
  fila de siempre (su «Recuperar» es el rescate y queda a la vista).
- **Quitar un filtro de «Filtros» vacía su valor** (y quitar el cantón, el distrito): un filtro que no se ve no
  puede seguir filtrando. «Limpiar todo» vacía el campo y quita los dos.
- **SidebarTrigger**: `relative md:hidden` en el flujo del `SidebarInset` (`app/(app)/layout.tsx:173`) y
  ningún encabezado `sticky`/`fixed`; la barra (`sticky top-0 z-20`) es hija directa del módulo, así que al
  pegarse el trigger ya salió de la vista. La medida en el navegador es del E2E de B8.
- **Guardia `pwa-mensajero-sin-recorte` (m7)**: los archivos de B se añaden en B8, como dice tasks.md. Los de
  esta tanda no usan `truncate`, `line-clamp`, `title` con dato ni medios pasos (se evitó `labelPrefix` del
  `Select`, que trunca).
- **m9/m10** (`sinDesborde`): ya corregidos por SLT-165 «PWA del mensajero: Cierre del día en tarjetas»
  en `e2e/_pwa-mensajero-fixture.ts` (en dev).
- **E2E pendientes de B8**: `e2e/mis-asignaciones.spec.ts`, `tope-intentos-por-empresa.spec.ts` y
  `reintentos-escalado.spec.ts` usan el panel inline / «Filtrar por cantón» / «Buscar guías» de antes y
  fallarán hasta B8. No se corrieron (no hay dev server en esta tanda).
- **Tamaño**: 996/1000 de producción tras B1-B5 (estimado ~600 para toda B). B6-B8 lo pasarán: decisión del
  leader (tasks.md > Tamaño ofrece sacar B7 a rebanada propia).

### Veredicto

B1-B5 hechas, cada R con su test y su mutación en rojo; gate `INIT_EXIT=0`; el tamaño queda al borde (996/1000).

## Tanda 2 (B6, B7, B8) · frontend_dev · 2026-11-15

Spec: `specs/SLT-156-pwa-mensajero-tablas/` (R500, R503, R510-R516; tasks.md B6-B8). Grafo no consultado:
lo tocado en la tanda 1 no estaba indexado; se exploró con Grep/Read.

### Archivos

Producción (`MA/` = `app/(app)/mis-asignaciones/_components/`):
- `MA/VerificarGuiaGate.tsx` — B6 (R511): escáner único del foco: cámara (`QrScanner`), separador «o», «Número
  de guía» (placeholder «Ej. 1024», 44 px), botón «Confirmar guía» (`touch`, a todo el ancho) y la nota «Con
  la pistola o la cámara se confirma sola.». La comparación y el aviso de no coincidencia, los de hoy (R512).
- `MA/GestionarOrdenPanel.tsx` — B6 (R510, R511): fuera el CTA pegajoso «Gestionar esta orden», el
  `ChevronUp` de ocultar, `useSeccionColapsable`, el ancla y el efecto de scroll/foco: en el paso «detalle»
  el bloque de verificación está SIEMPRE abierto.
- `MA/RepartoModule.tsx` — B6: «Volver a la lista» a todo el ancho (C2) y oculto cuando la guía ya está
  confirmada; B7: `EscanerGuiaReparto` bajo el aviso y encima de los KPI (R500, R503), no se monta con
  bloqueo (R516); `ConfirmarGestionDialog` para la orden escaneada; `escoger(orden)` (lo que era
  `gestionarPedido`, ahora sobre una orden concreta); `guiaConfirmadaId` para que el panel abra en
  «¿Cómo terminó la gestión?» sin esperar al refresh (R514); la orden elegida (`ordenEnFocoId`) se busca
  en la lista ENTERA (el escáner la encuentra aunque la búsqueda la oculte).
- `MA/EscanerGuiaReparto.tsx` (nuevo) — B7: `EscanerModal` («Escanear o escribir guía») + `EscanerGuiaCard`
  (cámara, número o pistola); guía propia → cierra el modal y avisa al módulo; ajena → toast «La guía {n}
  no está en tu lista de reparto.» (R515); reservada para otro día → el aviso de la 261; no guía →
  «Código inválido.».
- `MA/reparto-escaner.ts` (nuevo) — B7: `ordenPorGuia(porGestionar, conAyuda, numGuia)`.
- `components/shared/EscanerModal.tsx` — `children` puede ser función que recibe `cerrar` (solo cerrar
  desde dentro; abrir sigue siendo del mensajero, decisión del 2026-07-31 intacta).
- `MA/KpisMensajero.tsx` — fuera un `overflow-hidden` redundante (la primitiva `Card` ya lo lleva) para
  que el archivo entre en la regla «oculta» de la guardia; el E2E mide que cada cifra quepa.

Tests y E2E:
- `tests/components/RepartoModoFoco.test.tsx` (nuevo, 6) — R510-R513.
- `tests/components/EscanerGuiaReparto.test.tsx` (nuevo, 6) — R500, R503, R514-R516.
- `tests/unit/utils/reparto-escaner.test.ts` (nuevo, 3) — `ordenPorGuia`.
- Actualizados al gate nuevo: `VerificarGuiaGate.test.tsx` («Confirmar guía»),
  `GestionarOrdenPanelIncidente.test.tsx` (sin CTA: `abrirGate` comprueba el campo),
  `RepartoModule.test.tsx` (`abrirGestion` ya no pulsa el CTA; «Confirmar guía»; el caso que afirmaba el
  bloque cerrado al entrar ahora lo afirma abierto), `RepartoModule477Correccion.test.tsx`,
  `ChatContactoAntesDeRecoger.test.tsx` (tampoco «Confirmar guía» en el chat).
- `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts` — m7: entran los 11 archivos de B
  (`RepartoModule`, `KpisMensajero`, `ConfirmarGestionDialog`, `GestionarOrdenCardButton`,
  `MarcarLuegoToggle`, `RecuperarAyudaButton`, `FiltroCantonDistrito`, `AvisoRutaLinea`,
  `VerificarGuiaGate`, `EscanerGuiaReparto`, `reparto-escaner`) con las tres reglas (recorte, escala,
  oculta). `GestionarOrdenPanel` (1 360 líneas, solo se le quitó el CTA) queda fuera.
- `e2e/pwa-mensajero-reparto.spec.ts` (nuevo, B8) — (a) 360 y 414 px: KPI 2 × 2 y cada cifra dentro de su
  tarjeta, sin desborde ni «…» en Mosaico y en Detalle (fila desplegada, dirección entera); (b) 360 px:
  botones ≥ 44 (tarjeta, conmutador, diálogo, «Volver a la lista», «Confirmar guía»), Gestionar → foco
  (sin KPI, barra ni tarjetas; un único «Confirmar guía»; ningún «Gestionar…») → guía → «¿Cómo terminó la
  gestión?»; (c) escáner → KPI → barra de arriba abajo; al bajar la barra queda en `top ≤ 1` y el
  `SidebarTrigger` ni cruza su caja ni tapa ningún punto de la barra (`elementFromPoint`).
- m3: dirección (200), producto (120) y tienda (60) largos. `crearOrden` acepta `direccion`/`producto`
  (`tests/fabricas/escenarios/reparto.ts`, `e2e/_escenarios/reparto.ts`); `crearEscenarioReparto` acepta
  `nombreTienda` (pasa como `nombre` del alta del adminTienda; `tests/fabricas/e2e.ts` lo admite).
- `e2e/mis-asignaciones.spec.ts`, `e2e/tope-intentos-por-empresa.spec.ts`, `e2e/reintentos-escalado.spec.ts`
  — al flujo nuevo: «Gestionar la orden {remisión}» → «Aceptar» → foco → «Confirmar guía».
- `playwright.config.ts` — `pwa-mensajero-reparto` en el proyecto `reparto` (guardia `e2e-sin-saltos`).

### R → test

| R | Test | Mutación que lo mata |
|---|---|---|
| R510 | `RepartoModoFoco.test.tsx` «solo queda el panel…», «la verificación ya está abierta…» | M6d placeholder viejo; M6f sin la nota |
| R511 | `RepartoModoFoco.test.tsx` «un único botón «Confirmar guía» y ningún «Gestionar»…»; `VerificarGuiaGate.test.tsx` | M6a CTA «Gestionar esta orden» de vuelta; M6c el gate dice «Gestionar» |
| R512 | `RepartoModoFoco.test.tsx` «la guía de la orden pasa a «¿Cómo terminó la gestión?»…», «otra guía avisa «La guía {n} no corresponde…»» | M6c |
| R513 | `RepartoModoFoco.test.tsx` «sale del foco y restaura la vista completa sin llamar al servidor» (44 px, a todo el ancho) | M6b «Volver» llama a `gestionarPedido`; M6e `w-fit` |
| R500, R503 (escáner) | `EscanerGuiaReparto.test.tsx` «arranca cerrado y va encima de los KPI y de la barra» | M7g escáner bajo los KPI |
| R514 | `EscanerGuiaReparto.test.tsx` «cierra el escáner, pide «¿Gestionar esta orden?» y al aceptar abre el foco en los resultados», «Cancelar no fija nada» | M7c no cierra el modal; M7d sin `guiaConfirmadaId` |
| R515 | `EscanerGuiaReparto.test.tsx` «avisa «La guía {n} no está en tu lista de reparto.»…», «…con ayuda solicitada tampoco»; `reparto-escaner.test.ts` (3) | M7a `ordenPorGuia` incluye las de ayuda; M7e otro texto; M7f la ajena abre la primera |
| R516 | `EscanerGuiaReparto.test.tsx` «bloqueado: no hay «Escanear o escribir guía»» | M7b disparador con bloqueo |
| R502, R493, R496, R501 (E2E) | `e2e/pwa-mensajero-reparto.spec.ts` (a)-(c) | sin ejecutar (B8: lo corre el leader); su mutación de tasks.md: `grid-cols-1` en KPI |

### Mutaciones

Arnés en el scratchpad (`mutar.py`): aplica el cambio (exige el texto UNA vez), corre los tests, restaura y
compara byte a byte. Las 13 en ROJO, las 13 con `restaurado_identico=True`:

```
M6a-cta-gestionar-esta-orden: ROJO · 1 failed | 5 passed (6)
M6b-volver-llama-gestionarPedido: ROJO · 1 failed | 5 passed (6)
M6c-gate-dice-gestionar: ROJO · 6 failed | 9 passed (15)   (RepartoModoFoco + VerificarGuiaGate)
M6d-placeholder-viejo: ROJO · 1 failed | 5 passed (6)
M6e-volver-w-fit: ROJO · 1 failed | 5 passed (6)
M6f-sin-nota-pistola: ROJO · 1 failed | 5 passed (6)
M7a-ordenPorGuia-incluye-ayuda: ROJO · 1 failed | 2 passed (3)
M7b-escaner-con-bloqueo: ROJO · 1 failed | 5 passed (6)
M7c-no-cierra-el-modal: ROJO · 1 failed | 5 passed (6)
M7d-sin-guia-confirmada: ROJO · 1 failed | 5 passed (6)
M7e-aviso-ajena-otro-texto: ROJO · 2 failed | 4 passed (6)
M7f-ajena-abre-la-primera: ROJO · 2 failed | 4 passed (6)
M7g-escaner-bajo-los-kpi: ROJO · 1 failed | 5 passed (6)
```

### Comandos

- `npx tsc --noEmit -p .` (incluye `e2e/`): verde.
- `npx eslint` sobre los archivos tocados: 0 errores; avisos ya existentes (`EnviarPlantillaWhatsappButton` en
  `GestionarOrdenPanel.tsx`, `ordenCardsEnReparto` en `RepartoModule.test.tsx`).
- vitest de los afectados (Reparto*, VerificarGuiaGate, GestionarOrdenPanel*, ChatContactoAntesDeRecoger,
  Escaner*, Recoger*, `tests/unit/guards`): verde salvo `dependencias-declaradas-presentes.guardia` (4, el de
  la tanda 1, ajeno: `init.sh` sin tocar). `sin-estados-retirados` cazó un `ayuda_tienda` en la primera
  versión de `reparto-escaner.ts` (estado retirado por la 454): se rehízo con la lista `conAyuda`.
- Base desechable `slt163_gate` (URL a un archivo del scratchpad, nunca impresa; `migrate status`: al día).
  El primer gate salió rojo en `tests/integration/db/demo-qa.test.ts` (lo arrastra el cambio en
  `tests/fabricas/`): «faltan catálogos… vehiculo». Se sembró la desechable con `pnpm run db:seed` (solo
  catálogos) y pasó (13/13).
- `./init.sh` con `DATABASE_URL` a la desechable, log fuera del árbol: **`INIT_EXIT=0`** (typecheck, lint,
  test:rapido 100+100+100+100+36 archivos en verde, guardias). Tamaño: **40/40 archivos, 1290/1000 líneas
  de producción, 1727/3000 de tests**: aviso, aceptado con la marca `tamano-pr-aceptado` (ver desviaciones).

### Decisiones y desviaciones

- **`verificacionAbierta` no es prop: el CTA y el plegado se quitan del todo.** Tras R504 el panel solo se monta
  en modo foco (único consumidor: Reparto), así que la prop valdría siempre `true` y la rama cerrada sería
  código muerto. El efecto es el de `design.md §8`: verificación abierta, sin CTA ni `ChevronUp`.
- **`ordenPorGuia(porGestionar, conAyuda, numGuia)`** en vez de `(ordenes, numGuia)`: el DTO ya no dice si una
  orden tiene ayuda (`ayuda_tienda` está retirado, guardia `sin-estados-retirados`); la separación la hace
  el servidor en `conAyuda`. Una orden que figurara en las dos listas no se abre.
- **Escaneada reservada para otro día** (`esParaManana`): avisa con el texto de la 261 y no abre el diálogo.
- **`EscanerModal` acepta `children` como función** para cerrarse al encontrar la orden (design §7: «cierra el
  modal»). No se puede abrir desde fuera: la decisión del 2026-07-31 (arranca siempre cerrado) sigue.
- **Textos de la tarjeta del escáner de Reparto** (no están en el spec ni en el brief): título «Abrir orden
  por guía», descripción «Escanea o ingresa el número de guía de una orden de tu reparto.», botón «Abrir
  orden». A revisar con Carlos en Preview.
- **El disparador «Escanear o escribir guía» conserva el tamaño de `EscanerModal`** (botón `outline` de
  siempre). El canvas lo dibuja de 44 px a todo el ancho con chevron (design §7), pero es el componente
  compartido de todas las superficies de escaneo; queda para C (SLT-164), que lo pide también en Recoger y
  Recolección. El E2E de B no lo mide.
- **`KpisMensajero`**: el `overflow-hidden` propio era redundante (la `Card` lo trae); se quita para que el
  archivo cumpla la regla «oculta». El E2E (a) mide que cada cifra quepa en su tarjeta.
- **m3**: la tienda larga entra por `crearEscenarioReparto(…, { nombreTienda })`; la dirección y el producto,
  por `crearOrden`. Por defecto, los valores de siempre (los demás E2E no cambian).
- **Marca de tamaño**: el gate pone rojo el tamaño sin la marca de `docs/gate.md > Tamaño del PR`. Se añadió a
  `progress/features/SLT-163.md` la línea `tamano-pr-aceptado` transcribiendo el OK de Carlos ya anotado por
  el leader («Todo en un PR»). **El leader debe confirmarla.**
- **E2E sin ejecutar** (B8 sin marcar): `pwa-mensajero-reparto` y los tres actualizados los corre el leader.
- **Guardia m7**: `GestionarOrdenPanel.tsx` y `PosOrderCard.tsx` no entran (el primero solo pierde el CTA y
  sus 1 360 líneas tienen escala de antes; el segundo solo ganó una prop).

### Veredicto

B6 y B7 hechas, cada R con su test y su mutación en rojo; B8 escrita y compilando (sin ejecutar); gate `INIT_EXIT=0`.

## Tanda 3 (arreglo de B8 tras la corrida del leader) · frontend_dev · 2026-11-15

El leader corrió los E2E sobre la base nueva `servi_slt163_e2e`. Resultado: reparto 8/10. El (a) salía rojo a 360 y 414 px
porque las cifras grandes de los KPI («₡8.328.638,65») se salían de su tarjeta (R501). Era un fallo real.

### Causa y arreglo
- La cifra llevaba `COLUMNA_FIJA` (`whitespace-nowrap shrink-0`) a 20 px, y el contador (`KpiValorAnimado`) trae su propio
  `whitespace-nowrap`. En la rejilla 2 × 2 a 360 px quedan unos 120 px y el importe no cabía. El `overflow-hidden` que quité
  en la tanda 2 no era la causa: la primitiva `Card` lo sigue llevando, y con él la cifra solo quedaba recortada en vez de salirse.
- `MA/KpisMensajero.tsx`: `CIFRA_KPI` (literal, para Tailwind) = 16 px en el móvil, `min-w-0 wrap-anywhere` y la cifra salta
  de línea entera si no cabe. Desde `md` sigue la columna fija (`md:whitespace-nowrap md:shrink-0 md:text-2xl`). Los dos
  importes pasan `className="whitespace-normal md:whitespace-nowrap"` al contador. Nada de `truncate` ni «…».
- `tests/components/KpisMensajero.test.tsx`: el caso de la cifra ahora afirma las clases del móvil (`wrap-anywhere`,
  `text-base`, sin `whitespace-nowrap`/`shrink-0`/`text-xl`), las de `md` y que el contador de los importes envuelva.
  Antes afirmaba `COLUMNA_FIJA`, que era justo el fallo.

### Ajustes del E2E (`e2e/pwa-mensajero-reparto.spec.ts` y el fixture)
- (a) Al pasar a Detalle espera a `aria-pressed` y a que se vaya el carrusel. La fila se localiza como `:scope > button[aria-expanded]`:
  con `.first()` caía en un desplegable de 16 px de dentro.
- (a) La dirección desplegada se pinta tras cantón y distrito («San Pablo · San Pablo — …»). Se busca entera como subcadena,
  no `exact`. Lo comprobé imprimiendo el texto de la tarjeta.
- `e2e/_pwa-mensajero-fixture.ts > sinElipsis`: exime el texto `sr-only`, reconocido por su firma (absoluto, 1 × 1 px).
  «Sin posición en la ruta» es el nombre accesible del «·» de la parada, no un dato visible recortado.

### E2E (base `servi_slt163_e2e`, `next build` con cada cambio de app)
- reparto: `pwa-mensajero-reparto` + `mis-asignaciones` + `reintentos-escalado`: **10 passed, E2E_EXIT=0**.
- dinero: `pwa-mensajero-base` + `pwa-mensajero-cierre-dia` + `tope-intentos-por-empresa`: **21 passed, E2E_EXIT=0**. Se corrió
  porque cambió el fixture compartido.

### Mutaciones
- E2E: con `KpisMensajero.tsx` del commit 0113f39b (sin el arreglo) y build, (a) sale ROJO: «más ancho que su caja /
  fuera de la tarjeta: ₡8.339.305,71». En esta corrida cayó el de 360 y pasó el de 414 (1 failed, 1 passed). Restaurado con `cmp`.
- E2E: `grid-cols-1` en los KPI y build: (a) ROJO a 360 y 414 (`columnas: 1, filas: 4`, 2 failed). Restaurado con `cmp`.
- Unitario: sin el arreglo, `KpisMensajero.test.tsx` ROJO (1 failed | 6 passed). Restaurado con `cmp`.

### Gate
`./init.sh` con la desechable `slt163_gate`, log fuera del árbol: **INIT_EXIT=0**. Tamaño: 41/40 archivos, 1304/1000 de
producción, 1727→1743/3000 de tests. El archivo 41 es el fixture. Queda en aviso por la marca `tamano-pr-aceptado`; que el leader
confirme que también cubre los 41 archivos.

### Veredicto
B8 en verde: los 3 archivos de reparto 10/10 y los de dinero que tocan el fixture 21/21. El arreglo deja el importe entero en su
tarjeta, la mutación lo pone rojo y el gate da `INIT_EXIT=0`.

## Tanda 4 (review RECHAZADA: B1-B3 y m1-m3) · frontend_dev · 2026-11-15

La review está en `progress/review_SLT-163.md` (a820c4d5). Las decisiones las tomó el leader.

### Bloqueantes
- **B1 (261/R12).** Dos casos nuevos en `tests/components/EscanerGuiaReparto.test.tsx`:
  - Al escanear la guía de una orden reservada (`esParaManana`, 2026-11-27) sale el aviso de reserva, que se comprueba
    con un literal en forma de regex y no con `avisoReservaParaOtroDia`. No se abre «¿Gestionar esta orden?» y no se llama a `escoger`.
  - La segunda guarda (`escoger`, `RepartoModule.tsx:516`) se prueba con un doble de `EscanerGuiaReparto` que entrega la
    reservada al módulo saltándose la guarda del escáner (`simulacion.saltarGuardaDelEscaner`). «Aceptar» se frena con el
    aviso de reserva y no se llama al servidor. El resto del archivo usa el escáner real.
- **B2 (R493).** `EscanerModal` gana la prop opcional `tactil`: `size="touch"` (44 px) y `w-full`. Solo la pasa
  `EscanerGuiaReparto`, así que los demás usos no cambian (`EscanerModal.test`, `RecogerPaqueteCard.test` en verde).
  - Test de componente: «R493: el disparador mide 44 px (`h-11`) y va a todo el ancho».
  - El E2E (b) mide el disparador con `tactil()`.
- **B3 (R492).** La cifra del KPI vuelve a `COLUMNA_FIJA`: una sola línea, sin `wrap-anywhere` ni `whitespace-normal`, y el contador
  ya no se sobrescribe. Mide 14 px (`text-sm`) en el móvil y 24 px desde `md`. Corregidos el comentario (ahora dice
  que el número no se parte y lo que salta es el rótulo) y el test de clases, que ahora fija `whitespace-nowrap` + `text-sm` como
  contrato y prohíbe `wrap-anywhere`/`whitespace-normal`/`text-base`/`text-xl`/`truncate`.

### Menores
- m1: el comentario de la feature 235 vuelve encima de `HiloNotasAyudaModal`. `ConfirmarGestionDialog` sube por encima del
  comentario del chat, así que ese comentario vuelve a quedar sobre el hilo y el `ChatFlotante`.
- m2: fuera el `user` sin uso de `GestionarOrdenPanelIncidente.test.tsx`.
- m3: sin `₡` en los comentarios de `KpisMensajero.tsx` («un importe de ocho cifras»).

### Mutaciones (arnés `mutar4.py` y `e2e4.sh` en el scratchpad; cada archivo restaurado, `cmp` idéntico)
```
U1-sin-guarda-reservada-escaner (EscanerGuiaReparto.tsx:60): ROJO · 1 failed | 8 passed (9)
U2-sin-guarda-reservada-escoger (RepartoModule.tsx:516-519): ROJO · 1 failed | 8 passed (9)
U3-disparador-sin-tactil: ROJO · 1 failed | 8 passed (9)
U4-cifra-text-base: ROJO · 1 failed | 6 passed (7)        (test de clases)
U5-cifra-wrap-anywhere: ROJO · 1 failed | 6 passed (7)
E2E (a) con text-base + build: VERDE a 360 y 414 (2 passed). Con el importe del escenario (13 caracteres)
  16 px aún cabe; la primera corrida de esta mutación cayó por la geocodificación del escenario, no por el KPI.
E2E (a) con text-xl + build (el tamaño que se desbordaba): ROJO a 360 («más ancho que su caja / fuera
  de la tarjeta: ₡8.339.305,71»).
E2E (b) sin `tactil` + build: ROJO (alto 32 < 44).
```
Se eligió `text-sm` y no `text-base` para dejar margen a importes más largos (por ejemplo ₡99.999.999,99, de 14
caracteres). La mutación E2E que lo prueba es `text-xl`, porque con `text-base` el E2E sigue en verde.

### E2E (base `servi_slt163_e2e`, `next build` con el arreglo)
- reparto (`pwa-mensajero-reparto`, `mis-asignaciones`, `reintentos-escalado`): **10 passed, E2E_EXIT=0**.
- dinero (`pwa-mensajero-base`, `pwa-mensajero-cierre-dia`, `tope-intentos-por-empresa`): **21 passed, E2E_EXIT=0**.
- El último build del árbol se hizo con la mutación `text-xl` (ya revertida): antes de otra corrida E2E hay que volver a hacer `next build`.

### Gate
`./init.sh` con la base desechable `slt163_gate`: **INIT_EXIT=0**. Tamaño: 41/40 archivos, 1311/1000 líneas de producción y 1831/3000 de tests
(aviso, con la marca).

### Veredicto
B1-B3 y m1-m3 resueltos, cada uno con su mutación en rojo. E2E: reparto 10/10 y dinero 21/21. Gate `INIT_EXIT=0`.
