# SLT-43 — geo-jerarquica-modelo · design.md

> Requisitos: `requirements.md` (R1–R40). El alcance y la tabla «Decisiones cerradas» de
> `requirements.md` no se reabren aquí. Las cuatro preguntas abiertas del primer borrador las
> respondió Camilo el 2026-10-29 (snapshot con id, sin trigger en `cierre_detail`, código único por
> país y tipo, `ruta text[]`). Lo que cambiaron lleva la marca **(decisión 2026-10-29)**.

## Lo que ya existe

Buscado el 2026-10-29 con los términos `nodo_geografico`, `tipo_nivel`, `jerárquica`/`jerarquica`,
`ruta`, `geografía`, `ubicacion_snapshot` y `backfill`, en los tres sitios de `docs/specs.md`:

- **Board** (`feature_list.json`): SLT-44 a SLT-48 son las otras tarjetas de la misma épica GEO, sin
  solaparse con esta (lecturas, API, pantalla, presentación y contract). SL-20 (`done`) es el
  precedente directo. Ninguna otra ficha crea un modelo jerárquico.
- **Specs**: `specs/SL-20-pais-geografia-configurable` (tabla `pais`, FK compuestas con `pais_id`,
  triggers `geografia_pais_del_padre` y `geografia_del_pais_de_la_empresa`, `historial_plataforma`,
  tests de ida y vuelta) y `specs/374-catalogo-geografico-admin` (retiro por `activo`, unicidad por
  padre). En los specs, «nodo geográfico» nombra hoy a la provincia, el cantón o el distrito; no hay
  ninguna tabla con ese nombre.
- **Código** (Grep/Read; el MCP `codebase-memory-mcp` responde pero no tiene indexado este worktree,
  ver `list_projects`): no existe `nodo_geografico` ni `tipo_nivel_geografico` como tabla ni como
  modelo. Sí existe, y **se reutiliza**:
  - `pais` y sus columnas `nivel_N_singular/plural` y `digitos_codigo_nivel_N` (fuente de R2).
  - El patrón de FK compuesta `(hijo, pais_id) → (id, pais_id)` y de política RLS «del país de mi
    empresa» de `20261026130200_geografia_por_pais` (§2.3 y §2.4 de SL-20).
  - Las funciones `SECURITY DEFINER` con `search_path` fijo de `20261026130300` (precedente de SL-40).
  - `normalizeName` (`lib/utils/normalize.ts`) como definición de «nombre normalizado» (R10).
  - Los valores `nodo_geografico_*` de `historial_accion_tipo` y `historial_plataforma_accion`: ya
    existen y no se tocan.
  - `tests/integration/db/_fixtures/ida-y-vuelta-32.ts` y `migracion-sl20-ida-y-vuelta.test.ts`
    como molde de la ida y vuelta.
  - `comoPlataforma` y `EXCEPCIONES_DE_PLATAFORMA`, y `scripts/migrar-storage-a-carpetas.ts` como
    molde de un script de datos con modo de conteo y modo de escritura.
  - `scripts/migrate-deploy-guardas.ts` (`decidirMigracion`) y su test, para R39.

No aparece nada que ya resuelva SLT-43: no hay bloqueo.

## 1. Resumen

Fase *expand*. Dos tablas de plataforma nuevas, `tipo_nivel_geografico` y `nodo_geografico`, se
llenan en la migración desde `pais` y desde la geografía vieja, conservando los ids. La geografía
vieja sigue siendo la única que la app escribe: triggers `AFTER` en `provincia`, `canton`, `distrito`
y `pais` copian cada cambio al modelo nuevo. `orden`, `zona_distrito` y `distrito_zona_especial`
ganan `nodo_geografico_id`, que un trigger `BEFORE` rellena al escribir; `cierre_detail` gana
`ubicacion_snapshot`. Las filas que ya existen las llena un script aparte, por lotes y reanudable,
que corre una persona. La app no lee nada nuevo en esta tarjeta.

## 2. Modelo de datos

Las dos tablas nuevas son **de plataforma** (como `provincia` y `pais`): sin `organizacion_id`, con
RLS de lectura por país y sin escritura para `servi_app`. Se añaden a `MODELOS_DE_PLATAFORMA`
(`lib/db/modelos-de-negocio.ts`) y el comentario de cabecera sube en 2. Sin esto, la guardia
`organizacion-en-modelos` pone el gate en rojo.

Los ids son `TEXT` con UUID generado (`gen_random_uuid()::text` en SQL, `@default(uuid())` en Prisma),
como el resto del esquema.

### 2.1 `tipo_nivel_geografico` (R1–R3)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | |
| `pais_id` | `TEXT NOT NULL` FK `pais(id)` `ON DELETE CASCADE ON UPDATE RESTRICT` (enmienda 2026-10-29) | Índice. |
| `clave` | `TEXT NOT NULL` | `CHECK (clave ~ '^[a-z0-9_]{1,40}$')`. La migración y la sincronía usan `nivel_1`, `nivel_2`, `nivel_3`. |
| `nombre_singular`, `nombre_plural` | `TEXT NOT NULL` | Copia de `pais.nivel_N_singular/plural`. |
| `digitos_codigo` | `INT NULL` | Copia de `pais.digitos_codigo_nivel_N`. |
| `codigo_hereda_prefijo` | `BOOLEAN NOT NULL DEFAULT false` | `false` en el nivel 1; en los niveles 2 y 3, `digitos_codigo_nivel_N IS NOT NULL`. Es la regla R17 de SL-20 («con dígitos, el código empieza por el del padre»), puesta como dato. |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT now()` | |

- Únicos: `(pais_id, clave)` (R1) y `(id, pais_id)`, destino de la FK compuesta de §2.2 (R6).
- **Enmienda 2026-10-29 (humano):** ON DELETE CASCADE hacia pais; motivo: el tipo es parte del país y no vive sin él; servi_app no tiene DELETE sobre pais. Solo esta FK: los nodos siguen con RESTRICT, así que un país con geografía sigue sin poder borrarse.
- El tipo no lleva profundidad: decisión 2 de la épica (una región es un nodo más; el tipo no ata el
  nivel). La sincronía elige el tipo por clave según la tabla vieja de la que viene.
- **Llenado (R2):** `INSERT … SELECT` desde `pais` con un `CROSS JOIN (VALUES (1),(2),(3))`, para
  todos los países que haya.
- **Países nuevos (R3):** trigger `pais_tipos_de_nivel` `AFTER INSERT OR UPDATE OF nivel_1_singular,
  …, digitos_codigo_nivel_3 ON pais`, función `SECURITY DEFINER`, que hace `INSERT … ON CONFLICT
  (pais_id, clave) DO UPDATE` de los tres tipos. Así el alta de país de SL-20 (`PaisRepository.crear`)
  sigue igual y el país nace con catálogo.
- Prisma: `model TipoNivelGeografico` `@@map("tipo_nivel_geografico")`, back-relation `tiposDeNivel`
  en `Pais`.

### 2.2 `nodo_geografico` (R4–R12)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | El de la provincia, el cantón o el distrito del que viene (R13). |
| `pais_id` | `TEXT NOT NULL` FK `pais(id)` `RESTRICT/RESTRICT` | |
| `tipo_id` | `TEXT NOT NULL` | FK compuesta `(tipo_id, pais_id) → tipo_nivel_geografico(id, pais_id)` `RESTRICT/RESTRICT` (R6). |
| `padre_id` | `TEXT NULL` | FK compuesta `(padre_id, pais_id) → nodo_geografico(id, pais_id)` `RESTRICT/RESTRICT` (R5). Con `padre_id` NULL la FK no se comprueba (`MATCH SIMPLE`). |
| `profundidad` | `INT NOT NULL` | `CHECK (profundidad >= 1)`. Raíz = 1, como `nivel_1`. |
| `nombre` | `TEXT NOT NULL` | Tal cual la tabla vieja. |
| `nombre_normalizado` | `TEXT NOT NULL` | Lo pone el trigger con `geo_normalizar_nombre(nombre)`; lo que venga se pisa (R10). |
| `codigo_oficial` | `TEXT NULL` | Copia de `codigo_dta`. |
| `activo` | `BOOLEAN NOT NULL DEFAULT true` | Copia de `activo`. La cascada sigue evaluándose al leer (374). |
| `ruta` | `TEXT[] NOT NULL` | Ids de la raíz al propio nodo. **(decisión 2026-10-29)** `text[]` y no el `uuid[]` de la tarjeta: los ids son `TEXT`, así no hay conversión en cada consulta ni se depende de que todo id sea un UUID válido. |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT now()` | Las tablas viejas no tienen fecha: los nodos copiados llevan la de la migración. |

Índices y únicos:
- `(id, pais_id)` único: destino de la FK compuesta de los hijos.
- `(padre_id, nombre_normalizado)` único (R9).
- `(pais_id, nombre_normalizado) WHERE padre_id IS NULL` único **parcial** (R9, raíces). Prisma no lo
  expresa: vive solo en el SQL, con un comentario en el modelo, como el único parcial de `orden` (294).
- `(pais_id, tipo_id, codigo_oficial)` único; los NULL no compiten (R9). **(decisión 2026-10-29:
  difiere de la tarjeta, que decía `(pais_id, codigo_oficial)`)**. Repite el único por país y nivel
  de SL-20 (R16): en un país con código libre, una provincia «1» y un cantón «1» siguen conviviendo, y
  la sincronía no rechaza un alta que hoy se acepta.
- `GIN (ruta)` (R11): sirve a `ruta @> ARRAY[$1]` y `$1 = ANY(ruta)` de SLT-44. Prisma:
  `@@index([ruta], type: Gin)`.
- Índices en `padre_id`, `tipo_id` y `pais_id` (FK y política RLS).

**Normalización (R10).** Función SQL `geo_normalizar_nombre(text) RETURNS text IMMUTABLE`:
`normalize(x, NFD)` → quitar las marcas combinantes `[̀-ͯ]` → `lower` → recortar y colapsar
espacios. Es la traducción de `normalizeName`. `unaccent` no se usa: no está instalada y es `STABLE`
(lo explica `20260731160000_orden_busqueda_trgm`). **A verificar en T2.1:** que `normalize()` esté en
la versión de Postgres de CI (17) y de Supabase (requiere 13+ y base UTF-8), y que el resultado sea
idéntico a `normalizeName` sobre todos los nombres de la geografía de la base de test (test de R10).

**Trigger de invariantes `nodo_geografico_invariantes`** (`BEFORE INSERT OR UPDATE OF padre_id,
profundidad, nombre, ruta, pais_id ON nodo_geografico`):
1. pone `nombre_normalizado`;
2. lee el padre (si hay): si `NEW.profundidad <> padre.profundidad + 1`, o si no hay padre y
   `NEW.profundidad <> 1`, lanza `SQLSTATE 'SLT43'` (R7);
3. pone `ruta = padre.ruta || NEW.id` (o `ARRAY[NEW.id]`) (R8).

El país del padre y el del tipo los garantizan las FK compuestas (R5, R6), no el trigger: son
declarativas y no tienen carrera. Con profundidad estricta no hace falta detectar ciclos: mover un
nodo bajo un descendiente suyo rompe R7.

**Descendientes (R8):** trigger `nodo_geografico_ruta_descendientes` `AFTER UPDATE OF padre_id` que,
si la ruta cambió, actualiza en una sentencia a los nodos con `NEW.id = ANY(ruta)` (usa el GIN)
reemplazando el prefijo. Hoy no hay ninguna vía de la app que mueva un nodo de padre; lo cubre el
test por si el SQL a mano lo hace.

**RLS (R12)**, con el patrón de `provincia_del_pais`:

```sql
CREATE POLICY "nodo_geografico_del_pais" ON "nodo_geografico" FOR SELECT TO servi_app
  USING ("pais_id" = (SELECT o."pais_id" FROM "organizacion" o
                      WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')));
-- igual para tipo_nivel_geografico: "tipo_nivel_geografico_del_pais"
REVOKE INSERT, UPDATE, DELETE ON "nodo_geografico", "tipo_nivel_geografico" FROM servi_app;
```

Prisma: `model NodoGeografico` `@@map("nodo_geografico")`, con la auto-relación `padre`/`hijos` sobre
`[padreId, paisId]`, `tipo` sobre `[tipoId, paisId]` y back-relations `ordenes`, `zonasDistrito` y
`zonasEspeciales`. **A verificar en T2.2:** que `prisma migrate diff` salga vacío con una relación
de dos campos donde uno es opcional (`padreId`) y otro obligatorio (`paisId`); si no, el plan B es el
de SL-20 §2.3 (declarar la relación con `paisId` y aceptar el `dbgenerated()`).

### 2.3 Sincronía desde la geografía vieja (R15–R18)

Una función `SECURITY DEFINER` con `search_path` fijo por tabla (`geo_sincronizar_provincia`,
`…_canton`, `…_distrito`), enganchada `AFTER INSERT OR UPDATE OR DELETE … FOR EACH ROW`:

| Evento | Qué hace en `nodo_geografico` |
|---|---|
| `INSERT`, `UPDATE` | `INSERT … ON CONFLICT (id) DO UPDATE` con `pais_id`, `tipo_id` (el `nivel_N` del país de la fila), `padre_id` (`NULL`, `provincia_id` o `canton_id`), `profundidad` (1, 2 o 3), `nombre`, `codigo_oficial = codigo_dta` y `activo`. |
| `DELETE` | `DELETE FROM nodo_geografico WHERE id = OLD.id`. |

- Es `AFTER` para ver el `pais_id` que ya puso el trigger `BEFORE` de SL-20 (`canton_pais_del_padre`,
  `distrito_pais_del_padre`), que se queda igual (R18).
- El *upsert* hace la sincronía idempotente: un `UPDATE` de una fila cuyo nodo faltara lo crea.
- `GeoRepository.importarDivision` hace `createMany` por nivel, de arriba abajo: cuando llegan los
  cantones, los nodos de sus provincias ya existen.
- Si la sincronía lanza (p. ej. un único de §2.2), la escritura vieja falla entera con el mismo
  error: `23505` llega a la action de SL-20 como `P2002` → `conflict`, igual que hoy con los únicos
  viejos. Por eso los únicos nuevos no pueden ser más estrictos que lo que la app ya comprueba: de
  ahí el código único por país y tipo (decisión 2026-10-29) y las comprobaciones de nombre de R14.
- No escribe historial (R18): el historial de geografía lo sigue escribiendo `GeoRepository` en
  `historial_plataforma`.
- El `DELETE` en cascada: borrar un distrito borra antes sus filas de `zona_distrito` y
  `distrito_zona_especial` (FK `CASCADE` vieja) y luego su nodo. La app no borra geografía (guardia
  `geografia-sin-borrado-fisico`); solo los tests al limpiar.

### 2.4 Columnas nuevas en tablas de negocio (R19–R21, R24)

| Tabla | Columna | FK | Trigger |
|---|---|---|---|
| `orden` | `nodo_geografico_id TEXT NULL` | → `nodo_geografico(id)` `ON DELETE RESTRICT ON UPDATE RESTRICT` **`NOT VALID`** | `orden_nodo_geografico` `BEFORE INSERT OR UPDATE OF provincia_id, canton_id, distrito_id, nodo_geografico_id`: `NEW.nodo_geografico_id := COALESCE(NEW.distrito_id, NEW.canton_id)` (R20). |
| `zona_distrito` | `nodo_geografico_id TEXT NULL` | → `nodo_geografico(id)` `ON DELETE CASCADE` **`NOT VALID`** (como su `distrito_id`) | `zona_distrito_nodo_geografico` `BEFORE INSERT OR UPDATE OF distrito_id, nodo_geografico_id`: `NEW.nodo_geografico_id := NEW.distrito_id` (R21). |
| `distrito_zona_especial` | `nodo_geografico_id TEXT NULL` | igual que `zona_distrito` | `distrito_zona_especial_nodo_geografico`, igual (R21). |
| `cierre_detail` | `ubicacion_snapshot JSONB NULL` | — | **Ninguno (decisión 2026-10-29, R40)**: §2.6. |

- `ADD COLUMN` sin `DEFAULT` y nullable no reescribe la tabla: solo toca el catálogo.
- Los triggers `BEFORE` no consultan nada: asignan desde la propia fila. El coste que queda es la
  comprobación de la FK nueva (un acceso por índice a la PK de `nodo_geografico`), que corre aunque la
  FK sea `NOT VALID`. Es lo que mide R22.
- Incluir `nodo_geografico_id` en la lista de columnas hace que nadie pueda dejarla distinta de las
  FK viejas mientras éstas son la fuente (las pisa siempre). SLT-46 lo cambiará cuando una orden pueda
  apuntar a un nodo arbitrario.
- **Triggers existentes de `orden`** (todos con lista de columnas, Grep del 2026-10-29):
  `cobro_plataforma_al_crear_orden` (`AFTER INSERT`), `cobro_plataforma_al_cambiar_borrado`
  (`AFTER UPDATE OF deleted_at`), `orden_geografia_del_pais_de_la_empresa` (`OF provincia_id,
  canton_id, distrito_id`), los `sme_orden_*` (`OF <fk>, organizacion_id`) y
  `orden_sin_cambio_de_empresa`. Ninguno responde a un `UPDATE` que solo pone `nodo_geografico_id`
  (R30). `orden.updated_at` es `@updatedAt` de Prisma, no un trigger (R29). Los dos se confirman con
  test.
- Las FK son de negocio → plataforma, como `orden.provincia_id`: no necesitan trigger de misma
  empresa (`fk-misma-empresa.guardia` solo mira FKs entre tablas de negocio; **a verificar en T4.1**).
- Índices `orden(nodo_geografico_id)`, `zona_distrito(nodo_geografico_id)` y
  `distrito_zona_especial(nodo_geografico_id)` en una migración aparte (§3), para aislar el único
  bloqueo de escritura largo sobre `orden` y medirlo en el ensayo. Sin `CONCURRENTLY`: Prisma corre
  cada migración en una transacción (lo dicen `20260731140000` y siguientes).

### 2.5 Enums (R23)

`ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'nodo_geografico'` y lo mismo en
`historial_plataforma_entidad`. La tarjeta dice «`historial_accion`»: el enum de entidades de esa
tabla es `historial_accion_entidad` (el de tipos, `historial_accion_tipo`, ya tiene los
`nodo_geografico_*`). Camilo aceptó esta lectura el 2026-10-29. Van en su propia migración, porque un valor añadido no se puede usar en la
misma transacción.

Efecto en TypeScript (los mapas son exhaustivos por tipo y el typecheck lo exige):
- `lib/types/historial-accion.ts`: `nodo_geografico` en `HISTORIAL_ACCION_ENTIDADES` y en
  `ENTIDAD_LABELS` («Nodo geográfico»).
- `lib/types/historial-accion-etiquetas.ts`: `FuentesEtiqueta.nodo_geografico = { nombres: readonly
  string[] }` (de la hoja a la raíz) y su constructor `unir(...nombres)`, con el criterio de 374.
- **Sin cambio visible (R23):** el filtro de entidad de `/historico/acciones`
  (`historial-acciones-filtros-def.ts`) se arma con `HISTORIAL_ACCION_ENTIDADES`; se excluye
  `nodo_geografico` de sus opciones hasta que exista un escritor (SLT-46), con un comentario.
- Nada escribe ese valor en SLT-43; las filas viejas de `provincia`/`canton`/`distrito` no se tocan
  (decisión «historial viejo convive»).

### 2.6 `cierre_detail.ubicacion_snapshot` (R31, R40) — **decisión 2026-10-29**

```json
{
  "v": 1,
  "niveles": [
    { "profundidad": 1, "tipo": "Provincia", "nombre": "San José",    "id": "<provincia_id de la orden>" },
    { "profundidad": 2, "tipo": "Cantón",    "nombre": "Escazú",      "id": "<canton_id de la orden>" },
    { "profundidad": 3, "tipo": "Distrito",  "nombre": "San Antonio", "id": "<distrito_id de la orden>" }
  ]
}
```

- **Congelado, como las tres columnas.** `nombre` sale de `provincia_nombre`, `canton_nombre` y
  `distrito_nombre` de la misma fila, no de la geografía viva: una corrección de la orden o un
  renombre posteriores no lo mueven. Sin `distrito_nombre`, dos niveles.
- **`tipo`** es el `nombre_singular` del tipo `nivel_N` del país de la empresa de la fila
  (`organizacion.pais_id`), congelado al escribir. Lo necesita SLT-47 para pintar «Provincia: San
  José» cuando SLT-46 permita editar los tipos.
- **`id`, con el id del nodo de cada nivel.** Sale de `provincia_id`, `canton_id` y `distrito_id` de
  la orden de la fila (`cierre_detail.orden_id`), que son los ids de los nodos porque se conservan.
  **El nombre es la foto y el id solo enlaza.** Si el nodo se renombró después del cierre, el
  snapshot conserva el nombre congelado y el id apunta al nodo con su nombre nuevo. Si la orden se
  corrigió de ubicación después del cierre, el id es el de la ubicación actual de la orden y puede no
  coincidir con el nombre congelado: lo que se cobró lo dice `nombre`. Quien lea el snapshot (SLT-47)
  no debe resolver el nombre a partir del `id`.
- **Nivel 3 con `"id": null` (review m6, 2026-10-29).** Si la fila tiene `distrito_nombre` pero la
  orden ya no tiene `distrito_id` (se le quitó el distrito o se borró el distrito después del cierre),
  el snapshot lleva igualmente los tres niveles y el tercero sale `{ "profundidad": 3, "tipo": …,
  "nombre": "<distrito_nombre>", "id": null }`. Es la misma regla: el nombre congelado manda y el id
  solo enlaza, así que un enlace que ya no existe se queda en `null` sin quitar el nivel. SLT-47 debe
  esperar `id: null` en cualquier nivel con nombre y pintar el nombre igual (sin enlace).
- **`v`** permite cambiar la forma sin adivinar cuál tiene cada fila.
- **Filas nuevas (R40):** no hay trigger en `cierre_detail` en SLT-43. Las filas creadas después del
  script quedan NULL hasta SLT-47, y relanzar el script las llena (filtra por `ubicacion_snapshot IS
  NULL`). Nadie lee la columna todavía.

### 2.7 Qué depende del país (`docs/perfil-agentes.md > spec_author`)

| Dato | De dónde sale |
|---|---|
| Tipos de nivel (nombres y regla de código) | `pais.nivel_N_*` y `pais.digitos_codigo_nivel_N`, copiados a `tipo_nivel_geografico` (R2, R3) |
| País de cada nodo | El de su fila vieja (`provincia.pais_id`, heredado por cantón y distrito) |
| Qué nodos ve una empresa | `organizacion.pais_id`, por la RLS (R12) |
| Tipo en el snapshot | El país de la empresa de la fila de `cierre_detail` |
| Moneda, impuestos, etc. | No aplica |

`pais.disponible` no se toca. La regla «ningún país con más de 3 niveles se marca disponible hasta
SLT-48» no puede romperse en SLT-43: aquí todo nodo viene de una tabla vieja de nivel 1, 2 o 3. La
hará cumplir SLT-46, que es la que permite crear un cuarto nivel.

## 3. Migraciones (todas con `down.sql`)

Solo aditivas (R19): `CREATE`, `ADD COLUMN`, `ADD CONSTRAINT … NOT VALID`, `CREATE INDEX`, `CREATE
TRIGGER`/`FUNCTION`/`POLICY`, `INSERT` en tablas nuevas y `ALTER TYPE … ADD VALUE IF NOT EXISTS`.
Ningún `UPDATE` de tablas existentes.

| Carpeta | Hace | `down.sql` |
|---|---|---|
| `20261029120000_geo_enums_nodo_geografico` | Los dos `ADD VALUE IF NOT EXISTS` (§2.5). | **No hace nada** y lo explica: Postgres no quita un valor de enum sin recrear el tipo (prohibido en la épica), y el valor sin usar es inocuo. Reaplicar la ida no falla por el `IF NOT EXISTS`. |
| `20261029120100_tipo_nivel_geografico` | Tabla, únicos, FK, RLS, política, `REVOKE`, llenado de todos los países (R2), función y trigger `pais_tipos_de_nivel` (R3). | Borra el trigger, la función y la tabla. |
| `20261029120200_nodo_geografico` | **Comprobaciones previas (R14):** cuenta hermanos con el mismo nombre normalizado y raíces repetidas por país (el código no hace falta: el único viejo por país y nivel equivale al nuevo por país y tipo); si alguna da > 0, `RAISE EXCEPTION` con las cifras antes de crear nada. Después: `geo_normalizar_nombre`, tabla, únicos, índices (GIN incluido), FKs, triggers de §2.2, RLS, política, `REVOKE` y la copia (R13): `INSERT … SELECT` de provincias, luego cantones, luego distritos, pasando por el trigger de invariantes. | Borra triggers, funciones y la tabla. |
| `20261029120300_nodo_geografico_sincronia` | Las tres funciones y los tres triggers de §2.3. | Los borra. |
| `20261029120400_columnas_nodo_geografico` | Las cuatro `ADD COLUMN`, las tres FK `NOT VALID` y los tres triggers de §2.4. | Borra triggers, funciones, FKs y columnas. |
| `20261029120500_indices_nodo_geografico` | Los tres índices de §2.4. | Los borra. |

- La copia de R13 son unas 585 filas en CR: va en la migración, no en el script (tarjeta).
- Los `down.sql` solo deshacen lo que su migración creó; borrar las columnas nuevas pierde lo que
  escribió el script, que se recupera relanzándolo. **A verificar en T1.1:** cómo trata los `down.sql`
  la guardia de migraciones destructivas del PR #29 (pendiente de merge según
  `progress/features/SLT-43.md`); si la guardia aún no está, R19 lo prueba un test propio (§7).
- Se crean con `pnpm run db:migrate:create` y `prisma migrate diff --from-config-datasource
  --to-schema db/schema.prisma` debe salir vacío. El único parcial de raíces y las FK `NOT VALID` no
  los ve el diff (mismo caso que `orden_clave_remision`); se documentan en `schema.prisma`.

## 4. Script de datos: `scripts/geo-backfill-nodo.ts` (R24–R33)

`pnpm geo:backfill [--aplicar | --validar | --equivalencia] [--tabla <t>] [--lote 1000]
[--pausa-ms 0] [--base <nombre>] [--destino <proyecto-o-host>]`

| Modo | Hace | Escribe |
|---|---|---|
| (ninguno) | Comprobaciones de R25, en solo lectura: órdenes con distrito que no es hijo de su cantón, órdenes con cantón que no es hijo de su provincia, total de órdenes, órdenes sin distrito y pendientes (`IS NULL`) de cada columna nueva. | No |
| `--aplicar` | Si R25 da > 0 en jerarquía, sale con error (R26). Si no, por cada tabla (o la de `--tabla`), lotes por *keyset* de id: `UPDATE t SET col = … WHERE id IN (SELECT id FROM t WHERE id > $cursor AND col IS NULL ORDER BY id LIMIT $lote)`; una transacción por lote (R27). Imprime cifras por lote. | Solo columnas nuevas |
| `--validar` | Si queda alguna fila pendiente en `orden`, `zona_distrito` o `distrito_zona_especial`, sale con error. Si no, `ALTER TABLE … VALIDATE CONSTRAINT` de las tres FK (R24). | Solo el estado de las FK |
| `--equivalencia` | R32: por país, conteos de provincia/cantón/distrito frente a nodos por profundidad; por zona, el conjunto de `distrito_id` frente al de `nodo_geografico_id`; órdenes con nodo NULL. Sale con código ≠ 0 si algo difiere. | No |

- **Valores (R27):** `orden.nodo_geografico_id = COALESCE(distrito_id, canton_id)`; zonas
  `= distrito_id`; `ubicacion_snapshot` según §2.6, en un único `UPDATE … FROM` con `orden` (los
  ids), `organizacion` y `tipo_nivel_geografico` (el tipo). Relanzado más tarde, llena también los
  cierres creados después de la primera ejecución (R40).
- **Reanudable (R28):** el filtro `col IS NULL` hace que relanzar siga donde quedó y que con todo lleno
  no escriba nada. El cursor solo evita releer lo ya visto dentro de una ejecución.
- **Sin efectos laterales (R29, R30):** el `UPDATE` solo nombra la columna nueva. En `orden` dispara
  únicamente `orden_nodo_geografico` (que vuelve a poner el mismo valor). `updated_at` no cambia porque
  no lo pone la base.
- **Confirmación de base y de destino (R33):** `--aplicar` y `--validar` exigen las dos; si falta
  alguna o no coincide, salen con código 1 sin escribir nada (ni columnas ni `VALIDATE`). Los modos
  de solo lectura no piden ninguna.
  - `--base <nombre>` igual a `current_database()`.
  - `--destino <proyecto-o-host>` igual al destino de la `DATABASE_URL` con la que se conecta
    (`destinoDeUrl`, sin distinguir mayúsculas). **Añadida tras la review (m2, 2026-10-29):** en
    Supabase `current_database()` es `postgres` en todos los proyectos, así que `--base` sola no
    distingue producción de su copia. El destino es el **project-ref** de Supabase, sacado de donde
    lo lleve la URL: host `db.<ref>.supabase.co` en la conexión directa, usuario `postgres.<ref>` en
    el pooler (`*.pooler.supabase.com`, cuyo host es común a toda la región y no sirve). Fuera de
    Supabase es el host (p. ej. `localhost`). Un pooler sin ref en el usuario, o una URL ausente o
    ilegible, no da destino y el script se niega.
  - Ninguno de los dos mensajes de rechazo imprime el valor real: quien lo lanza tiene que saber
    contra qué base y qué proyecto está.

  Es la barrera contra correrlo en la base equivocada; la regla «ningún agente toca producción» la
  cumple el proceso (§6).
- **Contexto:** corre como dueño con `comoPlataforma("SLT-43", motivo, fn)` y entra en
  `EXCEPCIONES_DE_PLATAFORMA`. `FichaJira` (`lib/db/contexto-empresa.ts`) hoy solo admite `SL-<n>`; se
  amplía a `` `SL-${number}` | `SLT-${number}` ``.
- **Testeable:** exporta `comprobar`, `aplicarLote`, `validar` y `equivalencia`, que reciben la
  conexión; el `main` solo parsea argumentos (molde de `migrar-storage-a-carpetas.ts`).
- Solo imprime cifras e ids de zona; nunca nombres de destinatarios ni direcciones.

**Por qué `VALIDATE` en el script y no en una migración:** una migración con `VALIDATE` en SLT-44
fallaría el deploy si el script todavía no ha corrido en producción, y ataría el deploy a un paso
manual. `VALIDATE CONSTRAINT` no cambia la forma del esquema (el diff de Prisma no lo ve) y toma
`SHARE UPDATE EXCLUSIVE`, que no bloquea lecturas ni escrituras.

## 5. Autorización y contexto

| Entrada | Quién | Dónde se valida | Contexto |
|---|---|---|---|
| Migraciones | build de `prod` (`scripts/migrate-deploy.ts`) | `decidirMigracion` (R39) | dueño |
| Triggers de sincronía y de columnas | quien escriba la tabla vieja | las funciones son `SECURITY DEFINER` donde escriben en tablas de plataforma | el de la escritura |
| `scripts/geo-backfill-nodo.ts` | una persona, fuera de horario | R33 + proceso (§6) | `comoPlataforma` |

No hay action, ruta ni pantalla nueva. No aplica ningún módulo apagable.

## 6. Ensayo y despliegue (fuera del código; puerta humana)

1. Antes de migrar producción, una persona corre el script sin opciones contra producción (solo
   lectura). Si R25 da > 0 en jerarquía, para y decide el humano.
2. Ensayo completo sobre una **copia** de producción: migraciones, `--aplicar`, `--equivalencia`,
   `--validar`, los `down.sql` y otra vez la ida. Se anotan las cifras, los tiempos y el coste del
   trigger en `progress/impl_SLT-43.md`. Los modos que escriben se lanzan con las dos confirmaciones
   de R33 (§4), con los valores de la copia:

   ```
   pnpm geo:backfill                                                   # solo lectura (R25)
   pnpm geo:backfill --aplicar --base postgres --destino <ref-de-la-copia> [--lote 1000] [--pausa-ms 0]
   pnpm geo:backfill --equivalencia                                    # solo lectura (R32)
   pnpm geo:backfill --validar --base postgres --destino <ref-de-la-copia>
   ```

   `<ref-de-la-copia>` es el project-ref de Supabase de la copia (el de `db.<ref>.supabase.co` o el
   del usuario `postgres.<ref>` del pooler); fuera de Supabase, el host de su `DATABASE_URL`. En
   producción, el mismo comando con el ref de producción: escribirlo a mano es la confirmación.

   **Bloqueos que mide el ensayo (review m7, 2026-10-29)**, para `20261029120400` y `20261029120500`
   sobre `orden`:
   - `120400` hace `ALTER TABLE orden ADD COLUMN` (y los triggers) y toma `AccessExclusiveLock` sobre
     `orden` hasta el `COMMIT` de la migración: se anota cuánto tiempo lo tiene (con la copia en
     reposo).
   - Se repite con una consulta larga sobre `orden` abierta en otra sesión (p. ej. un `SELECT
     pg_sleep(30)` dentro de una transacción que ya leyó `orden`): el `ALTER` espera a que termine y
     encola detrás a todos los lectores y escritores de `orden`. Se anota cuánto espera y cuánto
     tiempo quedan bloqueadas las demás consultas.
   - Con esas cifras decide el humano si el deploy fija `SET lock_timeout` (p. ej. `'5s'`) antes de
     `120400`, para que la migración falle y se reintente en lugar de dejar la tabla bloqueada. Hoy no
     lo fija.
   - `120500` (los índices sobre `orden`): tiempo de creación y bloqueo que toma, igual que arriba.
3. **Sin ediciones de geografía durante el deploy (review m3, 2026-10-29).** Entre que se aplica
   `20261029120200` (la copia de provincias, cantones y distritos a `nodo_geografico`) y
   `20261029120300` (los triggers de sincronía) nadie crea, renombra, mueve ni borra provincias,
   cantones o distritos. Motivo: cada migración hace su propio `COMMIT`, y una fila de geografía
   escrita en esa ventana no tiene nodo ni lo tendrá (aún no hay sincronía que la copie). Las órdenes y
   zonas que la usen tras `120400` fallarían con `23503` (la FK `NOT VALID` sí comprueba las filas
   nuevas). La ventana es de segundos y `--equivalencia` lo detectaría, pero se evita avisando antes
   del deploy a quien edita geografía (superadmin) y no haciéndolo hasta que termine.
4. Backup restaurado y comprobado antes de la release (regla 4 de la épica).
5. Ningún agente corre nada de esto contra producción ni contra la copia.

## 7. Pruebas y trazabilidad

Unit e integración contra Postgres real (`HAY_BASE_DE_DATOS`), sin E2E nuevo (decisión «E2E»). Las
pruebas que bajan migraciones o desactivan triggers usan **base propia** (prefijo `slt43_`), como
`migracion-sl20-ida-y-vuelta`: `migracion-slt43-ida-y-vuelta`, `geo-trigger-orden-rendimiento` y,
desde la review (m1, 2026-10-29), `geo-backfill`, `geo-equivalencia` y `geo-sincronia-orden-zonas`
(`_fixtures/base-propia-43.ts`: crea la base, aplica todas las migraciones y la suelta con
`DROP DATABASE … WITH (FORCE)`). Fixture común: `tests/integration/db/_fixtures/geo-43.ts` (un país de
prueba `XA` con códigos libres, órdenes con y sin distrito, zonas con distritos y filas de
`cierre_detail`).

| R | Test |
|---|---|
| R1, R2, R3 | `tests/integration/db/geo-tipo-nivel.test.ts` (tras migrar, CR y `XA` con 3 tipos y los datos de `pais`; alta de `XB` crea sus 3; cambiar un nombre de nivel actualiza el tipo; `(pais_id, clave)` repetido → `23505`) |
| R4, R5, R6, R7, R8, R9 | `tests/integration/db/geo-nodo-invariantes.test.ts` (padre de otro país → `23503`; tipo de otro país → `23503`; profundidad mala → `SLT43`; ruta de un nodo nuevo y de los descendientes al cambiar de padre; los tres únicos → `23505`; el mismo código en dos tipos distintos del mismo país sí entra) |
| R10 | `tests/integration/db/geo-normalizar-nombre.test.ts` (`geo_normalizar_nombre` = `normalizeName` en todos los nombres de la geografía de la base y en una lista con tildes, ñ, ü, mayúsculas y espacios) |
| R11 | `tests/integration/db/geo-nodo-invariantes.test.ts` (existe el índice GIN sobre `ruta` y `EXPLAIN` de `ruta @> ARRAY[$1]` con `enable_seqscan = off` lo usa) |
| R12 | `tests/integration/db/geo-nodo-rls.test.ts` (dos empresas en CR y `XA`: cada una lee solo su país; `INSERT`/`UPDATE`/`DELETE` como `servi_app` → `42501`) |
| R13, R14 | `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts` (ids, padres, nombres, códigos y `activo` iguales; con dos hermanos «San José»/«San Jose», o con dos provincias homónimas normalizadas, la migración aborta y no deja nada; con una provincia y un cantón de `XA` con el mismo código, la migración pasa) |
| R15, R16, R17, R18 | `tests/integration/db/geo-sincronia-geografia.test.ts` (alta a mano y `importarDivision` de SL-20 crean nodos; renombre, código, retiro/reactivación y cambio de padre se reflejan; borrado físico borra el nodo; `canton.pais_id` sigue saliendo del padre; ninguna fila nueva de historial) |
| R19 | `tests/unit/db/slt43-migraciones-aditivas.test.ts` (lee los `migration.sql` de las seis carpetas y falla con `DROP`, `DELETE`, `RENAME`, `TRUNCATE`, `UPDATE` de tablas existentes o `ALTER TYPE` sin `ADD VALUE IF NOT EXISTS`; contraprueba con texto inventado), más la ida y vuelta (columnas nullable y sin default) |
| R20, R21 | `tests/integration/db/geo-sincronia-orden-zonas.test.ts` (alta de orden con y sin distrito; corrección de distrito; intento de poner otro nodo a mano → lo pisa; alta y cambio en `zona_distrito` y `distrito_zona_especial`) |
| R22 | `tests/integration/db/geo-trigger-orden-rendimiento.test.ts` (base propia; 5 000 órdenes con el trigger y 5 000 con el trigger desactivado, tres rondas, mediana de la diferencia / 5 000 ≤ 1 ms; escribe la cifra por stdout, líneas `[SLT-43 R22]`, visibles en la salida por defecto de `pnpm exec vitest run <archivo>`, para `progress/impl_SLT-43.md`) |
| R23 | `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts` (los dos enums con el valor; filas de historial idénticas antes y después) y `tests/unit/types/historial-accion-entidades.test.ts` (el filtro de `/historico/acciones` no ofrece `nodo_geografico`) |
| R24 | `tests/integration/db/geo-backfill.test.ts` (tras migrar, `pg_constraint.convalidated = false` en las tres FK; `--validar` con pendientes sale con error; tras `--aplicar`, `--validar` las deja validadas) |
| R25, R26 | `tests/integration/db/geo-backfill.test.ts` (cifras de una base con datos conocidos; con una orden cuyo distrito es de otro cantón, `--aplicar` sale con error y no escribe) |
| R27, R28 | `tests/integration/db/geo-backfill.test.ts` (lotes de 2 sobre 7 filas; corte simulado tras el primer lote y relanzar; segunda ejecución completa escribe 0) |
| R29, R30 | `tests/integration/db/geo-backfill.test.ts` (`updated_at` y el resto de columnas de `orden` iguales fila a fila; `cobro_plataforma_movimiento` igual en número y contenido) |
| R31 | `tests/integration/db/geo-backfill.test.ts` (snapshot de una fila con distrito y otra sin él: profundidad, tipo, nombre e `id` en cada nivel; los `id` son los de las FK de la orden; con el distrito renombrado después del cierre, `nombre` es el congelado y `id` sigue siendo el del nodo; las tres columnas sin cambio) |
| R32 | `tests/integration/db/geo-equivalencia.test.ts` (iguales tras el script → código 0; con una fila de `zona_distrito` cuyo nodo se desvió a mano o una orden con nodo NULL → código ≠ 0) |
| R33 | `tests/integration/db/geo-backfill.test.ts` (`--aplicar`/`--validar` sin `--base` o con otro nombre no escriben; sin `--destino` o con otro proyecto u host, código 1 y 0 escrituras aunque `--base` coincida; con los dos correctos, escriben; `destinoDeUrl` con la URL directa y la del pooler de Supabase y fuera de Supabase) |
| R34, R35 | `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts` (ida, script, vuelta en orden inverso: esquema igual que antes salvo los dos valores de enum; datos viejos iguales; tras la vuelta se crean una provincia, un cantón, un distrito, una orden y una fila de zona; reaplicar deja lo mismo) |
| R36 | Suites existentes sin cambiar aserciones: `tests/integration/db/geografia-*.test.ts`, `zona-*`, `cobertura-*`, `carga-division.test.ts`, `migracion-sl20-ida-y-vuelta.test.ts` y el E2E existente de órdenes en el gate completo de CI |
| R37 | `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts` (ningún archivo de `lib/`, `app/` o `components/` escribe `nodoGeografico`/`tipoNivelGeografico` ni hace `INSERT`/`UPDATE`/`DELETE` sobre esas tablas; contraprueba) |
| R38 | Retirado (2026-10-29): sin rama épica. Sin test. |
| R39 | `tests/unit/scripts/migrate-deploy-guardas.test.ts` (existente; sin cambios) |
| R40 | `tests/integration/db/geo-backfill.test.ts` (tras `--aplicar`, una fila nueva de `cierre_detail` nace con `ubicacion_snapshot` NULL; no hay trigger sobre `cierre_detail` en `pg_trigger` con nombre de SLT-43; relanzar `--aplicar` la llena y no toca las ya llenas) |

> **Enmienda 2026-10-29 (humano, Camilo) — excepción explícita a R36:** en `carga-division.test.ts`, solo el caso «decision 4: dos homónimos normalizados bajo el mismo padre» desactiva el trigger de sincronía mientras arma sus datos, dentro de su transacción revertida; sus aserciones no cambian. Motivo: ese estado es imposible en el modelo nuevo (R9/R14) y ninguna vía de la app lo crea. Ningún otro test de SL-20 se toca.
> - 2026-10-29, aprobado por Camilo: dentro de esa misma excepción, la preparación del caso añade `UPDATE canton SET nombre = nombre` sobre el cantón ganador, para que tenga nodo (sin él, el distrito de la carga falla con 23503 por la FK compuesta). El comentario del test lo cubre.
> - 2026-10-29, aprobado por Camilo: `ubicacionSnapshot: undefined` en `tests/integration/db/454/correccion-ramas-sql-real.test.ts` y `tests/integration/db/477-resolicitud-rechazado-sql-real.test.ts` (copian un `cierreDetail` leído; Prisma no acepta `null` en un campo Json y el typecheck fallaba con TS2322). Sin cambios en las aserciones.

## 8. Alternativas descartadas

1. **Convertir `provincia`/`canton`/`distrito` en vistas sobre `nodo_geografico` ya en SLT-43.**
   Cambia la fuente de las escrituras de SL-20 en la misma tarjeta que crea el modelo, y su vuelta
   atrás no es un `down.sql` sino reconstruir tablas con datos: va contra «solo aditivas» y contra
   «la app funciona igual entre tarjetas».
2. **Llenar `orden.nodo_geografico_id` dentro de la migración.** Un `UPDATE` de toda la tabla en la
   transacción del deploy bloquea `orden` mientras dura y no se puede pausar. La tarjeta lo saca a un
   script por lotes.
3. **Validar el país del tipo y del padre en el trigger** en vez de con FK compuestas. Un trigger que
   lee otra fila tiene carrera entre dos transacciones y cuesta una consulta por fila; la FK compuesta
   es declarativa, sin carrera y es el patrón de SL-20 §2.3.
4. **Columna generada para `nombre_normalizado`.** `GENERATED ALWAYS AS (…) STORED` exige una
   expresión inmutable; la versión con `unaccent` no lo es, y la de `normalize()` sí, pero entonces el
   trigger de invariantes igual tiene que existir (profundidad y ruta). Un solo sitio que calcula es
   más fácil de leer.
5. **Trigger de `orden` que busca el nodo por consulta** (p. ej. validando que el distrito sea hijo
   del cantón). Como los ids se conservan, el nodo es el propio `distrito_id` o `canton_id`: la
   asignación directa no consulta nada y deja el coste en la FK, muy por debajo del tope de 1 ms.
6. **`VALIDATE CONSTRAINT` en una migración posterior.** Descartado en §4.

## 9. Riesgos

- **La sincronía es el punto que puede tumbar un flujo** (regla 6 de la épica). Si un único nuevo es
  más estricto que la app, el alta de geografía de SL-20 falla. Mitigación: el código es único por
  país y tipo, igual que hoy (decisión 2026-10-29); R14 aborta la migración si hoy ya hay choques de
  nombre normalizado; y el test de sincronía recorre la pantalla y el CSV de SL-20.
- **`normalize()` y `lower()` dependen del motor y de la collation.** R10 lo compara con
  `normalizeName` sobre datos reales; en el ensayo se repite sobre la copia de producción.
- **Prisma y las relaciones compuestas con un campo opcional** (§2.2). T2.2 lo comprueba antes de
  seguir.
- **Bloqueo del índice sobre `orden`** (§2.4). Aislado en su migración y medido en el ensayo; si
  tarda demasiado sobre la copia, se decide con el humano antes de la release.
