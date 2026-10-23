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

### D7 — ¿Quién retira una provincia: la empresa o la plataforma?
- **Origen:** SL-16 (2026-10-22), review H4. La ayuda dice que lo hace la empresa, siguiendo el código de SL-15; `docs/plan-saas.md` decisión 5 apunta a la plataforma.
- **Qué falta:** decisión de Carlos. Mientras tanto queda «la empresa», como en el código.
- **Dueño:** Carlos Restrepo.

### D8 — La suite de integración necesita datos que la app vacía ya no siembra
- **Origen:** SL-11 (app vacía), medido en el gate completo de `dev` tras SL-16 (2026-10-22): 245 archivos de `tests/integration/` en `tests/baseline-rojos.json`, todos por base sin órdenes, usuarios ni zonas.
- **Qué falta:** SL-31 (tests con datos propios y CI migrada); al cerrarla, el baseline vuelve a su única entrada de SL-29.
- **Dueño:** quien tome SL-31.

### D9 — Docs del perfil que nombran la app de origen
- **Origen:** verificación previa al push (2026-10-22). `docs/architecture.md`, `checkpoints-proyecto.md`, `dependencias.md`, `limpieza-ordenex.md`, `perfil-agentes.md`, `plan-saas.md` y `verification.md` la nombran para fijar reglas e historia, no como marca de la app.
- **Qué falta:** decidir con SL-27 si se reescriben como «la app de origen» o se archivan.
- **Dueño:** quien tome SL-27.

### D10 — Excepciones de plataforma que absorbe SL-36
- **Origen:** SL-17 (2026-10-23). El webhook de WhatsApp (`app/api/webhooks/whatsapp/route.ts`) corre en `comoPlataforma("SL-36", …)` y la sincronización de plantillas usa credenciales globales: dos empresas comparten número y plantillas de Meta.
- **Qué falta:** credenciales de API por empresa y quitar la excepción de `lib/db/excepciones-aislamiento.ts`.
- **Dueño:** quien tome SL-36.

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
  - `PushSuscripcionRepository.registrar` hace upsert por `endpoint` global: un dispositivo que pasa de una empresa a otra choca (P2002) y la primera sigue enviándole push;
  - código que quedó sin uso tras retirar los conteos públicos: `WHERE_*_DISPONIBLE` (`lib/repositories/_shared/geografia-activa.ts`) y `lib/utils/cifra-aproximada.ts`.
- **Dueño:** SL-18/SL-19 (push y únicos), Carlos Restrepo (el resto, ficha propia).

### D15 — Deadlock 40P01 entre el R34 de `cobro-tienda-461-completar-migration` y los tests de concurrencia de la caja
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
