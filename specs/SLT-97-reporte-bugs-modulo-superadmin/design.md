# SLT-97 — Reporte de bugs: módulo del superadmin · design.md

> Entrega 2 de 3. Construye sobre la tabla `bug_report` y `BugReportRepository` de SLT-87 «Reporte de
> bugs: botón flotante y envío». SLT-98 «Reporte de bugs: imágenes» añadirá su bloque al detalle de aquí.

## Lo que ya existe

**Búsqueda.** El 2026-11-09 se buscó `bug_report`, `BugReport`, «nota interna», «reporte de bug» y
«bug» en `feature_list.json` (todos los estados), en `specs/` y en el código. El grafo no tiene índice
para este worktree, así que se buscó con Grep y Read. Solo aparecieron SLT-87 «Reporte de bugs: botón
flotante y envío» (la base, ya en `dev`) y SLT-98 «Reporte de bugs: imágenes» (la que sigue). No existe
ningún listado, estado ni historial de reportes.

**Lo que se reutiliza:**

| Pieza | Dónde | Uso aquí |
|---|---|---|
| Tabla `bug_report` y sus índices `(created_at DESC, id)` y `(organization_id, created_at DESC)` | `db/migrations/20261110120000_bug_report` | El listado y el filtro de empresa; se le añade `status` (§2.1). |
| `BugReportRepository` en `comoPlataforma`, ya en `EXCEPCIONES_DE_PLATAFORMA` | `lib/repositories/BugReportRepository.ts` | Se le añaden las lecturas y el cambio de estado (§5). Solo cambia el motivo de la excepción. |
| Puerta del superadmin | `lib/auth/exigir-superadmin.ts` (`exigirSuperadmin`), `lib/auth/plataforma.ts` (`esPlataforma`, `ROLES_PLATAFORMA`) | La action y el servicio (§3). |
| Patrón de página de plataforma | `app/(app)/plataforma/vehiculos/page.tsx` (SL-42) | `notFound()` antes de leer y la action llamada desde el Server Component. |
| Patrón de borde de plataforma | `lib/actions/vehiculos-plataforma.ts` | Sesión → `exigirSuperadmin` → zod → servicio, con `deps` inyectables y log solo con el nombre de la causa. |
| Ítem de menú de plataforma | «Vehículos» en `lib/auth/menu-visibility.ts` | `roles: ROLES_PLATAFORMA` por identidad, sin subítems (§8). |
| Listado de empresas del superadmin | `lib/actions/_shared/empresas-plataforma.ts` (`listarEmpresasPlataforma`) | Las opciones del filtro de empresa (R8). |
| Rastro inmutable de plataforma | `vehiculo_rastro` (`registrar-rastro-vehiculo.ts`), `plan_rastro` | El molde de la tabla del historial: actor congelado y opaco, sin `updated_at` (§2.2). |
| Trigger de inmutabilidad | `cobro_plataforma_traza_inmutable` (`20261109120000`, `SL085`) | El molde de los dos triggers de §2.3. |
| Etiqueta del rol | `lib/auth/rol-label.ts` (`ROL_LABELS`) | La columna Rol y el contexto. |
| Fecha en UTC con su etiqueta | Decisión del humano tras SLT-42 (`PlanesService.fechaDelCatalogo`) y el correo de SLT-87 | Las fechas del módulo (§7). |
| Primitivas | `components/ui/{table,select,input,label,badge,textarea,button,card}.tsx`, `components/shared/{Pagination,EmptyState,AppPage}.tsx` | Las dos pantallas; no se crea ninguna primitiva. |
| E2E | `e2e/reporte-de-bugs.spec.ts`, `e2e/_superadmin-fixture.ts` (`asegurarSuperadmin`, `conCandadoDelSuperadmin`, `entrarConOtp`) | El E2E se amplía (§10). |

**Lo que NO se reutiliza, y por qué:**
- **`historial_plataforma` (SL-20).** Exige `pais_id NOT NULL` con FK a `pais` y sus enums de acción y
  entidad son de geografía. Un reporte no tiene país, y habría que ampliar dos enums y hacer opcional una
  FK que hoy protege la geografía. Ver la alternativa A (§11).
- **`historial_accion`.** Es por empresa, con política `<t>_por_empresa`: la empresa leería los cambios
  de estado de sus reportes, y eso rompe «Visibilidad» (R3, R4).
- **`ReporteBugService` de SLT-87.** Es la puerta de empresa del envío (rechaza al superadmin) y carga el
  emisor de correo. El módulo del superadmin tiene la puerta contraria y no envía correo (R4): va en un
  servicio aparte (§4).

## 1. Resumen del flujo

```
/plataforma/reportes (Server Component)
  │ actor ← sesión; si no es superadmin → notFound()  (R2)
  │ filtros ← searchParams (estado, empresa, desde, hasta, pagina)
  │ listarReportesBugAction(filtros) + listarEmpresasPlataforma(actor)  en paralelo
  ▼
ReportesModule (cliente): barra de filtros → router.push(?…) ; tabla ; Pagination ; EmptyState

/plataforma/reportes/[reporteId] (Server Component)
  │ notFound() si no es superadmin, si el id no es uuid o si el reporte no está  (R2, R15)
  │ verReporteBugAction({ reporteId })
  ▼
ReporteDetalle (cliente): descripción, contexto, estado, formulario de cambio, historial
  │ «Cambiar estado» → cambiarEstadoReporteBugAction({ reporteId, estado, nota })
  ▼
lib/actions/reportes-bug-plataforma.ts   sesión → exigirSuperadmin → zod → servicio
  ▼
ReportesBugPlataformaService             puerta (esPlataforma) → reglas de transición (R17, R18)
  ▼
BugReportRepository (comoPlataforma)     $transaction: lee estado → UPDATE condicionado → INSERT historial
  ▼
Base: trigger «solo hacia adelante» en bug_report; trigger de inmutabilidad en el historial (SL097)
```

## 2. Modelo de datos

Identificadores en inglés, como `bug_report` (decisión «Borrado e identificadores» y Q5 de SLT-87). Las
dos tablas son de plataforma: sin `organizacion_id` que las reparta, sin políticas y con `REVOKE ALL` a
`servi_app`. No hay datos que dependan del país.

### 2.1 Estado en `bug_report`

- **Enum `bug_report_status`:** `'new'`, `'in_review'`, `'resolved'`, `'dismissed'`. En Prisma,
  `enum BugReportStatus { new in_review resolved dismissed @@map("bug_report_status") }`.
- **Columna:** `"status" "bug_report_status" NOT NULL DEFAULT 'new'`. El `DEFAULT` deja en «Nuevo» los
  reportes que ya existen y los que crea `BugReportRepository.crear`, que no cambia (R16).
- **Índice:** `(status, created_at DESC, id)`. El filtro por defecto («Pendientes») siempre filtra por
  estado; los dos índices de SLT-87 siguen sirviendo para «Todos» y para el filtro de empresa.
- `updated_at` lo mueve Prisma (`@updatedAt`) en cada cambio de estado.

**Por qué un enum y no `TEXT` con `CHECK`:** es lo que usa el repo para todo estado (`order_status`,
`plan_rastro_accion`…), y Prisma da el tipo cerrado a TypeScript sin una lista paralela.

### 2.2 Tabla `bug_report_status_change` (el historial)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `TEXT` PK | uuid de Prisma. |
| `bug_report_id` | `TEXT NOT NULL` FK → `bug_report(id)` `ON DELETE CASCADE` | El historial muere con su reporte (borrado de empresas demo, SL-43). |
| `from_status` | `bug_report_status NOT NULL` | Estado de antes (R21). |
| `to_status` | `bug_report_status NOT NULL` | Estado de después. `CHECK (from_status <> to_status)`. |
| `note` | `TEXT NULL` | `NULL` = sin nota. `CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 500)`, el mismo 500 que `NOTA_MAX` (§6), con un comentario que cita el archivo. |
| `actor_user_id` | `TEXT NOT NULL` | Opaco y **sin FK**, como en `plan_rastro` y `vehiculo_rastro`: la autoría sobrevive a la cuenta, y no hay que sumar la relación al censo `tests/fixtures/api-key-dependencias-usuario.ts`. |
| `actor_name` | `VARCHAR(120) NOT NULL` | Nombre congelado del superadmin (120, como `actor_nombre` en los rastros). |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | Cuándo (R21). |

- **Sin `updated_at` ni `deleted_at`, a propósito:** la fila es inmutable (R23), como `historial_accion`
  y los rastros. Por eso no entra en el censo de `updated_at` de `schema-drift-saneamiento.test.ts`.
- **Índice:** `(bug_report_id, created_at DESC, id)`, que es el orden del historial en el detalle (R22).
- **Prisma:** el modelo es `BugReportStatusChange` (`@@map("bug_report_status_change")`), con la relación
  `bugReport BugReport` y el inverso `statusChanges BugReportStatusChange[]` en `BugReport`.
- **Clasificación:** `{ modelo: "BugReportStatusChange", tabla: "bug_report_status_change" }` en
  `MODELOS_DE_PLATAFORMA` (`lib/db/modelos-de-negocio.ts`), con el comentario «sin acceso para
  `servi_app`; lo escribe el servidor en plataforma (SLT-97)».

### 2.3 Las dos redes de la base (R18, R23)

Las dos lanzan `SQLSTATE 'SL097'` y valen para cualquier rol, también para el dueño, como
`cobro_plataforma_traza_inmutable` (`SL085`).

**1. `bug_report_status_solo_adelante`, `BEFORE UPDATE OF "status" ON "bug_report"`:**

```sql
CREATE FUNCTION bug_report_status_solo_adelante() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (
       (OLD."status" = 'new'       AND NEW."status" IN ('in_review', 'resolved', 'dismissed'))
    OR (OLD."status" = 'in_review' AND NEW."status" IN ('resolved', 'dismissed'))
  ) THEN
    RAISE EXCEPTION 'el estado de un reporte solo avanza (bug_report %: % -> %)', OLD."id", OLD."status", NEW."status"
      USING ERRCODE = 'SL097';
  END IF;
  RETURN NEW;
END $$;
```

Un `UPDATE` que deja el mismo estado también se rechaza con `SL097` (decisión del humano del 2026-11-10,
m1 de la revisión: R18 pide que la base rechace «al mismo estado»). El trigger solo salta si el `UPDATE`
nombra `status`: un `UPDATE` de `deleted_at` o `description` no lo dispara, pero `SET status = status, …`
sí. El servicio nunca manda un paso al mismo estado: lo rechaza antes como `transicion_invalida` (§4).

**2. `bug_report_status_change_inmutable`, `BEFORE UPDATE OR DELETE ON "bug_report_status_change"`:**

```sql
CREATE FUNCTION bug_report_status_change_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- El borrado en cascada desde `bug_report` llega por el trigger de la FK (profundidad > 1) y pasa:
  -- es el borrado de las empresas demo. Un DELETE directo (profundidad 1) no.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'el historial de un reporte no se cambia ni se borra (bug_report_status_change %)', OLD."id"
    USING ERRCODE = 'SL097';
END $$;
```

El caso de la cascada lo prueba el test de integración: borrar un `bug_report` como dueño se lleva su
historial, y un `DELETE` directo da `SL097` (R23).

### 2.4 Acceso (R3)

```sql
ALTER TABLE "bug_report_status_change" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "bug_report_status_change" FROM servi_app;
```

`ALTER DEFAULT PRIVILEGES` le daría CRUD a `servi_app`: por eso el `REVOKE`. La columna nueva de
`bug_report` hereda el `REVOKE ALL` de SLT-87. Las funciones de los triggers no se pueden llamar fuera de
un trigger: no hace falta revocar `EXECUTE`.

### 2.5 Migración

`db/migrations/20261111120000_bug_report_status/`, con un timestamp posterior a la última migración de
`dev` al crearla, escrita a mano como las demás (P3006 de `db:migrate:create`).

- **`migration.sql`:**
  1. el enum;
  2. la columna con `DEFAULT 'new'` y el índice;
  3. la tabla del historial, sus `CHECK`, la FK y el índice;
  4. las dos funciones y sus triggers;
  5. la RLS y el `REVOKE`.
- **`down.sql`:** en orden inverso: `DROP TABLE IF EXISTS "bug_report_status_change"` (se lleva su
  trigger); `DROP TRIGGER` y `DROP FUNCTION` de `bug_report_status_solo_adelante`; `DROP FUNCTION
  bug_report_status_change_inmutable`; `DROP INDEX`; `ALTER TABLE "bug_report" DROP COLUMN "status"`;
  `DROP TYPE "bug_report_status"`. Bajar pierde el estado y el historial: es lo esperado de un down.

Dispara `gate.disparadores` (esquema y migraciones): corren en local los tests de migración y
`verificar-rls`.

## 3. Autorización (dónde se valida)

| Capa | Qué comprueba | Requisito |
|---|---|---|
| Menú (`lib/auth/menu-visibility.ts`) | El ítem «Reportes» con `roles: ROLES_PLATAFORMA`, por identidad. Es presentación, no permiso. | R1, R2 |
| Páginas (`page.tsx` del listado y del detalle) | `!actor \|\| !esPlataforma(actor.rol)` → `notFound()` **antes** de la primera lectura. El test afirma que la action no se llamó. | R2 |
| Action (`lib/actions/reportes-bug-plataforma.ts`) | Sin sesión → `unauthenticated`; `!exigirSuperadmin(actor)` → `forbidden`. Antes del zod: a un rol de empresa no se le cuenta el contrato. | R2 |
| Servicio (`ReportesBugPlataformaService`) | `esPlataforma(actor.rol)` otra vez → `forbidden`. La puerta de la action es la primera, no la única. | R2 |
| Repositorio | Todo en `comoPlataforma`. | R3 |
| Base | `REVOKE ALL` y RLS sin políticas en las dos tablas; los dos triggers `SL097`. | R3, R18, R23 |

**Módulos (SL-23).** Todo es `nucleo` en `lib/modulos/reparto.ts`, como el resto de `/plataforma`:
- rutas `"/plataforma/reportes"` y `"/plataforma/reportes/[reporteId]"`;
- action `"reportes-bug-plataforma"`.

El superadmin no tiene empresa, así que la puerta de módulo no aplica.

## 4. Servicio `ReportesBugPlataformaService`

`lib/services/ReportesBugPlataformaService.ts` implementa `IReportesBugPlataformaService`
(`lib/interfaces/services/IReportesBugPlataformaService.ts`). Recibe por constructor `repo:
IBugReportRepository`. No tiene emisor de correo ni cola: no hay forma de avisar a nadie (R4).

**Reglas de transición**, en `lib/types/reporte-bug.ts`, como datos y no como lógica repartida:

```ts
export const TRANSICIONES_REPORTE: Readonly<Record<BugReportStatus, readonly BugReportStatus[]>> = {
  new: ["in_review", "resolved", "dismissed"],
  in_review: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
};
export const ESTADOS_PENDIENTES = ["new", "in_review"] as const;
```

La tabla del trigger (§2.3) es la misma escrita en SQL. Un test de integración recorre los 16 pares
(origen × destino) contra la base y contra `TRANSICIONES_REPORTE`, y deben coincidir.

**Métodos:**
- **`listar(actor, filtros: FiltrosReportes)`** → `{ status: "ok", items, total, pagina } | forbidden`.
  - Pasa de `estado` a la lista de estados: `pendientes` → `ESTADOS_PENDIENTES`, `todos` → sin filtro y
    un estado → `[estado]`.
  - Pasa las fechas a `[desdeUtc, hastaUtcExclusivo)` (§7).
  - Pide al repositorio el `total` y, con él, recorta la página a `[1, max(1, ceil(total / 25))]` (R11).
- **`detalle(actor, reporteId)`** → `{ status: "ok", reporte, historial } | { status: "not_found" } |
  forbidden`.
- **`cambiarEstado(actor, { reporteId, estado, nota })`** → `{ status: "ok", estado } | { status:
  "transicion_invalida", actual } | { status: "not_found" } | forbidden`.
  1. `nota` ya llega recortada por el zod; `""` pasa a `null` (R20).
  2. `repo.cambiarEstado(...)` hace la lectura, la comprobación con `TRANSICIONES_REPORTE` y la
     escritura dentro de una transacción (§5), y devuelve uno de los tres resultados.

  El servicio no lee y luego escribe por su cuenta: esa ventana dejaría pasar dos cambios a la vez.

## 5. Repositorio `BugReportRepository` (se amplía)

`IBugReportRepository` gana tres métodos. `crear` no cambia. Todo va dentro de
`comoPlataforma("SL-17", MOTIVO_*, …)`, con la ficha de SLT-87 por la deuda D29 (`FichaJira` no admite
`SLT`).

- **`listar({ estados, organizationId, desde, hastaExclusivo, pagina, tamano })`**, en una `$transaction`
  con `count` y `findMany`:
  - `where`: `deletedAt: null` (R13), `status: { in }` si hay estados, `organizationId` si hay empresa y
    `createdAt: { gte, lt }` si hay fechas;
  - `orderBy: [{ createdAt: "desc" }, { id: "asc" }]`, que coincide con el índice de SLT-87, y
    `skip`/`take`;
  - `select`: `id`, `createdAt`, `status`, `reporterName`, `reporterRole`, `organization.nombre` y
    `description`. La descripción se recorta a 120 en el DTO (`resumen`), así el cliente no recibe el
    texto entero de 25 filas.
- **`detalle(id)`**: `findFirst({ where: { id, deletedAt: null } })` con `organization.nombre`,
  `reporter.email` y `statusChanges` ordenados por `[{ createdAt: "desc" }, { id: "desc" }]`. Devuelve
  `null` si no está (R15).
- **`cambiarEstado({ reporteId, destino, nota, actorUsuarioId })`**, en una `$transaction`:
  1. `bugReport.findFirst({ where: { id, deletedAt: null }, select: { status } })`. Si no está →
     `{ resultado: "not_found" }`.
  2. Si `destino` no está en `TRANSICIONES_REPORTE[actual]` → `{ resultado: "transicion_invalida",
     actual }`.
  3. `bugReport.updateMany({ where: { id, status: actual, deletedAt: null }, data: { status: destino } })`.
     Si `count === 0`, otra pestaña lo cambió entre medias: se vuelve a leer y se responde
     `transicion_invalida` con el estado nuevo. Es un `UPDATE` condicionado, sin cerrojo explícito.
  4. Lee el nombre del actor con `usuario.findUnique({ where: { id: actorUsuarioId }, select:
     NOMBRE_USUARIO_SELECT })` y lo recorta a 120 con `nombreCompletoUsuario`. Si no está (no debería),
     usa «Superadmin».
  5. `bugReportStatusChange.create({ from_status: actual, to_status: destino, note, actorUserId,
     actorName })`.

  Si el paso 5 falla, la transacción deshace el 3 (R21). El repositorio no tiene ningún `update` ni
  `delete` sobre `bugReportStatusChange` (R23).

**`EXCEPCIONES_DE_PLATAFORMA`.** La entrada de `BugReportRepository.ts` sigue con su ficha, y el motivo
pasa a: «SLT-87 y SLT-97: guardar un reporte de problema y, para el superadmin, leerlos y cambiar su
estado con su historial, en tablas de plataforma que la empresa no puede leer ni escribir (R13, R14 de
SLT-87; R3 de SLT-97)».

## 6. Contratos (zod y DTO)

En `lib/types/reporte-bug.ts`, junto a lo de SLT-87:

```ts
export const NOTA_MAX = 500;                 // P3; el CHECK de §2.2 usa el mismo número
export const REPORTES_POR_PAGINA = 25;       // P4
export const RESUMEN_MAX = 120;              // R6

export const filtroEstadoReporteSchema = z.enum(["pendientes", "todos", "new", "in_review", "resolved", "dismissed"]);
const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(esFechaReal);   // 2026-02-30 no pasa

export const filtrosReportesSchema = z.object({
  estado: filtroEstadoReporteSchema.default("pendientes"),
  empresa: z.string().uuid().optional(),
  desde: fechaDia.optional(),
  hasta: fechaDia.optional(),
  pagina: z.coerce.number().int().catch(1).default(1),   // R11: no numérico → 1; el servicio recorta
}).strict().refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, { path: ["hasta"] });

export const verReporteSchema = z.object({ reporteId: z.string().uuid() }).strict();

export const cambiarEstadoReporteSchema = z.object({
  reporteId: z.string().uuid(),
  estado: z.enum(["in_review", "resolved", "dismissed"]),   // «new» nunca es destino
  nota: z.string().trim().max(NOTA_MAX).optional().default(""),
}).strict();
```

- **La página** pasa los `searchParams` a la action: solo las claves conocidas, la primera si vienen
  repetidas, y las vacías se omiten. Un `estado` desconocido es `validation_error`, igual que unas fechas
  invertidas o inválidas (R9).
- **La nota:** `.trim()` va antes de `.max`, así que 500 letras con espacios alrededor pasan. El
  `CHECK` mide sobre `btrim`, con el mismo criterio.
- **DTO:**
  - `ReporteFilaDTO`: `{ id, creadoEn: string ISO, estado, empresa, usuario, rol, resumen }`.
  - `ReporteDetalleDTO`: los campos de R14, más `estado` y `destinosPermitidos: BugReportStatus[]`
    (`TRANSICIONES_REPORTE[estado]`), calculados en el servidor.
  - `CambioEstadoDTO`: `{ id, desde, hacia, nota: string | null, actor, creadoEn }`.

  Las fechas cruzan como `string` ISO, porque el borde RSC no serializa `Date` de forma fiable entre
  versiones.

## 7. Fechas (UTC)

- **Qué se muestra:** fecha y hora como `AAAA-MM-DD HH:mm UTC`, igual que el correo de SLT-87 y que la
  decisión del humano tras SLT-42 para las pantallas del superadmin («la etiqueta «UTC» para que nadie la
  lea como hora local»).
- **Por qué no la hora de Costa Rica:** `pais-sin-literales` impide fijar la zona de CR en el servidor,
  y los reportes vienen de empresas de cualquier país.
- **El formateo:** una función pura `fechaUtc(iso)` en `reportes-textos.ts`, con `getUTC*`. No usa
  `Intl` con zona, que en jsdom y en Node puede variar.
- **El filtro (R9):** `desde = AAAA-MM-DDT00:00:00.000Z`; `hastaExclusivo` = el día siguiente a
  `hasta`, a las `00:00:00.000Z`. Se cuenta con `Date.UTC`, sin depender de la zona del proceso.
- **Datos que dependen del país:** ninguno. No hay moneda, geografía, impuestos ni métodos de pago.

## 8. Interfaz

### 8.1 Menú

En `SIDEBAR_ITEMS`, justo después de «Vehículos» y antes de «Mi bodega»:

```ts
{ label: "Reportes", href: "/plataforma/reportes", iconKey: "bug", roles: ROLES_PLATAFORMA }
```

- **Icono:** `IconKey` gana `"bug"`, que en `app/(app)/_components/Sidebar.tsx` resuelve a `Bug` de
  `lucide-react` (ya instalada). Es un icono propio, por el criterio escrito en `IconKey`: no se reutiliza
  el de otra sección.
- **Lo que cambia en los tests del menú:**
  - el superadmin ve `["Empresas", "Planes", "Geografía", "Vehículos", "Reportes"]` y sigue aterrizando
    en «Empresas» (R1);
  - `pwa-manifiesto-atajos`: `superadmin` pasa de 4 a 5 destinos y nadie más se mueve;
  - `superadmin-fuera-de-empresa`: `"/plataforma/reportes"` entra en `HREFS_ITEMS_PLATAFORMA`;
  - `Sidebar.test.tsx`: `"bug"` entra en `TODAS_LAS_CLAVES`;
  - `e2e/superadmin-arranque.spec.ts`: la lista de enlaces del menú.

### 8.2 Listado: `app/(app)/plataforma/reportes/page.tsx` (Server Component)

```ts
export default async function ReportesPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
  deps: ReportesPageDeps = {},   // getActor, listar, listarEmpresas: para el test, como HistorialAccionesPage
)
```

1. Resuelve el actor; si no es de plataforma, `notFound()` sin llamar a nada (R2).
2. Lee los `searchParams`. Con `Promise.all` llama a `listarReportesBugAction(filtros)` y a
   `listarEmpresasPlataforma(actor)`.
3. Pinta `<AppPage title="Reportes" description=…>` con `<ReportesModule>`. Le pasa:
   - `filtros`, los efectivos, con `pagina` ya recortada por el servicio;
   - `resultado`: `ok`, `validation_error` o `error`;
   - `empresas`: `{ id, nombre }[]` ordenadas por nombre; si no se pudieron leer, `[]`, y el filtro
     queda con solo «Todas las empresas».

**`ReportesModule` (cliente)**, en `_components/ReportesModule.tsx`:
- **Barra de filtros:**
  - `Select` de estado (R7) y `Select` de empresa (R8);
  - dos `Input type="date"` con su `Label`, «Desde» y «Hasta» (R9);
  - el botón «Limpiar filtros», que vuelve a los de por defecto.
- **Cada cambio** hace `router.push("/plataforma/reportes?" + params)`. Quita la `pagina`, que es volver
  a la 1, y quita los valores por defecto, de modo que la URL por defecto es limpia (R10).
- **Tabla** (`components/ui/table`) con las columnas de R6:
  - el estado va como `Badge`;
  - la fila entera es un enlace a `/plataforma/reportes/<id>`, con un `Link` en la primera celda que
    cubre la fila, como en `PlanesModule`.
- **`Pagination`** con `page`, `pageSize = 25` y `total`, sin selector de tamaño. `onPageChange` hace
  `router.push` con `pagina` (R11).
- **Vacío** (R12): `EmptyState` con el título de §9. Elige el texto con `esFiltroPorDefecto(filtros)`.
- **Fallos:**
  - un `validation_error` muestra el aviso de fechas (R9) con `role="alert"` y no pinta la tabla;
  - un `error` muestra el aviso de carga (R12) con `role="alert"` y no pinta el `EmptyState`.

### 8.3 Detalle: `app/(app)/plataforma/reportes/[reporteId]/page.tsx` (Server Component)

1. `notFound()` si no hay superadmin (R2).
2. `verReporteBugAction({ reporteId })`. Con `validation_error` (id que no es uuid) o `not_found`, también
   `notFound()` (R15).
3. Pinta `<AppPage title="Reporte">` con un enlace «Volver a reportes» y `<ReporteDetalle reporte=…
   cambiarEstado={cambiarEstadoReporteBugAction} />`.

**`ReporteDetalle` (cliente)**, en `[reporteId]/_components/ReporteDetalle.tsx`, en tres `Card`:
- **Descripción** (R14): el texto en un `<p className="whitespace-pre-wrap break-words">`. React lo
  escapa, y no hay `dangerouslySetInnerHTML`.
- **Contexto** (R14): una lista `dl` con los rótulos de §9. El dispositivo usa el mismo formato que el
  correo de SLT-87: «390 × 844 · app instalada: sí» o «Sin datos».
- **Estado** (R17–R20):
  - **abierto:** el `Badge` del estado actual; un `Select` «Nuevo estado» con solo
    `destinosPermitidos`; un `Textarea` «Nota interna (opcional)» con `maxLength={NOTA_MAX}` y el
    contador «{n}/500» (`aria-live="polite"`), contado con `.length` como en SLT-87; y el botón «Cambiar
    estado», deshabilitado sin destino elegido o mientras se envía;
  - **cerrado** (`destinosPermitidos` vacío): solo el `Badge` y el texto de reporte cerrado (R19), sin
    `Select`, `Textarea` ni botón.
- **Al responder la action:**
  - `ok` → «Estado actualizado.», vacía la nota y el destino, y llama a `router.refresh()`, que trae el
    estado y el historial nuevos;
  - `transicion_invalida` → el aviso de §9 con el estado `actual` (R18), y `router.refresh()`;
  - `validation_error`, `forbidden`, `not_found` o `error` → «No se pudo cambiar el estado. Inténtalo de
    nuevo.», con la nota intacta.
- **Historial** (R22): lista ordenada, del más reciente al más antiguo. Cada entrada lleva:
  - «{desde} → {hacia}»;
  - la línea «{actor} · {fecha UTC}»;
  - la nota en `whitespace-pre-wrap`, o «Sin nota».

  Sin entradas, el texto de historial vacío. No hay botón de editar ni de borrar (R23).

## 9. Textos

Viven como constantes en `app/(app)/plataforma/reportes/_components/reportes-textos.ts` (las dos
pantallas los importan), y los tests los comparan literalmente.

| Dónde | Texto exacto |
|---|---|
| Ítem del menú y título del listado | «Reportes» |
| Descripción del listado (`AppPage`) | «Problemas que reportan los usuarios de las empresas. Solo los ve la plataforma.» |
| Etiquetas de estado | `new` «Nuevo» · `in_review` «En revisión» · `resolved` «Resuelto» · `dismissed` «Descartado» |
| Filtro de estado: rótulo y opciones | «Estado»: «Pendientes», «Todos», «Nuevo», «En revisión», «Resuelto», «Descartado» |
| Filtro de empresa: rótulo y primera opción | «Empresa»: «Todas las empresas» |
| Filtro de fechas | «Desde», «Hasta» |
| Botón de filtros | «Limpiar filtros» |
| Columnas | «Fecha», «Empresa», «Usuario», «Rol», «Descripción», «Estado» |
| Resumen de la descripción | Las primeras 120 letras; si se cortó, termina en «…» |
| Fecha (lista, contexto e historial) | «AAAA-MM-DD HH:mm UTC», p. ej. «2026-11-09 14:05 UTC» |
| Nombre accesible del enlace de cada fila (decisión del humano del 2026-11-10, m3 de la revisión) | «Ver reporte de {empresa} del {fecha}», con la fecha en «AAAA-MM-DD HH:mm UTC», p. ej. «Ver reporte de Envíos Rápidos del 2026-11-09 14:05 UTC» |
| Paginación | La de `Pagination`: «1-25 de 60»; `ariaLabel` «Paginación de reportes» |
| Vacío con los filtros por defecto (R12) | «No hay reportes pendientes.» |
| Vacío con otros filtros (R12) | «Ningún reporte coincide con los filtros.» |
| Fallo de carga (R12) | «No se pudo cargar el listado de reportes.» |
| Fechas inválidas o invertidas (R9) | «Revisa las fechas: «Desde» no puede ser posterior a «Hasta».» |
| Título del detalle y enlace de vuelta | «Reporte» · «Volver a reportes» |
| Bloques del detalle | «Descripción», «Contexto», «Estado», «Historial» |
| Rótulos del contexto | «Empresa», «Usuario», «Correo», «Rol», «Página», «Navegador», «Dispositivo», «Fecha», «Reporte» |
| Dispositivo | «{ancho} × {alto} · app instalada: sí» / «… no»; sin ventana, «Sin datos» |
| Formulario de estado | «Nuevo estado», «Nota interna (opcional)», contador «{n}/500», botón «Cambiar estado» |
| Éxito | «Estado actualizado.» |
| Transición inválida (R18) | «Este reporte ya está en «{estado}» y no puede pasar a ese estado. Se muestra su estado actual.» |
| Otro fallo | «No se pudo cambiar el estado. Inténtalo de nuevo.» |
| Reporte cerrado (R19) | «Este reporte está cerrado y ya no cambia de estado. Si el problema vuelve, entrará como un reporte nuevo.» |
| Entrada del historial | «{desde} → {hacia}», «{actor} · {fecha}», y la nota o «Sin nota» |
| Historial vacío (R22) | «Todavía no hay cambios de estado.» |

## 10. E2E (amplía `e2e/reporte-de-bugs.spec.ts`)

Un `describe` nuevo, «SLT-97 — el módulo del superadmin», en el mismo archivo y en el proyecto
`aislamiento`:

1. **Envío:** el maestro envía un reporte con una descripción única desde `/ordenes`, con el helper que
   ya existe.
2. **Listado:** el superadmin entra con OTP (`conCandadoDelSuperadmin`) y abre «Reportes» desde el menú.
   La fila con la descripción está en el listado por defecto, con la empresa, «Maestro» y «Nuevo» (R1,
   R5, R6). Para no depender de la paginación con datos de otras corridas, se filtra por la empresa de la
   corrida.
3. **Detalle:** al pulsar la fila, se ven la descripción, la empresa, la página `/ordenes` y el
   historial vacío (R14, R22).
4. **Primer cambio:** «En revisión» con una nota única. El historial muestra «Nuevo → En revisión», la
   nota y el nombre del superadmin, y el contador marcaba el largo de la nota (R17, R20, R21, R22).
5. **Segundo cambio:** «Resuelto» sin nota. El historial tiene dos entradas, la más reciente arriba con
   «Sin nota», y el formulario desaparece con el texto de reporte cerrado (R19).
6. **Filtros:** volviendo al listado con la empresa filtrada, el reporte no está en «Pendientes» y sí en
   «Todos» (R7).
7. **Maestro:** abre `/plataforma/reportes` y ve «no encontrado» (R2).

Todo se espera con `expect`, nunca con `waitForTimeout`, y las descripciones llevan el UUID de la corrida.

## 11. Alternativas descartadas

- **A. Reutilizar `historial_plataforma` (SL-20).**
  - Habría que añadir `bug_report` a `historial_plataforma_entidad` y cuatro valores a
    `historial_plataforma_accion`, y hacer opcional `pais_id`, cuya FK obligatoria protege la geografía.
  - `valor_anterior` y `valor_nuevo` son `VARCHAR(80)` y no caben 500 letras de nota: habría que
    meterla en `detalle Json`, sin `CHECK` de largo.
  - Mezcla en una tabla la geografía con los reportes y obliga a filtrar por entidad en cada lectura.
  - Una tabla propia cuesta lo mismo en archivos y tiene el contrato exacto.
- **B. El estado como `TEXT` con `CHECK`, o la transición solo en el servicio.**
  - Sin enum, TypeScript no ve los valores y hace falta una lista paralela.
  - Sin trigger, un `UPDATE` a mano o un error futuro de código podría reabrir un reporte, justo lo que
    la decisión cierra.
  - El trigger cuesta 15 líneas y es la segunda red, como en `SL085`.
- **C. Historial escrito por un trigger `AFTER UPDATE` de `bug_report`.** El trigger no sabe quién ni la
  nota sin pasarlos por `set_config`, que es frágil con el pool de Prisma. El repositorio los escribe en
  la misma transacción con el mismo resultado, y es el patrón de `appendRastroVehiculo`.
- **D. Filtros en estado del cliente con SWR, como `HistorialAccionesModule`.** Pierde los filtros al
  recargar, y R10 los quiere en la URL. Con `searchParams` el listado sale ya pintado del servidor y la
  página no necesita otro endpoint.
- **E. Prohibir el `DELETE` del historial solo con el `REVOKE` y no con trigger.** El dueño (las
  migraciones y los scripts) podría borrar una nota sin dejar rastro. El trigger lo impide y deja pasar
  la cascada del borrado de empresas demo.

## 12. Dependencias

Ninguna librería nueva (decisión «¿Librería nueva? No»). `Bug` viene de `lucide-react`, que ya está.

## 13. Documentación

`docs/architecture.md > Multi-empresa`: se amplía el párrafo «Reportes de problemas (SLT-87)».
- **Estado:** `bug_report.status`, que solo avanza (trigger `bug_report_status_solo_adelante`, `SL097`).
- **Historial:** `bug_report_status_change`, de plataforma, inmutable (`SL097`, salvo la cascada), con
  RLS sin políticas y `REVOKE ALL`.
- **Quién lo ve:** el módulo `/plataforma/reportes` es solo del superadmin, y un cambio de estado no
  avisa a nadie.

## 14. Riesgos

- **Tamaño:** unos 31 archivos y 2300-2450 líneas, aceptado por el humano en P1 (línea
  `tamano-pr-aceptado` en `progress/features/SLT-97.md`). El aviso de 32 archivos queda cerca: un archivo
  más de lo previsto lo dispara, sin pasar a rojo.
- **`new` como valor de enum en Prisma.** Es un identificador válido en el esquema y en el cliente
  (`BugReportStatus.new`), pero hay que confirmarlo en T1 con `prisma validate` y `typecheck`. Si
  chocara, se usa `open` y se ajustan §2.1, §2.3 y §6. Eso es una corrección del spec que vuelve al
  humano, no un cambio silencioso.
- **`pg_trigger_depth()` en la cascada.** Depende de que la FK en cascada corra como trigger interno,
  que es como lo hace Postgres. El test de integración lo fija: un borrado en cascada pasa y uno directo
  falla.
