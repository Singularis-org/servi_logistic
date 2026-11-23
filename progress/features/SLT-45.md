# SLT-45 «Geografía jerárquica: API v1/v2 y carga masiva»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-45 | geo-jerarquica-entrada | backend | high | feature/SLT-45-geo-jerarquica-entrada | Camilo (6ace53aa94bfd46ee6a600a5) | in_progress (tomada) |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.3 2026-11-06: T1–T8 hechas; review APROBADO tras arreglos (`progress/review_SLT-45.md`). PR a dev abierto.
Antes de `done`: fecha real en CHANGELOG (m3, con su test), T9 (humano) y T10.
Spec en `specs/SLT-45-geo-jerarquica-entrada/` (R1–R36, T1–T10). Rama sobre SLT-71 (PR #81).
T9 (payloads reales desde la copia de producción) la hace una persona, no un agente.

## Evaluación
- zone backend: API v1 (adaptador sin cambio de contrato), API v2 nueva, `resolveGeo` y carga masiva a N niveles,
  escritura de `nodo_geografico_id` más las 3 FK viejas. Sin pantalla.
- complexity high: contrato de v1 congelado byte a byte para integradores en producción, payloads reales
  anonimizados, plantilla CR de carga masiva intacta, países de prueba de 2 y 4 niveles.
- Cupo backend: 5 en vuelo con esta (SLT-43, 44, 65, 71, 45); tope 5 desde el PR #82.
- Dependencia: SLT-44 sin mergear (PR #55). Rama apilada sobre SLT-71, que contiene 43, 44 y 65.
- Cruce de archivos (F2.0, `archivos-en-vuelo.mjs --candidata SLT-45`): sin conflicto con otras personas. Solo avisos
  con fichas propias: SLT-43/44/65/71 (`OrdenRepository.ts`, `package.json`, guardia `geografia-dominio-puro`; las
  trae la rama apilada) y SLT-86 (`BulkOrdenService.ts`, rutas `carga` y `carga-masiva/chunk`). Orden: entra
  después de SLT-86 o se integra al sincronizar. SLT-88 (Carlos) sin rama publicada: no comprobable.

## Decisiones
- 2026-11-05 (humano): «arranca 45 desde 71»: la rama nace sobre `feature/SLT-71-geo-jerarquica-transito-analitica`.
- 2026-11-05 · Alcance y decisiones cerradas en `specs/SLT-45-geo-jerarquica-entrada/requirements.md` (`/afinar-feature`; tarjetas SLT-45 y SLT-80 actualizadas).
- 2026-11-05 (humano, T3.2): `CorregirDatosClienteService` pone `nodoGeograficoId` él mismo (design §3.2).
  Las 2 aserciones de `corregir-datos-cliente-service.test.ts` (~627, ~669) ganan `nodoGeograficoId`;
  es la única excepción aceptada a «sin cambiar aserciones» de T3.2.
- 2026-11-06 (humano): la guardia `geografia-lecturas-sin-nodo-fk` (SLT-65 R19) se acota a lecturas;
  las 2 escrituras de SLT-45 en `OrdenRepository.ts` (`toCreateManyInput`, `corregirDatosCliente`) quedan
  exentas por nombre, con el motivo en el test.
- 2026-11-06 (humano): `OrdenesPage.test.tsx` y `OrdenesPageFiltros.test.tsx` ganan `vi.mock` del repositorio del
  catálogo (sin cambiar aserciones), para no conectar a Postgres por accidente.
- 2026-11-06 (humano): mensaje de T6.2 `{columna} es obligatoria` (todas las columnas de nivel vacías) se queda;
  añadido a design §5.
- 2026-11-06 (humano, review B1): el script `geo-payloads-contrato-v1.ts` toma el país de
  `PAIS_DE_OPERACION.codigo` (`lib/config/pais.ts`), sin literal «CR».
- 2026-11-06 (humano, review m2): `OrdenesPageFranjaRetenidas` y `OrdenesRutearSatelite` ganan el mismo
  `vi.mock` del catálogo, sin cambiar aserciones.

## Preguntas abiertas
- 2026-11-05 (implementer, T1): bug de v1 fuera de alcance. `POST /api/ordenes/api-key/carga` con un `name`
  ya usado por la misma key responde 500 INTERNAL, no el 409 de la feature 141/R24: con `@prisma/adapter-pg`
  el P2002 llega con `meta.target` «(not available)» y `esNombreDuplicado` (`lib/repositories/carga-lote.ts:32`)
  devuelve false. El paso de nombre repetido se quitó del payload `lote-con-nombre-e-individual` para no
  congelar el 500. **Cerrada 2026-11-06 (humano: «si»): ficha propia SLT-93**, pending, sin asignar.

## Tandas
- 2026-11-05 · T1–T3 (T3.2 parcial) · `4107a48f`, `d5ae4cc8`, `adbb2a26`…`3f3428cb` · tsc 0; contrato v1 22/22;
  347/347 por nombre; `orden-nodo-escritura` 5/5. `vitest related` cortado por memoria (veredicto en CI).
  3 suites de integración paran en `beforeAll` por base `logistic_slt45` sin órdenes (falta seed).
- 2026-11-06 · T3.2 cierre, T4.1–T4.4 · `78dca2e0`…`5074662c` · tsc 0; contrato v1 22/22, fixtures intactos;
  tests por nombre verdes. Rojo: guardia `geografia-lecturas-sin-nodo-fk` desde T3.1 (se arregla al
  empezar T5). 4 suites de integración paran por base sin `orden`/`usuario` (el seed solo crea catálogos).
- 2026-11-06 · guardia SLT-65 acotada + T5.1–T5.8 · `9a946dd5`…`75bc0228` · tsc 0; eslint 0; guardias 237
  archivos en lotes, único rojo `dependencias-declaradas-presentes` (baseline); contrato v1 22/22; suites v2
  62/62 contra Postgres. `buildDetallePorOrdenId` movido a `lib/api/api-orden-detalle.ts`. Huecos: R13
  «ambiguo» solo en unit (índice único lo impide en base); R17 cupo sin caso propio en `v2-ordenes`.
- 2026-11-06 · T6.1–T6.3, T7.1–T7.2, T8.1–T8.2 + caso cupo R17 · `1ed838df`…`194eaa5a` · tsc 0; eslint 0;
  contrato v1 22/22; openapi-v1-congelado verde; 164 pasan; guardias 323 archivos, único rojo el del
  baseline. Script T8 probado solo contra `logistic_slt45`. Pendiente antes del PR: CHANGELOG con fecha
  `2026-11-xx` (se fija al mergear).
- 2026-11-23 · F2.3 merge de `origin/geo_jerarquica` (7763f365: SLT-43/44/65/71 + dev) · 13 conflictos
  resueltos con las dos intenciones. Del lado de dev: SLT-86 (sin cupo de órdenes: fuera el 4.º parámetro
  de `BulkOrdenService`, fuera el caso «R17 al tope del plan»), SLT-94 (destino por «se recoge en
  tienda», en el pipeline común v1/v2), SLT-42/SL-21 (reglas del país en etiquetas, manifiesto y
  detalle), SLT-201 (500 genérico: también en las 5 operaciones de v2), SLT-202 (cabecera del listado).
  Fixture `contrato-v1/openapi-v1.json` regrabado (humano, 2026-11-21): idéntico byte a byte al
  grabado con el spec de 7763f365, toda diferencia viene de dev; `BASE` = 7763f365; las respuestas
  grabadas de v1 siguen pasando 22/22 sin regrabar. Guía de la API: secciones 5.11–5.15 de v2 (SLT-80
  R1316; humano, opción a), ejemplos en bloques `http` (el E2E de SLT-208 solo ejecuta los `curl` de v1).
  tsc 0; eslint 0 errores; guardias + `tests/unit/{api,ayuda,asistente}` 425 archivos verdes; integración
  en `servi_logistic_slt45_integ`: contrato v1 22/22, v2 13/13, planes, pago-plataforma, orden-nodo
  verdes; `carga-nombre-duplicado-real` 1 rojo local por Postgres 16 (CI usa ≥17).
  Merge `b8e8de4d`. CI `gate.yml` run 45183419205: gate-completo verde a la primera (vitest 3/3, e2e
  aislamiento/dinero/reparto, estático): https://github.com/Singularis-org/servi_logistic/actions/runs/45183419205

<!-- tamano-pr-aceptado: 2026-11-21 · pila geo, aceptado por el humano -->

## Modelos (overrides)

## Cierre
