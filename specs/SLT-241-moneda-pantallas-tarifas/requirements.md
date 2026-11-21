# SLT-241 — moneda-pantallas-tarifas · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **Ruta:** completa · **depends_on:** SLT-235 (en `dev`)
> **Rama:** `feature/SLT-241-moneda-pantallas-tarifas`, apilada sobre
> `feature/SLT-240-moneda-pantallas-ordenes` (PR #271, sin mergear).
>
> **Alcance (rebanada 3 de 8 del corte de SLT-235):** los importes y los rótulos del impuesto de estas
> pantallas y textos de la empresa salen con la moneda y el nombre del impuesto del país de la
> empresa:
> - `app/(app)/configuracion/tarifas/**`: importes, símbolo del modo «monto», porcentajes y todos los
>   textos «IVA» de la pantalla de Tarifas;
> - el texto «IVA 13.00» del historial de tarifas (`TarifaValorRepository`) y los mensajes de
>   validación con «IVA» de `lib/types/tarifa-flexible.ts`, que la pantalla de Tarifas pinta;
> - el mensaje interno «no tiene IVA» de `lib/repositories/_shared/resolver-tarifas.ts`;
> - el aviso de impacto de `UsuariosModule` (Configuración > Usuarios);
> - `app/(app)/ranking/**` (podio, premios e histórico);
> - los ejemplos de importe del catálogo de variables: «₡12.500» (`lib/types/plantilla-datos.ts`) y
>   «₡322.900» (`lib/whatsapp-envios/informes/transito/informe.ts`), en las vistas previas de
>   Configuración > Plantillas y Configuración > Envíos automáticos.
>
> Sale de la lista de excepciones de `pais-sin-literales` lo que está a nombre de SLT-241 (5 entradas)
> y su tope baja en 5. Para Costa Rica nada cambia a la vista.
>
> **Lo que NO entra:**
> - Los textos del historial de tarifas **ya guardados**: son datos congelados y no se reescriben.
> - El ejemplo que viaja a Meta al crear o editar una plantilla (`example.body_text`): no es pantalla y
>   sigue en la moneda de la plataforma (design §8).
> - Las descargas a hoja de cálculo del ranking: ya emiten el importe crudo, sin símbolo.
> - El panel de premios del ranking dentro de la wallet de mensajeros (`PremiosRankingPanel`) → SLT-246
>   «Moneda e impuesto del país en pantallas: wallet de tiendas y del mensajero».
> - Los nombres internos con «iva» (`ivaPct`, `textoValorSinIva`…): no se renombran (decisión heredada
>   de SL-21).
> - Lo que se acepta al teclear un importe → SLT-238 «Carga de órdenes con céntimos según la moneda del
>   país».
> - Otras rebanadas: SLT-240, SLT-242 a SLT-246; pantallas de plataforma → SLT-237.
>
> Inventario hecho con Grep el 2026-11-21 (`₡`, `CRC`, `\bIVA\b`, `money`, `formatMonto*`,
> `monedaConfig.`, `ejemplo`) sobre `app/(app)/configuracion/**`, `app/(app)/ranking/**` y las 5
> entradas de `tests/unit/guards/_pais-sin-literales-excepciones.ts` a nombre de SLT-241.

## Requisitos (EARS)

Vocabulario:
- **Moneda del país / nombre del impuesto del país:** los que entrega SLT-235 para la empresa del
  usuario: en pantalla, `useMonedaDelPais()` / `useImpuestoDelPais()`; en el servidor, los datos del
  país para pantallas (`PaisParaPantallas`), con sus caídas (SLT-235 R3–R5).
- **Moneda de la plataforma / rótulo de la plataforma:** `MONEDA_PLATAFORMA` e `IMPUESTO_ROTULO`
  («IVA»).
- **Reglas de formato:** las de SL-21 R8 (`formatearMontoEn`).
- **Marcador de «sin importe»:** el que pinta hoy cada pantalla cuando no hay importe.
- **País de prueba:** una empresa con `MONEDA_DE_PRUEBA` («€», espacio de miles, punto decimal,
  0 decimales) e impuesto «IGV».
- **Pantalla de Tarifas:** los archivos de `app/(app)/configuracion/tarifas/_components/`.
- **Texto del valor:** el antes/después que el historial de acciones guarda al fijar o quitar un valor
  de tarifa (`<modo> <valor>` y, si es un cobro, `<impuesto> <porcentaje>`).

### Pantalla de Tarifas

- **R1.** CUANDO la pantalla de Tarifas pinta un importe (un valor guardado en monto, «Hoy rige» en
  monto, «Varía: … a …», el valor de un grupo, de una tienda, de un mensajero o de un vehículo), el
  sistema DEBE formatearlo con la moneda del país y las reglas de formato. Sin importe, DEBE pintar el
  marcador de hoy.
- **R2.** CUANDO la pantalla de Tarifas rotula el modo monto («Monto <símbolo>», «En <símbolo>»), el
  sistema DEBE usar el símbolo de la moneda del país.
- **R3.** CUANDO la pantalla de Tarifas pinta un porcentaje (un valor en %, el % del impuesto), el
  sistema DEBE usar el separador decimal de la moneda del país.
- **R4.** CUANDO la pantalla de Tarifas nombra el impuesto (el encabezado de su columna, la etiqueta
  accesible de su campo, «+ <n> % <impuesto>», las notas «Sin <impuesto>», la base del % del mensajero y
  el aviso de impuesto obligatorio), el sistema DEBE escribir el nombre del impuesto del país. Los
  archivos de la pantalla de Tarifas NO DEBEN contener la palabra «IVA» fuera de los comentarios.

### Escritura de tarifas (servidor)

- **R5.** CUANDO el servidor rechaza el % de impuesto mal formado de un cobro, o un % de impuesto en un
  pago, el mensaje de error DEBE nombrar el impuesto del país de la empresa de la sesión.
- **R6.** CUANDO se fija o se quita un valor de tarifa que tiene % de impuesto, el texto del valor que
  queda en el historial DEBE llevar el nombre del impuesto del país de la empresa de la sesión. Un valor
  sin % de impuesto DEBE dejar el mismo texto que hoy.
- **R7.** CUANDO una acción de esta ficha necesita en el servidor la moneda o el nombre del impuesto
  del país, DEBE obtenerlos de los datos del país para pantallas de la empresa de la sesión (la lectura
  memorizada de SLT-235), una sola vez por petición, aunque la petición guarde varios valores.
- **R8.** SI el país de la empresa no tiene nombre de impuesto, o su lectura falla, ENTONCES R5 y R6
  DEBEN usar el rótulo de la plataforma, el aviso o el error DEBE quedar en el log (SLT-235 R4, R5), y
  el guardado NO DEBE fallar por ello.
- **R9.** CUANDO el resolver de tarifas encuentra un cobro sin % de impuesto, su error interno NO DEBE
  nombrar un impuesto concreto, y DEBE seguir deteniendo el cálculo como hoy.

### Configuración y ranking

- **R10.** CUANDO el aviso de impacto de Configuración > Usuarios pinta el total sin consolidar de una
  zona, el sistema DEBE formatearlo con la moneda del país.
- **R11.** CUANDO el ranking pinta el monto de un premio (en el podio, en la fila de premios y en el
  histórico, en tabla y en tarjeta), el sistema DEBE formatearlo con la moneda del país. Sin monto,
  DEBE pintar el marcador o el texto de hoy.

### Ejemplos de plantillas e informes

- **R12.** CUANDO la vista previa de una plantilla de orden (Configuración > Plantillas) pinta un
  importe de ejemplo, el sistema DEBE formatearlo con la moneda del país, con el mismo texto que el
  envío real daría para ese importe en esa moneda.
- **R13.** CUANDO la vista previa de una plantilla de informe (Configuración > Plantillas y
  Configuración > Envíos automáticos) pinta el ejemplo de una variable de importe, el sistema DEBE
  formatearlo con la moneda del país. Los ejemplos que no son importes NO DEBEN cambiar.
- **R14.** Los catálogos de variables de plantillas y de informes NO DEBEN escribir a mano el símbolo ni
  el código de una moneda: el ejemplo de un importe DEBE salir del formateador.
- **R15.** El sistema NO DEBE cambiar en esta ficha el ejemplo que viaja a Meta al crear o editar una
  plantilla.

### Caídas, Costa Rica y lo que no cambia

- **R16.** MIENTRAS la empresa sea de Costa Rica, lo que pintan las pantallas de esta ficha, los
  mensajes de R5, el texto del valor de R6 y los ejemplos de R12–R15 DEBEN ser idénticos, carácter a
  carácter, a lo de antes de esta ficha.
- **R17.** MIENTRAS una pantalla de esta ficha se pinte sin los datos del país (fuera del portal, o
  montada sola en un test), el sistema DEBE usar la moneda y el rótulo de la plataforma (SLT-235 R15).
- **R18.** El sistema NO DEBE cambiar en esta ficha: los textos del historial de tarifas ya guardados,
  las descargas a hoja de cálculo del ranking, los nombres internos con «iva», ni los textos de
  pantallas que no son de esta ficha.

### Guardias

- **R19.** Los archivos de pantalla que esta ficha pasa a la moneda del país DEBEN entrar en el censo de
  SLT-235 R18: no llaman a los formateadores que usan la moneda de la plataforma sin nombrarla, no leen
  `monedaConfig` más allá de `.locale`, no leen el país por una acción y no usan `localStorage`.
- **R20.** Las 5 entradas de la lista de excepciones de `pais-sin-literales` a nombre de SLT-241 DEBEN
  salir de la lista, y `TOPE_EXCEPCIONES` DEBE bajar de 19 a 14. Al cerrar esta ficha ninguna entrada
  DEBE seguir a nombre de SLT-241, y la lista NO DEBE crecer.

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| Rebanada 3 del corte de SLT-235; cada rebanada se mergea sola y baja sus excepciones | R16, R17, R20 |
| Moneda explícita: proveedor y hook, cada pantalla pasa la moneda al formateador | R1–R3, R10, R11, R13, R19 |
| País sin moneda o lectura que falla: plataforma + log, la página no falla | R8, R17 |
| Sin token ni `localStorage`; consulta única + memo de 10 min | R7, R19 |
| `monto-cliente.ts` fuera (SLT-238) | R18 (no se toca lo que se teclea) |
| Pantallas de plataforma fuera (SLT-237) | R18; el reviewer lo mira en el diff |
| Ejemplos «₡12.500» y «₡322.900» del catálogo de variables pasan a SLT-241 (SLT-235 P2) | R12–R15, R20 |
| Texto «IVA 13.00» del historial de tarifas a esta ficha (SL-21, SLT-235) | R6, R8, R16 |
| `FichaQueLoRetira` conserva `SLT-241` hasta la última rebanada (SLT-240 P2) | R20 |

## Preguntas abiertas

- **P1 — Tamaño (bloquea la aprobación del spec).** `tasks.md > Archivos esperados` suma **34 de 40**
  archivos (29 de producción, 5 de tests): el **85%**, por encima del aviso del 80% de
  `gate.tamano_pr`. Con SLT-240 «Moneda del país en pantallas: órdenes, novedades e incidentes» el
  humano aceptó pasar del 80% con un máximo de 40. Dos opciones:
  - **(a) Aceptarlo** como en SLT-240, con 6 archivos de margen.
  - **(b) Partir** en dos rebanadas verticales que se mergean solas:
    - **SLT-241**: Tarifas (pantalla, validación, historial y resolver), Configuración > Usuarios y
      ranking. Unos 19 de producción y 4 de tests (≈ 23). Baja las 3 excepciones de tarifas; el tope,
      de 19 a 16.
    - **Ficha nueva**: «Ejemplos de importe de plantillas e informes en la moneda del país»
      (`plantilla-datos.ts`, `informe.ts`, vistas previas de Plantillas y Envíos automáticos). Unos 10
      de producción y 3 de tests (≈ 13). Baja las otras 2 excepciones; el tope, de 16 a 14.

    La opción (b) reabre la decisión SLT-235 P2, que mandó los dos ejemplos a SLT-241: solo el humano
    puede hacerlo.
- **P2 — Artículo delante del nombre del impuesto.** Los textos de Tarifas dicen «Digita **el** IVA…» y
  «Sin IVA». Con el nombre del país quedan «Digita el IGV…». Un impuesto de nombre femenino («la TVA»)
  saldría con el artículo equivocado. Esta ficha no lo resuelve (el país no guarda el género del
  nombre). ¿Se acepta así, o se reescriben esos textos sin artículo («Digita el % de <impuesto>…»)? Si
  se reescriben, R16 deja de cumplirse para Costa Rica en esos dos textos.

## Decisiones cerradas (no reabrir)

Heredadas de SLT-235 (`specs/SLT-235-moneda-pais-pantallas/requirements.md > Decisiones cerradas`) y
de SLT-240, fijadas por el leader al lanzar este spec (2026-11-21):

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | ¿Cabe en un PR? (SLT-235) | Corte en 8 rebanadas; esta es la 3 (tarifas, configuración y ranking). Cada rebanada baja sus entradas de la lista de excepciones de `pais-sin-literales`. |
| 2026-11-20 | ¿Moneda explícita o leída de un contexto global? | Explícita: proveedor y hook, y cada pantalla pasa la moneda al formateador. Sin default a CRC. |
| 2026-11-20 | País sin moneda o lectura que falla | La pantalla cae a `MONEDA_PLATAFORMA` (y al rótulo de la plataforma) y deja un aviso en el log; la página no falla. |
| 2026-11-20 | ¿Token, caché o carga por pantalla? | Sin token ni `localStorage`; consulta única del país y memo de 10 min en el servidor (SLT-235). |
| 2026-11-20 | `components/shared/monto-cliente.ts` | Fuera: los céntimos al teclear son de SLT-238. |
| 2026-11-20 | Pantallas de plataforma | Fuera: son de SLT-237. |
| 2026-11-20 | Ejemplos «₡12.500» y «₡322.900» del catálogo de variables (SLT-235 P2) | Pasan a SLT-241: sus entradas de la lista de excepciones cambian de dueño a SLT-241 (humano). |
| 2026-11-20 | Texto «IVA 13.00» del historial de tarifas (SL-21) | Va al corte de SLT-235; SLT-235 design §8 lo asigna a SLT-241 junto con `tarifa-flexible.ts` y `resolver-tarifas.ts`. |
| 2026-11-20 | `FichaQueLoRetira` y `FICHAS_ADMITIDAS` (SLT-240 P2) | No se tocan: se limpian cuando cierre la última rebanada del corte de SLT-235. |
