# SLT-227 — cobro-auto-proveedor-rebill · requirements.md

> Zona: backend · Complejidad: high · depends_on: SLT-226 (done) · Rama: feature/SLT-227-cobro-auto-proveedor-rebill
>
> **Alcance:** la interfaz `ProveedorCobro` (`crearEnlace`, `consultarPago`, `verificarFirma`, `devolver`)
> y un registro de proveedores (`rebill`, `wompi`, `global66`) que devuelve el adaptador por nombre.
> El adaptador de Rebill usa su API REST v3 (`x-api-key`), sin SDK. Las credenciales se guardan por
> proveedor, país y entorno, cifradas en la bóveda (`lib/crypto/boveda-integraciones.ts`), con un
> servicio que las guarda y las lee, sin pantalla. Un doble falso de Rebill sirve a los tests. Las
> llamadas llevan timeout, solo se reintenta lo idempotente y los errores de Rebill se traducen a
> errores del dominio. Docs: https://docs.rebill.com/api/reference/payment-links
>
> **Lo que NO entra:**
> - la pantalla de medios, proveedor y credenciales por país: SLT-251 «Cobro automático: medios y proveedor por país»;
> - el webhook: SLT-228 «Cobro automático: webhook por proveedor y el de Rebill»;
> - el enlace de pago por factura, es decir, quién llama a `crearEnlace`: SLT-230 «Cobro automático: enlace de pago por factura»;
> - el cobro en USD: SLT-229 «Cobro automático: cobro en USD para países sin cobertura»;
> - el adaptador de Wompi: SLT-252 «Cobro automático: adaptador de Wompi»;
> - el adaptador de Global66: SLT-253 «Cobro automático: transferencia y enlace con Global66»;
> - el botón «Pagar»: SLT-231 «Cobro automático: botón «Pagar» y estado de la factura».
>
> Sembrado por `/afinar-feature` el 2026-11-21. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-21. «Trío» es (proveedor, país, entorno). Los montos son de ejemplo, en
> colones. La forma de la API de Rebill sale de su doc v3, leída por el leader el 2026-11-21 (P1–P5 resueltas;
> `design.md > 6`). P6–P8 las respondió el humano el 2026-11-21.

### La interfaz y el registro

- **R1.** El sistema DEBE ofrecer, para cada proveedor de cobro, cuatro operaciones: crear un enlace de pago,
  consultar un pago, verificar la firma de un aviso y devolver un pago. La consulta DEBE conservar el contrato de
  SLT-226 «Cobro automático: modelo del cobro e idempotencia»: recibe solo el id del pago, devuelve «no lo conoce»
  cuando el proveedor no lo tiene y falla con un error cuando la consulta no se pudo hacer.
- **R2.** CUANDO se pide el adaptador de un proveedor para un país, el registro DEBE devolver el adaptador de ese
  proveedor ligado a ese país y al entorno de la app (R3). SI el proveedor todavía no tiene adaptador, ENTONCES el
  registro DEBE fallar con el error del dominio `proveedor_no_disponible` sin leer credenciales ni llamar a nadie.
  Ejemplos:
  - `rebill` para CR ⇒ el adaptador de Rebill de CR;
  - `wompi` para CO ⇒ `proveedor_no_disponible` (su adaptador es de SLT-252 «Cobro automático: adaptador de Wompi»).

### El entorno

- **R3.** El entorno de cobro DEBE ser `produccion` solo cuando la app corre en producción, y `sandbox` en cualquier
  otro caso. Ningún país, ninguna credencial y ningún parámetro de una llamada DEBE poder cambiarlo. Ejemplos:
  - producción ⇒ `produccion`;
  - preview ⇒ `sandbox`;
  - local, o el E2E de CI (que corre `next start` con `NODE_ENV=production` fuera de Vercel) ⇒ `sandbox`.
- **R4.** CUANDO un adaptador llama al proveedor, DEBE usar las credenciales del entorno de R3, y nunca las del otro
  entorno. En Rebill la URL base es la misma en los dos entornos: lo que elige el entorno es la API key. Ejemplo: en
  preview, con las credenciales de Rebill para CR cargadas solo en `produccion` ⇒ `sin_configuracion` (R14), y no sale
  ninguna petición.

### Las credenciales

- **R5.** El sistema DEBE guardar las credenciales de un proveedor por trío, con una sola fila por trío y cada secreto
  cifrado en la bóveda que ya existe. La base DEBE rechazar un secreto que no tenga la forma cifrada de la bóveda,
  también si lo escribe el dueño. Ejemplo: se guarda la API key `sk_123` de (rebill, CR, sandbox) ⇒ la fila guarda
  `v1:…` y en ninguna columna aparece `sk_123`; un `INSERT` del dueño con `sk_123` en claro da `23514`.
- **R6.** Las credenciales DEBEN ser de la plataforma: no pertenecen a ninguna empresa, y ninguna empresa DEBE poder
  leerlas ni escribirlas, tampoco con SQL a mano. Ejemplo: como `servi_app` con la empresa A, `SELECT` o `INSERT`
  sobre la tabla ⇒ `42501`.
- **R7.** Un secreto cifrado DEBE quedar atado a su fila y a su campo: copiado a otra fila (otro país, otro entorno u
  otro proveedor) o a otro campo, NO DEBE poder descifrarse. Ejemplo: la API key cifrada de (rebill, CR, sandbox)
  copiada a la fila de (rebill, CR, produccion) ⇒ al leerla, `credencial_ilegible`.
- **R8.** CUANDO el superadmin guarda las credenciales de Rebill para un trío, el sistema DEBE exigir la API key y el
  secreto del webhook. Los dos tienen que tener la forma que da Rebill: la API key secreta empieza por `sk_` (Rebill
  rechaza las `pk_`), y el secreto es el `signingSecret` completo (`whsec_` y 64 hex). El sistema DEBE registrar
  quién y cuándo las guardó. SI el trío ya tenía credenciales, ENTONCES DEBE reemplazar las dos sin crear otra fila.
  El sistema NO DEBE escribir nada:
  - SI falta un campo, está vacío, no tiene su forma o sobra uno ⇒ `validation_error`. Ejemplo: una key `pk_…` ⇒
    `validation_error` en `apiKey`;
  - SI el país no existe ⇒ `pais_no_existe`;
  - SI el proveedor no tiene adaptador (`wompi`, `global66`) ⇒ `proveedor_no_disponible`.

  Ejemplo: guardar (rebill, CR, sandbox) dos veces con API keys distintas ⇒ 1 fila, con la segunda key.
- **R9.** CUANDO el superadmin consulta las credenciales de un trío, el sistema DEBE responder solo si están
  configuradas, los nombres de los campos guardados, cuándo se guardaron y quién lo hizo. NUNCA DEBE responder un
  secreto, ni descifrado, ni cifrado, ni un trozo. Ejemplo: (rebill, CR, sandbox) ⇒ `{ configurada: true, campos:
  ["apiKey", "secretoWebhook"], actualizadoAt, actualizadoPor }`; un trío sin fila ⇒ `{ configurada: false }`.
- **R10.** SI guarda o consulta credenciales un rol que no es el superadmin, ENTONCES el sistema DEBE responder
  `forbidden` sin leer la base ni la bóveda. Ejemplo: `maestro`, `admin`, `mensajero` y `tienda` ⇒ `forbidden`, y el
  repositorio y el cifrador no reciben ninguna llamada.
- **R11.** El secreto descifrado SOLO DEBE leerlo, en el servidor, el adaptador del proveedor. Ninguna página, Server
  Action ni route handler DEBE poder llegar al lector de secretos descifrados.
- **R12.** MIENTRAS no exista la pantalla de SLT-251 «Cobro automático: medios y proveedor por país», el sistema DEBE
  ofrecer un comando para cargar las credenciales de un trío que:
  - pase por la misma regla de R8 y R10, con el superadmin como actor;
  - lea los secretos de la entrada estándar, nunca de los argumentos;
  - no imprima ningún secreto.

  Ejemplo: `pnpm cobro:credencial --proveedor rebill --pais CR --entorno sandbox`, con los dos valores por la entrada
  estándar ⇒ imprime «Guardadas: rebill · CR · sandbox (apiKey, secretoWebhook)» y sale con 0. Un argumento
  desconocido ⇒ sale con 1 sin repetir el argumento.
- **R13.** CUANDO se recifra la bóveda con `pnpm integraciones:recifrar`, el recifrado DEBE incluir las credenciales
  de los proveedores de cobro y sumarlas al mismo resumen. Así no queda en uso una versión vieja de la clave sin que
  el resumen lo diga. Ejemplo: 2 integraciones de empresa y 1 credencial de cobro en `v1`, con `v2` activa ⇒
  «Recifrados a v2: 3» y `v1 -> 0`.

### El país sin credenciales

- **R14.** SI no hay credenciales para el trío del adaptador, ENTONCES toda operación DEBE fallar con el error del
  dominio `sin_configuracion`, sin llamar al proveedor. Ejemplo: Rebill para GT sin fila ⇒ crear enlace, consultar,
  verificar y devolver dan `sin_configuracion`, y el doble de Rebill recibe 0 peticiones.

### El adaptador de Rebill

- **R15.** CUANDO el adaptador de Rebill llama a la API, DEBE hacerlo por su API REST v3, con la API key del trío en
  la cabecera `x-api-key`, sin SDK y sin dependencias nuevas.
- **R16.** CUANDO se crea un enlace, el adaptador DEBE pedirlo a Rebill por el monto, la moneda y el método recibidos,
  con el id de la factura y el del intento en `metadata`. DEBE devolver el id del enlace (el `id_externo` del intento)
  y su URL. El monto NO DEBE pasar por un número de coma flotante al escribirse: va en el JSON como número decimal en
  la unidad mayor, con los mismos dígitos del texto recibido. SI el método no lo admite un enlace de Rebill o el monto
  no es positivo, ENTONCES el adaptador DEBE fallar sin llamar (`metodo_no_soportado` o `solicitud_invalida`).
  Ejemplos:
  - ₡20 000,00 en CRC por tarjeta ⇒ `{ idExterno: "pl_…", url: "https://pay.rebill.com/…" }`. El cuerpo crudo que
    recibe el doble lleva `"amount":20000.00`, `"methods":["card"]` y `"metadata":{"facturaId":"…","intentoId":"…"}`;
  - `recurrente` ⇒ `metodo_no_soportado` (un enlace `instant` no cobra suscripciones; eso es de SLT-232).
- **R17.** CUANDO se consulta un pago, el adaptador DEBE devolver su estado traducido a los estados de SLT-226, el
  monto como texto con dos decimales, la moneda y el id del enlace que lo originó. La traducción:

  | Estado de Rebill | Estado de SLT-226 |
  |---|---|
  | `pending` | `pendiente` |
  | `approved` | `aprobado` |
  | `rejected` | `rechazado` |
  | `refunded` | `devuelto` |
  | `chargeback` | `contracargo` |
  | `partially_refunded` | `aprobado` (decisión P7) |
  | `cancelled` | `rechazado` (decisión P8) |

  Además:
  - SI Rebill no conoce el pago (`404`), ENTONCES DEBE devolver «no lo conoce» (`null`);
  - SI Rebill devuelve un estado fuera de la tabla, un monto con más de dos decimales o una respuesta sin la forma
    esperada, ENTONCES DEBE fallar con `respuesta_invalida`. Así el aviso queda sin procesar (SLT-226 R16) y nunca
    avanza un intento a ciegas.

  Ejemplos:
  - un pago de tarjeta de ₡20 000 con ₡5 000 devueltos (`partially_refunded`) da `aprobado`. Su intento sigue
    `aprobado` sin cambio (SLT-226 R15), y la devolución parcial es de SLT-233;
  - una transferencia `pending` que Rebill cancela (`cancelled`) da `rechazado`, y su intento pasa a `rechazado`. Si
    el pago ya estaba `approved`, SLT-226 lo deja `sin_cambio`.
- **R18.** CUANDO se verifica la firma de un aviso, el adaptador DEBE calcular el HMAC-SHA256 del cuerpo crudo, en hex,
  con el secreto del webhook del trío completo como clave. DEBE compararlo en tiempo constante con la cabecera
  `x-rebill-signature`, y responder verdadero solo si coincide. Con la cabecera ausente, mal formada o hecha con otro
  secreto, DEBE responder falso. No llama a la red. Ejemplo: el cuerpo firmado por el doble con el secreto del trío ⇒
  verdadero; el mismo cuerpo con un byte cambiado ⇒ falso.
- **R19.** CUANDO se pide una devolución, el adaptador DEBE pedirla a Rebill por el pago y el monto recibidos, que
  puede ser parcial, y DEBE devolver el estado de la devolución traducido. Además:
  - SI el monto no es positivo, ENTONCES DEBE fallar con `solicitud_invalida` sin llamar;
  - SI Rebill la rechaza (p. ej. un pago que no es de tarjeta, o uno que no está `approved` ni `partially_refunded`),
    ENTONCES DEBE fallar con `solicitud_rechazada`.

  Ejemplo: devolver ₡5 000,00 de un pago de tarjeta de ₡20 000,00 ⇒ Rebill responde `partially_refunded`, y el
  adaptador devuelve `aprobada`. Un pago por transferencia ⇒ `400` ⇒ `solicitud_rechazada`.

### Tiempo máximo y reintentos

- **R20.** Toda petición a Rebill DEBE llevar un tiempo máximo por intento. Al vencer, la petición se corta y falla
  con `tiempo_agotado`. Ejemplo: con un tiempo máximo de 10 s, el doble que tarda 11 s ⇒ `tiempo_agotado` a los 10 s.
- **R21.** SOLO la consulta de un pago DEBE reintentarse, porque es idempotente. Se hacen hasta 3 intentos en total,
  con espera creciente, y solo ante tiempo agotado, fallo de red, `429` o `5xx`. Ejemplo: `503`, `503` y `200` ⇒
  devuelve el pago tras 3 peticiones y 2 esperas crecientes; `503` tres veces ⇒ `proveedor_caido` tras 3 peticiones.
- **R22.** Crear un enlace y devolver NO DEBEN reintentarse nunca: cada una hace una sola petición, porque Rebill no
  documenta idempotencia para ninguna de las dos. SI fallan por
  tiempo agotado, fallo de red o `5xx`, ENTONCES el error DEBE marcarse como incierto, porque el efecto pudo ocurrir
  en Rebill. Ejemplo: devolver con un `503` ⇒ 1 petición y `proveedor_caido` con `incierto = true`.
- **R23.** Una respuesta `4xx` distinta de `429` NO DEBE reintentarse en ninguna operación. Ejemplo: consultar con un
  `401` ⇒ 1 petición y `credencial_rechazada`.

### Errores del dominio

- **R24.** El sistema DEBE traducir toda falla de una llamada al proveedor a un error del dominio. El error lleva el
  código, la operación, el proveedor, si reintentarlo más tarde puede servir y si es incierto (R22). Los códigos:

  | Qué pasó | Código | Reintentable |
  |---|---|---|
  | `401` o `403` | `credencial_rechazada` | no |
  | `404` (fuera de la consulta, que devuelve `null`) | `no_encontrado` | no |
  | Otro `4xx` distinto de `429` | `solicitud_rechazada` | no |
  | `429` | `limite_de_peticiones` | sí |
  | `5xx` | `proveedor_caido` | sí |
  | Se venció el tiempo máximo | `tiempo_agotado` | sí |
  | Falló la red | `sin_conexion` | sí |
  | Respuesta sin la forma esperada o con un estado desconocido | `respuesta_invalida` | no |
  | La bóveda no pudo descifrar la credencial | `credencial_ilegible` | no |

  También son errores del dominio, sin llamada, `sin_configuracion` (R14), `proveedor_no_disponible` (R2),
  `metodo_no_soportado` y `solicitud_invalida` (R16, R19).
- **R25.** Ningún error, mensaje ni línea de log del sistema DEBE contener la API key, el secreto del webhook ni el
  cuerpo de una respuesta del proveedor. Un test lo prueba recorriendo todos los caminos de error con secretos
  centinela. Ejemplo: con la API key `sk_CENTINELA_9f3` y un doble que la repite en el cuerpo de su `401` ⇒ el
  centinela no aparece en el mensaje, la pila, `String(error)` ni `JSON.stringify(error)`, ni en ninguna llamada a
  `console`.

### Las pruebas

- **R26.** Las pruebas del adaptador DEBEN correr contra un doble falso de Rebill: un servidor HTTP local, como el
  doble de Storage. Ninguna prueba DEBE llamar a Rebill real. Ejemplo: ningún archivo de `tests/` ni de `e2e/` nombra
  el host real de Rebill, y la URL base del adaptador en la app sale solo de la configuración de R3.

### La frontera con SLT-226

- **R27.** La ampliación NO DEBE cambiar el comportamiento de SLT-226. La consulta conserva su firma, y
  `CobroIntentoService` y sus pruebas siguen en verde sin cambiar ninguna afirmación.

### Cobertura de las decisiones cerradas

| Decisión (fecha 2026-11-21) | R |
|---|---|
| ¿Quién guarda las credenciales? | R5, R8, R9, R12 |
| ¿Sandbox o producción? | R3, R4 |
| ¿De la plataforma o de la empresa? | R5, R6, R7 |
| ¿País sin credenciales? | R14 |
| ¿Quién ve o cambia credenciales? | R9, R10, R11, R25 |
| ¿SDK de Rebill? | R15 |
| ¿Tests contra Rebill real? | R26 |
| ¿E2E? | R26 (las pruebas son de integración con el doble; el E2E es de SLT-231) |
| Frontera con SLT-226 | R1, R27 |
| Ruta | Sin comportamiento: es del proceso |
| Tamaño | Sin comportamiento: `design.md > 15. Tamaño` |
| P6: un solo PR | Sin comportamiento: `design.md > 15. Tamaño` |
| P7: `partially_refunded` ⇒ `aprobado` | R17 |
| P8: `cancelled` ⇒ `rechazado` | R17 |
| Descripción de la ficha: registro, tiempo máximo, reintentos y errores | R2, R20–R24 |

## Preguntas abiertas

Ninguna.

**Resueltas por el humano (2026-11-21; filas en `## Decisiones cerradas`):**
- **P6, el tamaño:** «Aceptar, un solo PR». Las ~1 150–1 300 líneas de producción, para un tope de 1 000, entran en
  un PR. El marcador `tamano-pr-aceptado` está en `progress/features/SLT-227.md`.
- **P7, `partially_refunded`:** lleva a `aprobado` («Sigue aprobado»). La devolución parcial la resuelve SLT-233
  «Cobro automático: conciliación, devoluciones y contracargos» (R17).
- **P8, `cancelled`:** lleva a `rechazado` («Rechazado»). Sobre un pago ya aprobado no cambia nada: SLT-226 lo deja
  `sin_cambio` (R17).

**Resueltas por el leader, que leyó la doc de Rebill v3 el 2026-11-21 (fuentes en `design.md > 6.1`):**
- **P1, el enlace:** `POST /v3/payment-links` con `prices` (`instant`); `amount` como número decimal en la unidad
  mayor; `paymentMethods` con `card` o `bank_transfer`; la referencia propia en `metadata`. Responde `id` (`pl_…`) y
  `url` (R16).
- **P2, el pago:** `GET /v3/payments/:id`, con `amount`, `currency`, `status` y `metadata`. Los siete estados están en
  R17.
- **P3, las devoluciones:** `POST /v3/refunds/:paymentId`, con `amount` parcial u omitido. Solo para pagos de tarjeta
  `approved` o `partially_refunded`. Sin idempotencia documentada (R19, R22).
- **P4, la firma:** HMAC-SHA256 en hex del cuerpo crudo, con el `signingSecret` completo (`whsec_…`) como clave. Sin
  marca de tiempo (R18).
- **P5, la URL base:** una sola, `https://api.rebill.com`. El entorno lo decide la key (R4).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-21 | ¿Quién guarda las credenciales? | SLT-227 crea la tabla cifrada (proveedor + país + entorno) y el servicio que guarda y lee, sin pantalla. La pantalla es de SLT-251. Mientras no exista, se cargan por siembra o script. |
| 2026-11-21 | ¿Sandbox o producción? | Lo decide el entorno de la app: local y preview usan siempre sandbox; producción usa producción. No hay interruptor por país. |
| 2026-11-21 | ¿De la plataforma o de la empresa? | De la plataforma, por proveedor y país (enmienda del humano del 2026-11-20). Si dos países comparten cuenta, se cargan las mismas credenciales en los dos (heredado de SLT-251). |
| 2026-11-21 | ¿País sin credenciales? | Error del dominio «sin configuración»; no se llama al proveedor (heredado de SLT-251: ese país paga por fuera). |
| 2026-11-21 | ¿Quién ve o cambia credenciales? | Solo el superadmin. El secreto descifrado nunca sale del servidor ni aparece en los logs. |
| 2026-11-21 | ¿SDK de Rebill? | No: REST con `fetch`; ninguna dependencia nueva (descripción de la ficha). |
| 2026-11-21 | ¿Tests contra Rebill real? | Nunca. Hay un doble falso, como el de Storage. |
| 2026-11-21 | ¿E2E? | Se difiere a SLT-231: esta ficha no tiene superficie en pantalla. Sus pruebas son de integración con el doble. |
| 2026-11-21 | Frontera con SLT-226 | `consultarPago` nació en SLT-226; esta ficha amplía la interfaz sin romper su contrato (design de SLT-226 §2). |
| 2026-11-21 | Ruta | Completa: dinero, integración externa y migración. |
| 2026-11-21 | Tamaño | Unos 25 archivos; cabe en un PR. |
| 2026-11-21 | P6: ¿se acepta pasar el tope de líneas de producción (~1 150–1 300 / 1 000)? | «Aceptar, un solo PR». Marcador `tamano-pr-aceptado` en `progress/features/SLT-227.md`. |
| 2026-11-21 | P7: ¿a qué estado lleva `partially_refunded`? | «Sigue aprobado»: `aprobado`. La devolución parcial la resuelve SLT-233. |
| 2026-11-21 | P8: ¿a qué estado lleva `cancelled`? | «Rechazado»: `rechazado`. Sobre un pago aprobado no cambia nada (SLT-226). |
