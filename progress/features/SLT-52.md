# SLT-52 «Tarifas flexibles: modelo y cálculo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-52 | tarifas-flexibles-modelo | backend | high | feature/SLT-52-tarifas-flexibles-modelo | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 (2026-11-02): T0, T1 y T2 hechas (12/34 tasks), gate verde. Siguiente: T3. Detalle en `progress/impl_SLT-52.md`.
Ojo: `prisma generate` ya conoce las tablas de T1; una base sin sus migraciones falla en `cierreDetail.create`.

## Evaluación
backend / high: modelo nuevo + resolver único que reemplaza cuatro cálculos de dinero, con
snapshot ampliado en `cierre_detail` y `gestion_orden`. Plan de la épica:
`C:\Users\ArqDev\.claude\plans\rippling-launching-graham.md`.

## Decisiones
- 2026-11-02 · Alcance y decisiones cerradas → `specs/SLT-52-tarifas-flexibles-modelo/requirements.md`.
  Board actualizado: descripciones de SLT-52, SLT-54 y SLT-55; creadas SLT-77 (tope de intentos)
  y SLT-78 (incentivo a la satélite). P1 y P2 cerradas el mismo día.
- 2026-11-02 · Spec aprobado por Carlos («si dale») → in_progress. P1-P4 del spec cerradas (pagos sin IVA).
- 2026-11-02 · Choque aceptado con SLT-43, SLT-44 y SLT-65 (Camilo, geografía jerárquica) en
  `db/schema.prisma`, `lib/types/historial-accion.ts`, `lib/db/modelos-de-negocio.ts`,
  `OrdenRepository.ts`, `CierreDiaRepository.ts`, `docs/architecture.md`. Carlos: «Aceptar;
  resuelve quien mergee segundo». SLT-52 arranca sobre el distrito actual; quien mergee segundo
  integra dev y adapta los grupos.
- 2026-11-02 · Mismo dueño, SLT-64 (AVISO, no choca): comparte CierreDiaRepository/Service.
  Orden: SLT-52 primero; SLT-64 integra dev al retomarse.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-02 · T0 (literales del modelo viejo, 49 casos) · 45e1ee02 · —
- 2026-11-02 · T1 (esquema: 4 migraciones, 5 tablas, RLS) · 2025516d + 67ca1858 (censos) · gate ROJO
  (2 censos) → arreglado → gate VERDE. Task nueva T6.5: `ZonaRepository.update` no debe vaciar grupos.
- 2026-11-02 · T2 (núcleo puro: catálogo, precedencia, cálculo, esquemas; 179 tests) · 70ac57dd · gate
  con 2 rojos por timeout de 20 s en guardias que barren el árbol (`tarifa-status-retirado`,
  `catalogo-postgres-acota-esquema`); solas pasan 15/15 en 2 s → verde. Siguiente: T3.

## Modelos (overrides)

## Cierre
