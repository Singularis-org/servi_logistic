# SLT-64 · tasks

Todo es capa backend (`backend_dev`). No hay cambios de UI: los de `CicloVidaKpi.tsx` son solo
comentarios. Tampoco hay migraciones. Cada tanda cierra con `./init.sh` en verde.

Los tests contra Postgres necesitan `DATABASE_URL` exportada en el worktree
(`docs/verification.md`). Un verde porque se saltaron **no cuenta**.

**Orden:** dos tramos independientes, `[P]` entre sí: T1 → T2, y T3 → T4. T4 usa la constante de T3.

## T1 [P] · La fuente única de «resultado de cierre» (R10)

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
- [ ] **T2.2** Corregir los comentarios que dejarían de ser ciertos (lista en design §1 > Contratos):
  - las cabeceras de `CicloVidaRepository.ts`, `lib/actions/ciclo-vida.ts`,
    `lib/types/conteo-ciclo-vida.ts`, `CicloVidaKpi.tsx` e `ICicloVidaRepository.ts`;
  - `claveDeCicloVida` en `lib/analytics/entregas-conteo.ts`;
  - las menciones al ciclo por transición terminal o a `condicionDeVentanaTerminal` en
    `CohorteCargaRepository.ts`, `ventana-de-carga.ts`, `cohorte-carga-ventana.int.test.ts`,
    `cohorte-carga-reloj.int.test.ts` y `cohorte-terminales.guardia.test.ts`.

  Todos son solo comentarios: ni rótulo ni lógica.
- [ ] **T2.3** Escribir `tests/integration/db/ciclo-vida-gestion-final.int.test.ts`, con todos los
  escenarios de design §7 (R1–R9, R11), incluidas la anulación (R7), la corrección real (R8), la
  aprobación real (R6) y otra empresa bajo `comoApp` (R9).
- [ ] **T2.4** Actualizar los tests que hoy fijan la definición vieja:
  - `tests/unit/analytics/ciclo-vida.test.ts`:
    - el nombre de la función y la columna de la ventana (`h."created_at"`);
    - el esqueleto del SQL (`DISTINCT ON`, `ORDER BY h…`, `u.cerrado_at`);
    - el caso de `ESTADOS_TERMINALES` y los comentarios que dicen que la definición es la del rollup;
  - `tests/integration/db/455/caracterizacion/sql-crudo-conteos.test.ts`: con gestión final, O1, O4
    y O6 cierran, y O8 deja de contar. `n` sigue siendo 3, así que el test solo se mueve por
    `segundosAcum`. Recalcular el esperado **a mano desde el fixture**, no copiándolo de la salida,
    y corregir sus comentarios sobre O8 y el ciclo.

**Hecho cuando:** se cumplen las dos cosas.
- **Matan las mutaciones.** Cada mutación de design §7 aplicada a mano pone rojo al menos un caso.
  Se anotan en `progress/impl_SLT-64.md` con el caso que la mató.
- **Ejecutan filas.** El test afirma que su fixture existe antes de medir.

## T3 [P] · Etiquetas de entregas en una sola constante (R17)

- [ ] **T3.1** Crear `lib/analytics/tags-entregas.ts`, puro, que exporta `TAGS_LECTURAS_ENTREGAS` con
  las ocho etiquetas. No va en `entregas-conteo.ts` porque crearía un ciclo con
  `productos-consulta.ts` (design §3).
- [ ] **T3.2** `lib/actions/analitica-refrescar.ts` construye su lista con
  `[...TAGS_LECTURAS_ENTREGAS, ...TAGS_OPERATIVA]`.
- [ ] **T3.3** Escribir `tests/unit/analytics/tags-entregas-fuente-unica.test.ts` con las tres
  comprobaciones de design §3.

**Hecho cuando:** el test se pone rojo si `analitica-refrescar.ts` vuelve a escribir su propia
lista, y `tests/unit/analytics/refrescar-cache-analitica.test.ts` sigue verde sin tocarlo.

## T4 · Invalidación en las dos acciones (R12–R16) · depende de T3

- [ ] **T4.1** Añadir `"correccion_gestion"` a `OrigenInvalidacion` (`IAnaliticaCache.ts`), con su
  línea en el comentario del dominio. `lib/cache/registro-invalidacion.ts` no enumera los orígenes y
  no cambia.
- [ ] **T4.2** `deshacerGestion` (`lib/actions/cierre-dia.ts`) y `corregirResultadoGestion`
  (`lib/actions/cierres-admin.ts`):
  - ganan `cache?: IAnaliticaCache` en `CierreDiaDeps` y `CierresAdminDeps`, con
    `crearAnaliticaCacheDeNext()` por defecto;
  - invalidan `TAGS_LECTURAS_ENTREGAS` solo si el servicio devuelve `ok`;
  - si la invalidación falla, o falla construir el puerto, lo capturan, lo registran sin PII y
    devuelven el `ok` (R15).
- [ ] **T4.3** Corregir los comentarios de `crearConteoEntregasCacheDeNext`
  (`lib/cache/next-analitica-cache.ts`) y de `lib/config/conteo-entregas-cache.ts` (design §3). Solo
  comentarios.
- [ ] **T4.4** Escribir `tests/unit/actions/deshacer-gestion-invalida-analitica.test.ts`.
  - `ok` → una invalidación con origen `correccion_gestion` y las ocho etiquetas.
  - Cada estado no-ok (`forbidden`, `conflict`, `validation_error`, `unauthenticated`) → cero
    invalidaciones.
  - Una caché que lanza → la respuesta sigue siendo `ok` y hay una línea en el log.
- [ ] **T4.5** Escribir `tests/unit/actions/corregir-resultado-invalida-analitica.test.ts`, con los
  mismos tres casos y los estados de la corrección (los de arriba más `no_encontrada`).
- [ ] **T4.6** Escribir `tests/unit/analytics/cache-invalidacion-correccion-cableado.test.ts`.
  Comprueba en estático que la rama por defecto de las dos acciones usa
  `crearAnaliticaCacheDeNext()`.

**Hecho cuando:** se cumplen las dos cosas.
- Cada una de estas mutaciones pone rojo un test:
  - borrar la llamada a `invalidar`;
  - invalidar antes de mirar el `status`;
  - propagar el error de la caché;
  - cambiar el default por `cacheNula()`.
- Los tests existentes de las dos acciones siguen verdes sin tocarlos:
  `tests/unit/actions/cierres-admin-corregir-resultado-action.test.ts` y
  `tests/integration/actions/cierre-dia-action.test.ts`. No inyectan caché, así que su rama `ok` pasa
  por R15. Si alguno se pone rojo, se dice antes de cambiarlo.

## Cierre

- [ ] Llevar el mapa `R<n> → test` (R1–R17) a `progress/impl_SLT-64.md`, junto con la tabla de
  mutaciones de T2 y T4 y el caso que mató cada una.
- [ ] Verificar lo que ve el usuario. Con datos locales que reproduzcan la evidencia §5 (gestiones
  `entregado` sin cierre aprobado), `/analitica` tiene que mostrar en el ciclo de vida
  «(N órdenes cerradas)» con N > 0, coherente con «Entregado N» cuando la ventana cubre carga y
  gestión. Las cifras se anotan en la bitácora.
- [ ] `./init.sh` en verde.

## Archivos esperados

- `specs/SLT-64-ciclo-vida-cerradas-coherente/requirements.md`
- `specs/SLT-64-ciclo-vida-cerradas-coherente/design.md`
- `specs/SLT-64-ciclo-vida-cerradas-coherente/tasks.md`
- `progress/features/SLT-64.md`
- `progress/impl_SLT-64.md`
- `lib/types/conteo-ciclo-vida.ts`
- `lib/repositories/CicloVidaRepository.ts`
- `lib/interfaces/repositories/ICicloVidaRepository.ts`
- `lib/actions/ciclo-vida.ts`
- `app/(app)/analitica/_components/entregas/CicloVidaKpi.tsx`
- `lib/analytics/entregas-conteo.ts`
- `lib/analytics/tags-entregas.ts`
- `lib/actions/analitica-refrescar.ts`
- `lib/interfaces/external/IAnaliticaCache.ts`
- `lib/cache/next-analitica-cache.ts`
- `lib/config/conteo-entregas-cache.ts`
- `lib/actions/cierre-dia.ts`
- `lib/actions/cierres-admin.ts`
- `lib/repositories/CohorteCargaRepository.ts`
- `lib/repositories/ventana-de-carga.ts`
- `tests/unit/analytics/ciclo-vida-resultados-de-cierre.guardia.test.ts`
- `tests/unit/analytics/ciclo-vida.test.ts`
- `tests/unit/analytics/cohorte-terminales.guardia.test.ts`
- `tests/integration/db/ciclo-vida-gestion-final.int.test.ts`
- `tests/integration/db/cohorte-carga-ventana.int.test.ts`
- `tests/integration/db/cohorte-carga-reloj.int.test.ts`
- `tests/integration/db/455/caracterizacion/sql-crudo-conteos.test.ts`
- `tests/unit/analytics/tags-entregas-fuente-unica.test.ts`
- `tests/unit/actions/deshacer-gestion-invalida-analitica.test.ts`
- `tests/unit/actions/corregir-resultado-invalida-analitica.test.ts`
- `tests/unit/analytics/cache-invalidacion-correccion-cableado.test.ts`
