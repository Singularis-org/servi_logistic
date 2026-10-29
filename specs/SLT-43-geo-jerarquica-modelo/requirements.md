# SLT-43 — geo-jerarquica-modelo · requirements.md

> Zona: backend · Complejidad: high · depends_on: SL-20 · Rama: feature/SLT-43-geo-jerarquica-modelo
> (PR hacia `epic/GEO-geografia-jerarquica`)
>
> **Alcance.** Fase *expand* de la épica GEO: crea `tipo_nivel_geografico` y `nodo_geografico`
> (con ruta, trigger de profundidad/país e índice GIN) y añade columnas nuevas, que admiten NULL, en
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
  faltar), si está activo, su ruta de ancestros y su fecha de alta.
- **R5** (condicional) SI se intenta guardar un nodo cuyo padre es de otro país, ENTONCES el sistema
  DEBE rechazar la escritura sin guardar nada.
- **R6** (condicional) SI se intenta guardar un nodo cuyo tipo es de otro país, ENTONCES el sistema
  DEBE rechazar la escritura sin guardar nada.
- **R7** (condicional) SI se intenta guardar un nodo cuya profundidad no es la de su padre más 1, o
  distinta de 1 cuando no tiene padre, ENTONCES el sistema DEBE rechazar la escritura con un código de
  error propio y sin guardar nada.
- **R8** (por evento) CUANDO se crea un nodo o cambia su padre, el sistema DEBE dejar en su ruta la
  lista de ids de sus ancestros, de la raíz a él mismo, y recalcular en la misma transacción la ruta
  de todos sus descendientes.
- **R9** (condicional) SI se intenta guardar un nodo con el mismo nombre normalizado que un hermano,
  una raíz con el mismo nombre normalizado que otra raíz del mismo país, o un código oficial ya usado
  en el mismo país, ENTONCES el sistema DEBE rechazar la escritura sin guardar nada.
- **R10** (ubicuo) El nombre normalizado de un nodo DEBE ser igual al que produce la normalización
  de nombres de la app (sin acentos, en minúsculas, sin espacios de sobra) para todo nombre de la
  geografía existente.
- **R11** (ubicuo) El sistema DEBE poder consultar los nodos que están bajo un ancestro dado
  mediante un índice sobre la ruta.
- **R12** (de estado) MIENTRAS una petición corre en el contexto de una empresa, el sistema DEBE
  dejarle leer solo los tipos y los nodos del país de esa empresa, y DEBE rechazarle cualquier
  escritura en ellos.

### Migración de la geografía existente

- **R13** (por evento) CUANDO se aplica la migración, el sistema DEBE copiar cada provincia, cantón y
  distrito existente a un nodo con **el mismo id**, el mismo país, el mismo padre, el mismo nombre, el
  mismo código, el mismo estado activo, profundidad 1, 2 o 3 y el tipo de ese nivel de su país.
- **R14** (condicional) SI la geografía existente tiene dos hijos de un mismo padre con el mismo
  nombre normalizado, dos provincias de un país con el mismo nombre normalizado o un mismo código en
  dos niveles de un país, ENTONCES la migración DEBE abortar antes de cambiar nada e informar
  cuántos casos encontró.

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
- **R23** (por evento) CUANDO se aplica la migración, los enums de entidad de `historial_accion` y de
  `historial_plataforma` DEBEN tener el valor `nodo_geografico`, sin que cambie ninguna fila de
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
  singular de su tipo y su nombre, tomando los nombres de `provincia_nombre`, `canton_nombre` y
  `distrito_nombre` de la misma fila (sin el tercer nivel si `distrito_nombre` es NULL) y sin tocar
  esas tres columnas. **Forma propuesta en `design.md > 2.6`, pendiente de aprobación humana.**
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

- **R38** (por evento) CUANDO se abre o actualiza un PR hacia una rama `epic/**`, el gate de CI
  (`gate-completo`) DEBE correr igual que en un PR hacia `dev`. (Precondición: la pone
  `/afinar-regla`, no esta feature.)
- **R39** (de estado) MIENTRAS el entorno es un preview sin `MIGRATE_ON_PREVIEW=true`, el build NO
  DEBE aplicar migraciones.

## Preguntas abiertas

- Forma de `cierre_detail.ubicacion_snapshot` (qué niveles, con tipo y nombre, y con qué claves). La
  decide `design.md`; las tres columnas de nombre actuales no se tocan.
  - **Propuesta (spec_author, 2026-10-29), pendiente de aprobación:** `design.md > 2.6`.
    `{"v":1,"niveles":[{"profundidad":1,"tipo":"Provincia","nombre":"San José"}, …]}`, sin ids de
    nodo y con los nombres tomados de las tres columnas congeladas (R31).
  - **Derivada:** ¿quién llena el snapshot de los cierres que se creen **después** del script? La
    tarjeta no pone trigger en `cierre_detail`. La propuesta es no ponerlo en SLT-43 (es el flujo de
    dinero y un trigger que falle tumba el cierre): esas filas quedan NULL, el script se puede
    relanzar y el escritor de cierres lo llena en la tarjeta que lea la columna (SLT-47). Alternativa:
    un trigger `BEFORE INSERT` en `cierre_detail` que nunca lance error. Decide el humano.
- **Unicidad del código oficial.** La tarjeta fija `(pais_id, codigo_oficial)`, sin el nivel. En la
  geografía vieja el código es único por país **y nivel** (SL-20 R16). En Costa Rica no choca (1, 3 y
  5 dígitos), pero en un país con código libre una provincia «1» y un cantón «1» conviven hoy, y con
  este único la sincronía rechazaría el alta del cantón: la pantalla y el CSV de SL-20 dejarían de
  funcionar igual. `design.md` sigue la tarjeta y la migración aborta si hoy ya hay un choque (R14).
  ¿Se mantiene `(pais_id, codigo_oficial)` o pasa a `(pais_id, tipo_id, codigo_oficial)`?
- **Tipo de `ruta`.** La tarjeta dice `ruta uuid[]`, pero todos los ids de la geografía son `TEXT`
  (`String @default(uuid())`). `design.md` propone `ruta text[]` para no convertir en cada consulta ni
  depender de que todo id sea un UUID válido. ¿Se acepta?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-29 | ¿Dónde se integra? | En la rama épica `epic/GEO-geografia-jerarquica`, que nace de `dev`; un PR por tarjeta hacia ella y uno final de la épica a `dev`. El gate de CI debe correr también en PRs a `epic/**` (`/afinar-regla`). |
| 2026-10-29 | ¿Se permite `ALTER TYPE`? | Solo `ADD VALUE IF NOT EXISTS`. Quitar o renombrar valores sigue prohibido hasta SLT-48. |
| 2026-10-29 | ¿Qué pasa con el historial viejo por provincia/cantón/distrito? | Convive: lo viejo no se reescribe y `nodo_geografico` es un valor más del enum, para lo que se escriba desde SLT-46. |
| 2026-10-29 | ¿Qué países llenan `tipo_nivel_geografico`? | Todos los que existan al migrar, no solo Costa Rica. |
| 2026-10-29 | ¿Tope del trigger de `orden`? | ≤ 1 ms por fila, medido en una carga masiva de prueba. Si se pasa, el PR no entra. |
| 2026-10-29 | ¿E2E? | No hay E2E nuevo: integración contra Postgres real para cada trigger y el E2E existente de órdenes como red. Se hereda de SL-20. |
| 2026-10-29 | Verificaciones previas | Los previews de Vercel no apuntan a producción, y Supabase de producción tiene backup activo (Camilo). |
| 2026-10-29 | Precedentes | Se heredan SL-20 (tabla `pais`, `historial_plataforma`, identificadores en español), la ficha 374 (retiro por `activo`, unicidad por padre) y SL-17 (geografía de plataforma, solo lectura para la empresa). La épica reabre «siempre 3 niveles» y «nombres internos» de SL-20, por decisión del humano del 2026-10-27. |
