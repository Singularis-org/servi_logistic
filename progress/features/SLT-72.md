# SLT-72 «Confirmación física también para las órdenes sin gestionar del cierre»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-72 | confirmacion-fisica-sin-gestionar | fullstack | medium | hotfix/SLT-72-confirmacion-fisica-sin-gestionar | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2: spec en `specs/SLT-72-confirmacion-fisica-sin-gestionar/`. HOTFIX: rama desde `origin/prod`
(603aad68), worktree `.worktrees/SLT-72-hotfix`.

## Evaluación
fullstack (validación en `CierresAdminService`/repo + ventana de confirmación física en
`/cierres-admin`), medium. Vecina de SLT-63 (también hotfix, mío): esa toca la recepción central
y `OrdenRepository`; esta, la aprobación del cierre. Sin cruce esperado de archivos.

## Decisiones
- 2026-10-31 (Carlos): ficha nueva y HOTFIX urgente. Origen: se aprobó un cierre con 23 órdenes
  sin gestionar sin escanearlas; la confirmación física (238) solo cubre gestiones con resultado
  que vuelve a bodega (`lib/types/gestion-retorno.ts`), y las sin gestionar (`novedad_interna`)
  no tienen gestión.
- 2026-10-31 (Carlos): si falta una, NO se puede aprobar — igual que hoy: el botón Aprobar queda
  deshabilitado hasta leer todas las que el sistema exige. Sin puerta de escape (misma D2 de 238).

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
