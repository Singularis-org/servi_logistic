# SLT-47 — geo-jerarquica-presentacion · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** SLT-44, SLT-65, SLT-71 ·
> **Rama:** `feature/SLT-47-geo-jerarquica-presentacion` (nace sobre `feature/SLT-89-geo-jerarquica-zonas`)
>
> **Alcance:** el filtro de lugar pasa a `FiltroUbicacion`, de N niveles según el país de la
> empresa (2 a 10), en órdenes, novedades, recepción satélite, mis-asignaciones y analítica,
> incluidas sus consultas en el servidor. Las vistas guardadas (`VistaFiltro`) y los enlaces viejos
> (`?provincia_id=`, `?canton_id=`, `?distrito_id=` y los de novedades por nombre) siguen filtrando
> igual. En Costa Rica se ve igual que hoy.
>
> **Lo que NO entra:**
> - Descargas, etiqueta de guía, PDF de tránsito, tarjetas POS, chat, detalle de gestión, nombres
>   del listado de `/ordenes`, `ubicacion_snapshot` en los cierres y geocodificación → SLT-125
>   «Geografía jerárquica: presentación, exportes, cierres y geocodificación».
> - Retirar el modelo viejo (`NivelGeografico`, `PROFUNDIDAD_DEL_NIVEL`, columnas viejas) → SLT-48
>   «Geografía jerárquica: retirar modelo viejo».
>
> Sembrado por `/afinar-feature` el 2026-11-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-11, sobre `84230124` (pila geo: SLT-43, 44, 45, 46, 65, 71 y 89).
> Vocabulario:
> - **«Hoy»**: el comportamiento de la rama en `84230124`, antes de esta feature.
> - **«Catálogo»**: el de SLT-44 (nodos y tipos del país de la empresa), que carga
>   `CatalogoGeograficoRepository`. **«Nodos bajo X»**: los descendientes que calcula `nodosBajo`.
> - **«Lugar de una orden»**: `COALESCE(distrito_id, canton_id)` (`lugarDeLaOrden`, SLT-65).
> - **«Niveles del país»**: sus tipos `nivel_1`…`nivel_P` (SLT-46 P1), con P entre 2 y 10.
> - **«Lugar elegido»**: los ids elegidos en la lista más profunda que tiene elección.
> - **«Pantallas del alcance»**: `/ordenes`, recepción satélite, la barra de analítica (entregas),
>   `/novedades` y mis-asignaciones.
> - **«Enlace viejo»**: una URL con `provincia_id`, `canton_id` o `distrito_id` (órdenes, satélite y
>   analítica), o con `provincia` o `canton` por nombre (novedades).
> - **«Cadena coherente»**: el distrito de la orden cuelga de su cantón y el cantón de su provincia.
>
> Cada fila dice el test que la prueba y la decisión que cubre. El detalle de archivos y tests está
> en `design.md > §12`.

### Forma del filtro

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R1 | MIENTRAS la empresa es de un país con P niveles, el filtro de lugar de `/ordenes`, recepción satélite, analítica y `/novedades` DEBE ofrecer P listas, una por nivel y en orden de 1 a P, cada una rotulada con el nombre singular del tipo de su nivel. Ningún rótulo DEBE salir de un literal ni de `pais.nivel_N_*`. | `tests/unit/utils/filtro-ubicacion.test.ts` (2, 3, 4 y 10 niveles) | Listas encadenadas |
| R2 | MIENTRAS el país tiene 2 niveles, el filtro NO DEBE mostrar una tercera lista, ni una que repita el rótulo del nivel 2. | `filtro-ubicacion.test.ts` (país de 2 niveles) | País de 2 niveles |
| R3 | CUANDO se eligen lugares en la lista del nivel k, la lista del nivel k+1 DEBE ofrecer solo los hijos de esos lugares. CUANDO cambia la elección del nivel k, las elecciones de los niveles más profundos que dejan de colgar de ella DEBEN descartarse antes de filtrar. Mientras el nivel k no tiene elección, el k+1 DEBE ofrecer lo mismo que hoy (P4). | `tests/components/FiltroUbicacionBarra.test.tsx` | Listas encadenadas |
| R4 | El filtro DEBE poder pararse en cualquier nivel: filtra por el lugar elegido, sin exigir elección en los niveles más profundos. | `filtro-ubicacion.test.ts` (`lugarElegido`) | Listas encadenadas |
| R5 | MIENTRAS las listas del filtro no caben en una línea, DEBEN pasar a la línea siguiente sin desbordar en horizontal, también en el ancho de un teléfono. | `FiltroUbicacionBarra.test.tsx` (contenedor que envuelve) y la maqueta de T0 | Listas encadenadas |
| R6 | MIENTRAS la empresa es de Costa Rica, `/ordenes`, recepción satélite y analítica DEBEN mostrar los mismos controles de lugar que hoy: mismos rótulos, mismo orden en la barra, mismos textos de búsqueda, mismas opciones y el mismo encadenado. | `filtro-ubicacion.test.ts` (las declaraciones de CR comparadas con las de hoy, campo a campo, salvo `key`) | Listas encadenadas («CR se ve igual») |
| R7 | MIENTRAS un mensajero ve sus asignaciones, el filtro de lugar DEBE conservar la forma de hoy (P2): una primera lista del nivel 2 cuyas opciones se rotulan «lugar (lugar de nivel 1)», y una lista por cada nivel de 3 a P. Las opciones DEBEN salir solo de las órdenes cargadas. En Costa Rica DEBE verse igual que hoy (cantón y distrito). | `tests/components/mis-asignaciones/FiltroUbicacion.test.tsx` | Listas encadenadas |
| R8 | `/novedades` DEBE ofrecer una lista por cada nivel del país, con opciones sacadas solo del conjunto cargado y con valor por id. En Costa Rica gana la lista del nivel 3, que hoy no tiene. | `tests/unit/novedades/novedades-filtros-lugar.test.ts` | Novedades por identificador |

### Cómo viaja el filtro y qué devuelve

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R9 | Cada pantalla del alcance DEBE expresar el filtro de lugar como un solo parámetro, `lugar_id`, con los ids del lugar elegido. NINGUNA DEBE filtrar por nombre de lugar ni mandar `provincia_id`, `canton_id` o `distrito_id` al servidor. | `filtro-ubicacion.test.ts` (`seleccionALugar`); `tests/unit/ordenes/seleccion-a-filter-lugar.test.ts`; `novedades-filtros-lugar.test.ts`; `mis-asignaciones/FiltroUbicacion.test.tsx` | Cómo viaja |
| R10 | Las entradas de servidor del listado de órdenes, del listado de recepción satélite (página, conjunto y vigencia) y de analítica DEBEN aceptar `lugar_id` como lista no vacía de ids, y DEBEN responder `validation_error` a `provincia_id`, `canton_id` y `distrito_id`. La clave de caché de analítica DEBE ser la misma para los mismos ids en otro orden y distinta para ids distintos. | `tests/unit/types/filtro-lugar-schemas.test.ts` | Cómo viaja |
| R11 | CUANDO el servidor recibe `lugar_id`, DEBE devolver solo las órdenes cuyo lugar es uno de esos ids que esté en el catálogo del país de la empresa, o un nodo bajo ellos. Los ids DEBEN calcularse con el catálogo en memoria y viajar a la consulta como un único parámetro de tipo lista. | `tests/integration/db/geo-filtros-lugar.test.ts`; `tests/unit/repositories/lugares-del-filtro.test.ts` | Cómo viaja |
| R12 | SI ninguno de los ids de `lugar_id` está en el catálogo, ENTONCES la consulta DEBE devolver cero órdenes, y nunca tratarlo como «sin filtro». | `geo-filtros-lugar.test.ts`; `lugares-del-filtro.test.ts` | Cómo viaja |
| R13 | SI se elige un lugar, ENTONCES NO DEBE salir ninguna orden de otro lugar con el mismo nombre, en ninguna pantalla del alcance. Vale para dos distritos «San Rafael» y para un municipio y un departamento con el mismo nombre. | `geo-filtros-lugar.test.ts`; `mis-asignaciones/FiltroUbicacion.test.tsx` (dos cantones «Central»); `novedades-filtros-lugar.test.ts` | Cómo viaja |
| R14 | El filtro de lugar DEBE sumarse en AND a las demás condiciones de cada pantalla. El alcance de hoy DEBE seguir igual: la empresa, la zona y la bodega del adminSatelite, la tienda del adminTienda y el mensajero del rol mensajero. | `geo-filtros-lugar.test.ts` (adminSatelite con un lugar de otra zona → 0) y las suites de alcance existentes sin cambiar aserciones | Cómo viaja; Heredadas (permisos) |
| R15 | Ninguna lectura de esta feature DEBE calcular ancestros o descendientes con una consulta recursiva en la base ni con una columna de ruta, ni leer `orden.nodo_geografico_id`: el resultado DEBE ser el mismo haya corrido o no el backfill de SLT-43. | `geografia-sin-cte-recursiva.guardia.test.ts` y `geografia-lecturas-sin-nodo-fk.guardia.test.ts`, ampliadas a los archivos nuevos; `geo-filtros-lugar.test.ts` con `nodo_geografico_id` en NULL | Cómo viaja (heredada de SLT-44 y SLT-65) |
| R16 | Las asignaciones del mensajero y las novedades DEBEN traer la ruta de su lugar: los ids y nombres del nivel 1 al lugar de la orden, calculados con el catálogo y `lugarDeLaOrden`, sin ningún dato personal nuevo. | `tests/unit/services/ruta-del-lugar.test.ts`; `geo-filtros-lugar.test.ts` | Cómo viaja; Novedades por identificador |

### Enlaces y URL

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R17 | CUANDO una pantalla del alcance que lee la URL se abre con `?lugar_id=<ids>`, DEBE rearmar las listas subiendo desde cada lugar hasta el nivel 1 y filtrar por esos lugares. Un id que no está entre las opciones de la pantalla DEBE descartarse sin error. | `filtro-ubicacion.test.ts` (`traducirUrl`); `FiltroUbicacionBarra.test.tsx` | Cómo viaja |
| R18 | CUANDO `/ordenes`, recepción satélite o analítica se abren con un enlace viejo, con valores separados por coma o con el parámetro repetido, DEBEN mostrar los mismos controles, las mismas elecciones y las mismas órdenes que hoy. Un valor no ofrecido, o incoherente con la elección del nivel de arriba, DEBE descartarse como hoy. | `filtro-ubicacion.test.ts`; `FiltroUbicacionBarra.test.tsx`; `e2e/geo-filtro-lugar.spec.ts` | Alcance (enlaces viejos); ¿E2E nuevo? |
| R19 | CUANDO `/novedades` se abre con `?provincia=<nombre>` o `?canton=<nombre>`, cada provincia DEBE traducirse a los lugares de nivel 1 del conjunto con ese nombre exacto, y cada cantón a los de nivel 2 con ese nombre exacto, solo entre los hijos de las provincias traducidas si hay alguna. Un nombre sin coincidencia DEBE descartarse. Con eso DEBEN salir las mismas novedades que hoy. | `novedades-filtros-lugar.test.ts` | Novedades por identificador |
| R20 | CUANDO se pulsa «Limpiar todo», DEBEN salir de la URL `lugar_id` y los parámetros de los enlaces viejos, además de los de hoy, y los parámetros ajenos DEBEN quedarse. | `FiltroUbicacionBarra.test.tsx` | Cómo viaja |
| R21 | La URL DEBE seguir leyéndose solo al entrar, como hoy. Un parámetro con la clave interna de una lista de nivel DEBE ignorarse. | `filtro-ubicacion.test.ts` | Cómo viaja |

### Vistas guardadas

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R22 | CUANDO se guarda o se actualiza una vista, DEBE guardarse en la versión 2 del formato: `v: 2` en el documento y `version = 2` en la fila. | `tests/unit/types/vista-filtro-v2.test.ts`; `vista-filtro-service.test.ts` existente, con la versión esperada en 2 | Vistas guardadas |
| R23 | CUANDO se lee una vista de la versión 1, `leerPayloadGuardado` DEBE traducirla a la versión 2 sin escribir en la base: cada clave de lugar vieja pasa a la de su nivel, en la selección y en los controles montados, y el resto queda igual. Aplicada, DEBE dar los mismos controles, las mismas elecciones y las mismas órdenes que hoy. | `vista-filtro-v2.test.ts`; `e2e/geo-filtro-lugar.spec.ts` | Vistas guardadas |
| R24 | SI una vista declara una versión que no es 1 ni 2, o no cumple su esquema, ENTONCES DEBE seguir saliendo ilegible, como hoy. | `vista-filtro-v2.test.ts` | Vistas guardadas |
| R25 | La persistencia de vistas NO DEBE importar `serializar-filtro`, y la guardia `vista-filtro-formato-propio` DEBE seguir en verde. | `tests/unit/guards/vista-filtro-formato-propio.guardia.test.ts` sin cambios | Vistas guardadas |
| R26 | ANTES de pedir el merge, una persona DEBE aplicar vistas reales de la versión 1 sobre la copia de producción y anotar en `progress/impl_SLT-47.md` cuántas probó, cuántas salieron legibles y si dieron las mismas órdenes. Ningún agente DEBE tocar producción. | Anotación en `progress/impl_SLT-47.md`, que comprueba el reviewer | Vistas guardadas |

### Equivalencia y rendimiento

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R27 | MIENTRAS la cadena de cada orden sea coherente, el listado y la descarga de `/ordenes`, la página, el conjunto y la vigencia de recepción satélite, y cada lectura de analítica, con un lugar de cualquier nivel, DEBEN devolver las mismas órdenes y las mismas cifras que hoy con el filtro por la columna de su nivel. | `geo-filtros-lugar.test.ts` (frente a la copia de hoy); `tests/integration/db/geo-equivalencia-filtros.test.ts` | Alcance («en CR se ve igual»); Cómo viaja |
| R28 | CUANDO una persona corre el script de equivalencia de esta feature sobre una base, DEBE comparar por empresa, entre hoy y lo nuevo: cada provincia, una muestra configurable de cantones y distritos, una combinación de dos niveles de un enlace viejo y un id inexistente, en `/ordenes`, recepción satélite y analítica. DEBE imprimir las cifras por bloque y contar aparte las órdenes con cadena incoherente, con sus ids (P1). DEBE salir con 0 si todo coincide y con 1 si algo difiere. | `geo-equivalencia-filtros.test.ts` | Heredadas |
| R29 | CUANDO una persona corre el script de rendimiento, DEBE medir antes y después el listado de `/ordenes` y la página de recepción satélite, cada uno con la provincia de más órdenes, un cantón y un distrito. En cada medida DEBE correr `EXPLAIN ANALYZE` 5 veces, tomar la mediana y marcar regresión si la mediana sube más de un 20 % o aparece un Seq Scan sobre `orden` que antes no estaba. DEBE salir con 1 si hay regresión, con 2 si una lectura falla y con 0 en otro caso. | `tests/integration/db/geo-explain-filtros.test.ts` (`hayRegresion` con +19 %, +21 % y Seq Scan nuevo) | Heredadas (`EXPLAIN`) |
| R30 | Los dos scripts NO DEBEN escribir en ninguna tabla: DEBEN leer en transacciones de solo lectura y solo contra una base local. NO DEBEN imprimir SQL, parámetros, nombres de lugar ni datos de destinatarios: solo cifras e ids. | `geo-equivalencia-filtros.test.ts` (un `INSERT` falla con `25006`; la salida no contiene datos del fixture) | Heredadas |
| R31 | SI hace falta un índice para quitar una regresión de R29, ENTONCES DEBE ir en una migración que solo contenga `CREATE INDEX`, con su `down.sql` y un timestamp que no choque con `dev` ni con las ramas en vuelo. Esta feature NO DEBE añadir ninguna otra migración. | Diff de `db/` revisado por el reviewer; si hay migración, `tests/unit/db/slt47-migraciones-aditivas.test.ts` | Heredadas (migraciones) |
| R32 | Con un catálogo sintético de 10 niveles y el tamaño de P3: resolver en el servidor el nodo raíz a sus ids, declarar la barra y traducir una URL con un `lugar_id` del nivel 10 DEBEN tardar cada uno menos que el umbral de P3, en la mediana de 5 corridas. La consulta DEBE llevar todos los ids en un solo parámetro. | `tests/unit/utils/filtro-ubicacion-rendimiento.test.ts` | Alcance (2 a 10 niveles) |

### Reglas heredadas y lo que no cambia

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R33 | Las pantallas del alcance NO DEBEN implementarse hasta que exista una maqueta del filtro de N niveles aprobada por el humano, con su fecha y su referencia en `progress/impl_SLT-47.md`. Lo implementado DEBE seguir esa maqueta. | Anotación en `progress/impl_SLT-47.md`, que comprueba el reviewer | Heredadas (maqueta) |
| R34 | Esta feature NO DEBE añadir escrituras de datos de negocio: la traducción de vistas es al leer. SI apareciera una escritura nueva, ENTONCES DEBE pasar por el modal antes → después. | Diff revisado por el reviewer | Heredadas (modal) |
| R35 | Ningún repositorio que use el catálogo DEBE crearse a nivel de módulo en `lib/` ni en `app/`. | `catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` sin cambios, que ya calcula las clases vigiladas | Heredadas |
| R36 | Cada pantalla DEBE conservar sus permisos de hoy: quién entra, qué catálogo recibe cada rol y qué órdenes ve. El adminSatelite DEBE recibir solo los lugares de su zona a cualquier profundidad, sin los que tienen asignación propia de otra zona (encargo de SLT-44, ya resuelto por SLT-89 R6). | Suites existentes de `FiltrosOrdenesService`, satélite, novedades y mis-asignaciones sin cambiar aserciones; `geo-filtros-lugar.test.ts` (zona de 4 niveles) | Heredadas (permisos) |
| R37 | MIENTRAS una lectura de esta feature carga el catálogo, DEBE ser el del país de la empresa del contexto. SI corre en contexto de plataforma, ENTONCES DEBE fallar con `EmpresaNoResuelta`. Un id de otro país NO DEBE aportar órdenes. | `geo-filtros-lugar.test.ts` (empresas de CR y de `XA`) | Heredadas |
| R38 | Las suites existentes de las pantallas del alcance DEBEN pasar sin cambiar aserciones. Solo pueden cambiar las que fijan el nombre de la clave geográfica de transporte o el texto SQL de la faceta, y solo en esas líneas. Los E2E existentes (`mis-asignaciones`, `recepcion-satelite`, `asignacion-satelite` y `dos-empresas-humo`) DEBEN seguir en verde. | Gate completo de CI; el reviewer revisa el diff de `tests/` | ¿E2E nuevo? |
| R39 | DEBE existir un E2E que, en una empresa de Costa Rica, filtre `/ordenes` por un cantón, abra un enlace viejo con `?canton_id=` y aplique una vista guardada de la versión 1 con ese cantón, y compruebe que las tres veces salen las mismas órdenes. | `e2e/geo-filtro-lugar.spec.ts` | ¿E2E nuevo? |
| R40 | Esta feature NO DEBE cambiar lo que es de otras fichas: los nombres de lugar en pantallas, descargas, etiqueta, PDF, tarjetas, chat y detalle de gestión, `ubicacion_snapshot` y geocodificación (SLT-125); `NivelGeografico`, `PROFUNDIDAD_DEL_NIVEL` y las columnas viejas (SLT-48). | Diff revisado por el reviewer | ¿Partir la ficha? |

**Qué requisito cubre cada decisión cerrada:**

| Decisión | Requisitos |
|---|---|
| ¿Cómo se ve el filtro con 2, 3, 4 o más niveles? | R1, R3, R4, R5, R6, R7 |
| ¿Cómo viaja el filtro? | R9–R17, R20, R21, R27 |
| ¿Partir la ficha? | R40 |
| Novedades filtra por nombre | R8, R13, R16, R19 |
| ¿E2E nuevo? | R18, R38, R39 |
| País de 2 niveles | R2 |
| Vistas guardadas | R22–R26 |
| Heredadas | R14, R28–R31, R33–R37 |

## Preguntas abiertas

Ninguna. P1–P6 las cerró el humano el 2026-11-11 (filas de abajo).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-11 | ¿Cómo se ve el filtro de lugar con 2, 3, 4 o más niveles? | Listas encadenadas: una por nivel del país, rotulada con el nombre de su tipo. Cada lista se llena con los hijos del lugar elegido en la anterior, y se puede parar en cualquier nivel. Con muchos niveles, las listas pasan a la línea siguiente. CR se ve igual que hoy. |
| 2026-11-11 | ¿Cómo viaja el filtro? | Por identificador del nodo, nunca por nombre. Un solo parámetro lleva el último lugar elegido; al recargar, las listas se rearman subiendo hasta el nivel 1. Dos lugares con el mismo nombre (un municipio y un departamento, o dos distritos «San Rafael») no se confunden. El servidor filtra ese nodo y sus descendientes con el catálogo en memoria, sin CTE (heredada de SLT-44 y SLT-65). |
| 2026-11-11 | ¿Partir la ficha? | En 2. SLT-47 se queda con los filtros, las vistas guardadas y los enlaces viejos. SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación» se lleva lo demás y depende de esta. |
| 2026-11-11 | Novedades hoy filtra por nombre, solo provincia y cantón | Se iguala al resto: por identificador y con todos los niveles del país. Los enlaces viejos por nombre se traducen buscando cada nombre dentro de su padre (el cantón «Escazú» solo entre los cantones de la provincia elegida). |
| 2026-11-11 | ¿E2E nuevo? | Sí. Filtra órdenes por un cantón de CR, abre un enlace viejo con `?canton_id=` y una vista guardada, y comprueba que salen las mismas órdenes. Los E2E existentes siguen en verde. |
| 2026-11-11 | País de 2 niveles | Se oculta el filtro del nivel que hoy repite al nivel 2 (encargo de SLT-46 «Geografía jerárquica: administración de países», P10). |
| 2026-11-11 | Vistas guardadas | Pasan a la versión 2 del formato; las de la versión 1 se traducen al leerlas, en `leerPayloadGuardado`. Una persona las prueba con vistas reales sobre la copia de producción; ningún agente toca producción. |
| 2026-11-11 | Heredadas | Las pantallas esperan una maqueta aprobada por el humano (SLT-46 P9, SLT-89 P2). Toda escritura nueva pasa por el modal antes → después (SLT-46, SLT-89). Migraciones solo aditivas y con `down.sql` hasta SLT-48. El `EXPLAIN` no puede empeorar más de un 20 % ni añadir un Seq Scan nuevo sobre `orden` (SLT-65). Ningún repositorio con catálogo se instancia a nivel de módulo (SLT-65). Cada pantalla conserva sus permisos de hoy. |
| 2026-11-11 | P1. Órdenes con cadena incoherente | Heredada de SLT-65 y SLT-71: el script de equivalencia las cuenta aparte y no bloquean si son la única diferencia (R28). |
| 2026-11-11 | P2. Mis-asignaciones con N niveles | Como hoy, generalizado: primera lista del nivel 2 con su nivel 1 entre paréntesis, luego una lista por cada nivel de 3 a P. CR igual que hoy (R7). |
| 2026-11-11 | P3. Umbrales con 10 niveles | Catálogo sintético de 10 niveles y 20.000 nodos; 200 ms por operación (mediana de 5) (R32). |
| 2026-11-11 | P4. Lista sin elección arriba | Como hoy: ofrece todo su nivel y se busca escribiendo en ella; no se bloquea. La maqueta lo muestra con 10 niveles (R3). |
| 2026-11-11 | P5. Una o varias elecciones por lista | Varias, como hoy. `lugar_id` lleva los ids de la lista más profunda con elección (R6). |
| 2026-11-11 | P6. Tamaño del PR (81 archivos, ~4.100 líneas) | Un solo PR, aceptando el tamaño. |
| 2026-11-11 | R36. Catálogo con `niveles` y `lugares` cambia aserciones exactas | Autorizado por el humano (R38): `filtros-ordenes-service.test.ts` y `geo-lecturas-catalogo.test.ts` suman solo los dos campos nuevos a lo esperado; el resto de lo que comparan no cambia. Se mide y anota el tamaño del catálogo de CR. |
| 2026-11-11 | R16. `findNovedadesByTienda` lee `cantonId` y `distritoId` | Autorizado por el humano (R38): `orden-repository.novedades.test.ts` suma solo esas dos columnas al `select` esperado. |
| 2026-11-11 | R22–R24. Vistas v2 cambian aserciones con `v: 1` | Autorizado por el humano (R38): en los tests de vistas solo cambian el número de versión esperado y las claves de lugar viejas traducidas a `lugar_id`; nada más. Cada test tocado se anota en `progress/impl_SLT-47.md`. |
| 2026-11-11 | R22–R24. Ejemplo de «versión desconocida» | Autorizado por el humano (R38): en `vista-filtro-payload.test.ts` (líneas 124 y 148) y `vista-filtro-service.test.ts` (línea 235) el ejemplo de versión desconocida pasa de `v: 2` a `v: 3`; lo que prueban no cambia. |
| 2026-11-11 | R8. Novedades de CR gana «Distrito» | Autorizado por el humano (R38): `NovedadesBuscador.test.tsx` (360–366) suma solo «Distrito» entre «Cantón» y «Causa de devolución». Los rótulos salen de los niveles del país. || 2026-11-11 | R1. Respaldo de rótulos sin niveles en `/ordenes` | Quitarlo ya: los rótulos salen siempre de los niveles del país. Se ajustan datos de prueba (`niveles` o proveedor), no aserciones; si alguna aserción pide cambio, se para y se pregunta. || 2026-11-11 | Homónimos en las listas | Autorizado por el humano (R38): como la maqueta, la opción muestra sus ancestros («San Rafael · Escazú, San José»); `ordenes-filtros-def.test.ts:165` cambia solo el texto esperado de la opción. |
| 2026-11-12 | Casos de SLT-71 que cambian de semántica | Ratificado por el humano (R38, review M1): `lugares-del-filtro.test.ts` reemplaza «id de otro nivel no aporta», «nivel 4 pedido como distrito no casa» y «varias facetas» por los casos de R11 y R12; se borra `filtro-canton-distrito.test.ts` y sus casos pasan a comparar por id. El filtro va por lugar, no por lista ni por nombre. |
| 2026-11-12 | Tamaño real del PR | Un solo PR, aceptando 141 archivos y +8.065/−1.355 líneas (antes se estimaron 81 y ~4.100). |
