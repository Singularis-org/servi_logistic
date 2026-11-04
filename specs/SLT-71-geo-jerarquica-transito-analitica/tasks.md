# SLT-71 — geo-jerarquica-transito-analitica · tasks.md

> Requisitos R1–R25 en `requirements.md`; diseño en `design.md`. Ninguna task empieza antes de que
> se apruebe el spec. Las tres preguntas del spec se cerraron el 2026-11-04 (tabla de decisiones).
>
> **Dependencia de SLT-64** (decisión «¿Choque de archivos con SLT-64?»): SLT-64 mergea primero.
> - T1.2 y T3.2 esperan a que SLT-64 esté en `dev`.
> - Antes de T1.2 se integra `origin/dev` en la rama, y la copia de «antes» sale de esa base.
> - En F2.3 se vuelve a integrar `dev`, con SLT-64 dentro.
>
> `[P]` = paralelizable con las otras `[P]` de su bloque. Las dependencias van entre corchetes.
> Ningún agente corre los scripts de T5 ni de T6 fuera de la base de tests local.

## T0 — Preparación

- [ ] **T0.1** Comprobar los contextos (design §3.5 y §4):
  - ningún camino genera el informe de tránsito en `comoPlataforma` ni sin contexto;
  - ninguna lectura de analítica ni de las que comparten el recorte corre en `comoPlataforma`.

  **Hecho:** la lista de llamadores, con su contexto, está en `progress/impl_SLT-71.md`. Si aparece
  uno en plataforma, se para y se pregunta.
- [ ] **T0.2** Fixture `tests/integration/db/_fixtures/geo-71.ts` sobre `geo-65.ts` (design §11).
  **Hecho:** un test que cuenta sus filas por lectura (antivacío) pasa, con al menos una fila en
  cada lectura de analítica y en tránsito.

## T1 — La lectura de hoy y la medición compartida [T0]

- [ ] **T1.1** Extraer la medición de `scripts/geo-explain-consultas.ts` a
  `scripts/geo-equivalencia/medicion.ts` (design §9.1). `bloqueaPorPorcentaje` pasa a la definición
  de la lectura, y `geo-explain-consultas.ts` re-exporta. **Hecho:**
  `tests/integration/db/geo-explain-consultas.test.ts` pasa sin cambios.
- [ ] **T1.2** `scripts/geo-equivalencia/analitica-de-hoy.ts`: copia **literal** de la tabla de
  design §7, **antes** de tocar ningún repositorio, desde `origin/dev` con SLT-64 ya mergeada e
  integrada en la rama. **Hecho:** compila. El commit de la copia va solo, cita el SHA de `dev` y
  precede a los de T2–T4. El reviewer la compara con ese SHA.

## T2 — El filtro por lugar [T1]

- [ ] **T2.1** `lib/repositories/_shared/lugar-orden.ts`: `sqlLugarEn` y `PROFUNDIDAD_DEL_NIVEL`
  movida desde `OrdenRepository.ts`, que pasa a importarla (design §3.1). **Hecho:** typecheck en
  verde. `tests/unit/repositories/lugar-orden.test.ts`, ampliado, pasa.
- [ ] **T2.2** `lib/repositories/_shared/lugares-del-filtro.ts` (design §3.2) y
  `tests/unit/repositories/lugares-del-filtro.test.ts`, con el catálogo de 4 niveles. **Hecho:** el
  test pasa (R1, R3, R5).

## T3 — Analítica [T2]

- [ ] **T3.1** [P] `ConteoPorStatusRepository` (sitio 2) y `ConteoDevolucionesRepository` (sitio 4):
  `lugares` en el constructor de condiciones, el catálogo por instancia y `lugaresDelFiltro` en el
  método (design §3.3–3.4). **Hecho:** typecheck en verde. `conteo-por-status-sql.test.ts`,
  `conteo-devoluciones.test.ts` y `conteo-entregas-*.test.ts` pasan, cambiando solo lo de design
  §11.1.
- [ ] **T3.2** [P] `ConteoCargadasPorDiaRepository` (sitio 3) y `CicloVidaRepository` (sitio 5), con
  el mismo patrón. `CicloVidaRepository` se toca sobre la versión de SLT-64 ya integrada.
  **Hecho:** typecheck en verde. `ciclo-vida.test.ts` y `conteo-cargadas-servicio.test.ts` pasan,
  cambiando solo lo de §11.1.
- [ ] **T3.3** Las cuatro lecturas que comparten el recorte (`ConteoProductosRepository`,
  `DineroProductosRepository`, `CohorteCargaRepository` y `ConteoHoyGestionRepository`) pasan
  `lugares` al constructor único. **Hecho:** typecheck en
  verde. `conteo-productos-sql`, `dinero-productos-sql`, `cohorte-carga-sql`,
  `conteo-hoy-gestion-servicio` y sus `*.int.test.ts` pasan, cambiando solo lo de §11.1 (R7).
- [ ] **T3.4** `tests/integration/db/geo-analitica-lugar.test.ts` (R1–R5, R13), sobre T3.1–T3.3.
  **Hecho:** pasa. `conteo-por-status-cohorte.int.test.ts`, `efectividad-por-rol.int.test.ts`,
  `cohorte-carga-*.int.test.ts`, `conteo-productos.int.test.ts`, `dinero-productos.int.test.ts` y
  `455/caracterizacion/sql-crudo-*.test.ts` pasan sin cambiar aserciones.

## T4 — Tránsito [T2.1]

- [ ] **T4.1** [P] `InformeTransitoRepository.filasEnAlerta` sin `JOIN` y con los nombres del
  catálogo, sin cargarlo cuando no hay filas. Un nodo ausente escribe la línea
  `analitica - informe transito - error: …` con `ErrorLogger` (inyectable, por defecto
  `defaultLogger`) y la generación falla (design §4). **Hecho:** typecheck en verde. `informe-transito-*.test.ts` (unitarios y de integración) pasan sin
  cambiar aserciones.
- [ ] **T4.2** `tests/integration/db/geo-transito-nombres.test.ts` (R8–R13), con el test de la línea
  de log de R12 (prefijo, ids de nodo y de orden, sin datos personales ni nombres, y la contraprueba
  sin log). **Hecho:** pasa.

## T5 — Script de equivalencia [T3, T4]

- [ ] **T5.1** `scripts/geo-equivalencia-analitica.ts` con los bloques de design §8, y
  `pnpm geo:equivalencia-analitica` en `package.json`. **Hecho:** corre contra la base de tests
  local y sale 0 con el fixture.
- [ ] **T5.2** `tests/integration/db/geo-equivalencia-analitica.test.ts` (R17, R18), con la
  contraprueba del nodo inyectado y el bloque `comparten-recorte`. **Hecho:** pasa.

## T6 — Script de rendimiento [T1.1, T3, T4]

- [ ] **T6.1** `scripts/geo-explain-analitica.ts`: las seis lecturas de design §9.2, `veredicto`
  exportado y `pnpm geo:explain-analitica` en `package.json`. **Hecho:** corre contra la base local,
  y su salida no tiene SQL, nombres de lugar ni datos personales.
- [ ] **T6.2** `tests/integration/db/geo-explain-analitica.test.ts` (R18–R22). **Hecho:** pasa con
  los casos de design §11 (R20, R21).

## T7 — Guardias [T3, T4]

- [ ] **T7.1** [P] Ampliar `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`
  (design §6) y `tests/integration/db/geo-lecturas-sin-backfill.test.ts` (R14). **Hecho:** pasan,
  con la contraprueba de la guardia.
- [ ] **T7.2** [P] Ampliar el antivacío de
  `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` (R16). **Hecho:**
  verde sobre el repo.
- [ ] **T7.3** `pnpm run test:guardias` completo. **Hecho:** en verde, incluidas
  `geografia-sin-cte-recursiva` (R15), `alcance-obligatorio` y `modulo-puro`.

## T8 — Cierre de la implementación [T5, T6, T7]

- [ ] **T8.1** Mapa `R<n> → test` completo en `progress/impl_SLT-71.md`, con las comprobaciones de
  diff anotadas:
  - `db/` vacío, o solo la migración de T9 (R23);
  - `lib/analytics/` vacío (R6);
  - lo de R25 fuera del diff;
  - la lista exacta de aserciones cambiadas, que debe coincidir con design §11.1 (R24).

  **Hecho:** cada R1–R25 tiene una fila.
- [ ] **T8.2** `./init.sh` en verde. Si muere por memoria, typecheck y guardias en local, y la suite
  completa en `gate-completo` de CI (regla del humano «gate en CI, no local»). **Hecho:** la salida
  está en `progress/impl_SLT-71.md`.
- [ ] **T8.3** Puerta humana, sin agente. Una persona corre `pnpm geo:equivalencia-analitica` y
  `pnpm geo:explain-analitica` sobre la **copia** de producción y pega las dos salidas en el PR.
  **Hecho:**
  - la equivalencia sale 0;
  - el rendimiento sale 0. Los `costo-fijo-del-catalogo` se anotan en el PR. Si sale 1, se pasa a
    T9.

## T9 — Solo si T8.3 marca regresión [T8.3]

- [ ] **T9.1** Índice en una migración aditiva (design §10):
  - el timestamp se comprueba contra `origin/dev` y las ramas en vuelo;
  - `@@index` en `db/schema.prisma`;
  - `slt43-migraciones-aditivas.test.ts` ampliado.

  Si el plan pide un índice de expresión, se para y se pregunta. **Hecho:** `migrate diff` sale
  vacío, el `down.sql` se ensaya sobre la base local y una persona repite T8.3 sin regresión.

## Archivos esperados

- `lib/repositories/_shared/lugar-orden.ts`
- `lib/repositories/_shared/lugares-del-filtro.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/repositories/InformeTransitoRepository.ts`
- `lib/repositories/ConteoPorStatusRepository.ts`
- `lib/repositories/ConteoCargadasPorDiaRepository.ts`
- `lib/repositories/ConteoDevolucionesRepository.ts`
- `lib/repositories/CicloVidaRepository.ts`
- `lib/repositories/ConteoProductosRepository.ts`
- `lib/repositories/DineroProductosRepository.ts`
- `lib/repositories/CohorteCargaRepository.ts`
- `lib/repositories/ConteoHoyGestionRepository.ts`
- `scripts/geo-equivalencia/medicion.ts`
- `scripts/geo-equivalencia/analitica-de-hoy.ts`
- `scripts/geo-explain-consultas.ts`
- `scripts/geo-equivalencia-analitica.ts`
- `scripts/geo-explain-analitica.ts`
- `package.json`
- `tests/integration/db/_fixtures/geo-71.ts`
- `tests/integration/db/geo-analitica-lugar.test.ts`
- `tests/integration/db/geo-transito-nombres.test.ts`
- `tests/integration/db/geo-equivalencia-analitica.test.ts`
- `tests/integration/db/geo-explain-analitica.test.ts`
- `tests/integration/db/geo-lecturas-sin-backfill.test.ts`
- `tests/unit/repositories/lugar-orden.test.ts`
- `tests/unit/repositories/lugares-del-filtro.test.ts`
- `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`
- `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts`
- Solo las aserciones de design §11.1 y los dobles de entrada:
  - `tests/unit/analytics/conteo-por-status-sql.test.ts`
  - `tests/unit/analytics/conteo-devoluciones.test.ts`
  - `tests/unit/analytics/ciclo-vida.test.ts`
  - `tests/unit/analytics/conteo-cargadas-servicio.test.ts`
  - `tests/unit/analytics/cohorte-carga-sql.test.ts`
  - `tests/unit/analytics/conteo-productos-sql.test.ts`
  - `tests/unit/analytics/dinero-productos-sql.test.ts`
- Solo si T9.1 aplica:
  - `db/schema.prisma`
  - `db/migrations/<timestamp>_indice_lugar_orden_slt71/migration.sql`
  - `db/migrations/<timestamp>_indice_lugar_orden_slt71/down.sql`
  - `tests/unit/db/slt43-migraciones-aditivas.test.ts`
- `progress/impl_SLT-71.md`
- `progress/features/SLT-71.md`
