# SLT-130 — planes-form-pasos · requirements.md

> **Zona:** frontend · **Complejidad:** medium · **depends_on:** — · **Rama:** feature/SLT-130-planes-form-pasos
>
> **Alcance.** El formulario de crear y editar plan pasa a un componente compartido de formulario por pasos
> dentro del Sheet ancho (`components/ui/sheet.tsx`), según la maqueta aprobada (`maqueta/formulario-planes-c.html`,
> opción C, humano 2026-11-11). Pasos: General, Precio y descuentos, Cobro por orden, Topes, Módulos, Cuándo rige
> (solo al editar) y Revisar (y crear / y programar). Descuentos como lista de líneas con agregar y quitar. «Revisar»
> lista los cambios con la clave en negrita y «antes → después»; al crear, los valores finales. Guarda una sola vez,
> al final, con las actions de hoy. No se pierde nada de lo que hace hoy `PlanForm`.
>
> **Lo que NO entra** → SLT-144: el borrador guardado por paso («Guardar y continuar», ✓ por paso, estado y hora
> del borrador), la fecha de cada empresa y el aviso de topes pasados en «Cuándo rige» y «Revisar», quitar
> «De inmediato» y la cuenta «N de M empresas». Tampoco el correo a los maestros que muestra la maqueta.
>
> *Sembrado por `/afinar-feature` el 2026-11-13. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó
> el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.*

## Requisitos (EARS)

Rutas de test relativas a `tests/`. «El formulario» es `PlanForm`; «la action» es la que inyecta la página
(`crearPlanAction`, `editarPlanAction`, `previsualizarCustomAction`), sin cambios en esta ficha.

### Componente de pasos compartido

- **R1.** El componente de pasos DEBE mostrar los pasos en orden y numerados. Marca el paso actual con
  `aria-current="step"` y pinta encima del contenido «Paso <n> de <m>» y el título del paso actual.
  *Test:* `components/FormularioPorPasos.test.tsx` — «R1: numera los pasos, marca el actual y pinta "Paso n de m"».
- **R2.** DONDE la prop de orientación sea `vertical`, el componente DEBE pintar los pasos en una columna al
  lado del contenido. DONDE sea `horizontal`, en una fila encima del contenido.
  *Test:* `components/FormularioPorPasos.test.tsx` — «R2: la orientación de la prop llega al contenedor».
- **R3.** MIENTRAS la pantalla mida menos de 768 px de ancho, el componente DEBE pintar los pasos en
  horizontal, sea cual sea la prop.
  *Test:* `components/FormularioPorPasos.test.tsx` — «R3: en pantalla angosta pasa a horizontal» (con `matchMedia` simulado).
- **R4.** SI el navegador no expone `matchMedia`, ENTONCES el componente DEBE usar la orientación de la prop
  sin fallar.
  *Test:* `components/FormularioPorPasos.test.tsx` — «R4: sin matchMedia usa la prop».
- **R5.** El componente DEBE deshabilitar los pasos aún no visitados. CUANDO se elige un paso ya visitado,
  DEBE avisar a quien lo usa con el id de ese paso.
  *Test:* `components/FormularioPorPasos.test.tsx` — «R5: no visitado deshabilitado; visitado llama a onIr».

### Pasos del formulario de planes (crear y editar)

- **R6.** El formulario de crear (pantalla Planes) y el de editar (detalle del plan) DEBEN abrirse en el
  Sheet ancho. Los dos modos usan el mismo componente de pasos y el mismo componente para cada paso.
  *Test:* `components/PlanesModule.test.tsx` y `components/PlanDetalle.test.tsx` — «R6: el panel abre el formulario por pasos».
- **R7.** CUANDO se crea un plan, el formulario DEBE ofrecer los pasos General, Precio y descuentos, Cobro
  por orden, Topes, Módulos y «Revisar y crear». CUANDO se edita, DEBE ofrecer General, Precio y descuentos,
  Cobro por orden, Topes, Módulos, «Cuándo rige» y «Revisar y programar». El formulario abre en General.
  *Test:* `components/PlanFormPasos.test.tsx` — «R7: pasos al crear» y «R7: pasos al editar».
- **R8.** El paso General DEBE pedir Nombre y Visibilidad. CUANDO se crea un plan custom, General DEBE pedir
  además Empresa y Tipo de cobro. Según la empresa, pide también «Inicio del período» (empresa sin plan) o
  «Rige desde» (empresa con plan). Rangos, valores por defecto, textos y carga útil son los de hoy
  (planes-custom D4, SLT-86 R16/R25).
  *Test:* `components/PlanFormCustomAsigna.test.tsx` (adaptado) — sus casos de hoy, navegando hasta «Revisar y crear».
- **R9.** CUANDO se edita, el paso General DEBE mostrar la Visibilidad del plan deshabilitada, con el texto
  «No se cambia después de crear el plan.». La visibilidad no viaja a la action.
  *Test:* `components/PlanFormPasos.test.tsx` — «R9: al editar la visibilidad está deshabilitada con su texto».
- **R10.** El paso Precio y descuentos DEBE pedir «Sin precio» o «Con monto» y, con monto, el costo base
  mensual, como hoy. Los descuentos van como lista de líneas. Cada línea tiene período, valor, tipo («Fijo»
  o «%») y un botón para quitarla. Cada línea viaja a la action como el descuento de su período, con el tipo
  elegido. Cambiar el tipo de una línea no borra su valor.
  *Test:* `components/PlanFormDescuentos.test.tsx` (reescrito) — «R10: cada línea viaja como el descuento de su período» y «R10: cambiar el tipo conserva el valor».
- **R11.** CUANDO se pulsa «Agregar descuento», el formulario DEBE añadir una línea con el primer período sin
  línea, en el orden quincenal, mensual, bimestral, anual, y con tipo «%». El selector de período de una
  línea NO DEBE ofrecer los períodos que ya usa otra línea. MIENTRAS los cuatro períodos tengan línea,
  «Agregar descuento» DEBE estar deshabilitado.
  *Test:* `components/PlanFormDescuentos.test.tsx` — «R11: agrega el primer período libre», «R11: no repite período» y «R11: con cuatro líneas no agrega más».
- **R12.** SI la lista de descuentos está vacía, ENTONCES el paso DEBE mostrar «Sin descuentos. Todas las
  empresas pagan el costo base completo.» y la petición sale sin descuentos. CUANDO se quita una línea, su
  período deja de viajar.
  *Test:* `components/PlanFormDescuentos.test.tsx` — «R12: lista vacía» y «R12: quitar una línea».
- **R13.** CUANDO se edita, la lista de descuentos DEBE abrir con los descuentos del plan, una línea por
  período, en el orden de los períodos.
  *Test:* `components/PlanFormDescuentos.test.tsx` — «R13: al editar abre con los descuentos del plan».
- **R14.** El paso Cobro por orden DEBE ofrecer los dos modos de hoy, «Fijo» y «Porcentual», con sus campos.
  En «Fijo», el campo vacío es el valor global de la plataforma, con su ayuda de hoy. No hay un tercer modo.
  El paso incluye también «Facturación de órdenes» (SLT-118 R35).
  *Test:* `components/PlanFormCostoPorcentual.test.tsx`, `components/PlanFormCosteo.test.tsx` y `components/PlanFormPeriodicidad.test.tsx` (adaptados); «R14: solo dos modos» en `components/PlanFormPasos.test.tsx`.
- **R15.** El paso Topes DEBE pedir un tope por rol y el de API keys (vacío = sin límite). El paso Módulos DEBE
  pedir los módulos incluidos. Los dos funcionan como hoy.
  *Test:* `components/PlanForm.test.tsx` (adaptado) — «R14: envía a la action nombre, custom con su empresa, topes…».
- **R16.** CUANDO se edita y el costo base del formulario difiere del del plan guardado, el formulario DEBE
  mostrar «Hoy: <costo base del plan>» bajo el costo base. CUANDO un tope difiere del del plan, DEBE mostrar
  «Hoy: <tope del plan>» bajo ese tope, con «sin límite» si el plan no lo tiene. SI el valor no difiere, o
  si se está creando, ENTONCES no muestra «Hoy».
  *Test:* `components/PlanFormPasos.test.tsx` — «R16: "Hoy" solo bajo lo que cambia al editar» y «R16: al crear no hay "Hoy"».
- **R17.** CUANDO se edita, el paso «Cuándo rige» DEBE mostrar los controles de hoy. Si el precio cambia,
  muestra «Rige desde», con mañana por defecto (SLT-86 R22/R23). Si no cambia, muestra «Aplicar», con «De
  inmediato» o «A partir de» y su fecha (SLT-58).
  *Test:* `components/PlanForm.test.tsx` (adaptado) — casos de «Aplicar» y «Rige desde» de hoy, navegando hasta «Cuándo rige».

### Navegación

- **R18.** CUANDO se pulsa «Siguiente», el formulario DEBE validar con el mismo esquema de la action solo los
  campos del paso actual. SI alguno tiene error, ENTONCES no avanza, pinta cada error junto a su campo y lleva
  el foco al primero. SI no hay errores, ENTONCES pasa al paso siguiente.
  *Test:* `components/PlanFormPasos.test.tsx` — «R18: General sin nombre no avanza y enfoca Nombre» y «R18: un error de otro paso no bloquea».
- **R19.** CUANDO se pulsa Enter dentro de un paso que no es el último, el formulario DEBE actuar como
  «Siguiente» y NO DEBE llamar a la action.
  *Test:* `components/PlanFormPasos.test.tsx` — «R19: Enter en un paso intermedio avanza y no guarda».
- **R20.** CUANDO se pulsa «Anterior» o se elige en la lista un paso ya visitado, el formulario DEBE cambiar a
  ese paso sin validar. Lo escrito en cualquier paso se conserva.
  *Test:* `components/PlanFormPasos.test.tsx` — «R20: volver y saltar a visitados conserva lo escrito».
- **R21.** CUANDO cambia el paso, el formulario DEBE llevar el foco al título del paso nuevo.
  *Test:* `components/PlanFormPasos.test.tsx` — «R21: el foco va al título del paso».

### Revisar y guardar

- **R22.** CUANDO se crea, el paso «Revisar y crear» DEBE listar los valores finales del plan, cada uno con su
  clave en negrita.
  *Test:* `components/PlanFormRevisar.test.tsx` — «R22: al crear lista los valores finales»; `unit/planes/plan-form-revision.test.ts` — «R22: filas al crear».
- **R23.** CUANDO se edita, el paso «Revisar y programar» DEBE listar solo lo que cambia, con la clave en
  negrita y «<antes> → <después>». También lleva la fila de cuándo rige: la fecha de «Rige desde» o de «A
  partir de», o «De inmediato». SI no cambia nada, ENTONCES muestra «Sin cambios.».
  *Test:* `components/PlanFormRevisar.test.tsx` — «R23: solo lo que cambia» y «R23: sin cambios»; `unit/planes/plan-form-revision.test.ts` — «R23: filas al editar».
- **R24.** El formulario DEBE guardar solo desde el último paso y con una sola llamada a la action. El botón
  dice «Crear plan» al crear, «Programar cambio» al editar con «A partir de» y «Guardar» en el resto. La
  petición es la misma de hoy. MIENTRAS la petición está en vuelo, el botón muestra que carga y no admite
  otra. CUANDO la action responde `ok`, llama a `onGuardado` con el resultado y el nombre, como hoy.
  *Test:* `components/PlanForm.test.tsx` (adaptado) — los casos de carga útil y «en vuelo» de hoy.
- **R25.** CUANDO al guardar el esquema o la action devuelven errores de campo, el formulario DEBE ir al paso
  del primer campo con error, en el orden de pantalla. Allí pinta los errores y lleva el foco a ese campo.
  CUANDO se crea un custom y la action responde que la empresa ya no existe, DEBE ir a General con el error
  junto a Empresa.
  *Test:* `components/PlanFormPasos.test.tsx` — «R25: un validation_error de un tope lleva al paso Topes» y «R25: empresa que ya no existe lleva a General».
- **R26.** SI un error o un rechazo no tiene campo visible, o la action lanza, ENTONCES el formulario DEBE
  pintarlo en el aviso general del último paso, llevar el foco al aviso y conservar lo escrito. Los textos
  son los de hoy (`RECHAZOS`).
  *Test:* `components/PlanForm.test.tsx` (adaptado) — los casos de rechazo y de fallo de red de hoy.

### Vista previa de topes del custom

- **R27.** CUANDO se crea un custom para una empresa sin plan, el paso Topes DEBE mostrar la vista previa del
  uso contra los topes: los avisos o, si falla, su texto con «Reintentar». Funciona como hoy
  (planes-custom D13/D17).
  *Test:* `components/PlanFormVistaPreviaCustom.test.tsx` (adaptado) — sus casos de hoy, en el paso Topes.
- **R28.** MIENTRAS la vista previa carga o falló, el botón final DEBE estar deshabilitado. Junto a él, el
  formulario DEBE explicar por qué y ofrecer un enlace que lleva al paso Topes.
  *Test:* `components/PlanFormVistaPreviaCustom.test.tsx` — «R28: botón final bloqueado con su motivo y enlace a Topes».

### Cobertura de las decisiones

| Decisión | Requisitos |
|---|---|
| Partir SLT-130 (solo UI) | R24 (mismas actions, misma petición) |
| Fecha al editar sin SLT-144 | R17, R23 |
| Navegación sin borrador | R18, R19, R20, R25 |
| Orientación | R2, R3, R4 |
| Campos de crear custom | R8 |
| E2E | Todos los `Test:` son de componente o unitarios |
| Corte: una sola ficha | Proceso (tamaño aceptado), sin requisito |
| «Valor global» en Cobro por orden | R14 |
| «Hoy: <valor>» al editar | R16 |
| Visibilidad al editar | R9 |
| Vista previa de topes del custom | R27, R28 |
| Mismos pasos para crear y editar | R6, R7 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-13 | Partir SLT-130 | Solo UI; lo que depende de SLT-128, SLT-129 y SLT-135 pasa a SLT-144 (humano). |
| 2026-11-13 | Fecha al editar sin SLT-144 | El paso «Cuándo rige» entra ya, con los controles de hoy (de inmediato o fecha, y «Rige desde» del precio, SLT-86 R22/R23). SLT-144 solo cambia su contenido. |
| 2026-11-13 | Navegación sin borrador | «Siguiente» valida el paso actual con el mismo esquema que la action y no avanza con errores. Volver atrás y saltar a pasos ya visitados es libre. Si la action rechaza algo, el formulario lleva al paso del campo. |
| 2026-11-13 | Orientación | Prop `vertical` / `horizontal`. Vertical en escritorio; pasa sola a horizontal en pantallas angostas. |
| 2026-11-13 | Campos de crear custom | Visibilidad, empresa, «Inicio del ciclo» y fecha de efecto (planes-custom D4, SLT-86 R16/R25) se heredan tal cual y van en el paso General. |
| 2026-11-13 | E2E | No: planes no es un flujo crítico de `docs/checkpoints-proyecto.md`. Tests de componente. |
| 2026-11-13 | Corte por tamaño | Una sola ficha, tamaño aceptado (humano: «Una sola, tamaño aceptado»). SLT-130 entera como está sembrada. El leader escribió `tamano-pr-aceptado` en `progress/features/SLT-130.md`. |
| 2026-11-13 | «Valor global» en Cobro por orden (maqueta) | No, como hoy: dos modos; el campo vacío en «Fijo» es la tarifa global, con su ayuda (humano). |
| 2026-11-13 | «Hoy: <valor>» bajo costo base y topes que cambian al editar | Sí, entra (humano). |
| 2026-11-13 | Visibilidad al editar | Sí, deshabilitada con «No se cambia después de crear el plan.» (humano). |
| 2026-11-13 | Vista previa de topes del custom | En el paso «Topes». Si bloquea el botón final, junto a él se explica por qué, con enlace al paso «Topes» (humano). |
| 2026-11-13 | Mismos pasos para crear y editar | Un solo `PlanForm` por pasos y un solo componente por paso, compartidos por los dos modos. La diferencia de modo va por props o condiciones dentro del paso. Nada de componentes por modo ni dos formularios. El componente de pasos es el mismo (humano). |
