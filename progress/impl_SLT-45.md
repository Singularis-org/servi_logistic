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
