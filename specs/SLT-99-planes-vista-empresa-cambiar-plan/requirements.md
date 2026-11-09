# SLT-99 — planes-vista-empresa-cambiar-plan · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **Ruta:** completa (toca el cobro) · **depends_on:** — · **Rama:** feature/SLT-99-planes-vista-empresa-cambiar-plan
>
> **Alcance.** En «Mi plan», el maestro ve su plan activo (uso de la plataforma, costo por orden,
> período y renovación, uso de usuarios y API keys, módulos) y un carrusel con los planes públicos y
> la tarjeta «Plan a la medida». Al tocar una tarjeta ve sus detalles (precio por período de cobro y
> comparación con su plan). Puede cambiar a otro plan público: el cambio queda pendiente y rige en
> el próximo corte (1 o 16 del mes); puede cancelarlo o reemplazarlo antes. El listado y los
> detalles quedan como componentes compartidos, reutilizables sin empresa.
>
> **Lo que NO entra.** La solicitud que envía «Contáctanos» al superadmin → SLT-117 (el botón se
> ve, pero su envío llega con esa ficha). La página pública de planes, su renderizado estático y la
> compra en la inscripción → SLT-116. Cambiar el tipo de cobro de la empresa (lo hace el
> superadmin, SLT-86). Topes de órdenes (no existen).
>
> Sembrado por `/afinar-feature` el 2026-11-09. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-09. Amplían SLT-58 (R1–R8 de «Mi plan») y **sustituyen SLT-58
> R11** («Mi plan» es solo información): desde aquí «Mi plan» ofrece cambiar de plan. Reutilizan el cambio
> de empresa pendiente de SLT-86 (R17–R20, R26) sin tocar sus reglas. Cada requisito nombra su test; las
> rutas están en `tasks.md > Archivos esperados` y el detalle en `design.md`. Los marcados **[P<n>]**
> llevan una propuesta del spec que el humano confirma al aprobarlo (ver «Preguntas abiertas»).
>
> **Glosario.**
> - *Maestro*: el único rol de `ROLES_MI_PLAN` (SLT-91).
> - *Corte*: las 00:00 de la plataforma (hora de Costa Rica, SLT-58 P8) del día 1 o 16 de un mes.
> - *Próximo corte*: el primer corte estrictamente posterior a «ahora» (R10).
> - *Plan disponible*: un plan `publico`, no archivado y con costo concreto (SLT-66 R28: costo base con
>   forma «monto» y costo por orden fijo o porcentual).
> - *Pendiente del maestro*: el cambio de empresa pendiente (SLT-86) que programó un usuario de la misma
>   empresa. *Pendiente de plataforma*: el que programó el superadmin.
> - *Usuarios* de un plan: la suma de los topes de `admin`, `mensajero`, `adminTienda` y `adminSatelite`;
>   «Sin tope» si alguno de esos roles no tiene tope.

### Quién y sobre qué empresa

- **R1** — SI quien pide ver los planes disponibles, cambiar de plan o cancelar un cambio no es el maestro
  (otro rol de empresa, el superadmin o una petición sin sesión), ENTONCES el servicio DEBE responder
  `forbidden` sin llamar a ningún repositorio, y la página `/mi-plan` DEBE seguir respondiendo «no
  encontrado» (SLT-58 R8).
  *Test:* `tests/unit/services/mi-plan-cambio-service.test.ts` (un caso por rol, superadmin y `null`, con el
  repositorio espía sin llamadas), `tests/integration/mi-plan-page.test.tsx`.
- **R2** — La empresa sobre la que actúan ver, cambiar y cancelar DEBE ser la de la sesión del maestro. SI la
  petición de cambio trae algo distinto de `{ planId }` o la de cancelar algo distinto de `{}` (por ejemplo
  un `organizacionId`), ENTONCES el sistema DEBE responder `validation_error` sin escribir. Un cambio o una
  cancelación del maestro de la empresa A NO DEBE modificar nada de la empresa B.
  *Test:* `tests/unit/services/mi-plan-cambio-service.test.ts` (zod estricto),
  `tests/integration/db/mi-plan-cambiar-plan.test.ts` (dos empresas: las columnas `plan_cambio_*` y el
  historial de B no cambian).

### Lo que ve el maestro

- **R3** — MIENTRAS la empresa tenga plan, «Mi plan» DEBE mostrar el plan activo con: su nombre y el chip
  «Activo» junto a él; «Uso de la plataforma» con el tipo de cobro y el costo base del período en curso
  (SLT-86 R27); «Costo por orden» (fijo o porcentual, SLT-83); el período en curso; «Se renueva el» con el
  siguiente cobro (SLT-86 R27); el uso de «Usuarios» y de «API keys» con su barra; y los módulos uno por
  uno, con ícono e «Incluido» o «No incluido». Los importes van sin símbolo de moneda (SLT-58 D26).
  *Test:* `tests/components/MiPlanModule.test.tsx`.
- **R4** — «Usuarios» DEBE ser, para el tope, la suma de los topes de los cuatro roles con tope del plan, o
  «Sin tope» si alguno no lo tiene; y para el uso, la suma de los usuarios activos de esos cuatro roles. El
  modelo de datos NO DEBE cambiar.
  *Test:* `tests/unit/planes/planes-vista.test.ts`.
- **R5** — «Mi plan» DEBE mostrar, en el carrusel de `components/ui/carousel.tsx`, una tarjeta por cada plan
  disponible, en el orden del catálogo, y al final la tarjeta «Plan a la medida». Cada tarjeta de plan DEBE
  mostrar nombre, precio de la vista elegida (R6), «Uso de la plataforma», «Costo por orden», «Usuarios»,
  «API keys» y los módulos uno por uno con ícono; el chip «Activo» solo en la del plan de la empresa; y NO
  DEBE mostrar el chip «Público» ni un botón «Ver detalles» (la tarjeta entera se toca). Un plan archivado,
  custom o sin costo concreto NO DEBE salir como tarjeta.
  *Test:* `tests/unit/services/mi-plan-cambio-service.test.ts` (el filtro),
  `tests/components/CarruselDePlanes.test.tsx`.
- **R6** — El carrusel DEBE tener un selector «Mensual» / «Anual», con «Mensual» al entrar. En «Mensual» cada
  tarjeta DEBE mostrar el costo base mensual con su descuento mensual y NO DEBE mostrar insignia. CUANDO el
  maestro elige «Anual», cada tarjeta DEBE mostrar el costo base del año con su descuento anual (SLT-86 R9,
  R10) y, solo si el plan tiene descuento anual, la insignia circular con el porcentaje. Los casos «sin cuota»
  y descuento anual en monto fijo siguen la propuesta **[P1]**.
  *Test:* `tests/unit/planes/planes-vista.test.ts`, `tests/components/CarruselDePlanes.test.tsx`.
- **R7** — MIENTRAS la empresa no tenga un plan custom activo, la tarjeta «Plan a la medida» DEBE mostrar su
  texto y el botón «Contáctanos»; DONDE quien monta el carrusel no le pasa la acción de contacto (la trae
  SLT-117 «Planes: solicitud de plan a la medida desde Contáctanos»), el botón DEBE verse deshabilitado
  **[P7]**. MIENTRAS la empresa tenga un plan custom activo, esa tarjeta DEBE ser su plan activo: con su
  nombre, el chip «Activo», sus datos como en R5 y sin «Contáctanos».
  *Test:* `tests/components/CarruselDePlanes.test.tsx`.
- **R8** — CUANDO el maestro toca una tarjeta, «Mi plan» DEBE mostrar el detalle de ese plan con:
  - la tabla «Uso de la plataforma según el período de cobro»: los cuatro períodos con su descuento, lo que
    se paga por período y lo que equivale por mes, con el tipo de cobro de la empresa resaltado;
  - la comparación concepto por concepto con el plan activo: «Uso de la plataforma», «Costo por orden»,
    «Usuarios», «API keys» y cada módulo;
  - en la tarjeta del plan activo, «Activo desde», el período en curso y el próximo cobro, sin botón de
    cambio;
  - en otra tarjeta, «Cambiar a {plan}» solo si la empresa puede cambiar (R17, R18).
  *Test:* `tests/components/DetalleDePlan.test.tsx`, `tests/components/MiPlanCambioDePlan.test.tsx`.
- **R9** — El carrusel y el detalle DEBEN vivir en `components/shared/planes/` y recibir por props los planes,
  el plan activo con su uso (opcional) y las acciones (opcionales). NO DEBEN importar de `lib/actions`,
  `lib/services`, `lib/repositories`, `lib/auth`, `lib/db`, `next/headers` ni `app/`, ni recibir un
  `organizacionId`. Montados sin plan activo ni acciones (el uso de SLT-116 «Planes: página pública de planes
  para elegir en la inscripción»), DEBEN mostrar las tarjetas y el detalle sin chip «Activo», sin columna de
  comparación y sin botones de cambio.
  *Test:* `tests/unit/guards/planes-compartidos-sin-empresa.guardia.test.ts`,
  `tests/components/CarruselDePlanes.test.tsx`, `tests/components/DetalleDePlan.test.tsx`.

### Cambiar de plan

- **R10** — El próximo corte DEBE ser, en la hora de la plataforma, el día 16 del mes en curso si hoy es del 1
  al 15, o el día 1 del mes siguiente si hoy es del 16 en adelante, siempre a las 00:00 y nunca hoy. DEBE ser
  el mismo para todas las empresas, sea cual sea su tipo de cobro.
  *Test:* `tests/unit/planes/proximo-corte.test.ts` (el 1 a las 00:00, el 15 a las 23:59:59.999, el 16 a las
  00:00, el 31 de diciembre, febrero de 28 y de 29 días).
- **R11** — CUANDO el maestro confirma el cambio a un plan disponible distinto del activo, el sistema DEBE
  guardarlo, sin aprobación del superadmin, como el cambio pendiente de la empresa (SLT-86): el plan elegido,
  el tipo de cobro **vigente** de la empresa y como fecha de efecto el próximo corte, y responder `ok` con esa
  fecha. Hasta las 00:00 del corte la empresa DEBE seguir exactamente como estaba (SLT-86 R17). Guardarlo NO
  DEBE escribir en `wallet_movimiento` ni en `cobro_plataforma_movimiento` (SLT-86 R14).
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts`.
- **R12** — SI el plan pedido no es un plan disponible (no existe, está archivado, es custom —de esta empresa
  o de otra— o no tiene costo concreto, también en la versión de su cambio programado), ENTONCES el sistema
  DEBE responder `no_disponible` sin escribir.
  *Test:* `tests/unit/services/mi-plan-cambio-service.test.ts`, `tests/integration/db/mi-plan-cambiar-plan.test.ts`.
- **R13** — SI la empresa tiene hoy más usuarios activos de algún rol con tope o más API keys activas de las
  que permite el plan pedido, ENTONCES el sistema DEBE rechazar el cambio con `tope_excedido` sin escribir
  nada, también con fecha futura (a diferencia del superadmin, SLT-86 R18), y con un aviso que diga, por cada
  tope pasado, cuántos sobran **[P4]**. El detalle del plan DEBE mostrar ese mismo aviso antes de confirmar.
  La comprobación DEBE hacerse bajo el cerrojo de la empresa.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts`, `tests/unit/planes/planes-vista.test.ts`
  (el texto), `tests/components/DetalleDePlan.test.tsx` (el aviso previo).
- **R14** — CUANDO llegan las 00:00 del corte, el pendiente del maestro DEBE aplicarse como cualquier
  pendiente de SLT-86 R20: plan nuevo, tipo vigente, módulos del plan nuevo, entrada en el corte y la fila
  `plan_asignado` del historial firmada por el maestro. SI entre la petición y el corte la empresa pasó un
  tope del plan nuevo, ENTONCES el cambio DEBE aplicarse igual y desde entonces rige SLT-58 R36. El período
  que abre el corte DEBE ser el de SLT-86 R17: si el corte no es el inicio de un período de calendario del
  tipo de la empresa, un tramo hasta su fin con costo proporcional (SLT-86 R12) **[P2]**. Sin prorrateo: el
  plan actual rige hasta el corte y el nuevo desde el corte.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts` (aplicar con el reloj en el corte: quincenal sin
  tramo; mensual con corte el 16 → tramo del 16 a fin de mes).
- **R15** — MIENTRAS la empresa tenga un pendiente del maestro, CUANDO el maestro pide otro plan disponible, el
  sistema DEBE reemplazar el pendiente por el nuevo, con el próximo corte como fecha, sin escribir historial
  (SLT-86 R19); y CUANDO pide su plan activo, DEBE cancelar el pendiente con la fila de R16.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts` (el trabajo del pendiente reemplazado no
  aplica nada al correr).
- **R16** — CUANDO el maestro confirma «Cancelar cambio» de un pendiente suyo, el sistema DEBE quitar el
  pendiente y escribir en la misma transacción la fila `plan_cambio_empresa_cancelado` con el maestro como
  actor (SLT-86 R19). SI no hay pendiente, ENTONCES DEBE responder `sin_cambio_programado` sin escribir.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts`, `tests/unit/services/mi-plan-cambio-service.test.ts`.
- **R17** — MIENTRAS la empresa tenga un pendiente de plataforma, «Mi plan» DEBE mostrarlo («Desde el {fecha}:
  {plan} · {tipo}», SLT-86 R26) sin ofrecer «Cambiar a {plan}» ni «Cancelar cambio», y un cambio o una
  cancelación del maestro DEBEN responder `pendiente_de_plataforma` sin escribir **[P3]**.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts`, `tests/components/MiPlanCambioDePlan.test.tsx`.
- **R18** — MIENTRAS la empresa no tenga plan, «Mi plan» DEBE mostrar el carrusel sin «Cambiar a {plan}», y un
  cambio pedido DEBE responder `sin_plan` sin escribir **[P5]**.
  *Test:* `tests/unit/services/mi-plan-cambio-service.test.ts`, `tests/components/MiPlanCambioDePlan.test.tsx`.

### La pantalla del cambio

- **R19** — CUANDO el maestro pulsa «Cambiar a {plan}», «Mi plan» DEBE pedir confirmación con «¿Cambiar a
  {plan}?», la fecha del próximo corte y el primer período (o tramo) que abrirá el cambio con su costo base,
  calculado con el precio que regirá en el corte (SLT-86 R15, R25), y SIN opción de elegir la fecha. CUANDO
  el cambio se guarda, la pantalla DEBE refrescarse y mostrar el pendiente («Desde el {corte}: {plan} ·
  {tipo}») con «Cancelar cambio», que también pide confirmación.
  *Test:* `tests/components/MiPlanCambioDePlan.test.tsx`.
- **R20** — CUANDO el servicio responde `tope_excedido`, `no_disponible`, `pendiente_de_plataforma`,
  `sin_plan` o `sin_cambio_programado`, «Mi plan» DEBE mostrar el texto de ese rechazo
  (`design.md > §6`) y NO DEBE mostrar un pendiente que no se guardó.
  *Test:* `tests/components/MiPlanCambioDePlan.test.tsx`.
- **R21** — Los requisitos de SLT-58, SLT-66, SLT-83, SLT-86 y SLT-91 sobre «Mi plan» DEBEN seguir en verde,
  salvo SLT-58 R11, que este spec sustituye. El consumo y el costeo del período (`ConsumoDelPlan`) siguen en
  «Mi plan» según **[P8]**.
  *Test:* `tests/components/MiPlanModule.test.tsx` (el caso de SLT-58 R11 se reescribe a R19),
  `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` (existente, sin cambios), `./init.sh` y el gate
  de CI (`gate-completo`).
- **R22** — Un E2E DEBE recorrer: el maestro entra a «Mi plan», ve su plan activo, cambia a otro plan público,
  ve el pendiente para el próximo corte y lo cancela; y un `admin` de la misma empresa sigue recibiendo «no
  encontrado» en `/mi-plan`.
  *Test:* `e2e/mi-plan-cambiar-plan.spec.ts`.
- **R23** — La feature NO DEBE añadir dependencias: el carrusel es el de shadcn que ya está
  (`embla-carousel-react`, aprobada).
  *Test:* `tests/guards/guard-dependencias-aprobadas.test.ts` (existente), `./init.sh`.

## Mapa decisiones → requisitos

| Decisión cerrada | R |
|---|---|
| Diseño aprobado (carrusel, tarjeta clickeable, chip «Activo», insignia solo en anual, módulos con ícono, «Uso de la plataforma» y «Costo por orden», sin chip «Público») | R3, R5, R6, R8 |
| ¿Quién ve y cambia? Solo el maestro, autorización en el servicio | R1, R2 |
| ¿Aprobación del superadmin? No | R11 |
| ¿Desde cuándo rige? Próximo corte 1 o 16, sin «ahora» ni fecha | R10, R11, R19 |
| ¿Cobro del cambio? Sin prorrateo | R14 |
| ¿Cambio pendiente? Cancelar o reemplazar antes del corte | R15, R16, R19 |
| ¿Bajar con usuarios o API keys de más? Se rechaza con cuántos sobran | R13, R20 |
| Usuarios = suma de topes por rol, «Sin tope» si alguno | R4 |
| Mensual / Anual con insignia del % | R6 |
| «Plan a la medida» con «Contáctanos»; custom activo = plan activo | R7 |
| Reutilización en `components/shared/` | R9 |
| Carrusel de shadcn, sin dependencias nuevas | R5, R23 |
| ¿E2E? Sí | R22 |
| Tamaño: «Contáctanos» se separa a SLT-117 | R7 |

## Preguntas abiertas
- Qué muestra y cómo se compara un plan sin cuota (solo costo por orden) en el selector anual.
  **[P1]** Propuesta en `design.md > §8, P1`: hoy «sin cuota» solo puede ser un costo base de `0.00`
  (el «sin precio» no es asignable, SLT-66 R28, y no sale en el carrusel); en las dos vistas dice «Sin
  cuota» y «solo pagas el costo por orden», sin insignia. Falta decidir también la insignia de un
  descuento anual en **monto fijo** (la decisión habla de «%»).
- Cómo interactúa el corte 1/16 con una empresa cuyo tipo de cobro es mensual, bimestral o anual
  (SLT-86 usa períodos de calendario): el spec debe leer el período de calendario y proponer, sin
  inventar. **[P2]** Leído en `lib/planes/ciclo.ts` y SLT-86 R4, R5, R12, R17: **choca** salvo en
  quincenal. Un corte que no es inicio de período abre un tramo con costo proporcional del plan nuevo
  (mensual el 16; bimestral fuera del 1 de un mes impar; anual fuera del 1 de enero). Propuesta en
  `design.md > §8, P2`.
- **[P3]** ¿Puede el maestro reemplazar o cancelar un pendiente que programó el superadmin? Propuesta: no
  (`pendiente_de_plataforma`, R17).
- **[P4]** ¿El rechazo por topes mira cada rol (como los triggers de SL-24) o la suma de «Usuarios»?
  Propuesta: cada rol, con «sobran N» por rol (R13).
- **[P5]** Una empresa sin plan, ¿puede elegir uno desde «Mi plan»? Propuesta: no; la primera asignación
  sigue siendo del superadmin o de la inscripción de SLT-116 (R18).
- **[P6]** Una empresa con plan custom que pasa a uno público no puede volver a su custom sin el
  superadmin. Propuesta: se permite y la confirmación lo dice (`design.md > §6`).
- **[P7]** «Contáctanos» sin la acción de SLT-117: propuesta, visible y deshabilitado (R7).
- **[P8]** El panel del plan activo del diseño no trae el costeo del período (total estimado, órdenes del
  período, cobrado) que exigen SLT-66 R18–R20, SLT-83 R23–R24 y SLT-86 R27–R28. Propuesta: `ConsumoDelPlan`
  sigue debajo, sin cambios; quitarlo retira esos requisitos y lo decide el humano (R21).
- **[P9]** Tamaño: 31 archivos (78 % de 40) y unas 1 800 líneas, por encima de las 1 000 de
  `gate.tamano_pr`. Propuesta de corte en `design.md > §10`, o aceptar el exceso con la línea
  `tamano-pr-aceptado` en la ficha.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-09 | Diseño | Aprobado: https://claude.ai/artifact/M1owRvXM3ziekGffd6ct45 (carrusel, tarjeta clickeable sin «Ver detalles», chip «Activo» junto al nombre, insignia circular de descuento solo en anual, módulos uno por uno con ícono, «Uso de la plataforma» y «Costo por orden», sin chip «Público»). |
| 2026-11-09 | ¿Quién ve y cambia? | Solo el maestro (hereda «Mi plan» de SLT-58). Autorización en el servicio. |
| 2026-11-09 | ¿Aprobación del superadmin? | No: el maestro cambia directo. |
| 2026-11-09 | ¿Desde cuándo rige? | Desde el próximo corte, el 1 o el 16 del mes, igual para todas las empresas. Sin opción «ahora» ni fecha. |
| 2026-11-09 | ¿Cobro del cambio? | Sin prorrateo: el plan actual rige hasta el corte y el nuevo desde el corte. |
| 2026-11-09 | ¿Cambio pendiente? | Se puede cancelar o reemplazar por otro plan antes del corte. |
| 2026-11-09 | ¿Bajar a un plan con menos usuarios o API keys de los que se usan? | Se rechaza, con un aviso que dice cuántos sobran. |
| 2026-11-09 | Usuarios | Un solo «Usuarios» = suma de los topes por rol, calculada en el front; si alguno es sin tope, «Sin tope». El modelo no cambia. |
| 2026-11-09 | Mensual / Anual | Selector en el carrusel; en anual, precio del año con descuento e insignia del %. |
| 2026-11-09 | «Plan a la medida» | Tarjeta con «Contáctanos», activa salvo que la empresa ya tenga un plan custom activo (entonces es su plan activo). El envío (mensaje abierto al superadmin) va a SLT-117. |
| 2026-11-09 | Reutilización | Listado y detalles en `components/shared/`, sin depender de la empresa: reciben por props los planes, el plan activo (opcional) y las acciones. Los usa SLT-116. |
| 2026-11-09 | Carrusel | El de shadcn (`components/ui/carousel.tsx`, `embla-carousel-react` ya aprobada). Sin dependencias nuevas. |
| 2026-11-09 | ¿E2E? | Sí: el maestro ve su plan, cambia a otro, ve el pendiente para el próximo corte y lo cancela. |
| 2026-11-09 | Tamaño | «Contáctanos» se separa (SLT-117) para que el PR quepa en el tope. |
