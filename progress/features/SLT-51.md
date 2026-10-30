# SLT-51 «Zonas separadas de Tarifas»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-51 | zonas-separadas-de-tarifas | fullstack | medium | feature/SLT-51-zonas-separadas-de-tarifas | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-28). Spec R1-R16 @2d3b46ca. F1.4 aprobada por escrito 2026-10-29 («dale aprobadas»), tarjeta en En curso. F2: implementer lanzado 2026-10-29.
F2 2026-10-29: T1-T10 hechas y commiteadas; T11 hecha salvo `zona-especial-dos-empresas` (P2); T12: gate local verde (INIT_EXIT=0), faltan las capturas. E2E `zonas-crear-sin-costos` verde dos veces (con `--no-deps`: `plataforma-vacia` cae por entorno en `superadmin-empresas.spec.ts:214`). Bitácora: `progress/impl_SLT-51.md`. Pendiente: reviewer.

## Evaluación
zone fullstack / complexity medium (épica EP-8). Mueve UI y actions de zonas fuera de
`app/(app)/configuracion/tarifas/`; sin cambio de modelo de datos.

## Decisiones
- Alcance y decisiones cerradas: `specs/SLT-51-zonas-separadas-de-tarifas/requirements.md`.
- 2026-10-29 P1: `e2e/zona-especial-dos-empresas.spec.ts` queda `test.fixme` citando SLT-54; SLT-54 lo reescribe (anotado en su tarjeta).
- 2026-10-29 choque de archivos ACEPTADO por Carlos con SLT-58 (Camilo): `lib/auth/menu-visibility.ts`, `lib/modulos/reparto.ts`, Sidebar y sus tests. Quien mergee segundo integra origin/dev.

- 2026-10-29 /design: el humano decidió que `/configuracion/zonas` NO pasa por /design: solo traslada a una ruta propia los componentes de zonas que ya existían en Tarifas. Se implementa con esos componentes tal cual, sin UI nueva.
- 2026-10-29 F2: merge de origin/dev (102 commits, sin conflictos). Lo que entró (SL-24 planes, SLT-40) no toca zonas, tarifas, menú ni geografía; el design sigue encajando. Las migraciones de planes se aplicaron a la base de la feature (`servi_slt51`, local).

- 2026-10-29 F2 (frontend_dev): el encabezado del módulo, que decía «Costos por zona», pasa a «Zonas de reparto» / «Cada zona agrupa los distritos donde se reparte.» porque el design no fijaba ese texto. El formulario envía su propio payload, no `parsed.data`, porque el default del zod metería costos.
- 2026-10-29 aviso: `docs/ayuda/oficina/configuracion-tarifas.md` declara `roles: [maestro, admin]` pero la página solo deja entrar al maestro. Venía de antes y no se cambió.

## Preguntas abiertas
- **P2 (2026-10-29, implementer) — P1 choca con una guardia.** `tests/unit/guards/e2e-sin-saltos.guardia.test.ts` prohíbe `test.fixme` en `e2e/` (también en comentarios y con alias), sin lista de excepciones; con el `fixme` el gate local sale rojo. Además, desde SL-44 el E2E corre en cada PR a `dev` (no solo a `prod`), y `zona-especial-dos-empresas` está en el proyecto de `playwright.config.ts`: sin `fixme`, el check `e2e` del PR de SLT-51 saldrá rojo porque el botón «Especial» de Zonas desaparece. Opciones: (a) retirar el spec y su entrada en `playwright.config.ts` hasta que SLT-54 lo reescriba; (b) añadir una excepción con fecha a la guardia (cambio de arnés); (c) dejar el spec rojo en CI. El implementer NO aplicó el `fixme` ni ninguna de las tres: decide el humano.
