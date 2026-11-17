# impl SLT-190 «Recoger y Recolección según el canvas» — frontend_dev

Fecha: 2026-11-17. Rama `feature/SLT-190-recoger-recoleccion-segun-canvas`. Spec:
`specs/SLT-190-recoger-recoleccion-segun-canvas/requirements.md` (R850-R871, T1-T5 hechas, T6 a medias).
Decisiones aplicadas: P1 el filtro «Tienda» entra; P2 selector existente (`Select` con `labelPrefix`,
«Tienda: X», el que pinta el `single` de `FilterComponent`), montado como hijo de `BuscadorFiltros`
igual que el cantón de Reparto; P3 la fila de Recolección muestra solo el nombre de la tienda.

## Archivos

Producción (12):
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCard.tsx` — props `posicion` y `filaRecoleccion`.
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx` — número «Orden n de total» + «n de total · peso».
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx` — número; fila plegada de Recolección (tienda + sufijo, estado vigente en texto). Toca solo eso (SLT-192 también edita este archivo).
- `app/(app)/mis-asignaciones/_components/filtro-tienda.ts` (nuevo) — `opcionesTienda`, `filtrarPorTienda`, constantes.
- `app/(app)/mis-asignaciones/_components/FiltroTienda.tsx` (nuevo, **fuera de la lista de archivos esperados**) — el `Select` del filtro, compartido por las dos pantallas para no duplicarlo.
- `app/(app)/mis-asignaciones/_components/RecogerModule.tsx` — filtro, conmutador en `trasFiltros`, numeración, `buscando` = término o tienda.
- `app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx` — `titulo="Recoger paquete"` + `sinEncabezado`.
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx` — filtro, conmutador único en la barra, numeración, fila de Recolección, `titulo="Recolectar en tienda"`.
- `app/(app)/recoleccion/_components/RecolectadasHoyLista.tsx` — sin conmutador ni props `vistaPedida`/`onVistaChange`; hora plegada en Detalle, al pie en Mosaico.
- `components/shared/EscanerModal.tsx` — prop `titulo`: barra visible + `DialogClose` `icon-touch` (44 px) + `showCloseButton={false}`.
- `components/shared/EscanerGuiaCard.tsx` — prop `sinEncabezado`.
- `components/shared/EscaneoContinuo.tsx` — `TarjetaEscaneoContinuo` pasa `sinEncabezado`.

Tests (9):
- `tests/unit/components/filtro-tienda.test.ts` (nuevo)
- `tests/components/PosOrderCardPosicion.test.tsx` (nuevo)
- `tests/components/PosOrderCardDetalleCompacta.test.tsx`
- `tests/components/RecogerModule.test.tsx` (+ reescrito «el carrusel trae… etiqueta de posición»: «de 2» ya aparece también en las tarjetas)
- `tests/components/RecogerPaqueteCard.test.tsx`
- `tests/components/RecoleccionModule.test.tsx` (reescritos a R860: «sin nada por recolectar no hay conmutador» y el conmutador de R517, que se buscaba en la cabecera)
- `tests/components/EscanerModal.test.tsx`
- `tests/components/EscanerGuiaCard.test.tsx`
- `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` — dos tests nuevos (Recolección a 360/414 y Recoger a 360). **Escrito, no corrido** (pide build y base desechable).

`EscaneoContinuo.test.tsx` no se tocó: sigue en verde.

## Mapa R -> test

| R | Test |
|---|---|
| R850 | `filtro-tienda.test.ts` «R850 — opciones…»; `RecogerModule.test.tsx` «R850: «Filtros» ofrece «Tienda»…»; `RecoleccionModule.test.tsx` «R850: las opciones de «Tienda» salen de las dos listas…» |
| R851 | `filtro-tienda.test.ts` «R851 — filtrar por tienda» (con `filtrarAsignaciones`); `RecogerModule` «R851/R853…»; `RecoleccionModule` «R851/R853…» |
| R852 | `RecogerModule` «R852: con el filtro puesto, «Filtros (1)»…» y «R852: quitar «Tienda»…»; `RecoleccionModule` «R852…»; E2E «SLT-190 Recolección a {360,414} px» (a) |
| R853 | `RecogerModule` «R851/R853…» (contadores) y «R853: el filtro no cambia lo que acepta el escáner»; `RecoleccionModule` «R851/R853…» y «R853…» |
| R854 | `RecogerModule` «R854: … vacío de búsqueda y el puntero…»; `RecoleccionModule` «R854…» |
| R855 | `PosOrderCardPosicion.test.tsx` «R855…» (Mosaico y Detalle). Mutación: «Orden ${orden.secuenciaRuta}» → 3 rojos |
| R856 | `PosOrderCardPosicion.test.tsx` «R856…» (Mosaico y Detalle) |
| R857 | `RecogerModule` «R857…» (filtro y otra pestaña); `RecoleccionModule` «R857…» |
| R858 | `PosOrderCardPosicion.test.tsx` «R858 — Reparto no cambia» (3 casos) |
| R859 | `RecogerModule` «R859…»; E2E «SLT-190 Recoger a 360 px» |
| R860 | `RecoleccionModule` «R860: con «Por recolectar» vacía…» y «R860: un único conmutador…». Mutación: conmutador en la cabecera → 2 rojos |
| R861 | **Solo E2E** (no corrido): «SLT-190 Recolección a {360,414} px» (a) 44 px y sin desborde, (b) pegado al bajar. En jsdom no hay medida; el `max-md:[&>button]:h-11` del conmutador ya lo fija `RepartoMovil.test.tsx` R797 |
| R862 | `PosOrderCardDetalleCompacta` «R862…»; `RecoleccionModule` «R862/R864…»; E2E (d) |
| R863 | `PosOrderCardDetalleCompacta` «R863…»; `RecoleccionModule` «R863/R865…»; E2E (d) |
| R864 | `PosOrderCardDetalleCompacta` «R864…»; `RecoleccionModule` «R862/R864…»; guardia `nombres-estado-retirados` |
| R865 | `PosOrderCardDetalleCompacta` «R865…»; `RecoleccionModule` «R863/R865…» |
| R866 | `PosOrderCardDetalleCompacta` «R866…» (+ R794 de SLT-189 sigue verde) |
| R867 | `RecogerPaqueteCard` «R867…»; `EscanerGuiaCard` «R867…»; E2E Recoger |
| R868 | `RecoleccionModule` «R868/R869/R870…»; E2E Recolección (c) |
| R869 | `EscanerModal` «R869…»; `RecogerPaqueteCard` «R869…» (+ R598 «dos éxitos y cerrar» sigue verde con el «Cerrar» nuevo); `RecoleccionModule` «R868/R869/R870…»; E2E (c) |
| R870 | `RecogerPaqueteCard` «R870…» (+ R833 de SLT-168); `RecoleccionModule` «R868/R869/R870…» |
| R871 | `EscanerModal` «R871…»; `EscanerGuiaCard` «R871…» |

## Comandos

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`: sin él, tsc cae por memoria, exit 134) -> `TC_EXIT=0`.
- `pnpm run lint` -> `LINT_EXIT=0`, 0 errores, 248 warnings, ninguno en archivos de esta tanda.
- `pnpm exec vitest related --run <12 de producción + 8 tests + guardias pwa-mensajero-sin-recorte y nombres-estado-retirados>` -> `Test Files 220 passed (220) · Tests 3278 passed | 17 skipped (3295)` · `VT_EXIT=0` (609 s).
- Mutaciones (a mano, restauradas): posición desde `secuenciaRuta` -> 3 rojos en `PosOrderCardPosicion`; conmutador en la cabecera de «Por recolectar» -> 2 rojos R860.
- E2E `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`: **no corrido** (build + base desechable; lo corre el leader). `./init.sh` tampoco.

## Veredicto

T1-T5 hechas y en verde (typecheck, lint, 3278 tests relacionados); T6 pendiente de correr el E2E y `./init.sh`; R861 solo tiene cobertura E2E.

## Vuelta 2 (hallazgos de `progress/review_SLT-190.md`) — frontend_dev, 2026-11-17

Archivos modificados:
- `tests/components/RecogerModule.test.tsx` (m1)
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx` (m2, solo comentario)

- **B1 — ABIERTO, pregunta para Carlos; guardia NO tocada.** La guardia no admite la fila tal cual:
  el brazo (a) no tiene excepciones para `{nombreDeEstado(x)}` como hijo JSX, y la única clase que
  encaja (`control-con-hermano`) exige el botón de información como HERMANO del control. En la fila
  plegada de Recolección no hay hermano visible: el único `EstadoConInfo` de la tarjeta está en el
  despliegue (se ve solo tras tocar la fila). Declararlo como `H` pasaría el brazo (c) por mecánica
  (el archivo usa `EstadoConInfo`), pero forzaría la regla de la 456 R18. Opciones para Carlos:
  (1) aceptar el despliegue como «hermano» y declarar la excepción `H` (calcular el nombre en una
  constante para que (a) no lo vea como render); (2) poner un `InfoEstado` junto al botón de la fila,
  fuera de él (como la fila del chat), lo que cambia DS5 y el canvas; (3) quitar el estado de la fila
  plegada (cambia R864).
- **m1 — hecho.** En el test «R851/R853» se añade `t5` (otro día, «Tienda Norte»); con «Tienda Sur»
  filtrada la pestaña debe decir «Para otro día (2)». Mutación `RecogerModule.tsx:406`
  `grupos.otroDia.length` → `otroDiaFiltrado.length`: el test cae (1 failed | 84 skipped); revertida
  con `git checkout --`.
- **m2 — hecho.** El comentario dice ahora que el título lo pinta la barra del diálogo (DS7).
- **m3 — no se hace** (nota del reviewer, por indicación del leader).

Mapa R -> test (cambio): R853 (contador «Para otro día» = lo que el mensajero TIENE) ->
`tests/components/RecogerModule.test.tsx` «R851/R853: deja solo esa tienda en las dos pestañas…».

Comandos (base desechable `servi_slt190_desechable`):
- `vitest run` estado-con-info.guardia, RecogerModule, RecoleccionModule, PosOrderCardDetalleCompacta:
  `Test Files 1 failed | 3 passed (4)`, `Tests 2 failed | 183 passed (185)`; los 2 rojos son (a) y (b)
  de `estado-con-info` (B1, abierto).
- `pnpm exec eslint` de los dos archivos tocados: exit 0.

Veredicto vuelta 2: m1 y m2 cerrados; B1 sigue rojo a la espera de la decisión de Carlos.

## Vuelta 3 (B1 con la decisión de Carlos: opción 2) — frontend_dev, 2026-11-17

Archivos modificados:
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`
- `tests/components/PosOrderCardDetalleCompacta.test.tsx`
- `tests/components/RecoleccionModule.test.tsx`

- El estado de la fila plegada de Recolección y su (i) salen del botón de la fila y van debajo,
  alineados con su columna de texto, como hermanos del disparador (patrón de la fila del chat:
  un botón no anida otro). Se pintan con `EstadoConInfo` (que usa `InfoEstado`), sin componente
  nuevo; el archivo ya no importa `nombreDeEstado`, así que la guardia `estado-con-info` queda
  verde SIN tocarla y sin excepción nueva. Dejar el nombre dentro del botón (como el chip del chat)
  habría pedido una entrada en `USOS_PERMITIDOS`, que es tocar la guardia.
- Área táctil 44 × 44: `CLASE_INFO_TACTIL = "[&_button]:after:-inset-3.5"` (el pseudo-elemento del
  botón pasa de 24 a 44 px sin ocupar caja); la línea mide `min-h-11`.
- Efecto colateral: el nombre accesible del botón de la fila ya no incluye el estado; lo anuncia el
  (i) («Qué significa «Recolectando»»).

Mapa R -> test (cambio):
- R864 (B1) -> `PosOrderCardDetalleCompacta.test.tsx` «R864 (B1, decisión de Carlos…)»: (i) visible
  sin desplegar, fuera del botón, hermano del texto del estado, con la clase de 44 px; tocarlo abre
  su explicación y no despliega la tarjeta.
- R862/R864 -> `RecoleccionModule.test.tsx` «R862/R864…»: estado y (i) en la tarjeta plegada.
- R866 -> sin `filaRecoleccion` no hay (i) ni estado.

Comandos (base desechable `servi_slt190_desechable`):
- `vitest run` estado-con-info.guardia, RecogerModule, RecoleccionModule, PosOrderCardDetalleCompacta:
  `Test Files 4 passed (4)`, `Tests 186 passed (186)`.
- `pnpm exec eslint` de los tres archivos tocados: exit 0.

Veredicto vuelta 3: B1 cerrado; la guardia `estado-con-info` en verde.
