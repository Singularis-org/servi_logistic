# Review SLT-201 «Manual de la API al día: Swagger/Postman con la carga completa y guía PDF actualizada»

Vuelta 1 · 2026-11-18 · HEAD `287313b4` (= head del PR #228) · diff `origin/dev...HEAD` (merge-base `ede99e23` = origin/dev).
Ruta **directa**, revisada a profundidad de ruta completa por ser contrato externo (pedido del leader).

## Veredicto: **OK**

Sin bloqueantes. Cuatro hallazgos menores, más una decisión abierta para Carlos sobre `intentos`.

## Checklist

- [x] **Ruta.** Directa, aprobada por Carlos el 2026-11-18 (`progress/features/SLT-201.md > Decisiones`).
  El suelo de `CHECKPOINTS.md > Ruta` pide la ruta completa si el diff toca integraciones externas o
  webhooks. Aquí no lo considero disparado: el diff no cambia ninguna ruta, ni la autenticación, ni la
  emisión de webhooks. Solo cambia documentación (`lib/api/openapi-spec.ts`, el YAML, Postman y la
  guía) y suma tests. La profundidad de la review fue la de la ruta completa. Ver M5.
- [x] **Especificación (directa).** El PR dice qué cambió y con qué test se prueba. Con la spec y el
  YAML de `origin/dev`, la guardia nueva da **11 failed | 5 passed (16)**. Lo repetí yo, y cuadra con
  la bitácora.
- [x] **Tasks.** No aplican: la ruta directa no tiene `tasks.md`.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs` → 10/40 archivos, 523/1000 líneas de producción y
  536/3000 de tests.
- [x] **Trazabilidad.** `progress/impl_SLT-201.md` trae el mapa R1–R5 → test. Cada R lo cubren `it`
  concretos de `tests/unit/guards/openapi-carga-claves-reales.guardia.test.ts`; R5 lo cubren
  `generar-pdf.py` y las guardias de la guía.
- [x] **Typecheck.** `npx tsc --noEmit` → TSC_EXIT=0.
- [x] **Lint** de los archivos tocados → LINT_EXIT=0.
- [x] **Tests de contrato.** Corrí con `con-desechable` `tests/unit/api`, `tests/unit/guards/openapi*`,
  la guardia nueva, `intentos-no-alcance`, `docs-marca-heredada` y `rechazo-nombre-466` →
  **42 files / 553 tests passed**.
- [x] **Sin cambio de comportamiento.** De `app/`, `lib/`, `db/`, `prisma/` y `components/` el diff
  solo toca `lib/api/openapi-spec.ts`.
  - Sus imports nuevos son `MSG` y un `import type`, más la clase `CargaNombreDuplicadoError`.
  - `IOrdenRepository.ts` solo tiene `import type`, así que no arrastra Prisma al bundle de
    `/api/docs/openapi`.
- [x] **Dependencias.** Ninguna nueva.
- [x] **Secretos y Ordenex.** Ningún secreto ni recurso de Ordenex. La URL de ejemplo es
  `https://<host-de-storage>/…`.
- [x] **Datos.** No hay tabla, query ni migración nuevas, así que no aplican RLS ni `organizacion_id`.
- [x] **Flujos críticos y E2E.** No toca `db/`, pantallas ni dinero, así que no exige E2E local.
- [x] **Comentarios.** Explican el porqué: 160/R31, el bug SLT-93 y el origen de cada causa del 403.
- [x] **CI** del PR #228 al revisar: `estatico` y `e2e (aislamiento)` en verde; los shards de vitest,
  pendientes. El leader confirma `gate-completo` antes del aviso.

## 1. Lo que documenta la spec existe en el código

| Contrato | Código |
|---|---|
| Éxito **200** | `app/api/ordenes/api-key/carga/route.ts:418` (`NextResponse.json(result, { status: 200 })`) |
| `name` (string, trim, 1..120, opcional) | `route.ts:240` |
| `download_type` (enum `consolidate`/`individual`, default `consolidate`) | `route.ts:245`; 422 por zod en `route.ts:289-292` |
| `downloadType` en la respuesta | `route.ts:318`, `:410` |
| `ordenes[].downloadUrl` (string \| null, siempre presente → `required` correcto) | `route.ts:409` |
| `etiquetasPdf` `{url, expiraEnSegundos}` \| `{error}` \| `null` | `route.ts:96-99`, `:320-364` (`{error}` también por tope, `:323-326`) |
| `manifiesto` `{filas, omitidas}` \| `{error}` \| `null` | `route.ts:110-113`, `:378-401` |
| `ManifiestoFila` / `ManifiestoOmitida` | `lib/types/manifiesto.ts:61-86` (más `intentos:81`) y `:94-97` (`motivo: "no_encontrada"`) |
| **409** `{status:"error", code:"CONFLICT", message}` por nombre repetido | `route.ts:261` (`ConflictError(err.message)`); `lib/errors/app-error.ts:59-61` (code `CONFLICT`); `lib/errors/codes.ts:20` (`CONFLICT: 409`); `lib/errors/http.ts:9`; mensaje en `lib/interfaces/repositories/IOrdenRepository.ts:464` |
| **500** `INTERNAL` / `MSG.INTERNAL` | `lib/errors/normalize.ts:46`; `lib/errors/codes.ts:21`, `:31` |
| Cabeceras de firma del webhook `X-Servi-Logistic-Signature` = `sha256=<hex>` de `<ts>.<cuerpo>`, y `X-Servi-Logistic-Timestamp` | `lib/crypto/webhook-firma.ts:11`, `:13`, `:21-23`, `:34-37`; TS `openapi-spec.ts:169-171` (de las constantes); YAML `:22-24` |
| Causas del 403 | `lib/services/ApiKeyAuthService.ts:86-107`; analítica `analitica/route.ts:144` (`exigirModuloActivo`, `lib/modulos/modulo-inactivo-error.ts:11`) y `:232-233` |
| Analítica: `parcial`, `corteAt`, `cobertura` | schema de la spec, `openapi-spec.ts:2433-2470` |
| Sin 429 | No hay rate limit en el código (auditoría D7). La guardia exige que ninguna operación lo declare |

## 2. ¿La guardia es tautológica? No

- **Petición.** Lee el AST de `carga/route.ts`, así que no compara la spec contra sí misma.
- **Respuesta.** Ejecuta `handleCargaApi` con dobles. Antes, coteja esos dobles contra el AST de
  `CargaViaApiSummary`, `CargaViaApiOrden`, `ManifiestoFilaDTO` y `ManifiestoOmitidaDTO`.
- **Mutaciones**, todas restauradas con `git checkout --` y con el árbol limpio después:

| # | Mutación | Resultado |
|---|---|---|
| M-a | Ruta: `downloadUrl` → `downloadURL` (`route.ts:409`) | **2 failed** (R2 consolidate e individual) |
| M-b | Spec: `CargaRequest.download_type.default` → `"individual"` | **1 failed** (R1 enum/default/tope) |
| M-c | Ruta deja de enviar `intentos` en `manifiesto.filas[]` | **1 failed**: «la fila ya no trae intentos; quita la excepción» |
| M-d | Spec publica `ManifiestoFila.intentos` | **3 failed**: `intentos-no-alcance` R31, R2 consolidate y R4 YAML `ManifiestoFila` |

- **El 409 por nombre**, en parte por diseño.
  - El `message` del ejemplo y el de la ruta salen de la misma clase `CargaNombreDuplicadoError`: en
    el texto la comparación es circular, igual que el precedente R38 con `MSG_CARGA_SIN_TARIFA`.
  - El **409** y el `code: "CONFLICT"` sí se miden contra literales: el `toBe(409)` y el `CONFLICT`
    del ejemplo.
  - Lo acepto: el texto exacto no es contrato, el código sí.

## 3. La excepción de `manifiesto.filas[].intentos`

- **Acotada.**
  - Es una lista de un solo elemento (`FUERA_DEL_CONTRATO_FILA_MANIFIESTO`).
  - Solo filtra las claves de la fila del manifiesto (`sinExcepciones` se aplica a `fila`, a nada más).
  - Tiene doble cerrojo: rojo si la ruta deja de enviarlo (M-c) y rojo si alguien lo publica (M-d).
  - El ejemplo de la spec usa `satisfies Omit<ManifiestoFilaDTO, "intentos">`, así que un campo nuevo
    del DTO rompe la compilación del ejemplo.
- **Fuga respecto de 160/R31.** Mi opinión: **sí, contradice R31.** R31 dice «NO DEBE agregar el
  conteo de intentos a los DTO **ni** a la documentación de la API por llave de integración». La
  respuesta de `POST carga` es un DTO de ese canal y hoy lo trae. La fuga **no la introduce
  SLT-201**: viene de la 160, que añadió `intentos` a `ManifiestoFilaDTO`, y de la 155, que reenvía
  esas filas tal cual en `route.ts:390`. Ocultarla del contrato es lo correcto mientras exista, pero
  lo coherente con R31 es **quitarla de la respuesta** de la API con una proyección en el borde, como
  hace analítica. Es un cambio de comportamiento, así que va en ficha propia. Si se quiere publicar,
  hay que revisar QA5. Decide Carlos (ya está abierto en `impl_SLT-201.md`).

## 4. La guía HTML no inventa nada

- **Filas nuevas de la tabla C.** Cuadran con `docs/api/CHANGELOG.md`:
  - 10-01 (`:69-100`): «Flete por devolución a origen», sin ruptura, ningún id cambia;
  - 11-03 (`:47-65`): `ivaFulfillment`, `"0.00"`, `costoEnvio` y `total` lo incluyen,
    `OrdenCosto additionalProperties: false` (`openapi-spec.ts:1564`), §5.1-§5.4;
  - 11-05 (`:24-43`): zona horaria del país de la empresa, §4.5/§5.3/§5.8.
- **«Ya está en producción»** (bloques A y B). Sale del código, no del CHANGELOG: `origin/prod` tiene
  los estados nuevos (`git show origin/prod:lib/types/order-status.ts` → `entregado`). La entrada
  09-23 del bloque B existe (`CHANGELOG.md:189`). Ver M3.
- **§5.1** «Estos tres bloques están en el contrato OpenAPI publicado»: es verdad tras este diff.
- **Postman.** El JSON es válido. `{{$timestamp}}` es una variable dinámica de Postman.

## Hallazgos

- **menor M1. El YAML espejo no está bajo guardia en los ejemplos nuevos.** R4 compara propiedades,
  `required` y la existencia de `oneOf`. No compara:
  - el `message` del 409 `nombreRepetido` (YAML `:206`, literal);
  - el ejemplo del 500 (YAML `:2657`);
  - la descripción de `Forbidden`;
  - las variantes de `CargaEtiquetasPdf` y `CargaManifiesto`.

  Si cambia `CargaNombreDuplicadoError` o `MSG.INTERNAL`, el YAML diverge en verde. Es el mismo
  criterio de espejo que el resto del YAML; queda como deuda opcional.
- **menor M2. El 500 se verifica por su forma, no por su HTTP.** R3 compara la salida de
  `withErrorHandler` con el ejemplo. No pasa por `appErrorToResponse` ni comprueba el status 500
  (`codes.ts:21`).
- **menor M3. Guía y CHANGELOG se contradicen.** La guía dice «ya en producción» y
  `CHANGELOG.md:106` (2026-09-24) sigue con «Fecha de despliegue: PENDIENTE». La bitácora lo deja
  abierto para Carlos, que tiene la fecha. «Se desplegó junto con el bloque B» es una inferencia
  (los dos están en prod), no un dato con fecha.
- **menor M4. El 409 por nombre se publica y en prod hoy da 500.** Es el bug SLT-93 «API v1: nombre
  de lote repetido responde 500 en vez de 409», PR #227. La guía ya lo prometía y Carlos decidió
  documentar el contrato correcto. Recomiendo mergear #227 antes o junto con #228, para que Swagger
  no prometa un 409 que prod todavía no da.
- **menor M5. El suelo de la ruta queda anotado.** El contrato publicado es de una integración
  externa. Lo doy por no disparado (cero cambio de runtime, review a profundidad completa y
  aprobación explícita de Carlos). Si el humano lee el suelo de forma literal, la ficha tendría que
  subir de ruta: lo decide él, no este diff.
- (Info) Los ejemplos nuevos usan «San José Centro» y «Juan Pérez», igual que los ejemplos que ya
  existen en la spec. No es un literal de país ni de moneda en lógica.

## Evidencia (logs en el scratchpad de la sesión)
- Guardia con la spec y el YAML de `origin/dev`: 11 failed | 5 passed (16), EXIT=1.
- Contrato con HEAD: 42 files / 553 tests passed, EXIT=0.
- Mutaciones M-a a M-d: todas EXIT=1. `git status` limpio después de cada una.
- `tsc` EXIT=0; `eslint` EXIT=0; tamaño 10/40 · 523/1000 · 536/3000.
