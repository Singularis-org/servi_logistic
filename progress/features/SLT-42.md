# SLT-42 «Teléfono, documento y hora por país»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-42 | telefono-documento-hora-por-pais | backend | high | feature/SLT-42-telefono-documento-hora-por-pais | Camilo (6ace53aa94bfd46ee6a600a5) | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 cerrado (2026-11-03): tarjeta asignada, rama publicada (fb250fc2), worktree creado.
`/afinar-feature` cerrado (2026-11-03): `requirements.md` sembrado. Zona pasa a `backend`; la
pantalla del superadmin y los formularios salen a SLT-81.
F1.4 aprobado por escrito (2026-11-03, «aprobado»), con `libphonenumber-js` (fila en
`docs/dependencias.md`). Comentado en la tarjeta. **La tarjeta sigue en `spec_ready`**: no pasa a
`in_progress` (F2.0) hasta que se cumplan las dos condiciones de abajo.

Bloqueos de F2.0:
1. Cupo backend: subido de 3 a 4 en `arnes.config.json` por decisión del humano (2026-11-03): SLT-43, SLT-44 y SLT-65 están en pausa para pruebas futuras. Resuelto.
2. `archivos-en-vuelo.mjs --candidata SLT-42` (2026-11-03) CHOCA con fichas de Carlos Restrepo:
   SLT-52 (schema, servicios de cierres, CorteDiarioService, OrdenRepository, openapi…), SLT-56
   (CierresAdmin*) y SLT-64 (CierreDia*, `app/api/cron/procesar-jobs/route.ts`). SLT-56 ya figura
   `done` en el board. Esperar a que terminen o que el humano acepte el choque (`--acepto`).
   Con SLT-43 (propia) solo AVISO. Choque ACEPTADO por el humano (ver Decisiones). Resuelto.

## Evaluación
- zone `backend` (era `fullstack`; la UI salió a SLT-81 el 2026-11-03): catálogo por país, migración, validación en servidor, hora.
- complexity `high`: toca unos 80 archivos (teléfono ~12, documento ~43, zona horaria ~47 con tests),
  incluye jobs/cron y cortes de día; posible dependencia nueva (libphonenumber).
- Cupo: al tomarla era fullstack (0 de 3). Al pasar a `backend` choca: SLT-43, SLT-44 y SLT-65 ya
  ocupan los 3 cupos backend. Puede seguir en spec (pending/spec_ready no cuentan), pero NO pasa a
  `in_progress` (F2.0) hasta que una de esas tres pase a `done`.
- Cruce de archivos: sin `tasks.md` aún; repetir `archivos-en-vuelo.mjs --candidata SLT-42` en F2.0.
- `depends_on`: SL-20, `done`.

## Decisiones
- 2026-10-26 (en /afinar-feature SL-20): teléfono con libphonenumber (dependencia nueva, requiere
  los cuatro checks y aprobación); zona horaria es del país; documento único por país y tipo.
- 2026-11-03: por ahora solo se soporta Costa Rica. Prefijo y validación de teléfono, tipos de
  documento y zona horaria salen de **catálogos por país**; se siembra solo CR y se agregan filas
  cuando entre un país nuevo.

- 2026-11-03 (/afinar-feature): ver tabla de decisiones en `specs/SLT-42-*/requirements.md`.
  libphonenumber entra ahora; documento único por empresa y tipo; 5 tipos de CR; ficha partida
  en SLT-81 (frontend, bloqueada por SLT-42 y SLT-46).

- 2026-11-03: el humano acepta el choque de archivos con SLT-52, SLT-56 y SLT-64 (Carlos Restrepo):
  «Acepto el choque, arrancar ya». Resuelve quien mergee segundo (F2.3). `--acepto SLT-52,SLT-56,SLT-64`.
- 2026-11-03: cupo backend 3 → 4 en `arnes.config.json`: «ignoralo, esas estan en pausa para
  pruebas futuras, las de geo» (SLT-43, SLT-44, SLT-65).

- 2026-11-04 (tras tanda 1, desvíos de `progress/impl_SLT-42.md`):
  1. Guardia `geografia-predicado-unico`: se acota a geografía (provincia/cantón/distrito/nodos); deja de mirar otras tablas.
  2. Migración 120100: inserta «ruc»/«pasaporte» si faltan (CI, bases nuevas) en vez de abortar. Desvío aceptado del design.
  3. `scripts/seed-catalogos.ts`: se QUITAN los tipos de documento del seed; solo los crea la migración.
  4. Tipo de documento inactivo: la lectura lo devuelve con `activo: false` y el servicio lo rechaza (R11), con mensaje propio.
  5. Excepción de plataforma etiquetada `SL-20` en vez de `SLT-42` (deuda D29, criterio de SLT-58): aceptado por el leader.

## Preguntas abiertas
Las del `requirements.md` (normalizar teléfonos guardados, jobs por zona horaria, largos de documento).

## Tandas
- 2026-11-04 · T0.1, T1.1–T1.5, T2.1–T2.4, T3.1–T3.2 · 31a5b0eb · gate rápido local rojo por carga (6 tests de UI, verdes 3/3 en la rama y en dev sin carga; ver impl_SLT-42.md); subido. T1.0 pendiente (persona, antes del deploy).

## Modelos (overrides)

## Cierre
