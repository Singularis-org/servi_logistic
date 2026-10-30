# SLT-59 — Reducir llamadas pagadas a Google en la optimización de ruta · requirements

> Notación EARS (`docs/specs.md`). Cada `R<n>` mapea a **al menos un test concreto** (tabla al final).
> Precedentes que se respetan: `specs/92-optimizacion-ruta-mensajero` (R20, R34, R35, R36, R38) y
> `specs/265-optimizador-lee-al-proveedor` (R16-R26, R33). Cuando se cita uno de ellos se escribe
> **«92/R36»** o **«265/R33»**; un `R<n>` sin apellido es de esta ficha.
>
> **Revisión 2 (2026-10-29), con las respuestas del humano a P1-P7.** La numeración de la revisión 1
> no se aprobó nunca y se rehace aquí entera; ningún otro documento la cita.
>
> **Leyenda de procedencia** (regla 6 de `CLAUDE.md`):
> - 🔎 **VERIFICADO** — leído en el árbol de `feature/SLT-59-ahorro-llamadas-google-ruta` (= `dev` en `cbd538b`).
> - 🧭 **PROPUESTO** — criterio del spec_author pendiente de confirmar (solo en `## Preguntas abiertas`).

---

## Alcance

**Entra:**
- **A.** No reoptimizar si el conjunto de paradas no cambió, salvo que el mensajero se haya desviado
  de la ruta dada más de 1 km. Igual para el caso de una parada (`computeRoutes`).
- **A'.** Cuando una gestión solo QUITA paradas, se reutiliza el orden anterior sin `optimizeTours`, y
  el trazado se rehace con los tramos guardados («optimizar sin pagar»).
- **B.** Las gestiones que no cambian el conjunto de paradas no encolan optimización; las que sí, con
  debounce como la recogida (`RUTA_DEBOUNCE_S`).
- **C.** Reintentos del optimizador: 401/403 no se reintentan; el máximo de intentos baja a 3.

**No entra** (otra ficha si se quiere): caché de la línea recta de respaldo, caché de
`ZERO_RESULTS` en geocode, intervalo de los botones manuales, reintentos de geocoding, el rechazo
del endpoint de token (`RutaTokenError`).

**Sin cambio:** añadir paradas (recogida, nueva asignación, traspaso) sigue reoptimizando como hoy,
con su debounce.

---

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo | Cubierta por |
| --- | --- | --- | --- |
| D1 | Bloque A: sin cambio de conjunto no se reoptimiza; aplica también al caso de una parada. | humano, vía leader, 2026-10-29 | R1, R2, R6, R7 |
| D2 | Bloque B: la gestión que no cambia las paradas no encola; la que sí, con debounce como la recogida. | humano, vía leader, 2026-10-29 | R21-R26 |
| D3 | Bloque C: 401/403 no se reintentan; se baja el máximo de intentos. | humano, vía leader, 2026-10-29 | R29-R35 |
| D4 | Fuera de alcance: caché de línea recta, caché de `ZERO_RESULTS`, intervalo de botones manuales, reintentos de geocoding. | humano, vía leader, 2026-10-29 | R38 |
| D5 | Sin dependencia nueva. | humano, vía leader, 2026-10-29 | R39 |
| D6 | (P1) Una gestión que solo quita paradas reutiliza el orden anterior, sin `optimizeTours`. | humano, 2026-10-29 | R11, R12, R17, R18 |
| D7 | (P1b) El trazado se rehace con los tramos guardados, sin `computeRoutes` («optimizar sin pagar»). Si la parada quitada no es la primera (entrega fuera de orden), el tramo puente lo decide el spec con la opción más barata correcta. | humano, 2026-10-29 | R13-R16 (y P8) |
| D8 | (P2/P3) Con el conjunto sin cambios, se reoptimiza SOLO si el mensajero se desvió de la ruta dada más de 1 km (`RUTA_REOPT_DISTANCIA_M = 1000`). **Sin criterio de tiempo** (`RUTA_REOPT_MIN_MIN` se retira). | humano, 2026-10-29 | R3, R4, R5, R10, R19, R36 |
| D9 | (P4) `RUTA_OPT_MAX_INTENTOS = 3`. | humano, 2026-10-29 | R32, R36 |
| D10 | (P5) El precio de los SKU queda informativo: el spec cuenta llamadas, no dinero. | humano, 2026-10-29 | R37 |
| D11 | (P6) El rechazo del endpoint de token queda fuera de esta ficha. | humano, 2026-10-29 | R29 (lo acota a 401/403 de `optimizeTours`) |
| D12 | (P7) El debounce de las gestiones que cambian paradas se queda como se acordó (~2 min de retraso aceptado). Con D7, las entregas en orden ya no esperan a la cola. | humano, 2026-10-29 | R21, R27 |
| D13 | Añadir paradas (nueva asignación, recogida, traspaso) sigue reoptimizando como hoy, con debounce. | humano, 2026-10-29 | R20, R26 |
| D14 | (P8) Entrega fuera de orden: el tramo puente se pide con una sola llamada a `computeRoutes` (solo ese tramo; con más de un hueco, una llamada desde la primera parada restante). Nunca `optimizeTours`, nunca línea recta. Va en el job. | humano, 2026-10-29 («aprobado») | R14 |
| D15 | (P9) La gestión sigue encolando el job con debounce como red de seguridad de la reducción best-effort (0 llamadas si no hay cambios). | humano, 2026-10-29 («aprobado») | R21, R27 |

---

## Hallazgo que motivó D6 (se conserva)

🔎 **Desde la ficha 454, toda gestión de una orden con coordenadas cambia el conjunto de paradas.**
`OrdenRepository.findParadasEnReparto` (`lib/repositories/OrdenRepository.ts:3323-3349`) excluye las
órdenes con gestión pendiente, sea cual sea el resultado. Sin D6, una jornada de gestiones espaciadas
seguía pagando un `optimizeTours` y un `computeRoutes` por gestión.

---

## Glosario

| Término | Significado |
| --- | --- |
| **Conjunto de paradas** | Los `ordenId` que se enviarían al proveedor en esta ejecución: en reparto, sin gestión pendiente, sin ayuda abierta, con coordenadas, recortados a `RUTA_MAX_PARADAS` (92/R37, 92/R38). |
| **Secuencia persistida** | La secuencia de la ruta del mensajero tal como está guardada (`ruta_optimizada_parada`). |
| **Posición del mensajero** | El origen final de la ejecución (92/R24 + 265/R16) cuando su fuente es `gps` o `ultima_conocida`. Si la fuente es `centroide`, **no hay** posición del mensajero. |
| **Línea de referencia** | La ruta dada contra la que se mide la desviación: ver R4. |
| **Desviado** | Posición del mensajero a más de `RUTA_REOPT_DISTANCIA_M` metros de la línea de referencia. |
| **Reducción** | Persistir la secuencia previa sin las paradas que ya no están (R11). |
| **Prefijo** | Las paradas quitadas son las primeras de la secuencia persistida, sin saltarse ninguna (entrega en orden). |
| **Tramo** | La polilínea por calles que LLEGA a una parada, guardada en su fila (🔎 `schema.prisma`, `RutaOptimizadaParada.tramoPolilinea`; la fila 1 guarda origen → primera parada). |

---

## Bloque A — No repagar cuando nada relevante cambió

**R1.** SI la ruta del mensajero está `vigente`, el conjunto de paradas (2 o más) es idéntico al de la
secuencia persistida y el mensajero no está desviado, ENTONCES el sistema DEBE completar la ejecución
sin llamar a `optimizeTours` ni a `computeRoutes`.

**R2.** SI la ruta está `vigente`, el conjunto tiene exactamente una parada, es el mismo de la
secuencia persistida y el mensajero no está desviado, ENTONCES el sistema DEBE completar la ejecución
sin llamar a `computeRoutes` y DEBE devolver el trazado persistido si existe.

**R3.** El sistema DEBE considerar desviado al mensajero SI Y SOLO SI hay posición del mensajero y su
distancia mínima a la línea de referencia supera `RUTA_REOPT_DISTANCIA_M`.

**R4.** El sistema DEBE usar como línea de referencia la polilínea por calles persistida de la ruta
cuando exista; SI no existe, ENTONCES DEBE usar la línea recta que une, en el orden de la secuencia
persistida, las paradas de esa secuencia que tengan coordenadas (con una sola, ese punto).

**R5.** SI no hay posición del mensajero, ENTONCES el sistema DEBE considerarlo no desviado.

**R6.** MIENTRAS el sistema omita una ejecución por R1 o R2, NO DEBE modificar la secuencia, la
huella, el origen, `calculada_at` ni el trazado persistidos.

**R7.** SI la ruta está `desactualizada`, ENTONCES el sistema NO DEBE aplicar R1, R2 ni R11.

**R8.** El sistema DEBE evaluar las guardas de coste en el mismo orden que hoy (92/R20, 92/R34,
92/R35, 92/R38, 265/R16) y la comprobación de R1 DEBE ocupar la posición que hoy ocupa 92/R36, con la
de R11 inmediatamente después.

**R9.** Las comprobaciones de R1-R5 y R11 NO DEBEN añadir lecturas de base de datos ni llamadas
facturadas a las que la ejecución ya hace hoy antes de la guarda 92/R36.

**R10.** El sistema NO DEBE usar el tiempo transcurrido desde el último cálculo como motivo para
reoptimizar un conjunto sin cambios.

---

## Bloque A' — Una gestión que solo quita paradas

**R11.** SI la ruta está `vigente`, el conjunto actual es un subconjunto estricto y no vacío de la
secuencia persistida y el mensajero no está desviado, ENTONCES el sistema DEBE persistir la secuencia
previa sin las paradas que faltan, conservando su orden relativo y sin huecos, y NO DEBE llamar a
`optimizeTours`.

**R12.** CUANDO el sistema persista una reducción, DEBE conservar la procedencia (`secuencia_fuente`)
de la secuencia de la que se deriva.

**R13.** SI las paradas quitadas son un prefijo y el trazado persistido es por calles con tramo en
todas las paradas restantes, ENTONCES el sistema DEBE rehacer el trazado de la reducción
concatenando esos tramos, sin llamar a `computeRoutes`, con distancia y duración iguales a la suma de
los tramos.

**R14.** SI las paradas quitadas no son un prefijo (entrega fuera de orden) y el trazado persistido es
por calles con tramos completos, ENTONCES el sistema DEBE hacer **exactamente una** llamada a
`computeRoutes`: para el único tramo puente si solo hay un hueco, o para todos los tramos posteriores a
la primera parada restante si hay más de uno; y NUNCA DEBE insertar un segmento recto dentro de un trazado por calles.

**R15.** SI el trazado persistido no es por calles o le falta el tramo de alguna parada restante,
ENTONCES el sistema DEBE persistir la reducción sin llamar a `computeRoutes` y sin trazado.

**R16.** SI la llamada de R14 falla, ENTONCES el sistema DEBE persistir igualmente la reducción, sin
trazado, sin propagar el error y sin reintento.

**R17.** CUANDO el sistema persista una reducción, NO DEBE modificar `calculada_at`.
> Motivo: 92/R20 descarta los jobs creados antes de `calculada_at`. Si la reducción la moviera, un job
> de recogida en vuelo se daría por cubierto sin que nadie hubiera optimizado las paradas nuevas.

**R18.** El sistema DEBE escribir la reducción solo si la ruta conserva la misma huella que tenía al
leerla; SI la huella cambió, ENTONCES NO DEBE escribir nada y NO DEBE lanzar.

**R19.** SI el mensajero está desviado, ENTONCES el sistema DEBE reoptimizar el conjunto completo como
hoy, aunque el conjunto sea igual o un subconjunto de la secuencia persistida.

**R20.** SI el conjunto contiene alguna parada que no está en la secuencia persistida, ENTONCES el
sistema DEBE reoptimizar el conjunto completo como hoy.

---

## Bloque B — Encolado y reducción desde la gestión del mensajero

**R21.** CUANDO un mensajero registre una gestión sobre una orden que tiene coordenadas, el sistema
DEBE encolar la reoptimización de su ruta con `runAfter = ahora + RUTA_DEBOUNCE_S`, dentro de la
misma transacción que registra la gestión.

**R22.** SI la orden gestionada no tiene coordenadas, ENTONCES el sistema NO DEBE encolar ninguna
reoptimización por esa gestión.

**R23.** MIENTRAS exista un job de reoptimización con debounce del mismo mensajero en la misma
ventana —lo haya encolado una recogida, un traspaso o una gestión—, una gestión NO DEBE crear un job
nuevo ni adelantar el existente.

**R24.** La clave de deduplicación del encolado por gestión DEBE cumplir 92/R18: nunca puede quedar
ocupada para siempre por una fila `done`.

**R25.** SI la gestión no es gestionable o su transacción revierte, ENTONCES el sistema NO DEBE dejar
ningún job de reoptimización encolado por ella.

**R26.** El sistema NO DEBE cambiar el encolado de la recogida ni del traspaso.

**R27.** CUANDO se registre una gestión con éxito, el sistema DEBE aplicar en la misma petición, después
de guardar la ubicación recibida, la reducción de R11 SI se resuelve por R13 o R15 (sin ninguna llamada
facturada); SI requiere una llamada (R14) o una reoptimización (R19, R20), ENTONCES NO DEBE hacerla en
la petición y la deja al job de R21.

**R28.** SI la reducción de R27 falla, ENTONCES la gestión DEBE responder igual que si no se hubiera
intentado.

---

## Bloque C — Reintentos del optimizador

**R29.** CUANDO `optimizeTours` responda HTTP 401 o 403 durante un job, el sistema DEBE dejar ese job
en fallo terminal en ese mismo intento, sin backoff ni reintento.

**R30.** CUANDO ocurra R29, el sistema DEBE conservar intacto el último orden válido y marcar la ruta
`desactualizada` (92/R27).

**R31.** CUANDO `optimizeTours` responda 401 o 403 durante la sincronización manual, la pantalla DEBE
recibir el mismo resultado de dominio que hoy ante un fallo del proveedor, y el borde NO DEBE lanzar
una excepción no tipada (265/R25).

**R32.** El sistema DEBE encolar los jobs de reoptimización con un máximo de intentos igual a
`RUTA_OPT_MAX_INTENTOS` (3).

**R33.** SI el fallo del proveedor es transitorio (red, timeout, 5xx, cuota) o una excepción del
cliente, ENTONCES el sistema DEBE seguir aplicando backoff hasta agotar `RUTA_OPT_MAX_INTENTOS`.

**R34.** El sistema NO DEBE cambiar el manejo de fallos de ningún otro tipo de job de la cola.

**R35.** El motivo registrado en el job en fallo terminal NO DEBE contener la credencial, el token, la
URL ni coordenadas (92/R14).

---

## Configuración, verificación y no-regresión

**R36.** El sistema DEBE leer `RUTA_REOPT_DISTANCIA_M` (default 1000) y `RUTA_OPT_MAX_INTENTOS`
(default 3) de un único punto de configuración; un valor ausente, vacío o inválido DEBE caer al
default sin lanzar.

**R37.** CUANDO se ejecute la jornada de referencia de `design.md` §8, el sistema DEBE producir
exactamente el número de llamadas a `optimizeTours`, llamadas a `computeRoutes` y jobs encolados que
esa tabla fija en la columna «Nuevo».

**R38.** El sistema NO DEBE cambiar el intervalo mínimo de los botones manuales
(`RUTA_SYNC_MIN_INTERVALO_S`, default 10) ni el máximo de intentos de la geocodificación.

**R39.** La feature NO DEBE añadir ninguna dependencia de terceros.

**R40.** La feature NO DEBE requerir migración de esquema, columna nueva ni relleno de datos.

---

## Límite declarado

**Sin polilínea por calles, la línea de referencia empieza en la primera parada (R4).** Un mensajero
que todavía está a más de 1 km de su primera parada cuenta como desviado y paga una reoptimización
por disparo. Solo pasa cuando `computeRoutes` falló y la ruta se quedó sin trazado por calles; sin
credencial no se paga nada (los dos clientes degradan a cálculo local). Se acepta para no añadir una
columna con el origen del cálculo (alternativa A1 de `design.md`).

---

## Trazabilidad

| Req | Test |
| --- | --- |
| R1-R7, R10 | `tests/unit/services/optimizacion-ruta-desvio.test.ts` |
| R3, R4 (geometría) | `tests/unit/geo/polilinea.test.ts` |
| R8 | `tests/unit/services/optimizacion-ruta-service.test.ts` (describe «265/R33 — las guardas cortan EN ESTE ORDEN») |
| R9 | `tests/unit/services/optimizacion-ruta-desvio.test.ts` (cuenta de lecturas de los dobles) |
| R11-R20 | `tests/unit/services/optimizacion-ruta-reduccion.test.ts` |
| R18 | + `tests/integration/repositories/ruta-optimizada-repo.test.ts` |
| R21-R26 | `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts` |
| R23, R24, R32 | `tests/unit/services/optimizacion-ruta-encolado.test.ts` |
| R27, R28 | `tests/unit/actions/mis-asignaciones-action.test.ts` |
| R29, R30, R35 | `tests/unit/services/optimizacion-ruta-credencial-rechazada.test.ts` |
| R29, R33, R34 | `tests/unit/services/job-queue-service-permanente.test.ts` |
| R31 | `tests/unit/actions/sincronizar-ruta.test.ts` |
| R36, R38 | `tests/unit/config/route-optimization-config.test.ts` |
| R37 | `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` |
| R39 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente, sin cambios) |
| R40 | revisión del diff por el reviewer: `db/` sin cambios (`git diff --stat dev -- db/` vacío) |

---

## Preguntas abiertas

Ninguna. P8 y P9 se cerraron como D14 y D15 (humano, 2026-10-29, «aprobado»).
