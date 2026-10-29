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

## Preguntas abiertas
- Ruta y lugar en el menú de «Mi plan»: lo propone spec_author (ver requirements.md).

## Tandas

## Modelos (overrides)

## Cierre
