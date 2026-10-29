# SLT-58 «Planes: gestión del superadmin y consumo de la empresa (UI)»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-58 | planes-superadmin-ui | fullstack | high | feature/SLT-58-planes-superadmin-ui | Camilo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-29): tarjeta tomada, worktree creado. Siguiente: F1.2 (spec).

## Evaluación
- zone fullstack: dos pantallas (superadmin y empresa) más lecturas de backend que faltan. Hoy la
  empresa solo lee `plan_cupo_ordenes`; faltan el plan, el uso por rol, las API keys y el reinicio
  del ciclo. El superadmin no tiene listado del catálogo ni detalle de plan.
- complexity high: dos superficies, lecturas nuevas con RLS y todas las actions de SL-24.
- Depende de SL-24 (done; PR #37 mergeado el 2026-10-29).
- Cruce de archivos: `archivos-en-vuelo.mjs` necesita el `tasks.md`; se repite en F2.0.

## Decisiones
- 2026-10-29: SL-26 cancelada. Empresas y módulos ya tienen pantalla; solo faltaban los planes,
  que pasan a esta ficha sin depender de SL-25.
- 2026-10-29: la empresa ve su consumo frente a cada tope (ej. «1.000 de 3.000 órdenes»,
  «se reinicia en 20 días», «10 de 10 mensajeros») y el costo de su plan.

- 2026-10-29: alcance acotado con `/afinar-feature` → `specs/SLT-58-planes-superadmin-ui/requirements.md`
  (tabla «Decisiones cerradas»).

- 2026-10-29: spec aprobado por escrito («aprobado»), con las 5 propuestas de spec_author
  (/mi-plan en menú propio, historial por plan + asignaciones por empresa, sin plan = «sin
  límites», lectura propia por `plan_de_la_empresa`, empresa A del fixture en el E2E).
- 2026-10-29: choque aceptado por el humano con SLT-51 (menu-visibility.ts, reparto.ts,
  menu-visibility.test.ts) y SLT-56 (reparto.ts), de Carlos Restrepo. SLT-58 solo añade líneas.
  Mismo dueño que SL-24/SLT-43 en `excepciones-aislamiento.ts` y `docs/architecture.md`: SLT-58 va primero.

## Preguntas abiertas
- Ruta y lugar en el menú de «Mi plan»: lo propone spec_author (ver requirements.md).

## Tandas
- 2026-10-29 · A (T1–T4) · 8f46b5e + merge dev f47c928 · init.sh: typecheck/lint/guardias OK; test:rapido 4699 verdes, 1 rojo nuevo `demo-qa.test.ts` por entorno (base local `logistic_slt58` sin `db:seed`: «faltan catálogos vehiculo»), no por el diff; lo confirma CI.
- 2026-10-29 · B (T5–T9) · e55265e · `db:seed` en `logistic_slt58` + init.sh: **init OK** (related 4878 verdes, guardias 4487 verdes). Revisión de diseño en curso (`progress/design_SLT-58.md`), sustituto de `/design`, que no existe.
- 2026-10-29 · Diseño (28 hallazgos + confirmación «Cambiar plan») · d764f01 · init.sh: 4866 verdes, 1 rojo `WalletMensajerosTabs.test.tsx` por timeout de 20 s bajo carga; solo pasa 4/4. El diff no toca wallet.

## Modelos (overrides)

## Cierre
