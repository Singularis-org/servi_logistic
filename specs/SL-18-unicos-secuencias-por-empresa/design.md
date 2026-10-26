# SL-18 «Únicos y secuencias por empresa»: design

## Lo que ya existe

Búsqueda hecha por el leader antes de F1.2 (board, `specs/`, grafo) con los términos «único por
empresa», «secuencia», «selector de empresa», «login email repetido», «push endpoint». **Ninguna
ficha ni spec cubre esto.** Se reutiliza, sin rehacerlo:

| Qué | Dónde | Cómo se usa aquí |
|---|---|---|
| Patrón de único por empresa: compuesto con `organizacion_id` primero; conserva el nombre del índice para que siga la traducción de P2002; `down.sql` que aborta nombrando el índice | `db/migrations/20261023090000_unicos_por_empresa/`, `progress/impl_SL-17.md > T3.9` | M1 lo copia para `usuario_email_key` y `usuario_cedula_key` |
| Tabla de los 77 únicos de negocio: 18 por empresa, 7 globales a propósito, 52 anclados | `progress/impl_SL-17.md > T3.9` | Es la semilla de la lista de únicos sin empresa de la guardia (§5) |
| Login, OTP y recuperar contraseña en `comoPlataforma("SL-17", "login")` | `lib/actions/auth.ts`, `lib/actions/password-reset.ts`, SL-17 design §7 | Siguen en plataforma; cambia lo que hacen dentro (§3, §4) |
| La empresa de la sesión sale de `usuario.organizacion_id` del dueño de la sesión | `lib/auth/empresa-de-la-peticion.ts` | Elegir la empresa es elegir la cuenta: `Session` no cambia (§3.3) |
| Enlace de un solo uso con el secreto en el fragmento; canje por «último activo» | SL-41: `PasswordResetService.emitirEnlaceBienvenida` / `crearContrasenaConEnlace`, `urlDelEnlace` en `BienvenidaMaestroService.ts`, modo `#enlace=` de `RecuperarContrasenaForm` | La recuperación pasa a usar el mismo mecanismo, con otra marca (§4) |
| `enlaceEnviadoA(log, email)` | `e2e/_superadmin-fixture.ts` | Los E2E de recuperación lo usan en vez de `codigoEnviadoA` (R32) |
| Hueco del push: `PushSuscripcionRepository.registrar` hace upsert por `endpoint` global | `progress/deudas.md > D14`, `progress/review_SL-17.md` (tabla de riesgos) | §7 lo cierra |
| m6: ninguna guardia estática ve un único de negocio sin `organizacion_id` | `progress/review_SL-17.md > m6` | §5 |
| Índices compuestos de rutas calientes, dejados a SL-18 | SL-17 design §3 M2 | §6 |

**SLT-32 «Login bloqueado para usuarios sin empresa»** (Camilo, en vuelo, **sin SDD**: no hay
`specs/SLT-32-*`, su alcance está en `progress/features/SLT-32.md` de su rama). Añade el predicado
`puedeIniciarSesion` a `AuthService.login`, a `AuthService.verifyChallenge`, a
`resolveActorFromSession` y a `isSessionActive`. Choca en `lib/services/AuthService.ts` y en sus
tests. Contrato en §9.

## 1. Visión de conjunto

```
/login ──> login(email, password, organizacionId?) ── comoPlataforma("SL-17","login")
               │  AuthService.login
               │   1. cuentas = usuarios con ese email (todas las empresas + plataforma)
               │   2. si viene organizacionId: cuentas = solo la de esa empresa
               │   3. descarta bloqueadas → compara contraseña en las demás
               │   4. válidas ∩ habilitadas:  0 → invalid_credentials / account_unavailable
               │                              1 → flujo de hoy (sesión u OTP) con ESA cuenta
               │                             ≥2 → elegir_empresa [{organizacionId, nombre}]
               └─> Session(userId = la cuenta) ──> empresaDeLaPeticion() = su organizacion_id

/recuperar-contrasena ──> solicitarRecuperacion(email)
               │  PasswordResetService.solicitar
               │   por cada cuenta del email bajo el límite: emitir enlace (marca «recuperacion»)
               └─> UN correo con N enlaces «<empresa>: <url>#enlace=<id>.<secreto>»
   enlace ──> crearContrasenaConEnlace(enlace, password)   (el canje de SL-41, ampliado)
```

## 2. Modelo de datos y migraciones

Hay dos migraciones nuevas encima de la última de `dev` (`20261025160100_entorno_marca`). Cada una
trae su `down.sql`. No se edita ninguna anterior. Sin backfill (D9/D10 de SL-17: la app está
vacía).

### M1: `20261026090000_usuario_unico_por_empresa` (R1–R4, R25)

```sql
-- R1/R3: compuesto, organizacion_id primero, MISMO nombre (la traduccion de P2002 de
-- UserRepository, ApiKeyRepository, PostulacionRepository, OrganizacionRepository y
-- ArranqueSuperadminRepository busca «email»/«cedula» en el nombre y sigue valiendo).
-- NULLS NOT DISTINCT: dos cuentas SIN empresa con el mismo email chocan (R3, P1).
DROP INDEX "usuario_email_key";
CREATE UNIQUE INDEX "usuario_email_key"  ON "usuario" ("organizacion_id", "email")  NULLS NOT DISTINCT;
DROP INDEX "usuario_cedula_key";
CREATE UNIQUE INDEX "usuario_cedula_key" ON "usuario" ("organizacion_id", "cedula") NULLS NOT DISTINCT;
-- R25: el login y la recuperacion buscan por email SIN empresa; el compuesto no sirve de prefijo.
CREATE INDEX "usuario_email_idx" ON "usuario" ("email");
```

- **`schema.prisma`** (`Usuario`): `email String` y `cedula String` pierden `@unique`. Se añaden
  `@@unique([organizacionId, email], map: "usuario_email_key")`,
  `@@unique([organizacionId, cedula], map: "usuario_cedula_key")` y `@@index([email])`. Prisma no
  expresa `NULLS NOT DISTINCT`, igual que con `tarifas_zona_id_tienda_id_key` de SL-17 T3.9, donde
  el drift quedó vacío. T1.2 vuelve a comprobar que siga vacío.
- **`down.sql`:** sigue el patrón de T3.9. Primero cuenta los emails y las cédulas repetidos
  (`GROUP BY email HAVING count(*) > 1`). Si hay alguno, lanza `RAISE EXCEPTION` con el nombre del
  índice y no cambia nada (R4). Si no hay, borra `usuario_email_idx` y recrea los dos únicos
  globales con su forma de antes (`ON "usuario" ("email")`, `("cedula")`).
- **RLS:** ninguna política cambia. `usuario` sigue con `usuario_por_empresa`.
- **Consecuencias en el código.** `findUnique({ where: { email } })` y `{ cedula }` dejan de
  compilar:
  - `UserRepository.findByEmail` y `findByEmailWithHash` se sustituyen (§3.1);
  - `PostulacionRepository` pasa a `findFirst`, y la extensión pone la empresa. La postulación
    sigue fallando cerrada sin empresa hasta SL-35 (SL-17 R41).

### M2: `20261026090100_indices_rutas_calientes` (R24)

Por cada consulta que elige T5.1 (§6):
`CREATE INDEX "<tabla>_org_<cols>_idx" ON "<tabla>" ("organizacion_id", <cols de antes>)`. Si el
índice nuevo deja sin uso al viejo, el viejo se borra en la misma migración. El `down.sql`
restaura los índices borrados y borra los nuevos. No hay datos que perder, así que nunca aborta.

### Lo que no cambia

- `orden.num_guia` sigue `@unique` global, y `orden_num_guia_seq` y `siguiente_num_guia()` siguen
  como están (R29, decisión 1). Las 7 entradas «global a propósito» de T3.9 quedan en 5:
  `api_key.key_hash`, `orden.num_guia`, `push_suscripcion.endpoint` y los dos `wa_message_id`.
  `usuario.email` y `usuario.cedula` pasan a ser por empresa.
- No hay tablas nuevas.

## 3. Login (R6–R15)

### 3.1 Repositorio

`IUserRepository` / `UserRepository`:

- **Fuera:** `findByEmailWithHash(email)` y `findByEmail(email)`.
- **Dentro:**
  - `findCuentasPorEmailConHash(email): Promise<CuentaConHash[]>`. Hace `findMany({ where: { email } })`
    y selecciona `id`, `email`, `passwordHash`, `estado`, `organizacionId`, `rol.value` y
    `organizacion.nombre`. Ordena por `organizacion.nombre` y deja la de plataforma (sin empresa)
    al final. Se llama siempre dentro de `comoPlataforma("SL-17", "login")`: es la única lectura
    de `usuario` entre empresas, y su excepción ya está en `EXCEPCIONES_DE_PLATAFORMA`
    (`lib/actions/auth.ts`, `lib/actions/password-reset.ts`).
  - `findCuentasPorEmail(email): Promise<CuentaPublica[]>`: la misma consulta sin el hash, para la
    recuperación (§4).

### 3.2 Servicio: `AuthService.login`

`LoginCommandInput` suma `organizacionId?: string | null`. `undefined` significa que la persona no
eligió, y `null` que eligió la plataforma.

1. `cuentas = findCuentasPorEmailConHash(email)`. Si `organizacionId !== undefined`, se filtra a la
   cuenta con ese `organizacionId`, comparando también `null`.
2. Si no hay cuentas, se registra un intento `usuario_no_encontrado` sin cuenta y se responde
   `invalid_credentials` (R9, R11).
3. Por cada cuenta se mira el bloqueo (`contarFallosConsecutivosRecientes`, igual que hoy). Si
   todas están bloqueadas, se responde `account_locked` (R12).
4. Sobre las no bloqueadas se compara la contraseña (`verifyPassword`). Son N bcrypt; N es el
   número de empresas del email, en la práctica 1 o 2.
5. Si ninguna vale, se registra un fallo `password_incorrecta` en cada cuenta no bloqueada y se
   responde `invalid_credentials` (R9). Si vale en alguna, NO se registra nada en las que no
   (R10). Así una persona que siempre entra en A no bloquea su cuenta de B.
6. `elegibles` son las válidas que cumplen `puedeIniciarSesion(cuenta)`: `estado === "activo"` y
   (`organizacionId !== null` o `esPlataforma(rol)`). Es el predicado de SLT-32 (§9). Si quedan 0,
   se registra un intento en la primera válida, como hoy, y se responde `account_unavailable`
   (R12, R15). El motivo es `estado_no_activo:<estado>` si esa cuenta no está `activo`, y
   `sin_empresa` si está `activo` pero no tiene empresa ni es la de plataforma (R15).

   > Revisión 2026-10-26 (Camilo): antes este paso registraba siempre `estado_no_activo:<estado>`,
   > y en R15 el texto quedaba `estado_no_activo:activo`, que no dice por qué se rechazó. Camilo
   > decidió que en ese caso el motivo sea `sin_empresa`.
7. Con 1 elegible, el flujo sigue igual que hoy con esa cuenta: riesgo, dispositivo confiado,
   sesión u OTP (R6, R11, R14).
8. Con 2 o más, se responde `{ status: "elegir_empresa", empresas }`. Las empresas van en el orden
   de 3.1 y la de plataforma lleva `nombre: "Plataforma"` y `organizacionId: null`. No se escribe
   nada: ni intento, ni dispositivo, ni OTP, ni sesión (R7, R8).

`verifyChallenge` no cambia: el desafío lleva `usuarioId`, que es la cuenta elegida (R14).

### 3.3 Cómo queda fijada la empresa

La sesión no gana ninguna columna. `Session.userId` es la cuenta elegida, y
`empresaDeLaPeticion()` ya resuelve `usuario.organizacion_id` de esa cuenta (R13). Elegir una
empresa es elegir una cuenta. La regla «la empresa nunca llega del cliente»
(`docs/architecture.md`) se mantiene: el `organizacionId` del segundo envío solo filtra entre las
cuentas del email, y la contraseña se vuelve a comprobar en esa cuenta. Quien no tenga la
contraseña de esa cuenta recibe `invalid_credentials`.

### 3.4 Contrato para SLT-41 (Server Action `login` de `lib/actions/auth.ts`)

```ts
// entrada (zod, lib/types/auth.ts)
loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
  organizacionId: z.string().uuid().nullable().optional(), // undefined = sin elegir; null = Plataforma
}).strict();

// salida: LoginResult suma una variante
| { status: "elegir_empresa"; empresas: { organizacionId: string | null; nombre: string }[] }
```

La pantalla guarda email y contraseña en memoria, enseña `empresas` y vuelve a llamar a `login`
con el `organizacionId` elegido. Las demás variantes no cambian. `verifyChallenge` y `logout` no
cambian.

## 4. Recuperar contraseña (R16–R21)

### 4.1 Servicio

`PasswordResetService`:

- **`solicitar({ email, deviceHash, ipAddress })`:**
  - `cuentas = findCuentasPorEmail(email)`;
  - por cada cuenta con `contarRecientesPorUsuario(id, RESET_REQUEST_WINDOW_MINUTES) < RESET_MAX_REQUESTS`,
    emite un enlace con `emitirEnlace(usuarioId, DEVICE_HASH_RECUPERACION, OTP_TTL_MINUTES)`;
  - con al menos un enlace, envía UN correo por `IEmailSender` con la plantilla nueva
    `recuperar-contrasena.ts`, que lleva una línea por cuenta: «<nombre de la empresa>» y
    `urlDelEnlace(baseUrl, enlace)`;
  - responde siempre `{ status: "ok" }` (R16, R17).

  Sin URL base (`lib/config/app-url.ts`), no emite nada y registra el aviso sin el email, igual
  que hace la bienvenida. Si el envío falla, anula los enlaces recién emitidos
  (`consumirSiActivo`), como en la m2 de SL-41, y la respuesta sigue siendo `ok`.
- **`emitirEnlaceBienvenida`** pasa a ser `emitirEnlace(usuarioId, marca, ttl)` privado. El método
  público de bienvenida se queda como envoltorio, así `BienvenidaMaestroService` no cambia.
- **`crearContrasenaConEnlace`**: en el paso 4, en vez de exigir `deviceHash === DEVICE_HASH_BIENVENIDA`,
  acepta `DEVICE_HASH_BIENVENIDA` o `DEVICE_HASH_RECUPERACION` (R19). El paso 5, «último activo de
  la cuenta», hace que un enlace posterior sustituya al anterior, sea de bienvenida o de
  recuperación. El paso 8 cambia la contraseña de `challenge.usuarioId`, es decir, solo esa cuenta
  (R18).
- **Fuera:** `verificarCodigo` y `restablecer`, que van por email y código (R20). Con el email
  repetido entre empresas, «el desafío activo del usuario con este email» es ambiguo. Se borran
  también sus schemas (`verifyResetCodeSchema`, `resetPasswordSchema`), sus tipos y las dos
  Server Actions `verificarCodigoRecuperacion` y `restablecerContrasena`. El `OtpChallengeIssuer`
  sigue: lo usa el OTP del login.
- `DEVICE_HASH_RECUPERACION = "recuperacion"`. No es un sha256 hex, así que nunca coincide con un
  dispositivo real, igual que la marca de bienvenida.

### 4.2 Composición

`buildPasswordResetService()` (`lib/actions/_shared/contexto-peticion.ts`) inyecta además
`crearEmailSender()` y la URL base. `solicitarRecuperacion` sigue en `comoPlataforma("SL-17", "login")`.

### 4.3 La pantalla (si se aprueba la Propuesta A de P4)

`RecuperarContrasenaForm`: el paso 1 termina en «Si el correo existe, te enviamos un enlace para
cada cuenta. Revisa tu correo.». Desaparecen el paso del código y el formulario con código. El modo
`#enlace=` de SL-41 ya existe y es el que canjea. Su texto («Crea tu contraseña») puede quedarse
hasta SLT-41.

## 5. Guardia de únicos (R22, R23)

- **Lista:** `UNICOS_SIN_EMPRESA` en `lib/db/excepciones-aislamiento.ts`, con entradas
  `{ indice, tabla, tipo: "global" | "anclado", motivo }`. Se siembra de la tabla de T3.9:
  - las 5 globales a propósito;
  - los 52 anclados, con el motivo «FK NOT NULL a `<tabla>`»;
  - los únicos de negocio creados por migraciones posteriores a `20261023090000` que tampoco
    lleven la columna, que T4.1 calcula con el propio detector.

  Como las otras listas, solo puede bajar.
- **Detector:** `tests/unit/guards/_unicos-por-empresa.ts`. Lee las `migration.sql` desde
  `20261023090000_unicos_por_empresa` (incluida) y aplica cada `CREATE UNIQUE INDEX`,
  `DROP INDEX` y `ADD CONSTRAINT … UNIQUE` en orden. Así obtiene el estado final de cada índice
  único: tabla y columnas. Las tablas de negocio salen de `MODELOS_DE_NEGOCIO` y su `@@map` en el
  DMMF.
- **Guardia:** `tests/unit/guards/unicos-por-empresa.guardia.test.ts`.
  - **(a)** Todo único final sobre una tabla de negocio lleva `organizacion_id` como primera
    columna, o está en la lista (R22).
  - **(b)** Toda entrada de la lista existe (R23).
  - **(c)** Cada entrada `global` aparece nombrada en `docs/architecture.md > Multi-empresa`
    (R23, R30).
  - **(d)** Autoprueba con SQL de muestra:
    - un único nuevo sin la columna hace fallar (a);
    - quitar `organizacion_id` de un índice de `20261023090000` también, que es la mutación M4b
      de la review de SL-17.
- **Por qué sobre migraciones y no sobre el DMMF:** el `schema.prisma` no expresa
  `NULLS NOT DISTINCT` ni los índices parciales, y la review de SL-17 vio que el DMMF seguía
  declarando el compuesto aunque se borrara de la migración (M4b). Lo que se aplica en la base son
  las migraciones.

## 6. Índices de rutas calientes (R24, R25)

**Evidencia y límite.** Al escribir el spec no pude correr `EXPLAIN` (sin shell ni base). Los
candidatos salen de la forma de los índices en `db/schema.prisma`, no de una medición. Siguen el
criterio de P3: un índice de una tabla de negocio cuya primera columna no identifica una empresa.

| Candidato | Índice actual | Consulta que lo usa (a confirmar en T5.1) |
|---|---|---|
| `orden` | `@@index([createdAt])` | listado de `/ordenes`, orden por defecto `created_at` |
| `orden` | `@@index([estatusId])` | filtros por estado del listado y del tablero |
| `gestion_orden` | `gestion_orden_created_at_idx` | listados de gestiones por fecha |
| `tarifas` | `@@index([createdAt])` | listado de tarifas |
| `historial_accion` | `@@index([createdAt(sort: Desc), id])` | listado del historial de acciones |
| `whatsapp_envio_ejecucion` | `@@index([createdAt(sort: Desc)])` | ejecuciones recientes |
| `plantilla_mensaje` | `@@index([createdAt])` | listado de plantillas |
| `analytics_daily` | único `analytics_daily_grano_key (fecha, …)` | analítica del maestro por rango de fechas |

**T5.1, el método:**

1. Base local con el escenario de demo de dos empresas (`scripts/demo-qa`, SL-43), con volumen
   en las dos.
2. Captura de la SQL real de cada consulta con el log de Prisma.
3. `EXPLAIN (ANALYZE, BUFFERS)` como `servi_app` con la empresa fijada, antes y después de un
   índice de prueba `(organizacion_id, <cols>)`.
4. Entra en M2 solo lo que pasa de recorrer las filas de las dos empresas a recorrer las de una.

La tabla de la medición (consulta, plan antes y después, decisión) va a `progress/impl_SL-18.md`.
El test de R24 comprueba en `pg_indexes` que cada índice elegido existe con `organizacion_id`
primero, y que el `EXPLAIN` de su consulta, con dos empresas sembradas, lo nombra. El de R25 hace
lo mismo con `usuario_email_idx` y la consulta de 3.1.

## 7. Push: el último gana (R26–R28)

**Hoy.** `push_suscripcion` es de negocio y `endpoint` es único global. En el contexto de B, el
upsert por endpoint no ve la fila de A (lo impiden el filtro de la extensión y la RLS), intenta
crear y choca con P2002. La fila de A sigue y A sigue enviando.

**Cambio.** El endpoint sigue único global: un navegador tiene un solo dueño en toda la
plataforma. `registrarSuscripcionPush` (`lib/actions/push.ts`) hace dos pasos:

1. `PushEndpointPlataformaRepository.liberarDeOtrasEmpresas(endpoint, actor.organizacionId)`, en
   `comoPlataforma("SL-18", "push: el último gana")`:
   `deleteMany({ where: { endpoint, organizacionId: { not: organizacionIdActual } } })`. El `where`
   lleva el endpoint exacto, así que nunca toca otro endpoint (R28).
2. El `registrar` de siempre, en el contexto de B, que crea o reescribe el dueño dentro de B
   (R26, R27).

- **Por qué en plataforma y por qué es seguro:** solo la plataforma ve la fila de A. Para llegar
  aquí hace falta una sesión válida en B y el endpoint, que solo conoce el navegador que tiene la
  suscripción. Es la misma confianza que ya da el upsert de la ficha 410 dentro de una empresa.
- **Orden y fallo:** primero se borra y luego se crea, sin una transacción común, porque son
  contextos distintos. Si el segundo paso falla, el navegador se queda sin suscripción y
  `alta-push` la deshace, que es su comportamiento de hoy ante un error. Nunca quedan dos dueños.
- **Excepción:** el archivo nuevo entra en `EXCEPCIONES_DE_PLATAFORMA` con la ficha `SL-18`.
  `FichaJira` (`` `SL-${number}` ``) ya la admite.
- Al cerrar, el punto del push de `progress/deudas.md > D14` se marca resuelto por SL-18.

## 8. Número de guía (R29, R30)

No cambia el código. Va a `docs/architecture.md > Multi-empresa > Únicos`:

> «`orden.num_guia` y `orden_num_guia_seq` siguen globales a propósito (SL-18, 2026-10-26). La
> guía sale en la etiqueta y el QR y se rastrea sin sesión por `/paquete/[numGuia]` y por la API.
> Una guía repetida entre empresas obligaría a pedir la empresa en el rastreo público, y la
> permutación de `siguiente_num_guia()` ya evita que la guía revele el volumen de nadie.
> `usuario.email` y `usuario.cedula` son únicos por empresa: una persona puede tener cuenta en
> varias.»

El test de R29 crea órdenes en A y en B con `siguiente_num_guia()` y comprueba que las guías no se
repiten y que `orden_num_guia_key` sigue sin `organizacion_id`.

## 9. Choques con otras ramas: quien mergea segundo rebasa

| Rama | Qué compartimos | Contrato |
|---|---|---|
| **SLT-32** (Camilo, sin SDD) | `lib/services/AuthService.ts`, `tests/unit/services/auth-service.test.ts` | SLT-32 crea `puedeIniciarSesion(usuario)`. SL-18 lo aplica a **cada** cuenta candidata (paso 6 de §3.2), no a la única de hoy. Si SLT-32 mergea primero, SL-18 rebasa y llama a su predicado. Si SL-18 va primero, deja el paso 6 con la condición inline y un comentario `// SLT-32: puedeIniciarSesion`, y SLT-32 lo sustituye al rebasar. Con el CHECK `usuario_empresa_o_superadmin` de SL-32 ya en `dev`, una cuenta sin empresa solo puede ser la de plataforma: R15 es defensivo. `verifyChallenge`, `resolve-actor.ts` y `session-guard.ts` son de SLT-32, y SL-18 no los toca |
| **SLT-41** (pantallas) | `app/login/_components/LoginForm.tsx`, `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx` | Depende de SL-18. Consume el contrato de §3.4 y §4. Si se aprueba la Propuesta A de P4, parte de las versiones mínimas de SL-18 |
| **SL-35** (landing por empresa) | `PostulacionRepository` | SL-18 solo cambia `findUnique` por `findFirst`. La ruta por `slug` es de SL-35 |

## 10. Autorización, módulos y país

- **Autorización:** login y recuperación son públicos, como hoy. El registro de push exige sesión
  (R50 de la ficha 410) y el superadmin sigue sin canal (SL-32 R6). Ningún módulo enciende ni
  apaga nada de esta ficha.
- **País:** nada depende del país. La cédula sigue como texto libre.

## 11. Alternativas descartadas

- **A. Billete de selección en vez de reenviar la contraseña.** Tras la primera llamada, el
  servidor emitiría un billete corto, guardado con hash en `email_otp_challenge` con otra marca y
  atado a las cuentas válidas, y la segunda llamada mandaría billete y empresa. Ahorra un bcrypt,
  pero añade estado, TTL, otra marca y otra superficie de canje para un caso de dos o tres
  empresas. Reenviar email y contraseña no añade estado, y la contraseña se vuelve a comprobar en
  la cuenta elegida.
- **B. Columna `organizacion_id` en `Session`.** Duplicaría lo que ya dice `usuario.organizacion_id`
  y abriría la puerta a una sesión cuya empresa no es la de su usuario. Elegir la cuenta basta.
- **C. Páginas de entrada por empresa o login con el `slug`.** Lo descarta la decisión 3: `/login`
  es la única entrada.
- **D. Recuperación con código y elección de empresa en la pantalla.** El correo llevaría un código
  y la pantalla pediría la empresa. Contradice la decisión 4 (un enlace por empresa) y obliga a la
  pantalla a enseñar las empresas del email a quien todavía no demostró nada: filtraría en qué
  empresas existe el email.
- **E. Push con `endpoint` único por empresa, `(organizacion_id, endpoint)`.** Dejaría dos filas
  vivas para el mismo navegador y A seguiría enviando. Contradice la decisión 5.
- **F. Push con una función `SECURITY DEFINER` en SQL** que borre la fila de otra empresa sin
  `comoPlataforma`. Funciona, pero es un patrón nuevo en el repo, depende del dueño de la función
  en Supabase y las guardias de aislamiento no lo ven. `comoPlataforma` con su ficha es el
  mecanismo que ya existe para esto y la guardia `plataforma-solo-en-lista` lo vigila.
- **G. Guardia sobre el DMMF.** No ve `NULLS NOT DISTINCT`, los índices parciales ni la mutación M4b
  (§5).
- **H. Índice compuesto en todas las tablas que tienen un índice por fecha.** Sería por intuición
  y costaría escrituras en tablas que nadie lista. Entra solo lo que mide T5.1.

## 12. Riesgos y lo que esto NO cubre

- **Coste del login:** son N bcrypt por intento, con N igual al número de empresas del email.
  Con N ≤ 3 no se nota. Si algún día una persona tuviera muchas empresas, el billete de la
  alternativa A sería la salida.
- **Bloqueo cruzado:** una contraseña mala suma un fallo en todas las cuentas del email (R9). Es lo
  mismo que pasa hoy con una cuenta, multiplicado. Lo aceptamos: no se puede saber a qué cuenta
  apuntaba quien no conoce ninguna contraseña.
- **Enlace de 10 minutos:** P5.
- **Lo que no cubre:** las pantallas buenas del selector y de la recuperación (SLT-41), la landing
  por empresa (SL-35) y los demás huecos de D14 (dueño Carlos Restrepo).

## Perfil del proyecto (`docs/perfil-agentes.md > spec_author`)

- **Modelo de datos:** sin tablas nuevas. Los únicos de `usuario` pasan a ser compuestos con
  `organizacion_id` primero (M1). Hay índices compuestos de rutas calientes (M2). La RLS no cambia.
- **Autorización:** §10. Sin módulos.
- **Migraciones:** M1 y M2, cada una con su `down.sql` (§2).
- **País:** §10, nada.
- **Dependencias nuevas:** ninguna.
