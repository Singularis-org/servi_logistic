# SL-21 — moneda-impuestos-configurables · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SL-20 · **Rama:** `feature/SL-21-moneda-impuestos-configurables`
>
> **Alcance:** cada país guarda su moneda (código, símbolo, separador de miles, separador
> decimal y cuántos decimales usa) y el nombre de su impuesto. Costa Rica queda cargado por
> migración con CRC, «₡» e «IVA». Lo que arma el servidor toma la moneda y el nombre del
> impuesto del país de la empresa: correos, WhatsApp, PDF de etiquetas y de facturas, y la nota
> «Montos en …». Para Costa Rica nada cambia a la vista.
>
> **Lo que NO entra:**
> - Pantallas de la empresa con su moneda y los textos «IVA» tomados del país → SLT-235
>   «Moneda e impuesto del país en las pantallas de la empresa».
> - Editar moneda e impuesto en «Datos del país» del superadmin → SLT-236 «Datos del país:
>   editar moneda e impuesto» (después de SLT-81).
> - Precio del plan por moneda o país; las facturas de planes siguen en CRC para todas las
>   empresas → SLT-237 «Planes: precio por moneda del país» (relacionada con SLT-229).
> - Céntimos en el monto a cobrar de la carga de órdenes → SLT-238 «Carga de órdenes con
>   céntimos según la moneda del país».
> - Tasa de impuesto por país: la tasa sigue en cada tarifa (SLT-54, SL-39).
> - Métodos de pago y SINPE → SL-22. Fechas con `es-CR` → SLT-92.
>
> Sembrado por `/afinar-feature` el 2026-11-20. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Vocabulario:
- **Moneda del país:** el código, el símbolo, los dos separadores y los decimales que guarda el
  país.
- **Moneda de la plataforma:** la de `lib/config/moneda.ts`, la única que existía hasta esta ficha.
  Es la de las facturas de planes y la de las pantallas hasta SLT-235.
- **País de prueba:** uno de `XA`–`XZ` (fábrica de SL-20).

### Datos del país

- **R1.** El sistema DEBE guardar, por país, el código ISO 4217 de su moneda, el símbolo, el
  separador de miles, el separador decimal, cuántos decimales usa (de 0 a 2) y el nombre de su
  impuesto. Todos admiten «sin dato». El país NO DEBE guardar ninguna tasa de impuesto.
- **R2.** SI una escritura en `pais` deja alguno de estos casos, ENTONCES la base DEBE rechazarla
  sin cambiar nada:
  - la moneda incompleta: unos datos de moneda sí y otros no;
  - un código que no sea de tres letras mayúsculas;
  - decimales fuera de 0–2;
  - un separador decimal que no sea punto ni coma;
  - dos separadores iguales;
  - un separador de miles que no sea un solo carácter;
  - un símbolo vacío o de más de 5 caracteres;
  - un nombre de impuesto vacío o de más de 20 caracteres.
- **R3.** CUANDO se aplica la migración de esta ficha, Costa Rica DEBE quedar con «CRC», «₡», «.»,
  «,», 2 decimales e «IVA». No DEBE cambiar ninguna otra columna ni fila de ninguna tabla. Su
  `down.sql` DEBE dejar el esquema como antes, sin tocar otras columnas.
- **R4.** Una empresa (rol `servi_app`) DEBE poder leer la moneda y el impuesto de los países, y NO
  DEBE poder escribirlos.

### Lectura por el puerto

- **R5.** CUANDO un servicio pide la moneda o el nombre del impuesto, el sistema DEBE devolver los
  del país de la empresa en curso, nunca los de otra empresa ni los de la plataforma.
  - Dos empresas atendidas seguidas por el mismo servicio reciben cada una los de su país: no hay
    caché entre empresas.
  - Sin empresa en curso, la lectura falla como el resto del puerto.
- **R6.** SI al país de la empresa le falta la moneda, ENTONCES la operación que la necesita DEBE
  fallar con el error `PaisSinMoneda` antes de enviar, guardar o subir nada. NO DEBE usar la moneda
  de otro país ni la de la plataforma.
- **R7.** SI al país de la empresa le falta el nombre del impuesto, ENTONCES su lectura DEBE fallar
  con el error `PaisSinImpuesto`, sin dar uno por defecto.

### Formato de un importe

- **R8.** CUANDO el servidor formatea un importe con una moneda, el texto DEBE seguir estas reglas:
  - el símbolo va delante;
  - la parte entera se agrupa de tres en tres con el separador de miles;
  - el importe se cuadra a los decimales de esa moneda, con el medio alejándose del cero;
  - la parte decimal se pinta, tras el separador decimal, solo si no es toda ceros;
  - el signo menos se cae cuando lo que queda es cero.
- **R9.** El formateo con la moneda de la plataforma y con la de Costa Rica tal como la deja la
  migración DEBE dar, para cada entrada del corpus de la guardia 359, el mismo texto que los
  formateadores de hoy.

### Lo que arma el servidor

- **R10.** CUANDO el servidor resuelve las variables de una plantilla de WhatsApp que pinta un
  importe, DEBE formatearlo con la moneda del país de la empresa. Aplica al envío desde el chat del
  mensajero, al mensaje de bienvenida y a la acción de envío del chat.
- **R11.** MIENTRAS una plantilla no pinte ningún importe, su envío NO DEBE leer la moneda, así que
  no falla por `PaisSinMoneda`.
- **R12.** CUANDO el servidor genera el informe de tránsito, la variable `por_cobrar` y los
  importes de su PDF DEBEN ir en la moneda del país de la empresa.
- **R13.** MIENTRAS se genere un informe de WhatsApp que no pinta importes (picking, aviso interno,
  prueba), el sistema NO DEBE leer la moneda.
- **R14.** CUANDO el servidor genera el PDF de etiquetas de la carga por API (el consolidado y el de
  cada orden), el monto a cobrar DEBE ir con la moneda del país de la empresa.
- **R15.** CUANDO el sistema arma algo de una factura de planes, DEBE expresar los importes en la
  moneda de la plataforma, sea cual sea el país de la empresa, y NO DEBE incluir ninguna línea ni
  nombre de impuesto. Aplica a:
  - el correo de factura emitida;
  - el PDF de la factura y su anexo;
  - la nota «Montos en …»;
  - el texto del cobro por orden vigente de un plan.
- **R16.** MIENTRAS la empresa sea de Costa Rica, los textos y los PDF de R10, R12, R14 y R15
  DEBEN ser idénticos a los de antes de esta ficha.

### Alta de empresa

- **R17.** SI el país elegido en el alta de empresa no tiene la moneda completa o el nombre del
  impuesto, ENTONCES el alta DEBE responder `validation_error` en `paisId` y no crear nada.

### Lo que no cambia

- **R18.** CUANDO se carga una orden con monto a cobrar (carga masiva, API), el sistema DEBE
  redondear el monto a la unidad entera como hoy, aunque la moneda del país use decimales.
- **R19.** El sistema NO DEBE cambiar los nombres internos con «iva»: los enums de caja, los
  conceptos del libro y los campos `iva` e `ivaComision` de la API. Tampoco DEBE cambiar el
  documento OpenAPI publicado.

### Guardias y verificación

- **R20.** Los archivos de servidor (`lib/**`, `app/api/**` y las `page`/`layout` de `app/`) NO
  DEBEN tener, en código (no en comentarios), ninguno de estos:
  - el símbolo «₡»;
  - el código `CRC`;
  - la palabra `IVA`;
  - una llamada a los formateadores que usan la moneda de la plataforma sin nombrarla (`money`,
    `moneyTope`, `formatMonto`, `formatMontoString`, `formatMontoTope`, `montoExacto`,
    `monedaConfig`).

  Solo se libran los archivos de una lista de excepciones, cada uno con su ficha y su motivo. La
  lista solo baja.
- **R21.** Cada construcción de producción de un servicio que lee la moneda por el puerto DEBE
  pasarle el puerto real.
- **R22.** El comportamiento por país DEBE quedar probado con una empresa de Costa Rica y otra de un
  país de prueba con otra moneda, en tests unitarios y de integración, sin E2E nuevo.

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | ¿Qué es «impuestos» en esta ficha? | Solo el nombre del impuesto por país («IVA», «IGV»…). La tasa sigue en cada tarifa, sin valor por defecto (heredado de SLT-54 y SL-39 D6). |
| 2026-11-20 | Corte de la ficha | Datos del país + lo que arma el servidor. Pantallas y textos «IVA» en SLT-235. |
| 2026-11-20 | Dónde se edita | Costa Rica se carga por migración. La edición va a «Datos del país» en SLT-236, después de SLT-81. |
| 2026-11-20 | Moneda de las facturas de planes | Siguen en CRC para todas las empresas. El precio por moneda va a SLT-237. |
| 2026-11-20 | Monedas con céntimos | El país guarda cuántos decimales usa su moneda; la regla del entero en la carga de órdenes no cambia aquí (SLT-238). |
| 2026-11-20 | Patrón | Heredado de SLT-42: columnas en `pais`, relleno de CR en la migración, lectura por el puerto `IReglasPaisEmpresa` y guardia de literales del país. |
| 2026-11-20 | Impuestos en facturas de planes | Sin impuestos, heredado de SLT-118. |
| 2026-11-20 | Nombres internos con «iva» en la base | No se renombran (enums de caja y conceptos del libro). |
| 2026-11-20 | E2E | No hace falta uno nuevo: para Costa Rica la salida es idéntica. Lo cubren tests de integración con un país de prueba y los E2E existentes. |
| 2026-11-20 | ¿Se parte la ficha (unos 52 archivos)? | No. Un solo PR con todo, aceptando pasar el tope de tamaño. Entran también el PDF de etiquetas por API (`EtiquetasLotePdfService` y sus 3 rutas) y el informe de tránsito (`por_cobrar` y su PDF). |
| 2026-11-20 | Correos, PDF de facturas y nota «Montos en …» | Son todos de facturas de planes y siguen en CRC. Solo dejan de depender de un literal: usan la moneda de la plataforma de forma explícita, hasta SLT-237. |
| 2026-11-20 | Rótulo del impuesto en el servidor | El nombre se guarda en el país, se lee por el puerto y una guardia impide escribirlo en el servidor. La OpenAPI se queda como está. El texto «IVA 13.00» del historial de tarifas va a SLT-235. |
| 2026-11-20 | Analítica financiera, vista previa de plantillas en el navegador, PDF de etiquetas del navegador y `app/paquete/[numGuia]/page.tsx` | Van a SLT-235: son pantallas. |
| 2026-11-20 | ¿La moneda entra en «país completo» para el alta de empresa? | Sí: un país sin moneda (ni nombre de impuesto) no admite altas de empresa. |
| 2026-11-20 | Rango de decimales | De 0 a 2. Se acepta el riesgo de un descuadre visible de ±1 con 0 decimales. |
