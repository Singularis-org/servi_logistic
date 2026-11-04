# SLT-71 — geo-jerarquica-transito-analitica · requirements.md

> Zona: backend · Complejidad: high · depends_on: SLT-44 · Rama: feature/SLT-71-geo-jerarquica-transito-analitica
>
> **Alcance.** Pasar a `nodo_geografico` el SQL crudo que filtra o nombra por provincia, cantón o
> distrito en tránsito (`InformeTransitoRepository`: los nombres de cantón y distrito de cada fila
> se leen del catálogo), los 4 conteos de analítica (entregas, cargadas por día, devoluciones, por
> estado) y ciclo de vida (`CicloVidaRepository`). Un filtro por lugar pasa a `nodo_id = ANY($ids)`
> con los ids que calcula el dominio de SLT-44; la entrada sigue siendo `provincia_id`, `canton_id`
> y `distrito_id`. Costa Rica funciona igual y los conteos no se mueven.
>
> **Lo que NO entra.** Gestión de orden (`GestionOrdenRepository`: solo muestra nombres) → SLT-47.
> Filtros de pantalla y presentación → SLT-47. Órdenes, cierres, zonas y dinero → SLT-65. API
> v1/v2 → SLT-45. Retirar el modelo viejo → SLT-48.
>
> Sembrado por `/afinar-feature` el 2026-11-04. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-04. Vocabulario:
> - **«Hoy»**: el comportamiento de la rama en `fe16f5d1` (base montada sobre SLT-65, PR #75), antes
>   de esta feature.
> - **«Catálogo»**: el de SLT-44 (nodos y tipos del país de la empresa), que carga
>   `CatalogoGeograficoRepository.deLaEmpresa()`.
> - **«Lugar de una orden»**: el nodo `COALESCE(distrito_id, canton_id)` de la orden (decisión «¿Lugar
>   de una orden?»).
> - **«Nodos bajo X»**: los descendientes de X que calcula el dominio de SLT-44 (`nodosBajo`).
> - **«Faceta geográfica»**: `provincia_id`, `canton_id` o `distrito_id` del filtro de analítica.
>   **«Nivel de la faceta»**: la profundidad que nombra (provincia 1, cantón 2, distrito 3).
> - **«Lecturas de analítica»**: el desglose por estado, el conteo de entregas (el anillo, que pliega
>   el desglose), las cargadas por día, las devoluciones por causa y el ciclo de vida.
> - **«Lecturas que comparten el recorte»**: las que reutilizan hoy el `where` de una lectura de
>   analítica: productos, dinero por producto, cohorte de carga y contador de hoy. Entran (decisión
>   «¿Lecturas que comparten el recorte?»).
> - **«Cadena coherente»**: el distrito de la orden cuelga de su cantón y el cantón de su provincia.
>
> El inventario de SQL, los archivos y los tests concretos están en `design.md`.

### Filtro por lugar en analítica

- **R1** (por evento) CUANDO una lectura de analítica recibe una faceta geográfica, el sistema DEBE
  contar solo las órdenes cuyo lugar es uno de los ids válidos de esa faceta o uno de los nodos bajo
  ellos. La lista de ids DEBE llegar ya calculada por el dominio de SLT-44, en un único parámetro de
  la consulta por faceta (`= ANY($ids)`).
- **R2** (ubicuo) Con varias facetas geográficas a la vez, una orden DEBE cumplirlas todas, como hoy.
  Las demás condiciones (alcance, borrado, zona, tienda, mensajero y ventana) NO DEBEN cambiar, y el
  alcance DEBE seguir siendo la primera condición.
- **R3** (condicional) SI un id de una faceta geográfica no está en el catálogo, o su profundidad no
  es el nivel de la faceta, ENTONCES ese id NO DEBE aportar órdenes. SI ningún id de la faceta es
  válido, ENTONCES la lectura DEBE contar cero órdenes por esa faceta, como hoy, y nunca tratarla
  como «sin filtro».
- **R4** (de estado) MIENTRAS la cadena de cada orden sea coherente, cada lectura de analítica DEBE
  devolver, con cualquier combinación de facetas, alcance y ventana, el mismo resultado que hoy.
- **R5** (condicional) SI una lectura de analítica no trae ninguna faceta geográfica, ENTONCES NO
  DEBE cargar el catálogo, y su SQL y sus parámetros DEBEN ser los de hoy.
- **R6** (ubicuo) La entrada de analítica NO DEBE cambiar: el filtro sigue aceptando `provincia_id`,
  `canton_id` y `distrito_id` con la misma validación, y las respuestas `validation_error`,
  `forbidden` y `unauthenticated` y la clave de caché DEBEN ser las de hoy.
- **R7** (ubicuo) Las lecturas que comparten el recorte DEBEN aplicar las facetas geográficas con el
  mismo constructor de condiciones que la lectura de la que lo toman, con los ids ya resueltos. NO
  DEBE existir una segunda escritura del filtro por lugar, ni un modo que siga filtrando por columna.

### Nombres de lugar en tránsito

- **R8** (ubicuo) Cada fila del informe de tránsito DEBE llevar como cantón el nombre del nodo
  `canton_id` de la orden en el catálogo, y como distrito el del nodo `distrito_id`. Si la orden no
  tiene distrito, el distrito DEBE ser `null`.
- **R9** (de estado) MIENTRAS los nombres del catálogo coincidan con los de las tablas viejas, las
  filas en alerta, los totales, las variables del mensaje y el PDF de una generación DEBEN ser los de
  hoy, y su vista previa DEBE dar las mismas cifras.
- **R10** (ubicuo) La consulta de filas en alerta NO DEBE unir con `canton` ni con `distrito`. La
  selección DEBE seguir haciendo 3 llamadas al repositorio por generación, y el número de consultas
  NO DEBE depender del número de órdenes (R40 de la ficha 475).
- **R11** (condicional) SI no hay ninguna fila en alerta, ENTONCES la generación NO DEBE cargar el
  catálogo.
- **R12** (condicional) SI el cantón o el distrito de una fila en alerta no está en el catálogo,
  ENTONCES:
  - la generación DEBE fallar como un fallo de lectura de `filasEnAlerta`, sin mandar nada;
  - el sistema DEBE escribir en el log del servidor, con el logger de errores existente, una línea
    con el prefijo `analitica - informe transito - error: ` seguido del detalle;
  - el detalle DEBE nombrar los ids de los nodos ausentes y los ids de las órdenes afectadas, y NO
    DEBE contener nombres de lugar, destinatarios, direcciones ni teléfonos (misma regla que R18).

### Contexto de empresa

- **R13** (de estado) MIENTRAS una lectura de esta feature carga el catálogo, DEBE ser el del país de
  la empresa del contexto (job de envíos, sesión o caché de analítica), una sola carga por instancia
  de repositorio. SI corre en contexto de plataforma, ENTONCES DEBE fallar con `EmpresaNoResuelta`
  sin devolver filas.

### Reglas heredadas de SLT-43, SLT-44 y SLT-65

- **R14** (ubicuo) Ninguna lectura de esta feature DEBE leer `orden.nodo_geografico_id`. El resultado
  DEBE ser el mismo haya corrido o no el script de datos de SLT-43.
- **R15** (ubicuo) Ninguna lectura de esta feature DEBE calcular ancestros o descendientes con una
  consulta recursiva en la base, ni con una columna `ruta`.
- **R16** (ubicuo) Ningún repositorio de esta feature que use el catálogo DEBE crearse a nivel de
  módulo en `lib/` ni en `app/`.

### Equivalencia

- **R17** (por evento) CUANDO una persona ejecuta el script de equivalencia de esta feature sobre una
  base, el script DEBE comparar, por empresa, el resultado de hoy y el nuevo de:
  - cada lectura de analítica sin facetas, con cada provincia, con una muestra de cantones y de
    distritos de tamaño configurable, con una combinación de dos facetas y con un id de nivel
    equivocado;
  - las filas en alerta del informe de tránsito, por orden, con los parámetros por defecto.

  DEBE imprimir las cifras de cada bloque, el número de órdenes con cadena incoherente y sus ids, y
  terminar con un código distinto de 0 si algo difiere. Las órdenes con cadena incoherente se cuentan
  aparte: si son la única diferencia, el script DEBE terminar en 0.
- **R18** (ubicuo) Los scripts de esta feature NO DEBEN escribir en ninguna tabla: toda su lectura
  DEBE correr en transacciones de solo lectura y solo contra una base local. NO DEBEN imprimir SQL,
  parámetros, destinatarios, direcciones, teléfonos ni nombres de lugar: solo cifras e ids de
  empresa, nodo, zona y orden.

### Rendimiento

- **R19** (por evento) CUANDO una persona ejecuta el script de rendimiento sobre una base, el script
  DEBE medir antes y después estas lecturas: filas en alerta de tránsito, conteo de entregas,
  desglose por estado, cargadas por día, devoluciones por causa y ciclo de vida. Las de analítica se
  miden con la faceta de la provincia con más órdenes. Para cada una DEBE:
  - correr `EXPLAIN ANALYZE` de todas sus consultas, catálogo incluido, 5 veces;
  - sumar los `Execution Time` de cada corrida y tomar la mediana;
  - imprimir las dos medianas, el porcentaje y los Seq Scan sobre `orden` de cada lado.
- **R20** (ubicuo) El script DEBE marcar regresión:
  - en tránsito y en las cuatro lecturas de conteo, si la mediana de después supera en más de 20 % a
    la de antes;
  - en todas, ciclo de vida incluido, si aparece un Seq Scan sobre `orden` que antes no estaba.

  En ciclo de vida, el porcentaje DEBE imprimirse y NO DEBE marcar regresión.
- **R21** (condicional) SI una lectura supera el 20 % solo por las consultas del catálogo (la suma
  sin ellas no supera el 20 % y no hay Seq Scan nuevo sobre `orden`), ENTONCES el script DEBE
  marcarla como «costo fijo del catálogo», imprimir las dos sumas sin catálogo y no contarla como
  regresión.
- **R22** (por evento) CUANDO el script termina, DEBE salir con 1 si alguna lectura tiene regresión,
  con 2 si alguna lectura falló al leer, y con 0 en otro caso.
- **R23** (condicional) SI hace falta un índice para quitar una regresión de R20, ENTONCES DEBE ir en
  una migración que solo contenga `CREATE INDEX`, con su `down.sql` y un timestamp que no choque con
  ninguna migración de `dev` ni de las ramas en vuelo. Esta feature NO DEBE añadir ninguna otra
  migración.

### Lo que no cambia

- **R24** (de estado) MIENTRAS conviven los dos modelos, la analítica y el informe de tránsito DEBEN
  comportarse igual para Costa Rica:
  - las interfaces de los repositorios, los DTO y `FilaTransito` no cambian;
  - las suites de integración existentes de analítica y de tránsito pasan sin cambiar aserciones;
  - los E2E existentes pasan en el gate completo de CI.

  Solo pueden cambiar las aserciones unitarias que fijan el texto SQL de las facetas geográficas
  (`o."provincia_id" IN (`, etc.), y solo en esas líneas.
- **R25** (ubicuo) Esta feature NO DEBE cambiar lo que es de otras tarjetas:
  - `GestionOrdenRepository` y los filtros de pantalla, la barra de analítica y la presentación del
    PDF de tránsito (SLT-47);
  - los filtros por lugar de `OrdenRepository` (`condicionesSatelite` y `list`) (SLT-47);
  - órdenes, cierres, zonas y dinero (SLT-65); la API (SLT-45).

**Qué requisito cubre cada decisión cerrada:**

| Decisión | Requisitos |
|---|---|
| ¿Qué lecturas bloquean por +20 %? | R19, R20 |
| ¿Costo fijo del catálogo? | R21 |
| ¿Gestión de orden? | R25 |
| ¿Nombres de lugar en tránsito? | R8, R9, R10 |
| ¿Qué es regresión en el `EXPLAIN ANALYZE`? | R19, R20, R23 |
| ¿E2E nuevo? | R24 |
| ¿Guardia de caché del catálogo? | R16 |
| ¿Órdenes con cadena incoherente? | R17 |
| ¿Dónde se miden la equivalencia y los tiempos? | R17, R18, R19 |
| ¿Lugar de una orden? | R1, R14 |
| ¿Árbol? | R1, R15 |
| ¿Migraciones? | R23 |
| ¿Lecturas que comparten el recorte? | R7 |
| ¿Tránsito con un nodo ausente del catálogo? | R12 |
| ¿Choque de archivos con SLT-64? | R4, R17, R19 (la copia de «antes» se toma de `dev` con SLT-64 dentro) |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-04 | ¿Qué lecturas bloquean por +20 %? | Tránsito y los 4 conteos de analítica. Ciclo de vida se mide y se informa, no bloquea. El Seq Scan nuevo sobre `orden` bloquea en todas (humano). |
| 2026-11-04 | ¿Costo fijo del catálogo (~4-5 ms por ordenar nombres)? | Se acepta, como en SLT-65 T8.3, si las consultas sobre `orden` no empeoran: se anota en el PR y no bloquea (humano). |
| 2026-11-04 | ¿Gestión de orden? | Fuera: solo muestra nombres; va a SLT-47 (humano). |
| 2026-11-04 | ¿Nombres de lugar en tránsito? | Se leen del catálogo nuevo en SLT-71. Excepción explícita al precedente de SLT-65, que dejaba los nombres del listado de `/ordenes` en las tablas viejas (humano). |
| 2026-10-31 | ¿Qué es regresión en el `EXPLAIN ANALYZE`? | +20 % (mediana de 5 corridas, suma de `Execution Time` con el catálogo incluido) o un Seq Scan nuevo sobre `orden`. Se corrige con un índice aditivo antes del merge. Heredado de SLT-65. |
| 2026-10-31 | ¿E2E nuevo? | No: bastan el script de equivalencia y los E2E existentes (no cambia ningún flujo visible). Heredado de SLT-65. |
| 2026-10-31 | ¿Guardia de caché del catálogo? | Se mantiene: ningún repositorio que use el catálogo se instancia a nivel de módulo. Heredado de SLT-65. |
| 2026-10-31 | ¿Órdenes con cadena incoherente? | El script las cuenta aparte y las nombra por id; si son la única diferencia, no bloquean el merge. Heredado de SLT-65. |
| 2026-10-30 | ¿Dónde se miden la equivalencia y los tiempos? | Script que corre una persona sobre la copia de producción, antes del merge. Ningún agente toca producción ni su copia. Heredado de SLT-44/SLT-65. |
| 2026-10-30 | ¿Lugar de una orden? | Se lee de las FK viejas (`COALESCE(distrito_id, canton_id)`); el deploy no depende del backfill de SLT-43. Heredado de la tarjeta y de SLT-43. |
| 2026-10-30 | ¿Árbol? | Sin `ruta` ni CTE recursiva. Heredado de SLT-43 y SLT-44. |
| — | ¿Migraciones? | Solo aditivas (regla de la épica, SLT-43). |
| 2026-11-04 | ¿Lecturas que comparten el recorte? | Entran: `ConteoProductosRepository`, `DineroProductosRepository`, `CohorteCargaRepository` y `ConteoHoyGestionRepository` pasan los ids resueltos. Un solo constructor de condiciones, sin modo doble (humano). |
| 2026-11-04 | ¿Tránsito con un cantón o distrito ausente del catálogo? | La generación falla y no manda nada. Además se escribe una línea de log de servidor con el prefijo `analitica - informe transito - error: {detalle}`, con el logger de errores existente. El detalle nombra los ids de los nodos ausentes y de las órdenes, nunca nombres, direcciones ni teléfonos (humano). |
| 2026-11-04 | ¿Choque de archivos con SLT-64? | Aceptado. SLT-64 mergea primero y SLT-71 lo integra en F2.3. La copia congelada de «antes» para los scripts de equivalencia y de `EXPLAIN` se toma de `dev` con SLT-64 ya dentro (humano). |
