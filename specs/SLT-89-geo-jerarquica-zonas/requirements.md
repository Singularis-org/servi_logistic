# SLT-89 — geo-jerarquica-zonas · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: SLT-46 · Rama: feature/SLT-89-geo-jerarquica-zonas (sobre SLT-46)
>
> **Alcance.** Las zonas de cada empresa se asignan a cualquier nodo de la geografía, no solo a
> distritos: `GeografiaSelector` a N niveles, con lo que hereda cada nodo y sus excepciones; aviso de
> impacto antes de guardar (cuántas órdenes pendientes cambian de zona o tarifa y cuántas no se
> mueven); las órdenes pendientes elegibles se mueven como hoy. Los grupos de tarifas agrupan
> cualquier nodo de su zona. El trigger de `orden` deja de forzar el nodo al distrito/cantón: una
> orden puede apuntar a cualquier nodo cubierto. Historial de la empresa para los cambios por nodo.
>
> **Lo que NO entra.**
> - Pantalla para marcar zona especial por nodo: la zona especial se maneja como grupo en Tarifas
>   (SLT-54); la marca vieja solo se lee, heredada.
> - Filtros, exportes y presentación → SLT-47. Retirar columnas `distrito_id` → SLT-48.
>
> Sembrado por `/afinar-feature` el 2026-11-09. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` (F1.2, 2026-11-09). Vocabulario:
> - **Nodo**: una fila de `nodo_geografico` del país de la empresa, a cualquier profundidad. Un
>   **distrito** es un nodo de profundidad 3 (el que la sincronía de SLT-46 copia a `distrito`).
> - **Asignación**: un nodo puesto en una zona de la empresa. La de un distrito vive en
>   `zona_distrito` (como hoy); la de cualquier otro nodo, en la tabla nueva de `design.md` §2.1.
> - **Zona que cubre un nodo**: la de SLT-44 R6 (la asignación más cercana subiendo, con el colapso
>   1/0/>1) sobre **todas** las asignaciones de la empresa. Un nodo está **cubierto por Z** si esa
>   zona es Z. Una **excepción** es un nodo asignado a una zona distinta de la que cubre a su padre.
> - **Lugar de una orden**: `COALESCE(distrito_id, canton_id)` (SLT-65, «Lugar de una orden»).
> - **Pendiente**: orden no borrada y sin detalle en un cierre.
> - **Miembro de un grupo**: un nodo dentro de un grupo de tarifas (SLT-52 `grupo_distritos`).
> - «Antes → después» y «cambio concurrente»: el modal y el control de SLT-46 (§4.7 de su design).
>
> La columna «Decisión» dice qué fila de `## Decisiones cerradas` cubre; «Alcance» es el bloque de
> arriba. La tabla del final reparte cada decisión entre sus requisitos.

### Asignar zonas a cualquier nodo

| R | Requisito | Decisión |
|---|---|---|
| R1 | CUANDO el `maestro` crea o guarda una zona con un conjunto de nodos de cualquier profundidad del país de su empresa, el sistema DEBE dejar asignados a esa zona exactamente esos nodos, ni uno más ni uno menos. | Alcance |
| R2 | SI un nodo pedido ya está asignado a otra zona de la misma empresa, ENTONCES el guardado DEBE responder `validation_error` con un mensaje «`<nombre>` ya está en la zona `<zona>`.» por nodo, ordenados por nombre, sin escribir nada; SI el choque lo frena la base (dos guardados a la vez), ENTONCES DEBE responder el mensaje genérico de SLT-75 («Alguno de los elegidos acaba de asignarse a otra zona…»). Un mismo nodo SÍ puede estar asignado en zonas de empresas distintas. | ¿Un distrito puede ir a otra zona que su cantón?; heredada SLT-75 |
| R3 | El sistema DEBE aceptar que un nodo esté asignado a una zona y uno de sus descendientes a otra zona de la misma empresa (excepción), en cualquier orden de guardado. | ¿Un distrito puede ir a otra zona que su cantón? |
| R4 | SI un nodo pedido no existe en el país de la empresa, ENTONCES el guardado DEBE responder `validation_error` sin escribir nada; un nodo retirado (`activo = false` él o un ancestro) DEBE poder seguir asignado con la misma regla que hoy se aplica a los distritos retirados. | Alcance |
| R5 | SI la entrada de crear o guardar una zona no trae ningún nodo, ENTONCES el sistema DEBE responder `validation_error` en el campo `distritoIds`, como hoy. | Alcance |

### Herencia en las lecturas

| R | Requisito | Decisión |
|---|---|---|
| R6 | Toda lectura que hoy usa la zona de un nodo —creación y cotización de órdenes por v1, v2 y carga masiva, Excel de cobertura, árbol de zonas, geografía por zona de los filtros y la reconciliación del guardado— DEBE usar la zona que cubre el nodo según SLT-44 R6 sobre todas las asignaciones de la empresa (distritos y demás nodos). | Herencia (heredada SLT-44); Alcance |
| R7 | CUANDO se crea o se cotiza una orden cuyo lugar (distrito, o cantón si no trae distrito) no tiene asignación propia pero sí la tiene uno de sus ancestros, el sistema DEBE darle la zona de la asignación más cercana; SI ninguna zona cubre el lugar, ENTONCES DEBE responder los mismos errores de «sin zona» que hoy. Las profundidades que se aceptan al crear una orden NO DEBEN cambiar (regla de guardado de SLT-45). | Alcance («una orden puede apuntar a cualquier nodo cubierto»); Herencia |
| R8 | La marca de zona especial DEBE seguir saliendo solo de las marcas que ya existen, heredadas hacia abajo (SLT-44 R7); ninguna operación de esta feature DEBE escribir, crear ni ofrecer marcar `distrito_zona_especial`. | ¿Pantalla para marcar zona especial por nodo? |
| R9 | El lugar de una orden y el nodo de una asignación de distrito DEBEN seguir leyéndose de sus FK viejas (`distrito_id`, `canton_id`), nunca de `nodo_geografico_id` (SLT-44 R12, SLT-65 R19); el nodo de una asignación que no es distrito DEBE leerse de su propia columna de nodo. | Herencia; heredada SLT-43 |

### Órdenes pendientes al guardar una zona

| R | Requisito | Decisión |
|---|---|---|
| R10 | CUANDO se guarda una zona, el sistema DEBE re-evaluar las órdenes cuyo lugar es un nodo asignado a esa zona antes o después del guardado, o un nodo bajo uno de ellos, y moverlas con todas las reglas de SLT-65 R14: solo cambia `zona_id`; quedan fuera las borradas, las que están en un cierre y las que tienen una gestión vigente final; las del estante de una bodega satélite no se mueven y se cuentan como retenidas; un lugar con 0 o más de 1 zona no mueve nada; una fila `orden_zona_reconciliada` por orden movida, un solo lote, y la misma forma de respuesta (`ordenesReconciliadas`, `ordenesRetenidasEnBodegaSatelite`). | ¿Qué pasa con las órdenes pendientes al reasignar un nodo? |
| R11 | CUANDO se asigna un nodo a una zona, las órdenes cuyo lugar está bajo una excepción de ese nodo (un descendiente asignado a otra zona) NO DEBEN cambiar de zona. | ¿Un distrito puede ir a otra zona que su cantón? |

### Aviso de impacto y confirmación del guardado de zona

| R | Requisito | Decisión |
|---|---|---|
| R12 | CUANDO el `maestro` pide crear o guardar una zona, la pantalla DEBE validar la entrada con los mismos esquemas que el servidor y, si es válida, mostrar un modal con el antes → después (nombre, marca de bodega principal y nodos que entran y salen, cada uno con su nivel y el nombre de su padre); NO DEBE llamar a la action de escritura hasta que el `maestro` confirme, y cancelar NO DEBE escribir nada. Cuando el guardado mueve la marca de bodega principal, el modal DEBE conservar el texto y el impacto de la ficha 376. | Confirmación (heredada SLT-46) |
| R13 | MIENTRAS el modal de R12 muestra un cambio de nodos, DEBE mostrar, calculado en el servidor con los nodos pedidos: cuántas órdenes pendientes cambian de zona, cuántas cambian de tarifa y cuántas no se mueven aunque su zona cambiaría, estas separadas en «en el estante de una bodega satélite», «con gestión final» y «ya en un cierre»; y NO DEBE habilitar «Confirmar» hasta tener esas cifras. | Alcance (aviso de impacto); ¿Qué pasa con las órdenes pendientes…? |
| R14 | Una orden «cambia de tarifa» en R13 si es pendiente y su zona después del guardado (la nueva si se mueve, la actual si no) o su grupo de tarifas en esa zona difiere del de antes; MIENTRAS la empresa no ha activado las tarifas nuevas (SLT-54), DEBE contar solo el cambio de zona. | Alcance (aviso de impacto) |
| R15 | El cálculo del impacto NO DEBE escribir en ninguna tabla, y DEBE salir del mismo plan que usa el guardado: SI nada cambia en la base entre el aviso y la confirmación, ENTONCES `ordenesReconciliadas` y `ordenesRetenidasEnBodegaSatelite` del guardado DEBEN ser iguales a «cambian de zona» y «en el estante» del aviso. | ¿Qué pasa con las órdenes pendientes…?; Confirmación |
| R16 | SI al guardar una zona existente los nodos que tiene en la base no son los que el modal mostró como «antes», ENTONCES el sistema DEBE responder `conflict` con motivo `cambio_concurrente` sin escribir nada, y la pantalla DEBE cerrar el modal, avisar «Este dato cambió mientras tanto; revisa el valor actual» y refrescar. | Confirmación (heredada SLT-46) |

### Grupos de tarifas sobre el nodo

| R | Requisito | Decisión |
|---|---|---|
| R17 | CUANDO el `maestro` crea un grupo o fija sus miembros, el sistema DEBE aceptar como miembro cualquier nodo cubierto por la zona del grupo (asignado a ella o heredado), a cualquier profundidad, y dejar exactamente esos miembros. | ¿Qué agrupa un grupo de tarifas? |
| R18 | SI un nodo pedido no está cubierto por la zona del grupo, o ya es miembro de otro grupo de esa zona, ENTONCES el sistema DEBE responder `validation_error` nombrando el nodo, sin escribir nada (la regla de SLT-52 R11 llevada al nodo). | ¿Qué agrupa un grupo de tarifas? |
| R19 | El grupo de tarifas de una orden con distrito en una zona DEBE ser el del miembro más cercano subiendo desde su distrito (el distrito, luego su cantón, luego su provincia…) entre los grupos de esa zona; en el pago, la zona es la del mensajero y en el cobro la de la orden (SLT-52 R16, R19, R21). | ¿Qué agrupa un grupo de tarifas? («gana el más específico») |
| R20 | Una orden sin distrito NO DEBE usar grupos de tarifas, como hoy (SLT-52 R18), aunque su cantón o un ancestro sea miembro de un grupo de su zona; darle grupo queda para SLT-48 «Geografía jerárquica: retirar modelo viejo». | ¿Qué agrupa un grupo de tarifas?; ¿La orden sin distrito usa grupo? |
| R21 | CUANDO un guardado de zona deja a un miembro de un grupo sin la cobertura de la zona del grupo, el sistema DEBE sacarlo de ese grupo en la misma transacción y dejar una fila `grupo_distritos_cambiado` por grupo afectado, con cuántos miembros había y cuántos quedan; CUANDO el miembro sigue cubierto por esa zona (aunque pase de asignado a heredado o al revés), DEBE seguir en su grupo. | ¿Qué agrupa un grupo de tarifas?; ¿Qué pasa con las órdenes pendientes…? |
| R22 | CUANDO el `maestro` pide crear un grupo, renombrarlo, cambiar sus miembros o borrarlo en Tarifas, la pantalla DEBE validar la entrada con los mismos esquemas que el servidor (si no es válida: error en su campo, sin modal y sin llamar a la action) y, si es válida, mostrar un modal con el antes → después: al crear, «sin grupo» → nombre y miembros; al renombrar, nombre de antes → nombre nuevo; al cambiar miembros, los que entran y los que salen; al borrar, nombre y número de miembros → «sin grupo», con el aviso de SLT-54 R43 de cuántos valores se borran con él (los de tienda incluidos). NO DEBE llamar a la action de escritura hasta que el `maestro` confirme, y cancelar NO DEBE escribir nada. Cada miembro DEBE mostrarse con su nivel y el nombre de su padre. | Confirmación (heredada SLT-46); Toda escritura de grupos pasa por el modal |
| R23 | La pantalla de Tarifas DEBE ofrecer como posibles miembros de un grupo los nodos cubiertos por su zona, en árbol a todas sus profundidades, con el nombre del tipo de cada nivel; MIENTRAS la empresa no está activada, DEBE seguir mostrando de solo lectura la marca de zona especial de cada distrito (SLT-54 R45). | ¿Qué agrupa un grupo de tarifas?; ¿Pantalla para marcar zona especial por nodo? |
| R43 | SI al cambiar los miembros de un grupo los que tiene en la base (distritos y demás nodos) no son los que el modal mostró como «antes», ENTONCES el sistema DEBE responder `conflict` con motivo `cambio_concurrente` sin escribir nada. | Confirmación; Toda escritura de grupos pasa por el modal |
| R44 | SI al renombrar un grupo su nombre en la base no es el que el modal mostró como «antes» ni el nombre pedido, ENTONCES el sistema DEBE responder `conflict` con motivo `cambio_concurrente` sin escribir nada (ni nombre ni historial). | Toda escritura de grupos pasa por el modal |
| R45 | SI al borrar un grupo su nombre, sus miembros (distritos y demás nodos) o su número de valores en la base no son los que el modal mostró como «antes», ENTONCES el sistema DEBE responder `conflict` con motivo `cambio_concurrente` sin borrar el grupo, ni sus miembros, ni sus valores, ni escribir historial. SI el grupo ya no existe, ENTONCES DEBE responder `not_found` como hoy. | Toda escritura de grupos pasa por el modal |
| R46 | Crear un grupo no lleva «antes» (no hay estado previo): SI mientras el modal estaba abierto otro guardado tomó el mismo nombre en la zona o metió uno de los miembros pedidos en otro grupo o lo dejó sin cobertura, ENTONCES el sistema DEBE rechazarlo con los mismos `validation_error` de hoy (nombre repetido, SLT-52 R10) y de R18, sin escribir nada. | Toda escritura de grupos pasa por el modal |
| R47 | CUANDO una escritura de grupo responde `conflict` con motivo `cambio_concurrente`, la pantalla DEBE cerrar el modal, avisar «Este dato cambió mientras tanto; revisa el valor actual» en una región visible con `aria-live` y volver a cargar los grupos y valores de la zona. | Confirmación (heredada SLT-46); Toda escritura de grupos pasa por el modal |

### Selector de N niveles

| R | Requisito | Decisión |
|---|---|---|
| R24 | MIENTRAS el `maestro` elige los nodos de una zona, el selector DEBE mostrar el árbol del país de su empresa a todas sus profundidades, con el nombre del tipo de cada nivel (sin textos de nivel escritos a mano), y para cada nodo si está asignado a esta zona, asignado a otra zona, o si hereda una zona, nombrando la zona y el nodo del que la hereda. | ¿Un distrito puede ir a otra zona que su cantón? (el selector muestra herencia y excepciones) |
| R25 | CUANDO el `maestro` marca un nodo, el selector DEBE asignar ese nodo (no sus descendientes uno a uno), quitar de la selección los descendientes que estaban asignados a esta misma zona y mostrarlos como heredados; los descendientes asignados a otra zona DEBEN quedar a la vista como excepciones. | ¿Un distrito puede ir a otra zona que su cantón? |
| R26 | El selector NO DEBE permitir marcar un nodo asignado a otra zona (SLT-75 R15), ni un nodo que ya hereda esta misma zona de un ancestro marcado; SÍ DEBE permitir marcar un nodo que hereda otra zona (crea una excepción). | ¿Un distrito puede ir a otra zona que su cantón?; heredada SLT-75 |
| R27 | CUANDO se abre una zona existente, el selector DEBE preseleccionar exactamente sus nodos asignados, retirados incluidos; la búsqueda DEBE encontrar nodos de cualquier profundidad con la normalización de nombres de siempre (`normalizeName`). | Alcance |
| R48 | El selector de N niveles (R24–R27), el modal del guardado de zona (R12, R13, R16) y lo de grupos en Tarifas (R22, R23, R47) DEBEN programarse solo después de que el humano apruebe su maqueta, y DEBEN corresponder a ella; la referencia al lienzo y la fecha de aprobación DEBEN constar en `progress/impl_SLT-89.md` antes del primer commit de esas pantallas. El backend no espera a la maqueta. | ¿Maqueta antes de la parte visual? |

### Orden apuntando a cualquier nodo cubierto

| R | Requisito | Decisión |
|---|---|---|
| R28 | CUANDO se escribe una orden con `nodo_geografico_id` igual a su lugar o a un nodo que cuelga de su lugar, la base DEBE conservar ese nodo; en cualquier otro caso (vacío, o un nodo fuera de esa rama) DEBE poner su lugar, como hoy. | Alcance (el trigger de `orden` deja de forzar el nodo) |
| R29 | Con las escrituras de órdenes de hoy (sin nodo, o con el nodo igual a su lugar), el `nodo_geografico_id` resultante DEBE ser el mismo que con el trigger de SLT-43, y SLT-45 R27 DEBE seguir cumpliéndose. | Alcance; Migraciones |

### Historial de la empresa

| R | Requisito | Decisión |
|---|---|---|
| R30 | CUANDO un guardado de zona existente añade o quita nodos que no son distritos, el sistema DEBE dejar en la misma transacción una fila `zona_nodo_cambiado` por nodo (entidad `zona`, la zona de después; añadido → solo valor nuevo; quitado → solo valor anterior; el nodo como «nombre (nombre del padre)»), con un lote propio del guardado; los distritos DEBEN seguir dejando `zona_distrito_cambiado` exactamente como SLT-76; crear una zona NO DEBE dejar ninguna de las dos. | Alcance (historial por nodo); heredada SLT-76 |
| R31 | Los cambios de miembros de un grupo DEBEN dejar `grupo_distritos_creado` / `grupo_distritos_cambiado` como hoy, contando todos los miembros del grupo, sean distritos u otros nodos. | Alcance (historial) |

### Datos, migraciones y aislamiento

| R | Requisito | Decisión |
|---|---|---|
| R32 | Las migraciones de SLT-89 DEBEN ser solo aditivas: sin `DROP`, `TRUNCATE`, `RENAME` ni `ALTER COLUMN`; sin `INSERT`, `UPDATE` ni `DELETE` que la migración ejecute sobre una tabla existente; `ALTER TYPE` solo como `ADD VALUE IF NOT EXISTS`; `CREATE OR REPLACE FUNCTION` solo sobre la función de trigger `orden_nodo_geografico`; NO DEBEN alterar, indexar ni escribir la tabla `orden`; y cada una DEBE traer su `down.sql`. | Migraciones (heredada SLT-43) |
| R33 | CUANDO se aplican los `down.sql` de SLT-89 en orden inverso, el esquema DEBE volver al de SLT-46 (salvo el valor de enum añadido) y `orden_nodo_geografico` a su cuerpo de SLT-43; volver a aplicar las migraciones DEBE dejar lo mismo que la primera vez. | Migraciones |
| R34 | Las tablas nuevas DEBEN llevar `organizacion_id`, RLS por empresa, únicos que empiezan por `organizacion_id`, el trigger de misma empresa en sus FK de negocio y el rechazo de geografía de otro país (`SL021`); una fila que apunta a otro país o a otra empresa DEBE rechazarse sin escribir. | Migraciones; Permisos |
| R35 | MIENTRAS una petición corre en el contexto de una empresa, las asignaciones y los miembros de grupo de otra empresa NO DEBEN leerse, cubrir ningún nodo, contar en el impacto ni cambiar ningún precio: el mismo nodo asignado a zonas de dos empresas DEBE resolverse para cada una con su propia zona. | E2E (aislamiento entre dos empresas) |

### Autorización

| R | Requisito | Decisión |
|---|---|---|
| R36 | SI un rol que no es `maestro` invoca crear o guardar una zona, el cálculo de impacto o el árbol de zonas, ENTONCES el service DEBE responder `forbidden` sin leer ni escribir la base. | Permisos |
| R37 | SI un rol que no es `maestro` ni `admin` lee los grupos o los nodos de una zona en Tarifas, o un rol que no es `maestro` crea, renombra, borra un grupo o cambia sus miembros, ENTONCES el service DEBE responder `forbidden` sin leer ni escribir la base. | Permisos |

### Costa Rica igual

| R | Requisito | Decisión |
|---|---|---|
| R38 | MIENTRAS una empresa tiene asignaciones solo a distritos y grupos solo con distritos asignados, el sistema DEBE dar exactamente lo mismo que antes de SLT-89: la zona de cada distrito y cantón, la cobertura, la creación y cotización de órdenes, los cierres, el cobro y el pago de tarifas, el guardado de zona (órdenes movidas y retenidas, respuesta e historial) y los grupos. Los tests de integración existentes de esos flujos DEBEN pasar sin cambiar sus aserciones. | Alcance; heredada SLT-44 (equivalencia) |
| R39 | CUANDO una persona corre `pnpm geo:equivalencia-dinero`, `pnpm geo:equivalencia-consultas` y `pnpm geo:explain-consultas` sobre una copia de producción con SLT-89 aplicada, los tres DEBEN terminar sin diferencias ni regresión (regla de SLT-65: más de 20 % o Seq Scan nuevo sobre `orden`), y la salida DEBE pegarse en el PR antes del merge. Ningún agente lo corre. | Alcance (CR igual, medible); heredada SLT-44/65 |
| R40 | Las operaciones de la API v1 NO DEBEN cambiar de rutas, campos, códigos ni mensajes (SLT-45 R1): su suite de contrato DEBE pasar sin cambios. | heredada SLT-45 (contrato v1 congelado) |

### Verificación de punta a punta

| R | Requisito | Decisión |
|---|---|---|
| R41 | DEBE existir un E2E en el que el `maestro` de una empresa asigna un cantón a una zona, ve el aviso de impacto con sus cifras, confirma, y una orden creada después en un distrito de ese cantón sale con esa zona y con el precio que da la tarifa de esa zona; y en el que una segunda empresa, con el mismo cantón sin asignar, no ve la zona de la primera ni obtiene cobertura para ese cantón. `e2e/dos-empresas-humo.spec.ts` DEBE seguir verde. | ¿E2E? |

### Lo que no entra

| R | Requisito | Decisión |
|---|---|---|
| R42 | Esta feature NO DEBE cambiar: los filtros, exportes y nombres de lugar que muestran listados y etiquetas (SLT-47); las columnas `distrito_id` ni las FK viejas (SLT-48); la regla de qué profundidades se aceptan al crear una orden (SLT-45); el modelo viejo de tarifas (SLT-57); el grupo de una orden sin distrito (SLT-48, R20). Es una sola tarjeta y un solo PR. | ¿Partir la tarjeta?; Alcance (Lo que NO entra); ¿La orden sin distrito usa grupo? |

> Numeración: R43–R47 (escrituras de grupos con modal y cambio concurrente) están en «Grupos de
> tarifas sobre el nodo» y R48 (maqueta) en «Selector de N niveles»; se añadieron el 2026-11-09 tras
> las respuestas del humano y no se renumeró lo anterior.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| ¿Qué pasa con las órdenes pendientes al reasignar un nodo? | R10, R13, R15, R21 |
| ¿Pantalla para marcar zona especial por nodo? | R8, R23 |
| ¿Qué agrupa un grupo de tarifas? | R17, R18, R19, R20, R21, R23 |
| ¿Un distrito puede ir a otra zona que su cantón? | R2, R3, R11, R24, R25, R26 |
| ¿E2E? | R35, R41 |
| ¿Partir la tarjeta? | R42 |
| ¿La orden sin distrito usa grupo? (P1) | R20, R42 |
| ¿Maqueta antes de la parte visual? (P2) | R48 |
| Toda escritura de grupos pasa por el modal (P3) | R22, R43, R44, R45, R46, R47 |
| Herencia (SLT-44) | R6, R7, R9 |
| Confirmación (SLT-46) | R12, R15, R16, R22, R43, R47 |
| Permisos | R34, R36, R37 |
| Migraciones (SLT-43) | R29, R32, R33, R34 |

## Preguntas abiertas

Ninguna. P1–P3 (escritas por `spec_author` el 2026-11-09) las respondió el humano el 2026-11-09 y
están en «Decisiones cerradas».

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-09 | ¿Qué pasa con las órdenes pendientes al reasignar un nodo? | Se mueven como hoy (`planificarReconciliacion`): las elegibles cambian de zona; las de cierre, entregadas o con gestión viva se quedan y se cuentan. Reemplaza «conservan su zona_id» de la tarjeta. |
| 2026-11-09 | ¿Pantalla para marcar zona especial por nodo? | No: se maneja como grupo en Tarifas (SLT-54); la marca vieja solo se lee heredada. |
| 2026-11-09 | ¿Qué agrupa un grupo de tarifas? | Cualquier nodo de su zona; gana el más específico. |
| 2026-11-09 | ¿Un distrito puede ir a otra zona que su cantón? | Sí, gana el más específico; el selector muestra herencia y excepciones. |
| 2026-11-09 | ¿E2E? | Sí: asignar un cantón, aviso de impacto, confirmar, orden en ese cantón con zona y precio esperados, y aislamiento entre dos empresas. |
| 2026-11-09 | ¿Partir la tarjeta? | No, una sola. |
| 2026-11-09 | ¿La orden sin distrito usa grupo? (P1) | No en SLT-89: la orden sin distrito (solo cantón) sigue sin grupo de tarifas; va en SLT-48 «Geografía jerárquica: retirar modelo viejo». |
| 2026-11-09 | ¿Maqueta antes de la parte visual? (P2) | Sí: el selector de N niveles, el modal de impacto y lo de grupos en Tarifas esperan una maqueta aprobada por el humano (la arma el leader en un lienzo); el backend avanza antes. |
| 2026-11-09 | Toda escritura de grupos pasa por el modal (P3) | En Tarifas, crear, renombrar, cambiar miembros y borrar un grupo pasan por el modal antes → después con validación previa y control de cambio concurrente (SLT-46 §4.7). Borrar, que ya pedía confirmación (SLT-54 R43), pasa a ese modal. |
| heredada SLT-44 | Herencia | Gana la asignación más cercana subiendo; colapso 1/0/>1 (`_shared/zona-colapso.ts`). |
| heredada SLT-46 | Confirmación | Toda escritura pasa por modal antes → después con control de cambio concurrente. |
| heredada | Permisos | Zonas: solo `maestro`; grupos: lectura maestro+admin, escritura maestro. |
| heredada SLT-43 | Migraciones | Solo aditivas hasta SLT-48, con `down.sql`. |
