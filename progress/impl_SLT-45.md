# impl SLT-45 — geo-jerarquica-entrada

## T1 — Congelar v1 (backend_dev, 2026-11-05)

Sin tocar código de producción (`lib/`, `app/`, `middleware.ts`). Grabado sobre `BASE` =
`cedd19fd01550d43ef4e8d02ac4315b996748191` (punta de la rama antes de SLT-45).

### Archivos creados
- `tests/fixtures/contrato-v1/BASE` — sha de `BASE` (T1.1).
- `tests/fixtures/contrato-v1/payloads-sinteticos.json` — 17 payloads (T1.2).
- `tests/fixtures/contrato-v1/payloads-reales.json` — `[]` hasta T9.
- `tests/fixtures/contrato-v1/respuestas/*.json` — 17 respuestas grabadas con el código de `BASE` (T1.3).
- `tests/fixtures/contrato-v1/openapi-v1.json` — 9 paths de v1, 34 schemas y 5 respuestas de su clausura, y sus bloques del `.yaml` (T1.4).
- `tests/integration/api/contrato-v1.route.test.ts` — suite de contrato (T1.3).
- `tests/unit/api/openapi-v1-congelado.test.ts` — OpenAPI de v1 congelado (T1.4).

### Decisiones de implementación (dentro del spec)
- Cada payload corre en una transacción revertida con su propia empresa de CR, tienda (rol `apiKey`,
  nombre fijo), zonas `zona_1` (central) y `zona_2`, tarifas fijas del modelo viejo y la marca
  especial en Orosi; Cartago/Cartago/Carmen queda sin zona. `escenario` de un payload cambia esa siembra.
- Reales: los dos bordes, servicios, repositorios, catálogo, tarifa, cupo, PDF de etiquetas y manifiesto,
  con `servi_app` (RLS). Sustituidos: autenticación de la key (devuelve empresa y actor sembrados por el
  mismo `conEmpresaDeLaKey`), Storage y firma de URLs (volátiles), aviso de carga terminada (fuera de la respuesta).
- Ambigüedad: los únicos de `nodo_geografico` impiden dos hermanos con el mismo nombre normalizado. Los
  payloads de ambigüedad insertan un hermano con un carácter combinante U+20D0, que `normalizeName` (JS,
  `\p{Mn}`) quita y `geo_normalizar_nombre` (SQL, `[̀-ͯ]`) no. Si un día las dos normalizaciones
  se igualan, la siembra fallará con un 23505 visible, no en silencio.
- «Tope» = `MAX_CHUNK_ROWS + 1` filas (5001 con la configuración por defecto), con `ordenesRepetidas`.

### Hallazgo (no se congela; para el leader)
- `POST /api/ordenes/api-key/carga` con un `name` ya usado por la misma key responde **500 INTERNAL** y no
  el 409 de la feature 141/R24: con `@prisma/adapter-pg` el `P2002` llega con `meta.target` «(not
  available)» y `esNombreDuplicado` (`lib/repositories/carga-lote.ts:32`) devuelve `false`. Se quitó ese
  paso del payload para no congelar un 500 en el contrato. Es un bug de hoy, fuera de SLT-45.

### Mapa R → test (T1)
| Requisito | Test |
|---|---|
| R1 | `tests/unit/api/openapi-v1-congelado.test.ts` |
| R2 | `tests/integration/api/contrato-v1.route.test.ts` (un `it` por payload) |
| R3 (parte del contrato) | `contrato-v1.route.test.ts` > «los 11 mensajes de resolveGeo están en el código y en al menos una respuesta grabada» |
| R9 | `contrato-v1.route.test.ts` > «cada payload tiene su respuesta grabada…» + el `it` de cada payload |

### Evidencia
- Grabación: `CONTRATO_V1_GRABAR=1 pnpm exec vitest run tests/integration/api/contrato-v1.route.test.ts`
  → 20 passed | 2 skipped (22) contra `logistic_slt45`.
- Comparación (dos corridas seguidas): `Tests 22 passed (22)`.
- Rojo 1: borrar `respuestas/una-fila-central.json` → `2 failed | 20 passed` (falta respuesta, R9). Restaurado.
- Rojo 2: cambiar `costoEnvio` 2260.00 → 2261.00 en esa respuesta → `1 failed`. Restaurado.
- OpenAPI: grabación `1 passed | 4 skipped`; comparación `4 passed | 1 skipped (5)`.
- Rojo 3: cambiar la descripción de `num_remision` en `lib/api/openapi-spec.ts` → `1 failed`; revertido.
- Rojo 4: lo mismo en `docs/api/api-key-openapi.yaml` → `1 failed`; revertido.
- `pnpm exec tsc --noEmit` → exit 0. `pnpm exec eslint <los dos tests>` → exit 0.

Veredicto T1: contrato de v1 y OpenAPI de v1 congelados sobre `BASE`, verdes y con rojo comprobado.

## T2 — Motor de N niveles (backend_dev, 2026-11-05)

Sin tocar `lib/services/geo-resolucion.ts` ni ningún camino de v1. Sin dependencias ni migraciones.

### Archivos
- `lib/services/geo-ubicacion.ts` (nuevo, puro) — `resolverUbicacion`, `esPaisDeTresNiveles`, `admiteGuardado`,
  `fksDeNodo`, `rutaPublica`; tipos `EntradaUbicacion`, `UbicacionResuelta`, `ResultadoUbicacion`, `FksDeNodo`,
  `UbicacionDTO`; mensajes de §5 (constantes y `msg*`), clave `ubicacion` (T2.1).
- `tests/unit/guards/geografia-dominio-puro.guardia.test.ts` — bloque nuevo para `geo-ubicacion.ts`
  (solo puede importar `geografia-dominio` y `utils/normalize`), con su contraprueba.
- `tests/fixtures/doble-catalogo-geografico.ts` — `catalogoEnMemoria(nodos)`: el catálogo ya en memoria para
  el motor (antes solo tenía los delegados de Prisma). Lo existente no cambia.
- `tests/unit/services/geo-ubicacion.test.ts` (nuevo, T2.1).
- `tests/unit/services/geo-resolucion-v1-mensajes.test.ts` (nuevo, T2.2).

### Decisiones de implementación (dentro del spec)
- Normaliza con `normalizeName` (`lib/utils/normalize`) y no con `normalize` de `geo-resolucion.ts`: aquel es
  un envoltorio sin cambios de este (§2.2 dice que es «el mismo»), y importar `geo-resolucion.ts` arrastraría
  los tipos de `IOrdenRepository` (`@prisma/client`) al módulo puro.
- `{nombre}` de ruta = el nombre recibido con `trim()` (como `resolveGeo`); `{padre}` = nombre del catálogo.
  `{nombre}` de «sin zona» = nombre del nodo en el catálogo, porque por código no hay nombre recibido.
- Defensivo, inalcanzable desde el borde (zod pide 1–10 nombres y 1–64 caracteres): una ruta vacía o un
  código en blanco tras `trim()` devuelven el mensaje de R12 («indica ubicacion o ubicacion_codigo…»).
- Las R12 «las dos o ninguna» se comprueban al extraer la fila (T4); el motor exporta
  `MSG_UBICACION_UNA_DE_LAS_DOS` para eso.
- `UbicacionDTO` vive en `geo-ubicacion.ts` hasta que T4.3 cree `lib/types/api-v2.ts` (puede re-exportarlo).

### Mapa R → test (T2)
| Requisito | Test |
|---|---|
| R3 | `tests/unit/services/geo-resolucion-v1-mensajes.test.ts` (11 mensajes con clave + 8 casos de precedencia) |
| R13 | `geo-ubicacion.test.ts` > «R13 — una ruta de nombres se resuelve nivel a nivel» |
| R14 | `geo-ubicacion.test.ts` > «R14 — un codigo oficial se resuelve…» |
| R15 | `geo-ubicacion.test.ts` > «R15/R33 — forma del pais y regla de guardado» |
| R16 | `geo-ubicacion.test.ts` > «R16 — la zona que cubre la ubicacion» |
| R21 | `geo-ubicacion.test.ts` > «R21 — `rutaPublica`…» |
| R25 (parte pura) | `geo-ubicacion.test.ts` > «R25 — las tres FK se derivan de la ruta del nodo» |
| R33 (parte pura) | `geo-ubicacion.test.ts` > «R15/R33» (países de 2 y 4 niveles) |

### Evidencia (NODE_OPTIONS=--max-old-space-size=8192, sin base)
- `pnpm exec tsc --noEmit` → exit 0.
- `pnpm exec eslint` sobre los 5 archivos tocados → exit 0.
- `pnpm exec vitest run tests/unit/services/geo-ubicacion.test.ts tests/unit/services/geo-resolucion-v1-mensajes.test.ts tests/unit/guards/geografia-dominio-puro.guardia.test.ts`
  → `Test Files 3 passed (3)`, `Tests 72 passed (72)`.
- `pnpm exec vitest related --run tests/fixtures/doble-catalogo-geografico.ts lib/services/geo-ubicacion.ts`
  → `Test Files 21 passed (21)`, `Tests 529 passed (529)`.
- `pnpm run test:guardias` → `1 failed | 332 passed | 3 skipped (336)`, `4 failed | 4661 passed`. El rojo es
  `dependencias-declaradas-presentes.guardia.test.ts` (init.sh sin el marcador «FIN PASO 2: DEPENDENCIAS
  (ficha 420)» ni `scripts/verificar-dependencias.mjs`): ajeno a T2, que no toca `init.sh`. Para el leader.

Veredicto T2: motor de N niveles puro y probado; v1 sin tocar y sus 11 mensajes fijados en tabla.

## T3 — Escritura del nodo (backend_dev, 2026-11-05)

Sin migraciones, sin dependencias, trigger de SLT-43 sin tocar. Commits: `adbb2a26` (T3.1),
`1086396b` (T3.2 parcial), `331bb839` (T3.3).

### Archivos
- `lib/interfaces/repositories/IOrdenRepository.ts` — `CreateOrdenData.nodoGeograficoId: string` (T3.1);
  `CorregirDatosClienteData.nodoGeograficoId?: string` (T3.2).
- `lib/repositories/OrdenRepository.ts` — `toCreateManyInput` lo manda en el INSERT (T3.1);
  `corregirDatosCliente` lo incluye en el mismo `updateMany` (T3.2).
- `lib/services/BulkOrdenService.ts` — `resolveFila`: `nodoGeograficoId = geo.distritoId ?? geo.cantonId` (vía `resolveGeo`).
  La rama del motor aún no existe en `resolveFila` (es T4.2); allí será `nodo.id` con `fksDeNodo`.
- 17 tests que arman un `CreateOrdenData` literal ganan `nodoGeograficoId` (el campo es obligatorio y `tsc`
  incluye `tests/`). Solo el fixture cambia; ninguna aserción.
- `tests/integration/db/orden-nodo-escritura.test.ts` (nuevo, T3.3).

### ABIERTO — T3.2 queda `[ ]`: contradicción en el spec (decisión del leader/humano)
design §3.2 y tasks T3.2 dicen que `CorregirDatosClienteService` pone `nodoGeograficoId`, y el «Hecho» de T3.2
dice que los tests existentes pasan sin cambiar aserciones. No se cumplen las dos cosas a la vez:
`tests/unit/services/corregir-datos-cliente-service.test.ts` (líneas ~627 y ~669) usan
`toHaveBeenCalledWith(ORDEN_ID, { distritoId: "d-2", zonaId: "z-2" }, …)` y
`{ provinciaId, cantonId, distritoId, zonaId }`, que son igualdad exacta: una clave nueva con valor las pone en rojo.
Opciones: (a) el servicio la pone (`data.nodoGeograficoId = distrito.id` junto a `data.zonaId`) y se añade
`nodoGeograficoId: "d-2"` a esas dos aserciones; (b) el servicio no la pone y el repositorio la deriva
(`data.nodoGeograficoId ?? data.distritoId`) sin tocar tests. Hoy la base ya cumple R26/R27 por el trigger.

### Mapa R → test (T3)
| Requisito | Test |
|---|---|
| R25 | `orden-nodo-escritura.test.ts` > «v1 (`cargarViaApi`), profundidad 3…», «v2 (motor + repositorio), profundidad 3…», «profundidad 2 (canton, por el repositorio)…» |
| R26 | `orden-nodo-escritura.test.ts` > «corregir la ubicacion escribe el distrito nuevo…» (por el repositorio; la parte del servicio está abierta) |
| R27 | los cuatro casos de arriba: `nodo_geografico_id` = nodo resuelto = `COALESCE(distrito_id, canton_id)` |
| R28 | `orden-nodo-escritura.test.ts` > «el trigger `orden_nodo_geografico` de SLT-43 sigue derivando el nodo de las FK» |

### Evidencia (base `logistic_slt45`)
- `pnpm exec tsc --noEmit` → exit 0 (después de T3.1 y otra vez con todo T3).
- `pnpm exec eslint` sobre los archivos de prod tocados y el test nuevo → 0 errores (1 warning previo, `IOrdenRepository.ts:11`).
- `vitest related --run` sobre los 3 archivos de prod: **lo mató Claude Code por poca memoria del sistema**; no se relanzó.
  En su lugar, con `--maxWorkers=1`:
  - `tests/unit/services/bulk-orden-service*`, `orden-repository.{carga-api,bulk,carga-lote,creacion-bifurcada}`,
    `orden-historial-atomicidad`, `tests/unit/services/corregir*`, `corregir-datos-sin-rastro.guardia` →
    `Test Files 17 passed (17)`, `Tests 347 passed (347)`.
  - `tests/integration/db/orden-nodo-escritura.test.ts` → `Tests 5 passed (5)` (corre, no salta).
  - `tests/integration/api/contrato-v1.route.test.ts` en modo comparar, sin regrabar → `Tests 22 passed (22)`; `tests/fixtures` sin cambios.
  - Los 12 de integración con fixture tocado → `11 passed | 1 failed` archivos, `106 passed | 9 skipped`. El fallo es
    `orden-remision-borrada-libera-numero.test.ts`: su `beforeAll` exige filas en `orden` y la base desechable no
    tiene. `corregir-datos-cliente.repo.test.ts` y `corregir-ubicacion-geocode.test.ts` caen por lo mismo. Es del entorno, no de T3.
  - Correcciones con T3.2 puesto: `tests/unit/services/corregir*` + guardias de corrección + `orden-nodo-escritura` →
    146 passed (los 2 rojos son la misma precondición de `orden` vacía).

Veredicto T3: crear escribe nodo + 3 FK y está probado contra Postgres. T3.2 queda abierta en la parte del servicio, a la espera de la decisión (a)/(b).

## T3.2 (cierre) y T4.1–T4.2 (backend_dev, 2026-11-06)

Sin migraciones, sin dependencias, trigger de SLT-43 sin tocar, sin literales de país/moneda. Commits:
`78dca2e0` (T3.2), `d06b6350` (T4.1), `7336f219` (T4.2).

### Archivos
- `lib/services/CorregirDatosClienteService.ts` — al cambiar la ubicación, `data.nodoGeograficoId = distritoId`
  junto a `data.zonaId` (T3.2, R26).
- `tests/unit/services/corregir-datos-cliente-service.test.ts` — las 2 aserciones `toHaveBeenCalledWith`
  (l. 630 y 671) ganan `nodoGeograficoId: "d-2"`. Única excepción aceptada (decisión humana 2026-11-05);
  ninguna otra aserción cambia.
- `lib/services/BulkOrdenService.ts` — último parámetro opcional `catalogoRepo?: ICatalogoGeograficoRepository`
  (T4.1); R5 en `cargarViaApi`; tipos `EntradaDelMotor`, `ExtractorDeFila`, `MSG_MOTOR_SIN_CATALOGO`;
  `resolveFila` delega en `resolverGeografia` (terna → `resolveGeo`, entrada → motor); `PreloadedContext.geografia`.
- `lib/services/CotizacionOrdenService.ts` — último parámetro opcional `catalogoRepo?` (T4.1) y R5 en `cotizar` (T4.2).
- `app/api/ordenes/api-key/carga/route.ts`, `app/api/ordenes/api-key/cotizacion/route.ts`,
  `app/api/ordenes/carga-masiva/chunk/route.ts` — pasan `new CatalogoGeograficoRepository(prisma)` (T4.1).
- `tests/unit/api/v2-composicion.test.ts` (nuevo, T4.1).
- `tests/unit/services/bulk-orden-service.forma-pais.test.ts` (nuevo, T4.2).
- `tests/integration/api/contrato-v1.route.test.ts` — los dos servicios se construyen CON el catálogo, como en
  producción, para que el contrato pruebe que la comprobación de R5 no cambia nada en CR. Ninguna aserción
  ni fixture cambia; `tests/fixtures/contrato-v1/` intacto.

### Decisiones de implementación (dentro del spec)
- T3.2: la corrección siempre llega con distrito (el servicio exige los tres ids), así que el nodo es el
  distrito; la rama «si no, el cantón» de §3.2 no es alcanzable desde la corrección de hoy.
- T4.1, test de composición: subclase de cada servicio real que anota los argumentos del constructor (el
  método de negocio devuelve `forbidden`), route handler SIN `deps.bulkService`/`deps.cotizacionService` y
  `getPrismaClient` sustituido. Comprueba que el último argumento es una `CatalogoGeograficoRepository`.
- R5 se comprueba con `esPaisDeTresNiveles` (max profundidad = 3), antes de leer estatus, geografía de v1 o
  tarifa. Carga: summary con todas las filas en `errores` (`ubicacion: [MSG_PAIS_NO_HABILITADO]`),
  `cargaId: null`, sin manifiesto ni aviso de fin de lote (mismo patrón que el corte por seed ausente).
  Cotización: `status: "ok"` con todas las filas en `errores` — no el 409, porque ninguna fila llegó a la
  tarifa (R36 de la 274). Sin catálogo inyectado no se comprueba (design §2.3).
- Solo en `cargarViaApi` y `cotizar` (R5 nombra la carga y la cotización de v1). `cargarMasiva` (sesión) no
  cambia: su rama de país no-CR es T6.2.
- Rama del motor: `zonaId`/`esCentral` de `u.zona`, `esZonaEspecial` del motor, FK de `u.fks` (= `fksDeNodo`)
  y `nodoGeograficoId = u.nodo.id`. Sin `ctx.geografia` lanza `Error(MSG_MOTOR_SIN_CATALOGO)` (→ 500), nunca
  `resolveGeo`. Hoy ningún camino de producción llega a esa rama (lo cablean T4.3 y T6.2); se prueba
  llamando a `resolveFila` por `service["resolveFila"]`.

### Mapa R → test (esta tanda)
| Requisito | Test |
|---|---|
| R5 (unit) | `bulk-orden-service.forma-pais.test.ts` > «R5 — carga v1…» (2 y 4 niveles; 3 niveles pasa; sin catálogo no comprueba) y «R5 — cotizacion v1…» |
| R5 (extremo a extremo) | pendiente de `v2-paises-de-prueba.route.test.ts` (T5.8, no es de esta tanda) |
| R2 con R5 activo | `contrato-v1.route.test.ts` con el catálogo inyectado, 22/22 sin regrabar |
| R25 (rama del motor) | `bulk-orden-service.forma-pais.test.ts` > «§2.3 / R25 — la rama del motor…» (profundidad 3 por ruta, 2 por código, fallo, sin catálogo) |
| R26 (servicio) | `corregir-datos-cliente-service.test.ts` (l. 627 y 669) + `orden-nodo-escritura.test.ts` > «corregir la ubicacion…» |
| §2.3 composición | `tests/unit/api/v2-composicion.test.ts` (3 rutas) |

### Evidencia (`NODE_OPTIONS=--max-old-space-size=8192`, `--maxWorkers=1`; base `logistic_slt45` en localhost)
- T3.2: `tests/unit/services/corregir*` → `Test Files 5 passed (5)`, `Tests 92 passed (92)`.
  `corregir-datos-sin-rastro.guardia` + `orden-nodo-escritura` → `Test Files 2 passed (2)`, `Tests 27 passed (27)`.
- T4.1: `v2-composicion.test.ts` → `Tests 3 passed (3)`. Rojo comprobado quitando el parámetro de cada ruta
  (una a la vez, revertido): carga → `Tests 1 failed | 2 passed (3)`; cotizacion → `1 failed | 2 passed (3)`;
  chunk → `1 failed | 2 passed (3)`. Relacionados (`v2-composicion`, `carga-composition-root-cupo`,
  `api-key-carga-tope-plan`, `api-key-empresa`, `api-key-modulo-inactivo`, `bulk-orden-service*`,
  `cotizacion-orden-service`) → `Test Files 12 passed (12)`, `Tests 278 passed (278)`.
- T4.2: `bulk-orden-service.forma-pais.test.ts` → `Tests 12 passed (12)`. Rojo comprobado anulando la
  comprobación de R5 en los dos servicios → `Tests 4 failed | 8 passed (12)`; revertido.
  `bulk-orden-service*`, `cotizacion-orden-service`, `v2-composicion`, `carga-composition-root-cupo`,
  `api-key-carga-tope-plan`, `geografia-dominio-puro.guardia` → `Test Files 12 passed (12)`, `Tests 270 passed (270)`.
  `contrato-v1.route.test.ts` (modo comparar, sin `CONTRATO_V1_GRABAR`) + `orden-nodo-escritura.test.ts` →
  `Test Files 2 passed (2)`, `Tests 27 passed (27)` (22 del contrato + 5); `git status tests/fixtures` limpio.
- `pnpm exec tsc --noEmit` → «No errors found», exit 0 (tras T4.1 y tras T4.2).
- `pnpm exec eslint` sobre los archivos tocados → exit 0 (la de T3.2 deja 3 warnings previos en
  `corregir-datos-cliente-service.test.ts:121-123`, sin errores).
- Suites que no corren en esta base (entorno, no código): `corregir-datos-cliente.chat.test.ts` (y las 3 de T3)
  paran en `beforeAll` por `orden` vacía; `corregir-conciliacion.int.test.ts` (en `tests/baseline-rojos.json`) por
  `usuario` con < 2 filas. **No se sembró**: `pnpm run db:seed` (`scripts/seed-catalogos.ts`) solo siembra
  `tipo_identificacion`, `rol`, `order_status` y `vehiculos` (no crea órdenes ni usuarios) y no hay script de
  semillas de zonas en el repo, así que sembrar no levantaría la precondición.
- No se corrió `vitest related` amplio ni la suite completa (memoria).

Veredicto T3.2/T4.1/T4.2: nodo en la corrección, catálogo cableado y vigilado en las 3 rutas, R5 en v1 y rama del motor listas; contrato v1 22/22 sin regrabar.

## T4.3–T4.4 (backend_dev, 2026-11-06)

Sin migraciones, sin dependencias, trigger de SLT-43 sin tocar, sin literales de país/moneda en código nuevo,
sin rutas `app/api/v2` (eso es T5). Commits: `898499a0` (T4.3), `8f636cb7` (T4.4).

### Archivos
- `lib/types/api-v2.ts` (nuevo) — T4.3: `filaV2Schema` (claves de texto como v1 + `ubicacion` 1–10 nombres de
  1–200 / `ubicacion_codigo` 1–64), `cargaV2BodySchema`, `crearOrdenV2BodySchema`, `cotizacionV2BodySchema`,
  `filaCotizacionV2Schema` (= `filaCotizacionSchema` sin la terna), `FilaV2`, `FilaV2Interna`, `ErrorDeEntrada`,
  `aFilaInterna` (R12), `extraerUbicacionV2`, `geoDeUbicacion`, `CargaViaApiOrdenV2`, `CargaViaApiSummaryV2`,
  `CotizacionFilaCotizadaV2`, `CotizacionResumenV2`; reexporta `UbicacionDTO`. T4.4: `geografiaQuerySchema`,
  `GeografiaResponse`, `GeografiaTipoDTO`, `GeografiaNodoDTO`.
- `lib/services/BulkOrdenService.ts` — el pipeline de la carga por API pasa a `cargarFilasPorApi` (privado, común a
  v1 y v2; recibe el extractor por índice y devuelve además `nodoPorRemision`); `cargarViaApi` conserva rol, R5 y
  el extractor de columnas separadas; `cargarViaApiV2` nuevo. `resolverGeografia` usa `geoDeUbicacion`.
- `lib/services/CotizacionOrdenService.ts` — `cotizarPreparadas` (privado, común), `cotizarV2` y `prepararFilaV2`.
- `lib/services/geo-ubicacion.ts` — `MSG_MOTOR_SIN_CATALOGO` se mueve aquí (lo usan los dos servicios);
  `BulkOrdenService` lo reexporta, así que el test de T4.2 no cambia.
- `lib/interfaces/services/IBulkOrdenService.ts` — `CargaViaApiResultV2` y `cargarViaApiV2`.
- `lib/interfaces/services/ICotizacionOrdenService.ts` — `CotizacionOrdenResultV2` y `cotizarV2`.
- `lib/services/GeografiaApiService.ts` y `lib/interfaces/services/IGeografiaApiService.ts` (nuevos, T4.4).
- `lib/interfaces/repositories/IOrdenRepository.ts`, `lib/repositories/OrdenRepository.ts` —
  `findLugarDeOrdenForOwner(ordenId, ownerId)` (T4.4).
- Dobles que implementan la interfaz entera ganan el método nuevo (`vi.fn()`); ninguna aserción cambia:
  T4.3 → `ordenes-api-key-carga.route`, `ordenes-carga-masiva-chunk.route`, `carga-api-etiquetas`,
  `cotizacion-api-key`, `unit/api/api-key-empresa`; T4.4 → `orden-service`, `rol-admin-satelite-authz`,
  `bulk-orden-service`, `bulk-orden-service.carga-api`.
- Tests nuevos: `tests/unit/services/api-v2-servicios.test.ts` (T4.3), `tests/unit/services/geografia-api-service.test.ts`
  y `tests/integration/db/orden-lugar-owner.test.ts` (T4.4).

### Decisiones de implementación (dentro del spec)
- v1 no cambia de salida: `cargarViaApi` y `cotizar` llaman al núcleo común con el mismo extractor y la misma
  comprobación de R5; el núcleo devuelve el resultado de v1 tal cual y v2 añade `ubicacion` encima. Lo prueban el
  contrato congelado (22/22 sin regrabar) y la comparación v1↔v2 de `api-v2-servicios.test.ts`.
- `ubicacion` va al final de cada orden/fila (orden de claves = v1 + `ubicacion`), con `rutaPublica` sobre el
  catálogo de la empresa leído una vez por petición.
- v2 no comprueba la forma del país por adelantado: la regla de guardado del motor (R15) lo dice fila a fila, con
  la precedencia de §2.2 (un nombre no encontrado sale antes que «país no habilitado»).
- Sin catálogo inyectado, `cargarViaApiV2` y `cotizarV2` lanzan `MSG_MOTOR_SIN_CATALOGO` (§2.3), tras el rol.
- R12 se aplica al pasar la fila validada a interna (`aFilaInterna`): «las dos o ninguna» es error de fila. Los
  campos de v1 se validan antes que la ubicación (misma precedencia que v1 en `resolveFila`).
- `FilaV2` se declara a mano: el tipo que infiere zod de un `catchall` no admite literales; la salida del schema
  es asignable (lo ejerce un test).
- Si `nodoPorRemision`/`nodoPorFila` no tuviera el nodo (inalcanzable), la ruta sale `[]` en vez de lanzar: en la
  carga las órdenes ya están confirmadas.
- T4.4: `findLugarDeOrdenForOwner(ordenId, ownerId)` sigue la convención de parámetros de su gemelo
  `findDetalleByOrdenIdForOwner` (design §4.3 escribe `(actor, ordenId)`). El WHERE es el mismo (`id`, `tiendaId`,
  `deletedAt: null`); `organizacion_id` lo inyecta la extensión de empresa y lo respalda la RLS de `orden`, como en
  el resto de `OrdenRepository` (no se escribe a mano). El test de integración lo prueba con dos empresas.
- `GeografiaApiService` compara el país con `catalogo.paisId` ANTES de leer `pais` (un país ajeno no consulta nada
  más); si `PaisRepository.porId` no devuelve la fila, también `not_found`.

### Mapa R → test (esta tanda)
| Requisito | Test |
|---|---|
| R11 (autorización en el servicio) | `api-v2-servicios.test.ts` > «R11 — otro rol…» (carga y cotización); `geografia-api-service.test.ts` > «R11…» |
| R12 | `api-v2-servicios.test.ts` > «R12 — `aFilaInterna`…» y «R12–R16 — cada fila mala…» (carga y cotización) |
| R13, R14, R15, R16 (por los servicios v2) | `api-v2-servicios.test.ts` > «R12–R16…», «R14 — por codigo…», «R15 — pais de 2 niveles…» |
| R17 | `api-v2-servicios.test.ts` > «R17/R21 — misma respuesta que v1…», «R17 — los campos de v1 se validan igual…» |
| R19 | `api-v2-servicios.test.ts` > «R19/R21 — mismos importes y forma que v1…», «R19 — sin tarifa…» |
| R20 (parte de repositorio) | `orden-lugar-owner.test.ts` (lugar de profundidad 3 y 2; otra tienda, borrada, inexistente → `null`) |
| R21 | `api-v2-servicios.test.ts` (ruta `RUTA_D1` en carga y cotización) |
| R22 | `geografia-api-service.test.ts` > «R22…» (3 niveles con retirado en cascada; 2 y 4 niveles) |
| R23 | `geografia-api-service.test.ts` > «R23…» (ajeno = inexistente = `not_found`; query mal formada no pasa el schema) |
| R24 (parte de repositorio) | `orden-lugar-owner.test.ts` > desde la empresa B, la orden de A → `null` |
| §4.2 cuerpos | `api-v2-servicios.test.ts` > «§4.2 — cuerpos zod de v2» |
| R2 con el núcleo común | `contrato-v1.route.test.ts`, 22/22 sin regrabar |

R10, R18 y los extremo a extremo de R11–R24 son de las suites de rutas de T5.

### Evidencia (`NODE_OPTIONS=--max-old-space-size=8192`, `--maxWorkers=1`; base `logistic_slt45` en localhost)
- `pnpm exec tsc --noEmit` → exit 0 (tras T4.3 y tras T4.4).
- `pnpm exec eslint` sobre los archivos tocados → T4.3 «No issues found»; T4.4 0 errores, 1 warning previo
  (`IOrdenRepository.ts:11`).
- T4.3: `api-v2-servicios.test.ts` → `Test Files 1 passed (1)`, `Tests 27 passed (27)`. Rojo comprobado cambiando
  `ubicacion` por `[]` en los dos servicios → `Tests 3 failed | 24 passed (27)`; restaurado.
- T4.3 relacionados (`api-v2-servicios`, `bulk-orden-service*` (7), `cotizacion-orden-service`, `v2-composicion`,
  `api-key-empresa`, `geografia-dominio-puro.guardia`, `geo-ubicacion`, `ordenes-api-key-carga.route`,
  `ordenes-carga-masiva-chunk.route`, `carga-api-etiquetas`, `cotizacion-api-key`) → `Test Files 17 passed (17)`,
  `Tests 447 passed (447)`.
- T4.4: `geografia-api-service.test.ts` + `orden-lugar-owner.test.ts` → `Test Files 2 passed (2)`,
  `Tests 18 passed (18)` (17 unit + 1 de integración, que corre, no salta). Rojo comprobado quitando `tiendaId`
  del WHERE y la comprobación de rol → `Tests 4 failed | 14 passed (18)`; restaurado.
- T4.4 dobles (`orden-service`, `rol-admin-satelite-authz`, `bulk-orden-service`, `bulk-orden-service.carga-api`,
  `api-v2-servicios`) → `Test Files 5 passed (5)`, `Tests 179 passed (179)`.
- Contrato v1 (modo comparar, sin `CONTRATO_V1_GRABAR`): tras T4.3, con `orden-nodo-escritura` →
  `Test Files 2 passed (2)`, `Tests 27 passed (27)`; tras T4.4, solo → `Test Files 1 passed (1)`,
  `Tests 22 passed (22)`. `git status tests/fixtures` limpio.
- Guardias (`vitest run guard --maxWorkers=1`), antes y después de T4.4 → `Test Files 2 failed | 331 passed |
  3 skipped (336)`, `Tests 5 failed | 4660 passed | 25 skipped (4690)`. Ninguno de los dos rojos es de esta tanda:
  - `dependencias-declaradas-presentes.guardia` (4): en `tests/baseline-rojos.json`; ya anotado en T2.
  - `geografia-lecturas-sin-nodo-fk.guardia` (1): ver ABIERTO abajo.

### ABIERTO — rojo de guardia desde T3.1 (para el leader; no se tocó)
`tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` > «SLT-65 R19 — … ni `OrdenRepository` … nombran
la columna» barre `lib/repositories/OrdenRepository.ts` ENTERO y exige cero menciones de `nodoGeograficoId`. Las
escrituras que pide design §3.2 (T3.1 `toCreateManyInput`, l. ~3271; T3.2 `corregirDatosCliente`, l. ~2468) lo
nombran, así que la guardia está roja desde `adbb2a26` (T3.1); los logs de T3 y T4.1–T4.2 no corrieron todas las
guardias. No está en `tests/baseline-rojos.json`. Es una contradicción entre el spec (escribir el nodo desde
`OrdenRepository`) y una guardia de SLT-65 pensada para LECTURAS. Opciones a decidir: (a) acotar la guardia a las
lecturas, excluyendo las dos escrituras de SLT-45 con su justificación; (b) sacar las escrituras de
`OrdenRepository`. T4.3 y T4.4 no añaden menciones.

Veredicto T4.3/T4.4: firmas v2 de carga y cotización con `ubicacion`, catálogo v2 y lugar de la orden por dueño y
empresa, probados con dobles y contra Postgres; contrato v1 22/22 sin regrabar; queda abierto un rojo de guardia heredado de T3.1.

## T5 — Rutas v2 y middleware (implementer + backend_dev, 2026-11-06)

### Commits
- `e63da62b` T5.1 (verificado sin fix) · `6e4a1918` T5.2 (rutas v2, SELF_AUTH_ROUTES; `buildDetallePorOrdenId`
  movido a `lib/api/api-orden-detalle.ts`, la ruta v1 lo importa y solo reexporta el tipo) · `890509f2` alta de las
  5 rutas v2 en `MODULO_POR_API` (`nucleo`; la guardia `modulos-reparto` estaba roja desde 6e4a1918)
- `edd6d82a` T5.3 · `b0c987d8` T5.4 · `0fb726c0` T5.5 · `8b6270bd` T5.6 · `31e7d2fb` T5.7 · `52fe6b59` T5.8

### Archivos
- Nuevos: `app/api/v2/{geografia,ordenes,ordenes/[id],ordenes/carga,ordenes/cotizacion}/route.ts`,
  `lib/api/api-orden-detalle.ts`, `tests/integration/api/_v2-escenario.ts`, `tests/integration/api/v2-{ordenes,
  cotizacion,consulta,geografia,aislamiento,paises-de-prueba}.route.test.ts`, `tests/fixtures/paises-de-prueba-geo.ts`.
- Modificados: `app/api/ordenes/api-key/orden/[id]/route.ts`, `middleware.ts`, `lib/modulos/reparto.ts`,
  `lib/services/GeografiaApiService.ts`, `lib/interfaces/services/IGeografiaApiService.ts`,
  `tests/unit/auth/middleware.test.ts` (solo la lista SELF_AUTH_ROUTES, pedida por tasks.md),
  `tests/unit/guards/rastreo-sin-ruta-nueva.guardia.test.ts`, `tests/unit/services/geografia-api-service.test.ts`.

### Mapa R → test (T5)
| R | Test |
|---|---|
| R4 | suites v1 existentes sin cambios (carga 33, carga-generate 14, tienda-destino 5, orden-consulta 31, …) |
| R5 | `v2-paises-de-prueba` > «R5 (XN\|XP): la carga y la cotizacion de v1 rechazan cada fila con «pais no habilitado» bajo `ubicacion`…» |
| R10 | `v2-ordenes` > «R10: bajo app/api/v2 solo hay crear, lote, cotizacion, consulta y catalogo…» |
| R11 | `v2-ordenes` > «R11: sin Bearer o con una key desconocida…401», «R11: …no activos dan 403», «R11: la orden queda en la empresa y la tienda de la key…» |
| R12 | `v2-ordenes` > «R12: sin ubicacion, con las dos, o con la terna de v1…» |
| R13 | `v2-ordenes` > «R13: por nombre, normalizado nivel a nivel…» (ambiguo por nombre: solo unit `geo-ubicacion.test.ts`, la base lo impide por índice único) |
| R14 | `v2-ordenes` > «R14: por codigo oficial del pais…» |
| R15 | `v2-ordenes` > «R15: …provincia de CR da pais no habilitado…»; `v2-paises-de-prueba` > «R15/R33 (XN\|XP): crear, lote y cotizacion…» |
| R16 | `v2-ordenes` > «R16: un canton de CR … y un distrito sin zona salen con «sin zona»…» |
| R17 | `v2-ordenes` > «R17: el lote de v2 responde lo mismo que el de v1 … + `ordenes[].ubicacion`», «R17: la orden creada por v2 guarda su nodo y las FK…» |
| R18 | `v2-ordenes` > «R18: crear una orden responde lo mismo que el lote…», «R18: crear una orden recibe UNA orden…422» |
| R19 | `v2-cotizacion` > «R19: mismos importes y misma forma que v1…», tarifa propia, 409 sin tarifa, fila mala |
| R20 | `v2-consulta` > «R20/R21: por guia y por remision…», «R20: inexistente, borrada y de otra tienda dan el MISMO 404…» |
| R21 | `v2-consulta` > «R21: `ubicacion` trae el nombre ACTUAL del nodo…» |
| R22 | `v2-geografia` > «R22: con el pais de la empresa (CR)…»; `v2-paises-de-prueba` > «R22/R33 (XN\|XP): el catalogo…» |
| R23 | `v2-geografia` > «R23: sin `pais`, vacio o … mal formado responde 422», «R23: un pais ajeno … y uno inexistente dan el MISMO 404» |
| R24 | `v2-aislamiento` > 5 casos «R24: …» (zonas, consulta 404, remisión duplicada, catálogo) |
| R33 | `v2-paises-de-prueba` > «R33/R15 (XN\|XP): por nombre y por codigo se encuentran nodos de TODA profundidad…» |

### Evidencia (`logistic_slt45` local, `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=8192`)
- T5.1: contrato-v1 22 passed; suites v1 de carga/cotización (11 archivos) y 9 unit/guardias que importan los handlers
  → todo verde (129 passed en los 9 unit).
- T5.2: 13 unit (middleware, rastreo-sin-ruta-nueva, geografia-api-service, 7 guardias de rutas, composición) → 196
  passed; contrato-v1 22; orden-consulta 31; 177-key-nunca-filtrada 9; eliminar 12; tienda-destino-aislamiento 8;
  webhook-evidencias 5.
- Una corrida conjunta de las 6 suites v2 + contrato-v1 (comparar) → `Test Files 7 passed (7)`, `Tests 62 passed (62)`
  (13+5+4+3+5+10+22), sin saltos; `tests/fixtures` limpio.
- Rojo comprobado por suite (roto a mano y restaurado): v2-ordenes 1/13 (texto de msgSinZona); v2-cotizacion 2/5
  (esZonaEspecial forzado); v2-consulta 2/4 (ubicacion recortada); v2-geografia 2/3 (sin comprobación de paisId);
  v2-aislamiento 3/5; v2-paises-de-prueba 5/10 (esPaisDeTresNiveles siempre true).
- `tsc --noEmit` exit 0 y eslint de lo tocado exit 0 tras cada task.
- Guardias tras T5.8 (antes del alta en reparto): 2 archivos rojos, `dependencias-declaradas-presentes` (baseline) y
  `modulos-reparto` (rutas v2 sin alta) → corregido en `890509f2`. La corrida final de guardias por lotes tras
  `890509f2` estaba EN CURSO al cerrar esta tanda (ver resumen al leader).

### Decisiones para revisar
- Las rutas v2 exportan además funciones `handle*` y tipos (`handleGeografiaApi`, `handleCrearOrdenV2`,
  `handleConsultaOrdenV2`…), igual que hacen hoy todas las rutas v1; no se comprobó con `next build`.
- `_v2-escenario.ts` replica la siembra privada de `contrato-v1.route.test.ts` (congelado, no importable).
- Fixture de países de prueba: siembra en transacción revertida (no afterAll con borrado); el afterAll comprueba 0
  residuos. La «key» del país de prueba es el autenticador inyectado, no una fila de `api_key`. El país de 2 niveles
  tiene 3 tipos (la tabla `pais` exige tres nombres).
- R17: el cupo del plan no tiene caso propio en v2-ordenes.

Veredicto T5: rutas v2 y suites T5.3–T5.8 en verde contra Postgres; contrato v1 22/22; falta confirmar la corrida
final de guardias tras el alta en reparto.

## T6–T8 + caso de cupo R17 (implementer + backend_dev ×3 + frontend_dev, 2026-11-06)

### Commits
- `1ed838df` T6.1 · `f0efb433` T6.2 · `d5eb61e7` T8.1 · `f018ede0` T8.2 · `5b28d1f9` T7.1 · `121b40a1` T7.2 ·
  `1bbfea1e` T6.3 · `214249b3` R17 cupo · cierre de tanda (este archivo y tasks.md).

### Archivos
- T6.1: `lib/utils/plantilla-geo.ts` (nuevo), `tests/unit/utils/plantilla-geo.test.ts` (nuevo),
  `tests/unit/guards/geografia-dominio-puro.guardia.test.ts` (bloque nuevo para plantilla-geo).
- T6.2: `lib/services/geo-resolucion.ts` (`geoInputDesdeColumnasDeNivel`, `EntradaDeNiveles`, 2 mensajes),
  `lib/services/BulkOrdenService.ts` (`cargarMasiva` elige extractor por forma de país),
  `tests/unit/services/bulk-orden-service.n-niveles.test.ts` (nuevo).
- T6.3: `app/(app)/ordenes/page.tsx`, `_components/{OrdenesListado,OrdenesModule,OrdenesCargaMasivaButton,
  OrdenesCargaUpload,OrdenesCargaPreview}.tsx`, `_components/carga-masiva-fields.ts` (`camposDePlantilla`),
  `_components/carga-masiva-export-errores.ts` (`camposExportErrores`), `lib/types/carga-masiva.ts`
  (`cabecerasObligatorias`, `findMissingHeaders` con 2º arg opcional), tests nuevos
  `tests/components/CargaMasivaColumnasGeo.test.tsx` y `tests/components/OrdenesCargaColumnasGeoCableado.test.tsx`.
- T7.1: `lib/api/openapi-spec.ts`, `docs/api/api-key-openapi.yaml`, `tests/unit/api/openapi-v2.test.ts` (nuevo),
  `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts` (escanea `app/api/v2`),
  `tests/unit/api/openapi-177-paths-pdf-y-carga-id.test.ts` (censo 9→14, autorizado por tasks).
- T7.2: `docs/api/servi-logistic-api-key.postman_collection.json` (carpeta v2, 5 peticiones), `docs/api/CHANGELOG.md`
  (entrada `2026-11-xx`), `tests/unit/api/postman-changelog-v2.test.ts` (nuevo).
- T8.1: `scripts/geo-payloads-contrato-v1.ts` (nuevo), `package.json` (`geo:payloads-contrato`).
- T8.2: `tests/unit/scripts/geo-payloads-contrato-v1.test.ts` (nuevo, 17 tests).
- R17: `tests/integration/api/v2-ordenes.route.test.ts` (caso nuevo de cupo; solo añadido).

### Mapa R → test (esta tanda)
| R | Test |
|---|---|
| R6, R7, R8 | `tests/unit/scripts/geo-payloads-contrato-v1.test.ts` |
| R17 (cupo) | `tests/integration/api/v2-ordenes.route.test.ts` › «R17: con la empresa al tope de su plan… mismo 409 `tope_plan` que v1» |
| R29 | `plantilla-geo.test.ts` (CR → null) + `bulk-orden-service.n-niveles.test.ts` + `CargaMasivaColumnasGeo.test.tsx` / `OrdenesCargaColumnasGeoCableado.test.tsx` (sin prop / CR) |
| R30 | `plantilla-geo.test.ts` (2 y 4 niveles, mezcla y choque → `nivel_{n}`) + casos no-CR de los 2 tests de componente |
| R31 (+R13, R15, R16 en sesión) | `tests/unit/services/bulk-orden-service.n-niveles.test.ts` |
| R32 | existentes sin cambio de aserciones: `bulk-orden-service*` (7), `carga-masiva-plantilla-roundtrip`, `carga-masiva-errores-roundtrip`, tests de componente de carga masiva y de página |
| R34 | `tests/unit/api/openapi-v2.test.ts` + `openapi-canal-rutas-reales.guardia.test.ts` + `openapi-177-paths-pdf-y-carga-id.test.ts` |
| R35 | `tests/unit/api/postman-changelog-v2.test.ts` |
| R1 | `openapi-v1-congelado.test.ts` sigue verde, fixture intacto |

Sin test en esta tanda (por diseño): R36 (gate de CI, T9.2) y los payloads reales de R2/R9 (T9.1, persona).

### Evidencia (`logistic_slt45` local, `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=8192`)
- `pnpm exec tsc --noEmit -p .` → exit 0. `pnpm exec eslint` de todos los .ts/.tsx tocados desde `162ff381` → exit 0.
- contrato-v1 + openapi-v1-congelado + openapi-v2 + postman-changelog-v2 + openapi-177 + script + plantilla-geo +
  n-niveles + 2 tests de componente + v2-ordenes: **11 archivos, 164 pasados, 1 skipped** (el skip es el caso de
  grabación). contrato-v1 en modo comparar: **22/22**. `git diff 162ff381 HEAD -- tests/fixtures/contrato-v1` vacío.
- v2-ordenes: 14/14 (13 + cupo).
- Guardias (323 archivos `*guardia*`/`tests/unit/guards`/`tests/guards`, 5 lotes): 322 verdes; único rojo
  `dependencias-declaradas-presentes` (4 tests, `init.sh` sin el marcador del paso 2 / `verificar-dependencias.mjs`;
  baseline aceptado, no tocado).
- Reportado por subagentes: bulk-orden-service* + roundtrips 261/261; componentes de carga masiva 160/160; página y
  listado 77/77; tests nuevos de componente 21/21.
- Script T8: NO se ejecutó contra ninguna base remota ni copia. Humo opcional solo contra `logistic_slt45`: sin
  `--copia` y con host distinto → «Rechazado…», exit 1; con `--copia localhost` → 0 empresas/0 órdenes (base vacía).
  `payloads-reales.json` y `respuestas/` sin tocar.

### Decisiones para revisar
- T6.2: mensaje fuera de §5 `{columna} es obligatoria` (todas las columnas de nivel vacías), calcado de
  `provincia es obligatoria` de CR. Catálogo sin nodos → sin columnas → `ubicacion: ["nivel 1: el nombre esta vacio"]`.
- T6.1: `COLUMNAS_NO_GEO_DE_PLANTILLA` es copia de `ORDENES_BULK_FIELDS` menos las 2 geo (la guardia
  `lib-no-importa-app` impide importar de `app/`); un test exige igualdad. Regla de choque ampliada a: cabecera vacía,
  dos profundidades con la misma cabecera, o igual a otro `nivel_{n}`. Un país de 2 niveles con tipos de nombre CR
  da columnas `provincia`, `canton` (no es forma CR).
- T6.3: `page.tsx` lee el catálogo con `new CatalogoGeograficoRepository(getPrismaClient()).deLaEmpresa()` por
  petición, solo si `puedeCargarMasiva`; si falla, registra y usa la plantilla de hoy. **No hermético:**
  `OrdenesPage.test.tsx` y `OrdenesPageFiltros.test.tsx` (existentes) no doblan el repositorio y en los casos de
  adminTienda intentan conectar a Postgres; caen al respaldo y pasan, pero el arreglo (un `vi.mock` del repositorio
  en esos archivos, sin tocar aserciones) queda para que lo autorice el leader. Todas las columnas de nivel son
  obligatorias en la cabecera del navegador. `COLUMNAS_GEO_DE_HOY` copia `COLUMNAS_GEO_DE_FORMA_CR` (no llevar
  `geografia-dominio` al bundle de cliente); test de igualdad.
- T8: `--copia` reutiliza `destinoDeUrl` de `geo-backfill-nodo.ts` (host o project-ref). Solo lectura doble: pool con
  `default_transaction_read_only=on` + `exigirSoloLectura` por transacción. Filtra empresas con el literal
  `PAIS_DEL_CONTRATO = "CR"`. `--muestra` tope 9999 (teléfono sintético de 8 dígitos).
- T7: tag `v2` de nivel superior; `FilaV2` sin `required` (R12 es error de fila); sin ejemplo en `Ubicacion` por la
  guardia `openapi-geografia-sin-cambios`; los títulos del censo 177 siguen diciendo «nueve»; descripción global de
  Postman ajustada a «10 endpoints de v1 + 5 de v2»; CHANGELOG con fecha literal `2026-11-xx`.

Veredicto T6–T8: tareas cerradas y verdes en local; T9 y T10 pendientes (fuera de esta tanda).

### Tests de la página de órdenes, herméticos frente al catálogo (decisión humana 2026-11-06)
- `tests/components/OrdenesPage.test.tsx` y `OrdenesPageFiltros.test.tsx`: `vi.mock("@/lib/repositories/CatalogoGeograficoRepository")` con `deLaEmpresa()` → catálogo de forma CR (Provincia/Cantón/Distrito, `crearCatalogo`), así `columnasGeoDePlantilla` da `null` (plantilla de hoy). Ninguna aserción tocada; `getPrismaClient` sin doblar (es perezoso y el repositorio doblado no lo usa).
- `DATABASE_URL=postgresql://x:x@127.0.0.1:1/x npx vitest run <2 archivos> --maxWorkers=1 --reporter=verbose --silent=false`: 2 files / 26 tests verdes. Log «el catalogo geografico no se pudo leer»: 6 apariciones en HEAD 066be8f0, 0 tras el cambio; el resto del stderr es idéntico (`EmpresaNoResuelta` de Notificacion/Zona y los avisos `act(...)`, ya presentes antes).
- `tsc --noEmit` exit 0; `eslint` de los 2 archivos: sin problemas.

## Arreglos de review (vuelta 1, `progress/review_SLT-45.md`; decisiones humanas 2026-11-06)
- **B1** (`1d1c66f0`): `scripts/geo-payloads-contrato-v1.ts` → `PAIS_DEL_CONTRATO = PAIS_DE_OPERACION.codigo`
  (`lib/config/pais.ts`); sin literal. El test del script no referencia la constante: sin cambios.
  `geo-payloads-contrato-v1` + `config/pais` + `etiquetas-geograficas-sin-literal`: 3 files / 26 tests verdes.
- **m1** (`3dfc71c1`): `procesarCargaApi`, `ejecutarCargaApi`, `CargaApiDeps`, `VersionCargaApi`, los tipos de
  bloque, mensajes, `describirErrorSeguro` y los 3 composition roots pasan, copiados literal, a `lib/api/api-carga.ts`
  (toda línea quitada de la ruta está en el módulo nuevo salvo imports). La ruta v1 conserva borde (bearer, schema,
  `handleCargaApi`, `POST`, `runtime`, `maxDuration`) y re-exporta los tipos; `app/api/v2/ordenes/route.ts` importa
  de `lib/api/api-carga`. `notificacion-notificadores-reales.test.ts`: misma aserción, ahora sobre
  `lib/api/api-carga.ts` (donde vive el cableado). Comentario de `BulkOrdenService` actualizado.
- **m2** (`7863a29f`): `OrdenesPageFranjaRetenidas.test.tsx` y `OrdenesRutearSatelite.test.tsx` ganan el mismo
  `vi.mock` del catálogo; ninguna aserción tocada. URL muerta, `--reporter=verbose --silent=false`: log «el catalogo
  geografico no se pudo leer» **2 → 0**; 15/15 antes y después.
- Verificación (base `logistic_slt45`, `--maxWorkers=1`, 8 GB):
  - `pnpm exec tsc --noEmit`: exit 0. `eslint` de los 8 archivos tocados: sin problemas.
  - contrato-v1 (modo comparar): 22/22. Con v2-* (6), `ordenes-api-key-carga*` (2), `tienda-destino` (2),
    `orden-nodo-escritura`, `orden-lugar-owner`: 12 files / 121 tests verdes.
  - Carga v1 y composición (URL muerta): `v2-composicion`, `carga-composition-root-cupo`, `api-key-modulo-inactivo`,
    `api-key-empresa`, `notificacion-notificadores-reales`, `carga-api-etiquetas`, `carga-api-key-sin-tarifa`,
    `asimetria-sin-tarifa`: 8 files / 106 tests verdes.
  - Guardias (336 archivos, 4 lotes): 335 verdes; único rojo `dependencias-declaradas-presentes` (4 tests, en baseline).

Veredicto: B1, m1 y m2 cerrados; verde en local salvo el rojo de baseline aceptado.
