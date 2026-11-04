# SLT-51 — zonas-separadas-de-tarifas · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: feature/SLT-51-zonas-separadas-de-tarifas
> Épica: EP-8 Tarifas flexibles
>
> **Alcance.** Zonas pasa a ser un módulo propio (`/configuracion/zonas`) que solo crea, edita y
> lista zonas: nombre, distritos, «zona de bodega principal» (antes central/GAM) y SINPE. El
> formulario de zona deja de pedir y guardar costos: pago al mensajero (incl. por vehículo),
> tarifa de cobro de la zona y distritos especiales. El botón «Cobertura» se muda a Zonas.
>
> **Lo que NO entra.** Editar costos en otra pantalla, ni siquiera de forma provisional → SLT-54
> (la épica sale completa a producción). Modelo nuevo de tarifas y fin de la variante GAM en el
> cálculo → SLT-52. Cambios en las tarifas por tienda (`TiendasModule`), que siguen como están.
>
> Sembrado por `/afinar-feature` el 2026-10-29. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

«Zonas» es la pantalla `/configuracion/zonas`; «Tarifas» es `/configuracion/tarifas`. «Costos de
zona» son los tres datos que salen del formulario: pago al mensajero (filas de
`tarifa_zona_mensajero` y la bandera `cobroVehiculo`), tarifa de cobro de la zona (fila de
`tarifas` con la zona y sin tienda) y las marcas de distrito especial de la empresa.

**Pantalla y acceso**

- **R1.** El sistema DEBE ofrecer la pantalla «Zonas» en `/configuracion/zonas` y un subítem
  «Zonas» en el menú «Configuración» que apunte a ella, sin cambiar el primer destino post-login de
  ningún rol.
- **R2.** SI quien abre `/configuracion/zonas` no tiene sesión o su rol no es `maestro`, ENTONCES el
  sistema DEBE mostrar solo el aviso de permiso, sin listado, sin formulario y sin «Cobertura»; y SI
  un rol distinto de `maestro` llama a crear, editar, borrar u obtener una zona, ENTONCES el sistema
  DEBE responder `forbidden` sin escribir nada.
- **R3.** La pantalla «Zonas» DEBE listar las zonas de la empresa con su nombre, su número de
  distritos y, en la que la tenga, la marca «Zona de bodega principal», sin mostrar ningún costo de
  zona.

**Formulario sin costos**

- **R4.** El formulario de zona, al crear y al editar, DEBE pedir solo el nombre, los distritos y la
  casilla «Zona de bodega principal», y además el SINPE (número y «A nombre de») solo al crear; y
  NO DEBE mostrar campos de pago al mensajero (tampoco por vehículo), de tarifa de cobro de la zona
  ni el control para marcar un distrito como especial.
- **R5.** CUANDO el maestro crea una zona con nombre, distritos y SINPE válidos, el sistema DEBE
  crearla sin filas de pago al mensajero, con `cobroVehiculo` en falso, sin tarifa de cobro de la
  zona y sin cambiar ninguna marca de distrito especial de la empresa, y DEBE mostrarla en el
  listado de «Zonas».
- **R6.** CUANDO el maestro guarda la edición de una zona desde «Zonas», el sistema DEBE conservar
  sin cambios sus filas de pago al mensajero, su `cobroVehiculo`, su tarifa de cobro de la zona y las
  marcas de distrito especial de la empresa, y NO DEBE registrar en el historial un cambio de pago al
  mensajero.
- **R7.** CUANDO la acción de actualizar zona recibe un payload sin `cobroVehiculo` y sin `tarifas`,
  el sistema DEBE aplicar el nombre, los distritos y la marca de bodega principal, y DEBE dejar
  intactos `cobroVehiculo` y las filas de pago al mensajero de esa zona.
- **R8.** SI la acción de actualizar zona recibe solo uno de `cobroVehiculo` o `tarifas`, ENTONCES
  el sistema DEBE responder `validation_error` sobre el campo que falta y NO DEBE escribir nada.
- **R9.** DONDE el payload de crear o de actualizar zona traiga `cobroVehiculo` y `tarifas`, el
  sistema DEBE aplicar las mismas reglas y los mismos efectos que antes de esta ficha, incluido el
  reemplazo de las filas de pago y su fila de historial.

**Zona de bodega principal**

- **R10.** La pantalla «Zonas» DEBE rotular la marca de zona central como «Zona de bodega
  principal» en la casilla, el listado, el modal de confirmación y los motivos de rechazo al quitar
  la marca y al borrar la zona que la tiene; ningún texto visible de «Zonas» DEBE decir «Zona
  Central» ni «zona central».
- **R11.** CUANDO el maestro va a guardar una zona que gana la marca de bodega principal mientras
  otra la tiene, o que la pierde siendo hoy la que la tiene, el sistema DEBE pedir confirmación antes
  de enviar nada, mostrando cuántas órdenes sin cerrar cambiarían de tarifa de flete; y CUANDO el
  maestro cancela, el sistema NO DEBE enviar el guardado.

**Cobertura, Tarifas y borrado**

- **R12.** La pantalla «Zonas» DEBE mostrar el bloque «Cobertura» con «Descargar cobertura» antes
  del listado, y la pantalla «Tarifas» NO DEBE mostrarlo.
- **R13.** La pantalla «Tarifas» NO DEBE mostrar la sección «Costos por zona» ni crear, editar o
  borrar zonas, y DEBE seguir mostrando las tarifas por tienda como hasta ahora; ninguna pantalla
  DEBE ofrecer un editor de costos de zona en esta ficha.
- **R14.** CUANDO el maestro confirma eliminar una zona desde «Zonas», el sistema DEBE eliminarla
  con las mismas reglas de hoy, y SI la eliminación se rechaza, ENTONCES DEBE decir el motivo
  («está en uso» o «es la zona de bodega principal»).

**Herencias que no cambian**

- **R15.** SI una zona creada desde «Zonas» no tiene tarifa, ENTONCES el cierre DEBE registrar 0 sin
  bloquear y la API por key DEBE responder 409 (274 R39, sin cambios).
- **R16.** El selector de distritos de «Zonas» DEBE ofrecer el catálogo geográfico global del país
  de la empresa (SL-20) y NO DEBE ofrecer crear ni editar geografía.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Zonas y tarifas separadas | R4, R5, R13 |
| «Zona de bodega principal» | R10, R11 |
| Sin editor provisional de costos | R6, R13 |
| «Cobertura» va en Zonas | R12 |
| E2E corto | R5 (E2E), R3 |
| Solo `maestro` escribe zonas | R2 |
| Geografía global (SL-20) | R16 |
| Zona sin tarifa: 0 en cierre, 409 en API | R15 |
| Zona especial se configura desde Tarifas, no desde Zonas | R4, R6 |

## Preguntas abiertas

- **P1 (resuelta 2026-10-29, ver Decisiones cerradas).** `e2e/zona-especial-dos-empresas.spec.ts` (SL-38 R14) entra a «Editar zona»
  en `/configuracion/tarifas` y pulsa «Especial»: con esta ficha esa superficie deja de existir y el
  E2E (que corre en el PR a `prod`) quedaría rojo. Propuesta del spec: SLT-51 lo marca
  `test.fixme` citando SLT-54, y SLT-54 lo reescribe contra su pantalla nueva. ¿Lo confirmas y lo
  anotas en la ficha SLT-54?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-28 | ¿Zonas y tarifas juntas? | Separadas: primero se crean zonas, luego se configuran tarifas en su módulo (épica EP-8). |
| 2026-10-28 | ¿Nombre de la zona central/GAM? | «Zona de bodega principal». La marca sigue (decide a qué bodega va el cierre); la variante de flete GAM la retira SLT-52. |
| 2026-10-29 | ¿Editor provisional de costos hasta SLT-54? | No. La épica sale completa a producción; entre fichas, `dev` puede quedar sin editor de costos de zona. |
| 2026-10-29 | ¿Dónde va «Cobertura»? | En Zonas. |
| 2026-10-29 | ¿E2E? | Sí, uno corto: el maestro crea una zona sin costos y la ve en el listado. |
| 2026-10-29 | ¿Qué pasa con `zona-especial-dos-empresas.spec.ts` (P1/P2)? | Carlos: `test.fixme` citando SLT-54, con una excepción con fecha (`vence: 2026-11-30`) en `e2e-sin-saltos.guardia`; SLT-54 lo reescribe. |
| heredado | ¿Quién escribe zonas? | Solo `maestro` (spec 24, `ZonaService`). |
| heredado | Geografía | Catálogo global del país, gestionado por el superadmin (SL-20). |
| heredado | Zona sin tarifa | El cierre registra 0 sin bloquear y la API por key responde 409 (274 R39). |
| heredado | Zona especial | Es de cada empresa y se configura desde Tarifas (SL-38), no desde Zonas. |
