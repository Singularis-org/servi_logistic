# review SLT-45 «Geografía jerárquica: API v1/v2 y carga masiva» — vuelta 1

> Reviewer, 2026-11-06. Alcance: SOLO el diff de SLT-45, `git diff 4ed3e4a8..HEAD` (HEAD `8eaef066`), sobre la
> rama apilada en SLT-71. BASE del contrato = `cedd19fd`. Worktree `.worktrees/SLT-45-geo-jerarquica-entrada`.
> Tests corridos SOLO contra la base local `logistic_slt45` (o contra una URL muerta `127.0.0.1:1` para los
> herméticos); nunca `logistic`, remoto ni producción. MCP del grafo no usado (este worktree no está indexado);
> exploración con Grep/Read/git.

## Veredicto: **CAMBIOS** (RECHAZADO)

Un solo bloqueante, de una línea (B1: literal de país en código nuevo, regla de `docs/perfil-agentes.md >
reviewer`). Todo lo demás está verde o es menor / pendiente de cierre. Si el humano prefiere aceptar el literal
como excepción (el script es, por spec, de Costa Rica), basta con anotarlo en `progress/features/SLT-45.md >
Decisiones` y el veredicto pasa a OK sin vuelta de código.

## Verificación ejecutada (no se confió en la bitácora)

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `eslint` de los 95 `.ts/.tsx` añadidos/modificados | 0 errores, 4 warnings preexistentes (`IOrdenRepository.ts:11`, `corregir-datos-cliente-service.test.ts:121-123`) |
| 22 unit/guardias/componentes nuevos o tocados (openapi-v1-congelado, openapi-v2, postman-changelog-v2, openapi-177, v2-composicion, geo-ubicacion, geo-resolucion-v1-mensajes, api-v2-servicios, geografia-api-service, plantilla-geo, n-niveles, forma-pais, script de payloads, 4 guardias tocadas, middleware, corregir-datos-cliente, FranjaRetenidas, 2 de columnas geo) | 22 archivos, 417 pasan, 1 skip (el modo grabación) |
| Integración contra `logistic_slt45`: contrato-v1 (modo comparar), v2-ordenes, v2-cotizacion, v2-consulta, v2-geografia, v2-aislamiento, v2-paises-de-prueba, orden-nodo-escritura, orden-lugar-owner | 9 archivos, 69/69 |
| R4/R32 — suites existentes de v1 y de carga masiva: `ordenes-api-key*`, `cotizacion-api-key`, `carga-api-etiquetas`, `ordenes-carga-masiva-chunk`, `bulk-orden-service*`, `api-key-empresa` | 30 archivos, 540/540 |
| R29/R32 — componentes de carga masiva, roundtrips y páginas de órdenes (18 archivos) | 228/228 |
| Páginas de órdenes que NO doblan el catálogo (5 archivos) | 51/51 verdes; ver m2 |
| Guardias (`vitest run guard`, base `logistic_slt45`) | 336 archivos: 335 verdes; único rojo `dependencias-declaradas-presentes` (4 tests), listado en `tests/baseline-rojos.json`: deuda ajena, no es hallazgo |
| `git diff 4107a48f..HEAD -- tests/fixtures/contrato-v1` | vacío: fixtures intactos desde T1 |
| `git diff 4ed3e4a8..HEAD -- db e2e docs/dependencias.md pnpm-lock.yaml` | vacío: sin migraciones, sin E2E, sin dependencias |

## Checklist

### CHECKPOINTS.md
- [x] requirements.md con EARS R1–R36.
- [x] design.md con alternativas descartadas (§11, seis).
- [ ] Todas las tasks `[x]`: faltan **T9.1, T9.2** (puerta de release humana / CI, por diseño) y **T10.1** (cierre:
  `./init.sh` + mapa R→test consolidado). Pendiente de cierre, no bloqueante en esta vuelta (m4).
- [x] `## Lo que ya existe` presente y no vacío; el diff reutiliza lo listado (`resolveGeo` intacto,
  `geografia-dominio`, `CatalogoGeograficoRepository`, `lugarDeLaOrden`, `handleCargaApi`/`handleCotizacionApi`/
  `handleConsultaOrdenApi`, trigger sin tocar). No re-crea nada de la lista. Duplicaciones menores justificadas y con
  test de igualdad (m5).
- [x] Assignee y rama (`progress/features/SLT-45.md`).
- [x] Cada R<n> con test concreto (mapa abajo), salvo R36 y los payloads reales de R2/R9, sin test por diseño.
- [~] Mapa R→test en `progress/impl_SLT-45.md`: existe, repartido por tandas; falta el consolidado de §12 (T10.1).
- [x] Typecheck y lint.
- [ ] `gate-completo` de CI: pendiente (T9.2).
- [~] Flujo crítico «entrada sin sesión (API key)» → `e2e/dos-empresas-humo.spec.ts` lo corre el CI (T9.2). Sin E2E
  nuevo, conforme a R36 y a la decisión cerrada.
- [x] Sin dependencias nuevas.
- [x] Sin secretos; sin webhooks nuevos; nada de entorno hardcodeado (el script toma el host de `--copia` y de
  `DATABASE_URL`).

### docs/checkpoints-proyecto.md
- [x] Typecheck / lint.
- [ ] `./init.sh` en el worktree: no corrido por el reviewer (lo cierra T10.1).
- [x] Sin tablas nuevas; sin migraciones (R28).
- [x] Query nueva `findLugarDeOrdenForOwner`: dueño forzado + `deletedAt: null`; la empresa la pone la extensión
  `extension-empresa` y la RLS de `orden`, igual que su hermana `findDetalleByOrdenIdForOwner`. Test de integración
  con dos empresas: `tests/integration/db/orden-lugar-owner.test.ts` (B no ve la orden de A con su id y dueño reales).
- [x] Ningún recurso de Ordenex.
- [x] Sin `console.log` de PII: el script imprime solo cifras; el rechazo no imprime el host (test «el rechazo no
  imprime el host real»).
- [x] Capas: rutas v2 = borde (zod + auth + `conEmpresaDeLaKey`), lógica en `BulkOrdenService`/
  `CotizacionOrdenService`/`GeografiaApiService`, datos en repositorios. `geo-ubicacion.ts` puro, en la guardia de
  pureza.
- [x] zod en el borde: `cargaV2BodySchema`, `crearOrdenV2BodySchema`, `cotizacionV2BodySchema`,
  `geografiaQuerySchema`.
- [ ] País sin literales: **B1**.
- [x] Autorización en el servidor: `actor.rol === "apiKey"` en `cargarViaApiV2`, `cotizarV2`,
  `GeografiaApiService.catalogo` y `.ubicacionDeOrden` (tests «R11 — otro rol sale `forbidden`…»). Módulo apagado:
  `buildAutenticar` (heredado) y rutas v2 dadas de alta en `MODULO_POR_API` (`lib/modulos/reparto.ts`).

### Puntos pedidos por el leader
- **Contrato v1 congelado.** `tests/fixtures/contrato-v1/**` solo tiene el commit de T1 (`4107a48f`); `BASE` =
  `cedd19fd`. contrato-v1 en modo comparar 22/22. `openapi-v1-congelado` verde; en `openapi-spec.ts` y el `.yaml`
  el diff es solo aditivo (cero líneas quitadas). La única edición posterior de la suite de contrato es inyectar
  `CatalogoGeograficoRepository` como en producción (para que R5 corra y se vea que CR no cambia un byte): correcto.
  En el código de v1: `handleCargaApi` extrae su cuerpo a `procesarCargaApi` sin cambiar una línea de lógica (diff
  revisado), `version` por defecto `"v1"`, y `buildDetallePorOrdenId` se mueve a `lib/api/api-orden-detalle.ts`
  tal cual.
- **Aserciones de tests existentes.** Revisadas una a una las 36 modificaciones de `tests/`. Cambian aserciones
  solo las autorizadas: 2 en `corregir-datos-cliente-service.test.ts` (+`nodoGeograficoId: "d-2"`),
  `SELF_AUTH_ROUTES` en `rastreo-sin-ruta-nueva` (+`/api/v2`; `middleware.test.ts` solo añade un `describe`), censo
  `openapi-177` 9→14 (tres `toHaveLength` y `...PATHS_V2`), guardia SLT-65 acotada (exención por nombre con
  contraprueba). `openapi-canal-rutas-reales` amplía el escaneo a `app/api/v2` y añade 2 `it` (lo pide T7.1). El
  resto son fixtures/dobles que ganan el campo obligatorio `nodoGeograficoId` o los métodos nuevos de interfaz
  (`cargarViaApiV2`, `cotizarV2`, `findLugarDeOrdenForOwner`) y los 2 `vi.mock` autorizados de las páginas: ninguna
  aserción tocada.
- **Aislamiento por empresa en v2.** Catálogo: `catalogo.paisId !== paisId` → `not_found` antes de leer `pais`;
  ajeno e inexistente dan el mismo 404 byte a byte (`v2-geografia` R23, `v2-aislamiento` último caso). Zonas,
  consulta y duplicados aislados (`v2-aislamiento`, 5 casos).
- **R13 «ambiguo» solo en unit.** Basta. Hermanos con el mismo nombre normalizado no pueden existir en la base
  (`nodo_geografico_padre_id_nombre_normalizado_key` y, para raíces, `nodo_geografico_raiz_pais_id_nombre_normalizado_key`,
  migración `20261104120200`), así que el caso no es alcanzable extremo a extremo; el camino de código está cubierto
  en raíz y en n>1 (`geo-ubicacion.test.ts` «ambiguo en la raiz y en n > 1»). El «ambiguo» de R14 (código
  compartido entre tipos) sí está extremo a extremo (`v2-ordenes` R14).
- **route.ts que exportan helpers.** Ver m1.
- **`OrdenesPageFranjaRetenidas.test.tsx`.** Ver m2.
- **CHANGELOG `2026-11-xx`.** Ver m3.
- **Dependencias nuevas.** Ninguna (`package.json` solo gana el script `geo:payloads-contrato`).

## Hallazgos

### B1 — BLOQUEANTE · literal de país en código nuevo
`scripts/geo-payloads-contrato-v1.ts:48` — `export const PAIS_DEL_CONTRATO = "CR";`, usado en `:308` para elegir
las empresas de la muestra. `docs/perfil-agentes.md > reviewer` marca bloqueante «literal de país o moneda (Costa
Rica, colones, SINPE) en código nuevo», y `docs/checkpoints-proyecto.md > Arquitectura` pide que el país salga de
configuración. Que el script sea, por spec, de Costa Rica (R2) no cambia la regla: dice de qué país es, no dónde se
escribe.
**Qué falta:** sacar el país de una sola fuente que no sea un literal nuevo. Opciones, de menor a mayor cambio:
(a) `PAIS_DE_OPERACION.codigo` de `lib/config/pais.ts`; (b) un `--pais` obligatorio, con el valor documentado en
la cabecera de la suite de contrato. Con cualquiera de las dos, el test del script sigue igual.
Alternativa sin código: que el humano acepte la excepción por escrito en `progress/features/SLT-45.md > Decisiones`.

### m1 — menor · rutas v2 que importan de otros `route.ts` y un helper nuevo exportado desde una ruta
`app/api/ordenes/api-key/carga/route.ts` exporta ahora `procesarCargaApi` (helper, no handler) y el tipo
`VersionCargaApi`; `app/api/v2/ordenes/route.ts` lo importa de ese `route.ts`, y las otras tres rutas v2 importan
`handle*` de rutas v1. Es el patrón que v1 ya tiene (29 `export async function handle*` en `app/api/**/route.ts`), y
la propia ficha movió `buildDetallePorOrdenId` a `lib/api/` con el motivo «un route.ts solo exporta handlers HTTP y
config». `procesarCargaApi` contradice ese motivo. Aceptable en esta ficha; lo coherente sería moverlo a
`lib/api/` como se hizo con el detalle. No se verificó con `next build`; el gate de CI lo dirá.

### m2 — menor · dos tests de página leen el catálogo sin doblarlo
`OrdenesPageFranjaRetenidas.test.tsx` (caso «adminTienda: la lectura NO se dispara») y
`OrdenesRutearSatelite.test.tsx` (caso «sin acceso total: el adminTienda…») renderizan la página como
`adminTienda`, así que `puedeCargarMasiva` es true y `resolverColumnasGeoCarga` construye el
`CatalogoGeograficoRepository` real. Medido con una URL muerta: **1 lectura por archivo**, que falla, cae al
respaldo (`null` = plantilla de hoy) y registra `[AppError:INTERNAL] … el catalogo geografico no se pudo leer`. Con
base real pasaría igual (sin empresa en contexto, `deLaEmpresa` lanza y cae al mismo respaldo). **La lectura no
altera ninguna aserción** («la lectura NO se dispara» se refiere a `resumenReprogramadasRetenidasCentral`, que está
doblada aparte). Las aserciones son las mismas con o sin base, pero los tests dejan de ser herméticos: intentan
conectar con Postgres. Los otros 3 que renderizan la página (`OrdenesModuleReuse`, `OrdenesPagination`,
`RecepcionSateliteIncidente`) no llegan a leer. Si se quiere hermético, el mismo `vi.mock` de los otros 2 tests de
página (requiere la misma autorización humana: es cambio en tests existentes, sin tocar aserciones).

### m3 — menor (pendiente de cierre) · CHANGELOG con fecha literal `2026-11-xx`
`docs/api/CHANGELOG.md`. Se fija al mergear (design §9). Ojo: `tests/unit/api/postman-changelog-v2.test.ts:15`
fija el título literal `"## 2026-11-xx — API v2 (aditiva): ubicación por nodo"`, así que **poner la fecha real
pondrá rojo ese test** si no se cambia en el mismo commit (mejor: que el test acepte `\d{4}-\d{2}-\d{2}` y rechace
`xx`). R35 pide una entrada «fechada»: hasta entonces R35 no está cumplido del todo.

### m4 — menor (pendiente de cierre) · tasks abiertas
T9.1 (payloads reales desde la copia, persona: `payloads-reales.json` sigue `[]`), T9.2 (gate completo de CI, con
`dos-empresas-humo`) y T10.1 (`./init.sh` + mapa R→test consolidado según §12 en `impl_SLT-45.md`; hoy está
repartido por tandas y la entrada R26 de T3 aún dice «la parte del servicio está abierta», cerrada después en T3.2).
`CHECKPOINTS.md` exige todas `[x]` antes de `done`.

### m5 — menor · copias con test de igualdad
`COLUMNAS_NO_GEO_DE_PLANTILLA` (copia de `ORDENES_BULK_FIELDS` sin las 2 geo; la guardia `lib-no-importa-app`
impide importarlo), `COLUMNAS_GEO_DE_HOY` (no meter `geografia-dominio` en el bundle de cliente) y
`tests/integration/api/_v2-escenario.ts` (siembra copiada de la suite de contrato congelada). Las dos primeras tienen
test de igualdad; aceptable.

### m6 — nota · Postman
La descripción global de la colección cambia de «Los 10 endpoints…» a «10 de v1 + 5 de v2». Las peticiones de v1 no
cambian. R1 solo congela el OpenAPI; no es hallazgo.

### m7 — nota · pregunta abierta heredada
El 500 de v1 con `name` repetido (pregunta abierta en `progress/features/SLT-45.md`) es preexistente y quedó fuera
del contrato a propósito. Decide el humano si abre ficha.

## Mapa R → test (verificado)

| R | Test |
|---|---|
| R1 | `tests/unit/api/openapi-v1-congelado.test.ts` |
| R2 | `tests/integration/api/contrato-v1.route.test.ts` (sintéticos, 22/22). Payloads reales: T9.1 (persona), por diseño |
| R3 | `tests/unit/services/geo-resolucion-v1-mensajes.test.ts` + contrato-v1 (payloads `geo-*`) |
| R4 | suites v1 existentes sin cambio de aserciones (`ordenes-api-key-*`, `cotizacion-api-key`, `carga-api-etiquetas`; 540/540) |
| R5 | `v2-paises-de-prueba.route.test.ts` (bloque v1) + `bulk-orden-service.forma-pais.test.ts` |
| R6, R7, R8 | `tests/unit/scripts/geo-payloads-contrato-v1.test.ts` |
| R9 | contrato-v1 «cada payload tiene su respuesta grabada» + un `it` por payload |
| R10 | `v2-ordenes` «R10…» + `openapi-canal-rutas-reales` «SLT-45 (R10)…» |
| R11 | `v2-ordenes` (401, 403, empresa/tienda de la key), `v2-cotizacion`/`v2-consulta` (401/403), `api-v2-servicios` y `geografia-api-service` (`forbidden` en el service), `middleware.test.ts` |
| R12 | `v2-ordenes` «R12…» + `api-v2-servicios` |
| R13 | `v2-ordenes` «R13…» + `geo-ubicacion.test.ts` (ambiguo solo unit; inalcanzable en base por índice único) |
| R14 | `v2-ordenes` «R14…» + `geo-ubicacion.test.ts` |
| R15 | `v2-ordenes` «R15…», `v2-paises-de-prueba`, `geo-ubicacion.test.ts` |
| R16 | `v2-ordenes` «R16…», `geo-ubicacion.test.ts` |
| R17 | `v2-ordenes` «R17…» (forma = v1, nodo y FK, cupo del plan 409) |
| R18 | `v2-ordenes` «R18…» (×2) |
| R19 | `v2-cotizacion` «R19…» (×5) |
| R20 | `v2-consulta` «R20…», `orden-lugar-owner.test.ts`, `geografia-api-service` |
| R21 | `v2-consulta` «R21…», `geo-ubicacion.test.ts` (`rutaPublica`) |
| R22 | `v2-geografia` «R22…», `v2-paises-de-prueba`, `geografia-api-service` |
| R23 | `v2-geografia` «R23…» (×2) |
| R24 | `v2-aislamiento` (5 casos) + `orden-lugar-owner.test.ts` |
| R25, R27 | `tests/integration/db/orden-nodo-escritura.test.ts` (v1 p3, v2 p3, p2 por repositorio) |
| R26 | `orden-nodo-escritura.test.ts` (corregir) + `corregir-datos-cliente-service.test.ts` (2 aserciones autorizadas) |
| R28 | `orden-nodo-escritura.test.ts` (`pg_get_functiondef`); sin migraciones en el diff |
| R29 | `plantilla-geo.test.ts` (CR → null), `CargaMasivaColumnasGeo.test.tsx`, `OrdenesCargaColumnasGeoCableado.test.tsx`, roundtrips existentes |
| R30 | `plantilla-geo.test.ts` + casos no-CR de los 2 tests de componente |
| R31 | `tests/unit/services/bulk-orden-service.n-niveles.test.ts` |
| R32 | `bulk-orden-service*`, roundtrips de plantilla y errores, componentes de carga masiva: sin cambio de aserciones |
| R33 | `v2-paises-de-prueba` (2 y 4 niveles) + `geo-ubicacion.test.ts` |
| R34 | `openapi-v2.test.ts` + `openapi-canal-rutas-reales.guardia.test.ts` + censo `openapi-177` (14) |
| R35 | `tests/unit/api/postman-changelog-v2.test.ts` |
| R36 | sin test por diseño: gate completo de CI (T9.2); `git diff -- e2e` vacío |

## Re-review 2026-11-06 (acotada a 2f4ef70b..HEAD)

Commits: `5bdcc60d` (decisiones), `1d1c66f0` (B1), `3dfc71c1` (m1), `7863a29f` (m2), `bd299417` (bitácora).

### Verificación ejecutada
- `tsc --noEmit`: verde. `eslint` sobre los 8 archivos tocados: verde.
- Base local `logistic_slt45` (helper `env45.sh`, URL comprobada `localhost:5432/logistic_slt45`), `--maxWorkers=1`:
  - FranjaRetenidas, RutearSatelite, notificadores-reales, `geo-payloads-contrato-v1`, `ordenes-api-key-carga`,
    `ordenes-api-key-carga-generate`, `contrato-v1`, `v2-aislamiento`: 8 archivos, 145 tests verdes.
  - `v2-ordenes`, `v2-paises-de-prueba`, `v2-aislamiento`, `ordenes-api-key-tienda-destino`: 4 archivos, 34 verdes.
  - `tests/guards`: 17 archivos, 164 verdes (incluye `lib-no-importa-app`).

### Checklist
- [x] **B1 resuelto.** `PAIS_DEL_CONTRATO = PAIS_DE_OPERACION.codigo` (`lib/config/pais.ts`); sin literal `"CR"` en
  el script. Coincide con la decisión humana del 2026-11-06. El test del script sigue verde sin cambios.
- [x] **m1, extracción literal.** `diff` de la `route.ts` en `2f4ef70b` contra `lib/api/api-carga.ts`: solo salen el
  borde HTTP (`runtime`, `maxDuration`, `extraerBearer`, `cargaApiBodySchema`, `handleCargaApi`, `POST`) y sus
  imports, y cambia la cabecera. El cuerpo de `procesarCargaApi`, `CargaApiDeps`, `VersionCargaApi` y los
  composition roots es idéntico. La `route.ts` v1 conserva el borde byte a byte, importa el pipeline y re-exporta
  los tipos (los tests de integración que importan `CargaApiDeps` desde la ruta siguen compilando). El test de
  no-regresión «la ruta exporta solo POST + `handleCargaApi`» sigue verde. `app/api/v2/ordenes/route.ts` importa
  de `lib/api/api-carga`. v1 sin cambio de comportamiento: `contrato-v1` y las suites v1 de carga, verdes.
- [x] **m1, aserción movida en `notificacion-notificadores-reales.test.ts`.** Es consecuencia aceptable del
  movimiento, **no es hallazgo**. Lo que el test verifica es dónde se cablea el notificador real: en el composition
  root, no en el default del servicio. El composition root se movió literalmente a `lib/api/api-carga.ts`. La
  aserción es la misma (`toContain("notificarCargaMasivaTerminadaReal")`) y ahora apunta al archivo donde vive
  el cableado. Mantenerla en `route.ts` la dejaría roja sin que el comportamiento haya cambiado. El
  comentario de `BulkOrdenService.ts` se actualizó en coherencia.
- [x] **m2.** Los dos archivos solo ganan el `vi.mock` de `CatalogoGeograficoRepository` (el mismo doble de los
  otros tests de página) y un comentario. `git diff` sin líneas `-`: ninguna aserción cambia. Cubierto por la
  decisión humana del 2026-11-06.
- [x] **Sin dependencias nuevas.** `package.json` y el lockfile no están en el diff.
- [ ] m3 (fecha del CHANGELOG) y m4 (T9/T10): siguen **pendientes de cierre** y no bloquean esta vuelta.

### Hallazgos nuevos
- **n1 — nota (no introducida aquí).** `app/api/cron/purga-pdf-cargas/route.ts:26` cita
  `app/api/ordenes/api-key/carga/route.ts:75` como precedente de `maxDuration`. La línea ya estaba desfasada antes
  de este diff (en `2f4ef70b` era la 87; ahora es la 52). Si se toca, conviene citar el símbolo y no el número de línea.
- **n2 — nota (no introducida aquí).** `extraerBearer` sigue duplicado entre la `route.ts` v1 y
  `lib/api/api-key-request.ts`. La extracción literal lo deja como estaba, y es lo correcto para m1.

### Veredicto: **APROBADO**
B1 está resuelto y m1 y m2 están cerrados sin regresiones. No hay hallazgos bloqueantes nuevos. Antes de `done`
quedan m3 y m4 (`CHECKPOINTS.md` exige todas las tasks `[x]`).
