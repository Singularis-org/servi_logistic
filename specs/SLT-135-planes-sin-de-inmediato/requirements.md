# SLT-135 — planes-sin-de-inmediato · requirements.md

> **Zona:** backend · **Complejidad:** high · **depends_on:** SLT-128 · **Rama:** `feature/SLT-135-planes-sin-de-inmediato`
>
> **Alcance.** Al editar un plan desaparece «De inmediato»: toda edición (incluido solo el nombre) lleva una
> fecha «A partir de» y llega a cada empresa al inicio de su período de cobro que empiece en esa fecha o
> después (mecanismo de SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su
> período»). Incluye retirar el camino inmediato del servicio, de la action y del paso «Cuándo rige» del
> formulario, y ajustar los tests (unitarios, de integración y E2E) que hoy editan «De inmediato».
>
> **Lo que NO entra.** El borrador del cambio → SLT-129 «Planes: borrador del plan guardado en el servidor por
> pasos» (en curso, PR #200). Conectar el formulario al borrador y mostrar la fecha de cada empresa → SLT-144
> «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa».
>
> Sembrado por `/afinar-feature` el 2026-11-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-18, sobre el código con SLT-144 mergeada en la rama (formulario por pasos,
> borrador, fecha de cada empresa, `AbrirPlanForm`, `?editar=1`). Diseño en `design.md` («§N»); tareas en
> `tasks.md`. Heredan SL-24 «Planes y límites», SLT-86 «Planes: período de facturación de calendario por empresa
> y sin tope de órdenes», SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su
> período», SLT-129 «Planes: borrador del plan guardado en el servidor por pasos» y SLT-144 «Planes: formulario
> por pasos conectado al borrador y a la fecha de cada empresa». Las horas son las de la plataforma (−06:00, CR).
>
> **Sustituye o retira:**
> - SL-24 R15 (la edición inmediata a todas en el acto);
> - SL-24 R37 («posterior a hoy» sin cambio de precio);
> - lo de «hoy se aplica en el acto» de SLT-86 R22 y de SLT-128 R23;
> - SLT-128 R16 («De inmediato» con el plan partido), que se **retira**;
> - SLT-144 R17 en lo de «Con «De inmediato» no se muestra la tabla».

**Vocabulario.**
- *Editar*: guardar un cambio de un plan con `editarPlanAction` o confirmando su borrador de cambio (SLT-129).
- *F*: la fecha que el superadmin elige en «Cuándo rige»: «Rige desde» si cambia el precio, «A partir de» si no.
- *Hoy*: el día de calendario de la plataforma en el instante de guardar.
- *Programar*: lo que hace SLT-128 con una F:
  - un solo pendiente por plan (y el reemplazo del anterior);
  - la recepción de cada empresa;
  - los trabajos de la cola;
  - el correo de guardado y los recordatorios de cada empresa.

Las rutas de test son relativas a la raíz del repo.

### Toda edición lleva fecha

- **R1.** SI una edición llega sin F (`vigenteDesde` ausente o `null`), ENTONCES el sistema DEBE responder
  `validation_error` en `vigenteDesde` con «Elige desde qué fecha rige el cambio.». NO DEBE leer el plan ni
  escribir nada. Vale cambie el precio o no, y aunque solo cambie el nombre.
  *Test:* `tests/unit/services/planes-service.test.ts`:
  - «R1: sin fecha es validation_error sin llamar al repositorio»: `null`, ausente, solo el nombre y con precio.

  `tests/unit/types/planes-schema.test.ts`:
  - «R1: editarPlanSchema exige vigenteDesde».
- **R2.** SI F es anterior a hoy, ENTONCES el sistema DEBE responder `validation_error` en `vigenteDesde` con
  «La fecha de efecto no puede ser anterior a hoy.» sin escribir nada. Es la regla de hoy (SLT-86 R22), que
  ahora vale para toda edición.
  *Test:* `tests/unit/services/planes-service-periodo.test.ts`:
  - «R2: ayer se rechaza, cambie el precio o no».
- **R3.** CUANDO el superadmin edita con F igual a hoy o posterior, el sistema DEBE programar el cambio como en
  SLT-128 (R1–R29), sea cual sea lo que cambie: nombre, costo base, descuentos, cobro por orden, topes, módulos
  o periodicidad de órdenes. NO DEBE aplicarlo en el acto a todas las empresas: el sistema ya no tiene edición
  inmediata.
  *Test:* `tests/unit/services/planes-service-periodo.test.ts`:
  - «R3: hoy, con y sin cambio de precio, programa con las 00:00 de hoy»: `programarCambio` una vez, nunca
    otra escritura.

  `tests/integration/db/planes-edicion-en-uso.test.ts`:
  - «R3: los topes y los módulos llegan por la recepción, no al guardar».
- **R4.** CUANDO F es hoy, cada empresa del plan cuyo período de cobro empieza hoy DEBE recibir el cambio hoy.
  Su recepción son las 00:00 de hoy, y la cola la aplica en su siguiente pasada (SLT-128 R5). Las demás lo
  reciben al inicio de su siguiente período (SLT-128 R1). Para la recepción de hoy NO DEBE encolarse ningún
  recordatorio (SLT-128 R21: el de 1 día cae antes de guardar), y el correo de guardado DEBE salir con la fecha
  de hoy.
  Ejemplo: guardado el 16 de noviembre de 2026 a las 15:00 con F = 16 de noviembre:
  - la quincenal lo recibe el 16 de noviembre, en la siguiente pasada;
  - la mensual, el 1 de diciembre.
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`:
  - «R4: F hoy: la quincenal lo recibe en la siguiente pasada y la mensual el 1 de diciembre».
- **R5.** SI el plan no tiene empresas y F es hoy, ENTONCES el cambio DEBE pasar al plan en la siguiente pasada
  de la cola (SLT-128 R10, «a las 00:00 de F»).
  *Test:* `tests/integration/db/planes-cambio-programado.test.ts`:
  - «R5: plan sin empresas con F hoy: lo promueve la siguiente pasada».
- **R6.** CUANDO F es hoy y cambia el costo base o un descuento, el precio nuevo DEBE regir, para cada empresa,
  desde el primer período que empiece hoy o después: el de hoy para las que empiezan período hoy y su recepción
  para las demás (SLT-86 R15, SLT-128 R3). Ninguna empresa DEBE pagarlo antes.
  *Test:* `tests/integration/db/plan-precio-historial.test.ts`:
  - «R6: precio con F hoy: la quincenal que empieza hoy lo paga desde hoy y la mensual desde el 1».

  `tests/integration/db/plan-descuento-periodo.test.ts`:
  - «R6: un descuento con F hoy se programa».
- **R7.** SI la edición no cambia nada respecto de la versión del plan y el plan no tiene pendiente, ENTONCES el
  sistema DEBE responder `ok` con `cambio: false` y `vigenteDesde: null`, sin escribir nada (como programar
  hoy).
  *Test:* `tests/unit/services/planes-service.test.ts`:
  - «R7: sin cambios con fecha responde cambio false».
- **R8.** MIENTRAS el plan esté partido (alguna empresa ya recibió el pendiente), una edición con F válida DEBE
  programarse y reemplazar el pendiente como en SLT-128 R13. NO DEBE responder `cambio_a_medias`. Se retira
  SLT-128 R16.
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`:
  - «R8: con el plan partido, editar programa y reemplaza» (sustituye el test de R16).
- **R9.** CUANDO editar responde `ok` con `cambio: true`, la respuesta DEBE llevar `vigenteDesde` = F
  (`AAAA-MM-DD`).
  *Test:* `tests/unit/services/planes-service.test.ts`:
  - «R9: ok con la fecha elegida».

### El borrador de cambio

- **R10.** SI el paso `vigencia` de un borrador de cambio se guarda sin fecha (`null` o ausente), ENTONCES el
  sistema DEBE responder `validation_error` en `vigenteDesde` con el texto de R1, sin escribir nada. El rango
  (R2) se sigue mirando al confirmar, no al guardar (SLT-129 R6).
  *Test:* `tests/unit/types/plan-borrador-schema.test.ts`:
  - «R10: vigencia sin fecha es inválida; una fecha pasada se acepta al guardar».
- **R11.** CUANDO se lee o se confirma un borrador de cambio que guardó `vigencia` sin fecha antes de esta
  ficha, el sistema DEBE tratar ese paso como no guardado (lectura defensiva de SLT-129). Confirmar DEBE
  responder `pasos_pendientes` con `["vigencia"]`, sin escribir nada, y el borrador DEBE quedar igual.
  *Test:* `tests/integration/db/plan-borrador-confirmar.test.ts`:
  - «R11: una vigencia sin fecha guardada antes queda pendiente al confirmar».
- **R12.** CUANDO se confirma un borrador de cambio con todos sus pasos, el sistema DEBE aplicar R1–R9 (SLT-129
  R18, R19).
  *Test:* `tests/integration/db/plan-borrador-confirmar.test.ts`:
  - «R12: confirmar con F hoy programa».

### La fecha de cada empresa

- **R13.** SI la vista previa de la fecha de cada empresa (SLT-144 R21) se pide sin F, ENTONCES el sistema DEBE
  responder `validation_error` en `vigenteDesde` sin leer nada. Con F, cada empresa DEBE llevar siempre una
  fecha.
  *Test:* `tests/unit/services/planes-previsualizar-cambio.test.ts`:
  - «R13: sin fecha es validation_error» (sustituye «con F null no hay fechas»).

### El formulario

- **R14.** MIENTRAS el superadmin está en «Cuándo rige» al editar, el formulario DEBE mostrar un solo campo de
  fecha, sin el grupo «Aplicar» ni la opción «De inmediato»:
  - si cambia el precio, «Rige desde», como hoy;
  - si no, «A partir de», con la ayuda «Rige desde las 00:00 de ese día, hora de la plataforma.».

  *Test:* `tests/components/PlanForm.test.tsx`:
  - «R14: Cuándo rige sin De inmediato y con A partir de».
- **R15.** CUANDO se abre el formulario de editar sin borrador, la fecha de «Cuándo rige» DEBE valer mañana (día
  de la plataforma), cambie el precio o no. Con un borrador que tiene `vigencia` guardada, DEBE valer la fecha
  guardada (SLT-144 R15).
  *Test:* `tests/components/PlanForm.test.tsx`:
  - «R15: abre con mañana».

  `tests/unit/planes/plan-form-borrador.test.ts`:
  - «R15: vigencia ida y vuelta con fecha, cambie o no el precio».
- **R16.** El botón final del formulario de editar DEBE decir «Programar cambio», cambie el precio o no. La
  petición DEBE llevar siempre la fecha del campo que se ve.
  *Test:* `tests/components/PlanForm.test.tsx`:
  - «R16: Programar cambio envía la fecha de A partir de»;
  - «R16: con cambio de precio envía la de Rige desde».
- **R17.** SI la fecha de «Cuándo rige» está vacía o no es una fecha válida, ENTONCES «Guardar y continuar» DEBE
  marcar el campo con el error del esquema y no avanzar.
  *Test:* `tests/components/PlanForm.test.tsx`:
  - «R17: fecha vacía no avanza».
- **R18.** «Revisar y programar» DEBE mostrar la fila «Rige desde: F» (si cambia el precio) o «A partir de: F».
  NO DEBE mostrar nunca «Aplicar: De inmediato».
  *Test:* `tests/unit/planes/plan-form-revision.test.ts`:
  - «R18: la fila de la fecha».

  `tests/components/PlanFormRevisar.test.tsx`:
  - «R18: Revisar muestra A partir de».
- **R19.** MIENTRAS «Cuándo rige» o «Revisar y programar» tengan una F válida, la tabla con la fecha de cada
  empresa (SLT-144 R17) DEBE mostrarse. Se retira el caso «Con «De inmediato» no se muestra la tabla».
  *Test:* `tests/components/PlanFormFechasPorEmpresa.test.tsx`:
  - «R19: con la fecha por defecto se pide y se muestra la tabla» (sustituye «R17: De inmediato no muestra la
    tabla»).
- **R20.** CUANDO se programa un cambio desde el detalle del plan, la pantalla DEBE avisar:
  - «Cambio programado desde F.» si hubo cambio;
  - «No había nada que cambiar.» si no lo hubo.

  NO DEBE decir «Cambios guardados.».
  *Test:* `tests/components/PlanDetalle.test.tsx`:
  - «R20: programar avisa con la fecha».

### Correos ya encolados

- **R21.** Un correo de guardado de una edición inmediata encolado antes del despliegue (sin fecha) DEBE seguir
  saliendo con su texto de hoy: «El plan <plan> de <empresa> cambió y los cambios ya rigen.».
  *Test:* `tests/unit/services/email/plantilla-cambio-plan.test.ts` (el caso existente con `vigenteDesde:
  null`, sin cambios).

### Quién

- **R22.** SI quien edita o pide la fecha de cada empresa no es el superadmin, ENTONCES el sistema DEBE responder
  `forbidden` sin llamar al repositorio (SL-24, SLT-144 R22).
  *Test:* `tests/unit/services/planes-service.test.ts`:
  - «forbidden» de editar, ahora con fecha.

  `tests/unit/services/planes-previsualizar-cambio.test.ts`:
  - «R22» existente.

### Punta a punta

- **R23.** El recorrido de `e2e/planes-costo-porcentual.spec.ts` DEBE seguir verde así:
  1. El superadmin edita el plan sin empresas a «Porcentual».
  2. En «Cuándo rige» pone «A partir de» = hoy y pulsa «Programar cambio».
  3. Ve «Cambio programado desde <hoy>.».
  4. Tras correr `procesar-jobs`, el plan queda porcentual con 2 % y mínimo 500, y el detalle lo dice.
  5. El resto del recorrido no cambia.
  *Test:* `e2e/planes-costo-porcentual.spec.ts`:
  - «el superadmin programa por pantalla el plan en «Porcentual» con fecha de hoy (R23)».

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| ¿Qué fechas admite «A partir de» al editar? (≥ hoy por empresa) | R2, R3, R4, R5, R6 |
| ¿Qué partes del plan se editan con fecha? | R1, R3 |
| «De inmediato» con el plan partido (SLT-128 R16) | R8 (R16 retirado) |
| Correos, reemplazo, cancelación y recepción no aplicada como SLT-128 | R3, R4, R8, R21 |
| ¿Cómo valida el paso `vigencia` del borrador? | R10, R11, R12 |
| ¿Quién edita? | R22 |
| ¿E2E? | R23 |
| ¿Ruta? | `design.md`, `tasks.md` |
| P1 · Tamaño | — (proceso: `tasks.md > Archivos esperados`, tamaño aceptado) |
| P2 · Fecha por defecto | R15 |

## Preguntas abiertas

Ninguna. P1 y P2 las cerró el humano el 2026-11-18 (filas de «Decisiones cerradas»).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Qué fechas admite «A partir de» al editar? | Desde hoy (≥ hoy). Una empresa cuyo período empieza hoy lo recibe hoy; las demás, al inicio de su siguiente período que empiece en la fecha o después. Sustituye la regla «posterior a hoy» de SL-24 R37; es el «≥ hoy por empresa» que SLT-128 P9 dejó para esta ficha. |
| 2026-11-11 | ¿Qué partes del plan se editan con fecha? | Todo lo editable: nombre, costo base, descuentos, cobro por orden, topes, módulos y periodicidad de órdenes (heredado de SLT-128). |
| 2026-11-11 | «De inmediato» con el plan partido (SLT-128 R16, P7) | Queda sin objeto al desaparecer la edición inmediata; spec_author retira o reemplaza R16 de SLT-128 explícitamente. |
| 2026-11-11 | Correos, reemplazo, cancelación y recepción no aplicada | Como en SLT-128 (P1, P2, P4–P6, P8, P10, m2, m3), sin cambios. |
| 2026-11-17 | ¿Cómo valida el paso `vigencia` del borrador de SLT-129? | Con la validación de editar que deje esta ficha (≥ hoy, sin inmediato); SLT-129 ya la reutiliza. |
| 2026-11-17 | ¿Quién edita? | Solo el superadmin (heredado de SL-24). |
| 2026-11-17 | ¿E2E? | Sí: se ajustan los E2E de planes que hoy editan «De inmediato». |
| 2026-11-17 | ¿Ruta? | Completa: dinero y cambio de comportamiento del servicio de planes. |
| 2026-11-18 | P1 · Tamaño (~48 archivos, por encima de los 40 del tope) | **«Un PR sobre el tope»** (humano): una sola ficha, sin corte, como SLT-144. Nota de tamaño aceptado en `tasks.md`. |
| 2026-11-18 | P2 · Fecha por defecto de «A partir de» al editar | **Mañana** (humano): el campo abre en mañana, cambie el precio o no. |
