# SLT-45 — geo-jerarquica-entrada · requirements.md

> **Zona** backend · **Complejidad** high · **depends_on** SLT-44 · **Rama** `feature/SLT-45-geo-jerarquica-entrada`
> (montada sobre SLT-71, PR #81).
>
> **Alcance.** La entrada de órdenes pasa por el nodo geográfico sin romper a los integradores. La API v1
> (`/api/ordenes/api-key/*`) no cambia: un adaptador traduce provincia/cantón/distrito a nodo. Nace la API v2
> en las rutas que llevan ubicación (crear orden, carga por lote, cotización, consulta por guía) más
> `GET /api/v2/geografia?pais=`. `resolveGeo` y la carga masiva pasan a N niveles; la plantilla de CR no
> cambia. Crear y corregir órdenes escribe `nodo_geografico_id` y las 3 FK viejas.
>
> **Lo que NO entra.** Guardar órdenes de países que no tengan forma de 3 niveles → SLT-48 (hoy
> `provincia_id`/`canton_id` son NOT NULL y las migraciones son solo aditivas). Guía de integración
> HTML/PDF con v2 → SLT-80. Pantalla del superadmin y escrituras de administración en el nodo → SLT-46.
> Filtros, exportes y presentación → SLT-47. Retirar v1 → sin ficha; se decide más adelante (decisión 5 de la épica).
>
> Sembrado por `/afinar-feature` el 2026-11-05. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-05. Vocabulario:
> - **«v1»**: las rutas de hoy bajo `/api/ordenes/api-key/*`. **«v2»**: las rutas nuevas bajo `/api/v2/*`.
> - **«Hoy»**: el comportamiento del commit base de esta rama (punta de SLT-71) antes de esta feature.
> - **«Ubicación»**: el nodo geográfico de una orden. **«Ruta de un nodo»**: sus ancestros y él, de la
>   raíz al nodo.
> - **«País de 3 niveles»**: país cuyo nodo más profundo está en profundidad 3 (Costa Rica lo es).
> - **«Regla de guardado»**: la ubicación es un nodo de profundidad 2 o 3 de un país de 3 niveles
>   (decisión del 2026-11-05).
> - **«Error de país no habilitado»**: el mensaje de fila de `design.md > §5`, que empieza por
>   `pais aun no habilitado`.
> - **«Zona que cubre»**: la de SLT-44 R6 (asignación más específica, colapso 1/0/>1).
> - **«Forma CR»**: un país de 3 niveles cuyos tipos de profundidad 1, 2 y 3 se llaman, normalizados,
>   `provincia`, `canton` y `distrito`.
>
> Las rutas, los cuerpos, los mensajes exactos y los tests están en `design.md`.

### La API v1 no cambia

- **R1** (ubicuo) Las operaciones de v1 DEBEN aceptar las mismas rutas, verbos, cabeceras, parámetros
  y cuerpos que hoy. En `lib/api/openapi-spec.ts` y en su espejo `.yaml`, los paths de v1 y los schemas
  que esos paths referencian DEBEN quedar idénticos a los de hoy.
- **R2** (de estado) MIENTRAS la empresa de la key es de Costa Rica, para cada payload de la suite de
  contrato (los sintéticos y los reales anonimizados), la carga y la cotización de v1 DEBEN devolver el
  mismo código HTTP y el mismo cuerpo, byte a byte, que hoy. Solo se exceptúan los valores de la lista
  cerrada de campos volátiles (`design.md > §7.3`), que se comparan por posición y no por valor.
- **R3** (ubicuo) v1 DEBE resolver `provincia`, `canton` y `distrito` como los nodos de profundidad 1, 2
  y 3 del país de la empresa, con las mismas claves de error, los mismos mensajes y la misma precedencia
  que hoy (provincia, luego cantón, luego distrito vacío, luego distrito, luego retirado, luego zona).
- **R4** (de estado) MIENTRAS conviven v1 y v2, el listado, la consulta, el borrado, la cancelación, la
  habilitación, la analítica y la generación de PDF de v1 DEBEN responder igual que hoy: sus tests de
  integración existentes pasan sin cambiar sus aserciones.
- **R5** (condicional) SI la empresa de la key es de un país que no es de 3 niveles, ENTONCES la carga y
  la cotización de v1 DEBEN rechazar cada fila con el error de país no habilitado, bajo la clave
  `ubicacion`, sin crear ninguna orden.

### Payloads reales para el contrato de v1

- **R6** (por evento) CUANDO una persona ejecuta el script de payloads sobre una base, el script DEBE
  leer, en transacciones de solo lectura, una muestra de órdenes de tamaño configurable y escribir un
  fixture con un payload de carga y otro de cotización de v1 por orden, con los nombres de su
  provincia, cantón y distrito tal como están en la base.
- **R7** (ubicuo) El fixture y la salida por consola del script NO DEBEN contener ningún destinatario,
  teléfono, dirección, nota, producto, número de remisión, nombre de zona ni id de empresa, de tienda o
  de orden de la base de origen: cada uno se sustituye por un valor sintético. Los importes, el peso y
  los nombres de la geografía se conservan.
- **R8** (condicional) SI el script se invoca sin `--copia <host>`, o con un host distinto del de la base
  conectada, ENTONCES DEBE negarse sin leer ninguna orden.
- **R9** (ubicuo) La suite de contrato de v1 DEBE correr en CI cada payload sintético y cada payload del
  fixture real contra respuestas grabadas con el código de hoy, y DEBE fallar si un payload no tiene
  su respuesta grabada.

### La API v2

- **R10** (ubicuo) v2 DEBE ofrecer exactamente cinco operaciones: crear una orden, carga por lote,
  cotización, consulta de una orden y catálogo geográfico (`GET /api/v2/geografia`). Ninguna otra
  operación de v1 (listado, borrado, cancelar, habilitar, analítica, PDF) DEBE existir bajo `/api/v2`.
- **R11** (ubicuo) Toda operación de v2 DEBE autenticarse con la misma API key que v1, con las mismas
  respuestas 401 y 403, y DEBE operar solo con la empresa de la key. Ningún id de empresa, tienda o
  dueño que venga en la petición DEBE leerse. La autorización del actor DEBE comprobarse en el service.
- **R12** (condicional) SI una orden de v2 (crear, lote o cotización) no trae exactamente uno de
  `ubicacion` (lista de nombres de la raíz hacia abajo) o `ubicacion_codigo` (código oficial de un
  nodo), ENTONCES esa orden DEBE salir con un error de fila bajo `ubicacion`, sin crearse ni cotizarse.
- **R13** (ubicuo) v2 DEBE resolver `ubicacion` nivel a nivel, buscando cada nombre normalizado entre los
  hijos del nodo anterior (el primero, entre las raíces del país de la empresa). Con un nombre vacío,
  no encontrado, ambiguo o retirado (activo en cascada, SLT-44 R5), la orden DEBE salir con un error de
  fila que diga el nivel y el nombre, y se detiene en el primer fallo.
- **R14** (ubicuo) v2 DEBE resolver `ubicacion_codigo` contra los códigos oficiales del país de la
  empresa. SI ningún nodo lo tiene, lo tiene más de un nodo, o el nodo está retirado, ENTONCES la orden
  DEBE salir con su error de fila.
- **R15** (condicional) SI la ubicación resuelta no cumple la regla de guardado, ENTONCES crear una
  orden, la carga por lote y la cotización de v2 DEBEN responder para esa orden el error de país no
  habilitado, sin crear nada.
- **R16** (condicional) SI ninguna zona de la empresa cubre la ubicación resuelta, ENTONCES la orden DEBE
  salir con un error de fila de «sin zona», sin crearse ni cotizarse.
- **R17** (ubicuo) La carga por lote de v2 DEBE responder con la misma forma que la de v1 (resumen,
  `filas`, `errores`, `ordenes`, `cargaId`, `etiquetasPdf`, `manifiesto`, `downloadType`) y con las mismas
  reglas de duplicados, tarifa, cupo del plan, nombre del lote y descarga. Cada orden creada DEBE llevar
  además `ubicacion` con la ruta de su nodo.
- **R18** (ubicuo) Crear una orden en v2 DEBE recibir una sola orden y responder lo mismo que la carga
  por lote de v2 con esa única orden.
- **R19** (ubicuo) La cotización de v2 DEBE responder con la misma forma y los mismos importes que la de
  v1 para la misma ubicación, tienda y monto. Cada fila cotizada DEBE llevar además `ubicacion` con la
  ruta de su nodo.
- **R20** (ubicuo) La consulta de una orden en v2 DEBE resolver el identificador y responder el detalle
  igual que v1, más `ubicacion` con la ruta del nodo de la orden. Una orden inexistente, borrada o de
  otra tienda DEBE dar el mismo 404 que v1.
- **R21** (ubicuo) Cada elemento de `ubicacion` en las respuestas de v2 DEBE traer la profundidad, el id
  del nodo, su nombre actual, su código oficial (o `null`) y su tipo (clave y nombre singular), en orden
  de la raíz al nodo.

### Catálogo geográfico de v2

- **R22** (por evento) CUANDO llega `GET /api/v2/geografia?pais=<id>` con el país de la empresa de la
  key, el sistema DEBE responder el país (id y nombre), sus tipos de nivel y todos sus nodos, cada uno con
  id, id del padre, profundidad, clave de su tipo, nombre, código oficial y activo en cascada. DEBE
  funcionar igual para países de 2, 3 y 4 niveles.
- **R23** (condicional) SI falta `pais` o no es un id con forma válida, ENTONCES el catálogo DEBE
  responder 422. SI `pais` no existe o no es el país de la empresa de la key, ENTONCES DEBE responder el
  mismo 404 en los dos casos.

### Aislamiento entre empresas

- **R24** (ubicuo) Con la key de una empresa, v2 NO DEBE leer, cubrir con zonas, crear, cotizar ni
  devolver datos de otra empresa: las zonas de otra empresa no cubren ningún nodo, y la consulta de una
  orden de otra empresa da 404.

### Escritura de la ubicación en la orden

- **R25** (por evento) CUANDO se crea una orden por v1, por v2 o por la carga masiva de sesión, el
  sistema DEBE guardar `nodo_geografico_id` con la ubicación resuelta y las tres FK viejas derivadas de
  su ruta: con un nodo de profundidad 3, provincia = su abuelo, cantón = su padre y distrito = el nodo;
  con uno de profundidad 2, provincia = su padre, cantón = el nodo y distrito vacío.
- **R26** (por evento) CUANDO la corrección de datos del cliente cambia la ubicación de una orden, el
  sistema DEBE guardar en la misma escritura el distrito nuevo en `nodo_geografico_id` y en las tres FK.
- **R27** (ubicuo) Tras crear o corregir una orden, su `nodo_geografico_id` DEBE ser igual a su
  distrito o, si no tiene, a su cantón.
- **R28** (ubicuo) El trigger `orden_nodo_geografico` de SLT-43 DEBE seguir sin cambios. SI esta feature
  añade una migración, ENTONCES DEBE ser solo aditiva y traer su `down.sql`.

### Carga masiva por sesión y su plantilla

- **R29** (de estado) MIENTRAS la empresa es de un país de forma CR, la plantilla de carga masiva DEBE
  tener las mismas columnas, en el mismo orden, con los mismos ejemplos y el mismo nombre de archivo que
  hoy, y `canton_distrito` DEBE seguir aceptando `Cantón (Distrito)` con los mismos mensajes de error.
- **R30** (de estado) MIENTRAS la empresa es de un país que no es de forma CR, la plantilla DEBE tener, en
  lugar de `provincia` y `canton_distrito`, una columna por profundidad (de 1 a la máxima del país),
  nombrada con el tipo de esa profundidad (`design.md > §8`).
- **R31** (por evento) CUANDO llega una fila de carga masiva de un país que no es de forma CR, el sistema
  DEBE tomar como ruta los valores de las columnas de geografía desde la profundidad 1 hasta la primera
  vacía, y DEBE aplicar R13, R15 y R16. SI hay un valor después de una columna vacía, ENTONCES la fila
  DEBE salir con error de esa columna.
- **R32** (de estado) MIENTRAS la empresa es de Costa Rica, la carga masiva por sesión DEBE comportarse
  como hoy: sus tests existentes de plantilla, ida y vuelta de errores y servicio pasan sin cambiar sus
  aserciones.

### Países de prueba de 2 y 4 niveles

- **R33** (de estado) MIENTRAS la empresa es de un país de prueba de 2 o de 4 niveles, el catálogo de v2
  DEBE devolver todos sus nodos; la resolución por nombres y por código DEBE encontrar nodos de
  cualquier profundidad; y crear, cargar por lote y cotizar DEBEN responder el error de país no
  habilitado sin crear ninguna orden. Los países de prueba solo existen en los datos de test.

### Documentación del canal

- **R34** (ubicuo) `lib/api/openapi-spec.ts` y su espejo `docs/api/api-key-openapi.yaml` DEBEN declarar
  las cinco operaciones de v2 con sus cuerpos, respuestas y errores. Toda ruta real bajo `app/api/v2`
  DEBE estar publicada y toda operación publicada de v2 DEBE existir como ruta real.
- **R35** (ubicuo) La colección `docs/api/servi-logistic-api-key.postman_collection.json` DEBE tener una
  petición por cada operación de v2, y `docs/api/CHANGELOG.md` DEBE tener una entrada fechada que
  presente v2 como aditiva y diga que v1 no cambia.

### Lo que no cambia

- **R36** (ubicuo) Esta feature NO DEBE añadir E2E. Los E2E existentes DEBEN pasar en el gate completo
  de CI.

**Qué requisito cubre cada decisión cerrada:**

| Decisión | Requisitos |
|---|---|
| País que no es de 3 niveles en v2 | R5, R15, R22, R33 |
| Rutas de v2 | R10, R17, R18, R19, R20, R21, R22 |
| Payloads reales para el contrato de v1 | R2, R6, R7, R8, R9 |
| Documentación de v2 | R34, R35 |
| E2E | R36 (y R2, R4, R32 como red) |
| Autenticación y empresa | R11, R24 |
| Migraciones | R28 |
| Alcance: v1 sin cambios, N niveles, plantilla CR, nodo + 3 FK | R1–R4, R13, R14, R25–R27, R29–R32 |

## Preguntas abiertas

Cada una lleva la propuesta del spec, que ya está escrita en los requisitos. El humano la confirma o
la cambia en la aprobación (F1.4).

1. **¿El catálogo de v2 sirve otros países?** La RLS de SLT-43 (R12) solo deja leer a una empresa los
   nodos de su país. Propuesta: `GET /api/v2/geografia?pais=` solo responde el país de la empresa de la
   key; otro país o uno inexistente dan el mismo 404 (R23). Si el humano quiere servir cualquier país,
   hace falta una lectura de plataforma fuera del contexto de la empresa y R23 cambia.
2. **¿`GeoRepository.leerDivisionDePais` es de SLT-45?** El design de SLT-44 (§7) mandó a SLT-45 «la
   carga CSV de división de SL-20». El alcance sembrado no la nombra y es una lectura que prepara una
   escritura de administración. Propuesta: va a SLT-46, con las escrituras en el nodo; SLT-45 no la toca.
3. **Respuesta de «crear una orden» en v2.** Propuesta: la misma forma que la carga por lote con una
   sola orden (R18), para no publicar una segunda semántica de errores. La alternativa (201/409/422 por
   orden) está descartada en `design.md > §11`.
4. **Cabeceras de la plantilla de un país que no es de forma CR.** Propuesta (R30, `design.md > §8`): una
   columna por profundidad con el nombre singular de su tipo normalizado (`departamento`, `municipio`…),
   y `nivel_<n>` si esa profundidad mezcla tipos o el nombre choca con otra columna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Qué hace v2 con un país que no es de 3 niveles? | v2 acepta la ruta genérica (`ubicacion[]` o `ubicacion_codigo`), pero solo guarda órdenes cuyo nodo cae en profundidad 2 o 3 de un país de 3 niveles; cualquier otro caso responde un error claro de «país aún no habilitado». `GET /api/v2/geografia` funciona para cualquier país. Los tests de 2 y 4 niveles cubren el catálogo y la validación, no la creación. Guardar N niveles queda para SLT-48. |
| 2026-11-05 | ¿Qué rutas tiene v2? | Las que llevan ubicación: crear orden, carga por lote, cotización y consulta por guía (que devuelve la ruta con el tipo de cada nodo), más `GET /api/v2/geografia`. Analítica, cancelar y habilitar quedan solo en v1. |
| 2026-11-05 | ¿De dónde salen los payloads reales para el contrato de v1? | De la copia de producción que la épica ya exige para ensayar (nunca de producción). Los anonimiza un script de esta ficha y quedan como fixture. |
| 2026-11-05 | ¿Dónde va la documentación de v2? | OpenAPI (`lib/api/openapi-spec.ts` y su `.yaml` espejo), colección Postman y `docs/api/CHANGELOG.md` en SLT-45. La guía HTML/PDF para integradores, en SLT-80. |
| 2026-11-05 | ¿Hace falta E2E nuevo? | No. Contrato de v1 congelado, integración de v2 contra Postgres real y carga masiva de CR con su plantilla. Los E2E existentes deben seguir verdes. Motivo: no hay pantalla nueva. |
| 2026-11-05 | Autenticación y empresa | Heredado: la misma API key de v1; la empresa sale de la key (SL-18). La autorización se valida en el service. |
| 2026-11-05 | Migraciones | Heredado de la épica: solo aditivas, cada una con `down.sql`. |
