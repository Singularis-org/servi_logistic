# SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados» — requirements (C1)

> Ruta: completa (`ruta` vacía; complexity `medium`; cambio del `WHERE` de una lectura de dinero).
> Zona: **fullstack** (servidor, con la pantalla de hoy intacta). Escrito por spec_author el
> 2026-11-11.
>
> **Corte (PA0, Carlos 2026-11-11: «partir, con la condición de que dividir no cause problemas»).**
> La S7 del madre se parte en dos rebanadas verticales:
> - **C1 = esta ficha, SLT-105:** la partición nueva de las dos listas de bodega de la central en el
>   servidor (página, total y descarga), con la pantalla de hoy (pestañas «Pendientes» / «Resueltos»
>   con tarjetas-comprobante). R44 (solo la partición), R122-R126, R136, R71, R72.
> - **C2 = ficha nueva que registra el leader:** la cola única (`ColaCierres`, `tipo` bodega, `rol`
>   central) con «Por conciliar» / «Conciliados», sus columnas y acciones. Sus R están en `## Fuera de
>   alcance (van a C2)`.
>
> Rebanada **S7** del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/` (`requirements.md` v2, R44 `[S7]`; `design.md > Zona por
> rebanada` (S7); `tasks.md > Plan de las demás rebanadas > S7`). Canvas aprobado:
> `specs/SLT-95-detalle-cierre-rediseno/canvas/project/ColaCierres.dc.html`, rama «bodega · central:
> Por conciliar / Conciliados» (líneas 192-210). Ya están en `dev` SLT-102 «Cola de cierres única:
> mensajeros (central y satélite)» y SLT-104 «Detalle de cierre de bodega en el detalle único
> (central)». Este archivo **no reabre** nada del madre.

## Alcance (C1)

`/cierres-admin` › Bodega, para la **central** (maestro/admin, acceso total):

- Las dos listas de cierres de bodega de la central dejan de partirse por `estado` (`solicitado`
  frente al resto) y pasan a partirse por **conciliación**: la lista de pendientes = pendientes de
  conciliar + recibidos incompletos (+ cualquier otro que no esté recibido entero); la de resueltos =
  solo los recibidos completos. Vale para la página, el total y el conjunto completo que baja
  «Descargar» (Resumen) de cada pestaña. Es el cambio del `WHERE` de
  `CierresBodegaAdminRepository`.
- La pantalla **no cambia de forma** (R136): mismas pestañas «Pendientes» / «Resueltos», mismas
  tarjetas, mismos botones. Solo cambia en qué pestaña cae un recibido incompleto.

## Por qué la pantalla intermedia es coherente (condición de Carlos para partir)

Mientras C2 no llegue, un cierre de bodega «Recibido incompleto» aparece en **«Pendientes»** en vez
de en «Resueltos». Se deja así, sin renombrar las pestañas, porque:

1. **Las palabras siguen diciendo la verdad.** «Pendientes» es lo que todavía pide algo a la central;
   a un recibido incompleto le falta dinero por llegar, así que **sigue pendiente**. «Resueltos» pasa a
   ser lo que ya no pide nada: recibido entero. Hoy es al revés: un incompleto se archiva en
   «Resueltos» con dinero fuera de la central, que es justo lo que R44 corrige.
2. **La tarjeta ya lo explica.** `CierreBodegaFacturaResumen` pinta la pastilla de conciliación
   («Pendiente de conciliar» / «Recibido incompleto» / «Recibido») y la columna con «Monto recibido» y
   «Falta por recibir» (`cierre-factura.tsx`, `ConciliacionBadge` y `ColumnaConciliacion`). En
   «Pendientes», una tarjeta «Recibido incompleto · Falta ₡15.000» se lee sola.
3. **La acción sigue sirviendo.** «Ver / decidir» abre el detalle de bodega (SLT-104), cuyo pie
   ofrece «Corregir» para una consolidación marcada (`ConciliacionAcciones`). Es lo que hay que hacer
   con un incompleto.
4. **El conteo de «Pendientes» cuenta lo que pide atención**, incluidos los incompletos.

**Por qué no se renombran ya las pestañas** (el mínimo de UI que se valoró): renombrar «Pendientes» /
«Resueltos» a «Por conciliar» / «Conciliados» obliga a cambiar los ~14 tests y E2E que localizan esas
pestañas por su nombre, y C1 pasaría de ~8 a ~22 archivos. Además dejaría el nombre del canvas sobre
la tarjeta vieja, a medio camino de C2. El nombre, las columnas y las acciones del canvas llegan
juntos en C2.

**Lo único que puede chocar** es el texto de vacío de hoy, «No hay cierres de bodega pendientes de
decisión.». Se conserva: sigue siendo cierto (no queda nada por decidir ni por corregir) y C2 lo
sustituye (PA3).

## Restricción de despliegue

- **C1 y C2 se promueven a `prod` juntas.** C1 puede mergearse sola en `dev` (rama de integración) y
  verse en Preview. No se promueve a `prod` hasta que C2 también esté en `dev` y aprobada en Preview
  (memoria «Aprobar en Preview antes de prod»). La vigila el leader en la promoción
  (`tasks.md > T6`). No es un requisito de producto, así que no lleva R ni test.

## Fuera de alcance (van a C2)

La ficha C2, «Cola de bodega de la central con la cola única (Por conciliar / Conciliados)»
(frontend, depende de SLT-105), se lleva estos requisitos. Su texto queda escrito aquí para que el
leader los copie a su spec sin reescribirlos:

- **R44, la parte de pantalla:** pestañas «Por conciliar (n)» / «Conciliados (n)», las columnas Folio,
  Bodega, Solicitó, Solicitado, Cierres, Debe llegar, Recibido, Falta, Estado, y las acciones «Ver /
  conciliar», «Ver / corregir», «Ver».
- **R32** [S4; alcance S7] — cola única con `tipo` bodega y `rol` central, sin tarjetas de cifras.
- **R37** [S4] — el conmutador Bodega/Mensajero (`CierresTabs`) sin cambios.
- **R127** — `tablist` «Cierres de bodega por estado» con «Por conciliar <n>» / «Conciliados <n>»: n =
  total del servidor; abre en «Por conciliar»; cambiar de pestaña conserva filtros y página.
- **R128** — una barra para las dos pestañas (`FiltrosCierresBarra` sin Mensajero: Fecha de solicitud
  y Bodega) y «Descargar» de la pestaña activa en la misma fila; filtrar devuelve cada lista a la
  página 1.
- **R129** — celdas sin derivar en el cliente: Folio «#»+`folioDe` monoespaciado; Bodega; Solicitó;
  Solicitado (fecha y hora); Cierres; Debe llegar = `paraLaCentral` en negrita; Recibido =
  `montoRecibido` o «—» (nunca ₡0); Falta = `faltaPorRecibir`, resaltada solo si
  `hayFaltantePorRecibir`; Estado con `ESTADO_CONCILIACION_LABEL` / `_VARIANT` (PA6: token de hoy).
- **R130** — acción por estado de conciliación: «Ver / conciliar» (pendiente, principal), «Ver /
  corregir» (incompleto, principal), «Ver» (recibido, secundario), con nombres accesibles «… el
  cierre de bodega de <bodega>»; las tres abren el detalle único de bodega (R40).
- **R131** — descripción «Los cierres que mandan las bodegas satélite. Márcalos recibidos cuando
  llegue el dinero.»; pie de «Por conciliar» «Un cierre «Recibido incompleto» se queda aquí hasta que
  la diferencia se reciba o se corrija.» + paginación; «Conciliados», paginación.
- **R132** — carga, error y vacío (textos de PA3: «No hay cierres de bodega por conciliar.» / «Aún no
  hay cierres de bodega conciliados.»; «No se pudieron cargar los cierres de bodega por conciliar.» /
  «… conciliados.»); regiones «Cierres de bodega por conciliar» / «Cierres de bodega conciliados».
- **R133** — `CierresBodegaAdminModule` monta `ColaCierres` y deja de montar `ListaComprobantes`,
  `CierreBodegaFacturaResumen`, `CierresBodegaResueltosLista`, `SegmentedToggle` y `PanelConmutado`;
  la mitad de Mensajero, la satélite y el detalle no cambian. Incluye sacar SLT-105 de
  `montajesPrevistos` en `tests/unit/descarga/censo-tablas.ts` y añadir el montaje real.
- **R134** — la fila no pinta lo que el canvas no dibuja (recaudado y métodos, pago a mensajeros, lo
  que gana la bodega, quién marcó y su nota, la marca de modelo nuevo, «Ver detalles»); siguen en el
  detalle (PA5: se valida en Preview).
- **R135** — la cola de mensajeros (SLT-102) sigue igual.

## Lo que NO entra (ni en C1 ni en C2)

- La bodega satélite (SLT-106 «Bodega satélite: A consolidar con la cola única», SLT-107 «Bodega
  satélite: Solicitados y su cierre de bodega en lectura»): `ConsolidacionBodegaModule`,
  `CierresBodegaSolicitadosLista` y `CierreBodegaRepository` no cambian. La tabla «Qué sustituye cada
  componente» del madre pone `CierresBodegaSolicitadosLista` en S7, pero solo lo monta la pantalla de
  la satélite.
- El saldo de `/wallet/satelites` y el detalle de bodega: no cambian.
- El listado sin paginar `listarCierresBodegaAdmin`: ninguna pantalla lo llama (Grep en `app/`),
  conserva su corte por `estado` y lo retira SLT-115 «Retirar los componentes de cierre
  sustituidos».
- Títulos, columnas y claves de los archivos de «Descargar»: no se renombran (PA4, Carlos: van con
  SLT-113 «Excel del modelo nuevo de cierres»).
- Cambiar cómo se calcula, congela o asienta un importe, la conciliación, permisos, esquema o
  migraciones (R71, R72; PA2: sin migración).

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D18 | 2026-11-09 · Carlos | Canvas aprobado con su nota p2 (cambios de comportamiento, entre ellos R44). |
| L1 | 2026-11-11 · leader | El cambio del `WHERE` se prueba con un test de integración contra la base, no con dobles (memoria «Probar el WHERE donde vive»). |
| L2 | 2026-11-11 · leader | Alcance mínimo de R44; se reutiliza lo que existe; no se rediseña. |
| PA0 | 2026-11-11 · Carlos | Partir en C1 (esta ficha) y C2 (ficha nueva), con la condición de que C1 no deje la pantalla incoherente. |
| PA0-b | 2026-11-11 · Carlos | C1 y C2 se promueven a `prod` juntas; C1 puede ir sola a `dev`. |
| PA1 | 2026-11-11 · Carlos | «Conciliados» se define en positivo (recibido entero); «Por conciliar» es el resto. Antes del PR se mide en prod (conteos por empresa, solo lectura). |
| PA2 | 2026-11-11 · Carlos | Lectura previa en SQL de los «recibidos incompletos», sin migración. |
| PA3, PA5, PA6 | 2026-11-11 · Carlos | Las propuestas del spec_author; se validan en Preview (C2). |
| PA4 | 2026-11-11 · Carlos | No se renombran los archivos de descarga; va con SLT-113 «Excel del modelo nuevo de cierres». |

Cobertura de las decisiones en C1:

| Decisión | Requisitos / dónde |
|---|---|
| D5 | R71, R72 |
| D18 | R44 (partición), R122 |
| L1 | R122, R123, R125 (test de integración con mutación, `tasks.md > T2`) |
| L2 | R136 (sin UI nueva) |
| PA0 | R136 y `## Por qué la pantalla intermedia es coherente` |
| PA0-b | `## Restricción de despliegue`; `tasks.md > T6` (no es comportamiento: sin R) |
| PA1 | R122 (Conciliados en positivo), R124; `tasks.md > T0` (medición) |
| PA2 | R123, R125; `design.md > Cómo se lee «lo que falta»` |
| PA3, PA5, PA6 | C2 (R132, R134, R129) |
| PA4 | `## Lo que NO entra`; R123 no toca títulos ni columnas |

## Requisitos (EARS)

Los R con número ≤ 78 son copia del madre: mismo número y mismo sentido. R122-R126 y R136 son nuevos.
El test previsto de cada R está en `tasks.md > Trazabilidad`.

### Partición (copia del madre, solo la parte de servidor)

- **R44** [S7; en C1 solo la partición] — «Por conciliar» DEBE incluir los pendientes de conciliar y
  los recibidos incompletos; «Conciliados», solo los recibidos completos.

  *En C1* las dos listas conservan sus nombres de hoy: «Pendientes» hace de «Por conciliar» y
  «Resueltos» de «Conciliados» (R136). Las pestañas, columnas y acciones de R44 van a C2.

### Partición por conciliación (nuevo)

- **R122** — El sistema DEBE repartir los cierres de bodega de la empresa entre las dos listas de la
  central así:
  - la lista de conciliados («Resueltos» en C1) = los que tienen la marca de recibido **y** a los que
    no les falta nada por recibir;
  - la lista por conciliar («Pendientes» en C1) = todos los demás, sea cual sea su `estado`.

  «Lo que falta por recibir» DEBE ser «Debe llegar a la central» − «Monto recibido», con «Debe
  llegar a la central» = Recaudado − Pago a mensajeros − lo que gana la bodega satélite: la misma
  resta, sobre los mismos snapshots, que da `paraLaCentral` y `faltaPorRecibir` a la tarjeta y al
  detalle. «No falta nada» DEBE significar cero o negativo (llegó de más), el mismo criterio que
  `hayFaltantePorRecibir`. Ningún cierre de bodega DEBE quedar en las dos listas ni fuera de las dos.
- **R123** — La partición de R122 DEBE aplicarse por igual a la página de cada lista, a su total y al
  conjunto completo que baja «Descargar» (Resumen) en cada pestaña, con los mismos filtros (fecha de
  solicitud y bodega) y el mismo orden de hoy (más reciente primero).
- **R124** — Para todo cierre de bodega, el estado de conciliación que la tarjeta deriva de sus
  propios datos (`conciliado`, `faltaPorRecibir`, con `estadoConciliacionDe`) DEBE ser «pendiente» o
  «incompleto» si el cierre está en la lista por conciliar, y «recibido» si está en la de conciliados.
- **R125** — La lectura de la partición DEBE considerar solo los cierres de bodega de la empresa
  activa: un cierre de otra empresa NO DEBE aparecer en ninguna lista ni contar en ningún total,
  aunque cumpla el criterio de R122.
- **R126** — CUANDO la central marca recibido un cierre con un monto menor que «Debe llegar a la
  central», el cierre DEBE quedar en la lista por conciliar con estado «Recibido incompleto». CUANDO
  lo corrige hasta que no falte nada, DEBE pasar a la de conciliados. CUANDO lo desmarca, DEBE volver
  a la lista por conciliar como «Pendiente de conciliar». Tras cada una de esas acciones, las dos
  listas y sus conteos DEBEN volver a leerse del servidor sin recargar la página.

### Pantalla intermedia (nuevo, solo C1)

- **R136** — MIENTRAS C2 no esté, `/cierres-admin` › Bodega DEBE pintar las listas de R122 con la
  pantalla de hoy, sin cambios de forma: pestaña «Pendientes» (con el total de la lista por
  conciliar) y «Resueltos»; la tarjeta-comprobante de cada cierre con su pastilla de conciliación,
  «Monto recibido» y «Falta por recibir»; el botón «Ver / decidir» en «Pendientes» y «Ver» en
  «Resueltos», que abren el detalle de bodega como hoy. SI un cierre está «Recibido incompleto»,
  ENTONCES DEBE verse en «Pendientes» con esa pastilla y su falta, y NO DEBE verse en «Resueltos».

### Dinero intacto (copia del madre)

- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.

## Preguntas abiertas

Resueltas por Carlos el 2026-11-11 (ver `## Decisiones cerradas`). Queda pendiente un **dato**, no
una decisión:

- **Medición PA1 (antes del PR):** conteos de `cierre_bodega` por empresa, `estado` y lista vieja/nueva
  en producción, con el script de solo lectura del leader (`tasks.md > T0`). SI hay algún `rechazado`
  o algún cierre que cambie de lista, ENTONCES el leader se lo enseña a Carlos antes de abrir el PR.
