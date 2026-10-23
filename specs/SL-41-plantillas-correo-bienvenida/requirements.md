# SL-41 — Plantillas de correo y bienvenida del maestro

> Rama: `feature/SL-41-plantillas-correo-bienvenida` · sale de `dev` (trae SL-17, SL-32 y SL-38).
> Depende de: SL-32 (pantalla «Empresas», rol superadmin) y SL-17 (alta de empresa).
> Pedido por Carlos Restrepo el 2026-10-23.

## Alcance

1. **Plantilla común de marca** para todos los correos que envía la app, en HTML y en texto
   plano. Hoy son dos envíos, y los dos usan la misma plantilla (`design.md > 1. Inventario`):
   el código OTP del login y el código de «recuperar contraseña». Los dos pasan a la plantilla
   común, y el de bienvenida nace en ella.
2. **Correo de bienvenida al maestro** cuando el superadmin da de alta una empresa. Lleva un
   enlace para crear la contraseña, de un solo uso y con caducidad, y se construye sobre el
   mecanismo de recuperación que ya existe (`PasswordResetService` y `email_otp_challenge`).
3. **El alta no depende del correo.** Si el envío falla, la empresa y el maestro quedan creados
   y el superadmin ve un aviso claro. La bienvenida se puede reenviar desde la fila de la empresa
   en «Empresas».
4. **Envío por Brevo.** Se corrigen los textos de `lib/config/email.ts` y de `.env.example`, que
   todavía describen Gmail.

### Lo que NO entra

- Correos nuevos que no sean la bienvenida: avisos operativos, notificaciones o resúmenes. Hoy
  ninguno sale por correo. Las notificaciones van por push, por la campana y por WhatsApp, que
  son otros canales y no se tocan.
- Plantillas de WhatsApp (specs 107 y 474): son otro canal.
- El restablecimiento de contraseña que hace el maestro desde «Usuarios» (spec 287): no envía
  correo, por decisión firmada, y no cambia.
- Guardar en la base si el maestro ya creó su contraseña (`## Preguntas abiertas`, P3).
- Cambiar de proveedor SMTP o hacer obligatoria una variable nueva de Brevo (P2).

## Decisiones cerradas (no reabrir)

| # | Decisión | Fuente | Requisitos |
|---|---|---|---|
| D1 | Una plantilla común con la marca de Servi Logistic para TODOS los correos de la app, en HTML y en texto plano. | Carlos, 2026-10-23 | R1–R7, R8–R10 |
| D2 | El alta de empresa envía al maestro un correo de bienvenida con un enlace para crear su contraseña, de un solo uso y con caducidad. | Carlos, 2026-10-23 | R12–R22 |
| D3 | El enlace reutiliza el mecanismo de recuperación de contraseña (`PasswordResetService`): no se inventa otro. | Carlos, 2026-10-23 | R15, R18, R19, R22 |
| D4 | Si el correo falla, el alta funciona igual (la empresa y el maestro quedan creados) y el superadmin ve un aviso claro. | Carlos, 2026-10-23 | R23–R28 |
| D5 | La bienvenida se reenvía con un botón «Reenviar bienvenida» en la fila de la empresa en «Empresas». | Carlos, 2026-10-23 («por ejemplo»; se adopta) | R29–R33 |
| D6 | El código OTP nunca va en el asunto (SL-32 ya lo quitó). El enlace va solo en el cuerpo. No se envían contraseñas. | Carlos, 2026-10-23; SL-32 m4 | R11, R14, R16, R28, R34, R35 |
| D7 | Marca: el logo y la paleta de `docs/marca.md`. El nombre de la app de origen no aparece en ningún correo. | Carlos, 2026-10-23; `docs/marca.md` | R2–R4, R7 |
| D8 | El SMTP es Brevo. Se corrigen los textos de Gmail de `lib/config/email.ts` dentro de este alcance. | Carlos, 2026-10-23 | R36, R37 |
| D9 | La plantilla HTML es una pieza visual nueva: pasa por `/design` antes de implementar su parte visual. | Carlos, 2026-10-23; `docs/perfil-agentes.md > frontend_dev` | R2 (maqueta aprobada); `tasks.md > T1`, bloqueante |
| D10 | Tests de: el contenido de cada correo, el token de un solo uso, la caducidad, el alta cuando falla el envío y la ausencia de secretos en lo enviado. | Carlos, 2026-10-23 | R8, R13, R17–R20, R23, R34, R35 |
| D11 | La caducidad del enlace la decide el spec, con su justificación: **72 horas**, configurable por entorno. | Carlos delega, 2026-10-23; justificación en `design.md > 5.3` | R17 |

## Requisitos (EARS)

### Plantilla común

- **R1.** El sistema DEBE componer cada correo que envía, el asunto, el cuerpo de texto plano y el
  cuerpo HTML, con una única plantilla común.
- **R2.** El cuerpo HTML de todo correo DEBE tener, en este orden: una cabecera con el logo de
  Servi Logistic, el contenido propio del correo y un pie con el nombre «Servi Logistic» y un aviso
  de que el correo se envió automáticamente. La maqueta DEBE ser la aprobada en `/design`
  (`tasks.md > T1`).
- **R3.** El cuerpo HTML DEBE usar solo colores de la paleta de `docs/marca.md`, o mezclas
  declaradas de dos de ellos. NO DEBE pintar texto en amarillo `#FFD000` sobre un fondo claro, y NO
  DEBE contener los colores de la marca anterior (`#0b2545`, `#0d2444`, `#f26419`).
- **R4.** SI no hay URL base de la app configurada, ENTONCES la cabecera del cuerpo HTML DEBE
  mostrar el nombre «Servi Logistic» como texto, sin ninguna imagen.
- **R5.** El cuerpo de texto plano de todo correo DEBE contener cada párrafo del cuerpo HTML y la
  URL completa de cada enlace, sin etiquetas HTML.
- **R6.** El sistema DEBE escapar en el cuerpo HTML todo dato variable que interpola: el nombre del
  maestro, el nombre de la empresa, el email y el código.
- **R7.** Ningún correo DEBE contener el nombre de la app de origen (el de
  `tests/fixtures/nombre-heredado.ts`), en ninguna capitalización, ni en el asunto, ni en el texto
  plano, ni en el HTML.

### Los correos que ya existen

- **R8.** CUANDO el login de riesgo alto emite un código OTP, el sistema DEBE enviarlo con la
  plantilla común. El asunto DEBE ser «Tu código de verificación de Servi Logistic», y el cuerpo
  DEBE llevar el código, los minutos que le quedan de vigencia, que sirve una sola vez y qué hacer
  si no se pidió.
- **R9.** CUANDO «recuperar contraseña» emite un código, el sistema DEBE enviar el mismo correo que
  en R8.
- **R10.** En el cuerpo de texto plano del correo de R8, el código DEBE ir solo en su propia línea.
- **R11.** El asunto de ningún correo DEBE contener un código OTP, un enlace, un secreto de enlace
  ni una contraseña.

### Correo de bienvenida

- **R12.** CUANDO `altaEmpresaAction` termina con `creada`, el sistema DEBE enviar un correo de
  bienvenida al email del maestro creado.
- **R13.** El correo de bienvenida DEBE contener: el nombre del maestro, el nombre de la empresa,
  que su usuario para entrar es su email, un botón «Crear mi contraseña» que lleva al enlace, ese
  mismo enlace como URL visible, cuántas horas dura, que sirve una sola vez y qué hacer si venció.
- **R14.** El correo de bienvenida NO DEBE contener ninguna contraseña, ningún hash ni un código OTP
  de 6 dígitos.
- **R15.** El enlace de bienvenida DEBE llevar un secreto aleatorio de al menos 256 bits, generado al
  emitir el enlace. El sistema DEBE guardar solo su hash, nunca el secreto.
- **R16.** El secreto DEBE ir en el fragmento (`#`) de la URL del enlace, nunca en la ruta ni en la
  query.
- **R17.** El enlace DEBE caducar a las 72 horas de emitirse. DONDE el entorno defina
  `AUTH_BIENVENIDA_TTL_HORAS` con un entero positivo, el sistema DEBE usar ese valor.
- **R18.** CUANDO el maestro abre un enlace vigente y envía una contraseña que cumple la política
  fuerte y coincide con su confirmación, el sistema DEBE guardar esa contraseña, invalidar el enlace
  y confirmarle que ya puede entrar por `/login`.
- **R19.** SI el enlace ya se usó, venció, no existe o su secreto no coincide, ENTONCES el sistema DEBE
  responder con un único mensaje genérico, sin cambiar la contraseña, y ofrecer pedir un código con
  «¿Olvidaste tu contraseña?».
- **R20.** SI llegan a la vez dos envíos con el mismo enlace, ENTONCES el sistema DEBE guardar como
  mucho una contraseña, y el otro envío DEBE recibir la respuesta de R19.
- **R21.** CUANDO la pantalla lee el secreto de la URL, el sistema DEBE quitarlo de la barra de
  direcciones antes de que el maestro escriba nada.
- **R22.** CUANDO se emite para el mismo usuario un enlace de bienvenida nuevo o un código de
  «recuperar contraseña», el enlace de bienvenida anterior DEBE dejar de servir.

### El alta no depende del correo

- **R23.** SI el envío de la bienvenida falla, por un error del SMTP, por un error al emitir el enlace
  o porque no hay URL base de la app, ENTONCES el alta DEBE terminar igual, con la organización y el
  maestro creados, y la action DEBE devolver `creada` con `bienvenida: "no_enviada"`.
- **R24.** SI el entorno no tiene SMTP configurado, ENTONCES la action DEBE devolver `creada` con
  `bienvenida: "sin_correo"`.
- **R25.** CUANDO el alta termina con `creada` y `bienvenida: "enviada"`, la pantalla «Empresas»
  DEBE avisar al superadmin de que la empresa se creó y de que el maestro recibió en su email un
  correo para crear su contraseña.
- **R26.** CUANDO el alta termina con `creada` y `bienvenida` vale `"no_enviada"` o `"sin_correo"`,
  la pantalla DEBE mostrar un aviso de advertencia que diga que la empresa se creó, que el correo de
  bienvenida no salió y que se reenvía con «Reenviar bienvenida» en la fila de la empresa.
- **R27.** SI el alta termina con `ya_existe`, `conflicto`, `invalida` o `no_autorizado`, ENTONCES el
  sistema NO DEBE emitir ningún enlace ni enviar ningún correo.
- **R28.** La respuesta de `altaEmpresaAction` NO DEBE contener el enlace, el secreto ni su hash.

### Reenviar la bienvenida

- **R29.** Cada fila de la tabla de «Empresas» que tenga al menos un maestro DEBE mostrar un botón
  «Reenviar bienvenida». SI la empresa no tiene maestros, ENTONCES la fila NO DEBE mostrarlo.
- **R30.** CUANDO el superadmin pulsa «Reenviar bienvenida», el sistema DEBE enviar una bienvenida
  con un enlace nuevo al primer maestro de esa empresa (el más antiguo por fecha de alta), y el
  enlace anterior DEBE dejar de servir (R22).
- **R31.** CUANDO termina el reenvío, la fila DEBE mostrar el resultado. Con `enviada`, a qué email se
  envió. Con `no_enviada` o `sin_correo`, que no salió y que se puede reintentar. Con
  `sin_maestro`, que la empresa no tiene maestro.
- **R32.** SI quien pide el reenvío no es superadmin, ENTONCES el sistema DEBE responder
  `no_autorizado` sin leer la empresa, sin emitir ningún enlace y sin enviar nada.
- **R33.** SI el identificador de empresa del reenvío no es un UUID, ENTONCES el sistema DEBE
  responder `invalida`. SI es un UUID pero la empresa no tiene maestro o no existe, ENTONCES DEBE
  responder `sin_maestro`.

### Secretos y registros

- **R34.** El sistema NO DEBE escribir en ningún log el secreto del enlace, la URL completa del enlace
  ni el código OTP. La única excepción es la línea de depuración del emisor de consola, que ya existe
  y solo sale con `AUTH_OTP_DEBUG_LOG=1`.
- **R35.** Ningún correo enviado DEBE contener la contraseña SMTP, un hash de contraseña ni el hash
  del secreto del enlace.

### Envío por Brevo

- **R36.** SI `SMTP_HOST` no está definida, ENTONCES la configuración de correo DEBE usar
  `smtp-relay.brevo.com`, el puerto 587 y STARTTLS.
- **R37.** Ni `lib/config/email.ts` ni la sección de correo de `.env.example` DEBEN describir Gmail ni
  Google Workspace como el canal de la app, ni pedir una contraseña de aplicación de Google.

## Preguntas abiertas

- **P1 (Carlos). ¿Esto cuenta como «reutilizar» `PasswordResetService`?** Hoy ese servicio no
  tiene enlaces. Envía un código de 6 dígitos que vale 10 minutos, guardado en
  `email_otp_challenge`. El spec hace esto:
  - usa la misma tabla, el mismo hash y el mismo consumo;
  - añade al servicio dos métodos, uno que emite el enlace y otro que lo canjea;
  - el enlace lleva un secreto largo en vez del código.

  Sin tabla nueva y sin migración. La alternativa más literal es un enlace que solo abra
  «recuperar contraseña» con el email ya puesto, y que el maestro pida ahí el código. Esa no es de
  un solo uso ni tiene caducidad propia: está descartada en `design.md > 12`, A1. Si Carlos
  prefiere esa, cambian R15–R22.
- **P2 (Carlos). Remitente de Brevo en cada entorno.** El login SMTP de Brevo (`SMTP_USER`) no es una
  dirección desde la que se pueda enviar, y hoy el remitente cae en `SMTP_USER` si falta
  `SMTP_FROM`. ¿Está puesto `SMTP_FROM`, un remitente verificado en Brevo, en Production y en
  Preview? ¿Y `NEXT_PUBLIC_APP_URL`, sin la cual no hay enlace ni logo (R4, R23)? El spec no hace
  obligatoria ninguna de las dos, para no tumbar el OTP del login en un entorno al que le falten:
  solo lo documenta.
- **P3 (Carlos). ¿Se oculta «Reenviar bienvenida» cuando el maestro ya creó su contraseña?** Para
  saberlo hay que guardar un dato nuevo, porque hoy la base no distingue una contraseña puesta de
  la aleatoria del alta. Mientras no se decida, el botón siempre está: reenviar a un maestro que ya
  tiene contraseña solo le da un enlace para cambiarla, que equivale a «recuperar contraseña».
- **P4 (Carlos). ¿El pie del correo lleva una dirección de contacto o de soporte?** No está en
  `docs/`. Hasta que la haya, el pie dice que es un correo automático, sin dirección.

## Decisiones de la aprobación (Carlos, 2026-10-23)

Carlos aprobó el spec y respondió P1–P4 (`tasks.md`, cabecera). P1 confirma el diseño. P2, P3 y P4
añaden estos requisitos. P3 deja sin efecto la línea «Guardar en la base si el maestro ya creó su
contraseña» de `## Lo que NO entra`.

- **R38 (P3).** CUANDO un usuario guarda su contraseña por el enlace de bienvenida o por «recuperar
  contraseña», el sistema DEBE registrar en la base el momento en que lo hizo. DONDE el primer
  maestro de una empresa (R30) ya tenga ese registro, la fila de «Empresas» NO DEBE mostrar
  «Reenviar bienvenida». SI la pantalla no puede leer ese dato, ENTONCES DEBE aplicar R29.
- **R39 (P4).** DONDE el entorno defina `EMAIL_CONTACTO` con un email válido, el pie de todo correo
  DEBE mostrarlo, en el texto plano y en el HTML. SI está vacía, no existe o no es un email,
  ENTONCES el pie NO DEBE mostrar ninguna dirección.
- **R40 (P2).** SI no hay URL base de la app, ENTONCES la bienvenida DEBE terminar en `no_enviada`
  (R23) y el servidor DEBE registrar un aviso que nombre `NEXT_PUBLIC_APP_URL`, sin ningún valor
  de entorno. El OTP DEBE seguir saliendo con la cabecera de texto (R4).
