# SLT-44 — Geografía jerárquica: dominio y repositorios

> Zona `backend` · Complejidad `high` · depends_on `SLT-43` · Rama `feature/SLT-44-geo-jerarquica-dominio`
>
> **Alcance.** Una sola vía de lectura de la geografía, con N niveles, sobre `nodo_geografico`. Un
> módulo puro, `lib/services/geografia-dominio.ts`, trabaja sobre el catálogo del país cargado en
> memoria: ancestros y descendientes de un nodo, activo en cascada, tipos del país y la zona que
> cubre un nodo (gana la asignación más específica). Se reescriben las lecturas de `GeoRepository` y
> de `_shared/geografia-activa.ts`, y la resolución de cobertura y de tarifa especial, que pasa a
> heredar por los ancestros. Las escrituras siguen en las tablas viejas. Costa Rica funciona igual.
>
> **Lo que NO entra.** SQL crudo de los ~12 repositorios (órdenes, cierres, tránsito, analítica,
> zonas, `extension-empresa`) → SLT-65. API v1/v2 y CSV → SLT-45. Escrituras en el nodo y
> administración → SLT-46. Filtros, exportes y presentación → SLT-47. Borrar lo viejo → SLT-48.
> Correr los scripts sobre la copia de producción: lo hace una persona.
>
> Sembrado por `/afinar-feature` el 2026-10-30. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-10-30. Vocabulario:
> - **«Catálogo»**: los nodos y los tipos de nivel de UN país, cargados en memoria.
> - **«Asignaciones de la empresa»**: sus filas de zona por nodo (`zona_distrito`) y sus marcas de
>   zona especial (`distrito_zona_especial`).
> - **«El dominio»**: `lib/services/geografia-dominio.ts`.
> - **«Hoy»**: el comportamiento de `dev` antes de esta feature.
> - **«Distrito», «cantón» y «provincia»**: los nodos de profundidad 3, 2 y 1.
>
> Las funciones, archivos y tests concretos están en `design.md`.

### El dominio, puro

- **R1** (ubicuo) El dominio DEBE calcular todo lo de R2 a R8 solo a partir del catálogo y de las
  asignaciones de la empresa que recibe como argumentos, sin abrir ninguna conexión a la base ni
  importar el cliente de base de datos.
- **R2** (ubicuo) Para un nodo del catálogo, el dominio DEBE devolver sus ancestros (de su padre a
  la raíz) y todos los nodos que cuelgan de él a cualquier profundidad. Una raíz no tiene ancestros
  y una hoja no tiene descendientes.
- **R3** (condicional) SI se pide al dominio un id que no está en el catálogo, ENTONCES DEBE
  responder «no existe», distinto de «inactivo», y para ese id NO DEBE devolver ancestros,
  descendientes, zona ni marca.
- **R4** (ubicuo) El dominio DEBE devolver los tipos de nivel del país del catálogo, con su clave y
  sus nombres singular y plural.

### Activo en cascada

- **R5** (ubicuo) Un nodo DEBE estar activo si y solo si él y todos sus ancestros están activos.
  Con tres niveles, el resultado DEBE ser idéntico al de la regla de hoy (`estaDisponible`, ficha
  374) en las 8 combinaciones de provincia, cantón y distrito y en las 4 de provincia y cantón.

### Zona que cubre un nodo y marca especial

- **R6** (ubicuo) La zona que cubre un nodo DEBE salir del nodo más cercano con al menos una
  asignación de zona de la empresa, buscando primero en el propio nodo y después en sus ancestros,
  de padre a raíz:
  - con exactamente una zona en ese nodo, esa zona;
  - con más de una, ninguna (ambigua), sin seguir subiendo a los ancestros;
  - si ningún nodo de la cadena tiene asignación, ninguna.

  Es el colapso 1/0/>1 de la ficha 374, aplicado a la asignación más específica.
- **R7** (ubicuo) Un nodo DEBE ser de zona especial para la empresa si él o alguno de sus ancestros
  tiene la marca de esa empresa.
- **R8** (de estado) MIENTRAS todas las asignaciones de zona y las marcas de la empresa son a
  distritos, el dominio DEBE dar, para cada distrito, las mismas zonas candidatas, la misma zona
  resuelta y la misma marca que hoy, y para cada provincia y cada cantón, ninguna zona y ninguna
  marca.

### Carga del catálogo

- **R9** (de estado) MIENTRAS una petición corre en el contexto de una empresa, el catálogo
  cargado DEBE contener solo los nodos y tipos del país de esa empresa, y las asignaciones solo las
  de esa empresa.
- **R10** (condicional) SI se pide el catálogo de la empresa sin contexto de empresa, ENTONCES el
  sistema DEBE fallar con `EmpresaNoResuelta` sin consultar la base. Fuera del contexto de una
  empresa, el catálogo solo DEBE poder pedirse con un país explícito, y DEBE traer solo ese país.
- **R11** (ubicuo) Cuando una petición hace varias lecturas de R14 a R20 por el mismo repositorio
  (por ejemplo, las tres listas de los filtros o las tres lecturas de la resolución por nombres),
  el catálogo y las asignaciones de la empresa DEBEN leerse de la base como mucho una vez, también
  si las lecturas van en paralelo. NO DEBEN reutilizarse entre peticiones ni entre empresas
  distintas, aunque las sirva el mismo objeto.
- **R12** (ubicuo) El nodo de una asignación de zona o de una marca especial DEBE leerse de su
  `distrito_id`. Ninguna lectura de esta feature DEBE leer `nodo_geografico_id` de `orden`,
  `zona_distrito` ni `distrito_zona_especial`, de modo que el resultado sea el mismo haya corrido
  o no el script de datos de SLT-43.
- **R13** (ubicuo) Ninguna lectura de la geografía DEBE calcular ancestros o descendientes con una
  consulta recursiva en la base. Una consulta que necesite los nodos bajo otro DEBE recibir la lista
  de ids ya calculada con el catálogo.

### Lecturas del catálogo

- **R14** (ubicuo) Las listas planas de provincias, cantones y distritos de los filtros DEBEN salir
  del catálogo. DEBEN devolver los mismos ids, nombres, padres y disponibilidad efectiva que hoy, en
  el mismo orden por nombre.
- **R15** (ubicuo) La geografía de una zona (filtros por zona) DEBE contener los nodos asignados a
  esa zona por la empresa, todos los nodos que cuelgan de ellos y los ancestros de unos y otros,
  cada uno con su disponibilidad efectiva. MIENTRAS las asignaciones sean solo a distritos, DEBE
  devolver lo mismo que hoy.
- **R16** (ubicuo) El árbol de la empresa (pantalla de tarifas) DEBE salir del catálogo. Para cada
  distrito DEBE llevar su flag propio, la zona que lo cubre según R6 y su marca según R7. MIENTRAS
  las asignaciones sean solo a distritos, DEBE ser idéntico al de hoy.
- **R17** (ubicuo) El árbol de un país para el superadmin DEBE salir del catálogo de ese país, con
  el id, el nombre, el código oficial y el flag propio de cada nodo, idéntico al de hoy.

### Cobertura y tarifa especial

- **R18** (ubicuo) La resolución por nombres de la carga masiva por sesión, la carga por API key y
  la cotización por API key DEBE salir del catálogo de la empresa. Para cada distrito DEBE usar la
  zona de R6 con su `esCentral`, la marca de R7 y la disponibilidad de R5. Sus contratos no cambian:
  mismas filas, mismos campos y los mismos mensajes de error por fila.
- **R19** (ubicuo) La lectura del distrito propuesto en la corrección de datos del cliente DEBE
  salir del catálogo, con la zona de R6, la marca de R7 y la disponibilidad de R5. DEBE responder
  «no existe» para un id que no sea un distrito del país de la empresa, como hoy.
- **R20** (ubicuo) El Excel de cobertura DEBE clasificar cada distrito con las zonas candidatas de
  R6, la marca de R7 y la disponibilidad de R5. MIENTRAS las asignaciones sean solo a distritos,
  DEBE dar el mismo resultado que hoy, fila a fila.

### Equivalencia de dinero

- **R21** (de estado) MIENTRAS las asignaciones de zona y las marcas son solo a distritos, para cada
  empresa de los datos de prueba DEBEN coincidir, antes y después de esta feature:
  - en cada distrito de su país: la zona resuelta, su `esCentral`, la marca y la disponibilidad;
  - en cada zona: el conjunto de distritos que resuelve;
  - en cada fila de cotización de una muestra: la cobertura, la zona, los importes y los errores.
- **R22** (por evento) CUANDO una persona ejecuta el script de equivalencia de dinero sobre una
  base, el script DEBE comparar, para cada empresa, la lectura de hoy con la nueva en lo mismo que
  R21. La muestra de cotizaciones DEBE armarse con la ubicación, la tienda y el monto de órdenes
  reales, con un tamaño configurable. El script DEBE imprimir las cifras de cada comparación y
  terminar con un código distinto de 0 si alguna difiere.
- **R23** (ubicuo) El script de equivalencia NO DEBE escribir en ninguna tabla: toda su lectura DEBE
  correr en transacciones de solo lectura. NO DEBE imprimir nombres de destinatarios, direcciones ni
  teléfonos: solo cifras, ids de empresa, de zona y de nodo, y los importes que difieran.

### Lo que no cambia

- **R24** (ubicuo) Las escrituras de geografía, zonas y marcas especiales DEBEN seguir en las tablas
  viejas. Ningún código de esta feature DEBE escribir en `nodo_geografico` ni en
  `tipo_nivel_geografico`. `GeografiaService` sigue siendo el que escribe la administración.
- **R25** (ubicuo) Esta feature NO DEBE añadir migraciones, salvo un índice que haga falta. En ese
  caso, la migración DEBE ser solo `CREATE INDEX` y traer su `down.sql`.
- **R26** (de estado) MIENTRAS conviven los dos modelos, las pantallas, la API, la carga masiva, la
  cotización, la corrección de datos, el Excel de cobertura y los flujos de órdenes, zonas y cierres
  DEBEN comportarse igual para Costa Rica:
  - sus tests de integración existentes pasan sin cambiar sus aserciones;
  - los E2E existentes de dinero y de reparto pasan en el gate completo de CI;
  - las lecturas de órdenes, cierres, tránsito, analítica y zonas que no cubren R14 a R20 siguen
    leyendo la geografía vieja sin cambios (SLT-65).

**Qué requisito cubre cada decisión cerrada:**

| Decisión | Requisitos |
|---|---|
| Catálogo en memoria, sin CTE | R1, R2, R13 |
| Lugar desde las FK viejas | R12 |
| Dos tarjetas | R26 |
| Quién corre la equivalencia | R21, R22, R23 |
| Más de una zona | R6, R8 |
| Módulo nuevo y puro | R1, R24 |
| E2E | R26 |
| Precedentes | R5 y R6 (374), R9 (SL-17), R25 (SLT-43) |

## Preguntas abiertas

- ~~Dónde vive la caché del catálogo del país y cuándo se invalida: por petición, por proceso con
  TTL, o al escribir geografía. Lo decide el `design.md`.~~ **Propuesta en `design.md` §4:** por
  petición y por empresa, sin TTL ni invalidación (R11). Se cierra al aprobar el spec; si el humano
  la acepta, pasa a «Decisiones cerradas».
- **¿SLT-46 debe depender también de SLT-65?** Hay lecturas de zona y de marca especial que quedan
  en la frontera y van a SLT-65 (`design.md` §7):
  - la marca de una orden ya creada en `OrdenRepository` (listado de API, corrección y devolución);
  - la marca de una orden en `CierreDiaRepository`;
  - la re-derivación de zona al guardar una zona (`ZonaRepository.update`).

  Mientras las asignaciones sean solo a distritos, dan lo mismo que la herencia. Pero si SLT-46
  permite asignar una zona o una marca a un cantón antes de que SLT-65 las migre, divergen y
  cobran distinto. **Recomendación:** que SLT-46 dependa de SLT-65.
- **Los totales de cierres de la equivalencia de dinero** (los pide la tarjeta en «Mitigaciones»)
  no se miden en el script de esta feature: SLT-44 no toca ninguna lectura de cierres. Se proponen
  para el script de SLT-65, que sí las reescribe (`design.md` §6). ¿De acuerdo?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-30 | ¿Cómo se resuelven ancestros y descendientes sin `ruta`? | Con el catálogo del país en memoria (unos 500 nodos). El SQL recibe la lista de ids ya calculada (`= ANY($ids)`). Sin CTE recursiva. Hereda la enmienda «sin `ruta`» de SLT-43 (Camilo). |
| 2026-10-30 | ¿De dónde se lee el lugar de una orden o de una zona? | De las FK viejas (`COALESCE(distrito_id, canton_id)`): el nodo tiene el mismo id. El deploy no depende de que haya corrido el backfill de SLT-43 (Camilo). |
| 2026-10-30 | ¿Una tarjeta o dos? | Dos. El SQL crudo de los repositorios va a SLT-65, que depende de SLT-44. SLT-47 y SLT-48 dependen también de SLT-65 (Camilo). |
| 2026-10-30 | ¿Quién corre la equivalencia de dinero sobre la copia de producción? | Una persona, con el script que deja esta feature, antes del merge; el resultado se pega en el PR. En CI se cubre con fixtures. Mismo patrón que el script de datos de SLT-43 (Camilo). |
| 2026-10-30 | ¿Qué pasa si un nodo cae en más de una zona? | Se hereda el colapso 1/0/>1 de la ficha 374 (`_shared/zona-colapso.ts`), aplicado a la asignación más específica entre los ancestros. |
| 2026-10-30 | ¿`geografia-dominio` o `GeografiaService`? | Un módulo nuevo y puro, como dice la tarjeta. `GeografiaService` sigue con las escrituras de administración. |
| 2026-10-30 | ¿E2E? | No hay E2E nuevo. Hacen de red los E2E existentes de dinero y reparto, más la integración contra Postgres real. Se hereda de SL-20 y SLT-43. |
| 2026-10-30 | Precedentes | SL-20 (identificadores en español), ficha 374 (retiro por `activo`, colapso de zona), SL-17 (geografía de plataforma, solo lectura para la empresa), SLT-43 (migraciones solo aditivas, un PR por tarjeta a `dev`). |
