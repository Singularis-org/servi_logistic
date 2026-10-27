# SL-20 — pais-geografia-configurable · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: SL-17 · Rama: feature/SL-20-pais-geografia-configurable
>
> **Alcance.** Tabla de países (plataforma) y país fijo por empresa; las empresas existentes y las
> fábricas de tests quedan en Costa Rica. Provincia, cantón y distrito cuelgan del país, con el nombre
> de cada nivel definido por país; la UI muestra esos nombres. Pantalla de geografía del superadmin:
> alta de país, carga de su división por CSV y edición nodo a nodo (alta, renombre, retiro,
> reactivación). Cierra D15 y la parte de geografía de D12 (`progress/deudas.md`).
>
> **Lo que NO entra.** Teléfono, documento de identidad y zona horaria por país → SLT-42 «Teléfono,
> documento y hora por país». Moneda e impuestos → SL-21. Métodos de pago → SL-22. Renombrar
> `provincia`/`canton`/`distrito` en código, DB o API. Cargar un segundo país real. Empresas, planes y
> módulos del panel de superadmin → SL-26.
>
> Sembrado por `/afinar-feature` el 2026-10-26. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` (F1.2, 2026-10-26). «Superadmin» es todo rol de `ROLES_PLATAFORMA`
> (`lib/auth/plataforma.ts`). «Nodo» es una provincia, un cantón o un distrito. «Nivel 1/2/3» son
> provincia/cantón/distrito. La columna «Decisión» dice qué fila de la tabla de decisiones cubre.
>
> **(enmienda 2026-10-26)** Decisiones 1–7 de `progress/features/SL-20.md > Decisiones` (Camilo,
> F2.1). Cambian R9, R23 y R34; entran R40–R51. «Disponible» es un país con cobertura
> (`pais.disponible`). «Catálogo» es el catálogo ISO 3166-1 del repo (R40).

### País

| R | Requisito | Decisión |
|---|---|---|
| R1 | El sistema DEBE guardar una tabla de países de plataforma en la que cada país tiene un código ISO 3166-1 alfa-2 único, un nombre único y el nombre en singular y en plural de cada uno de sus tres niveles. | Niveles; Alta de país |
| R2 | CUANDO se aplican las migraciones de SL-20, el sistema DEBE dejar cargado el país Costa Rica (código `CR`, niveles «Provincia/Provincias», «Cantón/Cantones», «Distrito/Distritos») y DEBE colgar de él todas las provincias, cantones y distritos que la base ya tenía, sin cambiar sus `id`, nombres, estado ni código oficial. | Qué países funcionan |
| R3 | SI una operación en el contexto de una empresa intenta crear, modificar o borrar un país, ENTONCES el sistema DEBE rechazarla sin escribir nada. | Precedentes (SL-17) |

### Empresa y país

| R | Requisito | Decisión |
|---|---|---|
| R4 | El sistema DEBE asociar cada empresa a exactamente un país. | Empresa y país |
| R5 | CUANDO se aplican las migraciones de SL-20, el sistema DEBE dejar en Costa Rica a toda empresa que ya existía. | Empresa y país |
| R6 | CUANDO el superadmin da de alta una empresa, el sistema DEBE exigir el país; SI falta o no existe, ENTONCES DEBE responder `invalida` con el campo `paisId` sin crear la empresa ni su maestro. | Empresa y país |
| R7 | SI cualquier escritura, de la app o de SQL a mano, intenta cambiar el país de una empresa existente, ENTONCES la base DEBE rechazarla y el país DEBE quedar como estaba. | Empresa y país |
| R8 | SI se repite el alta de una empresa existente (mismo slug y mismo maestro) con otro país, ENTONCES el sistema DEBE responder `conflicto` con el campo `paisId` sin cambiar nada. | Empresa y país |
| R9 | La pantalla «Empresas» del superadmin DEBE mostrar el país de cada empresa (esté o no disponible) y, en el alta, DEBE ofrecer la lista de países **disponibles** sin ninguno preseleccionado. **(enmienda 2026-10-26: «disponibles», decisión 6)** | Empresa y país; Enmienda 6 |
| R10 | DONDE un test crea una empresa sin indicar país (fábricas de `tests/fabricas/` o SQL a mano), el sistema DEBE dejarla en Costa Rica. | Empresa y país |

### Geografía por país

| R | Requisito | Decisión |
|---|---|---|
| R11 | El sistema DEBE hacer que toda provincia pertenezca a un país, y que todo cantón y todo distrito pertenezcan al país de su padre; SI una escritura deja un nodo en un país distinto del de su padre, ENTONCES la base DEBE rechazarla. | Niveles |
| R12 | MIENTRAS una operación corre en el contexto de una empresa, el sistema DEBE devolver solo provincias, cantones y distritos del país de esa empresa, en toda lectura: árbol de Tarifas, listas de filtros, resolución de la carga masiva y de la API, cotización y corrección de datos de la orden. | Empresa y país; Precedentes (SL-17) |
| R13 | SI una orden, una asociación zona–distrito o una marca de zona especial de una empresa apunta a una provincia, un cantón o un distrito de otro país, ENTONCES la base DEBE rechazar la escritura sin guardar nada. | Empresa y país; Precedentes (SL-38) |
| R14 | El sistema DEBE aceptar una orden sin distrito en cualquier país, igual que hoy en Costa Rica. | Niveles |
| R15 | SI una escritura del superadmin intenta dar a un nodo un nombre que, normalizado (sin mayúsculas, acentos ni espacios repetidos), ya usa otro nodo con el mismo padre —o, para una provincia, otra provincia del mismo país—, ENTONCES el sistema DEBE responder `conflict` sin escribir nada. | Precedentes (374) |
| R16 | El sistema DEBE admitir nodos sin código oficial y DEBE rechazar dos nodos del mismo nivel y del mismo país con el mismo código; dos países distintos PUEDEN repetir un código. | Código oficial |
| R17 | DONDE el país tiene regla de código (solo Costa Rica: 1, 3 y 5 dígitos, y el código del padre como prefijo del hijo), el sistema DEBE rechazar un código que no la cumpla; DONDE el país no la tiene, el sistema DEBE aceptar como código cualquier texto de 1 a 20 caracteres sin espacios. | Código oficial |
| R18 | Los campos de la API pública, las columnas de la base y los nombres del código DEBEN seguir siendo `provincia`, `canton` y `distrito` en todos los países. | Nombres internos |

### Nombres visibles de los niveles

| R | Requisito | Decisión |
|---|---|---|
| R19 | MIENTRAS una persona de una empresa usa la app, el sistema DEBE nombrar cada nivel con el nombre que le da el país de su empresa en las pantallas, filtros, columnas, descargas y formularios que hoy dicen «Provincia», «Cantón» o «Distrito» (lista cerrada en `design.md > §7`). | Niveles; Nombres internos |
| R20 | MIENTRAS el superadmin trabaja la geografía de un país, la pantalla DEBE nombrar los niveles con los nombres de ese país. | Niveles |

### Pantalla de geografía del superadmin

| R | Requisito | Decisión |
|---|---|---|
| R21 | El sistema DEBE ofrecer la pantalla `/plataforma/geografia` y su ítem de menú solo al superadmin; SI la pide cualquier otro rol, ENTONCES DEBE responder 404 antes de leer la base. | Quién da de alta un país; Precedentes (SL-17) |
| R22 | El sistema DEBE dejar de servir `/configuracion/geografia`: responde 404 a todo rol. | Quién da de alta un país (D15) |
| R23 | CUANDO el superadmin da de alta un país eligiéndolo del catálogo (R40) y con los seis nombres de nivel válidos, el sistema DEBE crearlo sin geografía, con el código y el nombre que da el catálogo para ese país; SI el código o el nombre (normalizado) ya están dados de alta, ENTONCES DEBE responder `conflict` con el campo (`id` o `nombre`) sin crear nada. **(enmienda 2026-10-26: el código y el nombre salen del catálogo, decisión 5)** | Quién da de alta un país; Enmienda 5 |
| R24 | CUANDO el superadmin carga para un país un CSV válido (formato en `design.md > §6`), el sistema DEBE crear las provincias, cantones y distritos que falten, en una sola transacción, y DEBE devolver cuántos creó por nivel, cuántos ya existían y cuántos códigos completó. | Quién da de alta un país |
| R25 | SI el CSV tiene una o más filas inválidas, ENTONCES el sistema NO DEBE escribir nada y DEBE devolver cada error con su número de línea y su motivo. | Quién da de alta un país |
| R26 | CUANDO una fila del CSV nombra un nodo que ya existe, el sistema NO DEBE cambiar su nombre, su estado (activo o retirado) ni su código, salvo poner el código de la fila si el nodo no tenía ninguno. | Quién da de alta un país; Precedentes (374) |
| R27 | SI el CSV repite una fila, ENTONCES el sistema DEBE contarla una sola vez; SI dos filas dan datos contradictorios del mismo nodo (mismo código con distinto nombre, o mismo nombre con distinto código), ENTONCES DEBE tratarlas como inválidas (R25). | Quién da de alta un país |
| R28 | SI el archivo no es CSV en UTF-8, pesa más de 5 MB, tiene más de 10 000 filas de datos o le falta una columna obligatoria, ENTONCES el sistema DEBE rechazarlo entero sin escribir nada. | Quién da de alta un país |
| R29 | CUANDO el superadmin da de alta un nodo a mano (una provincia en un país, un cantón bajo una provincia o un distrito bajo un cantón), con código opcional, el sistema DEBE crearlo activo aplicando R15, R16 y R17. | Quién da de alta un país; Código oficial |
| R30 | CUANDO el superadmin renombra, retira o reactiva un nodo, el sistema DEBE hacerlo como hoy (ficha 374/375): el retiro no borra la fila ni toca a sus descendientes, y pedir el estado que el nodo ya tiene es éxito sin escribir. | Quién da de alta un país; Precedentes (374) |
| R31 | CUANDO el superadmin pide confirmar el retiro de un nodo, el sistema DEBE mostrar cuántas órdenes sin entregar, de todas las empresas, cuelgan de ese nodo; SI el conteo falla, ENTONCES la pantalla DEBE decirlo y NO DEBE impedir el retiro. | D15: retiro |
| R32 | Las operaciones de R23–R31 DEBEN completarse con un superadmin que no pertenece a ninguna empresa, sin fallar con `EmpresaNoResuelta`. | D15: historial; D15: retiro |

### Historial de plataforma (D15)

| R | Requisito | Decisión |
|---|---|---|
| R33 | CUANDO el superadmin crea un país, carga un CSV que escribe algo, da de alta, renombra, retira o reactiva un nodo, el sistema DEBE guardar, en la misma transacción que el cambio, una fila en el historial de plataforma con la acción, la entidad, el país, el actor (id y nombre congelado), la fecha y, en el renombre, el nombre anterior y el nuevo. | D15: historial |
| R34 | SI una operación en el contexto de una empresa intenta leer o escribir el historial de plataforma, ENTONCES la base DEBE rechazar la lectura y la escritura (permiso denegado, `42501`) sin devolver ni escribir ninguna fila. **(enmienda 2026-10-26: «la base rechaza la lectura», decisión 7)** | D15: historial; Enmienda 7 |
| R35 | Las escrituras de geografía del superadmin NO DEBEN escribir en `historial_accion`. | D15: historial |

### Errores honestos y lectura de la empresa (D12)

| R | Requisito | Decisión |
|---|---|---|
| R36 | SI el alta o el renombre de un nodo falla por un motivo que no es el nombre o el código repetido, ENTONCES la acción NO DEBE responder `conflict`: DEBE responder `error` y registrar la causa en el log del servidor. | Precedentes (374); D12 |
| R37 | SI un rol de empresa invoca cualquier escritura de geografía o de país, ENTONCES el sistema DEBE responder `forbidden` sin tocar la base; el `maestro` DEBE seguir leyendo el árbol de su país en Tarifas. | Precedentes (SL-17, SL-32) |
| R38 | La marca de zona especial DEBE seguir siendo de cada empresa y solo DEBE poder ponerse sobre distritos del país de esa empresa. | Precedentes (SL-38) |

### Verificación

| R | Requisito | Decisión |
|---|---|---|
| R39 | Con dos empresas en dos países de prueba, una suite de integración DEBE demostrar R12, R13 y R38 sobre la base real (rol `servi_app` y RLS), sin E2E nuevo. | E2E |

### Catálogo ISO y alta de país (enmienda 2026-10-26)

| R | Requisito | Decisión |
|---|---|---|
| R40 | El sistema DEBE llevar en un archivo del repo, sin dependencia de terceros, un catálogo de países ISO 3166-1 con el código alfa-2 y el nombre en español de cada uno, sin códigos repetidos ni nombres (normalizados) repetidos. | Enmienda 5 |
| R41 | SI el alta de país trae un código que no está en el catálogo, ENTONCES el sistema DEBE responder `validation_error` sobre el campo `id` sin crear nada. | Enmienda 5 |
| R42 | La pantalla de alta de país DEBE elegir el país con un autocompletado sobre el catálogo, sin campo para teclear el código, y DEBE pedir a mano los seis nombres de nivel. | Enmienda 5 |
| R43 | La tabla de países DEBE guardar solo los países dados de alta: las migraciones de SL-20 NO DEBEN volcar el catálogo en la base, y tras aplicarlas el único país es Costa Rica. | Enmienda 5; Qué países funcionan |

### Disponibilidad de un país (enmienda 2026-10-26)

| R | Requisito | Decisión |
|---|---|---|
| R44 | El sistema DEBE guardar por país si está disponible (hay cobertura). CUANDO se aplican las migraciones, todo país que ya existía DEBE quedar disponible, y un país nuevo DEBE nacer disponible salvo que se diga lo contrario. | Enmienda 6 |
| R45 | MIENTRAS un país no está disponible, el alta de empresa NO DEBE ofrecerlo; SI un alta de empresa nueva llega con ese país, ENTONCES el sistema DEBE responder `invalida` con el campo `paisId` sin crear la empresa ni su maestro. | Enmienda 6; Empresa y país |
| R46 | CUANDO un país deja de estar disponible, sus empresas existentes DEBEN seguir en ese país y seguir leyendo y usando su geografía igual que antes. | Enmienda 6; Empresa y país |
| R47 | CUANDO el superadmin enciende o apaga la disponibilidad de un país, el sistema DEBE guardarla y, en la misma transacción, una fila en el historial de plataforma (como R33); pedir el estado que el país ya tiene DEBE ser éxito sin escribir; SI lo pide un rol de empresa, ENTONCES DEBE responder `forbidden` sin tocar la base. | Enmienda 6; D15: historial |

### Casos del CSV y contrato de la carga (enmienda 2026-10-26)

| R | Requisito | Decisión |
|---|---|---|
| R48 | SI la cabecera del CSV trae columnas que no son del formato, ENTONCES el sistema DEBE ignorarlas y DEBE devolver un aviso por cada una en `avisos`, tanto con la carga buena como con la inválida. | Enmienda 4 |
| R49 | SI bajo un mismo padre la base tiene dos nodos con el mismo nombre normalizado y una fila del CSV nombra ese nodo, ENTONCES el sistema DEBE cruzarla con el primero de ellos (orden por `id`) sin dar error. | Enmienda 4 |
| R50 | CUANDO una fila del CSV da de alta un nodo bajo un padre retirado, el sistema DEBE crearlo activo y DEBE dejar al padre retirado. | Enmienda 4; Precedentes (374) |
| R51 | SI la carga CSV pide un país que no existe, ENTONCES el sistema DEBE responder `not_found` sin escribir nada; SI la base falla al escribir, ENTONCES DEBE responder `error` sin dejar nada escrito. | Enmienda 4; D12 |
| R52 | SI el alta a mano de un nodo trae un código que ya usa otro nodo del mismo nivel y país, ENTONCES el sistema DEBE responder `conflict` sin escribir nada (la base lo frena por su único, R16). | Código oficial; Enmienda 4 |

### Decisiones de la enmienda (2026-10-26)

Las tomó Camilo en F2.1; el texto fuente está en `progress/features/SL-20.md > Decisiones`. La columna
«Decisión» las cita como «Enmienda N». Las 1–3 son de diseño y no generan requisito propio: van en
`design.md §2.3`, `§3` y `§9`.

| N | Decisión |
|---|---|
| 1 | Orden de migraciones A: `organizacion_pais` antes que `geografia_por_pais`. |
| 2 | FK compuestas de cantón y distrito hacia el país del padre con `ON UPDATE RESTRICT`. |
| 3 | La demo de QA (SL-43) da de alta sus empresas en Costa Rica (`CR`). |
| 4 | CSV: columnas de más → `avisos`; homónimos en base → gana el primero; alta bajo padre retirado permitida (el hijo nace activo). |
| 5 | Catálogo ISO 3166-1 (alfa-2 + nombre en español) en un archivo del repo, sin dependencia; autocompletado en el alta de país; nombres de nivel a mano; `pais` guarda solo los dados de alta. |
| 6 | `pais.disponible` (booleano, `true` por defecto) = hay cobertura. Con `false` no se ofrece en el alta de empresa; las empresas existentes siguen igual; el superadmin lo enciende y apaga. |
| 7 | R34 acepta el `42501` del `REVOKE ALL`: «la base rechaza la lectura». |

## Preguntas abiertas

- Formato exacto del CSV de carga (columnas, codificación, qué pasa con filas repetidas o con nodos
  ya existentes). Lo propone `spec_author` en `design.md` y lo aprueba el humano en F1.4.
  **Propuesta escrita** en `design.md > §6` (columnas, UTF-8, coma, una transacción, todo o nada,
  repetidas y existentes) y reflejada en R24–R28. Pendiente de aprobación en F1.4.
- D15 tenía como dueño a Carlos Restrepo («quien tome SL-26»). La decisión la tomó Camilo el
  2026-10-26 al traer la pantalla a SL-20; Carlos debe confirmarla en la aprobación del spec (F1.4).

Nuevas (spec_author, F1.2). Cada una lleva la propuesta del spec; el humano la confirma o la cambia
en F1.4:

- **Carga masiva de órdenes y mensajes de `resolveGeo`.** Las cabeceras de la plantilla de carga
  (`provincia`, `canton`, `distrito`), sus mensajes de error («provincia no encontrada»…) y el
  catálogo de variables de `lib/types/plantilla-datos.ts` son contrato con tiendas y con la API
  (`lib/services/geo-resolucion.ts`). Propuesta: **no cambian en SL-20** (con solo Costa Rica cargado
  dicen lo mismo); los adapta la ficha que cargue el segundo país real. Si el humano quiere lo
  contrario, entra en R19 y crece `## Archivos esperados`.
- **¿Quién lee el historial de plataforma?** El alcance no trae pantalla. Propuesta: SL-20 solo lo
  escribe (R33) y lo prueba en integración; la pantalla de lectura va a SL-26 «Panel de superadmin».
- **Plural de cada nivel.** La UI dice hoy «Cantones», «Distritos». Propuesta: el país guarda
  singular y plural (R1), porque el plural en español no se deriva bien a mano («Cantón» → «Cantones»).
- **Identidad del país.** Propuesta: la clave del país es su código ISO 3166-1 alfa-2 (`CR`), y los
  países de prueba usan el rango reservado `XA`–`XZ` (`design.md > §2.1`).
- **Cotas del CSV y del código.** 5 MB (el `bodySizeLimit` de las Server Actions en
  `next.config.ts`), 10 000 filas y código de 1 a 20 caracteres son propuestas, no datos del repo:
  Costa Rica son 585 nodos y su código más largo tiene 5 caracteres.
- **Costo del trigger en `orden`.** R13 añade una consulta por `INSERT`/`UPDATE` de la geografía de
  una orden (precedente medido: D13, ~0,27 ms por FK). Propuesta: aceptarlo y medirlo en T6.3.

Nuevas (spec_author, enmienda 2026-10-26). Bloquean solo las tareas que se citan:

- **Fuente de la lista ISO 3166-1 en español (R40).** El repo no tiene ningún catálogo de países
  (Grep del 2026-10-26: solo `lib/config/pais.ts` nombra la norma, sin lista). El spec no inventa la
  lista ni su fuente: el humano tiene que decir de dónde sale (y su fecha de corte) antes de T2.4.
- **¿Un país recién dado de alta nace disponible?** La decisión 6 dice `true` por defecto, y R44 la
  aplica tal cual: un país sin geografía cargada se ofrecería en el alta de empresa desde el primer
  minuto. Propuesta: el alta de país lo deja como manda el `DEFAULT` y el superadmin lo apaga si hace
  falta. Si el humano prefiere que nazca apagado, cambia R44 y la action de alta (T2.5), no la columna.
- **Repetir el alta de una empresa existente cuyo país ya no está disponible.** R8 ya trata la
  repetición con otro país. Propuesta: con el mismo país, la repetición se comporta como hoy (la
  empresa existente «sigue igual», R46) y R45 solo frena altas nuevas.
- **Historial del cambio de disponibilidad (R47).** D15 manda que toda acción del superadmin vaya al
  historial de plataforma. Propuesta: dos valores nuevos del enum, `pais_disponibilidad_activada` y
  `pais_disponibilidad_desactivada` (`design.md §2.6`), con el patrón de `nodo_geografico_*`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-26 | ¿Qué países funcionan al cerrar? | Solo Costa Rica cargado; el modelo admite más países solo con cargar datos. |
| 2026-10-26 | ¿Empresa y país? | Un país por empresa, fijado en el alta, no cambia. Las existentes migran a Costa Rica. |
| 2026-10-26 | ¿Niveles? | Siempre tres, con nombre por país (CR: Provincia/Cantón/Distrito). El tercero sigue opcional en la orden. |
| 2026-10-26 | ¿Nombres internos? | Se mantienen `provincia`/`canton`/`distrito` en DB, código y API; solo cambian las etiquetas visibles. |
| 2026-10-26 | ¿Quién da de alta un país? | El superadmin, por pantalla: CSV de los tres niveles + edición a mano. |
| 2026-10-26 | ¿Código oficial? | Libre, opcional, único dentro del país. La regla de prefijo 1/3/5 dígitos solo vale para CR. |
| 2026-10-26 | D15: ¿dónde se registra una acción del superadmin? | Historial propio de plataforma, aparte de `historial_accion`; ninguna empresa lo ve. |
| 2026-10-26 | D15: ¿qué cuenta el retiro de un nodo para el superadmin? | Órdenes sin entregar de todas las empresas del país. |
| 2026-10-26 | ¿E2E? | No: unit + integración, con dos empresas en dos países de prueba. |
| 2026-10-26 | Precedentes | Hereda SL-17 (geografía y país = plataforma, solo lectura para la empresa), ficha 374 (retiro por `activo`, unicidad por padre) y SL-38 (zona especial por empresa). |
