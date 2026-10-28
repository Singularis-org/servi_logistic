# SL-20 — pais-geografia-configurable · design.md

> Requisitos: `requirements.md` (R1–R52). Alcance y decisiones cerradas: el bloque de cabecera y la
> tabla de `requirements.md`; aquí no se reabren.
>
> **(enmienda 2026-10-26)** Aplica las decisiones 1–7 de `progress/features/SL-20.md > Decisiones`
> y recoge en §13 las decisiones de implementación ya hechas en T1–T4. Cada cambio lleva la marca.

## Lo que ya existe

Buscado el 2026-10-26 con los términos `país`/`pais`, `geografía`, `provincia`, `codigo_dta`,
`historial` y `plataforma`, en los tres sitios de `docs/specs.md`:

- **Board** (`feature_list.json`): ninguna otra ficha hace geografía por país. Relacionadas, sin
  solaparse: SLT-42 (teléfono, documento y hora por país; depende de SL-20), SL-21 (moneda e
  impuestos), SL-22 (métodos de pago), SL-26 (panel de superadmin: empresas, planes y módulos; ya no
  trae la geografía) y SL-42 (vehículos de plataforma, la otra mitad de D12).
- **Specs**: `specs/374-catalogo-geografico-admin` (alta y retiro por `activo`, unicidad por padre,
  conteo de órdenes sin entregar), la ficha 375 (`codigo_dta`, renombrado) y
  `specs/SL-38-zona-especial-por-empresa`. Ninguno tiene país.
- **Código** (Grep/Read; el MCP `codebase-memory-mcp` no tiene indexado este worktree, ver
  `list_projects`): no hay tabla, modelo ni tipo de país. Sí existe, y **se reutiliza**:
  - `GeografiaService`, `GeoRepository` e `IGeoRepository` (alta, renombre, activación, árbol,
    hermanos); `GeoRepository` sigue siendo el único sitio que escribe `nombre` en la geografía
    (guardia `geografia-renombrado-punto-unico`).
  - `lib/types/geografia-nodo.ts` (schemas del borde, `normalizarNombreGeografico`, cotas 2–80).
  - `normalizeName` y `rechazoDeNombreDeEtiqueta` para comparar e imprimir nombres.
  - `OrdenRepository.contarSinEntregarPorNodoGeografico` para el conteo del retiro.
  - `lib/parsers/spreadsheet.ts` (`exceljs`, ya aprobado) para leer el CSV.
  - `comoPlataforma`, `exigirSuperadmin` y `esPlataforma` para la autorización y el contexto.
  - El patrón de tabla de plataforma sin acceso para `servi_app` (`cobro_plataforma_tarifa`,
    `entorno_marca`) para el historial de plataforma.
  - `OrganizacionService.altaEmpresa` y la pantalla `/plataforma/empresas` para el país en el alta.

No aparece nada que ya resuelva SL-20: no hay bloqueo.

## 1. Resumen

Una tabla `pais` de plataforma, con clave el código ISO alfa-2. `organizacion.pais_id` fija el país de
cada empresa y no cambia nunca. `provincia.pais_id` cuelga la geografía del país; `canton` y `distrito`
copian el país de su padre, y una FK compuesta impide que diverjan. La RLS de la geografía pasa de
«legible por todos» a «legible si es del país de mi empresa». Un trigger impide que una orden, una
zona o una marca de zona especial apunte a geografía de otro país.

El superadmin gestiona los países y su geografía en `/plataforma/geografia`, con las actions en
contexto de plataforma. Sus acciones se registran en `historial_plataforma`, que ninguna empresa ve.
La UI de la empresa lee los nombres de nivel de su país mediante un provider.

## 2. Modelo de datos

### 2.1 `pais` (plataforma, nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | Código ISO 3166-1 alfa-2. `CHECK (id ~ '^[A-Z]{2}$')`. `CR` para Costa Rica; los tests usan `XA`–`XZ` (rango reservado a usuario por ISO). |
| `nombre` | `TEXT NOT NULL UNIQUE` | «Costa Rica». La comparación normalizada la hace el service (R23). |
| `nivel_1_singular`, `nivel_1_plural` | `TEXT NOT NULL` | «Provincia», «Provincias». |
| `nivel_2_singular`, `nivel_2_plural` | `TEXT NOT NULL` | «Cantón», «Cantones». |
| `nivel_3_singular`, `nivel_3_plural` | `TEXT NOT NULL` | «Distrito», «Distritos». |
| `digitos_codigo_nivel_1/2/3` | `INT NULL` | Regla de código (R17). `CHECK` de los tres nulos o los tres no nulos. CR: 1/3/5. El alta por pantalla no la ofrece: solo la pone la migración de CR. |
| `disponible` | `BOOLEAN NOT NULL DEFAULT true` | **(enmienda 2026-10-26, decisión 6)** Hay cobertura en el país (R44). Con `false` no se ofrece ni se acepta en el alta de empresa (R45); no toca a las empresas que ya están (R46). La añade la migración `20261026130500_pais_disponible` (§3). |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT now()` | |

**Catálogo ISO 3166-1 (enmienda 2026-10-26, decisión 5; R40–R43).** La lista de países del mundo no
vive en la base: es un archivo del repo, `lib/constants/paises-iso-3166-1.ts`, con
`PAISES_ISO_3166_1: readonly { id: string; nombre: string }[]` (alfa-2 y nombre en español) y
`paisDelCatalogo(id)`. La tabla `pais` guarda solo los países dados de alta (R43): la migración sigue
sembrando únicamente `CR`. Sin dependencia nueva: la lista son ~250 filas estáticas que cambian muy
rara vez. **La fuente de la lista es una pregunta abierta** (`requirements.md`); T2.4 no empieza sin
ella. Los países de prueba `XA`–`XZ` no están en el catálogo a propósito: los crea la fábrica
directamente en la base, nunca el alta por pantalla.

Prisma: `model Pais` con `@@map("pais")` y back-relations `provincias` y `organizaciones`.
Se clasifica en `MODELOS_DE_PLATAFORMA` (`lib/db/modelos-de-negocio.ts`).

RLS activada, con la política `pais_lectura FOR SELECT TO servi_app USING (true)` y
`REVOKE INSERT, UPDATE, DELETE ON pais FROM servi_app` (R3, igual que la geografía en SL-17).

**Regla de código (R17).** Si las tres columnas `digitos_codigo_nivel_n` están puestas, un código de nivel
`n` tiene exactamente ese número de dígitos (`^[0-9]+$`) y empieza por el código de su padre; si el
padre no tiene código, el hijo no puede llevarlo. Si están a `NULL`, el código es texto libre de 1–20
caracteres sin espacios. La regla vive en una función pura, `lib/utils/codigo-geografico.ts`, que usan
el alta a mano y la carga CSV. La regla de CR sale de la fila del país y no de un literal `"CR"`
(`docs/architecture.md > Principios 4`).

### 2.2 `organizacion.pais_id`

- `pais_id TEXT NOT NULL DEFAULT 'CR' REFERENCES pais(id) ON DELETE RESTRICT ON UPDATE RESTRICT`, con
  índice. El backfill es el propio `DEFAULT` al añadir la columna (R5).
- **El `DEFAULT 'CR'` existe solo para los tests y el SQL a mano (R10).** Hay inserciones en
  `organizacion` que no conocen el país (Grep del 2026-10-26):
  - SQL a mano en `tests/integration/db/_postgres-real.ts`, `unicos-por-empresa`,
    `migracion-sl40-ida-y-vuelta`, `migracion-sl45-ida-y-vuelta` y
    `scripts/verificar-rls-despliegue.ts`;
  - `create` de Prisma en `tests/fabricas/organizaciones.ts`, `aislamiento-usuarios`,
    `dos-empresas-entradas` y `empresas-plataforma`.

  La app nunca depende del `DEFAULT`: `altaEmpresaInputSchema` exige `paisId` (R6) y lo comprueba un
  test.
- Trigger `organizacion_pais_inmutable`, `BEFORE UPDATE OF pais_id`, que lanza `SQLSTATE 'SL020'` si
  `OLD.pais_id IS DISTINCT FROM NEW.pais_id` (R7). Corre también como dueño, así que cubre al
  superadmin y al SQL a mano.
- Prisma: `paisId String @default("CR") @map("pais_id")` y `pais Pais @relation(...)`.
- **(enmienda 2026-10-26, decisión 3)** La demo de QA (SL-43, `scripts/demo-qa/`) da de alta sus
  empresas en `CR`. Hoy ya nacen allí por la fábrica `crearEmpresa` (`paisId` por defecto `"CR"`, §13);
  T6.4 lo hace explícito.

### 2.3 Geografía colgada del país

**`provincia`**
- `pais_id TEXT NOT NULL DEFAULT 'CR'` con FK a `pais`; el `DEFAULT` responde al mismo motivo que en
  §2.2: unos 14 archivos de `tests/integration/db/` crean provincias sin país (Grep de
  `provincia.create`, 2026-10-26).
  `GeoRepository.crear` y `importarDivision` siempre lo pasan.
- `@@unique([paisId, nombre])` sustituye a `provincia_nombre_key` (R15).
- `@@unique([id, paisId])`, que sirve de destino a la FK compuesta de `canton`.
- `@@unique([paisId, codigoDta])` sustituye a `provincia_codigo_dta_key`. Los `NULL` no compiten
  entre sí (R16).

**`canton`** y **`distrito`** (iguales; `distrito` respecto de `canton`)
- `pais_id TEXT NOT NULL`, sin `DEFAULT`. Lo rellena el trigger `geografia_pais_del_padre`
  (`BEFORE INSERT OR UPDATE OF provincia_id|canton_id`) copiando el país del padre. Así ningún
  llamador ni ningún test lo tiene que conocer.
- FK compuesta `(provincia_id, pais_id) → provincia(id, pais_id)` (o `(canton_id, pais_id) →
  canton(id, pais_id)`), que sustituye a la FK simple. Hace imposible un hijo en otro país que su
  padre (R11), aunque alguien escriba `pais_id` a mano.
  **(enmienda 2026-10-26, decisión 2)** Las dos FK compuestas son `ON UPDATE RESTRICT` (no
  `CASCADE`) y `ON DELETE RESTRICT`, como las simples de antes: mover de país una provincia con
  cantones, o un cantón con distritos, falla con `23503` en vez de arrastrar a los hijos.
- `@@unique([id, paisId])` (solo en `canton`, como destino de la de `distrito`) y
  `@@unique([paisId, codigoDta])`, que sustituye al único global (R16).
- Índice en `pais_id`: lo usa la política RLS.
- Prisma: `paisId String @default(dbgenerated()) @map("pais_id")` y
  `provincia Provincia @relation(fields: [provinciaId, paisId], references: [id, paisId])`. Es el
  patrón de `organizacionId` (`@default(dbgenerated())` vacío, ver el comentario de `model
  Organizacion`). **A verificar en T1.2:** que `prisma migrate diff` salga limpio con un
  `dbgenerated()` sin `DEFAULT` en la base. Si no sale, la columna lleva `DEFAULT` de relleno
  `''`, que el trigger siempre pisa y que la FK rechaza si llegara a quedar.

`orden.provincia_id/canton_id/distrito_id`, `zona_distrito.distrito_id` y
`distrito_zona_especial.distrito_id` no cambian (R14, R18).

### 2.4 RLS de la geografía (R12)

Se sustituyen las políticas `provincia_lectura`, `canton_lectura` y `distrito_lectura` (de
`20261022130000`) por:

```sql
CREATE POLICY "provincia_del_pais" ON "provincia" FOR SELECT TO servi_app
  USING ("pais_id" = (SELECT o."pais_id" FROM "organizacion" o
                      WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')));
-- igual para canton y distrito, cada uno con su propio pais_id (sin join al padre)
```

La subconsulta no está correlacionada: Postgres la evalúa una vez por sentencia (InitPlan). Con
`servi_app`, `organizacion` ya está filtrada por `organizacion_propia`, así que la subconsulta solo ve
la empresa propia. Como la extensión de SL-17 envuelve también los modelos de plataforma en el
contexto de empresa, todas las lecturas de R12 (`resolveGeo`, `listArbol`, `list*Lite`,
`CotizacionOrdenService`, `CorregirDatosCliente`) quedan acotadas sin tocar sus consultas. En
plataforma (como dueño) no hay RLS, y el superadmin filtra por `paisId` de forma explícita.

El `down.sql` vuelve a crear las tres políticas `*_lectura`, porque el `down.sql` de
`20261022130000` las borra por nombre.

### 2.5 Trigger «geografía del país de la empresa» (R13, R38)

Es la función `geografia_del_pais_de_la_empresa()`, `SECURITY DEFINER` con `search_path` fijo
(precedente: los triggers de SL-40), y se engancha así:
- en `orden`: `BEFORE INSERT OR UPDATE OF provincia_id, canton_id, distrito_id`; compara el
  `pais_id` de cada nodo no nulo con el de `organizacion` de `NEW.organizacion_id`;
- en `zona_distrito` y `distrito_zona_especial`: `BEFORE INSERT OR UPDATE OF distrito_id`.

Si no coinciden, lanza `SQLSTATE 'SL021'`. Hace falta porque la FK no pasa por la RLS: un id de otro
país enviado a mano (API, corrección de datos) entraría.

`lib/db/errores-pais.ts` define `GeografiaDeOtroPais` y `PaisInmutable`, y una función
`traducirErrorDePais(e)` con el patrón de `traducirErrorDeEmpresa`. Los puntos de escritura de órdenes
ya devuelven los errores de base como fallo de la operación; con la geografía filtrada por RLS, a la
app normal no le llega un id de otro país, así que este error solo aparece ante un abuso.

### 2.6 `historial_plataforma` (plataforma, nueva; R33–R35)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK uuid | |
| `accion` | enum `historial_plataforma_accion` | `pais_creado`, `division_cargada`, `nodo_geografico_creado`, `nodo_geografico_renombrado`, `nodo_geografico_desactivado`, `nodo_geografico_activado` |
| `entidad_tipo` | enum `historial_plataforma_entidad` | `pais`, `provincia`, `canton`, `distrito` |
| `entidad_id` | `TEXT NOT NULL` | Sin FK, por la misma razón que `historial_accion.entidad_id`. |
| `entidad_etiqueta` | `VARCHAR(120) NOT NULL` | Nombre congelado; se recorta en origen. |
| `pais_id` | `TEXT NOT NULL` FK `pais` `RESTRICT` | |
| `actor_usuario_id` | `TEXT NULL` FK `usuario` `RESTRICT` | `NULL` = sistema o script (la demo de QA). |
| `actor_nombre` | `VARCHAR(120) NULL` | Congelado. |
| `valor_anterior`, `valor_nuevo` | `VARCHAR(80) NULL` | Solo en el renombre. 80 = `GEO_NOMBRE_MAX`, así que no hay recorte. |
| `detalle` | `JSONB NULL` | Solo `division_cargada`: `{creados:{provincia,canton,distrito}, existentes, codigosCompletados}`. Solo cifras. |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT now()` | Inmutable: sin `updated_at`. |

Índices: `(created_at DESC, id)` y `(pais_id, created_at DESC)`. Lleva RLS activada **sin
políticas** y `REVOKE ALL ON historial_plataforma FROM servi_app` (R34; patrón `entorno_marca`). Se
clasifica en `MODELOS_DE_PLATAFORMA`.

**(enmienda 2026-10-26, decisión 7)** Por el `REVOKE ALL`, un `SELECT` de `servi_app` no devuelve
cero filas: la base lo rechaza con `42501` antes de llegar a la RLS. R34 se redacta así y su test
espera el `42501` en la lectura y en la escritura.

**(enmienda 2026-10-26, decisión 6; R47)** El enum `historial_plataforma_accion` gana
`pais_disponibilidad_activada` y `pais_disponibilidad_desactivada` (propuesta, pregunta abierta), con
`entidad_tipo = 'pais'`. Los añade la migración `20261026130500_pais_disponible` (§3).

El único escritor es `appendAccionPlataforma(tx, filas)`, en
`lib/repositories/registrar-accion-plataforma.ts`, y se llama dentro de la transacción del cambio
(R33).

`GeoRepository.cambiarActivacion` y `renombrar` dejan de llamar a `appendAccion` (R35). Los valores
`nodo_geografico_*` del enum `HistorialAccionTipo` **se quedan**, porque hay filas viejas que los usan.
La guardia `historial-accion-escrituras-cubiertas` los pasa a «sin escritor desde SL-20».

### 2.7 Clasificación (gate)

En `MODELOS_DE_PLATAFORMA` se añaden `{ modelo: "Pais", tabla: "pais" }` y
`{ modelo: "HistorialPlataforma", tabla: "historial_plataforma" }`, y el comentario de cabecera pasa
de 16 a 18. Sin esto, `organizacion-en-modelos.guardia` pone el gate en rojo.

## 3. Migraciones (todas con `down.sql`)

**(enmienda 2026-10-26, decisión 1: orden A)** `organizacion_pais` corre antes que
`geografia_por_pais`, porque las políticas `*_del_pais` leen `organizacion.pais_id`. Es el orden de
las carpetas que ya están en `db/migrations/`. Las migraciones 130100–130500 y sus `down.sql` van
entre `BEGIN`/`COMMIT`.

| Carpeta | Hace | `down.sql` |
|---|---|---|
| `20261026130000_pais` | Crea `pais` y sus `CHECK`, siembra `CR` (1/3/5), activa la RLS, crea `pais_lectura` y aplica el `REVOKE`. | `DROP TABLE pais` |
| `20261026130100_organizacion_pais` | Añade `organizacion.pais_id` con `DEFAULT 'CR'`, la FK, el índice y el trigger `organizacion_pais_inmutable`. | Borra el trigger y la columna. |
| `20261026130200_geografia_por_pais` | Añade `pais_id` a las tres tablas (la provincia con `DEFAULT 'CR'`; cantón y distrito por backfill desde el padre y después `NOT NULL`). Cambia los únicos de §2.3, crea las FK compuestas (`ON UPDATE RESTRICT`, decisión 2), el trigger `geografia_pais_del_padre` y las políticas `*_del_pais`, y borra las `*_lectura`. | Deshace todo en orden inverso y vuelve a crear los únicos globales y `*_lectura`. **Aborta con `RAISE` (P0001), antes de tocar nada, si hay nombres de provincia o códigos repetidos entre países** (el único global no cabe): queda escrito en la cabecera. |
| `20261026130300_geografia_del_pais_de_la_empresa` | Crea la función y los tres triggers de §2.5. | Los borra. |
| `20261026130400_historial_plataforma` | Crea los dos enums, la tabla, los índices, la RLS sin políticas y el `REVOKE`. | Borra la tabla y los enums. |
| `20261026130500_pais_disponible` **(enmienda 2026-10-26, decisión 6)** | Añade `pais.disponible BOOLEAN NOT NULL DEFAULT true` (CR queda disponible, R44) y los dos valores `pais_disponibilidad_*` de `historial_plataforma_accion` (§2.6). No toca la RLS ni el `REVOKE` de `pais` (R3 sigue cubriendo la escritura desde una empresa). | Aborta con `RAISE` si hay filas del historial con `pais_disponibilidad_*` (no se borra evidencia); si no, vuelve a crear el enum sin esos valores y borra la columna. |

Se crean con `pnpm run db:migrate:create` y se comprueban con
`prisma migrate diff --from-config-datasource --to-schema db/schema.prisma`: el diff tiene que salir
vacío. La ida y vuelta (up → down → up) se prueba en
`tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts`, con el patrón de SL-40 y SL-45.

## 4. Autorización y contexto

| Entrada | Quién | Dónde se valida | Contexto de datos |
|---|---|---|---|
| `/plataforma/geografia` (page) | superadmin | `esPlataforma` antes de leer; si no, `notFound()` (R21) | — |
| `lib/actions/geografia-plataforma.ts` (todas) | superadmin | `resolveActorFromSession` → `exigirSuperadmin` → zod → service (que vuelve a mirar `GESTION_ROLES`) | `comoPlataforma("SL-20", motivo, fn)` |
| `lib/actions/geografia.ts > listarArbolGeografico` | `maestro` y plataforma (sin cambio) | service | empresa (RLS del país, R12) |
| `lib/actions/organizaciones.ts > altaEmpresaAction` | superadmin (sin cambio) | sin cambio; el `paisId` lo valida zod | `comoPlataforma` (ya listada) |
| Nombres de nivel de la empresa | cualquier sesión de empresa | `app/(app)/layout.tsx` | empresa |

- `lib/actions/geografia-plataforma.ts` entra en `EXCEPCIONES_DE_PLATAFORMA` con la ficha `SL-20` y
  el motivo «gestión de países y geografía por el superadmin, que no tiene empresa; conteo de
  órdenes de todas las empresas (D15)». Así es como se cierra D15 (R32): toda la cadena corre como
  dueño. `OrdenRepository.contarSinEntregarPorNodoGeografico` cuenta sin filtro de empresa, con lo
  que son todas las empresas (R31). Como un nodo solo existe en un país, «todas las empresas» y
  «todas las empresas del país» son lo mismo (R13 lo garantiza).
- Las escrituras de nodos salen de `lib/actions/geografia.ts` (`crearNodoGeografico`,
  `cambiarActivacionGeografica`, `renombrarNodoGeografico`, `contarOrdenesSinEntregarDeNodo`) y se
  mudan a `geografia-plataforma.ts`. En `geografia.ts` quedan solo lecturas y la marca de zona
  especial, que son de empresa. Se actualiza la tabla de puntos de la guardia
  `geografia-renombrado-punto-unico`.
- **D12, geografía (R36):** los `catch {}` genéricos de alta y renombre se quedan solo con el error
  de único (`P2002`, o el código de Postgres `23505`) → `conflict`. Cualquier otro error →
  `{ status: "error" }` y `console.error` con la operación y el nivel, sin datos de persona. Es el
  mismo cambio en las actions de país y de carga.
- **R37:** `GESTION_ROLES = ROLES_PLATAFORMA` ya existe (SL-32). `PaisService` y
  `CargaDivisionService` lo leen por import (guardia `superadmin-fuera-de-empresa`).
- **Módulos encendidos:** no aplica; los módulos por empresa son de SL-26.

## 5. Capas

| Capa | Archivo | Qué cambia |
|---|---|---|
| Tipos | `lib/types/pais.ts` (nuevo) | `crearPaisSchema` (código `^[A-Z]{2}$`, nombre y los seis nombres de nivel con `normalizarNombreGeografico`, 2–40), `PaisDTO`, `EtiquetasGeograficas`, `etiquetasDePais(pais)` y `ETIQUETAS_NEUTRAS` («Nivel 1»…), que se usan cuando no hay empresa. |
| Tipos | `lib/types/geografia-nodo.ts` | El alta de provincia lleva `paisId`; las tres altas llevan `codigo?` opcional (texto recortado). Sale `NIVEL_LABELS` y entra `etiquetaDeNivel(etiquetas, nivel, "singular"\|"plural")`. Los DTO del árbol de plataforma (`NodoPlataformaDTO`) van sin zona: el superadmin no ve datos de empresas. |
| Tipos | `lib/types/division-csv.ts` (nuevo) | Contrato de §6: cabeceras, `FilaDivision`, `ErrorDeLinea`, `ResumenCarga`. |
| Utils | `lib/utils/codigo-geografico.ts` (nuevo) | `validarCodigo(pais, nivel, codigo, codigoPadre)` (R17), pura. |
| Utils | `lib/utils/division-csv.ts` (nuevo) | `planificarDivision(filas, arbolActual, pais)`: valida y cruza (§6). Pura; devuelve `{errores}` o `{plan}`. |
| Parser | `lib/parsers/spreadsheet.ts` | Opción `{ textoLiteral: true }` que lee el CSV sin convertir tipos (`exceljs` `csv.read(stream, { map: (v) => v })`, **a verificar en T3.1**). Sin ella, `"01"` llega como `1`. La carga masiva de órdenes no la usa: no cambia. |
| Repos | `lib/repositories/PaisRepository.ts` (nuevo) + `lib/interfaces/repositories/IPaisRepository.ts` | `listar()`, `porId(id)`, `crear(datos, actor)` (escribe `pais_creado`) y `deLaEmpresa(organizacionId)`. |
| Repos | `lib/repositories/GeoRepository.ts` + interfaz | `listArbolDePais(paisId)` sin zonas; `findHermanos` de provincia acotado por `paisId`; `crear(nivel, nombre, padreId, {paisId, codigo}, actor)` escribe `nodo_geografico_creado`; `cambiarActivacion` y `renombrar` pasan a `appendAccionPlataforma`; nuevo `importarDivision(paisId, plan, actor)` (una transacción, `createMany` por nivel con ids generados en la app, `updateMany` del código solo `WHERE codigo_dta IS NULL`, una fila `division_cargada`). Sigue siendo el único que escribe `nombre`: el import solo crea. |
| Repos | `lib/repositories/registrar-accion-plataforma.ts` (nuevo) | `appendAccionPlataforma`. |
| Repos | `lib/repositories/OrganizacionRepository.ts` | `altaEmpresa` guarda `paisId`; si ya existe con otro país → `conflicto` `paisId` (R8); si la FK falla → `invalida` `paisId` (R6). |
| Repos | `lib/repositories/EmpresasPlataformaRepository.ts` | Selecciona `pais: { id, nombre }` (R9). |
| Services | `lib/services/PaisService.ts` (nuevo) + interfaz | `listar`, `crear` (R23, normaliza y compara el nombre), `etiquetasDeEmpresa(organizacionId)`. |
| Services | `lib/services/GeografiaService.ts` + interfaz | `listarArbolDePais(paisId, actor)`; en `crear`, `validarCodigo` y el código del padre; el resto no cambia. |
| Services | `lib/services/CargaDivisionService.ts` (nuevo) + interfaz | `cargar(paisId, archivo, actor)`: rol → extensión `.csv` y ≤ 5 MB → UTF-8 estricto (`TextDecoder('utf-8', {fatal:true})`, BOM fuera) → parse → cabeceras → ≤ 10 000 filas → `planificarDivision` → `importarDivision` (R24–R28). |
| Services | `lib/services/OrganizacionService.ts`, `lib/types/organizacion.ts` | `paisId` obligatorio en `altaEmpresaInputSchema`; `CampoEnConflicto` gana `paisId`. |
| Actions | `lib/actions/geografia-plataforma.ts` (nuevo, `"use server"`) | `listarPaisesAction`, `crearPaisAction`, `arbolDePaisAction`, `crearNodoAction`, `renombrarNodoAction`, `cambiarActivacionNodoAction`, `contarOrdenesSinEntregarAction`, `cargarDivisionAction(formData)`. Composition root único (test de composición como el de 374). |
| Actions | `lib/actions/geografia.ts` | Pierde las escrituras (§4). |
| DB | `lib/db/errores-pais.ts` (nuevo) | §2.5. |
| Constantes | `lib/constants/paises-iso-3166-1.ts` (nuevo) **(enmienda 2026-10-26)** | Catálogo de §2.1 (R40). Lo importan `crearPaisSchema`/`PaisService` (servidor) y el autocompletado (cliente): es un dato estático, sin action. |
| Tipos | `lib/types/pais.ts` **(enmienda 2026-10-26)** | `crearPaisSchema` deja de recibir `nombre`: recibe `id` (que tiene que estar en el catálogo, R41) y los seis nombres de nivel; el nombre lo pone el service desde el catálogo (R23). `PaisDTO` gana `disponible`. Nuevo `cambiarDisponibilidadPaisSchema` (`{ id, disponible }`). |
| Repos | `PaisRepository` + interfaz **(enmienda 2026-10-26)** | `cambiarDisponible(id, disponible, actor)`: un `UPDATE ... WHERE disponible IS DISTINCT FROM $2` y, si cambió una fila, su entrada `pais_disponibilidad_*` en la misma transacción (R47); si no cambió, éxito sin escribir. `listar()` devuelve también `disponible`. |
| Services | `PaisService` + interfaz **(enmienda 2026-10-26)** | `crear`: R41 (`validation_error` en `id`) y el nombre del catálogo (R23). `cambiarDisponible(input, actor)`: `forbidden` a un rol de empresa, `not_found` si el país no existe (R47). |
| Services | `OrganizacionService` / `OrganizacionRepository` **(enmienda 2026-10-26)** | En el alta nueva, un país con `disponible = false` → `invalida` `paisId` (R45), en la misma consulta previa a `pais` de §13. La repetición de una empresa existente sigue el orden de §13 (pregunta abierta). |
| Actions | `lib/actions/geografia-plataforma.ts` **(enmienda 2026-10-26)** | Más `cambiarDisponibilidadPaisAction`. |

## 6. Formato del CSV de carga (propuesta; Pregunta abierta 1)

- **Archivo:** extensión `.csv`, en UTF-8 (se acepta el BOM), con la coma como separador y comillas
  dobles RFC 4180 para los valores que llevan coma o salto de línea. Máximo 5 MB y 10 000 filas de
  datos (R28). Las filas vacías se ignoran.
- **Cabecera:** obligatoria, en la línea 1, en cualquier orden, sin distinguir mayúsculas y con los
  espacios recortados. Columnas obligatorias: `nivel_1`, `codigo_nivel_1`, `nivel_2`,
  `codigo_nivel_2`, `nivel_3` y `codigo_nivel_3`. Si falta una, se rechaza el archivo entero (R28).
  Las columnas de más se ignoran y la respuesta lo avisa.
  - Los nombres son neutros porque cada país llama distinto a sus niveles. La pantalla muestra la
    equivalencia del país elegido («`nivel_1` = Provincia») y un ejemplo.
- **Fila:** un camino `nivel_1 › nivel_2 › nivel_3`. `nivel_1` y `nivel_2` son obligatorios; `nivel_3`
  puede ir vacío, y entonces la fila solo asegura los dos primeros niveles. Los códigos son opcionales,
  pero un código sin su nombre es un error.
- **Validación por campo:** el mismo contrato que el alta a mano, `normalizarNombreGeografico`,
  2–80 caracteres y `rechazoDeNombreDeEtiqueta`. El código sigue R17 con la regla del país.
- **Identidad de un nodo en el archivo:** el nivel, la identidad del padre y el nombre normalizado
  con `normalizeName`.
  - Dos filas que describen el mismo nodo con los mismos datos son una sola (R27; es lo normal, porque
    cada fila repite su provincia).
  - Son **contradictorias**, y dan error en la segunda línea citando la primera:
    - mismo nodo con dos códigos distintos;
    - mismo código, en el mismo nivel, para dos nodos distintos.
- **Cruce con la base, de arriba abajo:**
  1. Con código, si en ese nivel y país ya hay un nodo con ese código: debe tener el mismo padre y el
     mismo nombre normalizado, y entonces **existe**. Si no lo cumple, error «el código X ya es de «Y»».
  2. Si no, se busca un hermano con el mismo nombre normalizado:
     - si lo hay sin código y la fila trae uno, se **completa el código** (R26; mismo criterio que el
       backfill de la 375, `WHERE codigo_dta IS NULL`);
     - si lo hay con otro código, es un error;
     - si lo hay con el mismo código, o la fila no trae código, **existe**.
  3. Si no hay ninguno, es un **alta**. El padre puede ser un alta del mismo archivo.
  4. Un nodo existente retirado sigue retirado y se cuenta en «existentes»: la carga no reactiva.
- **Casos cerrados (enmienda 2026-10-26, decisión 4):**
  - **Columnas de más** (R48): se ignoran y cada una deja un aviso en `avisos` («La columna «x» no es
    del formato y se ignoró.»), tanto en `ok` como en `invalido`.
  - **Homónimos en la base** (R49): si bajo el mismo padre hay dos nodos con el mismo nombre
    normalizado, la fila se cruza con el primero. «Primero» es estable porque la lectura de la
    división del país ordena por `id`.
  - **Alta bajo un padre retirado** (R50): se permite; el hijo nace activo y el padre sigue retirado.
- **Todo o nada:** con un solo error no se escribe nada (R25).
  - Si valida, todo se escribe en una sola transacción (R24). Un fallo de la base a mitad (por
    ejemplo, una carrera con un alta a mano que choca con el único) deshace todo.
- **Contrato de la carga (enmienda 2026-10-26: es el ya implementado en T3.4).** El service devuelve,
  y la action de T4.3 pasa tal cual salvo el último caso:

  | `status` | Cuándo | Lleva |
  |---|---|---|
  | `ok` | La carga valida y se escribe (R24). Si `creados` y `codigosCompletados` son 0, no se escribe historial. | `creados: { provincia, canton, distrito }`, `existentes`, `codigosCompletados` (lo que de verdad completó el `updateMany ... WHERE codigo_dta IS NULL`, §13) y `avisos` |
  | `invalido` | Una o más filas inválidas (R25, R27). | `errores: [{ linea, mensaje }]` (como máximo 200), `total` y `avisos` |
  | `archivo_rechazado` | Extensión, tamaño, UTF-8, filas o columna obligatoria (R28). | `motivo` |
  | `not_found` | El país no existe (R51). | — |
  | `forbidden` | Rol de empresa (R37). | — |
  | `error` | La base falla al escribir: el service propaga el error y la action responde `error` y lo registra en el log (R36, R51). | — |

- **Código repetido en altas a mano (R16, R52):** el service no lo comprueba antes; lo frena el único
  `(pais_id, codigo_dta)` de la base (`23505`/`P2002`) y la action lo traduce a `conflict`, igual que
  la carrera por nombre. Cualquier otro fallo es `error` (R36).

Ejemplo (Costa Rica):

```csv
nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3
San José,1,San José,101,Carmen,10101
San José,1,Escazú,102,San Antonio,10202
Alajuela,2,Río Cuarto,216,,
```

## 7. Nombres de nivel en la UI (R19, R20)

- **Servidor:** `app/(app)/layout.tsx` llama a `PaisService.etiquetasDeEmpresa` cuando el actor tiene
  empresa. Con el superadmin no hay país: `ETIQUETAS_NEUTRAS`.
- **Cliente:** `providers/EtiquetasGeograficasProvider.tsx` las recibe por props, y
  `hooks/use-etiquetas-geograficas.ts` las lee.
- **Lista cerrada de R19** (Grep del 2026-10-26 sobre `app/`, `components/` y `lib/`). Los módulos
  que hoy exportan constantes pasan a exportar funciones `(etiquetas) => …`, y sus consumidores
  llaman al hook:
  - órdenes: `ordenes-columns.tsx`, `ordenes-filtros-def.ts`, `ordenes-descarga-columnas.ts`,
    `CorregirDatosClienteModal.tsx`, `CorregirUbicacionAviso.tsx`, y sus consumidores
    `OrdenesModule.tsx`, `OrdenesListado.tsx`, `seleccion-a-filter.ts`;
  - entregas: `_components/entregas-filtros-def.ts` y `filtro-secciones.tsx`, consumidos por
    `FiltrosEntregas.tsx`, `entregas-filtro-analitica.ts` y `analitica/page.tsx`;
  - novedades: `novedades-filtros.ts`, consumido por `useNovedadesFiltro.ts` y
    `NovedadesFiltrosBarra.tsx`;
  - recepción satélite: `satelite-descarga-columnas.ts`, `satelite-ordenes-filtros.ts`,
    `SateliteOrdenesListado.tsx`, `RecepcionSateliteModule.tsx` y `recibidas-columns.tsx`;
  - monitoreo: `detalle-columnas.ts`, que consume `ordenesColumns`;
  - mis asignaciones: `FiltroCantonDistrito.tsx`, `useFiltroCantonDistrito.ts`,
    `AsignacionDetalle.tsx`, `chat/chat-format.ts` y `lib/utils/filtro-canton-distrito.ts`;
  - tarifas: `GeografiaSelector.tsx`, `cobertura-descarga-columnas.ts` y
    `DescargarCoberturaButton.tsx`;
  - cierres: `cierre-detalle-shared.tsx`.
- **Fuera de R19** (Pregunta abierta «Carga masiva»): la plantilla y los mensajes de la carga masiva
  de órdenes, `lib/types/plantilla-datos.ts` y `lib/api/openapi-spec.ts` (R18). También
  `lib/types/historial-accion.ts`, que solo etiqueta filas viejas de `nodo_geografico_*`.
- **Guardia nueva:** `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts` barre
  `app/` y `components/` y falla si un literal visible «Provincia», «Cantón» o «Distrito» (con o sin
  plural, entre comillas o en JSX) aparece fuera de una lista de excepciones con motivo. Lleva
  contraprueba sobre texto inventado. Es lo que mantiene cerrada la lista de R19.

## 8. Pantallas

**`/plataforma/geografia`** (`app/(app)/plataforma/geografia/page.tsx`, Server Component)
- Hace la puerta de R21, lee los países con `listarPaisesAction` y el país elegido de `?pais=<id>`
  (por defecto, el primero por nombre), y carga su árbol con `arbolDePaisAction`.
- `GeografiaPlataformaModule.tsx` (cliente) junta:
  - el selector de país (muestra todos los dados de alta, estén o no disponibles);
  - «Nuevo país», en un `Dialog` con código, nombre y los seis nombres de nivel (R23).
    **(enmienda 2026-10-26, decisión 5; R42)** El país se elige con un autocompletado sobre el
    catálogo (busca por nombre o por código) y no hay campo para teclear el código ni el nombre; los
    seis nombres de nivel se escriben a mano. `components/ui/` no tiene hoy combobox ni autocompletado
    (Grep del 2026-10-26: solo `popover.tsx` y `switch.tsx`). Se añade `components/ui/combobox.tsx`
    desde el registro de shadcn sobre `@base-ui/react`, que ya es dependencia: **a verificar en T5.7**
    que la versión instalada (`^1.6.0`) trae el `Combobox`; si no, se arma con `Popover` + `Input` +
    lista, sin dependencia nueva;
  - **(enmienda 2026-10-26, decisión 6; R47)** un `Switch` «Disponible» del país elegido, que llama
    a `cambiarDisponibilidadPaisAction` y dice que apagarlo no afecta a sus empresas (R46);
  - «Cargar CSV», con un `input type=file accept=".csv"`, la tabla de equivalencias de §6, y el
    resumen o la lista de errores con su línea (R24–R28);
  - el árbol editable.
- El árbol editable es `GeografiaAdminModule.tsx`, **movido** desde `configuracion/geografia` y
  adaptado:
  - recibe `etiquetas` y `paisId`;
  - el alta tiene un campo de código opcional;
  - el retiro llama al conteo de todas las empresas (R31).
- **Cambio de comportamiento visible para F1.4:** el árbol del superadmin **deja de mostrar la zona
  de cada distrito** y el aviso «zonas que quedarían sin distritos» (`zonas-sin-distritos.ts`). Las
  zonas son de cada empresa, y en plataforma esa lectura mezclaría las de todas. El archivo y su
  test se borran.
- Se usan componentes de `components/ui/` (shadcn) que ya existen: `Dialog`, `Select`, `Button`,
  `Input`, `Table`.

**`/configuracion/geografia`**: se borran `page.tsx` y su carpeta `_components/`. La ruta responde
404 (R22).

**Menú** (`lib/auth/menu-visibility.ts`): «Geografía» (`/plataforma/geografia`, `roles:
ROLES_PLATAFORMA` por identidad) justo después de «Empresas». Se ajusta el comentario «el único ítem
del superadmin».

**«Empresas»** (`EmpresasModule.tsx`): un `Select` de país obligatorio en el alta, sin
preseleccionar, con los países que le pasa `page.tsx`, y una columna «País» en la tabla (R9).
**(enmienda 2026-10-26, decisión 6)** `page.tsx` le pasa solo los países con `disponible = true`
(R45); la columna «País» muestra el de cada empresa aunque ya no esté disponible (R9, R46). La
puerta de verdad es el servidor (R45): el `Select` es solo comodidad.
`e2e/_dos-empresas-fixture.ts` y `e2e/superadmin-empresas.spec.ts` tienen que elegir el país:
hoy rellenan el formulario de alta. No es un E2E nuevo, es el ajuste de uno que ya existe.

## 9. Qué depende del país en SL-20 (`docs/perfil-agentes.md > spec_author`)

| Dato | De dónde sale |
|---|---|
| Geografía (provincias, cantones, distritos) | `provincia.pais_id` = `organizacion.pais_id`, por la RLS (§2.4) |
| Nombres de nivel | `pais.nivel_n_singular/plural`, por el provider (§7) |
| Regla de código oficial | `pais.digitos_codigo_nivel_n` (§2.1) |
| Si el país se ofrece a empresas nuevas **(enmienda 2026-10-26)** | `pais.disponible` (§2.1) |
| Código y nombre del país **(enmienda 2026-10-26)** | catálogo `lib/constants/paises-iso-3166-1.ts`, copiado a `pais` en el alta (§2.1) |
| Moneda, impuestos, métodos de pago, teléfono, documento, hora | **no en SL-20**: SL-21, SL-22 y SLT-42 leerán `organizacion.pais_id` |

## 10. Alternativas descartadas

1. **`pais_id` solo en `provincia`, con la RLS y la unicidad del código de cantón y distrito
   por join o por trigger.** Se descarta por tres motivos:
   - la política RLS de `distrito` necesitaría un join de dos saltos por fila;
   - el único «código por país» de cantón y distrito no se puede declarar: un trigger que lo compruebe
     tiene carrera entre dos cargas;
   - la FK compuesta de §2.3 da las dos cosas con índices simples y sin carrera, a cambio de una
     columna copiada que no puede divergir.
2. **Clave del país `uuid` con un código ISO aparte.** Se descarta porque:
   - obliga a un id mágico fijo en la migración para el `DEFAULT` de R10;
   - deja ilegibles el `pais_id` de cada fila y los tests;
   - el ISO alfa-2 ya es único y estable, y es la clave que SLT-42 usará para teléfono y documento.
3. **Sin `DEFAULT 'CR'`: toda inserción de empresa y de provincia indica el país.** Es más estricta,
   pero obliga a tocar unos 20 archivos de tests y el script de despliegue
   `scripts/verificar-rls-despliegue.ts`, que solo insertan filas para probar otra cosa. La decisión
   «las fábricas de tests quedan en Costa Rica» pide justo ese comportamiento. La app no depende del
   `DEFAULT`, porque zod exige el país y lo comprueba un test.
4. **Registrar las acciones del superadmin en `historial_accion` con una «empresa de plataforma»
   ficticia.** La descartó la decisión D15, y además rompería el `NOT NULL` y la RLS por empresa de
   esa tabla.
5. **Cargar la división en `.xlsx` o en JSON.** La decisión dice CSV. `parseSpreadsheet` ya leería
   `.xlsx`, pero se acepta solo `.csv` para tener un único formato que documentar y que probar.
6. **Que la carga CSV renombre o reactive nodos existentes.** Rompería el punto único de renombrado
   (guardia de la 375) y haría que un CSV viejo deshiciera ediciones a mano. La edición nodo a nodo
   es el único camino para cambiar un nodo que ya existe.
7. **(enmienda 2026-10-26)** **El catálogo ISO como tabla sembrada en la base** (todos los países,
   con `disponible = false`). Se descarta porque la decisión 5 pide que `pais` guarde solo los dados
   de alta, y porque mezclaría «existe en el mundo» con «lo dimos de alta» (la geografía y las
   empresas colgarían de filas sin nombres de nivel).
8. **(enmienda 2026-10-26)** **Una librería de países** (p. ej. `i18n-iso-countries`). Se descarta
   por la decisión 5 («sin dependencia nueva»): ahorraría unas 250 líneas de datos estáticos a cambio
   de los cuatro checks y la aprobación de `docs/architecture.md > Dependencias de terceros`, y la
   lista cambia muy rara vez.
9. **(enmienda 2026-10-26)** **Apagar un país quitándole el país a sus empresas o impidiéndoles
   operar.** Se descarta por la decisión 6 («sus empresas existentes siguen igual») y por R7 (el país
   de una empresa no cambia).

## 11. Pruebas y trazabilidad

Unit e integración, sin E2E nuevo (decisión «E2E»). La integración corre contra Postgres local con
`servi_app`, y usa `tests/fabricas/paises.ts` (nueva) para crear `XA` y `XB`.

| R | Test |
|---|---|
| R1, R3 | `tests/integration/db/pais-tabla.test.ts` |
| R2, R5 | `tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts` (backfill CR, ids intactos, ida y vuelta) |
| R4, R7 | `tests/integration/db/organizacion-pais-inmutable.test.ts` |
| R6, R8 | `tests/unit/services/organizacion-service.test.ts`, `tests/integration/db/organizacion-alta.test.ts` |
| R9 | `tests/components/empresas-module.test.tsx` |
| R10 | `tests/integration/db/pais-tabla.test.ts` (caso de la fábrica y del SQL a mano) |
| R11, R16 | `tests/integration/db/geografia-por-pais.test.ts` |
| R12, R13, R38, R39 | `tests/integration/db/geografia-dos-paises.test.ts` |
| R14 | `tests/integration/db/geografia-dos-paises.test.ts` (orden sin distrito en `XB`) |
| R15, R29 | `tests/unit/services/geografia-service.test.ts`, `tests/integration/db/geografia-alta.test.ts` |
| R17 | `tests/unit/utils/codigo-geografico.test.ts` |
| R18 | `tests/unit/api/openapi-geografia-sin-cambios.test.ts` |
| R19 | `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts`, `tests/components/etiquetas-geograficas.test.tsx` |
| R20, R21, R22 | `tests/unit/components/geografia-plataforma-page.test.tsx`, `tests/unit/auth/menu-visibility.test.ts` |
| R23 | `tests/unit/services/pais-service.test.ts`, `tests/integration/db/pais-repositorio.test.ts` (enmienda 2026-10-26: más el nombre tomado del catálogo) |
| R24–R28 | `tests/unit/utils/division-csv.test.ts`, `tests/unit/services/carga-division-service.test.ts`, `tests/integration/db/carga-division.test.ts` |
| R30 | `tests/integration/db/geografia-renombrado.test.ts`, `geografia-cascada-reversible.test.ts` (adaptados) |
| R31, R32 | `tests/integration/db/geografia-superadmin-sin-empresa.test.ts` |
| R33, R35 | `tests/integration/db/geografia-registro-accion.test.ts` (reescrito: ahora a plataforma) |
| R34 | `tests/integration/db/historial-plataforma-rls.test.ts` (enmienda 2026-10-26: espera `42501` en la lectura y en la escritura) |
| R36 | `tests/unit/actions/geografia-plataforma-action.test.ts` |
| R37 | `tests/unit/services/geografia-service.test.ts`, `tests/unit/services/pais-service.test.ts` |

Requisitos de la enmienda 2026-10-26:

| R | Test |
|---|---|
| R40 | `tests/unit/constants/paises-iso-3166-1.test.ts` (alfa-2 válidos, sin códigos ni nombres normalizados repetidos, `CR` = «Costa Rica», ningún `XA`–`XZ`) |
| R41 | `tests/unit/services/pais-service.test.ts` (código fuera del catálogo → `validation_error` en `id`, sin llamar al repo) |
| R42 | `tests/unit/components/geografia-plataforma-page.test.tsx` (autocompletado por nombre y por código, sin campo de código) |
| R43 | `tests/integration/db/pais-tabla.test.ts`, `tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts` (tras las migraciones, `pais` solo tiene `CR`) |
| R44 | `tests/integration/db/pais-disponible.test.ts`, `tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts` (CR disponible tras la ida; la vuelta de `120500` borra la columna) |
| R45 | `tests/unit/services/organizacion-service.test.ts`, `tests/integration/db/organizacion-alta.test.ts`, `tests/components/empresas-module.test.tsx` (el `Select` no lista el país apagado) |
| R46 | `tests/integration/db/pais-disponible.test.ts` (con `XA` apagado, su empresa lee su geografía y crea una orden como `servi_app`) |
| R47 | `tests/unit/services/pais-service.test.ts`, `tests/unit/actions/geografia-plataforma-action.test.ts`, `tests/integration/db/pais-disponible.test.ts` (fila `pais_disponibilidad_*`; mismo estado sin escribir) |
| R48 | `tests/unit/services/carga-division-service.test.ts` (columnas de más: se ignoran y van en `avisos`) |
| R49, R50 | `tests/integration/db/carga-division.test.ts` (homónimos: gana el primero por `id`; alta bajo un padre retirado: el hijo nace activo) |
| R51 | `tests/unit/services/carga-division-service.test.ts` (`not_found`), `tests/unit/actions/geografia-plataforma-action.test.ts` (fallo de base → `error`) |
| R52 | `tests/integration/db/geografia-alta.test.ts`, `tests/unit/actions/geografia-plataforma-action.test.ts` |

## 12. Riesgos

- **El trigger de `orden` suma una consulta** por alta o cambio de geografía (D13). Se mide en T6.3 y
  se anota en `progress/impl_SL-20.md`.
- **La composite FK y Prisma.** Puede que la relación de dos campos con `dbgenerated()` no deje
  limpio el diff. T1.2 lo comprueba antes de seguir, y el plan B está en §2.3.
- **La RLS por país en la geografía** cambia lo que ve toda lectura de empresa. Las suites de
  integración que crean provincias heredan `CR` y empresas en `CR`, así que deberían seguir verdes.
  T6.1 corre todas las de `geografia-*`, `zona-*` y `cobertura-*`.
- **`exceljs` y los códigos con cero inicial.** Sin la opción de §5, `"01"` se lee como `1`. T3.1 lo
  prueba primero.

## 13. Decisiones de implementación ya hechas (enmienda 2026-10-26)

Las tomaron los implementers en T1–T5.4 (`progress/impl_SL-20*.md`) dentro del design. Se recogen
aquí sin cambiarlas, para que el spec diga lo que hace el código:

- **Trigger `geografia_pais_del_padre`** (§2.3): pisa siempre `NEW.pais_id` con el país del padre. Un
  `INSERT` de cantón con `pais_id` de otro país no falla: queda en el país del padre (R11 se cumple).
  Con un padre inexistente lanza `23503` con la FK compuesta como `CONSTRAINT`, para que el llamador
  vea la misma violación de FK (P2003) que antes y no un `23502`.
- **`lib/db/errores-pais.ts`** (§2.5): `PaisInmutable` (`SL020`), `GeografiaDeOtroPais` (`SL021`) y
  `traducirErrorDePais`, que recorre el mismo grafo `cause`/`meta`/`driverAdapterError` que
  `traducirErrorDeEmpresa`. El detector se copió en vez de exportarlo de `contexto-empresa.ts`, para
  no tocar SL-17.
- **`numerosDeFila` en `ParsedSpreadsheet`** (`lib/parsers/spreadsheet.ts`): array paralelo con el
  `rowNumber` de `exceljs` (cabecera = 1) para que R25 cite la línea. Es aditivo: la carga masiva de
  órdenes no lo lee. Con un valor entre comillas que trae un salto de línea, cuenta registros, no
  líneas físicas.
- **Icono del menú «Geografía»**: clave `map` en `IconKey` y `map: MapIcon` (lucide `Map`, renombrado
  para no tapar el `Map` global) en `ICON_BY_KEY` de `app/(app)/_components/Sidebar.tsx`.
- **Código de país como `id`** en `crearPaisSchema`, igual que la columna y `paisId`.
- **`conflict` del alta de país con el campo**: `{ status: "conflict", campo: "id" | "nombre" }` (R23).
- **`ETIQUETAS_NEUTRAS`** lleva singular y plural («Nivel 1»/«Nivel 1»…), con la forma de
  `EtiquetasGeograficas`.
- **`etiquetasDeEmpresa` lanza** si la empresa no tiene país visible, con su id: no inventa
  etiquetas sobre un dato roto. El layout (T5.1) decide qué hace con el error.
- **`crearEmpresa`** (`tests/fabricas/empresa-y-usuarios.ts`) acepta `paisId?` con `"CR"` por defecto
  (R10); por eso la demo de QA ya nace en `CR` (decisión 3).
- **Alta de empresa**: R6 se resuelve con una consulta previa a `pais` dentro de la transacción del
  alta (sin traducir P2003), y R8 se decide antes de mirar si el país existe.
- **`codigosCompletados`** cuenta lo que de verdad completó el `updateMany ... WHERE codigo_dta IS
  NULL`; si alguien puso un código a mano entre medias, gana el suyo.
