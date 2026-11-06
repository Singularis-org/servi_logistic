# SLT-46 — geo-jerarquica-admin · design.md

> Escrito por `spec_author` el 2026-11-06 sobre la rama apilada en SLT-45 (contiene SLT-43, SLT-44,
> SLT-65 y SLT-71). Requisitos en `requirements.md` (R1–R45). El alcance y la tabla «Decisiones
> cerradas» no se reabren aquí. Lo que depende de una pregunta abierta lleva «(P<n>)».
>
> El MCP del grafo responde, pero no tiene indexado este worktree (`list_projects` no lo lista): la
> exploración se hizo con Grep/Read.

## Lo que ya existe

Buscado en el board (`feature_list.json`, todos los estados), en `specs/` y en el código con los
términos `tipo_nivel_geografico`, `nodo_geografico` (escritor), `pais_tipos_de_nivel`, «editar tipo»,
«sincronía invertida», `leerDivisionDePais`, «árbol N niveles» y `GeografiaAdminModule`.

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| SLT-89 (zonas sobre el nodo), SLT-48 (contract + mover nodos), SLT-47 (presentación) | board | Fronteras ya acotadas en «Lo que NO entra»; no se solapan |
| SL-20 (`done`): pantalla `/plataforma/geografia`, alta de país, CSV de división, historial de plataforma | `specs/SL-20-…`, `app/(app)/plataforma/geografia/**`, `lib/actions/geografia-plataforma.ts` | Se **extiende**: mismo borde (sesión → `exigirSuperadmin` → zod → service en `comoPlataforma`), mismas pantallas |
| `nodo_geografico`, `tipo_nivel_geografico`, invariantes, únicos, RLS + `REVOKE` | `db/migrations/20261104120100`, `…120200` (SLT-43) | Se reutilizan sin cambios: son la regla de nombre, profundidad y código |
| Sincronía vieja → nodo (`geo_sincronizar_{provincia,canton,distrito}`) | `db/migrations/20261104120300` (SLT-43) | **No se toca**. Convive con la copia nueva (§2.2) |
| Trigger `pais_tipos_de_nivel` (pais → tipos 1–3) | `db/migrations/20261104120100` | **No se toca**: hace de copia de vuelta al editar un tipo (§2.4) |
| Valores `nodo_geografico_{creado,renombrado,desactivado,activado}` y entidad `nodo_geografico` en los enums de `historial_plataforma` | `db/schema.prisma`, `20261104120000` | Se usan por primera vez (P5) |
| `appendAccionPlataforma`, `resolverActorCongelado` | `lib/repositories/registrar-accion-plataforma.ts`, `registrar-accion.ts` | Único escritor del historial; sin cambios |
| `CatalogoGeograficoRepository.dePais`, `geografia-dominio` (`ancestros`, `nodosBajo`, `tiposDelPais`) | SLT-44 | Lectura del árbol de N niveles (§4.3) |
| `etiquetaDeEntidad("nodo_geografico", { nombres })` | `lib/types/historial-accion-etiquetas.ts` (SLT-43) | Etiqueta congelada de los nodos (R35) |
| `planificarDivision`, `CargaDivisionService`, cotas del CSV | `lib/utils/division-csv.ts`, `lib/types/division-csv.ts` | Se generalizan de 3 niveles a P (§5) |
| `validarCodigo` (regla por país, 3 niveles) y `tipo.digitos_codigo` + `codigo_hereda_prefijo` | `lib/utils/codigo-geografico.ts`, SLT-43 §2.1 | La regla pasa a leerse del tipo (§4.5) |
| Regla «país aún no habilitado» de SLT-45 | `lib/services/geo-ubicacion.ts` (`esPaisDeTresNiveles`, `MSG_PAIS_NO_HABILITADO`) | No se toca; R29 lo prueba |
| `equivalencia` del script de SLT-43 (conteos por profundidad) | `scripts/geo-backfill-nodo.ts` | Se añade un modo fila a fila (P8) |
| Guardias `nodo-geografico-sin-escritor`, `geografia-renombrado-punto-unico`, `geografia-sin-borrado-fisico`, `slt43-migraciones-aditivas` | `tests/unit/guards/`, `tests/unit/db/` | La primera se retira (lo anunciaba); las otras se ajustan (§9) |
| Fixture de países de 2 y 4 niveles | `tests/fixtures/paises-de-prueba-geo.ts` (SLT-45) | Se reutiliza para los tests de N niveles |
| Base propia para bajar migraciones | `tests/integration/db/_fixtures/base-propia-43.ts` | Molde de la ida y vuelta de SLT-46 |

Nada de lo encontrado escribe el nodo desde la app ni edita tipos: se sigue.

## 1. Resumen

La app pasa a escribir la geografía en `nodo_geografico` (y los tipos en `tipo_nivel_geografico`). Un
trigger nuevo `AFTER` en `nodo_geografico` copia cada nodo de profundidad 1–3 a su fila de
`provincia`/`canton`/`distrito` con el mismo id. La sincronía vieja → nodo de SLT-43 se queda: cuando
recibe el eco de la copia nueva, encuentra el nodo idéntico y no escribe nada (su `WHERE … IS DISTINCT
FROM`). Para que el eco sea siempre idéntico, el tipo de un nodo es el de su profundidad (P1). La
pantalla del superadmin pasa a un árbol de N niveles; el alta de país recibe la lista de tipos; los
nombres de un tipo se editan y, en los niveles 1–3, se copian a `pais.nivel_N_*`. El CSV de división
admite P niveles y se cruza con los nodos. Dos migraciones, las dos aditivas; ninguna toca `orden`.

## 2. Modelo de datos

Sin tablas ni columnas nuevas. `nodo_geografico` y `tipo_nivel_geografico` son de **plataforma**
(sin `organizacion_id`, RLS de lectura por país, `REVOKE` de escritura a `servi_app`, SLT-43 R12):
no cambia nada de eso. La app las escribe como dueño, dentro de `comoPlataforma` (§8).

### 2.1 El tipo de un nodo (R14, R15) — P1

- El tipo de un nodo de profundidad k es el tipo de clave `nivel_<k>` de su país. El service lo busca
  al dar de alta; si no existe, `validation_error` en `padreId` («Este país no tiene un nivel por debajo
  de <tipo del padre>») y no se escribe (R15).
- Las claves `nivel_1..nivel_P` ya son la convención de SLT-43 (migración, sincronía y el fixture de 4
  niveles de SLT-45). La profundidad máxima de un país es P.
- Por qué la regla (y no elegir el tipo): §2.2, «Convivencia». Alternativa en §12.

### 2.2 Copia nodo → geografía vieja (R2–R7)

Función `geo_copiar_nodo_a_geografia_vieja()`, `SECURITY DEFINER SET search_path = public` (como la
sincronía de SLT-43: escribe tablas de plataforma sea quien sea el que escribe el nodo), y trigger:

```sql
CREATE TRIGGER "nodo_geografico_copia_a_geografia_vieja"
  AFTER INSERT OR UPDATE OF "nombre", "codigo_oficial", "activo", "padre_id", "profundidad" OR DELETE
  ON "nodo_geografico" FOR EACH ROW EXECUTE FUNCTION geo_copiar_nodo_a_geografia_vieja();
```

| Evento | Qué hace |
|---|---|
| `UPDATE` con `profundidad` distinta y alguna de las dos ≤ 3 | `RAISE EXCEPTION … USING ERRCODE = 'SLT46'` (R6). Hoy ya lo frena casi siempre el invariante de SLT-43 (nodo con hijos); esto cubre la hoja que cambiaría de tabla vieja. |
| `INSERT`/`UPDATE` con `NEW.profundidad > 3` | Nada (R3). |
| `INSERT`/`UPDATE`, profundidad 1 | `INSERT INTO provincia AS v (id, nombre, codigo_dta, activo, pais_id) VALUES (NEW.…) ON CONFLICT (id) DO UPDATE SET nombre, codigo_dta, activo WHERE (v.nombre, v.codigo_dta, v.activo) IS DISTINCT FROM (EXCLUDED.…)`. |
| … profundidad 2 | Igual sobre `canton (id, nombre, provincia_id, codigo_dta, activo)`, con `provincia_id = NEW.padre_id` también en el `DO UPDATE`. `pais_id` lo pone `canton_pais_del_padre` (SL-20, `BEFORE`), que no se toca. |
| … profundidad 3 | Igual sobre `distrito (id, nombre, canton_id, codigo_dta, activo)`. |
| `DELETE`, profundidad 1–3 | `DELETE FROM <tabla> WHERE id = OLD.id` (R7). |

**Convivencia con la sincronía vieja → nodo (R4).** Recorridos, con `pg_trigger_depth()` entre
corchetes:

1. *La app crea un nodo de profundidad 2* [0] → copia nueva [1] inserta el cantón →
   `canton_pais_del_padre` [2] pone `pais_id` → `geo_sincronizar_canton` [2] hace su upsert del nodo:
   choca por id (el nodo ya está), compara `(pais_id, tipo_id, padre_id, profundidad, nombre,
   codigo_oficial, activo)` y, como son iguales, **no actualiza**. Sin `UPDATE` no se dispara ningún
   `AFTER` en `nodo_geografico`: fin. (El `BEFORE` de invariantes sí corre sobre la fila propuesta del
   `INSERT … ON CONFLICT`; solo lee el padre: una consulta más por fila, medida en el ensayo §10.)
2. *La app renombra un nodo* [0] → copia nueva [1] `UPDATE canton SET nombre` →
   `geo_sincronizar_canton` [2] encuentra el nodo igual → nada. Fin.
3. *Alguien escribe `provincia` por SQL* (tests de SLT-43, SQL a mano) [0] → sincronía vieja [1]
   actualiza el nodo → copia nueva [2] hace el upsert de `provincia`: la fila ya tiene esos valores →
   el `WHERE … IS DISTINCT FROM` no actualiza → fin.

Ninguna de las dos funciones se escribe a sí misma por el otro lado con valores distintos, así que no
hay bucle ni doble escritura. **La condición es que `tipo_id` coincida**: la sincronía vieja pone el
tipo `nivel_<profundidad>`; si el nodo tuviera otro tipo, el eco lo pisaría. Por eso P1. Un nodo de
profundidad ≤ 3 con otro tipo solo puede nacer por SQL a mano, y el eco lo devolvería al de su
profundidad: queda escrito en el comentario de la migración.

**Errores (R5).** La copia corre en la misma sentencia que la escritura del nodo; si la tabla vieja
falla (p. ej. su único literal `(pais_id, nombre)`), falla todo con el mismo SQLSTATE: un `23505`
llega a la action como `P2002` → `conflict` (patrón de SLT-43 §2.3). Los únicos del nodo son iguales o
más estrictos (nombre normalizado frente a literal; código por país y tipo = por país y nivel con P1),
así que en la práctica el que salta es el del nodo.

**Datos existentes.** La migración no copia nada: hoy la geografía vieja y los nodos ya son iguales
(SLT-43 R13, R15). El trigger solo actúa en escrituras posteriores. Los ids no cambian.

### 2.3 Enums (R37)

`ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_nivel_geografico_creado'`,
`… 'tipo_nivel_geografico_renombrado'`, y `ALTER TYPE "historial_plataforma_entidad" ADD VALUE IF NOT
EXISTS 'tipo_nivel_geografico'`. En su propia migración (un valor añadido no se usa en la misma
transacción). `schema.prisma` gana los tres valores. No hay mapas exhaustivos sobre estos enums en
`lib/` (Grep 2026-11-06: solo `registrar-accion-plataforma.ts` los importa como tipo).

### 2.4 Tipos y `pais.nivel_N_*` (R23, R25, R27)

- **Alta de país.** `PaisRepository.crear` en una transacción: `pais.create` con los tres primeros
  tipos en `nivel_{1,2,3}_*` → el trigger `pais_tipos_de_nivel` crea `nivel_1..3` (con la regla de
  código de `pais`, que en un país nuevo es «sin dígitos») → `tipoNivelGeografico.createMany` de
  `nivel_4..nivel_P` (`digitos_codigo` NULL, `codigo_hereda_prefijo` false) → historial (R37).
- **Edición de un tipo.** `PaisRepository.renombrarTipo` en una transacción: lee el tipo con su país;
  si los dos nombres son iguales → `sin_cambio`; `tipoNivelGeografico.update`; si la clave es
  `nivel_1..3`, `pais.update` de las dos columnas de ese nivel → `pais_tipos_de_nivel` vuelve a hacer el
  upsert de los tres tipos desde `pais` con los mismos valores (no hay trigger en
  `tipo_nivel_geografico`, así que no hay bucle) → historial.
- Las etiquetas de las empresas salen de `pais.nivel_N_*` (`etiquetasDePais` →
  `EtiquetasGeograficasProvider` en `app/(app)/layout.tsx`): con la copia, R27 sale sin tocarlas.

### 2.5 Qué depende del país (`docs/perfil-agentes.md > spec_author`)

| Dato | De dónde sale |
|---|---|
| Tipos (nombres, regla de código) | `tipo_nivel_geografico` del país; copia en `pais.nivel_N_*` para 1–3 |
| Profundidad máxima | Número de tipos del país (P) |
| Columnas del CSV | P (R30) |
| Etiquetas de la UI de empresa | `pais.nivel_N_*` (sin cambios) |
| Moneda, impuestos, métodos de pago | No aplica |

## 3. Migraciones (todas con `down.sql`)

| Carpeta | Hace | `down.sql` |
|---|---|---|
| `20261106120000_slt46_historial_tipos_de_nivel` | Los tres `ADD VALUE IF NOT EXISTS` de §2.3. | No hace nada y lo explica (como `20261104120000`): Postgres no quita un valor de enum sin recrear el tipo, y el valor sin usar es inocuo. |
| `20261106120100_slt46_nodo_copia_a_geografia_vieja` | La función y el trigger de §2.2, con el comentario de convivencia. | `DROP TRIGGER` y `DROP FUNCTION` de lo que creó (el `down.sql` deshace; la regla de solo aditivas es de la ida). |

- Ninguna toca `orden` (R10), ni crea índices, ni escribe datos: no hay bloqueo largo que medir sobre
  `orden`. El `CREATE TRIGGER` toma `SHARE ROW EXCLUSIVE` sobre `nodo_geografico` (unos 600 nodos por
  país, solo la escribe el superadmin): se anota en el ensayo.
- Fechas: `20261106…`, después de la última del worktree (`20261104150200`). Si `dev` trae otra
  posterior antes del merge, se renombra la carpeta antes de mergear (no está aplicada en ningún sitio).
- Se escriben a mano (`db:migrate:create` falla con P3006 en este repo, ver `20261022130000`).
  `prisma migrate diff` debe salir vacío salvo los valores de enum; el trigger no lo ve el diff.
- **Aditivas (R8).** `tests/unit/db/slt46-migraciones-aditivas.test.ts`. Las reglas de SLT-43
  (`faltasR19`) se extraen a `tests/unit/db/_migraciones-aditivas.ts` (sin cambiar las aserciones de
  `slt43-migraciones-aditivas.test.ts`) y ganan una opción: el `INSERT`/`UPDATE`/`DELETE` **dentro del
  cuerpo `$$ … $$` de un `CREATE FUNCTION`** es la escritura del trigger en tiempo de ejecución y no
  cuenta; `DROP`, `TRUNCATE`, `RENAME`, `ALTER COLUMN` y `EXECUTE` siguen contando también ahí.
  Contraprueba con texto inventado (un `UPDATE provincia` suelto en la migración sale rojo).

## 4. Capas y contratos

Borde → service → repositorio, como SL-20. Todas las actions en `lib/actions/geografia-plataforma.ts`
(ya en `EXCEPCIONES_DE_PLATAFORMA`): `puerta` → zod → service dentro de `comoPlataforma`.

### 4.1 Esquemas zod (`lib/types/geografia-nodo.ts`, `lib/types/pais.ts`)

| Esquema | Forma (`.strict()`) | Cambia |
|---|---|---|
| `crearNodoGeograficoSchema` | `{ paisId, nombre, codigo? }` (raíz) \| `{ padreId, nombre, codigo? }` (hijo) | Antes, discriminada por `nivel` |
| `renombrarNodoGeograficoSchema` | `{ id, nombre }` | Sin `nivel` |
| `cambiarActivacionGeograficaSchema` | `{ id, activo }` | Sin `nivel` |
| `nodoGeograficoSchema` (conteo) | `{ id }` | Sin `nivel` |
| `crearPaisSchema` | `{ id, tipos: { singular, plural }[] }` con 3–10 tipos (P2) y `nombrePaisSchema` (2–40) | Antes, seis campos `nivelNSingular/Plural` |
| `renombrarTipoNivelSchema` (nuevo) | `{ tipoId, nombreSingular, nombrePlural }` | — |

Ninguno acepta `padreId` en el renombre ni en el cambio de estado (R22): `.strict()` lo rechaza.

### 4.2 Actions (`lib/actions/geografia-plataforma.ts`)

Se quedan `listarPaisesAction`, `crearPaisAction`, `cambiarDisponibilidadPaisAction`,
`arbolDePaisAction`, `crearNodoAction`, `renombrarNodoAction`, `cambiarActivacionNodoAction`,
`contarOrdenesSinEntregarAction` y `cargarDivisionAction`, con los esquemas nuevos y los mismos
desenlaces (`unauthenticated`, `forbidden`, `validation_error`, `not_found`, `conflict`, `error` con
log sin datos). Nueva: `renombrarTipoNivelAction(input)` → `PaisService.renombrarTipo`. El `catch` de
`esViolacionDeUnico` → `conflict` sigue en altas y renombres (R5).

### 4.3 Services

| Service | Método | Pasos |
|---|---|---|
| `GeografiaService` | `listarArbolDePais(paisId, actor)` | rol → `repo.arbolDePais(paisId)` → `{ status: "ok", tipos, raices }` |
| | `crear(input, actor)` | rol (R39) → `rechazoDeNombreDeEtiqueta` → `repo.contextoDeAlta(destino)` (`null` → `not_found`) → tipo de la profundidad (`null` → `validation_error`, R15) → hermanos por `normalizeName` (R16) → `validarCodigoDeTipo` (R17) → `repo.crear(…)` |
| | `renombrar(input, actor)` | rol → nombre imprimible → `repo.hermanosDeNodo(id)` → choque normalizado excluyendo al propio (R18) → `repo.renombrar` |
| | `cambiarActivacion(input, actor)` | rol → `repo.cambiarActivacion(id, activo)` (R19) |
| | `contarOrdenesSinEntregar(input, actor)` | rol → `repo.profundidadDeNodo(id)`; 1/2/3 → `ordenes.contarSinEntregarPorNodoGeografico("provincia"/"canton"/"distrito", id)` (método de SLT-65, sin cambios); > 3 o inexistente → 0 (R20) |
| | `listarArbol(actor)` (maestro, Tarifas) | Sin cambios |
| `CargaDivisionService` | `cargar(paisId, archivo, actor)` | rol → archivo (sin cambios) → `repo.leerDivisionDePais(paisId)` (`null` → `not_found`) → columnas obligatorias según P (R30) → `planificarDivision` → `repo.importarDivision` |
| `PaisService` | `crear(input, actor)` | rol → `crearPaisSchema` → nombre del catálogo → `repo.crear(datos con tipos)` |
| | `renombrarTipo(input, actor)` (nuevo) | rol → `renombrarTipoNivelSchema` → `repo.renombrarTipo` → `no_existe` → `not_found`; `sin_cambio`/`renombrado` → `ok` (R25, R26) |
| | `cambiarDisponible` | Sin cambios: no mira los niveles (R28) |

Todos los métodos comprueban `GESTION_ROLES` (`ROLES_PLATAFORMA`) **antes** de tocar el repositorio
(R39); el test de cada uno usa un doble de repositorio que falla si se le llama.

### 4.4 Repositorios

`GeoRepository` (escritor único de `nodo_geografico`, R43). Lo que SLT-44 §7 le dejó a SLT-46
(`findHermanos`, `findHermanosDeNodo`, `leerNodoParaActivacion`, la lectura del padre en `crearFila`)
pasa a leer el nodo:

| Método | Contrato |
|---|---|
| `arbolDePais(paisId)` | `{ tipos: TipoNivelDTO[]; raices: NodoArbolPlataformaDTO[] } \| null`, desde `CatalogoGeograficoRepository.dePais` (en memoria, sin CTE recursiva: guardia `geografia-sin-cte-recursiva`) |
| `contextoDeAlta({ paisId } \| { padreId })` | `{ paisId, profundidad, tipo: TipoNivelDTO \| null, codigoPadre, hermanos: {id, nombre}[] } \| null`; una consulta al padre (o al país) con sus hijos (o raíces) y el tipo de la profundidad siguiente |
| `crear(datos, actorId)` | Transacción: `nodoGeografico.create` (con `tipoId`, `profundidad`, `padreId`, `paisId`, `nombre`, `codigoOficial`; `nombreNormalizado` lo pisa el trigger) → etiqueta con la cadena de nombres (subiendo por `padre_id`, a lo sumo P lecturas) → historial `nodo_geografico_creado`. Deja escapar el único. |
| `hermanosDeNodo(id)` | Hermanos incluido él, o `null` |
| `renombrar(id, nombre, actorId)` | Igual que hoy (`no_existe`/`sin_cambio`/`renombrado`), sobre el nodo; solo escribe `nombre` |
| `cambiarActivacion(id, activo, actorId)` | Igual que hoy, sobre el nodo; solo escribe `activo` |
| `profundidadDeNodo(id)` | `number \| null` |
| `leerDivisionDePais(paisId)` | `{ tipos: TipoNivelDTO[]; nodos: NodoExistente[] } \| null` (con `profundidad`), de `nodo_geografico` ordenado por `id` (orden estable de SL-20) |
| `importarDivision(paisId, plan, actorId)` | Transacción (timeout 120 s como hoy): un `createMany` de nodos por profundidad, de arriba abajo, con ids generados y el tipo de cada profundidad; `codigosACompletar` con `updateMany({ where: { id, codigoOficial: null } })`; `division_cargada` si escribió algo, con `creados` por profundidad |

`GeoPrismaClient` pierde `provincia`, `canton` y `distrito` del `Pick` en las escrituras (R1).

`PaisRepository` (escritor único de `tipo_nivel_geografico`, R43): `crear(datos con tipos, actor)` y
`renombrarTipo(tipoId, singular, plural, actor) → "no_existe" | "sin_cambio" | "renombrado"` (§2.4).
`PaisPrismaClient` gana `tipoNivelGeografico`, `historialPlataforma` y `usuario`.

### 4.5 Regla de código (R17)

`validarCodigoDeTipo(tipo: { digitosCodigo, codigoHeredaPrefijo }, codigo, codigoPadre)` en
`lib/utils/codigo-geografico.ts`: con dígitos, exactamente esos dígitos y, si hereda, prefijo del padre;
sin dígitos, 1–20 caracteres sin espacios. `validarCodigo` (por país y nivel) queda como envoltorio
para CR o se retira si nadie lo usa; su tabla de casos de `tests/unit/utils/codigo-geografico.test.ts`
se corre contra la función nueva con los tipos de CR y debe dar lo mismo (R17, R12).

### 4.6 DTO (`lib/types/geografia-nodo.ts`)

```ts
interface TipoNivelDTO { id: string; clave: string; profundidad: number; nombreSingular: string; nombrePlural: string }
interface NodoArbolPlataformaDTO { id: string; nombre: string; codigo: string | null; activo: boolean;
  profundidad: number; tipoId: string; hijos: NodoArbolPlataformaDTO[] }
```

`ProvinciaPlataformaDTO`/`CantonPlataformaDTO` se retiran si no queda consumidor (el árbol de la
empresa, `ProvinciaArbolDTO`, no cambia).

## 5. CSV de división (R30–R34) — P4

- **Cabecera.** Obligatorias `nivel_<k>` y `codigo_nivel_<k>` para k = 1..P (para CR, P = 3: las seis
  de SL-20). Las demás columnas se ignoran con aviso (también `nivel_4` en CR).
- **Fila.** Camino contiguo desde `nivel_1`: `nivel_1` y `nivel_2` obligatorios (como SL-20); a partir
  de ahí, opcionales, pero un nivel vacío seguido de uno lleno es error de línea (R32). Código sin
  nombre, error (como hoy).
- **Tipos.** `FilaDivision` pasa a `{ linea; niveles: { nombre: string; codigo: string }[] }`;
  `ArbolExistente`, `AltaDePlan`, `CodigoACompletar` y `ResumenCarga.creados` se indexan por
  profundidad (número) en vez de por `NivelGeografico`. `planificarDivision(filas, nodos, tipos)` usa
  `validarCodigoDeTipo` por profundidad. El algoritmo de cruce (§6 de SL-20) no cambia.
- **Respuesta.** `creados` pasa a `Record<number, number>`; la pantalla lo pinta con el plural de cada
  tipo. Para CR (R31) el test compara el resultado con el de SLT-45 traduciendo 1/2/3 ↔
  provincia/canton/distrito.
- **SL-20 R49** (homónimos normalizados en la base) deja de poder darse con la lectura del nodo (P6).
- Cotas sin cambios (R34).

## 6. Pantalla (`app/(app)/plataforma/geografia/**`) — P9

- `page.tsx`: igual (404 a quien no es de plataforma antes de leer; `?pais=`), pasa `tipos` y `raices`.
- `GeografiaAdminModule.tsx`: árbol recursivo de `NodoArbolPlataformaDTO`, con el singular del tipo de
  cada nodo; acciones por fila: renombrar, retirar/reactivar (con el conteo de R20), «Agregar
  <singular del tipo siguiente>» solo si existe tipo para profundidad + 1 (R21). Sin mover (R22).
- `GeografiaPlataformaModule.tsx`: el alta de país pide una lista ordenada de tipos (añadir/quitar
  filas, 3–10); la carga CSV muestra la equivalencia `nivel_k = <tipo>` para k = 1..P.
- Nuevo `_components/TiposDeNivelPais.tsx`: lista de tipos del país con editar singular/plural.
- Para CR el árbol tiene los mismos tres niveles, nombres, acciones y mensajes que hoy (R12).
- Componentes de `components/ui/` existentes; nada nuevo de shadcn.

## 7. Historial de plataforma (R35–R38) — P5, P7

| Acción | `accion` | `entidad_tipo` | `entidad_etiqueta` | Otros |
|---|---|---|---|---|
| Alta de nodo | `nodo_geografico_creado` | `nodo_geografico` | Cadena raíz → nodo (`etiquetaDeEntidad("nodo_geografico", …)`) | — |
| Renombre | `nodo_geografico_renombrado` | `nodo_geografico` | Cadena con el nombre nuevo | `valor_anterior`, `valor_nuevo` |
| Retiro / reactivación | `nodo_geografico_desactivado` / `_activado` | `nodo_geografico` | Cadena | — |
| Carga CSV | `division_cargada` | `pais` | Nombre del país | `detalle.creados` por profundidad |
| Alta de país | `pais_creado` + `tipo_nivel_geografico_creado` × P | `pais` / `tipo_nivel_geografico` | País / singular del tipo | — |
| Edición de tipo | `tipo_nivel_geografico_renombrado` × nombres cambiados | `tipo_nivel_geografico` | Singular nuevo | `valor_anterior`, `valor_nuevo`, `detalle.campo` |

Todo con `appendAccionPlataforma(tx, …)` dentro de la transacción del cambio. Nada en
`historial_accion` (R38); el filtro de `/historico/acciones` sigue excluyendo `nodo_geografico` porque
ese enum es el de `historial_accion` (SLT-43 §2.5) y SLT-46 no lo escribe.

## 8. Autorización y contexto

| Entrada | Quién | Dónde se valida | Contexto |
|---|---|---|---|
| Página `/plataforma/geografia` | superadmin | `page.tsx` (`esPlataforma` → `notFound()`) | — |
| Actions de §4.2 | superadmin | `puerta` (sesión + `exigirSuperadmin`) y, otra vez, el service (R39) | `comoPlataforma("SL-20", …)` (R40) |
| Trigger de copia | quien escribe el nodo | `SECURITY DEFINER` | el de la escritura |
| Empresa (`servi_app`) escribiendo nodo o tipo | — | `REVOKE` de SLT-43 → `42501` (R41) | — |

Ningún módulo apagable aplica (geografía de plataforma). Multi-empresa: no hay tabla ni query de
negocio nueva; el conteo de órdenes (de negocio) es el de SLT-65, en plataforma a propósito (SL-20 R31).

## 9. Guardias

| Guardia | Cambio |
|---|---|
| `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts` | **Se retira** (lo anunciaba su cabecera) y la sustituye `nodo-geografico-escritor-unico.guardia.test.ts`: solo `lib/repositories/GeoRepository.ts` escribe `nodoGeografico` y solo `lib/repositories/PaisRepository.ts` escribe `tipoNivelGeografico` (mismos detectores Prisma/SQL, con contraprueba) (R43) |
| nueva `geografia-vieja-sin-escritor.guardia.test.ts` | Ningún archivo de `lib/`, `app/` ni `components/` escribe `provincia`/`canton`/`distrito` (Prisma o SQL), con contraprueba (R1) |
| `geografia-renombrado-punto-unico.guardia.test.ts` | El punto único pasa de las tres tablas viejas a `nodoGeografico`: solo `GeoRepository.renombrar` (y el alta) escribe `nombre` (R43) |
| `geografia-sin-borrado-fisico.guardia.test.ts` | Suma `nodoGeografico` y `tipoNivelGeografico` a las tres viejas, y los `DELETE FROM` SQL (R42) |
| `historial-accion-escrituras-cubiertas.guardia.test.ts` | Sin cambio esperado: `GeoRepository` sigue usando `appendAccionPlataforma(tx`; se comprueba |
| `geografia-lecturas-sin-nodo-fk.guardia.test.ts` | Sin cambio: `GeoRepository` no nombra `nodoGeograficoId`/`nodo_geografico_id` |
| `slt43-migraciones-aditivas.test.ts` | Solo extrae `faltasR19` a un helper; mismas aserciones |

## 10. Ensayo y despliegue (fuera del código; puerta humana)

1. Ensayo sobre una **copia** de producción: aplicar las dos migraciones; desde la app apuntada a la
   copia, en CR, una alta, un renombre, un retiro, una reactivación y una carga CSV pequeña; correr
   `pnpm geo:backfill --equivalencia-geografia` (P8) y `--equivalencia` de SLT-43 → código 0; aplicar
   los `down.sql` en orden inverso; repetir la edición (debe seguir sincronizando viejo → nodo por SQL);
   reaplicar. Se anotan en `progress/impl_SLT-46.md` el tiempo de `CREATE TRIGGER` y el de una carga de
   10 000 filas con la copia nueva (doble escritura + eco) frente a los 120 s del timeout.
2. **Ventana del deploy.** Las migraciones las aplica el build de `prod` (`scripts/migrate-deploy.ts`)
   antes de servir el código nuevo. En la ventana, el código viejo escribe la geografía vieja con el
   trigger nuevo ya puesto: es el recorrido 3 de §2.2 (sin bucle). El caso inverso (código nuevo sin
   la migración) solo se daría si la migración falla y el código se sirve igual; **a verificar en el
   ensayo** que el build corta en ese caso. Por prudencia, se avisa al superadmin de no editar
   geografía durante el deploy (como SLT-43 §6.3).
3. Backup restaurado y comprobado antes de la release (regla 4 de la épica).
4. Ningún agente corre nada contra producción ni contra la copia.

## 11. Trazabilidad (R → test)

Unit con dobles; SQL en `tests/integration/db/` contra Postgres real (`HAY_BASE_DE_DATOS`). Lo que baja
migraciones usa base propia (prefijo `slt46_`, molde `base-propia-43.ts`).

| R | Test |
|---|---|
| R1 | `tests/unit/guards/geografia-vieja-sin-escritor.guardia.test.ts` |
| R2, R3, R7 | `tests/integration/db/slt46-nodo-copia-vieja.test.ts` (alta, renombre, código, retiro y reactivación de nodos de profundidad 1, 2 y 3 → fila vieja igual; profundidad 4 → ninguna fila vieja; borrado físico de un nodo 3 → borra el distrito) |
| R4 | `slt46-nodo-copia-vieja.test.ts` (tras cada escritura, `count(*)` por id = 1 a cada lado y el nodo con su `tipo_id`, nombre y `activo` intactos; `UPDATE provincia` por SQL → nodo actualizado y la fila vieja igual a lo escrito; ninguna sentencia supera `pg_trigger_depth` 3, medido con un trigger de prueba en la transacción revertida) |
| R5 | `slt46-nodo-copia-vieja.test.ts` (provocar el único literal de `provincia` con una fila vieja creada por SQL con el trigger viejo desactivado en la tx → `23505`, sin nodo, sin fila vieja nueva, sin historial) y `tests/unit/actions/geografia-plataforma-action.test.ts` (`P2002` → `conflict`; otro error → `error` con log) |
| R6 | `slt46-nodo-copia-vieja.test.ts` (cambiar la profundidad de una hoja 3 → `SLT46`) |
| R8 | `tests/unit/db/slt46-migraciones-aditivas.test.ts` (verde sobre las dos carpetas; `down.sql` presente; contraprueba: DML suelto sobre tabla existente rojo, DML en cuerpo de función verde, `EXECUTE 'DROP …'` en cuerpo rojo) |
| R9 | `tests/integration/db/migracion-slt46-ida-y-vuelta.test.ts` (base propia: ida, datos, vuelta; esquema = SLT-45 salvo enums; `UPDATE provincia` tras la vuelta llega al nodo; escribir el nodo tras la vuelta no toca la vieja; reaplicar deja lo mismo) |
| R10 | `slt46-migraciones-aditivas.test.ts` (ninguna de las dos menciona `orden`) |
| R11 | `tests/integration/db/slt46-equivalencia-geografia.test.ts` (secuencia por el service sobre CR de prueba y sobre el país de 4 niveles → comparación fila a fila = 0 diferencias) |
| R12 | `tests/unit/services/geografia-service.test.ts` y `carga-division-service.test.ts` (los casos de SL-20 con nivel CR, mismos desenlaces y mensajes) + `slt46-equivalencia-geografia.test.ts` (filas viejas tras cada operación) + suites existentes `geografia-*.test.ts` sin cambiar aserciones salvo la forma de la entrada (`{id}` en vez de `{nivel,id}`) |
| R13 | `tests/integration/db/geo-equivalencia-geografia.test.ts` (iguales → 0; una fila vieja con otro nombre o sin nodo → ≠ 0) |
| R14, R15 | `geografia-service.test.ts` (tipo de la profundidad; sin tipo → `validation_error`, repo `crear` no llamado) y `tests/integration/db/geografia-admin-n-niveles.test.ts` (nodo 4 en el país de 4 niveles con `tipo = nivel_4`) |
| R16 | `geografia-service.test.ts` (raíz, hijo, padre retirado, `conflict` por nombre normalizado, `not_found`) y `geografia-admin-n-niveles.test.ts` (`conflict` por código en el mismo tipo) |
| R17 | `tests/unit/utils/codigo-geografico.test.ts` (tabla de CR contra `validarCodigoDeTipo` = resultado de SL-20; tipo sin dígitos 1–20) |
| R18, R19 | `geografia-service.test.ts` + `geografia-admin-n-niveles.test.ts` (profundidad 4; sin cambio no escribe ni historial; descendientes intactos) |
| R20 | `geografia-service.test.ts` (1/2/3 → nivel correcto al repo de órdenes; 4 → 0 sin llamarlo) |
| R21 | `tests/components/geografia-arbol-n-niveles.test.tsx` (árbol de 4 niveles; «Agregar» ausente en la profundidad máxima; tipo visible) |
| R22 | `tests/unit/types/geografia-nodo.test.ts` (`padreId` en renombre/estado → error) y `geografia-plataforma-action.test.ts` (no hay action de mover: lista de exports) |
| R23, R24 | `tests/unit/services/pais-service.test.ts` y `tests/integration/db/pais-alta-tipos.test.ts` (3 y 4 tipos; 2 y 11 → `validation_error`; `pais.nivel_N_*` = tipos 1–3) |
| R25, R26 | `tests/integration/db/pais-tipos-edicion.test.ts` (tipo 2 → tipo + `pais.nivel_2_*`; tipo 4 → solo tipo; igual → sin escribir; inexistente → `not_found`) y `pais-service.test.ts` |
| R27 | `tests/components/etiquetas-geograficas.test.tsx` (las etiquetas salen de `pais.nivel_N_*` editado) + `pais-tipos-edicion.test.ts` (`PaisRepository.deLaEmpresa` devuelve el nombre nuevo) |
| R28 | `tests/integration/db/pais-disponible.test.ts` (país de 4 niveles → disponible `ok`) |
| R29 | `tests/integration/api/v2-paises-de-prueba.route.test.ts` (existente de SLT-45, sin cambios) |
| R30, R32, R34 | `tests/unit/utils/division-csv.test.ts` y `carga-division-service.test.ts` (P = 4; falta `codigo_nivel_4` → rechazo; hueco → error de línea; cotas) |
| R31 | `tests/integration/db/carga-division.test.ts` (casos de SL-20 con su resultado, salvo P6) |
| R33 | `tests/integration/db/carga-division-n-niveles.test.ts` (país de 4 niveles; tipos por profundidad; completar código; todo o nada) |
| R35, R36 | `tests/integration/db/geografia-registro-accion.test.ts` (filas, entidad `nodo_geografico`, etiqueta, en la misma tx: si el historial falla no queda el nodo) |
| R37 | `pais-alta-tipos.test.ts` y `pais-tipos-edicion.test.ts` |
| R38 | `geografia-registro-accion.test.ts` (`historial_accion` sin filas nuevas) |
| R39 | `geografia-service.test.ts`, `carga-division-service.test.ts`, `pais-service.test.ts` (rol `maestro` → `forbidden`, doble de repo que falla si se le llama) y `geografia-plataforma-action.test.ts` |
| R40 | `tests/integration/db/geografia-superadmin-sin-empresa.test.ts` (ampliado a tipos y profundidad 4) |
| R41 | `tests/integration/db/geo-nodo-rls.test.ts` (existente de SLT-43, sin cambios) |
| R42 | `tests/unit/guards/geografia-sin-borrado-fisico.guardia.test.ts` |
| R43 | `tests/unit/guards/nodo-geografico-escritor-unico.guardia.test.ts` y `geografia-renombrado-punto-unico.guardia.test.ts` |
| R44 | `slt46-nodo-copia-vieja.test.ts` (`pg_get_functiondef('orden_nodo_geografico')` igual al de SLT-43; `zona_distrito` sin cambios de esquema) + `tests/integration/db/orden-nodo-escritura.test.ts` (existente) |
| R45 | Gate completo de CI: sin archivos nuevos en `e2e/`; E2E existentes en verde |

## 12. Alternativas descartadas

1. **Dejar elegir el tipo de cada nodo** (decisión 2 de la épica al pie de la letra). Un nodo de
   profundidad ≤ 3 con un tipo distinto de `nivel_<k>` hace que la sincronía vieja → nodo, al recibir el
   eco, le pise el tipo. Evitarlo exige cambiar las tres funciones de SLT-43 (`CREATE OR REPLACE` con un
   `IF pg_trigger_depth() > 1 THEN RETURN NULL`) o desactivar sus triggers, y la épica solo admite
   `CREATE`/`ADD COLUMN`. Con P1 no se toca nada de SLT-43. Si el humano prefiere elegir el tipo,
   esta es la vía y la migración deja de ser solo de `CREATE`.
2. **Quitar la sincronía vieja → nodo.** Es un `DROP TRIGGER` (prohibido hasta SLT-48) y dejaría sin
   nodo a quien escriba la vieja por SQL (tests de SLT-43, scripts).
3. **Que la app escriba los dos modelos** (nodo y tabla vieja) en vez de un trigger. Duplica cada
   escritura en el código, y una vía que olvide la vieja (o el SQL a mano) las separa sin que nada lo
   frene. El trigger está en la misma sentencia y no se puede saltar.
4. **Trigger en `tipo_nivel_geografico` que copie a `pais`.** Con `pais_tipos_de_nivel` (pais → tipo)
   haría un bucle: `UPDATE OF` dispara aunque el valor no cambie. La copia del tipo a `pais` va en el
   repositorio, en la misma transacción (§2.4).
5. **Cabeceras del CSV con el nombre del tipo** (`departamento`, `codigo_departamento`), como la
   plantilla de órdenes de SLT-45. Para CR cambiaría el CSV de SL-20 (o exigiría aceptar las dos), y un
   renombre de tipo invalidaría los archivos preparados. Se proponen las neutras (P4).
6. **Leer los descendientes y la cadena de nombres con `WITH RECURSIVE`.** La guardia
   `geografia-sin-cte-recursiva` lo prohíbe en `lib/`; el catálogo en memoria (SLT-44) o subir por
   `padre_id` (≤ P lecturas) bastan.

## 13. Riesgos

- **La copia es el punto que puede tumbar la geografía** (regla 6 de la épica). Mitigación: tests de
  integración de cada evento y del eco (R2–R7), ensayo sobre la copia, `down.sql` que la quita.
- **Rendimiento de la carga CSV**: cada nodo nuevo de profundidad ≤ 3 son tres escrituras (nodo, vieja,
  eco que no actualiza). Se mide en el ensayo con 10 000 filas; si no cabe en 120 s, se decide con el
  humano (subir el timeout o partir la carga) antes de la release.
- **Ventana del deploy** (§10.2): el código nuevo servido sin la migración `…120100` escribiría nodos
  sin copia vieja; se verifica en el ensayo que el build lo impide.
- **Tests existentes que cambian de forma de entrada** (`{nivel, id}` → `{id}`; seis nombres → lista de
  tipos): las aserciones de resultado se conservan; el reviewer lo comprueba (R12).

## 14. Dependencias de terceros

Ninguna nueva.
