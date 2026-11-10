# SLT-97 «Reporte de bugs: módulo del superadmin»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-97 | reporte-bugs-modulo-superadmin | fullstack | medium | feature/SLT-97-reporte-bugs-modulo-superadmin | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4 (2026-11-09): spec aprobado por el humano («Aprobado, implementa»). Tarjeta en curso. F2.1 implementer.

## Evaluación
- zone fullstack: estado e historial sobre `bug_report` (migración) y pantallas en /plataforma.
- complexity medium; ruta completa (esquema y permisos de plataforma).
- Entrega 2 de 3; depende de SLT-87 (hecha, PR #106).

## Decisiones
- 2026-11-09 · Alcance y decisiones → `specs/SLT-97-reporte-bugs-modulo-superadmin/requirements.md`.

- 2026-11-09 · Humano: P1 = C, un solo PR con el exceso aceptado (~2.300–2.450 líneas). P2 = se puede saltar hacia adelante (desde Nuevo a cualquiera de los otros; desde En revisión a Resuelto o Descartado; volver atrás, nunca). P3 = nota de 500 como máximo, con contador «{n}/500»; vacía o solo espacios = sin nota. P4 = el listado abre en «Pendientes» (Nuevo y En revisión), del más reciente al más antiguo, en páginas de 25.

<!-- tamano-pr-aceptado: 2026-11-10 · 32 archivos y 3528 líneas reales (la estimación era ~2.400), casi la mitad tests y E2E; el humano eligió no partir: «Una sola, aceptar exceso» y, con la cifra real, «Sí, un solo PR». -->

- 2026-11-10 · F2.2 vuelta 1 (ab0c34ba): RECHAZADO. B1: el E2E no corrió sobre HEAD (después del arreglo de `detalle()`) ni el grupo aislamiento. Humano: m1, endurecer el trigger para que rechace el cambio al mismo estado (como dice R18); m3, el enlace de la fila anuncia «Ver reporte de {empresa} del {fecha}». Leader: m2, el caso E2E del maestro sale del describe en serie; m4 solo se anota.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-09/10 · T1–T9 · 1e38e817…4d7eb9fb · R1–R23 con test; typecheck 0; vitest de lo tocado 237/237 (después del arreglo, 81/81), integración de bug-report 28/28; test:guardias solo con el rojo del baseline; guardias de esquema contra la base 29/29; ida y vuelta de la migración OK y `migrate diff` vacío; E2E 20/20 ×2 sobre c9a109a5 (el arreglo ccaeac92 de consultas en serie en `detalle()` no se volvió a correr en el E2E: lo cubre CI). Leader acepta las propuestas 1–9 del implementer, que son de forma y no cambian ningún R; la 8 (caso del maestro fuera del describe en serie) se deja al reviewer.

## Modelos (overrides)

## Cierre
