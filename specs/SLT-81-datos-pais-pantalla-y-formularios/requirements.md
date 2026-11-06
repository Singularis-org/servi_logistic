# SLT-81 — datos-pais-pantalla-y-formularios · requirements.md

> **Zona:** fullstack · **Complejidad:** a evaluar por el leader · **depends_on:** SLT-42 · **Rama:** feature/SLT-81-datos-pais-pantalla-y-formularios
>
> **Alcance.** El superadmin carga y edita, para cada país, el prefijo telefónico, los dígitos
> nacionales, la zona horaria y los tipos de documento con su formato, en una sección «Datos del
> país» dentro de Plataforma › Geografía. Incluye el backend de escritura que SLT-42 no trae. El
> alta de un país pide esos datos. Los formularios de usuario, postulación pública, alta de empresa
> (maestro) y teléfonos de clientes muestran el prefijo y los tipos de documento del país de la empresa.
>
> **Lo que NO entra.** Reordenar la administración de países y zonas → SLT-46, que se adapta
> después. Moneda e impuestos → SL-21. Métodos de pago y SINPE → SL-22. Recalcular datos ya
> guardados al cambiar zona o formato. Normalizar teléfonos guardados (pregunta abierta de SLT-42).
>
> Sembrado por `/afinar-feature` el 2026-11-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Glosario. **Superadmin** = el usuario de plataforma (sin empresa). **Datos del país** = prefijo
telefónico, dígitos nacionales, zona horaria y tipos de documento (SLT-42 R1, R2). **País
completo** = tiene prefijo, dígitos, zona y al menos un tipo de documento activo. **Empresas del
país** = las organizaciones cuyo país es ese. **Los cinco formularios** = alta y edición de usuario
(Configuración), postulación pública, alta de empresa (maestro), corregir datos del cliente y
destinatarios de WhatsApp.

### Quién escribe

- **R1** — SI quien pide crear, editar, activar o desactivar cualquier dato del país no es el
  superadmin (rol de empresa o sin sesión), ENTONCES el sistema DEBE responder `forbidden` (o
  `unauthenticated` sin sesión) en el servidor, sin escribir nada.

### Pantalla «Datos del país»

- **R2** — MIENTRAS el superadmin tenga un país elegido en Plataforma › Geografía, la pantalla DEBE
  mostrar una sección «Datos del país» con su prefijo, sus dígitos nacionales, su zona horaria y
  todos sus tipos de documento (nombre, caracteres, largo mínimo y máximo, y si está activo),
  incluidos los inactivos.
- **R3** — SI el país elegido no está completo, ENTONCES la sección DEBE decir que sus datos están
  incompletos y nombrar cada dato que falta.
- **R4** — CUANDO la pantalla se abra sobre una base con las migraciones de SLT-42 aplicadas, Costa
  Rica DEBE aparecer completo, con prefijo `506`, 8 dígitos, zona `America/Costa_Rica` y sus cinco
  tipos de documento activos, sin que SLT-81 los vuelva a sembrar.

### Alta de país

- **R5** — CUANDO el superadmin dé de alta un país, el sistema DEBE exigir, además de lo que ya
  exige SL-20, el prefijo, los dígitos nacionales, la zona horaria y al menos un tipo de documento;
  si falta alguno, DEBE responder `validation_error` en ese campo sin crear nada.
- **R6** — CUANDO un alta de país sea válida, el sistema DEBE crear el país y todos sus tipos de
  documento en una sola operación: si cualquier parte falla, no DEBE quedar ni el país ni ningún
  tipo.

### Reglas de los datos (servidor)

- **R7** — SI el prefijo no son de 1 a 3 dígitos sin `+` y sin `0` inicial, o los dígitos
  nacionales no son un entero de 4 a 14, ENTONCES el sistema DEBE responder `validation_error` en
  ese campo, sin escribir nada.
- **R8** — El selector de zona horaria DEBE ofrecer solo zonas IANA válidas y permitir buscarlas
  por texto; y SI el servidor recibe una zona que no está en la lista de zonas válidas, ENTONCES
  DEBE responder `validation_error` en `zonaHoraria`, sin escribir nada.
- **R9** — SI un tipo de documento llega sin nombre, con caracteres distintos de «solo dígitos» o
  «alfanumérico», o con largos que no cumplen 1 ≤ mínimo ≤ máximo ≤ 30, ENTONCES el sistema DEBE
  responder `validation_error` en ese campo; y SI su nombre (sin mayúsculas, acentos ni espacios de
  más) ya existe en el mismo país, ENTONCES DEBE responder `conflict` en el nombre.

### Edición de los datos del país

- **R10** — CUANDO el superadmin guarde un cambio de prefijo, dígitos nacionales o zona horaria de
  un país con al menos una empresa, el sistema DEBE pedir una confirmación que diga cuántas
  empresas del país afecta, y NO DEBE escribir nada hasta recibir la confirmación de ese mismo
  número de empresas.
- **R11** — SI el país no tiene empresas, ENTONCES el sistema DEBE guardar el cambio de R10 sin
  pedir confirmación.
- **R12** — CUANDO se guarde un cambio de prefijo, dígitos o zona, las operaciones que empiecen
  después en las empresas de ese país DEBEN usar el valor nuevo, y el sistema NO DEBE modificar
  ningún teléfono, fecha, cierre ni otro dato ya guardado.
- **R13** — El superadmin DEBE poder agregar un tipo de documento a un país existente, editar su
  nombre y su regla de formato, y activarlo o desactivarlo; el sistema NO DEBE ofrecer ni aceptar
  borrar un tipo de documento.
- **R14** — CUANDO cambie la regla de formato de un tipo, el sistema DEBE exigir la regla nueva al
  crear un usuario o una postulación con ese tipo y al cambiar un usuario a ese tipo, y NO DEBE
  revalidar ni modificar los documentos ya guardados con él.
- **R15** — SI el superadmin intenta desactivar el único tipo activo de un país, ENTONCES el
  sistema DEBE rechazarlo con `validation_error` y dejar el tipo activo.
- **R16** — CUANDO un tipo se desactive, los usuarios que ya lo tienen DEBEN conservarlo, y el
  formulario de edición de esos usuarios DEBE mostrarlo como su tipo actual sin ofrecerlo a nadie
  más.
- **R17** — CUANDO el superadmin cambie de verdad un dato del país (alta de país, cambio de
  prefijo, dígitos o zona, alta, edición, activación o desactivación de un tipo), el sistema DEBE
  dejar una fila en el historial de la plataforma con el actor, en la misma operación; un guardado
  sin cambios NO DEBE dejar fila.

### Formularios

- **R18** — MIENTRAS un maestro dé de alta o edite un usuario, el formulario DEBE mostrar el
  prefijo del país de su empresa como texto fijo junto al teléfono y ofrecer, por su nombre, solo
  los tipos de documento activos de ese país, en el orden del catálogo.
- **R19** — CUANDO la postulación pública se pinte con una empresa en el contexto, DEBE mostrar el
  prefijo y ofrecer solo los tipos activos del país de esa empresa, por su nombre y en el orden del
  catálogo. (El caso sin empresa en el contexto es la pregunta abierta 1.)
- **R20** — CUANDO el superadmin elija el país en el alta de empresa, el formulario DEBE mostrar el
  prefijo de ese país junto al teléfono del maestro y ofrecer solo los tipos activos de ese país;
  y CUANDO cambie de país, DEBE vaciar el tipo ya elegido.
- **R21** — MIENTRAS se corrijan los datos del cliente de una orden, el formulario DEBE mostrar el
  prefijo del país de la empresa junto al teléfono del destinatario, sin validar ese teléfono con
  libphonenumber (SLT-42 R14).
- **R22** — CUANDO la lista de destinatarios de un envío de WhatsApp tenga personas cuyo teléfono no
  sirve, el aviso DEBE decir la regla del país de la empresa: su prefijo y su cantidad de dígitos
  nacionales.
- **R23** — SI el país de la empresa no tiene prefijo o dígitos cargados, ENTONCES los formularios
  DEBEN mostrar el teléfono sin prefijo y un aviso de que el país no tiene prefijo cargado, sin usar
  el de ningún otro país.
- **R24** — Ninguno de los cinco formularios ni la página de la postulación DEBE contener el
  prefijo `506` ni una lista fija de tipos de documento.

### E2E

- **R25** — Un E2E DEBE recorrer: el superadmin da de alta un país con sus datos y un tipo de
  documento, da de alta una empresa de ese país, y el formulario del alta muestra el prefijo de ese
  país y exactamente sus tipos activos.

### Cobertura de las decisiones cerradas

| Decisión (fecha · pregunta) | Requisitos |
|---|---|
| 2026-11-06 · ¿Espera a SLT-46? | R2 (la sección vive en la pantalla de hoy, sin piezas de SLT-46) |
| 2026-11-06 · ¿Quién hace el backend de escritura? | R1, R5–R17 |
| 2026-11-06 · ¿Dónde se editan los datos del país? | R2, R3 |
| 2026-11-06 · ¿País nuevo sin datos? | R5, R6, R15 |
| 2026-11-06 · ¿Cómo se elige la zona? | R8 |
| 2026-11-06 · ¿Cambiar prefijo, dígitos o zona con empresas operando? | R10, R11, R12 |
| 2026-11-06 · Datos de Costa Rica | R4 |
| 2026-11-06 · ¿Cambio de formato de un tipo en uso? | R14, R16 |
| 2026-11-06 · ¿Qué formularios? | R18–R24 |
| 2026-11-06 · ¿E2E? | R25 |
| 2026-10-26 · ¿Quién escribe el catálogo? | R1 |
| 2026-11-03 · ¿Se borran los tipos de documento? | R13, R16 |
| 2026-11-03 · ¿Dónde se valida? | R7, R8, R9, R14 |

R15 no sale de una fila de la tabla: se deriva de «¿País nuevo sin datos?» (un país completo no
puede quedar sin tipos activos por una desactivación). Si el humano no la quiere, se quita sin
tocar el resto.

## Preguntas abiertas
- Postulación pública: cómo resuelve el formulario la empresa (y su país) antes de enviar, para
  mostrar prefijo y tipos. A confirmar en el código; si no hay forma, se decide con el humano.
  **Hallazgo (spec_author, 2026-11-06):** el código no la resuelve. `app/postulacion/page.tsx` no
  tiene empresa en el contexto y lista los tipos de todos los países; la action
  (`lib/actions/postulacion-mensajero.ts`) rechaza con `error` toda postulación sin empresa en el
  contexto («la ruta por empresa es SL-35», pendiente). Propuesta en `design.md > §7.3`; sigue
  abierta.
- Lista de zonas IANA: de dónde sale (lista del runtime o una lista fija versionada), dado que la
  base no valida la zona (decisión de SLT-42). A decidir en el design, sin dependencias nuevas.
  **Propuesta** en `design.md > §5`: la del runtime (`Intl.supportedValuesOf("timeZone")`), calculada
  en el servidor, más una comprobación contra `pg_timezone_names` al guardar. Sigue abierta hasta
  que el humano la apruebe con el spec.
- (Nueva, spec_author) La guardia `pais-sin-literales` de SLT-42 deja cuatro excepciones con la
  ficha `SLT-81`: `lib/utils/fecha-cr.ts`, `hora-cr.ts`, `separador-dia-cr.ts` y `telefono-cr.ts`.
  Los tres primeros los importan unos 50 archivos de UI (fechas en pantalla), y `telefono-cr.ts`
  lo importan `ContactoButtons`, `EnviarPlantillaWhatsappButton` y `ChatConversacion`. Nada de eso
  está en el Alcance ni en «¿Qué formularios?». ¿Los retira SLT-81 o pasan a otra ficha?
  Propuesta en `design.md > §10`: fuera de SLT-81; las cuatro excepciones cambian de ficha a una
  nueva que abra el humano.
- (Nueva, spec_author) ¿El servidor debe rechazar un prefijo que no coincide con el que
  libphonenumber da para ese país (p. ej. `PA` con un prefijo distinto de `507`)? La validación del
  teléfono de SLT-42 usa el código del país como región, no el prefijo guardado, así que un prefijo
  mal escrito solo rompe la normalización de WhatsApp. Propuesta en `design.md > §5`: sugerir el
  prefijo en el formulario y no rechazar; sin requisito hasta que el humano decida.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-06 | ¿Espera a SLT-46? | No. SLT-81 arranca ya; SLT-46 se adapta después. |
| 2026-11-06 | ¿Quién hace el backend de escritura? | SLT-81, que pasa de frontend a fullstack. |
| 2026-11-06 | ¿Dónde se editan los datos del país? | Sección «Datos del país» dentro de Plataforma › Geografía. |
| 2026-11-06 | ¿País nuevo sin datos? | El alta del país pide prefijo, dígitos, zona horaria y al menos un tipo de documento. |
| 2026-11-06 | ¿Cómo se elige la zona? | Selector con buscador que solo ofrece zonas IANA válidas. |
| 2026-11-06 | ¿Cambiar prefijo, dígitos o zona con empresas operando? | Se permite con confirmación que dice cuántas empresas afecta. Rige desde el cambio; lo guardado no se recalcula. |
| 2026-11-06 | Datos de Costa Rica | Ya los siembra SLT-42 (migraciones 20261106120000 y 120100). SLT-81 no los repite; un test comprueba que CR llega completo. |
| 2026-11-06 | ¿Cambio de formato de un tipo en uso? | Rige solo para lo nuevo: se exige al crear o editar ese documento; lo guardado no se revalida. |
| 2026-11-06 | ¿Qué formularios? | Alta y edición de usuario, postulación pública, alta de empresa (maestro), corregir datos del cliente y destinatarios de WhatsApp. |
| 2026-11-06 | ¿E2E? | Sí, uno: el superadmin crea un país con sus datos, da de alta una empresa de ese país y el formulario muestra su prefijo y sus tipos. |
| 2026-10-26 | ¿Quién escribe el catálogo? | Solo el superadmin; la empresa solo lee. Heredado de SL-17/SL-20 y SLT-42. |
| 2026-11-03 | ¿Se borran los tipos de documento? | No, se desactivan. Heredado de SLT-42 y spec 4. |
| 2026-11-03 | ¿Dónde se valida? | En el servidor, con el catálogo y la validación de SLT-42. |
