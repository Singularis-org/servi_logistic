# Ajuste de planes: custom se asigna al crear, tipo de cobro, sin «negociable»

**Fecha:** 2026-10-31 · **Rama:** `ajuste/planes-custom-asigna-y-cobro` (worktree `.worktrees/ajuste-planes-custom`)
**Modo:** ajuste SIN SDD, por decisión expresa del humano (como el ajuste de núcleo de SL-23).
Toca comportamiento de SL-24, SLT-58 y SLT-66. No hay spec nuevo: este archivo es el encargo.

## Problema reportado
Al crear un plan custom y elegir una empresa, la lista de empresas sigue diciendo «Sin plan · Asignar
plan». Causa: crear (SL-24 R1) solo guarda el plan con `plan.organizacion_id`; nunca toca
`organizacion.plan_id`. La asignación es otro paso (`PlanesRepository.asignar`).

## Decisiones del humano (cerradas 2026-10-31)
- **D1 — Quitar «negociable».** `PrecioPlan` queda en `sin_precio` | `monto`. Se quita del
  formulario, del schema zod, de mensajes, repositorios y tests. Migración NUEVA (no editar las
  mergeadas): convierte los planes `precio_negociable = true` a «sin precio», borra la columna
  `precio_negociable` (o la deja sin uso si borrarla rompe algo; justificar) y ajusta el CHECK
  `plan_precio_forma`, con su `down.sql`. Un custom con costo negociado usa la forma «monto».
- **D2 — Un custom con empresa se asigna al crearlo.** Crear el plan y asignarlo es UNA sola
  operación atómica. Si la asignación no se puede hacer (sin costo concreto, R28 `plan_sin_costo`;
  `tope_excedido`; cualquier otro rechazo de `asignar`), NO se crea nada.
- **D3 — El formulario no se cierra ante ese rechazo.** El motivo se muestra en el formulario, junto
  al campo cuando aplique, y conserva lo escrito para corregirlo (patrón SLT-58 R18).
- **D4 — Inicio del ciclo en el form del custom.** Si la empresa NO tiene plan, el formulario
  muestra «Inicio del ciclo» (el mismo `inicioCiclo` de SLT-58). Si ya tiene plan, el campo no
  aparece y se conserva el ancla, como en un cambio de plan.
- **D5 — Por defecto, la fecha de inicio es MAÑANA** (hora de la plataforma). Vale para el form del
  custom y para el modal de primera asignación existente.
- **D6 — Tipo de cobro al asignar: `mensual` | `anual`.** Se elige en cada asignación (modal de
  asignación, primera y cambio, y form del custom con empresa). Se guarda en la empresa, junto al
  `plan_id`, con migración nueva; default `mensual` para filas existentes. Se registra en el
  historial y rastro de la asignación, como el resto de la asignación.
- **D7 — «Anual» se puede elegir siempre.** Monto del período anual: el anual fijo; si es descuento,
  mensual × 12 × (1 − %); si el plan no tiene anual, mensual × 12. Decimal exacto, dos decimales,
  sin coma flotante (patrón SLT-66 R19).
- **D8 — Siguiente cobro.** Mensual: ancla + n meses (el siguiente aniversario mensual ≥ hoy).
  Anual: ancla + n años. Solo informativo: NO escribe en `wallet_movimiento` ni en
  `cobro_plataforma_movimiento` (SL-24 D4, SLT-66 R21).
- **D9 — Dónde se muestra.** «Mi plan» y el detalle de empresa del superadmin muestran el tipo de
  cobro, el monto del período (D7) y la fecha del siguiente cobro. La lista de empresas muestra
  solo el tipo junto al plan. El costo por orden y el total estimado del ciclo de SLT-66 no cambian.

## Restricciones
- `servi_app` sigue sin acceso a `plan*`; la empresa lee por `plan_de_la_empresa` (SLT-66 R22). Si
  hay que exponer el tipo de cobro, va por esa lectura acotada.
- Solo superadmin escribe (`forbidden` sin llamar al repo, SL-24 R5).
- Las migraciones van con timestamp posterior a la última de `dev`.
- Ninguna dependencia nueva.
- No commitear `pnpm-lock.yaml` salvo que el cambio lo requiera (no debería).

## Estado
- [x] implementación (implementer → backend_dev + frontend_dev) — commits c37694d (backend), 702a97a (frontend)
- [x] tests actualizados y nuevos (D1–D9) — mapa en `progress/impl_ajuste-planes-custom.md`
- [~] gate local — subagentes: typecheck 0, lint 0 errores, related verdes (backend 2046, frontend 336),
  guardias rojas solo en `dependencias-declaradas-presentes` (está en `tests/baseline-rojos.json`).
  Mi re-verificación final NO es válida: `node_modules` es junction compartida y el cliente Prisma
  estaba regenerado por otra sesión con otro schema (27 errores de tipos ajenos: wallet, historial,
  `planTipoCobro`). El job de related + guardias lo paró el sistema por falta de memoria. Hay que
  repetirlo con un cliente Prisma propio de la rama, o dejarlo para el CI.
  Los tests de `tests/integration/db/` (migración, atomicidad D2, tipo_cobro) solo corren en CI.
- [x] tanda 2 (D10, D12, D13, D14) — 6ee33cd (backend), b243ee6 (frontend); D11 sin cambios, D15 textos aprobados
- [x] tanda 3 (D16, D17) — 37d1bbd (backend D16, migración `20261103120000_historial_accion_plan_tipo_cobro_cambiado`
  con down), 5b5c021 (frontend D17)
- [~] verificación tandas 2–3 (de los subagentes; sin regenerar Prisma por la junction compartida): lint 0 errores;
  related verdes (2422 backend, 122 frontend D17); guardias verdes salvo la del baseline; tsc sin errores en UI, y
  los de `lib/` son todos del cliente Prisma sin generar (incluido `plan_tipo_cobro_cambiado`). Integración db solo en CI.
- [ ] PR a `dev`

### Abierto tras la tanda 3
1. Etiqueta del historial general para D16: «Cambió el tipo de cobro del plan de una empresa» (la
   eligió backend_dev con el estilo de las demás). Confirmar texto.
2. Riesgo de intermitencia en CI: el test D14 de la tanda 2 (`tests/integration/db/planes-cambiar-tipo-cobro.test.ts`)
   ordena por `created_at` dos filas escritas en la misma transacción, que pueden empatar. Si sale
   rojo intermitente, desempatar el orden. El test de D16 ya no depende del orden.

## Abiertos cerrados por el humano (2026-11-03)
- **D10 (abierto 1)** — Se permite cambiar SOLO el tipo de cobro del plan actual. El detalle de empresa
  ofrece «Cambiar tipo de cobro». Guarda el tipo nuevo, deja rastro en el historial de asignaciones y
  recalcula el siguiente cobro. NO toca el ancla del ciclo ni los módulos. Mismo tipo = `ok` sin cambio
  y sin rastro. Solo superadmin.
- **D11 (abierto 2)** — Se queda como está: `inicioCiclo` solo en la primera asignación (SLT-58).
- **D12 (abierto 3)** — Al crear un custom con fecha, se muestran los `avisos` de topes ya pasados,
  igual que en el modal de primera asignación.
- **D13 (abierto 4)** — El form del custom muestra la vista previa de uso contra topes (SLT-58 R37) al
  elegir una empresa sin plan y una fecha, calculada con los topes que se están escribiendo en el form.
- **D14 (abierto 5)** — El historial de asignaciones muestra el tipo de cobro de cada fila; un cambio de
  solo tipo (D10) es una fila propia.
- **D15 (abierto 6)** — Textos nuevos de UI aprobados tal cual (lista en la bitácora).
- **D16** — Un cambio de solo tipo de cobro (D10) tiene acción PROPIA en el historial general
  («tipo de cobro cambiado», con antes y después), no `plan_asignado`. Va con migración nueva para el
  valor del enum y con la guardia de escrituras cubiertas al día.
- **D17** — Si la vista previa de topes del form del custom no carga, «Crear plan» queda bloqueado
  con el error y «Reintentar», igual que el modal (SLT-58 P11).
- Filas viejas del historial sin tipo de cobro se muestran «—» (aceptado). El texto de respaldo
  «hasta el inicio del siguiente ciclo» del aviso de D12 se acepta.

## Abierto (para el humano) — cerrados arriba como D10–D15
1. Asignar el MISMO plan con otro tipo de cobro: hoy `asignar` responde `cambio: false` y no guarda
   el tipo nuevo; la UI no ofrece el plan actual en el selector. ¿Se permite cambiar solo el tipo?
2. `inicioCiclo` al crear un custom para una empresa que YA tiene plan: hoy se rechaza (la UI no lo envía).
3. Los avisos de topes ya pasados (`avisos`) al crear un custom con fecha no se muestran; en el modal
   de primera asignación sí. ¿Se pintan también?
4. Vista previa de topes (R37) no está en el form del custom.
5. La tabla del historial de asignaciones no muestra el tipo de cobro (D9 no lo pide).
6. Textos nuevos de UI para revisar (lista en la bitácora, `## Frontend > ABIERTO` punto 5).
