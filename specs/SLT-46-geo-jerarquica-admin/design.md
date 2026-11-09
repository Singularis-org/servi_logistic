# SLT-46 — geo-jerarquica-admin · design.md

> Escrito por `spec_author` el 2026-11-06 sobre la rama apilada en SLT-45 (contiene SLT-43, SLT-44,
> SLT-65 y SLT-71). Requisitos en `requirements.md` (R1–R63). El alcance y la tabla «Decisiones
> cerradas» no se reabren aquí. Revisado el mismo día con las respuestas del humano a P1–P9 (filas
> «P<n>» de `## Decisiones cerradas`) y a P10 (etiqueta de nivel 3 de un país de 2 niveles, §2.4).
>
> Revisión del 2026-11-09: maqueta T0.2 aprobada (lienzo
> https://claude.ai/artifact/QFq31uvvXmLXF4AGt9PFfH, versión 7) y dos decisiones nuevas del humano:
> reordenar niveles arrastrando (§2.4 «Reordenar niveles», R53–R57) y confirmar antes de escribir con
> control de cambio concurrente (§4.7, §6, R58–R61); título del alta (R62). Sin migraciones nuevas.
> Abiertas P11–P13 (`requirements.md`): P12 y P13 siguen lo que ya hay (R19; arrastre nativo, sin
> táctil); P11 (confirmar «Disponible» y la carga CSV) queda fuera de R58 hasta que el humano responda.
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
| Trigger `pais_tipos_de_nivel` (pais → tipos 1–3) | `db/migrations/20261104120100` | Se **reemplaza su función** con `CREATE OR REPLACE` (P2): mismo comportamiento salvo que no crea `nivel_3` si el país no lo tiene (§2.4). El trigger no se toca |
| Valores `nodo_geografico_{creado,renombrado,desactivado,activado}` y entidad `nodo_geografico` en los enums de `historial_plataforma` | `db/schema.prisma`, `20261104120000` | Se usan por primera vez (P5) |
| `etiquetasDePais` | `lib/types/pais.ts` | `etiquetasDePais` gana un respaldo para el nivel 3 vacío: la etiqueta del nivel 2 (P10, R51) |
| `appendAccionPlataforma`, `resolverActorCongelado` | `lib/repositories/registrar-accion-plataforma.ts`, `registrar-accion.ts` | Único escritor del historial; sin cambios |
| `CatalogoGeograficoRepository.dePais`, `geografia-dominio` (`ancestros`, `nodosBajo`, `tiposDelPais`) | SLT-44 | Lectura del árbol de N niveles (§4.3) |
| `etiquetaDeEntidad("nodo_geografico", { nombres })` | `lib/types/historial-accion-etiquetas.ts` (SLT-43) | Etiqueta congelada de los nodos (R35) |
| `planificarDivision`, `CargaDivisionService`, cotas del CSV | `lib/utils/division-csv.ts`, `lib/types/division-csv.ts` | Se generalizan de 3 niveles a P (§5) |
| `validarCodigo` (regla por país, 3 niveles) y `tipo.digitos_codigo` + `codigo_hereda_prefijo` | `lib/utils/codigo-geografico.ts`, SLT-43 §2.1 | La regla pasa a leerse del tipo (§4.5) |
| Regla «país aún no habilitado» de SLT-45 | `lib/services/geo-ubicacion.ts` (`esPaisDeTresNiveles`, `MSG_PAIS_NO_HABILITADO`) | No se toca; R29 lo prueba |
| `equivalencia` del script de SLT-43 (conteos por profundidad) | `scripts/geo-backfill-nodo.ts` | Se añade un modo fila a fila, `--equivalencia-geografia` (P8) |
| Guardias `nodo-geografico-sin-escritor`, `geografia-renombrado-punto-unico`, `geografia-sin-borrado-fisico`, `slt43-migraciones-aditivas` | `tests/unit/guards/`, `tests/unit/db/` | La primera se retira (lo anunciaba); las otras se ajustan (§9) |
| Fixture de países de 2 y 4 niveles | `tests/fixtures/paises-de-prueba-geo.ts` (SLT-45) | Se reutiliza para los tests de N niveles |
| Base propia para bajar migraciones | `tests/integration/db/_fixtures/base-propia-43.ts` | Molde de la ida y vuelta de SLT-46 |
| *(2026-11-09)* `PaisRepository.renombrarTipo` / `agregarNivel`, `PaisService.renombrarTipo` / `agregarNivel` y sus actions | T3.2, T4.3, T4.4 (hechas) | Se **extienden**: la entrada gana el «antes» del modal y el resultado, `conflict` por cambio concurrente (§4.7). `reordenarTipos` es nuevo y reutiliza sus piezas (`nombresDeNivelEnPais`, `appendAccionPlataforma`) |
| *(2026-11-09)* `Modal` (`@base-ui/react/dialog`, `confirmLabel`, `closeOnConfirm`, `confirmDisabled`) | `components/shared/Modal.tsx`; ya lo usan el retiro de nodo y el alta de país | Base del modal de confirmación (§6). Nada nuevo de shadcn |
| *(2026-11-09)* Librería de arrastrar y soltar | Ninguna en `package.json` (Grep `dnd\|sortable\|drag`) | No se añade: arrastre nativo del navegador + teclado (§6; alternativa en §12) |
| *(2026-11-09)* Candado de fila con `tx.$queryRaw\`… FOR UPDATE\`` | `CierreDiaRepository`, `CorreccionFechaReprogramacionRepository` | Mismo patrón para serializar las escrituras de tipos de un país (§2.4) |

Nada de lo encontrado escribe el nodo desde la app ni edita tipos, ni reordena niveles o confirma
con antes → después: se sigue.

## 1. Resumen

La app pasa a escribir la geografía en `nodo_geografico` (y los tipos en `tipo_nivel_geografico`). Un
trigger nuevo `AFTER` en `nodo_geografico` copia cada nodo de profundidad 1–3 a su fila de
`provincia`/`canton`/`distrito` con el mismo id. La sincronía vieja → nodo de SLT-43 se queda: cuando
recibe el eco de la copia nueva, encuentra el nodo idéntico y no escribe nada (su `WHERE … IS DISTINCT
FROM`). Para que el eco sea siempre idéntico, el tipo de un nodo es el de su profundidad (P1). La
pantalla del superadmin pasa a un árbol de N niveles; el alta de país recibe la lista de 2 a 10 tipos
(P2); a un país ya creado se le agrega un nivel al final (P3); los nombres de un tipo se editan y, en
los niveles 1–3, se copian a `pais.nivel_N_*`. El CSV de división admite P niveles y se cruza con los
nodos. Tres migraciones, todas aditivas; ninguna toca `orden`.

Desde el 2026-11-09, además: los niveles se reordenan arrastrando (en un país ya creado eso solo
reasigna los nombres de cada profundidad) y toda escritura de la pantalla pasa por un modal de
confirmación antes → después; el servidor rechaza con `conflict` lo que cambió mientras tanto. Sin
migraciones nuevas.

## 2. Modelo de datos

Sin tablas ni columnas nuevas. `nodo_geografico` y `tipo_nivel_geografico` son de **plataforma**
(sin `organizacion_id`, RLS de lectura por país, `REVOKE` de escritura a `servi_app`, SLT-43 R12):
no cambia nada de eso. La app las escribe como dueño, dentro de `comoPlataforma` (§8).

### 2.1 El tipo de un nodo (R14, R15) — decisión P1

- El tipo de un nodo de profundidad k es el tipo de clave `nivel_<k>` de su país. El service lo busca
  al dar de alta; si no existe, `validation_error` en `padreId` («Este país no tiene un nivel por debajo
  de <tipo del padre>») y no se escribe (R15).
- Las claves `nivel_1..nivel_P` ya son la convención de SLT-43 (migración, sincronía y el fixture de 4
  niveles de SLT-45). La profundidad máxima de un país es P.
- Por qué la regla (y no elegir el tipo): §2.2, «Convivencia». Alternativa en §12. La pantalla no
  ofrece elegir tipo.

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

Agregar un nivel (P3) **no necesita valor nuevo**: es la creación de un tipo y usa
`tipo_nivel_geografico_creado`, con `detalle = {"origen": "nivel_agregado", "profundidad": k}` para
distinguirla del alta de país (que va junto a `pais_creado` y lleva `"origen": "alta_de_pais"`).

Reordenar niveles (2026-11-09) **tampoco**: es una reasignación de nombres y usa
`tipo_nivel_geografico_renombrado`, con `detalle = {"campo": "singular" | "plural", "origen":
"reordenado"}` (R56). La edición de un tipo sigue como está (sin `origen`, T3.2 hecha). Ninguna
migración ni valor de enum nuevo.

### 2.4 Tipos y `pais.nivel_N_*` (R23, R25, R27, R46–R51) — decisiones P2 y P3

**El problema (P2).** `pais.nivel_{1,2,3}_{singular,plural}` son `NOT NULL` (SL-20) y la función
`pais_tipos_de_nivel` (SLT-43, `20261104120100`) hace en cada `INSERT` y en cada `UPDATE OF` esas
columnas un upsert de los tres tipos `nivel_1..3`. Un país de 2 niveles terminaría con un tipo
`nivel_3`. No se puede quitar el `NOT NULL` (sería `ALTER COLUMN`) ni cambiar el trigger (sería
`DROP`/`CREATE TRIGGER`).

**La solución, aditiva.** Dos piezas:

1. *Convención de dato*: un país sin nivel 3 guarda **texto vacío** (`''`) en `nivel_3_singular` y
   `nivel_3_plural`. Cumple el `NOT NULL`; `pais` no tiene `CHECK` sobre esas columnas (Grep de
   `db/migrations` el 2026-11-06: solo `pais_id_check` y `pais_digitos_codigo_check`, y un país nuevo no
   lleva dígitos, así que `digitos_codigo_nivel_3` sigue `NULL` como los otros dos). Ningún país
   existente tiene `''`: todos nacieron con los seis nombres (zod de SL-20, 2–40) o por la migración de
   CR.
2. *Función nueva*: migración `20261106120200_slt46_pais_tipos_de_nivel_opcional` con
   `CREATE OR REPLACE FUNCTION pais_tipos_de_nivel()` (mismo nombre, `SECURITY DEFINER SET search_path
   = public`, mismo `RETURNS trigger`). El cuerpo es el de SLT-43 con una sola diferencia: la fila de
   `nivel_3` del `VALUES` solo entra si `NEW.nivel_3_singular <> ''`. Se escribe como
   `INSERT … SELECT … FROM (VALUES …) v WHERE v.clave <> 'nivel_3' OR NEW.nivel_3_singular <> ''` con
   el mismo `ON CONFLICT (pais_id, clave) DO UPDATE`. El trigger `pais_tipos_de_nivel` y sus columnas no
   se tocan. La función no borra nunca un tipo (R50).

Qué deja:

| País | Efecto |
|---|---|
| CR y todo país anterior a SLT-46 (`nivel_3_singular` lleno) | Idéntico a SLT-43: el `WHERE` deja pasar las tres filas (R47). Se prueba comparando los tipos tras la misma escritura con la función vieja y la nueva |
| País nuevo de 2 tipos (`''`) | `INSERT`: solo `nivel_1` y `nivel_2`. Un `UPDATE` posterior (editar el tipo 1 o 2): upsert de esos dos; ningún `nivel_3` (R46) |
| País nuevo de 3–10 tipos | Como hoy: `nivel_1..3` por el trigger y `nivel_4..P` por el repositorio |
| Fixture de SLT-45 «2 niveles» (`Aldea` en `nivel_3`) | Sigue con 3 tipos y sin nodos de profundidad 3: es un país de P = 3 que aún no se cargó hasta abajo. No se cambia |

**Alta de país (R23, R24).** `PaisRepository.crear` en una transacción: `pais.create` con los tipos
1–3 en `nivel_{1,2,3}_*` y, si P = 2, `''` en los de nivel 3 → la función crea `nivel_1..min(P,3)`
(con la regla de código de `pais`, que en un país nuevo es «sin dígitos») →
`tipoNivelGeografico.createMany` de `nivel_4..nivel_P` (`digitos_codigo` NULL, `codigo_hereda_prefijo`
false) → historial (R37). El `''` lo pone solo el repositorio; zod nunca lo acepta como nombre (2–40).

**Agregar un nivel (R48–R50).** `PaisRepository.agregarNivel(paisId, singular, plural, actor) →
"no_existe" | "tope" | TipoNivelDTO`, en una transacción:

1. Lee el país y cuenta sus tipos (P). Sin país → `no_existe`; P = 10 → `tope`.
2. `tipoNivelGeografico.create` de `nivel_<P+1>` con los nombres (`digitos_codigo` NULL,
   `codigo_hereda_prefijo` false). Si otra alta en paralelo ya lo creó, salta el único
   `(pais_id, clave)` → `P2002` → `conflict` (R49). Se crea **siempre** explícitamente, también cuando
   P+1 = 3, para que la carrera dé un único y no un upsert silencioso.
3. Si P+1 = 3: `pais.update` de `nivel_3_singular`/`_plural` con los mismos nombres (decisión «se copia
   a `pais.nivel_N_*`») → la función hace su upsert de `nivel_1..3`, que encuentra los tres con los
   mismos valores.
4. Historial `tipo_nivel_geografico_creado` (`origen: "nivel_agregado"`).

No toca nodos ni otros tipos. Desde ese momento P crece en uno: «agregar hijo» aparece en los nodos de
la profundidad P anterior (R21) y el CSV exige las dos columnas nuevas (R30). Un país de 2 niveles
que pasa a 3 no se habilita solo para órdenes: la regla de SLT-45 mira la profundidad de sus nodos
(`esPaisDeTresNiveles`), no sus tipos (R29).

**Edición de un tipo (R25, R26).** `PaisRepository.renombrarTipo` en una transacción: lee el tipo con
su país; si los dos nombres son iguales → `sin_cambio`; `tipoNivelGeografico.update`; si la clave es
`nivel_1..3`, `pais.update` de las dos columnas de ese nivel → la función vuelve a hacer el upsert de
los tipos 1–3 que el país tenga, con los mismos valores (no hay trigger en `tipo_nivel_geografico`,
así que no hay bucle) → historial.

**Reordenar niveles (R54–R57) — decisión del 2026-11-09.** En el alta de país el orden es solo el de
la lista que llega a `crearPaisSchema` (R54): no hay contrato nuevo. En un país ya creado,
`PaisRepository.reordenarTipos(paisId, niveles, actor) → "no_existe" | "cambio_concurrente" |
"sin_cambio" | "reordenado"`, donde `niveles` es la lista en el orden nuevo, cada elemento
`{ tipoId, nombreSingular, nombrePlural }` con los nombres **que el modal mostró como «antes»** de ese
tipo. En una transacción:

1. Candado del país: `tx.$queryRaw\`SELECT "id" FROM "pais" WHERE "id" = ${paisId} FOR UPDATE\``.
   Sin fila → `no_existe`.
2. Lee los tipos del país (`id`, `clave`, nombres). Si el conjunto de ids no es exactamente el de
   `niveles` (otra persona agregó un nivel, o un id es de otro país) o algún nombre de `niveles` no es
   el actual de su tipo → `cambio_concurrente` (R57). Los repetidos y el tamaño 2–10 ya los rechazó
   zod.
3. Para cada profundidad k, nombres nuevos = los de `niveles[k-1]`; nombres actuales = los del tipo de
   clave `nivel_<k>`. Si ninguno cambia → `sin_cambio` (R56).
4. `tipoNivelGeografico.update` solo de los tipos cuyos nombres cambian (`where: { id }`; sin
   `clave`, `digitosCodigo` ni `codigoHeredaPrefijo` en `data`). Los nombres de tipo no son únicos,
   así que el intercambio no choca a mitad de camino.
5. Si cambia algún tipo de profundidad 1–3: **un solo** `pais.update` con las columnas
   `nivel_k_*` de los que cambian → la función `pais_tipos_de_nivel` hace su upsert de los tipos 1–3
   y los encuentra con esos mismos valores; la regla de código que copia sale de
   `pais.digitos_codigo_nivel_k`, que no cambia (R55). En un país de 2 tipos, `nivel_3_*` sigue `''`
   y no nace `nivel_3` (R46).
6. Historial: una fila `tipo_nivel_geografico_renombrado` por nombre cambiado, `entidadId` el tipo de
   esa profundidad, `entidadEtiqueta` su singular nuevo, `detalle = {campo, origen: "reordenado"}`.

Ningún nodo se lee ni se escribe: el tipo de un nodo sale de su profundidad (P1) y su `tipo_id` sigue
apuntando al mismo tipo, que ahora se llama distinto. Para Costa Rica, reordenar cambia las etiquetas
de las empresas en su siguiente carga (R27), como una edición de nombres.

**Candado del país en toda escritura de tipos (2026-11-09).** `renombrarTipo` (tras leer el `paisId`
del tipo) y `agregarNivel` toman el mismo `FOR UPDATE` sobre la fila `pais` antes de leer los tipos.
Así las tres escrituras de tipos de un país quedan en fila y la comparación con el «antes» (§4.7) es
exacta; sin el candado, un agregar nivel en paralelo no tocaría `pais` (P+1 > 3) y el reordenamiento no
lo vería. El único `(pais_id, clave)` se queda como respaldo de R49 y su test de carrera no cambia de
desenlace (una de las dos altas responde `conflict`; con el candado, por cambio concurrente en vez de
por el único: la action responde `conflict` en ambos casos).

**Etiquetas de las empresas (R27, R51).** Salen de `pais.nivel_N_*` (`etiquetasDePais` →
`EtiquetasGeograficasProvider` en `app/(app)/layout.tsx`): con la copia, R27 sale sin tocarlas. Para
un país de 2 niveles `nivel3Singular` es `''`: `etiquetasDePais` devuelve para `distrito` la etiqueta
del nivel 2 (singular y plural) cuando el nombre del nivel 3 está vacío (**P10**, decisión del humano:
repetir la del nivel 2). Esas empresas no crean órdenes («país aún no habilitado»), así que la etiqueta
solo titula columnas y filtros vacíos; ocultarlos es de SLT-47.

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
| `20261106120200_slt46_pais_tipos_de_nivel_opcional` | `CREATE OR REPLACE FUNCTION pais_tipos_de_nivel()` de §2.4 (P2), con el comentario de la convención `''`. | `CREATE OR REPLACE FUNCTION pais_tipos_de_nivel()` con el cuerpo de SLT-43 copiado literal de `20261104120100`. Comentario: un país de 2 niveles creado con SLT-46 puesta conserva sus dos tipos tras la vuelta, pero un `UPDATE` de su fila `pais` con la función vieja le crearía un `nivel_3` de nombre vacío; el ensayo (§10) lo anota y no se crean países de 2 niveles hasta confirmar que no hay vuelta. |

- Ninguna toca `orden` (R10), ni crea índices, ni escribe datos: no hay bloqueo largo que medir sobre
  `orden`. El `CREATE TRIGGER` toma `SHARE ROW EXCLUSIVE` sobre `nodo_geografico` (unos 600 nodos por
  país, solo la escribe el superadmin): se anota en el ensayo. El `CREATE OR REPLACE FUNCTION` no
  bloquea `pais` más allá del catálogo.
- Fechas: `20261106…`, después de la última del worktree (`20261104150200`). Si `dev` trae otra
  posterior antes del merge, se renombra la carpeta antes de mergear (no está aplicada en ningún sitio).
- Se escriben a mano (`db:migrate:create` falla con P3006 en este repo, ver `20261022130000`).
  `prisma migrate diff` debe salir vacío salvo los valores de enum; el trigger no lo ve el diff.
- **Aditivas (R8).** `tests/unit/db/slt46-migraciones-aditivas.test.ts`. Las reglas de SLT-43
  (`faltasR19`) se extraen a `tests/unit/db/_migraciones-aditivas.ts` (sin cambiar las aserciones de
  `slt43-migraciones-aditivas.test.ts`) y ganan una opción: el `INSERT`/`UPDATE`/`DELETE` **dentro del
  cuerpo `$$ … $$` de un `CREATE FUNCTION`** es la escritura del trigger en tiempo de ejecución y no
  cuenta; `DROP`, `TRUNCATE`, `RENAME`, `ALTER COLUMN` y `EXECUTE` siguen contando también ahí.
  Segunda opción: `CREATE OR REPLACE FUNCTION` se admite solo con el nombre `pais_tipos_de_nivel`
  (P2); con cualquier otro nombre (p. ej. `geo_sincronizar_canton`) es falta.
  Contraprueba con texto inventado (un `UPDATE provincia` suelto en la migración sale rojo; un
  `CREATE OR REPLACE FUNCTION geo_sincronizar_canton()` sale rojo).

## 4. Capas y contratos

Borde → service → repositorio, como SL-20. Todas las actions en `lib/actions/geografia-plataforma.ts`
(ya en `EXCEPCIONES_DE_PLATAFORMA`): `puerta` → zod → service dentro de `comoPlataforma`.

### 4.1 Esquemas zod (`lib/types/geografia-nodo.ts`, `lib/types/pais.ts`)

| Esquema | Forma (`.strict()`) | Cambia |
|---|---|---|
| `crearNodoGeograficoSchema` | `{ paisId, nombre, codigo? }` (raíz) \| `{ padreId, nombre, codigo? }` (hijo) | Antes, discriminada por `nivel` |
| `renombrarNodoGeograficoSchema` | `{ id, nombre, nombreAnterior }` | Sin `nivel`; **2026-11-09:** gana `nombreAnterior` (el «antes» del modal, obligatorio, R61) |
| `cambiarActivacionGeograficaSchema` | `{ id, activo }` | Sin `nivel` |
| `nodoGeograficoSchema` (conteo) | `{ id }` | Sin `nivel` |
| `crearPaisSchema` | `{ id, tipos: { singular, plural }[], disponible? }` con 2–10 tipos (P2) y `nombrePaisSchema` (2–40); `disponible` booleano opcional | Antes, seis campos `nivelNSingular/Plural`. **2026-11-09 (R63):** gana `disponible?`; sin él, la columna toma su `DEFAULT true` |
| `renombrarTipoNivelSchema` (nuevo) | `{ tipoId, nombreSingular, nombrePlural, anterior: { nombreSingular, nombrePlural } }` | **2026-11-09:** gana `anterior` (obligatorio, R61) |
| `agregarNivelPaisSchema` (nuevo, P3) | `{ paisId, nombreSingular, nombrePlural, profundidad }` (nombres 2–40; `profundidad` entero 3–10). Sin campo de posición: siempre al final | **2026-11-09:** gana `profundidad`, la que el modal mostró para el nivel nuevo (P+1). No elige sitio: si al guardar no es P+1 → cambio concurrente (R61) |
| `reordenarTiposSchema` (nuevo, 2026-11-09) | `{ paisId, niveles: { tipoId, nombreSingular, nombrePlural }[] }`, 2–10 elementos, `tipoId` distintos (`superRefine`), nombres 2–40 (los del «antes») | — (R57) |

No hay esquema ni action para quitar un tipo o un nivel (R50). `crearNodoGeograficoSchema`,
`cambiarActivacionGeograficaSchema` y `crearPaisSchema` no ganan «antes»: un alta no tiene estado
previo que comparar (sus choques ya son `conflict`, R16, R24) y pedir el estado `activo` que ya tiene es
éxito (R19; ver P12).

Los esquemas viven en `lib/types/`, que ya viaja al navegador: la pantalla los usa para validar antes
de abrir el modal (R58, R59) y el service los vuelve a correr (R60). Lo que solo sabe el servidor
(nombre imprimible de la ficha 392, choque normalizado con hermanos, regla de código del tipo) se queda
en el servidor y llega como `validation_error`/`conflict` tras confirmar.

Ninguno acepta `padreId` en el renombre ni en el cambio de estado (R22): `.strict()` lo rechaza.

### 4.2 Actions (`lib/actions/geografia-plataforma.ts`)

Se quedan `listarPaisesAction`, `crearPaisAction`, `cambiarDisponibilidadPaisAction`,
`arbolDePaisAction`, `crearNodoAction`, `renombrarNodoAction`, `cambiarActivacionNodoAction`,
`contarOrdenesSinEntregarAction` y `cargarDivisionAction`, con los esquemas nuevos y los mismos
desenlaces (`unauthenticated`, `forbidden`, `validation_error`, `not_found`, `conflict`, `error` con
log sin datos). Nuevas: `renombrarTipoNivelAction(input)` → `PaisService.renombrarTipo` y
`agregarNivelPaisAction(input)` → `PaisService.agregarNivel`. El `catch` de `esViolacionDeUnico` →
`conflict` sigue en altas y renombres (R5) y cubre la carrera de agregar nivel (R49).
Nueva el 2026-11-09: `reordenarTiposAction(input)` → `PaisService.reordenarTipos`, mismo borde
(`puerta` → service en `comoPlataforma`), desenlaces `ok`, `validation_error`, `not_found`,
`conflict` (con `motivo: "cambio_concurrente"`), `forbidden`, `unauthenticated` y `error`. No hay
action de mover nodos ni de cambiar la clave o la profundidad de un tipo (R22, R55).

### 4.3 Services

| Service | Método | Pasos |
|---|---|---|
| `GeografiaService` | `listarArbolDePais(paisId, actor)` | rol → `repo.arbolDePais(paisId)` → `{ status: "ok", tipos, raices }` |
| | `crear(input, actor)` | rol (R39) → `rechazoDeNombreDeEtiqueta` → `repo.contextoDeAlta(destino)` (`null` → `not_found`) → tipo de la profundidad (`null` → `validation_error`, R15) → hermanos por `normalizeName` (R16) → `validarCodigoDeTipo` (R17) → `repo.crear(…)` |
| | `renombrar(input, actor)` | rol → nombre imprimible → `repo.hermanosDeNodo(id)` → choque normalizado excluyendo al propio (R18) → `repo.renombrar(id, nombre, nombreAnterior, actorId)`; `cambio_concurrente` → `{ status: "conflict", motivo: "cambio_concurrente" }` (R61) |
| | `cambiarActivacion(input, actor)` | rol → `repo.cambiarActivacion(id, activo)` (R19) |
| | `contarOrdenesSinEntregar(input, actor)` | rol → `repo.profundidadDeNodo(id)`; 1/2/3 → `ordenes.contarSinEntregarPorNodoGeografico("provincia"/"canton"/"distrito", id)` (método de SLT-65, sin cambios); > 3 o inexistente → 0 (R20) |
| | `listarArbol(actor)` (maestro, Tarifas) | Sin cambios |
| `CargaDivisionService` | `cargar(paisId, archivo, actor)` | rol → archivo (sin cambios) → `repo.leerDivisionDePais(paisId)` (`null` → `not_found`) → columnas obligatorias según P (R30) → `planificarDivision` → `repo.importarDivision` |
| `PaisService` | `crear(input, actor)` | rol → `crearPaisSchema` → nombre del catálogo → `repo.crear(datos con tipos)` |
| | `renombrarTipo(input, actor)` (nuevo) | rol → `renombrarTipoNivelSchema` → `repo.renombrarTipo(tipoId, nombres, anterior, actor)` → `no_existe` → `not_found`; `sin_cambio`/`renombrado` → `ok` (R25, R26); `cambio_concurrente` → `conflict` con motivo (R61) |
| | `agregarNivel(input, actor)` (nuevo, P3) | rol → `agregarNivelPaisSchema` → `repo.agregarNivel(paisId, nombres, profundidad, actor)` → `no_existe` → `not_found`; `tope` → `validation_error` en `paisId` («Este país ya tiene 10 niveles»); `cambio_concurrente` (P+1 ≠ `profundidad`) → `conflict` con motivo (R61); tipo → `{ status: "ok", tipo }` (R48, R49). El tope se mira antes que la profundidad |
| | `reordenarTipos(input, actor)` (nuevo, 2026-11-09) | rol (R39) → `reordenarTiposSchema` (`validation_error`, R57) → `repo.reordenarTipos` → `no_existe` → `not_found`; `cambio_concurrente` → `conflict` con motivo; `sin_cambio`/`reordenado` → `{ status: "ok" }` (R55–R57) |
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
| `renombrar(id, nombre, nombreAnterior, actorId)` | Igual que hoy (`no_existe`/`sin_cambio`/`renombrado`), sobre el nodo; solo escribe `nombre`. **2026-11-09:** si el nombre actual ya es `nombre` → `sin_cambio` (R18); si no, `updateMany({ where: { id, nombre: nombreAnterior } })` y, con 0 filas, `cambio_concurrente` (comparar y escribir en una sentencia, R61) |
| `cambiarActivacion(id, activo, actorId)` | Igual que hoy, sobre el nodo; solo escribe `activo` |
| `profundidadDeNodo(id)` | `number \| null` |
| `leerDivisionDePais(paisId)` | `{ tipos: TipoNivelDTO[]; nodos: NodoExistente[] } \| null` (con `profundidad`), de `nodo_geografico` ordenado por `id` (orden estable de SL-20) |
| `importarDivision(paisId, plan, actorId)` | Transacción (timeout 120 s como hoy): un `createMany` de nodos por profundidad, de arriba abajo, con ids generados y el tipo de cada profundidad; `codigosACompletar` con `updateMany({ where: { id, codigoOficial: null } })`; `division_cargada` si escribió algo, con `creados` por profundidad |

`GeoPrismaClient` pierde `provincia`, `canton` y `distrito` del `Pick` en las escrituras (R1).

`PaisRepository` (escritor único de `tipo_nivel_geografico`, R43): `crear(datos con tipos y
`disponible?`, actor)` (R63: `disponible` va en el mismo `pais.create` que abre la transacción, sin
segundo paso; `undefined` no se manda y rige el `DEFAULT true`; el historial sigue siendo el de R37),
`renombrarTipo(tipoId, nombres, anterior, actor) → "no_existe" | "sin_cambio" | "cambio_concurrente" |
"renombrado"`, `agregarNivel(paisId, nombres, profundidad, actor) → "no_existe" | "tope" |
"cambio_concurrente" | TipoNivelDTO` y, nuevo el 2026-11-09, `reordenarTipos(paisId, niveles, actor) →
"no_existe" | "cambio_concurrente" | "sin_cambio" | "reordenado"` (§2.4). Los tres toman el candado del
país (§2.4). En `renombrarTipo`, `sin_cambio` (los nombres pedidos ya son los actuales) se mira antes
que el «antes». Ninguno borra tipos (R50). `PaisPrismaClient` gana `tipoNivelGeografico`, `historialPlataforma` y `usuario`.
Donde la pantalla del superadmin pintaba los nombres de nivel de `pais`, pasa a pintar los tipos del
país (`TipoNivelDTO[]`), así el `''` de un país de 2 niveles no se pinta nunca.

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

### 4.7 Cambio concurrente (R61, R57) — decisión del 2026-11-09

Sin columna de versión ni migración: el cliente manda el «antes» que el modal mostró y el
repositorio lo compara con la base dentro de la transacción, **después** de mirar si lo pedido ya está
(eso es éxito, R18/R26/R56).

| Escritura | «Antes» que viaja | Comparación |
|---|---|---|
| Renombre de nodo | `nombreAnterior` | `updateMany` con `nombre = nombreAnterior` en el `where` (una sentencia) |
| Edición de nombres de tipo | `anterior.{nombreSingular,nombrePlural}` | Bajo el candado del país, los dos nombres actuales del tipo |
| Agregar nivel | `profundidad` (= P+1 que se mostró) | Bajo el candado, número de tipos + 1 |
| Reordenar | `niveles[].{tipoId, nombres}` | Bajo el candado, conjunto de ids y nombres actuales (§2.4) |
| Alta de país, alta de nodo, retiro/reactivación | — | Ya cubiertos: `conflict` por nombre/código (R16, R24); estado pedido = actual es éxito (R19, P12) |

Resultado común en services y actions: `{ status: "conflict"; motivo: "cambio_concurrente" }`, una
variante **nueva** de la unión; los `conflict` que ya existían (nombre de hermano, país repetido, la
carrera del único) no cambian de forma (R12). La pantalla, ante ese motivo, avisa «Este dato cambió
mientras tanto; revisa el valor actual» (texto final en la maqueta), cierra el modal y hace
`router.refresh()` para mostrar lo que hay en la base. Nada se escribe (R61).

## 5. CSV de división (R30–R34) — decisiones P4 y P6

- **Cabecera.** Obligatorias `nivel_<k>` y `codigo_nivel_<k>` para k = 1..P (para CR, P = 3: las seis
  de SL-20; el CSV de CR no cambia). Las demás columnas se ignoran con aviso (también `nivel_4` en CR).
  Para un país de 2 niveles, P = 2: cuatro columnas. Tras agregar un nivel, P crece y el CSV exige
  las dos columnas nuevas.
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
- **SL-20 R49** (homónimos normalizados en la base) deja de poder darse con la lectura del nodo: el
  caso «decision 4: dos homónimos normalizados» se retira de `tests/integration/db/carga-division.test.ts`
  y SL-20 R49 queda **superado por SLT-46** (decisión P6). El implementer deja en el test, donde
  estaba el caso, un comentario con el motivo y la referencia a P6; el reviewer no lo cuenta como
  aserción cambiada.
- Cotas sin cambios (R34).

## 6. Pantalla (`app/(app)/plataforma/geografia/**`) — decisión P9

**Maqueta aprobada (R52).** La forma visual de la pantalla es la maqueta T0.2, **aprobada por el
humano el 2026-11-09**: lienzo https://claude.ai/artifact/QFq31uvvXmLXF4AGt9PFfH, versión 7. Lo que
sigue es el contrato funcional (qué datos y qué acciones hay); disposición, textos y estilos salen de
la maqueta. Si algo de la maqueta choca con este contrato, T6 para y pregunta.

- `page.tsx`: igual (404 a quien no es de plataforma antes de leer; `?pais=`), pasa `tipos` y `raices`.
- `GeografiaAdminModule.tsx`: árbol recursivo de `NodoArbolPlataformaDTO`, con el singular del tipo de
  cada nodo; acciones por fila: renombrar, retirar/reactivar (con el conteo de R20), «Agregar
  <singular del tipo siguiente>» solo si existe tipo para profundidad + 1 (R21). Sin mover (R22).
- `GeografiaPlataformaModule.tsx`: el alta de país pide una lista ordenada de tipos, titulada
  «Niveles N (máximo 10)»; agregar fila oculto con 10, quitar fila no disponible con 2 (R62); las
  filas se reordenan con `ListaReordenable` (R53, R54). **2026-11-09 (R63):** casilla «Disponible
  para crear empresas», desmarcada por defecto, que viaja siempre en `crearPaisAction`; con una lista
  que no tiene 3 niveles, aviso junto a la casilla de que sus empresas verán «país aún no habilitado»
  hasta SLT-48 (R29). La carga CSV muestra la equivalencia
  `nivel_k = <tipo>` para k = 1..P.
- Nuevo `_components/TiposDeNivelPais.tsx`: lista de tipos del país con editar singular/plural,
  reordenar con `ListaReordenable` (el nuevo orden se ve en pantalla sin guardarse hasta confirmar,
  R55) y «Agregar nivel» al final (oculto con 10 tipos); sin quitar (R50).
- Nuevo `_components/ListaReordenable.tsx` (R53): cada fila con una manija ⠿ que es un `button`
  (`aria-label` «Mover <nombre>, posición k de N»). Arrastre con los eventos nativos del navegador
  (`draggable`, `dragstart`/`dragover`/`drop`) solo desde la manija; con la manija enfocada,
  `ArrowUp`/`ArrowDown` mueven la fila una posición, el foco sigue en la manija y una región
  `aria-live` anuncia la posición nueva. Sin flechas ni botones de subir/bajar visibles. Componente
  controlado: recibe la lista y emite el nuevo orden; no llama a actions.
- Nuevo `_components/ConfirmarCambio.tsx` (R58–R61): sobre `components/shared/Modal`
  (`closeOnConfirm={false}`, el desenlace lo cierra). Recibe filas `{ etiqueta, antes, despues }` y la
  acción a ejecutar; pinta el antes → después. Lo usan todas las escrituras de la tabla de abajo.
- Para CR el árbol tiene los mismos tres niveles, nombres, acciones y mensajes que hoy (R12), más el
  modal de confirmación de la decisión del 2026-11-09.
- Componentes de `components/ui/` y `components/shared/` existentes; nada nuevo de shadcn; ninguna
  librería nueva (arrastre nativo, §12).

**Confirmación antes de escribir (R58–R61).** Flujo común: el superadmin pide guardar → la pantalla
corre el esquema zod de §4.1 sobre lo escrito → si falla, error en el campo y no se abre el modal
(R59) → si pasa, modal con antes → después → «Cancelar» no llama a nada (R59) → «Confirmar» llama a
la action con el «antes» de §4.7 → `ok`: cierra y refresca; `validation_error`/`conflict` por nombre:
error en el campo, como hoy; `conflict` con `motivo: "cambio_concurrente"`: aviso y refresco, sin
escribir (R61). Esto reemplaza el criterio de SL-20 (comentarios de la ficha 375 en
`GeografiaAdminModule.tsx`) de que renombrar y reactivar no piden confirmación.

| Acción | Antes | Después |
|---|---|---|
| Alta de país | — | Código, nombre, los niveles en orden (`nivel_1`…`nivel_P`) y la disponibilidad (R63) |
| Alta de nodo | — (padre: su cadena de nombres) | Nombre, código y tipo del nodo nuevo |
| Renombre de nodo | Nombre actual | Nombre nuevo |
| Edición de tipo | Singular y plural actuales | Singular y plural nuevos |
| Reordenar niveles | Nombre de cada profundidad hoy | Nombre de cada profundidad tras el orden nuevo |
| Agregar nivel | Niveles actuales (1..P) | Los mismos y el nuevo como nivel P+1 |
| Retiro / reactivación | Activo / Retirado (en el retiro, con el conteo de R20) | Retirado / Activo |

P11 (abierta): el interruptor «Disponible» y la carga CSV no están en la tabla mientras el humano no
responda.

## 7. Historial de plataforma (R35–R38) — decisiones P3, P5, P7

| Acción | `accion` | `entidad_tipo` | `entidad_etiqueta` | Otros |
|---|---|---|---|---|
| Alta de nodo | `nodo_geografico_creado` | `nodo_geografico` | Cadena raíz → nodo (`etiquetaDeEntidad("nodo_geografico", …)`) | — |
| Renombre | `nodo_geografico_renombrado` | `nodo_geografico` | Cadena con el nombre nuevo | `valor_anterior`, `valor_nuevo` |
| Retiro / reactivación | `nodo_geografico_desactivado` / `_activado` | `nodo_geografico` | Cadena | — |
| Carga CSV | `division_cargada` | `pais` | Nombre del país | `detalle.creados` por profundidad |
| Alta de país | `pais_creado` + `tipo_nivel_geografico_creado` × P | `pais` / `tipo_nivel_geografico` | País / singular del tipo | `detalle = {origen: "alta_de_pais", profundidad}` en cada tipo |
| Agregar nivel | `tipo_nivel_geografico_creado` | `tipo_nivel_geografico` | Singular del tipo nuevo | `detalle = {origen: "nivel_agregado", profundidad}` |
| Edición de tipo | `tipo_nivel_geografico_renombrado` × nombres cambiados | `tipo_nivel_geografico` | Singular nuevo | `valor_anterior`, `valor_nuevo`, `detalle.campo` |
| Reordenar niveles (2026-11-09) | `tipo_nivel_geografico_renombrado` × nombres cambiados | `tipo_nivel_geografico` (el tipo de cada profundidad) | Singular nuevo | `valor_anterior`, `valor_nuevo`, `detalle = {campo, origen: "reordenado"}` |

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

1. Ensayo sobre una **copia** de producción: aplicar las tres migraciones; comprobar que los tipos de
   todos los países son los mismos que antes (R47); desde la app apuntada a la
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
| R8 | `tests/unit/db/slt46-migraciones-aditivas.test.ts` (verde sobre las tres carpetas; `down.sql` presente; contraprueba: DML suelto sobre tabla existente rojo, DML en cuerpo de función verde, `EXECUTE 'DROP …'` en cuerpo rojo, `CREATE OR REPLACE FUNCTION` de otra función rojo) |
| R9 | `tests/integration/db/migracion-slt46-ida-y-vuelta.test.ts` (base propia: ida, datos, vuelta; esquema = SLT-45 salvo enums; `pg_get_functiondef('pais_tipos_de_nivel')` tras la vuelta = el de SLT-43; `UPDATE provincia` tras la vuelta llega al nodo; escribir el nodo tras la vuelta no toca la vieja; reaplicar deja lo mismo) |
| R10 | `slt46-migraciones-aditivas.test.ts` (ninguna de las tres menciona `orden`) |
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
| R23, R24 | `tests/unit/services/pais-service.test.ts` y `tests/integration/db/pais-alta-tipos.test.ts` (2, 3 y 4 tipos → exactamente P tipos; 1 y 11 → `validation_error`; `pais.nivel_N_*` = tipos 1–3 que existan) |
| R46 | `pais-alta-tipos.test.ts` (país de 2 tipos: sin `nivel_3` tras el alta, tras editar el tipo 1 y el 2 y tras un `UPDATE pais SET nombre`) |
| R47 | `tests/integration/db/slt46-pais-tipos-de-nivel.test.ts` (sobre CR y un país de 3 tipos: la misma escritura de `pais` con la función de SLT-43 y con la de SLT-46 deja los mismos tipos, comparados campo a campo) |
| R48, R49 | `tests/integration/db/pais-agregar-nivel.test.ts` (2 → 3: tipo creado y `pais.nivel_3_*` copiado; 4 → 5: solo tipo; nodos y otros tipos intactos; 10 → `tope`; dos altas en paralelo → una `conflict`; sin país → `no_existe`) y `pais-service.test.ts` (desenlaces y `validation_error` por nombre) |
| R50 | `tests/unit/guards/geografia-sin-borrado-fisico.guardia.test.ts` (incluye `tipoNivelGeografico`) y `geografia-plataforma-action.test.ts` (lista de exports sin action de quitar nivel) |
| R51 | `tests/unit/types/pais-etiquetas.test.ts` (`etiquetasDePais` con nivel 3 vacío → la etiqueta del nivel 2; con nombre → el nombre) |
| R52 | Revisión del reviewer: `progress/impl_SLT-46.md` anota la maqueta aprobada (2026-11-09, lienzo https://claude.ai/artifact/QFq31uvvXmLXF4AGt9PFfH, versión 7) con fecha anterior al primer commit de T6, y lo implementado sigue la maqueta |
| R25, R26 | `tests/integration/db/pais-tipos-edicion.test.ts` (tipo 2 → tipo + `pais.nivel_2_*`; tipo 4 → solo tipo; igual → sin escribir; inexistente → `not_found`) y `pais-service.test.ts` |
| R27 | `tests/components/etiquetas-geograficas.test.tsx` (las etiquetas salen de `pais.nivel_N_*` editado) + `pais-tipos-edicion.test.ts` (`PaisRepository.deLaEmpresa` devuelve el nombre nuevo) |
| R28 | `tests/integration/db/pais-disponible.test.ts` (país de 4 niveles → disponible `ok`) |
| R29 | `tests/integration/api/v2-paises-de-prueba.route.test.ts` (existente de SLT-45, sin cambios) |
| R30, R32, R34 | `tests/unit/utils/division-csv.test.ts` y `carga-division-service.test.ts` (P = 4; falta `codigo_nivel_4` → rechazo; hueco → error de línea; cotas) |
| R31 | `tests/integration/db/carga-division.test.ts` (casos de SL-20 con su resultado; el de homónimos en base retirado por P6, con comentario) |
| R33 | `tests/integration/db/carga-division-n-niveles.test.ts` (país de 4 niveles; tipos por profundidad; completar código; todo o nada) |
| R35, R36 | `tests/integration/db/geografia-registro-accion.test.ts` (filas, entidad `nodo_geografico`, etiqueta, en la misma tx: si el historial falla no queda el nodo) |
| R37 | `pais-alta-tipos.test.ts`, `pais-agregar-nivel.test.ts` y `pais-tipos-edicion.test.ts` (los dos nombres cambiados → dos filas con `detalle.campo`) |
| R38 | `geografia-registro-accion.test.ts` (`historial_accion` sin filas nuevas) |
| R39 | `geografia-service.test.ts`, `carga-division-service.test.ts`, `pais-service.test.ts` (rol `maestro` → `forbidden`, doble de repo que falla si se le llama; incluye `reordenarTipos`) y `geografia-plataforma-action.test.ts` |
| R40 | `tests/integration/db/geografia-superadmin-sin-empresa.test.ts` (ampliado a tipos y profundidad 4) |
| R41 | `tests/integration/db/geo-nodo-rls.test.ts` (existente de SLT-43, sin cambios) |
| R42 | `tests/unit/guards/geografia-sin-borrado-fisico.guardia.test.ts` |
| R43 | `tests/unit/guards/nodo-geografico-escritor-unico.guardia.test.ts` y `geografia-renombrado-punto-unico.guardia.test.ts` |
| R44 | `slt46-nodo-copia-vieja.test.ts` (`pg_get_functiondef('orden_nodo_geografico')` igual al de SLT-43; `zona_distrito` sin cambios de esquema) + `tests/integration/db/orden-nodo-escritura.test.ts` (existente) |
| R45 | Gate completo de CI: sin archivos nuevos en `e2e/`; E2E existentes en verde |
| R53 | `tests/components/lista-reordenable.test.tsx` (arrastrar la fila 3 sobre la 1 → orden emitido; con la manija enfocada, `ArrowUp`/`ArrowDown` mueven una posición, el foco sigue en la manija y la región `aria-live` anuncia la posición; arrastrar desde fuera de la manija no mueve; no hay botones de subir/bajar) |
| R54 | `tests/components/GeografiaPlataformaAltaPais.test.tsx` (reordenar y confirmar → `crearPaisAction` recibe `tipos` en el orden de pantalla) + `pais-alta-tipos.test.ts` existente (claves en el orden de la lista) |
| R55 | `tests/integration/db/pais-reordenar-tipos.test.ts` (país de 4 tipos con nodos en las 4 profundidades: invertir 1↔2 y mover el 4 al 1 → nombres por profundidad; `pais.nivel_1..3_*` copiados; ids, claves, `digitos_codigo`, `codigo_hereda_prefijo` y todos los nodos —`tipo_id`, `profundidad`, `nombre`— iguales; CR: reglas de código intactas; país de 2 tipos: sin `nivel_3`, R46) |
| R56 | `pais-reordenar-tipos.test.ts` (una fila `tipo_nivel_geografico_renombrado` por nombre cambiado con `detalle.campo` y `detalle.origen = "reordenado"`; orden actual → sin escritura ni historial; si el historial falla no queda ningún nombre cambiado) |
| R57 | `tests/unit/types/pais-schemas.test.ts` (repetidos, 1 y 11 → error), `pais-service.test.ts` (desenlaces; `maestro` → `forbidden` con doble que falla) y `pais-reordenar-tipos.test.ts` (país inexistente → `no_existe`; falta un tipo, sobra uno, uno de otro país, nombre distinto → `cambio_concurrente` sin escribir) |
| R58, R59 | `tests/components/confirmar-cambio.test.tsx` (pinta antes → después; cancelar no llama a la acción) y, por acción, `GeografiaPlataformaAltaPais.test.tsx` (alta de país), `geografia-arbol-n-niveles.test.tsx` (alta, renombre, retiro y reactivación de nodo) y `tipos-de-nivel-pais.test.tsx` (edición de tipo, reordenar, agregar nivel): dato inválido → sin modal y error en el campo, action no llamada; dato válido → modal con antes → después y action no llamada hasta confirmar |
| R60 | `geografia-plataforma-action.test.ts` (cada action de escritura con una entrada inválida —nombre de 1 carácter, 11 tipos, `tipoId` repetidos— → `validation_error`, sin llamar a ningún método de escritura del repositorio) |
| R61 | `tests/integration/db/geografia-cambio-concurrente.test.ts` (renombre de nodo, edición de tipo y agregar nivel con un «antes» viejo → `cambio_concurrente` sin escribir ni historial; «antes» viejo pero el valor ya es el pedido → `sin_cambio`; dos agregar nivel con la misma `profundidad` en paralelo → uno `ok`, otro `conflict`), `geografia-service.test.ts` y `pais-service.test.ts` (`cambio_concurrente` → `{status:"conflict", motivo:"cambio_concurrente"}`; los `conflict` de antes sin `motivo`) y los tests de componente de R58 (aviso y refresco ante ese motivo) |
| R62 | `GeografiaPlataformaAltaPais.test.tsx` (título «Niveles 2 (máximo 10)» con 2 filas y «Niveles 10 (máximo 10)» con 10; con 2 filas no se puede quitar; con 10 no se puede agregar) |
| R63 | `tests/unit/types/pais-schemas.test.ts` (acepta `disponible` true/false, opcional, rechaza no booleanos), `tests/integration/db/pais-alta-tipos.test.ts` (país con `disponible=false`, `true` y sin él → false, true, true en el `RETURNING` del mismo insert y en la base; historial = R37; historial caído → no queda el país) y `GeografiaPlataformaAltaPais.test.tsx` (casilla desmarcada; resumen «Disponibilidad»; la action recibe `disponible`; aviso con 2 y 4 niveles, no con 3) |

## 12. Alternativas descartadas

1. **Dejar elegir el tipo de cada nodo** (decisión 2 de la épica al pie de la letra). Un nodo de
   profundidad ≤ 3 con un tipo distinto de `nivel_<k>` hace que la sincronía vieja → nodo, al recibir el
   eco, le pise el tipo. Evitarlo exige cambiar las tres funciones de SLT-43 (`CREATE OR REPLACE` con un
   `IF pg_trigger_depth() > 1 THEN RETURN NULL`) o desactivar sus triggers, y la épica solo admite
   `CREATE`/`ADD COLUMN`. Con P1 (cerrada: el tipo sale de la profundidad) no se toca la sincronía de SLT-43. Si algún día se quiere elegir el tipo,
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
   renombre de tipo invalidaría los archivos preparados. Se eligieron las neutras (P4).
6. **Leer los descendientes y la cadena de nombres con `WITH RECURSIVE`.** La guardia
   `geografia-sin-cte-recursiva` lo prohíbe en `lib/`; el catálogo en memoria (SLT-44) o subir por
   `padre_id` (≤ P lecturas) bastan.
7. **País de 2 niveles con una columna nueva `pais.numero_niveles`** (`ADD COLUMN`, aditiva) que la
   función mire para no crear `nivel_3`. Funciona, pero es un segundo dato con la misma verdad que el
   número de tipos: agregar un nivel tendría que escribir los dos, y nada impide que se separen. El
   `''` en `nivel_3_*` no añade dato: dice lo mismo que la ausencia del tipo, y desaparece con las
   columnas en SLT-48.
8. **País de 2 niveles con los nombres del nivel 2 repetidos en `nivel_3_*`** como marca. Ambigua: un
   país real podría llamar igual a dos niveles, y la función no sabría si crear `nivel_3`.
9. **Que la función cree `nivel_3` solo si el tipo ya existe** (un `UPDATE … WHERE` en vez del upsert).
   No resuelve el `INSERT` del país, donde ningún tipo existe todavía: haría falta otra señal igual.
10. **Mínimo de 3 niveles** (propuesta inicial). El humano la cambió a 2 (P2).
11. **Insertar un nivel en medio o quitar el último** (P3). Insertar en medio cambia la profundidad de
    nodos ya escritos (prohibido hasta SLT-48, R6); quitar choca con la baja lógica y con los nodos que
    ya usan el tipo. El humano lo descartó.
12. **Reordenar moviendo los tipos** (cambiar la clave `nivel_<k>` de cada tipo, y con ella su regla de
    código) en vez de reasignar nombres (2026-11-09). Los nodos apuntan a su tipo por `tipo_id`: un nodo
    de profundidad 1 quedaría con el tipo `nivel_2`, contra P1, y la sincronía vieja → nodo se lo
    pisaría en el siguiente eco (§2.2). Además, el único `(pais_id, clave)` haría chocar el intercambio a
    mitad de camino. El humano fijó «solo reasigna los nombres».
13. **Librería de arrastrar y soltar** (p. ej. `@dnd-kit/core` + `@dnd-kit/sortable`). Daría arrastre
    táctil y accesibilidad hecha, pero es una dependencia nueva que pide los cuatro checks y aprobación
    (`docs/architecture.md > Dependencias de terceros`) para una lista de 2–10 filas. Se usa el arrastre
    nativo con teclado; si el humano pide táctil (P13), se reabre con los cuatro checks.
14. **Columna de versión (`actualizado_en` o `version`) para el cambio concurrente.** Sería un `ADD
    COLUMN` en `nodo_geografico` y `tipo_nivel_geografico` (aditivo, pero migración nueva, y el humano
    pidió evitarlas) y la copia de SLT-43 no la mantiene en las escrituras por SQL. Comparar con el
    «antes» que mostró el modal detecta lo que importa (que el valor que vio la persona ya no está) sin
    tocar el esquema.
15. **Validar solo en el servidor y abrir el modal con su respuesta** (una «prevalidación» por action).
    Duplica cada action y aún así el dato puede cambiar entre prevalidar y guardar. Se valida en la
    pantalla con los mismos esquemas, el servidor vuelve a validar al guardar y el «antes» cubre lo que
    cambió.

## 13. Riesgos

- **La copia es el punto que puede tumbar la geografía** (regla 6 de la épica). Mitigación: tests de
  integración de cada evento y del eco (R2–R7), ensayo sobre la copia, `down.sql` que la quita.
- **Rendimiento de la carga CSV**: cada nodo nuevo de profundidad ≤ 3 son tres escrituras (nodo, vieja,
  eco que no actualiza). Se mide en el ensayo con 10 000 filas; si no cabe en 120 s, se decide con el
  humano (subir el timeout o partir la carga) antes de la release.
- **Ventana del deploy** (§10.2): el código nuevo servido sin la migración `…120100` escribiría nodos
  sin copia vieja; se verifica en el ensayo que el build lo impide.
- **La convención `''` en `pais.nivel_3_*`**: cualquier lector nuevo de esas columnas tiene que saber
  que vacío es «sin nivel 3». Hoy el único lector de empresa es `etiquetasDePais` (con respaldo, R51);
  el superadmin lee los tipos. Se documenta en el comentario de la migración `…120200` y en el
  JSDoc de `etiquetasDePais`. Tras un `down.sql` de `…120200`, un país de 2 niveles ya creado ganaría
  un `nivel_3` vacío en su siguiente escritura de `pais` (§3).
- **Tests existentes que cambian de forma de entrada** (`{nivel, id}` → `{id}`; seis nombres → lista de
  tipos): las aserciones de resultado se conservan; el reviewer lo comprueba (R12). Desde el
  2026-11-09 también ganan el «antes» (`nombreAnterior`, `anterior`, `profundidad`) los tests ya
  verdes de renombre de nodo, edición de tipo y agregar nivel (T3, T4 hechas): mismo criterio, solo
  cambia la entrada.
- **Reordenar en un país con nodos cambia lo que significan los nombres** (2026-11-09): tras invertir
  Provincia y Cantón en CR, los nodos de profundidad 1 se llaman «Cantón» en la pantalla y en las
  etiquetas de las empresas, y la regla de código de cada profundidad no se mueve. Es lo que decidió el
  humano (solo nombres); el modal de confirmación lo muestra antes → después.

## 14. Dependencias de terceros

Ninguna nueva.
