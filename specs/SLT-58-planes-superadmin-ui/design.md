# SLT-58 — planes-superadmin-ui · design.md

> Requisitos: `requirements.md` (R1–R28; R29–R41 de la enmienda del 2026-10-29, diseñados en §11).
> Se heredan las decisiones y el diseño de
> `specs/SL-24-planes-y-limites/` (sus §N se citan como «SL-24 §N»).

## Lo que ya existe

Buscado en el board (`feature_list.json`, todos los estados), en `specs/` y en el código (grafo +
Grep) con los términos `plan`, `planes`, `mi plan`, `consumo`, `plan_rastro`, `/plataforma/planes`.

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| SL-24 «Planes con límites contados en el servidor» (done) | `specs/SL-24-planes-y-limites/`, PR #37 | Se reutiliza entero: las seis actions de `lib/actions/planes.ts`, `PlanesService`, `PlanesRepository`, los tipos (`lib/types/planes.ts`), los textos (`lib/planes/mensajes.ts`), el ciclo (`lib/planes/ciclo.ts`) y el diff (`lib/planes/rastro.ts`). No se cambia ninguna regla (R25). |
| SL-26 «Panel de superadmin» (cancelada) | `feature_list.json` | Es el origen de esta ficha (decisión cerrada «¿SL-26 sigue?»). Las actions de SL-24 apuntan a ella con `@sin-superficie`: se quita la marca (R24). |
| SL-25 «Registro en autoservicio» (pending) | `feature_list.json` | Fuera de alcance (pedir o elegir plan desde la empresa). No se toca `planesPublicos()`. |
| Pantallas del superadmin | `app/(app)/plataforma/empresas/` (SL-32, SL-23) | Se amplía el detalle `[organizacionId]/page.tsx` con una sección de plan. El listado no cambia. |
| Lectura de cupo de la empresa | `plan_cupo_ordenes` + `lib/repositories/CupoPlanRepository.ts` | Es el patrón que copia la lectura nueva (§2): función `SECURITY DEFINER` acotada a `app.organizacion_id`. No se modifica. |
| `usoDe` (uso de una empresa, como dueño) | `lib/repositories/PlanesRepository.ts` | Se reutiliza para el consumo que ve el superadmin (§3.2). |
| `lineasDeCambioDelPlan`, `diferenciasDelPlan` | `lib/planes/mensajes.ts`, `lib/planes/rastro.ts` | Se reutilizan para «qué cambia» en el cambio pendiente (R7, R16). |
| `textoDelPrecio` (privada) | `lib/planes/mensajes.ts` | Se exporta, sin cambiar su texto, para pintar el precio (R1, R13). |
| `inicioDelCiclo` | `lib/planes/ciclo.ts` | Se añade a su lado `inicioDelSiguienteCiclo` (R5). |
| Toasts del tope en Usuarios, Postulaciones y API keys | SL-24 §8 | No se tocan (fuera de alcance). |
| Review SL-24 m1 («repetir la misma programación vuelve a avisar») | `progress/review_SL-24.md` | Sugería resolverlo en SL-26. **No entra**: cambia la regla de R41 de SL-24 y el Alcance dice «sin cambiar reglas de SL-24». Mitigación en la UI: el botón de guardar se deshabilita mientras la petición está en vuelo (§6.3). |

Nada de esta ficha estaba ya construido: no hay pantalla de planes, ni `/mi-plan`, ni lecturas de
catálogo o detalle.

## 1. Resumen

Tres superficies y dos lecturas nuevas:

1. **«Mi plan»** (`/mi-plan`, `maestro` y `admin`): plan, precio, módulos, consumo por tope, días hasta
   el reinicio, marcas 80 % / 100 % y cambio pendiente. Lee por una función nueva de la base,
   `plan_de_la_empresa`, acotada a la empresa del contexto.
2. **«Planes»** (`/plataforma/planes` y `/plataforma/planes/[planId]`, superadmin): catálogo, crear,
   editar (inmediato o programado), cancelar el cambio, archivar, empresas del plan y `plan_rastro`.
3. **Detalle de empresa** (`/plataforma/empresas/[organizacionId]`, superadmin): sección «Plan» con
   plan, consumo, cambio pendiente, asignar o cambiar e historial de asignaciones.

Las escrituras son las seis actions de SL-24, sin cambios de lógica.

## 2. Modelo de datos y migración

**Ninguna tabla ni columna nueva.** Una migración con una función:

`db/migrations/20261029120000_plan_de_la_empresa/migration.sql` (a mano, como las de SL-24: 
`db:migrate:create` falla con P3006 en este repo).

```sql
CREATE FUNCTION plan_de_la_empresa(p_organizacion_id text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
  v_ahora    timestamp := now() AT TIME ZONE 'UTC';      -- decisión 2026-10-28 de SL-24
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_organizacion_id IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'plan_de_la_empresa: solo se lee el plan de la empresa del contexto';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'nombre', p."nombre",
      'precio_negociable', p."precio_negociable",
      'precio_mensual', p."precio_mensual"::text,
      'precio_anual', p."precio_anual"::text,
      'descuento_anual_pct', p."descuento_anual_pct"::text,
      'tope_ordenes_ciclo', p."tope_ordenes_ciclo",
      'tope_api_keys', p."tope_api_keys",
      'topes_rol', COALESCE((SELECT jsonb_agg(jsonb_build_object('rol', t."rol", 'maximo', t."maximo"))
                               FROM "plan_tope_rol" t WHERE t."plan_id" = p."id"), '[]'::jsonb),
      'modulos', COALESCE((SELECT jsonb_agg(m."modulo") FROM "plan_modulo" m WHERE m."plan_id" = p."id"), '[]'::jsonb),
      'ciclo_inicio', plan_inicio_ciclo(o."plan_ciclo_ancla_at", v_ahora),
      'ciclo_ancla', o."plan_ciclo_ancla_at",
      'uso', jsonb_build_object(
        'ordenes', plan_uso_ordenes(o."id", plan_inicio_ciclo(o."plan_ciclo_ancla_at", v_ahora)),
        'api_keys', plan_uso_api_keys(o."id"),
        'maestro', plan_uso_rol(o."id", 'maestro'::rol_value),
        'admin', plan_uso_rol(o."id", 'admin'::rol_value),
        'mensajero', plan_uso_rol(o."id", 'mensajero'::rol_value),
        'admin_tienda', plan_uso_rol(o."id", 'Admin Tienda'::rol_value),
        'admin_satelite', plan_uso_rol(o."id", 'adminSatelite'::rol_value)),
      -- Solo la fecha y la versión: NUNCA `avisos_al_programar` (nombra otras empresas) ni el actor (R9).
      'cambio', (SELECT jsonb_build_object('vigente_desde', c."vigente_desde", 'version', c."version")
                   FROM "plan_cambio_programado" c WHERE c."plan_id" = p."id"))
      FROM "organizacion" o JOIN "plan" p ON p."id" = o."plan_id"
     WHERE o."id" = p_organizacion_id);
END $$;

REVOKE EXECUTE ON FUNCTION plan_de_la_empresa(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plan_de_la_empresa(text) TO servi_app;
```

`down.sql`: `DROP FUNCTION plan_de_la_empresa(text);` (un `DROP FUNCTION` no exige
`DESTRUCTIVA.md`, `docs/architecture.md > Migraciones que pierden datos`).

- **Empresa sin plan:** el `SELECT` no devuelve fila → `NULL` (R6).
- **Multi-empresa (`docs/architecture.md > Multi-empresa`):** no hay tabla nueva, así que no hay
  `organizacion_id`, RLS ni únicos nuevos. La función es `SECURITY DEFINER` (lee tablas de plataforma
  que `servi_app` no ve) y por eso copia las tres defensas de `plan_cupo_ordenes`: `search_path` fijo,
  `EXECUTE` revocado a `PUBLIC` y la empresa obligada a ser la del contexto (`42501`). Las tablas
  `plan*` siguen con `REVOKE ALL` para `servi_app` (R9; P4).
- **`STABLE`:** no escribe (R25). Lee un instante (`now()`) y por eso no es `IMMUTABLE`.
- **Uso:** las mismas funciones `plan_uso_*` y `plan_inicio_ciclo` que los triggers (una sola
  definición de «uso», SL-24 §4.2), así que el «1.000 de 3.000» es exactamente lo que frena el alta (R2).
- **Roles:** la base devuelve la etiqueta Postgres (`'Admin Tienda'`); el repositorio la mapea a
  `adminTienda` igual que `COLUMNA_DEL_ROL` de `PlanesRepository`.
- **Tests existentes que la ven:** `migracion-sl24-ida-y-vuelta.test.ts` lista las funciones `plan_%`
  y los `EXECUTE` de `servi_app` en una base propia con solo las migraciones hasta SL-24; la nueva no
  se aplica ahí. T1 lo confirma; si no fuera así, se para y se pregunta antes de tocar ese test.

## 3. Capas

### 3.1 «Mi plan» (empresa)

```
app/(app)/mi-plan/page.tsx                    Server Component: actor de la sesión; notFound() si forbidden
  → lib/actions/_shared/mi-plan.ts            composition root sin "use server" (patrón modulos-empresa)
    → lib/services/MiPlanService.ts           autorización (R8) + armar el DTO (R1–R7)
      → lib/repositories/MiPlanRepository.ts  $queryRaw a plan_de_la_empresa(current_setting(...)) + zod
```

- **Autorización (R8):** `MiPlanService.ver(actor)` responde `{ estado: "forbidden" }` si
  `actor === null` o `!ROLES_MI_PLAN.includes(actor.rol)`, **antes** de llamar al repositorio.
  `ROLES_MI_PLAN = ["maestro", "admin"] as const satisfies readonly RolValue[]` vive en
  `lib/auth/menu-visibility.ts` y la leen el ítem del menú, el `notFound()` de la página y el
  servicio (precedente `ROLES_HISTORIAL_ACCIONES`, ficha 362). El superadmin no está en la lista: no
  tiene empresa.
- **Empresa:** la del contexto que fija la extensión desde la sesión, igual que
  `CupoPlanRepository` (`current_setting('app.organizacion_id', true)`). Nunca llega de la petición:
  `ver` no recibe `organizacionId` (R9).
- **Módulo:** núcleo. Sin `exigirModuloEnRuta` (R12).
- **Borde tipado:** el `jsonb` se valida con un esquema zod en el repositorio (`planDeLaEmpresaFilaSchema`)
  antes de convertirlo a `PlanDTO`-parcial; la `version` del cambio se valida con `versionPlanSchema`
  (el mismo que usa el aplicador, SL-24 T11).
- **Qué cambia (R7):** el servicio construye un `PlanDTO` con la versión vigente y otro con la
  pendiente, llama a `diferenciasDelPlan` y pasa el resultado a `lineasDeCambioDelPlan`. Las líneas
  viajan ya como texto.

### 3.2 Lecturas del superadmin

Se añaden a lo que ya existe, sin una capa nueva: el superadmin no tiene empresa y
`PlanesRepository` ya está en `EXCEPCIONES_DE_PLATAFORMA` para leer como dueño en `comoPlataforma`.

| `PlanesService` (nuevo método) | `PlanesRepository` (nuevo método) | Para |
|---|---|---|
| `catalogo(actor)` | `catalogo()` | R13: todos los planes con `PlanDTO`, nombre de la empresa del custom, nº de empresas (`_count` de `empresas`) y `vigenteDesde` del pendiente |
| `detallePlan(actor, { planId })` | `detalle(planId)` | R16: `PlanDTO`, pendiente (`vigenteDesde` + `version` validada), empresas `{ id, nombre }` y `plan_rastro` del plan (`ORDER BY created_at DESC LIMIT 100`, usa el índice `(plan_id, created_at)`) |
| `planDeEmpresa(actor, { organizacionId })` | `planDeEmpresa(organizacionId)` | R19, R21: plan asignado (`PlanDTO` o `null`), ancla, uso (`usoDe`), pendiente del plan, y las filas `plan_asignado` de `historial_accion` de esa empresa (`where organizacionId` explícito, `ORDER BY created_at DESC LIMIT 50`) |

- **Autorización (R22):** cada método empieza por `if (!esSuperadmin(actor)) return FORBIDDEN`, con
  el mismo orden de SL-24: quién → zod (`planIdSchema`, `asignablesSchema`) → existe → repositorio.
- **Composition root:** `lib/actions/_shared/planes-plataforma.ts` (sin `"use server"`), como
  `lib/actions/_shared/modulos-empresa.ts`: lo llaman las páginas, que ya resolvieron el actor. No
  hace falta exponer endpoints de lectura.
- `PlanesPrismaClient` suma `"historialAccion"` y `"planRastro"` al `Pick`.
- `EXCEPCIONES_DE_PLATAFORMA`: el `motivo` de `PlanesRepository` se amplía con «y las lecturas del
  catálogo, el detalle de un plan y el plan de una empresa para el superadmin (SLT-58)». No entra
  ningún archivo nuevo en la lista.

### 3.3 Escrituras

Sin cambios de lógica. En `lib/actions/planes.ts` solo se quitan las seis líneas `@sin-superficie`
(R24; la guardia `superficie-de-uso` exige quitarlas cuando la acción ya tiene pantalla). Los
componentes cliente reciben las actions por props desde el Server Component (patrón
`fijarModuloEmpresaAction`) y, tras un `ok`, llaman a `router.refresh()` para releer.

## 4. Rutas y menú

### 4.1 «Mi plan» (respuesta a la pregunta abierta de la ruta)

- **Ruta:** `/mi-plan` (`app/(app)/mi-plan/page.tsx`). Patrón de nombre de `/mi-wallet` y `/mi-bodega`.
- **Menú:** ítem de primer nivel `{ label: "Mi plan", href: "/mi-plan", iconKey: "gaugeCircle",
  roles: ROLES_MI_PLAN }`, **justo después de «Histórico» y antes de «Empresas»**.
  - Por qué no dentro de «Configuración»: es `roles: ["maestro"]`, y `puedeVer` exige el rol del
    padre antes de mirar los hijos; el `admin` no lo vería, y la decisión dice maestro **y** admin.
    Ensanchar «Configuración» le regalaría al `admin` Usuarios, Tarifas y API (el mismo argumento
    escrito para «SINPE por bodega»).
  - Aterrizaje (R10): para `maestro` y `admin` el primer ítem visible es «Inicio»; un ítem después de
    «Histórico» no lo mueve. No lleva `destinoInicial: false` (el test de destino afirma que solo
    `/analitica` y `/monitoreo` lo llevan).
  - Icono: `IconKey` es una unión cerrada con un icono propio por sección; se añade `gaugeCircle`
    (lucide `CircleGauge`, o su alias `GaugeCircle` según la versión instalada) y su entrada en el mapa de `app/(app)/_components/Sidebar.tsx`.
- **Reparto de módulos:** `"/mi-plan": "nucleo"` en `lib/modulos/reparto.ts`.

### 4.2 Superadmin

- `/plataforma/planes` (catálogo) y `/plataforma/planes/[planId]` (detalle), las dos con `notFound()`
  si el actor no es plataforma, antes de leer (patrón de `/plataforma/empresas`). Un `planId` que no
  es uuid o no existe → `notFound()` (R22).
- Menú: `{ label: "Planes", href: "/plataforma/planes", iconKey: "layers", roles: ROLES_PLATAFORMA }`
  **entre «Empresas» y «Geografía»**. `roles` por identidad con `ROLES_PLATAFORMA` (guardia
  `superadmin-fuera-de-empresa`). El aterrizaje del superadmin sigue en «Empresas» (R23).
- Reparto: `"/plataforma/planes": "nucleo"`, `"/plataforma/planes/[planId]": "nucleo"`.

### 4.3 Tests existentes de menú que cambian (contratos literales)

- `tests/unit/auth/menu-visibility.test.ts`: «el superadmin ve exactamente [Empresas, Geografía]» pasa
  a `[Empresas, Planes, Geografía]`, y `SIDEBAR_ITEMS.slice(-4)` pasa a `slice(-5)` con
  `["Empresas", "Planes", "Geografía", "Mi bodega", "Ayuda"]`. Cada edición lleva una línea que cita
  SLT-58 R23.
- Cualquier `toEqual` literal de los ítems de `maestro`/`admin` que aparezca en la suite se actualiza
  con «Mi plan» citando R10. T6 los localiza con Grep antes de tocar el menú.
- `e2e/_dos-empresas-fixture.ts > rutasDelMenuDelMaestro` incluirá `/mi-plan` sola: el humo la
  visitará. La página tiene que responder bien a un maestro sin plan (R6).

## 5. Contratos de entrada y salida

Tipos nuevos en `lib/types/consumo-plan.ts` (serializables: fechas como ISO o `AAAA-MM-DD`):

```ts
export type UsoDelPlan = { ordenes: number; apiKeys: number; porRol: Record<RolConTope, number> };

export type EstadoFila = "sin_limite" | "normal" | "cerca" | "lleno";
export type FilaConsumo = {
  clave: "ordenes" | "api_keys" | RolConTope;
  etiqueta: string;           // «órdenes del ciclo», «Mensajero», «API keys»
  usados: number;
  maximo: number | null;      // null = sin límite
  estado: EstadoFila;
  texto: string;              // «1.000 de 3.000 órdenes del ciclo» / «12 Mensajero · sin límite»
};

export type CambioPendienteVista = { vigenteDesde: string /* AAAA-MM-DD, hora plataforma */; lineas: string[] };

export type PlanConConsumo = {
  nombre: string;
  precioTexto: string;        // textoDelPrecio, sin moneda
  modulos: { clave: ModuloApagable; nombre: string }[];
  filas: FilaConsumo[];
  reinicio: { dias: number; fecha: string /* AAAA-MM-DD, hora plataforma */ };
  cambioPendiente: CambioPendienteVista | null;
};

export type MiPlanResult =
  | { estado: "ok"; plan: PlanConConsumo | null }   // null = sin plan (R6)
  | { estado: "forbidden" };
```

Lecturas del superadmin, en `lib/types/planes.ts` (junto a los de SL-24):

```ts
export type PlanDelCatalogo = PlanDTO & { empresaNombre: string | null; empresas: number; vigenteDesdePendiente: string | null };
export type FilaRastro = { id: string; accion: PlanRastroAccion; cambios: CambiosDelPlan; actorNombre: string; creadoAt: string };
export type DetallePlan = { plan: PlanDTO; empresaNombre: string | null; pendiente: CambioPendienteVista | null; empresas: { id: string; nombre: string }[]; rastro: FilaRastro[] };
export type AsignacionDePlan = { creadoAt: string; actorNombre: string; planNombre: string /* entidad_etiqueta congelada */ };
export type PlanDeEmpresaVista = { organizacionId: string; plan: (PlanConConsumo & { planId: string; archivado: boolean }) | null; asignaciones: AsignacionDePlan[] };

export type CatalogoResult = { estado: "ok"; planes: PlanDelCatalogo[] } | { estado: "forbidden" };
export type DetallePlanResult = { estado: "ok"; detalle: DetallePlan } | { estado: "forbidden" } | { estado: "validation_error"; fieldErrors: Record<string, string[]> } | { estado: "not_found" };
export type PlanDeEmpresaResult = { estado: "ok"; vista: PlanDeEmpresaVista } | { estado: "forbidden" } | { estado: "validation_error"; fieldErrors: Record<string, string[]> } | { estado: "not_found" };
```

Las entradas de escritura son las de SL-24 (`crearPlanSchema`, `editarPlanSchema`, …), sin cambios.

## 6. Pantallas

### 6.1 Lógica pura compartida — `lib/planes/consumo.ts`

Sin React ni base; la usan «Mi plan» y el detalle de empresa, y tiene sus tests unitarios.

- `estadoDeLaFila(usados, maximo)`: `maximo === null` → `sin_limite`; `usados >= maximo` → `lleno`;
  `usados * 100 >= maximo * 80` → `cerca`; si no, `normal` (R3, R4; enteros, sin coma flotante).
- `formatearConteo(n)`: miles con punto, sin `Intl` (el de `es-CR` agrupa con espacio fino; mismo
  hallazgo que `PriceLabel`, feature 201).
- `filasDeConsumo(topes, uso)`: órdenes, los cinco roles en el orden de `ROLES_CON_TOPE` (etiqueta
  de `ROL_LABELS`) y API keys (R2, R3).
- `reinicioDelCiclo(ancla, ahora)`: `inicioDelSiguienteCiclo` (nueva en `lib/planes/ciclo.ts`:
  `ancla + (n+1) meses`, con la misma aritmética desde el ancla, nunca encadenada), días =
  `ceil((siguiente − ahora) / 24 h)` con mínimo 1, y la fecha con `fechaCalendarioCR(siguiente)` (R5).

### 6.2 Componente compartido — `components/shared/ConsumoDelPlan.tsx`

Presentacional (props: `PlanConConsumo | null`). Lo montan «Mi plan» y la sección de plan del
detalle de empresa: dos features con la misma API, así que va a `shared/`
(`docs/architecture.md > Regla: sin sobre-ingeniería`). Pinta nombre, precio («Precio informativo»),
módulos, una fila por tope con una barra (`components/ui/` no tiene `progress`: un `div` con
`role="meter"` y `aria-valuenow`/`aria-valuemax`, sin instalar nada) y la marca «Cerca del tope» o «Lleno» con texto,
no solo color. Debajo, «Se reinicia en N días (AAAA-MM-DD)» y, si hay, «Cambio programado desde
<fecha>» con sus líneas. Sin plan: «Tu empresa no tiene plan asignado: sin límites» (en el detalle
de empresa, «Sin plan: sin límites»).

### 6.3 Superadmin

Bajo `app/(app)/plataforma/planes/`:

- `page.tsx` → `_components/PlanesModule.tsx`: tabla del catálogo (R13) con filtro «Mostrar
  archivados» (apagado por defecto; los archivados llevan la marca «Archivado») y el botón «Nuevo
  plan», que abre `PlanForm` en un `Sheet`.
- `_components/PlanForm.tsx` (crear y editar, R14, R15): nombre; visibilidad «Público» / «Custom»
  (solo al crear) y, si es custom, un `Select` de empresas (`listarEmpresasPlataforma`); topes
  (vacío = sin límite); módulos (casillas de `ORDEN_MODULOS` con `nombreDelModulo`); precio por forma
  (sin precio / negociable / mensual con anual opcional fijo o con descuento). Al editar, «Aplicar»:
  «De inmediato» o «A partir de» + fecha (`AAAA-MM-DD`, P8). Muestra los `fieldErrors` junto a su
  campo (R18). Deshabilita «Guardar» mientras la petición está en vuelo.
- `[planId]/page.tsx` → `[planId]/_components/PlanDetalle.tsx` (R15–R17): versión vigente, cambio
  pendiente con «Cancelar cambio» (confirmación), «Editar», «Archivar» (confirmación que avisa que
  cancela el pendiente, SL-24 R40), empresas con el plan (enlace a su detalle), avisos del último
  guardado (texto de `mensajeTopesPasados`) y el rastro (tabla: fecha en hora de plataforma, actor,
  acción traducida, cambios con `lineasDeCambioDelPlan` sobre `cambios` de la fila). Archivado: sin
  Editar, Archivar ni Cancelar.

En el detalle de empresa (`app/(app)/plataforma/empresas/[organizacionId]/`):

- `_components/PlanEmpresa.tsx` (R19–R21): `ConsumoDelPlan`, un `Select` con los planes de
  `listarPlanesAsignablesAction` y «Asignar plan» / «Cambiar plan»; `tope_excedido` muestra su
  `mensaje` (R20); y el historial de asignaciones.
- `page.tsx` lee `planDeEmpresa` en paralelo con `verModulosEmpresa` y monta la sección antes de
  los módulos. Si la lectura del plan falla con algo distinto de `ok`, la sección dice «No se pudo
  cargar el plan» y los módulos siguen.

### 6.4 Empresa

`app/(app)/mi-plan/page.tsx` → `_components/MiPlanModule.tsx`: título «Mi plan» y `ConsumoDelPlan`.
Sin botones ni formularios (R11).

### 6.5 Textos

En un `TEXTOS` por pantalla (patrón de `EmpresaDetallePage`), salvo los que ya existen en
`lib/planes/mensajes.ts`, que se reutilizan. Ningún texto nombra la marca, el país ni la moneda.

| Clave | Texto |
|---|---|
| `sinPlanEmpresa` | «Tu empresa no tiene plan asignado: sin límites» |
| `sinPlanSuperadmin` | «Sin plan: sin límites» |
| `cerca` / `lleno` | «Cerca del tope» / «Lleno» |
| `sinLimite` | «sin límite» (el `SIN_LIMITE` de `mensajes.ts`, exportado) |
| `reinicio` | «Se reinicia en {n} días ({fecha})», «en 1 día» en singular |
| `cambioPendiente` (el mismo texto en todas las pantallas, también en el detalle del plan; decisión del humano del 2026-10-29) | «Cambio programado desde {fecha}» + `TITULO_LINEAS_DE_CAMBIO` (el mismo texto en todas las pantallas, también en el detalle del plan; decisión del humano del 2026-10-29) |
| rechazos | `forbidden` «No tienes permiso para esto.»; `not_found` «El plan o la empresa ya no existe.»; `archivado` «El plan está archivado.»; `custom_de_otra_empresa` «Ese plan es de otra empresa.»; `sin_cambio_programado` «El plan ya no tiene un cambio pendiente.»; `tope_excedido` → su `mensaje` |
| `precioConMonto` | «Con monto» (opción del precio en el formulario; aprobado por el humano el 2026-10-29) |
| `programar` | «Programar cambio» (botón de guardar del formulario cuando se elige «A partir de»; aprobado el 2026-10-29) |
| `reintentar` | «Reintentar» (al fallar el catálogo de planes y al fallar la lectura del plan actual en el modal de «Cambiar plan»; aprobado el 2026-10-29) |
| `primeraTitulo` | «¿Asignar este plan a la empresa?» (título del modal de primera asignación; aprobado el 2026-10-29, enmienda §11) |
| `cicloEmpiezaEl` | «El ciclo de órdenes empieza el {fecha}.» (sustituye a `cicloEmpiezaHoy` «El ciclo de órdenes empieza hoy.»; `{fecha}` = la elegida, `AAAA-MM-DD`; aprobado el 2026-10-29, R38) |
| `ordenesYaPasadas` | «La empresa ya lleva {usados} de {maximo} órdenes en este ciclo: no podrá crear más hasta {fecha}.» (aviso de R36/R37; texto de la decisión del 2026-10-29; `{fecha}` según P10) |
| `inicioCiclo` (etiqueta del campo) | **Pendiente de aprobación:** «Inicio del ciclo de órdenes» |
| `rangoInicioCiclo` (error del campo) | **Pendiente de aprobación:** «Elige una fecha entre el {min} y el {max}.» |
| `soloPrimeraAsignacion` (error del campo) | **Pendiente de aprobación:** «La fecha de inicio solo se elige en la primera asignación.» |
| `vistaPreviaNoCargo` | **Pendiente de aprobación (P11):** «No se pudo comprobar el consumo de la empresa» |

## 7. Datos que dependen del país

- **Moneda del precio:** ninguna (D26 / SL-21). El precio se pinta sin símbolo con `textoDelPrecio`;
  no se usa `formatMonto` ni `PriceLabel`, que pegan el símbolo de la moneda.
- **Fechas:** la del cambio programado y la del reinicio, en la hora de la plataforma (Costa Rica,
  UTC−6, `lib/utils/fecha-cr.ts`) hasta SL-21, como P8 de SL-24. El ciclo se calcula en UTC en la
  base (decisión 2026-10-28) y solo su fecha visible se pasa a la hora de la plataforma.
- **Geografía, impuestos, métodos de pago:** no aplican.

## 8. Tests

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/unit/planes/consumo.test.ts` | unit | R1 (precio), R2, R3, R4, R5 |
| `tests/unit/utils/ciclo-plan.test.ts` (existente, casos nuevos) | unit | R5 (`inicioDelSiguienteCiclo`) |
| `tests/unit/services/mi-plan-service.test.ts` | unit | R7, R8 |
| `tests/unit/services/planes-service-lecturas.test.ts` | unit | R13, R16, R19, R22 |
| `tests/integration/db/plan-de-la-empresa.test.ts` | integración (Postgres real) | R2, R6, R9, R25, R26 |
| `tests/integration/db/planes-lecturas-plataforma.test.ts` | integración | R13, R16, R21 |
| `tests/integration/mi-plan-page.test.tsx` | integración (página) | R8 |
| `tests/integration/plataforma-planes-page.test.tsx` | integración (página) | R22 |
| `tests/integration/plataforma-empresa-detalle-page.test.tsx` (existente, casos nuevos) | integración | R19 |
| `tests/unit/auth/menu-mi-plan.test.ts` | unit | R10, R12 |
| `tests/unit/auth/menu-visibility.test.ts` (existente, actualizado) | unit | R23 |
| `tests/components/MiPlanModule.test.tsx` | componente | R1, R6, R7, R11 |
| `tests/components/PlanesModule.test.tsx` | componente | R13 |
| `tests/components/PlanForm.test.tsx` | componente | R14, R15, R18 |
| `tests/components/PlanDetalle.test.tsx` | componente | R15, R16, R17, R18 |
| `tests/components/PlanEmpresa.test.tsx` | componente | R18, R19, R20, R21 |
| guardias existentes (`superficie-de-uso`, `modulos-reparto`, `plataforma-solo-en-lista`, `superadmin-fuera-de-empresa`, dependencias) | guardia | R12, R24, R27 |
| `e2e/planes-superadmin.spec.ts` | E2E | R28 |

**E2E (R28)**, serie, con `_superadmin-fixture.ts` y `_dos-empresas-fixture.ts`: alta de A y B como
hace `superadmin-empresas.spec.ts` (o el `altaDeEmpresa` del fixture), el superadmin entra con OTP,
crea por pantalla un custom «Plan E2E» de A con tope de mensajeros y de órdenes, lo asigna desde el
detalle de A, y la tabla del detalle muestra el consumo. El maestro de A abre `/mi-plan`: nombre,
«de <tope> órdenes del ciclo», «sin límite» en un rol sin tope. El maestro de B ve «sin límites» y no
el nombre del plan de A. El mensajero de A recibe «No encontramos esta página» en `/mi-plan`. Se
comprueba por detrás (`clienteDueno`) que el plan de A existe y que B sigue sin plan. Va en un spec
propio y no dentro del humo de dos empresas para no alargarlo; usa `conCandadoDelSuperadmin`.

## 9. Alternativas descartadas

1. **La empresa lee su plan por `PlanesRepository` en `comoPlataforma`.** El servicio validaría el
   rol y pasaría la empresa de la sesión al repositorio, que leería como dueño. Descartada: la única
   barrera contra leer el plan de otra empresa sería el código del servicio; un error de llamada
   (pasar un `organizacionId` que llega de fuera) lo abriría sin que la base lo impida. Con
   `plan_de_la_empresa` la base exige que la empresa sea la del contexto (`42501`), igual que el cupo
   de SL-24, y `PlanesRepository` no amplía su uso de plataforma hacia rutas de empresa.
2. **Dar a `servi_app` `SELECT` sobre `plan`, `plan_tope_rol`, `plan_modulo` y
   `plan_cambio_programado` con una política «el plan de mi empresa».** Descartada: rompe el
   aislamiento de SL-24 R8 tal como está probado (`SELECT` → `42501`, tablas sin políticas), y
   `plan_cambio_programado.avisos_al_programar` y `actor_nombre` quedarían legibles, con nombres de
   otras empresas y del superadmin. La función devuelve solo lo que se pinta.
3. **«Mi plan» como subítem de «Configuración».** Descartada por el rol (§4.1).
4. **Calcular el uso en TypeScript con `count` de Prisma.** Descartada: habría dos definiciones de
   «uso» que pueden separarse de la de los triggers (SL-24 §4.2).
5. **Exponer las lecturas del superadmin como Server Actions nuevas.** Descartada: las llaman solo
   páginas de servidor que ya tienen el actor; un endpoint más sería superficie sin uso (precedente
   `verModulosEmpresa`).

## 10. Dependencias

Ninguna nueva (R27). `Sheet`, `Select`, `Checkbox`, `RadioGroup`, `Dialog` y `Table` ya están en
`components/ui/`. No se añade ningún componente de shadcn (no hay `progress`; la barra es un `div`).
Si el implementer necesitara otro, para y pregunta: puede arrastrar un paquete de Radix, y entonces
aplica `docs/architecture.md > Dependencias de terceros`.

## 11. Enmienda del 2026-10-29 — inicio del ciclo elegido en la primera asignación

> Requisitos R29–R41 y el test de R8 ampliado. Decisiones del humano del 2026-10-29 (filas «Inicio del
> ciclo en la primera asignación», «Fecha pasada», «Fecha futura», «Tope ya pasado con fecha pasada»,
> «Textos del modal de primera asignación» y «R8: 404 HTTP real»). Lo no decidido sigue las propuestas
> P6–P12 de `requirements.md`; si el humano cambia alguna, cambia el punto de esta sección que la cita.

### 11.1 Lo que ya existe (para esta enmienda)

| Qué | Dónde | Qué se hace |
|---|---|---|
| El ancla nace al asignar el primer plan | `PlanesRepository.asignar` (`COALESCE("plan_ciclo_ancla_at", now() AT TIME ZONE 'UTC')`) | Se amplía: con fecha elegida, el ancla es la de R32. Sin fecha, la misma línea de hoy (R29). |
| `plan_inicio_ciclo(ancla, ahora)` (SQL, `IMMUTABLE`) y su gemela `inicioDelCiclo` | `20261028130200_plan_topes_triggers`, `lib/planes/ciclo.ts` | **No se tocan.** Con un `ahora` anterior al ancla devuelven el ancla: no saben del ciclo corto. Se envuelven (§11.2). |
| Quien calcula el ciclo en curso | trigger `plan_tope_ordenes`, `plan_cupo_ordenes`, `plan_de_la_empresa`, `usoDe` de `PlanesRepository` | Los tres SQL se reemplazan en la migración nueva para usar la envoltura; `usoDe` cambia su SQL (TS). |
| `inicioDelSiguienteCiclo` (SLT-58) | `lib/planes/ciclo.ts` | **Se corrige:** con `ahora` anterior al ancla devuelve `ancla + 1 mes`; durante el ciclo corto debe devolver el ancla (R40). |
| Avisos de tope pasado | `excedidosDe`, `TopeExcedido`, `PlanResult.ok.avisos`, `mensajeTopesPasados` | Se reutilizan para R36: el `ok` de `asignar` ya tiene `avisos` (hoy siempre `[]`). |
| Casos compartidos TS/SQL del ciclo | `tests/integration/db/_fixtures/planes.ts > CASOS_CICLO` + `plan-ciclo.test.ts` | Es el patrón de R35. La tabla nueva va en un fixture propio para no tocar el de SL-24. |
| `fechaSchema` (`AAAA-MM-DD` de un día que existe) | `lib/types/planes.ts` (privado) | Se reutiliza para `inicioCiclo`. |
| `inicioDelDiaPlataforma(fecha)` | `lib/planes/ciclo.ts` (P8 de SL-24) | Da las 00:00 de la plataforma en UTC: es el ancla de R32 para una fecha distinta de hoy. |
| `fechaCalendarioCR(instante)` | `lib/utils/fecha-cr.ts` | Da «hoy» en la hora de la plataforma (R30) y las fechas visibles. |

Buscado en el board y en `specs/` («inicio del ciclo», «fecha de inicio», «ciclo corto»): nada lo
construye ni lo especifica.

### 11.2 Modelo de datos y migración

**Una columna nueva** en `organizacion` y una migración nueva. Nada de 20261028130200 ni de
20261029120000 se edita: esta reemplaza sus funciones con `CREATE OR REPLACE` y su `down.sql` devuelve
los cuerpos anteriores copiados literalmente.

`db/migrations/20261029150000_plan_ciclo_inicio_elegido/migration.sql` (a mano, como las de SL-24):

```sql
-- Dónde empieza el ciclo corto (R34): el instante de la asignación cuando el ancla elegida es futura.
-- NULL en todo lo demás, incluidas todas las empresas que ya tienen plan (R41: cuentan igual).
ALTER TABLE "organizacion" ADD COLUMN "plan_ciclo_corto_desde_at" TIMESTAMP(3);
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_ciclo_corto_check"
  CHECK ("plan_ciclo_corto_desde_at" IS NULL
         OR ("plan_ciclo_ancla_at" IS NOT NULL AND "plan_ciclo_corto_desde_at" < "plan_ciclo_ancla_at"));

-- El inicio del ciclo en curso, con el ciclo corto (R33, R34). Antes del ancla, el ciclo corto; sin
-- ciclo corto guardado, el ancla (= plan_inicio_ciclo, R41). Desde el ancla, la regla de SL-24 R20.
-- Gemela TS: lib/planes/ciclo.ts > inicioDelCicloEnCurso (R35).
CREATE FUNCTION plan_inicio_ciclo_en_curso(p_corto_desde timestamp, p_ancla timestamp, p_ahora timestamp)
  RETURNS timestamp LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_ahora < p_ancla THEN
    RETURN COALESCE(p_corto_desde, p_ancla);
  END IF;
  RETURN plan_inicio_ciclo(p_ancla, p_ahora);
END $$;
REVOKE EXECUTE ON FUNCTION plan_inicio_ciclo_en_curso(timestamp, timestamp, timestamp) FROM PUBLIC;

-- CREATE OR REPLACE conserva dueño y privilegios (los GRANT de servi_app siguen).
CREATE OR REPLACE FUNCTION plan_tope_ordenes() …      -- lee también "plan_ciclo_corto_desde_at" y
                                                      -- usa plan_inicio_ciclo_en_curso(v_corto, v_ancla, now() AT TIME ZONE 'UTC')
CREATE OR REPLACE FUNCTION plan_cupo_ordenes(text) … -- ídem
CREATE OR REPLACE FUNCTION plan_de_la_empresa(text) … -- ídem para 'ciclo_inicio' y 'uso.ordenes';
                                                      -- añade 'ciclo_corto_desde' (o."plan_ciclo_corto_desde_at")
```

El resto de cada cuerpo (cerrojos, `SL024`, comprobación del contexto `42501`, `search_path`) se copia
sin cambios. El implementer escribe los cuerpos completos; el reviewer los compara con los de origen
línea a línea.

`down.sql`: `CREATE OR REPLACE` de las tres funciones con su cuerpo de 20261028130200 y 20261029120000
copiado literalmente; `DROP FUNCTION plan_inicio_ciclo_en_curso(timestamp, timestamp, timestamp)`;
`DROP CONSTRAINT "organizacion_plan_ciclo_corto_check"`; `DROP COLUMN "plan_ciclo_corto_desde_at"`.
Bajar pierde el inicio de los ciclos cortos en curso: esas empresas pasan a contar desde el ancla
futura (uso 0) hasta su fecha. Es la reversión de una columna que esta misma migración añade, no una
migración destructiva del `up` (precedente: los `down.sql` de SL-24 que quitan `plan_ciclo_ancla_at`).

`db/schema.prisma`: `planCicloCortoDesdeAt DateTime? @map("plan_ciclo_corto_desde_at") @db.Timestamp(3)`
en `Organizacion`, y el comentario de `plan_asignado` de `HistorialAccionTipo` pasa a decir que
`valor_nuevo` lleva la fecha elegida en la primera asignación con fecha (R39).

- **Multi-empresa:** no hay tabla nueva. La columna es de `organizacion`, que ya es de solo lectura
  para `servi_app` y en la que cada empresa ve solo su fila (comentario de 20261028130000; SL-24 R8,
  `planes-acceso-servi-app.test.ts > moverAncla`). La columna nueva hereda esa protección; T12 lo
  comprueba con un `UPDATE` de `servi_app` sobre ella → `42501`. Es dato de la propia empresa (su
  ciclo): leerlo desde su fila no expone nada de otra.
- **Una sola definición del ciclo:** los triggers, el cupo, «Mi plan», el detalle y la vista previa
  llaman a `plan_inicio_ciclo_en_curso`; no queda ningún caller de producción de `plan_inicio_ciclo`
  con el ancla de una empresa (Grep en T12).
- **`IMMUTABLE`:** la envoltura solo compara y llama a otra `IMMUTABLE`.
- **`migracion-sl24-ida-y-vuelta.test.ts`:** como en T1, se confirma que no aplica migraciones
  posteriores a SL-24; si las aplicara, PARAR y preguntar.

### 11.3 Ciclo en TS (gemela, R35, R40)

En `lib/planes/ciclo.ts`, sin tocar `inicioDelCiclo`:

- `inicioDelCicloEnCurso(ancla, cortoDesde, ahora)`: `ahora < ancla` → `cortoDesde ?? ancla`; si no,
  `inicioDelCiclo(ancla, ahora)`.
- `inicioDelSiguienteCiclo(ancla, ahora)`: `ahora < ancla` → `ancla` (fin del ciclo corto); si no, lo
  de hoy.
- `rangoDelInicioDelCiclo(ahora)` → `{ hoy, min, max }` en `AAAA-MM-DD` de la plataforma: `hoy =
  fechaCalendarioCR(ahora)`, `min`/`max` = `hoy ∓ 1 mes` con el recorte al último día del mes
  (`sumarMeses` sobre la fecha). Una sola fuente para el servicio (R30) y para el `min`/`max` del campo.
  `max` sigue P6.
- `anclaDeLaFechaElegida(fecha, ahora)` → `"ahora"` si `fecha === hoy` (P9) o
  `inicioDelDiaPlataforma(fecha)`.

`lib/planes/consumo.ts`: `reinicioDelCiclo` ya llama a `inicioDelSiguienteCiclo`; con la corrección,
durante el ciclo corto da los días hasta la fecha elegida (R40). El tipo leído (`ancla`) suma
`cortoDesde: Date | null`, que hoy solo usa la vista previa; `PlanConConsumo` no cambia (P8: sin texto
nuevo).

**Tabla compartida (R35):** `tests/integration/db/_fixtures/ciclo-corto.ts` exporta `CASOS_CICLO_CORTO`
(`{ caso, ancla, cortoDesde, ahora, enCurso, siguiente }`). La leen `tests/unit/utils/ciclo-plan.test.ts`
(TS) y `tests/integration/db/plan-ciclo-corto.test.ts` (SQL), que además comprueba, por caso, que
`plan_inicio_ciclo_en_curso(corto, ancla, siguiente)` = `siguiente` y que, un milisegundo antes, da
`enCurso`: así el «Se reinicia» de la pantalla es el instante en que la base cambia de ciclo.

### 11.4 Capas

**Entrada (`lib/types/planes.ts`):**

```ts
export const asignarPlanSchema = z.object({
  organizacionId: z.uuid(), planId: z.uuid(),
  inicioCiclo: fechaSchema.optional(),          // R29: ausente = SL-24 tal cual
}).strict();
export const previsualizarAsignacionSchema = z.object({
  organizacionId: z.uuid(), planId: z.uuid(), inicioCiclo: fechaSchema,
}).strict();
export type VistaPreviaAsignacionResult =
  | { estado: "ok"; avisos: TopeExcedido[]; siguienteCiclo: string /* AAAA-MM-DD, P10 */ }
  | { estado: "forbidden" } | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "not_found" } | { estado: "archivado" } | { estado: "custom_de_otra_empresa" };
```

**`PlanesService.asignar` (R29–R31, R36).** Mismo orden de SL-24: quién → zod → existe → reglas →
repositorio. Si trae `inicioCiclo`: fuera de `rangoDelInicioDelCiclo(this.ahora())` →
`validation_error { inicioCiclo }` (R30); `empresa.planId !== null` → `validation_error { inicioCiclo }`
(R31). Las dos, antes del repositorio. Pasa al repositorio `inicio: { fecha, ancla: Date | "ahora" }`
(`anclaDeLaFechaElegida`). El `ok` devuelve los `avisos` del repositorio.

**`PlanesService.previsualizarAsignacion(actor, input)` (R37).** Superadmin o `forbidden` sin tocar el
repositorio; mismas validaciones que `asignar` (R30, R31, existe, archivado, custom de otra empresa);
llama a `repo.vistaPreviaAsignacion` y devuelve sus avisos de órdenes y `siguienteCiclo`
(`fechaCalendarioCR(inicioDelSiguienteCiclo(...))`).

**`PlanesRepository.asignar(organizacionId, planId, actorUsuarioId, inicio?)`.** Dentro de la misma
transacción y cerrojos de hoy:

1. Si `inicio` y la empresa ya tiene plan bajo el `FOR UPDATE` → `{ estado: "validation_error",
   fieldErrors: { inicioCiclo: [...] } }` sin escribir (R31, carrera). `ResultadoAsignar` suma ese caso.
2. Uso con el ciclo candidato: `usoDe` gana un parámetro opcional `{ ancla, cortoDesde }` y calcula las
   órdenes con `plan_inicio_ciclo_en_curso(cortoDesde, ancla, now() AT TIME ZONE 'UTC')`, donde
   `ancla = now()` UTC si es `"ahora"` y `cortoDesde = now()` UTC solo si `ancla > now()` UTC. Sin
   candidato, las columnas de la empresa (con `COALESCE(ancla, now)`, como hoy).
3. `excedidosDe` igual que hoy. **Solo en la primera asignación con `inicio`:** los excedidos de
   `ordenes` pasan a `avisos` y no rechazan (R36); los de roles y API keys siguen rechazando con
   `tope_excedido` (SL-24 R12; P7). Sin `inicio` o en un cambio de plan: exactamente como hoy.
4. `UPDATE "organizacion" SET "plan_id", "plan_ciclo_ancla_at" = COALESCE("plan_ciclo_ancla_at", <ancla>),
   "plan_ciclo_corto_desde_at" = <cortoDesde o NULL>` en una sola sentencia; el `now()` es el de la base
   (escala de `orden.created_at`, decisión de SL-24 del 2026-10-28).
5. `plan_asignado` con `valorNuevo: inicio.fecha` (R39; cabe en `VarChar(60)` y es de formato cerrado);
   sin `inicio`, `null` como hoy.

**`PlanesRepository.vistaPreviaAsignacion(organizacionId, planId, inicio)`.** En `comoPlataforma`, sin
cerrojos ni escrituras: el mismo paso 2 y la parte de órdenes del 3 sobre el tope del plan, más el
siguiente inicio de ciclo calculado con `inicioDelSiguienteCiclo` sobre el ancla candidata y el `now()`
de la base. Es lectura: la autoridad sigue siendo el trigger. El `motivo` de `PlanesRepository` en
`EXCEPCIONES_DE_PLATAFORMA` suma «y la vista previa de la primera asignación (SLT-58 §11)».

**Action (`lib/actions/planes.ts`).** `asignarPlanAction` no cambia de firma (`input: unknown`).
Nueva `previsualizarAsignacionPlanAction(input: unknown)`, con el mismo `conServicio`. Aquí sí hace
falta una action de lectura (cf. §9 alternativa 5): la fecha la elige el superadmin en el modal, después
de que la página se pintó. Tiene pantalla desde el primer commit (guardia `superficie-de-uso`).

**«Mi plan» y detalle (R40).** `plan_de_la_empresa` devuelve `ciclo_corto_desde`; `MiPlanRepository`
lo valida con zod (`instanteUtcSchema.nullable()`). `PlanesRepository.planDeEmpresa` lee
`planCicloCortoDesdeAt`. El uso de órdenes ya llega calculado por la base con la envoltura; la pantalla
solo cambia por la corrección de `inicioDelSiguienteCiclo`.

### 11.5 Pantalla: modal de primera asignación (`PlanEmpresa.tsx`)

- La página pasa `rangoInicioCiclo = rangoDelInicioDelCiclo(new Date())` (calculado en el servidor, sin
  depender del reloj del navegador) y `previsualizarAsignacion` (la action) por props.
- En el modal: título `primeraTitulo`, la lista de topes y módulos de hoy, un campo de fecha
  (`<Input type="date">` dentro de `FormField`, como «A partir de» de `PlanForm`) con `hoy` por defecto y
  `min`/`max` del rango, y la frase `cicloEmpiezaEl` con la fecha elegida (R38).
- Al abrir y en cada cambio de fecha, llama a `previsualizarAsignacion`. Mientras está en vuelo,
  «Asignar plan» está deshabilitado. Con avisos, pinta `ordenesYaPasadas` por cada uno, con
  `formatearConteo` (R37). Si falla, P11: `vistaPreviaNoCargo` con «Reintentar» y «Volver», sin
  confirmar.
- Confirmar envía `{ organizacionId, planId, inicioCiclo }`. `validation_error` de `inicioCiclo` se pinta
  junto al campo (R18). Un `ok` con avisos muestra los avisos en el toast de éxito o bajo la sección, con
  el mismo texto.
- «Cambiar plan» (empresa con plan) no muestra el campo ni envía `inicioCiclo` (R31).

### 11.6 R8: 404 HTTP real en `/mi-plan`

El test previsto se amplía en el E2E (`e2e/planes-superadmin.spec.ts`): la respuesta de `page.goto`
para el `mensajero` de A tiene `status() === 404`, además del texto. Hoy da 200 porque el `loading.tsx`
del segmento empieza el streaming antes del `notFound()`. El arreglo lo elige el implementer (decisión
del humano: no se diseña de más); la restricción es que la comprobación siga en el servicio (R8) y que
`tests/integration/mi-plan-page.test.tsx` siga en verde.

### 11.7 Tests nuevos o ampliados

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/unit/services/planes-service-inicio-ciclo.test.ts` | unit (reloj fijo, doble del repo) | R29, R30, R31, R36, R37 |
| `tests/unit/utils/ciclo-plan.test.ts` (casos nuevos) | unit | R30 (`rangoDelInicioDelCiclo`), R35 |
| `tests/unit/planes/consumo.test.ts` (casos nuevos) | unit | R40 |
| `tests/integration/db/_fixtures/ciclo-corto.ts` | tabla compartida | R35 |
| `tests/integration/db/plan-ciclo-corto.test.ts` | integración | R34, R35 |
| `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` | integración | R31, R32, R33, R34, R36, R37, R39 |
| `tests/integration/db/plan-de-la-empresa.test.ts` (casos nuevos) | integración | R40 (y los casos actuales pasan a comparar con `plan_inicio_ciclo_en_curso`) |
| `tests/integration/db/migracion-ciclo-elegido-ida-y-vuelta.test.ts` | integración | R41 |
| `tests/components/PlanEmpresa.test.tsx` (casos nuevos) | componente | R29, R37, R38 |
| `tests/components/MiPlanModule.test.tsx` (caso nuevo) | componente | R40 |
| `e2e/planes-superadmin.spec.ts` (aserción nueva) | E2E | R8 (404) |

La suite de SL-24 no se toca (R41, R25 salvo la excepción decidida).

### 11.8 Alternativas descartadas

1. **Sin columna nueva: durante el ciclo corto, contar desde `ancla − 1 mes`.** Elegida el 5 de
   noviembre el 29 de octubre, el ciclo «en curso» sería del 5 de octubre al 5 de noviembre y contaría
   24 días de órdenes de antes de tener plan. La decisión dice que el primer ciclo va «de hoy hasta esa
   fecha». Descartada.
2. **Sin columna nueva: leer el inicio del ciclo corto de la fila `plan_asignado` de `historial_accion`.**
   El trigger de órdenes tendría que leer el historial en cada alta (otra tabla, otro índice, otro
   cerrojo) y el historial es auditoría, no estado: un fallo al escribirlo cambiaría el tope. Descartada.
3. **Guardar como ancla la fecha de la asignación y una segunda columna con «el día elegido».** Obliga a
   reescribir `plan_inicio_ciclo` (la regla de SL-24 R20 y sus tests) para ciclos con dos anclas.
   Descartada: con la envoltura, la regla de R20 queda intacta y el ciclo corto es un caso previo.
4. **Cambiar la firma de `plan_inicio_ciclo` en lugar de envolverla.** Rompe los tests de SL-24 que la
   llaman con dos argumentos (`plan-ciclo.test.ts`, `plan-topes-ordenes.test.ts`,
   `planes-cambio-programado.test.ts`). Descartada (R41).
5. **Vista previa como modo «simular» de `asignarPlanAction` (`confirmar: false`).** Mezcla una lectura
   con una escritura en la misma action y en el mismo camino del repositorio con cerrojos `FOR UPDATE`;
   un error de bandera escribiría al previsualizar. Descartada: action y método de solo lectura propios.
6. **Validar el rango solo con `min`/`max` del campo de fecha.** El servidor no puede fiarse de la
   pantalla (decisión: validación en el service, con test). Descartada como única barrera; el campo los
   lleva solo por comodidad.

### 11.9 Zona y dependencias

- **Zona:** sigue `fullstack`: hay migración, repositorio y servicio (`backend_dev`) y modal y páginas
  (`frontend_dev`).
- **Dependencias:** ninguna nueva (R27). El campo de fecha es un `<input type="date">` con `Input` de
  `components/ui/`.
- **País:** la fecha visible y el «hoy» siguen en la hora de la plataforma (P8 de SL-24) hasta SL-21; el
  ancla se guarda en UTC.
