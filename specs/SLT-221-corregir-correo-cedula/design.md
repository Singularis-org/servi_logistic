# SLT-221 «Maestro: corregir correo y cédula de un usuario» — design

> Una ficha, dos PR secuenciales (D6). PR 1: cédula y base del Histórico. PR 2: correo con
> confirmación. Requisitos en `requirements.md` (R1601-R1632).

## Lo que ya existe

Buscado `cambio de correo`, `correo nuevo`, `confirmar correo`, `editar cédula`, `emailNuevo`,
`cambioCorreo`, `email_nuevo`:

- **Board** (`feature_list.json`, todos los estados): solo esta ficha. «Plantillas de correo y
  bienvenida del maestro» no cambia correos.
- **Specs**: nada.
- **Código**: nada cambia el correo o la cédula de una cuenta existente. Se REUTILIZA:
  - la validación de documento por país y tipo de SLT-42 (`validarTipoYDocumento`,
    `UsuarioService.validarTipoYDocumento`, `validarCambioDePersona`);
  - el registro del Histórico de `UserRepository.update` (`appendAccion` +
    `resolverActorCongelado`, misma transacción, solo si el valor cambia de verdad);
  - la traducción de duplicados `mapDuplicadoError` → `UsuarioDuplicadoError("email"|"cedula")`;
  - el patrón del enlace de un solo uso de SL-41/SL-18: 32 bytes `base64url`, solo el hash
    (`hashPassword`) en la base, el secreto en el fragmento `#enlace=<id>.<secreto>`, canje que
    consume antes de escribir (`PasswordResetService.emitirEnlace` / `crearContrasenaConEnlace`);
  - el transporte (`crearEmailSender`, que degrada a consola sin SMTP), la plantilla común
    (`componerCorreo`), `baseUrlDeLaApp()`, `emailContacto()`;
  - el limitador de canje (`ResetRateLimiter` + `buildResetRateKey`) y las IP de
    `requestContextFromHeaders`;
  - el patrón «sin sesión, el enlace lleva a su empresa» de `lib/actions/password-reset.ts`
    (`comoPlataforma` + entrada en `EXCEPCIONES_DE_PLATAFORMA`).
- **NO se reutiliza** `email_otp_challenge` para el pendiente (alternativa A2).
- Grafo: el MCP no tiene índice de este worktree; la búsqueda se hizo con Grep/Read.

## 1. Dónde vive cada dato (evidencia)

- **Correo de login:** solo en `usuario.email`. El login no usa Supabase Auth: busca las cuentas
  por correo (`findCuentasPorEmailConHash`) y compara `usuario.password_hash`. No hay otra copia que
  sincronizar. Por eso R1615 sale gratis: mientras `usuario.email` no cambia, se entra con el
  anterior.
- **Unicidad:** `usuario_email_key` = `(organizacion_id, email)` y `usuario_cedula_key` =
  `(organizacion_id, tipo_identificacion_id, cedula)`, los dos `NULLS NOT DISTINCT`
  (`20261026090000_usuario_unico_por_empresa`, `20261107120200_slt42_usuario_documento_unico_por_tipo`).
  Un correo que ya existe en OTRA empresa no choca: es el caso de varias cuentas por correo de SL-18,
  y el login ya ofrece elegir empresa.
- **Datos que dependen del país:** el tipo de documento y su regla (largo, caracteres) salen del
  catálogo `tipo_identificacion` del país de la empresa (`IReglasPaisEmpresa`, SLT-42). El correo no
  depende del país. Nada de moneda, geografía ni impuestos.

## 2. Modelo de datos

### 2.1 Migración A — PR 1: `20261120120000_slt221_historial_correo_cedula`

`migration.sql`:
1. `ALTER TYPE historial_accion_tipo ADD VALUE 'usuario_cedula_cambiada';`
2. `ALTER TYPE historial_accion_tipo ADD VALUE 'usuario_email_cambiado';`
3. `ALTER TABLE historial_accion ALTER COLUMN valor_anterior TYPE varchar(254), ALTER COLUMN valor_nuevo TYPE varchar(254);`
   Ensanchar un `varchar` en Postgres no reescribe la tabla. Antes de escribirla, comprobar con
   `pg_depend` que ninguna vista depende de esas columnas; si alguna depende, la migración la
   recrea.

Los dos valores del enum van juntos en PR 1 para que haya **una sola** migración de enum (su
`down.sql` es caro: recrea el tipo). `usuario_email_cambiado` no tiene escritor hasta PR 2, y para
eso existe `ESCRITOR_PENDIENTE_EN_CURSO` en `historial-accion-escrituras-cubiertas`: «tipos que ya
están en el enum y aún no tienen escritor porque la feature los escribe en una tanda posterior de
la misma rama». PR 2 vacía esa entrada.

`down.sql`: borra las filas de los dos tipos, recrea el tipo sin ellos con el molde de
`20261119120000_historial_accion_ordenes_retiradas_a_central/down.sql`, y estrecha las columnas
con `TYPE varchar(60) USING left(<col>, 60)`. El `left` recorta lo que no quepa: es un rollback, y
sin él la vuelta atrás aborta.

`db/schema.prisma`: los dos valores en `HistorialAccionTipo` y `@db.VarChar(254)` en
`valorAnterior` y `valorNuevo`, con su comentario actualizado (la columna admite, por D10, el
correo y el documento de un usuario).

### 2.2 Migración B — PR 2: `20261120120100_slt221_usuario_cambio_correo`

Tabla de negocio nueva `usuario_cambio_correo` (modelo `UsuarioCambioCorreo`). El molde de una
tabla de negocio es `20261031140100_slt73_ajuste_conciliacion`.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | va en el enlace |
| `organizacion_id` | uuid NOT NULL, default de la empresa en curso como el resto | FK `organizacion` RESTRICT |
| `usuario_id` | uuid NOT NULL | FK `usuario` ON DELETE CASCADE: el pendiente no es evidencia |
| `email_nuevo` | varchar(254) NOT NULL | |
| `secreto_hash` | text NOT NULL | `hashPassword(secreto)`; nunca el secreto (R1632) |
| `solicitado_por_id` | uuid NOT NULL | FK `usuario` RESTRICT: es el actor del Histórico al confirmar |
| `expira_at` | timestamptz NOT NULL | `now + TTL` (R1621) |
| `confirmado_at` | timestamptz NULL | |
| `anulado_at` | timestamptz NULL | cancelar, reemplazar o envío fallido |
| `created_at` | timestamptz NOT NULL default now() | |

- `CHECK (confirmado_at IS NULL OR anulado_at IS NULL)`.
- **Un solo pendiente abierto por usuario:**
  `CREATE UNIQUE INDEX usuario_cambio_correo_abierto ON usuario_cambio_correo (usuario_id) WHERE confirmado_at IS NULL AND anulado_at IS NULL;`
  (R1616). Un pendiente vencido sigue «abierto» para el índice hasta que se reemplaza o se cancela,
  y eso es lo que permite mostrarlo como «Vencido» con «Reenviar» (R1618).
- Índice `(organizacion_id)`.
- **RLS:** `ENABLE ROW LEVEL SECURITY` + política `usuario_cambio_correo_por_empresa` con
  `current_setting('app.organizacion_id')`, igual que las 74 tablas de negocio; `GRANT SELECT,
  INSERT, UPDATE` a `servi_app` (sin `DELETE`: los pendientes se anulan, no se borran).
- **Triggers de misma empresa** para `usuario_id` y `solicitado_por_id`, generados con
  `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` (guardia `fk-misma-empresa`).
- `lib/db/modelos-de-negocio.ts`: alta de `{ modelo: "UsuarioCambioCorreo", tabla: "usuario_cambio_correo" }`
  (guardia `organizacion-en-modelos`).
- `down.sql`: `DROP TABLE usuario_cambio_correo` (con sus triggers y su política).
- `Usuario` gana las dos relaciones inversas (`cambiosCorreo`, `cambiosCorreoSolicitados`).

## 3. Contratos

### 3.1 PR 1 — edición con cédula

- `actualizarUsuarioSchema` gana `cedula: documentoForma` (la misma forma del alta). Sigue
  `.partial().strict()`: `email` y `password` siguen siendo `validation_error` (R1607). Se actualiza
  el comentario «R16», que deja de ser cierto para la cédula.
  `consultarImpactoCambioUsuarioSchema` hace `.pick({ rolId, zonaId })` y no cambia.
- `UpdateUsuarioData` (`IUserRepository`) gana `cedula?: string`; `toUpdateData` la copia.
- `ActualizarUsuarioServiceResult` gana `{ status: "conflict"; campo: "email" | "cedula" }`.
  `ActualizarUsuarioResult` ya la admite por `ActionError`.
- `UsuarioService.validarCambioDePersona`: `cambiaCedula = input.cedula !== undefined && input.cedula !== actual.cedula`.
  Con empresa: si cambia la cédula o el tipo, valida `(tipoResultante, cedulaResultante)` con
  `validarTipoYDocumento`. El error va a `cedula` si la cédula cambió y a `tipoIdentificacionId` si
  solo cambió el tipo (comportamiento de hoy). Sin empresa: `rechazoGenerico` sobre la cédula nueva.
  El resultado normalizado se escribe en `data.cedula` (R1601, R1602).
- `UsuarioService.actualizar` captura `UsuarioDuplicadoError` → `{ status: "conflict", campo }`
  (R1603); hoy solo lo hace `crear`.
- `UserRepository.update`: lee también `cedula` en `previo` y en `despues` y, si cambió, añade al
  mismo `appendAccion` (mismo `lote_id` que rol, zona y marca) la entrada `usuario_cedula_cambiada`
  con `valorAnterior: previo.cedula` y `valorNuevo: despues.cedula` (R1604, R1605). La violación de
  unicidad del `updateMany` pasa por `mapDuplicadoError` (hoy `update` no la traduce).

### 3.2 PR 2 — acciones del maestro (`lib/actions/usuarios.ts`)

Mismo patrón que las otras ocho acciones del archivo: `withErrorHandler` +
`resolveActorFromSession` + `idSchema` + `toUsuarioActionError`.

| Acción | Entrada | Salida |
|---|---|---|
| `solicitarCambioCorreoUsuario(id, input)` | `{ email }` (`solicitarCambioCorreoSchema`, `.strict()`, `email: z.string().email()` como el alta) | `{ status: "ok"; pendiente: CambioCorreoPendienteDTO }` \| `{ status: "envio_fallido" }` \| `ActionError` |
| `cancelarCambioCorreoUsuario(id)` | — | `{ status: "ok" }` \| `ActionError` |
| `obtenerCambioCorreoPendiente(id)` | — | `{ status: "ok"; pendiente: CambioCorreoPendienteDTO \| null }` \| `ActionError` |

`CambioCorreoPendienteDTO = { emailNuevo: string; expiraAt: string /* ISO */; vencido: boolean }`.
Nunca lleva el id del pendiente ni el hash. «Reenviar» es `solicitarCambioCorreoUsuario` con
`pendiente.emailNuevo`: un solo camino de emisión.

### 3.3 PR 2 — acción pública (`lib/actions/confirmar-correo.ts`, `"use server"`)

`confirmarCambioCorreo(input: unknown, deps?)`. `input` = `{ enlace }`, con el mismo formato que
`crearConEnlaceSchema.enlace` (se reutiliza el campo, no se reescribe). Salida:
`{ status: "ok" } | { status: "invalid_or_expired" } | { status: "correo_en_uso" } | { status: "validation_error" }`.
No devuelve ni el correo ni el nombre: quien tiene el enlace ya sabe cuál es su correo.

El composition root (`buildConfirmarCorreoService`) es una función NO exportada del mismo archivo:
en un archivo `"use server"` toda función exportada es un endpoint.

### 3.4 PR 2 — servicios y repositorio

- `UsuarioService` gana `solicitarCambioCorreo`, `cancelarCambioCorreo` y `cambioCorreoPendiente`.
  Viven aquí y no en un servicio aparte por la regla del propio archivo: una sola lista de permisos
  (`ALLOWED_ROLES`) para el módulo. El constructor gana un 7.º parámetro opcional
  `correoDeCambio?: { sender: IEmailSender; baseUrl: string | null; contacto: string | null; ttlHoras: number }`,
  **opcional en el constructor y obligatorio en el uso**: los tres métodos lanzan si no está, y
  `usuarios-composition.test.ts` prueba que `buildUsuarioService` lo pasa (lección de los
  notificadores muertos).
- `IConfirmarCorreoService` / `ConfirmarCorreoService.confirmar({ enlace, ipAddress })`, sin actor:
  el canje (§4.3). Depende de `Pick<IUserRepository, …>` y del limitador.
- `lib/utils/enlace-de-un-uso.ts` (puro): `generarSecretoEnlace()` (32 bytes `base64url`),
  `componerEnlace(id, secreto)` y `partirEnlace(enlace)`. `PasswordResetService` NO se migra en esta
  ficha («Lo que NO entra» de `requirements.md`): no se toca el flujo de contraseñas por una limpieza.
- `IUserRepository` / `UserRepository` ganan los accesos a `usuario_cambio_correo`. Van en el
  repositorio de usuario porque la confirmación escribe `usuario.email` y el Histórico en la misma
  transacción, y ese archivo ya es el punto de escritura de los `usuario_*`:
  - `existeEmailEnEmpresa(email, excluirUsuarioId): Promise<boolean>`: `where { email, id: { not } }`;
    la empresa la pone la extensión.
  - `abrirCambioCorreo({ usuarioId, emailNuevo, secretoHash, solicitadoPorId, expiraAt }): Promise<{ id; expiraAt }>`:
    en una transacción, anula el abierto (`anulado_at = now()`) y crea el nuevo (R1616, R1620).
  - `anularCambioCorreo(id)` / `anularCambioCorreoAbierto(usuarioId)`.
  - `cambioCorreoAbierto(usuarioId)`: el abierto o `null`.
  - `empresaDelCambioCorreo(id): Promise<string | null>`: solo `organizacion_id`; se llama dentro de
    `comoPlataforma`.
  - `cambioCorreoParaCanje(id)`: abierto y no vencido, con `secretoHash`, `usuarioId`,
    `emailNuevo` y `solicitadoPorId`, o `null`.
  - `aplicarCambioCorreo(id): Promise<"ok" | "invalido" | "correo_en_uso">`, en UNA transacción:
    1. `updateMany({ where: { id, confirmadoAt: null, anuladoAt: null, expiraAt: { gt: now } }, data: { confirmadoAt: now } })`;
       si `count === 0`, `"invalido"` (R1625: el segundo concurrente pierde aquí);
    2. lee `previo.email`;
    3. `tx.usuario.update({ email: emailNuevo })`; un P2002 de `usuario_email_key` revierte la
       transacción entera, y el pendiente queda como estaba (R1624);
    4. `appendAccion` de `usuario_email_cambiado` con `valorAnterior: previo.email`,
       `valorNuevo: emailNuevo` y `resolverActorCongelado(tx, solicitadoPorId)`.

## 4. Flujos

### 4.1 PR 1 — editar cédula
Formulario → `actualizarUsuario(id, { …, cedula })` → `UsuarioService.actualizar`:
1. permiso;
2. nombre;
3. rol de plataforma;
4. `findById`;
5. `validarCambioDePersona` (con la cédula);
6. zona y vehículo;
7. `repo.update`, que en la misma transacción escribe la cédula y su fila del Histórico;
8. `UsuarioDuplicadoError` → `conflict`.

### 4.2 PR 2 — pedir, reenviar y cancelar
`solicitarCambioCorreo(id, { email }, actor)`:
1. permiso (R1631);
2. `findById`; si no existe o es de plataforma → `not_found` (R1630; otra empresa no se ve por la
   extensión y la RLS);
3. rol `apiKey` → `validation_error` (R1613);
4. igual al actual → `validation_error` (R1612);
5. `existeEmailEnEmpresa` → `conflict` (R1611);
6. `baseUrl === null` → lanza (sin URL no hay enlace: falla visible, no un pendiente que nadie puede
   abrir);
7. secreto + `abrirCambioCorreo`;
8. `sender.enviar(plantillaConfirmarCorreo({ to: emailNuevo, url, ttlHoras, contacto }))`;
9. si el envío falla → `anularCambioCorreo(nuevo.id)` y `envio_fallido` (R1617). El log solo lleva
   el nombre del error, como `causaDe` en `PasswordResetService`: nunca el destinatario ni la URL
   (R1632).

`cancelarCambioCorreo`: permiso → `findById` → `anularCambioCorreoAbierto` (idempotente).
`cambioCorreoPendiente`: permiso → `findById` → `cambioCorreoAbierto` → DTO con
`vencido = expiraAt <= now`.

Ningún paso escribe al correo anterior (R1614). No se escribe nada en el Histórico al pedir,
reenviar o cancelar: D4 registra el **cambio**, y un pendiente no cambia nada.

### 4.3 PR 2 — confirmar
Página `/recuperar-contrasena/confirmar-correo#enlace=<id>.<secreto>`. Abrirla no cambia nada
(R1626); el botón «Confirmar correo» llama a `confirmarCambioCorreo({ enlace })`:
1. zod;
2. `partirEnlace`;
3. limitador por `(id, ip)` (R1629);
4. `comoPlataforma("SL-18", "confirmar cambio de correo: el enlace lleva a su empresa", () => repo.empresaDelCambioCorreo(id))`;
   si es `null` → `invalid_or_expired`;
5. `conEmpresa(org, () => service.confirmar(…))`: `cambioCorreoParaCanje(id)` →
   `verifyPassword(secreto, secretoHash)` → `aplicarCambioCorreo(id)`.

Toda salida inválida da la misma respuesta (R1623). No toca `Session` (R1627) ni pide contraseña
(R1628).

## 5. Autorización y multi-empresa

- Solo `maestro` (`ALLOWED_ROLES` del mismo `UsuarioService`): R1631. No depende de ningún módulo
  del plan: Configuración › Usuarios es núcleo.
- La empresa sale de la sesión, nunca del cliente. Lecturas y escrituras de `usuario` y
  `usuario_cambio_correo` pasan por la extensión (filtro e inserción de `organizacion_id`) y por la
  RLS: el maestro de otra empresa recibe `not_found` (R1630).
- El canje no tiene sesión: el único paso sin empresa es leer `organizacion_id` por el id del
  enlace, en `comoPlataforma`. Entrada nueva en `EXCEPCIONES_DE_PLATAFORMA`:
  `{ archivo: "lib/actions/confirmar-correo.ts", ficha: "SL-18", motivo: "SLT-221: confirmar un cambio de correo sin sesión; el enlace lleva a su empresa" }`.
  Lleva `SL-18` porque `FichaJira` no admite `SLT` (deuda D29), como `PaisRepository`. Todo lo
  demás corre en `conEmpresa(org)`, así que `appendAccion` y el `UPDATE` quedan bajo la RLS de esa
  empresa.

## 6. Histórico de acciones

- `lib/types/historial-accion.ts`: los dos tipos en `HISTORIAL_ACCION_TIPOS`, bloque A.3 («cambia
  quién puede hacer qué»). El correo decide quién entra en la cuenta, y la cédula es la identidad de
  la cuenta, como el resto de los `usuario_*`. También en el mapa de categoría y en las etiquetas
  (R1609). Hay que actualizar el conteo de la guardia (86 → 88).
- **Guardia `historial-accion-sin-datos-cliente`** (D10): hoy prohíbe `email` y `cedula` en todo
  bloque `appendAccion`. Se añade una lista de excepciones declaradas
  `{ archivo: "lib/repositories/UserRepository.ts", accion: "usuario_cedula_cambiada" | "usuario_email_cambiado", motivo }`.
  El barrido excluye solo el bloque cuyo `accion:` está en esa lista y sigue barriendo el resto del
  archivo. Lleva su contraprueba: meter `email` en el bloque de `usuario_rol_cambiado` sigue en rojo.
  El comentario de cabecera deja escrita la consecuencia aceptada: el Histórico se descarga y no se
  purga.
- **Guardia `historial-accion-escrituras-cubiertas`**:
  - PR 1: `usuario_email_cambiado` entra en `ESCRITOR_PENDIENTE_EN_CURSO` (ficha SLT-221, tarea T2.4).
  - PR 2: sale de ahí y entra en el censo `{ archivo: UserRepository.ts, metodo: "aplicarCambioCorreo", forma: "abre_tx", mutacion: /tx\.usuario\.update\(/ }`.
  - La cédula no añade método: la escribe `update`, que ya está en el censo.

## 7. Pantallas

- **PR 1** — `UsuarioForm.tsx`: quita `disabled={isEditar}` del campo «Número de documento» y manda
  `cedula` en el payload de edición. «Email» sigue deshabilitado en PR 1.
- **PR 2** — `UsuarioForm.tsx` en edición: el campo «Email» (sigue deshabilitado: muestra el correo
  vigente) gana debajo el bloque `CambioCorreoUsuario` (al lado del formulario, se usa en un solo
  sitio):
  - sin pendiente: botón «Cambiar correo» → campo + «Enviar confirmación»;
  - con pendiente: «Pendiente de confirmar: <correo nuevo> · vence <fecha y hora>» (o «Vencido»),
    con «Reenviar» y «Cancelar» (R1618-R1620);
  - errores: `conflict` → «Ya está en uso por otro usuario»; `envio_fallido` → R1617.
- **PR 2** — página pública nueva
  `app/recuperar-contrasena/confirmar-correo/page.tsx` + `_components/ConfirmarCorreoForm.tsx`
  (cliente: lee el fragmento, un botón, tres mensajes y enlace a `/login`). Es pública sin tocar
  `PUBLIC_ROUTES`: el middleware compara por prefijo (`pathname.startsWith("/recuperar-contrasena/")`,
  `middleware.ts:41-43`).
- **`/design` obligatorio:** la página de confirmación es una pantalla NUEVA y el bloque
  «pendiente» es un punto nuevo de una pantalla existente. Los dos pasan por `/design` antes de su
  task de frontend (T3.0), reusando la pantalla de hoy y los componentes de
  `/recuperar-contrasena`. Nada de rediseñar el formulario.

## 8. Correo

`lib/services/email/plantillas/confirmar-correo.ts` sobre `componerCorreo`:
- asunto `Confirma tu correo en ${MARCA.nombre}` (sin enlace en el asunto ni en el preheader,
  criterio de SL-41 R11);
- un párrafo: «Tu administrador cambió el correo de tu cuenta a este. Confírmalo para empezar a
  entrar con él.»;
- botón «Confirmar correo»;
- nota de vencimiento en horas;
- nota «Si no esperabas este cambio, ignora este correo: tu cuenta no cambia.»

TTL: `AUTH_CAMBIO_CORREO_TTL_HORAS`, por defecto 72, en `lib/config/auth.ts` con `readPositiveInt`
(D8). Sin SMTP el emisor degrada a consola; la plantilla no pone el enlace en la línea de metadata.

## 9. Alternativas descartadas

- **A1 — Partir en dos fichas** (cédula y correo), propuesta de este mismo spec por tamaño.
  Descartada por decisión de Carlos el 2026-11-19 («pon los dos en la misma», D6): se mantiene una
  ficha y el tope se respeta con dos PR secuenciales sobre la misma rama.
- **A2 — Guardar el pendiente en `email_otp_challenge`** con una marca nueva en `device_hash` y una
  columna `email_nuevo`. Descartada: el canje exige que el desafío sea el último activo de la cuenta
  (`findLatestActiveByUsuarioId`), así que un código de login o un «recuperar contraseña» de la
  persona invalidaría el enlace de cambio de correo, y al revés. Además es una tabla de plataforma
  sin `organizacion_id` ni RLS de empresa, y una columna de negocio no pinta en ella.
- **A3 — Meter `email` en `actualizarUsuarioSchema`** y crear el pendiente dentro de
  `actualizarUsuario`. Descartada: un «guardar» que deja el correo igual y envía un mensaje mezcla
  un cambio inmediato con uno diferido, y un fallo del correo dejaría el resto guardado y el
  correo a medias en la misma respuesta. Además rompe el contrato que vigila
  `usuario-schema.test.ts` («nunca email/password»). Es la misma razón por la que
  `restablecerContrasena` y `consultarImpactoCambio` son acciones aparte.
- **A4 — Ruta pública nueva `/confirmar-correo`.** Descartada: `PUBLIC_ROUTES` está firmada por una
  guardia, y una subruta de `/recuperar-contrasena` ya es pública. Es el criterio de la bienvenida
  (SL-41, A4).
- **A5 — Que el `GET` del enlace aplique el cambio.** Descartada: los escáneres de enlaces del correo
  (Safe Links y similares) visitan la URL y confirmarían solos. El secreto va en el fragmento y el
  cambio exige pulsar un botón (R1626).
- **A6 — Recortar el correo a 60 caracteres** en el Histórico en vez de ensanchar. Descartada: un
  correo recortado no sirve como «valor anterior», que es lo que pide D4.
- **A7 — Pedir la contraseña actual al confirmar.** Descartada por D7: el maestro no la conoce y deja
  fuera justo a quien no la recuerda. El riesgo que queda está en §10.

## 10. Riesgos y consecuencias aceptadas

- **Correo mal tecleado** (D7): si el correo nuevo existe y es de otra persona, esa persona puede
  confirmar y después recuperar la contraseña. Mitigación: el maestro ve el pendiente y lo cancela, y
  la confirmación queda en el Histórico con el correo anterior y el nuevo.
- **PII en el Histórico** (D10): correo y cédula anteriores, descargables y sin purga. Aceptado.
- **Envío fallido** (R1617): el pendiente anterior ya se anuló al pedir el nuevo; tras un fallo no
  queda ninguno, y el maestro reintenta.
- **Timestamps de migración:** si `dev` recibe migraciones posteriores antes del merge de cada PR,
  se renombra la carpeta ANTES de aplicarla en ninguna base (renombrar una ya aplicada deja una
  fila fantasma).
- **E2E del canje:** el secreto solo existe en el correo. El E2E siembra su propio pendiente con un
  secreto conocido (inserta el hash con Prisma) para recorrer página → acción → base.

## 11. Dependencias

Ninguna nueva. Todo sale de lo que ya está instalado (`node:crypto`, zod, Prisma, nodemailer a
través de `IEmailSender`).

## 12. Trazabilidad (R → test)

| R | Test |
|---|---|
| R1601, R1602 | `tests/unit/services/usuario-service-cedula.test.ts` |
| R1603 | `tests/unit/services/usuario-service-cedula.test.ts` + `tests/integration/db/usuario-cedula-corregida.test.ts` (índice real) + `tests/unit/components/usuario-form.test.tsx` (mensaje) |
| R1604, R1605 | `tests/integration/db/usuario-cedula-corregida.test.ts` (UPDATE y fila reales; mismo documento sin fila) |
| R1606 | `tests/unit/components/usuario-form.test.tsx` + `e2e/usuario-corregir-cedula.spec.ts` |
| R1607 | `tests/unit/types/usuario-schema.test.ts` + `tests/unit/actions/usuarios.test.ts` |
| R1608 | `tests/integration/db/usuario-cedula-corregida.test.ts` (inserta 254 caracteres; 255 aborta) |
| R1609 | `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` (catálogo y categoría) + `e2e/usuario-corregir-cedula.spec.ts` (fila visible en el Histórico) |
| R1610-R1614, R1616, R1617, R1620, R1621, R1630, R1631 | `tests/unit/services/usuario-service-cambio-correo.test.ts` |
| R1611, R1616, R1630 | además `tests/integration/db/usuario-cambio-correo.test.ts` (WHERE de `existeEmailEnEmpresa`, índice parcial, RLS entre empresas) |
| R1615 | `tests/integration/db/usuario-cambio-correo.test.ts` (con pendiente, `findCuentasPorEmailConHash(nuevo)` no da la cuenta y `(anterior)` sí) |
| R1618, R1619 | `tests/unit/components/cambio-correo-usuario.test.tsx` + `e2e/usuario-cambio-correo.spec.ts` |
| R1622, R1624, R1625 | `tests/integration/db/usuario-cambio-correo.test.ts` (`aplicarCambioCorreo` real, P2002, dos canjes concurrentes) |
| R1622, R1623, R1626-R1629 | `tests/unit/services/confirmar-correo-service.test.ts` + `tests/unit/actions/confirmar-correo.test.ts` + `e2e/usuario-cambio-correo.spec.ts` |
| R1632 | `tests/unit/services/usuario-service-cambio-correo.test.ts` (lo persistido es un hash; la URL lleva `#enlace=`; el log de fallo no lleva ni destinatario ni URL) |
| composition (7.º parámetro) | `tests/unit/actions/usuarios-composition.test.ts` |
