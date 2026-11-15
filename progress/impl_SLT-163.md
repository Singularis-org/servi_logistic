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
