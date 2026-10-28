# SL-18 «Únicos y secuencias por empresa» — requirements

> **Zona** backend · **Complejidad** high · **depends_on** SL-17 · **Rama** `feature/SL-18-unicos-secuencias-por-empresa`
>
> **Alcance.** Cierra lo que SL-17 dejó a esta ficha. `usuario.email` y `usuario.cedula` pasan a
> ser únicos por empresa, y login, OTP y recuperar contraseña aprenden a resolver la empresa:
> cuando la contraseña vale en varias empresas, el backend devuelve esas empresas para que el
> usuario elija. Entra
> también una guardia que impide un único de negocio nuevo sin `organizacion_id`, los índices
> compuestos de las rutas calientes y el registro push «el último gana» entre empresas.
> `num_guia` y su secuencia siguen globales, y queda escrito por qué.
>
> **Lo que NO entra.**
> - La pantalla del selector de empresa en `/login` y la de recuperar contraseña: SLT-41
>   «Selector de empresa en el login y recuperar contraseña», bloqueada por SL-18.
> - Landing pública por empresa: SL-35.
> - Partir `num_guia` o `orden_num_guia_seq` por empresa: decidido que no (ver Decisiones).
> - Los 18 únicos que SL-17 T3.9 ya hizo por empresa y los 52 anclados por FK: no se rehacen.
>
> Sembrado por `/afinar-feature` el 2026-10-26. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Vocabulario. Una **cuenta** es una fila de `usuario`. Una persona registrada en dos empresas
tiene dos cuentas con el mismo email. La **cuenta de plataforma** es la del superadmin (sin
empresa, SL-32). Una cuenta está **habilitada** cuando está `activo` y tiene empresa o es el
superadmin (el predicado de SLT-32). Una cuenta está **bloqueada** cuando superó los fallos
consecutivos de `AUTH_MAX_FAILED_ATTEMPTS` dentro de `AUTH_LOCKOUT_MINUTES`.

### Únicos de `usuario`

- **R1.** El sistema DEBE permitir que dos cuentas de empresas distintas tengan el mismo email, y
  también la misma cédula.
- **R2.** SI se crea o se edita una cuenta con un email o una cédula que ya usa otra cuenta de la
  misma empresa, ENTONCES el sistema DEBE rechazarla con el error de duplicado de ese campo
  (`email` o `cedula`), igual que hoy, sin escribir nada.
- **R3.** El sistema DEBE permitir que el email y la cédula de la cuenta de plataforma coincidan
  con los de una cuenta de empresa, y DEBE rechazar una segunda cuenta sin empresa con el mismo
  email o cédula (propuesta de P1).
- **R4.** CUANDO se revierte la migración de R1 y algún email o cédula se repite entre empresas, el
  `down.sql` DEBE abortar con un mensaje que nombra el índice, sin cambiar nada. Si no hay
  repetidos, DEBE dejar los dos únicos globales como estaban.
- **R5.** CUANDO una empresa genera una API key cuyo identificador produce el mismo slug que una key
  de otra empresa, el sistema DEBE crearla. SI el slug ya lo usa una key de la misma empresa,
  ENTONCES DEBE responder `conflict` igual que hoy (feature 81, R11).

### Login (`/login`)

- **R6.** CUANDO alguien envía email y contraseña sin elegir empresa y la contraseña vale en una
  sola cuenta habilitada de ese email, el sistema DEBE seguir en esa cuenta igual que hoy: abre la
  sesión, o pide el código OTP si el riesgo es alto.
- **R7.** CUANDO alguien envía email y contraseña sin elegir empresa y la contraseña vale en dos o
  más cuentas habilitadas, el sistema DEBE responder `elegir_empresa` con la lista de esas
  empresas. Cada elemento lleva el id y el nombre de la empresa, y la cuenta de plataforma aparece
  como «Plataforma» con id `null`. La lista va ordenada por nombre. En ese paso el sistema NO DEBE
  abrir sesión, emitir un código OTP, confiar el dispositivo ni registrar un intento.
- **R8.** La lista de R7 NO DEBE incluir una empresa en la que el email existe pero la contraseña no
  vale, la cuenta no está habilitada o está bloqueada.
- **R9.** SI el email no tiene cuentas, o la contraseña no vale en ninguna de sus cuentas no
  bloqueadas, ENTONCES el sistema DEBE responder `invalid_credentials`, la misma respuesta en los
  dos casos y sin nombrar ninguna empresa. Además DEBE registrar un intento fallido por cada
  cuenta no bloqueada del email, o uno sin cuenta si el email no tiene ninguna.
- **R10.** SI la contraseña vale en al menos una cuenta del email, ENTONCES el sistema NO DEBE
  registrar un intento fallido en las cuentas del mismo email donde no vale.
- **R11.** CUANDO alguien envía email, contraseña y una empresa elegida (o `null` para la
  plataforma), el sistema DEBE evaluar solo la cuenta del email en esa empresa y seguir como en
  R6. SI el email no tiene cuenta en esa empresa, o la contraseña no vale en ella, ENTONCES DEBE
  responder `invalid_credentials`.
- **R12.** SI todas las cuentas del email están bloqueadas, ENTONCES el sistema DEBE responder
  `account_locked`. SI la contraseña solo vale en cuentas no habilitadas, ENTONCES DEBE responder
  `account_unavailable`.
- **R13.** CUANDO se abre una sesión para la cuenta de una empresa, sea directa o tras el código
  OTP, toda operación de esa sesión DEBE resolverse en esa empresa y NO DEBE ver datos de las otras
  empresas del mismo email.
- **R14.** CUANDO se verifica el código OTP de un desafío emitido para la cuenta de la empresa
  elegida, el sistema DEBE abrir la sesión de esa cuenta y no la de otra cuenta del mismo email.
- **R15.** Una cuenta sin empresa que no es la de plataforma NO DEBE aparecer en la lista de R7 ni
  abrir sesión por R6 o R11 (contrato con SLT-32).

### Recuperar contraseña

- **R16.** CUANDO alguien pide recuperar la contraseña de un email, el sistema DEBE enviar un solo
  correo a ese email. El correo lleva un enlace por cada cuenta del email, con el nombre de su
  empresa («Plataforma» para la cuenta de plataforma), y omite las cuentas que superaron el límite
  de solicitudes (`AUTH_RESET_MAX_REQUESTS` en `AUTH_RESET_REQUEST_WINDOW_MINUTES`). La respuesta
  DEBE ser la misma exista o no el email.
- **R17.** SI el email no tiene cuentas, o todas superaron el límite, ENTONCES el sistema NO DEBE
  enviar correo y DEBE responder lo mismo que en R16.
- **R18.** CUANDO se canjea un enlace de recuperación válido con una contraseña nueva, el sistema
  DEBE cambiar solo la contraseña de la cuenta de ese enlace. Las demás cuentas del email
  conservan la suya.
- **R19.** SI el enlace venció (`AUTH_OTP_TTL_MINUTES`), ya se usó, lo sustituyó otro posterior de
  la misma cuenta, o no es un enlace de recuperación ni de bienvenida, ENTONCES el sistema DEBE dar
  la respuesta genérica `invalid_or_expired` sin cambiar ninguna contraseña.
- **R20.** El sistema NO DEBE aceptar el restablecimiento por email y código: los pasos «verificar
  código» y «restablecer con código» dejan de existir.
- **R21.** El secreto de cada enlace DEBE viajar solo en el fragmento de la URL (`#enlace=`). En la
  base DEBE guardarse solo su hash, y el secreto NO DEBE aparecer en ningún log.

### Guardia de únicos

- **R22.** La guardia DEBE fallar cuando una migración desde `20261023090000_unicos_por_empresa`
  crea un índice único o una restricción `UNIQUE` sobre una tabla de negocio sin `organizacion_id`
  como primera columna. Se exceptúa el índice que esté en la lista de únicos sin empresa, con su
  motivo.
- **R23.** La guardia DEBE fallar cuando una entrada de la lista de únicos sin empresa no
  corresponde a ningún índice de las migraciones, y cuando `docs/architecture.md` no nombra cada
  único que la lista marca como global a propósito.

### Índices de rutas calientes

- **R24.** El sistema DEBE tener un índice compuesto, con `organizacion_id` primero, para cada
  consulta caliente que elija la tarea de medición con `EXPLAIN`. Con datos de dos empresas, el
  plan de esa consulta DEBE usar el índice.
- **R25.** La búsqueda de cuentas por email del login y de la recuperación, sin empresa, DEBE usar
  un índice sobre `usuario.email` y no un recorrido secuencial.

### Push entre empresas

- **R26.** CUANDO un navegador cuya suscripción push es de una cuenta de la empresa A se registra
  con una cuenta de la empresa B, el sistema DEBE dejar una sola suscripción para ese endpoint, la
  de la cuenta de B. Los avisos de A NO DEBEN volver a enviarse a ese endpoint.
- **R27.** CUANDO el mismo navegador cambia de cuenta dentro de la misma empresa, el sistema DEBE
  reescribir el dueño de la suscripción, igual que hoy (ficha 410, R18).
- **R28.** El registro de R26 NO DEBE borrar ni cambiar suscripciones con otro endpoint, de
  ninguna empresa.

### Número de guía

- **R29.** El sistema DEBE mantener `orden.num_guia` único en toda la plataforma y generado por
  `siguiente_num_guia()` sobre `orden_num_guia_seq`: dos órdenes, de la misma empresa o de
  empresas distintas, nunca comparten guía. El rastreo `/paquete/[numGuia]` y la API por
  `numGuia` no cambian.
- **R30.** `docs/architecture.md` DEBE decir que `usuario.email` y `usuario.cedula` son únicos por
  empresa, y por qué `num_guia` y su secuencia siguen globales.

### E2E

- **R31.** El E2E de `/login` DEBE seguir en verde, y DEBE sumar este caso: con el mismo email y la
  misma contraseña en dos empresas, la persona elige una, entra en esa y no ve datos de la otra.
- **R32.** Los E2E que hoy entran por «¿Olvidaste tu contraseña?» DEBEN hacerlo por el enlace del
  correo de la empresa correspondiente, y DEBEN seguir en verde.

### Cobertura de las decisiones cerradas

| Decisión (fecha 2026-10-26) | Requisitos |
|---|---|
| `num_guia` y su secuencia siguen globales y se documentan | R29, R30 |
| Email y cédula únicos por empresa | R1, R2, R3, R5 |
| `/login` como única entrada, la persona elige entre las empresas donde vale la contraseña | R6–R15 |
| Recuperar contraseña: un enlace por empresa | R16–R21 |
| Push: el último gana | R26–R28 |
| Guardia de únicos | R22, R23 |
| Índices de rutas calientes | R24, R25 |
| Datos existentes: sin backfill, el `down.sql` aborta con repetidos | R4 |
| E2E | R31, R32 |

## Preguntas abiertas

- **P1. Superadmin y email repetido.** _Propuesta de spec_author; se cierra en la aprobación._
  Sí puede coincidir, igual que entre dos empresas (decisión 2). Si la contraseña vale en la
  cuenta de plataforma y en otra, `/login` la ofrece como una opción más, «Plataforma» con id
  `null` (R7, R11). Lo que no puede repetirse es el email entre dos cuentas sin empresa: el único
  compuesto va con `NULLS NOT DISTINCT` (R3), y además ya hay un solo superadmin
  (`usuario_un_solo_superadmin`). Prohibir la coincidencia costaría un trigger entre filas, y
  rechazaría el caso real de quien es superadmin y también maestro de una empresa.
- **P2. Cuentas sintéticas.** _Cerrada con evidencia del código._ El usuario dedicado de una API
  key toma email y cédula de `emailSintetico(slug)` y `cedulaSintetica(slug)`
  (`lib/utils/api-key-identity.ts`): `apikey+<slug>@apikey.invalid` y `APIKEY-<slug>`. Nada busca
  un usuario por ese email (los únicos `findUnique` por email o cédula están en
  `UserRepository` y `PostulacionRepository`), y su contraseña es aleatoria y nunca se muestra:
  no entra por `/login`. Con el único compuesto, dos empresas pueden tener la misma key «tienda-x»,
  y dentro de una empresa el slug repetido sigue dando `conflict` (R5). La generación no cambia.
  No existe otra «cuenta de integración» con email sintético: `ApiKey.slug` (l.3170) es la de la API
  key.
- **P3. Qué rutas son «calientes».** _Cerrada en el criterio; la lista final la fija T5.1 con
  `EXPLAIN`._ Un índice de una tabla de negocio necesita `organizacion_id` delante solo si su
  primera columna no identifica una empresa: una fecha (`created_at`, `fecha`) o un catálogo
  compartido (`estatus_id`). Los que empiezan por una FK a una fila de negocio (`tienda_id`,
  `orden_id`, `zona_id`, `mensajero_asignado_id`) ya acotan a una empresa, por la misma razón por
  la que SL-17 dejó «anclados» 52 únicos. Candidatos con esa forma en `db/schema.prisma`:
  `orden(created_at)`, `orden(estatus_id)`, `gestion_orden(created_at)`, `tarifas(created_at)`,
  `historial_accion(created_at DESC, id)`, `whatsapp_envio_ejecucion(created_at DESC)`,
  `plantilla_mensaje(created_at)` y el único `analytics_daily_grano_key`, que empieza por `fecha`.
  T5.1 mide la consulta real de cada uno con datos de dos empresas y solo entran los que mejoran
  el plan (design §6). Que no pude correr `EXPLAIN` al escribir el spec lo dice el design.
- **P4. Pantallas mínimas en SL-18 (nueva).** _Decide el humano en la aprobación._ El Alcance deja
  las pantallas a SLT-41, pero dos decisiones cerradas no se pueden cumplir sin tocarlas:
  - el E2E de R31 necesita una forma de elegir empresa en `/login`;
  - en cuanto el correo lleve enlaces y no un código (R16, R20), el paso «código» de
    `/recuperar-contrasena` y los E2E que lo usan se rompen.

  Además, tras el merge de SL-18 a `dev`, una persona con cuenta en dos empresas no podría
  entrar. **Propuesta A (la que siguen `design.md` y `tasks.md`):** SL-18 toca lo mínimo para que
  `dev` funcione, sin trabajo de diseño:
  - en `LoginForm`, una lista de botones con el nombre de cada empresa;
  - en `RecuperarContrasenaForm`, el paso 1 termina en «Revisa tu correo» y desaparece el paso
    del código.

  SLT-41 hace después las pantallas buenas sobre el mismo contrato. **Propuesta B:** SL-18 y
  SLT-41 mergean juntas (SLT-41 sale de la rama de SL-18), y T7.* y R31/R32 pasan a SLT-41.
- **P5. Vigencia del enlace de recuperación (nueva).** _Propuesta: se cierra en la aprobación._
  El enlace dura lo mismo que dura hoy el código de recuperación, `AUTH_OTP_TTL_MINUTES` (10 min
  por defecto). No se añade otra variable de entorno. Si el humano quiere más tiempo, se
  añade `AUTH_RESET_ENLACE_TTL_MINUTOS`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-26 | ¿Dos empresas pueden tener el mismo número de guía? | No. `num_guia` sigue único global y `orden_num_guia_seq` sigue global, con `siguiente_num_guia()` y su permutación. La etiqueta, el QR, el rastreo `/paquete/[numGuia]` y la API por `numGuia` no cambian. SL-18 lo documenta en `docs/architecture.md`. |
| 2026-10-26 | ¿Una persona puede tener cuenta en dos empresas con el mismo email o cédula? | Sí. `usuario.email` y `usuario.cedula` pasan a ser únicos compuestos con `organizacion_id` primero, el patrón heredado de SL-17 T3.9. |
| 2026-10-26 (revisada) | ¿Cómo entra alguien registrado en varias empresas? | Por `/login`, la única entrada. Escribe email y contraseña. Si la contraseña vale en una sola empresa, entra directo. Si vale en varias, elige entre esas. Quien no sabe la contraseña nunca ve en qué empresas está el email. No hay páginas de entrada por empresa. SL-18 hace el backend; la pantalla del selector va en SLT-41. |
| 2026-10-26 | Recuperar contraseña con email repetido | Llega un correo con un enlace por cada empresa donde existe el email. Cada enlace cambia solo la cuenta de esa empresa. |
| 2026-10-26 | Push: un navegador pasa de una cuenta de A a una de B | El último gana. La suscripción queda solo con B (cierra la deuda D14 de `progress/deudas.md`). |
| 2026-10-26 | ¿Guardia de únicos? | Sí. Una guardia estática falla si una migración nueva crea un único de negocio sin `organizacion_id` (m6 de `progress/review_SL-17.md`). |
| 2026-10-26 | ¿Índices de rutas calientes? | Sí, los compuestos (`organizacion_id`, …) que SL-17 design §3 dejó a SL-18. |
| 2026-10-26 | Datos existentes | Sin backfill. Se hereda de SL-17 D9/D10 (app vacía). El `down.sql` aborta nombrando el índice si hay duplicados entre empresas (patrón SL-17 T3.9). |
| 2026-10-26 | ¿E2E? | Sí. Login es un flujo crítico (`docs/checkpoints-proyecto.md`): el E2E de `/login` sigue en verde y suma el caso «email en varias empresas, elige una y entra en esa». |
