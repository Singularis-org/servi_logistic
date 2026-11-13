# SLT-125 — geo-jerarquica-exportes · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SLT-47 · **Rama:** `feature/SLT-125-geo-jerarquica-exportes`
>
> **Alcance:** toda presentación de lugares se adapta a los niveles del país de la empresa; Costa Rica se ve y se descarga igual que hoy. Entran:
> - las 7 descargas: órdenes, satélite, novedades, ayuda, cierre de día, cierres admin y cobertura;
> - la etiqueta de guía y la página pública `/paquete`;
> - el PDF de tránsito;
> - las tarjetas POS y la de satélite, el detalle de asignación y el chat;
> - las variables de las plantillas de WhatsApp;
> - los nombres de lugar del listado `/ordenes` y del detalle de gestión, leídos del catálogo;
> - `ubicacion_snapshot` en los cierres: se escribe y se lee;
> - la consulta de geocodificación.
>
> **Lo que NO entra:**
> - Retirar las columnas y tablas viejas `provincia/canton/distrito` y achicar el catálogo de filtros (las listas planas que duplican `lugares`): SLT-48.
> - Filtros: ya están en SLT-47.
> - Deuda para SLT-48 o una ficha nueva (decisión P6, 2026-11-12): siguen mostrando 3 niveles fijos:
>   - el aviso y el modal de corrección de ubicación (`CorregirUbicacionAviso`, `CorregirDatosClienteModal`);
>   - las etiquetas del historial de acciones;
>   - las pantallas de tarifas y de zonas;
>   - la plantilla de carga masiva, que ya es de SLT-45.
> - El nivel 4 o más hondo de una orden: hasta SLT-48 ninguna orden lo tiene (decisión P1).
>
> Sembrado por `/afinar-feature` el 2026-11-12. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-12, sobre `dfdd78de` (pila geo hasta SLT-47).
>
> Vocabulario:
> - **«Hoy»**: el comportamiento de la rama en `dfdd78de`, antes de esta feature.
> - **«Catálogo»**: el de SLT-44 (nodos y tipos del país de la empresa), que carga
>   `CatalogoGeograficoRepository.deLaEmpresa()`.
> - **«P»**: el número de niveles del país de la empresa (tipos `nivel_1`…`nivel_P`, de 2 a 10).
> - **«Tipo del nivel k»**: el `nombre_singular` del tipo `nivel_k` del país de la empresa.
> - **«Ruta de una orden»**: los lugares del nivel 1 al lugar de la orden, con sus ids y nombres,
>   sacados del catálogo (`rutaDelLugar`, SLT-47). El lugar de la orden es `lugarDeLaOrden` (SLT-65)
>   en todos los países, así que la ruta llega como mucho al nivel 3 hasta SLT-48 (decisión P1).
> - **«Línea de ubicación»**: la zona y los nombres de la ruta, en una sola línea.
> - **«Cabecera del nivel k»**: el tipo del nivel k; `nivel_<k>` si choca con otra cabecera del
>   mismo archivo o con la de otro nivel (heredada de SLT-45 y SLT-46).
> - **«Igual que hoy»**, en Costa Rica: mismas cabeceras, mismo orden, mismos textos, mismos
>   separadores y mismas celdas que produce hoy el mismo dato.
>
> Cada fila dice el test que la prueba y la decisión que cubre. El detalle está en
> `design.md > §13`.

### Columnas por nivel: órdenes, satélite y cobertura

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R1 | MIENTRAS la empresa es de un país con P niveles, las descargas de órdenes, de recepción satélite y de cobertura DEBEN llevar P columnas de lugar, una por nivel de 1 a P y en ese orden, en el sitio que hoy ocupan las 3, con la cabecera del nivel k. La celda del nivel k DEBE ser el nombre del lugar de nivel k de la ruta, y DEBE quedar vacía si la ruta no llega a ese nivel. | `tests/unit/descarga/geo-columnas-n-niveles.test.ts` (países de 2, 3, 4 y 10 niveles) | Columnas de lugar |
| R2 | SI el tipo de un nivel coincide, normalizado, con otra cabecera del mismo archivo o con el tipo de otro nivel, ENTONCES esa columna DEBE llamarse `nivel_<k>`. | `geo-columnas-n-niveles.test.ts` (un país con un nivel «Zona» y otro con dos niveles del mismo nombre) | Heredadas (encabezados) |
| R3 | La clave interna de la columna del nivel k DEBE ser `provincia`, `canton` y `distrito` para k = 1, 2 y 3, y `nivel_<k>` desde k = 4. Una preferencia de columnas guardada hoy en el selector de la descarga DEBE seguir aplicándose igual. | `geo-columnas-n-niveles.test.ts`; suites de `ColumnasPopover` y `ambito-columnas.guardia` sin cambios | Heredadas (nombres internos) |
| R4 | MIENTRAS la empresa es de Costa Rica, las descargas de órdenes, satélite y cobertura DEBEN salir igual que hoy: el CSV byte a byte, y el XLSX con las mismas cabeceras y celdas en el mismo orden. | `tests/unit/descarga/equivalencia-descargas-cr.test.ts`, contra la referencia capturada en T1.2 antes de tocar código | Columnas de lugar («CR conserva nombres y orden») |
| R5 | MIENTRAS la empresa es de un país con P niveles, la tabla de `/ordenes` y la de recepción satélite DEBEN mostrar una columna de lugar por nivel, con el mismo criterio de R1 a R3. En Costa Rica DEBEN verse igual que hoy. | `tests/unit/components/ordenes-columns-niveles.test.tsx` | Columnas de lugar; P4 |
| R6 | MIENTRAS la empresa es de un país con P niveles, la descarga de cobertura DEBE tener una fila por cada nodo de profundidad P del país, activo o no, y sus motivos «retirado del catálogo» DEBEN nombrar el tipo del nivel retirado. En Costa Rica (P = 3) DEBE salir igual que hoy. | `tests/unit/descarga/cobertura-n-niveles.test.ts` (países de 2 y 4 niveles); `equivalencia-descargas-cr.test.ts` | Columnas de lugar; P5 |

### Una sola «Ubicación»: novedades, ayuda, cierre de día, cierres admin, etiqueta y `/paquete`

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R7 | Las descargas de novedades, ayuda, cierre de día y cierres admin (la fundida) DEBEN armar su columna «Ubicación» con la zona y todos los nombres de la ruta, del nivel 1 al lugar, separados por « · » y sin tramos vacíos. Sin ningún tramo, la celda DEBE quedar vacía. | `tests/unit/utils/ubicacion-presentacion.test.ts`; `tests/unit/descarga/ubicacion-n-niveles.test.ts` | Columnas de lugar («una sola Ubicación con toda la ruta») |
| R8 | Las pantallas que muestran esa misma línea (el detalle del cierre de día, el detalle de cierres admin y el detalle de recepción satélite) DEBEN armarla igual que R7. | `ubicacion-n-niveles.test.ts`; `tests/components/ubicacion-pantallas-n-niveles.test.tsx` | Alcance («toda presentación de lugares») |
| R9 | La etiqueta de guía (PDF) y la página `/paquete` DEBEN mostrar la zona y todos los nombres de la ruta, del nivel 1 al lugar, separados por « / » y sin tramos vacíos. Sin ningún tramo, `/paquete` DEBE mostrar «—», como hoy. | `tests/unit/pdf/etiqueta-geografia-n-niveles.test.ts`; `tests/components/paquete-ubicacion.test.tsx` | Alcance (etiqueta y `/paquete`) |
| R10 | MIENTRAS la empresa es de Costa Rica, las superficies de R7, R8 y R9 DEBEN salir igual que hoy. | `equivalencia-descargas-cr.test.ts` (novedades, ayuda, cierre de día, cierres admin); `etiqueta-geografia-n-niveles.test.ts`; `paquete-ubicacion.test.tsx` | Alcance («CR igual») |

### Los dos niveles más hondos: tarjetas, chat, detalle de asignación y PDF de tránsito

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R11 | Las tarjetas POS (mosaico, detalle y bloque de navegación), la tarjeta de satélite y el chat DEBEN mostrar los dos últimos pasos de la ruta de la orden (sus 2 niveles más hondos), con el orden y el separador que hoy usa cada una. En un país de 4 niveles son los niveles 2·3 hasta SLT-48. Cuando la ruta tiene un solo paso, o es una orden de CR sin distrito, rige **P7**. | `tests/unit/utils/ubicacion-presentacion.test.ts` (`dosMasHondos`); `tests/components/pos-satelite-chat-niveles.test.tsx` | Tarjetas, chat y PDF («2 niveles más hondos») |
| R12 | El detalle de asignación DEBE mostrar la línea de R11, con su orden y separador de hoy, y un campo por cada nivel de 1 a P, rotulado con el tipo de ese nivel y con «—» cuando la ruta no llega a él. | `tests/components/AsignacionDetalle-niveles.test.tsx` | Tarjetas, chat y PDF; Alcance (detalle de asignación) |
| R13 | El PDF de tránsito DEBE titular su columna de lugar con los tipos, en mayúsculas y unidos por « · », de los dos niveles más hondos que puede tener una orden: los niveles D−1 y D, con D = min(P, 3) hasta SLT-48 (CR: «CANTÓN · DISTRITO»; país de 4 niveles: «COMUNA · BARRIO»). Cada celda DEBE seguir la regla de R11. | `tests/unit/whatsapp-envios/transito-pdf-niveles.test.ts` | Tarjetas, chat y PDF («COMUNA · BARRIO») |
| R14 | El destino de navegación de la tarjeta POS DEBE armarse con la dirección y los nombres de la ruta del más hondo al nivel 1, separados por «, », como hoy. | `ubicacion-presentacion.test.ts`; `tests/unit/mis-asignaciones/pos-format-destino.test.ts` | Alcance (tarjetas POS) |
| R15 | MIENTRAS la empresa es de Costa Rica, las superficies de R11 a R14 DEBEN verse igual que hoy para toda orden con distrito (cantón · distrito), y el PDF de tránsito DEBE seguir titulando «CANTÓN · DISTRITO». La orden sin distrito sigue **P7**. | `pos-satelite-chat-niveles.test.tsx`, `AsignacionDetalle-niveles.test.tsx`, `transito-pdf-niveles.test.ts` y `pos-format-destino.test.ts`, con los textos de hoy literales | Tarjetas, chat y PDF («en CR sigue CANTÓN · DISTRITO») |

### De dónde salen los nombres

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R16 | El listado de `/ordenes`, el detalle de gestión y cada superficie de esta feature DEBEN tomar los nombres de lugar de la ruta del catálogo del país de la empresa, no de las tablas `provincia`, `canton` y `distrito`. | `tests/integration/db/geo-125-nombres-catalogo.test.ts`; guardia `tests/unit/guards/presentacion-lugar-del-catalogo.guardia.test.ts` | Alcance (nombres leídos del catálogo) |
| R17 | MIENTRAS la cadena de la orden sea coherente y los nombres de las tablas viejas coincidan con los de sus nodos, los nombres que devuelven el listado de `/ordenes` y el detalle de gestión DEBEN ser los mismos que hoy. | `geo-125-nombres-catalogo.test.ts` (frente a las tablas viejas, en CR) | Alcance («CR igual») |
| R18 | SI el lugar de una orden no está en el catálogo, ENTONCES los listados, las descargas y las tarjetas NO DEBEN fallar: sus nombres de lugar salen vacíos. Crear un cierre DEBE seguir revirtiéndose entero, como hoy (ficha 450). | `geo-125-nombres-catalogo.test.ts`; `tests/integration/db/geo-125-cierre-snapshot.test.ts` | Heredadas |
| R19 | Ninguna lectura de esta feature DEBE calcular ancestros con una consulta recursiva en la base ni con una columna de ruta. Tampoco DEBE leer `orden.nodo_geografico_id`: el lugar de la orden es siempre `lugarDeLaOrden`. | `geografia-sin-cte-recursiva.guardia.test.ts` y `geografia-lecturas-sin-nodo-fk.guardia.test.ts`, ampliadas a los archivos nuevos sin excepciones | Heredadas (SLT-44, SLT-65, SLT-47); P1 |
| R20 | Cada petición DEBE cargar el catálogo a lo sumo una vez por repositorio, y ninguna superficie DEBE hacer una consulta por fila para nombrar lugares. | `tests/unit/repositories/ruta-sin-consulta-por-fila.test.ts` (dobles que cuentan `deLaEmpresa` y consultas con 50 filas) | Heredadas (rendimiento) |

### `ubicacion_snapshot` en los cierres

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R21 | CUANDO se crea un cierre, cada fila nueva de `cierre_detail` DEBE llevar `ubicacion_snapshot` con la forma de SLT-43 §2.6: `{"v":1,"niveles":[…]}`, un nivel por paso de la ruta y de la raíz a la hoja, cada uno con `profundidad`, `tipo` (el tipo de ese nivel en ese instante), `nombre` e `id`. Además DEBE seguir escribiendo `provincia_nombre`, `canton_nombre` y `distrito_nombre` como hoy. | `geo-125-cierre-snapshot.test.ts` | `ubicacion_snapshot` |
| R22 | MIENTRAS la empresa es de Costa Rica, el `ubicacion_snapshot` de una fila nueva DEBE ser igual al que escribiría `geo:backfill` para esa misma fila. | `geo-125-cierre-snapshot.test.ts` (se crea el cierre, se guarda el snapshot, se pone a NULL, se corre `aplicar` y se comparan) | `ubicacion_snapshot` («forma heredada») |
| R23 | El snapshot DEBE escribirse en la misma transacción que la fila. SI no puede armarse, ENTONCES el cierre entero DEBE revertirse, igual que cuando falta un nombre hoy. | `geo-125-cierre-snapshot.test.ts` | `ubicacion_snapshot` |
| R24 | CUANDO el detalle de cierres admin o su descarga leen una fila con un snapshot de la versión 1 válido, la ruta DEBE salir de `niveles[].nombre`, en su orden. NO DEBE resolverse ningún nombre a partir del `id`, y un `id` nulo DEBE admitirse. | `tests/unit/types/ubicacion-snapshot.test.ts`; `tests/unit/descarga/cierres-snapshot-lectura.test.ts` | `ubicacion_snapshot` |
| R25 | SI una fila no tiene snapshot, o el que tiene no cumple la versión 1, ENTONCES DEBEN leerse las 3 columnas de nombre como hoy, sin error. | `ubicacion-snapshot.test.ts`; `cierres-snapshot-lectura.test.ts` | `ubicacion_snapshot` |
| R26 | MIENTRAS la empresa es de Costa Rica, el detalle y la descarga de cierres admin DEBEN dar lo mismo para una fila con snapshot que para la misma fila sin él, e igual que hoy. | `cierres-snapshot-lectura.test.ts`; `equivalencia-descargas-cr.test.ts` | `ubicacion_snapshot`; Alcance («CR igual») |
| R27 | Esta feature NO DEBE escribir `ubicacion_snapshot` en filas ya existentes ni añadir ningún trigger. Las filas viejas siguen llenándose con `geo:backfill`, que corre una persona. | `geo-backfill.test.ts` R40 (sin trigger en `cierre_detail`); diff de `db/` revisado por el reviewer | `ubicacion_snapshot`; Heredadas (producción) |

### Variables de WhatsApp

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R28 | `{{provincia}}`, `{{canton}}` y `{{distrito}}` DEBEN seguir resolviendo al nombre de los niveles 1, 2 y 3 de la ruta, vacíos si la ruta no llega. Ninguna clave que hoy resuelve DEBE dejar de hacerlo ni pasar a `clavesSinCampo`. | `tests/unit/whatsapp/plantilla-niveles.test.ts` | Variables de WhatsApp |
| R29 | El catálogo de variables DEBE sumar `{{nivel_1}}` a `{{nivel_10}}`, que resuelven al nombre del nivel k de la ruta o vacío, y `{{ubicacion}}`, que resuelve a los nombres de la ruta del más hondo al nivel 1, unidos por «, », sin la zona y sin tramos vacíos («Carmen, San José, San José»). Los datos de ejemplo DEBEN resolver `{{ubicacion}}` a «Carmen, San José, San José»; `{{nivel_4}}`…`{{nivel_10}}` no tienen ejemplo. | `plantilla-niveles.test.ts`; `tests/unit/types/plantilla-datos.test.ts` (A3 y A3b, autorizados) | Variables de WhatsApp; P3; A3b |
| R30 | El selector del editor de plantillas DEBE ofrecer `{{nivel_1}}`…`{{nivel_P}}` y `{{ubicacion}}`, con cada `{{nivel_k}}` rotulado con el tipo del nivel k del país de la empresa. NO DEBE ofrecer un `{{nivel_k}}` con k mayor que P. `{{provincia}}`, `{{canton}}` y `{{distrito}}` DEBEN seguir ocultas en el selector. | `tests/unit/plantillas/CampoVariablePicker-niveles.test.tsx`; `CampoVariablePicker.test.tsx` (A4) | Variables de WhatsApp («el editor rotula»); P2 |
| R31 | MIENTRAS la empresa es de Costa Rica, un cuerpo con las claves de hoy DEBE producir el mismo texto que hoy, en la vista previa y en el envío. | `plantilla-niveles.test.ts`; `preview-mismo-motor.test.ts` sin cambios | Variables de WhatsApp («ninguna plantilla guardada se rompe») |

### Geocodificación

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R32 | CUANDO se geocodifica una orden, la consulta DEBE ser: la dirección, los nombres de la ruta del más hondo al nivel 1 y el nombre del país de la empresa, unidos por «, » y sin tramos vacíos. Con la dirección vacía DEBE seguir sin consulta, como hoy. | `tests/unit/geo/direccion-query.test.ts` (ampliado: 2, 4 y 10 niveles) | Geocodificación |
| R33 | MIENTRAS la empresa es de Costa Rica, la consulta y su huella DEBEN ser idénticas a las de hoy, y una entrada de `GeocodeCache` escrita hoy para una orden DEBE servirse sin llamar al proveedor. | `direccion-query.test.ts` (cadena y huella literales); `tests/integration/db/geo-125-geocode-cache.test.ts` | Geocodificación («no invalidar `GeocodeCache`») |

### Equivalencia con datos reales

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R34 | DEBE existir un script que, en transacciones de solo lectura y solo contra una base local, cuente las órdenes cuyos nombres de ruta del catálogo no coinciden con los de las tablas viejas y las que cambiarían de consulta de geocodificación. NO DEBE escribir en ninguna tabla ni imprimir SQL, nombres de lugar ni datos de destinatarios: solo cifras e ids. | `tests/integration/db/geo-equivalencia-presentacion.test.ts` (un `INSERT` falla con `25006`; la salida no contiene datos del fixture) | Alcance («CR igual»); Heredadas (producción) |
| R35 | ANTES de pedir el merge, una persona DEBE: (a) correr el script de R34 sobre la copia de producción; (b) bajar con `dev` y con esta rama las 7 descargas de una empresa de Costa Rica sobre esa copia y compararlas con `scripts/comparar-descargas.ts`. DEBE anotar las cifras en `progress/impl_SLT-125.md`. Ningún agente DEBE tocar producción. | Anotación en `progress/impl_SLT-125.md`, que comprueba el reviewer | Alcance (descargas «igual que hoy»); Heredadas (producción) |

### Reglas heredadas y lo que no cambia

| R | Requisito | Test | Decisión |
|---|---|---|---|
| R36 | Las pantallas de esta feature NO DEBEN implementarse hasta que exista una maqueta aprobada por el humano, con su fecha y su referencia en `progress/impl_SLT-125.md`. Lo implementado DEBE seguir esa maqueta. | Anotación en `progress/impl_SLT-125.md`, que comprueba el reviewer | Heredadas (maqueta) |
| R37 | Los nombres internos `provincia`, `canton` y `distrito` DEBEN quedarse en la base, el código y la API. Los campos de hoy de los DTO y las respuestas de la API v1 y v2 NO DEBEN cambiar de forma, y en Costa Rica tampoco de valor. | `tests/integration/api/v2-consulta.route.test.ts` y suites de la API sin cambios | Heredadas (SL-20) |
| R38 | Las suites existentes DEBEN pasar sin cambiar aserciones, salvo las listadas en `design.md > §13.1` con la autorización del humano. Los E2E existentes DEBEN seguir en verde sin cambios. | Gate completo de CI; el reviewer revisa el diff de `tests/` contra §13.1 | Heredadas (R38); E2E («los de CR siguen en verde») |
| R39 | Esta feature NO DEBE añadir migraciones ni cambiar `db/schema.prisma`. | Diff de `db/` vacío, que comprueba el reviewer | Heredadas (migraciones aditivas) |
| R40 | MIENTRAS una lectura de esta feature carga el catálogo o el país, DEBEN ser los de la empresa del contexto. SI corre en contexto de plataforma, ENTONCES DEBE fallar con `EmpresaNoResuelta`. Un lugar de otro país NO DEBE aportar nombres. | `geo-125-nombres-catalogo.test.ts` (empresas de CR y de `XA`) | Heredadas |
| R41 | Cada superficie DEBE conservar sus permisos de hoy: quién la ve y qué órdenes o cierres recibe cada rol. Ningún DTO DEBE ganar datos personales: la ruta lleva solo ids y nombres de lugar. | Suites existentes de alcance sin cambiar aserciones; `geo-125-nombres-catalogo.test.ts` (adminSatelite y adminTienda) | Heredadas |
| R42 | Ningún texto de nivel DEBE ir escrito a mano en el código de presentación: los tipos salen del país de la empresa. Solo los tests de Costa Rica pueden llevar los textos de hoy literales. | `etiquetas-geograficas-sin-literal.guardia.test.ts`, ampliada a los archivos nuevos | Heredadas (SLT-45, SLT-46) |
| R43 | DEBE existir un E2E que, en una empresa de un país de 4 niveles: (a) baje la descarga de órdenes y compruebe sus 4 cabeceras de lugar con los tipos del país, las 3 primeras celdas con la ruta y la cuarta vacía; (b) abra la etiqueta de guía y compruebe la ruta de 3 niveles; (c) cree un cierre y compruebe en su detalle y en su `ubicacion_snapshot` los 3 niveles de la ruta con los tipos del país. | `e2e/geo-presentacion-4-niveles.spec.ts` | E2E, ajustado por P1 |
| R44 | Esta feature NO DEBE cambiar lo que es de otras fichas: los filtros (SLT-47); retirar columnas o tablas viejas, `NivelGeografico`, `PROFUNDIDAD_DEL_NIVEL` o las listas planas del catálogo de filtros (SLT-48). Tampoco las superficies de la deuda P6 de «Lo que NO entra». | Diff revisado por el reviewer | Alcance («Lo que NO entra»); P6 |

### Mapa decisión → requisitos

| Decisión cerrada | Requisitos |
|---|---|
| Tamaño (un solo PR) | `tasks.md > Archivos esperados` (sin R propio) |
| Columnas de lugar | R1–R7, R10 |
| Tarjetas, chat y PDF | R11–R15 |
| Variables de WhatsApp | R28–R31 |
| `ubicacion_snapshot` | R21–R27 |
| Geocodificación | R32, R33 |
| E2E | R38, R43 |
| Heredadas | R2, R3, R18–R20, R36–R42 |
| P1 (nivel 4 de una orden) | R19, R43 |
| P2 (selector) | R30 |
| P3 (formato de `{{ubicacion}}`) | R29 |
| P4 (tablas) | R5 |
| P5 (filas de cobertura) | R6 |
| P6 (superficies fuera) | R8, R44 |

## Preguntas abiertas

Ninguna. P1–P7 las respondió el humano el 2026-11-12: están en «Decisiones cerradas».

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-12 | Tamaño (~95–115 archivos) | Un solo PR, aceptando el tamaño (precedente SLT-47 P6). |
| 2026-11-12 | Columnas de lugar en descargas con 3 columnas fijas (órdenes, satélite, cobertura) | Una columna por nivel del país, en el lugar de las 3 de hoy, con el nombre singular del tipo como encabezado. CR conserva nombres y orden (hay plantillas de Excel). Las descargas con una sola «Ubicación» la arman con toda la ruta. |
| 2026-11-12 | Tarjetas POS y satélite, chat y PDF de tránsito (hoy 2 niveles) | Los 2 niveles más hondos, como hoy. El título del PDF usa los nombres de tipo del país («COMUNA · BARRIO»); en CR sigue «CANTÓN · DISTRITO». |
| 2026-11-12 | Variables de WhatsApp | `{provincia}`, `{canton}` y `{distrito}` siguen funcionando como niveles 1–3, y ninguna plantilla guardada se rompe. Se suman `{nivel_1}…{nivel_N}` y `{ubicacion}` (toda la ruta), que el editor rotula con el nombre de tipo del país. |
| 2026-11-12 | `ubicacion_snapshot` | Los cierres nuevos lo escriben además de las 3 columnas de nombre. Los cierres admin y su descarga lo leen; si una fila vieja no lo tiene, leen las 3 columnas como hoy. Forma heredada de SLT-43 §2.6. El test de SLT-43 R40 («una fila nueva nace NULL») cambia con autorización (R38). |
| 2026-11-12 | Geocodificación | Dirección, luego todos los niveles del más hondo al más alto, luego el nombre del país de la empresa. CR produce exactamente la misma cadena que hoy, para no invalidar `GeocodeCache` (test). |
| 2026-11-12 | E2E | Uno nuevo con una empresa de un país de 4 niveles: descarga de órdenes con 4 columnas, etiqueta de guía con su ruta y cierre con sus 4 niveles. Los E2E de CR siguen en verde sin cambios. |
| 2026-11-12 | Heredadas | Los nombres internos `provincia/canton/distrito` se quedan en DB, código y API (SL-20). Encabezados de un país que no es CR con el singular del tipo, o `nivel_<n>` si chocan (SLT-45, SLT-46). Cada superficie conserva su separador y su orden de hoy. Las pantallas esperan una maqueta aprobada (SLT-46 P9). Migraciones solo aditivas hasta SLT-48. Ningún agente toca producción. Las aserciones existentes cambian solo con autorización humana (R38). |
| 2026-11-12 | P1 — ¿De dónde sale el nivel 4 de una orden? | Opción B: se queda `lugarDeLaOrden` y NO se lee `orden.nodo_geografico_id`. En un país de 4 niveles la cuarta columna lleva su cabecera y sale vacía hasta SLT-48. El E2E comprueba 4 cabeceras y una ruta de 3 niveles en la descarga, la etiqueta y el cierre. Sin la excepción a la guardia (A5 retirada). |
| 2026-11-12 | P2 — ¿El selector ofrece `{{nivel_k}}` y `{{ubicacion}}`? | Sí: ofrece `{{nivel_1}}`…`{{nivel_P}}` y `{{ubicacion}}`, rotuladas con los tipos del país. `{{provincia}}`, `{{canton}}` y `{{distrito}}` siguen ocultas y siguen resolviendo. A4 aplica. |
| 2026-11-12 | P3 — Formato de `{{ubicacion}}` | Como una dirección postal: del nivel más hondo al nivel 1, unidos por «, » y sin la zona («Carmen, San José, San José»). |
| 2026-11-12 | P4 — Tablas de `/ordenes` y de recepción satélite | También una columna por nivel, como la descarga. En CR no cambian. |
| 2026-11-12 | P5 — Filas de la descarga de cobertura | Una fila por nodo del nivel más hondo del país (P). En CR, P = 3, como hoy. |
| 2026-11-12 | P6 — Superficies que muestran lugares fuera del Alcance  Quedan fuera y se anotan como deuda en «Lo que NO entra» (para SLT-48 o una ficha nueva). Las tres pantallas de detalle de R8 sí entran. |
| 2026-11-12 | A3 — recuento del catálogo de variables | Autorizado. En `plantilla-datos.test.ts` solo cambian `:235–237`: el título y los recuentos 42 → 53 y 37 → 48. |
| 2026-11-12 | A3b — ejemplo de `{{ubicacion}}` | Ejemplo corto: los datos de ejemplo resuelven `{{ubicacion}}` a «Carmen, San José, San José». `nivel_4`…`nivel_10` no tienen ejemplo. Autorizado dejar esas 7 claves fuera de los dos tests de ejemplo (`plantilla-datos.test.ts:40` y `:248`), sin cambiar nada más ahí. |
| 2026-11-12 | «2 niveles más hondos» | Son los 2 niveles más hondos de la ruta de la ORDEN, no del país. Tarjetas, chat y PDF de tránsito muestran siempre dos lugares. En un país de 4 niveles, los niveles 2·3 hasta SLT-48; CR muestra cantón · distrito, como hoy. El título del PDF de tránsito usa los nombres de tipo de esos dos niveles. A1 y A2 se esperan sin cambio; si hay que cambiarlos, el implementer para y pregunta. |
| 2026-11-12 | P7 — Orden de CR sin distrito | Como hoy: la tarjeta, el chat y el PDF muestran solo el cantón. La regla de «2 lugares» aplica cuando la orden tiene los dos niveles más bajos que usa su país; CR se ve idéntica a hoy (R15). |
| 2026-11-12 | A8 — `select` de `findNovedadesByTienda` | Autorizado por el humano (R38): `orden-repository.novedades.test.ts:435–437` quita de lo esperado `provincia/canton/distrito: { select: { nombre: true } }` y suma `provinciaId: true` si la ruta lo necesita; nada más cambia. |
| 2026-11-12 | Tamaño tras el inventario de T1.1 | Un solo PR, aceptando ~129 archivos (antes ~95–115). |
| 2026-11-12 | A9 — Columnas escritas por fila de cierre (T2.2, R21) | Autorizado por el humano (R38): `tests/unit/repositories/cierre-dia-repository.test.ts:2019` y `tests/integration/db/cierre-detail-congelado.test.ts:658` (`COLUMNAS_DEV`) suman solo `"ubicacionSnapshot"` (29 → 30). Ninguna columna se quita ni se renombra. El doble `tests/fixtures/doble-catalogo-geografico.ts` devuelve un tipo (cambio de entrada). |
