# SLT-76 «Deuda de los hotfix SLT-73 y SLT-75» (hotfix)

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-76 | deuda-hotfix-73-75 | fullstack | medium | hotfix/SLT-76-deuda-hotfix-73-75 | Carlos Restrepo | spec |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2: spec en `specs/SLT-76-deuda-hotfix-73-75/`. HOTFIX: rama desde `origin/prod`, worktree
`.worktrees/SLT-76-hotfix`. Objetivo de Carlos (2026-11-01): cerrar TODA la deuda que dejaron los
hotfix SLT-73 y SLT-75 antes de volver a EP-8.

## Origen (revisiones y bitácoras ya en prod)
- `progress/review_SLT-73.md` (m3, m4, m5, m6) y `progress/impl_SLT-73.md` (hallazgos ajenos).
- `progress/review_SLT-75.md` (m6, m7) y `specs/SLT-75-distrito-zona-unica/requirements.md` (Q1).
- `progress/deudas.md` D32.

## Bloques
1. **Fecha del cierre en UTC.** `fecha()` de `app/(app)/cierres-admin/_components/cierre-factura.tsx`
   hace `iso.slice(0,10)`: pasada la medianoche UTC (18:00 en Costa Rica) la tarjeta dice el día
   siguiente al del libro. Buscar el mismo patrón en otras superficies de dinero.
2. **Diálogo «Desmarcar»** con asientos: muestra el botón aunque la nota diga «Después no se puede
   desmarcar». (Hallazgo tanda 10 de SLT-73.)
3. **m4 SLT-73:** `revertirConciliacion` (`CierresBodegaAdminRepository.ts:~710`) no cuenta los ajustes
   de diferencia: una consolidación sin asientos pero con diferencia se puede revertir y la
   diferencia queda en la caja.
4. **m5 SLT-73:** `asentarDiferenciaSatelite` (~101) llama a `paraLaCentral` a mano en vez de `esperadoDe`.
5. **m3 SLT-73:** `totalesDeBodega`/`periodoDeBodega` (`EstadoCuentaRepository.ts:~406-456`), SQL a mano
   sin test con dos empresas (`docs/checkpoints-proyecto.md` lo pide).
6. **Q1 SLT-75: rastro en `historial_accion`** de distritos añadidos/quitados al guardar una zona.
7. **Tests:**
   - D32 `liquidacion-reparto-migration` deadlock 40P01 en CI (hoy obligó a relanzar el CI del PR #66);
   - `geografia-por-pais` rojo local (23001 vs 23503 en Postgres 18), fuera del baseline;
   - `indices-rutas-calientes` rojo local (plan del Postgres local);
   - `salida-a-reparto-sql-real` depende del orden de la base compartida.
8. **Textos de SLT-73:** Carlos los da por DEFINITIVOS (2026-11-01). Solo cerrar Q10 y los rótulos
   en el spec/código (quitar marcas «provisional»).
9. **Respaldos** `respaldo.slt73_asientos` y `respaldo.slt75_zona_distrito_duplicado`: pendiente de
   Carlos (borrar o conservar).

## Decisiones
- 2026-11-01 (Carlos): hotfix a prod (dev no puede ir a prod hasta terminar EP-8).
- 2026-11-01 (Carlos): textos provisionales de SLT-73 quedan como definitivos.
- 2026-11-01 (Carlos): el distrito sin zona con 1 orden se queda sin zona (Q2 de SLT-75 cerrada).

- 2026-11-01 (Carlos): los respaldos `respaldo.slt73_asientos` y `respaldo.slt75_zona_distrito_duplicado`
  se BORRAN en este hotfix («si dale»), tras verificar en prod que SLT-73 y SLT-75 quedaron bien.
  Irreversible: después ya no se pueden deshacer esas migraciones.

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
