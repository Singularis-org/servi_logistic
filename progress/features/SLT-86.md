# SLT-86 «Planes: período de facturación quincenal, mensual, bimestral o anual»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-86 | planes-periodo-facturacion | fullstack | high | feature/SLT-86-planes-periodo-facturacion | Camilo | done |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
done (2026-11-06): PR #88 mergeado en dev (553025c4), gate-completo verde.

## Evaluación
- zone fullstack: modelo del plan y del ciclo (base y `lib/planes/ciclo.ts`), migración y pantallas de planes.
- complexity high: cambia la regla de ciclo de SL-24/SLT-58 (tope de órdenes, ciclo corto) y migra planes.
- 2026-11-05 · Cambios del humano tras el primer spec: períodos de calendario (1-15/16-fin, mes, bimestre, año), tramo inicial proporcional, sin tope de órdenes, migración con tramo desde el día de la migración, P4 = nada rige hasta la fecha de efecto (se retira el ciclo corto), 9 propuestas aprobadas. Todo en requirements.md.
- Cruce: SLT-83 (mía, PR #79) toca los mismos archivos de planes; depende de ella. Integrar dev tras su merge.

## Decisiones
- 2026-11-05 · Alcance y decisiones → `specs/SLT-86-planes-periodo-facturacion/requirements.md`.
- 2026-11-05 · spec_author bloqueó: ya existía el tipo de cobro por empresa (PR #72). Humano: el período vive en la empresa, descuento en el plan por período, migración sin perder nada. Requirements y tarjeta enmendados.
- 2026-11-05 · (humano, tras T1) Empresa sin plan con primera asignación pendiente: «Mi plan» muestra «Sin límites» y debajo «{Plan} empieza a regir el {fecha}»; el detalle de empresa del superadmin igual. R26 aplica también sin plan.
- 2026-11-05 · (humano, tras T9) Aceptadas: migración extra `20261106140000_plan_aplicar_cambio_empresa_enum` y edición del censo de `historial-accion-escrituras-cubiertas`. Historial: una línea por dato del precio («sin descuento» para el lado vacío). Textos de SLT-83 pasan a «Cobrado en el período» y «Total del período hasta hoy». Mismo plan con otro tipo = solo cambia el tipo, sin revisar topes. «Cancelar cambio» SÍ deja fila «cambio cancelado» (quién, cuándo, qué cambio). `docs/architecture.md` 202/227/229 se corrige en esta feature. Resto de reglas de backend_dev aceptadas por el leader por coincidir con propuestas ya aprobadas.

- 2026-11-06 · (humano, tras T12) «Costo del ciclo», «Órdenes del ciclo: …», «Total estimado del ciclo: …» y «Órdenes del ciclo sin estado final: …» pasan a «período». Aprobados los recortes de los modales «Cambiar plan» y «Cambiar tipo de cobro». «Cancelar cambio» pide confirmación con modal («¿Cancelar el cambio a {plan} programado para el {fecha}?»). En el detalle de empresa, `sin_cambio_programado` dice «La empresa ya no tiene un cambio pendiente.». El resto de avisos de forma de T10–T12 los acepta el leader.

- 2026-11-06 · (humano, tras T13) «Inicio del ciclo de órdenes» pasa a «Inicio del período». Botones del modal de «Cancelar cambio»: «Cancelar cambio» (destructive) / «Volver». El tramo proporcional no lleva E2E: basta con los tests unitarios y de base.

- 2026-11-06 · F2.2 vuelta 1 (9783b759): OK, 0 bloqueantes, 5 menores. Humano: m4 → la vista previa del costo usa el precio a la fecha de efecto (plan_precio_historial); m5 → se deja (R27, el aviso «empieza a regir» ya muestra la fecha). Leader: m2 y m3 se corrigen; m1 se anota como deuda (−06:00 fijo hasta SL-21).

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-05 · T0 (merge dev con SLT-83) + T1 (migración 20261106120000, esquema) · 229ddce1, 0999df40, e0362b2c, 77e62f60 · ida y vuelta 15/15 en servi_logistic_slt86; guardias de esquema 70/70; typecheck con 48 errores ESPERADOS (columnas retiradas, los cierran T4/T8/T9). T1 ya reescribe plan_de_la_empresa.
- 2026-11-05 · T2 (tipos/zod) + T3 (período de calendario SQL y TS, migración 20261106130000, R26 sin plan en plan_de_la_empresa) + T4 (retira tope de órdenes) · d6879c14, 8beddc35, b3f9daea, 5b7361c7 · planes-schema-periodo 47/47, ciclo-periodo 117/117, plan-ciclo-periodo 108/108, T4 573/573; guardias: solo el rojo del baseline. Typecheck 277 errores ESPERADOS en 67 archivos, todos dentro de «Archivos esperados» (verificado por el leader): los cierran T5–T12. Aviso: docs/architecture.md:231 nombra funciones retiradas (inicioDelCicloEnCurso, _fixtures/ciclo-corto.ts) → ajustar antes del PR.
- 2026-11-05 · T5–T9 (costo/tramo, costeo/consumo, rastro/mensajes, cambios de empresa con fecha + job, precio con fecha e historial, lecturas) · a226affb…51880c5b · 60 archivos en verde (221 + 919 casos), guardias de esquema 184/184, test:guardias solo el rojo del baseline; typecheck 121 errores, todos de T10–T13. Aviso: `plan-de-la-empresa-porcentual` R25 (SLT-83) inestable en corrida conjunta, fuera del baseline.

- 2026-11-05 · «Cancelar cambio» con historial + docs + T10–T12 (formulario, catálogo/detalle/empresa, Mi plan/consumo/lista) · 0d7550b5, 1c63f8ce, ac39059b, dc3fa6fa, 3033a6a1 · 378/378 en 27 archivos; typecheck 8 errores, todos en `e2e/` (T13). El agente se cortó antes de T13.
- 2026-11-06 · Ajustes de textos (período, modal de «Cancelar cambio», aviso de empresa) + T13 · 983a3bf2, 782c82b3 · typecheck 0; vitest 225/225 UI + 27/27 mensajes; test:guardias solo el rojo del baseline; E2E de planes 35/35 en dos corridas sobre servi_logistic_slt86_e2e. `next build` necesita NODE_OPTIONS=--max-old-space-size=8192.
- 2026-11-06 · «Inicio del período» + texto de validación + adapta 5 tests rezagados (esquemas, tipo-cobro, deuda-plataforma-plan) · c3ed2864, 03cf33d9, 9d37d387 · typecheck 0; E2E planes 27/27; barrido por lotes de plan/cobro/consumo (~480 archivos): solo rojos del baseline. F2.2 reviewer lanzado.

- 2026-11-06 · m1–m4 de la revisión (0cb9a47d, 539a9622, af875b61) + merge de origin/dev (a7c04dde, sin conflictos) · PR #88 abierto; `gate-completo` VERDE en CI (vitest 3/3, e2e aislamiento/dinero/reparto, estático). Espera merge humano.

## Modelos (overrides)

## Cierre
- 2026-11-06 · PR https://github.com/Singularis-org/servi_logistic/pull/88 mergeado por el humano en dev (553025c4). `gate-completo` verde: 245 rojos, todos en el baseline de 245; e2e aislamiento/dinero/reparto en verde.
- Resumen: período de cobro de calendario por empresa (quincenal 1–15/16–fin, mensual, bimestral, anual; corte 00:00 Costa Rica), primer tramo proporcional, sin tope de órdenes, descuentos por período en el plan (reemplazan al pago anual), cambios de empresa con fecha de efecto y job `plan_aplicar_cambio_empresa`, «Cancelar cambio» con modal y fila en el historial, precio del plan con fecha (`plan_precio_historial`), ciclo corto retirado. 4 migraciones con down.sql.
- Revisión F2.2: OK con 0 bloqueantes; m1–m4 resueltos, m5 queda por decisión del humano (R27).
- Deuda que deja: −06:00 fijo en la migración 20261106120000, a revisar con SL-21 (design §13). Vigilar `plan-de-la-empresa-porcentual` R25 (SLT-83): inestable en corridas conjuntas locales, en CI pasó.
- Baseline: el run de CI no lista entradas del baseline que ya pasen (245 de 245); no hay nada que podar.
- Worktree: `wt.sh done` quitó el registro de git; la carpeta `.worktrees/SLT-86-planes-periodo-facturacion` quedó con archivos en uso (Windows) y se borra a mano. Bases locales `servi_logistic_slt86` y `servi_logistic_slt86_e2e` pendientes de borrar con autorización.
