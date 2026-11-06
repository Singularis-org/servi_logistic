# SLT-45 «Geografía jerárquica: API v1/v2 y carga masiva»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-45 | geo-jerarquica-entrada | backend | high | feature/SLT-45-geo-jerarquica-entrada | Camilo (6ace53aa94bfd46ee6a600a5) | in_progress (tomada) |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 2026-11-05: spec aprobado (F1.4, «aprobado», por escrito) y tarjeta en in_progress. Implementer lanzado.
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

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
