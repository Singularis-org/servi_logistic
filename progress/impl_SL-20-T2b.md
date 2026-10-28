# SL-20 — tanda 2b, parte backend (T1.8 + disponibilidad de T2.5)

Fecha: 2026-10-26 · backend_dev · worktree `.worktrees/SL-20-pais-geografia-configurable`.
Fuente: `progress/features/SL-20.md > Decisiones` 6 y 8; spec enmendado (R44–R47, R9).

## Tasks
- **T1.8 `[x]`**: migración `20261026120500_pais_disponible` + `down.sql`, `Pais.disponible` y los dos
  valores del enum en `db/schema.prisma`, `pais-disponible.test.ts` y el caso `120500` en la ida y vuelta.
- **T2.5 `[ ]` (parcial)**. Hecho: `PaisDTO.disponible`, `PaisDisponibleDTO`, `listar` con `disponible`,
  `listarDisponibles` (repo + service + composition root) y el rechazo de R45 en el alta. **Falta**
  (bloqueado por T2.4, fuente de la lista ISO, o fuera de lo pedido en esta tanda):
  - `crearPaisSchema` sin `nombre` + nombre del catálogo (R23) + R41 (`validation_error` en `id`);
  - `cambiarDisponibilidadPaisSchema`, `PaisRepository.cambiarDisponible` (fila
    `pais_disponibilidad_*` en la misma transacción) y `PaisService.cambiarDisponible` (R47).
    `cambiarDisponible` NO depende del catálogo, pero no entraba en «la parte de disponibilidad» pedida
    (listar + R45 + R46); se puede adelantar en otra tanda sin esperar a T2.4.

## Archivos
Nuevos:
- `db/migrations/20261026120500_pais_disponible/migration.sql` y `down.sql`
- `lib/actions/_shared/paises-plataforma.ts` (composition root, sin `"use server"`)
- `tests/integration/db/pais-disponible.test.ts`
- `tests/unit/actions/paises-plataforma.composition-root.test.ts`

Modificados:
- `db/schema.prisma` (`Pais.disponible Boolean @default(true)`; enum `pais_disponibilidad_activada`/`_desactivada`)
- `lib/types/pais.ts` (`PaisDTO.disponible`, `PaisDisponibleDTO`)
- `lib/interfaces/repositories/IPaisRepository.ts`, `lib/repositories/PaisRepository.ts` (`SELECT_PAIS` con
  `disponible`; `listarDisponibles()`)
- `lib/interfaces/services/IPaisService.ts`, `lib/services/PaisService.ts` (`listarDisponibles(actor)`)
- `lib/repositories/OrganizacionRepository.ts`, `lib/interfaces/repositories/IOrganizacionRepository.ts` (R45)
- `tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts` (seis migraciones; caso de aborto del down)
- `tests/integration/db/organizacion-alta.test.ts`, `tests/integration/db/pais-repositorio.test.ts`
- `tests/unit/services/pais-service.test.ts`, `tests/unit/services/organizacion-service.test.ts`
- `specs/SL-20-pais-geografia-configurable/tasks.md` (T1.8 `[x]`)

## Base `servi_logistic_sl20`
- `prisma migrate deploy` → aplicada `20261026120500_pais_disponible/migration.sql`.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma` → `No difference detected.`
- `prisma generate` → cliente regenerado.

## Notas de diseño
- El `down.sql` aborta con `RAISE` (P0001) si hay filas `pais_disponibilidad_*` en `historial_plataforma`;
  si no, recrea `historial_plataforma_accion` con la lista VIGENTE de `pg_enum` (acotada a `public`)
  menos los dos valores, y borra la columna. Va antes del down de `120400`.
- R45 se mira en la misma consulta previa a `pais` del alta (design §13): `!pais || !pais.disponible` →
  `invalida` `paisId`. La repetición de una empresa existente se decide antes (no mira disponibilidad).
- `listarDisponibles` filtra en el SQL (`where: { disponible: true }`) y devuelve solo `{ id, nombre }`.
  Sin `comoPlataforma`: `pais` es modelo de plataforma, `pais_lectura` lo deja leer y el superadmin
  no tiene empresa (la extensión lo deja «tal cual»), igual que `listTiposIdentificacion` en la misma página.

## Contrato para la UI (frontend_dev, T5.5)
En `app/(app)/plataforma/empresas/page.tsx`, dentro del `Promise.all` existente, tras `esPlataforma`:

```ts
import { listarPaisesDisponibles } from "@/lib/actions/_shared/paises-plataforma";
// actor: Actor (el de resolveActorFromSession, ya comprobado)
const paises = await listarPaisesDisponibles(actor);
// tipo: ListarPaisesDisponiblesServiceResult (lib/interfaces/services/IPaisService.ts)
//   | { status: "ok"; paises: PaisDisponibleDTO[] }   // PaisDisponibleDTO = { id: string; nombre: string } (lib/types/pais.ts)
//   | { status: "forbidden" }
```
- `id` es el código ISO alfa-2 (`"CR"`): es el **valor** que el `Select` manda como `paisId` a
  `altaEmpresaAction`. `nombre` es la etiqueta. Vienen ya ordenados por nombre; solo `disponible = true`.
- Prop sugerida para `EmpresasModule`: `paises={paises.status === "ok" ? paises.paises : []}` (nombre
  libre; lo decide el frontend). Sin preseleccionar (R9).
- La columna «País» de la tabla NO sale de aquí: sale del listado de empresas (`EmpresaPlataformaDTO`,
  T2.2), que trae el país de cada empresa aunque esté apagado (R9, R46).
- Un alta con un país apagado (p. ej. apagado entre la carga de la página y el envío) vuelve de
  `altaEmpresaAction` como `{ estado: "invalida", campo: "paisId" }`, igual que R6: la UI ya debe
  señalar el campo `paisId` en ese caso.

## Mapa R<n> → test
| R | Test |
|---|---|
| R3 (disponible) | `tests/integration/db/pais-disponible.test.ts` › «R3: una empresa no puede cambiar la disponibilidad…» |
| R9 (datos del `Select`) | `tests/integration/db/pais-repositorio.test.ts` › «R9/R45: listarDisponibles…»; `tests/unit/services/pais-service.test.ts` › «R9/R45 — los países que ofrece el alta…»; `tests/unit/actions/paises-plataforma.composition-root.test.ts` |
| R44 | `tests/integration/db/pais-disponible.test.ts` › «R44…»; `migracion-sl20-ida-y-vuelta.test.ts` › «R2/R5/R44…» (CR=true tras la ida) y «los seis down.sql…» (la vuelta borra la columna); `pais-repositorio.test.ts` › R23/R33 (`disponible: true` al nacer) |
| R45 | `tests/integration/db/organizacion-alta.test.ts` › «SL-20 R45/R46: con XA apagado…»; `tests/unit/services/organizacion-service.test.ts` (el desenlace `invalida` `paisId` del repositorio se devuelve tal cual); `pais-service.test.ts`/`pais-repositorio.test.ts` (un país apagado no se lista) |
| R46 | `tests/integration/db/pais-disponible.test.ts` › «R46: con XA apagado, su empresa sigue en XA, lee su geografía y crea una orden como servi_app»; `organizacion-alta.test.ts` (la empresa que ya estaba sigue en XA y su repetición es `ya_existe`) |
| R47 (solo base) | `tests/integration/db/pais-disponible.test.ts` › «R47 (base): el historial acepta…»; down aborta con fila: `migracion-sl20-ida-y-vuelta.test.ts` › «con una fila pais_disponibilidad_*…». **El servicio de R47 falta** (ver T2.5). |
| R23, R40, R41 | Pendientes (T2.4 bloqueada). |

## Salida real
Tests (`DATABASE_URL` → `servi_logistic_sl20`):
```
pnpm exec vitest run tests/integration/db/pais-disponible.test.ts tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts
  tests/integration/db/pais-tabla.test.ts tests/integration/db/pais-repositorio.test.ts tests/integration/db/organizacion-alta.test.ts
  tests/integration/db/empresas-plataforma.test.ts tests/unit/services/pais-service.test.ts
  tests/unit/services/organizacion-service.test.ts tests/unit/actions/paises-plataforma.composition-root.test.ts
 Test Files  9 passed (9)
      Tests  106 passed (106)
```
Guardias (por archivo, las que tocan migraciones, `lib/actions`, el historial y el esquema):
```
catalogo-postgres-acota-esquema, rls-por-empresa, organizacion-en-modelos, historico-sin-migracion,
plataforma-solo-en-lista, use-server-sin-reexport-de-tipos, historial-accion-escrituras-cubiertas,
fuera-datos-ordenex, backfills-retirados, fk-misma-empresa, superadmin-fuera-de-empresa,
quitador-comentarios, guard-tests-de-arbol-en-el-gate
 Test Files  13 passed (13)      Tests  254 passed (254)
asistente-sin-persistencia, ayuda-columna-retirada, caja-173-alcance, censo-order-status-rename, censo-simpe,
cierre-sin-gestion-sin-dinero, confirmacion-sin-lectores, corregir-datos-sin-rastro, gestion-aprobada-retirada,
historial-accion-forma-tabla, liquidacion-alcance, mi-wallet-335, no-embalaje, nota-privada-retirada,
pagos-frontera, plantilla-gasto-fijo-borrado, ranking-ventana-dia, rastreo-sin-ruta-nueva,
tarifa-status-retirado, guard-dependencias-aprobadas
 Test Files  20 passed (20)      Tests  252 passed (252)
```
Lint (`pnpm exec eslint` sobre los 15 archivos .ts tocados): sin salida, 0 problemas.
Typecheck: NO corrido (lo corre el leader; sigue rojo por la UI hasta T5.5).

## Preguntas abiertas (no las decido yo)
- **Repetición de una empresa existente cuyo país está apagado** (`requirements.md > Preguntas abiertas`):
  el código sigue la propuesta («R45 solo frena altas nuevas»: misma alta → `ya_existe`). El test de
  `organizacion-alta` lo fija; si el humano decide otra cosa, cambia ese caso y `altaEnTransaccion`.
- **¿Un país nuevo nace disponible?** El `DEFAULT true` aplica R44 tal cual; queda abierta en el spec.
- **Fuente de la lista ISO 3166-1** (T2.4): sigue bloqueando R23 (nombre del catálogo), R40 y R41.

Veredicto: T1.8 cerrada y verde; T2.5 parcial (listar disponibles + R45 + R46 hechos; catálogo y `cambiarDisponible`/R47 de servicio pendientes).
