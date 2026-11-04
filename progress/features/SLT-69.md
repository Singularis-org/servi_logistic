# SLT-69 «Escáner rechaza guías asignadas después de abrir la pantalla»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-69 | escaner-lista-recoger-vieja | frontend | low | feature/SLT-69-escaner-lista-recoger-vieja | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2: aprobado 2026-10-30 («aprobado»), implementación en curso. HOTFIX: rama base `origin/prod` (b31b6503), PR directo a `prod`.

## Evaluación
zone frontend / complexity low. Causa medida en prod el 2026-10-30:
- `RecogerModule.tsx:300` solo refresca la lista tras recoger con éxito (`router.refresh()`); sin refresco al volver a la app ni periódico.
- `useRecogerPorGuia.ts:50-53` rechaza en el cliente si la guía no está en `porRecoger`, sin llamar al servidor (no deja logs).
- Caso: un mensajero, lote 11:24; 4 guías asignadas entre 11:33 y 11:38; el escaneo de la primera a las 11:40 fue rechazado. A mano funcionó tras refrescarse la lista.
- Mismo patrón en Recolección: `app/(app)/recoleccion/_components/useRecolectarPorGuia.ts`.

## Decisiones
- 2026-10-30 (Carlos): «aprobado» — P1 no (Recolección fuera), P2 30 s.
- 2026-10-30 (Carlos): hotfix urgente a producción, solo esta ficha («esta ficha también debe ser hotfix es urgente»).
- 2026-10-30 (Carlos, por la propuesta aceptada): ante una guía que no está en la lista, refrescar la lista desde el servidor y reintentar antes del error; refrescar la lista al volver a la app.

## Preguntas abiertas

## Tandas
- 2026-10-30 · T1-T5 (frontend_dev) · 09a0c989 · gate local verde (INIT_EXIT=0); T1 rojo contra prod antes del cambio (`progress/impl_SLT-69.md`)

## Modelos (overrides)
Subagentes en Opus.

## Cierre
