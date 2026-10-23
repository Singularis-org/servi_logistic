# SL-38 «Distritos de zona especial por empresa» — design

## Lo que ya existe

Busqué con Grep y Read: el MCP del grafo (`codebase-memory-mcp`) no estaba entre las herramientas de
esta sesión. Términos: `zona_especial`, `zonaEspecial`, `esZonaEspecial`, `DistritosEspeciales`,
`distrito`, `tarifa especial`, `zona_distrito`.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board (`feature_list.json`) | SL-38 todavía no está importada. Ninguna otra ficha mueve la marca. SL-20 (geografía por país) toca la geografía, no la marca. SL-26 se queda con la escritura de geografía del superadmin. | No hay duplicado. Las vecinas van en «Lo que NO entra». |
| `progress/deudas.md > D12` | Deja abierta la pregunta de dónde vive la marca («¿`zona_distrito` de la empresa?»). Dice que `actualizarDistritosEspeciales` da 500. | Esta ficha la resuelve: tabla propia (decisión de Carlos). `zona_distrito` queda como alternativa descartada (§9 A). |
| `specs/SL-17-organizacion-y-aislamiento/design.md` | Patrón de tabla de negocio (§3 M2/M3), extensión (§6), RLS con `servi_app` (§4), guardias (§8). §6.2: los `select` anidados los cubre la RLS, no la extensión. | **Se reutiliza tal cual.** |
| `specs/SL-32-rol-superadmin` (otra rama) | T11: la gestión de geografía pasa al superadmin. `listarArbol` sigue abierto al `maestro` para Tarifas (R25). P7: el superadmin no tiene empresa. | Choques en §8. |
| `specs/465-tarifas-excel-cobertura` R13 | El Excel tiene tres valores para la marca: «Sí», «No» y «Sin definir». | Pasa a dos (R15). Pregunta P1 a Carlos. |
| `specs/374`, `specs/327`, `specs/415` | Documentan que la marca es **del distrito** y que es tri-valuada (`=== true`). | La marca pasa a ser «del distrito **para la empresa**». La lectura `=== true` se sustituye por el punto único de §4. |
| Migración `20260824180000_distrito_zona_especial` | `BOOLEAN DEFAULT false`. Las filas existentes quedan en `false`, y «hoy nadie escribe NULL». Las altas posteriores (`20260905175156`) también toman `false`. | En toda base desplegada la columna no tiene información: se retira (§2.2). |
| `lib/actions/geografia.ts` > `actualizarDistritosEspeciales` | Escribe `distrito.updateMany` con Prisma directo. Su cabecera dice: «Cuando le toque su ficha, se mueve entera». La llaman `CrearZonaForm` y la mockean 6 tests de componentes. | Mantiene el **nombre, el archivo y el contrato**. Por dentro pasa por servicio y repositorio (§3). |
| `lib/repositories/_shared/geografia-activa.ts`, `_shared/zona-colapso.ts` | El patrón del fragmento `select` compartido más el predicado. | Se copia el patrón en `_shared/zona-especial.ts` (§4). |
| `tests/fabricas/organizaciones.ts` | `crearOrganizacion`, `fijarEmpresa`, `comoApp`. | Los usan los tests de dos empresas. |

### Inventario de lectores de la marca

**Lecturas vivas de `distrito.zona_especial`** (las ocho pasan a la marca de la empresa):

| # | Lectura | Quién la consume | R |
|---|---|---|---|
| 1 | `GeoRepository.listArbol` | Árbol de Tarifas: `CrearZonaForm` y `GeografiaSelector` leen `DistritoArbolDTO.zonaEspecial` | R14 |
| 2 | `CoberturaRepository.listDistritos` | Excel de cobertura (`cobertura-distrito.ts`, `cobertura-descarga-columnas.ts`) | R15 |
| 3 | `OrdenRepository.findDistritosByCantonIds` | `geo-resolucion.ts`, la carga masiva (`BulkOrdenService`), el alta por API y `CotizacionOrdenService` | R16 |
| 4 | `OrdenRepository.findParaCorreccion` | `CorregirDatosClienteService`: la marca de la orden | R17 |
| 5 | `OrdenRepository.findDistritoParaCorreccion` | `CorregirDatosClienteService`: la marca del distrito propuesto | R17 |
| 6 | `OrdenRepository.findBaseCobroDevolucion` | `RechazoTiendaService` | R18 |
| 7 | `OrdenRepository` > `WITH_ESTATUS_Y_TIENDA` y `apiOrdenSelect` | El listado de órdenes (`toListItem`) y el costeo de la API (`toApiOrdenRow`, `ApiOrdenLecturaService`) | R19 |
| 8 | `CierreDiaRepository.leerDescriptivosDeOrdenes` | El congelado de `cierre_detail.es_zona_especial` al solicitar el cierre | R20 |

**Escritura:** `lib/actions/geografia.ts > actualizarDistritosEspeciales` (R9–R13).

**SQL a mano y analítica:** ninguno lee `distrito.zona_especial`. `DineroProductosRepository`
(analítica) y `scripts/contraste-454.*` leen `cierre_detail.es_zona_especial`, que es el congelado.
No cambian (R20).

**Snapshot, sin cambios:** `CierresAdminRepository`, `CierreAporteRepository`, `WalletFeedService`,
`WalletTiendaFeedService`, `lib/utils/dinero-por-producto.ts` y `lib/utils/cierre-detalle.ts`.

## 1. Visión de conjunto

La marca deja de ser un dato de la geografía y pasa a ser un dato de la empresa sobre la geografía:

```
distrito (plataforma, solo lectura)  ←──  distrito_zona_especial (negocio: organizacion_id, distrito_id)
```

Las ocho lecturas siguen preguntando lo mismo, «¿este distrito es especial?», pero la respuesta sale
de la relación `Distrito.zonasEspeciales`. La RLS la deja en la empresa de la transacción. Es el
mismo mecanismo que ya decide hoy la zona de un distrito: `distrito.zonas` → `zona_distrito`, que
también es de negocio y se lee anidada en las mismas consultas (SL-17 §6.2 y la cabecera de
`extension-empresa.ts`).

La columna global se retira. Así, cualquier lector olvidado deja de compilar.

## 2. Modelo de datos y migraciones

Hay dos migraciones nuevas, posteriores a la última de `dev` (`20261023090000_unicos_por_empresa`) y
a la última de SL-32 en su worktree (`20261023100200_usuario_empresa_o_superadmin`). La T0 comprueba
contra `origin/feature/SL-32-rol-superadmin` que siguen siendo posteriores. No se edita ninguna
migración anterior.

### 2.1 M1 — `20261023120000_distrito_zona_especial_por_empresa`

```sql
CREATE TABLE "distrito_zona_especial" (
  "id"              TEXT NOT NULL PRIMARY KEY,            -- uuid como texto, igual que el resto
  "distrito_id"     TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')
);
ALTER TABLE "distrito_zona_especial" ADD CONSTRAINT "distrito_zona_especial_distrito_id_fkey"
  FOREIGN KEY ("distrito_id") REFERENCES "distrito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "distrito_zona_especial" ADD CONSTRAINT "distrito_zona_especial_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- R1: una marca por (empresa, distrito). Empieza por organizacion_id, como los únicos de SL-18.
CREATE UNIQUE INDEX "distrito_zona_especial_organizacion_id_distrito_id_key"
  ON "distrito_zona_especial" ("organizacion_id", "distrito_id");
CREATE INDEX "distrito_zona_especial_organizacion_id_idx" ON "distrito_zona_especial" ("organizacion_id");
CREATE INDEX "distrito_zona_especial_distrito_id_idx"     ON "distrito_zona_especial" ("distrito_id");
-- RLS (R3), el patrón de M2 de SL-17:
ALTER TABLE "distrito_zona_especial" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "distrito_zona_especial_por_empresa" ON "distrito_zona_especial" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));
-- Los privilegios por defecto de M1 de SL-17 ya los dan; se repiten por si la migración la corre otro rol.
GRANT SELECT, INSERT, UPDATE, DELETE ON "distrito_zona_especial" TO servi_app;
-- R4, el patrón de M3 de SL-17:
CREATE TRIGGER "distrito_zona_especial_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "distrito_zona_especial" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
```

- **Sin trigger `verificar_misma_empresa`.** Las dos FK apuntan a `distrito` (plataforma) y a
  `organizacion`, y las dos quedan fuera de M3 por definición (SL-17 §3). `lib/db/fk-de-negocio.ts`
  no devuelve ninguna FK de negocio a negocio para esta tabla, y la guardia `fk-misma-empresa` solo
  exige el `_sin_cambio_de_empresa`.
- **Sin `created_at` ni `updated_at`.** La marca es una presencia: se crea o se borra, nunca se
  actualiza. Hoy tampoco se fecha (R1, y «Lo que NO entra»).
- **`ON DELETE CASCADE` hacia `distrito`**, igual que `zona_distrito`. La geografía no se borra
  físicamente (ficha 374, R5), así que en la práctica no se dispara. Si se borrara un distrito, la
  marca no tendría a qué referirse.
- **`down.sql`:** `DROP TRIGGER`, `DROP POLICY`, `DROP TABLE "distrito_zona_especial"`. Los índices y
  las FK caen con la tabla. R5 lo mide.

**`db/schema.prisma`:**

```prisma
/// SL-38 — La marca de zona especial ES DE LA EMPRESA, no del distrito. Una fila = «este distrito es
/// especial para esta empresa». Sin fila = no lo es. Se lee SOLO por `_shared/zona-especial.ts`.
model DistritoZonaEspecial {
  id         String   @id @default(uuid())
  distritoId String   @map("distrito_id")
  distrito   Distrito @relation(fields: [distritoId], references: [id], onDelete: Cascade)

  organizacionId String       @default(dbgenerated()) @map("organizacion_id") // SL-17/R2
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@unique([organizacionId, distritoId], map: "distrito_zona_especial_organizacion_id_distrito_id_key")
  @@index([organizacionId])
  @@index([distritoId])
  @@map("distrito_zona_especial")
}
```

- `Distrito` gana `zonasEspeciales DistritoZonaEspecial[]` y `Organizacion` gana
  `distritoZonasEspeciales DistritoZonaEspecial[]`.
- `@default(dbgenerated())` sin argumento, igual que los 73 modelos de SL-17. El test de drift
  (`schema-drift`) confirma que Prisma y la migración coinciden.

**`lib/db/modelos-de-negocio.ts`:** añade `{ modelo: "DistritoZonaEspecial", tabla: "distrito_zona_especial" }`
en «Zonas y tarifas» y cambia el contador de la cabecera de 73 a 74. La guardia `rls-por-empresa`
espera 74 tablas (`toBe(73)` pasa a `toBe(74)`). Como la cuenta se escribe a mano, se cambia en el
mismo commit que la lista.

### 2.2 M2 — `20261023120100_retirar_distrito_zona_especial` (R6–R8)

```sql
-- SL-38: la marca es de la empresa (distrito_zona_especial). La columna global no tiene información
-- en ninguna base desplegada: nació con DEFAULT false, nadie escribe NULL, y desde SL-17 la empresa no
-- puede escribirla. Si alguna fila la tiene a true, es una base local antigua: se aborta en vez de
-- perder la marca en silencio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "distrito" WHERE "zona_especial" IS TRUE) THEN
    RAISE EXCEPTION 'SL-38: hay distritos con zona_especial = true; la marca ahora es por empresa (distrito_zona_especial). Rehaz la base local con pnpm run db:reset.';
  END IF;
END $$;
ALTER TABLE "distrito" DROP COLUMN "zona_especial";
```

- **`down.sql`:** `ALTER TABLE "distrito" ADD COLUMN "zona_especial" BOOLEAN DEFAULT false;`. Es la
  forma exacta de `20260824180000`. Con la precondición de M2, `false` es el valor verdadero de todas
  las filas: el `down` no inventa nada.
- **`db/schema.prisma`:** sale `Distrito.zonaEspecial` con su comentario. Los comentarios de
  `Provincia.activo`, `Provincia.codigoDta` y `Distrito.activo` que contrastan con `zonaEspecial` se
  reescriben para no citar un campo que ya no existe. `CierreDetail.esZonaEspecial` se queda: es el
  congelado. Solo cambia su comentario, que pasa a decir «la marca de la empresa en ese instante».
- **Por qué es una migración aparte de M1:** una falla con datos y la otra no. Con M2 aparte, si
  aborta (R7) M1 ya está aplicada y el error es solo del retiro.

### 2.3 Decisión del spec: retirar la columna, no dejarla como valor por defecto de la plataforma

Es revisable al aprobar el spec, y no se pregunta aparte porque no cambia nada que se vea:

- **Retirar (elegido).** En ninguna base desplegada tiene información (§2.2), y la empresa no puede
  escribirla desde SL-17. Sin ella, cualquier lectura que quede sin migrar **no compila**: el
  typecheck hace de inventario.
- **Dejarla como valor de plataforma** («especial si la plataforma lo dice **o** la empresa lo
  marca»). Obligaría a combinar dos fuentes en cada una de las ocho lecturas y a decidir si la empresa
  puede desmarcar lo que marca la plataforma. Además, nadie la edita: la pantalla de geografía de
  plataforma es de SL-26. Sería un segundo sitio donde preguntar «¿es especial?» que siempre responde
  `false`. Si un día la plataforma necesita marcas propias, es una ficha nueva con su modelo.

## 3. La escritura: acción, servicio y repositorio (R9–R13)

Se mantienen el nombre, el archivo (`lib/actions/geografia.ts`), la entrada `{ marcar, desmarcar }` y
el tipo `ActualizarDistritosEspecialesResult`. `CrearZonaForm` y los 6 tests de componentes que mockean
`@/lib/actions/geografia` no cambian. Cambia lo de dentro: deja de usar Prisma directo y pasa por la
cadena de capas que pedía su comentario.

| Pieza | Qué hace |
|---|---|
| `lib/types/distrito-zona-especial.ts` | `distritosEspecialesSchema` (zod), que sale de la acción: `marcar` y `desmarcar` son `z.array(z.string().min(1)).default([])`. También el tipo `CambiosZonaEspecial`. |
| `lib/interfaces/repositories/IDistritoZonaEspecialRepository.ts` | `aplicarCambios(c: CambiosZonaEspecial): Promise<{ estado: "ok"; creadas: number; borradas: number } \| { estado: "distrito_inexistente" }>` |
| `lib/repositories/DistritoZonaEspecialRepository.ts` | En **una** `$transaction` interactiva: `distritoZonaEspecial.deleteMany({ where: { distritoId: { in: desmarcar } } })` y `distritoZonaEspecial.createMany({ data: marcar.map((distritoId) => ({ distritoId })), skipDuplicates: true })`. La extensión inyecta `organizacionId` en el `where` y en los datos, y la RLS lo repite. Un `P2003` (FK de `distrito_id`) se traduce a `distrito_inexistente`, y la transacción entera se revierte (R13). `skipDuplicates` es `ON CONFLICT DO NOTHING` sobre el único de R1: no oculta el error de FK. |
| `lib/interfaces/services/IDistritoZonaEspecialService.ts`, `lib/services/DistritoZonaEspecialService.ts` | `actualizar(input, actor)`. Si `actor.rol !== "maestro"`, devuelve `forbidden` sin llamar al repositorio (R11). Un id en las dos listas da `validation_error` (R12). Las dos listas vacías dan `ok, 0` (R12). Quita duplicados dentro de cada lista y delega. Traduce `distrito_inexistente` a `validation_error` y responde `{ status: "ok", actualizados: creadas + borradas }` (R9). No importa Prisma. |
| `lib/actions/geografia.ts` > `actualizarDistritosEspeciales(input, deps?)` | Hace `resolveActorFromSession`: sin actor, `unauthenticated`. Valida con `safeParse`: si falla, `validation_error`. Después llama al servicio. Gana `deps` opcional (`{ distritoZonaEspecialService?, getActor? }`), con el patrón de `GeografiaActionDeps`. `buildDistritoZonaEspecialService()` es el composition root: construye `new DistritoZonaEspecialService(new DistritoZonaEspecialRepository(getPrismaClient()))`. |

- **La autorización vive en el servicio.** En este archivo, SL-32 pone la de geografía en
  `GeografiaService`, y esta va en el suyo. El `maestro` sigue siendo el único rol, como hoy. El
  superadmin recibe `forbidden`: no tiene empresa y la marca es de una empresa.
- **Ningún `comoPlataforma`.** La empresa sale de la sesión (SL-17 §5). Esta ficha no añade
  excepciones a `lib/db/excepciones-aislamiento.ts`.
- **`actualizados` cuenta cambios efectivos.** Hoy contaba las filas que tocaba el `updateMany`,
  incluidas las que ya tenían el valor. `CrearZonaForm` solo mira `status === "ok"`, así que en la
  pantalla no cambia nada.
- El comentario de cabecera de `lib/actions/geografia.ts` («la única excepción que queda… Prisma
  directo») se corrige: ya no hay excepción.

## 4. Las lecturas: un único punto (R14–R22)

`lib/repositories/_shared/zona-especial.ts`:

```ts
/** Fragmento `select` de `Distrito`: la marca de la EMPRESA de la transacción (la RLS la acota). */
export const SELECT_MARCA_ZONA_ESPECIAL = {
  zonasEspeciales: { select: { id: true }, take: 1 },
} as const satisfies Prisma.DistritoSelect;

/** `true` si el distrito tiene marca de la empresa. Un distrito ausente (orden sin distrito) no es especial. */
export function esZonaEspecialDeLaEmpresa(
  d: { zonasEspeciales: readonly { id: string }[] } | null | undefined,
): boolean {
  return (d?.zonasEspeciales.length ?? 0) > 0;
}
```

Cada lectura del inventario cambia de forma mecánica:

| Antes | Después |
|---|---|
| `select: { …, zonaEspecial: true }` en `distrito` | `select: { …, ...SELECT_MARCA_ZONA_ESPECIAL }` |
| `distrito: { select: { zonaEspecial: true } }` desde `orden` | `distrito: { select: { ...SELECT_MARCA_ZONA_ESPECIAL } }` |
| `d.zonaEspecial === true`, `row.distrito?.zonaEspecial === true` | `esZonaEspecialDeLaEmpresa(d)`, `esZonaEspecialDeLaEmpresa(row.distrito)` |

- **Los tipos de salida no cambian** (`esZonaEspecial: boolean`, `DistritoArbolDTO.zonaEspecial:
  boolean`). Los servicios, `resolverFlete` y los componentes no se enteran. Las únicas excepciones
  son estas:
  - **Cobertura (R15).** `ICoberturaRepository` > `distrito.zonaEspecial` y
    `CoberturaDistritoDTO.zonaEspecial` pasan de `boolean | null` a `boolean`.
    `textoZonaEspecial` pierde la rama «Sin definir» y pasa a ser `siNo`.
  - **`DescriptivosDeOrden.distritos`** (`CierreDiaRepository`) pasa de `zonaEspecial: boolean | null`
    a `zonaEspecial: boolean`. La línea 1333 deja el `=== true`.
- **Por qué alcanza con la RLS para la lectura anidada.** En contexto de empresa, la extensión envuelve
  también los modelos de plataforma (`distrito`) y los relacionados (`orden`) en una transacción con
  `servi_app`. La relación anidada `zonasEspeciales` la filtra la política de M1 (R3). Es exactamente
  lo que ya protege `distrito.zonas` → `zona_distrito` en esas mismas consultas, y lo que mide la T4.1
  de SL-17 en el Supabase real. La extensión no ve los `select` anidados (SL-17 §6.2); la RLS sí.
- **`take: 1`.** Con la RLS hay como mucho una fila por el único de R1. El `take` limita lo que viaja
  cuando se lee como dueño sin RLS (plataforma, §7).
- **La guardia del punto único (R22).** `tests/unit/guards/zona-especial-punto-unico.guardia.test.ts`
  recorre `lib/` y `app/`. Falla si el identificador `zonasEspeciales` o el modelo
  `distritoZonaEspecial` aparecen fuera de `_shared/zona-especial.ts` y de
  `DistritoZonaEspecialRepository.ts`. Su caso negativo es una fuente inventada que **debe** fallar.
  Que nadie vuelva a leer la columna vieja lo garantiza el typecheck, porque la columna ya no existe.

## 5. País

La marca no depende del país: se apoya en el `distrito`, que es de plataforma y que SL-20 hará
configurable por país. La tabla de marcas apunta por `distrito_id`, así que cuando SL-20 cambie la
geografía, la marca sigue al distrito. No introduce moneda, impuestos ni métodos de pago.

## 6. Tests y trazabilidad

Todos los tests de base usan el patrón de SL-17 §9.2: transacción revertida, empresas A y B, y el
**repositorio real con el cliente extendido** (`conAislamientoPorEmpresa` + `conEmpresa(B)`). No se
usan dobles, por la lección de «probar el WHERE donde vive». Cada uno se mata con una mutación antes
de creerlo:
- quitar la política, o volver a leer de `distrito`, pone en rojo los de dos empresas;
- sin la marca de A sembrada, el test **falla**, no se salta.

| R | Test |
|---|---|
| R1, R3, R4, R10, R13 | `tests/integration/db/distrito-zona-especial-por-empresa.test.ts`. Casos: único (empresa, distrito); con `comoApp(B)`, `SELECT *` y la lectura anidada desde `distrito` y desde `orden` no traen la marca de A; `INSERT` con la empresa de A falla; `UPDATE` de `organizacion_id` da `SL017` como dueño; B desmarca y la marca de A sigue; un id inexistente en `marcar` deja 0 filas nuevas |
| R2 | Guardias existentes: `organizacion-en-modelos`, `rls-por-empresa` (74) y `fk-misma-empresa` |
| R5, R7, R8 | `tests/integration/db/migracion-sl38-ida-y-vuelta.test.ts`: M1 y M2 de ida y vuelta en un esquema desechable (técnica de `crearPrismaDeTestEnEsquema`), comparando `information_schema`, `pg_policies` y `pg_trigger`; M2 aborta con una fila `zona_especial = true` y no suelta la columna |
| R6 | `tests/integration/db/distrito-zona-especial-migration.test.ts`: su caso «el schema de Prisma declara el campo» pasa a afirmar que `Distrito` ya no lo declara. Además, el typecheck y la guardia de R22 |
| R9, R11, R12 | `tests/unit/services/distrito-zona-especial-service.test.ts` (dobles): roles, lote contradictorio, listas vacías sin llamar al repositorio, duplicados y suma de `actualizados`. `tests/unit/actions/distritos-especiales-action.test.ts` se reescribe sobre `deps`: sin sesión, validación y composition root (el repositorio se **pasa**, no solo se importa) |
| R9 (sin 500), R14–R21 | `tests/integration/db/zona-especial-dos-empresas.test.ts`. A marca el distrito D y B no. Por cada lectura del inventario, con el repositorio real: `listArbol`, `CoberturaRepository.listDistritos`, `findDistritosByCantonIds`, `findParaCorreccion`, `findDistritoParaCorreccion`, `findBaseCobroDevolucion`, el listado (`list`), `apiOrdenSelect` y `leerDescriptivosDeOrdenes`, dentro de `conEmpresa(A)` da `true` y dentro de `conEmpresa(B)` da `false`. Para R20: un cierre de A congela `true`, A desmarca D, y la fila congelada sigue en `true`. Para R9: `actualizarDistritosEspeciales` con el servicio real devuelve `ok` |
| R15 | `tests/unit/descarga/cobertura-descarga-columnas.test.ts` y `tests/unit/utils/cobertura-distrito.test.ts`: «Sí» o «No», nunca «Sin definir» |
| R16 | Además del de dos empresas, los tests de `resolverFlete` y de carga y cotización siguen en verde sin cambiar su aserción, porque su entrada `esZonaEspecial: boolean` no cambia |
| R22 | `tests/unit/guards/zona-especial-punto-unico.guardia.test.ts` |
| R23 | `tests/unit/scripts/verificar-rls-despliegue.test.ts`: la constante sale de `MODELOS_DE_NEGOCIO.length`. Con una lista inventada de 2 modelos, espera 2 |
| R24 | Revisión del diff (docs). |

**Tests que hoy simulan la columna.** Los tests de repositorio con Prisma doble que devuelven
`distrito: { zonaEspecial: … }` pasan a devolver `distrito: { zonasEspeciales: [...] }`. Los de
integración que siembran `distrito.zona_especial = true` pasan a sembrar una marca con
`fijarEmpresa`. La lista está en `tasks.md > Archivos esperados`. Los fixtures de `DistritoArbolDTO`
(componentes de Tarifas y de geografía) **no cambian**, porque el DTO no cambia.

**CI:** como en SL-17 §9, los tests de `tests/integration/db/` corren en local con
`HAY_BASE_DE_DATOS` hasta que SL-31 migre la base en CI. Se dice en el PR.

## 7. Riesgos y lo que esto NO cubre

- **Lectura sin empresa (superadmin, plataforma).** Sin contexto de empresa, `distrito` se lee como
  dueño y sin RLS. Una lectura anidada de `zonasEspeciales` vería las marcas de **todas** las empresas.
  Hoy solo hay un camino así: el árbol que lee el superadmin por SL-32 R25. Su `zonaEspecial` vendría
  a `true` si **alguna** empresa marcó el distrito. Ninguna pantalla del superadmin muestra ese campo,
  y le pasa lo mismo a `zonaNombre` del mismo árbol desde SL-17. Queda para SL-26: la pantalla de
  geografía de plataforma no debe mostrar `zonaEspecial` ni `zonaNombre`, o debe leerlos por empresa.
  Ningún cálculo de dinero corre sin empresa: los crons usan `paraCadaEmpresa` y la API key usa
  `conEmpresa`.
- **Re-tarifado de órdenes abiertas.** Marcar o desmarcar cambia ya el costeo estimado y el listado de
  las órdenes abiertas de la empresa, porque leen la marca viva. Es lo que pasaba antes con la columna
  global (ficha 415, R20), ahora acotado a la empresa. Lo congelado no se mueve (R20).
- **La seguridad de la lectura anidada depende de la RLS.** Si un despliegue no aplica la RLS (plan B
  de SL-17 §4), la marca de A podría elegir el flete de B. Es el mismo riesgo que ya tienen las zonas
  (`zona_distrito`), y SL-17 dice que, en ese caso, no se dan de alta empresas.

## 8. Choques con otras ramas — regla: quien mergea segundo rebasa

| Rama | Qué compartimos | Contrato |
|---|---|---|
| SL-32 (`feature/SL-32-rol-superadmin`) | **`db/schema.prisma`**: SL-32 toca `Usuario` y `RolValue`, y SL-38 toca `Distrito`, `Organizacion` y el modelo nuevo. Son bloques distintos, y el rebase es textual. **`progress/deudas.md`**: SL-32 lo edita, y SL-38 cierra la pregunta de D12. | Las migraciones de SL-38 (`20261023120000` y `20261023120100`) van **después** de las de SL-32 (`20261023100000`–`20261023100200`). Si SL-32 añade una posterior antes de mergear, SL-38 renumera las suyas **antes** de que se apliquen en ninguna base (nunca una ya aplicada). |
| SL-32, semántico | `listarArbol` sigue abierto al `maestro` (SL-32 R25) | SL-38 no toca `GeografiaService`. La marca sigue llegando a Tarifas por el mismo `DistritoArbolDTO.zonaEspecial`. El superadmin la recibe sin filtrar (§7); SL-26 lo hereda. |
| SL-32, T11 | `cambiarActivacionGeografica` da 500 al `maestro` | Lo resuelve SL-32 (`forbidden`). SL-38 no lo toca. |
| SL-20 | La geografía por país | La marca apunta por `distrito_id` y sigue al distrito (§5). |

Archivos que SL-32 lista y SL-38 **no** toca, aunque mencionen la marca en fixtures:
`tests/unit/components/geografia-admin.ui.test.tsx`, `tests/unit/components/geografia-admin-page.test.tsx`
y `tests/unit/services/geografia-service.test.ts`. No se tocan porque `DistritoArbolDTO` no cambia.

## 9. Alternativas descartadas

- **A. La marca en `zona_distrito`** (la sugerencia de D12). `zona_distrito` ya es de la empresa,
  pero la relación es N:M: el mismo distrito podría ser especial en una zona y no en otra. La migración
  de 2026-08-24 lo descartó por ese motivo, y las ocho lecturas tendrían que resolver qué zona manda.
  Además, quitar el distrito de una zona borraría su marca sin que nadie lo pidiera. Carlos eligió la
  tabla propia.
- **B. Leer la marca con una consulta aparte**
  (`distritoZonaEspecial.findMany({ where: { distritoId: { in } } })`) en vez de anidada. Suma la
  extensión como primera barrera, pero:
  - añade una ida y vuelta a cada lectura de una fila (corrección, rechazo);
  - obliga a escribir la composición en ocho sitios;
  - rompe el árbol del superadmin (SL-32 R25), porque sin empresa la consulta lanza
    `EmpresaNoResuelta`.

  La lectura anidada protege lo mismo que ya protege a `zona_distrito` en esas mismas consultas.
- **C. Conservar la columna como valor de plataforma.** Ver §2.3.
- **D. Fila con `es_especial BOOLEAN NULL` para conservar «Sin definir».** Daría tres estados por
  empresa, pero obliga a decidir qué significa «sin fila» frente a «fila con NULL». Nadie ha escrito
  nunca un NULL. Queda como respuesta posible a P1.
- **E. Mover la acción a un archivo nuevo** (`lib/actions/distritos-especiales.ts`). Es más limpio,
  pero obliga a cambiar el import de `CrearZonaForm` y el `vi.mock` de 6 tests de componentes, sin
  ganar nada para la feature. La acción se queda donde está y por dentro pasa por las capas.

## Perfil del proyecto (`docs/perfil-agentes.md > spec_author`)

- **Modelo de datos:** §2. La tabla lleva `organizacion_id`, la RLS `_por_empresa` y el único por
  empresa `(organizacion_id, distrito_id)`. Las dos migraciones traen `down.sql`.
- **Autorización:** en `DistritoZonaEspecialService`, solo `maestro` (R11), detrás de la sesión de
  la acción. No depende de ningún módulo encendido (SL-23).
- **País:** §5. No hay datos de país nuevos.
- **Dependencias:** ninguna nueva.
