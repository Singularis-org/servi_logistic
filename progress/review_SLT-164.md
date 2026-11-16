# Review SLT-164 «PWA del mensajero: Recoger en bodega y Recolección»

Rebanada C del spec del conjunto SLT-156 «PWA de los mensajeros: tablas usables en el móvil». Ruta completa
(frontend / high). Revisado en `feature/SLT-164-pwa-recoger-recoleccion` @ 2bddeb94 contra `dev`.
Grafo no consultado: el worktree no estaba indexado; se exploró con Grep/Read.

## Checklist

- [x] Ruta: completa, con spec de tres archivos (`specs/SLT-156-pwa-mensajero-tablas/`).
- [x] `design.md > ## Lo que ya existe` presente y con contenido; el diff no re-crea nada de la lista
  (reusa `BuscadorFiltros`, `EscanerModal` + `ESCANER_LABEL_GUIA` + `tactil`, `filtrarAsignaciones`,
  `PosOrderCardDetalle compacta`, `VistaCardsToggle`, `CarruselCards`).
- [x] Tasks C1-C3 marcadas `[x]` en `tasks.md:114-127`.
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 14/40 archivos, 322/1000 prod, 627/3000 tests.
- [x] Trazabilidad: `progress/impl_SLT-164.md > R → test` cubre R490, R492, R493, R495, R500, R501, R506,
  R516-R522; cada test existe y prueba lo que dice (ver abajo). Ninguno compara contra su propia fuente:
  placeholder, vacíos, conteos y mensaje de R522 van como literales del spec.
- [ ] Ningún negativo siempre verde introducido por el diff → **B1**.
- [x] Typecheck: `pnpm run typecheck` verde.
- [x] Lint de los archivos tocados: 0 errores; 1 aviso ya en `dev` (`ContactoButtons` sin uso).
- [x] Tests relacionados (RecogerModule, RecogerModuleRefrescoAlVolver, RecogerPaqueteCard,
  RecoleccionModule, RecoleccionPage, RepartoModule, EscanerModal, guardia `pwa-mensajero-sin-recorte`):
  8 archivos, 331/331 verdes, corridos por mí (sin base).
- [x] Guardia m7: los 5 archivos de producción de C entran en `ARCHIVOS_PWA_MENSAJERO`
  (`tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts:95-100`).
- [x] E2E de flujo crítico (asignación: `mis-asignaciones`, `asignacion-satelite`): constancia en la
  bitácora, reparto 13/13 y dinero 9/9 sobre base nueva. No los re-corrí (sin servidor, por consigna).
- [x] Sin tablas, queries, migraciones, dependencias, secretos, literales de país/moneda ni Ordenex.
- [x] Comentarios explican el porqué.

## Verificación de lo pedido

- **R501 / R490 (nada se recorta):** el E2E (a) y (b) corre `sinDesborde` y `sinElipsis` en Mosaico y en
  Detalle desplegado, con los textos más largos, a 360 y 414 px; la mutación `truncate` en
  `RecolectadasHoyLista` lo pone en rojo (bitácora). Correcto.
- **R492 (importes en una línea):** `importesEnUnaLinea` (`e2e/pwa-mensajero-recoger-recoleccion.spec.ts:116`)
  exige al menos un importe largo visible antes de afirmar que ninguno se parte: no sale verde vacío.
- **R493 (44 px):** unidad (`h-11`, `w-full`, `min-h-11`) y E2E con `tactil()` medido en el navegador,
  más el ancho del disparador igual al de la barra (±1 px).
- **R522 (escáner de Recolección):** el disparador sigue llamando a `recolectar` solo desde
  `leerGuia` → `useRecolectarPorGuia` (`RecoleccionModule.tsx:169-190`), sin otra vía; la búsqueda no
  restringe el escáner. El E2E (b) recolecta por el servicio real y ve el mensaje y el paso a «Recogidos».
  En Recoger, `RecogerPaqueteCard` recibe `porRecoger` completo, no el filtrado (`RecogerModule.tsx:304-308`).
- **Desviaciones declaradas:**
  - Barra de Recoger hija de la sección «Recoger en bodega»: la sección contiene pestañas y lista hasta
    el final, así que `sticky` acompaña igual; el test afirma que el padre de la barra contiene la lista
    (`tests/components/RecogerModule.test.tsx:142-145`). Aceptada.
  - Conmutador en la fila de pestañas (`RecogerModule.tsx:145-158`): R518 no lo ubica y `flex-wrap` lo baja
    a 360 px; el E2E mide sin desborde. Aceptada.
  - Mismo vacío de búsqueda en las dos listas de Recolección: es lo que dicen R521 y `design.md §9`
    (un texto para Recolección). Aceptada; ver m4.
  - Hora dentro del despliegue en Detalle (`RecolectadasHoyLista.tsx:500-501`): coherente con R508
    (lo secundario va al despliegue) y no es recorte. Aceptada; ver m4.
  - Placeholder en constante nueva y Reparto con su literal (`RepartoModule.tsx:143`): mismo texto, se
    evita el cruce con SLT-166 «PWA del mensajero: mapa de ruta». Aceptada; ver m3.

## Hallazgos

### B1 — BLOQUEANTE · el negativo del «Corte» de Reparto quedó siempre verde por este diff

- `tests/components/RepartoModule.test.tsx:242-243` (`accesoRecogida` busca el botón «Recoger paquete»)
  y su uso en `:411` («Corte: Reparto monta SU apartado y ninguna superficie de recogida»).
- Este diff renombra el disparador de `RecogerPaqueteCard` a «Escanear o escribir guía»
  (`RecogerPaqueteCard.tsx:79`). Ya no existe en la app ningún botón «Recoger paquete»
  (grep en `app/` y `components/`), así que la aserción no puede fallar. La otra ausencia del mismo
  caso (`region «Recoger por número de guía o escaneo»`, `:412-414`) solo existe con el diálogo abierto,
  y el test no lo abre: también es inerte. Lo único vivo del caso es la región «Por recoger».
- Consecuencia: si un merge vuelve a montar `RecogerPaqueteCard` en Reparto (lo que protege la decisión
  del humano del 2026-07-31), la suite sigue verde.
- No se puede arreglar cambiando solo el nombre: Reparto tiene su propio «Escanear o escribir guía»
  (`EscanerGuiaReparto`).
- **Falta:** que el caso pueda fallar de nuevo, por ejemplo:
  - afirmar que hay exactamente UN botón «Escanear o escribir guía» y que, al abrirlo, el diálogo no
    trae la tarjeta «Recoger paquete» ni la región «Recoger por número de guía o escaneo»;
  - o cualquier otra forma que identifique la superficie de recogida y no la de Reparto.
- **Mutación que tiene que salir en rojo:** montar `<RecogerPaqueteCard porRecoger={…} />` en
  `RepartoModule.tsx`. Es un cambio de 2-6 líneas en el helper y en el caso; el cruce con SLT-166 es
  mínimo.

### Menores

- **m1** · `tests/components/RecogerModule.test.tsx:204` y `tests/components/RecoleccionModule.test.tsx:423`:
  `queryByRole("button", { name: /^Gestionar/ })` es un negativo vacío (Recoger y Recolección nunca han
  tenido «Gestionar»). Lo sustantivo del caso R517 (Mosaico, fila compacta `expanded=false`) sí es real.
  Sobra o debería afirmar algo que pueda aparecer.
- **m2** · `components/shared/EscanerModal.tsx:36`: el comentario pone «Recoger paquete» y «Recolectar en
  tienda» como ejemplos de label propio por pantalla; tras este diff ninguna pantalla los usa como label.
  Comentario desfasado.
- **m3** · `app/(app)/mis-asignaciones/_components/RepartoModule.tsx:143`: el literal del placeholder
  duplica `BUSCADOR_GUIAS_PLACEHOLDER` (`mis-asignaciones-buscador.ts:15`). Aceptado por el cruce con
  SLT-166; anotar como deuda para unificarlo cuando SLT-166 mergee.
- **m4** · Para Preview con Carlos: el vacío «Ninguna guía por recolectar…» en «Recogidos en tienda hoy»
  (`RecolectadasHoyLista.tsx:464-465`) y la hora «Recogido a las…» solo en el despliegue en Detalle
  (`RecolectadasHoyLista.tsx:500-501`). Los dos cumplen el spec; los dos son de los que se aprueban viendo.
- **m5** · `tests/components/RecoleccionModule.test.tsx:432`: el caso R522 teclea la guía 1001, que no
  está en `DOS_POR_RECOLECTAR` (2001/2002). Pasa porque el servidor está simulado y la pertenencia la
  decide el servidor. No invalida R522 (lo cubre el E2E (b) con una guía real), pero confunde al leerlo.
- **m6** · `app/(app)/recoleccion/_components/RecoleccionModule.tsx:7`: `ContactoButtons` importado y sin
  uso. Ya estaba en `dev`; no es de esta tanda.
- **m7** · `playwright.config.ts`: SLT-166 también añade su spec al proyecto `reparto`. Puede chocar en el
  merge (declarado en la bitácora).

## Veredicto

**RECHAZADO** · por B1. Todo lo demás está bien. Para la vuelta 2, revisaré solo el arreglo de
`tests/components/RepartoModule.test.tsx` y su mutación.

## Vuelta 2 (acotada a 2029dccc..c6238b0a)

### Checklist

- [x] **B1 cerrado.** `disparadoresEscaneo()` cuenta los «Escanear o escribir guía» (exactamente 1), abre
  el único y exige que su diálogo no traiga la región «Recoger por número de guía o escaneo» ni el texto
  «Recoger paquete» (`tests/components/RepartoModule.test.tsx:241-243, 401-420`). Mutaciones corridas por
  mí, revertidas después (`git status` limpio):
  - B1a: `<RecogerPaqueteCard porRecoger={[]} onRecogida={() => {}} />` junto al escáner, antes de
    `{kpis}` → **rojo**, por la razón buena: `expected [...] to have a length of 1 but got 2`.
  - B1b: `RecogerPaqueteCard` en el sitio de `EscanerGuiaReparto` → **rojo** (el caso falla).
  - Sin mutación → verde. El caso vuelve a proteger la decisión del 2026-07-31.
- [x] **m1:** sobran los dos `queryByRole(/^Gestionar/)` vacíos y el título ya no dice «sin acciones».
  La parte que vale del R517 (Mosaico y la fila compacta `expanded=false`) se queda.
- [x] **m2:** el comentario de `EscanerModal.tsx` ya explica cómo se nombra hoy: las pantallas del
  mensajero usan `ESCANER_LABEL_GUIA` y la tarjeta de dentro nombra el acto.
- [x] **m5:** el R522 escribe la 2001, que está en `DOS_POR_RECOLECTAR`, y ahora afirma
  `toHaveBeenCalledWith({ numGuia: 2001 })`. Antes solo contaba las llamadas.
- [x] **m6:** se quitó el import `ContactoButtons`, que no se usaba (tsc verde).
- [x] **Sin regresiones:** los tres archivos de componente (Reparto, Recoger, Recolección) dan
  241/241 en verde y `tsc --noEmit` también. Lint de los archivos tocados: 0 errores y 1 aviso
  (`ordenCardsEnReparto` sin usar, `RepartoModule.test.tsx:161`), que ya estaba en 2029dccc.
  `tamano-pr`: 16/40 archivos, 329/1000 líneas de producción y 647/3000 de tests.
- [x] Guardias (`pnpm run test:guardias`): 351/352 en verde. El único rojo es
  `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json` y que
  este diff no toca. No es un hallazgo.

### Hallazgos

- Ninguno nuevo. m3, m4 y m7 siguen como en la vuelta 1: aceptados o para Preview.

### Veredicto

**OK**
