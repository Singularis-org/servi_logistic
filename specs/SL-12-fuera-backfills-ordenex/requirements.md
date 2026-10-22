# SL-12 — Fuera los backfills de Ordenex

> Zona: backend · Complejidad: low · depends_on: SL-10 · Rama: `feature/SL-12-fuera-backfills-ordenex`
>
> **Alcance.** Retirar los tres `scripts/backfill-*.ts` que vinieron de Ordenex, después de comprobar
> que ninguna migración los necesita (comprobado: ver `design.md > Comprobación de migraciones`). Con
> cada script se van los tests cuyo único sujeto es ese script, y las guardias que lo censan por ruta
> dejan de nombrarlo. Arreglo mínimo: lo que los scripts consumían de `lib/` se queda.
>
> Los tres scripts:
> - `scripts/backfill-analitica.ts`: ficha 125 de Ordenex, recálculo del histórico de analítica.
> - `scripts/backfill-caja-tesoreria.ts`: ficha 173, registro retroactivo de la caja, «una vez por
>   entorno».
> - `scripts/backfill-marcador-config-geocode.ts`: ficha 400, reparación de un incidente de producción
>   de Ordenex que se resolvió a mano. Su propio comentario dice que «hoy no tiene sujetos».
>
> **Lo que NO entra.**
> - `specs/` de Ordenex (125, 128, 173, 400…): no se edita ningún archivo, aunque citen los scripts.
>   Se quedan como historia (decisión del humano).
> - Los servicios, contratos y planificadores que los scripts usaban: `lib/services/AnaliticaBackfillService.ts`,
>   `lib/interfaces/services/IAnaliticaBackfillService.ts`, `lib/analytics/backfill-rango.ts`,
>   `lib/services/CajaBackfillTesoreriaService.ts`, `lib/interfaces/services/ICajaBackfillTesoreriaService.ts`,
>   `lib/services/jobs/analitica-invalidacion-encolado.ts`, y sus tests. `backfill-rango` lo usa
>   producción, y los dos servicios tienen tests de integración propios. Su destino es la pregunta
>   abierta 2.
> - Los scripts hermanos de incidentes o mediciones de Ordenex: `scripts/contraste-454.ts`,
>   `scripts/contraste-454.sql`, `scripts/medir-462-retenidas.sql`, `scripts/rollup-analitica-manual.ts`,
>   `scripts/bench-busqueda-ordenes.ts` y `scripts/drenar-jobs.ts`. No son `backfill-*` y cada uno
>   está atado a guardias o tests propios (`design.md > Scripts hermanos`). Van a otra ficha (pregunta
>   abierta 1).
> - Los archivos del arnés (`arnes.manifest`).
> - Comentarios de tests o de `lib/` que hablan del backfill en prosa, sin citar la ruta del script.

## Requisitos (EARS)

### Retirada

- **R1.** El repositorio NO DEBE contener `scripts/backfill-analitica.ts`,
  `scripts/backfill-caja-tesoreria.ts` ni `scripts/backfill-marcador-config-geocode.ts`.
- **R2.** Ningún archivo de `db/migrations/` DEBE citar ni invocar ninguno de los tres scripts de R1.
- **R3.** El repositorio NO DEBE contener tests cuyo único sujeto sea uno de los scripts de R1, y ningún
  archivo de `app/`, `lib/`, `components/`, `hooks/`, `providers/`, `scripts/`, `tests/` ni `e2e/`
  DEBE importar un módulo `@/scripts/backfill-analitica`, `@/scripts/backfill-caja-tesoreria` ni
  `@/scripts/backfill-marcador-config-geocode`.
- **R4.** Ningún archivo de `app/`, `lib/`, `components/`, `hooks/`, `providers/`, `scripts/`, `tests/`
  ni `e2e/` DEBE citar la ruta de uno de los scripts de R1, ni en código ni en comentario, salvo la
  guardia de R11.

### Guardias que censaban los scripts

- **R5.** La guardia `tests/unit/guards/caja-173-alcance.guardia.test.ts` NO DEBE incluir
  `scripts/backfill-caja-tesoreria.ts` en su lista de módulos de la 173, y DEBE seguir comprobando el
  resto de esa lista y el cierre del censo contra `lib/` y `scripts/`.
- **R6.** La guardia `tests/unit/analytics/backfill-guards.test.ts` NO DEBE incluir
  `scripts/backfill-analitica.ts` ni `@/scripts/backfill-analitica` en su censo de la 125, y DEBE seguir
  aplicando todas sus reglas estructurales a los tres archivos de `lib/` que quedan en ese censo.
- **R7.** SI un archivo del árbol importa el servicio `@/lib/services/AnaliticaBackfillService` o su
  contrato desde un consumidor externo, ENTONCES `tests/unit/analytics/backfill-guards.test.ts` DEBE
  seguir saliendo en rojo, igual que antes del cambio.

### Lo que se queda

- **R8.** El cambio NO DEBE eliminar ni cambiar el código de los módulos de `lib/` que consumían los
  scripts (lista en «Lo que NO entra»), ni sus tests. Solo se admite quitar de un comentario la ruta
  de un script retirado (R4).
- **R9.** El cambio NO DEBE eliminar ni modificar `scripts/contraste-454.ts`, `scripts/contraste-454.sql`,
  `scripts/medir-462-retenidas.sql`, `scripts/rollup-analitica-manual.ts`,
  `scripts/bench-busqueda-ordenes.ts` ni `scripts/drenar-jobs.ts`.
- **R10.** El cambio NO DEBE modificar ningún archivo bajo `specs/` salvo
  `specs/SL-12-fuera-backfills-ordenex/`, ni ningún archivo listado en `arnes.manifest`.

### Que no vuelvan

- **R11.** SI vuelve a aparecer uno de los tres archivos de R1, o un import de uno de los tres módulos
  de R3, ENTONCES el gate rápido DEBE salir en rojo nombrando el archivo.

### Cierre

- **R12.** CUANDO la retirada está commiteada en la rama, `tests/unit/guards/test-citado-desaparecido.guardia.test.ts`
  DEBE pasar sin que se añada ninguna anotación `@test-desaparecido`.
- **R13.** `docs/limpieza-ordenex.md` DEBE dar por hecha la fila «Backfills de Ordenex» de la lista
  concreta, con la referencia a SL-12 y el resultado de la comprobación de migraciones.
- **R14.** CUANDO se corre `./init.sh` en el worktree de la feature, el gate DEBE terminar con código 0.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-21 | ¿Se tocan los `specs/` de Ordenex? | No. Se quedan como historia del comportamiento heredado (humano, vía leader; `docs/limpieza-ordenex.md` regla 5). → R10, R12 |
| 2026-10-21 | ¿Arreglo mínimo o rediseño? | Arreglo mínimo (humano, vía leader). Se retiran los scripts y lo que solo existe por ellos; lo que consumían se queda. → R5, R6, R7, R8, R9 |
| 2026-10-21 | ¿Algún `scripts/backfill-*.ts` lo necesita una migración? | No. Medido con Grep sobre `db/migrations/` (`design.md > Comprobación de migraciones`). Precondición de la ficha. → R1, R2 |

## Preguntas abiertas

1. **Scripts hermanos.** `contraste-454.*` (ficha 454) y `medir-462-retenidas.sql` (ficha 462) son
   mediciones de incidentes de producción de Ordenex, igual que los backfills, pero no entran en la
   descripción de SL-12 y retirarlos arrastra guardias y tests de integración propios
   (`design.md > Scripts hermanos`). `rollup-analitica-manual.ts` y `drenar-jobs.ts` llevan una guarda
   de host atada a la base local de Ordenex, y eso parece trabajo de SL-15. ¿Abres una ficha para
   454/462 y mandas los otros dos a SL-15? `bench-busqueda-ordenes.ts` es una herramienta genérica de
   rendimiento: el spec propone que se quede.
2. **Servicios que se quedan sin ejecutable.** Sin los scripts, `AnaliticaBackfillService`,
   `CajaBackfillTesoreriaService` y `analitica-invalidacion-encolado` solo los usan los tests. Ninguna
   guardia lo marca: `superficie-de-uso` no mira `lib/services/`. ¿Se quedan como capacidad heredada,
   o se retiran en una ficha aparte? Retirarlos ahora no es arreglo mínimo: arrastra dos tests de
   integración (`tests/integration/db/analytics-daily-backfill.test.ts`,
   `tests/integration/db/caja-backfill.test.ts`), parte de `tests/integration/db/abono-tienda-457.test.ts`
   y el censo entero de `backfill-guards`.
3. **El backfill de analítica no es de un incidente.** `scripts/backfill-analitica.ts` es la
   herramienta general de la 125 para recalcular un rango de días de analítica, y su diseño dice que
   producción es su destino legítimo. En servi_logistic no hay histórico anterior al rollup diario,
   pero sería la vía para recalcular días que el job diario no cubrió. El spec lo retira porque la
   descripción de la ficha lo pide. ¿Lo confirmas?
