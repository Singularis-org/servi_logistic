# SLT-51 «Zonas separadas de Tarifas»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-51 | zonas-separadas-de-tarifas | fullstack | medium | feature/SLT-51-zonas-separadas-de-tarifas | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-28). Spec R1-R16 @2d3b46ca. F1.4 aprobada por escrito 2026-10-29 («dale aprobadas»), tarjeta en En curso. F2: implementer lanzado 2026-10-29.

## Evaluación
zone fullstack / complexity medium (épica EP-8). Mueve UI y actions de zonas fuera de
`app/(app)/configuracion/tarifas/`; sin cambio de modelo de datos.

## Decisiones
- Alcance y decisiones cerradas: `specs/SLT-51-zonas-separadas-de-tarifas/requirements.md`.
- 2026-10-29 P1: `e2e/zona-especial-dos-empresas.spec.ts` queda `test.fixme` citando SLT-54; SLT-54 lo reescribe (anotado en su tarjeta).
- 2026-10-29 choque de archivos ACEPTADO por Carlos con SLT-58 (Camilo): `lib/auth/menu-visibility.ts`, `lib/modulos/reparto.ts`, Sidebar y sus tests. Quien mergee segundo integra origin/dev.

## Preguntas abiertas
Ninguna.
