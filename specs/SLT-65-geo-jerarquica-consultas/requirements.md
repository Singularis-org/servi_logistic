# SLT-65 — geo-jerarquica-consultas · requirements.md

> Zona: backend · Complejidad: high · depends_on: SLT-44 · Rama: feature/SLT-65-geo-jerarquica-consultas
>
> **Alcance.** Pasar a `nodo_geografico` el SQL crudo que une con provincia, cantón o distrito en
> órdenes (`OrdenRepository`: listado de API, `findParaCorreccion`, `findBaseCobroDevolucion`, la
> marca de zona especial), cierres (`CierreDiaRepository`), cierres-admin, zonas
> (`ZonaRepository.update`: re-derivación de la zona de las órdenes),
> `GeografiaService.contarOrdenesSinEntregar` y `lib/db/extension-empresa.ts`. Un filtro por
> ancestro pasa a `nodo_id = ANY($ids)` con los ids que calcula el dominio de SLT-44. Costa Rica
> funciona igual y los totales de dinero no se mueven.
>
> **Lo que NO entra.** Tránsito, los 4 conteos de analítica, ciclo de vida y gestión de orden →
> SLT-71. API v1/v2 y carga masiva → SLT-45. Escrituras de administración en el nodo → SLT-46.
> Filtros y presentación → SLT-47. Retirar el modelo viejo → SLT-48.
>
> Sembrado por `/afinar-feature` el 2026-10-31. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-10-31. Vocabulario:
> - **«Hoy»**: el comportamiento de la rama en `b2bade4` (`dev` con SLT-43 y SLT-44 mergeadas), antes
>   de esta feature.
> - **«Catálogo» y «asignaciones de la empresa»**: los de SLT-44 (nodos y tipos del país; zonas y
>   marcas de la empresa).
> - **«Lugar de una orden»**: el nodo `COALESCE(distrito_id, canton_id)` de la orden (decisión
>   «Lugar de una orden»).
> - **«Nodos bajo X»**: los descendientes de X que calcula el dominio de SLT-44.
> - **«Marca de una orden»**: la marca de zona especial de su lugar según R7 de SLT-44 (el lugar o
>   uno de sus ancestros tiene la marca de la empresa).
> - **«Cadena coherente»**: el distrito de la orden cuelga de su cantón y el cantón de su provincia.
>
> El inventario de consultas, los archivos y los tests concretos están en `design.md`.

### Marca de zona especial de una orden

- **R1** (ubicuo) La marca de una orden DEBE salir del catálogo y de las asignaciones de la empresa,
  según R7 de SLT-44, aplicada a su lugar. Vale para todas las lecturas de órdenes de esta feature:
  - el listado y el detalle de la API por API key;
  - el listado de `/ordenes` y las pantallas que comparten su lectura (detalle del tablero y
    recepción satélite);
  - la base del cobro de una devolución;
  - la orden que se va a corregir;
  - la marca que se congela al crear un cierre (R5).
- **R2** (de estado) MIENTRAS todas las marcas de la empresa son a distritos, la marca de cada orden
  DEBE ser la de hoy: la de su distrito, y «sin marca» para una orden sin distrito.
- **R3** (ubicuo) Las lecturas de R1 NO DEBEN cambiar su contrato: mismos campos y mismos valores en
  sus filas, y los mismos importes que salen de ellas (costeo de la API, costos del listado, cobro de
  la devolución).
- **R4** (condicional) SI una lectura de R1 corre sin contexto de empresa o en contexto de
  plataforma, ENTONCES DEBE fallar con `EmpresaNoResuelta` y no devolver filas.

### Cierres

- **R5** (por evento) CUANDO se crea un cierre, cada fila de detalle DEBE congelar, leídos del
  catálogo y de las asignaciones de la empresa dentro de la misma transacción:
  - los nombres de provincia, cantón y distrito de los nodos de la orden (distrito vacío si la orden
    no tiene distrito);
  - la marca de la orden (R1).

  Los valores DEBEN ser los mismos que hoy MIENTRAS las marcas sean solo a distritos.
- **R6** (condicional) SI la provincia, el cantón o el distrito de una orden del cierre no está en el
  catálogo del país de la empresa, ENTONCES la creación del cierre DEBE fallar entera, sin escribir
  ninguna fila, como hoy falla con una fila de geografía ausente.
- **R7** (ubicuo) Dentro de la transacción del cierre, las lecturas de R5 DEBEN ir de una en una:
  nunca DEBE haber más de una consulta en vuelo sobre la conexión de la transacción.
- **R8** (ubicuo) Las lecturas de cierres ya creados (pantallas y descargas de cierres-admin, cierre
  del día, wallet) NO DEBEN leer la geografía viva: siguen leyendo lo congelado en el detalle, y sus
  totales NO DEBEN cambiar.

### Órdenes sin entregar bajo un nodo

- **R9** (ubicuo) El conteo de órdenes sin entregar de un nodo DEBE contar las órdenes vivas, en un
  estado no terminal, cuyo lugar es el nodo o uno de los nodos bajo él. Los nodos bajo él DEBEN
  llegar a la consulta como lista de ids ya calculada por el dominio.
- **R10** (condicional) SI el nodo no existe, o su profundidad no corresponde al nivel pedido
  (provincia 1, cantón 2, distrito 3), ENTONCES el conteo DEBE ser 0, como hoy.
- **R11** (de estado) MIENTRAS la cadena de cada orden sea coherente, el conteo DEBE dar lo mismo
  que hoy para cada provincia, cantón y distrito.
- **R12** (de estado) MIENTRAS el conteo corre en contexto de plataforma (superadmin), DEBE usar el
  catálogo del país del nodo y contar las órdenes de todas las empresas, como hoy.

### Zona de las órdenes al guardar una zona

- **R13** (por evento) CUANDO se guarda una zona, el sistema DEBE re-evaluar las órdenes cuyo lugar
  es uno de estos nodos:
  - un nodo cuya asignación a la zona existía antes del guardado o existe después;
  - un nodo bajo uno de ellos.

  Para cada orden, la zona correcta DEBE ser la que cubre su lugar según R6 de SLT-44, con las
  asignaciones ya guardadas.
- **R14** (ubicuo) El guardado DEBE conservar todo lo que hoy decide qué se mueve y qué queda:
  - solo cambia `zona_id`;
  - las mismas órdenes quedan fuera: borradas, ya en un cierre o con una gestión final;
  - las que tienen el paquete en el estante de una bodega satélite no se mueven y se cuentan como
    retenidas;
  - un lugar con cero o con más de una zona no mueve ninguna orden;
  - una fila de historial por orden movida, un solo lote por guardado, y la misma respuesta.
- **R15** (de estado) MIENTRAS las asignaciones de la empresa son solo a distritos, un guardado
  DEBE mover las mismas órdenes, a las mismas zonas, y retener las mismas que hoy. Una orden sin
  distrito NO DEBE moverse.
- **R16** (ubicuo) Las escrituras del guardado NO DEBEN cambiar: las asignaciones se siguen
  escribiendo por `distrito_id` en `zona_distrito`, con la misma validación de los distritos que hoy.

### Contexto de empresa y `extension-empresa`

- **R17** (de estado) MIENTRAS una lectura de esta feature corre dentro de una transacción de
  empresa (crear un cierre, guardar una zona), el catálogo DEBE ser el del país de esa empresa, las
  asignaciones solo las suyas, y DEBE verse lo que la propia transacción ya escribió.
- **R18** (ubicuo) El aislamiento por empresa NO DEBE cambiar: la geografía (tablas viejas,
  `nodo_geografico` y `tipo_nivel_geografico`) sigue siendo de plataforma, de solo lectura para la
  empresa y acotada por país.

### Reglas heredadas de SLT-43 y SLT-44

- **R19** (ubicuo) Ninguna lectura de esta feature DEBE leer `nodo_geografico_id` de `orden`,
  `zona_distrito` ni `distrito_zona_especial`. El resultado DEBE ser el mismo haya corrido o no el
  script de datos de SLT-43.
- **R20** (ubicuo) Ninguna lectura de esta feature DEBE calcular ancestros o descendientes con una
  consulta recursiva en la base.
- **R21** (ubicuo) Ningún repositorio que use el catálogo geográfico DEBE crearse a nivel de módulo
  en `lib/` ni en `app/`: ni como constante, ni como propiedad estática, ni dentro de otro objeto
  creado a nivel de módulo.

### Equivalencia

- **R22** (de estado) MIENTRAS las asignaciones y las marcas son solo a distritos, para cada empresa
  de los datos de prueba DEBEN coincidir, antes y después de esta feature:
  - en los cierres: por orden, los nombres y la marca que se congelarían, y por empresa, el total del
    ingreso que sale de ellos;
  - el cobro de cada devolución de una muestra de órdenes;
  - la lectura de cada orden para su corrección;
  - la marca de cada orden en los listados;
  - por zona, las órdenes que movería un guardado, su zona de destino y las retenidas;
  - el conteo de órdenes sin entregar de cada nodo.
- **R23** (por evento) CUANDO una persona ejecuta el script de equivalencia de esta feature sobre
  una base, el script DEBE comparar lo de R22 por empresa, con una muestra de órdenes reales de
  tamaño configurable. DEBE imprimir las cifras de cada comparación y el número de órdenes con cadena
  incoherente, y terminar con un código distinto de 0 si algo difiere.
- **R24** (ubicuo) Los scripts de esta feature (equivalencia y rendimiento) NO DEBEN escribir en
  ninguna tabla: toda su lectura DEBE correr en transacciones de solo lectura. NO DEBEN imprimir
  nombres de destinatarios, direcciones ni teléfonos: solo cifras, ids de empresa, zona, nodo y orden,
  y los importes que difieran.

### Rendimiento

- **R25** (por evento) CUANDO una persona ejecuta el script de rendimiento sobre una base, el script
  DEBE medir antes y después cada lectura de la tabla de `design.md` §10. Para cada una DEBE:
  - correr `EXPLAIN ANALYZE` de todas sus consultas 5 veces y tomar la mediana;
  - marcar regresión si la mediana después supera en más de 20 % a la de antes, o si aparece un Seq
    Scan sobre `orden` que antes no estaba;
  - imprimir las dos medianas y los Seq Scan, y terminar con un código distinto de 0 si hay regresión.
- **R26** (condicional) SI hace falta un índice para quitar una regresión de R25, ENTONCES DEBE ir
  en una migración que solo contenga `CREATE INDEX`, con su `down.sql`, con un timestamp que no
  choque con ninguna migración de `dev` ni de las ramas en vuelo. Esta feature NO DEBE añadir ninguna
  otra migración.

### Lo que no cambia

- **R27** (de estado) MIENTRAS conviven los dos modelos, las órdenes, los cierres, cierres-admin, las
  zonas y la pantalla de geografía del superadmin DEBEN comportarse igual para Costa Rica:
  - sus tests de integración existentes pasan sin cambiar sus aserciones;
  - los E2E existentes de dinero y de reparto pasan en el gate completo de CI.
- **R28** (ubicuo) Esta feature NO DEBE cambiar lo que es de otras tarjetas:
  - los filtros por provincia, cantón y distrito de `/ordenes` y de recepción satélite, los nombres
    de lugar que muestran los listados y la etiqueta, y `cierre_detail.ubicacion_snapshot` (SLT-47);
  - tránsito, analítica, ciclo de vida y gestión de orden (SLT-71);
  - las escrituras de geografía, zonas y marcas (SLT-46).

**Qué requisito cubre cada decisión cerrada:**

| Decisión | Requisitos |
|---|---|
| ¿Un PR o se parte? (dos tarjetas) | R28 |
| ¿Qué es regresión en el `EXPLAIN ANALYZE`? | R25, R26 |
| ¿Guardia de caché del catálogo? | R21 |
| ¿E2E nuevo? | R27 |
| ¿Dónde se miden los totales de cierres? | R22, R23 |
| Lugar de una orden | R1, R9, R13, R19 |
| Árbol sin `ruta` ni CTE | R9, R20 |
| Migraciones solo aditivas | R26 |

## Preguntas abiertas

1. **¿Sobre qué se mide el 20 %?** La decisión dice «una consulta caliente tarda más de 20 %». Con
   esta feature, una lectura no se vuelve más lenta en una sola consulta: deja de leer una relación
   y suma la carga del catálogo, que son cinco consultas pequeñas en una transacción.
   **Propuesta (`design.md` §10):**
   - el umbral se aplica a la suma de los `Execution Time` de todas las consultas de la lectura,
     antes y después, mediana de 5;
   - el tiempo de pared del método se imprime y se pega en el PR, pero no bloquea;
   - el 20 % bloquea en las lecturas calientes (listado de `/ordenes`, listado de la API y cierre);
   - el Seq Scan nuevo sobre `orden` bloquea en las cinco lecturas medidas.
2. **Nombres de lugar del listado de `/ordenes`.** Esa lectura ya cargará el catálogo para la
   marca. Sus nombres de provincia, cantón y distrito podrían salir de él y ahorrar tres consultas.
   La propuesta es dejarlos en las tablas viejas, porque la presentación es de SLT-47 (R28). Pasarlos
   al catálogo sería la primera mitigación si R25 marca regresión en el listado, antes que un índice.
   ¿De acuerdo?
3. **Cadena incoherente en el conteo del superadmin.** Si una orden tiene un distrito que no cuelga
   de su cantón, el conteo nuevo la cuenta bajo su lugar y el de hoy bajo sus columnas. No es dinero,
   pero el script lo verá como diferencia (R11, R23).
   **Propuesta:** el script cuenta esas órdenes aparte y las nombra por id. Si son la única causa de
   diferencia en el conteo, no bloquean el merge y se dejan anotadas en el PR. ¿De acuerdo, o bloquea?
4. **`lib/db/extension-empresa.ts` no tiene ninguna lectura geográfica.** Solo trata la geografía
   como modelo de plataforma, y su comentario de cabecera cita `distrito.zonas`. Esta feature no
   cambia su código: R17 y R18 fijan su comportamiento con tests. ¿Se esperaba algo más de ese
   archivo?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-31 | ¿Un PR o se parte? | Dos tarjetas: SLT-65 lleva lo que toca dinero o permisos (órdenes, cierres, cierres-admin, zonas, extension-empresa); tránsito, analítica, ciclo de vida y gestión de orden van a SLT-71. SLT-46, SLT-47 y SLT-48 dependen también de SLT-71 (Camilo). |
| 2026-10-31 | ¿Qué es regresión en el `EXPLAIN ANALYZE`? | Bloquea el merge si una consulta caliente tarda más de 20 % (mediana de 5 corridas) o aparece un Seq Scan sobre `orden` que antes no estaba. Se corrige con un índice (migración aditiva) antes de mergear (Camilo). |
| 2026-10-31 | ¿Guardia de caché del catálogo? | Entra: ningún repositorio que use el catálogo geográfico se instancia a nivel de módulo (m5 del review de SLT-44) (Camilo). |
| 2026-10-31 | ¿E2E nuevo? | No. Basta el script de equivalencia más los E2E `dinero` y `reparto` que ya corren en CI: ningún flujo visible cambia (Camilo). |
| 2026-10-30 | ¿Dónde se miden los totales de cierres? | En el script de equivalencia de SLT-65; lo corre una persona sobre la copia de producción antes del merge. Heredado de SLT-44. |
| 2026-10-30 | Lugar de una orden | Se lee de las FK viejas (`COALESCE(distrito_id, canton_id)`, mismo id que el nodo); el deploy no depende del backfill de SLT-43. Heredado de la tarjeta y de SLT-43. |
| 2026-10-30 | Árbol | Sin `ruta` y sin CTE recursiva; la guardia de SLT-44 (R13) sigue valiendo. Heredado de SLT-43 y SLT-44. |
| — | Migraciones | Solo aditivas (regla de la épica, SLT-43). Ningún agente toca producción ni su copia. |
