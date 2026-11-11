# SLT-128 — planes-cambios-por-periodo · requirements.md

> **Actualizado 2026-11-11 tras el corte (P3):** el título de la ficha es «Planes: el cambio programado del plan llega a cada empresa al inicio de su período». Quitar «De inmediato» del Alcance pasa a SLT-135; ver las filas P1–P6 de «Decisiones cerradas», que mandan sobre el sembrado.

> **Zona** backend · **Complejidad** high · **depends_on** SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes» (apilada sobre su rama) · **Rama** `feature/SLT-128-planes-cambios-por-periodo`
>
> **Alcance.** Al editar un plan desaparece la opción «De inmediato». El superadmin elige una fecha «A partir
> de» y cada empresa con ese plan recibe el cambio al inicio de su siguiente período de cobro que empiece en esa
> fecha o después. Vale para todo lo editable del plan: nombre, costo base, descuentos, cobro por orden, topes,
> módulos y periodicidad de órdenes. Los recordatorios por correo van a cada maestro, contados hasta la fecha de
> su empresa (sustituye SL-24 R42).
>
> **Lo que NO entra.**
> - El formulario por pasos dentro de un sheet: SLT-130 «Planes: formulario por pasos compartido en un sheet
>   (crear y editar)».
> - El borrador del plan guardado en el servidor por pasos: SLT-129 «Planes: borrador del plan guardado en el
>   servidor por pasos».
> - El cambio de plan de una empresa (de un plan a otro): ya lo resuelve SLT-118 R30.
>
> Sembrado por `/afinar-feature` el 2026-11-11. El bloque de Alcance y la tabla de «Decisiones cerradas» los
> fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente. `spec_author` (F1.2, 2026-11-11) devolvió **BLOQUEADO: no cabe en un PR**. Ver P3 en
«Preguntas abiertas»: los requisitos se escriben cuando el humano acepte el corte, y solo para la
primera rebanada._

## Preguntas abiertas

- **Cancelar el cambio de un plan.** ¿«Cancelar cambio» cancela solo lo que falta (las empresas que aún no lo
  recibieron) y deja intacto lo ya aplicado? Propuesta: sí.
- **Tope que baja por debajo del uso actual.** Si el cambio baja un tope (p. ej. mensajeros) por debajo de lo
  que una empresa ya usa al recibirlo, ¿qué pasa? Revisar el precedente de SL-24 («aviso de topes pasados») y
  proponerlo.
- **Tamaño.** Si no cabe en el tope del PR, el spec propone el corte.

### Respuestas y preguntas de `spec_author` (F1.2, 2026-11-11)

> Lo que ya existe, revisado antes de escribir: nada en `feature_list.json` ni en `specs/` aplica un cambio del
> plan por empresa. Hoy el plan tiene **una sola versión para todas sus empresas**: los topes (`plan_tope_rol`,
> `plan.tope_api_keys`), el cobro por orden (`plan.costo_por_orden*`), el nombre y la periodicidad de órdenes
> viven en la fila del plan, y los leen por `organizacion.plan_id` los triggers de topes, la tarifa del cobro por
> orden, `plan_de_la_empresa`, «Mi plan» y la apertura de facturas de SLT-118 «Planes: factura por empresa y
> período con la cuota y las órdenes». El cambio programado (`plan_cambio_programado`, un pendiente por plan)
> se aplica entero, a todas a la vez, en su fecha (SL-24 R38). **El precio ya va por período de cada empresa**
> (SLT-86 R15: rige desde el primer período de cada empresa que empieza en la fecha o después), así que el costo
> base y los descuentos ya cumplen la regla. Lo nuevo de fondo: durante la ventana entre guardar y que la última
> empresa lo reciba, empresas con el mismo plan corren versiones distintas (hasta tres, con un reemplazo: la
> vigente, la del primer cambio y la del segundo). Eso pide una versión del plan **por empresa** y que cada uno
> de esos lectores la lea. El grafo de código no tenía índice de este worktree: la búsqueda se hizo con Grep.

- **P1 · Cancelar el cambio cuando alguna empresa ya lo recibió** (responde «Cancelar el cambio de un plan»).
  Cancelar solo lo que falta deja el plan **partido para siempre**. Ejemplo: cambio desde el 16 de noviembre; la
  quincenal lo recibe el 16 y el 20 se cancela; la mensual se queda en la versión vieja y la quincenal en la
  nueva, sin ningún pendiente que las junte. Entonces el catálogo, una asignación nueva y el correo ya no saben
  cuál es «el plan». Propuesta: **«Cancelar cambio» solo mientras ninguna empresa lo haya recibido**, con el
  efecto de hoy (SL-24 R39, R45: se borra, correo de cancelación, fila de rastro). Si alguna ya lo recibió, se
  rechaza con un mensaje que pide programar otro cambio con los valores de antes, que reemplaza al pendiente
  (decisión «Varios cambios pendientes») y llega a cada empresa en su período. La otra salida es la propuesta
  del humano (cancelar lo que falta) aceptando el plan partido; entonces hace falta decidir qué versión muestra
  el catálogo y cuál recibe una empresa nueva. ¿Cuál?
- **P2 · Tope por debajo del uso al recibir el cambio** (responde «Tope que baja por debajo del uso actual»).
  Resuelta con precedentes, salvo que el humano diga otra cosa: SL-24 R16 (revisado el 2026-10-28) y SLT-58 R36,
  que SLT-86 R18 repite para los cambios de una empresa. Propuesta: el cambio **se guarda igual** y la respuesta
  avisa de cada empresa y tope que ya se pasa, con su uso y el tope nuevo; el correo al guardar y cada
  recordatorio de esa empresa lo dicen con el uso de ese momento (SL-24 R41, R42); al recibirlo, el tope pasado
  **no impide** aplicarlo, y desde ese instante se rechazan las altas de esa empresa que pasen el tope (usuarios
  del rol, API keys) hasta que su uso baje. Lo ya creado no se toca. ¿Vale?
- **P3 · Tamaño: no cabe en un PR** (responde «Tamaño»). `gate.tamano_pr` no está fijado en
  `arnes.config.json`, así que rige el de por defecto: 40 archivos, y el 80 % son 32. La feature entera suma unos
  **53 archivos**: unos 19 de producción (migración y su `down.sql`, `db/schema.prisma`, `PlanesRepository`,
  `IPlanesRepository`, `PlanesService`, `IPlanesService`, `lib/types/planes.ts`, `lib/planes/jobs-cambio-plan.ts`,
  `app/api/cron/procesar-jobs/route.ts`, `lib/modulos/reparto.ts`, `lib/planes/mensajes.ts`, `lib/planes/rastro.ts`,
  `lib/planes/consumo.ts`, la plantilla `lib/services/email/plantillas/cambio-plan.ts`, `MiPlanRepository`,
  `PlanForm.tsx`, `PlanDetalle.tsx` y `lib/actions/planes.ts`) y unos 34 tests. Más de la mitad de esos tests
  existen hoy y usan la edición «De inmediato» (`planes-edicion-en-uso`, `plan-costo-porcentual-escritura`,
  `planes-costeo-escritura`, `cobro-plataforma-plan`, `plan-descuento-periodo`, `plan-precio-historial`,
  `planes-asignacion`, los cinco `planes-service*`, los tres `planes-schema*`, cinco `PlanForm*` y dos E2E de
  planes). Propuesta de corte en **dos rebanadas** que se mergean solas, con `depends_on` encadenado:
  1. **SLT-128 (acotada): «Planes: el cambio programado del plan llega a cada empresa al inicio de su
     período»** (~29 archivos, 72 %). Trae la versión del plan por empresa (modelo, migración y los lectores),
     la recepción por empresa de todo lo editable con fecha (nombre, cobro por orden, topes, módulos y
     periodicidad; el precio ya cumple), un pendiente por plan con el reemplazo por empresa, archivar
     bloqueado a medias, el cierre de la factura que espera (SLT-118 R39) y los correos por empresa: al guardar
     con su fecha y los recordatorios 7/1, 3/1 o 1 contados hasta ella. La edición «De inmediato» **sigue** en
     esta rebanada, como hoy: aplica a todas las empresas a la vez. El producto queda funcionando: lo programado
     ya va por período; lo inmediato, igual que ahora.
  2. **Ficha nueva: «Planes: sin «De inmediato» al editar un plan»** (~25 archivos, depende de la 1). Toda
     edición pide «A partir de» `≥ hoy` en el servidor y en `PlanForm`, «hoy» sigue la regla de la rebanada 1
     (la recibe en el acto solo la empresa cuyo período empieza hoy), y se pasan a fecha los tests y los E2E que
     hoy editan en el acto.

  El corte inverso (primero quitar «De inmediato») obliga a reescribir dos veces los mismos tests: al quitarla
  «hoy» aplicaría a todas en el acto, y la rebanada siguiente cambiaría otra vez qué significa «hoy». ¿Se acepta
  el corte en dos? La otra salida es aceptar ~53 archivos en un PR, como SLT-118 aceptó 49 (P16).
- **P4 · Una empresa que entra al plan durante la ventana.** Una asignación, un custom o un cambio de plan
  pendiente hacia el plan que rige después de guardar el cambio. Propuesta, con la misma regla: si entra en la
  fecha «A partir de» o después, entra ya con la versión nueva; si entra antes, entra con la vigente y recibe la
  nueva al inicio de su primer período que empiece en esa fecha o después. Y una empresa del plan que cambia de
  tipo de cobro durante la ventana (SLT-118 R30): su fecha se recalcula con los períodos del tipo que tenga a
  partir de ese cambio. ¿Vale?
- **P5 · Cuándo pasa la versión nueva a ser «el plan».** El catálogo, el detalle y la vista previa de asignar
  muestran la versión del plan. Propuesta: la fila del plan pasa a la versión nueva **cuando la recibe la última
  empresa**; si el plan no tiene empresas, a las 00:00 de la fecha «A partir de» (como hoy, SL-24 R38). Mientras
  tanto el detalle sigue mostrando «Cambio programado» con la fecha elegida y, además, cuántas empresas ya lo
  recibieron. ¿Vale, o la pantalla debe listar la fecha de cada empresa (eso iría con SLT-130 «Planes: formulario
  por pasos compartido en un sheet (crear y editar)»)?
- **P6 · Reemplazo con empresas que ya recibieron el primer cambio.** La decisión dice «las que ya lo recibieron
  se quedan con él». Propuesta de lectura: no se les deshace, y **también reciben el cambio nuevo** al inicio de
  su siguiente período que empiece en la fecha nueva o después. Ejemplo de la decisión: la quincenal recibe
  «+10 000» el 16 de noviembre y el plan final el 1 de diciembre, igual que la mensual. Si no lo recibieran, el
  plan quedaría partido como en P1. ¿Vale?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-11 | Base de trabajo | **Apilada sobre la rama de SLT-118** (humano). Se rebasa si SLT-118 cambia. |
| 2026-11-11 | ¿Cuándo rige un cambio del plan? | Sin «De inmediato». El superadmin elige «A partir de» y cada empresa lo recibe al inicio de su siguiente período de cobro que empiece en esa fecha o después. Ejemplo: fecha 16 nov → la mensual el 1 dic, la quincenal el 16 nov (humano, ficha). El período de cada empresa se calcula como en SLT-118 R30 (`fechaDeEfectoPorDefecto` por su tipo de cobro). |
| 2026-11-11 | ¿Qué campos? | Todo lo editable del plan: nombre, costo base, descuentos, cobro por orden, topes, módulos y periodicidad de órdenes (esta última hereda SLT-118 R36). Hoy solo el precio va por período (SLT-86 R22); topes, módulos y cobro por orden tienen edición inmediata o fecha única (SL-24 R15/R37) (humano, ficha). |
| 2026-11-11 | Fecha mínima | `≥ hoy`, heredado de SLT-86 R22. |
| 2026-11-11 | Varios cambios pendientes del mismo plan | **Un solo pendiente por plan.** El cambio nuevo reemplaza al anterior para las empresas que todavía no lo recibieron; las que ya lo recibieron se quedan con él. Ejemplo: «+10 000» desde el 16 nov y luego «+5 000 más» desde el 21 nov → la mensual recibe solo el plan final el 1 dic (humano; ajusta SL-24 R39). |
| 2026-11-11 | Archivar un plan con un cambio a medias | **No se puede archivar** mientras quede alguna empresa sin recibir el cambio (humano; sustituye SL-24 R40). |
| 2026-11-11 | Correos | Siempre sale uno al guardar. Recordatorios contados hasta la fecha de cada empresa: más de 7 días → a 7 y a 1 día; de 4 a 7 días (7 incluido) → a 3 y a 1 día (ejemplo: se guarda el 11 y rige el 16 → correos el 11, el 13 y el 15); 3 días o menos → solo el de 1 día, si cae después de guardar (humano, ficha; sustituye SL-24 R42). |
| 2026-11-11 | ¿Por empresa o por plan? | **Por empresa**: cada maestro recibe sus recordatorios contados hasta su fecha (humano). Destinatarios, heredados de SL-24 P7. |
| 2026-11-11 | Cierre de la factura | El cierre espera a los cambios pendientes de cada empresa con efecto ≤ su fin: extiende SLT-118 R39 a toda edición del plan. |
| 2026-11-11 | E2E | No toca un flujo crítico de `docs/checkpoints-proyecto.md`; sin E2E propio salvo que el spec encuentre uno (los de planes existentes se ajustan si rompen). |
| 2026-11-11 | P3 · Tamaño | **Se parte en dos** (humano). Esta ficha queda como «Planes: el cambio programado del plan llega a cada empresa al inicio de su período» (~29 archivos): versión del plan por empresa, todo lo editable con fecha, reemplazo, archivar bloqueado, cierre que espera y correos por empresa. **«De inmediato» sigue como hoy en esta rebanada.** Quitarlo es SLT-135 «Planes: sin «De inmediato» al editar un plan» (depende de esta). SLT-130 depende de las dos. |
| 2026-11-11 | P1 · Cancelar con empresas que ya lo recibieron | **«Cancelar cambio» solo mientras ninguna empresa lo haya recibido** (efecto de hoy, SL-24 R39/R45). Si alguna ya lo recibió, se rechaza y se pide programar otro cambio con los valores de antes (humano). Sustituye la propuesta «cancela lo que falta» del sembrado. |
| 2026-11-11 | P6 · Reemplazo con empresas que ya recibieron el primero | Lo recibido no se deshace y **también reciben el cambio nuevo** en su siguiente período que empiece en la fecha nueva o después: al final todas quedan con la misma versión (humano). Precisa «Varios cambios pendientes». |
| 2026-11-11 | P2 · Tope por debajo del uso | Como hoy (SL-24 R16, SLT-58 R36): se guarda, la respuesta y los correos avisan por empresa; al recibirlo no se bloquea la aplicación y desde ahí se rechazan las altas que pasen el tope hasta que el uso baje; lo creado no se toca (humano). |
| 2026-11-11 | P4 · Empresa que entra al plan durante la ventana | Según la fecha: si entra en la fecha «A partir de» o después, con la versión nueva; si antes, con la vigente y recibe la nueva en su primer período que empiece en esa fecha o después. Si cambia de tipo de cobro, su fecha se recalcula con los períodos del tipo nuevo (humano). |
| 2026-11-11 | P5 · Cuándo la versión nueva es «el plan» | **Cuando la recibe la última empresa**; sin empresas, a las 00:00 de la fecha elegida. Mientras tanto el detalle muestra «Cambio programado» y cuántas empresas ya lo recibieron. La lista de fechas por empresa va con SLT-130 (humano). |
