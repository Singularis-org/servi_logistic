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
- [ ] PR a `dev`

## Abierto (para el humano)
1. Asignar el MISMO plan con otro tipo de cobro: hoy `asignar` responde `cambio: false` y no guarda
   el tipo nuevo; la UI no ofrece el plan actual en el selector. ¿Se permite cambiar solo el tipo?
2. `inicioCiclo` al crear un custom para una empresa que YA tiene plan: hoy se rechaza (la UI no lo envía).
3. Los avisos de topes ya pasados (`avisos`) al crear un custom con fecha no se muestran; en el modal
   de primera asignación sí. ¿Se pintan también?
4. Vista previa de topes (R37) no está en el form del custom.
5. La tabla del historial de asignaciones no muestra el tipo de cobro (D9 no lo pide).
6. Textos nuevos de UI para revisar (lista en la bitácora, `## Frontend > ABIERTO` punto 5).
