# Review SLT-163 «PWA del mensajero: Reparto en el móvil»

Rebanada B del spec del conjunto SLT-156 «PWA de los mensajeros: tablas usables en el móvil»
(`specs/SLT-156-pwa-mensajero-tablas/`, R493, R495, R496, R500-R516 en Reparto). Ruta completa.
Diff revisado: `dev...feature/SLT-163-pwa-reparto-movil` (8 commits, hasta `c02622f8`).
Grafo: no lo usé (el worktree tiene la tanda sin indexar); exploré con Grep/Read.

## Checklist

- [x] Ruta completa con requirements/design/tasks del conjunto; aprobado por Carlos el 2026-11-14.
- [x] Tasks B1-B8 marcadas `[x]` en `tasks.md`.
- [x] Tamaño: `node scripts/tamano-pr.mjs` da 41/40 archivos, 1304/1000 prod y 1743/3000 tests, y
      sale como AVISO porque existe la marca `tamano-pr-aceptado` (Carlos: «Todo en un PR») en
      `progress/features/SLT-163.md`.
- [x] `design.md > Lo que ya existe` presente y no vacía. El diff reutiliza `BuscadorFiltros`,
      `EscanerModal`, `EscanerGuiaCard`, `VerificarGuiaGate`, `coincideBusqueda` y
      `useFiltroCantonDistrito`. `ConfirmarGestionDialog` se extrae de `GestionarOrdenCardButton`
      (B2) y no re-crea nada.
- [x] `progress/impl_SLT-163.md` trae el mapa R → test y las mutaciones (18 + 13 unitarias y 2 E2E).
- [~] Trazabilidad: cada R tiene su test. Faltan dos cosas: R493 no cubre el disparador del escáner
      (B2 abajo) y la protección 261/R12 tiene un camino nuevo sin test (B1).
- [x] Typecheck: `npx tsc --noEmit -p .` TSC=0.
- [x] Lint de los archivos del diff: 0 errores y 3 avisos (uno nuevo, m2).
- [x] Vitest de los 15 componentes tocados + `reparto-escaner` + `tests/unit/guards`: 265/266 archivos
      en verde. El único rojo es `dependencias-declaradas-presentes.guardia.test.ts` (4 casos), que
      está en `tests/baseline-rojos.json`: es deuda heredada, no un hallazgo.
- [x] Guardia m7 `pwa-mensajero-sin-recorte`: entran los 11 archivos de B con las reglas recorte,
      escala y oculta. `PosOrderCardDetalle`/`Mosaico` ya estaban desde A. `GestionarOrdenPanel`
      queda fuera; la exclusión está declarada.
- [x] m9/m10: ya corregidos en dev por SLT-165 «PWA del mensajero: Cierre del día en tarjetas».
- [x] `SidebarTrigger`: el E2E (c) comprueba `top ≤ 1` de la barra y que el trigger no cruza su caja
      (`elementFromPoint`).
- [x] E2E locales sobre base nueva (constan en la bitácora, tanda 3): reparto 10/10 y dinero 21/21.
      Este último se corrió porque cambió el fixture compartido. Yo no los repetí: no levanto servidor.
- [x] Sin dependencias nuevas, sin `db/`, sin secretos, sin literales de país o moneda en código
      ejecutable (solo `₡` en comentarios, m3), sin referencias a Ordenex.

## Lo pedido en concreto

- **Acción del servidor solo cuando toca:** se cumple. «Gestionar» + «Aceptar» de la tarjeta solo
  fija `ordenEnFocoId` (`RepartoModoFoco.test.tsx:163`, `escogerMock` sin llamar). «Confirmar guía»
  con la guía correcta llama a `escogerParaGestion({ordenId})` (`:200`). Con la guía incorrecta no
  llama (`:214`). «Volver a la lista» no llama a `escoger`, `liberar` ni `gestionar` (`:234-236`).
  El escáner de la lista llama a `escoger` solo tras aceptar el diálogo
  (`EscanerGuiaReparto.test.tsx:184/189`). Si una búsqueda tapa la orden escaneada, la salvaguarda
  R9/R10 de `porGestionarFiltrado` (`RepartoModule.tsx:300-319`) mete de nuevo la orden en gestión,
  así que el foco no cae en otra.
- **`verificacionAbierta` sin prop:** es correcto. El panel solo lo monta Reparto
  (`grep <GestionarOrdenPanel`) y la prop valdría siempre `true`.
- **`ordenPorGuia` con `conAyuda`:** es correcto y su mutación (M7a) sale en rojo
  (`reparto-escaner.test.ts`).
- **`EscanerModal` con children-función:** no rompe a sus otros consumidores (`RecogerPaqueteCard`,
  `RecoleccionModule`, `OrdenesListado`, `EscanerRecepcion`). Un `ReactNode` nunca es una función,
  así que `typeof children === "function"` no los afecta, y `EscanerModal.test.tsx` sale en verde.
  Abrir el modal sigue siendo solo un gesto del mensajero.
- **Textos del escáner que el spec no define** («Abrir orden por guía», «Escanea o ingresa…»,
  «Abrir orden»): están declarados y pendientes de que Carlos los vea en Preview (m4).
- **`sinElipsis` ignora el `sr-only`:** la exención exige a la vez `position: absolute`,
  `clientWidth ≤ 1` y `clientHeight ≤ 1`. Un dato visible recortado mide más de 1 px, así que no
  abre un hueco real.
- **Tests reescritos:** `VerificarGuiaGate`, `GestionarOrdenPanelIncidente` y
  `RepartoModule477Correccion` solo cambian «Gestionar» por «Confirmar guía» y quitan el clic del CTA,
  con las mismas aserciones. El test de `KpisMensajero` cambió de contrato (B3). El de
  `RepartoModule.test` 261/R12 sí quedó más débil (B1).

## Hallazgos

### BLOQUEANTE

- **B1. 261/R12: el escáner abre un camino nuevo hacia una orden reservada para otro día y ningún
  test lo cubre.**
  - Antes, el caso `RepartoModule.test.tsx` «R12: y por el panel tampoco» comprobaba la guarda
    `esParaManana` de `gestionarPedido`: dice el motivo (`AVISO_22`) y no fija el puntero.
  - Ahora afirma que «no hay camino» porque el botón de la tarjeta está apagado. Eso ya no es cierto:
    `EscanerGuiaReparto.tsx:66` (`if (orden.esParaManana) return rechazar(avisoReservaParaOtroDia(…))`)
    y la guarda de `escoger` (`RepartoModule.tsx:511-514`) son justo el camino que el escáner abre.
  - Ningún test escanea una reservada: `grep esParaManana` no da nada en
    `EscanerGuiaReparto.test.tsx`, `reparto-escaner.test.ts` ni en el E2E.
  - Si se quitan las dos guardas, la suite sigue en verde y el servidor devuelve `conflict`, que se
    traduce a «ya tienes otra orden activa». Es justo el mensaje falso del que avisaba el comentario
    original.
  - **Falta:** un caso en `EscanerGuiaReparto.test.tsx` en el que escanear o escribir la guía de una
    reservada avise con `avisoReservaParaOtroDia(...)`, no abra «¿Gestionar esta orden?» y no llame
    a `escoger`. Su mutación (quitar la línea 66) tiene que salir en rojo.
- **B2. R493: el «Escanear o escribir guía» de Reparto no mide 44 px.**
  - `design.md §4`, en la fila «Reparto | «Escanear o escribir guía» | 32 px | B», asigna este
    control a esta rebanada.
  - El disparador es el `Button` por defecto de `components/shared/EscanerModal.tsx:88` (sin
    `size="touch"`), y el E2E (b) no lo mide.
  - La bitácora lo declara aplazado a SLT-164, la rebanada C del mismo conjunto. Esa decisión no
    consta del leader ni de Carlos en `progress/features/SLT-163.md`, y `tasks.md` C no lo recoge.
  - **Falta una de dos:**
    - darle 44 px en Reparto (p. ej. una prop de tamaño en `EscanerModal`, para no tocar los demás
      consumidores) y medirlo en el E2E (b);
    - o registrar el aplazamiento como decisión en `progress/features/SLT-163.md` y moverlo a C en
      `tasks.md`.
- **B3. R492: el importe de los KPI puede partirse en líneas en el móvil, y la desviación no está
  declarada.**
  - R492 dice que «la guía y cada importe DEBEN ocupar una columna propia de ancho fijo que no se
    encoge **ni se parte en líneas**» (y DC10: «importes … en columna fija»).
  - El arreglo de la tanda 3 pone `wrap-anywhere` y `whitespace-normal` en la cifra
    (`KpisMensajero.tsx:18-21`), y `KpisMensajero.test.tsx` lo fija como contrato.
  - La cifra ya va sola en su fila (`col-span-2`), así que lo único que `wrap-anywhere` puede hacer
    es cortar el número por dentro (p. ej. «₡12.345.6 / 78,90»). El comentario de
    `KpisMensajero.tsx:12` dice que «salta de línea entera», y no es así.
  - Puede ser un compromiso razonable frente a R501, pero contradice un DEBE del spec aprobado sin
    que Carlos lo sepa.
  - **Falta una de dos:**
    - que el importe no se parta: `whitespace-nowrap` y un tamaño que quepa a 360 px con el importe
      más largo de `design.md §12`, medido en el E2E (a);
    - o registrar la desviación de R492 para los KPI con el OK de Carlos y corregir el comentario.

### menor

- **m1.** `RepartoModule.tsx:1020-1022`: el comentario «Feature 235 (R35): el hilo del mensajero…»
  quedó encima de `ConfirmarGestionDialog` y no de `HiloNotasAyudaModal`, que es a quien se refiere.
- **m2.** `tests/components/GestionarOrdenPanelIncidente.test.tsx:192`: el `user` ya no se usa (aviso
  nuevo de lint; `abrirGate` ya no lo recibe).
- **m3.** Hay `₡` en comentarios nuevos (`KpisMensajero.tsx:12` y `:94`). No es código ejecutable y
  ya hay precedente (`AsignacionDetalle.tsx:30`), pero un ejemplo neutro evita que la guardia de
  moneda tenga que distinguir.
- **m4.** Los textos de la tarjeta del escáner de Reparto no están en el spec (están declarados). Hay
  que confirmarlos con Carlos en Preview y, si cambian, anotarlos en el spec del conjunto.
- **m5.** La tarjeta compacta pinta `numRemision` como «guía» (R508), mientras el escáner y el foco
  comparan `numGuia`. Es la convención de las tarjetas POS y está declarada. Conviene que Carlos lo
  vea en Preview: si remisión y guía difieren, el mensajero no ve en la tarjeta el número que se le
  pide confirmar.
- **m6.** «Mostrar mapa» sigue en `xs`: según `design.md §4` es de la rebanada E. Está bien, solo
  queda anotado.

## Veredicto

**RECHAZADO**: tres bloqueantes (B1 test del camino reservada por el escáner; B2 R493 del disparador
del escáner; B3 R492 en los KPI). B1 se arregla con un test. B2 y B3 se arreglan en código o con la
decisión registrada.

## Vuelta 2 (acotada a a820c4d5..5715a4df)

Revisado solo el diff de la tanda 4 contra B1-B3 y m1-m3 de la vuelta 1, y sus regresiones.

### Checklist

- [x] **B1 (261/R12) cerrado.** `EscanerGuiaReparto.test.tsx` tiene dos casos nuevos:
  - Caso 1, por el escáner real: la guía 6211 (`esParaManana`, 2026-11-27) da el aviso de reserva. Se
    compara con un literal en regex, no con `avisoReservaParaOtroDia`, así que no es su propia fuente.
    No abre «¿Gestionar esta orden?», no abre el detalle y no llama a `escoger`. Si se quita la guarda
    de `EscanerGuiaReparto.tsx:60`, la orden llega a `onOrdenEncontrada`, se abre el diálogo y el caso
    cae.
  - Caso 2: la segunda guarda (`RepartoModule.tsx:516`, en `escoger`) se prueba con un doble que
    entrega la reservada saltándose el escáner. «Aceptar» lleva a `gestionarEscaneada` y de ahí a
    `escoger`, que la frena: hay aviso y no se llama al servidor.
  - El doble solo actúa con `simulacion.saltarGuardaDelEscaner = true`. `beforeEach` lo vuelve a
    `false` y, en ese caso, el mock devuelve el componente real con las mismas props. El resto del
    archivo prueba el escáner real; no queda vaciado.
- [x] **B2 (R493) cerrado.** `EscanerModal` tiene la prop opcional `tactil` (por defecto `false`), que
  pone `size="touch"` (`h-11`) y `w-full`. Solo la pasa `EscanerGuiaReparto`. Los otros cuatro usos
  (`RecogerPaqueteCard`, `OrdenesListado`, `EscanerRecepcion`, `RecoleccionModule`) no la pasan y
  siguen con `default`, y sus tests están en verde. Hay test de clases (`h-11`, `w-full`, sin `h-8`)
  y aserción `tactil` en el E2E (a).
- [x] **B3 (R492) cerrado.** `CIFRA_KPI` = `COLUMNA_FIJA text-sm md:text-2xl`: el importe va en una
  línea. `KpiValorAnimado` ya no recibe la clase que envolvía. El test fija literales (`shrink-0`,
  `whitespace-nowrap`, `tabular-nums`, `text-sm`, `md:text-2xl`) y prohíbe `wrap-anywhere`,
  `whitespace-normal`, `text-base`, `text-xl` y `truncate`. No importa `CIFRA_KPI` ni `COLUMNA_FIJA`,
  así que no compara contra su propia fuente. El desborde real lo mide `kpiQueNoCaben` en el E2E (a)
  a 360 y 414 px. `text-sm` es decisión del leader (bitácora).
- [x] **m1** cerrado: `ConfirmarGestionDialog` subió antes del bloque de comentarios del chat y del
  hilo, y «Feature 235» vuelve a quedar sobre `HiloNotasAyudaModal`.
- [x] **m2** cerrado: el `user` sin uso ya no está.
- [x] **m3** cerrado: no queda `₡` en `KpisMensajero.tsx`.
- [x] **Ejecutado por mí:**
  - vitest de los 8 archivos tocados o afectados (`EscanerGuiaReparto`, `KpisMensajero`,
    `GestionarOrdenPanelIncidente`, `EscanerModal`, `EscanerRecepcion`, `RecogerPaqueteCard`,
    `RecoleccionModule`, guardia `pwa-mensajero-sin-recorte`): 168/168.
  - Los 27 archivos que tocan `RepartoModule`, `KpisMensajero` o `CIFRA_KPI`: 725/725.
  - `tsc --noEmit` en verde y eslint de lo tocado con 0 errores.
- [x] **Tamaño:** pasa del máximo, con aceptación registrada.

### Hallazgos

- **menor (v2-m1).** El tamaño medido ahora es 1311/1000 líneas de producción y 1831/3000 de tests.
  La línea de aceptación cita 1304 y 1743. La diferencia es pequeña y viene de esta tanda, pero
  conviene actualizar las cifras de la nota de `progress/features/SLT-163.md` antes del PR.
- **menor (v2-m2, informativo).** eslint avisa de `EnviarPlantillaWhatsappButton` sin uso en
  `GestionarOrdenPanel.tsx:72`. Ya está en `origin/dev` (el uso está comentado allí también), así que
  no es de esta feature.
- Los menores m4-m6 de la vuelta 1 siguen como estaban: son para Preview con Carlos o de otra
  rebanada.
- No he ejecutado el E2E (lo corre el CI). Según la bitácora, reparto da 10/10 y dinero 21/21.

### Veredicto

**OK**: B1, B2 y B3 están cerrados, con tests que fallarían si se quitara el arreglo, y no hay
regresiones en lo que ya estaba OK.
