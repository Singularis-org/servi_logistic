# Review SLT-165 «PWA del mensajero: Cierre del día en tarjetas»

Rebanada D (R523-R538, tasks D1-D7) de `specs/SLT-156-pwa-mensajero-tablas/`. Ruta completa (spec del
conjunto SLT-156). Diff `origin/dev...5416c2e8`. Reviewer, 2026-11-14.

## Checklist

- [x] Ruta: completa (frontend / high). No toca dinero de servidor, permisos, auth ni webhooks.
- [x] Spec: requirements, design y tasks existen; `design.md > Lo que ya existe` presente y con contenido.
- [x] Tasks D1-D7 marcadas `[x]` (`tasks.md:131-166`).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 30/40 archivos, 683/1000 producción, 1062/3000 tests.
- [~] Trazabilidad: cada R523-R538 tiene test (mapa en `progress/impl_SLT-165.md:48-69`). Pero un test
  fija un incumplimiento de R491 (B1) y R493 no tiene test para pastillas, desplegable ni selector (B2).
- [x] Literales de clases y columnas escritos a mano en los tests (FilaGestion, DetalleCierre,
  Rechazos, ColaPropia, DetalleCierreGestiones): no se derivan de la fuente.
- [x] Tests viejos cambiados sin ablandar: el nombre accesible con contador
  (`/^Solicitar cierre del día \d+ gesti(?:ón|ones)$/`). Las ausencias por prefijo
  `/^Solicitar cierre del día/` no quedan verdes en vacío: en los mismos archivos hay tests positivos
  que fijan el rótulo, así que un renombre pone rojo al positivo. `--plantilla-fila` se lee de la
  variable y además se exige `gridTemplateColumns === ""`.
- [x] Typecheck: `pnpm run typecheck` → TC_EXIT=0 (lo corrí yo).
- [ ] Lint: no lo corrí; lo cubre el gate local del leader (INIT_EXIT=0).
- [x] Tests relacionados: 13 archivos, 395 tests, VT_EXIT=0. Son FilaGestion, GestionesCierreMovil,
  DetalleCierre, DetalleCierreGestiones, CierreRechazosDeTienda, CierreDiaColaPropia, CierreDiaModule,
  CierreDiaPagina, CierreBodegaDetalleGestiones, ColaCierres, la guardia sin-recorte,
  coincide-gestion y detalle-cierre-vista.
- [x] E2E de pantalla: constan en local (leader), con `pwa-mensajero-cierre-dia` 3/3,
  `pwa-mensajero-base` 4/4 y `cierre-bodega-satelite` 6/6. No los repetí, por instrucción.
- [x] Sin `organizacion_id`/RLS/migraciones (todo cliente). Sin literales de país o moneda en
  producción. Sin Ordenex, sin `console.log` y sin dependencias nuevas.
- [x] Comentarios explican el porqué.

## Condiciones heredadas (review de SLT-156 A)

- **m5 (guía de rechazados):** resuelto. Hay una sola rejilla con `max-content` para guía y fecha.
  La cabecera, la lista y las filas son `subgrid` (`RechazosDeTiendaCierre.tsx` `REJILLA_RECHAZOS`/`FILA_SUBGRID`), con test.
- **m6 (sin scroll lateral de «Gestiones» a 360 px):** resuelto bajo 768 px (tarjetas + panel sin
  `overflow` + `sinDesborde` a 360/414 en E2E). Pero el cambio a `lg:overflow-auto` abre B3 entre 768 y
  1023 px.
- **m7 (guardia ampliada):** hecho en parte. Se añadieron los archivos nuevos de D, la regla «oculta»
  y más prefijos de `title`, todo con autocomprobación. Falta aplicar «oculta» a los tres archivos
  de tarjetas de D que ya estaban en la lista (m1).
- **m9/m10 (`sinDesborde`):** correcto en el código: `revisados++` va tras la exención y se mide el
  borde izquierdo. Según la bitácora, el leader mató las dos mutaciones con Playwright.
- **Barra fija y `SidebarTrigger`:** el trigger es `relative md:hidden` en el flujo
  (`app/(app)/layout.tsx:173`). No es fijo y se va con el scroll, así que el `BuscadorFiltros fija`
  (`top-0`) no queda debajo. El E2E mide la barra a `y < 60` tras desplazar. La barra inferior es
  `fixed bottom-0 z-30` y no se cruza con él.
- **`scroll-padding-bottom` en `<html>`** (`DetalleCierre.tsx` `usePublicarAltoBarra`): solo se
  publica con marco página y en móvil. La limpieza quita la variable y el `scroll-padding-bottom` al
  desmontar y al dejar de ser móvil (`activa` en las dependencias). Lo prueba
  `DetalleCierre.test.tsx:621-638`. El marco página solo lo monta `CierreDiaModule`, en ramas
  excluyentes (en curso / rechazado-vencido), así que nunca hay dos instancias que se pisen. No
  queda rastro en otras páginas. Nadie más escribe `scroll-padding-bottom` en línea sobre `<html>`.

## Escritorio y otros roles

- **`sm` → `md` (640-767 px como móvil):** aceptado. Es DC1 (móvil = < 768 px, cualquier rol). Afecta
  al modal de admin y satélite en ese tramo, que pasa a pantalla completa con «Volver». Todos los
  llamadores del marco modal pasan `onCerrar` (`CierresAdminModule.tsx`, `DetalleCierreBodegaAbierto.tsx`,
  `CierreDiaModule.tsx`), así que quitar la X en móvil no deja a nadie sin salida. `max-w-lg` de
  `DialogContent` lo sustituye `max-w-none` (twMerge), y el ancho de 75 vw desde `md` se conserva.
- **Escala de 4 px en DetalleCierre:** aceptado. Son ±2 px en la franja, las pestañas y la
  cabecera, en todos los roles, sin cambiar la estructura. Lo exige R494.
- **Scroll del panel solo desde `lg`:** ver B3. El tramo de 768 a 1023 px de `/cierre-dia` pierde el
  scroll horizontal del panel. El marco modal (admin, satélite, «Ver») conserva `overflow-auto` y no
  cambia.

## Decisiones del implementer, calificadas

- **Desplegable de `DataTable` (~24 px) en la cola:** **incumple R493**. Es un control accionable de una
  fila de una pantalla del mensajero, y lo introduce D. Va en B2.
- **Paginación sin números en el móvil:** aceptado. R536 pide que quepa, no que haya números; queda
  «1-25 de 30» y «« ‹ › »». Con 44 px y `siblingCount=1` no cabían en 312 px.
- **«Recibido» y «Cobro» fuera de la tarjeta:** aceptado. Siguen en el detalle desplegado (tarjetas
  «Recibió el mensajero» y «Cobro»), y para «Recibido» lo dice `design.md §10`.
- **«Mensajero» fuera de la tarjeta:** **no aceptado**, ver B1.
- **En admin, el «Pago» en el sitio de la Ganancia:** aceptado. `pago` y `ganancia` son el mismo
  dato (`montoDeColumna`: `pagoMensajero`), y R523 dice «para cualquier audiencia».

## Hallazgos

- **B1 — BLOQUEANTE — R491: el mensajero de cada gestión desaparece en el móvil.**
  `components/private/cierres/fila/FilaGestion.tsx:120` (`mensajero: null` → `max-md:hidden`).
  - **Qué pasa:** en el detalle del cierre de bodega (`DetalleCierreBodegaAbierto.tsx:75`,
    `columnaMensajero`), satélite y central ven en el teléfono las gestiones de varios mensajeros
    sin saber de quién es cada una.
  - **Por qué no vale lo de `design.md §10`:** ni el detalle desplegado (R525: Orden, Producto,
    Dirección…) ni la cabecera del cierre de bodega dicen el mensajero de cada gestión. La
    justificación de §10 («el mensajero, en la cabecera del cierre de bodega») no se cumple.
  - **Qué requisito incumple:** R491 exige el mensajero de cada fila de gestión «en todos los anchos
    y para todas las audiencias». También DC10.
  - **El test fija el fallo:** `tests/components/FilaGestion.test.tsx:593` exige `max-md:hidden` en
    «mensajero».
  - **Qué falta:** darle un área en la tarjeta (por ejemplo, una línea bajo «guía · tienda»), cambiar
    ese test para que exija el área, y añadir el caso al E2E o a un test de componente con
    `columnaMensajero`.
- **B2 — BLOQUEANTE — R493: controles de D por debajo de 44 px en el móvil.**
  - **Las pastillas de resultado de «Gestiones»** miden 32 px (`h-8`, `components/shared/FilterComponent.tsx:885`).
    Se montan sin envoltorio táctil en `GestionesCierre.tsx:162`, y `design.md §4:112` las lista
    expresamente para D.
  - **El desplegable de cada fila de «Cierres solicitados»** mide unos 24 px
    (`components/shared/DataTable.tsx:543`, `p-1`). Lo activa D (`ColaCierres.tsx:337`).
  - **El selector «Elementos por página»** de la paginación de «Cierres solicitados» mide 32 px
    (`Pagination.tsx:347`, `h-8`). La clase `[&_button]` de `CierreDiaModule.tsx:627` no lo alcanza.
  - **Cómo arreglarlo sin tocar los compartidos:** un envoltorio con
    `max-md:[&_button]:min-h-11` (pastillas) o `max-md:[&_button[aria-expanded]]:size-11`
    (desplegable) en los archivos de D, y `max-md:[&_select]:h-11` en la paginación.
  - **Qué test falta:** uno por control con la clase escrita a mano, más `tactil()` en el E2E sobre
    una pastilla y el desplegable.
- **B3 — BLOQUEANTE — escritorio estrecho (768-1023 px) en `/cierre-dia`: la rejilla de «Gestiones»
  se recorta en vez de desplazarse.**
  `components/private/cierres/detalle/DetalleCierre.tsx:425` (`lg:overflow-auto` en marco página).
  - **Por qué ocurre:** antes, el `overflow-auto` del panel contenía el ancho mínimo de la rejilla
    de escritorio en todos los anchos. Ahora, por debajo de `lg`, el panel no tiene overflow, y
    `SidebarInset` es `overflow-x-clip` (`app/(app)/layout.tsx:171`). Lo que no cabe se corta sin
    scroll.
  - **La cuenta a 768 px:** con la barra lateral abierta (16 rem) y `p-6`, el contenido mide unos
    464 px. La rejilla del mensajero mide como mínimo unos 600 px: guía 70, resultado 110, dos
    importes `max-content`, acciones con «Devolver a gestión» y el chevron, 7 huecos y el relleno.
  - **Qué se pierde:** importes y acciones quedan fuera de la vista. Va contra R490 (texto escondido
    por overflow) y deja peor que antes el tramo de tableta.
  - **Medición:** es un cálculo; no medí en navegador porque no podía correr Playwright.
  - **Qué falta:** mantener el scroll horizontal del panel entre `md` y `lg` (por ejemplo,
    `md:overflow-x-auto lg:overflow-auto`; la barra fija arriba solo existe bajo `md`). Si el
    implementer cree que no desborda, tiene que medirlo: `sinDesborde` a 768 y 900 px con la barra
    lateral abierta y la gestión de textos largos.
- **m1 — menor — guardia `oculta` incompleta.** `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts:44-51`.
  `FilaGestion.tsx`, `RechazosDeTiendaCierre.tsx` y los segmentos `FilaSinGestion`/`SeccionSinGestion`
  de `cierre-factura.tsx` son las tarjetas de D y siguen solo con `["recorte", "escala"]`. Hoy no usan
  `overflow-hidden`, así que añadir «oculta» sale verde.
- **m2 — menor — `coincideGestion` repite `textoBuscable`/`coincideBusqueda`.**
  `components/private/cierres/fila/fila-gestion-vista.ts:162` frente a `app/(app)/mis-asignaciones/_components/mis-asignaciones-buscador.ts:47-77`,
  que es lo listado en «Lo que ya existe». No lo marco como bloqueante porque `design.md §10` prescribe
  `coincideGestion` por nombre, y R527 excluye el teléfono. Se podría reusar con `telefonoDest: null`.
- **m3 — menor — R528/R529 sin E2E con datos.** El escenario no crea rechazados ni órdenes sin gestión
  (lo declara la bitácora). Su forma de tarjeta solo la prueban las clases a mano de los tests de
  componente. Aceptado como en A (m3), anotado para cuando el fixture lo permita.

## Veredicto

**RECHAZADO**. Bloquean B1 (R491, el mensajero oculto en la tarjeta), B2 (R493, pastillas,
desplegable y selector de la cola por debajo de 44 px) y B3 (recorte de «Gestiones» entre 768 y
1023 px por quitar el scroll del panel). Los menores m1-m3 no bloquean.
