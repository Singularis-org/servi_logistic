# impl SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» — frontend_dev

Fecha: 2026-11-17. Rama `feature/SLT-193-botones-44-pwa-mensajero`, sobre el merge de SLT-190
«Recoger y Recolección según el canvas» (1d0034c1). Spec: `specs/SLT-193-botones-44-pwa-mensajero/requirements.md`
(R910-R921, R925-R929). T0, T1, T2, T3 y T5 hechas; T4 y T6 con el E2E verde en local, sin `./init.sh` (abajo).

## Archivos (respecto a 1d0034c1, es decir, sin contar SLT-190)

Producción (24, los del spec):
- `components/shared/texto-entero.ts` — `CLASE_INFO_TACTIL` (movida desde `PosOrderCardDetalle`) y `CLASE_INFO_TACTIL_MOVIL` (`max-md:`).
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx` — re-exporta la constante; (i) de la nota de ayuda a 44. El (i) flotante del chip NO se toca (R918).
- `.../pos-card/PosOrderCardMosaico.tsx` — `min-h-11` en «Ver detalle completo»; (i) del estado y de la nota.
- `.../pos-card/PosCardHeader.tsx`, `.../chat/ChatConversacion.tsx`, `.../chat/ChatOrdenesLista.tsx` (en el `span` que ya envolvía `InfoEstado`), `.../GestionarOrdenPanel.tsx`, `.../HojaParadaMapa.tsx` — `CLASE_INFO_TACTIL`.
- `components/private/cierres/fila/FilaGestion.tsx` — `CLASE_INFO_TACTIL_MOVIL` en los dos (i).
- `app/(app)/layout.tsx` (hamburguesa), `components/shared/InstalarPwaButton.tsx`, `AyudaBoton.tsx`, `TemaToggle.tsx`, `NotificationsBell.tsx` (+ `max-md:justify-center`), `app/_components/LogoutButton.tsx` — `TACTIL_MOVIL`.
- `app/(app)/_components/Sidebar.tsx` — `ITEM_MENU_TACTIL_MOVIL = "max-md:h-11"` en ítems, disparadores de submenú y subítems. `components/ui/*` sin tocar.
- `components/shared/EscanerModal.tsx` — `titulo` obligatorio; se borran la rama sin barra y la X del `Dialog` (`showCloseButton={false}` siempre).
- `.../EscanerGuiaReparto.tsx` (`titulo="Abrir orden por guía"` + `sinEncabezado`), `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx` («Recibir paquete»; tarjetas suelta y continua `sinEncabezado`), `app/(app)/ordenes/_components/OrdenesListado.tsx` («Recibir paquete»), `EscanerRecepcionBodegaCentral.tsx` y `EscanerRecepcionOrigen.tsx` (tarjetas suelta y continua `sinEncabezado`), `components/shared/RecibirPaquetesEntrada.tsx` (`titulo={RECIBIR_PAQUETES}`), `components/shared/BuscadorFiltros.tsx` (`titulo={ESCANEAR_CON_CAMARA}`; `CamaraDelBuscador` sin `CardHeader`).

Tests (15) + E2E (1) + config (1):
- nuevos: `tests/components/botones-44-pwa-mensajero.test.tsx`, `tests/unit/guards/escaner-un-solo-cierre.guardia.test.ts`, `e2e/pwa-mensajero-botones-44.spec.ts`.
- ampliados: `PageHeader`, `Sidebar`, `EstadoInfo`, `EscanerModal` (el caso R871 de SLT-190 sustituido por R925 parametrizado), `EscanerGuiaReparto`, `EscanerRecepcion`, `EscanerRecepcionOrigen` (R579 reescrito: el título vive en la barra), `EscanerRecepcionBodegaCentral`, `RecibirPaquetesEntrada`, `tests/unit/components/buscador-filtros-escaneo.test.tsx`.
- **fuera de la lista del spec** (3): `tests/components/EscaneoContinuo.test.tsx` (solo `titulo=`, lo exige el typecheck), `tests/components/NotificationsBell.test.tsx` (R911 «con y sin pendientes»: la píldora no sale en `PageHeader.test`), `playwright.config.ts` (registrar el spec en el proyecto `reparto`, lo exige `e2e-sin-saltos`).
- Total código + tests: 41 (24 + 15 + 1 + 1), más `requirements.md` (tasks marcadas) y estos `progress/`.

## Mapa R → test

| R | Test |
|---|---|
| R910 | `botones-44-pwa-mensajero.test.tsx` «R910/R921: el disparador mide 44…» · E2E (a) |
| R911 | `PageHeader.test.tsx` «R911: Instalar, Ayuda, Tema, Notificaciones y Salir…» · `NotificationsBell.test.tsx` «R911: sin / con pendientes» · E2E (b) (hamburguesa incluida) |
| R912 | E2E (b) `scrollWidth <= clientWidth` a 360 |
| R913 | `PageHeader.test.tsx` «R913: ninguna clase de alto o ancho mínimo sin `max-md:`…» · `NotificationsBell.test.tsx` «R913» · E2E (c) «Salir» 32 px a 1280 |
| R914 | `Sidebar.test.tsx` «R914: cada ítem… `max-md:h-11`» · E2E (b) menú abierto, submenús desplegados |
| R915 | `Sidebar.test.tsx` «R915: en escritorio siguen `h-8` / `h-7`» |
| R916 | `botones-44-pwa-mensajero.test.tsx` (tarjetas mosaico y completa, Detalle nota, y por disco chat, lista del chat, panel, hoja del mapa) · E2E (a) caja 16 × 16 y `elementFromPoint` a 20 px en las 4 direcciones |
| R917 | E2E (a) clic a 18 px del centro: abre «En reparto», sin «¿Gestionar esta orden?» |
| R918 | `botones-44-pwa-mensajero.test.tsx` «R918: el (i) que flota… sigue en 24 × 24» |
| R919 | `botones-44-pwa-mensajero.test.tsx` «R919: …variante con `max-md:`» · E2E (d) Cierre del día a 360 |
| R920 | `EstadoInfo.test.tsx` «SLT-193 · R920» (6 casos) |
| R921 | `PageHeader.test.tsx` «R921: los controles conservan su texto» · todos los casos buscan por rol y nombre de hoy (Sidebar, Mosaico, escáneres) |
| R925 | `EscanerModal.test.tsx` «R925/R926» × 3 disparadores · `EscanerGuiaReparto`, `EscanerRecepcion`, `RecibirPaquetesEntrada`, `buscador-filtros-escaneo` · E2E (e) |
| R926 | `EscanerModal.test.tsx` «R925/R926» (cierra y desmonta) · `RecibirPaquetesEntrada.test.tsx` «R926» · casos de refresco de siempre en verde |
| R927 | `EscanerGuiaReparto`, `EscanerRecepcion`, `EscanerRecepcionOrigen`, `EscanerRecepcionBodegaCentral`, `RecibirPaquetesEntrada`, `buscador-filtros-escaneo` (un solo `heading`, el de la barra; región con su nombre; botón de envío) |
| R928 | `escaner-un-solo-cierre.guardia.test.ts` + typecheck (`titulo` obligatorio) |
| R929 | `EscanerModal.test.tsx` «R929» × 3 · `buscador-filtros-escaneo` «R929» · `EscanerGuiaReparto` «R493» (R514 sigue en verde) |

R sin test: ninguno.

## Mutaciones (T1, T5)

- Quitar `className={CLASE_INFO_TACTIL}` de `HojaParadaMapa` → rojo `HojaParadaMapa.tsx: cada (i) lleva…`.
- Poner `[&_button]:after:-inset-3.5` en el envoltorio flotante de `EstadoConInfo` → rojo R918.
- `showCloseButton` en el `<EscanerModal` de `OrdenesListado` → rojo de la guardia.
- Quitar `titulo` de `RecibirPaquetesEntrada` → rojo de la guardia y 1 error de typecheck.
Las cuatro revertidas (sin `.orig` ni diff residual).

## Comandos (base desechable `servi_slt193_desechable`, `NODE_OPTIONS=--max-old-space-size=8192`)

- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0 (0 errores, 248 warnings; ninguno nuevo: el único en un archivo tocado, `GestionarOrdenPanel.tsx:73`, ya estaba).
- `vitest run` de los 15 archivos de test tocados → 15 archivos, 293 tests, todos verdes.
- `vitest related --run` de los 39 archivos de producción y tests → 297 archivos, 4375 passed, 26 skipped, 0 failed (exit 0).
- `pnpm run test:guardias` → 354/355 archivos verdes; rojo `dependencias-declaradas-presentes.guardia.test.ts` (4 casos: «init.sh ya no tiene el marcador FIN PASO 2»). Ajeno: `init.sh` no cambia respecto a `origin/dev`.
- `db:seed` + `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3193` → exit 0 y 0.
- `playwright test e2e/pwa-mensajero-botones-44.spec.ts --retries=0` (`E2E_PUERTO=3193`) → 5 passed.
- `playwright test` de `pwa-mensajero-reparto`, `pwa-mensajero-recoger-recoleccion`, `recepcion-satelite`, `mis-asignaciones` y `pwa-mensajero-cierre-dia` `--retries=0` → 21 passed. No hizo falta ajustarlos: buscan las tarjetas por su región, cuyo nombre no cambia.
- `./init.sh`: **no corrido** (usa la base del `.env`; queda para el leader con la desechable).

## Notas

- E2E (b): «Instalar» no sale en Chromium headless (no hay `beforeinstallprompt`) y se mide solo si aparece; lo cubre `PageHeader.test.tsx` con el hook doblado.
- E2E (a): el (i) se centra en la ventana antes de medir; arriba lo tapa la barra fija de la búsqueda (`sticky`, z-20), que es lo que pasaría también con el dedo.
- En Órdenes, si un rol monta las dos tarjetas a la vez (bodega central y tienda), las dos van sin encabezado bajo una sola barra; hoy los permisos no las juntan.

Veredicto: bloque A y bloque B hechos, con E2E y tests en verde; falta `./init.sh` del leader.
