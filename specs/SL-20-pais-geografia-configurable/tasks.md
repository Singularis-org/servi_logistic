# SL-20 — pais-geografia-configurable · tasks.md

> Diseño: `design.md`. Requisitos: `requirements.md` (R1–R39). `[P]` = puede ir en paralelo con las
> demás `[P]` de su tanda una vez cumplidas sus dependencias. Cada task cierra con
> `pnpm exec vitest related --run <archivos>` en verde, y cada tanda con `./init.sh`.
> Reparto (`docs/perfil-agentes.md > implementer`): T1–T4 `backend_dev`; T5 `frontend_dev`; T6 los dos.

## T0 — Lo heredado (ya montado; no se re-crea)

- [x] T0.1 La geografía es de plataforma y de solo lectura para `servi_app`, con RLS y `REVOKE`
  (SL-17, `20261022130000_organizacion_y_rol_app`).
- [x] T0.2 Retiro por `activo`, unicidad por padre, conteo de órdenes sin entregar (ficha 374) y
  `codigo_dta` con renombrado por un solo punto (ficha 375; guardia
  `geografia-renombrado-punto-unico`).
- [x] T0.3 La gestión de la geografía es de `ROLES_PLATAFORMA` (`GeografiaService.GESTION_ROLES`,
  SL-32 R24) y la página vieja tiene la puerta `esPlataforma`.
- [x] T0.4 La zona especial es de cada empresa en `distrito_zona_especial` (SL-38).
- [x] T0.5 Existen `comoPlataforma`, `EXCEPCIONES_DE_PLATAFORMA`, `exigirSuperadmin`, la pantalla
  `/plataforma/empresas` y `OrganizacionService.altaEmpresa` (SL-17, SL-32, SL-41).
- [x] T0.6 `exceljs` está aprobado y `lib/parsers/spreadsheet.ts` ya lee CSV (feature 15).
- [x] T0.7 Costa Rica está sembrada: `20260713005000_seed_geografia_cr`,
  `20260905175156_geografia_dta_2026_distritos_faltantes` y el backfill de
  `20260907120000_geografia_codigo_dta` (7/84/494 nodos con código).

**Hecho:** nada que hacer; T1 parte de aquí. Si una de estas piezas no está como se describe,
para y avisa al leader.

## T1 — Base de datos (`backend_dev`)

- [ ] T1.1 Migración `20261026120000_pais` + `down.sql` (design §2.1, §3).
  **Hecho:** tras `pnpm run db:migrate`, `SELECT * FROM pais` devuelve solo `CR` con 1/3/5, y
  `servi_app` no puede insertar (R1, R3).
- [ ] T1.2 Migración `20261026120100_geografia_por_pais` + `down.sql` y cambios de `Provincia`,
  `Canton` y `Distrito` en `db/schema.prisma` (§2.3, §2.4). Dep.: T1.1.
  **Hecho:** `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma` vacío (si no
  sale, se aplica el plan B de §2.3 y se anota en `progress/impl_SL-20.md`); los 585 nodos tienen
  `pais_id = 'CR'` y sus `id` sin cambio (R2); un cantón con `pais_id` distinto del de su provincia
  falla (R11).
- [ ] T1.3 Migración `20261026120200_organizacion_pais` + `down.sql` y `Organizacion.paisId` en el
  esquema (§2.2). Dep.: T1.1. [P] con T1.2.
  **Hecho:** las empresas existentes quedan en `CR` (R5); un `UPDATE organizacion SET pais_id` a
  otro país falla con `SL020`, también como dueño (R7).
- [ ] T1.4 Migración `20261026120300_geografia_del_pais_de_la_empresa` + `down.sql` (§2.5) y
  `lib/db/errores-pais.ts`. Dep.: T1.2, T1.3.
  **Hecho:** una orden, una `zona_distrito` o una `distrito_zona_especial` con un nodo de otro país
  falla con `SL021` (R13).
- [ ] T1.5 Migración `20261026120400_historial_plataforma` + `down.sql`, `model HistorialPlataforma`
  y `lib/repositories/registrar-accion-plataforma.ts` (§2.6). Dep.: T1.3. [P] con T1.4.
  **Hecho:** como `servi_app`, `SELECT` da 0 filas y el `INSERT` falla (R34).
- [ ] T1.6 Clasificar `Pais` y `HistorialPlataforma` en `lib/db/modelos-de-negocio.ts` (§2.7).
  Dep.: T1.1, T1.5.
  **Hecho:** `organizacion-en-modelos.guardia` en verde.
- [ ] T1.7 `tests/fabricas/paises.ts` (`crearPaisDePrueba(tx, "XA")`) y tests de
  `pais-tabla`, `geografia-por-pais`, `organizacion-pais-inmutable`, `historial-plataforma-rls` y
  `migracion-sl20-ida-y-vuelta`. Dep.: T1.1–T1.6.
  **Hecho:** cubren R1–R5, R7, R10, R11, R16 y R34, y la ida y vuelta (up → down → up) pasa.

## T2 — País y empresa (`backend_dev`)

- [ ] T2.1 [P] `lib/types/pais.ts`, `IPaisRepository`, `PaisRepository`, `IPaisService`,
  `PaisService` (§5). Dep.: T1.6.
  **Hecho:** `tests/unit/services/pais-service.test.ts` cubre R23 (alta, `conflict` por código y
  por nombre normalizado) y R37 (`forbidden` a un rol de empresa).
- [ ] T2.2 [P] Alta de empresa con país: `lib/types/organizacion.ts`, `OrganizacionService`,
  `OrganizacionRepository`, `EmpresasPlataformaRepository` y `lib/types/empresas-plataforma.ts`.
  Dep.: T1.3.
  **Hecho:** sin `paisId` o con uno inexistente → `invalida` `paisId` sin crear nada (R6); repetida
  con otro país → `conflicto` `paisId` (R8); el listado trae el país (R9, datos).
- [ ] T2.3 `etiquetasDeEmpresa` y `ETIQUETAS_NEUTRAS`. Dep.: T2.1.
  **Hecho:** test unitario con una empresa en `XA` y otra en `CR`.

## T3 — Carga CSV (`backend_dev`)

- [x] T3.1 Opción `textoLiteral` en `lib/parsers/spreadsheet.ts` (§5). Va primero: es el riesgo de
  §12.
  **Hecho:** test con `"01"` y `"10101"` que llegan como texto; la carga masiva de órdenes no cambia
  (sus tests siguen verdes).
- [x] T3.2 [P] `lib/utils/codigo-geografico.ts` (R17).
  **Hecho:** `tests/unit/utils/codigo-geografico.test.ts`, con CR (longitud y prefijo) y con un país
  sin regla (1–20 caracteres, sin espacios).
- [x] T3.3 `lib/types/division-csv.ts` y `lib/utils/division-csv.ts` (`planificarDivision`, §6).
  Dep.: T3.2.
  **Hecho:** `tests/unit/utils/division-csv.test.ts` cubre filas repetidas, contradictorias, nodo
  existente, código completado, nodo retirado, `nivel_3` vacío, padre nuevo en el mismo archivo y
  número de línea (R25–R27).
- [ ] T3.4 `GeoRepository.importarDivision` + interfaz y `CargaDivisionService` + interfaz.
  Dep.: T1.5, T3.1, T3.3.
  **Hecho:** `tests/unit/services/carga-division-service.test.ts` cubre R28 (extensión, 5 MB, UTF-8
  inválido, columnas que faltan, 10 000 filas); `tests/integration/db/carga-division.test.ts` carga en
  `XA`, no escribe nada si hay un solo error y escribe una sola fila `division_cargada` (R24, R25,
  R33).

## T4 — Geografía del superadmin (`backend_dev`)

- [ ] T4.1 `GeoRepository`: `listArbolDePais`, hermanos de provincia por país, `crear` con
  `paisId`/código/actor y escrituras al historial de plataforma (§5). Dep.: T1.5, T3.2.
  **Hecho:** `geo-repository.escrituras.test.ts`, `geografia-alta`, `geografia-renombrado`,
  `geografia-cascada-reversible` y `geografia-registro-accion` adaptados y verdes (R15, R29, R30,
  R33, R35).
- [ ] T4.2 `GeografiaService` + `IGeografiaService`: `listarArbolDePais` y validación del código en
  el alta. Dep.: T4.1.
  **Hecho:** `geografia-service.test.ts` cubre R15, R17 en el alta y R37.
- [ ] T4.3 `lib/actions/geografia-plataforma.ts` (todas las actions de §5, `comoPlataforma`), su
  entrada en `EXCEPCIONES_DE_PLATAFORMA` y la limpieza de `lib/actions/geografia.ts` (§4).
  Dep.: T2.1, T3.4, T4.2.
  **Hecho:**
  - `geografia-plataforma-action.test.ts` cubre `unauthenticated`, `forbidden`, validación y R36
    (un error que no es de único → `error`, no `conflict`);
  - hay un test de composition root;
  - `plataforma-solo-en-lista` y `geografia-renombrado-punto-unico` verdes, con su tabla de puntos
    actualizada.
- [ ] T4.4 `tests/integration/db/geografia-superadmin-sin-empresa.test.ts`. Dep.: T4.3.
  **Hecho:** un superadmin real sin empresa crea un país, carga un CSV, da de alta, renombra, retira
  y reactiva sin `EmpresaNoResuelta`. El conteo suma las órdenes sin entregar de dos empresas del
  mismo país (R31, R32).
- [ ] T4.5 [P] Guardia `historial-accion-escrituras-cubiertas`: los `nodo_geografico_*` quedan sin
  escritor desde SL-20 (§2.6). Dep.: T4.1.
  **Hecho:** guardia verde, y su contraprueba sigue fallando cuando debe.

## T5 — Interfaz (`frontend_dev`)

- [ ] T5.1 Provider y hook de nombres de nivel, y su enganche en `app/(app)/layout.tsx` (§7).
  Dep.: T2.3.
  **Hecho:** `tests/components/etiquetas-geograficas.test.tsx` pinta «Departamento» con una empresa
  de un país de prueba y «Provincia» con una de `CR`.
- [ ] T5.2 [P] Lista cerrada de R19 (§7): las constantes pasan a funciones y los consumidores usan
  el hook. Dep.: T5.1.
  **Hecho:** la guardia `etiquetas-geograficas-sin-literal` está verde, con su contraprueba; los
  tests de componentes de órdenes, novedades, satélite, tarifas, mis asignaciones y cierres siguen
  verdes.
- [ ] T5.3 [P] `/plataforma/geografia`: `page.tsx`, `GeografiaPlataformaModule.tsx` y
  `GeografiaAdminModule.tsx` movido sin zonas (§8). Borrar `app/(app)/configuracion/geografia/`,
  `zonas-sin-distritos.ts` y su test. Dep.: T4.3, T5.1.
  **Hecho:** `geografia-plataforma-page.test.tsx` cubre el 404 a un rol de empresa antes de leer
  (R21), los nombres de nivel del país elegido (R20), el alta de país, los errores de CSV con su
  línea y el conteo que no bloquea (R31). `/configuracion/geografia` da 404 (R22).
- [x] T5.4 [P] Menú «Geografía» del superadmin (`lib/auth/menu-visibility.ts`). Dep.: ninguna.
  **Hecho:** `menu-visibility.test.ts` y `superadmin-fuera-de-empresa.guardia` verdes; ningún rol
  de empresa ve el ítem.
- [ ] T5.5 [P] «Empresas»: `Select` de país en el alta y columna «País» (§8), y el ajuste de los E2E
  existentes que rellenan el alta. Dep.: T2.2.
  **Hecho:** `tests/components/empresas-module.test.tsx` cubre R9 (sin país preseleccionado y alta
  bloqueada sin país); `e2e/_dos-empresas-fixture.ts` y `e2e/superadmin-empresas.spec.ts` eligen
  `CR`.
- [ ] T5.6 [P] Ayuda: `docs/ayuda/oficina/configuracion-geografia.md` pasa a describir la pantalla
  del superadmin, o se retira si la ayuda es solo de empresa (lo decide quien la mantiene; se anota).
  Dep.: T5.3.
  **Hecho:** ninguna ayuda enlaza a `/configuracion/geografia`.

## T6 — Verificación y cierre

- [ ] T6.1 `tests/integration/db/geografia-dos-paises.test.ts`: dos empresas en `XA` y `XB`
  (R12, R13, R14, R38, R39), más la pasada de todas las suites `geografia-*`, `zona-*`,
  `cobertura-*` y `*-dos-empresas*` de `tests/integration/db/`. Dep.: T1–T4.
  **Hecho:** todo verde contra Postgres local con `servi_app`.
- [x] T6.2 [P] `tests/unit/api/openapi-geografia-sin-cambios.test.ts` (R18). Dep.: ninguna.
  **Hecho:** los campos `provincia`, `canton` y `distrito` del contrato siguen iguales.
- [ ] T6.3 Medir el trigger de `orden` (mediana de `INSERT` antes y después, como D13) y anotarlo en
  `progress/impl_SL-20.md`. Dep.: T1.4.
  **Hecho:** cifra escrita; si pasa de 1 ms, aviso al leader.
- [ ] T6.4 Demo de QA: `scripts/demo-qa/receta.ts` busca el distrito por `codigoDta` **y** país
  `CR` (el código deja de ser único global) y da de alta sus empresas con `paisId: "CR"`.
  Dep.: T1.2, T2.2.
  **Hecho:** sus tests unitarios verdes.
- [ ] T6.5 Docs y deudas:
  - `docs/architecture.md > Multi-empresa`: país por empresa, RLS por país, triggers `SL020`/`SL021`
    e historial de plataforma;
  - `progress/deudas.md`: D15 cerrada y la parte de geografía de D12 cerrada (la de vehículos sigue
    en SL-42);
  - mapa `R<n> -> test` en `progress/impl_SL-20.md`.
  Dep.: T1–T6.4.
  **Hecho:** `./init.sh` verde en el worktree.

## Archivos esperados

Raíz, docs y estado:
- `db/schema.prisma`
- `docs/architecture.md`
- `docs/ayuda/oficina/configuracion-geografia.md`
- `progress/deudas.md`
- `progress/features/SL-20.md`
- `progress/impl_SL-20.md`
- `specs/SL-20-pais-geografia-configurable/requirements.md`
- `specs/SL-20-pais-geografia-configurable/design.md`
- `specs/SL-20-pais-geografia-configurable/tasks.md`

Migraciones:
- `db/migrations/20261026120000_pais/migration.sql`
- `db/migrations/20261026120000_pais/down.sql`
- `db/migrations/20261026120100_geografia_por_pais/migration.sql`
- `db/migrations/20261026120100_geografia_por_pais/down.sql`
- `db/migrations/20261026120200_organizacion_pais/migration.sql`
- `db/migrations/20261026120200_organizacion_pais/down.sql`
- `db/migrations/20261026120300_geografia_del_pais_de_la_empresa/migration.sql`
- `db/migrations/20261026120300_geografia_del_pais_de_la_empresa/down.sql`
- `db/migrations/20261026120400_historial_plataforma/migration.sql`
- `db/migrations/20261026120400_historial_plataforma/down.sql`

`lib/`:
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/db/errores-pais.ts`
- `lib/types/pais.ts`
- `lib/types/division-csv.ts`
- `lib/types/geografia-nodo.ts`
- `lib/types/organizacion.ts`
- `lib/types/empresas-plataforma.ts`
- `lib/utils/codigo-geografico.ts`
- `lib/utils/division-csv.ts`
- `lib/utils/filtro-canton-distrito.ts`
- `lib/parsers/spreadsheet.ts`
- `lib/interfaces/repositories/IPaisRepository.ts`
- `lib/interfaces/repositories/IGeoRepository.ts`
- `lib/interfaces/repositories/IOrganizacionRepository.ts`
- `lib/interfaces/services/IPaisService.ts`
- `lib/interfaces/services/IGeografiaService.ts`
- `lib/interfaces/services/ICargaDivisionService.ts`
- `lib/interfaces/services/IOrganizacionService.ts`
- `lib/repositories/PaisRepository.ts`
- `lib/repositories/GeoRepository.ts`
- `lib/repositories/registrar-accion-plataforma.ts`
- `lib/repositories/OrganizacionRepository.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/services/PaisService.ts`
- `lib/services/GeografiaService.ts`
- `lib/services/CargaDivisionService.ts`
- `lib/services/OrganizacionService.ts`
- `lib/actions/geografia.ts`
- `lib/actions/geografia-plataforma.ts`
- `lib/auth/menu-visibility.ts`

`app/`, `providers/`, `hooks/`:
- `app/(app)/layout.tsx`
- `app/(app)/plataforma/geografia/page.tsx`
- `app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule.tsx`
- `app/(app)/plataforma/geografia/_components/GeografiaAdminModule.tsx`
- `app/(app)/configuracion/geografia/page.tsx`
- `app/(app)/configuracion/geografia/_components/GeografiaAdminModule.tsx`
- `app/(app)/configuracion/geografia/_components/zonas-sin-distritos.ts`
- `app/(app)/plataforma/empresas/page.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `app/(app)/_components/entregas-filtros-def.ts`
- `app/(app)/_components/entregas-filtro-analitica.ts`
- `app/(app)/_components/filtro-secciones.tsx`
- `app/(app)/_components/FiltrosEntregas.tsx`
- `app/(app)/analitica/page.tsx`
- `app/(app)/ordenes/_components/ordenes-columns.tsx`
- `app/(app)/ordenes/_components/ordenes-filtros-def.ts`
- `app/(app)/ordenes/_components/ordenes-descarga-columnas.ts`
- `app/(app)/ordenes/_components/OrdenesModule.tsx`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `app/(app)/ordenes/_components/seleccion-a-filter.ts`
- `app/(app)/ordenes/_components/CorregirDatosClienteModal.tsx`
- `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx`
- `app/(app)/novedades/_components/novedades-filtros.ts`
- `app/(app)/novedades/_components/useNovedadesFiltro.ts`
- `app/(app)/novedades/_components/NovedadesFiltrosBarra.tsx`
- `app/(app)/recepcion-satelite/_components/satelite-descarga-columnas.ts`
- `app/(app)/recepcion-satelite/_components/satelite-ordenes-filtros.ts`
- `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx`
- `app/(app)/recepcion-satelite/_components/RecepcionSateliteModule.tsx`
- `app/(app)/recepcion-satelite/_components/recibidas-columns.tsx`
- `app/(app)/monitoreo/_components/detalle-columnas.ts`
- `app/(app)/mis-asignaciones/_components/FiltroCantonDistrito.tsx`
- `app/(app)/mis-asignaciones/_components/useFiltroCantonDistrito.ts`
- `app/(app)/mis-asignaciones/_components/AsignacionDetalle.tsx`
- `app/(app)/mis-asignaciones/_components/chat/chat-format.ts`
- `app/(app)/configuracion/tarifas/_components/GeografiaSelector.tsx`
- `app/(app)/configuracion/tarifas/_components/cobertura-descarga-columnas.ts`
- `app/(app)/configuracion/tarifas/_components/DescargarCoberturaButton.tsx`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`
- `providers/EtiquetasGeograficasProvider.tsx`
- `hooks/use-etiquetas-geograficas.ts`

Scripts y E2E existentes:
- `scripts/demo-qa/receta.ts`
- `scripts/demo-qa/geografia.ts`
- `e2e/_dos-empresas-fixture.ts`
- `e2e/superadmin-empresas.spec.ts`

Tests nuevos:
- `tests/fabricas/paises.ts`
- `tests/integration/db/pais-tabla.test.ts`
- `tests/integration/db/geografia-por-pais.test.ts`
- `tests/integration/db/organizacion-pais-inmutable.test.ts`
- `tests/integration/db/historial-plataforma-rls.test.ts`
- `tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts`
- `tests/integration/db/carga-division.test.ts`
- `tests/integration/db/geografia-superadmin-sin-empresa.test.ts`
- `tests/integration/db/geografia-dos-paises.test.ts`
- `tests/unit/services/pais-service.test.ts`
- `tests/unit/services/carga-division-service.test.ts`
- `tests/unit/utils/codigo-geografico.test.ts`
- `tests/unit/utils/division-csv.test.ts`
- `tests/unit/parsers/spreadsheet-texto-literal.test.ts`
- `tests/unit/actions/geografia-plataforma-action.test.ts`
- `tests/unit/actions/geografia-plataforma.composition-root.test.ts`
- `tests/unit/components/geografia-plataforma-page.test.tsx`
- `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts`
- `tests/unit/api/openapi-geografia-sin-cambios.test.ts`
- `tests/components/etiquetas-geograficas.test.tsx`

Tests existentes que se adaptan o se borran:
- `tests/fabricas/organizaciones.ts`
- `tests/fabricas/empresa-y-usuarios.ts`
- `tests/unit/services/geografia-service.test.ts`
- `tests/unit/services/organizacion-service.test.ts`
- `tests/unit/repositories/geo-repository.escrituras.test.ts`
- `tests/unit/actions/geografia-action.test.ts`
- `tests/unit/actions/geografia.composition-root.test.ts`
- `tests/unit/actions/organizaciones-action.test.ts`
- `tests/unit/components/geografia-admin.ui.test.tsx`
- `tests/unit/components/geografia-admin-page.test.tsx`
- `tests/unit/utils/zonas-sin-distritos.test.ts`
- `tests/unit/auth/menu-visibility.test.ts`
- `tests/unit/guards/geografia-renombrado-punto-unico.guardia.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`
- `tests/components/empresas-module.test.tsx`
- `tests/integration/db/organizacion-alta.test.ts`
- `tests/integration/db/empresas-plataforma.test.ts`
- `tests/integration/db/geografia-alta.test.ts`
- `tests/integration/db/geografia-renombrado.test.ts`
- `tests/integration/db/geografia-registro-accion.test.ts`
- `tests/integration/db/geografia-cascada-reversible.test.ts`
- `tests/integration/db/geografia-ordenes-sin-entregar.test.ts`
- `tests/integration/db/zona-especial-dos-empresas.test.ts`
