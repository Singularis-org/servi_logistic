# SLT-214 — planes-beneficios-texto · design.md

## Lo que ya existe

Busqué «beneficio», «ícono» e «icono» en `feature_list.json`, en `specs/` y en el código. El grafo no tiene índice de
este worktree, así que el código lo revisé con Grep y Read.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| SLT-215 «Planes: niveles de beneficio por volumen de órdenes» y SLT-216 «Planes: descuento por nivel en el cobro, la factura y «Mi plan»» | Las fichas hermanas, `pending`: niveles por volumen y descuento | No se tocan; están fuera (decisión cerrada). |
| «beneficio» en otros specs (`specs/48-…`, `specs/81-api-keys`…) | Otros dominios (devoluciones, API keys) | Nada que reutilizar. |
| `PlanModulo` y `modulos` en todo el flujo de planes (SL-24, SLT-128, SLT-129, SLT-144) | Una lista hija del plan que viaja en la versión programada, en `plan_version_empresa` y en `plan_de_la_empresa` | **Es el molde.** Los beneficios siguen el mismo camino que `modulos` en cada pieza. |
| `periodicidadOrdenes` opcional en `edicionDelPlan` (SLT-118) | El precedente de «ausente = sin cambio» en una versión guardada antes del campo | Se copia la regla para `beneficios` (R18). |
| `components/shared/planes/IconoDelModulo.tsx` y `ListaDeModulos` | Los íconos de los módulos en las tarjetas de «Mi plan» | Se copia la forma (decorativo, tipado a la tupla), no el código. Los beneficios usan `lucide-react`, no SVG propio. |
| `lib/geo/normalize.ts > collapseSpaces`, `stripDiacritics` | Recorte de espacios y quitar tildes | Se reutilizan para la clave de comparación de R4. |
| `lineasDeCambioDelPlan`, `diferenciasDelPlan`, `planCanonico` | Las líneas de «qué cambia» del aviso, el correo, el rastro y el detalle de empresa | Se amplían con `beneficios` (R19, R25). No se crea otro camino. |

Nada de lo encontrado hace ya lo que pide esta ficha.

## 1. Modelo de datos

### 1.1 Tabla `plan_beneficio` (de PLATAFORMA)

```prisma
// SLT-214 (design §1.1; R1, R6) — un beneficio de texto de un plan, en su posición. De PLATAFORMA, como
// `plan_modulo`. Viven solo en el SQL de 20261120120000: los CHECK de posición, texto e ícono, la RLS sin
// políticas y el `REVOKE ALL … FROM servi_app`.
model PlanBeneficio {
  planId   String @map("plan_id")
  plan     Plan   @relation(fields: [planId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  posicion Int
  icono    String
  texto    String @db.VarChar(120)

  @@id([planId, posicion])
  @@map("plan_beneficio")
}
```

En `Plan` se añade `beneficios PlanBeneficio[]`.

- **Sin `organizacion_id`.** Es de plataforma, como `plan_modulo` y `plan_tope_rol`. La guardia
  organizacion-en-modelos prohíbe esa columna en las tablas de plataforma.
- **RLS habilitada sin políticas y `REVOKE ALL ON "plan_beneficio" FROM servi_app` (R6).** La app no la lee
  directo. La empresa la lee por `plan_de_la_empresa`, que es `SECURITY DEFINER` y ya exige que el argumento sea la
  empresa del contexto (`42501` si no).
- **CHECK:**
  - `plan_beneficio_posicion_check`: `"posicion" >= 0`;
  - `plan_beneficio_texto_check`: `char_length("texto") BETWEEN 1 AND 120 AND "texto" = btrim("texto")`;
  - `plan_beneficio_icono_check`: `"icono" IN ('equipo','soporte','reloj_24h','rayo','estrella','escudo','cohete','regalo','grafica','camion','check','corazon')`.
- **Sin único por texto en la base.** R4 compara sin tildes, y en SQL eso pide `unaccent`. Esa función es `STABLE` y
  no sirve en un índice (ya se descartó en `20260731160000_orden_busqueda_trgm`). La regla vive en zod
  (`beneficiosSchema`), y todo lo que escribe pasa por ella: crear, programar y aplicar la versión.
- **El ícono es texto con CHECK, no un enum de Postgres.** Sigue el precedente de `periodicidad_ordenes`: ampliar el
  catálogo es cambiar un CHECK, no un `ALTER TYPE`.

### 1.2 En los JSON de versión

En `plan_cambio_programado.version`, `plan_version_empresa.version` y `plan_borrador.pasos`, los beneficios viajan
como `beneficios: [{ icono, texto }]`, en orden. La posición es el índice. No hay columna nueva.

### 1.3 Migración `db/migrations/20261120120000_plan_beneficio/`

**`migration.sql`:**
1. `CREATE TABLE "plan_beneficio"`, con la PK, los tres CHECK y la FK a `plan` con `ON DELETE CASCADE ON UPDATE
   CASCADE`. Después, `ENABLE ROW LEVEL SECURITY` y `REVOKE ALL … FROM servi_app`.
2. El `CHECK plan_borrador_pasos_conocidos` se borra y se crea otra vez con
   `ARRAY['general','precio','orden','topes','modulos','beneficios','vigencia']`.
3. `CREATE OR REPLACE FUNCTION plan_de_la_empresa`. El origen es `20261114120000_plan_cambio_por_empresa` y solo
   cambia una cosa: la clave `beneficios` (§3.4).

**`down.sql`:**
1. Restaura `plan_de_la_empresa` tal como la deja `20261114120000`.
2. `UPDATE "plan_borrador" SET "pasos" = "pasos" - 'beneficios'`, y el CHECK vuelve a tener sus seis pasos.
3. Quita la clave `beneficios` de `plan_cambio_programado.version` y de `plan_version_empresa.version` con
   `version - 'beneficios'`. El esquema de antes es `.strict()` y rechazaría la versión al aplicarla.
4. `DROP TABLE "plan_beneficio"`.

Bajar la migración pierde los beneficios a sabiendas: el esquema de antes no tiene dónde guardarlos. Se dice en el
comentario de cabecera del `down.sql`.

## 2. Autorización, módulo y país

- **Quién:**
  - Configura solo el superadmin, por las actions del borrador (SLT-129), que ya responden `forbidden`.
  - Lee el superadmin por las lecturas de plataforma de siempre (`comoPlataforma("SL-24", …)`).
  - La empresa lee por `plan_de_la_empresa` y por `MiPlanCambioService.verPlanes`. Este último ya exige el rol de
    «Mi plan».

  No hay action nueva.
- **Módulo:** ninguno. Planes es núcleo.
- **País:** nada. Los textos los escribe el superadmin y no llevan moneda ni geografía.

## 3. Servidor

### 3.1 Catálogo y esquemas (`lib/planes/beneficios.ts`, NUEVO, sin React)

```ts
export const ICONOS_DE_BENEFICIO = ["equipo","soporte","reloj_24h","rayo","estrella","escudo",
  "cohete","regalo","grafica","camion","check","corazon"] as const;            // R5, en este orden
export type IconoDeBeneficio = (typeof ICONOS_DE_BENEFICIO)[number];
export const NOMBRE_DEL_ICONO: Record<IconoDeBeneficio, string>;               // «Equipo de trabajo», …
export type Beneficio = { icono: IconoDeBeneficio; texto: string };

export const TEXTO_VACIO = "Escribe el texto del beneficio.";
export const TEXTO_LARGO = "El texto del beneficio admite hasta 120 caracteres.";
export const BENEFICIO_REPETIDO = "Ya hay un beneficio con ese texto";
export function claveDelBeneficio(texto: string): string;   // stripDiacritics(collapseSpaces(t)).toLowerCase()
export const beneficioSchema = z.object({
  icono: z.enum(ICONOS_DE_BENEFICIO),
  texto: z.string().trim().min(1, TEXTO_VACIO).max(120, TEXTO_LARGO),
}).strict();
export const beneficiosSchema = z.array(beneficioSchema).superRefine(sinRepetidos); // R4: issue en [j, "texto"]
export function cambiosDeBeneficios(antes: readonly Beneficio[], despues: readonly Beneficio[]): string[]; // R25
```

- **`claveDelBeneficio`:** quitar tildes con `\p{Diacritic}` también quita la virgulilla de la «ñ», así que «Año» y
  «Ano» dan la misma clave. Para R4 se acepta: es lo que pide «ignora tildes» y es un caso raro.
- **`cambiosDeBeneficios`:** usa `claveDelBeneficio`.
  - Una línea «Se agrega: <texto de después>» por cada clave que solo está después, en el orden de después.
  - Una línea «Se quita: <texto de antes>» por cada clave que solo estaba antes, en el orden de antes.
  - Si no hay ninguna de las dos pero las listas difieren, una sola línea: «Cambian los íconos o el orden de los
    beneficios.» (P8).

### 3.2 Tipos (`lib/types/planes.ts`)

- `crearPlanSchema`: `beneficios: beneficiosSchema.optional()`. Ausente es «sin beneficios». Así no hay que tocar
  las peticiones de los tests que no lo conocen; el borrador lo manda siempre.
- `edicionDelPlan`: `beneficios: beneficiosSchema.optional()`. Ausente es «sin cambio» (R18), igual que
  `periodicidadOrdenes`. `versionPlanSchema` lo hereda.
- `VersionPlan` añade `"beneficios"` al `Pick`.
- `PlanDTO.beneficios?: Beneficio[]`. Las lecturas del repositorio lo llenan siempre. Es opcional en el tipo por la
  misma razón que `periodicidadOrdenes`: no tocar los dobles de `PlanDTO` de los tests. Ausente es `[]`.
- `PlanVista` añade `"beneficios"` al `Pick`.

### 3.3 Repositorio de planes (`lib/repositories/PlanesRepository.ts`)

- `INCLUIR` añade `beneficios: { select: { icono: true, texto: true }, orderBy: { posicion: "asc" } }`, y `aDTO`
  llena `beneficios` validando cada `icono` con `z.enum(ICONOS_DE_BENEFICIO)`. Con eso lo tienen el catálogo, el
  detalle, `publicos()` y `plan()`.
- `crearEnTx`: `beneficios: { create: (input.beneficios ?? []).map((b, posicion) => ({ posicion, ...b })) }`, y
  `creado.beneficios` con la misma lista (R15).
- `aplicarVersion`: si `version.beneficios !== undefined`, `deleteMany` y luego `createMany` con la posición como
  índice (R17). Si es `undefined`, no se toca la lista (R18).
- `versionDelPlan(plan)`: añade `beneficios: plan.beneficios ?? []`. Es la versión que se escribe en
  `plan_version_empresa` para las empresas que siguen la del plan.
- `comoLaCorre` y `versionCompleta` no cambian: el spread ya respeta «ausente = la del plan».
- Programar no cambia: la `version` es `versionPlanSchema`, que ya trae los beneficios.

### 3.4 `plan_de_la_empresa` y «Mi plan» (R16, R18, R23)

La clave nueva en el `jsonb_build_object`:

```sql
'beneficios', CASE WHEN v_version IS NULL OR NOT (v_version ? 'beneficios') THEN
                COALESCE((SELECT jsonb_agg(jsonb_build_object('icono', b."icono", 'texto', b."texto") ORDER BY b."posicion")
                            FROM "plan_beneficio" b WHERE b."plan_id" = p."id"), '[]'::jsonb)
              ELSE v_version -> 'beneficios' END,
```

- `MiPlanRepository`: `planDeLaEmpresaFilaSchema` añade `beneficios: z.array(beneficioSchema)`, y `aLeido` lo pasa a
  `vigente.beneficios`.
- `lib/planes/consumo.ts > planConConsumo` añade `beneficios: vigente.beneficios ?? []` a `PlanConConsumo`, en
  `lib/types/consumo-plan.ts`.
- El cambio pendiente de la empresa (`cambio.version`) ya pasa por `versionPlanSchema`, así que trae sus beneficios
  sin tocar nada más.

### 3.5 Lista de planes para cambiar (R24)

`MiPlanCambioService > vista(p)` añade `beneficios: p.beneficios ?? []`. Los planes salen de `publicos()` y `plan()`,
que ya los traen por `INCLUIR`.

### 3.6 Rastro y líneas de cambio (R19, R25)

- `lib/planes/rastro.ts`:
  - `CampoDelPlan` y `CAMPOS` añaden `"beneficios"`, después de `"modulos"`;
  - `planCanonico` añade `beneficios: (p.beneficios ?? []).map(({ icono, texto }) => ({ icono, texto }))`, con el
    orden tal cual, porque el orden es dato;
  - `diferenciasDelPlan` con `antes === null` (alta) omite `beneficios` si la lista está vacía.

  **Decisión del spec:** un alta sin beneficios no tiene nada que contar, y omitirla deja intactas las aserciones
  exactas de las filas `creado` que ya existen (`planes-historial`, `planes-lecturas-plataforma`,
  `plan-borrador-confirmar`…).
- `lib/planes/mensajes.ts`:
  - `CambioDelPlanParaCorreo.beneficios?: { antes: readonly Beneficio[]; despues: readonly Beneficio[] }`;
  - `lineasDeCambioDelPlan` añade `cambiosDeBeneficios(antes, despues)` después de los módulos.

  El correo (`lib/services/email/plantillas/cambio-plan.ts`) y el job (`jobs-cambio-plan.ts`, que valida `cambios`
  como `record` abierto) no cambian: reciben la clave nueva tal cual.
- `PlanDetalle > lineasDelRastro`:
  - un alta pinta «Beneficios: t1, t2, …»;
  - una edición pasa `beneficios` a `lineasDeCambioDelPlan`.

### 3.7 Borrador del servidor (`lib/types/plan-borrador.ts`, `lib/planes/borrador.ts`)

- `PASOS_DE_CREAR = [..., "modulos", "beneficios"]` y `PASOS_DE_EDITAR = [..., "modulos", "beneficios", "vigencia"]`.
- `beneficiosDelPasoSchema = z.object({ beneficios: beneficiosSchema }).strict()`. Se añade a `ESQUEMAS_DE_CREAR` y
  a `ESQUEMAS_DE_EDITAR`, a las dos uniones de `guardarPasoBorradorSchema` y a `ValoresDelPaso`, y se exporta
  `ValoresDeBeneficios`. `PasosDeCrear` añade `beneficios`.
- `peticionDeCrear` y `peticionDeEditar` añaden `beneficios: pasos.beneficios.beneficios`.
- `pasosQueFaltan` ya sale de las tuplas. Un borrador sin `beneficios` da `pasos_pendientes` (R12) sin código nuevo.
- `PlanBorradorService` y su repositorio no cambian: guardan el paso por su clave, y el CHECK nuevo (§1.3) la acepta.

## 4. Cliente

### 4.1 Archivos

```
components/shared/planes/BeneficiosDelPlan.tsx      NUEVO: IconoDeBeneficio, ListaDeBeneficios (R5, R20–R24)
components/shared/planes/CarruselDePlanes.tsx       + ListaDeBeneficios plegable en TarjetaDePlan (R24)
app/(app)/plataforma/planes/_components/
  plan-form/PasoBeneficios.tsx      NUEVO: lista editable (R8, R9)
  plan-form/estado.ts               Formulario.beneficios, versionDe, pasosDe, camposEnOrden, pasoDeLaClave (R7, R10)
  plan-form/borrador.ts             valoresDelPaso / formDelBorrador del paso nuevo (R11)
  plan-form/textos.ts               textos (§6)
  plan-form/PasoRevisar.tsx         + fila «Beneficios» (R14)
  PlanForm.tsx                      monta PasoBeneficios en `case "beneficios"`
  PlanesModule.tsx                  columna «Beneficios» en Catalogo (R20, R21)
[planId]/_components/PlanDetalle.tsx  Dato «Beneficios» y líneas del rastro (R19, R22)
app/(app)/mi-plan/_components/PlanActivo.tsx  sección «Beneficios» (R23)
```

### 4.2 `BeneficiosDelPlan.tsx` (compartido: lo usan plataforma y «Mi plan»)

```ts
const ICONO: Record<IconoDeBeneficio, LucideIcon> = { equipo: Users, soporte: Headphones, reloj_24h: Clock, rayo: Zap,
  estrella: Star, escudo: Shield, cohete: Rocket, regalo: Gift, grafica: ChartColumn, camion: Truck, check: Check, corazon: Heart };
export function IconoDeBeneficio({ icono, className }): JSX.Element;            // aria-hidden, size-4
export function ListaDeBeneficios({ beneficios, plegable, vacio }: {
  beneficios: readonly Beneficio[];
  plegable?: number;          // 3 en el listado y en las tarjetas; ausente = todos (detalle, «Mi plan», Revisar)
  vacio?: string | null;      // «Sin beneficios» en las vistas del superadmin; null = no pinta nada
}): JSX.Element | null;
```

- **Lista:** un `<ul aria-label="Beneficios">`, y cada `<li>` con su ícono y el texto.
- **Plegado:**
  - estado local `abierta`;
  - con `beneficios.length > plegable`, un `Button variant="link"` «Mostrar más» o «Mostrar menos», con
    `aria-expanded` y `aria-controls` (id de `useId`);
  - el resto de `<li>` sale del DOM cuando la lista está plegada.

  El alto crece porque los `<li>` se añaden; no se anima.
- **En la tarjeta del carrusel:** el botón del plan cubre la tarjeta (`after:absolute after:inset-0`). La lista va en
  un contenedor `relative z-10`, para que «Mostrar más» se pueda pulsar sin seleccionar el plan.

### 4.3 Paso «Beneficios» (`PasoBeneficios.tsx`)

- **Estado:** `Formulario.beneficios: { clave: string; icono: IconoDeBeneficio; texto: string }[]`.
  - `clave` es un id local para el `key` de React; no viaja.
  - `inicial(plan, …)` la llena desde `plan.beneficios`.
  - `versionDe` manda `beneficios: f.beneficios.map(({ icono, texto }) => ({ icono, texto: texto.trim() }))`.
- **Cada fila tiene:**
  - un `Select` de `components/ui/select` con nombre accesible «Ícono del beneficio <n>», que en cada opción pinta el
    ícono y el nombre de R5;
  - un `Input` con nombre accesible «Texto del beneficio <n>» y `maxLength` 120;
  - tres botones de ícono: «Subir beneficio <n>», «Bajar beneficio <n>» y «Quitar beneficio <n>». Subir está
    deshabilitado en la primera fila y bajar en la última.
- **«Agregar beneficio»:** añade `{ icono: "check", texto: "" }` al final y pone el foco en su texto.
  **Decisión del spec:** el ícono por defecto es «Check». Elegir ícono no es obligatorio y siempre hay uno válido.
- **Vacío:** «Este plan no tiene beneficios.» y el botón de agregar (R9).
- **Errores:** `camposEnOrden` añade, después de `"modulos"`, `beneficios.<i>.icono` y `beneficios.<i>.texto` por
  cada fila. `pasoDeLaClave` lleva todo lo que empieza por `beneficios` al paso `beneficios`. Cada error se pinta con
  `FieldError` bajo su campo, igual que en los demás pasos.
- **Validación en el cliente:** la de hoy por paso, con el esquema del paso (`ESQUEMAS_DE_*["beneficios"]`), así que
  R4 sale antes de llamar al servidor.
- `estado.ts`: `IdPaso` añade `"beneficios"`, y `pasosDe` lo pone después de `modulos` con el título «Beneficios».
  `PASOS_QUE_SE_GUARDAN` sale de `pasosDe`, así que el contador «n de m pasos guardados» pasa solo a 6 al crear y a 7
  al editar.
- `borrador.ts`: `valoresDelPaso("beneficios")` devuelve `{ beneficios: version.beneficios }`, y `formDelBorrador`
  pone `beneficios` con claves locales nuevas.

### 4.4 Vistas

| Lugar | Qué pinta | Vacío |
|---|---|---|
| Listado del superadmin (`Catalogo`) | Columna «Beneficios», después de «Topes», con `plegable={3}`. Con `SOLO_DESDE_MD`, como Visibilidad, para que la tabla no se rompa en móvil | «Sin beneficios» |
| Detalle del plan (`PlanDetalle`) | `Dato` «Beneficios» después de «Módulos incluidos», con la lista completa | «Sin beneficios» |
| Revisar (`PasoRevisar`) | Fila «Beneficios» con la lista completa | «Sin beneficios» |
| «Mi plan» (`PlanActivo`) | Bloque «Beneficios» después de los módulos, con la lista completa | No se pinta |
| Tarjetas para cambiar de plan (`TarjetaDePlan`) | Después de `ListaDeModulos`, con `plegable={3}` | No se pinta |

**Decisión del spec:** en las vistas de la empresa, un plan sin beneficios no pinta nada. Un «Sin beneficios» ahí
sonaría a carencia del plan.

`components/shared/planes/DetalleDePlan.tsx` no cambia. La decisión nombra las tarjetas de la lista, y el detalle de
abajo compara precios y topes.

## 5. Alternativas descartadas

- **A. Guardar los beneficios en una columna `plan.beneficios jsonb`** en vez de una tabla hija. Ahorraba la tabla,
  la FK y el `include`. Se descarta por tres razones:
  1. Los CHECK de largo, de espacios y de ícono sobre cada elemento de un `jsonb` necesitan una función o un trigger.
     En una tabla son tres CHECK de una línea (R6).
  2. Rompe la simetría con `plan_modulo` y `plan_tope_rol`, que ya resuelven el mismo problema: una lista del plan
     que se reemplaza entera al aplicar una versión.
  3. `plan_de_la_empresa` y `aDTO` leerían dos formas distintas de lista según el campo.
- **B. Los beneficios como sección del paso «Módulos».** No tocaba el CHECK ni los E2E. Lo descartó el humano (P2):
  paso propio.
- **C. Un único por texto normalizado en la base** (columna generada con `lower(unaccent(btrim(…)))`). `unaccent` es
  `STABLE` y Postgres no la admite en una columna generada ni en un índice sin envolverla en una función `IMMUTABLE`
  falsa. El repo ya la descartó por eso en `20260731160000`. La regla queda en zod, que es por donde pasa toda
  escritura.
- **D. Ícono libre, cualquier nombre de `lucide-react`.** Daba más variedad, pero cargaría todo el paquete en el
  cliente y lo descarta la decisión cerrada: un catálogo fijo de 12.
- **E. Arrastrar y soltar para el orden.** Pedía una librería nueva (p. ej. `@dnd-kit`) o mucho código propio de
  accesibilidad. Los botones subir y bajar son accesibles por teclado y no añaden dependencias.

## 6. Textos nuevos

- **Paso:**
  - «Beneficios»;
  - «Agregar beneficio»;
  - «Este plan no tiene beneficios.»;
  - «Ícono del beneficio n», «Texto del beneficio n»;
  - «Subir beneficio n», «Bajar beneficio n», «Quitar beneficio n».
- **Validación:**
  - «Escribe el texto del beneficio.»;
  - «El texto del beneficio admite hasta 120 caracteres.»;
  - «Ya hay un beneficio con ese texto».
- **Vistas:**
  - columna y dato «Beneficios»;
  - «Sin beneficios»;
  - «Mostrar más», «Mostrar menos»;
  - en el rastro, «Beneficios: …».
- **Líneas de cambio:**
  - «Se agrega: <texto>»;
  - «Se quita: <texto>»;
  - «Cambian los íconos o el orden de los beneficios.» (P8).
- **Nombres de los íconos:** los de R5.

Se aprueban con el spec.

## 7. Dependencias

Ninguna nueva. `lucide-react` ya está (`package.json`: `^1.23.0`). Los 12 íconos (`Users`, `Headphones`, `Clock`,
`Zap`, `Star`, `Shield`, `Rocket`, `Gift`, `ChartColumn`, `Truck`, `Check`, `Heart`) están en el
`lucide-react.d.ts` instalado (1.75.0). T1 lo confirma con el typecheck.

## 8. Tests

| Archivo | Cubre |
|---|---|
| `tests/unit/planes/beneficios.test.ts` (nuevo) | R2–R5, `claveDelBeneficio`, `cambiosDeBeneficios` (R25) |
| `tests/unit/types/plan-borrador-schema.test.ts` (se amplía) | R10 en el esquema del paso; R7 en las tuplas |
| `tests/unit/planes/plan-form-borrador.test.ts` (se amplía) | R11: ida y vuelta del paso |
| `tests/unit/planes/rastro.test.ts` (se amplía) | R19: alta con y sin beneficios, y edición por texto, ícono u orden |
| `tests/integration/db/plan-beneficio.test.ts` (nuevo) | R1, R6 (CHECK y `servi_app` sin acceso), R15, R17, R18 |
| `tests/integration/db/migracion-plan-beneficio-ida-y-vuelta.test.ts` (nuevo) | Subir y bajar la migración, el CHECK de pasos y el `down.sql` de §1.3 |
| `tests/integration/db/plan-borrador-confirmar.test.ts` (se amplía) | R12, R15 y R16 (programar no toca la lista del plan) |
| `tests/integration/db/planes-version-por-empresa.test.ts` (se amplía) | R16 y R23: la empresa que recibió ve la versión nueva y la que no, la anterior |
| `tests/integration/db/mi-plan-repository.test.ts` (se amplía) | R23, y R18 con una versión propia sin `beneficios` |
| `tests/unit/services/mi-plan-cambio-service.test.ts` (se amplía) | R24: `vista` lleva los beneficios |
| `tests/components/BeneficiosDelPlan.test.tsx` (nuevo) | R5 (decorativo), R21 |
| `tests/components/PlanFormBeneficios.test.tsx` (nuevo) | R8–R10, R13, R14 |
| `tests/components/PlanFormPasos.test.tsx` (se amplía) | R7: orden de los pasos al crear y al editar |
| `tests/components/PlanFormBorrador.test.tsx` (se adapta) | Contador «n de 6/7»; R11 al retomar |
| `tests/components/plan-form-pasos.ts` (helper, se adapta) | Paso nuevo en `accionesFalsas` y `avanzarHasta` |
| `tests/components/PlanesModule.test.tsx` (se amplía) | R20, R21 |
| `tests/components/PlanDetalle.test.tsx` (se amplía) | R19 (líneas del rastro), R22 |
| `tests/components/MiPlanModule.test.tsx` (se amplía) | R23 y R25 en el aviso |
| `tests/components/MiPlanCambioDePlan.test.tsx` (se amplía) | R24 |
| `e2e/planes-beneficios.spec.ts` (nuevo) | R26 |
| `e2e/planes-borrador.spec.ts`, `e2e/planes-superadmin.spec.ts`, `e2e/planes-costeo.spec.ts`, `e2e/planes-costo-porcentual.spec.ts` (se adaptan) | Pasan por «Beneficios» después de «Módulos», sin cambiar sus aserciones. En `planes-borrador`, el contador pasa de 5 a 6 |

**Antes del PR** se corren en local los cinco E2E de planes y `e2e/mi-plan-cambiar-plan.spec.ts`
(`docs/perfil-agentes.md > E2E en local antes del PR`). El diff toca `db/` y pantallas de `app/`.

## 9. Tamaño

Lo cuenta `tasks.md > Archivos esperados`: **49 archivos**, por encima del tope de 40. El humano aceptó un solo PR
sobre el tope el 2026-11-19 (P1).

- **Producción: ~750 líneas** (tope 1000).
  - Migración: ~170 líneas, porque `plan_de_la_empresa` va entera en `migration.sql` y en `down.sql`.
  - `lib/`: ~200.
  - `PasoBeneficios` y `BeneficiosDelPlan`: ~230.
  - Formulario y vistas: ~150.
- **Tests: ~2400 líneas** (tope 3000).
