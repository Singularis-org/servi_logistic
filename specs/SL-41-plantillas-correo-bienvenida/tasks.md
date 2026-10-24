# SL-41 — Tareas

> **Aprobado por Carlos Restrepo el 2026-10-23** (spec `7be57e8`, R1–R37). Sus respuestas a las
> preguntas abiertas, que añaden R38–R40 (`requirements.md > Decisiones de la aprobación`) y
> `design.md > 16`:
>
> - **P1.** Se queda el diseño: enlace de un solo uso con un secreto de 256 bits, sobre
>   `email_otp_challenge` y el consumo de `PasswordResetService`.
> - **P2.** `SMTP_FROM` ya está en Preview. `NEXT_PUBLIC_APP_URL` la añade Carlos en Vercel. Si
>   falta, la app no se rompe: el alta sale igual, la pantalla avisa de que el correo no salió y
>   el servidor registra un aviso que nombra la variable (R40).
> - **P3.** «Reenviar bienvenida» se oculta cuando el maestro ya creó su contraseña. El dato se
>   guarda con una migración **nueva** (T14, R38). Deja de valer el «sin migración» de
>   `design.md > 5.1` solo para esa columna; el enlace sigue sin tabla nueva.
> - **P4.** El pie lleva un correo de contacto configurable por entorno. Si está vacío, no aparece
>   (T15, R39).

> Orden: T0 → (T1 ∥ T2 ∥ T3 ∥ T4) → T5 → T6 → T7 → T8 → (T9 ∥ T10) → T11 → T12 → T13.
> `[P]` = paralelizable con las demás `[P]` de su tanda. **T1 bloquea** la parte visual de T5 (la
> maqueta HTML) y cualquier ajuste visual de T10.

- [x] **T0. Base y premisas.**
  - Hacer `git merge-base` con `dev`, y confirmar que estas piezas siguen donde las cita el diseño:
    - `plantillaOtpCodigo`;
    - `PasswordResetService`;
    - `EmailOtpChallengeRepository`;
    - `altaEmpresaAction`;
    - `EXCEPCIONES_DE_PLATAFORMA`, con `lib/actions/organizaciones.ts` y `lib/actions/password-reset.ts`;
    - el censo de `contrasena-maqueta-unica`;
    - las `PUBLIC_ROUTES` firmadas.
  - Confirmar con el leader las respuestas de P1–P4. Si P1 cambia, se para.
  - **Hecho:** nota en `progress/impl_SL-41.md` con el SHA de la base y cada premisa confirmada o
    refutada.

- [x] **T1. `/design` de la plantilla HTML (BLOQUEANTE para la maqueta de T5).**
  - Pasar por `/design` la plantilla común (cabecera, cuerpo, botón, nota y pie) y sus dos
    instancias: el OTP y la bienvenida. La propuesta de partida está en `design.md > 3.2`.
  - Restricciones:
    - la paleta de `docs/marca.md`;
    - nada de amarillo como texto sobre claro;
    - que funcione en Gmail web, Gmail Android y Outlook, con tablas y estilos en línea;
    - el logo PNG a 140 px o más.
  - Medir con `tests/fixtures/contraste.ts` el contraste de cada pareja texto/fondo.
  - **Hecho:** maqueta aprobada por Carlos y anotada en `progress/impl_SL-41.md`, con colores,
    tamaños y textos finales. Si cambia algo de `design.md > 3.2` o `6.4`, se actualiza el design en
    la misma tanda.

- [x] **T2. Configuración [P].** Depende de T0.
  - `lib/config/app-url.ts` con `baseUrlDeLaApp()`. `baseUrlEnlace()` de `whatsapp-envios.ts`
    pasa a delegar en ella.
  - `BIENVENIDA_TTL_HORAS` en `lib/config/auth.ts`, a 72 por defecto.
  - `lib/config/email.ts`:
    - host por defecto de Brevo;
    - comentarios de Brevo, sin Gmail ni Google.
  - `.env.example`: sección de correo de Brevo y `AUTH_BIENVENIDA_TTL_HORAS=`.
  - Tests:
    - `email-config.test.ts`: host por defecto (R36) y textos (R37);
    - el test de `nodemailer-email-sender.test.ts` que habla de Google se renombra a Brevo;
    - un test de `baseUrlDeLaApp`, con las dos variables, sin ninguna y con barra final;
    - los tests de WhatsApp que usan `baseUrlEnlace` siguen en verde.
  - **Hecho:** `pnpm exec vitest related --run` de esos archivos en verde, y typecheck limpio.

- [x] **T3. `consumirSiActivo` en el repositorio de desafíos [P].** Depende de T0.
  - Añadirlo a la interfaz y a `EmailOtpChallengeRepository` (`design.md > 5.4`).
  - Test de integración `tests/integration/db/enlace-bienvenida.test.ts` contra Postgres real:
    - dos llamadas a la vez sobre la misma fila: exactamente una devuelve `true`;
    - una fila vencida devuelve `false`;
    - una fila ya consumida devuelve `false`.
  - Con una mutación del `WHERE`, quitando `consumedAt: null`, el test se pone rojo. Anotarlo.
  - **Hecho:** test verde con `HAY_BASE_DE_DATOS`, y la mutación registrada como «muere».

- [x] **T4. `BienvenidaMaestroRepository` [P].** Depende de T0.
  - Interfaz y repositorio (`design.md > 6.2`).
  - Test de integración `tests/integration/db/bienvenida-maestro-repository.test.ts`:
    - el maestro de otra empresa no sale;
    - un usuario de otro rol de la misma empresa no sale;
    - con dos maestros, sale el más antiguo;
    - una empresa sin maestro devuelve `null`;
    - el `nombre` de la empresa es el de esa organización.
  - El test tiene que fallar si algo de esto se rompe. Con una mutación que quite el filtro
    `organizacion_id`, se pone rojo.
  - **Hecho:** test verde y mutación anotada.

- [x] **T5. Plantilla común y correos OTP.** (El HTML es la propuesta de T1; se ajusta si Carlos la cambia.) Depende de T2. La maqueta, de T1.
  - `lib/services/email/plantillas/plantilla-marca.ts`, con `componerCorreo` y `escaparHtml` compartido.
  - `otp-codigo.ts` reescrito sobre `componerCorreo` (`design.md > 4`).
  - Tests:
    - `plantilla-marca.test.ts`: R1–R6;
    - literales nuevos en `email-notificacion.test.ts`: R8, R10 y R11 del OTP;
    - `otp-challenge-issuer.test.ts`: R9.
  - La regex del fixture E2E (`e2e/_superadmin-fixture.ts`) sigue encontrando el código. Se
    comprueba con un test unitario que aplica esa regex al texto plano nuevo.
  - **Hecho:** tests verdes, `pnpm run test:guardias` verde (`sin-nombre-heredado` incluida), y el
    HTML coincide con la maqueta de T1.

- [x] **T6. `PasswordResetService`: emitir y canjear el enlace.** Depende de T2 y T3.
  - `emitirEnlaceBienvenida` y `crearContrasenaConEnlace` (`design.md > 6.1`), y `DEVICE_HASH_BIENVENIDA`.
  - `tests/unit/password-reset-enlace.test.ts`, que cubre R15, R17, R18, R19, R22 y R34:
    - secreto de 43 caracteres o más, y solo el hash llega a `create`;
    - `expiresAt` a 72 h, y con `AUTH_BIENVENIDA_TTL_HORAS`;
    - canje bueno: consume **antes** de guardar la contraseña;
    - rechaza un enlace vencido, consumido, sustituido por otro más reciente, con otro `deviceHash` o
      con un secreto erróneo;
    - nada del secreto en `console.*`.
  - Los tests de `password-reset-service.test.ts` siguen verdes sin tocarse.
  - **Hecho:** tests verdes.

- [x] **T7. Correo de bienvenida y `BienvenidaMaestroService`.** Depende de T4, T5 y T6.
  - `bienvenida-maestro.ts` (`design.md > 6.4`), con los textos de T1.
  - `BienvenidaMaestroService` y su interfaz (`design.md > 6.3`).
  - Tests:
    - `bienvenida-maestro.test.ts`: R13 y R14;
    - `bienvenida-maestro-service.test.ts`: R16 y R23 (SMTP falla, emisión falla, sin `baseUrl`:
      nunca lanza), R24, `sin_maestro`, y R34 (el log de error sin email, enlace ni `message`);
    - `correos-sin-secretos.test.ts`: R7, R11 y R35 sobre los tres correos.
  - **Hecho:** tests verdes.

- [x] **T8. Actions.** Depende de T7.
  - `lib/actions/_shared/contexto-peticion.ts`, con `requestContextFromHeaders` y
    `buildPasswordResetService` movidos desde `password-reset.ts` (`design.md > 7.1`).
  - `altaEmpresaAction` con la bienvenida, y `reenviarBienvenidaAction` (`design.md > 7.2`).
  - `crearContrasenaConEnlace` y `crearConEnlaceSchema` (`design.md > 7.3`).
  - Tests:
    - `organizaciones-action.test.ts`: R12, R23, R24, R27 y R28. En R28, el `JSON.stringify` de la
      respuesta no contiene el enlace;
    - `organizaciones-action.composition-root.test.ts`: sin `deps.bienvenida`, el repositorio real
      recibe el `organizacionId` y el emisor recibe el mensaje. El doble de `getPrismaClient` se
      amplía con `usuario`, `emailOtpChallenge` y `organizacion`;
    - `reenviar-bienvenida-action.test.ts`: R30, R32 y R33;
    - `alta-empresa-rol.test.ts` y los tests de `password-reset-*` siguen verdes.
  - **Hecho:** tests verdes, `plataforma-solo-en-lista` verde sin tocar la lista, y typecheck limpio.

- [x] **T9. `/recuperar-contrasena` en modo enlace [P].** Depende de T8.
  - `RecuperarContrasenaForm.tsx` (`design.md > 9.2`), reutilizando los dos `PasswordInput` del paso 3.
  - `tests/integration/recuperar-contrasena-enlace.test.tsx` (jsdom), que cubre R18, R19 y R21:
    - el hash se borra al montar;
    - el título es «Crea tu contraseña»;
    - `ok` lleva al estado de éxito;
    - `invalid_or_expired` muestra el genérico y vuelve al paso 1.
  - `recuperar-contrasena-form.test.tsx` y `contrasena-maqueta-unica` siguen verdes, con el censo en 2.
  - **Hecho:** tests verdes.

- [x] **T10. «Empresas»: aviso del alta y «Reenviar bienvenida» [P].** Depende de T8. Si T1 propone
  algo para la fila, también depende de T1.
  - `page.tsx` pasa `reenviarBienvenida`.
  - `EmpresasModule.tsx`: `desenlaceDe` con `bienvenida`, los dos avisos y la columna «Bienvenida».
  - `ReenviarBienvenidaBoton.tsx` nuevo.
  - Tests:
    - `empresas-module.test.tsx`: R25, R26 y R29. Se cambian los casos del aviso viejo de SL-32 R37;
    - `reenviar-bienvenida-boton.test.tsx`: R31, con los cuatro resultados y una excepción de red.
  - **Hecho:** tests verdes y captura de la pantalla con los dos avisos en `progress/impl_SL-41.md`.

- [x] **T11. Documentación.** Depende de T8.
  - `README.md` > «El correo, sin el cual nadie entra».
  - `docs/architecture.md` > Alta de empresa.
  - **Hecho:** los textos describen la bienvenida, el reenvío y las variables que necesita
    (`NEXT_PUBLIC_APP_URL`, `SMTP_FROM`, `AUTH_BIENVENIDA_TTL_HORAS`), sin Gmail.

- [x] **T12. E2E.** Depende de T9 y T10.
  - `e2e/superadmin-empresas.spec.ts`:
    - el superadmin da de alta una empresa;
    - lee el enlace de la línea de depuración del `ConsoleEmailSender`, con un helper nuevo en
      `e2e/_superadmin-fixture.ts` que extrae `#enlace=…` del cuerpo;
    - abre el enlace, ve «Crea tu contraseña», la crea y entra por `/login`;
    - un segundo uso del mismo enlace muestra el genérico.
  - Ajustar el paso que hoy espera el aviso «¿Olvidaste tu contraseña?».
  - **Hecho:** `pnpm exec playwright test e2e/superadmin-empresas.spec.ts` en verde.

- [x] **T13. Cierre.**
  - Correr `./init.sh`.
  - Escribir en `progress/impl_SL-41.md` el mapa R1–R37 → test (`design.md > 15`).
  - Anotar para T19 de SL-32 que el correo real de bienvenida se comprueba en cada entorno, con
    Brevo, `SMTP_FROM` y `NEXT_PUBLIC_APP_URL` puestos (P2).
  - **Hecho:** gate local verde, con `INIT_EXIT=0` dentro del log, y cada `R<n>` con su test.

- [x] **T14. P3: «ya creó su contraseña» (R38).** Depende de T0. La parte de pantalla, de T10.
  - Migración nueva `db/migrations/20261023140000_usuario_contrasena_definida_at/` con
    `migration.sql` y `down.sql` (`design.md > 16.1`).
  - `UserRepository.updatePasswordHash` pone `contrasena_definida_at = now()` en el mismo `UPDATE`.
  - `BienvenidaMaestroRepository.organizacionesConBienvenidaPendiente()` y
    `bienvenidasPendientesAction()` (`design.md > 16.2`).
  - `page.tsx` pasa `bienvenidaPendiente`; `EmpresasModule` muestra el botón solo en esas filas.
  - Tests:
    - integración: la empresa cuyo primer maestro ya tiene `contrasena_definida_at` no sale; la que
      no, sí; el maestro más nuevo no cuenta; otra empresa no se mezcla. Mutación del filtro
      `IS NULL`, anotada;
    - integración de `updatePasswordHash`: tras llamarlo la columna deja de ser `NULL`;
    - action: `no_autorizado` sin leer nada;
    - componente: la fila pendiente muestra el botón, la otra no, y con `null` vale R29.
  - Migración aplicada y revertida (`down.sql`) en `sl41_*`.
  - **Hecho:** tests verdes y mutación anotada.

- [x] **T15. P4: contacto en el pie (R39).** Depende de T5.
  - `EMAIL_CONTACTO` en `lib/config/email.ts` (`emailContacto()`, `null` si vacía o no es un
    email) y en `.env.example`.
  - `componerCorreo` la recibe y la pinta en el pie de texto y de HTML (`mailto:` escapado).
  - Tests en `plantilla-marca.test.ts` y `email-config.test.ts`: con contacto aparece, vacía no.
  - **Hecho:** tests verdes.

## Archivos esperados

Configuración:
- `lib/config/app-url.ts`
- `lib/config/auth.ts`
- `lib/config/email.ts`
- `lib/config/whatsapp-envios.ts`
- `.env.example`

Correo:
- `lib/services/email/plantillas/plantilla-marca.ts`
- `lib/services/email/plantillas/otp-codigo.ts`
- `lib/services/email/plantillas/bienvenida-maestro.ts`

Servicios, repositorios e interfaces:
- `lib/services/PasswordResetService.ts`
- `lib/interfaces/services/IPasswordResetService.ts`
- `lib/services/BienvenidaMaestroService.ts`
- `lib/interfaces/services/IBienvenidaMaestroService.ts`
- `lib/repositories/BienvenidaMaestroRepository.ts`
- `lib/interfaces/repositories/IBienvenidaMaestroRepository.ts`
- `lib/repositories/EmailOtpChallengeRepository.ts`
- `lib/interfaces/repositories/IEmailOtpChallengeRepository.ts`

Actions y tipos:
- `lib/actions/_shared/contexto-peticion.ts`
- `lib/actions/organizaciones.ts`
- `lib/actions/password-reset.ts`
- `lib/types/password-reset.ts`

Pantallas:
- `app/(app)/plataforma/empresas/page.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `app/(app)/plataforma/empresas/_components/ReenviarBienvenidaBoton.tsx`
- `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx`

Documentación:
- `README.md`
- `docs/architecture.md`

Tests nuevos:
- `tests/unit/services/email/plantilla-marca.test.ts`
- `tests/unit/services/email/bienvenida-maestro.test.ts`
- `tests/unit/services/email/correos-sin-secretos.test.ts`
- `tests/unit/services/bienvenida-maestro-service.test.ts`
- `tests/unit/password-reset-enlace.test.ts`
- `tests/unit/actions/reenviar-bienvenida-action.test.ts`
- `tests/unit/config/app-url.test.ts`
- `tests/integration/db/enlace-bienvenida.test.ts`
- `tests/integration/db/bienvenida-maestro-repository.test.ts`
- `tests/integration/recuperar-contrasena-enlace.test.tsx`
- `tests/components/reenviar-bienvenida-boton.test.tsx`

Tests que cambian:
- `tests/unit/services/email-notificacion.test.ts`
- `tests/unit/services/otp-challenge-issuer.test.ts`
- `tests/unit/services/nodemailer-email-sender.test.ts`
- `tests/unit/config/email-config.test.ts`
- `tests/unit/actions/organizaciones-action.test.ts`
- `tests/unit/actions/organizaciones-action.composition-root.test.ts`
- `tests/components/empresas-module.test.tsx`

E2E:
- `e2e/superadmin-empresas.spec.ts`
- `e2e/_superadmin-fixture.ts`

Estado:
- `progress/impl_SL-41.md`
