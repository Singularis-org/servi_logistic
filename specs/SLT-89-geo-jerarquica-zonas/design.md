# SLT-89 — geo-jerarquica-zonas · design.md

> Cómo se cumple `requirements.md` (R1–R48; R43–R48 añadidos el 2026-11-09 con las respuestas del
> humano a P1–P3: §5.2, §5.4, §6, §8.3, §8.4, §10, §11). Revisión del 2026-11-09 por la decisión
> «"Antes" obligatorio»: el «antes» deja de ser opcional en guardar zona existente, renombrar grupo,
> cambiar miembros y borrar grupo (§5.1, §5.2, §5.4, §5.5, §6, §10, §12). Escrito por `spec_author` el 2026-11-09 sobre la rama
> `feature/SLT-89-geo-jerarquica-zonas` (apilada sobre SLT-46, que trae 43, 44, 45, 65 y 71).
> El MCP del grafo no tenía indexado este worktree: todo lo de abajo sale de Grep/Read del código.
> Sin dependencias nuevas.

## Lo que ya existe

Buscado en el board (`feature_list.json`: «zona», «nodo», «grupo», «geo-jerarquica»), en `specs/`
(`grep -ril` de «SLT-89», «zona … cantón/provincia», «cualquier nodo») y en el código
(`zona_distrito`, `zonaQueCubre`, `zonasCandidatas`, `GeografiaSelector`, `gruposDeDistritos`,
`planificarReconciliacion`, `impactoZonaCentral`). Ninguna ficha ni spec hace ya lo de SLT-89: SLT-46
«Geografía jerárquica: administración de países» lo manda aquí (su «Lo que NO entra»), SLT-47
«Geografía jerárquica: filtros, exportes y presentación» y SLT-48 «Geografía jerárquica: retirar
modelo viejo» lo excluyen, y SLT-90 «Planes: ciclo y cobro en la zona de cada empresa» es de otra
épica. Lo que **se reutiliza** sin re-crearlo:

| Qué | Dónde | Cómo se usa |
|---|---|---|
| Herencia y colapso | `lib/services/geografia-dominio.ts` (`zonasCandidatas`, `zonaQueCubre`, `esZonaEspecial`, `nodosBajo`, `ancestros`) y `_shared/zona-colapso.ts` (SLT-44) | Tal cual. Ya trabajan sobre nodos de cualquier profundidad; solo les faltaba recibir asignaciones que no son distritos (§4.1) |
| Carga del catálogo por petición | `CatalogoGeograficoRepository.deLaEmpresa()` (SLT-44) | Se le añade una consulta (§4.1); la memoria por petición no cambia |
| Plan de la reconciliación | `planificarReconciliacion(tx, nodosAfectados)`, `whereBaseElegible`, `whereLugarEn` (SLT-65, fichas 366/377) | Misma firma. El aviso de impacto lo llama sin escribir (§5.3) |
| Unicidad por empresa y su mensaje | índice `zona_distrito_organizacion_id_distrito_id_key`, `leerDistritosEnOtraZona`, `erroresDistritoEnOtraZona`, `MSG_DISTRITO_RECIEN_ASIGNADO` (SLT-75) | Se extienden al nodo (§5.1) |
| Historial por distrito | `zona_distrito_cambiado`, `filasDeCambioDeDistritos` (SLT-76) | Sin cambios para distritos; un tipo hermano para el resto (§2.4) |
| Grupos | `grupo_distritos`, `grupo_distritos_distrito`, `GrupoDistritosService`/`Repository`, `lib/actions/tarifas.ts`, `TarifasGrupos.tsx` (SLT-52/54) | La tabla vieja sigue con los distritos asignados; una tabla hermana para el resto (§2.2) |
| Resolver de tarifas | `_shared/resolver-tarifas.ts` (`gruposDeDistritos`, `grupoDe`) | Se generaliza a «miembro más cercano» (§4.3) sin cambiar `ParTarifa` |
| Resolución de ubicación | v1 `geo-resolucion.ts` (vía `OrdenRepository` → `zonaQueCubre`), v2 `geo-ubicacion.ts` `resolverUbicacion` | No se tocan: heredan por el catálogo (R6, R7, R40) |
| Modal y aviso de cambio concurrente | `components/shared/Modal.tsx`; patrón §4.7 de SLT-46 (`ConfirmarCambio.tsx` vive en `app/(app)/plataforma/geografia/_components/`, no se importa desde Configuración: se sigue el mismo patrón sobre `Modal`) | Mismo resultado `{ status: "conflict", motivo: "cambio_concurrente" }` |
| Escrituras de grupos | `GrupoDistritosRepository.crear` / `renombrar` / `fijarDistritos` / `borrar`, `GrupoDistritosService`, actions de `lib/actions/tarifas.ts`, texto `borrarGrupoDetalle` de `tarifas-textos.ts` (SLT-54 R42, R43) | Ganan el «antes» y el `conflict` (§5.4); el texto de R43 entra tal cual en el modal de borrar |
| Confirmación de la marca central | `impactoZonaCentral`, `descripcionConfirmacion` en `CrearZonaForm.tsx` (ficha 376) | Su texto entra tal cual en el modal único (§8.2) |
| Scripts de equivalencia y rendimiento | `pnpm geo:equivalencia-dinero`, `geo:equivalencia-consultas`, `geo:explain-consultas` (SLT-44/65) | Se corren sin cambios: comparan la lectura congelada con la nueva (R39) |
| Guardias | `organizacion-en-modelos`, `fk-misma-empresa`, `unicos-por-empresa`, `rls-por-empresa`, `historial-accion-escrituras-cubiertas`, `etiquetas-geograficas-sin-literal`, `geografia-sin-cte-recursiva`, helper `tests/unit/db/_migraciones-aditivas.ts` | Se cumplen; no se crean guardias nuevas salvo la de migraciones aditivas de SLT-89 |

## 1. La idea en una línea

Las asignaciones a distritos se quedan donde están (`zona_distrito`, con su FK compuesta hacia los
grupos), y las asignaciones a cualquier otro nodo van a una **tabla hermana** que el cargador del
catálogo une a las de distrito; lo mismo para los miembros de grupo. Con la tabla hermana vacía —que
es el estado de Costa Rica el día del deploy— cada lectura da byte a byte lo de hoy (R38).

## 2. Modelo de datos

### 2.1 `zona_nodo` (nueva, de negocio)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `text` PK | `uuid()` |
| `zona_id` | `text` NOT NULL | FK `zona(id)` ON DELETE CASCADE |
| `nodo_geografico_id` | `text` NOT NULL | FK `nodo_geografico(id)` ON DELETE CASCADE ON UPDATE CASCADE (como la de `zona_distrito`, SLT-43) |
| `organizacion_id` | `text` NOT NULL | `DEFAULT` de empresa, FK `organizacion`, como el resto (SL-17) |
| `created_at` | `timestamp` | `now()` |

- **Únicos:** `(organizacion_id, nodo_geografico_id)` — un nodo, a lo sumo una zona por empresa
  (SLT-75 llevado al nodo, R2) — y el índice `(zona_id)`, `(organizacion_id)`.
- **Trigger `zona_nodo_valido` (BEFORE INSERT OR UPDATE OF `nodo_geografico_id`)**, función nueva
  `SECURITY DEFINER` con `search_path` fijo (precedente `geografia_del_pais_de_la_empresa`):
  - si el nodo es de otro país que la empresa → `SL021` (lo traduce ya `lib/db/errores-pais.ts`);
  - si el nodo tiene profundidad 3 → `23514` (check_violation): un distrito se asigna en
    `zona_distrito`, nunca aquí. Así un distrito no puede quedar en dos tablas y el único de SLT-75
    sigue siendo la única red para distritos.
- **Misma empresa:** trigger de `zona_id` generado con `scripts/generar-misma-empresa.ts --faltantes`.
- **RLS:** `zona_nodo_por_empresa` FOR ALL TO `servi_app`, y `GRANT SELECT, INSERT, UPDATE, DELETE`,
  como `grupo_distritos_distrito` en `20261103120100`.
- `lib/db/modelos-de-negocio.ts`: `{ modelo: "ZonaNodo", tabla: "zona_nodo" }`.

### 2.2 `grupo_distritos_nodo` (nueva, de negocio)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `text` PK | |
| `grupo_id`, `zona_id` | `text` NOT NULL | FK compuesta `(grupo_id, zona_id)` → `grupo_distritos(id, zona_id)` CASCADE (la que impide un grupo de otra zona, como en SLT-52) y FK simple `zona_id` → `zona` CASCADE (lleva el trigger de misma empresa) |
| `nodo_geografico_id` | `text` NOT NULL | FK `nodo_geografico` CASCADE |
| `organizacion_id` | `text` NOT NULL | como 2.1 |
| `created_at` | `timestamp` | |

- **Único:** `(organizacion_id, zona_id, nodo_geografico_id)`; índices `(grupo_id)`,
  `(organizacion_id)`, `(zona_id, nodo_geografico_id)`.
- **Qué guarda:** todo miembro de grupo que **no** sea «distrito con fila propia en `zona_distrito`
  de la misma zona». Es decir: cantones, provincias, nodos de profundidad ≥ 4, y distritos que la
  zona cubre por herencia. El distrito asignado a la zona sigue en `grupo_distritos_distrito`, con su
  FK compuesta a `zona_distrito`, como hoy.
- **Sin FK hacia la asignación:** la cobertura de un nodo heredado no es una fila, así que no hay a
  dónde apuntar. La coherencia «el miembro está cubierto por la zona del grupo» la mantiene la
  aplicación en dos sitios, ambos dentro de una transacción: al escribir el grupo (R18) y al guardar
  una zona (R21, §5.1 paso 7). Es la diferencia de fondo con la tabla vieja y se prueba contra
  Postgres real.
- **Trigger `grupo_distritos_nodo_valido`** (BEFORE INSERT OR UPDATE): país de la empresa (`SL021`)
  y rechazo `23514` si el nodo es un distrito que tiene fila en `zona_distrito` con esa zona (ese
  miembro va en la tabla vieja). Y un trigger **nuevo** en la tabla existente
  `grupo_distritos_distrito` (`grupo_distritos_distrito_sin_duplicado`, BEFORE INSERT) que rechaza
  `23505` si ya hay fila en `grupo_distritos_nodo` para la misma `(zona, distrito)`. Con los dos, «un
  nodo, a lo sumo un grupo por zona» vale en la base a través de las dos tablas. Crear un trigger en
  una tabla existente es aditivo (no altera columnas ni datos).
- RLS, grants, misma empresa y `modelos-de-negocio.ts` como 2.1.

### 2.3 El trigger de `orden` (R28, R29)

`CREATE OR REPLACE FUNCTION orden_nodo_geografico()` (el trigger y su lista de columnas no cambian):

```
lugar := COALESCE(NEW.distrito_id, NEW.canton_id);
IF NEW.nodo_geografico_id IS NULL OR NEW.nodo_geografico_id = lugar THEN
  NEW.nodo_geografico_id := lugar;              -- el caso de hoy, sin consulta
ELSIF NOT <el nodo cuelga de lugar> THEN         -- sube por padre_id, como mucho 10 saltos
  NEW.nodo_geografico_id := lugar;
END IF;
```

- Con las escrituras de hoy (nodo ausente o igual al lugar) no consulta nada y da lo mismo que SLT-43
  (R29). Solo un nodo más profundo que el lugar paga la subida, acotada por la profundidad máxima (10).
- `CREATE OR REPLACE FUNCTION` no toma bloqueo sobre `orden` (no es `ALTER TABLE`): cumple «sin
  bloqueos largos». El `down.sql` vuelve al cuerpo de SLT-43 (`20261104120400`, líneas 46-51).
- **Nada en SLT-89 escribe todavía un nodo más profundo**: la regla de guardado de SLT-45 sigue (R7,
  R42). La base queda lista para SLT-48 y lo prueba un test de integración con SQL directo.

### 2.4 Historial (R30)

Migración propia, sola (55P04): `ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS
'zona_nodo_cambiado';`. En `lib/types/historial-accion.ts`: categoría `mueve_dinero` y etiqueta
«Cambió los lugares de una zona» (la de distritos no cambia). El `down.sql` no puede quitar un valor
de enum (como en SLT-76): deja el valor y lo dice en un comentario.

### 2.5 Migraciones

| Migración | Contenido | down.sql |
|---|---|---|
| `20261110130000_slt89_zona_nodo` | 2.1, 2.2 (tablas, índices, FK, RLS, grants, triggers de validación y de misma empresa, trigger nuevo en `grupo_distritos_distrito`) y 2.3 | `DROP` de lo creado, en orden inverso, y `CREATE OR REPLACE` de `orden_nodo_geografico` con el cuerpo de SLT-43 |
| `20261110130100_slt89_historial_zona_nodo` | 2.4 | comentario: el valor de enum se queda |

Una fila de `tests/unit/db/slt89-migraciones-aditivas.test.ts` con el helper
`_migraciones-aditivas.ts` hace cumplir R32; `tests/integration/db/migracion-slt89-ida-y-vuelta.test.ts`,
R33. Los timestamps se revisan contra `dev` y las ramas en vuelo antes del primer commit (T1.1).

### 2.6 Por qué así convive con `zona_distrito` y con la FK compuesta

- `zona_distrito` exige distrito y es única por `(org, distrito)`: no se toca. Un distrito sigue
  asignándose ahí, con el mismo `createMany`/`deleteMany` por diferencia de SLT-52 R12, el mismo
  historial y la misma red de SLT-75. Para Costa Rica, el guardado escribe exactamente lo de hoy.
- La FK compuesta `grupo_distritos_distrito → zona_distrito` sigue haciendo su trabajo (sacar del
  grupo al distrito que sale de la zona). Lo que ella no puede expresar —miembros heredados— va a la
  tabla hermana con la regla de §5.1 paso 7.
- Las dos tablas nuevas se borran sin tocar nada viejo: el `down.sql` es un `DROP` limpio.

## 3. Datos que dependen del país

La geografía es la del país de la empresa (`organizacion.pais_id`), leída del catálogo de SLT-44 con la
RLS por país; los nombres de nivel salen de `tipo_nivel_geografico` (singular del tipo de cada
profundidad), nunca de literales (`etiquetas-geograficas-sin-literal.guardia`). Moneda, impuestos y
precios no cambian: los da el resolver de tarifas de siempre. Qué profundidades acepta una orden
sigue siendo la regla de SLT-45.

## 4. Lecturas

### 4.1 Cargador del catálogo (`CatalogoGeograficoRepository.leerDeLaEmpresa`)

Una consulta más en la misma foto (`RepeatableRead`), en serie: `tx.zonaNodo.findMany({ select: {
nodoGeograficoId, zona: { id, nombre, esCentral } }, orderBy: { id } })`. Las filas se concatenan
**después** de las de `zona_distrito` en `crearAsignaciones` (nodo = `nodoGeograficoId`; R9). Con la
tabla vacía, `AsignacionesDeLaEmpresa` es idéntica a la de hoy (R38). `TxDeCarga` gana `"zonaNodo"`;
los repositorios que construyen el cargador sobre su cliente (`GeoRepository`, `OrdenRepository`,
`CoberturaRepository`, `ZonaRepository`) ganan el delegado en su `Pick`.

Con eso, sin tocar su código, heredan: v1 y v2 al crear y cotizar (R6, R7, R40), carga masiva,
cobertura Excel, `listArbol`, `listGeografiaLitePorZona` y la reconciliación.

### 4.2 Árbol de zonas de N niveles (R24–R27)

`GeoRepository.arbolDeZonas(): ArbolDeZonasDTO` (nuevo; `listArbol` de 3 niveles se queda para sus
consumidores actuales):

```ts
interface ArbolDeZonasDTO {
  tipos: { profundidad: number; nombreSingular: string; nombrePlural: string }[];
  raices: NodoDeZonasDTO[];
}
interface NodoDeZonasDTO {
  id: string; nombre: string; profundidad: number;
  activo: boolean;                                    // flag propio, como el árbol de hoy
  asignadaA: { id: string; nombre: string } | null;   // asignación directa (como mucho una, R2)
  heredaDe: { zonaId: string; zonaNombre: string; nodoId: string; nodoNombre: string } | null;
  hijos: NodoDeZonasDTO[];
}
```

`heredaDe` sale de `zonasCandidatas` sobre el padre (el nodo más cercano con asignación) con el
colapso de `zonaQueCubre`. Todo en memoria sobre el catálogo: sin CTE (`geografia-sin-cte-recursiva`).
`GeografiaService.listarArbolDeZonas(actor)` (solo `maestro`, R36) y la action
`listarArbolDeZonas` en `lib/actions/geografia.ts`.

### 4.3 Resolver de tarifas: miembro más cercano (R19, R20, R38)

`gruposDeDistritos(db, pedidos)` conserva su firma y su `Map<"zona|distrito", grupoId>`:

1. La consulta de hoy a `grupo_distritos_distrito` (sin cambios).
2. **Una consulta nueva** a `grupo_distritos_nodo` por las zonas pedidas
   (`where: { zonaId: { in } }`, índice `(zona_id, nodo_geografico_id)`).
3. Si (2) no trae filas → se devuelve el mapa de (1) tal cual: **el camino de Costa Rica no carga el
   catálogo ni cambia de resultado**.
4. Si trae: se carga el catálogo con `new CatalogoGeograficoRepository(db).deLaEmpresa()` (en la
   transacción del llamador si la hay, en serie) y, para cada par `(zona, distrito)` pedido sin grupo
   en (1), se sube por `[distrito, ...ancestros]` y gana el primer nodo con fila en (2) para esa zona.
   Un distrito con grupo en (1) ya es el miembro más específico (profundidad 3; un nodo de
   profundidad ≥ 4 no puede ser lugar de una orden en SLT-89).

Número fijo de consultas por lote: +1 siempre, +la carga del catálogo cuando la empresa tiene
miembros nuevos. Los pares sin distrito siguen sin grupo (R20; decisión P1 del 2026-11-09: va en SLT-48). `ClienteCobros` y `ClientePagos`
ganan los delegados de la carga (`grupoDistritosNodo`, `zonaNodo`, `nodoGeografico`,
`tipoNivelGeografico`, `organizacion` y el de marcas).

### 4.4 Tarifas: nodos de una zona y miembros (R17, R23)

- `TarifasPantallaRepository.distritosDeZona(zonaId, { conMarca })` pasa a salir del catálogo: los
  distritos que la zona **cubre** (`zonaQueCubre === zona`), con la marca de `esZonaEspecial`. Con
  asignaciones solo a distritos es exactamente el conjunto de `zona_distrito` (R38); con un cantón
  asignado, incluye sus distritos heredados (la referencia «Hoy rige» se calcula para ellos igual).
- `nodosDeZona(zonaId)` (nuevo): el sub-árbol cubierto por la zona —los nodos asignados y lo que
  hereda de ellos, sin las excepciones— como `NodoDeZonasDTO` reducido, para elegir miembros.
- `GrupoDistritosRepository.distritosDeLaZona` → `nodosCubiertos(zonaId, ids)`: los de `ids` que la
  zona cubre (catálogo). `distritosEnOtroGrupo` mira las dos tablas.
- `GrupoDistritosDTO` gana `nodos: { id, nombre, profundidad }[]` (los miembros que no son distrito);
  `distritos` sigue con los distritos de las dos tablas, por nombre.

## 5. Escrituras

### 5.1 `ZonaRepository.update` (orden de pasos dentro de la transacción de hoy)

Entrada (`UpdateZonaData`): `distritoIds` (profundidad 3), `nodoIds` (el resto) y, **obligatorio**
(decisión del 2026-11-09), `antes: { distritoIds, nodoIds }`. La falta de `antes` la rechazan el
esquema y el service (§5.5) antes de llegar aquí; en el repositorio el campo es requerido en el tipo.

0. `SELECT … FROM zona WHERE id = $1 FOR UPDATE` (nuevo): serializa dos guardados de la misma zona.
1. `exists` / `sin_zona_central` (sin cambios).
2. **Cambio concurrente (R16):** si el conjunto actual (`zona_distrito` + `zona_nodo` de la zona) no
   es igual a `antes` (sin orden ni repetidos, `mismoConjunto`) → `{ estado: "cambio_concurrente" }`
   sin escribir.
3. **Otra zona (R2):** `leerDistritosEnOtraZona` (sin cambios) + `leerNodosEnOtraZona` (misma forma,
   sobre `zona_nodo`) → `distrito_en_otra_zona` con los conflictos de los dos; el service los cuelga de
   `distritoIds` y `nodoIds` respectivamente, con el mismo mensaje.
4. **Existencia (R4):** los `nodoIds` deben estar en el catálogo del país (leído aquí, antes de
   escribir; el paso 7 usa una instancia nueva del cargador para ver lo recién escrito); uno que no →
   `validation_error` en `nodoIds`. Profundidad 3 en `nodoIds` → `validation_error`
   (van en `distritoIds`). Los distritos siguen con `countExistingDistritos` de hoy.
5. Marca central, `zona.update`, `distritosPrevios`, `pagosPrevios` (sin cambios).
6. **Foto de miembros heredados en riesgo** (antes del `deleteMany`): las filas de
   `grupo_distritos_distrito` de esta zona cuyos distritos salen de `zona_distrito`.
7. Escrituras por diferencia: `zona_distrito` como hoy; `zona_nodo` igual (borra los que salen, crea
   los que entran). Después, **normalización de miembros** sobre los lugares afectados (nodos de
   antes ∪ después y lo que cuelga de ellos), con el catálogo leído en la `tx` (ve lo recién escrito):
   - (a) cada distrito de la foto del paso 6 que la zona sigue cubriendo → se re-crea en
     `grupo_distritos_nodo` con el mismo grupo (la cascada lo sacó de la tabla vieja);
   - (b) cada fila de `grupo_distritos_nodo` de esta zona cuyo distrito ahora tiene `zona_distrito` en
     esta zona → se borra y se crea en `grupo_distritos_distrito` con el mismo grupo;
   - (c) cada fila de `grupo_distritos_nodo` **de cualquier zona de la empresa** cuyo nodo está en los
     lugares afectados y ya no está cubierto por su zona → se borra; una fila
     `grupo_distritos_cambiado` por grupo afectado («había N, quedan M», el formato de `fijarDistritos`).
   Con asignaciones solo a distritos, la foto de (a) se descarta (nada cubre por herencia) y (b)/(c)
   no encuentran filas: cero escrituras nuevas (R38).
8. `planificarReconciliacion(sinTransaccionAnidada(tx), afectados)` con `afectados` = nodos de la zona
   antes ∪ después (distritos y demás). Mismo plan, mismas escrituras y mismo historial (R10, R11).
9. Historial: los cuatro lotes de hoy sin cambios, más un quinto, `zona_nodo_cambiado`, si cambiaron
   nodos que no son distritos (R30; texto «nombre (padre)» con `valorDeCatalogo`; una raíz sin padre,
   solo su nombre).
10. La respuesta de hoy (`ordenesReconciliadas`, `ordenesRetenidasEnBodegaSatelite`); `ZonaDTO` gana
    `nodosCount` (filas de `zona_nodo`), `distritosCount` no cambia.

`catch`: además de `esViolacionDistritoUnico`, `esViolacionNodoUnico` (índice
`zona_nodo_organizacion_id_nodo_geografico_id_key`) → `distrito_en_otra_zona` con `conflictos: null`.

`create`: pasos 3, 4 y 7 (solo `zona_nodo.createMany`); sin `antes`, sin normalización (una zona nueva
no tiene grupos) y sin historial de nodos (R30, SLT-76).

### 5.2 Grupos (`GrupoDistritosRepository.crear` / `fijarDistritos`)

- Entrada: `distritoIds` y `nodoIds` (los dos `[]` por defecto en el esquema); en `fijar`, `antes:
  { distritoIds, nodoIds }` **obligatorio** (decisión del 2026-11-09; sin él, `validation_error`, §5.5). `SELECT … FROM grupo_distritos WHERE id = $1 FOR UPDATE`, luego
  comparación con el «antes» → `cambio_concurrente` (R43). Detalle de las cuatro escrituras en §5.4.
- El service valida con `nodosCubiertos` (R17, R18) y `distritosEnOtroGrupo` sobre las dos tablas.
- El repositorio reparte: distrito con `zona_distrito` en la zona → `grupo_distritos_distrito`;
  cualquier otro → `grupo_distritos_nodo`. Por diferencia, como hoy. Historial `grupo_distritos_*`
  con el recuento de las dos tablas (R31).

### 5.3 Impacto (R13–R15)

`ZonaRepository.impactoDeAsignacion({ zonaId | null, distritoIds, nodoIds })`, en una transacción
**de solo lectura** (`SET TRANSACTION READ ONLY`, como los scripts de SLT-65):

1. Catálogo y asignaciones de la empresa; se construyen las asignaciones **propuestas**
   reemplazando las de la zona por las pedidas (función pura nueva `conAsignacionesDeZona` en
   `geografia-dominio.ts`).
2. Afectados = nodos de la zona antes ∪ pedidos; lugares = afectados + `nodosBajo`.
3. Para cada lugar, zona antes (actual de las órdenes) y zona después (`zonaQueCubre` con las
   propuestas). Por grupos de lugares con la misma zona después, las consultas de
   `whereBaseElegible` (las mismas que `planificarReconciliacion`; se extrae una función común
   `contarPlan` para que aviso y guardado no puedan divergir, R15) más dos conteos nuevos sobre el
   mismo corte sin el filtro de cierre/gestión: `enCierre` y `conGestionFinal`.
4. «Cambian de tarifa» (R14): con la empresa activada, las pendientes cuyo `(zona, grupo)` después
   difiere de antes, con el grupo calculado por `grupoDelLugar` (puro, §4.3) sobre los miembros de
   antes y los que quedarían tras la normalización del paso 7 de §5.1; sin activar, igual a «cambian
   de zona».

Salida: `{ cambianDeZona, cambianDeTarifa, noSeMueven: { enBodegaSatelite, conGestionFinal,
enCierre } }`. Action `impactoAsignacionZona(input)` en `lib/actions/zonas.ts` (zod en el borde, tope
de 5 000 ids), `ZonaService.impactoAsignacion` (solo `maestro`, R36).

### 5.4 Escrituras de grupos: «antes» y cambio concurrente (R43–R46) — decisión P3 del 2026-11-09

Mismo patrón que SLT-46 §4.7: sin columna de versión ni migración. El cliente manda el «antes» que
el modal mostró; el repositorio, dentro de su transacción y **bajo `SELECT … FROM grupo_distritos
WHERE id = $1 FOR UPDATE`**, lo compara con la base **después** de mirar si el grupo existe (si no,
`not_found` como hoy) y antes de escribir nada. El candado sobre la fila del grupo choca con el
`FOR KEY SHARE` que Postgres toma al insertar una fila hija con FK al grupo (`tarifa_valor`,
`grupo_distritos_distrito`, `grupo_distritos_nodo`): mientras dura la comparación nadie puede añadir
un valor ni un miembro a ese grupo, así que lo comparado sigue valiendo al escribir.

| Escritura | «Antes» que manda el cliente | Comparación, bajo el candado | Si no coincide |
|---|---|---|---|
| Crear grupo | — (no hay estado previo) | Las de hoy: nombre libre en la zona (SLT-52 R10) y R18 (cubierto, no en otro grupo) | `validation_error` de hoy (R46) |
| Renombrar | `nombreAnterior: string` (el nombre que el modal pintó a la izquierda) | Si el nombre actual ya es el pedido → sigue como hoy. Si no, nombre actual = `nombreAnterior` | `cambio_concurrente` (R44) |
| Cambiar miembros | `antes: { distritoIds: string[]; nodoIds: string[] }` (los miembros que el modal pintó) | Conjunto actual de `grupo_distritos_distrito` ∪ `grupo_distritos_nodo` del grupo = `distritoIds ∪ nodoIds` (sin orden ni repetidos) | `cambio_concurrente` (R43) |
| Borrar | `antes: { nombre: string; distritoIds: string[]; nodoIds: string[]; valores: number }` | Nombre actual = `nombre`; miembros como en «cambiar miembros»; número de `tarifa_valor` del grupo = `valores` (el mismo conteo que hoy pinta SLT-54 R43, `_count.valores` de `grupoConZona`, los de tienda incluidos) | `cambio_concurrente` (R45) |

- La comparación de «cambiar miembros», «borrar» y del guardado de zona (§5.1 paso 2) usa una función
  pura nueva `mismoConjunto(a, b)` en `lib/services/geografia-dominio.ts` (orden y repetidos no
  cuentan), con casos en `geografia-dominio.test.ts` y en los tests de integración.
- `cambio_concurrente` no escribe nada: ni filas de negocio ni historial (`grupo_distritos_cambiado` /
  `grupo_distritos_borrado`). Con el «antes» igual a la base, cada escritura deja exactamente lo de
  hoy (mismo historial, mismos conteos, R31).
- Repositorio: `renombrar(id, nombre, nombreAnterior, actor) → "ok" | "not_found" | "nombre_repetido"
  | "cambio_concurrente"`; `fijarDistritos(id, pedidos, antes, actor)` gana `"cambio_concurrente"`;
  `borrar(id, antes, actor) → "ok" | "not_found" | "cambio_concurrente"`. **El «antes» es un
  parámetro obligatorio** (decisión del 2026-11-09, como `PaisRepository.renombrar(id, nombre,
  nombreAnterior, actorId)` de SLT-46): va delante del actor, como en SLT-46, y los llamadores de hoy
  (tests de SLT-52/54) se adaptan (§5.5, T5.6).
- Service: `renombrarGrupo(id, nombre, nombreAnterior, actor)`, `fijarDistritos(id, pedidos, antes,
  actor)`, `borrarGrupo(id, antes, actor)`; orden: rol (R37) → esquema (falta de «antes» →
  `validation_error`, §5.5) → `not_found` → comparación; `cambio_concurrente` → `{ status:
  "conflict"; motivo: "cambio_concurrente" }`.

### 5.5 «Antes» obligatorio (R16, R43–R46) — decisión del 2026-11-09

Igual que el renombrado de SLT-46 (`renombrarNodoGeograficoSchema` con `nombreAnterior` obligatorio):

| Escritura | Campo obligatorio | Sin él |
|---|---|---|
| Guardar zona existente (`actualizarZona`) | `antes: { distritoIds, nodoIds }` (las dos listas presentes; vacías valen y las juzga la comparación del paso 2 de §5.1) | `validation_error`, `fieldErrors.antes` |
| Renombrar grupo | `nombreAnterior` (mismas reglas de nombre que `nombre`) | `validation_error`, `fieldErrors.nombreAnterior` |
| Cambiar miembros | `antes: { distritoIds, nodoIds }` | `validation_error`, `fieldErrors.antes` |
| Borrar grupo | `antes: { nombre, distritoIds, nodoIds, valores }` | `validation_error`, `fieldErrors.antes` |
| Crear zona, crear grupo | — (R46) | — |

- **Dónde se rechaza:** en el esquema zod que parsea la action (primera red, la que ve la pantalla y
  la API de server actions) y otra vez en el service, que parsea su entrada con el mismo esquema
  (los services de grupos ya lo hacen; `ZonaService.actualizar` gana el `safeParse` del «antes»
  después del rol). Así un llamador que salta la action con un cast tampoco escribe. El repositorio
  lo recibe tipado como requerido. Nada se lee de la base antes de este rechazo salvo lo que ya leía
  hoy el rol (sesión).
- **Orden:** rol → `validation_error` (incluida la falta de «antes») → `not_found` → `conflict`. Un
  grupo inexistente pedido sin «antes» da `validation_error`, no `not_found` (R45).
- **Renombrar al mismo nombre:** el «antes» sigue siendo obligatorio aunque el nombre pedido ya sea
  el actual (R44); con «antes», ese caso sigue siendo `ok` como hoy.
- **Tests existentes:** pasan a mandar el «antes» que corresponde al estado sembrado (el conjunto de
  distritos de la zona o del grupo, el nombre actual, el número de valores). Es un cambio de entrada
  autorizado por el humano el 2026-11-09; lo que afirman del resultado no cambia, salvo
  `TarifasGrupos.test.tsx`, cuyas aserciones `toHaveBeenCalledWith` de renombrar y borrar ganan el
  «antes» (cambio de aserción autorizado). La lista va en T5.6 y T3.7.

## 6. Contratos

| Pieza | Cambio |
|---|---|
| `crearZonaSchema` / `actualizarZonaSchema` | `distritoIds: z.array(id)` (ya no `.min(1)`), `nodoIds: z.array(id).default([])`, `superRefine`: al menos uno entre los dos, si no, error en `distritoIds` (R5, mismo campo que hoy). `actualizarZonaSchema` gana `antes: z.object({ distritoIds: z.array(idSchema), nodoIds: z.array(idSchema) }).strict()` **obligatorio** (R16, §5.5); `crearZonaSchema` no lo admite (R46). Siguen `.strict()` |
| `ActualizarZonaResult` | + `{ status: "conflict"; motivo: "cambio_concurrente" }` |
| `ZonaDTO` | + `nodosCount` |
| `impactoAsignacionZona` | nuevo, entrada `{ zonaId?: string; distritoIds: string[]; nodoIds: string[] }`, salida `{ status: "ok"; impacto: ImpactoAsignacionDTO } \| ZonaActionError` |
| `listarArbolDeZonas` | nuevo, salida `{ status: "ok"; arbol: ArbolDeZonasDTO } \| forbidden \| unauthenticated` |
| `crearGrupoSchema`, `fijarDistritosSchema`, `cambiarDistritosDeGrupoSchema` | + `nodoIds` (default `[]`); `cambiarDistritosDeGrupoSchema` (y `fijarDistritosSchema`, que usa el service) + `antes: { distritoIds, nodoIds }` **obligatorio** (R43, §5.5); `crearGrupoSchema` sin «antes» (R46) |
| `renombrarGrupoDistritosSchema` (y `renombrarGrupoSchema`, que usa el service) | `{ id, nombre, nombreAnterior }`, `nombreAnterior` **obligatorio** con las reglas de nombre de `nombre` (R44, §5.5) |
| `borrarGrupoDistritosSchema` | `{ id, antes: { nombre, distritoIds, nodoIds, valores: z.number().int().min(0) } }`, `antes` **obligatorio** (R45, §5.5); listas de `idSchema`, como `distritoIdsSchema` |
| `CambiarGrupoResult` (renombrar y cambiar miembros) | + `{ status: "conflict"; motivo: "cambio_concurrente" }` |
| `BorrarGrupoResult` | + `{ status: "conflict"; motivo: "cambio_concurrente" }` |
| `CrearGrupoResult` | sin cambio (R46: un alta no tiene «antes») |
| `GrupoDistritosDTO` | + `nodos` |
| `DistritoDeSelector` (Tarifas) | sin cambio; `CargarZonaResult` gana `nodos` (sub-árbol de §4.4) |
| API v1 / v2 | sin cambios de contrato (R40) |

El «antes» es **obligatorio** en las cuatro escrituras de arriba que lo llevan (decisión del
2026-11-09, §5.5): sin él, `validation_error` sin escribir. Ya no hay llamador «sin pantalla» que lo
pueda omitir; los tests que hoy llaman sin él se adaptan (T3.7, T5.6). La pantalla lo manda siempre y
los tests de componente lo fijan.

## 7. Autorización

- Zonas (guardar, impacto, árbol): `ZonaService` / `GeografiaService.listarArbolDeZonas`, `maestro`
  solo, antes de tocar el repositorio (R36). Test con doble de repositorio que falla si se le llama.
- Grupos: `GrupoDistritosService` y `TarifasPantallaService`, lectura `maestro`+`admin`, escritura
  `maestro` (R37). Sin módulo apagable: Zonas y Tarifas son núcleo.
- Empresa: la de la sesión, por `extension-empresa` y la RLS; nunca llega del cliente (R35).

## 8. Pantallas

### 8.1 `GeografiaSelector` de N niveles (R24–R27)

Recibe `ArbolDeZonasDTO` y `zonaEnEdicionId`; emite `{ distritoIds, nodoIds }` (profundidad 3 al
primero). Fuente de verdad: el conjunto de nodos marcados. Por nodo: casilla (marcado / bloqueado /
deshabilitado por heredar de un ancestro marcado), insignia «Zona X» si es de otra zona, texto
«hereda de <zona> por <nodo>» y, bajo un nodo marcado, las excepciones visibles. Marcar quita de la
selección los descendientes marcados (R25). La búsqueda usa `normalizeName` sobre todas las
profundidades (función N-niveles nueva en `_shared/filtrar-arbol-geografico.ts`). Etiquetas de nivel
desde `tipos` del DTO. El marcado de «zona especial» (`permitirEspecial`) se retira del selector: nadie
lo usa desde SLT-51 y R8 lo prohíbe.

### 8.2 `CrearZonaForm`: un solo modal (R12–R16)

Guardar → validar con el esquema → abrir **un** `Modal` con: antes → después (nombre, marca, nodos que
entran/salen con su nivel y su padre), el bloque de la marca central de la ficha 376 si aplica (texto
y cifra de `impactoZonaCentral` sin cambios) y el impacto de §5.3. «Confirmar» deshabilitado hasta
tener las cifras. `conflict`/`cambio_concurrente` → cierra, aviso `aria-live` y `router.refresh()`.
Los tests de componente de la 376 se adaptan solo en cómo llegan al botón (un modal en vez de uno
condicional); sus aserciones de texto e impacto no cambian.

### 8.3 `TarifasGrupos` (R17, R22, R23, R43–R47)

El diálogo de miembros muestra el sub-árbol cubierto (`nodos` de `CargarZonaResult`) con casillas a
cualquier profundidad; los miembros de otro grupo, bloqueados con su nombre. La marca especial de solo
lectura (SLT-54 R45) se queda en los distritos.

Flujo común a las cuatro escrituras (R22): el diálogo de edición (nombre y/o miembros) valida con los
esquemas de `lib/types/tarifa-flexible.ts` (`crearGrupoSchema`, `renombrarGrupoSchema`,
`fijarDistritosSchema`); inválido → error en el campo, sin modal, sin llamada. Válido → modal de
confirmación sobre `Modal` (`closeOnConfirm={false}`) con filas antes → después:

| Escritura | Antes | Después | «Antes» que viaja al confirmar |
|---|---|---|---|
| Crear | «Sin grupo» | nombre; miembros con nivel y padre | — |
| Renombrar | nombre actual | nombre nuevo | `nombreAnterior` |
| Cambiar miembros | miembros actuales | entran / salen, con nivel y padre | `antes.{distritoIds,nodoIds}` del `GrupoDistritosDTO` mostrado |
| Borrar | nombre y número de miembros | «Sin grupo» + `borrarGrupoDetalle(n)` (texto de SLT-54 R43, sin cambios, `confirmVariant="destructive"`) | `antes.{nombre,distritoIds,nodoIds,valores}`; `valores` = el mismo `n` que pinta el texto |

Borrar deja de tener su `Modal` propio: es una fila más de esta tabla. Ante `conflict` con
`cambio_concurrente` (R47): cierra el modal, pinta el aviso en una región `aria-live` fuera del modal y
recarga la zona (`cargarZonaTarifas`, como hace hoy tras guardar). Los demás desenlaces (validación,
`not_found`, `forbidden`) se pintan como hoy. Los textos nuevos (títulos del modal, «Sin grupo», el
aviso) van a `tarifas-textos.ts`; las etiquetas de nivel salen de `tipos`, nunca de literales.

### 8.4 Maqueta antes de la parte visual (R48) — decisión P2 del 2026-11-09

§8.1, §8.2 y §8.3 describen el comportamiento, no el aspecto. El leader arma la maqueta de las tres
piezas en un lienzo y el humano la aprueba; la referencia al lienzo y la fecha van a
`progress/impl_SLT-89.md` (T0.2). Ninguna task de T7 empieza antes. Si la maqueta contradice algo de
este diseño o de `requirements.md`, se para y se pregunta: no se ajusta el spec en silencio.

## 9. Equivalencia y rendimiento (R38, R39)

- **En CI:** `tests/integration/db/slt89-equivalencia-cr.test.ts` siembra una empresa CR con zonas
  por distrito, grupos, marcas y órdenes, y compara contra la lectura congelada de
  `scripts/geo-equivalencia/lecturas-de-hoy.ts` y `consultas-de-hoy.ts`: zona y candidatas por nodo,
  cobertura, cotización, plan de guardado, grupo por par, cobro y pago del resolver. Además, todos los
  tests existentes de zonas, grupos, resolver y cierres pasan sin cambiar aserciones.
- **Sobre la copia (persona, no agente):** los tres scripts de R39 sin cambios. Se espera +1 consulta
  por lote en el resolver, sobre índices de tablas vacías en CR. La carga del catálogo no suma
  consultas: el conteo de `zona_nodo` viaja en la consulta de `organizacion` (8e95e91b).

## 10. Mapa de pruebas (R → test)

| R | Test |
|---|---|
| R1, R3, R4, R5 | `tests/integration/db/zona-nodo-asignacion.test.ts`; `tests/unit/types/zona-schemas.test.ts` (R5) |
| R2 | `zona-nodo-asignacion.test.ts` (conflicto y carrera por el índice); `tests/unit/services/zona-service.test.ts` (mensaje) |
| R6, R7, R9 | `tests/integration/db/zona-nodo-herencia.test.ts` (v1, v2, carga, cobertura, árbol, filtros por zona) |
| R8 | La guardia existente `tarifas-sin-escritura-vieja` (ya prohíbe escribir `distrito_zona_especial` desde las actions) y un caso en `zona-nodo-herencia.test.ts` (marca de un distrito heredada por un nodo de profundidad 4; un cantón asignado no gana marca) |
| R10, R11 | `tests/integration/db/zona-nodo-reconciliacion.test.ts` |
| R12, R13, R16 | `tests/components/ZonaGuardadoConfirmacion.test.tsx`; R16 (servidor): `zona-nodo-asignacion.test.ts` (cambio concurrente), `tests/unit/types/zona-schema.test.ts` (`actualizarZonaSchema` sin `antes` → error en `antes`; `crearZonaSchema` sin él → válido), `tests/unit/services/zona-service.test.ts` (sin `antes` → `validation_error` y el doble de repositorio no se llama), `tests/integration/actions/zonas-action.test.ts` (sin `antes` → `validation_error`, sin escrituras) |
| R14, R15 | `tests/integration/db/zona-nodo-impacto.test.ts` (aviso = guardado; sin escrituras; tarifa con y sin activación) |
| R17, R18, R19, R21 | `tests/integration/db/grupo-nodo.test.ts`; `tests/unit/services/grupo-distritos-service.test.ts` |
| R20 | `grupo-nodo.test.ts` (orden sin distrito bajo un cantón con grupo → sin grupo) |
| R22, R23 | `tests/components/TarifasGrupos.test.tsx` (por cada una de las cuatro escrituras: inválido → sin modal ni llamada; válido → antes → después, action no llamada hasta confirmar, cancelar no llama, «antes» enviado; borrar conserva el texto de SLT-54 R43) |
| R43, R44, R45, R46 | `tests/integration/db/grupo-cambio-concurrente.test.ts` (por escritura: «antes» igual → escribe lo de hoy; distinto → `cambio_concurrente` sin filas de negocio ni historial; borrar con un valor o un miembro añadido entre medias → no borra; renombrar al nombre que ya tiene → como hoy; grupo inexistente → `not_found`; crear con nombre recién tomado o miembro recién metido en otro grupo → `validation_error`); `tests/unit/services/grupo-distritos-service.test.ts` (traducción a `conflict`; sin «antes» en renombrar, cambiar miembros y borrar → `validation_error` en su campo y el doble de repositorio no se llama, también con un grupo inexistente y con el nombre pedido igual al actual; crear sin «antes» → sigue `ok`); `tests/integration/actions/tarifas-action.test.ts` (las actions pasan el «antes» y devuelven el `conflict`; sin «antes» → `validation_error` y la base sin cambios) |
| R38 («antes» en tests existentes) | Revisión: los archivos de T3.7 y T5.6 solo cambian la entrada (y en `TarifasGrupos.test.tsx` el `toHaveBeenCalledWith` de renombrar/borrar), nunca lo que afirman del resultado |
| R47 | `tests/components/TarifasGrupos.test.tsx` (cierra, aviso `aria-live`, recarga la zona) |
| R24–R27 | `tests/unit/components/geografia-selector-n-niveles.test.tsx` |
| R48 | Revisión: en `progress/impl_SLT-89.md` la referencia al lienzo y la fecha de aprobación son anteriores al primer commit de T7 (`git log`) |
| R28, R29 | `tests/integration/db/orden-nodo-mas-profundo.test.ts` |
| R30, R31 | `tests/integration/db/zona-nodo-rastro.test.ts` |
| R32 | `tests/unit/db/slt89-migraciones-aditivas.test.ts` |
| R33 | `tests/integration/db/migracion-slt89-ida-y-vuelta.test.ts` |
| R34, R35 | `tests/integration/db/zona-nodo-dos-empresas.test.ts` (RLS, misma empresa, SL021, cobertura y precio por empresa) |
| R36 | `tests/unit/services/zona-service.test.ts`, `tests/unit/services/geografia-service.test.ts` |
| R37 | `tests/unit/services/grupo-distritos-service.test.ts` (crear, renombrar, cambiar miembros y borrar), `tests/unit/services/tarifas-pantalla-service.test.ts` |
| R38 | `tests/integration/db/slt89-equivalencia-cr.test.ts` + suites existentes sin cambios |
| R39 | Salida de los tres scripts pegada en el PR (persona) |
| R40 | Suite de contrato v1 de SLT-45 sin cambios |
| R41 | `e2e/zonas-nodo-canton.spec.ts`; `e2e/dos-empresas-humo.spec.ts` |
| R42 | Revisión del diff (sin cambios en filtros/exportes, FK viejas, regla de guardado, modelo viejo) |

## 11. Alternativas descartadas

1. **Una sola tabla `zona_nodo` para todo, con `zona_distrito` como espejo por trigger** (el patrón de
   SLT-46 nodo → geografía vieja). Descartada: exige copiar los datos de `zona_distrito` a la tabla
   nueva en la migración y una sincronía en los dos sentidos mientras los tests y fábricas siguen
   escribiendo `zona_distrito` a mano (decenas de archivos). Cualquier fallo de la sincronía cambia
   zonas de Costa Rica; con la tabla hermana, Costa Rica no pasa por código nuevo.
2. **Hacer `zona_distrito.distrito_id` nullable y añadirle un `nodo_geografico_id` como clave.**
   Descartada: es `ALTER COLUMN` (prohibido hasta SLT-48) y rompe la FK compuesta de los grupos.
3. **Que el selector siga marcando distritos uno a uno al marcar un cantón** (cascada de hoy).
   Descartada: no sería «asignar el cantón» (los distritos nuevos del cantón no heredarían) y no hay
   excepciones que mostrar.
4. **Reutilizar `zona_distrito_cambiado` para cualquier nodo.** Descartada: su etiqueta dice
   «distritos» y cambiaría el texto del historial de Costa Rica; un tipo hermano cuesta una migración de
   una línea.
5. **Miembros de grupo solo en la tabla nueva desde ahora** (la vieja congelada). Descartada: un
   distrito saldría de la zona sin que la cascada lo sacara del grupo, y la escritura de grupos de CR
   cambiaría de tabla (historial y FK distintos de hoy).
6. **Pasar el cantón al resolver de tarifas (P1).** Pospuesta: ~15 archivos más para un caso que hoy
   no existe en CR. El humano la mandó a SLT-48 «Geografía jerárquica: retirar modelo viejo» el
   2026-11-09.
7. **Modal solo en lo que SLT-89 toca (crear grupo y cambiar miembros), dejando renombrar y borrar
   como hoy** (la propuesta de P3). Descartada por el humano el 2026-11-09: toda escritura de grupos
   pasa por el modal con cambio concurrente (§5.4).
8. **Columna de versión (`updated_at` o contador) en `grupo_distritos` para el cambio concurrente.**
   Descartada: es una migración sobre una tabla existente y un `UPDATE` más en cada escritura de
   miembros y valores (los valores ni siquiera escriben en el grupo); SLT-46 §4.7 ya fijó el patrón del
   «antes» sin versión, y el candado de §5.4 cubre las altas de valores y miembros por la FK.
9. **Comparar en «borrar» los ids de los valores en vez de su número.** Descartada: el modal muestra
   el número (SLT-54 R43), no los valores; el «antes» compara lo que la persona vio (SLT-46 §4.7).
10. **«Antes» opcional para no tocar los tests de hoy** (la versión anterior de este diseño).
   Descartada por el humano el 2026-11-09: un llamador sin «antes» se saltaría el control de cambio
   concurrente sin que nada lo notara; se alinea con el renombrado de SLT-46, donde es obligatorio.

## 12. Riesgos

- **Normalización de miembros (§5.1 paso 7)** es la pieza nueva con más casos; se prueba con una
  tabla de casos (asignado → heredado, heredado → asignado, sale de la zona, excepción en otra zona)
  contra Postgres real.
- **Tamaño del PR:** ~93 archivos y ~8 100 líneas (sin `specs/` ni `progress/`; +3 archivos y ~600
  líneas por P3; +15 archivos y ~500 líneas por el «antes» obligatorio, casi todo tests existentes
  que ganan el «antes» en su entrada), por encima del máximo de 40 archivos / 1 000 líneas. El humano decidió una sola tarjeta («¿Partir la tarjeta?»); se
  dice aquí para que la revisión lo sepa.
- **Rama apilada:** depende de SLT-46 (PR #107) sin mergear.
- **Maqueta (R48):** T7 queda parada hasta la aprobación; el backend (T1–T6) no depende de ella. Si la
  maqueta pide algo que el contrato de §6 no da (p. ej. otro dato en el «antes»), se vuelve al spec.
