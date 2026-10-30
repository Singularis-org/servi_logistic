# SLT-64 · tasks

Todo es capa backend (`backend_dev`). No hay cambios de UI: los de `CicloVidaKpi.tsx` son solo
comentarios. Cada tanda cierra con `./init.sh` en verde.

Los tests contra Postgres necesitan `DATABASE_URL` exportada en el worktree
(`docs/verification.md`). Un verde porque se saltaron **no cuenta**.

**Orden:** T1 → T2 → (T3 ∥ T4) → T5 → T6 → T7. T3 y T4 pueden ir en paralelo `[P]`.

## T1 · La fuente única de «resultado de cierre» (R10)

- [ ] **T1.1** Añadir `RESULTADOS_DE_CIERRE` a `lib/types/conteo-ciclo-vida.ts` (design §1).
- [ ] **T1.2** Escribir `tests/unit/analytics/ciclo-vida-resultados-de-cierre.guardia.test.ts`. Comprueba:
  - que la lista es exactamente `entregado`, `devolucion_a_origen_por_rechazo` e `incidente`;
  - que cada valor existe en el enum `GestionResultado` de Prisma;
  - que `CicloVidaRepository` importa la constante y no escribe los literales (se ignoran los
    comentarios).

**Hecho cuando:** el guardia se pone rojo si se escribe un literal a mano en el repositorio y verde
con el import.

## T2 · La consulta nueva del ciclo de vida (R1–R9, R11) · depende de T1

- [ ] **T2.1** Reescribir `CicloVidaRepository.acumularCiclos`:
  - la consulta es la de design §1: gestión de cierre, vigente y última, por `NOT EXISTS` con la
    tupla `(created_at, id)`;
  - `resultado::text`;
  - `condicionDeVentanaTerminal` se renombra a `condicionDeVentanaDeCierre` y pasa a fechar
    `g."created_at"`;
  - `condicionesDeCiclo` no se toca.
- [ ] **T2.2** Reescribir los comentarios de cabecera de cuatro archivos para la nueva definición:
  `CicloVidaRepository.ts`, `lib/actions/ciclo-vida.ts`, `lib/types/conteo-ciclo-vida.ts` y
  `CicloVidaKpi.tsx`. Este último solo cambia comentarios: ni rótulo ni lógica.
- [ ] **T2.3** Escribir `tests/integration/db/ciclo-vida-gestion-final.int.test.ts`, con todos los
  escenarios de design §7 (R1–R9, R11), incluidas la anulación (R7), la corrección real (R8) y la
  aprobación real (R6).
- [ ] **T2.4** Actualizar los tests que hoy fijan la definición vieja:
  - `tests/unit/analytics/ciclo-vida.test.ts` (forma de la ventana);
  - `tests/integration/db/455/caracterizacion/sql-crudo-conteos.test.ts`: con gestión final, O1, O4
    y O6 cierran. Recalcular su `n` y sus segundos esperados **a mano desde el fixture**, no
    copiándolos de la salida.

**Hecho cuando:** se cumplen las dos cosas.
- **Matan las mutaciones.** Cada mutación de design §7 aplicada a mano pone rojo al menos un caso.
  Se anotan en `progress/impl_SLT-64.md` con el caso que la mató.
- **Ejecutan filas.** El test afirma que su fixture existe antes de medir.

## T3 [P] · Etiquetas de entregas en una sola constante (R17) · depende de T2

- [ ] **T3.1** Exportar `TAGS_LECTURAS_ENTREGAS` desde `lib/analytics/entregas-conteo.ts`, con las
  ocho etiquetas e importando `TAG_CONTEO_PRODUCTOS`. Comprobar antes que ese import no crea un
  ciclo; si lo crea, la constante va en un módulo nuevo `lib/analytics/tags-entregas.ts`.
- [ ] **T3.2** `lib/actions/analitica-refrescar.ts` construye su lista con
  `[...TAGS_LECTURAS_ENTREGAS, ...TAGS_OPERATIVA]`.
- [ ] **T3.3** Escribir `tests/unit/analytics/tags-entregas-fuente-unica.test.ts`.

**Hecho cuando:** el test se pone rojo si `analitica-refrescar.ts` vuelve a escribir su propia
lista, y el test del botón sigue verde.

## T4 [P] · Invalidación en las dos acciones (R12–R16) · depende de T2

- [ ] **T4.1** Añadir `"correccion_gestion"` a `OrigenInvalidacion` (`IAnaliticaCache.ts`) y
  ajustar `lib/cache/registro-invalidacion.ts` si enumera los orígenes.
- [ ] **T4.2** `deshacerGestion` (`lib/actions/cierre-dia.ts`) y `corregirResultadoGestion`
  (`lib/actions/cierres-admin.ts`):
  - ganan `cache?: IAnaliticaCache` en sus deps, con `crearAnaliticaCacheDeNext()` por defecto;
  - invalidan `TAGS_LECTURAS_ENTREGAS` solo si el servicio devuelve `ok`;
  - si la invalidación falla, lo capturan, lo registran sin PII y devuelven el `ok` (R15).
- [ ] **T4.3** Escribir `tests/unit/actions/deshacer-gestion-invalida-analitica.test.ts`.
  - `ok` → una invalidación con origen `correccion_gestion` y las ocho etiquetas.
  - Cada estado no-ok → cero invalidaciones.
  - Una caché que lanza → la respuesta sigue siendo `ok` y hay una línea en el log.
- [ ] **T4.4** Escribir `tests/unit/actions/corregir-resultado-invalida-analitica.test.ts`, con los
  mismos tres casos y los estados de la corrección.
- [ ] **T4.5** Escribir `tests/unit/analytics/cache-invalidacion-correccion-cableado.test.ts`.
  Comprueba en estático que la rama por defecto de las dos acciones usa
  `crearAnaliticaCacheDeNext()`.

**Hecho cuando:** cada una de estas mutaciones pone rojo un test:
- borrar la llamada a `invalidar`;
- invalidar antes de mirar el `status`;
- propagar el error de la caché;
- cambiar el default por `cacheNula()`.

## T5 · El tipo de job y su migración (R23) · depende de T4

- [ ] **T5.1** Añadir `analitica_reagregar_fecha` al enum `JobTipo` de `db/schema.prisma`, con su
  comentario.
- [ ] **T5.2** Crear `db/migrations/<ts>_job_tipo_analitica_reagregar_fecha/migration.sql` y su
  `down.sql`. El down recrea el tipo con la lista vigente, sacada de la última migración de
  `job_tipo` y comprobada contra `schema.prisma`.
- [ ] **T5.3** Clasificar el tipo en `MODULO_POR_JOB` (`lib/modulos/reparto.ts`) como
  `"analitica"` y añadirlo a la lista `jobs` del módulo.
- [ ] **T5.4** Escribir `tests/integration/db/job-tipo-analitica-reagregar-fecha-migration.test.ts`
  con up, down y up, siguiendo el patrón de la migración de `analitica_invalidacion_cache`.

**Hecho cuando:** el test de la migración está verde contra Postgres y
`tests/unit/services/jobs-registro.test.ts` reconoce el tipo.

## T6 · Encolado dentro de la transacción (R18–R20) · depende de T5

- [ ] **T6.1** Crear `lib/services/jobs/analitica-reagregar-fecha-encolado.ts`, con la clave pura y
  `encolarReagregacionAnalitica(tx, …)` (design §4).
- [ ] **T6.2** Llamarlo dentro de la `$transaction` de las cuatro escrituras, después de su guarda.
  Las cuatro leen el `created_at` de la gestión en la misma tx.
  - `CierreDiaRepository`: `anularGestionPendiente`, `anularGestionDeCierreRechazado` y
    `anularGestionYDevolverAGestion`.
  - `CierresAdminRepository`: `corregirResultadoGestionEnCierre`.
  - `anularGestionPendiente`, `anularGestionDeCierreRechazado` y `corregirResultadoGestionEnCierre`
    reciben `ahora` en su input. Hay que ajustar sus interfaces y las llamadas de `CierreDiaService`
    y `CierresAdminService`.
- [ ] **T6.3** Escribir `tests/integration/db/reagregacion-por-correccion.int.test.ts`. Para cada
  una de las cuatro escrituras:
  - gestión de ayer → una fila `jobs` con `{ fecha: ayer }` y la empresa de la orden;
  - gestión de hoy → ninguna fila;
  - guarda que revierte → ninguna fila.

**Hecho cuando:** dos mutaciones ponen rojo el test: mover el encolado fuera de la tx, y quitar la
comparación con hoy.

## T7 · Handler de re-agregación (R21, R22) · depende de T6

- [ ] **T7.1** Crear `lib/services/jobs/analitica-reagregar-fecha-handler.ts`:
  - valida el payload;
  - llama a `agregarFecha(payload.fecha)`;
  - invalida `TAGS_OPERATIVA` con el origen `correccion_gestion`, sin `try/catch`.
- [ ] **T7.2** Registrarlo en `app/api/cron/procesar-jobs/route.ts` con el puerto real y ampliar
  `tests/unit/analytics/cache-invalidacion-job.test.ts` para que también lo vigile.
- [ ] **T7.3** Escribir `tests/unit/services/analitica-reagregar-fecha-handler.test.ts`.
  - Agrega la fecha del payload, no la de `now`.
  - Si el servicio lanza, el handler rechaza.
  - Si la caché lanza, el handler rechaza.
  - Un payload malformado lanza.
- [ ] **T7.4** Escribir `tests/integration/db/rollup-reagregado-tras-anulacion.int.test.ts`:
  agregar D con una entrega, anular por la escritura real, drenar el handler y ver `entregas = 0`
  en D.

**Hecho cuando:** dos mutaciones ponen rojo los tests: hacer que el handler use `fechaObjetivo(now())`
y quitar la invalidación. Además, `./init.sh` cierra en verde.

## Cierre

- [ ] Llevar el mapa `R<n> → test` (R1–R23) a `progress/impl_SLT-64.md`, junto con la tabla de
  mutaciones de T2, T4, T6 y T7 y el caso que mató cada una.
- [ ] Verificar lo que ve el usuario. Con datos locales que reproduzcan la evidencia §5 (gestiones
  `entregado` sin cierre aprobado), `/analitica` tiene que mostrar en el ciclo de vida
  «(N órdenes cerradas)» con N > 0, coherente con «Entregado N» cuando la ventana cubre carga y
  gestión. Las cifras se anotan en la bitácora.

## Archivos esperados

- `specs/SLT-64-ciclo-vida-cerradas-coherente/requirements.md`
- `specs/SLT-64-ciclo-vida-cerradas-coherente/design.md`
- `specs/SLT-64-ciclo-vida-cerradas-coherente/tasks.md`
- `progress/features/SLT-64.md`
- `progress/impl_SLT-64.md`
- `lib/types/conteo-ciclo-vida.ts`
- `lib/repositories/CicloVidaRepository.ts`
- `lib/actions/ciclo-vida.ts`
- `app/(app)/analitica/_components/entregas/CicloVidaKpi.tsx`
- `lib/analytics/entregas-conteo.ts`
- `lib/analytics/tags-entregas.ts`
- `lib/actions/analitica-refrescar.ts`
- `lib/interfaces/external/IAnaliticaCache.ts`
- `lib/cache/registro-invalidacion.ts`
- `lib/actions/cierre-dia.ts`
- `lib/actions/cierres-admin.ts`
- `lib/services/CierreDiaService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/interfaces/repositories/ICierresAdminRepository.ts`
- `lib/services/jobs/analitica-reagregar-fecha-encolado.ts`
- `lib/services/jobs/analitica-reagregar-fecha-handler.ts`
- `lib/modulos/reparto.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `db/schema.prisma`
- `db/migrations/*_job_tipo_analitica_reagregar_fecha/migration.sql`
- `db/migrations/*_job_tipo_analitica_reagregar_fecha/down.sql`
- `tests/unit/analytics/ciclo-vida-resultados-de-cierre.guardia.test.ts`
- `tests/unit/analytics/ciclo-vida.test.ts`
- `tests/integration/db/ciclo-vida-gestion-final.int.test.ts`
- `tests/integration/db/455/caracterizacion/sql-crudo-conteos.test.ts`
- `tests/unit/analytics/tags-entregas-fuente-unica.test.ts`
- `tests/unit/actions/deshacer-gestion-invalida-analitica.test.ts`
- `tests/unit/actions/corregir-resultado-invalida-analitica.test.ts`
- `tests/unit/analytics/cache-invalidacion-correccion-cableado.test.ts`
- `tests/unit/analytics/cache-invalidacion-job.test.ts`
- `tests/unit/services/jobs-registro.test.ts`
- `tests/integration/db/job-tipo-analitica-reagregar-fecha-migration.test.ts`
- `tests/integration/db/reagregacion-por-correccion.int.test.ts`
- `tests/unit/services/analitica-reagregar-fecha-handler.test.ts`
- `tests/integration/db/rollup-reagregado-tras-anulacion.int.test.ts`
