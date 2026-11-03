# SLT-75 · design — un distrito, a lo sumo una zona por empresa

> Código de referencia: `prod` (worktree `.worktrees/SLT-75-hotfix`). Las líneas citadas se
> comprobaron en ese árbol el 2026-10-31. El grafo de código no tiene proyecto para este worktree,
> así que se exploró con Grep y Read.

## Lo que ya existe

Buscado `otra zona`, `ya pertenece`, `ya está en la zona`, `zona_distrito`, `dos zonas` y `distrito
zona única` en tres sitios: `feature_list.json`, `specs/` y el código.

- **`specs/24-gestion-zonas` R20.** Pedía «SI se intenta asignar a una zona un distrito que YA
  pertenece a OTRA → conflict», con test en `ZonaService.test`. Se perdió al pasar a la N:M
  (`20260711210000_zona_distrito_nm`) y no está en el código: `ZonaService.prepararDatos`
  (`lib/services/ZonaService.ts:59-109`) solo deduplica y comprueba que los ids existen. Es la
  causa del defecto, no una feature duplicada. **Se reutiliza su intención; el error pasa de
  `conflict` a `validation_error` en `distritoIds`** (§4.3).
- **El colapso 1/0/>1** (`lib/repositories/_shared/zona-colapso.ts`, `zonaUnicaDeDistrito`) lo
  usan `GeoRepository.listArbol`, la reconciliación de la 366, `OrdenRepository` y la corrección
  de la 327. **No se toca.** Con el índice nuevo la rama «>1» deja de darse dentro de una empresa,
  pero se queda como defensa.
- **Los dos precedentes de rechazo y de traducción de P2002 en el mismo repositorio.**
  - `UpdateZonaResult.estado = "sin_zona_central"` es un rechazo antes de la primera escritura
    (`ZonaRepository.ts:362-368`), que el servicio traduce a `validation_error` por campo
    (`ZonaService.ts:173-175`).
  - `isEsCentralUniqueViolation` / `translateEsCentralConflict` (`ZonaRepository.ts:140-151`)
    traducen el P2002 de un índice concreto.

  **Se copia el patrón de los dos.**
- **`CoberturaRepository.listDistritos`** (ficha 465) ya devuelve todas las zonas sin colapsar.
  No se reutiliza para el árbol porque es otra consulta con otra forma (`DistritoCoberturaRow`).
  El árbol gana su propio campo (§5).
- En `feature_list.json` no apareció ninguna ficha de esto. Las que tocan `zona_distrito` son las
  de la épica GEO (SLT-43, `in_progress` en `dev`) y no se solapan (§10).

## 1. Causa (verificada en el código)

| Pieza | Dónde | Qué hace hoy |
|---|---|---|
| Esquema | `db/schema.prisma:739-755` | `ZonaDistrito` solo tiene `@@unique([zonaId, distritoId])`: nada impide `(empresa, distrito)` en dos zonas. |
| Servicio | `ZonaService.prepararDatos` `:59-109` | Deduplica y cuenta que los distritos existan. No mira si ya tienen zona. |
| Repo `create` | `ZonaRepository.ts:245-249` | `createMany` sin validar. |
| Repo `update` | `ZonaRepository.ts:422-427` | `deleteMany` + `createMany` sin validar. |
| Árbol | `GeoRepository.listArbol` `:395-406` | Con ≥2 zonas, `zonaUnicaDeDistrito` → `zonaId: null`. |
| Editar | `ZonasTarifasModule.abrirEditar` `:106-110` | Preselecciona con `d.zonaId === full.id`: el distrito de dos zonas sale desmarcado en las dos, y el siguiente guardado lo borra. |
| Árbol viejo | `ZonasTarifasModule.onSaved` `:142-145` | `void refetch()`: «Editar» puede abrir con el árbol de antes del guardado. |
| Selector | `GeografiaSelector.tsx:266-277` | Deja marcar un distrito con «(zona: X)». |
| Mensaje | `CrearZonaForm.mensajeDeError` `:743-744` | «…o un distrito ya está asignado» es texto muerto: nada produce ese `conflict`. |

## 2. Modelo de datos

### 2.1 Índice único por empresa (R7)

```prisma
model ZonaDistrito {
  // ... sin cambios ...
  @@unique([zonaId, distritoId])
  @@unique([organizacionId, distritoId])   // SLT-75 R7
  @@index([zonaId])
  @@index([distritoId])
  @@index([organizacionId])
  @@map("zona_distrito")
}
```

SQL: `CREATE UNIQUE INDEX "zona_distrito_organizacion_id_distrito_id_key" ON "zona_distrito"
("organizacion_id", "distrito_id");`. Es el nombre por defecto de Prisma para ese `@@unique`, así
que `migrate dev` no verá drift. La tabla tiene unas 128 filas en producción, de modo que no hace
falta `CONCURRENTLY` (que además no corre dentro de la transacción de la migración).

- **Multi-empresa.** Empieza por `organizacion_id`: es un único por empresa, como pide
  `docs/architecture.md > Multi-empresa`. Permite el mismo distrito en zonas de empresas distintas
  (R5, R7).
- **⚠️ NO se registra en `tests/unit/guards/_unicos-sin-empresa.ts`, aunque el encargo lo pedía.**
  Esa lista es solo para los únicos de negocio que **no** empiezan por `organizacion_id`. El propio
  archivo dice (`:31-33`) que una entrada cuyo índice ya empieza por `organizacion_id` pone la
  guardia `unicos-por-empresa` en rojo. Este índice la deja en verde sin entrada. La entrada
  `anclado("zona_distrito", "zona_distrito_zona_id_distrito_id_key", "zona")` (`:139`) sigue como
  está.
- RLS, `organizacion_id` y los triggers de misma empresa y de país de `zona_distrito` ya existen
  (SL-17, SL-20). No cambian.

### 2.2 Sin cambios de RLS ni de tablas de negocio

No hay tabla de negocio nueva. El respaldo de §3 no es de negocio y no se clasifica en
`lib/db/modelos-de-negocio.ts`: vive fuera de `public` y Prisma no lo ve.

## 3. Migraciones (fecha 20261101…, posteriores a las 20261031140x de SLT-73)

Son dos carpetas, en este orden. La primera limpia y la segunda pone el índice. Así el
`db:rollback` de la última quita solo el índice, y el orden «datos antes que índice» queda
explícito.

### 3.1 `db/migrations/20261101090000_zona_distrito_duplicados_sin_zona/` (R9, R10, R11, R13)

`migration.sql`, en orden:

1. `CREATE SCHEMA IF NOT EXISTS respaldo;` y `REVOKE ALL ON SCHEMA respaldo FROM PUBLIC;`.
2. `CREATE TABLE respaldo.slt75_zona_distrito_duplicado AS SELECT zd.id, zd.zona_id,
   zd.distrito_id, zd.organizacion_id, now() AS respaldado_at FROM zona_distrito zd WHERE
   (zd.organizacion_id, zd.distrito_id) IN (SELECT organizacion_id, distrito_id FROM zona_distrito
   GROUP BY 1, 2 HAVING count(*) > 1);`
   - Las columnas van con nombre, no `zd.*`: en `dev`, SLT-43 añade `nodo_geografico_id` y el
     respaldo debe tener la misma forma en las dos ramas.
3. `REVOKE ALL ON respaldo.slt75_zona_distrito_duplicado FROM PUBLIC;`
4. `DELETE FROM zona_distrito zd USING respaldo.slt75_zona_distrito_duplicado r WHERE zd.id = r.id;`
5. Ninguna otra sentencia. **No hay `UPDATE` de `orden`** (R11). La orden existente conserva su
   zona, como decidió Carlos. Una base sin duplicados deja el respaldo vacío y no borra nada (R13).

**Por qué un esquema aparte y no una tabla en `public`.** La migración
`20261022130000_organizacion_y_rol_app` (`:50`) hace `ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO servi_app`. Una tabla de respaldo en `public`
nacería legible para `servi_app` y sin RLS, o sea legible desde cualquier empresa. Hay un segundo
motivo: `prisma migrate dev --create-only` (`db:migrate:create`) propondría un `DROP TABLE` en la
siguiente migración de cualquiera, porque no está en `schema.prisma`. El esquema `respaldo`
resuelve las dos cosas, porque Prisma solo compara `public` (`datasource db` sin `schemas`). No hay
precedente de respaldo en las migraciones del repo: se buscó `respaldo`/`backup`.

`down.sql`:

1. `INSERT INTO zona_distrito (id, zona_id, distrito_id, organizacion_id) SELECT r.id, r.zona_id,
   r.distrito_id, r.organizacion_id FROM respaldo.slt75_zona_distrito_duplicado r`, con dos
   condiciones:
   - `WHERE EXISTS` de la zona y del distrito, para no fallar por FK si se borraron después (R12);
   - `ON CONFLICT DO NOTHING`.

   `organizacion_id` va explícito porque su `DEFAULT` lee el contexto de la sesión, que en una
   migración no existe.
2. `DROP TABLE respaldo.slt75_zona_distrito_duplicado;` y `DROP SCHEMA IF EXISTS respaldo;`, sin
   `CASCADE`, para no tirar un respaldo de otra ficha.

⚠️ Este `down.sql` solo puede reinsertar si el índice de §3.2 ya no está: por eso §3.2 se revierte
primero (es la última migración).

### 3.2 `db/migrations/20261101090100_zona_distrito_distrito_unico_por_empresa/` (R7)

- `migration.sql`: el `CREATE UNIQUE INDEX` de §2.1. Si quedara algún duplicado (no debería, tras
  §3.1), falla y aborta el deploy. Es el comportamiento buscado: no se crea un índice a medias.
- `down.sql`: `DROP INDEX IF EXISTS "zona_distrito_organizacion_id_distrito_id_key";`.

### 3.3 Despliegue

Las migraciones las aplica el build de `prod` (`scripts/migrate-deploy.ts`). Ningún agente toca la
base de producción. Pasos alrededor del deploy:

- **Antes (T0, solo lectura, la hace el leader).** Contar los duplicados. Si el número no es 1 (el
  caso conocido), **se para** y decide Carlos: su decisión cubre ese caso, no otros.
- **Después (T11, solo lectura).**
  - 0 duplicados;
  - el índice existe;
  - el respaldo tiene las filas esperadas (2 para el caso conocido);
  - la `zona_id` de la orden del distrito sigue igual.
- **Efecto visible.** Tras la migración, el distrito queda sin zona. Una orden nueva con ese
  distrito se rechaza con «no tiene zona asignada» hasta que el maestro lo asigne a una zona desde
  la pantalla, lo que ahora sí puede hacer. Hay que avisar a Carlos.

## 4. Servidor: rechazo dentro de la transacción

### 4.1 Contrato del repositorio (`lib/interfaces/repositories/IZonaRepository.ts`)

```ts
export interface DistritoEnOtraZona { distritoNombre: string; zonaNombre: string }

export type CreateZonaResult =
  | { estado: "ok"; zona: ZonaDTO }
  | { estado: "distrito_en_otra_zona"; conflictos: DistritoEnOtraZona[] | null };

export type UpdateZonaResult =
  | { estado: "ok"; zona: ZonaDTO; ordenesReconciliadas: number; ordenesRetenidasEnBodegaSatelite: number }
  | { estado: "not_found" }
  | { estado: "sin_zona_central" }
  | { estado: "distrito_en_otra_zona"; conflictos: DistritoEnOtraZona[] | null };

create(data: CreateZonaData, actorUsuarioId: string | null): Promise<CreateZonaResult>; // antes: Promise<ZonaDTO>
```

`conflictos: null` significa «lo rechazó el índice (R8) y no se sabe cuál». Los demás llamadores de
`create` (dobles en tests) se adaptan.

### 4.2 `ZonaRepository` (R1, R2, R4, R5, R6, R8)

- **La lectura de conflictos, dentro de la `tx` y antes de la primera escritura.**
  `tx.zonaDistrito.findMany({ where: { distritoId: { in: data.distritoIds }, ...(id ? { zonaId:
  { not: id } } : {}) }, select: { distrito: { select: { nombre: true } }, zona: { select: { nombre:
  true } } } })`.
  - El filtro por empresa lo pone la extensión `lib/db/extension-empresa.ts` y lo respalda la RLS.
    Por eso R5 se prueba contra Postgres real, con dos empresas (§8).
  - En `update` va después de `findUnique` y del corte `sin_zona_central`, y **antes** de
    `updateMany`/`zona.update`/`deleteMany` (hoy `:383`).
  - En `create` va **antes** de la lectura y el `updateMany` de la central previa (hoy `:218-230`).
  - Si hay filas, devuelve `{ estado: "distrito_en_otra_zona", conflictos }` sin escribir nada. Al
    no lanzar, la transacción hace commit de cero escrituras.
  - Va en una sola consulta secuencial: nada de `Promise.all` dentro de la `tx` (guardia
    `consultas-concurrentes-en-transaccion`).
- **La red final (R8).** Hay un detector local `esViolacionDistritoUnico(e)`, hermano de
  `isEsCentralUniqueViolation`. Es `true` si `esViolacionDeUnico(e)` (`_shared/prisma-unique.ts`)
  **y** el texto de la restricción (`textoConstraintP2002(e)` o el mensaje de la cadena `cause`)
  contiene `zona_distrito_organizacion_id_distrito_id_key`.
  - En el `catch` de `create` y de `update`, antes de `translateEsCentralConflict`, devuelve
    `{ estado: "distrito_en_otra_zona", conflictos: null }`.
  - ⚠️ El detector se prueba contra el error **real** de Postgres. En la ficha 373 el error de FK
    llegó como `DriverAdapterError` sin `code` ni `meta` (`ZonaRepository.ts:702-710`), y no se
    sabe si un único violado dentro de la `$transaction` interactiva llega como P2002 o igual que
    aquel. El test de integración T3 lo mide.
- La reconciliación de la 366, el rastro de la 376 y el de la 380 no cambian. No se ejecutan en el
  camino de rechazo porque van después.

### 4.3 `ZonaService` (R1, R2, R3, R8)

Traduce los dos estados a la rama `validation_error` que ya existe, y no cambia el tipo de
`IZonaService`:

- `conflictos` no nulo → `fieldErrors.distritoIds`: un mensaje
  `` `${distritoNombre} ya está en la zona ${zonaNombre}.` `` por conflicto, ordenados por
  `distritoNombre` con `localeCompare("es")`.
- `conflictos: null` → `fieldErrors.distritoIds = [MSG_DISTRITO_RECIEN_ASIGNADO]`, con el texto de
  R8.

Los textos van como constantes del servicio, igual que `MSG_SIN_ZONA_CENTRAL`. No usan la palabra
del nivel geográfico, que depende del país (`etiquetas-geograficas-sin-literal`): nombran el
distrito por su nombre. La action `lib/actions/zonas.ts` no cambia, porque reenvía el resultado del
servicio tal cual.

**Por qué `validation_error` y no `conflict` (la R20 de la 24).** `ZonaActionError` con `conflict`
no lleva cuerpo (`toActionError` `:27-28`), así que no podría nombrar el distrito ni la zona. Con
`validation_error` el mensaje llega por campo hasta el `FieldError` del selector, por el mismo
camino que `esCentral` (376) y `nombre` (392).

## 5. Árbol (R14)

- `lib/types/geografia-nodo.ts`: `DistritoArbolDTO` gana `zonas: { id: string; nombre: string }[]`,
  **obligatorio**. Así un fixture viejo no compila en vez de pasar con `undefined`. `zonaId` y
  `zonaNombre` se quedan con su colapso para los consumidores de hoy.
- `GeoRepository.listArbol`: la consulta ya trae todas las zonas (`:377`). Solo se proyectan
  `d.zonas.map(z => z.zona)` ordenadas por `nombre`. Las de otra empresa no llegan porque la
  relación anidada `distrito.zonas` pasa por la RLS de `zona_distrito` (SL-17 §6.2). R14 se prueba
  igualmente con dos empresas.
- `listArbolDePais` (superadmin) no cambia: no lleva zonas.

Con el índice, `zonas` tiene como mucho 1 elemento por empresa. El campo es defensivo y barato:
el selector y la edición dejan de depender de que el colapso y la N:M coincidan.

## 6. Pantalla

### 6.1 `GeografiaSelector` (R15-R18)

- **Prop nueva:** `zonaEnEdicionId?: string`. Se omite al crear.
- **Bloqueado.** `bloqueado(d) = d.zonas.some(z => z.id !== zonaEnEdicionId)`. En la fila:
  - la casilla queda `disabled`;
  - la etiqueta pasa a `(zona: <nombres de d.zonas unidos por ", ">)`. Sale para todo distrito con
    zona, también los de la zona editada (R18);
  - el `aria-label` de la casilla añade `(zona: <nombre>)`, para que el lector de pantalla diga por
    qué está deshabilitada.
- **Seleccionables por grupo.** `provDistIds` y `cantDistIds` pasan a contener **solo los
  seleccionables**. Con eso `stateFor` y `toggleGrupo` cumplen R16 y R17 sin otra lógica. Con 0
  seleccionables, la casilla del grupo queda `disabled`.
- El botón «Especial» no cambia: la marca es de la empresa sobre el distrito, no de la zona (SL-38).
- El filtrado por texto no cambia (374 R47).

### 6.2 `CrearZonaForm` (R21, R22)

- Pasa `zonaEnEdicionId={zonaIdGuardada}`. En edición vale `initial.zonaId`. Tras un crear con
  éxito cuyo guardado de tarifa falló, vale el id recién creado: es la misma zona.
- **`mensajeDeError`, caso `validation_error`.** Antes del texto genérico se añade
  `distritoIds?.[0]`, más `` ` y ${n - 1} más.` `` si hay varios. El `FieldError` bajo el selector
  (`:523`) ya pinta todos los mensajes.
- **`mensajeDeError`, caso `conflict`.** Pasa a `"Ya existe una zona con ese nombre."` (R22).

### 6.3 `ZonasTarifasModule` (R19, R20)

- `abrirEditar` añade `listarArbolGeografico()` a su `Promise.all` (hoy `obtenerZona` +
  `listarTarifas`).
  - Si el árbol falla, sale con el toast de error que ya existe («No se pudo cargar la zona.»).
  - Si no, `setProvincias(arbol)` y deriva `distritoIds` de ese árbol recién leído, con
    `d.zonas.some(z => z.id === full.id)`.
  - Al leer en el mismo acto de abrir, no importa si el `refetch` de `onSaved` terminó o no.
- `abrirCrear` pasa a `async`, lee el árbol igual y abre solo si la lectura fue bien. El fallo
  avisa con `"No se pudo cargar el catálogo geográfico."`.
- `onSaved` no cambia (`void refetch()`): ya no hay nada que dependa de él.

## 7. Autorización, módulo y país

- **Autorización.** Sin cambios: el CRUD de zonas es solo `maestro`, en `ZonaService` (`esMaestro`).
  El árbol lo sirve `GeografiaService.listarArbol` con su puerta de siempre.
- **Módulo.** Tarifas y zonas son núcleo. No hay puerta de módulo nueva.
- **País.** Ningún literal de país. Los nombres de distrito y de zona salen de la base. El texto
  del servidor no usa la palabra del nivel (§4.3).

## 8. Trazabilidad R → test (con mutaciones que lo matan)

«PG» = contra Postgres real (`HAY_BASE_DE_DATOS`) y en contexto de empresa (`conEmpresa`, rol
`servi_app`). Precedente de dos empresas: `tests/integration/db/zona-especial-dos-empresas.test.ts`.

| R | Test | Mutación que lo pone rojo |
|---|---|---|
| R1 | PG `tests/integration/db/zona-distrito-unica.test.ts` › «crear con un distrito de otra zona: no existe la zona, ni N:M, ni tarifas, ni historial; la central previa sigue central» | Mover la lectura de conflictos después de `zona.create`. |
| R2 | PG mismo archivo › «actualizar con un distrito de otra zona: nombre, marca, N:M, tarifas, `orden.zona_id` e historial iguales». Unit `tests/unit/services/zona-service.test.ts` › «estado distrito_en_otra_zona → validation_error en distritoIds». | Mover la lectura después de `deleteMany`. Con el índice la respuesta pasa a ser el mensaje genérico, y la aserción de R3 cae. |
| R3 | Unit `zona-service.test.ts` › «un mensaje por conflicto, con la forma exacta y ordenados por distrito», con un literal esperado como contrato y no generado por la misma función. PG `zona-distrito-unica.test.ts` › «el mensaje nombra distrito y zona reales». | Cambiar el orden o el texto. |
| R4 | PG `zona-distrito-unica.test.ts` › «guardar la zona con sus mismos distritos → ok». | Quitar `zonaId: { not: id }`. |
| R5 | PG `zona-distrito-unica.test.ts` › «el mismo distrito en una zona de la empresa B no bloquea a la empresa A, y la fila de B no cambia». | Hacer la lectura con un cliente sin empresa; índice sin `organizacion_id` (la inserción de A falla). |
| R6 | PG cubierto por R1 y R2 (nada escrito). Unit `tests/unit/repositories/zona-repository.test.ts` › «la lectura de conflictos usa la `tx` y ocurre antes de la primera escritura» (orden de llamadas del doble). | Leer con `this.prisma` en vez de `tx`, o después de escribir. |
| R7 | PG `zona-distrito-unica.test.ts` › «insertar directo una segunda fila (misma empresa, mismo distrito, otra zona) falla» y «en otra empresa se acepta». | Quitar el `CREATE UNIQUE INDEX`, o crearlo sobre `(distrito_id)` solo. |
| R8 | PG `zona-distrito-unica.test.ts` › «el error real del índice lo reconoce `esViolacionDistritoUnico`» (captura el error de una inserción directa). Unit `zona-repository.test.ts` › «la tx lanza ese error → `{ estado: distrito_en_otra_zona, conflictos: null }`». Unit `zona-service.test.ts` › «conflictos null → mensaje de R8». | El detector devuelve `false`, o mira solo `e.code === "P2002"`. |
| R9 | PG `tests/integration/db/zona-distrito-unica-migration.test.ts` › «tras la migración el duplicado no tiene zona; las demás filas, y el mismo distrito en otra empresa, intactas». | `GROUP BY distrito_id` sin empresa (borra también la fila de la otra empresa). |
| R10 | PG mismo archivo › «el respaldo tiene exactamente las filas borradas» y «`servi_app` no puede hacer `SELECT` del respaldo». | Crear el respaldo en `public`. |
| R11 | PG mismo archivo › «`orden.zona_id` y `orden.updated_at` de la orden del distrito no cambian». | Añadir `UPDATE orden SET zona_id = NULL …`. |
| R12 | PG mismo archivo › «`down.sql` de las dos (en orden inverso) restaura las filas y quita índice y respaldo». | `down.sql` sin el `INSERT`. |
| R13 | PG mismo archivo › «sin duplicados: no borra nada y no falla». | — (control de no-vacuidad del de R9). |
| R14 | PG `tests/integration/db/geografia-catalogo-activo.test.ts` (casos de 1 y 0 zonas ganan `zonas`) + PG `zona-distrito-unica.test.ts` › «`listArbol` de la empresa A no trae la zona de B». | Proyectar `zonas: []`; no ordenar. |
| R15 | Componente `tests/unit/components/geografia-selector-zona-ocupada.test.tsx` › «distrito con otra zona: casilla deshabilitada y `(zona: X)`». | Quitar el `disabled`. |
| R16 | Mismo archivo › «marcar el cantón no marca el bloqueado; desmarcar tampoco lo toca». | Usar todos los ids en `cantDistIds`. |
| R17 | Mismo archivo › «cantón con todos sus seleccionables marcados sale `checked`, no indeterminado» y «cantón sin seleccionables: deshabilitado». | `stateFor` sobre todos los ids. |
| R18 | Mismo archivo › «con `zonaEnEdicionId`, el distrito de esa zona es marcable y desmarcable». | `bloqueado` sin excluir la zona editada. |
| R19 | Componente `tests/components/ZonasTarifasEditarDistritos.test.tsx` (modelo: `ZonaBorradoMotivo.test.tsx`) › «el árbol inicial dice libre y el árbol leído al abrir dice zona Z → Editar Z preselecciona el distrito». | Derivar de `provincias` del estado sin leer el árbol. |
| R20 | Mismo archivo › «si `listarArbolGeografico` falla, no abre y avisa» (Editar y Crear). | Ignorar el fallo y abrir. |
| R21 | Componente `tests/components/ZonaDistritoEnOtraZona.test.tsx` (modelo: `ZonaNombreNoImprimible.test.tsx`) › «validation_error con dos mensajes: los dos bajo el selector; toast = primero + " y 1 más."». | `mensajeDeError` sin la rama `distritoIds`. |
| R22 | Mismo archivo › «`conflict` → texto sin "distrito"». | Restaurar el texto viejo. |

### 8.1 Tests existentes que siembran un distrito en dos zonas de la misma empresa

Con el índice, ya no pueden sembrar ese dato. Decisión por cada uno:

| Test | Qué protegía | Decisión |
|---|---|---|
| `tests/integration/db/zona-reconciliacion-ordenes.test.ts:383` «R3: un distrito que queda en DOS zonas… no mueve ninguna orden» (366 R3) | Que un distrito ambiguo no mueva órdenes. | **Se reescribe**: «guardar A con un distrito que está en B → `distrito_en_otra_zona`; la orden conserva su zona, `ordenesReconciliadas` no existe y no hay historial». Lo que protegía (no mover órdenes por un distrito con dos zonas) se cumple ahora porque el estado es irrepresentable. La rama «>1» del colapso sigue probada en unit (`zona-repository.test.ts`, `corregir-datos-cliente-service.test.ts`). |
| Mismo archivo `:590` «⭑ R5/R11: un distrito RECIÉN QUITADO… se re-evalúa en ESTE mismo guardado» | (a) La unión antes ∪ después; (b) dos zonas resueltas en un guardado comparten `lote_id`. | **Se reescribe** sin la fila en B: `quitado` solo en A, guardar A sin él. `quitado` queda sin zona y su orden conserva A; `queSigue` se reconcilia a A con un único `lote_id`. (a) se mantiene (la unión sigue leyéndose). (b) deja de ser alcanzable: con una zona por distrito, un guardado solo resuelve hacia la zona guardada. El implementer comprueba que otro test sigue cubriendo «un `lote_id` por guardado» (366 R11); si no lo hay, lo afirma en este. |
| `tests/integration/db/geografia-catalogo-activo.test.ts:144` (corpus `distritoDosZonas`) y `:336` «⭑ con DOS zonas, `null` TAMBIÉN» (374 R27) | Que el árbol no muestre «la primera» zona de un distrito con dos. | **Se eliminan** el distrito del corpus y el caso `:336`. Dentro de una empresa ya no se puede dar; la defensa queda en la base (R7, test de §8) y en el colapso, que sigue en unit. No se pasa a dos empresas: bajo la RLS, cada empresa ve una sola zona, y eso es R14, no el colapso. |
| `tests/integration/db/corregir-datos-cliente.repo.test.ts:479` (`dosZonas`) y su uso en `:773` (327 caso 7) | Que `findDistritoParaCorreccion` no invente zona con dos. | **Se eliminan** `dosZonas` y su aserción; `una`, `sin`, `especial` y `central` se quedan. Mismo motivo que el anterior. La protección «nunca `zonas[0]`» sigue en `corregir-datos-cliente-service.test.ts` (unit del colapso). |
| `tests/integration/db/cobertura-repository.test.ts:137-141` (`dDos` en z1 y z2) y la aserción `:193` | Que `listDistritos` devuelva las dos zonas sin colapsar (465). | **Se elimina** la fila `{ zonaId: z2, distritoId: dDos }`. `dDos` pasa a una sola zona (z1) y la aserción `:193` pasa a `[z1]`. La forma «array sin colapsar» la sigue cubriendo «Una Zona». Se renombra el distrito sembrado a «Otra Zona Uno» y se ajusta la lista de anti-vacuidad (`:177-179`). |

**Barrido (T9).** `zona_distrito` lo siembran además, en este árbol, otros 12 archivos de tests de
integración (lista en `tasks.md` T9). Ninguno se señaló como duplicado en la auditoría, pero no se
pueden correr desde aquí. Hay que correrlos y, si alguno siembra un duplicado de la misma empresa,
aplicar la misma regla:

- pasarlo a dos empresas, solo si lo que protege es aislamiento;
- en cualquier otro caso, quitar la fila duplicada.

Ojo también con un test que guarde una zona por `ZonaRepository` con distritos **ya existentes** en
la base de test, si esos distritos ya están en otra zona de la misma empresa: ahora se rechaza.
La salida es sembrar distritos propios del test.

## 9. Alternativas descartadas

1. **Mover el distrito de zona en silencio** (el último guardado gana: borrar la fila de la otra
   zona). Ahorra el bloqueo en la UI, pero contradice la decisión de Carlos (bloquear y avisar). Y
   traslada órdenes de una zona a otra sin que nadie lo pida: es el mismo modo de fallo mudo que
   este hotfix cierra.
2. **Solo el índice, sin validación previa.** Basta para la integridad, pero el maestro vería un
   mensaje que no dice qué distrito ni qué zona (el de R8) en el caso normal, no solo en la
   carrera. Decisión de Carlos: el aviso debe servir para corregir.
3. **Respaldo en una tabla de `public`.** Nacería con CRUD para `servi_app` por los privilegios por
   defecto y sin RLS. Además, el siguiente `db:migrate:create` propondría borrarla (§3.1).
4. **Preseleccionar la edición pidiendo los `distritoIds` a `obtenerZona`** (ampliar `ZonaDTO`).
   Daría la N:M fresca para la casilla, pero el selector necesita igualmente el árbol fresco para
   saber qué bloquear (R15). Leer el árbol al abrir resuelve las dos cosas con una lectura que ya
   existe, sin tocar `ZonaDTO` ni sus consumidores.
5. **Deshabilitar «Editar» mientras corre el `refetch`.** Deja una ventana en la que el usuario ve
   el botón apagado sin motivo. Además, si el `refetch` falla, la pantalla se queda con el árbol
   viejo y el botón vuelve a encenderse. Leer al abrir no tiene ese estado intermedio.
6. **Rastro en `historial_accion` dentro del hotfix.** Ver Q1 en `requirements.md`: cuesta mucho
   más que una línea de enum y tiene decisiones de producto abiertas.

**Observación fuera de alcance.** El `conflict` que hoy llega a `mensajeDeError` solo puede venir
de la carrera de zona central (`translateEsCentralConflict`: «Ya existe una zona central»). El
P2002 del nombre (`zona_nombre_key`) no se traduce en ningún sitio, así que llega como INTERNAL.
R22 solo quita la mención a distritos; corregir el nombre duplicado es otra ficha.

## 10. Convivencia con otras ramas

- **SLT-73 (hotfix en vuelo).** Sus migraciones son 20261031140x y las de esta ficha van después.
  Los archivos no se solapan, según lo que el encargo dice de SLT-73. No se pudo comprobar su
  `tasks.md` desde este worktree.
- **SLT-43 (`dev`, en curso).** Añade `zona_distrito.nodo_geografico_id` y un trigger que lo
  rellena. Al llevar este hotfix a `dev`:
  - el índice y la migración de datos conviven con eso, porque el respaldo y el `down.sql` usan
    columnas con nombre;
  - el `INSERT` del `down.sql` dispara el trigger de SLT-43, que es lo correcto.

  La regla de la épica GEO («ninguna migración borra datos antes de SLT-48») es para SLT-43..47, no
  para un hotfix con decisión humana. Si para entonces existe la guardia de migraciones
  destructivas, esta migración necesitará su excepción declarada. **Se avisa al dueño de SLT-43.**
- **Ninguna dependencia nueva.**
