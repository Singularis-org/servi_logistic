# SLT-125 — geo-jerarquica-exportes · tasks.md

> Requisitos: `requirements.md` (R1–R44). Diseño: `design.md`. `[P]` = se puede hacer en paralelo con
> las demás `[P]` de su tanda.
>
> Cada tanda cierra con `./init.sh` en verde. Si el gate local muere por memoria, se cierra con
> typecheck y guardias, y el gate completo corre en CI.
>
> P1–P6, A3, A3b y «2 niveles más hondos» están decididas (2026-11-12, «Decisiones cerradas»).
> Queda abierta P7 (la orden de CR sin distrito en tarjetas, chat y PDF). Solo afecta al cuerpo de
> `dosMasHondos` y sus tests (T2.1, T2.6 y T3.4); hasta que se responda se usa la opción a.
>
> Reparto por capa (`docs/perfil-agentes.md > implementer`):
> - `backend_dev`: T1 y T2;
> - `frontend_dev`: T3 y T4;
> - el leader arma T0 y lleva T5; una persona hace T5.1.
>
> Tandas: **T0** maqueta → **T1** preparación → **T2** servidor → **T3** pantallas → **T4** E2E →
> **T5** cierre (persona, CI y reviewer).

## T0 — Maqueta (leader + humano) · bloquea T3

- [x] **T0.1** El leader arma la maqueta (`/design`) en un país de 2, 3 (Costa Rica), 4 y 10 niveles.
  Cubre:
  - la tabla de `/ordenes` y de satélite con una columna por nivel (P4);
  - el detalle de asignación con P campos, en el ancho de un teléfono, con los de nivel 4 o más en
    «—» (P1);
  - las tarjetas POS (mosaico, detalle y navegación) y la de satélite, con los 2 niveles más hondos de
    la ruta de la orden (país de 4 niveles: comuna · barrio);
  - el detalle de satélite, el de cierre de día y el de cierres admin;
  - `/paquete` y la etiqueta con una ruta de 10 niveles;
  - el selector de variables de plantilla, con `{{ubicacion}}` y `{{nivel_1}}`…`{{nivel_P}}` rotulados
    (P2).

  **Hecho:** la maqueta está en el repo o enlazada desde `progress/impl_SLT-125.md`.
- [x] **T0.2** El humano aprueba la maqueta.
  **Hecho:** fecha, referencia y quién aprobó, anotados en `progress/impl_SLT-125.md` (R36).

## T1 — Preparación (backend_dev) · sin dependencias de código

- [x] **T1.1** Inventario antes de tocar código. Anotar en `progress/impl_SLT-125.md`:
  - cada lectura que nombra lugares con las relaciones `provincia`, `canton` o `distrito`, con su
    archivo y línea; se parte de la tabla de design §4.2;
  - confirmar que ningún test afirma la forma de esos `select` o `include`, como se midió en design
    §13.1 (A6 retirada); si aparece alguno, se para y se pregunta;
  - si `orden` llega a `organizacion.pais.nombre` (design §4.5);
  - los llamadores de `columnasDescarga*`, `geografiaLegible`, `ubicacion(…)` y
    `construirQueryDireccion`;
  - el `pais.nombre` de `CR` en las semillas y migraciones.

  **Hecho:** la lista está anotada. Cada archivo nuevo que aparezca se añade a «Archivos esperados», y
  cada aserción nueva que cambie se pregunta antes de seguir.
- [x] **T1.2** Referencia de las descargas de Costa Rica, **antes de cualquier cambio de código**
  (design §7):
  - `tests/fixtures/descargas-cr/entrada.ts`;
  - `scripts/capturar-referencia-descargas.ts`;
  - `tests/fixtures/descargas-cr/referencia.json` generado con el código de hoy.

  **Hecho:** el commit de la referencia va antes del primer commit de `lib/` o `app/`. El hash queda en
  `progress/impl_SLT-125.md`.
- [x] **T1.3** [P] Fixture `tests/integration/db/_fixtures/geo-125.ts` (design §13).
  **Hecho:** lo importa un test vacío que pasa con `HAY_BASE_DE_DATOS`.

## T2 — Servidor (backend_dev) · depende de T1

- [x] **T2.1** Núcleo puro: `lib/utils/ubicacion-presentacion.ts` y `cabeceraNormalizada` en
  `plantilla-geo.ts`. En `ruta-del-lugar.ts`: `rutaConTipos` y `nivelesDelCatalogo`; `rutaDelLugar`
  sigue con `lugarDeLaOrden` (P1). Tests: `ubicacion-presentacion.test.ts`, `geo-columnas-n-niveles.test.ts` (la
  parte pura).
  **Hecho:** R1–R3, R7 y R11 en verde en unit, con países de 2, 3, 4 y 10 niveles.
- [x] **T2.2** Snapshot:
  - `lib/types/ubicacion-snapshot.ts` (esquema v1 y `leerUbicacionCongelada`);
  - la escritura en `CierreDiaRepository` (`congeladoDeLaFila`, `crearCierre`);
  - la lectura en `CierresAdminRepository`.

  Tests: `ubicacion-snapshot.test.ts`, `geo-125-cierre-snapshot.test.ts`.
  **Hecho:** R21–R25 en verde; `geo-backfill.test.ts` y `geo-sincronia-orden-zonas.test.ts` sin cambios
  (A1, A2). Si alguno tuviera que cambiar, se para y se pregunta.
- [x] **T2.3** Lecturas con ruta del catálogo (design §4.2): `OrdenRepository` (listado, satélite,
  etiqueta, mis-asignaciones), `GestionOrdenRepository`, `CierreDiaRepository` (en vivo),
  `OrdenEnvioReader`, `InformeTransitoRepository` y `CoberturaRepository` (P5). Más sus interfaces y DTO
  (`lugarRuta`), y los servicios que los pasan. Tests: `geo-125-nombres-catalogo.test.ts`,
  `ruta-sin-consulta-por-fila.test.ts` y la guardia `presentacion-lugar-del-catalogo`.
  **Hecho:**
  - R16–R20, R37, R40 y R41 en verde;
  - las suites existentes sin cambiar aserciones: solo cambian sus filas simuladas de entrada;
  - la latencia del listado de `/ordenes` (50 filas, CR) antes y después, anotada.
- [x] **T2.4** [P] Geocodificación: `direccion-query.ts`, `OrdenGeocodeRepository` (+ su interfaz),
  `GeocodificacionService`, `geocodificacion-encolado.ts` y `scripts/demo-qa/ubicar-y-cerrar-jobs.ts`.
  Tests: `direccion-query.test.ts` (ampliado), `geocodificacion-service.test.ts` (solo la entrada
  `ORDEN`) y
  `geo-125-geocode-cache.test.ts`.
  **Hecho:** R32 y R33 en verde; la cadena y la huella de CR, literales, sin cambio.
- [x] **T2.5** [P] WhatsApp en el servidor:
  - `plantilla-datos.ts`: `lugarRuta`, `nivel_1..10` con el atributo `nivel`, `ubicacion` en formato
    postal (P3) y `DATOS_PLANTILLA_EJEMPLO` con 3 niveles, con `nivel_4..10` sin ejemplo (A3b,
    design §4.6);
  - `whatsapp-envio-valores.ts` y `tests/fixtures/plantilla-datos.ts`.

  Tests: `plantilla-niveles.test.ts`; en `plantilla-datos.test.ts`, solo A3 (`:235–237`) y A3b
  (`:40` y `:248`, sin `nivel_4..10`).
  **Hecho:**
  - R28, R29 y R31 en verde;
  - `{{ubicacion}}` resuelve a «Carmen, San José, San José» con los datos de ejemplo;
  - sin cambios: `preview-mismo-motor.test.ts`, `campos-ocultos-siguen-resolviendo.test.ts` y
    `catalogo-de-variables.test.ts`.
- [x] **T2.6** [P] PDF de tránsito: `transito/pdf.ts`. El título sale de `tiposDeDosMasHondos`, los
  tipos de los 2 niveles más hondos de la ruta de una orden (país de 4: «COMUNA · BARRIO»). Las
  celdas, de `dosMasHondos` (P7: opción a mientras no se responda).
  Test: `transito-pdf-niveles.test.ts`.
  **Hecho:** R13 y R15 (parte del PDF) en verde; en CR, «CANTÓN · DISTRITO» literal.
- [x] **T2.7** [P] Scripts de evidencia:
  - `scripts/geo-equivalencia-presentacion.ts` con `scripts/geo-equivalencia/geocode-de-hoy.ts`;
  - `scripts/comparar-descargas.ts`;
  - las entradas en `package.json`.

  Test: `geo-equivalencia-presentacion.test.ts`.
  **Hecho:** R34 en verde en la base local; sale con 0 sobre el fixture de CR.

## T3 — Pantallas (frontend_dev) · depende de T0.2 y T2

- [x] **T3.1** [P] Descargas por columnas: órdenes, satélite y cobertura, con sus llamadores
  (`OrdenesModule.tsx`, `SateliteOrdenesListado.tsx`, `DescargarCoberturaButton.tsx`). Tests:
  `geo-columnas-n-niveles.test.ts`, `cobertura-n-niveles.test.ts` y `equivalencia-descargas-cr.test.ts`.
  **Hecho:** R1–R4 y R6 en verde; la referencia de T1.2 sin regenerar.
- [x] **T3.2** [P] «Ubicación» de una línea:
  - descargas de novedades, ayuda, cierre de día y cierres admin;
  - pantallas de cierre de día, cierres admin y detalle de satélite;
  - la etiqueta (PDF y vista previa) y `/paquete`.

  Tests: `ubicacion-n-niveles.test.ts`, `ubicacion-pantallas-n-niveles.test.tsx`,
  `etiqueta-geografia-n-niveles.test.ts`, `paquete-ubicacion.test.tsx` y `cierres-snapshot-lectura.test.ts`.
  **Hecho:**
  - R7–R10, R24–R26 en verde;
  - los tests de capacidad de la etiqueta en verde con 10 niveles (design §5).
- [x] **T3.3** [P] Tabla de `/ordenes` y de satélite por niveles (`ordenes-columns.tsx`, P4). Test:
  `ordenes-columns-niveles.test.tsx`.
  **Hecho:** R5 en verde; las suites de `ordenes-columns` sin cambios.
- [x] **T3.4** [P] Tarjetas y detalle:
  - POS (`pos-format.ts`, `PosOrderCardMosaico.tsx`, `PosOrderCardDetalle.tsx`, `PosNavBlock.tsx`);
  - `SateliteOrderCard.tsx`, `chat-format.ts`, `AsignacionDetalle.tsx` y `novedad-a-orden-card.ts`.

  Tests: `pos-satelite-chat-niveles.test.tsx`, `AsignacionDetalle-niveles.test.tsx` y
  `pos-format-destino.test.ts`.
  **Hecho:** R11, R12, R14 y R15 en verde, igual que la maqueta aprobada; `e2e/mis-asignaciones.spec.ts`
  en verde.
- [x] **T3.5** [P] Editor de plantillas: `CampoVariablePicker.tsx` ofrece `ubicacion` y
  `nivel_1..P` rotulados con los tipos del país (P2). Test: `CampoVariablePicker-niveles.test.tsx`
  (con un país de 2 y de 4 niveles: ofrece 2 o 4 `nivel_k`, con su rótulo; nunca `nivel_k` > P).
  **Hecho:** R30 en verde; `CampoVariablePicker.test.tsx` y `catalogo-de-variables.test.ts` en verde
  sin editarlos (A4).
- [x] **T3.6** Guardias ampliadas a los archivos nuevos, sin excepciones: `etiquetas-geograficas-sin-literal`,
  `geografia-sin-cte-recursiva` y `geografia-lecturas-sin-nodo-fk` (P1 = B).
  **Hecho:** R19 y R42 en verde, cada guardia con su contraprueba.

## T4 — E2E nuevo (frontend_dev) · depende de T3

- [x] **T4.1** `e2e/geo-presentacion-4-niveles.spec.ts` (design §10). En una empresa de un país de 4
  niveles, con órdenes en el nivel 3:
  - la descarga de órdenes con 4 cabeceras de lugar y la cuarta celda vacía;
  - la etiqueta con una ruta de 3 niveles;
  - el cierre con la «Ubicación» y el `ubicacion_snapshot` de 3 niveles.

  **Hecho:** R43 en verde en local con `pnpm exec playwright test e2e/geo-presentacion-4-niveles.spec.ts`.

## T5 — Cierre (leader + persona) · depende de todo

- [ ] **T5.1** Una persona, sobre la copia de producción (R35):
  - corre `geo:equivalencia-presentacion`;
  - baja las 7 descargas de una empresa de CR con `dev` y con esta rama, y las compara con
    `scripts/comparar-descargas.ts`.

  **Hecho:** las cifras están en `progress/impl_SLT-125.md`: 0 nombres distintos, 0 consultas de
  geocodificación distintas y 0 celdas distintas. Si algo sale distinto, se para y se pregunta.
- [ ] **T5.2** Gate completo en CI (`gate-completo` en verde), con estos E2E:
  - `cierre-dia`, `cierres-admin`, `etiquetas-lote-tienda` y `rastreo-publico`;
  - `mis-asignaciones`, `recepcion-satelite` y `asignacion-satelite`;
  - `dos-empresas-humo`, `geo-filtro-lugar` y `geo-presentacion-4-niveles`.

  **Hecho:** R38 en verde; el mapa `R<n> → test` completo en `progress/impl_SLT-125.md`.
- [ ] **T5.3** Reviewer:
  - diff de `tests/` contra design §13.1;
  - diff de `db/` vacío (R39);
  - nada de SLT-47 ni de SLT-48 en el diff (R44);
  - la referencia de T1.2 commiteada antes del código y sin regenerar;
  - `docs/architecture.md` al día (snapshot escrito por la app y lecturas de presentación sobre el
    catálogo).

  **Hecho:** veredicto OK en `progress/review_SLT-125.md`.

## Archivos esperados

Estimación: **113 archivos** (recontada el 2026-11-12, tras P1–P6):
- 72 de código, scripts, config y docs, 6 de ellos nuevos;
- 41 de tests: 27 nuevos, incluidos el E2E y los fixtures, y 14 ajustados.

`CampoVariablePicker.test.tsx` sale de la lista: con A4 no se edita.

**Unas 4.800 líneas** cambiadas: unas 2.300 de código y scripts, y unas 2.500 de tests. Está dentro de
los ~95–115 aceptados por el humano (decisión «Tamaño»; marca `tamano-pr-aceptado` en
`progress/features/SLT-125.md`), pero en el borde: si T1.1 encuentra más, se anotan aquí y se avisa
al humano antes de seguir.

Servidor y dominio:
- `lib/utils/ubicacion-presentacion.ts` (nuevo)
- `lib/utils/plantilla-geo.ts`
- `lib/repositories/_shared/ruta-del-lugar.ts`
- `lib/types/ubicacion-snapshot.ts` (nuevo)
- `lib/types/geografia-nodo.ts`
- `lib/types/orden.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/services/IRecepcionSateliteService.ts`
- `lib/services/RecepcionSateliteService.ts`
- `lib/types/etiqueta-guia.ts`
- `lib/services/EtiquetaGuiaService.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/services/CierreDiaService.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/repositories/GestionOrdenRepository.ts`
- `lib/interfaces/repositories/IGestionOrdenRepository.ts`
- `lib/types/novedad.ts`
- `lib/services/NovedadesService.ts`
- `lib/interfaces/services/IMisAsignacionesService.ts`
- `lib/services/MisAsignacionesService.ts`
- `lib/repositories/OrdenEnvioReader.ts`
- `lib/utils/whatsapp-envio-valores.ts`
- `lib/types/plantilla-datos.ts`
- `lib/geo/direccion-query.ts`
- `lib/interfaces/repositories/IOrdenGeocodeRepository.ts`
- `lib/repositories/OrdenGeocodeRepository.ts`
- `lib/services/GeocodificacionService.ts`
- `lib/services/jobs/geocodificacion-encolado.ts`
- `lib/repositories/InformeTransitoRepository.ts`
- `lib/whatsapp-envios/informes/transito/pdf.ts`
- `lib/pdf/etiquetas-dibujo.ts`
- `lib/pdf/etiquetas-pdf-lote.ts`
- `lib/repositories/CoberturaRepository.ts`
- `lib/types/cobertura.ts`
- `lib/utils/cobertura-distrito.ts`

Cliente:
- `app/(app)/ordenes/_components/ordenes-descarga-columnas.ts`
- `app/(app)/ordenes/_components/ordenes-columns.tsx`
- `app/(app)/ordenes/_components/OrdenesModule.tsx`
- `app/(app)/ordenes/_components/EtiquetaGuia.tsx`
- `app/(app)/recepcion-satelite/_components/satelite-descarga-columnas.ts`
- `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx`
- `app/(app)/recepcion-satelite/_components/SateliteOrderCard.tsx`
- `app/(app)/recepcion-satelite/_components/RecepcionDetalle.tsx`
- `app/(app)/configuracion/zonas/_components/cobertura-descarga-columnas.ts`
- `app/(app)/configuracion/zonas/_components/DescargarCoberturaButton.tsx`
- `app/(app)/novedades/_components/novedades-descarga-columnas.ts`
- `app/(app)/novedades/_components/ayuda-descarga-columnas.ts`
- `app/(app)/novedades/_components/novedad-a-orden-card.ts`
- `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`
- `app/paquete/[numGuia]/page.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/pos-format.ts`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/PosNavBlock.tsx`
- `app/(app)/mis-asignaciones/_components/chat/chat-format.ts`
- `app/(app)/mis-asignaciones/_components/AsignacionDetalle.tsx`
- `app/(app)/configuracion/plantillas/_components/CampoVariablePicker.tsx`

Scripts, config y docs:
- `scripts/geo-equivalencia-presentacion.ts` (nuevo)
- `scripts/geo-equivalencia/geocode-de-hoy.ts` (nuevo)
- `scripts/comparar-descargas.ts` (nuevo)
- `scripts/capturar-referencia-descargas.ts` (nuevo)
- `scripts/demo-qa/ubicar-y-cerrar-jobs.ts`
- `package.json`
- `docs/architecture.md`

Tests nuevos:
- `tests/fixtures/descargas-cr/entrada.ts`
- `tests/fixtures/descargas-cr/referencia.json`
- `tests/integration/db/_fixtures/geo-125.ts`
- `tests/integration/db/geo-125-fixture.test.ts` (añadido en T1.1/T1.3: el test que importa el fixture)
- `tests/unit/utils/ubicacion-presentacion.test.ts`
- `tests/unit/descarga/geo-columnas-n-niveles.test.ts`
- `tests/unit/descarga/equivalencia-descargas-cr.test.ts`
- `tests/unit/descarga/cobertura-n-niveles.test.ts`
- `tests/unit/descarga/ubicacion-n-niveles.test.ts`
- `tests/unit/descarga/cierres-snapshot-lectura.test.ts`
- `tests/unit/components/ordenes-columns-niveles.test.tsx`
- `tests/components/ubicacion-pantallas-n-niveles.test.tsx`
- `tests/unit/pdf/etiqueta-geografia-n-niveles.test.ts`
- `tests/components/paquete-ubicacion.test.tsx`
- `tests/components/pos-satelite-chat-niveles.test.tsx`
- `tests/components/AsignacionDetalle-niveles.test.tsx`
- `tests/unit/whatsapp-envios/transito-pdf-niveles.test.ts`
- `tests/unit/mis-asignaciones/pos-format-destino.test.ts`
- `tests/integration/db/geo-125-nombres-catalogo.test.ts`
- `tests/unit/guards/presentacion-lugar-del-catalogo.guardia.test.ts`
- `tests/unit/repositories/ruta-sin-consulta-por-fila.test.ts`
- `tests/integration/db/geo-125-cierre-snapshot.test.ts`
- `tests/unit/types/ubicacion-snapshot.test.ts`
- `tests/unit/whatsapp/plantilla-niveles.test.ts`
- `tests/unit/plantillas/CampoVariablePicker-niveles.test.tsx`
- `tests/integration/db/geo-125-geocode-cache.test.ts`
- `tests/integration/db/geo-equivalencia-presentacion.test.ts`
- `e2e/geo-presentacion-4-niveles.spec.ts`

Tests ajustados (entradas, o las aserciones autorizadas en design §13.1: solo A3 en
`plantilla-datos.test.ts`):
- `tests/unit/geo/direccion-query.test.ts`
- `tests/unit/services/geocodificacion-service.test.ts`
- `tests/unit/types/plantilla-datos.test.ts`
- `tests/fixtures/plantilla-datos.ts`
- `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`
- `tests/unit/guards/geografia-sin-cte-recursiva.guardia.test.ts`
- `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts`
- `tests/unit/components/ordenes-descarga-columnas.test.ts`
- `tests/unit/descarga/satelite-descarga-columnas.test.ts`
- `tests/unit/descarga/cobertura-descarga-columnas.test.ts`
- `tests/unit/repositories/orden-envio-reader.test.ts`
- `tests/unit/repositories/orden-repository.recepcion-satelite.test.ts`
- `tests/unit/repositories/gestion-desde-ayuda-cierre.test.ts`
- `tests/unit/whatsapp-envios/informe-transito-repo-consultas.test.ts`

Añadidos por el inventario de T1.1 (2026-11-12; detalle en `progress/impl_SLT-125.md > T1.1`):
- **Pendiente de autorización** — `tests/unit/repositories/orden-repository.novedades.test.ts`: `:415–449`
  afirma con `toEqual` el `select` literal de `findNovedadesByTienda`, con las relaciones de lugar en
  `:435–437`. Además su fila de entrada (`:160`).
- `app/(app)/cierres-admin/_components/cierre-factura.tsx` (llama a `ubicacion` de `cierre-detalle-shared`).
- Solo entrada (filas simuladas con `provincia: { nombre }` para un repositorio de §4.2, o
  `OrdenGeocodeRow` con los 3 nombres):
  - `tests/unit/repositories/cierre-dia-repository.test.ts`
  - `tests/unit/repositories/cierre-detalle-causa-monto.test.ts`
  - `tests/unit/repositories/cierre-pagos-lectura.test.ts`
  - `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts`
  - `tests/unit/repositories/gestion-orden-repository.test.ts`
  - `tests/unit/repositories/orden-repository.guia.test.ts`
  - `tests/unit/repositories/orden-repository.test.ts`
  - `tests/unit/repositories/satelite-paginado-where.test.ts`
  - `tests/unit/services/api-pdf-etiqueta-columna-intacta.test.ts`
  - `tests/unit/services/geocodificacion-marcador-contrato.test.ts`
  - `tests/unit/services/geocodificacion-motivo.test.ts`
  - `tests/integration/asimetria-sin-tarifa.test.ts`
  - `tests/integration/db/devolucion-rechazadas-flow.test.ts` (si su doble de Prisma no admite las FK)

Con ellos, la estimación sube de 113 a unos 129 archivos: se avisa al humano antes de seguir.

Añadidos en T2.3 (2026-11-13; detalle en `progress/impl_SLT-125.md > T2.3`):
- Solo entrada: `tests/unit/plantillas/preview-mismo-motor.test.ts` (su doble del lector de envío lleva
  filas con las relaciones de lugar) y `tests/fixtures/doble-catalogo-geografico.ts` (admite `padreId`:
  una cadena de nodos con un tipo por nivel).
- **Pendiente de autorización** (aserciones que afirman las relaciones de lugar del `include` del listado
  o la forma exacta de la fila de satélite):
  - `tests/unit/guards/satelite-proyeccion-compartida.guardia.test.ts:131`;
  - `tests/unit/repositories/orden-repository-list-items-by-ids.test.ts:115–124`;
  - `tests/unit/repositories/orden-repository.recepcion-satelite.test.ts:146` (`toEqual` exacto: falta
    `lugarRuta`).
- **Pendiente de autorización** (cobertura, P5): `tests/integration/db/geo-lecturas-catalogo.test.ts:454` y
  `tests/integration/db/slt89-equivalencia-cr.test.ts:98` comparan con `toEqual` la fila de
  `CoberturaRepository.listDistritos` con la copia de hoy (`scripts/geo-equivalencia/lecturas-de-hoy.ts`).
