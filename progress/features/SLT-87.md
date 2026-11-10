# SLT-87 «Reporte de bugs: botón flotante y envío»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-87 | reporte-de-bugs | fullstack | high | feature/SLT-87-reporte-de-bugs | Camilo | done |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
done (2026-11-09): PR #106 mergeado en dev (3f3d1652), gate-completo verde. Entrega 1 de 3; siguen SLT-97 y SLT-98.

## Evaluación
- zone fullstack: tabla nueva + storage + correo + botón en layout + módulo de plataforma.
- complexity high: toca el layout de todos los roles, permisos empresa/plataforma, adjuntos y correo.

## Decisiones
- 2026-11-05 · Alcance y decisiones → `specs/SLT-87-reporte-de-bugs/requirements.md`.
- 2026-11-09 · Humano: se parte en 3 entregas. SLT-87 pasa a «Reporte de bugs: botón flotante y envío» y se crean SLT-97 (módulo del superadmin) y SLT-98 (imágenes); board actualizado. P2–P6 y Q1–Q5 → «Decisiones cerradas» del requirements: el botón no lo ve el superadmin, no se guarda versión, las imágenes van a un bucket propio con enlaces en el correo, en el mensajero el botón va encima del chat, solo se guarda la ruta, descripción de 500 como máximo, sin tope de envíos, `organization_id`. Vistas: https://claude.ai/artifact/RAaa8zU5Tbw2gyYnnMaRms

<!-- tamano-pr-aceptado: 2026-11-09 · entrega 1: 28 archivos y 2164 líneas reales (la estimación era ~1.400); separar el correo dejaría reportes que nadie ve. Humano: «Aceptar» y, con la cifra real, «Sí, un solo PR». -->

- 2026-11-09 · F2.2 (4bbcf107): OK, 0 bloqueantes, 5 menores. Humano: M2 (el botón tapa la paginación o las acciones en móvil) se arregla antes del PR; el leader suma M3 (el «Gracias» reaparece al reabrir) y M4 (Escape). M5 (título) corregido. M1: los E2E de reparto y dinero se verifican en CI.

- 2026-11-09 · M2–M4 arreglados (be9ade5a): en móvil el contenido termina con pb-40 (lg:pb-12); al cerrar, el panel vuelve al formulario; Escape cierra con el foco en cualquier parte. Vitest 100/100, E2E de SLT-87 17/17; en el grupo reparto, 1 failed y 1 flaky en mis-asignaciones (carga de la máquina; corrido solo pasa 4/4, sin «intercepts pointer events»): lo confirma CI. Humano: mientras se hace scroll, las barras pegadas abajo pueden quedar bajo el botón; se mira en dev y, si molesta, ficha chica.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-09 · T1–T9 · 39896156…56aefdc1 · R1–R20 con test; typecheck 0; vitest de backend 152/152 (integración 9/9) y de frontend 134/134; test:guardias solo con el rojo del baseline; ida y vuelta de la migración 20261110120000 OK; E2E 17/17 ×2. Grupo aislamiento: 91/94, los 3 rojos de la landing `/` (timeout de carga) pasan cuando se corren solos: vigilar en CI. tamano-pr: 28 archivos y 2164 líneas (lo aceptado eran ~1.400). AVISO: el `.env` del checkout principal apunta a un proyecto Supabase prohibido (BASES_PROHIBIDAS); en el `.env` del worktree se vaciaron esas variables.

## Modelos (overrides)

## Cierre
- 2026-11-09 · PR https://github.com/Singularis-org/servi_logistic/pull/106 mergeado por el humano en dev (3f3d1652). `gate-completo` verde; los E2E de aislamiento, dinero y reparto también en verde en CI.
- Resumen: botón flotante y panel para usuarios de empresa (ni superadmin ni páginas públicas), borrador de texto en localStorage, descripción de 500 como máximo con contador «{n}/500», guardado en la tabla de plataforma `bug_report` (sin políticas, REVOKE servi_app) con contexto de la sesión y solo la ruta, y copia por correo a BUG_REPORT_EMAILS sin romper el guardado.
- Revisión F2.2: OK; M2–M4 arreglados antes del PR. Un rojo de CI (el censo de updated_at, 17 → 18 tablas) se arregló en d533b247.
- Deuda: en móvil, al hacer scroll, la paginación o la barra de EnvioForm pueden quedar bajo el botón (el humano lo mira en dev). Aviso: el `.env` del checkout principal apunta a un Supabase prohibido.
- Worktree: `wt.sh done` lo dejó entero porque había archivos en uso; reintentar. Bases `servi_logistic_slt87` y `servi_logistic_slt87_e2e` pendientes de borrar con autorización.
