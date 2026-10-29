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
  Desde SL-36 el route del webhook de WhatsApp ya no es excepción: delega en `WebhookWhatsappService`, que
  abre la empresa del mensaje. Lo único que queda en plataforma para ese borde es
  `lib/repositories/IntegracionEnrutadoRepository.ts`: traduce un número o un resumen de token a su
  empresa, sin sesión, y solo selecciona `id` y `organizacion_id` (R22).
- **Credenciales de proveedores por empresa (SL-36).** WhatsApp, Google Maps, la optimización de rutas
  y el asistente usan la credencial de la empresa, guardada en la tabla `integracion`. La plataforma no
  presta claves: la guardia `sin-credenciales-de-entorno` (R41) falla si algo en `app/`, `lib/` o
  `scripts/` lee de `process.env` una de las variables retiradas.
  - **Bóveda** (`lib/crypto/boveda-integraciones.ts`): AES-256-GCM de `node:crypto`, con datos asociados
    que atan el valor a su fila y a su campo. Usa un anillo de claves versionado
    (`INTEGRACIONES_CLAVES_CIFRADO`, con la versión activa en `INTEGRACIONES_CLAVE_ACTIVA`).
    `pnpm integraciones:recifrar [--solo-contar]` recifra con la clave activa lo guardado con una versión
    anterior.
  - **Lectura:** los consumidores leen con `CredencialesIntegracionService` dentro de `conEmpresa`. Nada
    derivado de una credencial (cliente, token, resultado) se cachea entre empresas (R28).
- **Únicos:** los de negocio por empresa son compuestos con `organizacion_id` primero (migraciones
  `20261023090000_unicos_por_empresa` y, para `usuario`, `20261026090000_usuario_unico_por_empresa`).
  `orden.num_guia` y `orden_num_guia_seq` siguen globales a propósito (SL-18, 2026-10-26). La guía sale
  en la etiqueta y el QR y se rastrea sin sesión por `/paquete/[numGuia]` y por la API. Una guía
  repetida entre empresas obligaría a pedir la empresa en el rastreo público, y la permutación de
  `siguiente_num_guia()` ya evita que la guía revele el volumen de nadie. `usuario.email` y
  `usuario.cedula` son únicos por empresa: una persona puede tener cuenta en varias.
  - **Globales a propósito** (tipo `global` de `UNICOS_SIN_EMPRESA`, en
    `tests/unit/guards/_unicos-sin-empresa.ts`): `api_key.key_hash`, `orden.num_guia`, `push_suscripcion.endpoint`, `chat_mensaje.wa_message_id` y
    `whatsapp_envio_entrega.wa_message_id`. Después de SL-17 se sumaron
    `integracion.whatsapp_numero_id` e `integracion.whatsapp_resumen_verificacion` (SL-36: el webhook
    de WhatsApp lleva a una sola empresa) y `usuario_un_solo_superadmin` (SL-32: un solo superadmin).
  - El resto de los únicos sin `organizacion_id` son **anclados**: llevan una FK NOT NULL a una fila de
    negocio, que ya es de una empresa. La guardia `unicos-por-empresa` lee las migraciones y falla si
    un único de negocio nuevo no empieza por `organizacion_id` y no está en la lista, si una entrada
    de la lista no existe, o si este párrafo deja de nombrar un global.
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
- **Cola `jobs` (SL-19).** Política `jobs_por_empresa` (migración `20261025150000_jobs_por_empresa`):
  con `servi_app`, cada empresa ve, escribe y encola solo sus jobs. Los jobs sin empresa (recurrentes)
  solo los ve la plataforma, igual que el drenador, que reclama y cierra los de todas como dueño.
  `dedupe_key` sigue global: toda clave que se encola desde una empresa lleva el id de una fila suya.
  `Job` es la única tabla de empresa opcional (`MODELOS_CON_EMPRESA_OPCIONAL`), y
  `rls-por-empresa.guardia` falla si una tabla comprobada conserva una política abierta.
- **Storage (SL-19).** Los adaptadores de `lib/storage/` guardan cada archivo en
  `<organizacion_id>/<ruta>` de su bucket, con la empresa del contexto (`lib/storage/carpeta-de-empresa.ts`).
  La base guarda la ruta relativa de siempre. Sin empresa, o en plataforma, fallan con `EmpresaNoResuelta`
  antes de llamar a Storage. Nada fuera de `lib/storage/` toca `.storage` salvo `EXCEPCIONES_DE_STORAGE`
  (`storage-solo-por-adaptador.guardia`, R20). Lo guardado antes de SL-19 se mueve con
  `pnpm storage:migrar-a-carpetas [--aplicar | --revertir]` (`scripts/migrar-storage-a-carpetas.ts`).
- **País por empresa (SL-20).** La tabla de plataforma `pais` (id ISO 3166-1 alfa-2, nombre, los seis
  nombres de nivel, la regla de código opcional y `disponible`) guarda solo los países dados de alta;
  el catálogo para elegirlos es fijo, en `lib/constants/paises-iso-3166-1.ts` (no se calcula en
  runtime). Cada empresa tiene `organizacion.pais_id` (`DEFAULT 'CR'`), que no cambia: el trigger
  `organizacion_pais_inmutable` lo rechaza con `SQLSTATE 'SL020'` (`PaisInmutable`). Provincia, cantón
  y distrito llevan `pais_id`; el cantón y el distrito lo heredan de su padre (FK compuestas
  `ON UPDATE RESTRICT`). Un país con `disponible = false` no se ofrece ni se acepta en el alta de
  empresa, y sus empresas siguen igual.
  - **RLS por país:** las políticas `provincia_del_pais`, `canton_del_pais` y `distrito_del_pais` dejan
    a `servi_app` leer solo la geografía del país de su empresa. En plataforma no hay RLS y el
    superadmin filtra por `paisId`.
  - **Trigger `geografia_del_pais_de_la_empresa`** en `orden`, `zona_distrito` y
    `distrito_zona_especial`: una fila no puede apuntar a geografía de otro país (`SQLSTATE 'SL021'`,
    `GeografiaDeOtroPais`). Los dos errores se traducen en `lib/db/errores-pais.ts`.
  - **Historial de plataforma:** las acciones del superadmin sobre países y geografía (alta de país,
    disponibilidad, carga CSV, alta, renombre, retiro y reactivación de nodos) se registran en
    `historial_plataforma` con `appendAccionPlataforma` (`lib/repositories/registrar-accion-plataforma.ts`),
    dentro de la transacción del cambio, no en `historial_accion`. La tabla tiene RLS sin políticas y
    `REVOKE ALL` para `servi_app`.
  - **Gestión:** la pantalla `/plataforma/geografia` (solo superadmin) y `lib/actions/geografia-plataforma.ts`,
    con `comoPlataforma`. La UI pinta los nombres de nivel del país de la empresa con
    `useEtiquetasGeograficas`; ningún texto de nivel va escrito a mano
    (`etiquetas-geograficas-sin-literal.guardia`).
- **Módulos por empresa (SL-23, 2026-10-26).** Cada empresa tiene un núcleo que nunca se apaga y 3
  módulos apagables (`lib/modulos/catalogo.ts`, enum `modulo_apagable`). Recolección, Bodegas
  satélite, API e integraciones y WhatsApp fueron apagables hasta el 2026-10-27, y Wallet hasta el
  2026-10-28, cuando pasaron al núcleo (migraciones `20261027120000_modulos_nucleo` y
  `20261028120000_modulo_wallet_nucleo`).
  - **Tabla:** `organizacion_modulo(organizacion_id, modulo)`, una fila por módulo encendido, con RLS
    por empresa. `servi_app` solo la lee; la escribe únicamente el superadmin, como dueño y en
    `comoPlataforma`, por `lib/repositories/ModulosEmpresaRepository.ts`. Cada cambio deja su fila
    en `historial_accion`. El alta de una empresa nace solo con el núcleo; el seed no la toca.
  - **Reparto:** `lib/modulos/reparto.ts` dice de qué módulo es cada ruta, action, job, cron y route
    de API (o si es núcleo), y qué piezas de un módulo se pintan en pantallas de otro
    (`CONSUMOS_ENTRE_MODULOS`).
  - **Puertas** (`lib/modulos/exigir-modulo.ts`, una consulta por petición y sin caché entre
    peticiones): una página de un módulo apagado da 404 (`exigirModuloEnRuta`); una action responde
    `{ status: "forbidden" }` (`exigirModuloActivo` dentro de `withErrorHandler`); el menú lo filtra
    `menuDeLaEmpresa`; los crons pasan `modulo` a `paraCadaEmpresa`; el drenador marca `descartado`
    el job de un módulo apagado, salvo los de cálculo continuo (`CALCULO_CONTINUO`); la API por key
    es núcleo salvo `ordenes/api-key/analitica`, que con Analítica apagada responde 403 con
    `details.codigo = "modulo_inactivo"`. Sin empresa (sin sesión o
    superadmin), la puerta no aplica y decide la autorización de siempre.
  - **Guardias:** `modulos-reparto.guardia` (toda pieza repartida exactamente una vez, y cada pieza de
    un módulo con su puerta) y `modulos-sin-seed.guardia`.
- **Planes y límites (SL-24, 2026-10-28).** El superadmin crea planes (públicos o custom de una
  empresa) y asigna uno a cada empresa. La base cuenta los topes dentro de la transacción del alta.
  Una empresa sin plan no tiene límites.
  - **Tablas de plataforma:** `plan`, `plan_tope_rol`, `plan_modulo`, `plan_rastro` (migración
    `20261027130000_plan`) y `plan_cambio_programado` (`20261028120000_plan_cambio_programado`), en
    `MODELOS_DE_PLATAFORMA`. Tienen RLS sin ninguna política y `REVOKE ALL … FROM servi_app`: una
    empresa no las lee ni las escribe, tampoco con SQL a mano (`42501`). La asignación vive en
    `organizacion.plan_id` y `organizacion.plan_ciclo_ancla_at`, el ancla del ciclo, que se fija en
    la primera asignación y no cambia al cambiar de plan. `servi_app` las lee y no las escribe.
  - **Triggers de topes** (`20261027130200_plan_topes_triggers`): `plan_tope_ordenes` (de sentencia,
    en `orden`), `plan_tope_usuario_alta` y `plan_tope_usuario_cambio` (en `usuario`), y
    `plan_tope_api_key_alta` y `plan_tope_api_key_cambio` (en `api_key`). Al pasar el tope lanzan
    SQLSTATE `SL024` con el JSON del tope en `MESSAGE`, no en `DETAIL`. `traducirErrorDeTope`
    (`lib/planes/tope-error.ts`) lo traduce a `TopeDelPlanAlcanzado`, con `details.codigo = "tope_plan"`.
    Las funciones son `SECURITY DEFINER` con `EXECUTE` revocado a `PUBLIC`. La única que `servi_app`
    llama es `plan_cupo_ordenes`, y solo con su propia empresa (la lee `CupoPlanRepository`).
  - **Ciclo en UTC (decisión 2026-10-28):** `plan_inicio_ciclo(ancla, ahora)` recibe siempre
    `now() AT TIME ZONE 'UTC'`, nunca `now()::timestamp`. Las columnas son `TIMESTAMP` sin zona y
    Prisma escribe en UTC, así que la hora local de la sesión correría el ciclo. Su gemela en TS es
    `lib/planes/ciclo.ts`.
  - **Cerrojos** (design §4.4 y §5): un alta toma `organizacion` y `plan` en `FOR SHARE` y después el
    consultivo `(24, hashtext(empresa))`. Asignar toma `organizacion` en `FOR UPDATE` y el plan en
    `FOR SHARE`, y editar toma `plan` en `FOR UPDATE`. Así dos altas no pasan juntas el tope y un
    alta no se cruza con un cambio de plan. Ninguna operación pide la empresa después del plan en
    exclusiva, por lo que no hay interbloqueo.
  - **Quién escribe:** solo `lib/repositories/PlanesRepository.ts`, en `comoPlataforma`, con su
    entrada en `EXCEPCIONES_DE_PLATAFORMA`. Un plan no se borra, se archiva. `plan_rastro` solo
    recibe filas nuevas, y `plan_cambio_programado` se escribe solo desde ese repositorio
    (`planes-sin-borrado.guardia`). La semilla no crea planes (`planes-sin-seed.guardia`).
  - **Cambio programado:** una edición con fecha futura se guarda en `plan_cambio_programado`, con
    uno como mucho por plan. Lo aplica el job `plan_aplicar_cambio`, encolado con
    `run_after = vigente_desde`, y como red el recurrente `plan_cambios_vencidos`. Los dos llaman a
    `PlanesRepository.aplicarCambioProgramado`, que es idempotente.
  - **Correos:** guardar, cancelar o archivar con un cambio pendiente encolan `plan_aviso_correo`,
    uno por empresa con el plan, en la misma transacción. `plan_recordatorio_cambio` reparte los
    avisos 7 días y 1 día antes. El correo va por la cola: si falla, la edición se mantiene.
    Los cuatro jobs están en `lib/planes/jobs-cambio-plan.ts` y son de núcleo (`MODULO_POR_JOB`).

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
