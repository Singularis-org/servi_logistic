# SLT-46 — geo-jerarquica-admin · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: SLT-44, SLT-65, SLT-71 · Rama: feature/SLT-46-geo-jerarquica-admin (sobre SLT-45)
>
> **Alcance.** La geografía del superadmin pasa a N niveles y escribe en `nodo_geografico`:
> árbol con crear, renombrar, retirar y reactivar nodos de cualquier profundidad; alta de país
> con su catálogo de tipos; edición del nombre singular y plural de cada tipo, con historial y copia a
> `pais.nivel_N_*` (niveles 1–3) mientras existan; CSV de carga con una columna por tipo y
> profundidad (el CSV de CR de SL-20 se acepta igual); CSV de división leído del nodo
> (`leerDivisionDePais`, heredado de SLT-45). Los triggers de sincronía se invierten: el nodo
> copia a `provincia/canton/distrito` los nodos de profundidad 1–3.
>
> **Lo que NO entra.**
> - Zonas de la empresa (asignar cualquier nodo a zona y zona especial, `GeografiaSelector`,
>   herencia con aviso de impacto, grupos de distritos de tarifas, trigger de `orden` a
>   cualquier nodo) → SLT-89, bloqueada por SLT-46.
> - Mover nodos → SLT-48 (sin FK viejas, mover corrige solas las órdenes viejas).
> - Filtros, exportes y presentación → SLT-47.
>
> Sembrado por `/afinar-feature` el 2026-11-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` (F1.2, 2026-11-06). «Superadmin» es todo rol de `ROLES_PLATAFORMA`
> (`lib/auth/plataforma.ts`). «Nodo» es una fila de `nodo_geografico`; «geografía vieja» son las
> tablas `provincia`, `canton` y `distrito`. «Tipo» es una fila de `tipo_nivel_geografico`; el tipo
> de clave `nivel_<k>` es «el tipo de la profundidad k». «P» es el número de tipos de un país. La
> columna «Decisión» dice qué fila de `## Decisiones cerradas` cubre; «Alcance» es el bloque de arriba.
> Las preguntas P1–P9 las respondió el humano el 2026-11-06 (filas «P<n>» de `## Decisiones
> cerradas`); P2 y P3 cambiaron la propuesta y de ahí salen R46–R50.
> Revisión F1.2 del 2026-11-09 (`spec_author`): la maqueta T0.2 aprobada y las decisiones del humano
> de ese día (filas fechadas 2026-11-09 de `## Decisiones cerradas`) dan R53–R62. «Reordenar» es
> reasignar los nombres de cada profundidad; ningún tipo ni nodo cambia de profundidad.
> 2026-11-09 (implementer, decisión del humano «1»): el alta de país acepta `disponible`: R63.

### Fuente de las escrituras y sincronía invertida

| R | Requisito | Decisión |
|---|---|---|
| R1 | Las altas, renombres, retiros, reactivaciones y cargas CSV de geografía del superadmin DEBEN escribirse en `nodo_geografico`, y ningún archivo de `lib/`, `app/` ni `components/` DEBE escribir directamente en `provincia`, `canton` ni `distrito`. | Alcance |
| R2 | CUANDO se crea un nodo de profundidad 1, 2 o 3, o cambia su nombre, su código oficial o su estado `activo`, el sistema DEBE dejar en la misma transacción la fila de `provincia`, `canton` o `distrito` (según la profundidad) con el mismo id, el mismo nombre, el mismo código, el mismo estado y como padre el padre del nodo. | Alcance |
| R3 | SI un nodo tiene profundidad 4 o más, ENTONCES el sistema NO DEBE crear ni cambiar ninguna fila de `provincia`, `canton` ni `distrito` al escribirlo. | Alcance |
| R4 | CUANDO se escribe un nodo de profundidad 1–3 o, por SQL, una fila de la geografía vieja, el sistema DEBE terminar la sentencia sin bucle, con una sola fila por id a cada lado y sin cambiar el nodo ni la fila que originaron la escritura. | Alcance; Migraciones |
| R5 | SI la copia a la geografía vieja falla (un único, una FK), ENTONCES el sistema NO DEBE dejar escrito ni el nodo, ni la fila vieja, ni la fila de historial, y la acción DEBE responder `conflict` si fue un único y `error` en otro caso. | Alcance |
| R6 | SI una escritura cambia la profundidad de un nodo que tiene o tendría profundidad 1–3, ENTONCES la base DEBE rechazarla sin escribir nada. | ¿Mover nodos? |
| R7 | SI se borra físicamente un nodo de profundidad 1–3 (solo SQL a mano o limpieza de tests), ENTONCES el sistema DEBE borrar en la misma sentencia su fila de la geografía vieja. | Retirar nodo |

### Migraciones

| R | Requisito | Decisión |
|---|---|---|
| R8 | Las migraciones de SLT-46 DEBEN ser solo aditivas: sin `DROP`, `TRUNCATE`, `RENAME` ni `ALTER COLUMN`; sin `INSERT`, `UPDATE` ni `DELETE` que la migración ejecute sobre una tabla existente (sí dentro del cuerpo de una función de trigger); `ALTER TYPE` solo como `ADD VALUE IF NOT EXISTS`; `CREATE OR REPLACE FUNCTION` solo sobre la función de trigger `pais_tipos_de_nivel`; y cada una DEBE traer su `down.sql`. | Migraciones; P2 |
| R9 | CUANDO se aplican los `down.sql` de SLT-46 en orden inverso, el esquema y los datos que existían antes de SLT-46 DEBEN volver a los de SLT-45 (salvo los valores de enum añadidos), `pais_tipos_de_nivel` DEBE volver a su cuerpo de SLT-43, la sincronía vieja → nodo de SLT-43 DEBE seguir funcionando, y volver a aplicar las migraciones DEBE dejar lo mismo que la primera vez. | Migraciones |
| R10 | Las migraciones de SLT-46 NO DEBEN alterar, indexar ni escribir la tabla `orden`. | Migraciones; Alcance (épica: sin bloqueos largos sobre `orden`) |

### Equivalencia para Costa Rica

| R | Requisito | Decisión |
|---|---|---|
| R11 | DESPUÉS DE cualquier secuencia de altas, renombres, retiros, reactivaciones y cargas CSV hechas desde la pantalla, el sistema DEBE dejar, para cada país, los nodos de profundidad 1–3 y las filas de `provincia`/`canton`/`distrito` iguales en id, nombre, código, `activo` y padre. | Alcance |
| R12 | CUANDO el superadmin hace en Costa Rica una alta, un renombre, un retiro, una reactivación o una carga CSV con una entrada dada, el sistema DEBE responder el mismo desenlace (status, campos de error y mensajes) que en SLT-45 con esa entrada, y DEBE dejar las mismas filas en la geografía vieja (salvo los ids de las altas). | Alcance |
| R13 | El script de datos de la épica DEBE ofrecer un modo de solo lectura que compare fila a fila la geografía vieja con los nodos de profundidad 1–3 de cada país y termine con código distinto de 0 si alguna fila difiere o falta. | Alcance (mitigación: equivalencia); P8 |

### Tipos y nodos de cualquier profundidad

| R | Requisito | Decisión |
|---|---|---|
| R14 | CUANDO el superadmin da de alta un nodo, el sistema DEBE darle el tipo de su profundidad (el tipo `nivel_<profundidad>` de su país), sin ofrecer elegirlo. | Alcance; P1 |
| R15 | SI el país no tiene tipo para la profundidad del nodo que se da de alta, ENTONCES el sistema DEBE responder `validation_error` sin escribir nada. | Alcance |
| R16 | CUANDO el superadmin da de alta un nodo como raíz de un país o como hijo de cualquier nodo, con código opcional, el sistema DEBE crearlo activo (también bajo un padre retirado); SI el nombre normalizado ya lo usa un hermano (o, en una raíz, otra raíz del país) o el código ya lo usa otro nodo del mismo tipo y país, ENTONCES DEBE responder `conflict`; SI el padre o el país no existen, ENTONCES DEBE responder `not_found`; en ningún rechazo DEBE escribir nada. | Alcance; Retirar nodo |
| R17 | DONDE el tipo del nodo fija dígitos de código, el sistema DEBE exigir ese número de dígitos y, si el tipo hereda prefijo, que el código empiece por el de su padre; DONDE el tipo no fija dígitos, DEBE aceptar como código cualquier texto de 1 a 20 caracteres sin espacios. Para Costa Rica el resultado DEBE ser el mismo que con la regla de SL-20 (R17 de SL-20). | Alcance |
| R18 | CUANDO el superadmin renombra un nodo de cualquier profundidad, el sistema DEBE guardar el nombre nuevo; pedir el nombre que ya tiene DEBE ser éxito sin escribir; SI otro hermano usa ya ese nombre normalizado, ENTONCES DEBE responder `conflict`; SI el nodo no existe, ENTONCES DEBE responder `not_found`. | Alcance |
| R19 | CUANDO el superadmin retira o reactiva un nodo de cualquier profundidad, el sistema DEBE cambiar solo el `activo` de ese nodo (baja lógica, sin borrar la fila ni tocar a sus descendientes); pedir el estado que ya tiene DEBE ser éxito sin escribir. | Retirar nodo |
| R20 | CUANDO el superadmin pide confirmar el retiro de un nodo, el sistema DEBE mostrar cuántas órdenes sin entregar, de todas las empresas, cuelgan de ese nodo; para un nodo de profundidad 4 o más DEBE mostrar 0. | Alcance; Retirar nodo |
| R21 | MIENTRAS el superadmin trabaja un país, la pantalla DEBE mostrar su árbol completo a cualquier profundidad, con el nombre, el código, el estado y el nombre singular del tipo de cada nodo, y DEBE ofrecer «agregar hijo» solo en los nodos para cuya profundidad siguiente el país tiene tipo. | Alcance |
| R22 | El sistema NO DEBE ofrecer mover un nodo a otro padre: ninguna action ni control de la pantalla lo hace, y los esquemas de renombre y de cambio de estado DEBEN rechazar un campo de padre. | ¿Mover nodos? |

### Alta de país con su catálogo de tipos

| R | Requisito | Decisión |
|---|---|---|
| R23 | CUANDO el superadmin da de alta un país del catálogo ISO con una lista ordenada de entre 2 y 10 tipos (nombre singular y plural de cada uno), el sistema DEBE crear el país y exactamente esos tipos, con las claves `nivel_1`…`nivel_P` en ese orden, con los de clave `nivel_1`–`nivel_3` que existan también en `pais.nivel_N_{singular,plural}`, en una sola transacción. | Alcance; P2 |
| R24 | SI el alta de país trae menos de 2 o más de 10 tipos, o un nombre de tipo fuera de 2–40 caracteres, ENTONCES el sistema DEBE responder `validation_error` sin crear nada; los demás rechazos del alta (código fuera del catálogo, país o nombre repetidos) DEBEN responder igual que en SL-20. | Alcance; P2 |

### Edición de los nombres de un tipo

| R | Requisito | Decisión |
|---|---|---|
| R25 | CUANDO el superadmin cambia el nombre singular o el plural de un tipo de un país ya creado, el sistema DEBE guardarlo en el tipo y, DONDE la clave del tipo es `nivel_1`, `nivel_2` o `nivel_3`, DEBE copiarlo a la columna `pais.nivel_N_singular`/`_plural` correspondiente en la misma transacción. | ¿El nombre de tipo corregido se copia a `pais.nivel_N_*`? |
| R26 | SI la edición de un tipo pide los nombres que ya tiene, ENTONCES el sistema DEBE responder éxito sin escribir; SI el tipo no existe, ENTONCES DEBE responder `not_found`; SI un nombre no cumple 2–40 caracteres, ENTONCES DEBE responder `validation_error`; en ningún rechazo DEBE escribir nada. | Alcance |
| R27 | CUANDO se cambió el nombre de un tipo `nivel_1`–`nivel_3`, las pantallas de las empresas de ese país DEBEN mostrar el nombre nuevo de ese nivel en su siguiente carga. | ¿El nombre de tipo corregido se copia a `pais.nivel_N_*`? |

### Países de 2 niveles y agregar un nivel

| R | Requisito | Decisión |
|---|---|---|
| R46 | MIENTRAS un país tiene 2 tipos, el sistema NO DEBE tener para él ningún tipo de clave `nivel_3`: ni tras el alta, ni tras editar sus tipos 1 y 2, ni tras cualquier otra escritura de su fila `pais`. | P2 |
| R47 | CUANDO se escribe la fila `pais` de un país que tiene tipo `nivel_3` (Costa Rica y todo país creado antes de SLT-46), el sistema DEBE dejar sus tipos `nivel_1`–`nivel_3` exactamente como los dejaba SLT-43 con esa misma escritura. | P2; Migraciones |
| R48 | CUANDO el superadmin agrega un nivel a un país de P tipos, con P menor que 10, con nombre singular y plural, el sistema DEBE crear el tipo `nivel_<P+1>` como último nivel y, DONDE P+1 es 3, DEBE copiar sus nombres a `pais.nivel_3_singular`/`_plural`; todo en una sola transacción y sin cambiar los demás tipos ni ningún nodo. | P3 |
| R49 | SI el país ya tiene 10 tipos o un nombre no cumple 2–40 caracteres, ENTONCES el sistema DEBE responder `validation_error`; SI el país no existe, ENTONCES `not_found`; SI el tipo `nivel_<P+1>` ya existe cuando se escribe (otra alta en paralelo), ENTONCES `conflict`; en ningún rechazo DEBE escribir nada. | P3 |
| R50 | El sistema NO DEBE ofrecer quitar un nivel ni un tipo de un país: ninguna action ni control de la pantalla lo hace, y ningún archivo de `lib/`, `app/` ni `components/` borra filas de `tipo_nivel_geografico`. | P3; Retirar nodo |
| R51 | MIENTRAS un país tiene 2 tipos, las pantallas de sus empresas DEBEN mostrar como etiqueta del nivel 3 la del nivel 2 (singular y plural) y nunca un texto vacío. | P2; P10 |

### Disponibilidad del país

| R | Requisito | Decisión |
|---|---|---|
| R28 | CUANDO el superadmin marca disponible un país, el sistema DEBE aceptarlo tenga los niveles que tenga (también con nodos de profundidad 4 o más), con el historial de SL-20 (R47). | ¿País disponible sin 3 niveles antes de SLT-48? |
| R29 | MIENTRAS un país disponible no es de 3 niveles, la creación de órdenes de sus empresas DEBE seguir respondiendo «país aún no habilitado» (regla de SLT-45), sin cambios en SLT-46. | ¿País disponible sin 3 niveles antes de SLT-48? |
| R63 | CUANDO el superadmin da de alta un país, el sistema DEBE aceptar en la entrada un `disponible` booleano opcional y guardarlo en la misma escritura que crea el país, dentro de la transacción de R23; SI la entrada no lo trae, ENTONCES el país DEBE quedar disponible (el valor por defecto de la columna, como antes de R63); la pantalla DEBE ofrecer la casilla «Disponible para crear empresas» desmarcada por defecto, enviarla siempre en el alta, mostrarla en el resumen del modal de confirmación (R58) y, MIENTRAS la lista no tiene 3 niveles, avisar junto a la casilla que sus empresas verán «país aún no habilitado» hasta SLT-48 (R29); el historial del alta DEBE ser el de R37, sin filas nuevas. | Disponible en el alta de país |

### Carga CSV de la división

| R | Requisito | Decisión |
|---|---|---|
| R30 | CUANDO el superadmin carga un CSV para un país, el sistema DEBE exigir en la cabecera las columnas `nivel_<k>` y `codigo_nivel_<k>` para cada k de 1 a P (columnas neutras, sin el nombre del tipo); SI falta una, ENTONCES DEBE rechazar el archivo entero sin escribir nada. | Alcance; P4 |
| R31 | CUANDO se carga para Costa Rica un CSV con el formato de SL-20, el sistema DEBE aceptarlo y devolver el mismo resultado (resumen, errores por línea y avisos) que en SLT-45 con el mismo archivo y la misma base; la única excepción es el caso de SL-20 R49 (dos homónimos normalizados ya en la base), que SLT-46 supera porque la base ya no admite ese estado. | Alcance; P4; P6 |
| R32 | SI una fila del CSV deja vacío un nivel y llena uno más profundo, o deja vacío `nivel_1` o `nivel_2`, ENTONCES el sistema DEBE tratarla como inválida con su número de línea y su motivo, y NO DEBE escribir nada. | Alcance |
| R33 | CUANDO un CSV válido se carga, el sistema DEBE cruzarlo con los nodos del país leídos de `nodo_geografico`, DEBE crear como nodos (con el tipo de su profundidad) los que falten y completar los códigos vacíos, todo en una sola transacción, y DEBE devolver cuántos creó por profundidad, cuántos ya existían y cuántos códigos completó. | Alcance |
| R34 | Los límites de la carga (5 MB, 10 000 filas de datos, 200 errores devueltos, UTF-8, `.csv`) y el aviso por cada columna que no es del formato DEBEN seguir como en SL-20. | Alcance |

### Historial de plataforma

| R | Requisito | Decisión |
|---|---|---|
| R35 | CUANDO el superadmin da de alta, renombra, retira o reactiva un nodo, el sistema DEBE guardar en la misma transacción una fila en `historial_plataforma` con la acción `nodo_geografico_*`, la entidad `nodo_geografico`, la cadena de nombres de la raíz al nodo, el país y el actor (id y nombre congelado), y en el renombre el nombre anterior y el nuevo; la entidad es `nodo_geografico` a cualquier profundidad, también en 1–3. | Historial; P5 |
| R36 | CUANDO una carga CSV escribe algo, el sistema DEBE guardar en la misma transacción una fila `division_cargada` con las cifras por profundidad; SI no escribe nada, ENTONCES NO DEBE guardar ninguna. | Historial |
| R37 | CUANDO se da de alta un país, el sistema DEBE guardar la fila `pais_creado` y una fila `tipo_nivel_geografico_creado` por tipo; CUANDO se agrega un nivel a un país, DEBE guardar una fila `tipo_nivel_geografico_creado` del tipo nuevo; CUANDO se cambia un nombre de tipo, DEBE guardar una fila `tipo_nivel_geografico_renombrado` por cada nombre que cambió, con el anterior, el nuevo y el campo (`singular` o `plural`) en `detalle`; todo en la misma transacción del cambio. | Historial; P3; P7 |
| R38 | Las escrituras de geografía y de tipos del superadmin NO DEBEN escribir en `historial_accion`. | Historial |

### Autorización y contexto

| R | Requisito | Decisión |
|---|---|---|
| R39 | SI un rol que no es de plataforma invoca cualquier operación de esta pantalla (árbol del país, alta de país, edición de tipo, reordenar niveles, agregar nivel, alta, renombre, retiro y reactivación de nodo, conteo de órdenes, carga CSV, disponibilidad), ENTONCES el service DEBE responder `forbidden` sin leer ni escribir la base. | E2E (el rol se prueba en el service) |
| R40 | Las operaciones de R39 DEBEN completarse con un superadmin que no pertenece a ninguna empresa, sin fallar con `EmpresaNoResuelta`. | Historial |
| R41 | SI una operación en el contexto de una empresa intenta escribir `nodo_geografico` o `tipo_nivel_geografico`, ENTONCES la base DEBE rechazarla (`42501`) sin escribir nada. | Alcance |

### Baja lógica, escritor único y frontera

| R | Requisito | Decisión |
|---|---|---|
| R42 | Ningún archivo de `lib/`, `app/` ni `components/` DEBE borrar físicamente filas de `nodo_geografico`, `tipo_nivel_geografico`, `provincia`, `canton` ni `distrito`. | Retirar nodo |
| R43 | Solo `GeoRepository` DEBE escribir `nodo_geografico`, y solo `PaisRepository` DEBE escribir `tipo_nivel_geografico`; el nombre de un nodo solo lo DEBE escribir `GeoRepository.renombrar` (y el alta). | Alcance |
| R44 | SLT-46 NO DEBE cambiar las zonas de la empresa: el trigger `orden_nodo_geografico` DEBE seguir derivando el nodo de las FK de la orden, y `zona_distrito` y `distrito_zona_especial` DEBEN seguir admitiendo solo distritos. | ¿Una tarjeta o dos? |
| R45 | La verificación de SLT-46 DEBE hacerse con unit e integración contra Postgres real, sin E2E nuevo, y los E2E existentes DEBEN seguir en verde en el gate completo. | E2E |

### Proceso de la parte visual

| R | Requisito | Decisión |
|---|---|---|
| R52 | La pantalla (árbol de N niveles, lista de tipos del alta, edición de tipos y agregar nivel) NO DEBE implementarse hasta que exista una maqueta aprobada por el humano, con su fecha y su referencia anotadas en `progress/impl_SLT-46.md`, y lo implementado DEBE seguir esa maqueta. | P9; Maqueta T0.2 aprobada |

### Reordenar niveles

| R | Requisito | Decisión |
|---|---|---|
| R53 | MIENTRAS el superadmin arma la lista de tipos del alta de país o reordena los niveles de un país ya creado, la pantalla DEBE permitir mover una fila arrastrándola por su manija (⠿) y, con la manija enfocada, una posición arriba o abajo con las flechas del teclado; NO DEBE mostrar flechas ni botones de subir y bajar. | Reordenar niveles arrastrando |
| R54 | CUANDO el superadmin confirma el alta de un país tras reordenar su lista de tipos, el sistema DEBE crear las claves `nivel_1`…`nivel_P` en el orden en que la lista quedó en pantalla (R23). | Reordenar niveles arrastrando |
| R55 | CUANDO el superadmin confirma un nuevo orden de los niveles de un país ya creado, el sistema DEBE dejar en el tipo de cada profundidad k el nombre singular y plural del tipo que quedó en la posición k y, DONDE k es 1, 2 o 3, copiarlo a `pais.nivel_k_singular`/`_plural`, todo en una sola transacción; NO DEBE cambiar el id, la clave, la profundidad ni la regla de código de ningún tipo, ni ningún nodo (ni su tipo, que sigue siendo el de su profundidad). | Reordenar niveles arrastrando; P1; ¿El nombre de tipo corregido se copia a `pais.nivel_N_*`? |
| R56 | CUANDO un reordenamiento cambia nombres, el sistema DEBE guardar en la misma transacción una fila `tipo_nivel_geografico_renombrado` por cada nombre que cambió, con el anterior, el nuevo, el campo (`singular` o `plural`) y el origen «reordenado» en `detalle`; SI el orden pedido es el actual, ENTONCES DEBE responder éxito sin escribir nada ni guardar historial. | Reordenar niveles arrastrando; P7; Historial |
| R57 | SI el reordenamiento trae tipos repetidos o menos de 2 o más de 10, ENTONCES el sistema DEBE responder `validation_error`; SI el país no existe, ENTONCES `not_found`; SI la lista no es exactamente el conjunto de tipos que el país tiene al guardar (falta uno, sobra uno o es de otro país) o algún nombre no es el que el tipo tiene al guardar, ENTONCES `conflict` (cambio concurrente); en ningún rechazo DEBE escribir nada. | Reordenar niveles arrastrando |

### Confirmación antes de escribir

| R | Requisito | Decisión |
|---|---|---|
| R58 | CUANDO el superadmin pide guardar un alta de país, un alta de nodo, un renombre de nodo, una edición de nombres de tipo, un reordenamiento de niveles, un agregar nivel, o el retiro o la reactivación de un nodo, la pantalla DEBE validar los datos con los mismos esquemas de entrada que aplica el servidor y, si son válidos, DEBE mostrar un modal de confirmación con el antes → después del cambio; NO DEBE llamar a ninguna action de escritura hasta que el superadmin confirme en ese modal. | Confirmación antes de escribir |
| R59 | SI los datos no pasan la validación de la pantalla, ENTONCES la pantalla NO DEBE abrir el modal de confirmación y DEBE mostrar el error en el campo; SI el superadmin cancela el modal, ENTONCES NO DEBE llamarse ninguna action de escritura. | Confirmación antes de escribir |
| R60 | CUANDO llega a una action de escritura de esta pantalla una entrada que la pantalla habría rechazado, el sistema DEBE responder `validation_error` sin escribir nada (el servidor valida aunque la pantalla ya haya validado). | Confirmación antes de escribir |
| R61 | SI al guardar un renombre de nodo, una edición de nombres de tipo o un agregar nivel el dato que el modal mostró como «antes» ya no es el de la base (otro superadmin lo cambió), ENTONCES el sistema DEBE responder `conflict` con motivo de cambio concurrente sin escribir nada, y la pantalla DEBE avisar que el dato cambió mientras tanto; SI el valor de la base ya es el pedido, ENTONCES rige R18 (éxito sin escribir). | Confirmación antes de escribir |
| R62 | MIENTRAS el superadmin arma la lista de tipos del alta de país, el bloque DEBE titularse «Niveles N (máximo 10)», con N el número de filas, y la pantalla NO DEBE permitir quitar una fila cuando hay 2 ni agregar una cuando hay 10. | Título del alta de país |

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| ¿Una tarjeta o dos? | R44 |
| ¿Mover nodos? | R6, R22 |
| ¿El nombre de tipo corregido se copia a `pais.nivel_N_*`? | R25, R27 |
| ¿País disponible sin 3 niveles antes de SLT-48? | R28, R29, R63 |
| Retirar nodo (baja lógica) | R7, R16, R19, R20, R42, R50 |
| E2E | R39, R45 |
| Historial | R35–R38, R40, R56 |
| Migraciones | R4, R8, R9, R10, R47 |
| P1 Tipo de un nodo nuevo | R14, R55 |
| P2 De 2 a 10 niveles | R8, R23, R24, R46, R47, R51 |
| P3 Agregar un nivel al final | R37, R48, R49, R50 |
| P4 Cabeceras neutras del CSV | R30, R31 |
| P5 Entidad `nodo_geografico` | R35 |
| P6 SL-20 R49 superado | R31 |
| P7 Una fila por nombre de tipo cambiado | R37, R56 |
| P8 `--equivalencia-geografia` | R13 |
| P9 Maqueta aprobada antes de la UI | R52 |
| Maqueta T0.2 aprobada (2026-11-09) | R52, R53, R58, R62 |
| Reordenar niveles arrastrando (2026-11-09) | R53, R54, R55, R56, R57 |
| Confirmación antes de escribir (2026-11-09) | R58, R59, R60, R61 |
| Título del alta de país (2026-11-09) | R62 |
| Disponible en el alta de país (2026-11-09) | R63 |

## Preguntas abiertas
Sembradas por `/afinar-feature`: ninguna. P1–P9 (spec_author, F1.2) respondidas por el humano el
2026-11-06: pasan a `## Decisiones cerradas`.

P10 (spec_author, revisión F1.2) respondida por el humano el 2026-11-06: pasa a `## Decisiones cerradas`.

Revisión F1.2 del 2026-11-09 (`spec_author`). Mientras no se respondan, P12 y P13 siguen lo que ya
hay y P11 queda fuera de R58; ninguna bloquea el backend.

- **P11. ¿El interruptor «Disponible» y la carga CSV también piden confirmación?** La decisión nombra
  guardar, editar, crear, agregar nivel y retirar/reactivar; esas dos acciones también escriben y no
  se nombran. *Propuesta:* sí, con el mismo modal (disponible: «No disponible → Disponible»; CSV:
  nombre del archivo y país, sin el resumen, que solo se sabe al cargar). Hoy R58 no las incluye.
- **P12. Si otro superadmin ya retiró (o reactivó) el lugar mientras el modal estaba abierto, ¿se
  avisa?** Hoy R19 (cerrado) responde éxito sin escribir. *Propuesta:* se queda así; la pantalla
  recarga y muestra el estado. Si el humano quiere un aviso, haría falta un `conflict` y cambiaría R19.
- **P13. ¿El arrastre tiene que funcionar en pantallas táctiles?** El arrastre nativo del navegador
  no funciona con el dedo; hacerlo táctil pide una librería (`design.md §12`), que necesita su
  aprobación. *Propuesta:* no; la pantalla del superadmin es de escritorio y el teclado es la
  alternativa (R53).

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-06 | ¿Una tarjeta o dos? | Dos: SLT-46 = geografía del superadmin; zonas de la empresa a SLT-89. |
| 2026-11-06 | ¿Mover nodos? | No en SLT-46. Va en SLT-48, que corrige también las órdenes viejas sin reescribirlas (el humano quiere que las viejas se corrijan). |
| 2026-11-06 | ¿El nombre de tipo corregido se copia a `pais.nivel_N_*`? | Sí, niveles 1–3, mientras existan las columnas. |
| 2026-11-06 | ¿País disponible sin 3 niveles antes de SLT-48? | Sí, cualquiera. Sus órdenes dan «país aún no habilitado» hasta SLT-48 (regla de SLT-45). Reemplaza la mitigación vieja «ningún país con más de 3 niveles se marca disponible hasta SLT-48» (SLT-43 design:311-313). |
| heredada SL-20 | Retirar nodo | Baja lógica (`activo`), nunca borrado físico. |
| heredada SL-20 | E2E | Sin E2E nuevo; el rol se prueba en el service. |
| heredada SL-20 | Historial | Toda acción sobre nodos y tipos va a `historial_plataforma`. |
| heredada SLT-43 | Migraciones | Solo aditivas hasta SLT-48, cada una con `down.sql`. |
| 2026-11-06 | P1. ¿El tipo de un nodo nuevo se elige? | No: es el de su profundidad (`nivel_<k>`). |
| 2026-11-06 | P2. ¿Cuántos niveles tiene un país? | De 2 a 10 (cambia la propuesta de 3–10). Un país de 2 niveles queda con exactamente 2 tipos, con migraciones solo aditivas; `CREATE OR REPLACE FUNCTION` de una función de trigger está permitido, como en SLT-45. |
| 2026-11-06 | P3. ¿Se agregan o quitan niveles a un país ya creado? | Se agrega un nivel al final (p. ej. Barrio debajo de Distrito), hasta 10, con historial; quitar niveles no (cambia la propuesta de «ni añadir ni quitar»). |
| 2026-11-06 | P4. ¿Cabeceras del CSV? | Neutras, `nivel_<k>` y `codigo_nivel_<k>`; el CSV de CR no cambia. |
| 2026-11-06 | P5. ¿Entidad del historial de un nodo? | `nodo_geografico` a cualquier profundidad. |
| 2026-11-06 | P6. ¿Caso de SL-20 «dos homónimos normalizados en la base»? | Se retira; SL-20 R49 queda superado por SLT-46 porque el único normalizado de SLT-43 ya no admite ese estado. |
| 2026-11-06 | P7. ¿Historial al cambiar los dos nombres de un tipo? | Una fila por nombre cambiado, con el campo en `detalle`. |
| 2026-11-06 | P8. ¿Dónde vive la comparación fila a fila? | Modo de solo lectura `--equivalencia-geografia` en el script de SLT-43. |
| 2026-11-06 | P10. ¿Etiqueta del nivel 3 en las pantallas de empresa de un país de 2 niveles? | Repetir la del nivel 2 (singular y plural), no la neutra «Nivel 3» que proponía el spec. Ocultar esas columnas queda para SLT-47. |
| 2026-11-06 | P9. ¿La pantalla pasa por diseño? | Sí: árbol de N niveles, lista de tipos, edición de tipos y agregar nivel pasan por una maqueta que aprueba el humano antes de implementarlos; el backend puede avanzar antes. |
| 2026-11-09 | Maqueta T0.2 aprobada | Aprobada por el humano («aprobado»): lienzo https://claude.ai/artifact/QFq31uvvXmLXF4AGt9PFfH, versión 7. Es la forma visual de la pantalla. |
| 2026-11-09 | Reordenar niveles arrastrando | Se reordena arrastrando por una manija ⠿, sin flechas visibles; con la manija enfocada, las flechas del teclado como alternativa. En el alta, reordena la lista antes de crear. En un país ya creado, solo reasigna los nombres (singular/plural) de cada profundidad: los nodos no se mueven y el tipo de cada nodo sigue siendo el de su profundidad (P1); una transacción, historial de una fila por nombre cambiado (P7) y copia a `pais.nivel_1..3_*`. |
| 2026-11-09 | Confirmación antes de escribir | Toda acción de la pantalla que guarda, edita, crea, agrega nivel o retira/reactiva pide confirmación en un modal con el antes → después; la pantalla valida antes de mostrar el modal y el servidor vuelve a validar al guardar; si el dato cambió mientras tanto, avisa y no guarda (`conflict`). |
| 2026-11-09 | Título del alta de país | «Niveles N (máximo 10)»; el mínimo de 2 se impone sin decirlo en el título (con 2 filas no se puede quitar otra). |
| 2026-11-09 | Disponible en el alta de país | El alta acepta `disponible` y lo guarda en la misma transacción que el país (sin segundo paso ni migración: la columna ya es `NOT NULL DEFAULT true`). La casilla de la pantalla viene desmarcada: un país nuevo nace no disponible si no se marca. Quien no manda el campo conserva el `true` de antes. Costa Rica y los países existentes no cambian. Historial: el de R37, sin fila de disponibilidad. |
