# SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» — requirements

> Ruta: completa. Zona: **fullstack**. Escrito por spec_author el 2026-11-12.
>
> Es la parte 2 de SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros», que ya está en
> `dev`. Los requisitos R167-R179 se copian **tal cual y con su número** de
> `specs/SLT-137-cierre-dia-cola-filtros/requirements.md > ## Fuera de alcance > → SLT-138`, y R180
> (trato tú) también, como pide esa misma sección. Si hiciera falta un requisito nuevo, iría en el
> rango **R300-R309**; este spec no lo necesita.

## Alcance

`/cierre-dia`, rol mensajero, sección «Cierres solicitados» (la `ColaCierres` con `tipo: "propios"`
que dejó SLT-137 con `barra={null}`):

- **La barra de la cola.** En el hueco `barra` se monta la barra de filtros de la app
  (`BuscadorFiltros` + `FilterComponent`): un buscador por folio y dos filtros, «Fecha de solicitud»
  y «Estado».
- **El filtrado en el servidor.** El listado paginado de «Cierres solicitados» y su archivo de
  «Descargar» aceptan un bloque `filtros` y lo aplican en el `WHERE`, siempre dentro del alcance
  del mensajero de la sesión. El conteo de la pestaña y el archivo respetan los filtros.
- **La pantalla.** Cambiar un filtro vuelve a la página 1; con filtros y sin resultados, la cola
  dice «Ningún cierre coincide con los filtros.»; «Limpiar todo» vuelve a la lista sin filtros.

## Fuera de alcance

- Las barras de `/cierres-admin` (cola de mensajeros y de bodega) y la de la consolidación de
  bodega: no cambian (R179).
- Las tarjetas de cifras del mensajero (R69, SLT-112), el detalle del cierre (SLT-108) y la celda
  «Pago» (SLT-137): no cambian.
- Cambiar cómo se calcula, congela o asienta un importe, permisos, esquema o migraciones (R71, R72
  de SLT-137 siguen aplicando).
- Guardar los filtros entre visitas o en vistas guardadas.

## Decisiones cerradas (no reabrir)

Vienen de `specs/SLT-137-cierre-dia-cola-filtros/requirements.md > ## Decisiones cerradas` y de su
bloque `→ SLT-138`.

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D6 | canvas n2 | Una cifra, un nombre; un solo trato: tú. |
| D15, D17 | 2026-11-09 · Carlos | Componentes iguales con props distintas: se reutilizan `ColaCierres`, `DescargarDatasetButton` y la barra de filtros de la app. |
| S10-PA2 | 2026-11-11 · Carlos | Los filtros de la cola usan el componente de filtros de la app y se aplican en el servidor (R167). |
| SLT137-D2 | 2026-11-12 · Carlos | El buscador y los filtros (R167-R179) pasan a esta ficha, sin borrarlos ni renumerarlos. |
| SLT137-D3 | 2026-11-12 · Carlos | Buscar por folio = el folio **contiene** el texto (con «3F2A» salen los cierres cuyo folio tiene «3F2A» en cualquier posición). No se exige el folio exacto. |
| SLT137-D4 | 2026-11-12 · Carlos | Los filtros se hacen **reutilizando `BuscadorFiltros`** (`components/shared/BuscadorFiltros.tsx`), el componente común de la app, con `FilterComponent`. Nada de buscador ni filtros propios. |

Cobertura:

| Decisión | Requisitos |
|---|---|
| D5 | R172, R173 (leer con filtros no cambia el listado sin ellos; ningún importe se toca) |
| D6 | R180 |
| D15, D17 | R167, R177 |
| S10-PA2 | R167, R168-R172 |
| SLT137-D2 | R167-R179 (todos aquí, con su número) |
| SLT137-D3 | R171 |
| SLT137-D4 | R167, R177 |

## Requisitos (EARS)

Requisitos en alcance: R167-R180. Su test está en `tasks.md > ## Trazabilidad`.

### Copia de SLT-137 (texto tal cual)

- **R167** (decisión de Carlos 2026-11-11) — La barra de la cola con rol mensajero DEBE usar el
  componente de filtros de la app: `BuscadorFiltros` (`components/shared/BuscadorFiltros.tsx`) con
  `FilterComponent` (`components/shared/FilterComponent.tsx`), como `FiltrosCierresBarra` en
  `/cierres-admin`. DEBE ofrecer:
  - buscador por folio;
  - filtro por fecha de solicitud;
  - filtro por estado.

  El filtrado DEBE hacerse en el servidor, con el alcance del mensajero en el `WHERE`. El conteo de
  la pestaña y el archivo de «Descargar» DEBEN respetar los filtros puestos.

#### Buscador y filtros (servidor)

- **R168** — El listado paginado de «Cierres solicitados» y su archivo DEBEN aceptar el mismo bloque
  `filtros`, con solo estas claves, todas opcionales: `desde`, `hasta`, `estados` y `folio`.
  - SI la petición trae cualquier otra clave, dentro o fuera de `filtros` (entre ellas `mensajeroId`,
    `mensajeroIds` y `destinoZonaIds`), ENTONCES el sistema DEBE responder `validation_error` sin
    leer la base.
  - SI `desde` es posterior a `hasta`, ENTONCES DEBE responder `validation_error`.
- **R169** — DONDE el filtro trae `desde`, `hasta` o los dos, el listado DEBE devolver solo los
  cierres con fecha de solicitud igual o posterior a las 00:00 de `desde` y anterior a las 00:00 del
  día siguiente a `hasta`, en la zona horaria del país de la empresa.
- **R170** — DONDE el filtro trae `estados`, el listado DEBE devolver solo los cierres cuyo estado
  esté en esa lista. SI `estados` llega vacío o con un valor que no es un estado de cierre, ENTONCES
  el sistema DEBE responder `validation_error`.
- **R171** — DONDE el filtro trae `folio`, el sistema DEBE quitarle los espacios de los extremos y un
  «#» inicial, y pasarlo a mayúsculas. El listado DEBE devolver solo los cierres cuyo folio (los 8
  caracteres de R156, sin «#») contenga ese texto.
  - SI el texto queda vacío, ENTONCES el filtro DEBE ignorarse.
  - SI tiene un carácter que no puede estar en un folio (fuera de `0-9` y `A-F`), ENTONCES el
    listado DEBE devolver cero cierres y `total` 0.
  - SI pasa de 20 caracteres antes de normalizar, ENTONCES DEBE responder `validation_error`.
- **R172** — Cada filtro, solo o combinado con los demás, DEBE aplicarse dentro del alcance del
  mensajero de la sesión: ninguno DEBE devolver ni contar un cierre de otro mensajero. El `total`
  DEBE ser el número de cierres del mensajero que cumplen todos los filtros a la vez.
- **R173** — MIENTRAS no haya ningún filtro puesto, el listado paginado y su archivo DEBEN devolver
  los mismos cierres que hoy y en el mismo orden.
- **R174** — CUANDO el mensajero pulsa «Descargar» con filtros puestos, el archivo DEBE llevar todos
  los cierres del mensajero que cumplen esos filtros, no solo la página visible.

#### Buscador y filtros (pantalla)

- **R175** — CUANDO el mensajero cambia el folio, la fecha o el estado, la cola DEBE volver a la
  página 1 y pedir al servidor la página con los filtros nuevos. El conteo de la pestaña DEBE ser el
  `total` de esa respuesta.
- **R176** — SI hay algún filtro puesto y el servidor devuelve cero cierres, ENTONCES la cola DEBE
  decir «Ningún cierre coincide con los filtros.» en lugar de «Aún no has solicitado ningún cierre.».
- **R177** — La barra de la cola con rol mensajero DEBE ofrecer:
  - un campo de búsqueda con la guía «Busca por folio»;
  - en el selector «Filtros», solo «Fecha de solicitud», con los mismos atajos de rango que
    `/cierres-admin`, y «Estado», con los cuatro estados del cierre con su etiqueta legible y sin
    agruparlos por lista.

  NO DEBE ofrecer «Bodega» ni «Mensajero», ni el aviso «Filtro activo: los dos listados muestran
  solo lo que casa con él.».
- **R178** — CUANDO el mensajero pulsa «Limpiar todo», la barra DEBE vaciar el folio, la fecha y el
  estado, y la cola DEBE volver a la lista sin filtros, en la página 1.
- **R179** — La barra de filtros de `/cierres-admin` (cola de mensajeros y de bodega) y la de la
  consolidación de bodega NO DEBEN cambiar: mismos filtros, mismo campo de búsqueda sin efecto y
  mismo aviso.
- **R180** — Todo texto nuevo de la cola con rol mensajero y de su barra DEBE tratar de tú, sin
  voseo (por ejemplo «Busca», nunca «Buscá»).

### Nuevos

Ninguno. El rango R300-R309 queda libre.

## Notas de lectura (no cambian los requisitos)

- **«Folio» (R171)** es el de R156: los últimos 8 caracteres del id del cierre, en mayúsculas. Un
  texto que aparezca en el id **fuera** de esos 8 caracteres no cuenta.
- **«Sin leer la base» (R168)**: el `validation_error` sale del borde, antes de llamar al servicio.
- **«Mismo orden» (R173)**: el de hoy, fecha de solicitud de la más reciente a la más antigua.
- **Deuda de SLT-137 corregida aquí**: R164 decía «`min(P, E)`» y el código usa `P − min(P, E)`.
  Se corrigió la redacción en `specs/SLT-137-cierre-dia-cola-filtros/requirements.md`, sin cambiar
  el comportamiento.

## Preguntas abiertas

1. **Folio de más de 20 caracteres (R171).** El servidor responde `validation_error` y la cola
   enseñaría el error de hoy, «No se pudieron cargar tus cierres solicitados.». Ningún folio pasa
   de 8 caracteres, así que solo llega ahí quien pega un texto largo.
   **Recomendación:** dejarlo así en esta ficha (es lo que dice R171) y no añadir un aviso propio.
   Si Carlos prefiere otra cosa, sería un R300.

Resuelta al escribir: **«Descargar» con un filtro que no deja ningún cierre (R174).** No hay que
decidir nada: `DescargarDatasetButton` ya avisa «No hay datos que descargar con los filtros
aplicados. Ajusta los filtros y vuelve a intentarlo.» (`components/shared/DescargarDatasetButton.tsx:89`),
y ya trata de tú. Esta ficha no lo cambia.
