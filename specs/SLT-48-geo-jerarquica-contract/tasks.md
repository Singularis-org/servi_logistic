# SLT-48 — geo-jerarquica-contract · tasks.md

> Requisitos: `requirements.md` (R1–R49). Diseño: `design.md`. `[P]` = se puede hacer en paralelo con
> las demás `[P]` de su tanda.
>
> Cada tanda cierra con `./init.sh` en verde. Si el gate local muere por memoria, se cierra con
> typecheck y guardias, y el gate completo corre en CI.
>
> P1–P5 y el tamaño los decidió el humano el 2026-11-17 («Decisiones cerradas» de `requirements.md`).
>
> Reparto por capa (`docs/perfil-agentes.md > implementer`):
> - `backend_dev`: T1, T2, T3 y T5;
> - `frontend_dev`: T4 y T6;
> - el leader arma T0 y lleva T7; una persona hace T7.1.
>
> Tandas: **T0** maqueta (en paralelo con T1–T3) → **T1** base y Prisma → **T2** servidor → **T3** mover
> nodo (servidor) → **T4** pantallas (espera T0.2) → **T5** tests que escriben tablas viejas → **T6** E2E
> → **T7** cierre.

## T0 — Maqueta (leader + humano) · bloquea T4

- [x] **T0.1** El leader arma la maqueta (`/design`) en un país de 2, 3 (Costa Rica), 4 y 10 niveles.
  Cubre:
  - en `/plataforma/geografia`, la acción «Mover» y el modal antes → después: rutas, descendientes,
    órdenes que cambian de nombre, y el estado bloqueado con cuántas órdenes y de qué empresas (P1);
  - el aviso y el modal de corregir ubicación con un selector por nivel hasta la hoja, y el mensaje de
    «ubicación incompleta»;
  - las etiquetas de lugar del historial con rutas de 2, 3, 4 y 10 niveles;
  - las pantallas de grupos de tarifas y de zonas con el árbol hasta P;
  - la plantilla de carga masiva de un país de 4 niveles, aunque no haya cambio visual.
  **Hecho:** la maqueta está en el repo o enlazada desde `progress/impl_SLT-48.md`.
- [x] **T0.2** El humano aprueba la maqueta.
  **Hecho:** fecha, referencia y quién aprobó, anotados en `progress/impl_SLT-48.md` (R42).

## T1 — Base y Prisma (backend_dev) · sin dependencias

- [x] **T1.1** Comprobar Prisma y las vistas (design §3). Pasos:
  1. comprobar que Postgres es ≥ 15, en la base de tests y en la versión de Supabase del proyecto
     (`security_invoker`);
  2. en una rama local, probar el camino A (`previewFeatures = ["views"]`, `view` con relaciones) con
     `prisma validate`, `prisma generate` y `prisma migrate diff --from-migrations db/migrations
     --to-schema db/schema.prisma`;
  3. elegir el camino A o el B según los tres criterios del diseño.
  **Hecho:** la decisión y la salida de los comandos están en `progress/impl_SLT-48.md`. Si ningún camino
  funciona, se para y se pregunta.
- [x] **T1.2** Migración `…_slt48_historial_nodo_movido` (`migration.sql` + `down.sql`) y el valor en
  `HistorialPlataformaAccion` de `schema.prisma`.
  **Hecho:** aplica y revierte en la base de tests.
- [x] **T1.3** Migración `…_slt48_geografia_vieja_a_vistas` (design §2.1, en este orden): precondición,
  FK y NOT NULL, sincronía, `orden_nodo_geografico`, `geografia_del_pais_de_la_empresa`, tablas → vistas
  con `security_invoker`, `INSTEAD OF` (`SL048`) y `GRANT SELECT`. Su `down.sql` lleva precondición
  (P5), tablas, datos, FK de órdenes nuevas, NOT NULL, FK, triggers y funciones de antes. Depende de T1.1.
  **Hecho:** `migracion-slt48-ida-y-vuelta.test.ts` verde (R4, R6, R11, R12, R20).
- [x] **T1.4** `schema.prisma` según el camino elegido en T1.1 y `prisma generate`.
  **Hecho:** `pnpm run typecheck` verde, o con los errores esperados que listan los lectores de T2.
- [x] **T1.5** [P] Guardia `tests/unit/db/slt48-migraciones-declaradas.test.ts`, con la lista cerrada de
  operaciones destructivas y una contraprueba (y `destructivasDeclaradas` en `_migraciones-aditivas.ts`
  si hace falta).
  **Hecho:** verde sobre las migraciones reales; rojo con un `DROP COLUMN`, un `DROP VIEW`, un
  `ALTER TABLE "pais"` o un `SET NOT NULL` sobre `nodo_geografico_id` inventados (R13, R14).
- [x] **T1.6** [P] Tests de integración de la base: `slt48-vistas-geografia.test.ts` (R1, R2, R3, R5) y
  `slt48-triggers-orden-pais.test.ts` (R7, R8, R9).
  **Hecho:** verdes contra Postgres real.
- [x] **T1.7** [P] `slt48-trigger-orden-rendimiento.test.ts`: carga masiva de prueba con los triggers
  nuevos.
  **Hecho:** ≤ 1 ms por fila (R10). Si se pasa, no entra y se avisa.
- [x] **T1.8** Fábrica y fixtures base a nodos: `tests/fabricas/paises.ts` y `_fixtures/geo-43.ts`,
  `geo-44.ts`, `geo-47.ts`, `geo-71.ts` crean tipos y nodos con los mismos ids de hoy. Helper
  `_fixtures/sin-slt48.ts` para las idas y vueltas de migraciones viejas (design §9). Depende de T1.3.
  **Hecho:** los tests que solo usan la fábrica pasan sin cambiar aserciones.

## T2 — Servidor: escrituras, lectores y tarifas (backend_dev) · depende de T1

- [x] **T2.1** Regla de hoja en `geo-ubicacion.ts` (design §4.1): `esHoja` y `msgUbicacionIncompleta`.
  Fuera `esPaisDeTresNiveles`, `admiteGuardado`, `fksDeNodo` y `MSG_PAIS_NO_HABILITADO`. Hoja = sin
  hijos activos (P2).
  **Hecho:** `geo-ubicacion.test.ts` cubre CR (cantón con y sin distritos), 2, 4 y 10 niveles, y hoja con
  hijos retirados (R17, R18).
- [x] **T2.2** Vías de entrada (design §4.2): `BulkOrdenService`, `geo-resolucion` (v1),
  `CotizacionOrdenService`, `OrdenRepository.createManyOrdenes*`/`toCreateManyInput`/`toUpdateData`,
  `IOrdenRepository`, `lib/types/orden.ts`.
  **Hecho:** `orden-nodo-escritura.test.ts` comprueba que cada vía deja las 3 FK en NULL (R15);
  `bulk-orden-service.n-niveles`, `bulk-orden-service.forma-pais`, `geo-resolucion-v1-mensajes` y
  `v2-paises-de-prueba.route` verdes con la regla de hoja (R17–R19).
- [x] **T2.3** Corrección de ubicación a `nodoId` (design §4.2): `lib/types/correccion-datos-cliente.ts`,
  la action, `CorregirDatosClienteService`, su interfaz y `OrdenRepository.corregirDatosCliente`.
  **Hecho:** `corregir-datos-cliente.repo.test.ts` y los unitarios de corrección verdes; una orden vieja
  corregida queda con el nodo nuevo y las 3 FK en NULL (R16).
- [x] **T2.4** Tarifas (design §6): `distritoDeTarifa` en `geografia-dominio.ts` y sus llamadores
  (`resolver-tarifas.ts`, `ApiOrdenLecturaService`, `RechazoTiendaService`, `CotizacionOrdenService`,
  `OrdenRepository`). Grupo desde el nodo si está en el nivel 3 o más hondo (P3).
  **Hecho:** `geografia-dominio.distrito-de-tarifa.test.ts`, `tarifas-flexibles-resolver.test.ts`,
  `slt89-equivalencia-cr.test.ts` y `slt48-tarifas-equivalencia.test.ts` verdes: mismos montos, zona y
  marca para órdenes viejas de CR (R31, R32).
- [x] **T2.5** [P] Lectores al nodo (design §5): `lugar-orden.ts`, `ruta-del-lugar.ts`,
  `lugares-del-filtro.ts`, selects de `OrdenRepository`, `InformeTransitoRepository`,
  `ubicacion-presentacion.ts` (`D = P`).
  **Hecho:** `lugar-orden`, `ruta-del-lugar`, `lugares-del-filtro`, `orden-repository-filtros`,
  `ubicacion-presentacion`, `orden-lugar-owner`, `slt48-filtro-orden-nueva`, `informe-transito-nodo`,
  `geografia-ordenes-sin-entregar` y `zona-reconciliacion-ordenes` verdes (R22–R25).
- [x] **T2.6** [P] Cierre (design §5): `CierreDiaRepository` con nombres y snapshot desde la ruta del nodo.
  **Hecho:** `cierre-dia-snapshot-nodo.test.ts` verde; para una orden vieja de CR da lo mismo que hoy
  (R27).
- [x] **T2.7** [P] API v1, respuestas desde la ruta del nodo.
  **Hecho:** `v1-ordenes-lugar.route.test.ts` verde; iguales a hoy para órdenes viejas (R28).
- [x] **T2.8** — **no aplica (camino A, T1.1).** Camino B de T1.1, solo si se eligió: lectores por relación al catálogo
  (`geografia-activa.ts`, `GrupoDistritosRepository`, `TarifasPantallaRepository`, `ZonaRepository`).
  **Hecho:** sus tests de hoy verdes sin cambiar aserciones.
- [x] **T2.9** Guardias: `orden-fk-geo-sin-uso.guardia.test.ts` (nueva, con contraprueba) sustituye a
  `geografia-lecturas-sin-nodo-fk.guardia.test.ts`; `geografia-vieja-sin-escritor` actualizada.
  **Hecho:** `pnpm run test:guardias` verde (R29).

> T2 (2026-11-17): cerrada con aserciones viejas pendientes de autorización humana (las que afirman la
> regla de SLT-45, las 3 FK escritas o la forma vieja de la corrección). Lista en `progress/impl_SLT-48.md`
> sección T2.

## T3 — Mover nodo, servidor (backend_dev) · depende de T1.2 y T2.4

- [x] **T3.1** `moverNodoSchema`, `GeoRepository.mover` e `IGeoRepository` (design §7.1). Rechaza un
  destino retirado (P4).
  **Hecho:** `geografia-mover-nodo.test.ts` cubre éxito, cada rechazo de R35, `conflict` por nombre,
  `cambio_concurrente` (R37) y la fila de historial en la misma transacción (R38).
- [x] **T3.2** `GeoRepository.vistaPreviaMover`: rutas, descendientes y órdenes del subárbol (R36).
  **Hecho:** cubierto en `geografia-mover-nodo.test.ts`.
- [x] **T3.3** Órdenes abiertas afectadas (design §7.2): `catalogoConPadre` y la comparación de grupo y
  marca por empresa. Bloqueo en la vista previa y en `mover`, con cuántas órdenes y de qué empresas (P1).
  **Hecho:** `geografia-mover-nodo-ordenes.test.ts` comprueba con dos empresas que no hay escrituras en
  `orden`, que la ruta es la nueva, que la zona se conserva, que el precio y la marca no cambian (o el
  movimiento se bloquea) y que una orden nueva usa la zona nueva (R39–R41).
- [x] **T3.4** `GeografiaService.moverNodo`/`vistaPreviaMoverNodo`, `IGeografiaService`, las actions con
  `comoPlataforma` y la etiqueta en `lib/types/historial-accion.ts`.
  **Hecho:** `geografia-plataforma.mover.test.ts` verde: `forbidden` sin superadmin, sin escribir (R34).

## T4 — Pantallas (frontend_dev) · depende de T0.2, T2 y T3

- [x] **T4.1** [P] `MoverNodoDialog.tsx` y la acción «Mover» en `GeografiaPlataformaModule.tsx`. Se quita
  el aviso de «aún no habilitado».
  **Hecho:** `MoverNodoDialog.test.tsx` y `GeografiaPlataformaSinAviso.test.tsx` verdes, igual que la
  maqueta (R21, R36).
- [x] **T4.2** [P] `CorregirUbicacionAviso.tsx` y `CorregirDatosClienteModal.tsx` con N selectores.
  **Hecho:** `CorregirUbicacionNNiveles.test.tsx` verde; los tests de hoy de `CorregirDatosCliente.*`
  pasan en CR sin cambiar aserciones visibles (R43).
  *(Código: commit eb76740a. Las 2 aserciones de carga útil (`.distritoId` → `.nodoId`, R16) se cambiaron con
  autorización del humano del 2026-11-17; ver `progress/impl_SLT-48.md > T4 (sin T4.1)`.)*
- [x] **T4.3** [P] Etiquetas de historial con la ruta entera (`historial-accion-etiquetas.ts`).
  **Hecho:** `historial-accion-etiquetas-ruta.test.ts` verde; CR igual que hoy (R44).
- [x] **T4.4** [P] Tarifas y zonas hasta P: `TarifasGrupos.tsx`, `TarifasZonas.tsx`, `CrearZonaForm.tsx`,
  `GeografiaSelector.tsx`, `filtrar-arbol-geografico.ts`.
  **Hecho:** `TarifasGruposNNiveles.test.tsx` y `ZonasNNiveles.test.tsx` verdes; `TarifasGrupos.test.tsx`
  y `geografia-arbol-n-niveles.test.tsx` sin cambiar aserciones de CR (R45).
- [x] **T4.5** Carga masiva de 4 niveles.
  **Hecho:** `carga-masiva-4-niveles.test.ts` verde (R46).
- [x] **T4.6** Guardia `etiquetas-geograficas-sin-literal` ampliada a los archivos tocados.
  **Hecho:** verde (R47).

## T5 — Tests que escriben tablas viejas (backend_dev) · depende de T1.8

- [ ] **T5.1** Pasar a nodos o a las vistas cada test de integración de la lista de `## Archivos esperados >
  Tests existentes` (design §9). Los de idas y vueltas usan `sin-slt48.ts`.
  **Hecho:** todos verdes. Ningún test se borra ni pierde aserciones sin autorización del humano; si uno
  queda sin objeto (por ejemplo `slt46-nodo-copia-vieja`), se para y se pregunta.
  > 2026-11-17 (backend_dev): hecha salvo 17 casos sin objeto, parados sin tocar y pendientes de decisión humana
  > (lista en `progress/impl_SLT-48.md` › T5 › «Sin objeto»). Por eso sigue sin marcar.

## T6 — E2E (frontend_dev) · depende de T4 y T5

- [x] **T6.1** `e2e/_planes-fixture.ts`, `e2e/_zona-especial-fixture.ts` y
  `e2e/geo-presentacion-4-niveles.spec.ts` a nodos. La cuarta columna sale llena.
  **Hecho:** `pnpm exec playwright test e2e/geo-presentacion-4-niveles.spec.ts` verde (R26).
- [ ] **T6.2** Correr los E2E de flujos críticos de R49.
  **Hecho:** verdes sin cambiar aserciones, en local o en CI (R49).
  > 2026-11-17 (frontend_dev): en local, 12 de 14 specs verdes; `mis-asignaciones` (3 timeouts de 30 s) y
  > `dos-empresas-humo` (corrida cortada por falta de recursos de la máquina) quedan para CI o para otra corrida.
  > Ninguna aserción cambiada. Detalle en `progress/impl_SLT-48.md` › T6.

## T7 — Cierre (leader, persona, CI y reviewer)

- [ ] **T7.1** Una persona, sobre la copia de producción con SLT-48 aplicada, corre `geo:equivalencia-*`
  y `geo:explain-*`, y además la ida y vuelta del `down.sql`. Pega la salida en el PR. Ningún agente toca
  producción ni su copia.
  **Hecho:** todo sale con 0 y nada empeora más del 20 % (R30, R33).
- [ ] **T7.2** `docs/architecture.md`: actualizar los párrafos de geografía que quedan falsos (sincronía,
  trigger de `orden`, ruta hasta nivel 3, orden sin distrito «hasta SLT-48») y añadir las vistas, la
  regla de hoja y mover nodos.
  **Hecho:** el reviewer lo comprueba.
- [ ] **T7.3** Mapa R → test en `progress/impl_SLT-48.md` y `./init.sh` en verde. CI `gate-completo` en
  verde.
  **Hecho:** los 49 R con su test; check verde.
- [ ] **T7.4** Antes de la release, backup verificado (restaurado y comprobado) de producción. Las
  migraciones las aplica el build de `prod`.
  **Hecho:** anotado en `progress/features/SLT-48.md` por la persona que lo hizo.

## Tamaño

- **Producción:** 48 rutas en `## Archivos esperados > Producción`. Cuatro solo se tocan con el camino B
  (`geografia-activa.ts`, `GrupoDistritosRepository.ts`, `TarifasPantallaRepository.ts` y parte de
  `ZonaRepository.ts`), y una es `docs/architecture.md`. Son unas 2.000–3.000 líneas, la mayor parte en
  SQL (la migración y su `down.sql`, que recrea tablas, políticas y triggers) y en `OrdenRepository`.
- **Tests:** 23 rutas nuevas y 82 existentes, con unas 3.000–4.500 líneas, la mayor parte en el paso
  de fixtures a nodos. De las existentes, unas 20 unitarias se listan porque *pueden* cambiar (firmas de
  `lugarDeLaOrden`, `geo-ubicacion`, corrección). El tope real esperado es de 85–105 archivos de test.
- Por encima del tope por defecto del arnés (40 archivos). `arnes.config.json` no fija `gate.tamano_pr`.
  El humano aceptó un solo PR de ~150 archivos: 48 de producción y unos 85–105 de tests (decisión
  «Tamaño del PR», 2026-11-17).

## Archivos esperados

### Producción

- `db/schema.prisma`
- `db/migrations/20261117120000_slt48_historial_nodo_movido/migration.sql`
- `db/migrations/20261117120000_slt48_historial_nodo_movido/down.sql`
- `db/migrations/20261117120100_slt48_geografia_vieja_a_vistas/migration.sql`
- `db/migrations/20261117120100_slt48_geografia_vieja_a_vistas/down.sql`
- `lib/repositories/_shared/lugar-orden.ts`
- `lib/repositories/_shared/ruta-del-lugar.ts`
- `lib/repositories/_shared/lugares-del-filtro.ts`
- `lib/repositories/_shared/resolver-tarifas.ts`
- `lib/repositories/_shared/geografia-activa.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/repositories/InformeTransitoRepository.ts`
- `lib/repositories/GeoRepository.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/repositories/GrupoDistritosRepository.ts`
- `lib/repositories/TarifasPantallaRepository.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/interfaces/repositories/IGeoRepository.ts`
- `lib/interfaces/services/ICorregirDatosClienteService.ts`
- `lib/interfaces/services/IGeografiaService.ts`
- `lib/services/geo-ubicacion.ts`
- `lib/services/geo-resolucion.ts`
- `lib/services/geografia-dominio.ts`
- `lib/services/BulkOrdenService.ts`
- `lib/services/CotizacionOrdenService.ts`
- `lib/services/CorregirDatosClienteService.ts`
- `lib/services/RechazoTiendaService.ts`
- `lib/services/ApiOrdenLecturaService.ts`
- `lib/services/GeografiaService.ts`
- `lib/actions/corregir-datos-cliente.ts`
- `lib/actions/geografia-plataforma.ts`
- `lib/types/geografia-nodo.ts`
- `lib/types/correccion-datos-cliente.ts`
- `lib/types/orden.ts`
- `lib/types/historial-accion.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `lib/utils/ubicacion-presentacion.ts`
- `app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule.tsx`
- `app/(app)/plataforma/geografia/_components/MoverNodoDialog.tsx`
- `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx`
- `app/(app)/ordenes/_components/CorregirDatosClienteModal.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasGrupos.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasZonas.tsx`
- `app/(app)/configuracion/zonas/_components/CrearZonaForm.tsx`
- `app/(app)/configuracion/zonas/_components/GeografiaSelector.tsx`
- `app/(app)/configuracion/_shared/filtrar-arbol-geografico.ts`
- `docs/architecture.md`

### Tests nuevos

- `tests/unit/db/slt48-migraciones-declaradas.test.ts`
- `tests/unit/guards/orden-fk-geo-sin-uso.guardia.test.ts`
- `tests/unit/services/geografia-dominio.distrito-de-tarifa.test.ts`
- `tests/unit/types/historial-accion-etiquetas-ruta.test.ts`
- `tests/unit/actions/geografia-plataforma.mover.test.ts`
- `tests/integration/db/migracion-slt48-ida-y-vuelta.test.ts`
- `tests/integration/db/slt48-vistas-geografia.test.ts`
- `tests/integration/db/slt48-triggers-orden-pais.test.ts`
- `tests/integration/db/slt48-trigger-orden-rendimiento.test.ts`
- `tests/integration/db/slt48-filtro-orden-nueva.test.ts`
- `tests/integration/db/slt48-tarifas-equivalencia.test.ts`
- `tests/integration/db/informe-transito-nodo.test.ts`
- `tests/integration/db/cierre-dia-snapshot-nodo.test.ts`
- `tests/integration/db/geografia-mover-nodo.test.ts`
- `tests/integration/db/geografia-mover-nodo-ordenes.test.ts`
- `tests/integration/db/carga-masiva-4-niveles.test.ts`
- `tests/integration/db/_fixtures/sin-slt48.ts`
- `tests/integration/api/v1-ordenes-lugar.route.test.ts`
- `tests/components/MoverNodoDialog.test.tsx`
- `tests/components/GeografiaPlataformaSinAviso.test.tsx`
- `tests/components/CorregirUbicacionNNiveles.test.tsx`
- `tests/components/TarifasGruposNNiveles.test.tsx`
- `tests/components/ZonasNNiveles.test.tsx`

### Tests existentes

- `tests/unit/db/_migraciones-aditivas.ts`
- `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`
- `tests/unit/guards/geografia-vieja-sin-escritor.guardia.test.ts`
- `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts`
- `tests/unit/repositories/lugar-orden.test.ts`
- `tests/unit/repositories/lugares-del-filtro.test.ts`
- `tests/unit/repositories/orden-repository-filtros.test.ts`
- `tests/unit/repositories/zona-repository.test.ts`
- `tests/unit/services/ruta-del-lugar.test.ts`
- `tests/unit/services/geo-ubicacion.test.ts`
- `tests/unit/services/geo-resolucion-v1-mensajes.test.ts`
- `tests/unit/services/geo-resolucion-retirados.test.ts`
- `tests/unit/services/bulk-orden-service.n-niveles.test.ts`
- `tests/unit/services/bulk-orden-service.forma-pais.test.ts`
- `tests/unit/services/api-v2-servicios.test.ts`
- `tests/unit/services/corregir-datos-cliente-service.test.ts`
- `tests/unit/services/corregir-datos-cliente-geo-retirada.test.ts`
- `tests/unit/actions/corregir-datos-cliente.action.test.ts`
- `tests/unit/actions/geografia-plataforma.composition-root.test.ts`
- `tests/unit/utils/ubicacion-presentacion.test.ts`
- `tests/fabricas/paises.ts`
- `tests/fixtures/satelite-bodega-almacen.ts`
- `tests/integration/db/_fixtures/geo-43.ts`
- `tests/integration/db/_fixtures/geo-44.ts`
- `tests/integration/db/_fixtures/geo-47.ts`
- `tests/integration/db/_fixtures/geo-71.ts`
- `tests/integration/db/aislamiento-mecanismo.test.ts`
- `tests/integration/db/aislamiento-rls.test.ts`
- `tests/integration/db/carga-division.test.ts`
- `tests/integration/db/cobertura-repository.test.ts`
- `tests/integration/db/corregir-datos-cliente.repo.test.ts`
- `tests/integration/db/distrito-zona-especial-por-empresa.test.ts`
- `tests/integration/db/geo-backfill.test.ts`
- `tests/integration/db/geo-catalogo-repository.test.ts`
- `tests/integration/db/geo-equivalencia.test.ts`
- `tests/integration/db/geo-equivalencia-geografia.test.ts`
- `tests/integration/db/geo-sincronia-geografia.test.ts`
- `tests/integration/db/geo-sincronia-orden-zonas.test.ts`
- `tests/integration/db/geografia-alta.test.ts`
- `tests/integration/db/geografia-cascada-reversible.test.ts`
- `tests/integration/db/geografia-catalogo-activo.test.ts`
- `tests/integration/db/geografia-dta-2026-migration.test.ts`
- `tests/integration/db/geografia-historico-intacto.test.ts`
- `tests/integration/db/geografia-ordenes-sin-entregar.test.ts`
- `tests/integration/db/geografia-por-pais.test.ts`
- `tests/integration/db/geografia-registro-accion.test.ts`
- `tests/integration/db/geografia-renombrado.test.ts`
- `tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts`
- `tests/integration/db/migracion-sl38-ida-y-vuelta.test.ts`
- `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts`
- `tests/integration/db/migracion-slt46-ida-y-vuelta.test.ts`
- `tests/integration/db/orden-lugar-owner.test.ts`
- `tests/integration/db/orden-nodo-escritura.test.ts`
- `tests/integration/db/salida-a-reparto-sql-real.test.ts`
- `tests/integration/db/satelite-conjunto-sql-real.test.ts`
- `tests/integration/db/slt46-nodo-copia-vieja.test.ts`
- `tests/integration/db/slt89-equivalencia-cr.test.ts`
- `tests/integration/db/tarifas-flexibles-migration.test.ts`
- `tests/integration/db/tarifas-flexibles-resolver.test.ts`
- `tests/integration/db/zona-central-guarda-y-rastro.test.ts`
- `tests/integration/db/zona-distrito-rastro.test.ts`
- `tests/integration/db/zona-distrito-unica.test.ts`
- `tests/integration/db/zona-especial-dos-empresas.test.ts`
- `tests/integration/db/zona-guardado-conserva-costos.test.ts`
- `tests/integration/db/zona-guardado-conserva-inactivos.test.ts`
- `tests/integration/db/zona-nodo-herencia.test.ts`
- `tests/integration/db/zona-pago-mensajero-rastro.test.ts`
- `tests/integration/db/zona-reconciliacion-ordenes.test.ts`
- `tests/integration/api/v2-paises-de-prueba.route.test.ts`
- `tests/integration/api/v2-ordenes.route.test.ts`
- `tests/integration/api/v2-cotizacion.route.test.ts`
- `tests/components/CorregirDatosCliente.ordenes.test.tsx`
- `tests/components/TarifasGrupos.test.tsx`
- `tests/components/geografia-arbol-n-niveles.test.tsx`
- `e2e/_planes-fixture.ts`
- `e2e/_zona-especial-fixture.ts`
- `e2e/geo-presentacion-4-niveles.spec.ts`

### Añadidos tras T2 (decisión del humano, 2026-11-17)

Producción, fuera de la lista inicial (consecuencia de que la orden deja de exigir las 3 FK):

- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/GestionOrdenRepository.ts`
- `lib/repositories/OrdenEnvioReader.ts`
- `lib/repositories/OrdenGeocodeRepository.ts`
- `lib/types/api-v2.ts`
- `scripts/geo-equivalencia/consultas-de-hoy.ts`
- `scripts/geo-equivalencia/lecturas-de-hoy.ts`
- `scripts/geo-equivalencia-analitica.ts`
- `scripts/geo-equivalencia-consultas.ts`
- `scripts/geo-equivalencia-filtros.ts`
- `scripts/geo-equivalencia-presentacion.ts`
- `scripts/geo-explain-consultas.ts`

Notas `@test-desaparecido` por la guardia retirada `geografia-lecturas-sin-nodo-fk`:

- `specs/SLT-44-geo-jerarquica-dominio/design.md`
- `specs/SLT-65-geo-jerarquica-consultas/design.md`
- `specs/SLT-71-geo-jerarquica-transito-analitica/design.md`

Tests que escriben tablas viejas o leen las FK, fuera de la lista de T5:

- `tests/integration/db/_fixtures/caja-459.ts`
- `tests/integration/db/caja-459-migration.test.ts`
- `tests/integration/db/_fixtures/geo-65.ts`
- `tests/integration/db/geo-65-fixture.test.ts`
- `tests/integration/db/_postgres-real.ts`
- `tests/integration/db/emisor-relaciones-anidadas.test.ts`
- `tests/integration/db/geo-125-cierre-snapshot.test.ts`
- `tests/integration/db/geo-125-fixture.test.ts`
- `tests/integration/db/geo-125-geocode-cache.test.ts`
- `tests/integration/db/geo-125-nombres-catalogo.test.ts`
- `tests/integration/db/geo-equivalencia-presentacion.test.ts`
- `tests/integration/db/corregir-ubicacion-geocode.test.ts`
- `tests/integration/db/cobro-plataforma-plan.test.ts`
- `tests/integration/db/pago-plataforma-sl45-concurrencia.test.ts`
- `tests/integration/db/orden-remision-borrada-libera-numero.test.ts`
- `tests/integration/db/orden-nodo-mas-profundo.test.ts`

Tests ya tocados en T1 y T2 (fixtures de DTO sin las 3 FK, firmas o tests nuevos), fuera de la lista inicial:

- `tests/components/AsignacionBloqueoPorCierre.test.tsx`
- `tests/components/AsignacionMensajeroNoAsignable.test.tsx`
- `tests/components/AsignarBodegaModal.autorizacion.test.tsx`
- `tests/components/AsignarBodegaModal.test.tsx`
- `tests/components/ComprobanteEntregaTienda.test.tsx`
- `tests/components/ConfirmarEntregaTiendaModal.test.tsx`
- `tests/components/descarga/ControlDescargaTransversal.test.tsx`
- `tests/components/DevolverATiendaModal.test.tsx`
- `tests/components/EtiquetasGuiaModal.test.tsx`
- `tests/components/GenerarGuiaModal.test.tsx`
- `tests/components/ManifiestoFlujos.test.tsx`
- `tests/components/OrdenesDescarga.test.tsx`
- `tests/components/OrdenesDescargaColumnas.test.tsx`
- `tests/components/OrdenesListado.confirmar-entrega-419.test.tsx`
- `tests/components/OrdenesListadoBloqueoCierre.test.tsx`
- `tests/components/OrdenesListadoDevolucion.test.tsx`
- `tests/components/OrdenesListadoEtiquetasChain.test.tsx`
- `tests/components/OrdenesPage.test.tsx`
- `tests/components/OrdenesPagination.test.tsx`
- `tests/components/OrdenesRutearSatelite.test.tsx`
- `tests/components/RecuperarABodegaModal.test.tsx`
- `tests/components/RutearSateliteModal.test.tsx`
- `tests/fixtures/descargas-cr/entrada.ts`
- `tests/fixtures/fila-bodega-satelite.ts`
- `tests/fixtures/orden-detalle-dia.ts`
- `tests/integration/actions/ordenes-action.test.ts`
- `tests/integration/db/geo-consultas-cierre.test.ts`
- `tests/integration/descarga-dataset-roundtrip.test.ts`
- `tests/integration/repositories/orden-geocode-enqueue.test.ts`
- `tests/integration/repositories/orden-mensajero-meta.int.test.ts`
- `tests/unit/actions/ordenes-descarga-action.test.ts`
- `tests/unit/components/ordenes-columns.test.tsx`
- `tests/unit/components/ordenes-descarga-columnas.test.ts`
- `tests/unit/components/ordenes-listado.test.tsx`
- `tests/unit/components/ordenes-listado-buscador.test.tsx`
- `tests/unit/components/ordenes-listado-filtros.test.tsx`
- `tests/unit/components/ordenes-listado-orden.test.tsx`
- `tests/unit/components/ordenes-listado-vistas.test.tsx`
- `tests/unit/components/ordenes-module-busqueda.test.tsx`
- `tests/unit/components/ordenes-module-filter-key.test.tsx`
- `tests/unit/descarga/archivo-identico-470.test.ts`
- `tests/unit/guards/organizacion-en-modelos.guardia.test.ts`
- `tests/unit/repositories/orden-repository.bulk.test.ts`
- `tests/unit/repositories/orden-repository.carga-api.test.ts`
- `tests/unit/repositories/orden-repository.carga-lote.test.ts`
- `tests/unit/repositories/orden-repository.creacion-bifurcada.test.ts`
- `tests/unit/services/bulk-orden-service.carga-api.test.ts`
- `tests/unit/services/bulk-orden-service.test.ts`
- `tests/unit/services/corregir-datos-cliente-bodega-satelite.test.ts`
- `tests/unit/services/corregir-datos-cliente-texto-etiqueta.test.ts`
- `tests/unit/services/corregir-ubicacion-importes.test.ts`
- `tests/unit/services/devolucion-origen-service.test.ts`
- `tests/unit/services/eliminar-criterio-unico.test.ts`
- `tests/unit/services/envio-devolucion-central-service.test.ts`
- `tests/unit/services/intentos-entrega-criterio-unico.test.ts`
- `tests/unit/services/orden-historial-fusion.test.ts`
- `tests/unit/services/OrdenHistorialService.evento-orden.test.ts`
- `tests/unit/services/orden-historial-service.test.ts`
- `tests/unit/services/orden-mensajero-meta-service.test.ts`
- `tests/unit/services/orden-service.test.ts`
- `tests/unit/services/orden-service-busqueda-alcance.test.ts`
- `tests/unit/services/orden-service-descarga.test.ts`
- `tests/unit/services/rechazo-tienda-service.test.ts`
- `tests/unit/services/recuperacion-bodega-service.test.ts`
- `tests/unit/services/reprogramacion-tienda-service.test.ts`
- `tests/unit/services/rol-admin-satelite-authz.test.ts`
- `tests/unit/types/orden-list-dto-zona.test.ts`
