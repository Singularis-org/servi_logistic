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
