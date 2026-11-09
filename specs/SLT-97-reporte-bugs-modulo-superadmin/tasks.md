# SLT-97 — Reporte de bugs: módulo del superadmin · tasks.md

> Entrega 2 de 3. El exceso de tamaño está aceptado (P1 del 2026-11-09; la línea `tamano-pr-aceptado`
> está en `progress/features/SLT-97.md`). `[P]` = paralelizable con las demás `[P]` de su bloque, una vez
> cumplidas sus dependencias.
>
> **Reparto por capa:** `backend_dev` en T1–T5; `frontend_dev` en T6–T8. Cierra T9 el que acabe.

## Bloque A — Datos

- [x] **T1. Enum, columna, historial y triggers** (R3, R16, R18, R21, R23).
  - **Archivos:**
    - en `db/schema.prisma`, el enum `BugReportStatus`, `status` en `BugReport` (con `@default(new)` y el
      índice) y el modelo `BugReportStatusChange` con su inverso;
    - `db/migrations/20261111120000_bug_report_status/{migration,down}.sql` (design §2.1–§2.5), con un
      timestamp posterior a la última migración de `dev` al crearla.
  - **Hecho:**
    - `prisma validate` y `pnpm run typecheck` verdes; aquí se confirma `new` como valor de enum
      (design §14);
    - `prisma migrate deploy` y `pnpm run db:rollback` aplican y revierten sobre una base desechable.
- [ ] **T2. Clasificación y excepción** (dep. T1; R3).
  - **Archivos:**
    - `BugReportStatusChange` en `MODELOS_DE_PLATAFORMA` (`lib/db/modelos-de-negocio.ts`);
    - el motivo nuevo de `BugReportRepository.ts` en `lib/db/excepciones-aislamiento.ts` (design §5).
  - **Hecho:** `pnpm run test:guardias` verde (`organizacion-en-modelos`, `plataforma-solo-en-lista`,
    `rls-por-empresa`).

## Bloque B — Servidor

- [ ] **T3. Contratos** (dep. T1; R5, R7, R9, R11, R17, R20).
  - **Archivo:** `lib/types/reporte-bug.ts`, con `NOTA_MAX`, `REPORTES_POR_PAGINA`, `RESUMEN_MAX`,
    `TRANSICIONES_REPORTE`, `ESTADOS_PENDIENTES`, los tres zod y los DTO (design §4, §6).
  - **Hecho:** sus casos en `tests/unit/actions/reportes-bug-plataforma-action.test.ts` verdes.
- [ ] **T4. Repositorio y servicio** (dep. T2, T3; R3, R4, R5, R7–R11, R13, R15–R18, R20, R21, R23).
  - **Archivos:**
    - `IBugReportRepository` y `BugReportRepository`, con `listar`, `detalle` y `cambiarEstado` (design
      §5);
    - `IReportesBugPlataformaService` y `ReportesBugPlataformaService` (design §4).
  - **Hecho:** verdes `tests/unit/services/reportes-bug-plataforma-service.test.ts` y
    `tests/integration/db/bug-report.test.ts`, este con `DATABASE_URL` (un verde sin base no vale,
    `docs/verification.md`).
- [ ] **T5. Server Actions y reparto** (dep. T4; R2, R9, R15, R18, R20).
  - **Archivos:**
    - `lib/actions/reportes-bug-plataforma.ts`, con `listarReportesBugAction`, `verReporteBugAction` y
      `cambiarEstadoReporteBugAction` (design §3, §6);
    - en `lib/modulos/reparto.ts`, las dos rutas y la action como `nucleo`.
  - **Hecho:** `tests/unit/actions/reportes-bug-plataforma-action.test.ts` y `modulos-reparto.guardia`
    verdes.

## Bloque C — Interfaz

- [x] **T6 [P]. Menú** (dep. —; R1, R2).
  - **Archivos:**
    - código: el ítem «Reportes» y `IconKey "bug"` en `lib/auth/menu-visibility.ts`, y `bug: Bug` en
      `app/(app)/_components/Sidebar.tsx`;
    - tests: `tests/unit/auth/menu-visibility.test.ts`, `tests/components/Sidebar.test.tsx`,
      `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` y
      `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` (design §8.1).
  - **Hecho:** esos cuatro tests verdes.
- [ ] **T7. Listado** (dep. T5; R2, R5–R12).
  - **Archivos:**
    - `app/(app)/plataforma/reportes/page.tsx`;
    - `app/(app)/plataforma/reportes/_components/ReportesModule.tsx`;
    - `app/(app)/plataforma/reportes/_components/reportes-textos.ts` (design §8.2, §9).
  - **Hecho:** `tests/unit/components/reportes-plataforma-page.test.tsx` verde.
- [ ] **T8. Detalle** (dep. T5, T7 por los textos; R2, R14, R15, R17–R20, R22, R23).
  - **Archivos:**
    - `app/(app)/plataforma/reportes/[reporteId]/page.tsx`;
    - `app/(app)/plataforma/reportes/[reporteId]/_components/ReporteDetalle.tsx` (design §8.3).
  - **Hecho:** `tests/components/ReporteDetalle.test.tsx` y sus casos de la página en
    `tests/unit/components/reportes-plataforma-page.test.tsx` verdes.

## Bloque D — De punta a punta y cierre

- [ ] **T9. E2E y documentación** (dep. T6, T7, T8; R1, R2, R5–R7, R14, R17, R19–R22).
  - **Archivos:**
    - el `describe` «SLT-97 — el módulo del superadmin» en `e2e/reporte-de-bugs.spec.ts` (design §10);
    - la lista del menú en `e2e/superadmin-arranque.spec.ts`;
    - el párrafo de `docs/architecture.md` (design §13).
  - **Hecho:**
    - dos corridas seguidas de los dos E2E sobre una base desechable, con 0 failed, 0 skipped y 0 flaky
      (`docs/verification.md > El E2E`), y la salida pegada en `progress/impl_SLT-97.md`;
    - el grupo `aislamiento` entero, que incluye `dos-empresas-humo`, porque el diff toca `db/`;
    - `./init.sh` verde;
    - `node scripts/tamano-pr.mjs` en aviso, no en rojo, por la línea `tamano-pr-aceptado`.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/unit/auth/menu-visibility.test.ts` «el superadmin ve exactamente [Empresas, Planes, Geografía, Vehículos, Reportes] y aterriza en /plataforma/empresas» y «hay un solo ítem a /plataforma/reportes, con el icono «bug» y sin subítems»; `tests/components/Sidebar.test.tsx` «toda clave de IconKey resuelve a un ícono»; `e2e/superadmin-arranque.spec.ts` «… como únicos ítems del menú»; `e2e/reporte-de-bugs.spec.ts` «el superadmin abre «Reportes» desde el menú y ve el reporte enviado» |
| R2 | `tests/unit/components/reportes-plataforma-page.test.tsx` «sin sesión y con cada rol de empresa, el listado y el detalle dan notFound sin llamar a la action»; `tests/unit/actions/reportes-bug-plataforma-action.test.ts` «sin sesión da unauthenticated y un rol de empresa forbidden en las tres actions, sin llamar al servicio»; `tests/unit/services/reportes-bug-plataforma-service.test.ts` «un actor que no es de plataforma da forbidden sin tocar el repositorio»; `tests/unit/auth/menu-visibility.test.ts` «solo el superadmin ve «Reportes»; ningún rol de empresa, y sin sesión tampoco»; `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` y `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` (superadmin 5, nadie más se mueve); `e2e/reporte-de-bugs.spec.ts` «el maestro ve no encontrado en /plataforma/reportes» |
| R3 | `tests/integration/db/bug-report.test.ts` «con servi_app, SELECT, INSERT, UPDATE y DELETE de bug_report_status_change y UPDATE de bug_report.status dan 42501» |
| R4 | `tests/integration/db/bug-report.test.ts` «cambiar el estado no deja filas en historial_accion ni en jobs»; `tests/unit/services/reportes-bug-plataforma-service.test.ts` «el servicio no recibe emisor de correo ni cola» (el constructor solo recibe el repositorio) |
| R5 | `tests/unit/services/reportes-bug-plataforma-service.test.ts` «sin filtros pide los estados new e in_review, todas las empresas, página 1 de 25»; `tests/integration/db/bug-report.test.ts` «listar ordena del más reciente al más antiguo y devuelve 25 por página»; `tests/unit/components/reportes-plataforma-page.test.tsx` «sin searchParams, el estado está en Pendientes, la empresa en Todas las empresas y las fechas vacías»; `e2e/reporte-de-bugs.spec.ts` (paso 2) |
| R6 | `tests/unit/components/reportes-plataforma-page.test.tsx` «cada fila muestra fecha UTC, empresa, usuario, rol, resumen de 120 con «…» y estado, y enlaza a su detalle»; `e2e/reporte-de-bugs.spec.ts` (pasos 2 y 3) |
| R7 | `tests/integration/db/bug-report.test.ts` «el filtro de estado devuelve solo los estados pedidos: pendientes, todos y cada uno»; `tests/unit/components/reportes-plataforma-page.test.tsx` «el filtro de estado ofrece las seis opciones en orden»; `e2e/reporte-de-bugs.spec.ts` «un resuelto no está en Pendientes y sí en Todos» |
| R8 | `tests/integration/db/bug-report.test.ts` «con dos empresas, el filtro de empresa devuelve solo los de la elegida»; `tests/unit/components/reportes-plataforma-page.test.tsx` «el filtro de empresa ofrece Todas las empresas y las empresas por nombre» |
| R9 | `tests/integration/db/bug-report.test.ts` «desde y hasta son inclusivos por día UTC: 23:59:59.999Z de hasta entra y 00:00Z del día siguiente no»; `tests/unit/actions/reportes-bug-plataforma-action.test.ts` «desde posterior a hasta, 2026-02-30 y un estado desconocido dan validation_error»; `tests/unit/components/reportes-plataforma-page.test.tsx` «con validation_error muestra el aviso de fechas y ninguna fila» |
| R10 | `tests/integration/db/bug-report.test.ts` «empresa, estado y fechas se combinan»; `tests/unit/components/reportes-plataforma-page.test.tsx` «cambiar un filtro navega a la URL con el filtro y sin pagina; los valores por defecto no van en la URL» y «los searchParams llegan a la action como filtros» |
| R11 | `tests/unit/services/reportes-bug-plataforma-service.test.ts` «una página mayor que la última devuelve la última, y una menor que 1 la primera»; `tests/unit/actions/reportes-bug-plataforma-action.test.ts` «pagina no numérica es 1»; `tests/unit/components/reportes-plataforma-page.test.tsx` «la paginación muestra «26-50 de 60» y al pasar de página navega con pagina» |
| R12 | `tests/unit/components/reportes-plataforma-page.test.tsx` «sin filas, con los filtros por defecto dice «No hay reportes pendientes.» y con otros «Ningún reporte coincide con los filtros.»» y «si la action responde error, muestra «No se pudo cargar el listado de reportes.» y no el vacío» |
| R13 | `tests/integration/db/bug-report.test.ts` «un reporte con deleted_at no sale en el listado ni cuenta en el total» |
| R14 | `tests/components/ReporteDetalle.test.tsx` «muestra la descripción con sus saltos de línea y cada dato del contexto, el dispositivo o «Sin datos», y el estado»; `tests/integration/db/bug-report.test.ts` «detalle trae la empresa, el correo de quien reportó y el historial»; `e2e/reporte-de-bugs.spec.ts` (paso 3) |
| R15 | `tests/unit/components/reportes-plataforma-page.test.tsx` «un id que no es uuid, que no existe o borrado da notFound»; `tests/integration/db/bug-report.test.ts` «detalle de un reporte con deleted_at devuelve null» |
| R16 | `tests/integration/db/bug-report.test.ts` «crear deja el reporte en new, y la migración deja en new los que ya existían» |
| R17 | `tests/integration/db/bug-report.test.ts` «los 16 pares origen × destino: la base acepta exactamente los de TRANSICIONES_REPORTE»; `tests/unit/services/reportes-bug-plataforma-service.test.ts` «desde new acepta in_review, resolved y dismissed; desde in_review, resolved y dismissed»; `tests/components/ReporteDetalle.test.tsx` «el selector ofrece solo los destinos permitidos»; `e2e/reporte-de-bugs.spec.ts` (pasos 4 y 5) |
| R18 | `tests/integration/db/bug-report.test.ts` «cambiarEstado hacia atrás, al mismo estado o desde un cerrado devuelve transicion_invalida con el actual, sin cambiar nada ni escribir historial» y «un UPDATE a mano de resolved a new da SL097, también como dueño»; `tests/components/ReporteDetalle.test.tsx` «con transicion_invalida muestra el aviso con el estado actual» |
| R19 | `tests/components/ReporteDetalle.test.tsx` «en resolved y en dismissed no hay selector, nota ni botón, y se ve el texto de cerrado»; `e2e/reporte-de-bugs.spec.ts` (paso 5) |
| R20 | `tests/components/ReporteDetalle.test.tsx` «el contador muestra «0/500», «120/500» y «500/500», y el campo no admite el carácter 501»; `tests/unit/actions/reportes-bug-plataforma-action.test.ts` «una nota de 501 tras recortar da validation_error; 500 con espacios alrededor pasa; solo espacios llega como sin nota»; `tests/integration/db/bug-report.test.ts` «una nota vacía se guarda como NULL y el CHECK rechaza una de 501»; `e2e/reporte-de-bugs.spec.ts` (paso 4) |
| R21 | `tests/integration/db/bug-report.test.ts` «cambiarEstado deja una entrada con from, to, nota, actor_name del superadmin y created_at» y «si falla la escritura del historial, el estado no cambia»; `e2e/reporte-de-bugs.spec.ts` (paso 4) |
| R22 | `tests/components/ReporteDetalle.test.tsx` «el historial va del más reciente al más antiguo, con «Sin nota» cuando no la hay, y vacío dice «Todavía no hay cambios de estado.»»; `e2e/reporte-de-bugs.spec.ts` (pasos 3 a 5) |
| R23 | `tests/integration/db/bug-report.test.ts` «UPDATE y DELETE directos de bug_report_status_change dan SL097, también como dueño, y borrar el bug_report se lleva su historial»; `tests/components/ReporteDetalle.test.tsx` «el historial no tiene botones de editar ni de borrar» |

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261111120000_bug_report_status/migration.sql`
- `db/migrations/20261111120000_bug_report_status/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/types/reporte-bug.ts`
- `lib/interfaces/repositories/IBugReportRepository.ts`
- `lib/repositories/BugReportRepository.ts`
- `lib/interfaces/services/IReportesBugPlataformaService.ts`
- `lib/services/ReportesBugPlataformaService.ts`
- `lib/actions/reportes-bug-plataforma.ts`
- `lib/modulos/reparto.ts`
- `lib/auth/menu-visibility.ts`
- `app/(app)/_components/Sidebar.tsx`
- `app/(app)/plataforma/reportes/page.tsx`
- `app/(app)/plataforma/reportes/_components/ReportesModule.tsx`
- `app/(app)/plataforma/reportes/_components/reportes-textos.ts`
- `app/(app)/plataforma/reportes/[reporteId]/page.tsx`
- `app/(app)/plataforma/reportes/[reporteId]/_components/ReporteDetalle.tsx`
- `docs/architecture.md`
- `tests/integration/db/bug-report.test.ts`
- `tests/unit/services/reportes-bug-plataforma-service.test.ts`
- `tests/unit/actions/reportes-bug-plataforma-action.test.ts`
- `tests/unit/components/reportes-plataforma-page.test.tsx`
- `tests/components/ReporteDetalle.test.tsx`
- `tests/unit/auth/menu-visibility.test.ts`
- `tests/components/Sidebar.test.tsx`
- `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`
- `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`
- `e2e/superadmin-arranque.spec.ts`
- `e2e/reporte-de-bugs.spec.ts`

**Total:** 31 archivos (aviso al 80%: 32; máximo: 40) y unas 2300-2450 líneas (máximo: 1000; exceso
aceptado en P1).

**Reparto aproximado de las líneas:**

| Parte | Líneas |
|---|---|
| Datos | ~230 |
| Servidor | ~560 |
| Menú | ~20 |
| Pantallas | ~600 |
| Documentación | ~10 |
| Tests y E2E | ~900-1000 |

Si cambia el timestamp de la migración, se actualizan aquí sus dos rutas.
