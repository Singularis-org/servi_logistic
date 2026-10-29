# SLT-58 — planes-superadmin-ui · design.md

> Requisitos: `requirements.md` (R1–R28). Se heredan las decisiones y el diseño de
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
| `cambioPendiente` | «Cambio programado desde {fecha}» + `TITULO_LINEAS_DE_CAMBIO` |
| rechazos | `forbidden` «No tienes permiso para esto.»; `not_found` «El plan o la empresa ya no existe.»; `archivado` «El plan está archivado.»; `custom_de_otra_empresa` «Ese plan es de otra empresa.»; `sin_cambio_programado` «El plan ya no tiene un cambio pendiente.»; `tope_excedido` → su `mensaje` |

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
