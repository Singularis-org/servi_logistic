# SLT-81 «Datos del país: pantalla del superadmin y formularios»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-81 | datos-pais-pantalla-y-formularios | fullstack | high | feature/SLT-81-datos-pais-pantalla-y-formularios | Camilo (6ace53aa94bfd46ee6a600a5) | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 cerrado (2026-11-06): tarjeta asignada, rama publicada (a64a2f28), worktree creado.
`/afinar-feature` cerrado (2026-11-06): `requirements.md` sembrado. Zona pasa de `frontend` a
`fullstack` (incluye el backend de escritura); deja de depender de SLT-46.
Siguiente: F1.2 (`spec_author`). El código (F2) espera al merge de SLT-42 (PR #90): la rama nace
de `dev`, que aún no trae el catálogo ni la validación de SLT-42.

## Evaluación
- zone `fullstack`: pantalla «Datos del país» en Geografía + formularios + servicio y acciones de escritura del catálogo (solo superadmin).
- complexity `high`: backend nuevo con autorización, alta de país ampliada, 5 formularios, confirmación con conteo de empresas, selector IANA y E2E.
- `depends_on`: SLT-42 (PR #90 en verde, sin mergear). SLT-46 retirada por decisión del humano.
- Cupo fullstack: SLT-83 y SLT-86 en vuelo; SLT-81 sigue en `pending` hasta F1.3, que comprueba el cupo y el cruce de archivos.

## Decisiones
- 2026-11-06: el humano decide arrancar SLT-81 sin esperar a SLT-46 («SLT-81 sin esperar a SLT-46»); SLT-46 se adapta después.
- 2026-11-06 (/afinar-feature): ver tabla de decisiones en `specs/SLT-81-*/requirements.md`.
  Tarjeta editada: `zone:fullstack`, descripción nueva y comentario. El ítem SLT-46 del checklist
  «Depende de» no se puede quitar con `scripts/trello.mjs` (no tiene opción): queda anotado como sin efecto en la tarjeta.

## Preguntas abiertas
Las de `requirements.md` (cómo resuelve la empresa la postulación pública; de dónde sale la lista de zonas IANA).

## Tandas

## Modelos (overrides)

## Cierre
