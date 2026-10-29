# Deudas del proyecto

Una deuda por bloque `### D<n> — título` con **Origen**, **Qué falta** y **Dueño**. Dónde se edita: `docs/equipo.md > Dónde se edita progress/deudas.md`.

### D1 — `cobro_manual_reclasificado` sin productor
- **Origen:** SL-13 (`fuera-nuform`) (2026-10-21). Al quitar la migración 459, nadie escribe ese valor.
- **Qué falta:** decidir si se retira el valor y el código de `lib/` que lo lee, o se conserva como capacidad.
- **Dueño:** Carlos Restrepo (decidir si va a ficha).

### D2 — Nadie vigila que el resto de `.env*` siga ignorado
- **Origen:** review de SL-10 (m2, 2026-10-21). R18 se comprobó a mano.
- **Qué falta:** una guardia que falle si `git check-ignore` deja pasar un `.env` que no sea `.env.example`. El repo será público.
- **Dueño:** Carlos Restrepo (candidata a SL-14 o ficha propia).

### D3 — `.env.example` atribuye SINPE y Costa Rica a «fase 3»
- **Origen:** review de SL-10 (m3). «Fase 3» no es una ficha `SL-<n>`.
- **Qué falta:** citar SL-20 / SL-21 / SL-22 en la cabecera.
- **Dueño:** quien toque `.env.example` (SL-14).
- **Estado:** RESUELTA en SL-14 (`a1e9e1b`): la cabecera cita SL-20, SL-21 y SL-22.

### D4 — Los linters del proyecto deben ignorar `.worktrees/`
- **Origen:** R15 de SL-10 (2026-10-21): el lint del checkout principal recorrió los 9 worktrees y salió rojo por archivos generados dentro de ellos. Arreglado aquí en `eslint.config.mjs` (`3837738`).
- **Qué falta:** que `docs/worktrees.md` lo diga, para todos los proyectos del arnés (`/afinar-regla` y subir a la plantilla).
- **Dueño:** leader.

### D5 — El gate rápido de un worktree no selecciona por diff sin `origin/dev`, y no lo dice
- **Origen:** SL-13 (2026-10-22). Sin push no existe `origin/dev`; `./init.sh` en un worktree salió verde sin correr los tests del cambio. Se tapa con `TEST_RAPIDO_BASE=dev`.
- **Qué falta:** que `scripts/test-rapido.mjs` caiga a la rama local de integración o falle con aviso (arnés: `/afinar-regla` y subir a la plantilla).
- **Dueño:** leader.

### D6 — El YAML de la API no nombra las cabeceras de firma del webhook
- **Origen:** SL-15 (2026-10-22), visto en la review de SL-16 (H3). `openApiSpec.info.description` (`lib/api/openapi-spec.ts`) lleva el párrafo «Webhooks: cada entrega va firmada…» con las dos cabeceras `X-Servi-Logistic-*`; el `info.description` de `docs/api/api-key-openapi.yaml` no lo tiene. Es la única divergencia TS↔YAML del contrato.
- **Qué falta:** llevar ese párrafo al YAML con las mismas palabras, y que un test de paridad lo cubra.
- **Dueño:** Carlos Restrepo (ficha propia o la próxima que toque el contrato).

### D7 — ¿Quién retira una provincia: la empresa o la plataforma? — RESUELTA (2026-10-22)
- **Origen:** SL-16 (2026-10-22), review H4. La ayuda decía que lo hacía la empresa, siguiendo el código de SL-15; `docs/plan-saas.md` decisión 5 apuntaba a la plataforma.
- **Resolución:** decisión de Carlos del 2026-10-22, aplicada en SL-32 (R22–R26): gestionar la geografía (alta, cambio de nombre, retiro, reactivación y conteo) es de la plataforma (`GESTION_ROLES = ROLES_PLATAFORMA`); el `maestro` solo conserva `listarArbol` para Tarifas. Texto de la API, CHANGELOG y ayuda actualizados. Sin deuda nueva; lo que queda de la rama del superadmin es D15 y la escritura de `distrito.zona_especial` es D12.
- **Dueño:** cerrada.

### D8 — La suite de integración necesita datos que la app vacía ya no siembra
- **Origen:** SL-11 (app vacía), medido en el gate completo de `dev` tras SL-16 (2026-10-22): 245 archivos de `tests/integration/` en `tests/baseline-rojos.json`, todos por base sin órdenes, usuarios ni zonas.
- **Qué falta:** SL-31 (tests con datos propios y CI migrada); al cerrarla, el baseline vuelve a su única entrada de SL-29.
- **Dueño:** quien tome SL-31.

### D9 — Docs del perfil que nombran la app de origen
- **Origen:** verificación previa al push (2026-10-22). `docs/architecture.md`, `checkpoints-proyecto.md`, `dependencias.md`, `limpieza-ordenex.md`, `perfil-agentes.md`, `plan-saas.md` y `verification.md` la nombran para fijar reglas e historia, no como marca de la app.
- **Qué falta:** decidir con SL-27 si se reescriben como «la app de origen» o se archivan.
- **Dueño:** quien tome SL-27.

### D10 — Excepciones de plataforma que absorbe SL-36 — RESUELTA (2026-10-25)
- **Origen:** SL-17 (2026-10-23). El webhook de WhatsApp (`app/api/webhooks/whatsapp/route.ts`) corre en `comoPlataforma("SL-36", …)` y la sincronización de plantillas usa credenciales globales: dos empresas comparten número y plantillas de Meta.
- **Resolución:** SL-36. Las credenciales de WhatsApp, Maps, rutas y asistente son por empresa, cifradas en `integracion` (`lib/crypto/boveda-integraciones.ts`, recifrado con `pnpm integraciones:recifrar`). El route del webhook salió de `EXCEPCIONES_DE_PLATAFORMA`; en su lugar queda `lib/repositories/IntegracionEnrutadoRepository.ts`, que solo lee `id` y `organizacion_id` para enrutar (R22). Detalle en `docs/architecture.md > Multi-empresa`.
- **Dueño:** cerrada.

### D11 — Revisión fina del SQL a mano
- **Origen:** SL-17, decisión D7. `EXCEPCIONES_SQL_A_MANO` (`lib/db/excepciones-aislamiento.ts`) arranca con 47 archivos que no filtran por `organizacion_id`; hoy solo los cubre la RLS.
- **Qué falta:** revisarlos uno a uno, añadir el filtro y sacarlos de la lista (la guardia `sql-a-mano-por-empresa` exige que la lista solo baje).
- **Dueño:** Carlos Restrepo (ficha propia).

### D12 — Escritura de vehículos y de geografía del maestro
- **Origen:** SL-17, D12 y R40. `vehiculos`, provincia, cantón y distrito son de plataforma: escribir desde una empresa falla cerrado. Las actions de `lib/actions/vehiculos.ts` y `crear/renombrarNodoGeografico` devuelven un estado engañoso (`conflict`/`in_use`, por un `catch {}` genérico); `cambiarActivacionGeografica` y `actualizarDistritosEspeciales` (`lib/actions/geografia.ts`) dan 500 sin manejar. `actualizarDistritosEspeciales` escribe `distrito.zona_especial`, una marca del flujo de Tarifas, que el maestro ya no puede cambiar.
- **Qué falta:** pasar la edición al superadmin (SL-26) y dejar las pantallas del maestro en solo lectura con su mensaje.
- **Resuelto en SL-38 (2026-10-23):** la marca de zona especial es de la empresa, en `distrito_zona_especial` con RLS; `actualizarDistritosEspeciales` vuelve al maestro por servicio y repositorio, y la columna `distrito.zona_especial` sale.
- **Dueño:** Carlos Restrepo (decidir) y quien tome SL-26.

### D13 — Coste medido de la envoltura y de los triggers
- **Origen:** SL-17, T1.1, T2.7 y T4.1. En local, la envoltura suma ~1,1 ms por operación (mediana 0,62 → 1,76 ms) y los triggers de misma empresa ~1,1 ms por `INSERT` de `orden` (mediana 0,42 → 1,51 ms; ~0,27 ms por FK). Por el pooler de Supabase: ver `progress/impl_SL-17.md > T4.1`.
- **Qué falta:** si una ruta caliente se pasa de presupuesto, una transacción por petición (en vez de una por operación) o triggers sin `EXECUTE` dinámico. No se optimizó en SL-17.
- **Dueño:** Carlos Restrepo (cuando haya una medida en producción).

### D14 — Huecos conocidos del aislamiento
- **Origen:** SL-17 (2026-10-23).
- **Qué falta:**
  - dentro de una `$transaction` interactiva, usar el cliente global en vez de `tx` va filtrado pero sin envoltura (como dueño): el SQL a mano ahí no tiene RLS;
  - `getPrismaClient().$extends(...)` deja fuera el `Proxy` de `$transaction`;
  - lecturas de `organizacion_id` directas a Prisma en `lib/api/api-key-request.ts`, `lib/actions/rastreo-publico.ts` y el webhook de WhatsApp, que deberían ir a sus repositorios;
  - ~20 suites inyectan dobles de `autenticar` sin `organizacionId` (rama sin contexto que falla cerrado);
  - ~~`PushSuscripcionRepository.registrar` hace upsert por `endpoint` global: un dispositivo que pasa de una empresa a otra no cambia de dueño y la primera sigue enviándole push~~ (revisado 2026-10-27: decía «choca (P2002)»; el fallo real es silencioso, el alta en la otra empresa responde `ok` sin tocar la fila) — **RESUELTO por SL-18 (2026-10-26, R26–R28):** `registrarSuscripcionPush` llama antes a `PushEndpointPlataformaRepository.liberarDeOtrasEmpresas` (en plataforma, ficha SL-18), que borra la fila de ese endpoint exacto si es de otra empresa; el último que se registra gana. Lo prueba `tests/integration/db/push-ultimo-gana.test.ts`;
  - código que quedó sin uso tras retirar los conteos públicos: `WHERE_*_DISPONIBLE` (`lib/repositories/_shared/geografia-activa.ts`) y `lib/utils/cifra-aproximada.ts`.
- **Dueño:** SL-18/SL-19 (push y únicos), Carlos Restrepo (el resto, ficha propia).

### D15 — La geografía del superadmin choca con el aislamiento por empresa (P7 de SL-32)
- **Origen:** SL-32 (2026-10-22), P7. Con SL-17, `renombrar` y `cambiarActivacion` de `GeografiaService` escriben `historial_accion`, y `contarOrdenesSinEntregar` lee `orden`. Las dos son tablas de negocio, y el superadmin no tiene empresa: esas operaciones fallan con `EmpresaNoResuelta`.
- **Qué falta:** decidir qué empresa lleva el registro de una acción de plataforma, o dónde se registra, y si el conteo cubre todas las empresas. Carlos aceptó diferirlo: nadie gestiona la geografía desde la interfaz hasta SL-26, que trae la pantalla de geografía de plataforma. Hasta entonces SL-32 prueba la rama del superadmin solo con dobles. Efectos medidos el 2026-10-23 (review de SL-32, m5): con el superadmin, `renombrar` responde un «ya existe» falso (el `catch` genérico de D12 se traga el `EmpresaNoResuelta`), y el superadmin llega por URL a `/configuracion/geografia` (la puerta es `esPlataforma`, sin ítem de menú), donde retirar, reactivar y el conteo dan 500.
- **Dueño:** quien tome SL-26 (decide Carlos Restrepo).

### D16 — El humo de dos empresas da de alta por fixture, no por la pantalla (D19 de SL-17) — RESUELTA (2026-10-24)
- **Origen:** SL-17 D19 y SL-32 (2026-10-23), review B2. `e2e/dos-empresas-humo.spec.ts` crea las dos empresas por el servicio de SL-17. SL-32 trae la pantalla «Empresas», y D19 pedía que quien mergeara segundo cambiara el alta a la pantalla.
- **Resolución:** SL-44 (R16, R17; T4.1). El humo da de alta A y B desde `/plataforma/empresas` con el superadmin de prueba. Cada maestro entra por «¿Olvidaste tu contraseña?» con el OTP del log del servidor, sin SMTP. Conserva sus aserciones de aislamiento. La repetición `ya_existe` del servicio, que la pantalla no muestra, la cubre `tests/integration/db/organizacion-alta.test.ts`.
- **Dueño:** cerrada.

### D17 — Los E2E que leen el OTP del log del servidor no corren en CI — RESUELTA (2026-10-24)
- **Origen:** SL-32 (2026-10-23), review m6. `e2e/superadmin-arranque.spec.ts`, `e2e/superadmin-empresas.spec.ts` y `e2e/dos-empresas-humo.spec.ts` leen el código del log del dev server (`SL17_HUMO_LOG_SERVIDOR`, con `AUTH_OTP_DEBUG_LOG=1`). `.github/workflows/gate.yml` no define ese log, así que en el job `e2e` (PR a `prod`, o `workflow_dispatch`) caen; ese job ya sale en rojo por specs heredados que esperan datos sembrados (D8).
- **Resolución:** SL-44 (R14, R15, R20–R22; D3, D6).
  - Playwright arranca la app con `e2e/_servidor-app.mjs`, que escribe su salida en `E2E_LOG_SERVIDOR`, con el emisor de consola y `AUTH_OTP_DEBUG_LOG=1` solo en su `webServer.env`.
  - Con `VERCEL_ENV=production` el código no se escribe nunca (R1).
  - El job `e2e` corre en cada PR a `dev` y a `prod`, en tres grupos con base propia.
  - Los specs heredados se rehicieron con datos propios (R7–R9), sin `skip` ni `fixme`. Detalle en `docs/verification.md > El E2E`.
- **Dueño:** cerrada.

### D18 — Deadlock 40P01 entre el R34 de `cobro-tienda-461-completar-migration` y los tests de concurrencia de la caja
- **Origen:** SL-38, review vuelta 1 (B1), 2026-10-23. Es de `dev`, no de SL-38.
- **Causa (DETAIL de Postgres):**
  - El R34 corre `ALTER TABLE "wallet_tienda_movimiento" DROP CONSTRAINT "wallet_tienda_movimiento_tienda_id_fkey"` dentro de `enTransaccionRevertida459`, que toma el lock de la 227 (`CLAVE_LOCK_ESCRITURA_REAL`).
  - Del otro lado hay una transacción del servicio real que lee o escribe `wallet_tienda_movimiento`: el `SUM(monto) … GROUP BY tipo` del saldo, o el `INSERT … ON CONFLICT DO NOTHING` de `WalletTiendaMovimientoRepository`.
  - Esa transacción la abren `abono-tienda-457-concurrencia` y `pago-por-cuenta-tienda-concurrencia`, que commitean solo bajo `conCandado459` (`4590001`) o `hashtext(...)`, no bajo el de la 227. Los dos locks no se excluyen.
  - El DDL ya tiene el libro de tiendas y espera `AccessExclusiveLock` sobre una segunda relación, que el servicio ya tiene tomada. Por la FK que suelta, esa relación es `usuario`, aunque es una inferencia: el OID no se resolvió porque la base se borró.
  - El servicio espera el libro de tiendas. Toman las dos tablas en orden inverso, y por eso hay ciclo.
- **Contraprueba sobre `origin/dev` (`fa67b57`, sin SL-38):**
  - Base `sl38_devref` migrada con las de dev, cliente generado desde dev y los tres archivos juntos, 10 corridas.
  - Resultado: **2/10 con 40P01**. La corrida 1 mató al `abono-tienda-457-concurrencia` (R16) y la 3 al R34. Las dos con el mismo par de sentencias en el log del servidor (14:32:54 y 14:33:27).
  - En la selección de `test:rapido` solo sale cuando el planificador de vitest los cruza en el tiempo: el reviewer lo vio y la corrida instrumentada r1 no.
- **Mismo origen, otro síntoma:** `gasto-fijo-plantilla-borrado.test.ts:143` cuenta `wallet_movimiento` entera dos veces en una transacción READ COMMITTED y vio `4 → 2` en el gate de SL-38 (corrida 1, 2026-10-23). Una cuenta global no aguanta escrituras commiteadas en paralelo. Debería contar solo sus filas.
- **Qué falta:**
  - Serializar las dos familias con un único orden de locks. Una opción: que los tests de concurrencia 457/458/461 sostengan el lock de la 227 en sesión (`tomarLockDeEscrituraReal`) durante su escritura commiteada, ANTES del de la 459.
  - Otra opción: que el R34 no haga DDL sobre una tabla real y pruebe el control con un esquema desechable.
  - Un reintento no vale.
- **Dueño:** quien tome la siguiente ficha de la caja (461/459), o Carlos Restrepo si se abre una propia.

### D19 — El E2E del cobro de la plataforma solo corre con `SL40_UI=1` — RESUELTA (2026-10-24)
- **Origen:** SL-40, review m2 (2026-10-24). `e2e/cobro-plataforma-sl40.spec.ts` se salta sin `SL40_UI=1`, así que en el job `e2e` de CI no protege nada. Lo mismo pasa con `e2e/wallet.spec.ts`, en rojo heredado (D8).
- **Resolución:** SL-44 (R13; T4). El spec pierde la bandera, corre en el grupo `aislamiento` con su base y el log del servidor, y un `afterAll` deja el cobro global como estaba. `wallet.spec.ts` se rehízo con datos propios (T6.3). La guardia `e2e-sin-saltos` impide que vuelva un skip.
- **Dueño:** cerrada.

### D20 — Comentarios desfasados tras SL-18
- **Origen:** review de SL-18 (m1 y m2, 2026-10-27).
- **Qué falta:** reescribir los comentarios que describen el comportamiento anterior a SL-18:
  - `PushEndpointPlataformaRepository.ts:10` y `push.ts:125`, que hablan del push de antes del «gana el último»;
  - `recuperar-contrasena.ts:28`, que habla del paso del código.
  Son solo comentarios; el código es correcto.
- **Dueño:** Camilo (la próxima ficha que toque push o recuperar).

### D21 — El arranque del superadmin rechaza un email que ya usa una cuenta de empresa
- **Origen:** review de SL-18 (m3, 2026-10-27).
- **Qué falta:** `ArranqueSuperadminRepository.ts:76-81` busca el email sin filtrar por `organizacion_id IS NULL`. Según R3 de SL-18, el superadmin puede compartir email con una cuenta de empresa. Hoy no ocurre, porque el superadmin se crea con la base vacía.
- **Dueño:** Camilo (decidir si va a ficha).

### D22 — `/novedades` con WhatsApp apagado queda solo con «Llamar»
- **Origen:** SL-23 (pregunta abierta y menor m4 del review, 2026-10-27).
- **Qué falta:** decidir si, con el módulo WhatsApp apagado, `/novedades` debe ofrecer otro canal o quedarse solo con «Llamar», sin enlace `wa.me`. El spec no lo pedía.
- **Dueño:** Camilo (decidir si va a ficha).

### D23 — `/plataforma/empresas/[organizacionId]` no consta como pasada por `/design`
- **Origen:** review de SL-23 (m2, 2026-10-27). `docs/perfil-agentes.md > frontend_dev` pide pasar toda pantalla nueva por `/design`.
- **Qué falta:** pasar la pantalla por `/design`, o anotar por qué basta con `AppPage`, el `Switch` de shadcn y los tokens existentes.
- **Dueño:** Camilo.

### D24 — `pnpm run typecheck` se queda sin memoria con el heap por defecto de Node
- **Origen:** gate de SL-24 (2026-10-27), en Windows 11 con Node v22.13.1 y 24 GB de RAM. `tsc --noEmit` cayó con `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` (exit 134), y `./init.sh` salió en rojo sin que el cambio tocara código. Con `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` salió `init OK`.
- **Qué falta:** fijar el heap en el script `typecheck` de `package.json` (por ejemplo `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`) o en `init.sh`, y comprobar que el job estático de CI no lo necesita también.
- **Dueño:** Camilo (decidir si va a ficha).

### D25 — Los correos de cambio de plan muestran el precio sin símbolo de moneda
- **Origen:** SL-24 T12 (2026-10-28). El plan no guarda moneda y la plataforma sirve a varios países, así que los importes van tal cual («100 al mes»). Decidido por Camilo.
- **Qué falta:** cuando se ponga símbolo de moneda por país, tomarlo de la configuración de la empresa destinataria, no fijarlo en la plantilla (`lib/planes/mensajes.ts`, sección «Correos del cambio de plan»).
- **Dueño:** Camilo.
