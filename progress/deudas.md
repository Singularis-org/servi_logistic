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
- **Qué falta:** pasar la edición al superadmin (SL-26), dejar las pantallas del maestro en solo lectura con su mensaje, y decidir dónde vive la marca de zona especial (¿`zona_distrito` de la empresa?).
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

### D15 — La geografía del superadmin choca con el aislamiento por empresa (P7 de SL-32)
- **Origen:** SL-32 (2026-10-22), P7. Con SL-17, `renombrar` y `cambiarActivacion` de `GeografiaService` escriben `historial_accion`, y `contarOrdenesSinEntregar` lee `orden`. Las dos son tablas de negocio, y el superadmin no tiene empresa: esas operaciones fallan con `EmpresaNoResuelta`.
- **Qué falta:** decidir qué empresa lleva el registro de una acción de plataforma, o dónde se registra, y si el conteo cubre todas las empresas. Carlos aceptó diferirlo: nadie gestiona la geografía desde la interfaz hasta SL-26, que trae la pantalla de geografía de plataforma. Hasta entonces SL-32 prueba la rama del superadmin solo con dobles.
- **Dueño:** quien tome SL-26 (decide Carlos Restrepo).
