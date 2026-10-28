# SLT-49 — etiquetas-lote-tienda · tasks.md

> Diseño: `design.md`. Requisitos: `requirements.md` (R1–R15). Antes de T5, mirar si el humano
> respondió P1 y P2 de `requirements.md`. Un commit por task (`docs/conventions.md > Commits`).
> Capas: T1–T4 `backend_dev`; T5–T7 `frontend_dev`; T8–T9 cualquiera.

## Backend

- [ ] **T1 [P] — Regla única de alcance de etiquetas** (R12, R13, R14)
  - Crear `lib/services/alcance-etiquetas-orden.ts`: `AlcanceEtiquetasOrden` y
    `resolverAlcanceEtiquetasOrden(actor)` según la tabla de `design.md §2`. Pura (sin Prisma, sin
    `next/`, sin entorno). JSDoc con el porqué del valor por defecto `todas` y el aviso a SLT-50.
  - Test `tests/unit/services/alcance-etiquetas-orden.test.ts`: los 6 roles (`maestro`, `admin`,
    `adminTienda`, `apiKey`, `mensajero`, `adminSatelite`) → alcance y `ownerId` esperados.
  - **Hecho:** test verde; `pnpm run typecheck` verde.

- [ ] **T2 [P] — Repositorio con dueño obligatorio** (R10)
  - `lib/interfaces/repositories/IOrdenRepository.ts`: `findEtiquetasByIds(ids, tiendaId: string | null)`
    y `findEtiquetaByNumGuia(numGuia, tiendaId: string | null)`; JSDoc actualizado.
  - `lib/repositories/OrdenRepository.ts`: `tiendaId` no nulo entra en el `where` de las dos
    consultas; `null` las deja como hoy.
  - **Hecho:** typecheck verde (rojo esperado en el service hasta T3, que va en el mismo commit si
    hace falta para dejar verde el gate).

- [ ] **T3 — Service con frontera por dueño** (R7, R8, R9, R11, R12, R13) · depende de T1, T2
  - `lib/services/EtiquetaGuiaService.ts`: resuelve el alcance con T1, pasa `tiendaId` al repo en
    `generarEtiquetas` y `obtenerEtiquetaPorGuia`, reescribe `esVisiblePara` sobre el alcance
    (segunda capa). Contrato de salida igual (`no_encontrada` para la ajena). Comentarios de
    :21-38 y :51-57 actualizados.
  - `lib/actions/etiquetas-guia.ts`: solo los JSDoc de :49-57 y :72-78 (ya no es «cualquier rol»
    sin filtro). Sin cambio de código.
  - `tests/unit/services/etiqueta-guia-service.test.ts`: **cambio de contrato explícito** —
    `ADMIN_TIENDA` sale del bucle de :73-85; `fakeRepo` simula el `tiendaId` del `where` y registra
    el argumento; nuevos casos: tienda propia → etiqueta; tienda ajena → `no_encontrada` (lote y
    lote de uno); lote mixto → la propia en `etiquetas` y la ajena en `omitidas`; por guía ajena →
    `no_encontrada`; repo llamado con `usuarioId` de la tienda; maestro/admin/mensajero/adminSatelite
    → repo llamado con `null`; segunda capa: un doble que ignora `tiendaId` y devuelve la ajena →
    sigue `no_encontrada`.
  - **Hecho:** `pnpm exec vitest related --run lib/services/EtiquetaGuiaService.ts` verde, incluidos
    `etiquetas-lote-pdf-service.test.ts` y `api-pdf-etiqueta-service.test.ts` (si alguno rompe por
    la firma, se ajusta su doble sin cambiar lo que afirma).

- [ ] **T4 — Integración contra Postgres: la orden ajena** (R7, R8, R9, R10, R11) · depende de T3
  - `tests/integration/db/etiquetas-frontera-tienda.test.ts`, patrón
    `tests/integration/db/eliminar-orden-pantalla-frontera-tienda.test.ts` (`_postgres-real`,
    `describe.skip` sin base, `beforeAll` ruidoso sin catálogo, nada de `return` silencioso).
    Casos (a)–(f) de `design.md §5.2`; (a) y (b) llaman al repo **saltándose el service**.
  - Contrapruebas 1–4 de `design.md §5.3`: aplicar, ver ROJO, revertir. Resultado en
    `progress/impl_SLT-49.md`.
  - **Hecho:** verde con base (`HAY_BASE_DE_DATOS`) y las 4 contrapruebas anotadas con su rojo.

## Frontend

- [ ] **T5 [P] — Estados de la acción de la tienda** (R1, R5) · tras leer P1
  - Crear `app/(app)/ordenes/estados-etiquetas-tienda.ts`: `ESTADOS_ETIQUETAS_TIENDA` (los 3 de
    recogida) y `MOTIVO_SIN_GUIA = "Sin guía todavía"`.
  - **Hecho:** typecheck verde; lo cubre el test de T6.

- [ ] **T6 — Listado: «Imprimir etiquetas» para la tienda** (R1–R6, R15) · depende de T5
  - `app/(app)/ordenes/_components/OrdenesListado.tsx`, según `design.md §4.3`: prop
    `puedeImprimirEtiquetasPropias`; `haySeleccion` con la tercera condición;
    `elegibleEtiquetasTienda`; la acción en `accionesPara` (antes de «Eliminar», con `(N)`);
    `haySeleccionables`; `bloqueoSeleccion` con `MOTIVO_SIN_GUIA` (según P1); `EtiquetasGuiaModal`
    fuera del bloque `accionesLote`, montado una sola vez con `haySeleccion`. `accionesDe` no cambia.
  - Test `tests/components/OrdenesListado.etiquetas-tienda.test.tsx` (`// @vitest-environment jsdom`):
    casos de R1, R2 (incluido el conteo), R4 (ninguna otra acción de flujo; «Eliminar» sí con
    `eliminable`), R5, R6 y R15 (maestro con `accionesLote`: la acción en `en_bodega_central` y el
    modal abre).
  - **Hecho:** test nuevo verde y `tests/components/OrdenesListadoEtiquetasChain.test.tsx` verde sin
    tocarlo.

- [ ] **T7 — Página: la prop derivada de la regla** (R14) · depende de T1, T6
  - `app/(app)/ordenes/page.tsx`: `puedeImprimirEtiquetasPropias` derivado de
    `resolverAlcanceEtiquetasOrden` (sin lista de roles), con comentario del porqué; se pasa a
    `OrdenesListado`.
  - `tests/components/OrdenesPage.test.tsx`: `adminTienda` → `true`; maestro/admin → `false`; con
    `resolverAlcanceEtiquetasOrden` mockeado a `todas` para la tienda → `false`.
  - **Hecho:** test verde.

## Cierre

- [ ] **T8 — E2E corto** (R3) · depende de T3, T6, T7
  - `e2e/etiquetas-lote-tienda.spec.ts`: escenario de reparto, 2 órdenes centrales de `r.tienda`
    llevadas a `mensajero_recogiendo_en_bodega`; la tienda marca las 2, pulsa «Imprimir etiquetas»,
    ve 2 etiquetas y «Descargar etiquetas» descarga un `.pdf` (riesgo en `design.md §7`).
  - Correr también `e2e/dos-empresas-humo.spec.ts` (`docs/checkpoints-proyecto.md`: toca una lectura
    de datos de negocio).
  - **Hecho:** los dos verdes en local, salida en `progress/impl_SLT-49.md`.

- [ ] **T9 — Trazabilidad y gate** · depende de T1–T8
  - `progress/impl_SLT-49.md`: mapa `R1…R15 -> test` (de `design.md §5.2`), contrapruebas de T4 y
    salida de T8.
  - `pnpm run typecheck`, `pnpm run lint`, `./init.sh` en verde en el worktree.
  - **Hecho:** gate verde y los 15 requisitos con test.

## Archivos esperados

- `lib/services/alcance-etiquetas-orden.ts`
- `lib/services/EtiquetaGuiaService.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/actions/etiquetas-guia.ts`
- `app/(app)/ordenes/page.tsx`
- `app/(app)/ordenes/estados-etiquetas-tienda.ts`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `tests/unit/services/alcance-etiquetas-orden.test.ts`
- `tests/unit/services/etiqueta-guia-service.test.ts`
- `tests/unit/services/etiquetas-lote-pdf-service.test.ts`
- `tests/unit/services/api-pdf-etiqueta-service.test.ts`
- `tests/integration/db/etiquetas-frontera-tienda.test.ts`
- `tests/components/OrdenesListado.etiquetas-tienda.test.tsx`
- `tests/components/OrdenesPage.test.tsx`
- `e2e/etiquetas-lote-tienda.spec.ts`
- `progress/impl_SLT-49.md`
