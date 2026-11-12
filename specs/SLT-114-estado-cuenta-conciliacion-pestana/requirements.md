# SLT-114 «Estado de cuenta de la satélite: conciliación en pestaña» — requirements (ruta ligera)

> Ruta: **ligera** (`complexity: low`, zona frontend). Escrito por spec_author el 2026-11-12 sobre el
> árbol del worktree `SLT-114-estado-cuenta-conciliacion-pestana` (rama
> `feature/SLT-114-estado-cuenta-conciliacion-pestana`, nacida de `dev` tras el merge de SLT-108).
>
> **Rebanada S17** del rediseño de cierres. El spec madre, aprobado por Carlos (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/` (`requirements.md > R78`, `design.md > Qué sustituye cada
> componente` fila «Fila desplegada de `ConciliacionSatelite.tsx`», `tasks.md > Plan de las demás
> rebanadas > S17`). Canvas aprobado: `specs/SLT-95-detalle-cierre-rediseno/canvas/project/EstadoCuenta.dc.html`.
> Depende de SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (S6, ya en `dev`):
> de ahí salen `Cuenta`, `cuentaConciliacion` y el detalle único de bodega que abre el enlace.
> El R78 del madre se cita; aquí se desglosa en R230-R239 (rango reservado para esta ficha).

## Lo que ya existe

Buscado en el board (`feature_list.json`: «SLT-114», «conciliación», «estado de cuenta»), en `specs/`
(«S17», «ConciliacionSatelite», «Ver el cierre de bodega completo») y en el código (Grep/Read: el
grafo no tiene indexado este worktree).

- **No está hecho.** `EstadoCuentaSatelite.tsx` monta `ConciliacionSatelite` en el `pie` de
  `EstadoCuenta`, **debajo** del libro, sin pestañas; la fila desplegada pinta `CascadaDinero`
  (`lineasCuentaConsolidacion`), no `Cuenta`, y no hay enlace al cierre de bodega.
- **No hay dirección del detalle de un cierre de bodega.** `lib/utils/cierre-enlace.ts` solo tiene
  `?cierre=` (cierre del día, que lee `CierresAdminModule` con `AbrirCierreDeLaUrl`).
  `CierresBodegaAdminModule` abre el detalle único solo desde la cola (`abrirDetalle`), y
  `CierresTabs` arranca siempre en «Mensajero».
- Piezas que se reutilizan tal cual: `components/ui/tabs` (las mismas pestañas subrayadas de
  `DetalleCierre`), `Cuenta` (con su `pie` para el enlace), `cuentaConciliacion` y los rótulos de
  `detalle-cierre-labels.ts` (`RECAUDADO_LABEL`, `PAGO_A_MENSAJEROS_LABEL`,
  `DEBE_LLEGAR_A_LA_CENTRAL_LABEL`, `CONCILIACION_TITULO`), `CASCADA_CENTRAL_TITULO`,
  `GANA_BODEGA_SATELITE_LABEL` y sus notas, `AbrirCierreDeLaUrl`, `ConciliacionAcciones`.
- Ninguna dependencia nueva.

## Alcance

`/wallet/satelites/[zonaId]` (solo central: acceso total, R81 de la 458-D):

- Debajo de las tarjetas del estado de cuenta, dos pestañas: «Conciliación» (abre seleccionada) y
  «Movimientos» (el libro de hoy). La pestaña «Conciliación» lleva cuántas consolidaciones quedan sin
  conciliar, como el canvas.
- La fila desplegada de cada consolidación pasa de una `CascadaDinero` a dos `Cuenta` en cascada
  («Lo que va a la central» y «Conciliación») con el enlace «Ver el cierre de bodega completo».
- El enlace abre `/cierres-admin` en la mitad «Bodega» con el detalle único de ese cierre de bodega
  abierto (dirección nueva `?cierreBodega=<id>`, leída en el cliente).

## Lo que NO entra

- Ningún cambio de servicio, acción, consulta, esquema ni permiso. Todos los importes son los STRING
  que ya trae `ConsolidacionSateliteDTO`, pintados con `money()`; no se suma ni se resta nada en el
  cliente. Si al implementar falta un dato, se para y se pregunta.
- Las cifras, acciones, avisos y textos de hoy de la conciliación: aviso de diferencia, conmutador
  «Sin conciliar / Todas», `ConciliacionAcciones`, descarga y nota «Marcar recibido asienta…» (R78:
  «no cambian»). Excepciones decididas por Carlos el 2026-11-12 (PA1, PA2, PA3): sale la tarjeta
  «Pendiente de llegar» de la pestaña, dos columnas cambian de título y la cuenta «Lo que va a la
  central» oculta los métodos en cero.
- Las otras superficies de `EstadoCuenta` (tienda, `/mi-wallet`, mensajero): sin cambios.
- Borrar `CascadaDinero`: SLT-115 «Retirar los componentes de cierre sustituidos».

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D15 | 2026-11-09 · Carlos | Componentes iguales con props distintas (la `Cuenta` y las pestañas del detalle único). |
| D16 | 2026-11-09 · Carlos | Tarjetas con mucha información (conciliación) en formato cascada. |
| D18 / S4-1 | 2026-11-09/10 · Carlos | Fiel al canvas aprobado; donde el spec se aparte, lo dice como pregunta. |
| D20 | 2026-11-09 · Carlos | Una cifra, un nombre. |
| R78 | madre (SLT-95) | Pestañas «Conciliación» y «Movimientos», abre en «Conciliación»; fila desplegada con dos tarjetas cascada y enlace al detalle único; cifras, acciones y avisos no cambian. |

Cobertura: D5 → R235, R236, R239 · D15 → R230, R235, R236, R238 · D16 → R235, R236 ·
D18/S4-1 → R230, R233, R235-R237 · D20 → R235, R236 · R78 → R230-R239.

**Decisiones de este spec** (técnicas, sin pregunta): la dirección del detalle de bodega es
`?cierreBodega=` en `/cierres-admin` (descartado: montar otro detalle de bodega dentro de la wallet,
porque duplicaría todo el cableado de S6 —pestañas, pie con `ConciliacionAcciones`, visor de
evidencia— y rompería D15); las pestañas las pinta `EstadoCuenta` con una prop nueva y opcional
(las tarjetas y la lectura del saldo viven dentro de él, y la conciliación necesita `vigente` y
`refrescarCuenta`); el conteo de la pestaña sale del `total` del listado «Sin conciliar» que la
pestaña ya lee (misma clave SWR, sin lectura nueva en el servidor).

## Requisitos (EARS)

- **R230** — CUANDO la central abre `/wallet/satelites/[zonaId]`, la página DEBE mostrar, debajo de
  las tarjetas del estado de cuenta, una lista de pestañas con «Conciliación» y «Movimientos» en ese
  orden, con «Conciliación» seleccionada. Las pestañas DEBEN ser las de `components/ui/tabs` con el
  mismo estilo subrayado que `DetalleCierre`.
- **R231** — MIENTRAS «Conciliación» esté seleccionada, la página DEBE mostrar la conciliación de la
  bodega (aviso, conmutador, tabla, paginación y nota) y NO DEBE mostrar el libro; MIENTRAS
  «Movimientos» esté seleccionada, DEBE mostrar el libro (barra, tabla, paginación) y NO la
  conciliación. Las tarjetas del estado de cuenta DEBEN verse con las dos.
- **R232** — CUANDO la central cambia de pestaña y vuelve, cada pestaña DEBE conservar su estado
  (filtro «Sin conciliar / Todas» y página de la conciliación; término, casillas y página del libro).
  CUANDO la central marca, corrige o desmarca en «Conciliación», el sistema DEBE releer el estado de
  cuenta de la bodega (R30 de la 458-D), de modo que las tarjetas y «Movimientos» muestren la lectura
  nueva.
- **R233** — MIENTRAS el listado «Sin conciliar» de la bodega tenga `total` > 0, la pestaña
  «Conciliación» DEBE mostrar junto a su rótulo «<n> sin conciliar» con ese `total`; SI el `total` es 0
  o la lectura no ha llegado o falló, ENTONCES la pestaña DEBE decir solo «Conciliación».
- **R234** — SI una superficie de `EstadoCuenta` no declara la pestaña de conciliación (tienda,
  `/mi-wallet`, mensajero), ENTONCES `EstadoCuenta` NO DEBE pintar pestañas y su contenido DEBE ser el
  de hoy.
- **R235** — CUANDO la central despliega una consolidación, la fila DEBE mostrar la `Cuenta`
  «Lo que va a la central» con, en orden: Efectivo (`totales.efectivo`), SINPE (`totales.simpe`),
  Transferencia (`totales.transferencia`) —solo los métodos que no valen cero (PA3,
  `metodosVisibles`)—, «Recaudado» como subtotal (`totales.general`),
  «− Pago a mensajeros» (`pagoMensajero`), «− Gana la bodega satélite» (`gananciaSatelite`, con la nota
  del modelo que corresponda) y «Debe llegar a la central» como total (`paraLaCentral`, con su nota).
  Cada importe DEBE ser el STRING del servidor pasado por `money()`.
- **R236** — CUANDO la central despliega una consolidación, la fila DEBE mostrar, al lado de la
  anterior, la `Cuenta` «Conciliación» con las mismas líneas que la pestaña «Conciliación» del detalle
  único (`cuentaConciliacion`): «Debe llegar a la central» (`paraLaCentral`), «− Recibido»
  (`montoRecibido`, o «—» sin marca, nunca ₡0,00) y «Falta por recibir» como total
  (`faltaPorRecibir` del servidor tal cual, aunque no cuadre).
- **R237** — La `Cuenta` «Conciliación» de la fila DEBE llevar al pie el enlace «Ver el cierre de
  bodega completo» con dirección `/cierres-admin?cierreBodega=<cierreBodegaId codificado>`, construida
  por una función de `lib/utils/cierre-enlace.ts` que comparten quien la emite y quien la lee. El
  identificador NO DEBE aparecer en el texto visible.
- **R238** — CUANDO `/cierres-admin` carga con `cierreBodega=<id>` para la central, el sistema DEBE
  mostrar la mitad «Bodega» y abrir el detalle único de ese cierre de bodega con la misma lectura y el
  mismo montaje que «Ver / decidir» de la cola. CUANDO se cierra ese detalle, el sistema DEBE quitar
  `cierreBodega` de la dirección con `replace`, conservando los demás parámetros. SI la lectura no
  responde `ok`, ENTONCES el sistema DEBE avisar con los mismos mensajes que la cola y dejar la cola
  visible.
- **R239** — La conciliación en su pestaña DEBE conservar las cifras, acciones, avisos y textos de hoy:
  el aviso de diferencia (con varias incompletas, su importe sigue siendo el `saldoActual` del estado
  de cuenta), `ConciliacionAcciones` según `puedeConciliar` (sin permiso, ningún botón), la descarga
  del conjunto filtrado y la nota de pie. Por decisión de Carlos (2026-11-12): la pestaña NO DEBE
  pintar la tarjeta «Pendiente de llegar» (PA1: la cifra ya está en «Por entregar hoy»), y las
  columnas «Para la central» y «Falta por recibir» de la tabla DEBEN titularse «Debe llegar» y
  «Falta» (PA2); las demás columnas y su orden no cambian. El cliente NO DEBE operar con importes
  (`Number(`, `parseFloat` o restas).

## Trazabilidad (R → test)

| R | Test |
|---|---|
| R230 | `tests/components/EstadoCuentaSatelite.test.tsx` › «R230 — pestañas Conciliación y Movimientos, abre en Conciliación» (orden de `tab`, `aria-selected`) |
| R231 | `tests/components/EstadoCuentaSatelite.test.tsx` › «R231 — cada pestaña muestra lo suyo y las tarjetas siguen» |
| R232 | `tests/components/EstadoCuentaSatelite.test.tsx` › «R232 — volver a una pestaña conserva filtro y página» y el test R30 existente (marcar relee el estado de cuenta), adaptado a la pestaña |
| R233 | `tests/components/EstadoCuentaSatelite.test.tsx` › «R233 — la pestaña dice "2 sin conciliar" con total 2 y solo "Conciliación" con 0» (literales) |
| R234 | `tests/components/EstadoCuenta.test.tsx` › «R234 — sin pestaña de conciliación no hay tablist» (tienda) |
| R235 | `tests/components/ConciliacionSateliteCascada.test.tsx` › «R235 — "Lo que va a la central" con literales del doble» (importes escritos a mano) y «R235 — los métodos en cero no se pintan» (PA3) |
| R236 | `tests/components/ConciliacionSateliteCascada.test.tsx` › «R236 — "Conciliación": "—" sin marca y la falta del servidor tal cual (canario)» |
| R237 | `tests/components/ConciliacionSateliteCascada.test.tsx` › «R237 — enlace "Ver el cierre de bodega completo" con su href» + `tests/unit/utils/cierre-enlace.test.ts` (codifica el id) |
| R238 | `tests/components/CierresBodegaAdminDeepLink.test.tsx` (nuevo, espejo de `CierresAdminDeepLink.test.tsx`): abre en «Bodega» con el detalle, cierra y limpia el parámetro, `no_encontrada` avisa |
| R239 | `tests/components/EstadoCuentaSatelite.test.tsx` › tests R31/R30/«sin permiso» existentes, adaptados a la pestaña, y «R239 — sin "Pendiente de llegar" y columnas "Debe llegar" y "Falta"» (PA1, PA2); `tests/integration/wallet-satelites.test.tsx` verde |

## Tasks

- [x] **T1** `lib/utils/cierre-enlace.ts`: `PARAM_CIERRE_BODEGA = "cierreBodega"` y
  `hrefDetalleCierreBodega(id)`; reexporta en `app/(app)/cierres-admin/_components/cierre-enlace.ts`.
  **Hecho:** test unitario del href con un id que necesita codificarse.
- [x] **T2** [P] `CierresTabs` arranca en «Bodega» si la dirección trae `cierreBodega`;
  `CierresBodegaAdminModule` abre el detalle con `AbrirCierreDeLaUrl` (o su equivalente) y limpia el
  parámetro al cerrar. Depende de T1. **Hecho:** `CierresBodegaAdminDeepLink.test.tsx` verde (R238) y
  `CierresBodegaAdminDetalleUnico`/`CierresBodegaAdminCola` siguen verdes.
- [ ] **T3** [P] `EstadoCuenta`: prop opcional para una pestaña previa al libro (rótulo + render con
  `vigente` y `refrescarCuenta`); con ella, `Tabs` bajo tarjetas y acciones; sin ella, DOM de hoy.
  Las dos pestañas conservan estado al alternar. **Hecho:** R234 en `EstadoCuenta.test.tsx`;
  `EstadoCuenta468`, `EstadoCuentaBarra467` y los de tienda/mi-wallet sin tocar y verdes.
- [ ] **T4** `EstadoCuentaSatelite` pasa la conciliación como esa pestaña (abre seleccionada) con el
  conteo «<n> sin conciliar» del listado «Sin conciliar». Depende de T3. **Hecho:** R230-R233 y R239
  en `EstadoCuentaSatelite.test.tsx`; los tests existentes que leen el libro pulsan «Movimientos».
- [ ] **T5** `ConciliacionSatelite`: `renderExpanded` con dos `Cuenta` (R235, R236) en rejilla de dos
  columnas y el enlace de T1 al pie (R237); deja de importar `CascadaDinero`. `cuentaConciliacion` se
  reutiliza aceptando el subconjunto de campos que usa (sin duplicar líneas). Depende de T1.
  **Hecho:** `ConciliacionSateliteCascada.test.tsx` reescrito con literales a mano y canario;
  guardias `wallet-sin-uuid`, `enlace-contraste-458`, `cierre-bodega-vocabulario` y
  `conciliacion-esperado-unico` verdes.
- [ ] **T6** Cierre: `./init.sh` verde; verificación en navegador de `/wallet/satelites/<zona>` (abre
  en «Conciliación», conteo, despliegue con dos cuentas, enlace abre el detalle en `/cierres-admin`).
  **Hecho:** gate verde y captura o nota de la verificación en `progress/features/SLT-114.md`.

## Archivos esperados

- `lib/utils/cierre-enlace.ts`
- `app/(app)/cierres-admin/_components/cierre-enlace.ts`
- `app/(app)/cierres-admin/_components/CierresTabs.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `components/shared/estado-cuenta/EstadoCuenta.tsx`
- `app/(app)/wallet/satelites/_components/EstadoCuentaSatelite.tsx`
- `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx`
- `app/(app)/wallet/satelites/_components/satelites-labels.ts`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `tests/unit/utils/cierre-enlace.test.ts`
- `tests/components/CierresBodegaAdminDeepLink.test.tsx`
- `tests/components/EstadoCuenta.test.tsx`
- `tests/components/EstadoCuentaSatelite.test.tsx`
- `tests/components/ConciliacionSateliteCascada.test.tsx`
- `tests/integration/wallet-satelites.test.tsx`

15 archivos (tope `gate.tamano_pr`: 40).

## Preguntas abiertas

> PA1, PA2 y PA3 cerradas por Carlos el 2026-11-12 al aprobar el spec: quitar «Pendiente de llegar»
> de la pestaña, renombrar las columnas a «Debe llegar» y «Falta», y ocultar los métodos en cero.
> Reflejado en R231, R235 y R239.

- **PA1** — El canvas no pinta la tarjeta «Pendiente de llegar» dentro de «Conciliación» (la cifra ya
  está en la tarjeta «Por entregar hoy» de arriba). R78 dice que las cifras no cambian, así que se
  conserva (R239). ¿La quitamos para ser fieles al canvas (D20: una cifra, un nombre)?
- **PA2** — El canvas titula las columnas «Debe llegar» y «Falta»; hoy son «Para la central» y
  «Falta por recibir». Se conservan (R78). ¿Las renombramos aquí o en otra ficha?
- **PA3** — El canvas omite Transferencia en «Lo que va a la central» (en su ejemplo vale cero). El
  spec pinta siempre los tres métodos, como hoy (R235). ¿Ocultamos los métodos en cero?
- **PA4** — La ficha va por ruta ligera, pero la pantalla muestra dinero (solo lo pinta; no calcula,
  congela ni asienta nada). Si el reviewer considera que «toca dinero», sube a completa.
