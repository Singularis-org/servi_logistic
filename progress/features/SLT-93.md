# SLT-93 «API v1: nombre de lote repetido responde 500 en vez de 409»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-93 | api-lote-repetido-409 | backend | low | feature/SLT-93-api-lote-repetido-409 | ArqDev | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2: arreglo implementado y gate rápido corrido; pendiente review del leader y PR. Sin spec propio
(ruta directa): el contrato es la feature 141 R24 (`specs/141-tabla-cargas-orden/`).

## Evaluación
backend / low / ruta **directa**: bug acotado a la detección del P2002 en
`lib/repositories/carga-lote.ts`; sin esquema, sin migración, sin dependencia. Aprobada por Carlos.

## Decisiones
- Detección con el helper existente `textoConstraintP2002` (`lib/repositories/_shared/prisma-unique.ts`),
  el mismo que usan `ApiKeyRepository`, `UserRepository`, etc. No se crea un patrón nuevo.
- En dev no existen `lib/api/api-carga.ts` (v2) ni `tests/fixtures/contrato-v1`: no hay paso de contrato
  congelado que añadir. Queda para quien cree ese contrato.
- La respuesta de éxito de v1 es **200** (no 201): lo fija el route (`NextResponse.json(result, { status: 200 })`).

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-18 · test rojo + arreglo · commit fix(SLT-93) · gate rápido INIT_EXIT=0.
- 2026-11-18 · review 38a22385: caso unit P2002 de otra restricción (mutación «todo P2002» en rojo) · gate rápido INIT_EXIT=0.

## Modelos (overrides)
Ninguno.

## Cierre
Pendiente.
