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

## Backend — tanda 2 (D10–D14)

backend_dev (2026-11-03). Grafo MCP no consultado (bastó Grep/Read sobre `lib/` y los tests de planes).
Sin `prisma generate` (el cliente es compartido con otra rama), sin dependencias nuevas, sin tocar la UI.

### Decisión de diseño: SIN migración
D10 y D14 no necesitan columna ni valor de enum nuevos. El cambio de solo el tipo deja una fila
`plan_asignado` propia con `valor_anterior` = el tipo de antes y `valor_nuevo` = el tipo nuevo. Una
asignación (SL-24, SLT-58, D2) deja siempre `valor_anterior` en NULL. Eso las distingue sin ambigüedad:
ninguna fila `plan_asignado` existente tiene `valor_anterior`, y no hay CHECK sobre `valor_*`.
Descarté un valor nuevo de `historial_accion_tipo` por tres motivos:
1. su `down.sql` exige recrear el enum;
2. varios tests de migración de `tests/integration/db/` fijan la lista exacta del enum
   (`caja-459-migration`, `historial-accion-*-migration`: `tipos.slice(-2, -1)`…) y solo corren en CI;
3. el cliente Prisma no se puede regenerar aquí.

Si el humano prefiere una acción propia («Cambió el tipo de cobro»), es el ABIERTO 1.

### Archivos
Nuevos:
- `tests/unit/services/planes-service-tipo-cobro.test.ts` (D10 y D13 en el servicio, y los esquemas zod).
- `tests/integration/db/planes-cambiar-tipo-cobro.test.ts` (D10, D12, D13 y D14 contra Postgres; corre en CI).

Modificados:
- `lib/types/planes.ts`:
  - nuevos `cambiarTipoCobroSchema`, `previsualizarCustomSchema`, `CambiarTipoCobroInput`,
    `PrevisualizarCustomInput`, `TipoDeAsignacion`, `CambiarTipoCobroResult` y `VistaPreviaCustomResult`;
  - `AsignacionDePlan` gana `tipo`, `tipoCobro` y `tipoCobroAnterior`.
- `lib/planes/cobro.ts`: `tipoCobroDelHistorial(valorAnterior, valorNuevo)` (puro).
- `lib/interfaces/repositories/IPlanesRepository.ts`:
  - nuevo `ResultadoCambiarTipoCobro`;
  - `AsignacionLeida` gana `valorAnterior` y `valorNuevo`;
  - métodos nuevos `vistaPreviaConTopes` y `cambiarTipoCobro`.
- `lib/repositories/PlanesRepository.ts`:
  - `cambiarTipoCobro`: empresa FOR UPDATE → plan FOR SHARE → UPDATE de `plan_tipo_cobro` y `appendAccion`
    en la misma transacción;
  - `vistaPreviaConTopes`;
  - `vistaPreviaAsignacion` reescrita sobre el helper común `vistaPreviaEnTx` (misma lectura);
  - `planDeEmpresa` lee los `valor_*` del historial.
- `lib/services/PlanesService.ts`:
  - nuevos `cambiarTipoCobro` y `previsualizarCustom`;
  - `planDeEmpresa` mapea D14;
  - `fueraDeRango` queda tipado como `validation_error`.
- `lib/interfaces/services/IPlanesService.ts` y `lib/actions/planes.ts` (2 actions nuevas).
- `lib/types/historial-accion.ts`: solo el comentario de `plan_asignado` (qué lleva cada `valor_*`).
- Tests:
  - `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: el censo suma un segundo
    productor de `plan_asignado`, `PlanesRepository#cambiarTipoCobro` (`abre_tx`, mutación
    `UPDATE "organizacion" SET "plan_tipo_cobro"`);
  - `tests/unit/actions/planes.composition-root.test.ts`, `tests/unit/planes/cobro.test.ts` y
    `tests/unit/services/planes-service-lecturas.test.ts`;
  - los dobles de `IPlanesRepository` en
    `tests/unit/services/planes-service{,-asignar-costo,-costeo,-crear-custom,-inicio-ciclo,-lecturas}.test.ts`.

### D12 (verificado: no hacía falta código)
El camino ya devolvía los avisos:
1. `crear`, con un custom e `inicioCiclo`, llama a `crearYAsignar`;
2. `crearYAsignar` llama a `asignarEnTx` con `inicio`;
3. `asignarEnTx` devuelve en `avisos` los topes ya pasados, sin rechazar, igual que la primera asignación;
4. el servicio los pasa al `ok`.

Faltaba un test de integración con `avisos` no vacíos: lo añadí.

### Mapa D<n> → test
| D | Unit | Integración db (CI) |
|---|------|---------------------|
| D10 | `planes-service-tipo-cobro.test.ts` > «D10 — …»: ok con el actor, mismo tipo con `cambio: false`, `sin_plan` sin escribir, `sin_plan` por carrera, `not_found`, validation_error y forbidden ×7 sin llamar al repo. También «los esquemas del borde». `planes.composition-root.test.ts` > «D10, D13: las dos actions nuevas…» y «D10: cambiarTipoCobroAction…». Guardia `historial-accion-escrituras-cubiertas`. | `planes-cambiar-tipo-cobro.test.ts` > «D10 — …»: guarda el tipo con su fila `plan_asignado` mensual→anual; plan, ancla, ciclo corto y módulos quedan iguales; el mismo tipo no escribe; `sin_plan` por el servicio y por el repo; `not_found`; con el historial roto no se guarda nada. |
| D12 | `planes-service-crear-custom.test.ts` > «los avisos de la primera asignación con fecha…» (ya existía). | `planes-cambiar-tipo-cobro.test.ts` > «D13: la vista previa … avisa lo que D12 devuelve al crear…»: `avisos: [adminTienda 3/2]` y la empresa queda asignada. |
| D13 | `planes-service-tipo-cobro.test.ts` > «D13 — …»: ok con los topes y el ancla, «hoy» = el instante, R31, R30, not_found, topes inválidos y forbidden. También los esquemas. `planes.composition-root.test.ts` > «D13: previsualizarCustomAction…». | `planes-cambiar-tipo-cobro.test.ts` > «D12, D13 — …»: avisa lo mismo que luego devuelve crear; no escribe; con topes holgados da `[]`; con plan da R31; con una empresa inexistente, `null`. |
| D14 | `cobro.test.ts` > «D10, D14 — el tipo de cobro de cada fila…»; `planes-service-lecturas.test.ts` > «D14: cada fila trae su tipo de cobro…» y R21. | `planes-cambiar-tipo-cobro.test.ts` > «D14 — …»: la fila `cambio_tipo_cobro` (mensual → anual) queda sobre la `asignacion` mensual, y el `cobro.tipo` del detalle es anual. |

### Salida real (2026-11-03)
- `pnpm exec eslint <14 archivos tocados>`: sin salida (0 problemas).
- `pnpm exec vitest related --run <8 archivos de lib/ + 2 tests nuevos> --exclude tests/components/** --exclude tests/integration/*-page.test.tsx`,
  con `NODE_OPTIONS=--max-old-space-size=8192`:
  `Test Files 140 passed | 43 skipped (183)`, `Tests 2412 passed | 456 skipped (2868)`.
  Los skipped son `tests/integration/db/` (no hay base local). Ningún rojo, tampoco por el cliente Prisma ajeno.
- `pnpm exec vitest run tests/unit/services/ tests/unit/actions/planes.composition-root.test.ts`
  (después del último cambio): `Test Files 367 passed`, `Tests 7205 passed`.
- `pnpm run typecheck`: 32 errores, NINGUNO de esta tanda.
  - Cliente Prisma ajeno (no se puede regenerar):
    - `planTipoCobro` en `PlanesRepository.ts` (×3) y en
      `tests/integration/db/planes-{crear-custom-asigna,cambiar-tipo-cobro}.test.ts`;
    - wallet e historial: el enum de `historial-accion.ts(708)`, `HistorialAccionRepository`, `LibroCaja…`,
      `PagoMensajero…` y `AnaliticaFinanciera…`;
    - `abono-tienda-457` e `incentivo-mensajero-slt68`.
  - De UI, para frontend_dev en la tanda siguiente: `tests/components/PlanEmpresa.test.tsx(62,63)`. Sus
    fixtures de `AsignacionDePlan` no traen los 3 campos nuevos de D14.
  - Arreglado en esta tanda: un error propio de `PlanesService` (`fueraDeRango`). Después del arreglo,
    `tsc` no da errores en los archivos de planes salvo los del cliente ajeno.
- Guardias: solo corrí `historial-accion-escrituras-cubiertas` (84 passed). No corrí `test:guardias`
  completo ni `./init.sh`, por la presión de memoria que indicaba el encargo.

### Contrato para frontend

**Actions nuevas** (`lib/actions/planes.ts`). Son solo para el superadmin: otro rol, o sin sesión, recibe
`{ estado: "forbidden" }` sin que se toque la base.

1. `cambiarTipoCobroAction(input: unknown, deps?) → Promise<CambiarTipoCobroResult>` (D10)
   - Input (`cambiarTipoCobroSchema`, `.strict()`): `{ organizacionId: uuid, tipoCobro: "mensual" | "anual" }`.
   - Resultados:
     - `{ estado: "ok", cambio: true }`: guardado. El historial tiene una fila nueva `cambio_tipo_cobro`.
     - `{ estado: "ok", cambio: false }`: ya tenía ese tipo. No se escribió nada ni hay fila.
     - `{ estado: "sin_plan" }`: la empresa no tiene plan (también por carrera, bajo el cerrojo).
     - `{ estado: "not_found" }`: la empresa no existe.
     - `{ estado: "validation_error", fieldErrors }`: claves `organizacionId`, `tipoCobro`, o `_` si sobra una clave.
     - `{ estado: "forbidden" }`.
   - No cambia el plan, el ancla, el ciclo corto ni los módulos.
   - El siguiente cobro y el monto del período salen recalculados en la próxima lectura (`vista.plan.cobro`
     del detalle, «Mi plan»): basta con refrescar.
2. `previsualizarCustomAction(input: unknown, deps?) → Promise<VistaPreviaCustomResult>` (D13)
   - Input (`previsualizarCustomSchema`, `.strict()`): `{ organizacionId: uuid, inicioCiclo: "AAAA-MM-DD", topes: TopesPlan }`.
     `topes` tiene la misma forma que en `crearPlanAction`:
     `{ ordenesPorCiclo: number|null, porRol: Partial<Record<RolConTope, number>>, apiKeys: number|null }`.
   - Resultados:
     - `{ estado: "ok", avisos: TopeExcedido[], siguienteCiclo: "AAAA-MM-DD" }`. Son los mismos que da la
       vista previa del modal (R37) y que el `avisos` del `ok` de `crearPlanAction` con esa fecha (D12).
     - `{ estado: "validation_error", fieldErrors }`, con estas claves:
       - `inicioCiclo`: la fecha está fuera de hoy ±1 mes (R30), o la empresa YA tiene plan (R31);
       - `topes.*`;
       - `organizacionId`.
     - `{ estado: "not_found" }`: la empresa no existe.
     - `{ estado: "forbidden" }`.
   - Aquí no hay `plan_sin_costo`: el costo lo valida `crearPlanAction`.

**D12**: el contrato no cambia. `crearPlanAction` con un custom, empresa sin plan e `inicioCiclo` devuelve
`{ estado: "ok", planId, cambio: true, avisos: TopeExcedido[], vigenteDesde: null }`. `avisos` son los
topes ya pasados, que no rechazan. Se pintan como en el modal de primera asignación: `mensajeTopesPasados`
solo lo usa `tope_excedido`, y el modal ya tiene su texto de avisos.

**Tipos** (`lib/types/planes.ts`):
- `type TipoDeAsignacion = "asignacion" | "cambio_tipo_cobro"`.
- `AsignacionDePlan` (cada fila de `vista.asignaciones` del detalle de empresa) =
  `{ creadoAt; actorNombre; planNombre; tipo: TipoDeAsignacion; tipoCobro: TipoCobro | null; tipoCobroAnterior: TipoCobro | null }`.
  - `tipo: "asignacion"`: asignar o cambiar de plan.
    - `tipoCobro` = el tipo elegido, o `null` en las filas anteriores al ajuste, que no lo guardaban
      (mostrar «—» o nada).
    - `tipoCobroAnterior: null`.
  - `tipo: "cambio_tipo_cobro"`: la fila propia de D10.
    - `tipoCobro` = el tipo nuevo; `tipoCobroAnterior` = el de antes.
    - `planNombre` = el plan que la empresa ya tenía.
  - Ojo con el typecheck: `tests/components/PlanEmpresa.test.tsx` (líneas 62–63) construye `AsignacionDePlan` sin estos campos.
- `type CambiarTipoCobroResult` y `type VistaPreviaCustomResult` (formas arriba); `cambiarTipoCobroSchema`,
  `previsualizarCustomSchema` y sus `*Input`.
- Helper puro: `lib/planes/cobro.ts > tipoCobroDelHistorial(valorAnterior, valorNuevo)`. Lo usa el
  servicio; la UI no lo necesita.

**Historial general de la empresa** (`historial_accion`, la pantalla de historial de acciones): la fila de
D10 es `plan_asignado` («Asignó un plan a una empresa»), con `valor_anterior` = el tipo anterior y
`valor_nuevo` = el tipo nuevo. No tiene etiqueta propia (ver ABIERTO 1).

### ABIERTO (no cubierto por D10–D15; no improvisado)
1. **Etiqueta del cambio de solo el tipo en el historial general de acciones.** Hoy sale como `plan_asignado`
   («Asignó un plan a una empresa»), con el tipo de antes y el de después. Una acción propia exige un valor
   nuevo de enum (migración con recreación del enum en `down.sql`) y tocar los tests de migración que fijan
   el enum. Decide el humano si vale la pena.
2. Las filas del historial de asignaciones anteriores al ajuste salen con `tipoCobro: null`, porque no hay
   dato. No se infiere «mensual» aunque fuera el DEFAULT de la migración: no consta qué se eligió.
3. La guardia 420 (`dependencias-declaradas-presentes`) sigue roja y ajena (baseline); no la corrí.
4. `tests/integration/db/`, también los tests nuevos, solo corre en CI.

### Veredicto
El backend de D10, D12, D13 y D14 está hecho y sin migración. Lint da 0 problemas y 2412 tests relacionados pasan. El typecheck no da errores propios: solo los del cliente Prisma ajeno y 2 fixtures de UI que ajustará frontend. Falta que CI corra la integración db.

## Frontend — tanda 2 (D10–D14)

frontend_dev (2026-11-03). Grafo MCP no consultado (bastó Grep/Read sobre la UI de planes). Sin
dependencias nuevas, sin `prisma generate`, sin tocar `lib/`, `db/` ni tests de backend.

### Archivos
Nuevos:
- `components/shared/AvisosDeTopes.tsx`: `AvisosDeTopes` y `textoDelAvisoDeTope` / `textosDeLosAvisosDeTopes`, movidos
  tal cual desde `PlanEmpresa` (R37/R42) para que el form del custom use la misma presentación (D12, D13).
- `tests/components/PlanEmpresaTipoCobro.test.tsx` (D10, D14) y `tests/components/PlanFormVistaPreviaCustom.test.tsx` (D12, D13).

Modificados (UI):
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`:
  - D10: botón «Cambiar tipo de cobro» (solo si la empresa tiene plan). Abre un modal con `TipoCobroCampo`, que arranca
    en `vista.plan.cobro.tipo`. Prop nueva: `cambiarTipoCobro`. Qué pasa con cada resultado:
    - `ok`, `cambio: true`: toast y `router.refresh()`; el tipo, el monto y el siguiente cobro se releen;
    - `ok`, `cambio: false`: toast informativo, sin releer;
    - `validation_error` de `tipoCobro`: el error va junto al campo y el modal sigue abierto;
    - lo demás (`sin_plan`, `not_found`, `forbidden`, otro `validation_error`, una excepción): al aviso de error de la sección.
  - D14: columna «Tipo de cobro» en el historial.
    - Una fila `asignacion` muestra «Mensual» o «Anual» («—» si el tipo es `null`).
    - Una fila `cambio_tipo_cobro` es una fila propia: «Cambió de Mensual a Anual».
  - Los avisos de topes ahora se importan de `components/shared/AvisosDeTopes.tsx`: mismo texto, nada cambia en pantalla.
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`: inyecta `cambiarTipoCobroAction`.
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`:
  - D13: prop `previsualizar` (modo crear).
    - Cuándo lee: con empresa sin plan, fecha y topes válidos (`previsualizarCustomSchema`), tras 300 ms sin cambios
      (`ESPERA_VISTA_PREVIA_MS`).
    - Las respuestas de otra entrada se descartan.
    - Pinta los topes ya pasados con `AvisosDeTopes`.
    - Si falla, muestra «No se pudo comprobar el consumo de la empresa» y el motivo de `inicioCiclo`, si lo hay.
    - No bloquea el guardado.
  - D12: al guardar un custom con fecha, toma el `siguienteCiclo` de la vista previa de esa misma entrada.
    - Si la lectura estaba en vuelo o en la pausa, la espera o la hace antes de crear: después de crear, la empresa ya
      tiene plan y la vista previa la rechazaría (R31).
    - Lo pasa como 3.er argumento de `onGuardado`.
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`: prop `previsualizarCustom`. D12: tras el `ok`, pinta
  `r.avisos` con `AvisosDeTopes` debajo de «Plan «X» creado.».
- `app/(app)/plataforma/planes/page.tsx`: inyecta `previsualizarCustomAction`.

Tests ajustados:
- `tests/components/PlanEmpresa.test.tsx`: los 2 fixtures de `AsignacionDePlan` (tipo/tipoCobro/tipoCobroAnterior), la fila
  esperada de R21 con la columna nueva y `cambiarTipoCobro` en el montaje.
- `tests/components/{PlanEmpresaSinCosto,PlanVistaCosteo,PlanesModule,PlanForm,PlanFormCosteo,PlanFormCustomAsigna}.test.tsx`:
  las props nuevas (`cambiarTipoCobro`, `previsualizarCustom`, `previsualizar`) y el 3.er argumento de `onGuardado`.
- `tests/integration/plataforma-{planes,empresa-detalle}-page.test.tsx`: el mock de `@/lib/actions/planes` exporta las 2 actions nuevas.

### Mapa D<n> → test (UI)
| D | Test |
|---|------|
| D10 | `PlanEmpresaTipoCobro.test.tsx` > «D10 — …»: solo con plan; arranca en el tipo actual y no llama a la action al abrir; confirmar manda `{organizacionId, tipoCobro}`, avisa y relee; `cambio: false` lo dice y no relee; `sin_plan`, `not_found`, `forbidden` y `validation_error` sin campo; `validation_error` de `tipoCobro` junto al campo con el modal abierto; excepción; «Volver» |
| D12 | `PlanFormVistaPreviaCustom.test.tsx` > «D12 — …» (tras crear salen los avisos con el día del siguiente ciclo; sin avisos solo «Plan creado») y «D12, D13: si se guarda con la lectura en vuelo…»; también `PlanForm.test.tsx` > R14 y `PlanFormCustomAsigna.test.tsx` > «D2, D6…» (3.er argumento de `onGuardado`) |
| D13 | `PlanFormVistaPreviaCustom.test.tsx` > «D13 — …»: la entrada lleva empresa, fecha y topes del form; relee al escribir un tope o cambiar la fecha; avisos con el texto del modal; sin avisos, nada; con plan o público no lee; el rechazo de la fecha se ve sin bloquear; excepción |
| D14 | `PlanEmpresaTipoCobro.test.tsx` > «D14 — …» (cabecera y filas: «Cambió de Mensual a Anual», «Mensual», «—»); `PlanEmpresa.test.tsx` > R21 |

### Salida real (2026-11-03)
- `pnpm run lint`: `✖ 232 problems (0 errors, 232 warnings)` (los mismos 232 de antes). `eslint` sobre los 17 archivos tocados: sin salida.
- `pnpm exec vitest related --run <6 archivos de UI + 11 tests>` (`NODE_OPTIONS=--max-old-space-size=8192`):
  `Test Files 1 failed | 13 passed (14)`, `Tests 1 failed | 217 passed (218)`.
  - El rojo era mío: `PlanForm.test.tsx` > R14 esperaba `onGuardado(OK, "Plan Norte", null)`. Como la empresa no tiene
    plan, llega el `siguienteCiclo` de la vista previa.
  - Corregí la expectativa y lo volví a correr: `pnpm exec vitest run tests/components/PlanForm.test.tsx` → `Tests 25 passed (25)`.
  - Ningún rojo por el cliente Prisma ajeno.
- Tests nuevos aislados: `Test Files 2 passed (2)`, `Tests 22 passed (22)`.
- `pnpm exec tsc --noEmit`: 29 errores, 0 en `app/`, `components/`, `tests/components/` y `tests/integration/*-page*`.
  - Todos son del cliente Prisma ajeno:
    - `lib/repositories/{HistorialAccion,LibroCajaAutoria,PagoMensajeroMovimiento,Planes,WalletMovimiento,WalletTiendaMovimiento}Repository.ts`;
    - `lib/services/AnaliticaFinancieraService.ts`;
    - `lib/types/{historial-accion,wallet}.ts`;
    - `tests/integration/db/*`.
  - Los 2 errores de `PlanEmpresa.test.tsx` ya no salen.
- No corrí `test:guardias` ni `./init.sh`, por la presión de memoria; el encargo no los pedía.

### Textos nuevos (D15: mínimos, en la línea de los aprobados)
- Botón y confirmar: «Cambiar tipo de cobro». Título del modal: «¿Cambiar el tipo de cobro?».
- Descripción: «La empresa sigue con «{plan}»: no cambian sus topes, sus módulos ni su ciclo de órdenes.»
- Resultado: «Tipo de cobro cambiado.» / «La empresa ya tenía ese tipo de cobro.»
- Rechazos nuevos:
  - «La empresa ya no tiene plan: el tipo de cobro se elige al asignarle uno.»
  - «Revisa el tipo de cobro elegido.»
  - «No se pudo cambiar el tipo de cobro. Inténtalo de nuevo.»
- Rechazos reutilizados: «Esa empresa ya no existe.» y «No tienes permiso para esto.».
- Historial:
  - cabecera «Tipo de cobro» (la de `TEXTOS_TIPO_COBRO`);
  - «Cambió de {antes} a {después}», o «Cambió a {después}» si falta el anterior;
  - «—» en las filas sin tipo.
- Vista previa del custom: reutiliza «No se pudo comprobar el consumo de la empresa» del modal.
- Respaldo del aviso de órdenes cuando no se sabe la fecha: «…no podrá crear más hasta el inicio del siguiente ciclo.»

### ABIERTO (frontend; no improvisado)
1. Aviso de órdenes de D12 sin `siguienteCiclo`. Solo pasa si la vista previa falla también al guardar y aun así se crea
   el plan. No calculo la fecha en el cliente, porque depende del reloj del servidor; el aviso dice «hasta el inicio del
   siguiente ciclo». Falta que el humano confirme ese texto.
2. D13 no bloquea «Crear plan» aunque falle la vista previa; el modal sí bloquea (P11). D13 pide mostrarla, no exigirla.
   Si el humano quiere el mismo bloqueo que en P11, el cambio es pequeño.
3. Siguen abiertos los ABIERTO 1–2 de backend tanda 2: la etiqueta en el historial general, y las filas viejas con
   `tipoCobro: null`, que salen como «—».

### Veredicto
La UI de D10, D12, D13 y D14 está hecha y probada. Lint da 0 errores y tsc no da ninguno en la UI ni en los tests de componente. Los tests relacionados pasan, tras corregir una expectativa mía. Quedan 3 abiertos.
