# SLT-43 — geo-jerarquica-modelo · requirements.md

> Zona: backend · Complejidad: high · depends_on: SL-20 · Rama: feature/SLT-43-geo-jerarquica-modelo
> (PR hacia `dev`)
>
> **Alcance.** Fase *expand* de la épica GEO: crea `tipo_nivel_geografico` y `nodo_geografico`
> (con trigger de profundidad/país; sin `ruta` ni índice GIN desde la decisión del humano del
> 2026-10-29, ver «Decisiones cerradas») y añade columnas nuevas, que admiten NULL, en
> `orden`, `zona_distrito`, `distrito_zona_especial` y `cierre_detail`. Triggers de sincronía
> mantienen el nodo al día desde `provincia`/`canton`/`distrito`, `orden` y las zonas. Copia en la
> migración los nodos (conservando ids) y los tipos de **todos** los países existentes desde
> `pais.nivel_N_*`; las órdenes, las zonas y el snapshot se llenan con un script aparte, por lotes y
> reanudable. La app funciona igual para Costa Rica.
>
> **Lo que NO entra.** Lecturas y repositorios sobre el modelo nuevo → SLT-44. API v1/v2 y CSV →
> SLT-45. Pantalla del superadmin, edición de tipos y escrituras en `nodo_geografico` → SLT-46.
> Filtros, exportes y presentación → SLT-47. Borrar, renombrar o reescribir lo viejo → SLT-48.
> Ejecutar el script de datos en producción: lo hace una persona, fuera de horario.
>
> Sembrado por `/afinar-feature` el 2026-10-29. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-10-29. «Geografía vieja» = las tablas `provincia`, `canton` y
> `distrito`; «modelo nuevo» = `tipo_nivel_geografico` y `nodo_geografico`. «La migración» = las
> migraciones de SLT-43; «el script» = el script de datos por lotes, que no es una migración.
> Las columnas, triggers y tests concretos están en `design.md`.

### Catálogo de tipos de nivel

- **R1** (ubicuo) El sistema DEBE guardar, por país, un catálogo de tipos de nivel geográfico. Cada
  tipo tiene una clave única dentro de su país, un nombre singular, un nombre plural, un número de
  dígitos de código que puede faltar y una marca de si su código hereda el prefijo del código del
  padre.
- **R2** (por evento) CUANDO se aplica la migración, el sistema DEBE crear los tipos de nivel 1, 2 y
  3 de **cada** país que exista en ese momento, con los nombres y los dígitos de código de sus
  columnas `pais.nivel_N_*`, de modo que ningún país quede sin catálogo de tipos.
- **R3** (por evento) CUANDO se da de alta un país, o cambian sus nombres de nivel o sus dígitos de
  código, el sistema DEBE crear o actualizar sus tres tipos de nivel en la misma transacción.

### Nodo geográfico

- **R4** (ubicuo) El sistema DEBE guardar cada nodo geográfico con su país, su tipo, su padre (que
  puede faltar), su profundidad, su nombre, su nombre normalizado, su código oficial (que puede
  faltar), si está activo y su fecha de alta. (Enmienda 2026-10-29: sin ruta de ancestros; los
  ancestros y descendientes de un nodo se obtienen siguiendo su padre.)
- **R5** (condicional) SI se intenta guardar un nodo cuyo padre es de otro país, ENTONCES el sistema
  DEBE rechazar la escritura sin guardar nada.
- **R6** (condicional) SI se intenta guardar un nodo cuyo tipo es de otro país, ENTONCES el sistema
  DEBE rechazar la escritura sin guardar nada.
- **R7** (condicional) SI se intenta guardar un nodo cuya profundidad no es la de su padre más 1, o
  distinta de 1 cuando no tiene padre, o SI se intenta cambiar la profundidad de un nodo que tiene
  hijos, ENTONCES el sistema DEBE rechazar la escritura con un código de error propio y sin guardar
  nada. Con esta regla todo nodo tiene siempre la profundidad de su padre más 1, así que ningún nodo
  puede quedar colgado de sí mismo ni de un descendiente suyo (sin ciclos). (Enmienda 2026-10-29: la
  segunda condición sustituye la comprobación de los descendientes que antes hacía el recálculo de la
  ruta.)
- **R8** — Retirado (decisión 2026-10-29): sin columna `ruta`, no hay ruta que calcular ni que
  recalcular en los descendientes. La profundidad la sigue cubriendo R7. Se conserva el número para
  no renumerar.
- **R9** (condicional) SI se intenta guardar un nodo con el mismo nombre normalizado que un hermano,
  una raíz con el mismo nombre normalizado que otra raíz del mismo país, o un código oficial ya usado
  por otro nodo del mismo país **y del mismo tipo**, ENTONCES el sistema DEBE rechazar la escritura
  sin guardar nada. Dos nodos de tipos distintos del mismo país sí pueden compartir código (decisión
  del 2026-10-29: difiere de la tarjeta).
- **R10** (ubicuo) El nombre normalizado de un nodo DEBE ser igual al que produce la normalización
  de nombres de la app (sin acentos, en minúsculas, sin espacios de sobra) para todo nombre de la
  geografía existente.
- **R11** — Retirado (decisión 2026-10-29): sin `ruta` no hay índice sobre ella. Los nodos bajo un
  ancestro se consultan siguiendo `padre_id` (consulta recursiva o el catálogo en memoria), que es
  una lectura y entra en SLT-44. Se conserva el número para no renumerar.
- **R12** (de estado) MIENTRAS una petición corre en el contexto de una empresa, el sistema DEBE
  dejarle leer solo los tipos y los nodos del país de esa empresa, y DEBE rechazarle cualquier
  escritura en ellos.

### Migración de la geografía existente

- **R13** (por evento) CUANDO se aplica la migración, el sistema DEBE copiar cada provincia, cantón y
  distrito existente a un nodo con **el mismo id**, el mismo país, el mismo padre, el mismo nombre, el
  mismo código, el mismo estado activo, profundidad 1, 2 o 3 y el tipo de ese nivel de su país.
- **R14** (condicional) SI la geografía existente tiene dos hijos de un mismo padre con el mismo
  nombre normalizado o dos provincias de un país con el mismo nombre normalizado, ENTONCES la
  migración DEBE abortar antes de cambiar nada e informar cuántos casos encontró. (El código no
  necesita comprobación: el único viejo por país y nivel ya es el mismo que el nuevo de R9.)

### Sincronía mientras conviven los dos modelos

- **R15** (por evento) CUANDO se inserta una provincia, un cantón o un distrito, el sistema DEBE
  crear en la misma transacción su nodo con el mismo id y los datos de R13.
- **R16** (por evento) CUANDO cambia el nombre, el código, el estado activo, el padre o el país de
  una provincia, un cantón o un distrito (incluido el retiro por `activo`), el sistema DEBE reflejar
  el cambio en su nodo en la misma transacción.
- **R17** (por evento) CUANDO se borra físicamente una provincia, un cantón o un distrito, el
  sistema DEBE borrar su nodo en la misma transacción.
- **R18** (ubicuo) La sincronía DEBE convivir con los triggers de SL-20 (`canton_pais_del_padre`,
  `distrito_pais_del_padre`, `geografia_del_pais_de_la_empresa`) sin reemplazarlos ni cambiar su
  resultado, y NO DEBE escribir en `historial_accion` ni en `historial_plataforma`.

### Columnas nuevas y sus triggers

- **R19** (ubicuo) La migración DEBE añadir, sin valor y admitiendo NULL, `orden.nodo_geografico_id`,
  `zona_distrito.nodo_geografico_id`, `distrito_zona_especial.nodo_geografico_id` y
  `cierre_detail.ubicacion_snapshot`, y NO DEBE contener `DROP`, `DELETE`, `RENAME`, `TRUNCATE`,
  `UPDATE` de columnas existentes ni `ALTER TYPE` distinto de `ADD VALUE IF NOT EXISTS`.
- **R20** (por evento) CUANDO se inserta una orden o cambia su provincia, su cantón, su distrito o su
  nodo, el sistema DEBE dejar su nodo en el distrito de la orden o, si no tiene distrito, en su
  cantón.
- **R21** (por evento) CUANDO se inserta o cambia el distrito de una fila de `zona_distrito` o de
  `distrito_zona_especial`, el sistema DEBE dejar su nodo en ese distrito.
- **R22** (ubicuo) El trigger de R20 DEBE costar como máximo 1 ms por fila, medido como la diferencia
  entre insertar al menos 5 000 órdenes con el trigger y sin él, dividida por el número de filas.
- **R23** (por evento) CUANDO se aplica la migración, los enums `historial_accion_entidad` y
  `historial_plataforma_entidad` DEBEN tener el valor `nodo_geografico`, sin que cambie ninguna fila de
  historial existente ni lo que muestra la pantalla de historial.
- **R24** (ubicuo) Las claves foráneas nuevas de `orden`, `zona_distrito` y `distrito_zona_especial`
  hacia `nodo_geografico` DEBEN crearse sin validar las filas existentes, y su validación DEBE
  ejecutarse solo después del script, cuando no quede ninguna fila pendiente.

### Script de datos por lotes

- **R25** (ubicuo) El script, sin opciones, DEBE ser de solo lectura e informar: las órdenes cuyo
  distrito no es hijo de su cantón, las órdenes cuyo cantón no es hijo de su provincia, el total de
  órdenes, las órdenes sin distrito y las filas pendientes de cada columna nueva.
- **R26** (condicional) SI alguna de las dos comprobaciones de jerarquía de R25 da más de 0,
  ENTONCES el script DEBE negarse a escribir y terminar con error.
- **R27** (por evento) CUANDO se ejecuta el script en modo de escritura, el sistema DEBE llenar solo
  las filas cuya columna nueva está vacía, en lotes de tamaño configurable (1 000 por defecto), cada
  lote en su propia transacción: el nodo de la orden con su distrito o, si no tiene, con su cantón; el
  de las zonas con su distrito; y el `ubicacion_snapshot` según R31.
- **R28** (condicional) SI el script se interrumpe, ENTONCES al volver a lanzarlo DEBE seguir con las
  filas pendientes sin reescribir las ya llenas, y relanzarlo con todo lleno NO DEBE escribir nada.
- **R29** (ubicuo) El script NO DEBE escribir en ninguna columna existente; en particular, el
  `updated_at` de cada orden DEBE quedar igual que antes del script.
- **R30** (ubicuo) El script NO DEBE disparar los triggers `cobro_plataforma_al_crear_orden` ni
  `cobro_plataforma_al_cambiar_borrado`: los cargos de plataforma DEBEN quedar iguales.
- **R31** (por evento) CUANDO el script llena el `ubicacion_snapshot` de una fila de `cierre_detail`,
  el sistema DEBE guardar los niveles de la raíz a la hoja, cada uno con su profundidad, el nombre
  singular de su tipo, su nombre y el id de su nodo. Los nombres salen de `provincia_nombre`,
  `canton_nombre` y `distrito_nombre` de la misma fila (sin el tercer nivel si `distrito_nombre` es
  NULL), y esas tres columnas no se tocan. Los ids salen de `provincia_id`, `canton_id` y
  `distrito_id` de la orden de la fila. El nombre es la foto y el id solo enlaza: si el nodo se
  renombró después, el snapshot conserva el nombre congelado (decisión del 2026-10-29).
- **R32** (por evento) CUANDO se ejecuta el modo de equivalencia, el script DEBE comparar, por país,
  los conteos de cada nivel en la geografía vieja y en el modelo nuevo, la cobertura de cada zona
  (distritos de `zona_distrito` frente a sus nodos) y las órdenes con nodo vacío, y DEBE terminar con
  error si alguna difiere o si queda alguna orden con nodo vacío.
- **R33** (condicional) SI el modo de escritura o el de validación se invoca sin confirmar el nombre
  de la base conectada, o con un nombre distinto, ENTONCES el script DEBE negarse sin escribir.

### Vuelta atrás y no regresión

- **R34** (ubicuo) Cada migración DEBE traer su `down.sql`; aplicar los `down.sql` en orden inverso
  DEBE dejar el esquema como antes de SLT-43 (salvo los valores de enum de R23, que se quedan) y la
  geografía vieja, las órdenes, las zonas y los cierres sin cambios; volver a aplicar las migraciones
  DEBE dejar lo mismo que la primera vez.
- **R35** (de estado) MIENTRAS los `down.sql` de SLT-43 están aplicados, crear y editar geografía,
  órdenes y zonas DEBE funcionar como antes de SLT-43.
- **R36** (de estado) MIENTRAS conviven los dos modelos, las pantallas, la carga CSV de SL-20, la API
  y los flujos de órdenes, zonas y cierres DEBEN comportarse igual para Costa Rica: sus tests de
  integración y el E2E de órdenes existentes pasan sin cambiar sus aserciones.
- **R37** (ubicuo) En SLT-43, ningún código de la app DEBE escribir en `nodo_geografico` ni en
  `tipo_nivel_geografico`: las escrituras siguen en la geografía vieja y las propaga la sincronía.

### Integración y entorno

- **R38** — Retirado el 2026-10-29: sin rama épica, los PRs van a `dev` y el gate ya corre ahí
  (decisión del humano). Se conserva el número para no renumerar.
- **R39** (de estado) MIENTRAS el entorno es un preview sin `MIGRATE_ON_PREVIEW=true`, el build NO
  DEBE aplicar migraciones.

### Cierres creados después del script

- **R40** (por evento) CUANDO se crea una fila de `cierre_detail` después de la migración, el
  sistema NO DEBE llenar su `ubicacion_snapshot` (queda NULL, sin trigger en `cierre_detail`); y
  CUANDO se vuelve a lanzar el script, DEBE llenarla según R31 (decisión del 2026-10-29; la columna la
  empieza a escribir SLT-47).

## Preguntas abiertas

_Ninguna._ Las cuatro que dejó el spec (forma del snapshot, snapshot de los cierres nuevos, único
del código oficial y tipo de `ruta`) las respondió Camilo el 2026-10-29: ahora son filas de
«Decisiones cerradas».

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-29 | ¿Dónde se integra? | En `dev`, como manda el arnés: un PR por tarjeta. La rama épica se probó y se descartó el mismo día (decisión del humano: «dale normal con merge a dev»). |
| 2026-10-29 | ¿Se permite `ALTER TYPE`? | Solo `ADD VALUE IF NOT EXISTS`. Quitar o renombrar valores sigue prohibido hasta SLT-48. |
| 2026-10-29 | ¿Qué pasa con el historial viejo por provincia/cantón/distrito? | Convive: lo viejo no se reescribe y `nodo_geografico` es un valor más del enum, para lo que se escriba desde SLT-46. |
| 2026-10-29 | ¿Qué países llenan `tipo_nivel_geografico`? | Todos los que existan al migrar, no solo Costa Rica. |
| 2026-10-29 | ¿Tope del trigger de `orden`? | ≤ 1 ms por fila, medido en una carga masiva de prueba. Si se pasa, el PR no entra. |
| 2026-10-29 | ¿E2E? | No hay E2E nuevo: integración contra Postgres real para cada trigger y el E2E existente de órdenes como red. Se hereda de SL-20. |
| 2026-10-29 | Verificaciones previas | Los previews de Vercel no apuntan a producción, y Supabase de producción tiene backup activo (Camilo). |
| 2026-10-29 | Precedentes | Se heredan SL-20 (tabla `pais`, `historial_plataforma`, identificadores en español), la ficha 374 (retiro por `activo`, unicidad por padre) y SL-17 (geografía de plataforma, solo lectura para la empresa). La épica reabre «siempre 3 niveles» y «nombres internos» de SL-20, por decisión del humano del 2026-10-27. |
| 2026-10-29 | ¿Forma de `cierre_detail.ubicacion_snapshot`? | `{"v":1,"niveles":[{profundidad,tipo,nombre,id}…]}`, de la raíz a la hoja, **con** el id del nodo en cada nivel. Los nombres salen de las tres columnas congeladas; los ids, de las FK de la orden. El nombre es la foto y el id solo enlaza: puede apuntar a un nodo renombrado después (Camilo). |
| 2026-10-29 | ¿Quién llena el snapshot de los cierres creados después del script? | Nadie en SLT-43, y no hay trigger en `cierre_detail`. Quedan NULL hasta SLT-47, y el script se puede relanzar para llenarlos (Camilo). |
| 2026-10-29 | ¿Único del código oficial? | `(pais_id, tipo_id, codigo_oficial)`, no `(pais_id, codigo_oficial)`. **Difiere de la tarjeta por decisión del humano**: así se conserva el único por país y nivel de SL-20 (R16) y la sincronía no rechaza un código que hoy se acepta (Camilo). |
| 2026-10-29 | ¿Tipo de `ruta`? | `text[]`, no `uuid[]`: todos los ids de la geografía son `TEXT` (Camilo). **Superada** por la fila «¿Se queda la columna `ruta`?». |
| 2026-10-29 | ¿Se queda la columna `ruta`? | **No** (Camilo, enmienda con el PR #44 abierto). Se quitan la columna `ruta`, el índice `GIN (ruta)`, su cálculo en `nodo_geografico_invariantes` (que sigue validando la profundidad y poniendo `nombre_normalizado`), el trigger `nodo_geografico_ruta_descendientes` y `ruta` en el upsert de la sincronía. Motivo: el catálogo es pequeño (unos 500 nodos por país); los descendientes se resuelven con `padre_id` (CTE recursiva) o con el catálogo en memoria, en el mismo tiempo, y quitarla deja menos piezas (dos triggers, un índice y un dato duplicado). Se busca la simplicidad. R8 y R11 quedan retirados; R7 gana «no se cambia la profundidad de un nodo con hijos», que es lo que impide los ciclos sin la ruta. |
| 2026-10-29 | ¿Qué enum es «`historial_accion`» en la tarjeta? | `historial_accion_entidad`, el de entidades de esa tabla (aceptado por Camilo). |
