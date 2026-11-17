# SLT-129 — planes-borrador-servidor · design.md

## Lo que ya existe

Busqué «borrador», «draft», «guardar paso», «plan_borrador» y «pasos» en `feature_list.json`, en `specs/` y en
el código. El grafo no tiene índice de este worktree (`index_status`: proyecto no indexado), así que el código lo
revisé con Grep y Read.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» | La pantalla que usará este contrato | Fuera de alcance. Este spec le deja el contrato de §4. |
| SLT-135 «Planes: sin «De inmediato» al editar un plan» | Quita `vigenteDesde: null` al editar | Fuera de alcance. El paso `vigencia` acepta lo que acepte `editarPlanSchema` en cada momento, así que no depende de SLT-135 ni lo rompe. |
| SLT-130 «Planes: formulario por pasos compartido en un sheet (crear y editar)» (`specs/SLT-130-planes-form-pasos/design.md` §4–§5) | Los ids de los pasos, el reparto de las claves de error por paso y la lista de descuentos de la UI | Se reutilizan los mismos ids de paso y las mismas claves de campo, para que `pasoDeLaClave` de SLT-130 lleve cada error a su paso sin cambios. |
| `lib/types/planes.ts` (`crearPlanSchema`, `editarPlanSchema`, `precioPlanSchema`, `topesPlanSchema`, `costoPorOrdenPorcentualSchema`, `descuentoPeriodoSchema`, `porcentajeSchema`) | Los esquemas de crear y editar | Los esquemas por paso se arman con estas piezas, no se copian (§3). |
| `PlanesService.crear` / `editar` y `PlanesRepository.crear` / `crearYAsignar` / `editar` / `programarCambio` | Crear un plan (también el custom con su asignación) y editarlo o programar el cambio con el mecanismo por empresa de SLT-128 | Confirmar un borrador los REUTILIZA: arma la petición y la pasa por ellos (§5). No se escribe otra vía de crear ni de programar. |
| `PlanCambioProgramado.planId @unique` (SL-24 R39) | Un solo pendiente por plan | Se copia la regla para el borrador de cambio: `plan_borrador.plan_id UNIQUE`. |
| Rastro y nombre del actor congelado (`nombreDelActor`, `ActorCongelado` en `PlanesRepository`) | Quién hizo qué, con el nombre del momento | Se reutiliza para «quién lo empezó». |
| `plan_descuento_periodo` (PK `plan_id, periodo`) | Un descuento por período | No se toca: un borrador no escribe en las tablas del plan. La regla «sin repetir» se repite en el esquema del paso (R7). |

Nada de lo encontrado ya guarda un borrador: la ficha no re-crea nada.

## 1. Modelo de datos

### 1.1 Tabla `plan_borrador` (de PLATAFORMA)

Una fila por borrador. `plan_id NULL` = borrador de creación; con valor = borrador de cambio de ese plan.

```sql
CREATE TABLE "plan_borrador" (
  "id"                      TEXT         NOT NULL PRIMARY KEY,
  "plan_id"                 TEXT         NULL,
  "pasos"                   JSONB        NOT NULL DEFAULT '{}',
  "iniciado_por_usuario_id" TEXT         NOT NULL,
  "iniciado_por_nombre"     VARCHAR(120) NOT NULL,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_borrador_plan_id_key" UNIQUE ("plan_id"),                       -- R5
  CONSTRAINT "plan_borrador_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,                                            -- R22
  CONSTRAINT "plan_borrador_pasos_objeto" CHECK (jsonb_typeof("pasos") = 'object'),
  CONSTRAINT "plan_borrador_pasos_conocidos"
    CHECK (("pasos" - ARRAY['general','precio','orden','topes','modulos','vigencia']) = '{}'::jsonb),
  CONSTRAINT "plan_borrador_vigencia_solo_cambio"
    CHECK ("plan_id" IS NOT NULL OR NOT ("pasos" ? 'vigencia'))
);
ALTER TABLE "plan_borrador" ENABLE ROW LEVEL SECURITY;   -- sin políticas (R23)
REVOKE ALL ON "plan_borrador" FROM servi_app;            -- como el resto de plan_* (R23)
```

- **`pasos`**: `{ "<idPaso>": <valores del paso tal como se validaron> }`. La lista de pasos guardados son sus
  claves. Guardar un paso es `pasos || jsonb_build_object(<idPaso>, <valores>)`: la mezcla de primer nivel de
  `jsonb` reemplaza solo esa clave, en una sola sentencia, así que dos guardados de pasos distintos a la vez no
  se pisan (R4).
- **`plan_id`**: `UNIQUE` admite varios `NULL` (varios borradores de creación, sin límite: decisión cerrada del 2026-11-17) y uno solo
  por plan (R5). El primer guardado de un cambio es
  `INSERT … ON CONFLICT ("plan_id") DO UPDATE SET pasos = plan_borrador.pasos || EXCLUDED.pasos, updated_at = now()`:
  dos primeros guardados simultáneos dejan una fila y conservan el iniciador del primero.
- **`iniciado_por_*`**: opacos y sin FK, como `plan_rastro.actor_*`. El nombre se congela con el mismo helper
  del rastro.
- **Sin `organizacion_id`**: es de plataforma, como `plan` y `plan_cambio_programado`. La empresa de un custom
  viaja dentro de `pasos.general.organizacionId`, sin FK: si la empresa desaparece, confirmar da `not_found`
  (R19) y el borrador se puede descartar.
- **Prisma**: modelo `PlanBorrador` (`@@map("plan_borrador")`) con la relación opcional a `Plan`
  (`borradorDeCambio PlanBorrador?` en `Plan`). Los `CHECK`, la RLS y el `REVOKE` viven solo en el SQL, y el
  comentario del modelo lo dice, como en los demás `plan_*`.
- **Clasificación**: `{ modelo: "PlanBorrador", tabla: "plan_borrador" }` en la lista de plataforma de
  `lib/db/modelos-de-negocio.ts`, junto a los demás modelos de planes (si no, la guardia
  `organizacion-en-modelos` pone el gate en rojo).

### 1.2 Migración `db/migrations/20261117120000_plan_borrador/`

- `migration.sql`: `BEGIN; CREATE TABLE …; ENABLE RLS; REVOKE ALL …; COMMIT;`, escrita a mano como
  20261114120000 (`db:migrate:create` falla con P3006 en este repo). Prefijo posterior a la mayor de `dev`
  (20261116120000_pago_plataforma_confirmacion); si al rebasar aparece otra con el mismo prefijo, se sube.
- `down.sql`: `DROP TABLE IF EXISTS "plan_borrador";` (la RLS, el `REVOKE`, los `CHECK` y la FK caen con ella).
- No toca ninguna tabla existente, así que el down no repone nada más (R24).

### 1.3 Por qué los borradores no se filtran en ninguna lectura

Un borrador de creación NO es una fila de `plan`. Asignables, públicos, carrusel de «Mi plan», catálogo del
superadmin, facturación, cobro, trabajos y funciones `SECURITY DEFINER` leen `plan` y no ven nada nuevo:
R11 se cumple por construcción, sin un `WHERE` nuevo en ninguna lectura. Un borrador de cambio tampoco
escribe en `plan`, `plan_cambio_programado` ni sus tablas hijas, así que no hay nada que programar, aplicar ni
avisar hasta confirmar (R12). Ver alternativa A (§8).

**El id.** El plan que nace de un borrador de creación toma el id del borrador: `crearEnTx` recibe un `id`
opcional. Así la pantalla de SLT-144 conserva la misma referencia del «plan en borrador» al plan creado.

## 2. Autorización, módulo y país

- **Autorización**: en el servicio, antes de validar y antes de tocar la base, con el `esSuperadmin` de
  `PlanesService` (`esPlataforma(actor.rol)`). Cualquier otro rol o sin sesión: `forbidden` (R1). El actor
  sale de la sesión en la action (`resolveActorFromSession`), nunca del cliente.
- **Módulo**: ninguno. La action nueva va al núcleo: `"plan-borrador": "nucleo"` en `lib/modulos/reparto.ts`,
  junto a `planes`.
- **Aislamiento**: los métodos nuevos viven en `PlanesRepository`, que ya está en
  `EXCEPCIONES_DE_PLATAFORMA` con la ficha `SL-24`. Solo se amplía el texto de su `motivo` («…; y los
  borradores del superadmin (SLT-129)»). No se añade una excepción nueva: la lista solo puede bajar.
- **País**: nada nuevo. Los importes viajan como texto sin moneda (los esquemas de hoy) y las fechas como
  `AAAA-MM-DD`.

## 3. Esquemas por paso — `lib/types/plan-borrador.ts`

```ts
export const PASOS_DE_CREAR  = ["general", "precio", "orden", "topes", "modulos"] as const;
export const PASOS_DE_EDITAR = ["general", "precio", "orden", "topes", "modulos", "vigencia"] as const;
export type IdPasoBorrador = (typeof PASOS_DE_EDITAR)[number];
```

Cada paso se valida con un objeto `.strict()` hecho con las piezas exportadas de `lib/types/planes.ts`. Para
no copiar los `.refine` de `crearPlanSchema`, se exportan de allí, sin cambiar su comportamiento, las reglas
que hoy son internas (`unSoloModo`/`UN_SOLO_MODO`, `nombreSchema`, `fechaSchema`, `modulosSchema` y los
cuatro refines de visibilidad/empresa/tipo/fechas de `crearPlanSchema` como constantes con su `path` y su
`error`). `crearPlanSchema` pasa a usarlas: misma salida, mismos mensajes (R21).

| Paso | Al crear | Al editar | Reglas del paso (R6) |
|---|---|---|---|
| `general` | `nombre`, `visibilidad`, `organizacionId`, `tipoCobro?`, `inicioCiclo?`, `vigenteDesde?` | `nombre` | Al crear, los refines de hoy que solo miran estos campos: custom ⇔ empresa, empresa ⇔ tipo de cobro, `inicioCiclo` y `vigenteDesde` solo en custom y no los dos. |
| `precio` | `precio` (con descuentos en lista) | igual | R7 (abajo). |
| `orden` | `costoPorOrden`, `costoPorOrdenPorcentual`, `periodicidadOrdenes` | igual | `unSoloModo`. `periodicidadOrdenes` obligatoria (el formulario la manda siempre). |
| `topes` | `topes` (`topesPlanSchema`) | igual | Las de `topesPlanSchema`. |
| `modulos` | `modulos` | igual | Sin repetidos. |
| `vigencia` | — | `vigenteDesde` (lo que acepte `editarPlanSchema.shape.vigenteDesde`) | Solo el formato. «No antes de hoy» y «posterior a ahora si no cambia el precio» van al confirmar (R6, R19). |

Lo que NO se mira al guardar un paso (R6): que la empresa exista, el rango de `inicioCiclo` y `vigenteDesde`,
«solo en la primera asignación», los topes ya pasados y tipo `quincenal` con facturación `mensual` (cruza
`general` y `orden`). Todo eso lo mira confirmar con las reglas de hoy, y sus claves llevan al paso por
`pasoDeLaClave` de SLT-130.

**Descuentos en lista (R7).**

```ts
type LineaDeDescuento = { periodo: TipoCobro; tipo: "monto" | "porcentaje"; valor: string };
type PrecioDelBorrador =
  | { tipo: "sin_precio" }
  | { tipo: "monto"; mensual: string; descuentos: LineaDeDescuento[] };
```

- `sin_precio` es `.strict()`: traer `descuentos` da `validation_error` en `precio`.
- Un período repetido da el error en `precio.descuentos.<período>` (la clave del `fieldset` de la línea en
  SLT-130). Con períodos únicos, la lista cabe en 4 líneas como mucho.
- Para validar los valores, la lista se convierte con `descuentosDeLaLista` (§5) en el
  `Partial<Record<TipoCobro, DescuentoPeriodo>>` de hoy y se pasa por `precioPlanSchema`. Así los errores salen
  en `precio.descuentos.<período>.<monto|porcentaje>`, las mismas claves que hoy, con los mismos mensajes.
- Se guarda la LISTA, en el orden en que llegó, para devolverla igual (R9).

**Entrada de guardar (`guardarPasoBorradorSchema`)**, discriminada por `modo` y luego por `paso`:

```ts
| { modo: "crear";  borradorId: string /* uuid */ | null; paso: IdPasoDeCrear;  valores: ValoresDelPaso }
| { modo: "editar"; planId: string /* uuid */;            paso: IdPasoDeEditar; valores: ValoresDelPaso }
```

`modo: "crear"` con `borradorId: null` y `paso !== "general"` → `validation_error` en `paso` (R3). Los errores
de `valores` se devuelven SIN el prefijo `valores.`: la clave es la del campo (`nombre`,
`precio.descuentos.anual.porcentaje`, `topes.porRol.admin`…), igual que en `crearPlanAction`.

## 4. Contrato de servidor (para SLT-144)

Todas en `lib/actions/plan-borrador.ts` (`"use server"`), con el patrón de `lib/actions/planes.ts`: el actor sale
de la sesión, la entrada llega `unknown` y la valida el servicio, y `deps` inyectable para los tests.

| Action | Entrada | Resultado |
|---|---|---|
| `guardarPasoBorradorAction` | §3 | `{ estado: "ok"; borradorId; pasosGuardados: IdPasoBorrador[]; actualizadoAt: string }` · `forbidden` · `validation_error` · `not_found` (plan del cambio) · `archivado` · `borrador_no_encontrado` |
| `leerBorradorAction` | `{ borradorId: uuid }` o `{ planId: uuid }` | `{ estado: "ok"; borrador: BorradorVista \| null }` · `forbidden` · `validation_error` |
| `descartarBorradorAction` | `{ borradorId: uuid }` | `{ estado: "ok" }` · `forbidden` · `validation_error` · `borrador_no_encontrado` |
| `confirmarBorradorAction` | `{ borradorId: uuid }` | `PlanResult` (el de `crearPlanAction`/`editarPlanAction`, con `planId` = el plan creado o editado) · `{ estado: "pasos_pendientes"; pasos: IdPasoBorrador[] }` · `borrador_no_encontrado` |

Y una lectura de servidor sin action, para la página de la lista (como `catalogo`):
`PlanBorradorService.borradores(actor)` → `{ estado: "ok"; borradores: BorradorResumen[] }` · `forbidden`.

```ts
type BorradorVista = {
  id: string;
  modo: "crear" | "editar";
  planId: string | null;
  pasos: Partial<Record<IdPasoBorrador, ValoresDelPaso>>;   // tal como se guardaron (R9)
  pasosGuardados: IdPasoBorrador[];                          // en el orden del formulario
  iniciadoPor: string;                                       // nombre congelado
  iniciadoAt: string; actualizadoAt: string;                 // ISO 8601
};
type BorradorResumen = Omit<BorradorVista, "pasos" | "pasosGuardados"> & { nombre: string | null };  // R10
```

`leerBorradorAction` es una action de lectura, como `previsualizarAsignacionAction`: el borrador que se abre lo
elige el superadmin después de pintar la página (el Sheet de SLT-130 se abre en cliente). Las demás lecturas
de planes siguen sin action.

**Lectura defensiva.** Al leer, cada paso guardado se vuelve a pasar por su esquema. Si uno ya no valida (porque
el esquema cambió después de guardarlo), no sale en `pasos` ni en `pasosGuardados`: la pantalla lo pedirá otra
vez y confirmar dará `pasos_pendientes`. Nada se borra.

## 5. Servicio y repositorio

### 5.1 `lib/planes/borrador.ts` (puro)

- `pasosDelModo(modo)`, `pasosQueFaltan(modo, guardados)` (R16, en el orden del formulario).
- `descuentosDeLaLista(lineas)` → `Partial<Record<TipoCobro, DescuentoPeriodo>>`.
- `peticionDeCrear(pasos)` → la entrada de `crearPlanSchema` (`general` + `precio` con la lista convertida +
  `orden` + `topes` + `modulos`).
- `peticionDeEditar(planId, pasos)` → la entrada de `editarPlanSchema` (`planId`, `nombre` de `general`, …,
  `vigenteDesde` de `vigencia`).
- `class BorradorNoEncontrado extends Error`: el repositorio la lanza dentro de la transacción para
  deshacerla (R20).

### 5.2 `PlanBorradorService` (`lib/services/`, interfaz en `lib/interfaces/services/IPlanBorradorService.ts`)

Constructor: `(repo: IPlanBorradorRepository, planes: IPlanesService)`. Orden fijo, como `PlanesService`:
quién (R1) → zod (R3, R6, R7) → existencia y reglas → repositorio.

- `guardarPaso`: valida; en `editar`, lee el plan (`not_found`, `archivado`, R8) y llama
  `repo.guardarPasoDeCambio(planId, paso, valores, actor)`; en `crear`, `repo.crearBorrador(valores, actor)`
  si `borradorId` es `null`, o `repo.guardarPasoDeCreacion(borradorId, paso, valores)`. El repositorio repite
  la comprobación del plan bajo `FOR SHARE` (archivar toma `FOR UPDATE`).
- `leer`, `borradores`, `descartar`: directos al repositorio.
- `confirmar(actor, { borradorId })`:
  1. `repo.borrador(id)`; sin fila → `borrador_no_encontrado`.
  2. `pasosQueFaltan` → `pasos_pendientes` (R16).
  3. `this.planes.crear(actor, peticionDeCrear(pasos), { borradorId })` o
     `this.planes.editar(actor, peticionDeEditar(planId, pasos), { borradorId })`: la validación completa y
     todas las reglas de hoy, sin duplicarlas (R17–R19).
  4. `BorradorNoEncontrado` → `borrador_no_encontrado` (R20). Cualquier otro resultado pasa tal cual.

### 5.3 Cambios en `PlanesService` / `IPlanesService`

`crear(actor, input, opciones?: { borradorId: string })` y `editar(actor, input, opciones?)`. Sin `opciones`,
el comportamiento es el de hoy (R21); las actions de `lib/actions/planes.ts` no lo pasan. Con `opciones`, el
servicio lo entrega al repositorio en `crear`, `crearYAsignar`, `editar` y `programarCambio`.

### 5.4 Repositorio: `PlanesRepository` implementa también `IPlanBorradorRepository`

Métodos nuevos (`crearBorrador`, `guardarPasoDeCreacion`, `guardarPasoDeCambio`, `borrador`,
`borradorDelPlan`, `borradores`, `descartar`), todos con `comoPlataforma("SL-24", …)`.

**Consumir el borrador al confirmar** (`consumirBorrador`, privado), en la transacción de `crearEnTx`,
`crearYAsignar`, `editar` y `programarCambio` cuando llega `borradorId`:

1. al EMPEZAR la transacción, `SELECT "id" FROM "plan_borrador" WHERE "id" = $1 FOR UPDATE`; sin fila → lanza
   `BorradorNoEncontrado`. Dos confirmaciones a la vez se ordenan aquí: la segunda espera, no encuentra la
   fila y se deshace sin crear nada (R20);
2. al TERMINAR, solo en el camino `ok`, `DELETE FROM "plan_borrador" WHERE "id" = $1`. Un rechazo que el
   repositorio devuelve como valor (`archivado`, `cambio_a_medias`, `tope_excedido`…) no borra el borrador
   (R19).

El rastro, los avisos, las recepciones de SLT-128 y los trabajos de correo son los que ya escriben esos
métodos: este spec no los toca (R17, R18).

## 6. Rastro y correos

- Guardar y descartar no llaman a ningún escritor de `plan_rastro`, de `plan_cambio_programado` ni de `jobs`
  (R12, R13).
- Confirmar deja exactamente las filas que dejan hoy `crear` (`creado`) y `editar` (`editado` o
  `cambio_programado`), con sus correos y recordatorios de siempre (R17, R18).

## 7. Guardia nueva — `tests/unit/guards/plan-borrador-sin-caducidad.guardia.test.ts` (R15)

Barrido estático de `lib/` y `app/` sin comentarios, como `planes-sin-borrado`:
- `DELETE FROM "plan_borrador"`, `TRUNCATE "plan_borrador"` y `planBorrador.delete*` solo en
  `lib/repositories/PlanesRepository.ts`;
- ningún archivo de trabajos o crons (`lib/planes/jobs-*.ts`, `app/api/cron/**`) nombra `plan_borrador` ni
  `planBorrador`.
Con contraprueba sobre texto en memoria, para que un detector roto no pase en verde.

## 8. Alternativas descartadas

- **A. Un estado `borrador` en la tabla `plan`** (columna `estado` o `borrador_at`, y la edición en
  `plan_cambio_programado` con una marca). Daba un id estable sin más y la marca «Borrador» en el catálogo
  gratis. Se descarta por tres razones:
  1. Obligaba a filtrar el borrador en cada lectura de `plan`: asignables, públicos, carrusel, catálogo,
     `EmpresasPlataformaRepository`, facturación, cobro, trabajos y las funciones `SECURITY DEFINER` que leen el
     plan de una empresa. Una lectura olvidada dejaría asignar o cobrar un plan a medias, y hoy no hay una
     guardia que lo vea.
  2. Un plan a medio llenar choca con los `CHECK` de `plan` y con la semántica de `NULL` = «sin tope» o «sin
     precio»: no distingue «sin tope» de «todavía no guardé Topes». Además hacía falta otra columna para los
     pasos guardados.
  3. Para el cambio, `plan_cambio_programado` ya lo leen el aplicador, los recordatorios y
     `preciosQueRigenDesde`. Una marca de borrador ahí tendría el mismo problema de filtrar en cada lector.
  La tabla aparte deja intacto todo lo que hoy lee planes, y confirmar pasa por el único camino que ya está
  probado.
- **B. Una columna por paso** (`general jsonb`, `precio jsonb`, …). Es más explícita, pero añadir o quitar un
  paso en SLT-144 sería una migración. El `CHECK` de claves conocidas da la misma garantía con una sola
  columna, y la mezcla `||` sigue siendo atómica.
- **C. Guardar el borrador en el navegador** (`localStorage`). Lo descarta el Alcance: «se retoma desde
  cualquier dispositivo y otro superadmin lo ve».
- **D. Confirmar en dos pasos** (crear o programar, y después borrar el borrador en otra transacción). Es más
  simple, pero un fallo entre los dos deja un borrador ya confirmado que se podría confirmar otra vez y crear
  un plan duplicado. Con el `FOR UPDATE` + `DELETE` dentro de la misma transacción, eso no puede pasar (R20).
- **E. Un repositorio aparte (`PlanBorradorRepository.ts`)**. Era más limpio por archivo, pero necesitaba otra
  entrada en `EXCEPCIONES_DE_PLATAFORMA` (que solo puede bajar), y consumir el borrador tiene que ir dentro de
  las transacciones de `PlanesRepository` de todos modos. Se separa por interfaz (`IPlanBorradorRepository`),
  no por archivo.

## 9. Dependencias

Ninguna nueva: zod, Prisma y lo que ya hay.

## 10. Tests

| Archivo | Cubre |
|---|---|
| `tests/unit/types/plan-borrador-schema.test.ts` | R3, R6, R7 (esquemas por paso, claves de error) |
| `tests/unit/planes/plan-borrador.test.ts` | `pasosQueFaltan`, `descuentosDeLaLista`, `peticionDeCrear`, `peticionDeEditar` (R7, R16, R17, R18) |
| `tests/unit/services/plan-borrador-service.test.ts` | R1, R3, R6, R16, R19, R20 (con dobles) |
| `tests/unit/actions/plan-borrador.test.ts` | Composition root y actor de la sesión (R1), como `planes.composition-root.test.ts` |
| `tests/unit/guards/plan-borrador-sin-caducidad.guardia.test.ts` | R15 |
| `tests/integration/db/plan-borrador.test.ts` | R2, R4, R5, R8–R14, R22 (Postgres real, `HAY_BASE_DE_DATOS`) |
| `tests/integration/db/plan-borrador-confirmar.test.ts` | R17–R20 |
| `tests/integration/db/planes-acceso-servi-app.test.ts` (se amplía) | R23 |
| `tests/integration/db/migracion-plan-borrador-ida-y-vuelta.test.ts` | R24 |
| Suites de planes de hoy, sin tocar sus aserciones | R21 |

**E2E: ninguno** (decisión cerrada «¿E2E?»). Esta ficha no tiene pantalla. Toca `db/`, así que antes del PR se
corren en local los E2E de planes que ya existen (`e2e/planes-superadmin.spec.ts`, `e2e/planes-costeo.spec.ts`,
`e2e/planes-costo-porcentual.spec.ts`, `e2e/mi-plan-cambiar-plan.spec.ts`) para comprobar R21
(`docs/perfil-agentes.md > E2E en local antes del PR`).

## 11. Tamaño

Lo cuenta `tasks.md > Archivos esperados`: 26 archivos (tope 40; el 80% son 32).

- **Producción: ~900 líneas** (tope 1000; el aviso del 80% salta en 800). Por archivo: migración ~45,
  `lib/types/plan-borrador.ts` ~150, `lib/types/planes.ts` ~20 (exportar los refines), `lib/planes/borrador.ts`
  ~90, `PlanBorradorService` ~170, repositorio ~220, interfaces ~90, action ~70, y lo demás ~45.
- **Tests: ~1600 líneas** (tope 3000).

Es probable que salte el aviso del 80% en producción. Si se pasa de 1000, se corta R9–R10 (leer y listar) con
`leerBorradorAction` en una ficha aparte que vaya antes de SLT-144. Las escrituras y confirmar se mergean
solas y no dejan nada visible a medias, porque no hay pantalla.
