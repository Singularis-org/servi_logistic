# SLT-54 — pantalla-tarifas · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: SLT-52 · Rama: feature/SLT-54-pantalla-tarifas
> Épica: EP-8 Tarifas flexibles
>
> **Alcance.** Módulo de Tarifas nuevo en `/configuracion/tarifas`, que reemplaza la pantalla actual
> y pasa por `/design` antes de implementarse. Por zona y por grupo de distritos se configuran: cobro
> a la tienda (general y por tienda, con su IVA), pago al mensajero (por vehículo) y valores por
> resultado del mensajero y de la satélite (sin IVA). Incluye los grupos, con la zona especial como
> un grupo más. Lo digitado no rige hasta que el maestro pulsa «Activar tarifas nuevas». Incluye los
> huecos heredados de SLT-52 y reescribir `e2e/zona-especial-dos-empresas.spec.ts`.
>
> **Lo que NO entra.** Migrar las tarifas actuales: SLT-53 se canceló, las digita el cliente. Valor
> propio del mensajero → SLT-55. Retirar el modelo viejo → SLT-57. Incentivo manual a la satélite →
> SLT-78. Tope de intentos → SLT-77.
>
> Sembrado por `/afinar-feature` el 2026-11-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**Glosario.** *Activación*: el acto único por empresa, con fecha y actor, que hace regir el modelo
nuevo. *Empresa activada*: la que tiene su activación. *Modelo viejo* y *modelo nuevo*, *concepto*,
*valor*, *grupo* y *sin tarifa*: como en SLT-52. *Nivel*: zona, grupo o tienda, cada uno con sus
variantes de SLT-52 R5 y R6. *Referencia*: lo que rige hoy, mostrado junto a un campo sin copiarlo.
*Esencial*: concepto cuya ausencia cuenta como faltante. Los requisitos marcados *(propuesto, Pn)*
son la propuesta de `spec_author` a la pregunta abierta Pn: se prueban como están escritos si Carlos
la acepta.

### Activación e interruptor

- **R1.** MIENTRAS una empresa no está activada, el sistema DEBE calcular cobro y pago con el modelo
  viejo, también si tiene valores guardados en el modelo nuevo, y DEBE dar, centavo a centavo, los
  mismos importes que sin esos valores en listado, cierre, wallets, carga y lectura por API key,
  cotización, cobro por rechazo y corrección de datos. Enmienda SLT-52 R36.
- **R2.** MIENTRAS una empresa está activada, el sistema DEBE calcular todo su cobro y su pago con el
  modelo nuevo, sin leer el viejo y sin mezclarlos, aunque no tenga ningún valor guardado. Enmienda
  SLT-52 R37.
- **R3.** CUANDO se fija o se quita un valor, o se crea, cambia o borra un grupo, el sistema NO DEBE
  cambiar el modelo con que calcula la empresa.
- **R4.** CUANDO el `maestro` activa las tarifas nuevas, el sistema DEBE guardar la activación con su
  fecha y su actor y DEBE registrar el hecho en el historial de acciones, en la misma transacción.
- **R5.** SI quien pide activar no es `maestro`, ENTONCES el sistema DEBE responder `forbidden` sin
  escribir nada.
- **R6.** SI hay faltantes y la petición de activar no trae la confirmación expresa, ENTONCES el
  sistema NO DEBE activar y DEBE responder con la lista de faltantes calculada en el servidor; CON esa
  confirmación, el sistema DEBE activar aunque haya faltantes.
- **R7.** SI la empresa ya está activada, también por dos peticiones simultáneas, ENTONCES el sistema
  NO DEBE crear una segunda activación ni una segunda fila de historial, y DEBE responder «ya
  activada» sin error.
- **R8.** El sistema NO DEBE ofrecer en ninguna pantalla volver atrás una activación, y la base DEBE
  rechazar modificar o borrar una activación con el rol de la aplicación.
- **R9.** CUANDO se activa, el sistema NO DEBE modificar ningún valor nuevo, ninguna fila de `tarifas`
  ni de `tarifa_zona_mensajero`, ninguna marca de zona especial ni ningún importe de un cierre ya
  creado.
- **R10.** SI la activación ocurre mientras se crea un cierre de esa empresa y el cobro y el pago
  salen de modelos distintos, ENTONCES el sistema DEBE abortar esa creación sin escribir nada.
- **R11.** El sistema DEBE crear la activación con migraciones de esquema que traigan su `down.sql`.
  CUANDO se aplican, cada empresa con al menos un valor en `tarifa_valor` DEBE quedar activada, las
  demás NO DEBEN quedar activadas y ninguna otra fila de negocio DEBE cambiar.
- **R12.** MIENTRAS la empresa activa es A, el sistema NO DEBE leer, crear ni considerar la activación
  de otra empresa, tampoco con SQL a mano: activar A NO DEBE cambiar el modelo de B.

### Lista de lo que falta

- **R13.** *(propuesto, P1)* El sistema DEBE tratar como esenciales de una zona el flete por entregado
  a la tienda, el flete por devolución a origen a la tienda y el pago al mensajero por entregado. Los
  demás conceptos NO DEBEN contar como faltantes.
- **R14.** *(propuesto, P1)* SI un esencial no se resuelve con ningún valor de nivel zona o grupo para
  una zona o para un grupo de ella, siguiendo la precedencia de SLT-52, ENTONCES el sistema DEBE
  contarlo como faltante. Un 0 escrito NO DEBE contar como faltante (SLT-52 R23) y un precio de tienda
  NO DEBE cubrir a la zona.
- **R15.** *(propuesto, P1)* El pago al mensajero por entregado DEBE contar como cubierto si existe el
  valor para todos los vehículos o si existe un valor por cada vehículo activo del catálogo.
- **R16.** *(propuesto, P1)* SI un grupo no tiene valor propio en un esencial y su zona sí, ENTONCES el
  sistema NO DEBE contarlo como faltante y DEBE informarlo en la lista como «usa el valor de la zona».
- **R17.** El sistema DEBE mostrar por zona su estado: «Completa» sin faltantes, «Faltan N» con N
  faltantes y «Sin empezar» si no tiene ningún valor de nivel zona o grupo; y DEBE mostrar «M de T
  zonas completas» con esos mismos estados.
- **R18.** CUANDO el `maestro` pide activar, el sistema DEBE mostrar un diálogo con el efecto de
  activar, los faltantes por zona con un enlace «Completar» que lleva a esa zona, y dos salidas:
  seguir digitando o activar. SI hay faltantes, ENTONCES la acción de activar DEBE permanecer
  deshabilitada hasta marcar la casilla de confirmación; SI no los hay, la casilla NO DEBE mostrarse.
- **R19.** El diálogo DEBE avisar que lo vacío se cobra y se paga en 0 y que, sin flete por entregado,
  la API por key responde «sin tarifa», de forma coherente con SLT-52 R24, R25 y R51.

### Referencia «Hoy rige»

- **R20.** MIENTRAS la empresa no está activada, la pantalla DEBE mostrar junto a cada campo su
  referencia, y NO DEBE copiarla al campo: un campo sin valor nuevo DEBE seguir vacío y no se guarda.
- **R21.** El sistema DEBE obtener la referencia con la misma selección de fila y las mismas funciones
  de importe del cálculo real del modelo viejo: cascada tienda y zona, variante de zona de bodega
  principal, marca de zona especial con su pacto y caída al flete normal, y pago por zona y vehículo
  con caída al valor por defecto de la zona.
- **R22.** La referencia DEBE distinguir: un importe o porcentaje, con su IVA en los cobros a la
  tienda; «No cobra» o «No paga» si el cálculo viejo no cobra o no paga ese resultado sea cual sea la
  tarifa; un 0 configurado, como importe en 0; y «Sin tarifa» si ninguna fila aplica.
- **R23.** SI la referencia de un campo da valores distintos entre los distritos de un grupo, entre
  las variantes de una tienda en todas sus zonas o entre los vehículos, ENTONCES el sistema DEBE
  mostrar «Varía» con el menor y el mayor.
- **R24.** MIENTRAS la empresa está activada, el sistema NO DEBE mostrar la columna de referencia ni
  leer `tarifas` ni `tarifa_zona_mensajero` para la pantalla.

### Pantalla vieja y vías de escritura del modelo viejo

- **R25.** `/configuracion/tarifas` DEBE servir la pantalla nueva, sin el formulario de tarifas por
  tienda ni su listado.
- **R26.** Ninguna Server Action DEBE crear, actualizar ni borrar filas de `tarifas`: `crearTarifa`,
  `actualizarTarifa`, `borrarTarifa` y `listarTarifas` DEBEN dejar de existir. Enmienda SLT-51 R13.
- **R27.** SI `crearZona` recibe `cobroVehiculo` en verdadero o `tarifas` con filas, o `actualizarZona`
  recibe `cobroVehiculo` o `tarifas`, ENTONCES la action DEBE responder `validation_error` sin
  escribir. Enmienda SLT-51 R9 solo en la action.
- **R28.** La Server Action `actualizarDistritosEspeciales` DEBE dejar de existir: ninguna pantalla
  DEBE escribir la marca de zona especial.
- **R29.** CUANDO se guardan valores o grupos desde la pantalla, antes o después de activar, el sistema
  NO DEBE escribir en `tarifas`, `tarifa_zona_mensajero`, `distrito_zona_especial` ni en
  `zona.cobro_vehiculo`.
- **R30.** MIENTRAS la empresa no está activada, el Excel de cobertura DEBE seguir marcando «tarifa
  general» con el modelo viejo; MIENTRAS está activada, DEBE marcarla si la zona tiene flete por
  entregado propio de nivel zona.

### Empresa nueva

- **R31.** El alta de una empresa NO DEBE crearle activación. Una empresa sin tarifas viejas DEBE
  seguir el mismo camino: referencia «Sin tarifa», botón de activar y lista de faltantes.
- **R32.** MIENTRAS una empresa sin tarifas no tiene valores que cubran el cobro, activada o no, el
  cierre DEBE registrar 0 sin bloquear y la carga y la cotización por API key DEBEN responder 409.

### Edición de valores

- **R33.** La pantalla DEBE organizar la edición en lista de zonas, selector de nivel («Toda la zona»,
  cada grupo de la zona y tienda con precio propio) y las pestañas «Cobro a la tienda», «Pago al
  mensajero» y «Pago a la satélite», con los conceptos que da el catálogo: 7, 5 y 5 hoy, y uno nuevo
  del catálogo aparece sin tocar la pantalla.
- **R34.** La pantalla DEBE permitir elegir por concepto el modo, monto o porcentaje, y digitar el
  valor; y, solo en «Cobro a la tienda», el IVA. Las pestañas de pago NO DEBEN mostrar campo de IVA.
- **R35.** CUANDO se guarda, el sistema DEBE fijar los conceptos con valor cambiado y quitar los que
  se vaciaron; un concepto sin cambios NO DEBE escribir ni dejar historial.
- **R36.** CUANDO se fija un pago al mensajero o a la satélite, la petición NO DEBE incluir la clave
  `ivaPct`.
- **R37.** SI un guardado choca con otro cambio simultáneo del mismo concepto y nivel, ENTONCES la
  pantalla DEBE mostrar el mensaje de validación en la fila de ese concepto, sin error genérico.
- **R38.** SI en un guardado falla un concepto, ENTONCES el sistema DEBE conservar los demás conceptos
  ya guardados y la pantalla DEBE mostrar el error en la fila que falló, conservando lo digitado.
- **R39.** La pantalla DEBE decir por nivel qué significa vacío: en la zona, «Sin definir»; en grupo,
  tienda o vehículo, que usa el nivel siguiente; y DEBE decir que un 0 escrito vale 0.
- **R40.** MIENTRAS la empresa está activada, la pantalla DEBE mostrar «En vigor desde <fecha>», sin la
  banda de borrador, y DEBE seguir permitiendo editar; CUANDO se guarda, DEBE decir que el cambio
  aplica desde el siguiente cierre y que los cierres hechos no cambian.
- **R41.** La pantalla DEBE listar los precios propios de las tiendas con tienda, alcance (todas sus
  zonas, una zona o un grupo) y fletes, y DEBE permitir añadirlos, editarlos y quitarlos, ofreciendo
  solo cuentas de rol `adminTienda` o `apiKey`.

### Grupos y zona especial

- **R42.** La pantalla DEBE permitir crear un grupo en una zona, renombrarlo, cambiar sus distritos y
  borrarlo, ofreciendo solo distritos de esa zona e indicando los que ya están en otro grupo; un
  rechazo de SLT-52 R11 DEBE mostrarse nombrando el distrito.
- **R43.** CUANDO se va a borrar un grupo con valores, la pantalla DEBE pedir confirmación diciendo
  cuántos valores se borran con él.
- **R44.** La zona especial DEBE configurarse como un grupo más, sin campo, nombre ni tratamiento
  propios.
- **R45.** MIENTRAS la empresa no está activada, el selector de distritos DEBE mostrar, de solo
  lectura, los distritos con marca de zona especial de la empresa; MIENTRAS está activada, NO DEBE
  mostrarla.
- **R46.** El sistema DEBE permitir que un mismo distrito esté marcado como zona especial y en un grupo
  sin que ninguno cambie al otro: antes de activar calcula la marca y tras activar, el grupo.

### Pago por vehículo

- **R47.** MIENTRAS el pago distinto por vehículo está encendido, la tabla DEBE tener «Todos los
  vehículos» y una columna por cada vehículo `activo` del catálogo, en orden por nombre, sin ningún
  vehículo escrito en el código, en «Pago al mensajero» y «Pago a la satélite», en nivel zona y grupo.
- **R48.** CUANDO se da de alta un vehículo en el catálogo, su columna DEBE aparecer en la siguiente
  carga de la pantalla en toda empresa, sin escribir nada en la empresa.
- **R49.** El interruptor «Pagar distinto por vehículo» DEBE encenderse solo si esa zona o grupo y esa
  pestaña tienen algún valor por vehículo, o mientras se digita; NO DEBE leer ni escribir
  `zona.cobro_vehiculo`.
- **R50.** CUANDO se apaga el interruptor con valores por vehículo guardados, la pantalla DEBE pedir
  confirmación con cuántos se quitarán; SI se cancela, ENTONCES NO DEBE cambiar nada. Sin vehículos en
  el catálogo, el interruptor DEBE estar deshabilitado con su motivo.
- **R51.** MIENTRAS un vehículo está inactivo, NO DEBE aparecer como columna para digitar, salvo que ya
  tenga un valor guardado en esa zona o grupo y esa pestaña; en ese caso DEBE verse marcado como
  inactivo, con sus celdas con valor editables y quitables y las vacías deshabilitadas.
- **R52.** SI se pide fijar un valor nuevo para un vehículo inactivo en un nivel donde no hay valor,
  ENTONCES el sistema DEBE responder `validation_error` en `vehiculoId`, sin escribir; reemplazar o
  quitar uno existente DEBE seguir siendo válido.
- **R53.** MIENTRAS un mensajero tiene un vehículo inactivo con valor guardado, el sistema DEBE seguir
  pagándole ese valor (SL-42 R18 y SLT-52 R19).
- **R54.** SI las columnas no caben, la tabla DEBE desplazarse en horizontal dentro de su contenedor,
  la columna de conceptos DEBE quedar fija y la página NO DEBE ganar scroll horizontal.

### Permisos, vistas y estados

- **R55.** SI el rol es `maestro`, la pantalla DEBE permitir editar y activar; SI es `admin`, DEBE
  mostrar los mismos datos en solo lectura, sin controles de escritura ni de activar; SI es otro rol o
  no hay sesión, DEBE mostrar solo el aviso de permiso. Reconcilia la página de hoy con SLT-52 R13.
- **R56.** *(propuesto, P2)* MIENTRAS el rol es `admin`, el menú DEBE mostrarle «Tarifas» como ítem
  propio, sin cambiar su destino tras el login; ningún otro rol distinto de `maestro` DEBE verlo.
- **R57.** SI la lectura de la pantalla falla, ENTONCES DEBE mostrar un error con reintento, y NO un
  estado vacío; SI la empresa no tiene zonas, ENTONCES DEBE mostrar un estado vacío que enseña a crear
  zonas y enlaza a `/configuracion/zonas`; SI una zona no tiene grupos o no hay precios de tienda,
  ENTONCES DEBE enseñar el siguiente paso.
- **R58.** MIENTRAS cargan los valores de una zona, el panel DEBE mostrar un esqueleto; MIENTRAS se
  guarda o se activa, el botón DEBE mostrar su estado de carga y no admitir un segundo envío.
- **R59.** A 390 px de ancho, la pantalla DEBE apilar lista de zonas y panel, sin scroll horizontal de
  página y con objetivos táctiles de al menos 44 px en botones, pestañas e interruptores.
- **R60.** En modo oscuro, la banda, los estados y la marca de inactivo DEBEN usar los tokens de
  `DESIGN.md`, sin colores fijos, con texto de contraste de al menos 4,5:1.
- **R61.** La pantalla DEBE sacar símbolo y formato de moneda de `lib/config/moneda.ts` y los nombres
  de nivel geográfico de las etiquetas del país; el IVA NO DEBE traer un porcentaje escrito en el
  código. *(propuesto, P3: el campo nace vacío)*

### Huecos heredados de SLT-52

- **R62.** MIENTRAS un cierre tiene conceptos congelados del modelo nuevo, su detalle de administración
  DEBE mostrar fulfillment e IVA de fulfillment, fuera de «Total cobrado», solo para quien tiene acceso
  a ese dato (ficha 481). La fila desplegada y la descarga DEBEN leer ese mismo fulfillment.
- **R63.** MIENTRAS una gestión está en el modelo nuevo, la tarjeta de cobros DEBE mostrar sus conceptos
  congelados con su importe y su total, sin filas de variante de bodega principal ni de pacto especial,
  y NO DEBE decir que la tienda no tenía tarifa. Los cierres del modelo viejo DEBEN verse como hoy.
- **R64.** SI una orden del modelo nuevo no tiene congelado el concepto de un movimiento, ENTONCES el
  detalle por orden de ese movimiento NO DEBE listarla ni contarla, en vez de mostrarla con 0,00.
- **R65.** MIENTRAS un cierre está en el modelo nuevo, la etiqueta del flete que no es de entrega DEBE
  nombrar lo que suma: por gestión, su resultado; en totales, los fletes de gestiones no entregadas.
- **R66.** MIENTRAS la empresa está activada, la columna «Fulfillment» de órdenes, monitoreo y recibidas
  DEBE mostrar el fulfillment del resolver único, sin depender de `relaciones.tienda.tarifa`.

### E2E y verificación

- **R67.** Un E2E DEBE recorrer: el `maestro` digita, un cierre sigue cobrando y pagando con el modelo
  viejo, activa con faltantes confirmados, y el siguiente cierre cobra y paga con lo digitado, sin
  cambiar el cierre anterior.
- **R68.** Un E2E con dos empresas DEBE probar que los valores, grupos y activación de A no se ven ni
  actúan en B, y que `admin` lee sin poder escribir.
- **R69.** `e2e/zona-especial-dos-empresas.spec.ts` DEBE correr sin `fixme` contra la pantalla nueva, y
  su excepción en la guardia `e2e-sin-saltos` DEBE desaparecer antes de su vencimiento (2026-11-30).
- **R70.** La pantalla DEBE cumplir las medidas de `design.md > §12`, comprobadas con el navegador a
  1360 y 390 px, y la disposición DEBE quedar atada por tests.

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| ¿Se migran las tarifas actuales? | R9, R20 (no se copia nada) |
| ¿Cómo entra en vigor lo digitado? | R1, R2, R3, R4, R5, R67 |
| ¿Si al activar falta algo? | R6, R13-R19 |
| ¿Se puede volver atrás? | R8, R9, R40, R67 |
| ¿Y la pantalla vieja mientras digita? | R20-R29, R45 |
| ¿Empresa nueva, sin tarifas viejas? | R31, R32 |
| ¿Empresa que ya tenga valores nuevos al desplegar? | R11 |
| Permisos | R5, R55 |
| Valores | R34, R36 |
| Precedencia y grupos | R14, R42 |
| Zona especial | R44, R45, R46, R69 |
| Huecos de SLT-52 | R36, R37, R62, R63, R64 |
| E2E | R67, R68, R69 |
| Salida | R11 (sin datos movidos), `tasks.md > Tanda F` (no se despliega suelta) |
| ¿Vehículo inactivo en Tarifas? | R51, R52, R53 |

## Preguntas abiertas

Para Carlos. Ninguna bloquea el resto del spec; los requisitos afectados dicen *(propuesto, Pn)*.

- **P1. ¿Qué cuenta como faltante?** Propuesta: tres esenciales por zona (flete por entregado, flete
  por devolución a origen y pago al mensajero por entregado), y un grupo sin valor propio no falta si
  su zona lo tiene: se informa como «usa el valor de la zona». Es lo que hace el cálculo (SLT-52 R16,
  R19) y es lo único que dejaría «sin tarifa». Diferencia con la maqueta: `Activar` lista como falta
  los fletes del grupo «Zona especial» de Limón. Si Carlos prefiere contarlos, un grupo sin esos
  fletes cuenta como faltante aunque cobre el valor de la zona, y el aviso «queda en 0» habría que
  matizarlo porque ahí no sería cierto. Tampoco cuenta la comisión COD: una zona sin ella cobra 0 de
  comisión sin aparecer en la lista.
- **P2. ¿El `admin` ve «Tarifas» en su menú?** `Configuración` es solo de `maestro` y SLT-52 R13 solo
  dice que `admin` lee. Propuesta: ítem propio al final de su menú (R56). Alternativa: leer solo
  entrando por URL.
- **P3. ¿El IVA viene prellenado?** La maqueta pinta 13 de ejemplo, pero no hay ningún IVA por defecto
  en configuración ni por país, y un 13 fijo sería un literal de país. Propuesta: nace vacío y es
  obligatorio al digitar un cobro; la referencia enseña el de hoy. Coste: digitarlo concepto por
  concepto. Si se quiere prellenar, hace falta decidir de dónde sale.
- **P4. ¿Qué dice el Excel de cobertura de «zona especial» tras activar?** Hoy lee la marca
  `distrito_zona_especial`, que tras activar ya no decide dinero (SLT-52 R35) y ya no se edita.
  Propuesta: sin cambio hasta SLT-57, que retira la marca. Coste: la columna se queda congelada.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-04 | ¿Se migran las tarifas actuales? | No. La empresa usuaria las digita aquí, sin corregir nada por nosotros (ni los 2.000 a la satélite ni las 3 tiendas con precio propio): son datos del cliente. |
| 2026-11-04 | ¿Cómo entra en vigor lo digitado? | Con el botón «Activar tarifas nuevas» del maestro. Hasta entonces la empresa cobra y paga con el modelo viejo aunque tenga valores nuevos. Enmienda R36/R37 de SLT-52: decide la activación, no la existencia de un valor. |
| 2026-11-04 | ¿Si al activar falta algo? | Lista lo que falta por zona y pide confirmación expresa. No bloquea. Lo vacío se resuelve como «sin tarifa», según SLT-52. |
| 2026-11-04 | ¿Se puede volver atrás? | No desde la pantalla. Los errores se corrigen editando el valor y aplican desde el siguiente cierre. Los cierres hechos no cambian. |
| 2026-11-04 | ¿Y la pantalla vieja mientras digita? | La nueva la reemplaza. Antes de activar muestra junto a cada campo el valor vigente como referencia («Hoy: 2.800»), sin copiarlo. Hasta activar, los precios viejos no se editan por pantalla. |
| 2026-11-04 | ¿Empresa nueva, sin tarifas viejas? | Mismo camino: también activa. Una sola regla. |
| 2026-11-04 | ¿Empresa que ya tenga valores nuevos al desplegar? | Queda activada, para que su cálculo no cambie. |
| heredado | Permisos | Solo `maestro` escribe; `admin` lee (SLT-52 R13). |
| heredado | Valores | Monto o % por concepto; `Decimal`; solo los cobros a la tienda llevan IVA (SLT-52). |
| heredado | Precedencia y grupos | La de SLT-52 (R5, R6, R11, R19). Un distrito, a lo sumo un grupo por zona. |
| heredado | Zona especial | Es un grupo más y se configura desde Tarifas (SL-38, SLT-51). |
| heredado | Huecos de SLT-52 | Fulfillment e `ivaFulfillment` en el detalle del cierre; tarjeta «tarifa aplicada» en el modelo nuevo; aporte por orden sin el concepto; al fijar un pago no mandar `ivaPct`; la carrera al fijar el mismo nivel se muestra como validación. |
| heredado | E2E | Obligatorio: toca importes. Reescribir `zona-especial-dos-empresas` y quitar su excepción antes del 2026-11-30 (SLT-51). |
| heredado | Salida | La épica sale completa a producción (SLT-51). |
| 2026-11-04 | ¿Vehículo inactivo en Tarifas? | No aparece como columna para digitar, salvo que ya tenga un valor guardado; en ese caso se ve marcado como inactivo. |
