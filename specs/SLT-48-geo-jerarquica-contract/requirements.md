# SLT-48 — geo-jerarquica-contract · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SLT-45, SLT-46, SLT-47, SLT-65, SLT-71, SLT-89, SLT-125 · **Rama** `feature/SLT-48-geo-jerarquica-contract` (apilada sobre `feature/SLT-125-geo-jerarquica-exportes`)
>
> **Alcance.** Es el primer deploy del retiro del modelo viejo.
> - `provincia`, `canton` y `distrito` pasan a ser vistas de solo lectura sobre `nodo_geografico`. Para eso se quitan o rehacen las FK, los NOT NULL y los triggers que lo impiden, y también los triggers de sincronía.
> - La orden guarda solo su nodo, y todo lector (lugar, filtros, tránsito, cierres, tarifas, corrección de ubicación) lee del árbol.
> - Se habilitan los países de más de 3 niveles.
> - El superadmin puede mover un nodo a otro padre de la misma profundidad.
> - Las pantallas que quedaron con 3 niveles fijos (SLT-125 P6) pasan a N niveles.
>
> **Lo que NO entra.**
> - Borrar columnas, vistas, `pais.nivel_N_*`, `digitos_codigo_nivel_N` y el código muerto (`NivelGeografico`, `PROFUNDIDAD_DEL_NIVEL`, las listas planas del catálogo de filtros, `_shared/zona-colapso.ts`). Tampoco entran el NOT NULL de `orden.nodo_geografico_id` ni los renombres `zona_nodo`/`nodo_zona_especial`. Todo eso va a **SLT-196 «Geografía jerárquica: borrar el modelo viejo»**, que empieza después de observar este deploy en producción.
> - Dar grupo de tarifas a la orden sin distrito: no se hace (ver Decisiones cerradas).
> - `cierre_detail` conserva sus 3 columnas de nombre: son historia congelada.
>
> Sembrado por `/afinar-feature` el 2026-11-17. El humano fijó el bloque de Alcance y la tabla de «Decisiones cerradas» ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-17 sobre `feature/SLT-48-geo-jerarquica-contract` (pila geo
> hasta SLT-125). El MCP del grafo no tenía indexado este worktree: la exploración se hizo con Grep y Read,
> sobre el inventario previo del leader.
>
> Vocabulario:
> - **«Hoy»**: el comportamiento de la rama antes de esta feature.
> - **«Las tablas viejas»**: `provincia`, `canton` y `distrito`.
> - **«Las 3 FK de la orden»**: `orden.provincia_id`, `orden.canton_id` y `orden.distrito_id`.
> - **«Nodo de la orden»**: `orden.nodo_geografico_id`.
> - **«P»**: el número de niveles del país (de 2 a 10).
> - **«Hoja»**: el último nodo de su rama (decisión «¿A qué nodo apunta una orden?»). Si cuentan los
>   hijos retirados está en la pregunta P2.
> - **«Orden vieja»**: una orden creada antes de esta feature. **«Orden nueva»**: una creada después.
> - **«Orden abierta»**: una orden que todavía no entró en un cierre (su precio todavía no está congelado).

### A. La base: tablas viejas como vistas

| R | Requisito |
|---|---|
| R1 | El sistema DEBE servir `provincia`, `canton` y `distrito` como vistas de solo lectura sobre `nodo_geografico`, con los mismos nombres y columnas que hoy (`id`, `nombre`, `activo`, `codigo_dta`, `pais_id`, y `provincia_id` en `canton` y `canton_id` en `distrito`). Cada vista DEBE tener una fila por nodo de profundidad 1, 2 o 3, con los datos actuales del nodo. Ejemplo: un nodo de profundidad 2 llamado «Escazú», hijo de «San José», sale en `canton` con `provincia_id` = el id de «San José». |
| R2 | SI alguien intenta `INSERT`, `UPDATE` o `DELETE` sobre una de las vistas, ENTONCES la base DEBE rechazarlo con un error que nombre `nodo_geografico` y DEBE dejar todo sin cambios. Vale para `servi_app` y para el dueño de la base. |
| R3 | MIENTRAS una transacción corra con la empresa de un país, las vistas DEBEN devolver solo la geografía de ese país, como las políticas `*_del_pais` de hoy. En plataforma (sin empresa) DEBEN devolver todos los países, como hoy. |
| R4 | La migración DEBE quitar toda FK que apunte a las tablas viejas (las 3 de la orden, la de `zona_distrito.distrito_id` y la de `distrito_zona_especial.distrito_id`) y DEBE quitar el NOT NULL de `orden.provincia_id` y `orden.canton_id`. Ninguna columna se borra y ningún valor de una orden vieja cambia. |
| R5 | Tras la migración NO DEBE quedar ningún trigger de sincronía entre las tablas viejas y `nodo_geografico`, en ningún sentido. CUANDO el superadmin crea, renombra, retira o mueve un nodo de profundidad 1 a 3, la vista correspondiente DEBE mostrar el cambio en la misma transacción. |
| R6 | SI al aplicar la migración existe una orden (incluidas las borradas), una fila de `zona_distrito` o una de `distrito_zona_especial` con el nodo en NULL, ENTONCES la migración DEBE abortar sin cambiar nada y con un mensaje que diga cuántas filas de cada tabla faltan. |
| R7 | CUANDO se inserta una orden o se cambia su nodo, la base DEBE rechazar un nodo de otro país que el de la empresa con el error de hoy (`SL021`, `GeografiaDeOtroPais`). La comprobación DEBE leer el nodo, no las 3 FK. |
| R8 | CUANDO se inserta o cambia una fila de `zona_distrito` o de `distrito_zona_especial`, la base DEBE seguir rechazando geografía de otro país (`SL021`), leyendo el nodo de la fila. |
| R9 | SI se inserta una orden con alguna de las 3 FK y sin nodo (SQL a mano, fixtures), ENTONCES la base DEBE poner como nodo el lugar de esas FK (el distrito, o el cantón si no hay distrito), como hoy. SI la orden trae nodo, la base NO DEBE cambiarlo. |
| R10 | Los triggers de `orden` DEBEN costar ≤ 1 ms por fila en una carga masiva de prueba contra Postgres real (decisión heredada de SLT-43). |
| R11 | El `down.sql` de la migración DEBE devolver la base a como estaba antes: tablas viejas reales con sus filas copiadas de los nodos de profundidad 1–3, sus restricciones, índices, políticas y triggers (también los de sincronía); las FK y los NOT NULL de vuelta; y las 3 FK de cada orden nueva rellenadas desde la ruta de su nodo. Una ida y vuelta (`migration.sql` → `down.sql` → `migration.sql`) DEBE dejar el esquema y los datos iguales. |
| R12 | SI al aplicar el `down.sql` existe una orden cuyo nodo no se puede expresar con las 3 FK (un nodo de profundidad 4 o más, o de profundidad 1), ENTONCES el `down.sql` DEBE abortar sin cambiar nada y con un mensaje que diga cuántas órdenes son. (Ver pregunta P5.) |
| R13 | Toda operación destructiva de las migraciones de esta feature (`DROP CONSTRAINT`, `DROP NOT NULL`, `DROP TRIGGER`, `DROP FUNCTION`, `DROP TABLE` de las tablas viejas, `CREATE OR REPLACE FUNCTION`) DEBE estar declarada una por una en la guardia de migraciones. Cualquier otra operación destructiva DEBE ponerla en rojo. Cada migración DEBE traer su `down.sql` y ninguna migración ya aplicada DEBE editarse. |
| R14 | Ninguna migración de esta feature DEBE borrar columnas, borrar las vistas, tocar `pais.nivel_N_*` ni `digitos_codigo_nivel_N`, poner NOT NULL a `orden.nodo_geografico_id` ni renombrar `zona_distrito` o `distrito_zona_especial` (todo eso es de SLT-196 «Geografía jerárquica: borrar el modelo viejo»). |

### B. La orden guarda solo su nodo

| R | Requisito |
|---|---|
| R15 | CUANDO se crea una orden por cualquier vía (carga masiva, API v1, API v2 y creación con guía), el sistema DEBE guardar su nodo y DEBE dejar las 3 FK en NULL. |
| R16 | CUANDO se corrige la ubicación de una orden, el sistema DEBE guardar el nodo nuevo y DEBE poner las 3 FK en NULL, también en una orden vieja. |
| R17 | SI el lugar pedido para una orden nueva o para una corrección no es una hoja activa, ENTONCES el sistema DEBE rechazarlo sin guardar, con un mensaje que nombre el lugar y el tipo del nivel que falta. Ejemplo (Costa Rica): «Escazú» sin distrito se rechaza con un mensaje que pide el distrito. Un cantón sin distritos se acepta. |
| R18 | El sistema DEBE aceptar órdenes de países de 2 a 10 niveles con la misma regla de hoja. El mensaje «país aún no habilitado» NO DEBE salir nunca más. Ejemplo: en un país de 4 niveles, una orden en un barrio (nivel 4) entra; en uno de 2 niveles, una en un nodo de nivel 2 entra. |
| R19 | CUANDO la API v1 resuelve una ubicación por nombres de provincia, cantón y distrito, DEBE aplicar la misma regla de hoja. En un país de más de 3 niveles, el lugar que nombra v1 no es hoja, así que DEBE rechazarse con el mensaje de R17. |
| R20 | La migración y el código nuevo NO DEBEN reescribir ninguna orden vieja: sus 3 FK, su nodo, su zona y sus montos quedan como estaban. |
| R21 | La pantalla de geografía de plataforma NO DEBE mostrar el aviso de que las órdenes de un país con otra forma que 3 niveles quedan «aún no habilitadas». |

### C. Todo lector lee el árbol

| R | Requisito |
|---|---|
| R22 | El lugar de una orden DEBE ser su nodo en toda superficie (listado, gestión, satélite, novedades, guía, `/paquete`, asignaciones, envío, geocodificación, cierres, descargas). Para toda orden vieja, el resultado DEBE ser igual al de hoy. |
| R23 | El filtro por lugar de órdenes y de analítica DEBE seleccionar las órdenes cuyo nodo está en el conjunto pedido, también las nuevas con las 3 FK en NULL. Sobre las órdenes viejas, el resultado DEBE ser igual al de hoy. |
| R24 | El conteo de órdenes sin entregar de un lugar y la reconciliación de órdenes al guardar una zona DEBEN leer el nodo de la orden, con el mismo resultado de hoy sobre las órdenes viejas. |
| R25 | El informe de tránsito DEBE leer el lugar del nodo. Su título DEBE usar los tipos de los 2 niveles más hondos de la ruta de la orden, también si la orden está en el nivel 4 o más hondo. En Costa Rica sigue «CANTÓN · DISTRITO». |
| R26 | La ruta de una orden DEBE llegar al nivel de su nodo. En un país de 4 niveles, la descarga de órdenes DEBE llenar la cuarta columna de lugar de una orden de nivel 4 (cambia la expectativa de `e2e/geo-presentacion-4-niveles.spec.ts`, decisión «Nivel 4 de la orden»). |
| R27 | CUANDO se cierra un día, el cierre DEBE escribir las 3 columnas de nombre de `cierre_detail` con los niveles 1, 2 y 3 de la ruta del nodo, y DEBE escribir los ids de `ubicacion_snapshot` desde la ruta del nodo, no desde las 3 FK. En Costa Rica, el resultado de una orden vieja DEBE ser igual al de hoy. Los cierres ya hechos no cambian. |
| R28 | Las respuestas de la API v1 DEBEN conservar sus campos de provincia, cantón y distrito, llenados desde los niveles 1, 2 y 3 de la ruta del nodo. Para una orden vieja DEBEN ser iguales a hoy. |
| R29 | Ningún archivo de producción DEBE leer ni escribir las 3 FK de la orden. Lo vigila una guardia. |
| R30 | Las consultas calientes que cambian de las 3 FK al nodo (listado y filtros, conteo sin entregar, analítica, tránsito) NO DEBEN empeorar más de un 20 % (mediana de 5) ni sumar un Seq Scan nuevo sobre `orden`. Lo mide una persona sobre la copia de producción con los scripts `geo:explain-*`, y el resultado va al PR. Si el listado empeora, la primera mitigación es llevar los nombres al catálogo. |

### D. Tarifas: mismo resultado

| R | Requisito |
|---|---|
| R31 | El precio de una orden DEBE leer su nodo y no las 3 FK. Una orden cuyo nodo es un distrito DEBE usar el grupo de tarifas del distrito, como hoy. Una orden sin distrito (en Costa Rica, un cantón sin distritos) DEBE seguir sin grupo y DEBE usar la tarifa base (SLT-89 R20). Cómo se aplica esto en un país que no es de 3 niveles está en la pregunta P3. |
| R32 | Para toda orden vieja, la cotización, el cobro de entrega, el de devolución, el de rechazo, la lectura de órdenes de la API y el cierre DEBEN dar los mismos montos, la misma zona y la misma marca de zona especial que hoy. Ningún cobro cambia. |
| R33 | Antes del merge, una persona DEBE correr los scripts de equivalencia `geo:equivalencia-*` sobre la copia de producción con esta feature aplicada, y todos DEBEN salir con 0. La salida va al PR. Ningún agente toca producción ni su copia. |

### E. Mover un nodo

| R | Requisito |
|---|---|
| R34 | DONDE el usuario es superadmin, el sistema DEBE permitir mover un nodo a otro padre de la misma profundidad que su padre actual, dentro del mismo país. Ningún otro rol DEBE poder hacerlo: la acción responde `forbidden` y no escribe. |
| R35 | SI el destino no existe, es de otro país, es de otra profundidad, es el padre actual, o el nodo a mover es una raíz, ENTONCES el sistema DEBE rechazar el movimiento sin escribir, con un mensaje que diga el motivo. SI el padre destino ya tiene un hijo con el mismo nombre, ENTONCES DEBE responder `conflict` sin escribir. |
| R36 | ANTES de mover, el sistema DEBE mostrar un modal antes → después con: la ruta actual y la nueva del nodo, cuántos nodos cuelgan de él y cuántas órdenes cambian el nombre de lugar que muestran. Las validaciones de R35 DEBEN correr al abrir el modal, no solo al guardar. |
| R37 | CUANDO se confirma el movimiento, SI el padre del nodo ya no es el que mostró el modal, ENTONCES el sistema DEBE responder `cambio_concurrente` sin escribir. |
| R38 | CUANDO un movimiento se guarda, el sistema DEBE registrar en el historial de plataforma, en la misma transacción, una acción «nodo movido» con la ruta del padre anterior, la del nuevo, el actor y el país. |
| R39 | CUANDO un nodo se mueve, toda orden ya creada en él o debajo DEBE mostrar la ruta nueva (ejemplo: San Rafael pasa de Escazú a Santa Ana y sus órdenes muestran «Santa Ana › San Rafael»), y DEBE conservar su zona. El movimiento NO DEBE escribir ninguna fila de `orden`. |
| R40 | CUANDO un nodo se mueve, el precio y la marca de zona especial de toda orden abierta en él o debajo NO DEBEN cambiar (decisión «Mover un nodo»). Cómo se garantiza está en la pregunta P1. |
| R41 | CUANDO un nodo se mueve, una orden nueva en él DEBE usar la zona, el grupo y la marca de su posición nueva. |

### F. Pantallas de N niveles

| R | Requisito |
|---|---|
| R42 | Ninguna pantalla de esta feature DEBE implementarse antes de que el humano apruebe su maqueta. La maqueta cubre la pantalla de mover un nodo y las de R43–R46, en un país de 2, 3 (Costa Rica), 4 y 10 niveles. La aprobación (fecha, referencia y quién) queda en `progress/impl_SLT-48.md`. |
| R43 | El aviso y el modal de corregir ubicación DEBEN pedir un lugar por cada nivel del país, con el nombre del tipo de cada nivel, hasta llegar a una hoja. En Costa Rica DEBEN verse como hoy: provincia, cantón y distrito. |
| R44 | Las etiquetas de lugar del historial de acciones DEBEN mostrar la ruta entera del lugar, de cualquier profundidad, con el separador y el orden de hoy. En Costa Rica DEBEN salir iguales que hoy. |
| R45 | Las pantallas de tarifas (grupos) y de zonas DEBEN mostrar los niveles del país, con sus nombres de tipo y hasta el nivel P. En Costa Rica DEBEN verse como hoy. |
| R46 | En un país de 4 niveles, la plantilla de carga masiva DEBE traer una columna por nivel, y una fila con los 4 niveles DEBE crear la orden en el nodo de nivel 4. La plantilla de Costa Rica no cambia. |
| R47 | Ningún texto de nivel DEBE ir escrito a mano en el código de las pantallas: los tipos salen del país (guardia `etiquetas-geograficas-sin-literal`). |

### G. Alcance

| R | Requisito |
|---|---|
| R48 | Esta feature NO DEBE cambiar lo que es de SLT-196 «Geografía jerárquica: borrar el modelo viejo» (ver «Lo que NO entra»): `NivelGeografico`, `PROFUNDIDAD_DEL_NIVEL`, las listas planas del catálogo de filtros, `_shared/zona-colapso.ts`, las columnas viejas y las 3 columnas de nombre de `cierre_detail`. Tampoco DEBE dar grupo de tarifas a una orden sin distrito. |
| R49 | Los E2E de los flujos críticos que esta feature toca DEBEN pasar sin cambiar sus aserciones: asignación y recepción, cierres de día y su revisión, wallet y liquidación, devoluciones y aislamiento entre empresas (`e2e/dos-empresas-humo.spec.ts`). Solo cambia la expectativa de `e2e/geo-presentacion-4-niveles.spec.ts` (R26). |

### Mapa decisión → requisitos

| Decisión cerrada | Requisitos |
|---|---|
| ¿Una ficha o varias? (dos; deploy 1 entero aquí) | R14, R48 |
| ¿A qué nodo apunta una orden? | R15–R19, R20 |
| Tarifas | R31, R32 |
| Pantallas con 3 niveles fijos (SLT-125 P6) | R42–R47 |
| Consumidores externos: ninguno | R1 (las vistas conservan nombres y columnas; nada más se protege) |
| Mover un nodo: órdenes ya creadas | R39–R41 |
| Observación de un cierre mensual antes de SLT-196 | R14, R48 (nada irreversible entra aquí) |
| Migraciones (`down.sql`, excepción declarada) | R11–R13 |
| Tope del trigger de `orden` | R10 |
| Snapshot del cierre | R27 |
| Equivalencia sobre la copia de producción | R30, R33 |
| Mover nodos (corrige sin reescribir) | R34–R39 |
| Niveles (2 a 10) | R18 |
| Pantallas con maqueta aprobada | R42 |
| Escrituras con modal antes → después y control de concurrencia | R36, R37, R43 |
| Rendimiento (nombres al catálogo primero) | R30 |
| Nombres internos `provincia/canton/distrito` | R1, R28 |
| Nivel 4 de la orden | R26 |
| Producción (backup, ningún agente, build de `prod`) | R33, R49 (y `tasks.md`, tanda de cierre) |

## Preguntas abiertas

> Escritas por `spec_author` el 2026-11-17. Ninguna bloquea la tanda de base de datos; cada una dice qué
> requisito y qué tarea espera la respuesta, y qué propone el diseño mientras tanto.

**P1 — Mover un nodo cuando el grupo de tarifas o la marca especial vienen del padre viejo.**
Hoy el precio de una orden abierta no está congelado: se calcula con el grupo y la marca de zona especial
que hereda subiendo por el árbol. Ejemplo: el grupo «GAM Oeste» de la zona Oeste incluye el cantón Escazú
entero. San Rafael (distrito de Escazú) no tiene grupo propio y hereda «GAM Oeste». Si San Rafael pasa a
Santa Ana, que es de otra zona, una orden abierta de San Rafael (zona Oeste, guardada) ya no encuentra
«GAM Oeste» al subir y caería a la tarifa base: su precio cambiaría, y la decisión dice que no cambia.
¿Qué hacemos?
- (a) **Bloquear el movimiento** mientras haya órdenes abiertas afectadas: el modal dice cuántas y de qué
  empresas, y el superadmin espera a que se cierren o pide a la empresa que ajuste el grupo.
- (b) Mover y congelar el grupo y la marca de esas órdenes en ellas (columna nueva en `orden`).
- (c) Mover y aceptar que esas órdenes cambien de precio.
El diseño propone (a): no toca `orden` ni el esquema. Esperan la respuesta R40 y la tarea T3.3.

**P2 — ¿Una hoja puede tener hijos retirados?**
Ejemplo: un cantón cuyos distritos están todos retirados. Si los hijos retirados cuentan, ese cantón no es
hoja y nadie puede crear órdenes ahí hasta reactivar un distrito. Si no cuentan, el cantón pasa a ser
hoja y acepta órdenes. ¿Hoja = «sin hijos» o «sin hijos activos»? El diseño propone «sin hijos activos».
Esperan R17 y T2.1.

**P3 — Grupo de tarifas en países que no son de 3 niveles.**
La decisión «Tarifas» habla de distritos, que es la forma de Costa Rica. Ejemplo: en un país de 4 niveles
(región › comuna › sector › barrio) una orden va a un barrio (nivel 4); en uno de 2 niveles (departamento
› municipio), a un municipio (nivel 2). ¿Desde qué nodo se busca el grupo?
- (a) Desde el nodo de la orden, si está en el nivel 3 o más hondo; más arriba, sin grupo (en Costa Rica
  da lo mismo que hoy).
- (b) Desde el nodo de la orden, a cualquier profundidad, salvo en Costa Rica, que sigue como hoy.
- (c) Sin grupo fuera de Costa Rica hasta otra ficha.
El diseño propone (a). Esperan R31 y T2.4.

**P4 — Mover bajo un padre retirado.**
Ejemplo: el superadmin quiere pasar San Rafael bajo un cantón que está retirado. Si se permite, San
Rafael queda retirado en cascada y sus órdenes nuevas dejan de entrar. ¿Se permite (con aviso en el
modal) o se rechaza? El diseño propone rechazarlo. Esperan R35 y T3.1.

**P5 — Volver atrás (`down.sql`) con órdenes que el modelo viejo no sabe guardar.**
Si en producción ya se crearon órdenes en un país de 4 niveles (en el nivel 4), las tablas viejas no
tienen dónde ponerlas. El diseño propone que el `down.sql` aborte sin cambiar nada y diga cuántas son
(R12): volver atrás exigiría antes decidir qué hacer con esas órdenes. La otra opción es volver atrás
dejando las 3 FK de esas órdenes en NULL y sin el NOT NULL. ¿Vale abortar? Espera T1.3.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Una ficha o varias? | Dos. El deploy 2 (borrado irreversible) va a SLT-196. El deploy 1 queda entero en SLT-48, en un solo PR y con su tamaño aceptado (~35-50 archivos de producción y 60-90 de tests). |
| 2026-11-17 | ¿A qué nodo apunta una orden? | A la hoja de su rama, en todos los países: el último nodo de su rama. En Costa Rica deja de entrar una orden con solo cantón si ese cantón tiene distritos. Las órdenes viejas no cambian. Reemplaza la regla de SLT-45 «solo profundidad 2 o 3» y termina «país aún no habilitado» (SLT-46 R29). |
| 2026-11-17 | Tarifas | El precio pasa a leer el nodo, pero el resultado no cambia. Con distrito, la orden usa el grupo del distrito. Sin distrito, sigue sin grupo y usa la tarifa base (SLT-89 R20). Ningún cobro cambia. |
| 2026-11-17 | Pantallas con 3 niveles fijos (SLT-125 P6) | Entran en SLT-48 y pasan a N niveles, con maqueta antes: el aviso y el modal de corregir ubicación, las etiquetas del historial, las pantallas de tarifas y de zonas, y la plantilla de carga masiva. |
| 2026-11-17 | ¿Hay consumidores externos que leen la base (BI, reportes)? | No hay ninguno. |
| 2026-11-17 | Mover un nodo: ¿qué pasa con las órdenes ya creadas? | Solo cambia el nombre del lugar que muestran, porque leen el padre del árbol. Conservan la zona y el precio que tenían al crearse. Las órdenes nuevas en ese nodo usan la zona y el precio de su posición nueva. Ejemplo: San Rafael pasa de Escazú a Santa Ana; sus órdenes viejas muestran «Santa Ana › San Rafael» con su zona y su precio de siempre. |
| 2026-11-17 | ¿Cuánto se observa SLT-48 en producción antes de SLT-196? | Un cierre mensual completo, incluida una factura de planes, con SLT-48 en producción. |
| heredada SLT-43 | Migraciones | Cada migración lleva su `down.sql` y no edita migraciones aplicadas. El `down.sql` de este deploy restaura las tablas desde los nodos. Los DROP de FK, NOT NULL y triggers de este deploy van con la excepción declarada en la guardia de migraciones aditivas. |
| heredada SLT-43 | Tope del trigger de `orden` | ≤ 1 ms por fila en una carga masiva de prueba. Los triggers llevan tests de integración contra Postgres real. |
| heredada SLT-43 / SLT-125 | Snapshot del cierre | `cierre_detail.ubicacion_snapshot` saca los ids del nodo, porque las FK de la orden quedan en NULL. |
| heredada SLT-44 / SLT-65 / SLT-71 | Equivalencia | La equivalencia y los tiempos se miden sobre la copia de producción. Los corre una persona antes del merge; ningún agente toca producción ni su copia. El resultado va al PR. |
| heredada SLT-46 | Mover nodos | Va en SLT-48. Corrige las órdenes viejas sin reescribirlas: leen el padre del árbol. |
| heredada SLT-46 P2 | Niveles | Países de 2 a 10 niveles. |
| heredada SLT-46 P9 / SLT-89 P2 / SLT-47 | Pantallas | Toda pantalla espera una maqueta aprobada por el humano. El backend avanza antes. |
| heredada SLT-46 / SLT-89 | Escrituras | Toda escritura pasa por el modal antes → después, con validación previa y control de cambio concurrente. Esto aplica a mover nodos y a corregir ubicación. |
| heredada SLT-65 | Rendimiento | Si el listado empeora, la primera mitigación es llevar los nombres al catálogo, antes que crear un índice. |
| heredada SL-20 / SLT-125 | Nombres internos | `provincia/canton/distrito` se quedan en la base, el código y la API v1. Cada superficie conserva su separador y su orden. |
| heredada SLT-125 P1 | Nivel 4 de la orden | Hasta SLT-48 la cuarta columna salía vacía. Desde aquí se llena, y la expectativa de `e2e/geo-presentacion-4-niveles.spec.ts` cambia. |
| heredada épica | Producción | Hay backup verificado antes de la release y ningún agente toca la base de producción. Las migraciones las aplica el build de `prod`. |
