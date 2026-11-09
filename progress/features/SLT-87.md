# SLT-87 «Reporte de bugs: botón flotante y envío»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-87 | reporte-de-bugs | fullstack | high | feature/SLT-87-reporte-de-bugs | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4 (2026-11-09): spec de la entrega 1 aprobado por el humano («Aprobado, implementa»). Tarjeta en curso. F2.1 implementer. Máximo de imágenes (5, contador «{n}/5 imágenes») anotado en SLT-98.

## Evaluación
- zone fullstack: tabla nueva + storage + correo + botón en layout + módulo de plataforma.
- complexity high: toca el layout de todos los roles, permisos empresa/plataforma, adjuntos y correo.

## Decisiones
- 2026-11-05 · Alcance y decisiones → `specs/SLT-87-reporte-de-bugs/requirements.md`.
- 2026-11-09 · Humano: se parte en 3 entregas. SLT-87 pasa a «Reporte de bugs: botón flotante y envío» y se crean SLT-97 (módulo del superadmin) y SLT-98 (imágenes); board actualizado. P2–P6 y Q1–Q5 → «Decisiones cerradas» del requirements: el botón no lo ve el superadmin, no se guarda versión, las imágenes van a un bucket propio con enlaces en el correo, en el mensajero el botón va encima del chat, solo se guarda la ruta, descripción de 500 como máximo, sin tope de envíos, `organization_id`. Vistas: https://claude.ai/artifact/RAaa8zU5Tbw2gyYnnMaRms

<!-- tamano-pr-aceptado: 2026-11-09 · entrega 1: 28 archivos y 2164 líneas reales (la estimación era ~1.400); separar el correo dejaría reportes que nadie ve. Humano: «Aceptar» y, con la cifra real, «Sí, un solo PR». -->

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-09 · T1–T9 · 39896156…56aefdc1 · R1–R20 con test; typecheck 0; vitest de backend 152/152 (integración 9/9) y de frontend 134/134; test:guardias solo con el rojo del baseline; ida y vuelta de la migración 20261110120000 OK; E2E 17/17 ×2. Grupo aislamiento: 91/94, los 3 rojos de la landing `/` (timeout de carga) pasan cuando se corren solos: vigilar en CI. tamano-pr: 28 archivos y 2164 líneas (lo aceptado eran ~1.400). AVISO: el `.env` del checkout principal apunta a un proyecto Supabase prohibido (BASES_PROHIBIDAS); en el `.env` del worktree se vaciaron esas variables.

## Modelos (overrides)

## Cierre
