# SL-41 — Diseño: plantillas de correo y bienvenida del maestro

## Lo que ya existe

Busqué «bienvenida», «plantilla de correo», «invitación», «enlace», `EmailSender`, `nodemailer`,
`PasswordReset`, `OtpChallengeIssuer` y `altaEmpresa`, en tres sitios:

- en el board: `feature_list.json`, por nombre y descripción;
- en los specs: `specs/`;
- en el código: `lib/`, `app/`, `e2e/` y `tests/`.

Usé Grep y Read. El MCP del grafo no estaba entre las herramientas de esta sesión.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | Solo SL-41. Ninguna otra ficha habla de correo de bienvenida ni de plantilla de correo. | — |
| `specs/20-recuperacion-contrasena` | El flujo de «recuperar contraseña»: `PasswordResetService`, `email_otp_challenge` y la pantalla `/recuperar-contrasena` en 3 pasos. | **Se reutiliza** (D3): la tabla, el hash, el consumo y la pantalla. |
| `specs/SL-17-organizacion-y-aislamiento` §7.7 | `OrganizacionService.altaEmpresa` crea el maestro con un hash no utilizable. «El maestro fija la suya con recuperar contraseña.» | Se mantiene. La bienvenida va **después** del alta, fuera de su transacción. |
| `specs/SL-32-rol-superadmin` R37 | Tras el alta, el aviso dice «El maestro entra con «¿Olvidaste tu contraseña?» y su email». | **Lo sustituye** este spec, a petición de Carlos (R25, R26). SL-32 se cerró antes de que existiera la bienvenida. |
| `specs/SL-15-nombre-ordenex-codigo` R2, R19 | El correo del OTP lo firma «Servi Logistic». | Se conserva la firma. Cambian los textos del test (§4). |
| `specs/SL-8-marca-logo-paleta-fuente`, `docs/marca.md` | La paleta, el logo en `public/brand/` (hay PNG) y la regla «nunca amarillo sobre blanco». | Es la fuente de la plantilla (§3). |
| `specs/287-maestro-restablece-contrasena` | El maestro restablece la contraseña de otro usuario sin enviar correo (R37, R38 firmados). | Fuera de alcance; no se toca. |
| `specs/107-plantillas-mensajes`, `specs/474-envios-automaticos-whatsapp` | Plantillas y «bienvenida» de **WhatsApp**. | Otro canal; fuera de alcance. |
| Código | `IEmailSender` (transporte), `EmailNotificacionProvider` (caso de uso OTP), `plantillaOtpCodigo` (la única plantilla), `NodemailerEmailSender`, `ConsoleEmailSender`, `crearEmailSender()` y `lib/config/email.ts`. | Se reutilizan todos. `IEmailSender.ts` ya prevé «un aviso nuevo (bienvenida…) como otro caso de uso sobre esta misma interfaz». |

No hay ninguna ficha, spec ni código que ya resuelva la bienvenida ni la plantilla común.

## 1. Inventario de correos

Hoy hay **un solo punto de envío** (`IEmailSender.enviar`) y **una sola plantilla**. Los dos flujos
que mandan correo pasan por ella.

| # | Correo | Disparador (archivo:línea) | Camino hasta el envío | Texto actual |
|---|---|---|---|---|
| 1 | OTP del login de riesgo alto | `lib/services/AuthService.ts:132` (`this.otpIssuer.emitir`) | `lib/services/OtpChallengeIssuer.ts:51` → `lib/services/EmailProvider.ts:20` (`sender.enviar(plantillaOtpCodigo(...))`) → `lib/services/email/NodemailerEmailSender.ts:50` (`sendMail`) o `ConsoleEmailSender.ts:21` | Ver abajo |
| 2 | Código de «recuperar contraseña» | `lib/services/PasswordResetService.ts:54` (`this.otpIssuer.emitir`), llamado desde `lib/actions/password-reset.ts:85` | El mismo que el 1 | El mismo que el 1 |
| 3 | **Bienvenida del maestro** (nuevo) | `lib/actions/organizaciones.ts` tras el alta, y el reenvío | §6 | §6.4 |

**Texto actual de 1 y 2** (`lib/services/email/plantillas/otp-codigo.ts:23-50`):

- Asunto: `Tu codigo de verificacion de Servi Logistic`, sin tildes y sin el código. El código salió
  del asunto en SL-32 (m4).
- Texto plano, en líneas:
  - `Tu codigo de verificacion de Servi Logistic es:`
  - (vacía)
  - `<código>`
  - (vacía)
  - `Vence en <N> minutos y solo sirve una vez.`
  - `Si no solicitaste este codigo, ignora este mensaje y no lo compartas con nadie.`
- HTML: un `<div>` con `color:#0b2545` y el código en `#f26419`. **Son colores de la marca
  anterior**, no de `docs/marca.md`; R3 los prohíbe. No tiene logo, ni pie, ni estilos de tabla.

No sale por correo nada más:

- las notificaciones van por `PushWebService`, la campana (`lib/notificaciones/best-effort.ts`) y
  WhatsApp (`lib/clients/whatsapp-cloud.ts`);
- los avisos diarios (`AvisosDiariosService`) no tocan `IEmailSender`;
- el restablecimiento del maestro (`UsuarioService.restablecerContrasena`, l. 448) no envía nada,
  por decisión firmada;
- `e2e/_dos-empresas-fixture.ts:175` envuelve el emisor real para los E2E. No es un envío de la app.

## 2. El hallazgo que condiciona el diseño

Carlos pidió reutilizar el «token de recuperación de contraseña» (`PasswordResetService`). Pero ese
servicio **no tiene enlaces**. Hace esto:

- emite un **código numérico de 6 dígitos** (`OtpChallengeIssuer.generarCodigoOtp`);
- lo guarda hasheado con bcrypt en `email_otp_challenge.code_hash`;
- le da `AUTH_OTP_TTL_MINUTES` de vida, 10 minutos por defecto;
- lo canjea por email en `restablecer()`: busca el último desafío activo del usuario, compara el
  hash, guarda la contraseña y marca `consumed_at`.

Un código de 6 dígitos que valga 72 horas no aguanta la fuerza bruta. El limitador de
verificaciones (`ResetRateLimiter`) vive en memoria, por instancia, y en Vercel hay varias.

**Decisión.** El enlace reutiliza **la tabla, el hash, la vigencia por `expires_at` y el consumo**
del mecanismo de recuperación, y añade a `PasswordResetService` dos métodos: emitir y canjear. Lo
que cambia es el secreto: 32 bytes aleatorios en vez de 6 dígitos (R15). No hay tabla nueva ni
migración. Lo confirma Carlos en P1.

## 3. Plantilla común

### 3.1 Pieza y contrato

`lib/services/email/plantillas/plantilla-marca.ts` es una función pura que solo depende de
`MARCA` y de lo que recibe:

```ts
type Bloque =
  | { tipo: "parrafo"; texto: string }
  | { tipo: "codigo"; codigo: string }             // el OTP, en su propia línea (R10)
  | { tipo: "boton"; texto: string; url: string }  // HTML: botón; texto: "<texto>: <url>"
  | { tipo: "nota"; texto: string };               // texto secundario (avisos de seguridad)

interface CorreoDeMarca {
  to: string;
  asunto: string;
  /** Línea de vista previa que muestran los clientes de correo; no se ve en el cuerpo. */
  preheader: string;
  bloques: Bloque[];
  // (2026-10-24) `baseUrl` salió de aquí: con R4 nuevo el logo va siempre y la plantilla no la usa.
}

export function componerCorreo(c: CorreoDeMarca): EmailMessage; // { to, subject, text, html }
```

Cada correo es una función que monta sus `bloques` y llama a `componerCorreo`. Así no se puede
escribir un correo fuera de la plantilla (R1), y el texto plano y el HTML salen de la misma lista de
bloques (R5).

### 3.2 HTML (propuesta; la maqueta final sale de `/design`, T1)

- **Compatibilidad.** Maquetación por tablas, con un ancho máximo de 600 px y todos los estilos en
  línea, sin `<style>` ni hojas externas: Gmail y Outlook los quitan. Fuente:
  `Archivo, Arial, Helvetica, sans-serif`, porque Archivo no carga en casi ningún cliente y el
  respaldo tiene que ser legible.
- **Cabecera.** Fondo blanco, con
  `<img src="cid:logo@servilogistic" alt="Servi Logistic" width="180">`. **Cambio aprobado por Carlos
  el 2026-10-24 (T1):** el logo va incrustado en el correo como imagen en línea (adjunto CID), no
  con un `src` absoluto a `{baseUrl}/brand/…`, que no se veía en local y dependía de que la URL
  resolviera y de que el cliente cargara imágenes remotas. Es `public/brand/logo-correo.png`, un
  PNG de 360 px (el doble del ancho pintado) generado desde el SVG de marca por
  `scripts/generar-logo-correo.mjs`, que también escribe sus bytes en base64 en
  `lib/services/email/plantillas/logo-correo.ts`: el correo no lee `public/` con `fs`, porque en
  Vercel ese archivo no viaja a la función. `EmailMessage` suma `imagenesEnLinea` y
  `NodemailerEmailSender` las pasa como `attachments` con `cid` e `inline`. R4 (cambiado por el
  leader el 2026-10-24): el logo y su adjunto van siempre, haya o no `baseUrl`.
  Los 180 px cumplen la regla de 140 px o más de `docs/marca.md`. Debajo, una franja `#FFD000` de
  4 px: el amarillo como franja, no como texto (R3). Ya no hay cabecera de texto (R4, 2026-10-24).
- **Cuerpo.** Fondo `#FFFFFF`, texto `#111111` (18.9:1). El código va en `#111111`, a 28 px, con
  espaciado entre letras.
- **Botón.** Un `<a>` con fondo `#111111` y texto `#FFFFFF`, y el ancho y el relleno puestos en una
  celda de tabla («bulletproof button»).
- **Nota y pie.** Fondo `#F7F7F5`. Texto en `#585858`, que es `componer(#111111, #FFFFFF, 0.70)`,
  una mezcla declarada (R3) que da unos 6.6:1 sobre `#F7F7F5`; T1 la mide con
  `tests/fixtures/contraste.ts`. El pie dice: «Servi Logistic · Este correo se envió
  automáticamente; no lo respondas.» Lleva dirección de contacto solo si se resuelve P4.
- **Escapado.** Todo texto variable pasa por `escaparHtml`. La función ya existe en
  `otp-codigo.ts`: se mueve a la plantilla y se comparte (R6). La URL del botón también se escapa
  como atributo.

### 3.3 Texto plano

- `SERVI LOGISTIC` y una línea en blanco;
- cada bloque, separado por una línea en blanco:
  - el código, solo en su línea (R10);
  - el botón, como `Crear mi contraseña: https://…` (R5);
- la línea en blanco y el pie.

Que el código vaya solo en su línea no es cosmético: `e2e/_superadmin-fixture.ts` lee el código de
la línea de depuración del `ConsoleEmailSender` con `\n<código>\n` (`email-notificacion.test.ts:168`).

## 4. Los correos 1 y 2, en la plantilla

`plantillaOtpCodigo(params)` sigue existiendo con la misma firma. `EmailNotificacionProvider` y
`OtpChallengeIssuer` no cambian. Por dentro llama a `componerCorreo`:

- asunto: «Tu código de verificación de Servi Logistic», con tildes;
- preheader: «Tu código vence en N minutos.»;
- bloques:
  - el párrafo «Tu código de verificación de Servi Logistic es:»;
  - el código;
  - el párrafo «Vence en N minutos y solo sirve una vez.»;
  - la nota «Si no lo pediste, ignora este correo y no compartas el código con nadie.»

Login y recuperación siguen compartiendo el texto (R9). «Código de verificación» vale para los dos,
y separarlos obligaría a cambiar la firma de `OtpChallengeIssuer` y sus dos llamadores sin que nadie
lo haya pedido.

El OTP ya no lee `baseUrlDeLaApp()` (§8). **No** se bloquea sin URL base y lleva el logo por CID
igual (R4, 2026-10-24). El login no depende de ninguna URL.

Cambian los literales de `tests/unit/services/email-notificacion.test.ts`, l. 55, 56 y 143. Son el
contrato, y se reescriben con el texto nuevo; no se cambian por su propia fuente.

## 5. El enlace de bienvenida: datos

### 5.1 Modelo de datos

**Sin migración.** Se reutiliza `email_otp_challenge`, que es una tabla de plataforma
(`lib/db/modelos-de-negocio.ts`, sin `organizacion_id`, igual que hoy). Una fila de bienvenida es
así:

| Columna | Valor |
|---|---|
| `usuario_id` | el maestro |
| `code_hash` | `hashPassword(secreto)`: el mismo bcrypt de `lib/utils/password`. El secreto mide 43 caracteres, por debajo de los 72 bytes de bcrypt. |
| `device_hash` | `"bienvenida"`, la constante `DEVICE_HASH_BIENVENIDA`. No es un sha256 hex, así que nunca coincide con un dispositivo real. Marca el propósito de la fila (§7.3). |
| `ip_address` | la IP del superadmin que dio el alta o pidió el reenvío |
| `expires_at` | `now + BIENVENIDA_TTL_HORAS` |
| `consumed_at` | `null` hasta el canje |

Organización y RLS no cambian. La empresa del maestro sale de `usuario.organizacion_id`; el desafío
no la repite. Ningún dato depende del país: no hay moneda, ni geografía, ni fechas absolutas. El
correo dice «vence en 72 horas» y no da una hora local, así que no hace falta zona horaria.

### 5.2 El enlace

```
{baseUrl}/recuperar-contrasena#enlace={challengeId}.{secreto}
```

- `secreto` es `randomBytes(32).toString("base64url")`: 43 caracteres y 256 bits (R15).
- El `challengeId`, un UUID, permite encontrar la fila sin poner el email en la URL.
- Todo va en el **fragmento** (R16). El navegador no lo manda al servidor, así que no queda en los
  logs de Vercel ni en los de un proxy, y tampoco viaja en el `Referer`.

### 5.3 Caducidad: 72 horas

- **Por qué no menos.** El alta se hace en horario de oficina. Un alta del viernes por la tarde se
  abre el lunes por la mañana: 24 horas no llegan y 48 se quedan justas.
- **Por qué no más.** El enlace es una credencial que se queda guardada en un buzón. Con el botón
  «Reenviar bienvenida» (R30), un enlace vencido cuesta un clic del superadmin, así que no compensa
  dejarlo vivo una semana.
- **Configurable.** `AUTH_BIENVENIDA_TTL_HORAS` en `lib/config/auth.ts`, con el mismo
  `readPositiveInt` que el resto de `authConfig` (R17).

### 5.4 Repositorio

`IEmailOtpChallengeRepository` gana un método, implementado en `EmailOtpChallengeRepository`:

```ts
/** Marca consumido SOLO si sigue activo. true = este llamador lo consumió (R20). */
consumirSiActivo(id: string): Promise<boolean>;
// updateMany({ where: { id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })
// → count === 1
```

`markConsumed` no sirve aquí: actualiza sin condición, y dos canjes a la vez pasarían los dos. El
`WHERE` se prueba contra Postgres real (`tests/integration/db/`): un test de servicio con dobles no
lo ve.

## 6. Servicios

### 6.1 `PasswordResetService`: dos métodos nuevos

`IPasswordResetService` y la clase ganan dos métodos:

```ts
emitirEnlaceBienvenida(input: { usuarioId: string; ipAddress: string }):
  Promise<{ enlace: string; ttlHoras: number }>;            // enlace = "<challengeId>.<secreto>"

crearContrasenaConEnlace(input: { enlace: string; newPassword: string; ipAddress: string }):
  Promise<ResetOutcome>;                                     // ok | invalid_or_expired
```

`ResetOtpRepo` pasa a incluir `create`, `findActiveById` y `consumirSiActivo`. Las dependencias del
constructor no cambian de forma: se amplía el `Pick`.

`emitirEnlaceBienvenida`:

1. genera el secreto;
2. `otpRepo.create({ usuarioId, codeHash: await hashPassword(secreto), deviceHash: DEVICE_HASH_BIENVENIDA, ipAddress, expiresAt })`;
3. devuelve `challengeId.secreto`.

El secreto no se registra, ni en un log ni en un error.

`crearContrasenaConEnlace`, en orden. Cada salida temprana es `invalid_or_expired` (R19):

1. parte `enlace` en `challengeId` y `secreto`. El formato ya lo validó zod en el borde;
2. comprueba el limitador con la clave `buildResetRateKey(challengeId, ip)`. Con 256 bits la fuerza
   bruta no es el riesgo; se pone para no aceptar ráfagas;
3. `findActiveById(challengeId)`: si no hay fila, es que no existe, está consumida o vencida;
4. comprueba que `deviceHash === DEVICE_HASH_BIENVENIDA`. Así, un desafío de login o de
   recuperación nunca se canjea por aquí;
5. `findLatestActiveByUsuarioId(usuarioId)` tiene que ser este mismo `id`. Si no lo es, otro
   enlace o un código posterior lo sustituyó (R22);
6. `verifyPassword(secreto, codeHash)`;
7. `consumirSiActivo(id)`. Si devuelve `false`, otro canje ganó la carrera (R20);
8. `userRepo.updatePasswordHash(usuarioId, await hashPassword(newPassword))` (R18).

Se consume **antes** de guardar la contraseña. Si el proceso muere entre los pasos 7 y 8, el enlace
queda gastado y la contraseña sin poner: el maestro pide otro y nadie gana acceso. Al revés, se
podría canjear el mismo enlace dos veces. Es el estado más restrictivo, el mismo criterio que
documenta `UsuarioService.restablecerContrasena`.

El canje no abre sesión. El maestro entra después por `/login`, con el OTP de dispositivo nuevo
incluido.

### 6.2 `BienvenidaMaestroRepository` (nuevo)

`lib/repositories/BienvenidaMaestroRepository.ts`, con su interfaz en
`lib/interfaces/repositories/IBienvenidaMaestroRepository.ts`:

```ts
maestroParaBienvenida(organizacionId: string):
  Promise<{ usuarioId: string; nombre: string; email: string; empresaNombre: string } | null>;
// usuario WHERE organizacion_id = $1 AND rol.value = 'maestro'
//   ORDER BY created_at ASC, id ASC  LIMIT 1   + organizacion.nombre
```

Corre dentro del `comoPlataforma` que abre la action. Lo hace porque el superadmin no tiene empresa,
y por eso el `organizacion_id` va **explícito** en el `where`. El test de integración prueba ese
`WHERE`: el maestro de otra empresa no sale, un usuario de otro rol de la misma empresa no sale, y
con dos maestros sale el más antiguo.

Es un repositorio propio y no un método de `EmpresasPlataformaRepository` ni de
`OrganizacionRepository`, por dos razones. El primero lo toca SL-40. El segundo tiene un `Pick` de
`$transaction`, y cambiarlo obliga a rehacer el doble del test de composition root de SL-17.

### 6.3 `BienvenidaMaestroService` (nuevo)

Vive en `lib/services/BienvenidaMaestroService.ts`, con su interfaz en
`lib/interfaces/services/IBienvenidaMaestroService.ts`.

```ts
type EstadoBienvenida = "enviada" | "no_enviada" | "sin_correo";

enviar(input: { organizacionId: string; ipAddress: string }):
  Promise<{ estado: EstadoBienvenida; email: string } | { estado: "sin_maestro" }>;
```

Dependencias por constructor:

- el repositorio de §6.2;
- `Pick<IPasswordResetService, "emitirEnlaceBienvenida">`;
- `IEmailSender`;
- `baseUrl: string | null`;
- `smtpConfigurado: boolean`.

**Nunca lanza.** Esa es la regla de D4, y vive aquí para poder probarla sin la action:

1. Busca el maestro. Si no hay, devuelve `sin_maestro`.
2. Si `baseUrl === null`, devuelve `no_enviada` sin emitir el enlace. Un enlace sin URL no sirve, y
   así no queda una fila huérfana (R23).
3. Emite el enlace, compone el correo (§6.4) y llama a `sender.enviar`.
4. Si todo fue bien:
   - con `smtpConfigurado` → `enviada`;
   - sin él → `sin_correo`. El emisor es el de consola y el correo no salió (R24).
5. Cualquier excepción de 1 a 3 se captura y devuelve `no_enviada`. Se registra
   `[bienvenida] no se envio organizacion=<id> usuario=<id> causa=<error.name>`: sin email, sin
   enlace y sin el `message` del error. `EmailEnvioError.message` lleva el destinatario (R34).

El flag `smtpConfigurado` llega por constructor, desde `emailSmtpConfigurado()` en el composition
root. No se deduce de `messageId === null`, porque eso acoplaría el estado a un detalle del
transporte.

### 6.4 El correo de bienvenida

La plantilla `lib/services/email/plantillas/bienvenida-maestro.ts` recibe
`{ to, nombre, empresaNombre, url, ttlHoras, baseUrl }` y llama a `componerCorreo`. Los textos
definitivos se revisan en T1:

- **Asunto:** «Te damos la bienvenida a Servi Logistic». Sin enlace (R11).
- **Preheader:** «Crea tu contraseña para entrar a {empresa}.»
- **Bloques:**
  1. «Hola, {nombre}:»
  2. «Se creó la cuenta de {empresa} en Servi Logistic y tú eres su maestro.»
  3. «Para entrar, crea tu contraseña. Tu usuario es este correo: {email}.»
  4. Botón «Crear mi contraseña», con `url`.
  5. Nota: «El enlace vence en {ttlHoras} horas y sirve una sola vez. Si venció, pide al equipo de
     Servi Logistic que te lo reenvíe, o entra en {baseUrl}/recuperar-contrasena y pide un código
     con tu correo.»
  6. Nota: «Si no esperabas este correo, ignóralo: sin la contraseña nadie puede entrar a tu
     cuenta.»

No lleva contraseña, ni hash, ni código de 6 dígitos (R14).

## 7. Actions (controladores)

### 7.1 Contexto de la petición, compartido

`requestContextFromHeaders()` sale de `lib/actions/password-reset.ts` a
`lib/actions/_shared/contexto-peticion.ts`, un archivo sin `"use server"`. Lo usan
`password-reset.ts` y `organizaciones.ts`. Dentro de un archivo `"use server"`, una función
exportada se convertiría en un endpoint público; por eso se mueve y no se exporta desde allí.

### 7.2 `lib/actions/organizaciones.ts`

```ts
export type AltaEmpresaActionResultado =
  | Exclude<AltaEmpresaResultado, { estado: "creada" }>
  | (Extract<AltaEmpresaResultado, { estado: "creada" }> & { bienvenida: EstadoBienvenida })
  | { estado: "no_autorizado" };

export interface OrganizacionesDeps {
  getActor?: () => Promise<Actor | null>;
  service?: IOrganizacionService;
  bienvenida?: IBienvenidaMaestroService;      // nuevo
  getContext?: () => Promise<RequestContext>;  // nuevo
}
```

`altaEmpresaAction`:

1. aplica `exigirSuperadmin` igual que hoy;
2. `r = comoPlataforma("SL-17", …, alta)`, sin cambios;
3. si `r.estado === "creada"`:
   - corre `comoPlataforma("SL-41", "bienvenida del maestro", () => bienvenida.enviar({ organizacionId: r.organizacionId, ipAddress }))`;
   - devuelve `{ ...r, bienvenida: estado }`;
4. si no, devuelve `r` sin tocar la bienvenida (R27).

La bienvenida corre **fuera** de la transacción del alta, que ya se confirmó. Nada de lo que pase en
el correo la revierte (R23). La respuesta lleva el estado, nunca el enlace (R28).

`reenviarBienvenidaAction(input: unknown, deps?)`:

1. aplica `exigirSuperadmin` antes de nada. Si falla, `{ estado: "no_autorizado" }` (R32);
2. valida con zod `{ organizacionId: z.uuid() }`. Si falla, `{ estado: "invalida" }` (R33);
3. `comoPlataforma("SL-41", "reenvio de bienvenida", () => bienvenida.enviar(...))`;
4. devuelve `{ estado: "enviada" | "no_enviada" | "sin_correo", email } | { estado: "sin_maestro" }`.

`organizaciones.ts` y `password-reset.ts` ya están en `EXCEPCIONES_DE_PLATAFORMA`, y la guardia
`plataforma-solo-en-lista` mira el archivo, no cada llamada. Por eso no crece la lista. Los
servicios y repositorios nuevos **no** llaman a `comoPlataforma`.

**Composition root.** `construirBienvenida()` en `organizaciones.ts` arma
`new BienvenidaMaestroService(new BienvenidaMaestroRepository(prisma), construirPasswordReset…, crearEmailSender(), baseUrlDeLaApp(), emailSmtpConfigurado())`.
El servicio de recuperación se arma con el mismo `buildPasswordResetService` de
`password-reset.ts`, que se mueve a `lib/actions/_shared/` junto al contexto para no duplicarlo. El
test de composition root exige que, sin `deps.bienvenida`, el repositorio real reciba el
`organizacionId` y el emisor elegido reciba el mensaje.

### 7.3 `lib/actions/password-reset.ts`

```ts
export async function crearContrasenaConEnlace(input: unknown, deps?): Promise<ResetPasswordResult>
```

- Schema en `lib/types/password-reset.ts`: `crearConEnlaceSchema = { enlace, password, confirmPassword }`.
  - `enlace` es `/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/`;
  - `password` es `strongPasswordSchema`;
  - la coincidencia se comprueba igual que en `resetPasswordSchema`.
- `comoPlataforma("SL-41", "login", () => service.crearContrasenaConEnlace(...))`.
- Responde `ok`, `invalid_or_expired` o `validation_error`, el mismo tipo `ResetPasswordResult`
  que el paso 3, para que el formulario lo pinte con el código que ya tiene.

Por qué no se puede canjear un desafío de otro tipo:

- el login (`AuthService.verifyChallenge`) exige un código de 6 dígitos (`otpCodeSchema`). Un
  secreto de 43 caracteres no pasa el schema, y bcrypt nunca casa un código de 6 dígitos con el hash
  de un secreto;
- por esta vía, un desafío que no sea de bienvenida se rechaza en el paso 4 de §6.1.

## 8. Configuración

- **`lib/config/app-url.ts`** (nuevo). `baseUrlDeLaApp()` lee `NEXT_PUBLIC_APP_URL`, y si falta
  `NEXT_PUBLIC_SITE_URL`, sin barra final; si no hay ninguna, `null`. Es la misma lógica que
  `baseUrlEnlace()` de `lib/config/whatsapp-envios.ts`, que pasa a delegar en ella en una línea,
  sin cambiar su comportamiento. Así hay una sola fuente y no dos copias.
- **`lib/config/auth.ts`.** Se añade `BIENVENIDA_TTL_HORAS: readPositiveInt("AUTH_BIENVENIDA_TTL_HORAS", 72)`.
- **`lib/config/email.ts`.** Corrige el texto de Gmail (R36, R37):
  - `DEFAULT_SMTP_HOST = "smtp-relay.brevo.com"`, con el mismo puerto 587 y STARTTLS;
  - los comentarios de `EmailConfig.user`, `password` y `from` describen el login SMTP, la clave
    SMTP y el remitente verificado de Brevo;
  - `normalizarPassword` se queda: quitar espacios no estorba con Brevo. Su comentario deja de
    hablar de la consola de Google;
  - el `from` sigue cayendo en `user` si falta `SMTP_FROM`. Hacerlo obligatorio es P2.
- **`.env.example`.** La sección de correo describe Brevo y añade `AUTH_BIENVENIDA_TTL_HORAS=`.
  `NEXT_PUBLIC_APP_URL` ya está documentada; se cita como necesaria para el enlace y el logo.
- **`README.md` > «El correo, sin el cual nadie entra».** El maestro recibe la bienvenida, y
  «¿Olvidaste tu contraseña?» queda como respaldo.
- **`docs/architecture.md` > Alta de empresa.** Una frase sobre la bienvenida y el reenvío.

## 9. Pantallas

### 9.1 «Empresas» (`app/(app)/plataforma/empresas/`)

- `page.tsx` pasa una prop nueva, `reenviarBienvenida={reenviarBienvenidaAction}`, con el mismo
  patrón de inyección que `altaEmpresa`.
- `EmpresasModule.tsx`:
  - `desenlaceDe` lee `bienvenida` cuando el resultado es `creada`. Si falta o no es uno de los tres
    valores, se toma como `no_enviada`: la respuesta cruza la red, y ante la duda se avisa;
  - el aviso de alta tiene dos formas:
    - con `enviada`, un `Alert role="status"` con «Empresa creada. Enviamos a {email} un correo
      para crear su contraseña.» (R25);
    - con `no_enviada` o `sin_correo`, un `Alert` de advertencia con «Empresa creada, pero el
      correo de bienvenida no salió. Reenvíalo con «Reenviar bienvenida» en la fila de la
      empresa.». Con `sin_correo` se añade «El correo no está configurado en este entorno.» (R26);
  - sale `TEXTOS.avisoCreada`, que era el texto de SL-32 R37;
  - en la tabla, una columna nueva al final, «Bienvenida», con `ReenviarBienvenidaBoton` en las
    filas que tienen `maestros.length > 0` (R29).
- `ReenviarBienvenidaBoton.tsx` (nuevo, junto a la pantalla, porque solo se usa aquí):
  - un `Button` `variant="outline"` `size="sm"` con `loading` mientras se envía;
  - debajo, un texto `role="status"` con el resultado (R31):
    - «Enviada a {email}.»;
    - «No salió. Inténtalo de nuevo.»;
    - «No salió: el correo no está configurado.»;
    - «Esta empresa no tiene maestro.»
  - una excepción de red cuenta como «No salió».

La pantalla es la de SL-32: no es nueva. El botón y el aviso usan primitivas que ya existen
(`Button`, `Alert`). Si T1 propone algo para la fila, se aplica.

### 9.2 `/recuperar-contrasena` en modo enlace

La ruta no cambia. Por eso no se tocan `PUBLIC_ROUTES` ni su guardia firmada
(`rastreo-sin-ruta-nueva`).

`RecuperarContrasenaForm.tsx`:

1. Al montar, si `window.location.hash` empieza por `#enlace=`, guarda el valor en estado y llama a
   `history.replaceState(null, "", location.pathname)` en el mismo efecto. El secreto sale de la
   barra antes del primer pintado útil (R21).
2. Con enlace, el formulario arranca en el paso de la contraseña nueva:
   - el título es «Crea tu contraseña» y no «Recuperar contraseña»;
   - usa **los mismos dos** `<PasswordInput>` del paso 3, sin duplicar el JSX. El censo de
     `contrasena-maqueta-unica` sigue en 2;
   - envía con `crearContrasenaConEnlace` en vez de `restablecerContrasena`.
3. Con `invalid_or_expired`, muestra «El enlace no es válido o ya venció.» y un botón «Pedir un código
   por correo», que vuelve al paso 1 del flujo normal (R19).
4. Con `ok`, sigue el estado de éxito de siempre, con el enlace a `/login` (R18).

Si quien abre el enlace ya tiene sesión, `page.tsx` redirige a `/dashboard` y el fragmento se
pierde. Es aceptable: el maestro todavía no tiene sesión. Si la tiene el superadmin que lo prueba,
que abra el enlace en una ventana privada.

## 10. Autorización

| Operación | Quién | Dónde se valida |
|---|---|---|
| Alta y bienvenida | superadmin | `exigirSuperadmin` en `altaEmpresaAction`, antes de construir nada, como hoy |
| Reenviar bienvenida | superadmin | `exigirSuperadmin` en `reenviarBienvenidaAction`, antes de leer la empresa (R32) |
| Crear contraseña con enlace | cualquiera que tenga el enlace, sin sesión | El secreto **es** la autorización: un solo uso, con caducidad y solo el último (§6.1) |

No depende de ningún módulo encendido: la plataforma no tiene módulos.

## 11. Seguridad: lo que se probó al diseñar

- **El secreto no llega al servidor por la URL**: va en el fragmento. **Tampoco aparece en ningún
  log** (R34) **ni en la respuesta de la action** (R28). Sí está en el cuerpo del correo, que es
  donde tiene que estar, y en la línea de depuración del `ConsoleEmailSender` cuando
  `AUTH_OTP_DEBUG_LOG=1`. Esa línea ya existe para el OTP, está apagada en producción y es la que
  usa el E2E.
- **Un solo uso de verdad**: lo garantiza el `UPDATE … WHERE consumed_at IS NULL` atómico, no un
  `if`.
- **Riesgo aceptado, RS1.** Quien conozca el email del maestro puede pedir «recuperar contraseña»
  para él, y eso deja sin valor el enlace de bienvenida (R22). No gana acceso: el código va al buzón
  del maestro. El remedio es un reenvío. Se acepta porque la otra opción, que la bienvenida
  sobreviva a un código posterior, deja dos credenciales vivas a la vez.
- Que nada de lo enviado lleve secretos (R35) se prueba sobre los mensajes renderizados. No
  contienen:
  - el `passwordHash` del maestro;
  - el `code_hash` del desafío;
  - el valor de `SMTP_PASSWORD` del entorno del test.

## 12. Alternativas descartadas

| # | Alternativa | Por qué no |
|---|---|---|
| A1 | Un enlace **sin secreto** que solo abra `/recuperar-contrasena` con el email ya puesto, para que el maestro pida ahí el código. Es la reutilización más literal. | No es de un solo uso ni tiene caducidad, que es lo que pidió Carlos. Además son dos correos y dos pasos para un usuario que todavía no conoce la app. Queda como respaldo dentro del propio correo (§6.4, nota 5), y P1 deja que Carlos la elija. |
| A2 | Mandar en la bienvenida un **código de 6 dígitos** con 72 horas de vida, por `restablecer()` sin tocar nada. | 10⁶ combinaciones durante 72 horas, contra un limitador en memoria por instancia: en Vercel la fuerza bruta es viable rotando IP. |
| A3 | Una **tabla nueva** `token_bienvenida`. | Carlos pidió no inventar otro mecanismo, y `email_otp_challenge` ya tiene las columnas exactas: hash, vigencia y consumo. Una tabla más es una migración más y un segundo sitio donde mirar. |
| A4 | Una **ruta nueva**, `/crear-contrasena`. | Habría que tocar `PUBLIC_ROUTES`, que está firmada literalmente por la guardia de la 229, y el censo de `PasswordInput`. El flujo de la contraseña nueva ya existe en `/recuperar-contrasena`. |
| A5 | El secreto en la **query** (`?t=`). | Queda en los logs de acceso de Vercel y de cualquier proxy, y viaja en el `Referer`. |
| A6 | El logo como **adjunto CID**. | **Revertida por Carlos el 2026-10-24: es la opción que se implementa** (§3.2). El contrato de `IEmailSender` se amplía lo mínimo (`imagenesEnLinea`) y el PNG pesa 6,8 KB. |
| A7 | Una **librería de plantillas** (MJML, react-email). | Son tres correos con la misma forma, y una función pura los cubre. Sería una dependencia que aprobar sin código que ahorrar. No se propone ninguna, así que no se pasan los cuatro checks. |
| A8 | Enviar la bienvenida **dentro** de `OrganizacionService.altaEmpresa`. | Mezcla la transacción del alta con la red. Además cambia el resultado del servicio que usan el E2E de dos empresas y el test de integración del alta, que no quieren correo. |

## 13. Dependencias

Ninguna nueva. `nodemailer` y `bcryptjs` ya están aprobados en `docs/dependencias.md`.

## 14. Choques con otras features en vuelo

| Ficha | Archivos en común | Qué hacer |
|---|---|---|
| SL-40 (Carlos) | `app/(app)/plataforma/empresas/page.tsx`, `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx` | Es la misma persona, así que no salta el candado, pero habrá conflicto de merge. SL-40 añade columnas de cobro a la misma tabla y la bienvenida añade una al final. El que mergee segundo rebasa y junta las dos columnas. Se evitaron a propósito `lib/types/empresas-plataforma.ts` y `lib/repositories/EmpresasPlataformaRepository.ts`, que también toca SL-40 (§6.2). |
| SL-39 (Carlos) | Ninguno | — |

## 15. Mapa requisito → test

| R | Test |
|---|---|
| R1, R5, R6 | `tests/unit/services/email/plantilla-marca.test.ts` |
| R2, R3, R4 | `tests/unit/services/email/plantilla-marca.test.ts`: estructura, colores contra la paleta, ningún `#FFD000` como `color:` sobre un fondo claro, ningún color de la marca anterior, y el logo por CID siempre (R4, 2026-10-24) |
| R7, R11, R35 | `tests/unit/services/email/correos-sin-secretos.test.ts`: recorre los tres correos renderizados. El nombre heredado sale de `tests/fixtures/nombre-heredado.ts`, porque un literal en `tests/` dispararía `sin-nombre-heredado` |
| R8, R9, R10 | `tests/unit/services/email-notificacion.test.ts` (literales nuevos) y `tests/unit/services/otp-challenge-issuer.test.ts` (login y recuperación, mismo correo) |
| R12, R23, R24, R27, R28 | `tests/unit/actions/organizaciones-action.test.ts`, `tests/unit/actions/organizaciones-action.composition-root.test.ts` |
| R13, R14 | `tests/unit/services/email/bienvenida-maestro.test.ts` |
| R15, R17, R18, R19, R22 | `tests/unit/password-reset-enlace.test.ts`: emisión (secreto ≥ 43 caracteres, solo el hash al repositorio, `expiresAt` a 72 h y con el env), canje bueno, vencido, consumido, sustituido, otro `deviceHash` y secreto erróneo |
| R16 | `tests/unit/services/bienvenida-maestro-service.test.ts`: la URL enviada tiene el secreto tras `#` y ni `?` ni el secreto en la ruta |
| R20, R22 | `tests/integration/db/enlace-bienvenida.test.ts`: `consumirSiActivo` contra Postgres (dos llamadas a la vez, una gana; vencido, no) y «el último manda» con filas reales |
| R21 | `tests/integration/recuperar-contrasena-enlace.test.tsx` (jsdom): con `#enlace=` el hash desaparece y se pinta «Crea tu contraseña» |
| R18, R19 (UI) | `tests/integration/recuperar-contrasena-enlace.test.tsx`: `ok` lleva al éxito; `invalid_or_expired` muestra el genérico y «Pedir un código por correo» |
| R23 (servicio) | `tests/unit/services/bienvenida-maestro-service.test.ts`: falla el SMTP, falla la emisión y `baseUrl` es `null`; en los tres casos devuelve `no_enviada` y no lanza |
| R25, R26, R29, R31 | `tests/components/empresas-module.test.tsx` (avisos) y `tests/components/reenviar-bienvenida-boton.test.tsx` |
| R30, R32, R33 | `tests/unit/actions/reenviar-bienvenida-action.test.ts` y `tests/integration/db/bienvenida-maestro-repository.test.ts` (el `WHERE` por empresa y rol, el más antiguo) |
| R34 | `tests/unit/services/bienvenida-maestro-service.test.ts` y `tests/unit/password-reset-enlace.test.ts`: espían `console.*` y exigen que no aparezcan el secreto, la URL ni el email en el registro de error |
| R36, R37 | `tests/unit/config/email-config.test.ts`: el host por defecto, más una lectura de `lib/config/email.ts` y de `.env.example` sin «Gmail», «Google Workspace» ni «contraseña de aplicación» |
| E2E | `e2e/superadmin-empresas.spec.ts`: alta, enlace leído de la línea de depuración, «Crea tu contraseña», login con la contraseña nueva; segundo uso del enlace, rechazado |

## 16. Adenda de la aprobación (Carlos, 2026-10-23)

### 16.1 P3: la columna `usuario.contrasena_definida_at` (R38)

Migración nueva `20261023140000_usuario_contrasena_definida_at`, posterior a las de SL-40
(`20261023130000…`):

```sql
-- migration.sql
ALTER TABLE "usuario" ADD COLUMN "contrasena_definida_at" TIMESTAMP(3);
-- down.sql
ALTER TABLE "usuario" DROP COLUMN "contrasena_definida_at";
```

- Nullable y sin relleno: las filas que ya existen quedan en `NULL`, y para ellas el botón se ve
  como hasta ahora (R29). No hay forma fiable de saber, en las filas viejas, si la contraseña es la
  aleatoria del alta.
- Prisma: `contrasenaDefinidaAt DateTime? @map("contrasena_definida_at")` en `Usuario`.
- Organización y RLS no cambian: es una columna más de `usuario`, que ya tiene las suyas.
- La pone `UserRepository.updatePasswordHash`, en el mismo `UPDATE` que el hash. Hoy solo la llama
  `PasswordResetService`: el `restablecer()` del código y el `crearContrasenaConEnlace` del enlace.
  El restablecimiento que hace el maestro sobre otro usuario (spec 287) va por otro método y no
  la toca: esa contraseña la eligió otra persona.

### 16.2 P3: qué filas muestran el botón

- `IBienvenidaMaestroRepository.organizacionesConBienvenidaPendiente(): Promise<string[]>`: los
  `organizacion_id` cuyo **primer** maestro (el mismo criterio que `maestroParaBienvenida`: el más
  antiguo por `created_at`, `id`) tiene `contrasena_definida_at IS NULL`. Es una lectura de
  plataforma, dentro del `comoPlataforma` de la action.
- `bienvenidasPendientesAction()` en `lib/actions/organizaciones.ts`: `exigirSuperadmin` primero
  (`no_autorizado` sin leer nada); después `{ estado: "ok", organizacionIds }`. Si la lectura
  falla, `{ estado: "error" }`, sin el mensaje.
- `page.tsx` la llama junto al listado y pasa `bienvenidaPendiente: string[] | null`. Con `null`
  (error), el módulo vuelve a R29: botón en toda fila con maestros.
- Se evita `EmpresasPlataformaRepository` y `lib/types/empresas-plataforma.ts`, que toca SL-40.

### 16.3 P4: contacto en el pie (R39)

- `EMAIL_CONTACTO` en `lib/config/email.ts`: `emailContacto()`, un lector aparte de `loadEmailConfig()` (que lanza sin SMTP, y el OTP por consola tiene que seguir saliendo); `null` si falta, está vacía
  o no pasa `z.email()`.
- `CorreoDeMarca` gana `contacto: string | null`. El pie añade «¿Dudas? Escríbenos a {contacto}.»,
  con un `mailto:` escapado en el HTML. Cada plantilla lo recibe de quien la llama, igual que
  `baseUrl`; `componerCorreo` sigue siendo pura.

### 16.4 P2: sin `NEXT_PUBLIC_APP_URL` (R40)

`BienvenidaMaestroService`, con `baseUrl === null`, registra
`[bienvenida] no se envio: falta NEXT_PUBLIC_APP_URL organizacion=<id>` con `console.warn` y
devuelve `no_enviada`. La pantalla muestra el aviso de R26.

### 16.5 Mapa de los requisitos nuevos

| R | Test |
|---|---|
| R38 | `tests/integration/db/bienvenida-maestro-repository.test.ts` (pendientes y el `IS NULL`), `tests/integration/db/user-repository-contrasena-definida.test.ts`, `tests/unit/actions/reenviar-bienvenida-action.test.ts` (`bienvenidasPendientesAction`) y `tests/components/empresas-module.test.tsx` |
| R39 | `tests/unit/services/email/plantilla-marca.test.ts` y `tests/unit/config/email-config.test.ts` |
| R40 | `tests/unit/services/bienvenida-maestro-service.test.ts` |

### 16.6 Ajustes de la implementación

- `BienvenidaMaestroService` recibe el contacto del pie (`emailContacto()`) como sexto parámetro
  del constructor, igual que `baseUrl`.
- En `no_enviada` el email es `string | null`: si falla la lectura del maestro, no hay email.
- En el alta, `sin_maestro` se devuelve como `no_enviada` (el alta siempre crea un maestro; si
  no se encuentra, el correo no salió). La action envuelve la bienvenida en un `try/catch` propio,
  porque `headers()`, el cliente o `comoPlataforma` pueden lanzar aunque el servicio no lo haga.
- `/recuperar-contrasena`: el fragmento se lee con `useSyncExternalStore` y un `useLayoutEffect`
  sin `setState` llama a `replaceState`; la regla `react-hooks/set-state-in-effect` impide hacerlo
  «en el mismo efecto» (§9.2). R21 se cumple igual.
