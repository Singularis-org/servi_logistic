# Revisión SL-41 «Plantillas de correo y bienvenida del maestro»

- Reviewer, 2026-10-24. Rama `feature/SL-41-plantillas-correo-bienvenida`, head revisado `b1a993b`.
- Diff contra `origin/dev` (`87269af`, que es también el merge-base).
- Spec: `specs/SL-41-plantillas-correo-bienvenida/`, con R1–R40 (R38–R40 vienen de P2–P4). Bitácora: `progress/impl_SL-41.md`.
- No usé el MCP del grafo. Trabajé con Grep, Read y la ejecución de tests.

## Verificación ejecutada por mí

Lo que necesitaba Prisma o una base corrió dentro de `gate.lock`, con owner `reviewer-SL-41`, después de que lo soltara SL-45:
- `prisma generate` y `migrate deploy` sobre una base desechable `sl41r_mut`. La borré al acabar y quedan 0 bases `sl41r_%`.
- Al terminar, `git status` estaba limpio.

| Comprobación | Resultado |
|---|---|
| `pnpm run typecheck` | TC_EXIT=0 |
| `pnpm run lint` | LINT_EXIT=0 (0 errores, 232 avisos) |
| `pnpm run test:guardias` | 4 rojos en `dependencias-declaradas-presentes.guardia.test.ts`. **Es baseline**: está en `tests/baseline-rojos.json`, l. 51, y SL-41 no toca `init.sh`. No cuenta como hallazgo |
| 19 archivos unit/componente de SL-41 (plantillas, enlace, servicio, actions, UI, guardia, logo, config) | 19/19, 266 tests en verde |
| `EmpresasModuleCobro`, `empresas-page`, `alta-empresa-rol`, `password-reset-actions`, `password-reset-service` | 5/5, 51 tests en verde |
| Integración con Postgres: `enlace-bienvenida`, `bienvenida-maestro-repository`, `user-repository-contrasena-definida`, `user-repository-update-password` | 4/4, 16 tests, **ninguno saltado** |

### Mutaciones (16, todas mueren; script `scratchpad/sl41rev/mut.mjs`, restaurado con `git checkout`)

| # | Mutación | Test que la mata |
|---|---|---|
| M1 | `export type { RequestContext };` devuelto a `lib/actions/password-reset.ts` (el bug del 500) | la guardia `use-server-sin-reexport-de-tipos`: 1 failed |
| M2 | secreto de 16 bytes (R15) | `password-reset-enlace` (R15) |
| M3 | `#enlace=` cambiado por `?enlace=` (R16) | `bienvenida-maestro-service` (R16) |
| M4 | sin «el último manda» (R22) | `password-reset-enlace`: 2 rojos |
| M5 | sin `consumirSiActivo` antes de guardar (un solo uso, R20) | `password-reset-enlace`: 2 rojos |
| M6 | sin la comprobación `deviceHash === "bienvenida"` | `password-reset-enlace` (R19) |
| M7 | el OTP vuelve al asunto (R11) | `correos-sin-secretos` + `email-notificacion`: 6 rojos |
| M8 | el alta deja escapar el fallo de la bienvenida (D4, R23) | `organizaciones-action`: 2 rojos |
| M9 | «Reenviar» ignora las pendientes (R38) | `empresas-module`: 2 rojos |
| M10 | el registro de error incluye `error.message`, que lleva el email (R34) | `bienvenida-maestro-service`: 2 rojos |
| M11 | el logo sale sin `baseUrl` (R4) | `plantilla-marca` |
| D1 | **BD:** `consumirSiActivo` acepta un desafío vencido (caducidad) | `enlace-bienvenida` (Postgres) |
| D2 | **BD:** `consumirSiActivo` sin `consumedAt: null` (doble canje) | `enlace-bienvenida`: 3 rojos, entre ellos los dos canjes a la vez |
| D3 | **BD:** pendientes filtradas en el `WHERE`, con lo que el segundo maestro pasa a ser el «primero» | `bienvenida-maestro-repository`: 2 rojos |
| D4 | **BD:** `maestroParaBienvenida` sin filtro de empresa | `bienvenida-maestro-repository`: 2 rojos |
| D5 | **BD:** `updatePasswordHash` no marca `contrasena_definida_at` | `user-repository-contrasena-definida` |

## Prioridades del leader

1. **Seguridad del enlace: OK.**
   - El secreto es `randomBytes(32)` en base64url, 43 caracteres. Va en el `#`, y el schema del borde exige `^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$`.
   - En la base solo entra `hashPassword(secreto)`, en la tabla `email_otp_challenge`. El servicio comprueba `deviceHash` y que el desafío sea el último activo (R22). El consumo es atómico (`updateMany … WHERE consumed_at IS NULL AND expires_at > now`) y ocurre antes de guardar la contraseña.
   - Canjear dos veces, canjear un enlace caducado o canjear uno sustituido: los tres casos fallan. Lo prueban D1, D2, M4 y M5, contra Postgres o con dobles.
   - Asunto de la bienvenida: «Te damos la bienvenida a Servi Logistic». El OTP sigue fuera del asunto (M7).
   - `ConsoleEmailSender` solo registra el destinatario y el asunto. El cuerpo sale únicamente con `AUTH_OTP_DEBUG_LOG=1`.
   - Los registros de error llevan solo `error.name` (M10).
   - La respuesta de la action no lleva el enlace, el secreto ni el hash (R28). No se envía ninguna contraseña.
2. **El alta sobrevive al correo: OK.**
   - Hay `try/catch` en la action y en el servicio, y M8 muere.
   - Los avisos de `enviada`, `no_enviada` y `sin_correo` están cubiertos (R25, R26).
   - «Reenviar bienvenida» se oculta cuando el primer maestro tiene `contrasena_definida_at`. Si la lectura falla, se vuelve a R29. M9, D3 y D5 mueren.
   - La migración `20261023140000_usuario_contrasena_definida_at` trae `down.sql`, es nullable y no tiene relleno. Es posterior a las de SL-40.
3. **El 500 de `/recuperar-contrasena`: OK.**
   - La línea `export type { RequestContext };` ya no está.
   - El composition root vive en `lib/actions/_shared/contexto-peticion.ts`, sin `"use server"`.
   - La guardia nueva tiene control de no vacuidad y contraprueba, y cae con la mutación (M1).
4. **El logo por CID: OK.**
   - `public/brand/logo-correo.png` mide 360×105 y pesa 6.806 B. El sha256 es `0a6c20f3…c17a` y coincide con `LOGO_CORREO_SHA256`.
   - Los bytes en base64 de `logo-correo.ts` son exactamente los del PNG; lo comprobé con node.
   - La imagen es el logo de Servi Logistic sobre blanco. Ni el PNG ni el diff de código contienen «Ordenex»; el nombre solo sale en nombres de specs citados en la bitácora y en el design.
   - `sharp` ya estaba aprobada en `docs/dependencias.md` y no entra ninguna dependencia nueva.
5. **R4, opinión.**
   - Con CID, el logo ya no depende de `NEXT_PUBLIC_APP_URL`. Hoy un OTP enviado desde un entorno sin URL sale con la cabecera de texto, sin ninguna razón técnica.
   - **Conviene relajar R4** y pintar siempre el logo por CID. `baseUrl` seguiría siendo necesario para el enlace de bienvenida (R23, R40).
   - Es un cambio de requisito y lo decide Carlos. **No lo bloqueo.**
6. **Merge con SL-40: OK.**
   - La tabla de «Empresas» queda con las columnas Nombre, Slug, Alta, «Cobro por orden», Maestros y «Bienvenida».
   - `page.tsx` carga las pendientes y el cobro en el mismo `Promise.all`.
   - `EmpresasModuleCobro.test.tsx` (SL-40) y `empresas-module.test.tsx` están en verde.

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` con requisitos EARS numerados (R1–R40).
- [x] `design.md` con alternativas descartadas (§12, A1–A8).
- [x] `tasks.md`: T0–T15 marcadas `[x]`.
- [x] `design.md` abre con `## Lo que ya existe`. El diff reutiliza `PasswordResetService`, `email_otp_challenge`, `IEmailSender` y la pantalla, y no re-crea nada de esa lista.
- [x] Equipo: la rama está publicada y la feature está tomada (commits del candado en la historia).
- [~] Trazabilidad:
  - el mapa R→test está en `progress/impl_SL-41.md`;
  - todas las R tienen test real;
  - **R19 tiene un hueco de comportamiento (H1)**.
- [x] Typecheck y lint en verde (los corrí yo).
- [ ] `gate-completo` en CI: todavía no hay PR.
- [x] Flujo crítico «login y sesión»: E2E `e2e/superadmin-empresas.spec.ts`, 7 passed según la bitácora. No lo volví a correr: lo corre el CI.
- [x] No hay dependencias nuevas.
- [x] No hay secretos hardcodeados. La URL, el TTL, el contacto y el SMTP van por entorno.
- [x] No hay webhooks nuevos.
- [ ] `./init.sh` rápido: la bitácora da `INIT_EXIT=0`. Yo corrí sus piezas (typecheck, lint, guardias y los tests relacionados), no el script entero.

### docs/checkpoints-proyecto.md
- [x] No hay tabla nueva; la columna nueva es de `usuario`, que ya tiene RLS y `organizacion_id`.
- [x] Las queries nuevas filtran por `organizacion_id` (`maestroParaBienvenida`) y hay un test con dos empresas (D4 muere). `organizacionesConBienvenidaPendiente` es una lectura de plataforma, a propósito, dentro de `comoPlataforma` y solo para el superadmin.
- [x] La migración trae `down.sql` y no edita ninguna ya aplicada.
- [x] Ningún recurso de Ordenex.
- [x] Ningún `console.*` registra un secreto ni PII nueva: solo IDs y `error.name`.
- [x] Capas: servicios en `lib/services`, repositorios en `lib/repositories`, actions en `lib/actions`. Zod en el borde: `reenviarSchema` y `crearConEnlaceSchema`.
- [x] La autorización está en el servidor: `exigirSuperadmin` va antes de leer nada en las tres actions.
- [x] Ningún literal de país ni de moneda.

## Hallazgos

### H1 — BLOQUEANTE (R19, en la pantalla): un enlace mal formado deja al maestro sin ningún mensaje

Tres piezas se combinan:
- `crearContrasenaConEnlace` valida el enlace con zod y, si la forma no encaja, devuelve `validation_error` con `fieldErrors.enlace`. Ejemplos: el enlace se copió truncado, o tiene un carácter de más o de menos.
- `RecuperarContrasenaForm.tsx` (l. ~278) hace `setPasswordFieldErrors(res.fieldErrors)`. Pero la pantalla solo pinta `password` y `confirmPassword` (l. 475 y 493), así que el error de `enlace` no aparece en ningún sitio.
- El cliente no valida el enlace antes de enviar.

El resultado: el maestro escribe una contraseña válida, pulsa y no pasa nada. R19 exige otra cosa: si el enlace no existe o su secreto no coincide, un único mensaje genérico y la opción de pedir un código.

`tests/unit/password-reset-enlace-action.test.ts` comprueba el `validation_error` del borde, pero ningún test cubre lo que ve el usuario en ese caso.

**Qué falta:**
- que un `validation_error` con `enlace` termine en el estado `enlaceInvalido`, con «El enlace no es válido o ya venció.» y «Pedir un código por correo». Vale hacerlo en el formulario o mapeándolo en la action;
- un test de componente en `tests/integration/recuperar-contrasena-enlace.test.tsx` que lo fije.

### Menores

- **m1 (R4).** Ver la prioridad 5: relajar R4 con CID es decisión de Carlos.
- **m2.** Con `sin_correo` (sin SMTP), el servicio igualmente emite un desafío nuevo. Eso deja sin valor el enlace anterior aunque el correo no salga. No afecta a la seguridad, porque el anterior queda invalidado y no se abre ninguno nuevo. Pero un «Reenviar» en un entorno sin SMTP rompe el enlace de una bienvenida que ya había salido. Conviene anotarlo, o cortar antes de emitir cuando `smtpConfigurado` es falso.
- **m3.** La pantalla de éxito del modo enlace dice «Contraseña actualizada / se restableció correctamente», que es el texto del flujo de recuperación. Para alguien que la crea por primera vez, «creada» encajaría mejor. R18 se cumple igual, porque ofrece `/login`.

## Veredicto

**RECHAZADO**, por H1 (R19 en la pantalla). Es un arreglo pequeño: el formulario más un test de componente.

Todo lo demás está en verde, incluidas las seis prioridades del leader y las 16 mutaciones. Cuando H1 esté resuelto, la vuelta 2 puede acotarse a su diff.

## Revisión 2 (acotada a 3e0aa6b..2469449)

Corrí typecheck, lint, guardias y la mutación de base de datos dentro de `gate.lock`, con owner `reviewer-SL-41`, sobre la base desechable `sl41r_mut`. La borré al acabar: quedan 0 bases `sl41r_%`, y `git status` quedó limpio.
- `pnpm run typecheck`: TC_EXIT=0.
- `pnpm run lint`: LINT_EXIT=0, sin errores.
- `pnpm run test:guardias`: solo los 4 rojos de `dependencias-declaradas-presentes`, que ya están en el baseline.
- Tests de la vuelta, sin mutar: 9 archivos unit/componente con 131 tests, y `enlace-bienvenida` (Postgres) con `password-reset-enlace`, 25 tests. Todo en verde y nada saltado.

| Punto | Estado | Evidencia |
|---|---|---|
| **H1** (R19): enlace mal formado | **Resuelto** | `RecuperarContrasenaForm.tsx`: si llega `validation_error` con `fieldErrors.enlace`, la pantalla pasa a `enlaceInvalido`, con el genérico y «Pedir un código por correo». Lo cubre el test «con validation_error del ENLACE (mal formado)…». **Mutación** sin ese mapeo: 1 rojo. **Muere** |
| **m3**: texto de éxito | **Resuelto** | En modo enlace dice «Contraseña creada / se creó correctamente»; en recuperación sigue el texto anterior. Hay test de componente y el E2E se ajustó a «Contraseña creada» |
| **m2**: «Reenviar» que falla | **Resuelto** | Si falla el envío, `BienvenidaMaestroService` anula el enlace recién emitido con `anularEnlaceBienvenida`, que llama a `consumirSiActivo`. Así el anterior vuelve a ser el último activo. Si la anulación también falla, se ignora y se mantiene `no_enviada`. **Mutaciones:** quitar la llamada en el servicio da 1 rojo; dejar `anularEnlaceBienvenida` sin consumir da 2 rojos, uno de ellos contra Postgres («m2: anular el enlace nuevo devuelve el valor al anterior…»). **Mueren las dos** |
| **m2 con `sin_correo`** | **Me parece bien** | Sin SMTP, el emisor de consola es la entrega real: en local y en el E2E el enlace se lee del log con `AUTH_OTP_DEBUG_LOG=1`. Anularlo rompería ese camino. Además, en un entorno sin SMTP no existe una bienvenida anterior que haya salido por correo, y la UI ya avisa de que el correo no está configurado |
| **m1 → R4 relajado** | **Aplicado** | Decisión del leader. `requirements.md` reescribe R4 y R40 y cita el texto anterior. `componerCorreo` adjunta siempre el logo y la cabecera es siempre `cid:`. `CorreoDeMarca` ya no lleva `baseUrl`, y el OTP ya no lee `baseUrlDeLaApp()`. La bienvenida sigue exigiendo la URL para su enlace (R23, R40). **Mutación** (volver a quitar el adjunto): 3 rojos en `plantilla-marca` y `email-notificacion`. **Muere** |

No encontré regresiones en el diff de la vuelta. Los demás puntos de la revisión 1 no cambian.

### Veredicto de la revisión 2: **OK**
