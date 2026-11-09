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
- 2026-11-07: el humano cierra las cuatro preguntas del spec y R15 (postulación «Preparar + aviso», zonas de Node + `pg_timezone_names`, excepciones a SLT-92, prefijo oficial obligatorio, R15 se queda): ver filas del 2026-11-07 en `specs/SLT-81-*/requirements.md > Decisiones cerradas`. Requisitos nuevos R26–R28; task nueva T0.1.

- 2026-11-07: país ISO sin prefijo oficial en libphonenumber (p. ej. `AQ`): se acepta que R26 lo rechace y no se ofrezca en el alta (humano). La implementación mueve esa pregunta de `requirements.md > Preguntas abiertas` a «Decisiones cerradas» (T0.0).

- 2026-11-07 (tras tanda 1, `progress/impl_SLT-81.md > Tanda 1`): los 11 desvíos del design quedan aceptados (humano), incluidos la clave del tipo (`[^a-z0-9]` → `_`, «N.I.T.» → `n_i_t`), el rechazo de un nombre sin letras ni dígitos, Tuvalu en vez de Bouvet en el test, `tipoDocumentoPorId` y `actualizarDatos` con número de empresas en el repositorio, y la migración en `20261108120000`.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-06 · Tanda 1 (backend_dev): T0.0, T0.1 y Bloque 1 (T1.1–T1.6) hechos; typecheck, lint, guardias (baseline) y unit verdes; integración a CI. Detalle: `progress/impl_SLT-81.md > Tanda 1`.
- 2026-11-09 · Tanda 2 (frontend_dev): Bloque 2 (T2.1, T2.2) hecho; `@sin-superficie` retiradas; typecheck, lint, guardias (baseline) y tests de componente verdes. Detalle: `progress/impl_SLT-81.md > Tanda 2 · bloque 2`.

## Modelos (overrides)

## Cierre
