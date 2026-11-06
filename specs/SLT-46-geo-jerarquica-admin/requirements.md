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
> Los requisitos que dependen de una pregunta abierta lo dicen con «(P<n>)»: se escriben con la
> propuesta y cambian si el humano responde otra cosa.

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
| R8 | Las migraciones de SLT-46 DEBEN ser solo aditivas: sin `DROP`, `TRUNCATE`, `RENAME` ni `ALTER COLUMN`; sin `INSERT`, `UPDATE` ni `DELETE` que la migración ejecute sobre una tabla existente (sí dentro del cuerpo de una función de trigger); `ALTER TYPE` solo como `ADD VALUE IF NOT EXISTS`; y cada una DEBE traer su `down.sql`. | Migraciones |
| R9 | CUANDO se aplican los `down.sql` de SLT-46 en orden inverso, el esquema y los datos DEBEN volver a los de SLT-45 (salvo los valores de enum añadidos), la sincronía vieja → nodo de SLT-43 DEBE seguir funcionando, y volver a aplicar las migraciones DEBE dejar lo mismo que la primera vez. | Migraciones |
| R10 | Las migraciones de SLT-46 NO DEBEN alterar, indexar ni escribir la tabla `orden`. | Migraciones; Alcance (épica: sin bloqueos largos sobre `orden`) |

### Equivalencia para Costa Rica

| R | Requisito | Decisión |
|---|---|---|
| R11 | DESPUÉS DE cualquier secuencia de altas, renombres, retiros, reactivaciones y cargas CSV hechas desde la pantalla, el sistema DEBE dejar, para cada país, los nodos de profundidad 1–3 y las filas de `provincia`/`canton`/`distrito` iguales en id, nombre, código, `activo` y padre. | Alcance |
| R12 | CUANDO el superadmin hace en Costa Rica una alta, un renombre, un retiro, una reactivación o una carga CSV con una entrada dada, el sistema DEBE responder el mismo desenlace (status, campos de error y mensajes) que en SLT-45 con esa entrada, y DEBE dejar las mismas filas en la geografía vieja (salvo los ids de las altas). | Alcance |
| R13 | El script de datos de la épica DEBE ofrecer un modo de solo lectura que compare fila a fila la geografía vieja con los nodos de profundidad 1–3 de cada país y termine con código distinto de 0 si alguna fila difiere o falta. (P8) | Alcance (mitigación: equivalencia) |

### Tipos y nodos de cualquier profundidad

| R | Requisito | Decisión |
|---|---|---|
| R14 | CUANDO el superadmin da de alta un nodo, el sistema DEBE darle el tipo de su profundidad (el tipo `nivel_<profundidad>` de su país). (P1) | Alcance |
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
| R23 | CUANDO el superadmin da de alta un país del catálogo ISO con una lista ordenada de entre 3 y 10 tipos (nombre singular y plural de cada uno), el sistema DEBE crear el país y sus tipos con las claves `nivel_1`…`nivel_P` en ese orden, con los tres primeros también en `pais.nivel_{1,2,3}_{singular,plural}`, en una sola transacción. (P2) | Alcance |
| R24 | SI el alta de país trae menos de 3 o más de 10 tipos, o un nombre de tipo fuera de 2–40 caracteres, ENTONCES el sistema DEBE responder `validation_error` sin crear nada; los demás rechazos del alta (código fuera del catálogo, país o nombre repetidos) DEBEN responder igual que en SL-20. (P2) | Alcance |

### Edición de los nombres de un tipo

| R | Requisito | Decisión |
|---|---|---|
| R25 | CUANDO el superadmin cambia el nombre singular o el plural de un tipo de un país ya creado, el sistema DEBE guardarlo en el tipo y, DONDE la clave del tipo es `nivel_1`, `nivel_2` o `nivel_3`, DEBE copiarlo a la columna `pais.nivel_N_singular`/`_plural` correspondiente en la misma transacción. | ¿El nombre de tipo corregido se copia a `pais.nivel_N_*`? |
| R26 | SI la edición de un tipo pide los nombres que ya tiene, ENTONCES el sistema DEBE responder éxito sin escribir; SI el tipo no existe, ENTONCES DEBE responder `not_found`; SI un nombre no cumple 2–40 caracteres, ENTONCES DEBE responder `validation_error`; en ningún rechazo DEBE escribir nada. | Alcance |
| R27 | CUANDO se cambió el nombre de un tipo `nivel_1`–`nivel_3`, las pantallas de las empresas de ese país DEBEN mostrar el nombre nuevo de ese nivel en su siguiente carga. | ¿El nombre de tipo corregido se copia a `pais.nivel_N_*`? |

### Disponibilidad del país

| R | Requisito | Decisión |
|---|---|---|
| R28 | CUANDO el superadmin marca disponible un país, el sistema DEBE aceptarlo tenga los niveles que tenga (también con nodos de profundidad 4 o más), con el historial de SL-20 (R47). | ¿País disponible sin 3 niveles antes de SLT-48? |
| R29 | MIENTRAS un país disponible no es de 3 niveles, la creación de órdenes de sus empresas DEBE seguir respondiendo «país aún no habilitado» (regla de SLT-45), sin cambios en SLT-46. | ¿País disponible sin 3 niveles antes de SLT-48? |

### Carga CSV de la división

| R | Requisito | Decisión |
|---|---|---|
| R30 | CUANDO el superadmin carga un CSV para un país, el sistema DEBE exigir en la cabecera las columnas `nivel_<k>` y `codigo_nivel_<k>` para cada k de 1 a P; SI falta una, ENTONCES DEBE rechazar el archivo entero sin escribir nada. (P4) | Alcance |
| R31 | CUANDO se carga para Costa Rica un CSV con el formato de SL-20, el sistema DEBE aceptarlo y devolver el mismo resultado (resumen, errores por línea y avisos) que en SLT-45 con el mismo archivo y la misma base. | Alcance |
| R32 | SI una fila del CSV deja vacío un nivel y llena uno más profundo, o deja vacío `nivel_1` o `nivel_2`, ENTONCES el sistema DEBE tratarla como inválida con su número de línea y su motivo, y NO DEBE escribir nada. | Alcance |
| R33 | CUANDO un CSV válido se carga, el sistema DEBE cruzarlo con los nodos del país leídos de `nodo_geografico`, DEBE crear como nodos (con el tipo de su profundidad) los que falten y completar los códigos vacíos, todo en una sola transacción, y DEBE devolver cuántos creó por profundidad, cuántos ya existían y cuántos códigos completó. | Alcance |
| R34 | Los límites de la carga (5 MB, 10 000 filas de datos, 200 errores devueltos, UTF-8, `.csv`) y el aviso por cada columna que no es del formato DEBEN seguir como en SL-20. | Alcance |

### Historial de plataforma

| R | Requisito | Decisión |
|---|---|---|
| R35 | CUANDO el superadmin da de alta, renombra, retira o reactiva un nodo, el sistema DEBE guardar en la misma transacción una fila en `historial_plataforma` con la acción `nodo_geografico_*`, la entidad `nodo_geografico`, la cadena de nombres de la raíz al nodo, el país y el actor (id y nombre congelado), y en el renombre el nombre anterior y el nuevo. (P5) | Historial |
| R36 | CUANDO una carga CSV escribe algo, el sistema DEBE guardar en la misma transacción una fila `division_cargada` con las cifras por profundidad; SI no escribe nada, ENTONCES NO DEBE guardar ninguna. | Historial |
| R37 | CUANDO se da de alta un país, el sistema DEBE guardar la fila `pais_creado` y una fila `tipo_nivel_geografico_creado` por tipo; CUANDO se cambia un nombre de tipo, DEBE guardar una fila `tipo_nivel_geografico_renombrado` por cada nombre que cambió, con el anterior y el nuevo; todo en la misma transacción del cambio. (P7) | Historial |
| R38 | Las escrituras de geografía y de tipos del superadmin NO DEBEN escribir en `historial_accion`. | Historial |

### Autorización y contexto

| R | Requisito | Decisión |
|---|---|---|
| R39 | SI un rol que no es de plataforma invoca cualquier operación de esta pantalla (árbol del país, alta de país, edición de tipo, alta, renombre, retiro y reactivación de nodo, conteo de órdenes, carga CSV, disponibilidad), ENTONCES el service DEBE responder `forbidden` sin leer ni escribir la base. | E2E (el rol se prueba en el service) |
| R40 | Las operaciones de R39 DEBEN completarse con un superadmin que no pertenece a ninguna empresa, sin fallar con `EmpresaNoResuelta`. | Historial |
| R41 | SI una operación en el contexto de una empresa intenta escribir `nodo_geografico` o `tipo_nivel_geografico`, ENTONCES la base DEBE rechazarla (`42501`) sin escribir nada. | Alcance |

### Baja lógica, escritor único y frontera

| R | Requisito | Decisión |
|---|---|---|
| R42 | Ningún archivo de `lib/`, `app/` ni `components/` DEBE borrar físicamente filas de `nodo_geografico`, `tipo_nivel_geografico`, `provincia`, `canton` ni `distrito`. | Retirar nodo |
| R43 | Solo `GeoRepository` DEBE escribir `nodo_geografico`, y solo `PaisRepository` DEBE escribir `tipo_nivel_geografico`; el nombre de un nodo solo lo DEBE escribir `GeoRepository.renombrar` (y el alta). | Alcance |
| R44 | SLT-46 NO DEBE cambiar las zonas de la empresa: el trigger `orden_nodo_geografico` DEBE seguir derivando el nodo de las FK de la orden, y `zona_distrito` y `distrito_zona_especial` DEBEN seguir admitiendo solo distritos. | ¿Una tarjeta o dos? |
| R45 | La verificación de SLT-46 DEBE hacerse con unit e integración contra Postgres real, sin E2E nuevo, y los E2E existentes DEBEN seguir en verde en el gate completo. | E2E |

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| ¿Una tarjeta o dos? | R44 |
| ¿Mover nodos? | R6, R22 |
| ¿El nombre de tipo corregido se copia a `pais.nivel_N_*`? | R25, R27 |
| ¿País disponible sin 3 niveles antes de SLT-48? | R28, R29 |
| Retirar nodo (baja lógica) | R7, R16, R19, R20, R42 |
| E2E | R39, R45 |
| Historial | R35–R38, R40 |
| Migraciones | R4, R8, R9, R10 |

## Preguntas abiertas
Sembradas por `/afinar-feature`: ninguna.

Nuevas (spec_author, F1.2, 2026-11-06). Cada una lleva la propuesta con la que está escrito el spec;
el humano la confirma o la cambia en F1.4.

- **P1. Tipo de un nodo nuevo.** La decisión 2 de la épica dice que el tipo no ata la profundidad.
  Propuesta: en SLT-46 el tipo de un nodo es siempre el de su profundidad (`nivel_<k>`), sin elegirlo.
  Motivo: con esa regla la sincronía vieja → nodo de SLT-43 ve el nodo igual que lo dejó la app y no lo
  pisa, sin tocar sus funciones (`design.md §2.2`). Mezclar tipos en una profundidad queda para después
  de SLT-48. Afecta a R14, R21, R33.
- **P2. Cuántos tipos en el alta de país.** Propuesta: entre 3 y 10. El mínimo es 3 porque `pais`
  exige los seis nombres de nivel y el trigger `pais_tipos_de_nivel` crea siempre tres tipos; un país
  que use solo 2 niveles lleva un tercer tipo sin nodos. El tope de 10 es una propuesta, no un dato del
  repo. Afecta a R23, R24.
- **P3. Añadir tipos a un país ya creado.** La tarjeta solo pide editar los nombres. Propuesta: no se
  añaden ni se quitan tipos después del alta en SLT-46.
- **P4. Cabeceras del CSV.** «Una columna por tipo y profundidad»: propuesta, columnas neutras
  `nivel_<k>`/`codigo_nivel_<k>` (las de SL-20, ya que el tipo de la profundidad k es `nivel_<k>`), con
  la equivalencia «`nivel_k` = <tipo>» en la pantalla como hoy. La alternativa (cabecera con el nombre
  del tipo, como la plantilla de órdenes de SLT-45) está en `design.md §12`. Afecta a R30.
- **P5. Entidad del historial de un nodo.** Propuesta: `nodo_geografico` a cualquier profundidad (hoy
  se guarda `provincia`/`canton`/`distrito`). Ninguna pantalla lee `historial_plataforma` todavía.
  Afecta a R35.
- **P6. Caso de test de SL-20 R49 (homónimos normalizados en la base).** Con la carga leída del nodo
  ese estado no puede existir (el único normalizado de SLT-43 lo impide). Propuesta: se retira el caso
  «decision 4: dos homónimos normalizados» de `tests/integration/db/carga-division.test.ts` y SL-20 R49
  queda superado por SLT-46. Sin esta aprobación el reviewer lo vería como una aserción cambiada.
- **P7. Historial al cambiar los dos nombres de un tipo.** Propuesta: una fila por nombre cambiado,
  con `detalle = {"campo": "singular" | "plural"}`; las columnas `valor_anterior`/`valor_nuevo` (80)
  caben de sobra (40). Afecta a R37.
- **P8. Dónde vive la comparación fila a fila.** Propuesta: un modo nuevo `--equivalencia-geografia`
  en `scripts/geo-backfill-nodo.ts`, de solo lectura, sin tocar los modos de SLT-43. Afecta a R13.
- **P9. Pantalla y `/design`.** La pantalla de SL-20 cambia de forma (árbol de N niveles, lista de
  tipos en el alta, edición de tipos). Propuesta: pasa por `/design` antes de T6 (`docs/perfil-agentes.md
  > frontend_dev`), aunque no es una pantalla nueva.

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
