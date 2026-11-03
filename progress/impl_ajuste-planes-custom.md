# impl — ajuste planes-custom (asigna al crear, tipo de cobro, sin «negociable»)

Encargo: `progress/features/ajuste-planes-custom-asigna-y-cobro.md` (D1–D9, sin SDD).

## Backend

Sesión 2 de backend_dev (2026-11-03): la sesión 1 se cortó sin bitácora y dejó el diff sin commitear.
Esta sesión auditó ese diff contra D1–D9 (parte backend), lo encontró completo y coherente, añadió la
comprobación de D8 al test de integración de crear+asignar y verificó. Grafo MCP no consultado (bastó
Grep/Read sobre el diff).

### Archivos

Nuevos:
- `db/migrations/20261031150000_plan_sin_negociable_y_tipo_cobro/{migration,down}.sql`
- `lib/planes/centimos.ts` (céntimos `bigint`, extraído de `costeo.ts` para compartirlo con `cobro.ts`)
- `lib/planes/cobro.ts` (D6–D9: `montoDelPeriodo`, `siguienteCobro`, `cobroDelPlan`, `valorDelHistorialDeAsignacion`)
- `tests/unit/planes/cobro.test.ts`, `tests/unit/services/planes-service-crear-custom.test.ts`
- `tests/integration/db/planes-crear-custom-asigna.test.ts`, `tests/integration/db/migracion-planes-custom-ida-y-vuelta.test.ts`

Modificados (lib/db): `db/schema.prisma` (`Organizacion.planTipoCobro`; fuera `Plan.precioNegociable`),
`lib/actions/planes.ts` (solo JSDoc), `lib/interfaces/repositories/I{MiPlan,Planes}Repository.ts`,
`lib/planes/{ciclo,consumo,costeo,mensajes}.ts`, `lib/repositories/{EmpresasPlataforma,MiPlan,Planes}Repository.ts`,
`lib/services/PlanesService.ts`, `lib/types/{consumo-plan,empresas-plataforma,planes}.ts`.
Tests modificados: los 25 de `git diff --stat tests/` (integración db de planes, unit de planes/servicios/schema,
composition-root y la guardia de historial). Esta sesión: `tests/integration/db/planes-crear-custom-asigna.test.ts`
(+ D8: crear+asignar no mueve `wallet_movimiento` ni `cobro_plataforma_movimiento`).

### Migración `20261031150000_plan_sin_negociable_y_tipo_cobro`
- Sube: versiones pendientes `{"precio":{"tipo":"negociable"}}` → `sin_precio`; DROP CHECK
  `plan_precio_forma`, DROP COLUMN `plan.precio_negociable` (se borra, no se deja sin uso: solo la nombraba
  `plan_de_la_empresa`, que se recrea; justificado en la cabecera); CHECK nuevo de cuatro formas;
  `organizacion.plan_tipo_cobro TEXT NOT NULL DEFAULT 'mensual'` + CHECK `organizacion_plan_tipo_cobro_check`;
  `plan_de_la_empresa` recreada sin `precio_negociable` y con `tipo_cobro` (privilegios conservados por
  `CREATE OR REPLACE`; `servi_app` sigue sin acceso a `plan*`).
- Baja: repone la columna (`false` para todos), el CHECK de 20261028130000 y el cuerpo LITERAL de
  `plan_de_la_empresa` de 20261031140200 (verificado con `diff`: idéntico); suelta CHECK y columna de tipo.
  Pérdida declarada en cabecera: los «negociable» no vuelven.
- `grep negociable lib db/schema.prisma`: quedan solo comentarios (D1 explicado) y la rama de
  `textoDelPrecio` que pinta un «negociable» histórico (rastro, correos encolados) como «sin precio».
  En `db/migrations`: las migraciones ya mergeadas y la nueva (subida/bajada). Ningún otro objeto SQL lo lee.

### Mapa D<n> → test
| D | Unit | Integración db (corre en CI) |
|---|------|------------------------------|
| D1 | `tests/unit/types/planes-schema.test.ts` («negociable ya no es una forma»); `tests/unit/planes/rastro*.test.ts`, `consumo.test.ts`, `costeo.test.ts` | `migracion-planes-custom-ida-y-vuelta.test.ts` (columna fuera, negociable→sin precio, versión pendiente reescrita, CHECK, down = esquema/md5 de funciones/privilegios de antes); `planes-catalogo.test.ts` (cuatro formas) |
| D2 | `planes-service-crear-custom.test.ts` (una llamada a `crearYAsignar`; forbidden sin llamadas; rechazos sin llegar al repo: `plan_sin_costo`, `not_found`, R30, R31; `tope_excedido` y carrera R31 tal cual) | `planes-crear-custom-asigna.test.ts` (ok con plan_id/rastro/historial; `tope_excedido`, R31 bajo cerrojo, historial roto y empresa inexistente → nada creado) |
| D4 | `planes-service-crear-custom.test.ts` (fecha → ancla; «hoy» = instante; ya tiene plan + fecha → validation_error `inicioCiclo`; ya tiene plan sin fecha → asigna conservando ancla) | `planes-crear-custom-asigna.test.ts` (ancla = mañana 00:00 plataforma + ciclo corto) |
| D5 | `tests/unit/planes/cobro.test.ts` > «D5 — inicio del ciclo por defecto» (frontera de día, dentro del rango) | `planes-crear-custom-asigna.test.ts` (usa `inicioDelCicloPorDefecto`) |
| D6 | `planes-schema.test.ts`, `planes-service-crear-custom.test.ts` > «D6 — el tipo de cobro en el borde», `planes-service-asignar-costo.test.ts`, `planes-service-inicio-ciclo.test.ts`, `cobro.test.ts` (valor del historial), `mi-plan-service.test.ts` | `planes-crear-custom-asigna.test.ts` (DEFAULT, cada asignación lo guarda e historial, CHECK 23514); `planes-asignacion*.test.ts`, `planes-historial.test.ts` (`valor_nuevo`); `plan-de-la-empresa.test.ts` + `mi-plan-repository.test.ts` (`tipo_cobro` por la lectura acotada); migración |
| D7 | `cobro.test.ts` > «D7 — montoDelPeriodo» (mensual, anual fijo, descuento, sin anual = ×12, redondeo, sin precio = null) | — (puro) |
| D8 | `cobro.test.ts` > «D8 — siguienteCobro» (mensual, hoy = aniversario, frontera de día plataforma, días 29–31, 29-feb anual, ancla futura) | `planes-crear-custom-asigna.test.ts` (sin movimientos de dinero); `planes-asignacion.test.ts` (asignar no mueve dinero) |
| D9 | `mi-plan-service.test.ts` («Mi plan» trae cobro), `planes-service-lecturas.test.ts` (detalle trae cobro), `cobro.test.ts` > `cobroDelPlan` | `empresas-plataforma-plan.test.ts` (lista trae `plan.tipoCobro`), `mi-plan-repository.test.ts` |

### Salida real (2026-11-03)
- `prisma generate`: ok.
- `pnpm run typecheck`: 19 errores, TODOS de UI (frontend_dev): `app/(app)/plataforma/planes/_components/PlanForm.tsx(484)` («negociable»);
  `tests/components/{ConsumoDelPlan,ConsumoDelPlanCosteo×2,EmpresasModulePlan×2,MiPlanModule,PlanDetalleAsignar,PlanEmpresa,PlanEmpresaSinCosto×3,PlanesModule,PlanVistaCosteo×2}.test.tsx`;
  `tests/integration/plataforma-empresa-detalle-page.test.tsx` ×2, `tests/integration/plataforma-planes-page.test.tsx` ×2.
  Causas: `cobro` / `tipoCobro` nuevos obligatorios, `{ tipo: "negociable" }` ya no es `PrecioPlan`, `asignarPlanAction` exige `tipoCobro`. Fuera de UI: 0.
- `pnpm run lint`: 0 errores, 232 warnings (preexistentes).
- `pnpm exec vitest related --run <16 archivos lib/ tocados> --exclude tests/components/** --exclude tests/integration/*-page.test.tsx`:
  `Test Files 118 passed | 40 skipped (158)`, `Tests 2046 passed | 351 skipped`. Los skipped son `tests/integration/db/` (sin base local; corren en CI).
- `pnpm run test:guardias`: `Tests 4 failed | 4512 passed | 24 skipped`. Los 4 rojos son
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (guardia 420: «init.sh ya no tiene el
  marcador FIN PASO 2…»): `init.sh` no se toca en esta rama (último commit que lo toca: `86d70bf`); es un
  desfase arnés/`init.sh` ajeno a este ajuste. No lo arreglo (no es backend de la feature): lo reporto.

### Contrato para frontend

**Actions** (`lib/actions/planes.ts`, todas devuelven `PlanResult` salvo las de lectura):
- `crearPlanAction(input: unknown, deps?) → Promise<PlanResult>`. Input (`crearPlanSchema`, `.strict()`):
  `{ nombre, visibilidad: "publico"|"custom", organizacionId: string|null, topes, modulos, precio: PrecioPlan, costoPorOrden: string|null, tipoCobro?: TipoCobro, inicioCiclo?: "AAAA-MM-DD" }`.
  - Custom: `tipoCobro` OBLIGATORIO; `inicioCiclo` opcional y solo si la empresa NO tiene plan. Público: ni `tipoCobro` ni `inicioCiclo`.
  - Custom ok → `{ estado: "ok", planId, cambio: true, avisos: TopeExcedido[], vigenteDesde: null }` y la empresa YA queda asignada (`avisos` = topes ya pasados en primera asignación con fecha).
  - Rechazos (en todos NO se crea nada):
    - `forbidden` (no superadmin; sin tocar el repo).
    - `validation_error` con `fieldErrors` por campo: `tipoCobro` (falta en custom / sobra en público / valor desconocido), `inicioCiclo` (público con fecha; fuera de hoy ±1 mes, R30; la empresa ya tiene plan, R31 —también por carrera bajo cerrojo—), `organizacionId`, `precio.*`, `costoPorOrden`, `nombre`, `topes.*`… (clave = `issue.path.join(".")`).
    - `not_found`: la empresa no existe (campo natural: `organizacionId`).
    - `plan_sin_costo`: base «sin precio» o `costoPorOrden` null (SLT-66 R28) (campos naturales: `precio` / `costoPorOrden`).
    - `tope_excedido { excedidos, mensaje }`: la empresa ya tiene plan, se manda sin fecha y ya pasa un tope del custom (R12). `mensaje` ya redactado.
- `asignarPlanAction(input: unknown, deps?) → Promise<PlanResult>`. Input `{ organizacionId: uuid, planId: uuid, inicioCiclo?: "AAAA-MM-DD", tipoCobro: TipoCobro }` — `tipoCobro` OBLIGATORIO en primera asignación y en cambio (`validation_error` en `tipoCobro` si falta). Resto de resultados como SLT-58/SLT-66.
- Sin cambios de firma: `editarPlanAction`, `archivarPlanAction`, `previsualizarAsignacionPlanAction`, `listarPlanesAsignablesAction`, `cancelarCambioPlanAction`.

**Tipos** (`lib/types/planes.ts`):
- `export const TIPOS_COBRO = ["mensual", "anual"] as const; export type TipoCobro = "mensual" | "anual"; export const tipoCobroSchema`.
- `PrecioPlan` = `{ tipo: "sin_precio" } | { tipo: "monto"; mensual: string; anual: null | { tipo: "fijo"; monto: string } | { tipo: "porcentaje"; porcentaje: string } }` — QUITADO `{ tipo: "negociable" }` (afecta `PlanDTO`, `PlanDelCatalogo`, `VersionPlan`, `CrearPlanInput`).
- `PlanDelCatalogo`: sin cambios propios (solo hereda el `PrecioPlan` sin negociable).
- `lib/types/consumo-plan.ts`: NUEVO `CobroDelPlan = { tipo: TipoCobro; montoPeriodo: string | null; siguienteCobro: string /* AAAA-MM-DD */ }`;
  `PlanConConsumo` gana `cobro: CobroDelPlan` (lo traen «Mi plan» —`MiPlanResult`— y el detalle de empresa del superadmin —`vista.plan`—).
- `lib/planes/consumo.ts`: `PlanConUsoLeido` gana `tipoCobro: TipoCobro` (obligatorio).
- `lib/types/empresas-plataforma.ts`: `EmpresaListada.plan: { id; nombre; tipoCobro: TipoCobro } | null`.
  Para el form del custom (D4) «la empresa tiene plan» = `listado.empresas[i].plan !== null` de `listarEmpresasPlataforma` (hoy `app/(app)/plataforma/planes/page.tsx` mapea solo `{ id, nombre }`).
- `IMiPlanRepository.PlanDeLaEmpresaLeido` gana `tipoCobro`.

**Helpers** (puros, sin Prisma, aptos para cliente):
- `lib/planes/ciclo.ts`: `inicioDelCicloPorDefecto(ahora: Date): string` (D5, mañana en hora de la plataforma, `AAAA-MM-DD`; siempre dentro de `rangoDelInicioDelCiclo(ahora)`); `fechaMasMeses(fecha: string, meses: number): string` (ahora exportada).
- `lib/planes/cobro.ts`: `montoDelPeriodo(precio: PrecioPlan, tipo: TipoCobro): string | null` (D7); `siguienteCobro(ancla: Date, tipo: TipoCobro, ahora: Date): string` (D8); `cobroDelPlan(precio, tipo, ancla, ahora): CobroDelPlan` (D9; ya lo aplica `planConConsumo`); `valorDelHistorialDeAsignacion(fecha: string | null, tipo: TipoCobro): string`.
- `lib/planes/centimos.ts`: `aCentimos(importe: string): bigint`, `aTexto(centimos: bigint): string`, `CIEN`.
- Formateo: no hay helper nuevo. `montoPeriodo` es texto con dos decimales sin moneda (como `costeo`, D26 de SL-24); `textoDelPrecio` ya no devuelve «negociable».

### ABIERTO (no cubierto por D1–D9; no improvisado)
1. **Cambiar solo el tipo de cobro con el mismo plan.** `asignar` con el plan que la empresa ya tiene
   responde `ok, cambio: false` (SL-24 R13) y NO guarda el `tipoCobro` nuevo. ¿Debe guardarse (y dejar
   historial) o el modal no debe permitirlo? Decide el humano.
2. **Inicio del ciclo enviado al crear un custom para una empresa que ya tiene plan:** hoy es
   `validation_error` en `inicioCiclo` (misma regla que `asignar`, R31); D4 dice que el form no lo muestra,
   así que solo pasa por carrera. Si se prefiere ignorarlo en silencio, es un cambio de una línea.
3. **Guardia 420 (`dependencias-declaradas-presentes`) en rojo** en este worktree, ajena al ajuste (ver arriba).

### Veredicto
Backend completo para D1, D2, D4–D9: typecheck sin errores fuera de UI, lint sin errores, 2046 tests relacionados en verde; integración db pendiente de CI; quedan 2 decisiones abiertas y un rojo de guardia ajeno.

## Frontend

frontend_dev (2026-11-03). Grafo MCP no consultado: bastó Grep/Read sobre la UI existente. Sin pantallas
nuevas, sin dependencias nuevas, sin tocar `lib/`, `db/` ni tests de backend.

### Archivos
Nuevos:
- `components/shared/TipoCobroCampo.tsx` (D6: `RadioGroup` Mensual/Anual dentro de `FormField`; lo comparten el modal de asignación y el form del custom).
- `components/shared/tipo-cobro.ts` (textos del tipo de cobro, sin `"use client"` para poder usarlos en `ConsumoDelPlan`).
- `tests/components/PlanFormCustomAsigna.test.tsx`.

Modificados (UI):
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`: D1 fuera «Negociable»; custom → `tipoCobro` (default mensual) y, si la empresa elegida NO tiene plan, «Inicio del ciclo de órdenes» con `min`/`max` y default mañana; payload según contrato; D3 `rechazoConCampo` (`plan_sin_costo` → `precio` o `costoPorOrden`; `not_found` → `organizacionId`; resto al aviso general) sin llamar a `onGuardado`.
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx` y `app/(app)/plataforma/planes/page.tsx`: empresas con `tienePlan` (`e.plan !== null`), `inicioCicloPorDefecto(ahora)` y `rangoDelInicioDelCiclo(ahora)` del reloj del servidor.
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx` y su `page.tsx`: prop `inicioCicloPorDefecto` (D5, la primera asignación propone mañana); selector de tipo de cobro en el modal de primera asignación y en el de cambio, se reinicia a «Mensual» en cada apertura; `tipoCobro` viaja siempre; un `validation_error` en `tipoCobro` en la primera asignación va junto al campo con el modal abierto.
- `components/shared/ConsumoDelPlan.tsx`: bloque «Cobro del plan» (tipo, monto del período «al mes/al año» o «por definir», siguiente cobro). Lo montan «Mi plan» y el detalle del superadmin. Costeo del ciclo sin cambios.
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`: la celda «Plan» pinta `«nombre» · Mensual|Anual`.

Tests ajustados (typecheck/negociable/tipoCobro/cobro/mañana): `tests/components/{ConsumoDelPlan,ConsumoDelPlanCosteo,EmpresasModulePlan,MiPlanModule,PlanDetalleAsignar,PlanEmpresa,PlanEmpresaSinCosto,PlanForm,PlanFormCosteo,PlanVistaCosteo,PlanesModule}.test.tsx`, `tests/integration/{plataforma-empresa-detalle-page,plataforma-planes-page}.test.tsx`. Los casos «negociable» se quitaron o pasan a «sin precio»; los que esperaban «hoy» por defecto esperan mañana (D5).

### Mapa D<n> → test (UI)
| D | Test |
|---|------|
| D1 | `PlanFormCustomAsigna.test.tsx` > «D1 — el costo base ya no ofrece «Negociable»»; `PlanForm.test.tsx` (opciones del costo base); `PlanFormCosteo.test.tsx` > R9 (2 radios) |
| D2 | `PlanFormCustomAsigna.test.tsx` > «D2, D6: el tipo elegido viaja a la action junto a la empresa y el inicio del ciclo»; `PlanForm.test.tsx` > R14 (custom lleva `tipoCobro` + `inicioCiclo`) |
| D3 | `PlanFormCustomAsigna.test.tsx` > «D3 — un rechazo de la asignación no cierra el formulario» (`plan_sin_costo` → «Costo base» / «Costo por orden», `not_found` → «Empresa», `tope_excedido` al aviso, `validation_error` de `inicioCiclo`; siempre sin `onGuardado` y con lo escrito) |
| D4 | `PlanFormCustomAsigna.test.tsx` > «D4, D5 — «Inicio del ciclo» en el custom» (sin plan sí, con plan no y sin `inicioCiclo` en el payload, público/sin empresa no); `plataforma-planes-page.test.tsx` > «D4, D5: …solo si la empresa no tiene plan» |
| D5 | `PlanFormCustomAsigna.test.tsx` (default MAÑANA ≠ hoy); `PlanEmpresa.test.tsx` > «R29, D5: el campo trae «mañana» por defecto…»; `plataforma-empresa-detalle-page.test.tsx` > «§11.5 (R29, R37), D5» y `plataforma-planes-page.test.tsx` (reloj falso 2026-10-29 → 2026-10-30) |
| D6 | `PlanEmpresa.test.tsx` > «Ajuste planes-custom D6 — el tipo de cobro se elige en el modal de asignación» (primera y cambio, default, reinicio, error junto al campo); `PlanFormCustomAsigna.test.tsx` > «D6 — el tipo de cobro en el custom» |
| D9 | `MiPlanModule.test.tsx` > «Ajuste planes-custom D9 — «Mi plan» muestra…» (mensual, anual ×12, por definir); `plataforma-empresa-detalle-page.test.tsx` > R19 (lista «Cobro del plan» en el detalle); `EmpresasModulePlan.test.tsx` > «Ajuste planes-custom D9 — la lista muestra solo el tipo…» |
| D7, D8 | Cálculo del backend (`cobro.test.ts`); la UI solo pinta lo que llega: lo cubren los tests D9 de «Mi plan» (45000.00 al mes / 540000.00 al año; 2026-03-15 / 2027-01-15). |

### Salida real (2026-11-03)
- `pnpm run typecheck`: 0 errores (`tsc --noEmit` sin salida).
- `pnpm run lint`: `✖ 232 problems (0 errors, 232 warnings)` (los mismos 232 de antes); `eslint` sobre los archivos tocados: sin salida.
- `pnpm exec vitest related --run <9 archivos de UI tocados> tests/components/PlanFormCustomAsigna.test.tsx`: `Test Files 20 passed (20)`, `Tests 336 passed (336)`.
- `pnpm run test:guardias`: `Tests 4 failed | 4512 passed | 24 skipped`; los 4 rojos son los mismos de `dependencias-declaradas-presentes.guardia.test.ts` (guardia 420), ajenos (sin cambio).

### ABIERTO (frontend; no cubierto por D1–D9, no improvisado)
1. Los dos ABIERTO de backend siguen sin decidir; la UI no los fuerza: el selector del modal no ofrece el plan actual (no se puede «cambiar solo el tipo») y el form del custom no muestra «Inicio del ciclo» si la empresa ya tiene plan.
2. **Avisos del `ok` al crear un custom con fecha** (`avisos`: topes ya pasados en primera asignación): `PlanesModule` solo dice «Plan «X» creado.» y no los muestra. El modal de primera asignación sí los muestra (R37/R42). ¿Se pintan también al crear?
3. **Vista previa de topes (R37) en el form del custom**: el modal de primera asignación lee la vista previa de la fecha; el form del custom no (no hay plan creado aún contra el que leerla). Decidir si hace falta.
4. **Historial de asignaciones** del detalle: la tabla sigue mostrando fecha/quién/plan; no pinta el tipo de cobro (D9 no lo pide).
5. **Textos nuevos** para revisión humana: «Tipo de cobro», «Mensual»/«Anual», «Cobro del plan», «Monto del período: X al mes|al año|por definir», «Siguiente cobro: AAAA-MM-DD», «Esa empresa ya no existe.», «Para asignarlo a la empresa, el plan necesita costo base con monto y costo por orden.», ayuda «El ciclo de órdenes de la empresa empieza ese día, hora de la plataforma.». Montos sin moneda, como el costeo (D26 de SL-24).

### Veredicto
UI de D1–D6 y D9 hecha y probada: typecheck 0, lint 0 errores, 336 tests relacionados en verde; guardia 420 roja y ajena; 5 abiertos para el humano.
