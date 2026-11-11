# SLT-47 — geo-jerarquica-presentacion · tasks.md

> Requisitos: `requirements.md` (R1–R40). Diseño: `design.md`. `[P]` = paralelizable con las demás
> `[P]` de su tanda. Cada tanda cierra con `./init.sh` en verde. Si el local muere por memoria, cierra
> con typecheck y guardias, y el gate completo corre en CI.
>
> Reparto por capa (`docs/perfil-agentes.md > implementer`):
> - `backend_dev`: T1, T2 y los scripts;
> - `frontend_dev`: T3, T4 y T5;
> - el leader arma T0 y lleva T7.

## T0 — Maqueta del filtro de N niveles (leader + humano) · bloquea T3.2, T4 y T5

- [ ] **T0.1** El leader arma la maqueta (`/design`) del filtro de lugar en un país de 2, 3 (Costa
  Rica), 4 y 10 niveles. Cubre:
  - la barra de `/ordenes` (que satélite y analítica heredan);
  - `/novedades`, con la lista del nivel 3 nueva (R8);
  - mis-asignaciones en el ancho de un teléfono (R7);
  - el salto de línea con muchos niveles (R5);
  - las respuestas a P2 y P4: la forma de mis-asignaciones y si las listas hondas quedan
    deshabilitadas hasta elegir arriba.
  **Hecho:** la maqueta está en el repo o enlazada desde `progress/impl_SLT-47.md`.
- [ ] **T0.2** El humano aprueba la maqueta.
  **Hecho:** fecha, referencia y quién aprobó, anotados en `progress/impl_SLT-47.md` (R33). Si cambia
  P2 o P4, el `spec_author` ajusta R3 y R7 antes de T4.

## T1 — Preparación (backend_dev) · sin dependencias

- [ ] **T1.1** Inventario antes de tocar código. Anotar en `progress/impl_SLT-47.md`:
  - todas las lecturas que producen `NovedadDTO` y `MiAsignacionDTO` (design §3.4);
  - todos los consumidores de `provincia_id`, `canton_id` y `distrito_id` como clave de transporte
    en `lib/`, `app/` y `scripts/`;
  - los tests que fijan esas claves (design §12.1);
  - si `PaisRepository.deLaEmpresa` ya trae los tipos del país;
  - si `FilterComponent` ya envuelve las listas.
  **Hecho:** la lista está anotada, y cada archivo nuevo que aparezca se añade a «Archivos
  esperados».
- [ ] **T1.2** [P] Fixture `tests/integration/db/_fixtures/geo-47.ts` (design §12).
  **Hecho:** lo importa un test vacío que pasa con `HAY_BASE_DE_DATOS`.

## T2 — Servidor (backend_dev) · depende de T1

- [ ] **T2.1** `lugares-del-filtro.ts` generalizado (`resolverLugar`, `condicionesDeLugar` y
  `lugaresDelFiltro` de una faceta) y `ruta-del-lugar.ts`. Tests: `lugares-del-filtro.test.ts`
  (ajustado) y `ruta-del-lugar.test.ts`.
  **Hecho:** R11, R12 y R16 en verde en unit.
- [ ] **T2.2** Entradas: `lugar_id` en `ordenFilterBase`, `FILTROS_COMPARTIDOS` de satélite y
  `conteoEntregasFiltroSchema`, y la clave de caché de analítica. Test: `filtro-lugar-schemas.test.ts`.
  **Hecho:** R10 en verde; las claves viejas dan `validation_error`.
- [ ] **T2.3** Lecturas:
  - `OrdenService.construirWhere` y `OrdenRepository.list` con `whereLugarEn`;
  - `RecepcionSateliteService.filtroDeRepo` y `condicionesSatelite` con `condicionesDeLugar`;
  - `GeoRepository` (`niveles` y `lugares` en los dos catálogos) y `FiltrosOrdenesService`;
  - `lugarRuta` en `GestionOrdenRepository`, `findNovedadesByTienda` y los servicios que mapean el
    DTO.

  Tests: `geo-filtros-lugar.test.ts` y la ampliación de `geografia-lecturas-sin-nodo-fk.guardia`.
  **Hecho:**
  - R11–R16, R27, R36 y R37 en verde en integración;
  - las suites existentes sin cambiar aserciones, salvo las líneas de §12.1;
  - el tamaño del JSON del catálogo de CR antes y después, anotado.
- [ ] **T2.4** [P] `PaisService.nivelesDeEmpresa` y su repositorio (design §5.4).
  **Hecho:** test unitario del servicio con un país de 2 y de 4 niveles.
- [ ] **T2.5** [P] Scripts:
  - `geo-equivalencia-filtros.ts` con `filtros-de-hoy.ts`;
  - `geo-explain-filtros.ts`;
  - los ajustes de tipo en los scripts de SLT-71;
  - las entradas en `package.json`.

  Tests: `geo-equivalencia-filtros.test.ts` y `geo-explain-filtros.test.ts`.
  **Hecho:** R28–R30 en verde en la base local; el script de equivalencia sale con 0 sobre el
  fixture, salvo la orden incoherente, que sale aparte.

## T3 — FiltroUbicacion (frontend_dev) · T3.1 depende de T2.2; T3.2 de T0.2

- [ ] **T3.1** `lib/utils/filtro-ubicacion.ts`: `declararNiveles`, `lugarElegido`, `traductorPorId`,
  `traductorPorNombre` y `deV1` en `vista-filtro.ts` (v2, v1 legible). Tests:
  `filtro-ubicacion.test.ts`, `vista-filtro-v2.test.ts` y `filtro-ubicacion-rendimiento.test.ts`.
  **Hecho:** R1, R2, R4, R6, R17, R21–R24 y R32 en verde. Las mediciones de R32 se anotan.
- [ ] **T3.2** Prop `traductorUrl` en `FilterComponent` y `BuscadorFiltros`, con la activación
  tardía de §4.2. `niveles` en `EtiquetasGeograficasProvider`, `useNivelesGeograficos` y
  `app/(app)/layout.tsx`. Test: `FiltroUbicacionBarra.test.tsx`.
  **Hecho:**
  - R3, R5, R18 y R20 en verde;
  - sin la prop, las suites de `FilterComponent` y `BuscadorFiltros` sin cambios.

## T4 — `/ordenes`, recepción satélite y analítica (frontend_dev) · depende de T2.3, T3

- [ ] **T4.1** [P] `/ordenes` y satélite:
  - `ordenes-filtros-def.ts`, `seleccion-a-filter.ts` y `satelite-ordenes-filtros.ts`;
  - el traductor en `OrdenesListado.tsx` y `SateliteOrdenesListado.tsx`.

  Test: `seleccion-a-filter-lugar.test.ts`, más los existentes ajustados según §12.1.
  **Hecho:** R6 y R9 en verde; en Costa Rica, la barra igual a la maqueta aprobada.
- [ ] **T4.2** [P] Analítica: `entregas-filtros-def.ts`, `entregas-filtro-analitica.ts` y
  `FiltrosEntregas.tsx`. Se buscan y ajustan los consumidores de `CLAVE_PROVINCIA`, `CLAVE_CANTON` y
  `CLAVE_DISTRITO`.
  **Hecho:** `entregas-filtro-analitica.test.ts` en verde, cambiando solo la clave de transporte.

## T5 — Novedades y mis-asignaciones (frontend_dev) · depende de T2.3, T3

- [ ] **T5.1** [P] Mis-asignaciones:
  - `FiltroUbicacion.tsx` y `useFiltroUbicacion.ts` sustituyen a `FiltroCantonDistrito` y
    `useFiltroCantonDistrito`;
  - `filtro-canton-distrito.ts` pasa a `filtro-ubicacion-asignaciones.ts`, por id sobre `lugarRuta`;
  - `RepartoModule.tsx`.

  Test: `mis-asignaciones/FiltroUbicacion.test.tsx`, que sustituye a `filtro-canton-distrito.test.ts`.
  **Hecho:**
  - R7 y R13 en verde;
  - `e2e/mis-asignaciones.spec.ts` en verde;
  - la latencia de la lista del mensajero antes y después, anotada.
- [ ] **T5.2** [P] Novedades: `novedades-filtros.ts`, `NovedadesFiltrosBarra.tsx` y
  `useNovedadesFiltro.ts`. Test: `novedades-filtros-lugar.test.ts`; `novedades-filtros.test.ts`
  ajustado.
  **Hecho:** R8, R13 y R19 en verde.

## T6 — E2E nuevo (frontend_dev) · depende de T4.1

- [ ] **T6.1** `e2e/geo-filtro-lugar.spec.ts`. En una empresa de Costa Rica:
  - siembra órdenes en dos cantones;
  - siembra una vista de la versión 1 con `canton_id`;
  - filtra `/ordenes` por un cantón desde la barra;
  - abre `/ordenes?canton_id=<id>`;
  - aplica la vista;
  - comprueba que las tres veces salen las mismas guías y ninguna del otro cantón.

  **Hecho:** R18, R23 y R39 en verde en local, con `pnpm exec playwright test
  e2e/geo-filtro-lugar.spec.ts`.

## T7 — Cierre (leader + persona) · depende de todo

- [ ] **T7.1** Una persona corre `geo:equivalencia-filtros` y `geo:explain-filtros` sobre la copia de
  producción.
  **Hecho:** las cifras están en `progress/impl_SLT-47.md`; 0 diferencias salvo las órdenes
  incoherentes (P1), y sin regresión. Si hay regresión, se sigue design §9: índice (R31) y otra
  medida.
- [ ] **T7.2** Una persona aplica vistas v1 reales sobre la copia de producción (R26).
  **Hecho:** cuántas probó, cuántas salieron legibles y si dieron las mismas órdenes, anotado.
- [ ] **T7.3** Gate completo en CI (`gate-completo` en verde), con estos E2E:
  - `mis-asignaciones`, `recepcion-satelite` y `asignacion-satelite`;
  - `dos-empresas-humo`;
  - `geo-filtro-lugar`.

  **Hecho:** R38 en verde; el mapa `R<n> → test` está completo en `progress/impl_SLT-47.md`.
- [ ] **T7.4** Reviewer:
  - diff de `tests/` según §12.1;
  - diff de `db/` (R31);
  - nada de SLT-125 ni de SLT-48 en el diff (R40);
  - ninguna escritura nueva (R34).

  **Hecho:** veredicto OK en `progress/review_SLT-47.md`.

## Archivos esperados

Estimación: **81 archivos** (55 de código, scripts y config, 4 de ellos borrados, y 26 de tests),
más 4 si hace falta el índice de R31. **Unas 4.100 líneas** cambiadas: unas 2.100 de código y
scripts, y unas 2.000 de tests. Por encima de 40 archivos: ver P6 en
`requirements.md`. Entre paréntesis, las líneas estimadas.

Servidor:
- `lib/repositories/_shared/lugares-del-filtro.ts` (~80)
- `lib/repositories/_shared/ruta-del-lugar.ts` (~40, nuevo)
- `lib/types/orden.ts` (~15)
- `lib/types/recepcion-satelite.ts` (~5)
- `lib/analytics/entregas-conteo.ts` (~15)
- `lib/services/OrdenService.ts` (~20)
- `lib/interfaces/repositories/IOrdenRepository.ts` (~15)
- `lib/repositories/OrdenRepository.ts` (~70)
- `lib/services/RecepcionSateliteService.ts` (~10)
- `lib/types/filtros-ordenes.ts` (~30)
- `lib/repositories/GeoRepository.ts` (~50)
- `lib/interfaces/repositories/IGeoRepository.ts` (~10)
- `lib/services/FiltrosOrdenesService.ts` (~20)
- `lib/repositories/GestionOrdenRepository.ts` (~40)
- `lib/interfaces/repositories/IGestionOrdenRepository.ts` (~5)
- `lib/interfaces/services/IMisAsignacionesService.ts` (~5)
- `lib/services/MisAsignacionesService.ts` (~5)
- `lib/types/novedad.ts` (~5)
- `lib/services/NovedadesService.ts` (~5)
- `lib/services/PaisService.ts` (~20)
- `lib/interfaces/services/IPaisService.ts` (~5)
- `lib/repositories/PaisRepository.ts` (~20)
- `lib/interfaces/repositories/IPaisRepository.ts` (~5)
- `lib/types/vista-filtro.ts` (~60)

Cliente:
- `lib/utils/filtro-ubicacion.ts` (~260, nuevo)
- `lib/utils/filtro-canton-distrito.ts` (se borra)
- `lib/utils/filtro-ubicacion-asignaciones.ts` (~110, nuevo)
- `components/shared/FilterComponent.tsx` (~40)
- `components/shared/BuscadorFiltros.tsx` (~40)
- `providers/EtiquetasGeograficasProvider.tsx` (~25)
- `hooks/use-niveles-geograficos.ts` (~20, nuevo)
- `app/(app)/layout.tsx` (~15)
- `app/(app)/ordenes/_components/ordenes-filtros-def.ts` (~40)
- `app/(app)/ordenes/_components/seleccion-a-filter.ts` (~20)
- `app/(app)/ordenes/_components/OrdenesListado.tsx` (~10)
- `app/(app)/recepcion-satelite/_components/satelite-ordenes-filtros.ts` (~15)
- `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx` (~10)
- `app/(app)/_components/entregas-filtros-def.ts` (~40)
- `app/(app)/_components/entregas-filtro-analitica.ts` (~15)
- `app/(app)/_components/FiltrosEntregas.tsx` (~15)
- `app/(app)/novedades/_components/novedades-filtros.ts` (~90)
- `app/(app)/novedades/_components/NovedadesFiltrosBarra.tsx` (~10)
- `app/(app)/novedades/_components/useNovedadesFiltro.ts` (~15)
- `app/(app)/mis-asignaciones/_components/FiltroCantonDistrito.tsx` (se borra)
- `app/(app)/mis-asignaciones/_components/useFiltroCantonDistrito.ts` (se borra)
- `app/(app)/mis-asignaciones/_components/FiltroUbicacion.tsx` (~130, nuevo)
- `app/(app)/mis-asignaciones/_components/useFiltroUbicacion.ts` (~80, nuevo)
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx` (~15)

Scripts y config:
- `scripts/geo-equivalencia-filtros.ts` (~220, nuevo)
- `scripts/geo-explain-filtros.ts` (~160, nuevo)
- `scripts/geo-equivalencia/filtros-de-hoy.ts` (~90, nuevo)
- `scripts/geo-equivalencia/analitica-de-hoy.ts` (~15)
- `scripts/geo-equivalencia-analitica.ts` (~15)
- `scripts/geo-explain-analitica.ts` (~10)
- `package.json` (~2)

Tests:
- `tests/integration/db/_fixtures/geo-47.ts` (~150, nuevo)
- `tests/integration/db/geo-filtros-lugar.test.ts` (~300, nuevo)
- `tests/integration/db/geo-equivalencia-filtros.test.ts` (~120, nuevo)
- `tests/integration/db/geo-explain-filtros.test.ts` (~80, nuevo)
- `tests/unit/utils/filtro-ubicacion.test.ts` (~250, nuevo)
- `tests/unit/utils/filtro-ubicacion-rendimiento.test.ts` (~60, nuevo)
- `tests/unit/types/vista-filtro-v2.test.ts` (~90, nuevo)
- `tests/unit/types/filtro-lugar-schemas.test.ts` (~60, nuevo)
- `tests/unit/repositories/lugares-del-filtro.test.ts` (~60)
- `tests/unit/services/ruta-del-lugar.test.ts` (~50, nuevo)
- `tests/unit/ordenes/seleccion-a-filter-lugar.test.ts` (~40, nuevo)
- `tests/unit/novedades/novedades-filtros-lugar.test.ts` (~120, nuevo)
- `tests/components/FiltroUbicacionBarra.test.tsx` (~180, nuevo)
- `tests/components/mis-asignaciones/FiltroUbicacion.test.tsx` (~140, nuevo)
- `tests/unit/filtro-canton-distrito.test.ts` (se borra; lo sustituye el anterior)
- `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` (~10)
- `tests/unit/components/ordenes-filtros-def.test.ts` (~30, solo claves)
- `tests/unit/components/seleccion-a-filter.test.ts` (~10, solo claves)
- `tests/unit/components/filtros-acotados-por-rol.test.ts` (~15, solo claves)
- `tests/unit/components/ordenes-listado-filtros.test.tsx` (~5, solo claves)
- `tests/unit/components/ordenes-module-filter-key.test.tsx` (~5, solo claves)
- `tests/unit/components/novedades-filtros.test.ts` (~30, solo claves)
- `tests/unit/analytics/entregas-filtro-analitica.test.ts` (~15, solo claves)
- `tests/unit/analytics/_catalogo-facetas.ts` (~10)
- `tests/unit/services/pais-service.test.ts` (~30)
- `e2e/geo-filtro-lugar.spec.ts` (~150, nuevo)

Solo si §9 marca regresión (R31):
- `db/schema.prisma`
- `db/migrations/<ts>_orden_lugar_slt47/migration.sql`
- `db/migrations/<ts>_orden_lugar_slt47/down.sql`
- `tests/unit/db/slt47-migraciones-aditivas.test.ts`
