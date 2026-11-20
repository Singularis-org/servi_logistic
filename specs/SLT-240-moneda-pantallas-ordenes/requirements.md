# SLT-240 — moneda-pantallas-ordenes · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **Ruta:** completa · **depends_on:** SLT-235 (en `dev`, #267 + #270)
> **Rama:** `feature/SLT-240-moneda-pantallas-ordenes`
>
> **Alcance (rebanada 2 de 8 del corte de SLT-235):** los importes de estas pantallas de la empresa
> se pintan con la moneda del país de la empresa, que ya baja del layout del portal por
> `MonedaDelPaisProvider` / `useMonedaDelPais()` (SLT-235):
> - `app/(app)/ordenes/**`: el listado, el resumen de la carga masiva, la tabla de órdenes con el monto
>   redondeado, el aviso de cambio de ubicación, la vista previa de la etiqueta y el PDF de etiquetas
>   que arma el navegador (`etiquetas-pdf.ts` y el dibujo compartido `lib/pdf/etiquetas-dibujo.ts`);
> - novedades (sus tarjetas);
> - incidentes (la cola de aprobación, su formulario y el histórico);
> - `historico/acciones` (el registro de acciones).
>
> Para Costa Rica nada cambia a la vista.
>
> **Lo que NO entra:**
> - Los textos «IVA» de pantalla de órdenes («Flete + IVA», «Comisión + IVA») → sin dueño hoy: P1.
> - Los textos de formato de entrada del monto («con hasta 2 decimales», «por ejemplo 12500.00») y lo
>   que se acepta al teclear → SLT-238 «Carga de órdenes con céntimos según la moneda del país».
> - El PDF de etiquetas por API (`lib/pdf/etiquetas-pdf-lote.ts`, `EtiquetasLotePdfService`): ya sale
>   en la moneda del país desde SL-21 R14.
> - Las descargas a hoja de cálculo: ya emiten el importe crudo, sin símbolo (R15).
> - Fechas y zona horaria fijas de CR del registro de acciones → SLT-92 «Pantallas: fechas y teléfonos
>   en la zona y el prefijo del país de la empresa» y SLT-81.
> - Las pantallas de cierres, wallet, tarifas, analítica y plataforma → SLT-237, SLT-241 a SLT-246.
>
> Inventario hecho con Grep el 2026-11-20 sobre `app/(app)/{ordenes,novedades,incidentes,historico}/**`
> y `lib/pdf/`. La `description` de la ficha cita «el inventario en P1» de SLT-235, que ya no está en
> ese `requirements.md`: el de aquí es el que vale (design §4).

## Requisitos (EARS)

Vocabulario:
- **Moneda del país:** la que entrega a las pantallas `MonedaDelPaisProvider` para la empresa del
  usuario (SLT-235 R1, con sus caídas R3 y R5).
- **Moneda de la plataforma:** `MONEDA_PLATAFORMA` (`lib/config/moneda.ts`).
- **Reglas de formato:** las de SL-21 R8 (`formatearMontoEn`): símbolo delante, separador de miles,
  cola solo cuando existe y cuadre a la escala de la moneda, con el medio alejándose del cero.
- **Marcador de «sin importe»:** el que pinta hoy cada pantalla cuando no hay monto (`-` o `—`).
- **País de prueba:** una empresa cuya moneda es `MONEDA_DE_PRUEBA` (otro código, «€», espacio de
  miles, punto decimal y 0 decimales).
- **Pantallas de esta ficha:** las de R1 a R11.

### Órdenes

- **R1.** CUANDO el listado de órdenes pinta el monto a cobrar, el flete con impuesto, el fulfillment o
  la comisión con impuesto de una orden, el sistema DEBE formatearlos con la moneda del país y las
  reglas de formato.
- **R2.** CUANDO el resumen de una carga masiva pinta el monto a cobrar de una orden, el sistema DEBE
  formatearlo con la moneda del país; sin monto, DEBE pintar el marcador de «sin importe» de hoy (`-`).
- **R3.** CUANDO la tabla de órdenes con el monto redondeado pinta el monto del archivo y el monto
  aplicado, el sistema DEBE usar el símbolo y los separadores de la moneda del país y DEBE mostrar la
  cola de dos decimales de cada monto cuando existe, sea cual sea la escala de esa moneda. Dos montos
  distintos NO DEBEN salir con el mismo texto.
- **R4.** CUANDO el aviso de cambio de ubicación pinta el flete y la comisión de la ubicación actual y de
  la propuesta, el sistema DEBE formatearlos con la moneda del país. SI una ubicación no tiene tarifa,
  ENTONCES DEBE seguir pintando «Sin tarifa configurada» en lugar del importe.
- **R5.** CUANDO la vista previa de una etiqueta pinta el monto a cobrar, el sistema DEBE formatearlo con
  la moneda del país; sin monto, DEBE pintar `-`.
- **R6.** CUANDO el usuario descarga el PDF de etiquetas desde el navegador, el monto a cobrar de cada
  etiqueta DEBE salir con la moneda del país, con el mismo texto que la vista previa de esa etiqueta y
  que el PDF por API para la misma moneda.
- **R7.** SI la fuente embebida del PDF no cubre algún carácter del importe en la moneda del país,
  ENTONCES el sistema NO DEBE descargar ningún PDF y DEBE mostrar el aviso de carácter no imprimible que
  el modal de etiquetas ya muestra hoy.

### Novedades, incidentes y registro de acciones

- **R8.** CUANDO las tarjetas de novedades pintan el monto a cobrar de una orden, el sistema DEBE
  formatearlo con la moneda del país.
- **R9.** CUANDO la cola de incidentes pinta la indemnización de un incidente (en su detalle o en la
  columna del histórico), el sistema DEBE formatearla con la moneda del país; sin importe, DEBE pintar
  `—`.
- **R10.** CUANDO el formulario de aprobación de un incidente anuncia el tope de la indemnización (en la
  ayuda del campo y en el error de «excede»), el sistema DEBE escribirlo con la moneda del país,
  cuadrado hacia el cero a la escala de esa moneda. El tope anunciado NUNCA DEBE quedar por encima del
  que acepta el validador, tampoco con una moneda de 0 decimales.
- **R11.** CUANDO el registro de acciones pinta el monto de una fila, el sistema DEBE formatearlo con la
  moneda del país; sin monto, DEBE pintar `—`.

### Caídas, Costa Rica y lo que no cambia

- **R12.** MIENTRAS la empresa sea de Costa Rica, lo que pintan las pantallas de esta ficha y el PDF de
  etiquetas del navegador DEBE ser idéntico, carácter a carácter, a lo de antes de esta ficha.
- **R13.** MIENTRAS una pantalla de esta ficha se pinte sin los datos del país (fuera del portal, o
  montada sola en un test), el sistema DEBE usar la moneda de la plataforma (SLT-235 R15).
- **R14.** El generador del PDF de etiquetas del navegador y el dibujo de la etiqueta que comparte con
  el PDF por API NO DEBEN tener una moneda por defecto: cada llamada DEBE recibir la moneda con la que
  se pinta el importe.
- **R15.** El sistema NO DEBE cambiar las descargas a hoja de cálculo de órdenes, novedades, incidentes
  y registro de acciones: sus importes siguen saliendo crudos, sin símbolo.
- **R16.** El sistema NO DEBE cambiar en esta ficha los textos «IVA» de las pantallas de órdenes ni los
  textos que explican cómo teclear un monto («con hasta 2 decimales», «por ejemplo 12500.00»).

### Guardias

- **R17.** Los archivos que esta ficha pasa a la moneda del país DEBEN entrar en el censo de SLT-235 R18:
  no llaman a los formateadores que usan la moneda de la plataforma sin nombrarla, no leen
  `monedaConfig` más allá de `.locale`, no leen el país por una acción y no usan `localStorage`.
- **R18.** La lista de excepciones de `pais-sin-literales` NO DEBE crecer, y al cerrar esta ficha
  ninguna entrada DEBE seguir a nombre de SLT-240.

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| Rebanada 2 del corte de SLT-235; cada rebanada se mergea sola | R12, R13, R18 |
| Moneda explícita: proveedor y hook, cada pantalla pasa la moneda al formateador | R1–R11, R14, R17 |
| País sin moneda o lectura que falla: `MONEDA_PLATAFORMA` + log | R13 (la caída la da SLT-235; aquí se hereda) |
| Sin token ni `localStorage`; consulta única + memo de 10 min | R17 (no se lee el país por pantalla) |
| `monto-cliente.ts` fuera (SLT-238) | R16 |
| Pantallas de plataforma fuera (SLT-237) | Fuera del alcance; el reviewer lo mira en el diff (design §8, R16 y R18) |
| Bajar las entradas propias de `pais-sin-literales` | R18 |

## Preguntas abiertas

- **P1. Los rótulos «IVA» de órdenes no tienen ficha.** SLT-235 R17 dejó los textos «IVA» de pantalla a
  SLT-241 y SLT-243 a SLT-246, y ninguna cubre órdenes. El título de esta ficha solo habla de moneda.
  Quedan con «IVA» fijo:
  - `app/(app)/ordenes/_components/ordenes-columns.tsx` («Flete + IVA», «Comisión + IVA»);
  - `app/(app)/ordenes/_components/ordenes-descarga-columnas.ts` (los mismos encabezados en la descarga);
  - `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx` (`AVISO_FILA_FLETE`, `AVISO_FILA_COMISION`).

  Opciones: (a) una ficha pequeña «Impuesto del país en los rótulos de órdenes»; (b) meterlos en esta
  ficha, con 3 o 4 archivos más, lo que la deja por encima del 80% del tope (design §11). **No bloquea
  el spec:** R16 los deja como están hasta que el humano decida.
- **P2. `FichaQueLoRetira` sigue admitiendo `SLT-240` sin ninguna entrada.** SLT-235 design §8
  preveía pasar `lib/pdf/etiquetas-dibujo.ts` a SLT-240, pero ese archivo ya no estaba en la lista
  porque desde SL-21 no tiene literales. Esta ficha no baja nada y el tope sigue en 19 (R18). Quitar
  `SLT-240` del tipo y de `FICHAS_ADMITIDAS` cuesta dos archivos más. Propuesta: no tocarlo aquí y
  limpiarlo cuando cierre la última rebanada del corte. **No bloquea.**

## Decisiones cerradas (no reabrir)

Heredadas de SLT-235 (`specs/SLT-235-moneda-pais-pantallas/requirements.md > Decisiones cerradas`) y
fijadas por el leader al lanzar este spec (2026-11-20):

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | ¿Cabe en un PR? | Corte de SLT-235 en 8 rebanadas; esta es la 2 (órdenes, novedades, incidentes, `historico/acciones` y el PDF de etiquetas del navegador). Cada rebanada baja sus entradas de la lista de excepciones de `pais-sin-literales`. |
| 2026-11-20 | ¿Moneda explícita o leída de un contexto global? | Explícita: proveedor y hook, y cada pantalla pasa la moneda al formateador. Sin default a CRC. |
| 2026-11-20 | País sin moneda o lectura que falla | La pantalla cae a `MONEDA_PLATAFORMA` y queda un aviso en el log; la página no falla (lo resuelve SLT-235). |
| 2026-11-20 | ¿Token, caché o carga por pantalla? | Sin token ni `localStorage`; consulta única del país y memo de 10 min en el servidor (SLT-235). |
| 2026-11-20 | `components/shared/monto-cliente.ts` | Fuera: los céntimos al teclear son de SLT-238. |
| 2026-11-20 | Pantallas de plataforma | Fuera: son de SLT-237. |
