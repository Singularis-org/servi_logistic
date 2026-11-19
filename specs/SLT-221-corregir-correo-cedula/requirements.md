# SLT-221 «Maestro: corregir correo y cédula de un usuario» — requirements

> Estado: **BLOQUEADO: no cabe en un PR.** El spec se detuvo antes de los requisitos EARS
> (`docs/specs.md > Partir una feature`). La propuesta de corte está en `## Preguntas abiertas`, P1.
> Lo que sigue (alcance, decisiones y hallazgos del código) sirve para las dos rebanadas.

## Alcance

El maestro corrige el **correo** y la **cédula** (número de documento) de un usuario de su empresa
desde el formulario de usuario de Configuración. Hoy los dos campos salen deshabilitados en modo
edición (`UsuarioForm.tsx:477` y `:516`) y el borde los rechaza (`actualizarUsuarioSchema`,
`.strict()`, R16 de la feature 25, `lib/types/usuario.ts:78-98`).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo |
|---|---|---|
| D1 | El maestro corrige el CORREO y la CÉDULA de un usuario desde el formulario de usuario de Configuración. | Carlos, 2026-11-19 |
| D2 | Correo: el cambio solo se aplica cuando la persona lo confirma desde el correo NUEVO. Mientras no confirme, sigue entrando con el anterior. | Carlos, 2026-11-19 |
| D3 | NO se avisa al correo anterior. | Carlos, 2026-11-19 |
| D4 | Cada cambio (correo y cédula) queda en el Histórico de acciones con valor anterior y nuevo. | Carlos, 2026-11-19 |
| D5 | Correo y cédula siguen siendo únicos. | Carlos, 2026-11-19 |

## Lo que ya existe

Buscado `cambio de correo`, `correo nuevo`, `confirmar correo`, `editar cédula`, `emailNuevo`,
`cambioCorreo`, `email_nuevo`:
- **Board** (`feature_list.json`, todos los estados): solo esta ficha. Lo más cercano es
  «Plantillas de correo y bienvenida del maestro» (`plantillas-correo-bienvenida`), que no cambia
  correos.
- **Specs** (`specs/`): nada.
- **Código**: nada que cambie el correo o la cédula de una cuenta existente. Se reutiliza:
  el enlace con secreto de un solo uso de SL-41/SL-18 (`PasswordResetService.emitirEnlace`,
  `urlDelEnlace`), el transporte de correo (`IEmailSender` + `crearEmailSender`), la plantilla
  común (`componerCorreo`), la validación de documento por país (`validarTipoYDocumento`) y el
  registro `appendAccion` de `UserRepository.update`.
- El índice del grafo no existe para este worktree (`index_status`: proyecto no indexado); la
  búsqueda en código se hizo con Grep/Read.

## Hallazgos del código (respuestas a los puntos que pidió el leader)

1. **Dónde vive el correo de login.** No hay Supabase Auth en el login: el correo y el hash de la
   contraseña viven en la tabla `usuario` (`email`, `password_hash`; `db/schema.prisma:107-109`).
   El login busca todas las cuentas del correo (`UserRepository.findCuentasPorEmailConHash`,
   `AuthService.ts:65`) y compara el hash. No hay una segunda copia que sincronizar.
2. **Unicidad.** El correo es único **por empresa** (`@@unique([organizacionId, email])`,
   `usuario_email_key`) y el documento es único **por empresa y tipo**
   (`@@unique([organizacionId, tipoIdentificacionId, cedula])`, `usuario_cedula_key`, SLT-42). El
   mismo correo puede tener cuentas en dos empresas (SL-18): un correo nuevo que ya existe en
   OTRA empresa no choca. `mapDuplicadoError` ya traduce los dos índices a
   `UsuarioDuplicadoError("email" | "cedula")`.
3. **Enlaces por correo.** El repo ya emite enlaces de un solo uso: fila en `email_otp_challenge`
   con una marca en `device_hash` (`bienvenida`, `recuperacion`), el secreto solo como hash y en el
   fragmento `#enlace=` de la URL. **No sirve tal cual para el cambio de correo:** el canje exige
   que el desafío sea el último activo de la cuenta (`findLatestActiveByUsuarioId`,
   `PasswordResetService.ts:194`), así que un código de login o un «recuperar contraseña» de la
   misma persona invalidaría el enlace de cambio de correo, y al revés. Además la fila no tiene
   dónde guardar el correo nuevo.
4. **Multi-empresa.** Quien abre el enlace no tiene sesión ni empresa. El patrón vigente es el de
   `password-reset.ts`: `comoPlataforma` para encontrar la fila y la empresa, con su entrada en
   `EXCEPCIONES_DE_PLATAFORMA` (`FichaJira` no admite `SLT`, deuda D29: se usa la ficha de la
   tabla, como `PaisRepository`). Una tabla nueva para el cambio pendiente es de negocio:
   `organizacion_id`, RLS `<t>_por_empresa`, trigger de misma empresa y clasificación en
   `lib/db/modelos-de-negocio.ts`. Molde: `20261031140100_slt73_ajuste_conciliacion`.
5. **Ruta pública.** `PUBLIC_ROUTES` está firmada por `rastreo-sin-ruta-nueva.guardia.test.ts`.
   La coincidencia es por prefijo (`middleware.ts:41-43`), así que una página bajo
   `/recuperar-contrasena/…` es pública sin tocar la lista, como hizo la bienvenida (SL-41, A4).
6. **Histórico.** `historial_accion.valor_anterior`/`valor_nuevo` son `VARCHAR(60)` y Postgres
   aborta si no cabe (`db/schema.prisma:5245-5249`); un correo puede llegar a 254. Y la guardia
   `historial-accion-sin-datos-cliente.guardia.test.ts` prohíbe las palabras `email` y `cedula` en
   todo bloque `appendAccion`: D4 obliga a una excepción declarada en esa guardia. Consecuencia
   de D4 que conviene que Carlos tenga presente al aprobar: el histórico se descarga a `.xlsx` y
   no se purga, así que el correo y la cédula viejos de un empleado quedan ahí para siempre.
7. **Correo saliente.** SMTP por nodemailer (Brevo en Vercel); sin SMTP degrada a consola
   (`EmailProvider.ts`, `lib/config/email.ts`). Hay que contar con que el envío falle: el
   restablecimiento de contraseña (287) se hizo precisamente porque el SMTP de producción
   rechazó la credencial.
8. **Permisos.** Todo el módulo de usuarios es solo de `maestro` (`ALLOWED_ROLES`,
   `UsuarioService.ts:52`), con una sola lista: lo nuevo del lado del maestro vive en
   `UsuarioService`. El superadmin es `not_found` para el módulo (SL-32).

## Requisitos (EARS)

Pendientes. Se escriben cuando Carlos apruebe el corte de P1, uno por rebanada.

## Preguntas abiertas

### P1 — BLOQUEANTE: la ficha no cabe en un PR. Propuesta de corte

Tope: `gate.tamano_pr.max_archivos` = 40 por defecto (tests incluidos); el 80% son 32. La ficha
entera estima **~38-40 archivos** (25 de producción y 13-15 de tests). Se propone partir en dos
rebanadas verticales que se mergean solas:

**Rebanada 1 — SLT-221 se queda con la CÉDULA** (description acotada a esto). El maestro corrige
el número de documento desde el formulario; se valida con la regla del tipo y del país (si cambia
también el tipo, el documento nuevo se valida contra el tipo nuevo); sigue único por empresa y
tipo (choque → «Ya está en uso por otro usuario» bajo el campo); queda
`usuario_cedula_cambiada` en el Histórico con el documento anterior y el nuevo (cabe en 60). Se
aplica en el acto, sin confirmación. ~17 archivos:
- producción (10): `db/schema.prisma`, migración del valor de enum (`migration.sql` + `down.sql`),
  `lib/types/usuario.ts`, `lib/types/historial-accion.ts`,
  `lib/interfaces/repositories/IUserRepository.ts`, `lib/repositories/UserRepository.ts`,
  `lib/interfaces/services/IUsuarioService.ts`, `lib/services/UsuarioService.ts`,
  `app/(app)/configuracion/_components/UsuarioForm.tsx`;
- tests (7): `tests/unit/types/usuario-schema.test.ts`, un test de `UsuarioService`, uno de
  integración contra la base (UPDATE real, índice único y fila del histórico), el componente del
  formulario, y las guardias `historial-accion-sin-datos-cliente` y
  `historial-accion-escrituras-cubiertas`.

**Rebanada 2 — ficha nueva «Maestro: cambiar el correo de un usuario con confirmación»**,
`depends_on: SLT-221` (las dos tocan la migración del enum del histórico, `UserRepository.update`,
`UsuarioForm.tsx` y las mismas dos guardias; en paralelo chocarían). El maestro pide el cambio, el
correo nuevo recibe un enlace, la persona lo confirma y solo entonces cambia; mientras tanto el
formulario muestra «pendiente de confirmar» con reenviar y cancelar; al confirmar queda
`usuario_email_cambiado` con el correo anterior y el nuevo. Lleva: tabla de negocio nueva para el
cambio pendiente (correo nuevo, hash del secreto, vencimiento, quién lo pidió), ensanchar
`valor_anterior`/`valor_nuevo` del histórico a 254, plantilla de correo, página pública bajo
`/recuperar-contrasena/confirmar-correo` (sin tocar `PUBLIC_ROUTES`), excepción de plataforma para
el canje y E2E. ~30 archivos (21 de producción y 9 de tests): por debajo del 80%, pero justa.
La página de confirmación es una pantalla nueva: pasa por `/design` antes de implementarse.

¿Apruebas el corte? Si sí, el leader acota la description de SLT-221 a la cédula y crea la
ficha de la rebanada 2 con `/afinar-feature`.

### P2 — (rebanada 2) ¿Basta el enlace para confirmar, o se pide también la contraseña actual?

Con solo el enlace, si el maestro teclea mal el correo nuevo y esa dirección existe, su dueño
puede confirmar y después usar «recuperar contraseña» con ella: se queda con la cuenta. Pedir la
contraseña actual al confirmar lo impide, pero deja fuera a quien no la recuerda (justo el caso
que motivó la 287). Propuesta: solo el enlace, con reenviar y cancelar visibles para el maestro
mientras está pendiente. Decide Carlos.

### P3 — (rebanada 2) Vencimiento del enlace

Propuesta: 72 h, como el enlace de bienvenida (`AUTH_BIENVENIDA_TTL_HORAS`), configurable por
entorno; pedir otro anula el anterior. El de «recuperar contraseña» dura 10 min, pero ahí la
persona lo pidió y está esperando; aquí lo pide el maestro y la persona puede tardar.

### P4 — (rebanada 2) Sesiones abiertas al confirmar el correo nuevo

Propuesta: no se cierran. El cambio no toca la contraseña, y cerrar sesiones sin que nadie lo
haya pedido es un efecto que el usuario no espera. Decide Carlos si prefiere cerrarlas.
