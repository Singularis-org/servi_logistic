# impl SLT-97 «Reporte de bugs: módulo del superadmin»

Implementer, F2.1, 2026-11-09. Worktree `.worktrees/SLT-97-reporte-bugs-modulo-superadmin`.

## Entorno
- `.env` del worktree copiado del principal con `DATABASE_URL` a `servi_logistic_slt97` (Postgres 16.1
  nativo, localhost:5432) y las cuatro variables SUPABASE vacías (el principal apunta a un proyecto
  remoto; no se usa).
- Bases propias creadas con `DROP/CREATE`: `servi_logistic_slt97` y `servi_logistic_slt97_e2e`.
  Las dos con `prisma migrate deploy` (hasta `20261110120000_bug_report`) y `db:seed`
  («Seed de catalogos completado (rol, order_status, vehiculos).»).
- `pnpm install --frozen-lockfile` (sin dependencias nuevas) y `prisma generate`.

## Tareas

### T6 «Menú» — frontend_dev — commit 1e38e817
- `lib/auth/menu-visibility.ts` (IconKey `bug`, ítem «Reportes» tras «Vehículos», solo `ROLES_PLATAFORMA`),
  `app/(app)/_components/Sidebar.tsx` (`bug: Bug`).
- Tests: `menu-visibility.test.ts` 68 ✓, `Sidebar.test.tsx` 26 ✓,
  `superadmin-fuera-de-empresa.guardia.test.ts` 16 ✓, `pwa-manifiesto-atajos.guardia.test.ts` 11 ✓
  (121/121). eslint de los 6 archivos: sin avisos.
- (propuesta) El nombre del caso de SL-32 «R36: el superadmin ve exactamente [Empresas, Geografía]…»
  ya estaba desfasado y ahora comprueba cinco ítems; no se renombra para no tocar la trazabilidad de SL-32.

### T1 «Enum, columna, historial y triggers» — backend_dev — commit 0ec26b56
- `db/schema.prisma` (enum `BugReportStatus` con `new`, que Prisma acepta; `status @default(new)` e índice;
  modelo `BugReportStatusChange`), `db/migrations/20261111120000_bug_report_status/{migration,down}.sql`.
- `prisma validate`: válido. Typecheck (8 GB): exit 0.
- Ida y vuelta en `servi_logistic_slt97`: `migrate deploy` aplica → `db:rollback` «Rollback completado:
  20261111120000_bug_report_status» → `migrate deploy` aplica de nuevo.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script --exit-code`: exit 0,
  «-- This is an empty migration».
- En la base: triggers `bug_report_status_solo_adelante` y `bug_report_status_change_inmutable`, RLS en las
  dos tablas, `servi_app` sin permisos sobre `bug_report%`.
- (propuesta) design §2.5 cita `migrate diff --from-url`, que Prisma 7 ya no admite; el equivalente es
  `--from-config-datasource --to-schema db/schema.prisma`.
- Aviso: no correr `prisma format` en esta rama (reformatea ~600 líneas ajenas); el bloque nuevo va alineado a mano.

### T2 «Clasificación y excepción» — backend_dev — commit 2d1b4378
- `lib/db/modelos-de-negocio.ts`, `lib/db/excepciones-aislamiento.ts` (texto literal de design §5).
- `pnpm run test:guardias`: 341/342 archivos, 4807 ✓, 4 ✗, 1 saltado (204 s). Único rojo:
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`, en `tests/baseline-rojos.json`.
- Guardias de esquema contra `servi_logistic_slt97`: `schema-drift-saneamiento`, `nucleo-sin-modulos`,
  `catalogo-postgres-acota-esquema`: 3/3 archivos, 29/29, 0 saltados (la tabla nueva no tiene `updated_at`,
  el censo no cambia). Extra por disparadores de `db/`: `demo-qa` + `verificar-rls`: 13/13 archivos, 146/146.

### T3 «Contratos» — backend_dev — commit 354aebaf
- `lib/types/reporte-bug.ts` (constantes, zod, DTO; `resumenDeDescripcion` arma el resumen con «…» en
  servidor, por puntos de código). Sus casos van en el test de acciones (commit de T5).

### T4 «Repositorio y servicio» — backend_dev — commit b91154e2
- `IBugReportRepository`/`BugReportRepository` (`listar`, `detalle`, `cambiarEstado`; abren `comoPlataforma`
  con motivo propio), `IReportesBugPlataformaService`/`ReportesBugPlataformaService`; doble ampliado en
  `tests/unit/services/reporte-bug-service.test.ts`.
- `tests/integration/db/bug-report.test.ts` contra `servi_logistic_slt97`: 28 ✓ 0 ✗ 0 saltados (transacciones
  revertidas; toma el lock del superadmin). Caso R19 de SLT-87 «Reporte de bugs: botón flotante y envío»
  actualizado con la columna `status`.
- `reportes-bug-plataforma-service.test.ts` 11 ✓; `reporte-bug-service.test.ts` 8 ✓.
- R17: los 4 pares origen = destino pasan el trigger (design §2.3) y los rechaza el servicio
  (`transicion_invalida`); el test lo fija así.

### T5 «Server Actions y reparto» — backend_dev — commit efd3bc26
- `lib/actions/reportes-bug-plataforma.ts`; `lib/modulos/reparto.ts` solo con la action como `nucleo`.
- `reportes-bug-plataforma-action.test.ts` 19 ✓; `modulos-reparto.guardia.test.ts` 41 ✓;
  `plataforma-solo-en-lista` ✓. `vitest related` de los 7 de `lib`: 25 archivos, 391 ✓, 0 ✗.
  eslint 11 archivos sin avisos; typecheck (8 GB) exit 0.
- (propuesta) Las dos rutas de `MODULO_POR_RUTA` no entran en T5: la guardia exige que exista su `page.tsx`.
  Entran con T7 y T8.

### T7 «Listado» — frontend_dev — commit cc223d1c
- Creados: `app/(app)/plataforma/reportes/page.tsx`, `_components/ReportesModule.tsx`,
  `_components/reportes-textos.ts`, `tests/unit/components/reportes-plataforma-page.test.tsx`.
  Modificado: `lib/modulos/reparto.ts` (`/plataforma/reportes` como `nucleo`).

### T8 «Detalle» — frontend_dev — commit 225cad38
- Creados: `app/(app)/plataforma/reportes/[reporteId]/page.tsx`,
  `[reporteId]/_components/ReporteDetalle.tsx`, `tests/components/ReporteDetalle.test.tsx`.
  Modificados: `reportes-plataforma-page.test.tsx` (casos del detalle), `lib/modulos/reparto.ts`
  (`/plataforma/reportes/[reporteId]` como `nucleo`).

**Mapa R → test (UI)**
- R2: page «sin sesión y con cada rol de empresa, el listado y el detalle dan notFound sin llamar a la action».
- R5: page «sin searchParams, el estado está en Pendientes, la empresa en Todas las empresas y las fechas vacías».
- R6: page «cada fila muestra fecha UTC, empresa, usuario, rol, resumen de 120 con «…» y estado, y enlaza a su detalle».
- R7: page «el filtro de estado ofrece las seis opciones en orden».
- R8: page «el filtro de empresa ofrece Todas las empresas y las empresas por nombre» (+ «si las empresas no se pudieron leer…»).
- R9: page «con validation_error muestra el aviso de fechas y ninguna fila».
- R10: page «cambiar un filtro navega a la URL con el filtro y sin pagina; los valores por defecto no van en la URL» y «los searchParams llegan a la action como filtros».
- R11: page «la paginación muestra «26-50 de 60» y al pasar de página navega con pagina».
- R12: page «sin filas, con los filtros por defecto dice «No hay reportes pendientes.» y con otros «Ningún reporte coincide con los filtros.»» y «si la action responde error, muestra «No se pudo cargar el listado de reportes.» y no el vacío».
- R14: ReporteDetalle «muestra la descripción con sus saltos de línea y cada dato del contexto, el dispositivo o «Sin datos», y el estado».
- R15: page «un id que no es uuid, que no existe o borrado da notFound».
- R17: ReporteDetalle «el selector ofrece solo los destinos permitidos».
- R18: ReporteDetalle «con transicion_invalida muestra el aviso con el estado actual».
- R19: ReporteDetalle «en resolved y en dismissed no hay selector, nota ni botón, y se ve el texto de cerrado (%s)» (it.each).
- R20: ReporteDetalle «el contador muestra «0/500», «120/500» y «500/500», y el campo no admite el carácter 501».
- R22: ReporteDetalle «el historial va del más reciente al más antiguo, con «Sin nota» cuando no la hay, y vacío dice «Todavía no hay cambios de estado.»».
- R23: ReporteDetalle «el historial no tiene botones de editar ni de borrar».

**Salida**
- `pnpm exec vitest run tests/components/ReporteDetalle.test.tsx tests/unit/components/reportes-plataforma-page.test.tsx tests/unit/guards/modulos-reparto.guardia.test.ts`:
  Test Files 3 passed (3); Tests 69 passed (69) — ReporteDetalle 14 ✓, reportes-plataforma-page 14 ✓, modulos-reparto 41 ✓; 0 ✗, 0 saltados.
- `pnpm exec eslint app/(app)/plataforma/reportes <2 tests> lib/modulos/reparto.ts`: exit 0, sin avisos.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.

**Propuestas**
- Color del `Badge` por estado: Nuevo `info`, En revisión `warning`, Resuelto `success`, Descartado `secondary`.
- Detalle: un `error` de `verReporteBugAction` lanza y lo pinta `app/(app)/error.tsx` (el spec solo fija
  `validation_error` y `not_found` → notFound).
- Tras `transicion_invalida` también se vacía el destino elegido (la nota se conserva).
- La fila del listado enlaza con el texto de la fecha (enlace que cubre la fila con `after:inset-0`); no se
  añadió `aria-label` porque el spec no trae texto para él.


### T9 «E2E y documentación» — frontend_dev (código) + implementer (corridas) — commit c9a109a5
- `e2e/reporte-de-bugs.spec.ts`: describe «SLT-97 — el módulo del superadmin», en serie:
  «el superadmin abre «Reportes» desde el menú y ve el reporte enviado» (R1, R5, R6, R14, R17, R19–R22),
  «un resuelto no está en Pendientes y sí en Todos» (R7), «el maestro ve no encontrado en
  /plataforma/reportes» (R2). Localiza por descripción con UUID y filtra por la empresa creada en la corrida.
- `e2e/superadmin-arranque.spec.ts` (menú con «Reportes»), `docs/architecture.md` (§13).
- `e2e-sin-saltos.guardia` 38/38; eslint de los dos E2E sin avisos; `tsc` exit 0.
- (propuesta) Sacar «el maestro ve no encontrado» del describe en serie, para que un fallo del caso 1 no
  lo arrastre a «did not run».
- (propuesta) El caso R7 abre `/plataforma/reportes?empresa=<id>` por URL (R10) en vez de usar el filtro.

**E2E** — `next build` (8 GB, `NEXT_PUBLIC_APP_URL=http://localhost:3044`, 6 min 25 s, verde, con
`ƒ /plataforma/reportes` y `ƒ /plataforma/reportes/[reporteId]`), base `servi_logistic_slt97_e2e` recreada,
`E2E_PUERTO=3044 pnpm exec playwright test e2e/reporte-de-bugs.spec.ts --reporter=list` (arrastra
`plataforma-vacia`: `superadmin-arranque` y `superadmin-empresas`). Código en `c9a109a5`.
- Intento previo descartado: rojo de entorno en `superadmin-arranque` R18 porque el `.env` copiado traía
  `PRISMA_LOG_QUERIES` encendido y el log de queries imprimía los datos del superadmin. Se vació en el
  `.env` del worktree y se recreó la base.
- Corrida 1: `20 passed (43.5s)` — 0 failed, 0 skipped, 0 flaky.
- Corrida 2, misma base: `20 passed (43.3s)` — 0 failed, 0 skipped, 0 flaky.
    ✓   1 [plataforma-vacia] › e2e\superadmin-arranque.spec.ts:54:5 › el comando de arranque deja un superadmin sin empresa y no imprime sus datos (R18) (22ms)
    ✓   2 [plataforma-vacia] › e2e\superadmin-arranque.spec.ts:72:5 › entra con OTP y aterriza en «Empresas», con «Empresas», «Planes», «Geografía», «Vehículos» y «Reportes» como únicos ítems del menú (R18, R6; SL-20 R21; SLT-58 R23; SL-42 R1; SLT-97 R1) (2.5s)
    ✓   3 [plataforma-vacia] › e2e\superadmin-arranque.spec.ts:91:5 › /configuracion no le deja entrar (R6, R5) (451ms)
    ✓   4 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:207:5 › 1. «Empresas» abre con el formulario de alta y sin aviso (R29) (228ms)
    ✓   5 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:215:5 › 2. crea A y B desde el formulario y las dos salen en el listado con su maestro (R30, R37, R29) (1.9s)
    ✓   6 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:255:5 › 3. repetir el slug de A marca su campo y no crea nada (R31) (890ms)
    ✓   7 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:273:5 › 4. un slug inválido marca el campo sin crear nada (R34) (969ms)
    ✓   8 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:323:7 › 5-6. el maestro de A crea su contraseña con el enlace de bienvenida, «Empresas» le da 404 y no la ve (R18, R19, R35) (1.9s)
    ✓   9 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:323:7 › 5-6. el maestro de B crea su contraseña con «¿Olvidaste tu contraseña?», «Empresas» le da 404 y no la ve (R18, R19, R35) (1.9s)
    ✓  10 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:349:5 › 7. con las dos contraseñas creadas, ni la fila de A ni la de B ofrecen «Reenviar bienvenida» (R38) (165ms)
    ✓  11 [aislamiento] › e2e\reporte-de-bugs.spec.ts:141:7 › SLT-87 — quién ve el botón › el maestro ve el botón en dos pantallas del portal y el mensajero en un móvil en `/mis-asignaciones` (2.8s)
    ✓  12 [aislamiento] › e2e\reporte-de-bugs.spec.ts:168:7 › SLT-87 — quién ve el botón › el superadmin no ve el botón (3.2s)
    ✓  13 [aislamiento] › e2e\reporte-de-bugs.spec.ts:192:7 › SLT-87 — el borrador › el borrador sobrevive a recargar la página (887ms)
    ✓  14 [aislamiento] › e2e\reporte-de-bugs.spec.ts:204:7 › SLT-87 — el borrador › Descartar borra el borrador, deja el panel vacío y no guarda ningún reporte (913ms)
    ✓  15 [aislamiento] › e2e\reporte-de-bugs.spec.ts:230:7 › SLT-87 — el envío › enviar muestra Gracias y tras recargar el panel está vacío (826ms)
    ✓  16 [aislamiento] › e2e\reporte-de-bugs.spec.ts:242:7 › SLT-87 — el envío › la fila guardada lleva la empresa, el rol y la página sin query, aunque la URL del navegador tenga query (953ms)
    ✓  17 [aislamiento] › e2e\reporte-de-bugs.spec.ts:270:7 › SLT-87 — el envío › el log del servidor tiene el correo a reportes-e2e@example.test con la descripción (649ms)
    ✓  18 [aislamiento] › e2e\reporte-de-bugs.spec.ts:371:7 › SLT-97 — el módulo del superadmin › el superadmin abre «Reportes» desde el menú y ve el reporte enviado (4.8s)
    ✓  19 [aislamiento] › e2e\reporte-de-bugs.spec.ts:474:7 › SLT-97 — el módulo del superadmin › un resuelto no está en Pendientes y sí en Todos (637ms)
    ✓  20 [aislamiento] › e2e\reporte-de-bugs.spec.ts:500:7 › SLT-97 — el módulo del superadmin › el maestro ve no encontrado en /plataforma/reportes (614ms)

### Arreglo tras la verificación — backend_dev — commit ccaeac92
- `test:guardias` dio un rojo nuevo, fuera del baseline: `consultas-concurrentes-en-transaccion` (brazo C,
  R11): `BugReportRepository.ts:156`, `detalle()` con 3 relaciones hermanas en `include` sobre el `tx`.
- `detalle()` lee la fila plana y luego, en serie, empresa, usuario e historial (patrón
  `leerDescriptivosDeOrdenes`). Sin añadir al censo.
- Guardia 23/23; `bug-report.test.ts` 28/28 (0 saltados); servicio 11/11; acciones 19/19; eslint y typecheck verdes.

## Verificación final (árbol en ccaeac92 salvo donde se dice)
- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): exit 0.
- Lint (`pnpm run lint`): 0 errores, 244 warnings (todo el repo).
- Vitest de los archivos tocados (10 de la rama + `reporte-bug-service`, `schema-drift-saneamiento`,
  `nucleo-sin-modulos`), sobre el árbol previo al arreglo: 12/12 archivos, 237/237. Tras el arreglo, los 4
  afectados: 81/81.
- `pnpm run test:guardias` tras el arreglo: 341/342 archivos, 4807 ✓, 4 ✗, 1 saltado. Único rojo:
  `dependencias-declaradas-presentes.guardia.test.ts`, en `tests/baseline-rojos.json`.
- Migración: ida y vuelta y `migrate diff` vacío (ver T1).
- E2E ×2: verdes sobre `c9a109a5`. **No repetidos sobre `ccaeac92`:** el segundo `next build` lo cortó el
  sistema por falta de memoria y no se relanzó. El cambio de `detalle()` lo cubre `bug-report.test.ts`.
- No corridos (por regla de la sesión o pendientes del leader): `./init.sh`, el grupo `aislamiento` entero.
- Tamaño: `node scripts/tamano-pr.mjs` → AVISO, 32/40 archivos y 3528/1000 líneas; aceptado, pero por encima
  de las ~2.300–2.450 que se estimaron al aceptarlo.

## Mapa R → test
El de `tasks.md > Mapa R → test`: todos los casos existen con ese nombre. Diferencias: R19 en
`ReporteDetalle.test.tsx` es un `it.each` con sufijo «(resolved)»/«(dismissed)»; R1 en
`superadmin-arranque.spec.ts` se llama «… «Vehículos» y «Reportes» como únicos ítems del menú (…; SLT-97 R1)».
Casos extra: R6 (integración, resumen con «…»), R2/R10/R15 (acciones), log sin nota.

Veredicto: T1–T8 hechas y en verde; T9 escrita y E2E ×2 verde sobre `c9a109a5`, pendiente repetirlo sobre
el código final.
