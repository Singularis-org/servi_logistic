# SL-17 «Tabla organizacion y aislamiento por empresa» — tasks

**Objetivo:** el **2026-10-23** al menos **dos empresas reales** usan la app en Vercel y en
Supabase, con los datos separados y todos los módulos funcionando.

El trabajo va en 4 tandas. Las tareas marcadas `[P]` dentro de una tanda van en paralelo, cada una
en su propio subagente, y no comparten archivos. Cada tanda se cierra con `./init.sh` en verde en
el worktree.

**Gate y mutaciones no van en paralelo:** el gate de cierre corre después de que acaba toda la
tanda.

```
Tanda 1  ── T1.1 (spike) ─┬─ T1.2 → T1.3              (pista A: db/, schema)
                          └─ T1.4 [P] → T1.5 [P]      (pista B: lib/db, unit)
Tanda 2  ── T2.1 · T2.2 · T2.3 (+T2.3b) · T2.4 · T2.5 · T2.6 · T2.7 · T2.8 · T2.9     (todas [P])
Tanda 3  ── T3.1 · T3.2 · T3.3 · T3.4 · T3.5 · T3.6 · T3.7 · T3.8                    (todas [P])
Tanda 4  ── T4.1 (Supabase real) → T4.2 (humo dos empresas) → T4.3 → T4.4 → T4.5   (secuencial)
```

## Tanda 1 — Base (bloquea todo lo demás)

- [x] **T1.1 Spike de medición** (design §6.5).
  - Un test de integración con una tabla de prueba en un esquema desechable.
  - Mide los 5 puntos de §6.5.
  - Mide el coste de la envoltura: ms por operación con y sin ella, sobre 100 repeticiones.

  **Hecho:** `tests/integration/db/aislamiento-mecanismo.test.ts` en verde, con un caso por punto,
  y el resultado anotado en `progress/impl_SL-17.md`. Si un punto falla, se para y se corrige el
  §6 de `design.md` antes de seguir.
- [x] **T1.2 Clasificación y M1** (pista A; depende de T1.1).
  - `lib/db/modelos-de-negocio.ts` con los 73 + 14 + 1 modelos de design §2 (modelo y tabla).
  - Migración `20261022130000_organizacion_y_rol_app`, con `migration.sql` y `down.sql`:
    - `organizacion` con `slug` único `NOT NULL`;
    - el rol `servi_app`, los grants y los `REVOKE` de escritura en catálogos y `vehiculos`;
    - las políticas de plataforma.
  - `model Organizacion` en `schema.prisma`.
  - Calcular qué tablas de plataforma no tenían RLS, para el `down.sql`.

  **Hecho:**
  - `pnpm run db:reset` aplica todo.
  - Aplicar M1 y luego su `down.sql` sobre una base migrada deja `pg_policies`, `pg_roles` e
    `information_schema` como estaban.
  - `organizacion` tiene 0 filas.
- [x] **T1.3 M2** (pista A; depende de T1.2).
  - Migración `20261022130100_organizacion_id_en_negocio`, generada con un script de un solo uso
    que no se commitea (design §3): columna, FK, `DEFAULT`, índice y política en las 73 tablas.
  - `schema.prisma`: `organizacionId` en los 73 modelos (`String?` en `Usuario`).
  - `email` y `cedula` siguen `@unique` globales (R36).

  **Hecho:**
  - `pnpm run db:reset` y `pnpm run db:generate` limpios, y `pnpm run typecheck` en verde.
  - Un `INSERT` en `orden` sin empresa fijada falla por `NOT NULL`.
- [x] **T1.4 [P] Contexto y extensión** (pista B; depende de T1.1 y de `modelos-de-negocio.ts`,
  que se escribe primero y se comparte con la pista A).
  - `lib/db/contexto-empresa.ts`, con la traducción del SQLSTATE `SL017` a `EmpresaCruzada`.
  - `lib/db/extension-empresa.ts` (design §5–§6, incluidos el `Proxy` de `$transaction` y R35).
  - `lib/db/excepciones-aislamiento.ts`.
  - Enchufarlo en `getPrismaClient()` sin cambiar su firma.

  **Hecho:**
  - `tests/unit/db/extension-empresa.test.ts` en verde (R7–R11, R14, R35, con un cliente doble).
  - Las guardias `prisma-client-sin-adaptador` y `prisma-omit` siguen verdes.
- [x] **T1.5 [P] `paraCadaEmpresa`** (pista B; depende de T1.4).
  - `lib/db/para-cada-empresa.ts`.
  - El fallo de una empresa no frena las demás; sin empresas, no hace nada.

  **Hecho:** `tests/unit/db/para-cada-empresa.test.ts` en verde (R16).

**Cierre:** `./init.sh` verde. Lo esperable es que caigan en rojo los tests de integración que
insertan en tablas de negocio: los arregla T2.6. Si caen, se anotan; no se silencian.

## Tanda 2 — Entradas, garantía estructural, alta y guardias (todo `[P]`; depende de la tanda 1)

- [x] **T2.1 [P] Sesión y login** (design §5 y §7).
  - `lib/auth/empresa-de-la-peticion.ts`, con un memo de 60 s.
  - `resolveActorFromSession` e `isSessionActive` en `comoPlataforma`.
  - `Actor.organizacionId`.
  - Login, OTP y recuperación de contraseña en `comoPlataforma`.

  **Hecho:**
  - `tests/unit/auth/empresa-de-la-peticion.test.ts` (R12, R14) en verde.
  - Los tests que ya existen de `resolve-actor` y de `auth` siguen verdes.
- [x] **T2.2 [P] API key, rutas públicas y WhatsApp.**
  - `buildAutenticar` devuelve `organizacionId`.
  - Las 9 rutas de `app/api/ordenes/api-key/**` y `analitica-integrador` corren en `conEmpresa`.
  - Rastreo público: busca la empresa por `num_guia` en plataforma y hace el resto en
    `conEmpresa`.
  - El webhook de WhatsApp va en `comoPlataforma("SL-36", …)` y deriva la empresa antes de
    escribir.
  - Las postulaciones públicas fallan cerrado con un mensaje neutro (R41).

  **Hecho:**
  - `tests/unit/api/api-key-empresa.test.ts` (R13) y
    `tests/unit/actions/postulacion-sin-empresa.test.ts` (R41) en verde.
  - Los tests de rastreo y de la API key que ya existen siguen verdes.
- [x] **T2.3 [P] Crons y drenador.**
  - Las 11 rutas de cron que tocan negocio pasan por `paraCadaEmpresa`, incluida la
    sincronización de plantillas.
  - Los jobs recurrentes que tocan negocio iteran por empresa.

  **Hecho:** los tests de cron que ya existen siguen verdes, y hay un caso por cron con 0
  empresas que termina sin error (R16).
  - [x] **T2.3b M4 y drenador por empresa** (D16, R42).
    - Migración `20261022130200_jobs_organizacion_id`, con `migration.sql` y `down.sql`.
    - `Job.organizacionId?` en `schema.prisma`.
    - El drenador y `scripts/drenar-jobs.ts` ejecutan cada job dentro de
      `conEmpresa(job.organizacionId)`, o en `comoPlataforma("SL-17", …)` si es nulo.

    **Hecho:** un job encolado dentro de `conEmpresa(A)` guarda A y se ejecuta con A en contexto.
    Lo prueba T3.8.
- [x] **T2.4 [P] Cachés por empresa** (design §7.6, R34).

  **Hecho:**
  - `tests/unit/cache/cache-por-empresa.test.ts` en verde: dos empresas con la misma consulta dan
    dos claves.
  - Las guardias de caché que ya existen siguen verdes.
- [x] **T2.5 [P] Guardias de modelos, RLS, SQL a mano y plataforma** (design §8, R23–R27).
  - `EXCEPCIONES_SQL_A_MANO` lleva los archivos actuales que no filtran, cada uno con su ficha y su
    motivo.
  - `EXCEPCIONES_DE_PLATAFORMA` lleva los puntos de T2.1, T2.2, T2.3 y T2.8, cada uno con su
    ficha.

  **Hecho:**
  - `pnpm run test:guardias` en verde.
  - Cada guardia tiene un caso inventado que la hace fallar (autocomprobación).
- [x] **T2.6 [P] Fábricas y helper de transacción** (design §9.1, R33).
  - `tests/fabricas/organizaciones.ts`.
  - `enTransaccionRevertida` con una empresa por defecto.

  **Hecho:** los tests de integración que se pusieron rojos en el cierre de la tanda 1 vuelven a
  verde sin tocar cada archivo. Si alguno no vuelve, se lista con el porqué.
- [x] **T2.7 [P] M3: misma empresa en cada FK** (D15, design §3 M3; depende de T1.3).
  - `lib/db/fk-de-negocio.ts`: desde el DMMF, las FK de negocio a negocio y el nombre
    determinista de cada trigger.
  - `scripts/generar-misma-empresa.ts`, que se commitea.
  - Migración `20261022130300_misma_empresa_en_fk`, con `migration.sql` y `down.sql`, generada con
    ese script.
  - La guardia `tests/unit/guards/fk-misma-empresa.guardia.test.ts` (R39), con su autocomprobación.
  - **La medición:** el `INSERT` de una `orden`, 1000 repeticiones, con trigger y sin él.

  **Hecho:**
  - `pnpm run db:reset` limpio.
  - La guardia en verde, y en rojo si se borra un trigger del SQL.
  - El número real de FK cubiertas y el coste en ms por insert anotados en
    `progress/impl_SL-17.md`.
- [x] **T2.8 [P] Alta de empresa: servicio, repositorio y action protegida** (D18 revisada,
  design §7.7, R44–R46, R48; depende de T1.3 y T1.4).
  - `OrganizacionService.altaEmpresa`, `OrganizacionRepository`, tipos, interfaces y
    `lib/actions/organizaciones.ts`.
  - `lib/auth/exigir-superadmin.ts` como **punto de enganche** con SL-32: delega en
    `lib/auth/plataforma.ts` si ya existe; si no, devuelve siempre `false`.
  - La action va en `EXCEPCIONES_DE_PLATAFORMA`.
  - **Sin UI:** la pantalla «Empresas» es de SL-32.
  - La firma del maestro depende de la pregunta abierta 1 de `requirements.md`. Mientras no se
    responda, va con `telefono`, `documento` y `tipoDocumento`.

  **Hecho:**
  - `tests/unit/services/organizacion-service.test.ts` en verde.
  - `tests/integration/db/organizacion-alta.test.ts` en verde, con los cinco desenlaces de §7.7 y
    el primer acceso por «recuperar contraseña».
  - `tests/unit/actions/organizaciones-action.test.ts` en verde: todo actor que no es superadmin,
    **incluido el maestro**, recibe «no autorizado» y el servicio no se llama. Sin SL-32, también
    el superadmin.
- [x] **T2.9 [P] Retiro de los conteos públicos** (D17, design §7.8, R43).
  - Borrar y editar los archivos de §7.8.
  - `tests/unit/guards/conteos-publicos-retirados.guardia.test.ts`.

  **Hecho:**
  - La landing compila y se renderiza sin cifras.
  - Las guardias de landing y superficies públicas, ya actualizadas, en verde.
  - La guardia nueva en verde, y en rojo si vuelve un import de conteos.

**Cierre:** `./init.sh` verde.

## Tanda 3 — Dos empresas (todo `[P]`; depende de T2.1, T2.5, T2.6 y, donde se indica, de T2.3b y T2.7)

Cada test se mata con una mutación antes de creerlo: quitar el filtro, la política o el trigger
tiene que ponerlo en rojo. Sin filas de A sembradas, el test falla, no se salta.

- [x] **T3.1 [P] Órdenes:** `tests/integration/db/aislamiento-ordenes.test.ts` (R28, R7–R9).
  Además, el servicio de crear orden, con una `tiendaId` de A desde B, da «no encontrado» por la
  lectura previa.
- [x] **T3.2 [P] Wallet:** `tests/integration/db/aislamiento-wallet.test.ts` (R29).
- [x] **T3.3 [P] Cierres:** `tests/integration/db/aislamiento-cierres.test.ts` (R30).
- [x] **T3.4 [P] Usuarios:** `tests/integration/db/aislamiento-usuarios.test.ts` (R31, R3, R35,
  R36).
- [x] **T3.5 [P] RLS, SQL a mano y catálogos:** `tests/integration/db/aislamiento-rls.test.ts`
  (R17–R22, R40, R10).
- [x] **T3.6 [P] Migraciones de ida y vuelta:** `tests/integration/db/migracion-sl17-ida-y-vuelta.test.ts`
  (R6, R32; M1–M4).
- [x] **T3.7 [P] Misma empresa en la base:** `tests/integration/db/aislamiento-fk-misma-empresa.test.ts`
  (R37, R38; depende de T2.7). La orden de B con la tienda de A la rechaza la base con `SL017`,
  por SQL a mano y como dueño.
- [x] **T3.8 [P] Entradas con dos empresas con datos:** `tests/integration/db/dos-empresas-entradas.test.ts`
  (R16, R42, R13; design §7.9; depende de T2.2, T2.3 y T2.3b). Los crons, el drenador y la API key
  **trabajan** en las dos empresas, cada una en la suya.
- [x] **T3.9 Únicos por empresa y podio** (decisión del leader, 2026-10-23): migración
  `20261023090000_unicos_por_empresa` con `down.sql`, `premio_ranking` con `UNIQUE(organizacion_id, posicion)`,
  podio sembrado por `altaEmpresa`, auditoría de los únicos de las 73 tablas (tabla en la bitácora) y
  `tests/integration/db/unicos-por-empresa.test.ts`.
- [x] **T3.10 Fugas destapadas en T3.1/T3.8:** los modelos de plataforma en contexto de empresa van con
  envoltura (RLS en los `include` anidados y R40 por la app), y la carga masiva lee la tienda antes de
  escribir («tienda no encontrada»).

**Hecho, para cada una:** el test está en verde, hay una mutación que lo pone en rojo y el
comando con su salida queda en `progress/impl_SL-17.md`.

## Tanda 4 — Despliegue y aceptación (secuencial)

- [x] **T4.1 Verificar la RLS en las DOS bases reales, ANTES de dar de alta empresas** (D21,
  design §4).
  - `scripts/verificar-rls-despliegue.ts`, con los 6 puntos de §4, contra las dos bases Supabase
    de Carlos, nuevas y vacías: **producción** (Production) y **QA** (Preview). En cada una se usan
    la `DATABASE_URL` del pooler y la `DIRECT_URL`.
  - Antes, `prisma migrate deploy` contra cada base.

  **Hecho:**
  - Salida 0 en las dos, con su texto en `progress/impl_SL-17.md`.
  - Si falla el punto 1 o 2 en cualquiera, se aplica el **plan B** de §4 en las dos: rol con
    login y `DATABASE_URL_APP` **por entorno**, la de producción en Production y la de QA en
    Preview. Después se repite.
  - Si falla el punto 3, 4 o 5, **no se sigue**: se avisa a Carlos con la salida.
  - Ninguna empresa se da de alta en una base sin este «Hecho».
- [x] **T4.2 Humo de aceptación de dos empresas** (D19, R47, design §9.3).
  - `e2e/dos-empresas-humo.spec.ts`, en local.
  - Crea A y B con `OrganizacionService.altaEmpresa` **desde la fixture**. Se cambiará por la
    pantalla «Empresas» de SL-32 cuando exista.
  - Siembra datos y recorre con cada maestro todas las rutas del menú del maestro que da
    `lib/auth/menu-visibility.ts`.

  **Hecho:**
  - El spec en verde.
  - Mutación: con el filtro de la extensión apagado, el humo encuentra un marcador `A-…` en B.
  - La salida en `progress/impl_SL-17.md`.
- [x] **T4.3 Suite completa local** (`./init.sh --completo`).
  - Cada rojo nuevo frente a `tests/baseline-rojos.json` se arregla o se explica.
  - Nada entra al baseline sin el OK de Carlos.

  **Hecho:** sin rojos nuevos sin explicar.
- [x] **T4.4 Docs.**
  - `docs/architecture.md > Multi-empresa`: que las tablas heredadas ya tienen la columna; el rol
    `servi_app`; `conEmpresa`/`comoPlataforma`; los triggers de misma empresa y el script que los
    genera para una FK nueva; las listas de excepciones; y el alta de empresa (`OrganizacionService` y su action, con el
    enganche a SL-32).
  - `docs/checkpoints-proyecto.md`: el aislamiento entre empresas entra en los flujos críticos,
    con `e2e/dos-empresas-humo.spec.ts` como evidencia, y se cierra su ABIERTO.
  - `progress/deudas.md`:
    - las excepciones de plataforma con SL-36;
    - la revisión fina del SQL a mano;
    - la escritura de vehículos y de geografía del maestro (va a SL-26);
    - el coste medido de la envoltura y de los triggers.

  **Hecho:** los docs citan archivos reales y `./init.sh` está verde, validador del perfil
  incluido.
- [x] **T4.5 Mapa `R<n> → test`** en `progress/impl_SL-17.md`, de R1 a R47. Cada uno cita un test
  concreto; los que cubre una guardia citan la guardia.

  **Hecho:** no falta ningún R.

## Mapa previsto R → task

| R | Task |
|---|---|
| R1, R2, R4, R32 | T1.2, T1.3, T2.5, T3.6 |
| R3, R35, R36 | T1.3, T1.4, T3.4 |
| R5, R23 | T2.5 |
| R6 | T3.6 |
| R7–R11, R14 | T1.4, T3.1 |
| R12 | T2.1 |
| R13 | T2.2, T3.8 |
| R15, R27 | T2.1–T2.3, T2.5, T2.8 |
| R16 | T1.5, T2.3, T3.8 |
| R17–R22 | T1.3, T3.5 |
| R24–R26 | T2.5 |
| R28–R31 | T3.1–T3.4 |
| R33 | T2.6 |
| R34 | T2.4 |
| R37, R38 | T2.7, T3.7 |
| R39 | T2.7 |
| R40 | T1.2, T3.5 |
| R41 | T2.2 |
| R42 | T2.3b, T3.8 |
| R43 | T2.9 |
| R44–R46, R48 | T2.8 |
| R47 | T4.2 |
| D21 (no es R) | T4.1 |

## Archivos esperados

Esquema y migraciones:
- `db/schema.prisma`
- `db/migrations/20261022130000_organizacion_y_rol_app/migration.sql`
- `db/migrations/20261022130000_organizacion_y_rol_app/down.sql`
- `db/migrations/20261022130100_organizacion_id_en_negocio/migration.sql`
- `db/migrations/20261022130100_organizacion_id_en_negocio/down.sql`
- `db/migrations/20261022130200_jobs_organizacion_id/migration.sql`
- `db/migrations/20261022130200_jobs_organizacion_id/down.sql`
- `db/migrations/20261022130300_misma_empresa_en_fk/migration.sql`
- `db/migrations/20261022130300_misma_empresa_en_fk/down.sql`

Núcleo:
- `lib/db/prisma-client.ts`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/contexto-empresa.ts`
- `lib/db/extension-empresa.ts`
- `lib/db/para-cada-empresa.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/db/fk-de-negocio.ts`
- `scripts/generar-misma-empresa.ts`

Alta de empresa:
- `lib/types/organizacion.ts`
- `lib/interfaces/services/IOrganizacionService.ts`
- `lib/interfaces/repositories/IOrganizacionRepository.ts`
- `lib/services/OrganizacionService.ts`
- `lib/repositories/OrganizacionRepository.ts`
- `lib/actions/organizaciones.ts`
- `lib/auth/exigir-superadmin.ts`

Despliegue:
- `scripts/verificar-rls-despliegue.ts`
- `.env.example` (solo si se aplica el plan B: `DATABASE_URL_APP=`)

Sesión, login y actor:
- `lib/auth/empresa-de-la-peticion.ts`
- `lib/auth/resolve-actor.ts`
- `lib/auth/session-guard.ts`
- `lib/interfaces/services/IOrdenService.ts`
- `lib/actions/auth.ts`
- `lib/actions/password-reset.ts`
- `app/login/page.tsx`
- `app/recuperar-contrasena/page.tsx`

API key:
- `lib/api/api-key-request.ts`
- `lib/api/analitica-integrador.ts`
- `app/api/ordenes/api-key/route.ts`
- `app/api/ordenes/api-key/[numGuia]/cancelar/route.ts`
- `app/api/ordenes/api-key/orden/[id]/route.ts`
- `app/api/ordenes/api-key/orden/[id]/generate/route.ts`
- `app/api/ordenes/api-key/habilitar/route.ts`
- `app/api/ordenes/api-key/cotizacion/route.ts`
- `app/api/ordenes/api-key/carga/route.ts`
- `app/api/ordenes/api-key/carga/[cargaId]/generate/route.ts`
- `app/api/ordenes/api-key/analitica/route.ts`

Rutas públicas, postulaciones y WhatsApp:
- `lib/actions/rastreo-publico.ts`
- `app/paquete/[numGuia]/page.tsx`
- `lib/actions/postulacion-mensajero.ts`
- `lib/actions/postulacion-recurso.ts`
- `app/api/webhooks/whatsapp/route.ts`

Crons y jobs:
- `app/api/cron/sync-plantillas-whatsapp/route.ts`
- `app/api/cron/snapshot-ranking/route.ts`
- `app/api/cron/purga-descargas/route.ts`
- `app/api/cron/purga-pdf-cargas/route.ts`
- `app/api/cron/purga-postulaciones-recurso/route.ts`
- `app/api/cron/aviso-reparto-manana/route.ts`
- `app/api/cron/avisos-diarios/route.ts`
- `app/api/cron/corte-diario/route.ts`
- `app/api/cron/generar-gastos-fijos/route.ts`
- `app/api/cron/liberar-reprogramadas/route.ts`
- `app/api/cron/procesar-devueltas-sla/route.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `scripts/drenar-jobs.ts`
- `lib/repositories/JobRepository.ts`

Cachés:
- `lib/cache/next-analitica-cache.ts`
- `lib/cache/next-tablero-dia-cache.ts`

Retiro de los conteos públicos (se borran o se editan):
- `lib/actions/conteos-publicos.ts`
- `lib/repositories/ConteosPublicosRepository.ts`
- `lib/interfaces/repositories/IConteosPublicosRepository.ts`
- `lib/interfaces/external/IConteosPublicosCache.ts`
- `lib/config/conteos-publicos-cache.ts`
- `lib/cache/conteos-publicos-cache-nula.ts`
- `lib/cache/next-conteos-publicos-cache.ts`
- `lib/types/conteos-publicos.ts`
- `app/_landing/cifras-publicas.tsx`
- `app/_landing/LandingHero.tsx`
- `app/_landing/LandingBanda.tsx`
- `tests/unit/actions/conteos-publicos.test.ts`
- `tests/components/cifras-publicas.test.tsx`
- `tests/unit/guards/landing-sin-maqueta.guardia.test.ts`
- `tests/unit/guards/rastreo-frontera.guardia.test.ts`
- `tests/unit/analytics/cache-aislamiento.guardia.test.ts`
- `tests/fixtures/superficies-publicas.ts`

Tests:
- `tests/fabricas/organizaciones.ts`
- `tests/integration/db/_postgres-real.ts`
- `tests/integration/db/aislamiento-mecanismo.test.ts`
- `tests/integration/db/aislamiento-ordenes.test.ts`
- `tests/integration/db/aislamiento-wallet.test.ts`
- `tests/integration/db/aislamiento-cierres.test.ts`
- `tests/integration/db/aislamiento-usuarios.test.ts`
- `tests/integration/db/aislamiento-rls.test.ts`
- `tests/integration/db/aislamiento-fk-misma-empresa.test.ts`
- `tests/integration/db/migracion-sl17-ida-y-vuelta.test.ts`
- `tests/integration/db/dos-empresas-entradas.test.ts`
- `tests/integration/db/organizacion-alta.test.ts`
- `tests/unit/services/organizacion-service.test.ts`
- `tests/unit/actions/organizaciones-action.test.ts`
- `tests/unit/db/extension-empresa.test.ts`
- `tests/unit/db/para-cada-empresa.test.ts`
- `tests/unit/auth/empresa-de-la-peticion.test.ts`
- `tests/unit/api/api-key-empresa.test.ts`
- `tests/unit/actions/postulacion-sin-empresa.test.ts`
- `tests/unit/cache/cache-por-empresa.test.ts`
- `tests/unit/guards/organizacion-en-modelos.guardia.test.ts`
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/unit/guards/sql-a-mano-por-empresa.guardia.test.ts`
- `tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts`
- `tests/unit/guards/fk-misma-empresa.guardia.test.ts`
- `tests/unit/guards/conteos-publicos-retirados.guardia.test.ts`
- `e2e/dos-empresas-humo.spec.ts`

Docs:
- `docs/architecture.md`
- `docs/checkpoints-proyecto.md`

Choques declarados (design §10; la regla es que quien mergea segundo rebasa):
- con SL-32: `db/schema.prisma` y el punto de enganche `lib/auth/exigir-superadmin.ts` →
  `lib/auth/plataforma.ts`. SL-32 consume `lib/actions/organizaciones.ts` desde su pantalla
  «Empresas».
- con SL-31: `tests/fabricas/` y `tests/integration/db/_postgres-real.ts`.

SL-17 no toca `.github/workflows/gate.yml`.
