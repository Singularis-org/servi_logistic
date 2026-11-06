# SLT-44 «Geografía jerárquica: dominio y repositorios»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-44 | geo-jerarquica-dominio | backend | high | feature/SLT-44-geo-jerarquica-dominio | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-30): tomada en Trello y worktree creado. La rama nace de `dev` y lleva mergeado
`feature/SLT-43-geo-jerarquica-modelo` (PR #44, todavía sin mergear) como base.
F1.1 (`/afinar-feature`) y F1.2 (spec R1–R26, `9b0cba7`) hechos. F1.4: spec aprobado por escrito por
Camilo («Aprobado», 2026-10-30); tarjeta movida a «En curso».
F2.1 (2026-10-31): T0–T6 hechas y T7.1 local en verde (`progress/impl_SLT-44.md`). Sin push. Pendiente:
`gate-completo` del PR (T7.1) y T7.2, puerta humana: `pnpm geo:equivalencia-dinero` sobre una copia de producción.
R25 literal no sale vacío hasta que el PR #44 (SLT-43) entre en `dev`. Siguiente: reviewer.

## Evaluación
- zone `backend` y complexity `high`, de los labels de la tarjeta.
- Dependencia SLT-43: PR #44 con CI verde y review aprobada, pendiente del merge humano. Esta rama
  apila sobre él; cuando se mergee, basta mergear `origin/dev` aquí.
- Cupo backend de Camilo: 3/3 con esta (SLT-43, SLT-59). SL-24 y SLT-40 pasaron a `done` el
  2026-10-30 (PR #37 y #41 mergeados).

## Decisiones
- 2026-10-30 · Alcance y decisiones cerradas en `specs/SLT-44-geo-jerarquica-dominio/requirements.md`.
- 2026-10-30 · Se parte en dos: el SQL crudo de los repositorios va a SLT-65 (nueva). SLT-46, SLT-47
  y SLT-48 dependen también de SLT-65.
- 2026-11-03 · F2.3 · Merge de `origin/dev` (`62f3dd5e`), con los conflictos triviales resueltos como en SLT-65. El fixture `geo-44` ya no pone «Dos zonas» en dos zonas, por el índice único de SLT-75.
  ABIERTO: 6 tests de R9, R16, R18, R19, R20 y R21 comprueban el colapso >1, que los datos ya no pueden producir. Falta decidir si se cambian sus `expect` o si el caso >1 se siembra de otra forma. Detalle en `progress/impl_SLT-44.md > F2.3`.
- 2026-11-03 · Cristian: «Enmendar spec y tests». El spec_author escribe la enmienda en `specs/SLT-44-geo-jerarquica-dominio/`
  (`requirements.md > ### Enmienda del 2026-11-03`, `design.md` §13, tasks T8.1–T8.6, sin marcar):
  - R16 y R18–R21 se reescriben con la invariante «un distrito, una zona», el índice por empresa
    `zona_distrito_organizacion_id_distrito_id_key` de SLT-75. R9, R8, R15 y R26 no cambian.
  - R27 (nuevo): el colapso 1/0/>1 se conserva en el dominio como defensa. La razón: el dominio es
    puro, comparte la regla con `_shared/zona-colapso.ts`, que SLT-75 conserva, y no cuesta nada.
  - Pendiente de la aprobación humana de la enmienda antes de T8.
- 2026-11-03 · Cristian aprueba la enmienda por escrito: «Aprobado» (2026-11-03). Se ejecutan T8.1–T8.6.
- 2026-11-04 · B1 de la vuelta 2 arreglado con un cherry-pick de 9b4e0004 (`c8476f7a`). `zona-distrito-unica.test.ts` 9/9 contra `logistic_slt44`; typecheck exit 0.
- 2026-11-04 · F2.3 · Merge `d4fe9fe5` de SLT-43 con las migraciones renombradas a `20261104120000`–`120500` (después de SLT-52). Los conflictos se resolvieron con el lado de SLT-43. Contra la base nueva `logistic_slt44_r1104` están en verde las migraciones SLT-43, los 13 `geo-*` de integración, `zona-distrito-unica`, `catalogo-y-choke-point` y el typecheck. ABIERTO: `logistic_slt44` quedó con los nombres viejos (P3009), y recrearla con `migrate reset` necesita el consentimiento del humano. Detalle en `progress/impl_SLT-44.md`.
- 2026-11-04 · Merge de SLT-43 con el arreglo del rojo de CI de SLT-76 R15 (`salida-a-reparto-sql-real`, id de la
  provincia del test). Verde contra `logistic_slt44_r1104` (7/7). Detalle en `progress/impl_SLT-44.md`.
