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
> **Nota (2026-11-09, humano, P2):** el «próximo corte» del alcance pasa a ser el inicio del próximo
> período de cobro de la empresa, no el 1 o el 16 para todas. Ver la fila «¿Desde cuándo rige?».
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

> Escritos por `spec_author` el 2026-11-09 y ajustados el mismo día con las respuestas del humano a P1–P9
> (filas nuevas de «Decisiones cerradas»). Amplían SLT-58 (R1–R8 de «Mi plan») y **sustituyen SLT-58 R11**
> («Mi plan» es solo información): desde aquí «Mi plan» ofrece cambiar de plan. Reutilizan el cambio de
> empresa pendiente de SLT-86 (R17–R20, R26) sin tocar sus reglas ni su cálculo de períodos. Cada requisito
> nombra su test; las rutas están en `tasks.md > Archivos esperados` y el detalle en `design.md`.
>
> **Glosario.**
> - *Maestro*: el único rol de `ROLES_MI_PLAN` (SLT-91).
> - *Corte*: las 00:00 de la plataforma (hora de Costa Rica, SLT-58 P8) del primer día del próximo período
>   de cobro de la empresa según su tipo de cobro vigente (R10). Siempre es inicio de un período de
>   calendario de SLT-86, así que nunca abre un tramo proporcional.
> - *Plan disponible*: un plan `publico`, no archivado y con costo concreto (SLT-66 R28: costo base con
>   forma «monto» y costo por orden fijo o porcentual).
> - *Pendiente*: el cambio de empresa pendiente de SLT-86, lo haya programado el maestro o el superadmin.
>   El maestro puede cancelar o reemplazar los dos (decisión P3).
> - *Usuarios* de un plan: la suma de los topes de `admin`, `mensajero`, `adminTienda` y `adminSatelite`;
>   «Sin tope» si alguno de esos roles no tiene tope.
> - *Sin cuota*: un plan disponible con costo base mensual `0.00`.

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
  R10) y, solo si el plan tiene descuento anual, la insignia circular con el porcentaje:
  - con descuento anual en porcentaje, ese porcentaje;
  - con descuento anual en monto fijo, el porcentaje equivalente `1 − anual con descuento ÷ (mensual × 12)`,
    redondeado al entero más cercano (mitad hacia arriba).
  - DONDE el plan es sin cuota, la tarjeta DEBE decir «Sin cuota · solo pagas el costo por orden» en las dos
    vistas y NO DEBE mostrar insignia; en el detalle (R8), «Sin cuota» en las cuatro filas de períodos y en
    la comparación.
  *Test:* `tests/unit/planes/planes-vista.test.ts` (porcentaje, monto fijo con su equivalente redondeado
  —un caso que redondea hacia arriba y uno hacia abajo—, sin cuota), `tests/components/CarruselDePlanes.test.tsx`.
- **R7** — MIENTRAS la empresa no tenga un plan custom activo, la tarjeta «Plan a la medida» DEBE mostrar su
  texto y el botón «Contáctanos»; DONDE quien monta el carrusel no le pasa la acción de contacto (la trae
  SLT-117 «Planes: solicitud de plan a la medida desde Contáctanos»), el botón DEBE verse deshabilitado y
  con «Próximamente» debajo. MIENTRAS la empresa tenga un plan custom activo, esa tarjeta DEBE ser su plan
  activo: con su nombre, el chip «Activo», sus datos como en R5 y sin «Contáctanos».
  *Test:* `tests/components/CarruselDePlanes.test.tsx`.
- **R8** — CUANDO el maestro toca una tarjeta, «Mi plan» DEBE mostrar el detalle de ese plan con:
  - la tabla «Uso de la plataforma según el período de cobro»: los cuatro períodos con su descuento, lo que
    se paga por período y lo que equivale por mes, con el tipo de cobro de la empresa resaltado;
  - la comparación concepto por concepto con el plan activo: «Uso de la plataforma», «Costo por orden»,
    «Usuarios», «API keys» y cada módulo;
  - en la tarjeta del plan activo, «Activo desde», el período en curso y el próximo cobro, sin botón de
    cambio;
  - en otra tarjeta, «Cambiar a {plan}» solo si la empresa tiene plan (R18).
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

- **R10** — El corte DEBE ser, en la hora de la plataforma y siempre a las 00:00, el primer día del período
  de calendario de SLT-86 siguiente al que contiene «ahora», según el tipo de cobro **vigente** de la empresa:
  - quincenal: el 16 del mes en curso si hoy es del 1 al 15, o el 1 del mes siguiente si es del 16 en adelante;
  - mensual: el 1 del mes siguiente;
  - bimestral: el 1 del próximo bimestre (ene–feb, mar–abr, may–jun, jul–ago, sep–oct, nov–dic);
  - anual: el 1 de enero siguiente.
  Nunca DEBE ser hoy, ni siquiera a las 00:00 del inicio de un período. Un pendiente de la empresa que
  cambie el tipo de cobro NO DEBE contar: manda el tipo vigente.
  *Test:* `tests/unit/planes/proximo-periodo-de-cobro.test.ts` (por cada tipo: el inicio de un período a las
  00:00, su último instante 23:59:59.999, y los bordes de fin de mes y de año —31 de diciembre, febrero de 28
  y de 29 días, el 30 de noviembre a las 23:59 de Costa Rica, que ya es 1 de diciembre en UTC—),
  `tests/integration/db/mi-plan-cambiar-plan.test.ts` (la fecha guardada para una empresa de cada tipo).
- **R11** — CUANDO el maestro confirma el cambio a un plan disponible distinto del activo, el sistema DEBE
  guardarlo, sin aprobación del superadmin, como el cambio pendiente de la empresa (SLT-86): el plan elegido,
  el tipo de cobro vigente de la empresa y como fecha de efecto el corte (R10), calculado bajo el cerrojo de
  la empresa, y responder `ok` con esa fecha. Hasta las 00:00 del corte la empresa DEBE seguir exactamente
  como estaba (SLT-86 R17). Guardarlo NO DEBE escribir en `wallet_movimiento` ni en
  `cobro_plataforma_movimiento` (SLT-86 R14).
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts`.
- **R12** — SI el plan pedido no es un plan disponible (no existe, está archivado, es custom —de esta empresa
  o de otra— o no tiene costo concreto, también en la versión de su cambio programado), ENTONCES el sistema
  DEBE responder `no_disponible` sin escribir.
  *Test:* `tests/unit/services/mi-plan-cambio-service.test.ts`, `tests/integration/db/mi-plan-cambiar-plan.test.ts`.
- **R13** — SI la empresa tiene hoy más usuarios activos de algún rol con tope (`admin`, `mensajero`,
  `adminTienda`, `adminSatelite`, cada uno contra su propio tope, como SL-24) o más API keys activas de las
  que permite el plan pedido, ENTONCES el sistema DEBE rechazar el cambio con `tope_excedido` sin escribir
  nada, también con fecha futura (a diferencia del superadmin, SLT-86 R18), con un aviso de una línea por
  cada tope pasado que diga «sobra(n) N {rol}» (o «API keys»). El detalle del plan DEBE mostrar ese mismo
  aviso antes de confirmar. La comprobación DEBE hacerse bajo el cerrojo de la empresa.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts` (un rol pasado aunque la suma de «Usuarios»
  quepa; API keys), `tests/unit/planes/planes-vista.test.ts` (el texto en singular y plural, por rol),
  `tests/components/DetalleDePlan.test.tsx` (el aviso previo).
- **R14** — CUANDO llegan las 00:00 del corte, el pendiente del maestro DEBE aplicarse como cualquier
  pendiente de SLT-86 R20: plan nuevo, tipo vigente, módulos del plan nuevo, entrada en el corte y la fila
  `plan_asignado` del historial firmada por el maestro. El período que abre el corte DEBE ser un período de
  calendario completo del tipo de la empresa, sin tramo proporcional, con el costo base completo del plan
  nuevo; el plan actual rige hasta el corte y el nuevo desde el corte, sin prorrateo. SI entre la petición y
  el corte la empresa pasó un tope del plan nuevo, ENTONCES el cambio DEBE aplicarse igual y desde entonces
  rige SLT-58 R36.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts` (aplicar con el reloj en el corte para una
  empresa quincenal, mensual, bimestral y anual: período en curso sin tramo y con el costo de
  `montoDelPeriodo`; tope pasado entre medias).
- **R15** — MIENTRAS la empresa tenga un pendiente (del maestro o del superadmin), CUANDO el maestro pide otro
  plan disponible, el sistema DEBE reemplazar el pendiente por el nuevo, con el corte de R10 como fecha y el
  tipo vigente, sin escribir historial (SLT-86 R19); y CUANDO pide su plan activo, DEBE cancelar el
  pendiente con la fila de R16.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts` (el trabajo del pendiente reemplazado no
  aplica nada al correr; un pendiente del superadmin con otro tipo de cobro se reemplaza por uno con el
  tipo vigente).
- **R16** — CUANDO el maestro confirma «Cancelar cambio» de un pendiente (suyo o del superadmin), el sistema
  DEBE quitar el pendiente y escribir en la misma transacción la fila `plan_cambio_empresa_cancelado` con el
  maestro como actor (SLT-86 R19). SI no hay pendiente, ENTONCES DEBE responder `sin_cambio_programado` sin
  escribir.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts`, `tests/unit/services/mi-plan-cambio-service.test.ts`.
- **R17** — MIENTRAS la empresa tenga un pendiente, «Mi plan» DEBE mostrarlo («Desde el {fecha}: {plan} ·
  {tipo}», SLT-86 R26) con «Cancelar cambio», y seguir ofreciendo «Cambiar a {plan}» en las demás tarjetas,
  lo haya programado el maestro o el superadmin. La confirmación de un cambio con pendiente DEBE decir que lo
  reemplaza.
  *Test:* `tests/integration/db/mi-plan-cambiar-plan.test.ts` (pendiente del superadmin: el maestro lo
  reemplaza y lo cancela), `tests/components/MiPlanCambioDePlan.test.tsx`.
- **R18** — MIENTRAS la empresa no tenga plan, «Mi plan» DEBE mostrar el carrusel y el detalle sin «Cambiar a
  {plan}», y un cambio pedido DEBE responder `sin_plan` sin escribir.
  *Test:* `tests/unit/services/mi-plan-cambio-service.test.ts`, `tests/components/MiPlanCambioDePlan.test.tsx`.

### La pantalla del cambio

- **R19** — CUANDO el maestro pulsa «Cambiar a {plan}», «Mi plan» DEBE pedir confirmación con «¿Cambiar a
  {plan}?», la fecha del corte y el primer período que abrirá el cambio con su costo base, calculado con el
  precio que regirá en el corte (SLT-86 R15, R25), y SIN opción de elegir la fecha. DONDE el plan activo es
  custom, la confirmación DEBE avisar «Si dejas tu plan a la medida, solo la plataforma puede volver a
  asignártelo». CUANDO el cambio se guarda, la pantalla DEBE refrescarse y mostrar el pendiente («Desde el
  {corte}: {plan} · {tipo}») con «Cancelar cambio», que también pide confirmación.
  *Test:* `tests/components/MiPlanCambioDePlan.test.tsx` (con plan público activo sin el aviso; con custom
  activo con el aviso).
- **R20** — CUANDO el servicio responde `tope_excedido`, `no_disponible`, `sin_plan` o
  `sin_cambio_programado`, «Mi plan» DEBE mostrar el texto de ese rechazo (`design.md > §6`) y NO DEBE
  mostrar un pendiente que no se guardó.
  *Test:* `tests/components/MiPlanCambioDePlan.test.tsx`.
- **R21** — Los requisitos de SLT-58, SLT-66, SLT-83, SLT-86 y SLT-91 sobre «Mi plan» DEBEN seguir en verde,
  salvo SLT-58 R11, que este spec sustituye. El consumo y el costeo del período (`ConsumoDelPlan`: total
  estimado, órdenes del período, cobrado) DEBEN seguir debajo del plan activo, sin cambios.
  *Test:* `tests/components/MiPlanModule.test.tsx` (el caso de SLT-58 R11 se reescribe a R19; los de
  `ConsumoDelPlan` siguen), `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` (existente, sin cambios),
  `./init.sh` y el gate de CI (`gate-completo`).
- **R22** — Un E2E DEBE recorrer en un solo flujo: el maestro entra a «Mi plan», ve su plan activo, cambia a
  otro plan público, ve el pendiente para el corte y lo cancela; y un `admin` de la misma empresa sigue
  recibiendo «no encontrado» en `/mi-plan`.
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
| ¿Desde cuándo rige? Inicio del próximo período de cobro de la empresa (reemplaza el corte 1/16) | R10, R11, R14, R19 |
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
| P1: sin cuota y descuento anual en monto fijo | R6 |
| P3: el maestro cancela o reemplaza también el pendiente del superadmin | R15, R16, R17 |
| P4: rechazo por cada rol, «sobra(n) N {rol}» | R13 |
| P5: sin plan ve los planes pero no elige | R8, R18 |
| P6: de custom a público, con aviso | R19 |
| P7: «Contáctanos» deshabilitado con «Próximamente» | R7 |
| P8: `ConsumoDelPlan` se queda | R21 |
| P9: un solo PR | R22 |

## Preguntas abiertas
Ninguna.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-09 | Diseño | Aprobado: https://claude.ai/artifact/M1owRvXM3ziekGffd6ct45 (carrusel, tarjeta clickeable sin «Ver detalles», chip «Activo» junto al nombre, insignia circular de descuento solo en anual, módulos uno por uno con ícono, «Uso de la plataforma» y «Costo por orden», sin chip «Público»). |
| 2026-11-09 | ¿Quién ve y cambia? | Solo el maestro (hereda «Mi plan» de SLT-58). Autorización en el servicio. |
| 2026-11-09 | ¿Aprobación del superadmin? | No: el maestro cambia directo. |
| 2026-11-09 | ¿Desde cuándo rige? | Desde el inicio del **próximo período de cobro de la empresa**: quincenal el 1 o el 16; mensual el día 1 del mes siguiente; bimestral el 1 del próximo bimestre (los de SLT-86); anual el 1 de enero. Así nunca hay tramo proporcional y el cálculo de SLT-86 no cambia. Sin opción «ahora» ni fecha. *Reemplaza el 2026-11-09, por decisión del humano (P2), la anterior «el 1 o el 16 del mes, igual para todas las empresas».* |
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
| 2026-11-09 | P1 · Plan sin cuota y descuento anual en monto fijo | Plan sin cuota (costo base `0.00`) dice «Sin cuota · solo pagas el costo por orden» en mensual y anual, sin insignia. Descuento anual en monto fijo: la insignia muestra el porcentaje equivalente redondeado. |
| 2026-11-09 | P3 · ¿Puede el maestro tocar un pendiente del superadmin? | Sí: puede cancelar o reemplazar también un pendiente programado por el superadmin. |
| 2026-11-09 | P4 · Rechazo al bajar | Mira cada rol (como los topes de SL-24), con aviso «sobra(n) N {rol}», además de API keys. |
| 2026-11-09 | P5 · Empresa sin plan | Ve los planes pero no puede elegir (sin botón de cambio). |
| 2026-11-09 | P6 · De custom a público | Se permite; la confirmación avisa «Si dejas tu plan a la medida, solo la plataforma puede volver a asignártelo». |
| 2026-11-09 | P7 · «Contáctanos» antes de SLT-117 | Visible y deshabilitado, con «Próximamente» debajo, hasta SLT-117 «Planes: solicitud de plan a la medida desde Contáctanos». |
| 2026-11-09 | P8 · Costeo del período | `ConsumoDelPlan` (total estimado, órdenes del período, cobrado) se mantiene debajo del plan activo, sin cambios. |
| 2026-11-09 | P9 · Tamaño del PR | Se acepta: un solo PR (~31 archivos, ~1 800 líneas); pantalla y cambio de plan van juntos y se prueban juntos en el E2E. Línea `tamano-pr-aceptado` en la ficha. |
| 2026-11-09 | P10 | Sin insignia cuando el % equivalente de un descuento anual en monto fijo redondea a 0 % (humano). |
