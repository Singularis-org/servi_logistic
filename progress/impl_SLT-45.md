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
