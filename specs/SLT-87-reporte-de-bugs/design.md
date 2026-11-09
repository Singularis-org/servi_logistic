# SLT-87 — Reporte de bugs: botón flotante y envío · design.md

> Entrega 1 de 3. SLT-97 «Reporte de bugs: módulo del superadmin» y SLT-98 «Reporte de bugs:
> imágenes» construyen encima de esta tabla y de este servicio.

## Lo que ya existe

**Búsqueda.** El 2026-11-09 se buscó «reporte de bug», «bug report», `BUG_REPORT` y «botón
flotante» en `feature_list.json` (todos los estados), en `specs/` y en el código. El grafo no
tiene índice para este worktree, así que se buscó con Grep y Read. Fuera de esta ficha y de sus dos
hermanas no apareció nada equivalente.

**Lo que se reutiliza:**

| Pieza | Dónde | Uso aquí |
|---|---|---|
| Actor de la sesión | `lib/auth/resolve-actor.ts` (`resolveActorFromSession`) | Usuario, rol y empresa, siempre del servidor (R11, R13). |
| Quién es plataforma | `lib/auth/plataforma.ts` (`esPlataforma`) | Ocultar el botón (R2) y rechazar el envío (R11). |
| Agente de usuario | `lib/actions/_shared/contexto-peticion.ts` (`requestContextFromHeaders`) | El navegador sale de la cabecera, no del cliente (R13). |
| Contexto de plataforma | `lib/db/contexto-empresa.ts` (`comoPlataforma`) y `lib/db/excepciones-aislamiento.ts` | La única vía de escritura de la tabla (§2.3). |
| Patrón de tabla de plataforma sin acceso para `servi_app` | `vehiculo_rastro` (`20261103120100`), `historial_plataforma`, `plan_rastro` | RLS sin políticas y `REVOKE ALL` (§2.2). |
| Plantilla de marca | `lib/services/email/plantillas/plantilla-marca.ts` (`componerCorreo`, `escaparHtml`) | El correo (R15, R18). No se modifica. |
| Emisor por entorno | `lib/services/EmailProvider.ts` (`crearEmailSender`) | SMTP real, o consola sin SMTP y para dominios reservados (E2E). |
| Etiqueta del rol | `lib/auth/rol-label.ts` (`ROL_LABELS`) | Asunto y cuerpo del correo. |
| Nombre de usuario | `lib/utils/nombre-usuario.ts` (`nombreCompletoUsuario`) | El nombre en el momento del reporte (R13). |
| Primitivas | `components/ui/{button,textarea,card}.tsx` | El panel; no se crea ninguna primitiva. |
| E2E | `tests/fabricas/e2e.ts`, `e2e/_dos-empresas-fixture.ts` (`LogDelServidor`, `clienteDueno`), `e2e/_superadmin-fixture.ts` | Empresa, usuarios, log del servidor, lectura como dueño y superadmin. |

**Lo que NO se reutiliza, y por qué:**
- `ChatFlotante` (`app/(app)/mis-asignaciones/_components/chat/`) es el chat del mensajero. Solo se
  le esquiva la posición (R3).
- `AsistentePanel` guarda su conversación en memoria a propósito (ficha 436, R30). Aquí el
  borrador tiene que persistir.

## 1. Resumen del flujo

```
ReporteBugBoton (cliente, en el layout privado)
  │  borrador ← localStorage["servi:reporte-bug:borrador:<usuarioId>"]
  │  «Enviar» → enviarReporteBugAction({ descripcion, pagina, ventana, appInstalada })
  ▼
lib/actions/reporte-bug.ts            sesión → zod estricto → agente de usuario de la cabecera
  ▼
ReporteBugService.enviar(actor, entrada, entorno)
  ├─ puerta: usuario de empresa, no plataforma (R11)
  ├─ BugReportRepository.crear(...)   ← comoPlataforma: INSERT en bug_report (R13, R14, R19)
  └─ por cada destinatario de BUG_REPORT_EMAILS: sender.enviar(plantillaReporteBug(...))
       Promise.allSettled; un fallo se registra y no cambia la respuesta (R15–R17)
  ▼
{ status: "enviado" } → el panel muestra «Gracias, recibimos tu reporte» y borra el borrador (R9)
```

## 2. Modelo de datos

### 2.1 Tabla `bug_report` (de plataforma)

Los identificadores van en inglés por la decisión «Borrado e identificadores» (R19).

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `TEXT` PK | uuid generado por Prisma. |
| `organization_id` | `TEXT NOT NULL` FK → `organizacion(id)` `ON DELETE CASCADE` | La empresa de quien reporta, de la sesión. `CASCADE` para no bloquear el borrado de empresas demo (`tests/integration/db/demo-qa.test.ts`, SL-43). |
| `reporter_user_id` | `TEXT NOT NULL` FK → `usuario(id)` `ON DELETE CASCADE` | Mismo motivo. |
| `reporter_name` | `VARCHAR(120) NOT NULL` | Nombre en el momento del reporte (R13). 120, igual que `actor_nombre` en los rastros. |
| `reporter_role` | `rol_value NOT NULL` | Rol en el momento del reporte. `CHECK (reporter_role <> 'superadmin')`: segunda red de R11. |
| `description` | `TEXT NOT NULL` | `CHECK (char_length(btrim(description)) BETWEEN 1 AND 5000)`: segunda red de R12. |
| `page_path` | `VARCHAR(2048) NOT NULL` | Solo la ruta (Q2). `CHECK (left(page_path, 1) = '/')`. |
| `user_agent` | `VARCHAR(512) NOT NULL` | De la cabecera; se recorta a 512 en el servicio. |
| `viewport_width`, `viewport_height` | `INTEGER NULL` | `CHECK` 1–20000. Nulos si el cliente no los manda. |
| `is_standalone` | `BOOLEAN NULL` | La app corre instalada (PWA). |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | La fecha del reporte (R13). |
| `updated_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | `@updatedAt`. |
| `deleted_at` | `TIMESTAMP(3) NULL` | Borrado lógico (R19). En esta entrega nada lo escribe. |

**Índices:**
- `(created_at DESC, id)`, para el listado de SLT-97;
- `(organization_id, created_at DESC)`, para el filtro por empresa de SLT-97.

Se crean ahora porque cuestan dos líneas y evitan una migración que solo los añada.

**Lo que esta entrega no crea:** ni estado, ni nota, ni historial (SLT-97), ni imágenes (SLT-98).
Cada una llega con su migración.

**Prisma.** El modelo es `BugReport` (`@@map("bug_report")`), con sus relaciones
`organization Organizacion` y `reporter Usuario`. Lleva los campos inversos `bugReports
BugReport[]` en `Organizacion` y en `Usuario`.

**Y la Q5.** La guardia `organizacion-en-modelos` (R4) busca `organizacionId`/`organizacion_id` en
los modelos de plataforma. Este campo se llama `organizationId` con `@map("organization_id")` por la
decisión de inglés, no para esquivarla. Una línea en `docs/architecture.md > Multi-empresa`
(§10) lo deja escrito.

### 2.2 Acceso: RLS sin políticas y `REVOKE ALL` (R14)

Calcado de `vehiculo_rastro`:

```sql
ALTER TABLE "bug_report" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "bug_report" FROM servi_app;
```

`ALTER DEFAULT PRIVILEGES` (de `20261022130000`) le daría a `servi_app` CRUD sobre la tabla nueva:
por eso hace falta el `REVOKE`. La RLS sin políticas es la segunda red. Con el rol de la app,
`SELECT`, `INSERT`, `UPDATE` y `DELETE` dan `42501`, también por SQL a mano. La empresa no lee
nada, ni lo suyo ni lo de su gente.

### 2.3 Quién escribe

Solo `lib/repositories/BugReportRepository.ts`, dentro de `comoPlataforma`, como dueño:
- la empresa no puede escribir la tabla con `servi_app`;
- la extensión, en contexto de empresa, envuelve también los modelos de plataforma y los bajaría a
  `servi_app`.

**La entrada en `EXCEPCIONES_DE_PLATAFORMA`:**
- **ficha:** `"SL-17"`. `FichaJira` no admite `SLT` (deuda D29), así que se usa la ficha que separó
  negocio y plataforma.
- **motivo:** «SLT-87: guardar un reporte de problema en `bug_report`, tabla de plataforma que la
  empresa no puede leer ni escribir; la empresa sale de la sesión, no del cliente (R13, R14)».

**`lib/db/modelos-de-negocio.ts`:** `{ modelo: "BugReport", tabla: "bug_report" }` en
`MODELOS_DE_PLATAFORMA`, con el comentario «sin acceso para `servi_app`; lo escribe el servidor en
plataforma (SLT-87)».

### 2.4 Migración

`db/migrations/<ts>_bug_report/`, con un timestamp posterior a la última migración de `dev` al
crearla, escrita a mano como las demás (P3006 de `db:migrate:create`):
- **`migration.sql`:** la tabla, los `CHECK`, las FK, los dos índices, la RLS y el `REVOKE`.
- **`down.sql`:** `DROP TABLE IF EXISTS "bug_report";` y nada más, porque no se crea ningún tipo.

Dispara `gate.disparadores` (esquema y migraciones): corren en local los tests de migración y
`verificar-rls`.

## 3. Autorización (dónde se valida)

| Capa | Qué comprueba | Requisito |
|---|---|---|
| Layout (`app/(app)/layout.tsx`) | Pinta el botón solo si hay `actor`, `!deLaPlataforma` y `actor.organizacionId`. Es presentación, no permiso. | R1, R2 |
| Action (`lib/actions/reporte-bug.ts`) | Sin sesión → `unauthenticated`. | R11 |
| Servicio (`ReporteBugService.enviar`) | `esPlataforma(rol)` o sin `organizacionId` → `forbidden`. Es la puerta de verdad: no se fía del layout. | R11 |
| Repositorio | El usuario se busca con `{ id, organizacionId }` del actor. Si no está (cuenta movida o borrada entre la sesión y el envío) devuelve `null` y el servicio responde `forbidden`. | R11, R13 |
| Base | `CHECK (reporter_role <> 'superadmin')`; `REVOKE ALL` a `servi_app`. | R11, R14 |

**Módulos (SL-23).** La action es `nucleo` en `lib/modulos/reparto.ts` (`"reporte-bug": "nucleo"`):
sin puerta de módulo, porque ningún módulo apagado debe quitarle a nadie la forma de avisar de un
fallo. No hay página nueva ni ítem de menú.

## 4. Contrato de la action

`lib/actions/reporte-bug.ts` (`"use server"`), con una sola export:
`enviarReporteBugAction(input: unknown, deps?)`.

**Entrada (zod, `strict`, en `lib/types/reporte-bug.ts`):**

```ts
{
  descripcion: string,          // .trim(), min 1, max DESCRIPCION_MAX (5000) — R12 (Q3)
  pagina: string,               // empieza por "/" y no por "//", max 2048, sin "?" ni "#" — Q2
  ventana?: { ancho: int 1..20000, alto: int 1..20000 },
  appInstalada?: boolean,
}
```

**Sobre la entrada:**
- **Campos de más:** `strict` rechaza cualquier campo extra, como `usuarioId`, `organizacionId` o
  `rol` (R12).
- **La página:** el cliente manda `window.location.pathname` y el servidor rechaza una ruta con
  query o fragmento.
- **Lo que pone el servidor:** el agente de usuario sale de `requestContextFromHeaders()`, recortado
  a 512, y la fecha, de la base (`created_at`).

**Salida:**

```ts
| { status: "enviado" }                                       // R9: sin id ni datos del reporte
| { status: "unauthenticated" } | { status: "forbidden" }     // R11
| { status: "validation_error"; fieldErrors: Record<string, string[]> }  // R12
| { status: "error" }                                         // R10: fallo al guardar
```

**Dependencias inyectables** (como `vehiculos-plataforma.ts`): `getActor`, `contextoPeticion` y
`servicio`, para probar el borde sin base ni sesión.

**Errores.** Un fallo al guardar devuelve `{ status: "error" }` y escribe en el log
`[reporte-bug] fallo al guardar causa=<error.name>`, sin la descripción ni el mensaje de Postgres,
que puede llevar los valores de la fila (patrón de `vehiculos-plataforma.ts`, R11).

## 5. Servicio `ReporteBugService`

`lib/services/ReporteBugService.ts` implementa `IReporteBugService`
(`lib/interfaces/services/IReporteBugService.ts`). Por constructor recibe:

- `repo: IBugReportRepository`;
- `sender: IEmailSender`;
- `destinatarios: () => string[]`, por defecto `destinatariosReporteBug()` de `lib/config/reporte-bug.ts`;
- `log`: un `console.error` inyectable, para afirmar que el fallo del correo se registra.

**`enviar(actor, entrada, entorno: { userAgent })`:**
1. **Puerta (R11).** Sin actor, rol de plataforma o sin `organizacionId` → `forbidden`.
2. **Guardado.** `repo.crear({ organizationId, reporterUserId, reporterRole, description,
   pagePath, userAgent, viewportWidth, viewportHeight, isStandalone })`. Si devuelve `null` →
   `forbidden`.
3. **Copia por correo (R15–R17).**
   - Va después del guardado, con el reporte ya escrito.
   - Un mensaje por destinatario, porque `EmailMessage.to` es una sola dirección por contrato.
   - Los envíos van con `Promise.allSettled`.
   - Cada rechazo se registra como `[reporte-bug] fallo la copia por correo reporte=<id> causa=<name>`.
   - No hay reintento ni marca, y la respuesta no cambia.
4. Devuelve `{ status: "enviado" }`.

**Síncrono, sin cola.** El usuario espera al SMTP, acotado por `SMTP_TIMEOUT_MS`, y los envíos van
en paralelo. Ver la alternativa B (§11).

## 6. Repositorio `BugReportRepository`

`lib/repositories/BugReportRepository.ts` implementa `IBugReportRepository`
(`lib/interfaces/repositories/IBugReportRepository.ts`).

**`crear(datos): Promise<BugReportCreado | null>`.** Todo va dentro de
`comoPlataforma("SL-17", MOTIVO, …)`, en una `$transaction`:
1. `usuario.findFirst({ where: { id: reporterUserId, organizacionId: organizationId },
   select: { nombre, primerApellido, segundoApellido, email } })`. Si no lo encuentra → `null`.
2. `organizacion.findUnique({ where: { id }, select: { nombre } })`.
3. `bugReport.create(...)` con `reporterName = nombreCompletoUsuario(u).slice(0, 120)`.
4. Devuelve un DTO plano para el correo: `id`, `createdAt`, `reporterName`, `reporterEmail`,
   `organizationName`, `reporterRole`, `pagePath`, `userAgent`, la ventana e `isStandalone`.

El repositorio no lee nada más en esta entrega. Las lecturas del superadmin llegan en SLT-97.

## 7. Correo `plantillaReporteBug`

`lib/services/email/plantillas/reporte-bug.ts` es una función pura,
`plantillaReporteBug({ to, reporte }) → EmailMessage`, que llama a `componerCorreo` con
`contacto: null`.

- **Asunto:** `Reporte de un problema · <empresa> · <ROL_LABELS[rol]>`, recortado a 150.
- **Preheader:** las primeras 90 letras de la descripción.
- **Bloques:**
  - `parrafo` «Nuevo reporte de un problema en <MARCA.nombre>.»;
  - la descripción, partida por líneas en bloques `parrafo`, porque `parrafoHtml` no convierte
    `\n` y así se conservan los saltos sin tocar la plantilla;
  - un bloque `nota` por cada dato del contexto: Empresa; Usuario (nombre y email); Rol; Página;
    Navegador; Dispositivo («390 × 844 · app instalada: sí/no», u «Sin datos»); Fecha; Reporte
    (`id`).
- **Fecha:** `created_at` en UTC, como `AAAA-MM-DD HH:mm UTC`. No depende del país:
  `pais-sin-literales` impide fijar la zona de CR y el correo va a la plataforma, no a una empresa.
- **Escapado (R18):** todo pasa por los bloques de `componerCorreo`, que escapan con `escaparHtml`.
  La plantilla no arma HTML propio.
- **Sin imágenes:** solo el logo en línea de la marca. Los enlaces a las imágenes llegan en SLT-98
  (P6).

## 8. Interfaz

### 8.1 Montaje en el layout

En `app/(app)/layout.tsx`, el botón va como **hermano** de `{children}`, junto a `AsistentePanel`,
por la misma razón escrita ahí:
- este layout no se pinta sin sesión;
- persiste entre navegaciones;
- un hermano no puede dejar de pintar la página.

```tsx
{actor && !deLaPlataforma && actor.organizacionId && <ReporteBugBoton usuarioId={actor.usuarioId} />}
```

No añade ninguna consulta: el actor ya está resuelto. Las guardias `asistente-panel-hermano`,
`revision-sinpe-no-bloquea` y `push-alta-punto-unico` miran otros nodos y no cambian.

### 8.2 `components/shared/ReporteBugBoton.tsx` (cliente)

Va en `components/shared/` y no junto a una página porque se monta en el layout de todo el portal.

**Botón:**
- `fixed right-5 z-40`, redondo de 48 px, con `aria-label="Reportar un problema"`.
- **Posición (R3):** `usePathname()`. En `/mis-asignaciones` y sus subrutas va en `bottom-24`;
  en el resto, en `bottom-5`.
  - `ChatFlotante` ocupa `bottom-5` con 56 px: su borde superior queda a 76 px y el botón empieza a
    96 px, así que no se solapan.
  - El componente expone `data-posicion="sobre-chat" | "esquina"` para el test.

**Panel (R4):**
- Una `Card` fija encima del botón, `role="dialog"`, con un título y un `aria-labelledby`.
- Ancho `min(22rem, 100vw - 2.5rem)`, para que quepa en un móvil.
- Contenido: `Textarea` (`maxLength` 5000, el mismo límite que el servidor) y los botones
  «Descartar» y «Enviar».
- No hay campo de archivos.
- Escape o el botón de cerrar lo cierran sin tocar el borrador.

**Estados:**

| Estado | Qué se ve |
|---|---|
| `editando` | «Enviar» deshabilitado si `descripcion.trim() === ""` (R5). |
| `enviando` | Los dos botones deshabilitados. |
| `gracias` | «Gracias, recibimos tu reporte» y el campo vacío (R9). Al volver a escribir, vuelve a `editando`. |
| `error` | «No pudimos enviar tu reporte. Inténtalo de nuevo.» y el texto intacto (R10). Si la respuesta es `validation_error` o `forbidden`, el mismo aviso. |

**Contexto del cliente:**
- `pagina = window.location.pathname`;
- `ventana = { ancho: innerWidth, alto: innerHeight }`;
- `appInstalada = matchMedia("(display-mode: standalone)").matches`, o `navigator.standalone` en iOS.

### 8.3 `hooks/useBorradorReporteBug.ts` (R6–R8)

- **Clave:** `servi:reporte-bug:borrador:<usuarioId>`. Una por usuario, así que otra cuenta en el
  mismo navegador no ve el borrador ajeno (R7).
- **Lectura:** en `useEffect`, para no romper la hidratación (el servidor no tiene `localStorage`).
- **Escritura:** en cada cambio. Un texto vacío borra la clave.
- **Limpieza:** `limpiar()` borra la clave. La llaman «Descartar» (R8) y el envío bueno (R9).
- **Sin localStorage** (Safari privado, cuota llena): el hook sigue funcionando en memoria.
  - El `catch` devuelve el valor en memoria y lo dice en un comentario: es un fallo manejado, no
    un `catch` vacío.
  - No escribe en el log: sería ruido en el navegador de cada usuario.
- **Lo que guarda:** solo el texto, nada de imágenes ni de contexto.

## 9. Configuración

`lib/config/reporte-bug.ts`:
- `DESCRIPCION_MAX = 5000` (Q3). Lo comparten el zod, el `Textarea` y el `CHECK`, este último
  escrito en la migración con el mismo número y un comentario que cita el archivo.
- `destinatariosReporteBug(valor = process.env.BUG_REPORT_EMAILS): string[]`:
  - parte por «,», recorta, descarta lo vacío y lo que no pasa `z.email()`, y quita duplicados sin
    distinguir mayúsculas;
  - si descartó alguna dirección, escribe una sola línea en el log con la **cifra** de descartadas
    (sin las direcciones);
  - con una lista vacía devuelve `[]` (R16).

**`.env.example` (R20),** debajo de `EMAIL_CONTACTO`:

```
# SLT-87 — destinatarios de la copia por correo de cada reporte de problema (botón
# flotante del portal). Lista separada por «,». Vacia, ausente o sin ninguna direccion
# valida: el reporte se guarda igual y no sale correo. Usa el SMTP de arriba.
BUG_REPORT_EMAILS=
```

**`playwright.config.ts`:**
- `webServer.env.BUG_REPORT_EMAILS = "reportes-e2e@example.test"`. El dominio reservado va siempre
  al emisor de consola (`EnrutadorEmailSender`), y con `AUTH_OTP_DEBUG_LOG=1` el cuerpo sale en el
  log.
- El spec nuevo va en el proyecto `aislamiento`.

**Datos por país:** ninguno. No hay moneda, geografía, impuestos ni métodos de pago, y la fecha del
correo va en UTC (§7).

## 10. Documentación

`docs/architecture.md > Multi-empresa`, un párrafo «Reportes de problemas (SLT-87)»:
- `bug_report` es de plataforma, con `REVOKE ALL` a `servi_app`, y la escribe solo
  `BugReportRepository` en `comoPlataforma`;
- la empresa no la lee;
- `organization_id` es un atributo (quién reportó) y no reparte la tabla;
- la copia por correo es síncrona y no tumba el guardado.

## 11. Alternativas descartadas

- **A. Tabla de negocio con la política `<t>_por_empresa` (o solo `INSERT` para `servi_app`).**
  - La política de siempre deja leer a la empresa, y eso rompe R14.
  - Dejar solo `GRANT INSERT` choca con Prisma: `create` hace `INSERT … RETURNING`, que exige
    `SELECT`, y habría que escribir con `createMany` o con SQL a mano, contra `sql-a-mano-por-empresa`.
  - Además, SLT-97 tendría que leerla en plataforma igualmente.
  - La tabla de plataforma da R14 por privilegios, sin depender de que cada consulta esté bien.
- **B. Copia por correo por la cola `jobs`.**
  - La decisión cerrada excluye reintento y marca, que es justo lo que aporta la cola.
  - Cuesta un valor de `JobTipo` con su migración de enum, el registro en
    `app/api/cron/procesar-jobs/route.ts`, `MODULO_POR_JOB` y los tests que enumeran tipos: unos
    5 archivos.
  - Además, `jobs` es de empresa opcional y un job sin empresa solo lo ve la plataforma: habría que
    decidir con qué empresa se encola.
  - Síncrono, el coste es esperar al SMTP, acotado por `SMTP_TIMEOUT_MS`.
- **C. `after()` de `next/server` para mandar el correo tras responder.** Nadie lo usa en el repo,
  y en Vercel alarga la función igualmente. Fuera de una petición (los tests) lanza, así que
  obligaría a inyectarlo. No aporta lo bastante para estrenarlo aquí.
- **D. Borrador en `sessionStorage` o en la base.** `sessionStorage` no sobrevive a cerrar la
  pestaña, que la decisión exige. En la base, un borrador costaría una tabla y una escritura por
  tecla, y la decisión dice localStorage.
- **E. El botón dentro de `PageHeader`, junto al «?».** Pierde lo de «flotante» y no se ve en las
  pantallas que no pintan `PageHeader`.

## 12. Dependencias

Ninguna librería nueva (decisión «¿Librería nueva? No»). zod, nodemailer y las primitivas de
shadcn ya están.

## 13. Riesgos

- **Tamaño en líneas** (Q1): ~1250-1400 frente a 1000.
- **Tiempo de respuesta:** con un SMTP lento, el usuario espera hasta `SMTP_TIMEOUT_MS` antes del
  «Gracias». Es aceptable para un envío ocasional. Si molesta, se revisa C en SLT-98, cuando las
  imágenes hagan más largo el correo.
- **Spam a los destinatarios** (Q4): sin tope de envíos por usuario en esta entrega.
