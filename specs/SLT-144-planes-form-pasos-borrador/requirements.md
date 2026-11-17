# SLT-144 — planes-form-pasos-borrador · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SLT-128, SLT-129, SLT-130 (todas done) · **Rama:** `feature/SLT-144-planes-form-pasos-borrador`
>
> **Alcance.** Conecta el formulario por pasos de SLT-130 «Planes: formulario por pasos compartido en un sheet
> (crear y editar)» con el backend de SLT-128 «Planes: el cambio programado del plan llega a cada empresa al
> inicio de su período» y SLT-129 «Planes: borrador del plan guardado en el servidor por pasos»:
> - «Guardar y continuar» guarda cada paso en el borrador del servidor; ✓ por paso guardado; no se salta a un
>   paso sin guardar el anterior; se muestran el estado del borrador y la hora del último guardado.
> - Lista de planes: los borradores de creación (nombre, quién lo empezó, cuándo) y la marca «Cambio en
>   borrador» en los planes con borrador de cambio; desde ahí se retoma o se descarta con confirmación.
> - «Editar» en un plan con borrador de cambio retoma ese borrador directo, con el aviso «Borrador de
>   <quién>, guardado el <fecha hora>» y el botón «Descartar y empezar de nuevo».
> - «Cuándo rige» y «Revisar y programar»: la fecha en que recibe el cambio cada empresa y el aviso de topes
>   que alguna empresa ya pasa.
> - «N de M empresas ya lo recibieron» del detalle del plan cuenta también las que entran al plan en la fecha
>   elegida o después (review m1 de SLT-128).
>
> **Lo que NO entra.** Quitar «De inmediato» del servicio, la action y el paso «Cuándo rige» → SLT-135
> «Planes: sin «De inmediato» al editar un plan» (dejó de ser dependencia, humano 2026-11-17).
>
> Sembrado por `/afinar-feature` el 2026-11-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**Vocabulario.**
- *El formulario* es `PlanForm` de SLT-130 «Planes: formulario por pasos compartido en un sheet (crear y
  editar)», con sus pasos `general`, `precio`, `orden`, `topes`, `modulos`, `vigencia` (solo al editar) y
  `revisar`.
- *El borrador* es el de SLT-129 «Planes: borrador del plan guardado en el servidor por pasos»: uno de
  creación por cada plan nuevo empezado, o el único borrador de cambio de un plan. *Guardar un paso*,
  *leer*, *descartar* y *confirmar* son sus cuatro actions (`lib/actions/plan-borrador.ts`).
- *Pasos que se guardan* son todos menos `revisar`.
- *F* es la fecha que el superadmin elige en «Cuándo rige»: «Rige desde» si cambia el precio, o «A partir
  de».
- *Fecha y hora* se escriben `AAAA-MM-DD HH:mm`, en la hora de la plataforma, como hoy en el detalle del plan.

Las rutas de test son relativas a la raíz del repo.

### Guardar por pasos

- **R1.** CUANDO el superadmin pulsa «Guardar y continuar» en un paso que se guarda, el formulario DEBE
  validar ese paso como hoy (SLT-130 R18). Si no hay errores, DEBE guardar los valores de ese paso en el
  borrador con una sola llamada. Si la respuesta es `ok`, DEBE marcar el paso como guardado y pasar al
  siguiente. Al crear, el primer guardado de General va sin borrador, y los siguientes van con el id que
  devolvió. Al editar, cada guardado va con el plan.
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R1: crear guarda General sin borrador y el resto
  con su id», «R1: editar guarda cada paso con el plan» y «R1: un paso con error no llama a guardar».
- **R2.** Los valores que el formulario guarda en un paso DEBEN ser los de ese paso tal como hoy viajan
  a crear o editar. Los descuentos van como lista de líneas con período, tipo y valor. Cargar en el
  formulario los valores guardados DEBE devolver lo mismo que se escribió.
  *Test:* `tests/unit/planes/plan-form-borrador.test.ts` — «R2: cada paso, ida y vuelta, al crear y al
  editar» (incluye el custom con empresa sin plan y con plan, los dos modos de cobro por orden, la lista
  de descuentos en su orden y los tres casos de `vigencia`).
- **R3.** SI guardar un paso responde `validation_error`, ENTONCES el formulario DEBE pintar cada error
  junto a su campo, llevar el foco al primero, no avanzar y no marcar el paso como guardado. SI responde
  otro rechazo o la llamada falla, ENTONCES DEBE pintar el motivo en el aviso del paso, conservar lo
  escrito y no avanzar.
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R3: validation_error de un tope se pinta en
  Topes», «R3: archivado se pinta en el aviso del paso» y «R3: un fallo de red no avanza».
- **R4.** MIENTRAS un guardado de un paso o la confirmación están en vuelo, el formulario DEBE tener
  deshabilitados «Guardar y continuar», «Anterior», la lista de pasos y el botón final, y DEBE ignorar
  Enter. Así no envía un segundo guardado ni confirma con un guardado sin terminar.
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R4: con un guardado en vuelo no se puede
  confirmar ni guardar otra vez».

### Navegación, ✓ y estado del borrador

- **R5.** El formulario DEBE dejar elegir en la lista de pasos solo el primero, los pasos guardados y el
  paso que sigue a uno guardado. «Anterior» DEBE cambiar de paso sin guardar.
  *Test:* `tests/components/FormularioPorPasos.test.tsx` — «R5: solo se elige un paso guardado o el que
  sigue a uno guardado» y `tests/components/PlanFormBorrador.test.tsx` — «R5: no se salta a Topes sin
  guardar Cobro por orden».
- **R6.** El componente de pasos DEBE mostrar ✓ en cada paso guardado, con el nombre accesible
  «<título> (guardado)». SI los valores de un paso guardado cambian en pantalla sin volver a guardarse,
  ENTONCES ese paso DEBE perder el ✓ y mostrar «Sin guardar».
  *Test:* `tests/components/FormularioPorPasos.test.tsx` — «R6: ✓ con su nombre accesible» y
  `tests/components/PlanFormBorrador.test.tsx` — «R6: tocar un paso guardado lo deja Sin guardar».
- **R7.** El formulario DEBE mostrar sobre los pasos «Borrador · <n> de <m> pasos guardados», donde m
  cuenta los pasos que se guardan. Junto al pie DEBE mostrar «Aún sin guardar» o «Borrador guardado el
  <fecha y hora>» del último guardado que respondió el servidor. En cada paso que no es «Revisar» DEBE
  mostrar «Borrador: se guarda al continuar, pero no se aplica a ninguna empresa hasta el último paso.».
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R7: estado y hora tras guardar General».

### Confirmar

- **R8.** MIENTRAS falte algún paso por guardar o alguno esté «Sin guardar», el botón final de «Revisar»
  DEBE estar deshabilitado. Junto a él DEBE decir «Faltan pasos por guardar: <títulos en orden>.», con un
  enlace al primero. CUANDO el botón final se pulsa con todo guardado, el formulario DEBE llamar una sola
  vez a confirmar con el id del borrador. Con `ok`, DEBE avisar a quien lo monta como hoy, que cierra el
  panel, relee la página y dice qué pasó; eso incluye «Sin cambios» cuando se confirma sin cambios.
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R8: con Topes sin guardar no se confirma y el
  enlace lleva a Topes» y «R8: confirmar llama una vez con el borrador y entrega el ok».
- **R9.** SI confirmar responde `pasos_pendientes`, ENTONCES el formulario DEBE quitar la marca de
  guardado a esos pasos e ir al primero. SI responde `validation_error` u otro rechazo con campo,
  ENTONCES DEBE ir al paso del primer campo con error (SLT-130 R25). SI responde
  `borrador_no_encontrado`, ENTONCES DEBE pintar en «Revisar» «Este borrador ya no existe: se confirmó o
  se descartó en otra pantalla.». Los demás rechazos llevan su texto de hoy al aviso de «Revisar».
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R9: pasos_pendientes lleva al primero que
  falta», «R9: una fecha pasada al programar lleva a Cuándo rige» y «R9: borrador_no_encontrado».

### Guardado tardío y borrador compartido

- **R10.** CUANDO guardar un paso de un cambio responde con un borrador distinto del que la pantalla
  tenía abierto, el formulario DEBE avisar «El borrador que tenías abierto ya se programó o se descartó
  en otra pantalla. Lo que acabas de guardar abrió un borrador nuevo.». Desde ahí DEBE seguir con ese
  borrador y marcar como guardados solo los pasos que trae la respuesta.
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R10: un id nuevo al guardar avisa y deja solo
  ese paso guardado».
- **R11.** SI guardar un paso de un plan nuevo responde `borrador_no_encontrado`, ENTONCES el formulario
  DEBE avisar «Este borrador ya no existe: se confirmó o se descartó en otra pantalla.», conservar lo
  escrito y no crear otro borrador por su cuenta.
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R11: crear con el borrador borrado no guarda en
  otro».
- **R12.** CUANDO guardar un paso responde con pasos guardados que la pantalla no tenía como guardados,
  el formulario DEBE leer el borrador, cargar los valores de esos pasos y avisar «Otro superadmin guardó
  pasos de este borrador: se cargaron sus valores.». Lo escrito en los demás pasos se conserva.
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R12: pasos ajenos se cargan y se avisa».
- **R13.** CUANDO se cierra el panel con algún paso guardado y sin confirmar, la pantalla que lo monta
  DEBE avisar «El borrador queda guardado. Puedes retomarlo luego.».
  *Test:* `tests/components/PlanesModule.test.tsx` — «R13: cerrar con un paso guardado avisa» y
  `tests/components/PlanDetalle.test.tsx` — «R13: cerrar la edición con un paso guardado avisa».

### Abrir y retomar

- **R14.** CUANDO se abre el formulario de editar o se retoma un borrador, el panel DEBE leer el borrador:
  al editar, el del cambio del plan; al retomar uno de creación, ese por su id. MIENTRAS lee, DEBE
  mostrar «Cargando el borrador…» sin el formulario. SI la lectura falla, ENTONCES DEBE mostrar «No se
  pudo leer el borrador.» con «Reintentar». SI al editar el plan no tiene borrador, ENTONCES DEBE abrir el
  formulario de hoy, con los valores del plan y sin pasos guardados.
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R14: cargando, error con Reintentar y plan sin
  borrador».
- **R15.** SI hay borrador, ENTONCES el panel DEBE abrir el formulario directo, sin un diálogo previo,
  aunque lo haya empezado otro superadmin. Muestra los valores del plan (o vacíos al crear) con los de
  los pasos guardados encima y ✓ en esos pasos. Se sitúa en el primer paso sin guardar, o en «Revisar» si
  están todos. Muestra el aviso «Borrador de <iniciadoPor>, guardado el <fecha y hora>» y el botón
  «Descartar y empezar de nuevo».
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R15: editar retoma el borrador de otro
  superadmin con su aviso» y «R15: retomar una creación en Topes».
- **R16.** CUANDO se pulsa «Descartar y empezar de nuevo», el panel DEBE pedir confirmación con
  «¿Descartar el borrador? Se borran todos sus pasos guardados. No se puede deshacer.». Si se confirma,
  descarta el borrador. Con `ok` o `borrador_no_encontrado`, el formulario vuelve a General, con los
  valores del plan (o vacíos al crear), sin pasos guardados ni aviso de borrador. SI descartar falla,
  ENTONCES el mensaje DEBE quedar en el diálogo y el borrador sigue como estaba.
  *Test:* `tests/components/PlanFormBorrador.test.tsx` — «R16: descartar y empezar de nuevo» y «R16: un
  fallo al descartar no toca el formulario».

### Fecha de cada empresa y topes pasados

- **R17.** MIENTRAS al editar los pasos «Cuándo rige» o «Revisar y programar» tienen una F válida, el
  formulario DEBE mostrar una tabla con cada empresa del plan, su tipo de cobro y la fecha en que recibe
  el cambio. Esa fecha es la misma que calcula programar para la empresa (SLT-128 R1). Con «De
  inmediato» no se muestra la tabla.
  *Test:* `tests/components/PlanFormFechasPorEmpresa.test.tsx` — «R17: una fila por empresa con su
  fecha» y «R17: De inmediato no muestra la tabla».
- **R18.** MIENTRAS al editar alguna empresa del plan ya pase un tope de los que hay en el formulario,
  «Cuándo rige» y «Revisar y programar» DEBEN mostrar por empresa el mismo aviso de topes pasados que hoy
  devuelve guardar (`AvisosDeTopes`). El aviso no bloquea programar (SLT-128 P2).
  *Test:* `tests/components/PlanFormFechasPorEmpresa.test.tsx` — «R18: aviso por empresa y el botón
  final sigue habilitado».
- **R19.** SI el plan no tiene empresas, ENTONCES en lugar de la tabla DEBE mostrarse «Este plan no tiene
  empresas: el cambio pasa al plan el <F>.».
  *Test:* `tests/components/PlanFormFechasPorEmpresa.test.tsx` — «R19: plan sin empresas».
- **R20.** MIENTRAS se calculan las fechas y los avisos, DEBE mostrarse «Calculando la fecha de cada
  empresa…». SI el cálculo falla, ENTONCES DEBE mostrarse «No se pudo calcular la fecha de cada
  empresa.» con «Reintentar», sin bloquear el botón final. Una respuesta de una F o de unos topes que ya
  no están en pantalla NO DEBE pintarse.
  *Test:* `tests/components/PlanFormFechasPorEmpresa.test.tsx` — «R20: cargando», «R20: error con
  Reintentar» y «R20: una respuesta vieja no se pinta».
- **R21.** CUANDO el superadmin pide la fecha de cada empresa para un plan, una F y unos topes, el sistema
  DEBE devolver las empresas que hoy tienen el plan, cada una con su tipo de cobro y su fecha de
  recepción, y los topes que cada una ya pasa. Fechas y avisos son los mismos que dejaría programar el
  cambio en ese momento. El sistema NO DEBE escribir nada.
  *Test:* `tests/integration/db/planes-previsualizar-cambio.test.ts` — «R21: misma fecha y mismos avisos
  que programar» (lee y luego programa con la misma F: compara con `plan_cambio_recepcion.recibe_at` y con
  los avisos del `ok`) y «R21: leer no escribe» (foto de `plan_cambio_programado`,
  `plan_cambio_recepcion` y `jobs`).
- **R22.** SI quien pide la fecha de cada empresa no es el superadmin, ENTONCES el sistema DEBE responder
  `forbidden` sin leer nada. SI la entrada no es válida, ENTONCES DEBE responder `validation_error`. SI el
  plan no existe, ENTONCES DEBE responder `not_found`.
  *Test:* `tests/unit/services/planes-previsualizar-cambio.test.ts` — «R22: forbidden por rol sin llamar al
  repositorio», «R22: entrada inválida» y «R22: plan inexistente».

### «N de M» del detalle

- **R23.** MIENTRAS un plan tenga un cambio programado, «N de M empresas ya lo recibieron» DEBE contar
  también, como recibidas y en el total, las empresas que entraron al plan en F o después con la versión
  de ese cambio (SLT-128 R17). Una empresa cuenta una sola vez.
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts` — «R23: la empresa que entra en F
  cuenta en N y en M» (una con recepción sin recibir y otra que entra en F → «1 de 2»).

### Lista de planes

- **R24.** MIENTRAS exista algún borrador, la pantalla «Planes» DEBE mostrar sobre el catálogo la sección
  «Borradores», con una fila por borrador. Cada fila lleva:
  - el nombre, o «Sin nombre»;
  - el tipo: «Plan nuevo» o «Cambio de <plan>»;
  - quién lo empezó y cuándo;
  - cuándo se guardó por última vez;
  - los botones «Retomar» y «Descartar».

  Sin borradores, la sección NO DEBE pintarse. SI los borradores no se pudieron leer, ENTONCES la sección
  DEBE decir «No se pudieron cargar los borradores.» y el catálogo DEBE seguir.
  *Test:* `tests/components/PlanesModule.test.tsx` — «R24: un borrador de creación y uno de cambio», «R24:
  sin borradores no hay sección» y «R24: error de lectura con el catálogo».
- **R25.** Cada plan del catálogo que tenga un borrador de cambio DEBE llevar la marca «Cambio en
  borrador» junto a su nombre.
  *Test:* `tests/components/PlanesModule.test.tsx` — «R25: la marca solo en el plan con borrador».
- **R26.** CUANDO se pulsa «Retomar» en un borrador de creación, la pantalla DEBE abrir el panel con ese
  borrador (R14, R15). CUANDO se pulsa en un borrador de cambio, DEBE ir al detalle de su plan con el
  formulario de editar ya abierto.
  *Test:* `tests/components/PlanesModule.test.tsx` — «R26: retomar una creación abre el panel con su id»
  y `tests/components/PlanDetalle.test.tsx` — «R26: con editar en la dirección abre el formulario».
- **R27.** CUANDO se pulsa «Descartar» en la lista, la pantalla DEBE pedir confirmación con «¿Descartar el
  borrador «<nombre>»? Se borran todos sus pasos guardados. No se puede deshacer.». Si se confirma,
  descarta el borrador:
  - con `ok`, DEBE releer la página y avisar «Borrador descartado.»;
  - con `borrador_no_encontrado`, DEBE avisar «Ese borrador ya no existe.» y releer;
  - si falla, el mensaje queda en el diálogo y la fila sigue.

  *Test:* `tests/components/PlanesModule.test.tsx` — «R27: descartar con confirmación», «R27: ya no
  existe» y «R27: un fallo deja la fila».

### Quién y superficie

- **R28.** SI quien abre «Planes» o el detalle de un plan no es el superadmin, ENTONCES la página DEBE
  responder «no encontrado» antes de leer los borradores, como hoy antes de leer el catálogo.
  *Test:* `tests/integration/plataforma-planes-page.test.tsx` — «R28: un admin no llega a leer los
  borradores».
- **R29.** Las actions de guardar un paso, leer, descartar y confirmar el borrador, y la nueva de la
  fecha de cada empresa, DEBEN tener una pantalla que las llame, sin la marca `@sin-superficie`.
  *Test:* `tests/unit/guards/superficie-de-uso.guardia.test.ts` en verde sin las anotaciones de
  `lib/actions/plan-borrador.ts`.

### Punta a punta

- **R30.** El superadmin DEBE poder hacer por pantalla todo el recorrido siguiente:
  1. Crear un plan guardando por pasos, cerrar el panel y retomarlo desde «Borradores» con los mismos
     valores y ✓.
  2. Crearlo con «Crear plan»: deja de estar en «Borradores» y aparece en el catálogo.
  3. Editar un plan con empresas guardando por pasos, cerrar y volver a «Editar»: se retoma con el aviso
     «Borrador de …» y la marca «Cambio en borrador» en la lista.
  4. Ver en «Cuándo rige» la fecha de cada empresa.
  5. Programar: la marca desaparece y el detalle dice «Cambio programado».

  *Test:* `e2e/planes-borrador.spec.ts` — «R30: crear y editar un plan por pasos con borrador».

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Marca «Borrador» y «Descartar borrador» en la lista, con confirmación | R24, R25, R26, R27 |
| «Editar» con borrador de otro superadmin: retoma directo, aviso, «Descartar y empezar de nuevo» | R14, R15, R16 |
| No depende de SLT-135; «De inmediato» no se toca | R17 (con «De inmediato», sin tabla) |
| Contrato del borrador (uno por plan, compartido, no caduca, gana el último, confirmar sin cambios lo borra, sin `plan_rastro`) y el guardado tardío tras confirmar | R1, R4, R8, R10, R11, R12 |
| Pasos, maqueta y descuentos como lista (SLT-130) | R2, R5, R6, R7 |
| Fecha de cada empresa, topes pasados y correos (SLT-128 P2, P4, P5) | R17–R23 (los correos no cambian: los envía programar, SLT-128) |
| Solo el superadmin | R22, R28 (y SLT-129 R1 para las actions del borrador) |
| E2E de crear y editar por pasos con borrador | R30 |
| Ruta completa | `design.md`, `tasks.md` |
| Tamaño aceptado en una sola ficha | Proceso, sin requisito |

## Preguntas abiertas

Ninguna. Las decisiones de diseño que no estaban cerradas van en `design.md` con su porqué. Son tres: el error
de la fecha de cada empresa no bloquea programar (§5.4), al retomar se abre el primer paso sin guardar (§4.5)
y «Descartar y empezar de nuevo» pide confirmación como «Descartar» (§4.5).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿La marca «Borrador» en la lista y «Descartar borrador» entran aquí? | Sí (venían de SLT-129 «Lo que NO entra»). Descartar pide confirmación. |
| 2026-11-17 | «Editar» con un borrador de cambio de otro superadmin | Retoma directo, sin diálogo previo: pasos con ✓, aviso con quién y cuándo, y «Descartar y empezar de nuevo». |
| 2026-11-17 | ¿Depende de SLT-135? | No (humano). Quitar «De inmediato» es de SLT-135; esta ficha no lo toca. |
| 2026-11-17 | Contrato del borrador | Heredado de SLT-129: uno de cambio por plan y compartido; varios de creación sin límite; no caduca; gana el último guardado sin aviso; confirmar sin cambios lo borra; guardar y descartar no dejan `plan_rastro`. Un guardado que llega justo después de confirmar abre un borrador nuevo (review m4 de SLT-129): la pantalla debe evitarlo o tolerarlo. |
| 2026-11-13 | Pasos, maqueta y descuentos como lista | Heredados de SLT-130 (`specs/SLT-130-planes-form-pasos/maqueta/`). |
| 2026-11-11 | Fecha de cada empresa, topes pasados y correos | Heredados de SLT-128 (P2, P4, P5). |
| 2026-11-17 | ¿Quién opera? | Solo el superadmin (SL-24). |
| 2026-11-17 | ¿E2E? | Sí: crear y editar un plan por pasos con borrador. |
| 2026-11-17 | ¿Ruta? | Completa. |
| 2026-11-17 | P1 · Tamaño (~47 archivos, más de los 40 del tope) | Se acepta el tamaño en una sola ficha y no se parte (humano: «Aceptar el tamaño»). Marcador `tamano-pr-aceptado` en `progress/features/SLT-144.md`. |
