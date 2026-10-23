# SL-38 «Distritos de zona especial por empresa» — tasks

> **Aprobado por Carlos el 2026-10-23**, P1 incluida: el Excel de cobertura queda solo con «Sí» y
> «No» (R15); «Sin definir» desaparece.

Rama `feature/SL-38-zona-especial-por-empresa`, que sale de `dev` con SL-17 integrado. Reparto:
`backend_dev` para `lib/`, `db/`, `scripts/` y `tests/` de servidor; `frontend_dev` solo para T9.
Un commit por task (`docs/conventions.md > Commits`).

## Orden y paralelismo

| Tanda | Tasks | ¿Paralelo? | Por qué |
|---|---|---|---|
| 0 | T0 | No | Fija los timestamps antes de escribir ninguna migración |
| 1 | T1, T2 | T2 depende de T1 | El modelo y la RLS, antes que nadie lea |
| 2 | T3, T4 [P], T5 [P] | Sí, tras T3 | T3 crea el punto único que usan T4 y T5 |
| 3 | T6, T7 [P] | Sí | Escritura y retiro de la columna, sobre el modelo ya puesto |
| 4 | T8, T9 [P], T10 [P] | Sí | Tests de dos empresas, cobertura y docs |
| 5 | T11 | No | Gate y mutaciones, en serie, nunca a la vez que otra mutación |

## Tanda 0

- [x] **T0. Timestamps y base.**
  - `git fetch` y `git ls-tree --name-only origin/feature/SL-32-rol-superadmin db/migrations/` y
    `origin/dev`. Confirma que `20261023120000` y `20261023120100` son posteriores a la última de las
    dos ramas. Si no lo son, elige los siguientes libres y corrige `design.md §2` en el mismo commit.
  - Confirma en una base local recién rehecha (`pnpm run db:reset`) que
    `SELECT count(*) FROM distrito WHERE zona_especial IS TRUE` da 0.
  - _Hecho:_ los timestamps y el conteo quedan anotados en `progress/impl_SL-38.md`.

## Tanda 1 — El modelo de la empresa

- [x] **T1. M1 y el esquema** (R1, R2, R4, R5; depende de T0).
  - `db/migrations/20261023120000_distrito_zona_especial_por_empresa/{migration,down}.sql`, con el SQL
    de `design.md §2.1`.
  - `db/schema.prisma`: el modelo `DistritoZonaEspecial`, `Distrito.zonasEspeciales` y
    `Organizacion.distritoZonasEspeciales`. `Distrito.zonaEspecial` **todavía no sale** (sale en T7).
  - `lib/db/modelos-de-negocio.ts`: la entrada nueva, y la cabecera pasa de 73 a 74.
  - `tests/unit/guards/rls-por-empresa.guardia.test.ts`: `toBe(74)`.
  - _Hecho:_ `pnpm run db:migrate` aplica M1, y `prisma migrate diff` no da drift. Las guardias
    `organizacion-en-modelos`, `rls-por-empresa` y `fk-misma-empresa` salen en verde.
    `pnpm run typecheck` en verde.
- [x] **T2. La marca aislada, contra Postgres** (R1, R3, R4, R10; depende de T1).
  - `tests/integration/db/distrito-zona-especial-por-empresa.test.ts`, con los casos de
    `design.md §6`, menos el de id inexistente, que entra en T6.
  - _Hecho:_ verde en local. **Se mata** con dos mutaciones: comentar la política (rojo en los casos de
    `comoApp(B)`) y quitar el trigger (rojo en `SL017`). La salida de los dos rojos va a
    `progress/impl_SL-38.md`.

## Tanda 2 — Las lecturas pasan a la marca de la empresa

- [x] **T3. El punto único** (R22; depende de T1).
  - `lib/repositories/_shared/zona-especial.ts`, con `SELECT_MARCA_ZONA_ESPECIAL` y
    `esZonaEspecialDeLaEmpresa` (`design.md §4`).
  - `tests/unit/guards/zona-especial-punto-unico.guardia.test.ts`, con su caso negativo.
  - _Hecho:_ la guardia en verde, y en rojo con una fuente inventada que lee `zonasEspeciales` fuera
    del punto único.
- [x] **T4. [P] Las lecturas de `OrdenRepository`** (R16–R19; depende de T3).
  - `findDistritosByCantonIds`, `findParaCorreccion`, `findDistritoParaCorreccion`,
    `findBaseCobroDevolucion`, `WITH_ESTATUS_Y_TIENDA` y su `toListItem`, y `apiOrdenSelect` y su
    `toApiOrdenRow`. Todas pasan al fragmento y al predicado de T3.
  - Se actualizan los comentarios que citan `distrito.zona_especial` en `IOrdenRepository.ts`,
    `geo-resolucion.ts`, `BulkOrdenService.ts`, `CorregirDatosClienteService.ts`,
    `ICorregirDatosClienteService.ts`, `correccion-datos-cliente.ts`, `ingreso-empresa.ts`,
    `api-orden-costo.ts` e `ITarifaVigenteRepository.ts`. Solo comentarios: la lógica no cambia.
  - Se ajustan los tests con Prisma doble que devuelven `distrito: { zonaEspecial }` (lista en
    «Archivos esperados»).
  - _Hecho:_ `vitest related` sobre `lib/repositories/OrdenRepository.ts` en verde, y typecheck en
    verde.
- [x] **T5. [P] Árbol, cobertura y cierre** (R14, R15, R20; depende de T3).
  - `GeoRepository.listArbol` usa el fragmento. `DistritoArbolDTO` no cambia, y solo cambia su
    comentario en `lib/types/geografia-nodo.ts`.
  - `CoberturaRepository.listDistritos`, `ICoberturaRepository`, `lib/types/cobertura.ts`,
    `lib/utils/cobertura-distrito.ts` y `cobertura-descarga-columnas.ts`: la marca pasa a ser
    `boolean`, y «Sin definir» desaparece (R15).
  - `CierreDiaRepository.leerDescriptivosDeOrdenes` y la línea que congela `esZonaEspecial`.
  - Se ajustan sus tests (lista en «Archivos esperados»).
  - _Hecho:_ `vitest related` sobre los tres repositorios y sobre `cobertura-descarga-columnas.ts` en
    verde. Ningún test de componente de Tarifas ni de geografía cambia.

## Tanda 3 — Escritura y retiro de la columna

- [x] **T6. La escritura por capas** (R9, R11, R12, R13; depende de T1).
  - `lib/types/distrito-zona-especial.ts`, las dos interfaces, `DistritoZonaEspecialRepository` y
    `DistritoZonaEspecialService` (`design.md §3`).
  - `lib/actions/geografia.ts`: `actualizarDistritosEspeciales` delega en el servicio, gana `deps`
    opcional y su composition root, y se corrige el comentario de cabecera. El nombre, la entrada y el
    tipo de resultado no cambian.
  - `tests/unit/services/distrito-zona-especial-service.test.ts` (nuevo) y
    `tests/unit/actions/distritos-especiales-action.test.ts` (reescrito sobre `deps`, con la
    comprobación de que el composition root **pasa** el repositorio).
  - Se añade a `distrito-zona-especial-por-empresa.test.ts` el caso del id inexistente (R13): 0 filas
    nuevas y `validation_error`.
  - _Hecho:_ los tres archivos en verde. Los 6 tests de componentes que mockean `@/lib/actions/geografia`
    siguen en verde sin tocarlos.
- [x] **T7. [P] M2: retirar `distrito.zona_especial`** (R6, R7, R8; depende de T4 y T5).
  - `db/migrations/20261023120100_retirar_distrito_zona_especial/{migration,down}.sql`
    (`design.md §2.2`).
  - `db/schema.prisma`: sale `Distrito.zonaEspecial`, y se reescriben los comentarios que lo citan
    (`Provincia.activo`, `Provincia.codigoDta`, `Distrito.activo` y `CierreDetail.esZonaEspecial`).
  - `tests/integration/db/distrito-zona-especial-migration.test.ts`: el caso del schema afirma que
    `Distrito` ya no declara el campo.
  - Se ajustan los tests de integración que siembran `distrito.zona_especial` (lista en «Archivos
    esperados»): siembran la marca con `fijarEmpresa`.
  - `tests/integration/db/migracion-sl38-ida-y-vuelta.test.ts` (nuevo), para M1 y M2 (R5, R7, R8).
  - _Hecho:_ `pnpm run typecheck` en verde **sin** la columna. Esa es la prueba de que no queda ningún
    lector. `grep -rn "zonaEspecial: true" lib/ app/` no devuelve ninguna lectura de `distrito`. La
    ida y vuelta en verde, y M2 aborta con una fila `true`.

## Tanda 4 — Dos empresas, cobertura y docs

- [x] **T8. Dos empresas de punta a punta** (R9 sin 500, R14–R21; depende de T4–T7).
  - `tests/integration/db/zona-especial-dos-empresas.test.ts` (`design.md §6`): las nueve lecturas
    con el repositorio real y el cliente extendido. Dan `true` en A y `false` en B. El congelado de
    R20 sobrevive a desmarcar, y `actualizarDistritosEspeciales` con el servicio real da `ok`.
  - _Hecho:_ verde. **Se mata** con tres mutaciones, una cada vez: quitar la política (rojo en los
    casos de B), devolver `true` fijo en `esZonaEspecialDeLaEmpresa` (rojo en B) y no sembrar la marca
    de A (rojo en A, no saltado). La evidencia va a `progress/impl_SL-38.md`.
- [ ] **T9. [P] La pantalla de Tarifas** (R14; `frontend_dev`; depende de T5 y T6).
  - Sin cambio de código esperado: `CrearZonaForm` y `GeografiaSelector` siguen leyendo
    `DistritoArbolDTO.zonaEspecial` y llamando a la misma acción. Se corrigen sus comentarios que
    citan `distrito.zona_especial`.
  - Comprobación en el navegador con dos maestros (A y B) en local: A marca un distrito y guarda. A lo
    ve resaltado al reabrir la zona, B no lo ve, y el guardado no muestra el toast de error.
  - _Hecho:_ capturas o notas de lo visto en `progress/impl_SL-38.md`. `ZonaDistritoEspecial.test.tsx`
    y `CrearZonaFormReconciliacion.test.tsx` en verde.
- [ ] **T10. [P] Script de despliegue y docs** (R23, R24; depende de T1).
  - `scripts/verificar-rls-despliegue.ts`: `POLITICAS_POR_EMPRESA` y `TRIGGERS_SIN_CAMBIO` salen de
    `MODELOS_DE_NEGOCIO.length`, y se exporta la función que arma el contrato esperado.
    `tests/unit/scripts/verificar-rls-despliegue.test.ts` (nuevo).
  - `docs/architecture.md > Multi-empresa`: dice 74 tablas y que la marca de zona especial es de la
    empresa (`distrito_zona_especial`).
  - `progress/deudas.md > D12`: se cierra la pregunta de la marca y se cita SL-38. Lo demás de D12
    sigue con SL-26.
  - _Hecho:_ el test del script en verde. El reviewer lee el diff de los docs.

## Tanda 5 — Cierre

- [ ] **T11. Gate y trazabilidad** (todas).
  - `./init.sh` en verde. Las mutaciones de T2 y T8 ya están registradas, y no se corren a la vez que
    el gate.
  - `progress/impl_SL-38.md` con el mapa `R<n> → test` (`design.md §6`) y los choques con SL-32 al día
    (`design.md §8`).
  - _Hecho:_ el gate en verde con su `INIT_EXIT` en el log, y los 24 requisitos con su test.

## Archivos esperados

Migraciones y esquema:
- `db/schema.prisma`
- `db/migrations/20261023120000_distrito_zona_especial_por_empresa/migration.sql`
- `db/migrations/20261023120000_distrito_zona_especial_por_empresa/down.sql`
- `db/migrations/20261023120100_retirar_distrito_zona_especial/migration.sql`
- `db/migrations/20261023120100_retirar_distrito_zona_especial/down.sql`

Código de servidor:
- `lib/db/modelos-de-negocio.ts`
- `lib/repositories/_shared/zona-especial.ts`
- `lib/types/distrito-zona-especial.ts`
- `lib/interfaces/repositories/IDistritoZonaEspecialRepository.ts`
- `lib/interfaces/services/IDistritoZonaEspecialService.ts`
- `lib/repositories/DistritoZonaEspecialRepository.ts`
- `lib/services/DistritoZonaEspecialService.ts`
- `lib/actions/geografia.ts`
- `lib/repositories/GeoRepository.ts`
- `lib/types/geografia-nodo.ts`
- `lib/repositories/CoberturaRepository.ts`
- `lib/interfaces/repositories/ICoberturaRepository.ts`
- `lib/types/cobertura.ts`
- `lib/utils/cobertura-distrito.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/services/geo-resolucion.ts`
- `lib/services/BulkOrdenService.ts`
- `lib/services/CorregirDatosClienteService.ts`
- `lib/interfaces/services/ICorregirDatosClienteService.ts`
- `lib/types/correccion-datos-cliente.ts`
- `lib/utils/ingreso-empresa.ts`
- `lib/utils/api-orden-costo.ts`
- `lib/interfaces/repositories/ITarifaVigenteRepository.ts`
- `scripts/verificar-rls-despliegue.ts`

Pantalla:
- `app/(app)/configuracion/tarifas/_components/cobertura-descarga-columnas.ts`
- `app/(app)/configuracion/tarifas/_components/CrearZonaForm.tsx`
- `app/(app)/configuracion/tarifas/_components/GeografiaSelector.tsx`

Tests nuevos:
- `tests/integration/db/distrito-zona-especial-por-empresa.test.ts`
- `tests/integration/db/zona-especial-dos-empresas.test.ts`
- `tests/integration/db/migracion-sl38-ida-y-vuelta.test.ts`
- `tests/unit/services/distrito-zona-especial-service.test.ts`
- `tests/unit/guards/zona-especial-punto-unico.guardia.test.ts`
- `tests/unit/scripts/verificar-rls-despliegue.test.ts`

Tests que cambian (los que simulan o siembran la columna retirada):
- `tests/unit/actions/distritos-especiales-action.test.ts`
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/integration/db/distrito-zona-especial-migration.test.ts`
- `tests/unit/descarga/cobertura-descarga-columnas.test.ts`
- `tests/unit/utils/cobertura-distrito.test.ts`
- `tests/unit/utils/_cobertura-fixtures.ts`
- `tests/unit/utils/cobertura-vs-resolve-geo.test.ts`
- `tests/unit/actions/cobertura.composition-root.test.ts`
- `tests/unit/app/tarifas/DescargarCoberturaButton.test.tsx`
- `tests/integration/db/cobertura-repository.test.ts`
- `tests/unit/repositories/orden-repository.api-lectura.test.ts`
- `tests/unit/repositories/orden-repository.bulk.test.ts`
- `tests/unit/repositories/orden-repository.no-regresion-106.test.ts`
- `tests/unit/repositories/orden-repository.recepcion-satelite.test.ts`
- `tests/unit/repositories/satelite-paginado-where.test.ts`
- `tests/unit/repositories/gestion-desde-ayuda-cierre.test.ts`
- `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts`
- `tests/unit/repositories/cierre-dia-repository.test.ts`
- `tests/unit/guards/costo-orden-forma-unica.guardia.test.ts`
- `tests/unit/guards/consultas-concurrentes-en-transaccion.guardia.test.ts`
- `tests/unit/api/ordenes-api-key-composicion-415.test.ts`
- `tests/unit/actions/corregir-datos-cliente.composition-root.test.ts`
- `tests/integration/db/emisor-relaciones-anidadas.test.ts`
- `tests/integration/db/cierre-detail-congelado.test.ts`
- `tests/integration/db/corregir-datos-cliente.repo.test.ts`
- `tests/integration/db/costo-y-zona-api-415.test.ts`
- `tests/integration/db/resolver-novedad-reprograma-dinero.test.ts`
- `tests/integration/db/zona-guardado-conserva-inactivos.test.ts`
- `tests/integration/asimetria-sin-tarifa.test.ts`
- `tests/integration/api/ordenes-api-key-orden-consulta.route.test.ts`
- `tests/integration/api/ordenes-api-key-listado.route.test.ts`

Docs y estado:
- `docs/architecture.md`
- `progress/deudas.md`
- `progress/impl_SL-38.md`

Choques declarados con SL-32 (`design.md §8`): `db/schema.prisma` y `progress/deudas.md`.
