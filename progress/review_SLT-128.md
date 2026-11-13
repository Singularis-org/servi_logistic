# Review SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su período»

> Reviewer, 2026-11-12. Diff: `origin/feature/SLT-118-planes-facturar-periodo-en-curso...HEAD` (894cfe23), rama apilada
> sobre SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes». Ruta completa (backend, high, toca
> dinero y cola): correcta. PR borrador #132, base `feature/SLT-118-…`.
> Grafo: no se usó; Grep/Read sobre el worktree.

## Checklist

- [x] **Ruta**: completa, con requirements/design/tasks. Toca dinero (cuota, tarifa por orden) y la ruta es la completa.
- [x] **Trazabilidad R1–R27**: cada R tiene al menos un test con nombre que lo cita y aserciones de su caso (revisados
  los títulos y los cuerpos de R1, R5, R11, R13–R19, R21, R22, R24, R25). Mapa completo en `progress/impl_SLT-128.md`.
  R23 → `tests/unit/services/planes-service-periodo.test.ts` (existente, verde). Los de integración (R2–R4, R6–R10,
  R12–R20, R24–R26) **no se han ejecutado nunca** (ver B1).
- [ ] **Tasks**: T1–T8 `[x]`; **T9 sin marcar** («`./init.sh` verde; E2E de planes y grupo `dinero` en local»).
- [x] **Tamaño**: `node scripts/tamano-pr.mjs` → aviso, 92/40 contra la base del script; aceptado por el humano
  (`<!-- tamano-pr-aceptado -->` en `progress/features/SLT-128.md`, 35 archivos del diff real). Decidido, no es hallazgo.
- [x] **Lo que ya existe** (design.md): presente y concreto; el diff no re-crea nada de la lista (reusa
  `fechaDeEfectoPorDefecto`, `inicioDelPeriodoCalendario`, `aplicarEnTx`, `cambiarModulos`, `plan_precio_historial`).
- [x] **Typecheck**: `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → 0 errores.
- [x] **Lint**: `eslint` sobre los 37 `.ts/.tsx` del diff → exit 0.
- [x] **Guardias**: `pnpm run test:guardias` → 4 rojos, todos de `dependencias-declaradas-presentes.guardia.test.ts`,
  que está en `tests/baseline-rojos.json` (no es hallazgo); 4822 verdes.
- [x] **Tests del diff sin base**: 12 archivos (recepcion, procesar-jobs-plan-cambio, plantilla-cambio-plan,
  planes-service, planes-service-{lecturas,asignar-costo,costo-porcentual,periodo}, jobs-cambio-empresa,
  planes-repository-tipo-cobro, PlanDetalle, migracion-slt128 en disco) → 415 verdes, 5 saltados (los de base).
- [ ] **Integración, migración contra Postgres y E2E**: no corridos en local ni en CI (B1).
- [x] **Multi-empresa / RLS**: las dos tablas nuevas son de plataforma, `ENABLE ROW LEVEL SECURITY` sin políticas y
  `REVOKE ALL … FROM servi_app`; los lectores `plan_version_de`/`plan_tope_rol_de` con `REVOKE EXECUTE … FROM PUBLIC`.
  Columna `empresa_id` en vez de `organizacion_id`: decisión del humano (no es hallazgo). Las queries por empresa
  filtran por `empresa_id`/`organizacion_id`.
- [x] **Migración**: trae `down.sql`; se niega con versiones propias (R25) y repone las ocho funciones (la
  comparación literal en disco pasa en T2.3). No edita migraciones previas.
- [x] **Sin literales de país/moneda** en código nuevo; sin recursos de Ordenex; sin `console.log`; sin dependencias.
- [x] **Capas**: lógica en repositorio/servicio, el servicio deja pasar `cambio_a_medias`; payloads de la cola
  validados con zod (`recibeAtSchema`, `recordatorioDeEmpresaSchema`).
- [x] **Comentarios**: explican el porqué (orden de cerrojos, por qué se compara con el historial, por qué no se
  borran los trabajos viejos).
- [x] **Desvíos de T5/T6/T7** validados: P11 (R3 contra el historial en F) y P12 (fecha del correo cancelado)
  confirmados por el humano; `reemplazaA` solo si aún no la había recibido (coherente con R20); R19 «no se mueve si
  `recibe_at ≤ desde`» (extiende «mismo instante» al caso en que ya debía estar recibida: razonable); R18 promoción
  después del `UPDATE` de la empresa (necesario para R37); historiales separados por id en T7.1/T7.4 (arreglo de
  test, no de producción); T7.5 con segunda empresa para que el nombre salga de la versión propia (mejora la prueba).

## Hallazgos

- **B1 — BLOQUEANTE** (`docs/perfil-agentes.md > reviewer`: «PR que toca `db/`, pantallas o dinero sin constancia de
  los E2E afectados corridos en local»; `CHECKPOINTS.md` gate-completo; T9). Ni los E2E afectados
  (`e2e/planes-superadmin.spec.ts`, `planes-costeo`, `planes-costo-porcentual`, `mi-plan-cambiar-plan`,
  `cierre-modelo-nuevo-plan-porcentual` y el grupo `dinero`) ni los 9 archivos de integración (T2.3 con base, T7.1–T7.8)
  se han ejecutado: la migración nunca corrió contra Postgres. Además, **el CI de #132 no los va a correr**: `gate.yml`
  solo se dispara en PR a `dev`/`prod` (y no en borradores); la base de #132 es la rama de SLT-118, y su
  `statusCheckRollup` solo trae Vercel. Para levantarlo, sin tocar código: correr `gate` por `workflow_dispatch` sobre
  `feature/SLT-128-planes-cambios-por-periodo` (da `gate-completo` + `e2e`) o una base desechable local, y dejar la
  constancia en `progress/impl_SLT-128.md` (y T9 en `[x]`). Si algún caso de integración sale rojo, vuelve al
  implementer.
- **m1 — menor** (R11). `recibidas`/`total` cuentan solo filas de `plan_cambio_recepcion`: una empresa que entra al
  plan en F o después (R17, entra con la versión nueva, sin recepción) no figura en «N de M», aunque ya corre la
  versión nueva. El texto puede decir «1 de 1» con dos empresas en el plan. No contradice la letra de R11, pero
  conviene anotarlo para SLT-130 «Planes: formulario por pasos compartido en un sheet (crear y editar)» o una deuda.
- **m2 — menor** (R8/R9). Una recepción que falla por R8 (empresa quincenal asignada después que recibe órdenes
  mensuales) se queda sin recibir para siempre: el barrido horario la reintenta y falla cada hora, el plan no se
  promueve, no se puede archivar y `factura_plataforma_cerrar` deja de cerrar facturas de esa empresa desde esa
  recepción. Es lo que pide el spec («el plan espera»), pero no hay aviso ni salida operativa documentada. Anotar
  como deuda.
- **m3 — menor** (cola). Los trabajos `plan_aplicar_cambio`/`plan_recordatorio_cambio` de una recepción movida (R19)
  o de un pendiente reemplazado quedan encolados y terminan en no-op; es el diseño (§4), solo ruido en `jobs`.

## Veredicto

**RECHAZADO** — un solo bloqueante (B1): falta la constancia de integración, migración y E2E ejecutados; el CI de
#132 no los corre. No hay hallazgos de código bloqueantes en la lectura; si la corrida sale verde y se registra,
esta revisión pasa a OK sin otra vuelta de código.

## Cierre de B1 (2026-11-12, leader)
Condición de la vuelta 1 cumplida sin vuelta de código: gate a mano run 43262530746 sobre `ca3361e8` en verde (`gate-completo` y `e2e` con sus tres grupos). Por la regla de esta revisión («si todo sale verde, la revisión pasa a OK»), **veredicto: OK**. Quedan los menores m1–m3 para decisión del humano.

## Vuelta 2 (T10) — acotada a e2da5582..e8c9c86f (2026-11-12, reviewer)

Alcance: lo propio de SLT-128 desde la review OK (`666ac8b7..e8c9c86f`, 25 archivos fuera de `specs/`/`progress/`):
T10.1–T10.8 (R28, R29; m2, m3; P13–P17). El merge de `origin/dev` (666ac8b7) se trató solo por la colisión de
migraciones. No repetido (ya comprobado por el leader): gate en CI verde en run 43343522019 sobre e8c9c86f; tamaño
40 archivos con tope aceptado; P16 aceptado como residuo.

### Checklist
- [x] **Trazabilidad R28** → casos concretos, con aserciones reales: `planes-periodicidad-ordenes` («SLT-128 R8, R28»:
  marca en `plan_version_empresa` tras promover, recepción borrada en cascada, módulos/precio/empresa intactos, barrido
  vacío, segundo intento `sin_pendiente`, un aviso con `organizacionId` NULL y su payload); `planes-cambio-por-empresa`
  («R28, R10», «R28, R18, R15», «R28, R13»); `factura-plataforma-cambio-plan` («SLT-128 R28, R9»);
  `planes-version-por-empresa` («R12, R28»); `migracion-slt128-ida-y-vuelta` (los `CHECK`); `procesar-jobs-plan-cambio`
  (lista, vacía, inválidas/duplicados, fallo parcial, solo `no_aplicada` sin empresa); `plantilla-cambio-plan`
  (literales); `planes-service-lecturas`; `PlanDetalle.test.tsx` (con pendiente, tras promover, sin ninguna).
- [x] **Trazabilidad R29** → `planes-cambio-por-empresa` «R29 (R19)» (viejos `descartado` con motivo y clave NULL, los
  de la nueva fecha y los de la otra empresa intactos) y «R29 (R18)» (con ida y vuelta); `planes-cambio-programado`
  «SLT-128 R29 (R13, R14)» (con y sin empresa, legados, `processing` intacto, cancelar).
- [~] **Tasks:** T10.1–T10.8 `[x]`. T10.9 `[ ]`: es del leader (mapa ya está en la bitácora; falta anotar el run
  43343522019 y marcarla). Ver m6.
- [x] **Tamaño:** 40/40, tope aceptado en la ficha (no repetido).
- [x] **Lo que ya existe:** reutiliza `destinatariosDeLista` (extraído de `destinatariosReporteBug`), el estado
  `descartado` de SL-23 R20, el patrón de `encolarEnEmpresas` para `app.organizacion_id`, `componerCorreo`. Nada re-creado.
- [x] **Verificación ejecutable (local):** `vitest run` de `procesar-jobs-plan-cambio`, `plantilla-cambio-plan`,
  `PlanDetalle`, `planes-service-lecturas` y `reporte-bug-config`: 5 archivos, 154/154 verdes. Integración contra
  Postgres: la cubre el run de CI ya comprobado.
- [x] **Migraciones con el mismo timestamp:** por nombre, `20261114120000_pago_independiente_efectivo` (dev) va antes
  que `20261114120000_plan_cambio_por_empresa`. La de dev solo añade `cierre_dia.pago_independiente_efectivo`
  (`BOOLEAN NOT NULL DEFAULT false`); la de SLT-128 no toca `cierre_dia` ni nada de cierres, y la de dev no toca planes
  ni facturas de plataforma: sin dependencias en ningún sentido, el orden da igual. La edición de la de SLT-128 (P14)
  es válida porque no está en `dev`: tras el merge ninguna base de `dev` la tendrá con el checksum viejo. `down.sql`
  sigue bastando (borra las tablas con sus columnas nuevas).

### Desvíos declarados
1. **`AvisoNoAplicadaPlan` aparte** (design §14.4 decía ampliar `tipoAvisoSchema`/`AvisoCorreoPlan`): **aceptado.** El
   payload no comparte forma con el de los maestros (sin `vigenteDesde`, `cambios`, `topesPasados`; con empresa, plan y
   motivo), y el esquema propio deja que solo `no_aplicada` vaya sin empresa y que cualquier otro sin empresa falle como
   antes (lo prueba «solo `no_aplicada` va sin empresa»). `dedupeAviso` acepta la unión. Falta reflejarlo en el design (m4).
2. **`DetallePlan.noAplicadas?` opcional:** aceptable, menor (m5). `DetallePlanLeido.noAplicadas` sí es obligatorio y el
   servicio lo rellena siempre; la pantalla hace `?? []`. Lo opcional solo ahorra tocar dobles; el riesgo (un camino
   que olvide rellenarlo y esconda el aviso sin error de tipos) es bajo con un solo productor.
3. **Ida y vuelta de R29 con salir y volver:** **aceptado.** Lo que R29 exige es que una fecha cancelada vuelva a
   encolar; eso depende de que `descartarTrabajos` libere la clave (`dedupe_key = NULL`) y de que el re-encolado pase
   por `fijarRecepciones`, que es la misma función que usa `moverRecepcionEnTx`. El test afirma las mismas claves
   pendientes otra vez y los tres descartados conservados. El literal del spec en R29 («ida y vuelta de la fecha»)
   dice mover; el caso de mover-y-volver no está, pero el mecanismo cubierto es el mismo (menor, sin acción).
4. **Promover excluye a las no aplicadas de la regla mensual/quincenal:** **correcto y necesario.** R28 manda que la no
   aplicada cuente como resuelta para promover (R10, R18); sin la exclusión, `promoverEnTx` lanzaría por la misma
   empresa que se acaba de marcar y el plan quedaría como en m2. La exclusión es por `cambio_id` del pendiente y solo
   para empresas con `no_aplicada_at`; esas conservan su versión quincenal en `plan_version_empresa` (la leen los
   triggers y la factura), así que la cuota del 16 sigue teniendo factura. Cualquier otra quincenal sigue frenando.
5. **Encolado sin empresa con `app.organizacion_id = ''` y reposición:** **correcto.** El `DEFAULT` de
   `jobs.organizacion_id` es `NULLIF(current_setting('app.organizacion_id', true), '')`: con `''` el aviso nace NULL
   (trabajo de plataforma, no visible para ninguna empresa con la política `jobs_por_empresa`). `set_config(..., true)`
   es local a la transacción y se repone el valor previo antes de seguir, así que lo que `recibirCambio` escribe
   después (promoción) no cambia de empresa; es el mismo patrón que `encolarEnEmpresas`. `recibirCambio` corre en
   `comoPlataforma` (sin `role servi_app`), así que el `WITH CHECK` de la política no aplica; si algún día corriera
   como `servi_app`, el INSERT fallaría a la vista, no filtraría datos. El test lo cubre fijando la empresa antes y
   afirmando `organizacionId` NULL.
6. **Log `[lista-de-correos] <VARIABLE>`** en vez de `[reporte-bug] BUG_REPORT_EMAILS`: aceptable. Sigue sin
   direcciones, nombra la variable (distingue las dos listas) y no hay en el repo ni test ni doc que dependa del
   prefijo viejo (búsqueda vacía). Si hay una alerta de logs fuera del repo filtrando por `[reporte-bug]`, el humano
   lo sabrá: no es verificable desde aquí.

### Hallazgos
- **m4 — menor.** design §14.4 sigue diciendo «`no_aplicada` en `tipoAvisoSchema` y `AvisoCorreoPlan`»; el código usa
  `AvisoNoAplicadaPlan` con esquema propio. Actualizar el design al cerrar.
- **m5 — menor.** `DetallePlan.noAplicadas` opcional (desvío 2). Se puede volver obligatorio cuando se toquen los dobles.
- **m6 — menor (del leader).** T10.9 sin `[x]` y sin la constancia del run 43343522019 en `progress/impl_SLT-128.md`.
  Cerrarla antes del aviso de merge.

Ningún bloqueante.

### Veredicto vuelta 2
**OK** — R28 y R29 trazados a tests con aserciones reales y verdes en CI; los seis desvíos son correctos o
aceptables; las dos migraciones `20261114120000_*` son independientes. Quedan m4–m6 como menores.
