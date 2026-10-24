<!-- perfil: revisado=2026-10-21 por=Carlos Restrepo -->
> **Este repo es servi_logistic, NO Ordenex.** Es un SaaS multi-empresa de última milla derivado del
> código de Ordenex (copiado el 2026-10-21). Lo que en el código, los tests o `specs/` diga «Ordenex»
> es herencia pendiente de limpiar (`docs/limpieza-ordenex.md`). El plan manda: `docs/plan-saas.md`.
> Nunca uses recursos de Ordenex (Supabase, Vercel, llaves, datos).

# docs/architecture.md — Que significa "buen trabajo" aqui

Referencia de arquitectura. El reviewer usa esto para decidir si una implementacion
esta bien hecha, no solo si "funciona".

## Stack
- **Frontend/servidor:** Next.js (App Router) + TypeScript en modo strict.
- **Estilos:** Tailwind CSS v4.
- **Componentes:** shadcn/ui (Radix UI base). Primero revisar si existe en shadcn/ui
  antes de crear uno propio. `npx shadcn add <component>`.
- **Datos:** Supabase (Postgres), con Row Level Security en toda tabla sensible.
- **ORM:** Prisma con migraciones versionadas up/down.
- **Validacion:** zod en el borde de toda entrada externa.
- **Data fetching cliente:** SWR para queries publicas/no sensibles.
- **Mutaciones internas:** Server Actions (`'use server'`) para crear/editar/eliminar
  dentro del mismo proyecto. No usar `fetch` a rutas API internas para mutaciones.
- **API externa/webhooks:** Route handlers en `app/api/` con zod + firma/idempotencia.
- **Deploy:** Vercel. Secretos en variables de entorno, nunca en repo.
- **Integraciones reales:** WhatsApp Cloud API, Google Route Optimization, web-push (VAPID),
  correo SMTP (nodemailer), Supabase Storage y la API de Anthropic (asistente).

## Principios
1. **Separacion de capas.** Controller, Service, Repository con interfaces. La logica
   de negocio vive en servicios testeables, separada de HTTP y de la DB.
2. **Borde tipado.** Toda entrada externa (request, webhook, respuesta de API) se
   valida y se tipa en el borde con zod. Nada de `any` cruzando la frontera.
3. **Idempotencia en webhooks.** Un mismo evento entrante no debe producir efectos
   duplicados. Validar firma/token siempre.
4. **Sin hardcode de contexto.** Pais, moneda, cuenta y credenciales se resuelven
   por configuracion, nunca incrustados en el codigo.
5. **Migraciones versionadas y reversibles.** Toda migracion Prisma tiene su
   `migration.sql` (UP) y `down.sql` (DOWN). Ver `scripts/db-rollback.ts`.

## Multi-empresa (regla vigente desde 2026-10-21)
- Toda tabla de negocio **nueva** lleva `organizacion_id` (FK a `organizacion`), RLS por
  empresa y el filtro por `organizacion_id` en **cada** query del repositorio.
- Los únicos y las secuencias se declaran por empresa (`@@unique([organizacion_id, ...])`),
  nunca globales.
- La empresa activa se resuelve en el servidor desde la sesión; nunca llega del cliente.
- **Estado (SL-17, 2026-10-23).** Las 73 tablas de negocio ya tienen `organizacion_id` (NOT NULL
  salvo `usuario`, nulable para el superadmin), FK a `organizacion`, índice y política RLS
  `<t>_por_empresa`. La clasificación de los 88 modelos heredados (73 de negocio, 14 de
  plataforma, 1 diferido) vive en `lib/db/modelos-de-negocio.ts`, y un modelo nuevo sin clasificar
  pone el gate en rojo (`tests/unit/guards/organizacion-en-modelos.guardia.test.ts`).
- **SL-38 (2026-10-23):** son 74. La marca de zona especial es de la empresa, no del distrito: una
  fila de `distrito_zona_especial(organizacion_id, distrito_id)` por distrito marcado, sobre la
  geografía de la plataforma. Se lee solo por `lib/repositories/_shared/zona-especial.ts`.
- **Cómo se aplica, en capas** (cada una frena el fallo de la anterior):
  - **Contexto** (`lib/db/contexto-empresa.ts`): `conEmpresa(id, fn)` y `comoPlataforma(ficha, motivo, fn)`.
    Sin contexto explícito, la empresa sale de la cookie de sesión
    (`lib/auth/empresa-de-la-peticion.ts`). Sin empresa, toda operación de negocio y todo SQL a mano
    fallan con `EmpresaNoResuelta` sin ejecutarse.
  - **Extensión del cliente** (`lib/db/extension-empresa.ts`, enchufada en `getPrismaClient()`): inyecta
    `organizacion_id` en los `where` y las creaciones de los modelos de negocio y envuelve cada operación
    en una transacción que fija la empresa y baja al rol `servi_app`. En contexto de empresa también
    envuelve los modelos de plataforma, para que la RLS cubra sus relaciones anidadas.
  - **RLS** con el rol `servi_app` (NOLOGIN, NOBYPASSRLS; migración `20261022130000_organizacion_y_rol_app`):
    la política compara con `current_setting('app.organizacion_id')`, fijado por transacción. Cubre el
    SQL a mano. Los catálogos, la geografía y `vehiculos` son de solo lectura para la empresa.
  - **Triggers de misma empresa** (migración `20261022130300_misma_empresa_en_fk`): una fila de negocio
    no puede apuntar a otra empresa (SQLSTATE `SL017`, traducido a `EmpresaCruzada`) ni cambiar de
    empresa. Una FK nueva entre tablas de negocio necesita su trigger: se genera con
    `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` en una migración nueva, y la guardia
    `tests/unit/guards/fk-misma-empresa.guardia.test.ts` falla si falta.
- **Entradas sin sesión:** API key (`conEmpresaDeLaKey` en `lib/api/api-key-request.ts`), crons y jobs
  recurrentes (`lib/db/para-cada-empresa.ts`) y el drenador, que corre cada job con su
  `jobs.organizacion_id`.
- **Excepciones con ficha** (`lib/db/excepciones-aislamiento.ts`): `EXCEPCIONES_DE_PLATAFORMA` (quién
  puede llamar a `comoPlataforma`) y `EXCEPCIONES_SQL_A_MANO` (SQL a mano que aún no filtra y que la RLS
  cubre). Las dos solo pueden bajar; las vigilan `plataforma-solo-en-lista` y `sql-a-mano-por-empresa`.
- **Únicos:** los de negocio por empresa son compuestos con `organizacion_id` primero (migración
  `20261023090000_unicos_por_empresa`). Siguen globales a propósito `usuario.email`, `usuario.cedula`,
  `orden.num_guia` (rastreo público), `api_key.key_hash` y los ids externos. Las secuencias por empresa
  son de SL-18.
- **Alta de empresa:** `OrganizacionService.altaEmpresa` (`lib/services/OrganizacionService.ts`, con
  `lib/repositories/OrganizacionRepository.ts`) crea, en una transacción, la organización, su podio del
  ranking y el primer maestro sin contraseña utilizable.
  Tras un alta buena, la action envía al maestro un correo de bienvenida
  (`lib/services/BienvenidaMaestroService.ts`, SL-41) con un enlace para crear su contraseña: de un
  solo uso, con el secreto en el fragmento de la URL y válido `AUTH_BIENVENIDA_TTL_HORAS` horas (72
  por defecto), sobre `email_otp_challenge` y `PasswordResetService`. Corre fuera de la transacción
  del alta y nunca la tumba: si el correo no sale, la empresa queda creada y la pantalla lo avisa. El
  superadmin la reenvía con «Reenviar bienvenida» en la fila de la empresa, que se oculta cuando el
  primer maestro ya fijó su contraseña (`usuario.contrasena_definida_at`). «¿Olvidaste tu
  contraseña?» sigue sirviendo de respaldo.
  La action `lib/actions/organizaciones.ts` exige superadmin a través de `lib/auth/exigir-superadmin.ts`,
  el punto de enganche con SL-32: hasta que exista `lib/auth/plataforma.ts`, rechaza a todos.

### Por qué
Decisión del humano (plan-saas, 2026-10-20/21): una sola base compartida, datos separados por
`organizacion_id`. Una tabla que nace sin la columna obliga a migrarla después con datos dentro.

## Patron de capas: Controller → Service → Repository

```
app/api/orders/route.ts              ← Controller (capa HTTP)
  ↓ llama a (via interfaz)
lib/services/OrderService.ts         ← Service (logica de negocio)
  ↓ llama a (via interfaz)
lib/repositories/OrderRepo.ts        ← Repository (acceso a datos, Prisma)
  ↓
Supabase (Postgres)
```

### Controller (route handler o Server Action)
- **Route handler** (`app/api/<feature>/route.ts`): recibe Request, parsea/valida con
  zod, llama al service, devuelve `NextResponse`. No contiene logica de negocio ni
  queries de DB.
- **Server Action** (`lib/actions/<feature>.ts`): `'use server'`, recibe datos,
  lee cookies para permisos, instancia el service, ejecuta, devuelve resultado.
  Para mutaciones internas, NO crear ruta API y fetchearla desde el cliente.

### Service (`lib/services/`)
- Logica de negocio pura. Sin dependencia de HTTP (Request/Response/headers) ni
  de DB directamente. Recibe repositorios y clientes externos por constructor
  (inyeccion de dependencias via interfaces).
- Testeable sin DB ni HTTP.

### Repository (`lib/repositories/`)
- Acceso a datos. Solo Prisma queries. Sin logica de negocio ni validacion de
  permisos (eso va en el service o controller). Implementa `IRepository`.

### Interfaces (`lib/interfaces/`)
- Un archivo por interfaz. Centralizadas y separadas por categoria:
  `interfaces/services/`, `interfaces/repositories/`, `interfaces/external/`.
- Permiten mockear en tests y cambiar implementaciones sin tocar servicios.

## Estructura de carpetas

```
app/                            # Rutas y paginas (App Router)
  api/                          # Route handlers (controladores)
  (app)/                        # Paginas autenticadas (ordenes, cierres, wallet...)
  _landing/                     # Landing publica
  login/, recuperar-contrasena/ # Paginas publicas de acceso
lib/
  interfaces/                   # Contratos centralizados
    services/                   # IService.ts
    repositories/               # IRepository.ts
    external/                   # IEmailProvider.ts, IMetaAdsClient.ts...
  services/                     # Logica de negocio
  repositories/                 # Acceso a datos (Prisma)
  actions/                      # Server Actions ('use server')
  supabase/                     # Cliente y helpers de Supabase
  types/                        # Tipos de dominio + schemas zod
  utils/                        # Helpers puros (sin side effects)
components/
  ui/                           # Primitivas shadcn/ui (Button, Input, Card...)
  shared/                       # Compuestos reutilizables (DataTable, FormField...)
  private/                      # Componentes con datos sensibles (datos via props)
hooks/                          # React hooks reutilizables
providers/                      # Context providers
db/
  schema.prisma                 # Esquema de Prisma
  migrations/                   # Migraciones versionadas, cada una con:
    20250101000000_init/
      migration.sql             # UP
      down.sql                  # DOWN (OBLIGATORIO)
tests/
  unit/                         # Services y repositories (mockeando DB)
  integration/                  # Controllers + DB de test
e2e/                            # Playwright (flujos criticos)
scripts/
  db-rollback.ts                # Script de rollback (aplica down.sql)
```

## Permisos y autenticacion
- Las paginas (Server Components) validan permisos via `cookies()` de `next/headers`.
- `middleware.ts` intercepta rutas protegidas, verifica existencia de cookie de sesion.
- Componentes `private/` reciben datos por props desde el Server Component padre.
- Datos publicos: el cliente fetchea con SWR desde el navegador.
- Datos privados (balances, PII): pre-fetch en Server Component, stream al cliente.

## Server Actions vs Route Handlers
| Caso | Usar |
| --- | --- |
| Mutacion desde un componente propio | Server Action (`lib/actions/`) |
| Webhook externo (Shopify, Meta) | Route Handler (`app/api/`) |
| API publica para terceros | Route Handler (`app/api/`) |
| Cron interno | Route Handler (`app/api/`) |

## Migraciones up/down
Cada migracion de Prisma tiene estructura:
```
db/migrations/<timestamp>_<nombre>/
  migration.sql    ← UP: generado por `pnpm run db:migrate:create`
  down.sql         ← DOWN: manual, revierte migration.sql
```

Proceso:
1. `pnpm run db:migrate:create` → solo crea migration.sql, no aplica.
2. Escribir `down.sql` manualmente (revertir exactamente lo que migration.sql hace).
3. `pnpm run db:migrate` → aplica la migracion.
4. `pnpm run db:rollback` → ejecuta `scripts/db-rollback.ts` (aplica down.sql de la ultima y resuelve).

Toda migración del repo trae su `down.sql`: las tres heredadas que no lo tenían lo recibieron en
SL-10 (2026-10-21) y `./init.sh` corta si falta alguno.

## Dependencias de terceros

**La regla.** Antes de escribir una utilidad (fechas, validación, parsing, decimales, colas,
PDF), comprueba si ya la resuelve una librería del ecosistema y prefiérela.

**Los cuatro checks.** Ninguna dependencia entra sin los cuatro, verificados y anotados:
1. No marcada `deprecated` en npm.
2. Release en los últimos 12 meses.
3. >= 10.000 descargas semanales.
4. Licencia MIT, Apache-2.0, BSD o ISC.

Si no puedes verificar uno (sin red, dato no público), es un desconocido, no un sí.

**La puerta.** Una dependencia nueva la aprueba el humano (Carlos). Los subagentes proponen y
paran; aprobada, se anota en `docs/dependencias.md` y recién ahí se instala. Si se elige en el
spec, va en el `design.md` y se aprueba con él. La guardia
`tests/guards/guard-dependencias-aprobadas.test.ts` pone el gate rojo si falta la fila.

**Excepción.** Una librería que falla un check entra solo con aprobación explícita, y la fila dice
qué check falló y por qué se aceptó.

### Por qué
Reimplementar lo que una librería mantenida ya hace es código propio que mantener; instalar sin
revisar mete riesgo de licencia y de seguridad sin que nadie lo decida.

## Componentes
- `components/ui/`: primitivas de shadcn/ui. **Nunca crees un componente si ya existe en shadcn/ui.**
  Agregas con: `npx shadcn add <component>`.
- `components/shared/`: compuestos construidos con primitivas ui/. Reutilizables entre features.
- `components/private/`: contienen datos sensibles. El padre (Server Component) valida permisos y
  pasa datos por props. No fetchean datos por si mismos.

### Regla: sin sobre-ingenieria
Si un componente se usa en UN SOLO lugar y no tiene logica reutilizable, vive junto
a la pagina que lo usa. Solo se promueve a `shared/` cuando al menos DOS features
lo necesitan con la misma API.

## Anti-patrones que el reviewer rechaza
- Logica de negocio dentro de componentes o handlers de ruta.
- Queries sin indice en rutas calientes o crons frecuentes.
- Tablas nuevas sin RLS o sin `organizacion_id`.
- Un webhook sin validacion de firma o sin idempotencia.
- Cualquier `console.log` de secretos o PII.
- Migracion nueva sin `down.sql`.
- Server component fetcheando datos publicos del cliente (usa SWR en el cliente).
- Componente privado haciendo fetch de datos sensibles (recibe por props).
