# SLT-98 «Reporte de bugs: imágenes»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-98 | reporte-bugs-imagenes | fullstack | medium | feature/SLT-98-reporte-bugs-imagenes | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4 (2026-11-10): spec aprobado por el humano («Aprobado, implementa»). Tarjeta en curso. F2.1 implementer.

## Evaluación
- zone fullstack: bucket nuevo, subida firmada, validación en el servidor, enlaces en el correo y en el detalle, y el panel.
- complexity medium; ruta completa (almacenamiento y permisos).
- Entrega 3 de 3; depende de SLT-97 (hecha, PR #112).

## Decisiones
- 2026-11-10 · Alcance y decisiones → `specs/SLT-98-reporte-bugs-imagenes/requirements.md`.

- 2026-11-10 · Humano, sobre el spec (e22c354f): P1, las imágenes suben al pulsar «Enviar», no al elegirlas (sin huérfanas ni purga); P2, exceso de tamaño aceptado; P3, el enlace del detalle del superadmin dura 24 h; P4, 5 MB = 5 × 1024 × 1024 bytes. spec_author reescribe el flujo de subida.

<!-- tamano-pr-aceptado: 2026-11-10 · ~32 archivos y ~2.200–2.500 líneas, casi la mitad tests (incluye el doble de Storage del E2E). Humano: «Aceptar, un solo PR». -->

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)

## Cierre
