# SLT-59 — Reducir llamadas pagadas a Google en la optimización de ruta · requirements

> Notación EARS (`docs/specs.md`). Cada `R<n>` mapea a **al menos un test concreto** (tabla al final).
> Precedentes que se respetan: `specs/92-optimizacion-ruta-mensajero` (R20, R34, R35, R36, R38) y
> `specs/265-optimizador-lee-al-proveedor` (R16-R26, R33). Cuando se cita uno de ellos se escribe
> **«92/R36»** o **«265/R33»**; un `R<n>` sin apellido es de esta ficha.
>
> **Revisión 2 (2026-10-29), con las respuestas del humano a P1-P7.** La numeración de la revisión 1
> no se aprobó nunca y se rehace aquí entera; ningún otro documento la cita.
>
> **Revisión 3 (2026-10-30), con las decisiones D16-D20 del humano** tras la revisión de código
> (`progress/review_SLT-59.md`). La numeración R1-R40 **se conserva**: lo que D16-D20 sustituyen se
> marca «retirado por D<n>» y se escribe de nuevo como R41 en adelante. Los requisitos retirados ya
> no se implementan ni se testean; sus tests se borran o se convierten (`tasks.md` › Fase 6).
>
> **Revisión 4 (2026-10-30), con D21-D25 del humano.** Misma regla: R1-R50 conservan su número; lo
> sustituido se marca «retirado por D<n>» y lo nuevo va de R51 en adelante. Retira R19 (D24) y R26
> (D23); acota R1, R7, R22, R37 y R47.
>
> **Revisión 5 (2026-10-31), con D27:** registro de cada llamada pagada a Google con su motivo. Añade
> R68-R75 y la Fase 8. No retira nada.
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
  **Acotado por D16 (2026-10-30):** solo cuando lo quitado es la siguiente parada (entrega en orden);
  cualquier entrega fuera de orden recalcula la ruta entera desde donde está el mensajero.
- **A''.** (D17) La «Sincronizar ruta» manual solo recalcula si el mensajero se desvió o las paradas
  cambiaron; si no, devuelve la ruta actual sin llamadas y sin pisar el origen guardado.
- **A'''.** (D24) El desvío solo cuenta en la «Sincronizar ruta» manual; los disparos automáticos nunca
  reoptimizan por desvío. (D21) Una ruta `desactualizada` se recupera con el botón tras un
  enfriamiento de 5 min desde el fallo.
- **E.** (D23, D25) La recogida deja de disparar la optimización. La **primera ruta del día** se
  calcula una sola vez: al recoger el último paquete asignado del día; si alguno no se recoge, al
  alejarse más de 1 km del punto de recogida, con la primera gestión, o con el botón cuando ya recogió
  al menos el 80 %. Traspaso y nueva asignación tampoco la disparan mientras no exista.
- **B.** Las gestiones que no cambian el conjunto de paradas no encolan optimización; las que sí, con
  debounce como la recogida (`RUTA_DEBOUNCE_S`).
- **C.** Reintentos del optimizador: 401/403 no se reintentan; el máximo de intentos baja a 3.

**No entra** (otra ficha si se quiere): caché de la línea recta de respaldo, caché de
`ZERO_RESULTS` en geocode, intervalo de los botones manuales, reintentos de geocoding, el rechazo
del endpoint de token (`RutaTokenError`).

**Sin cambio:** añadir paradas (recogida, nueva asignación, traspaso) sigue reoptimizando como hoy,
con su debounce. **Acotado por D23/D25 (revisión 4):** la recogida ya no encola salvo el último
paquete del día con la primera ruta pendiente (R58); el traspaso sigue encolando solo si la primera
ruta del día ya existe (R60).

---

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo | Cubierta por |
| --- | --- | --- | --- |
| D1 | Bloque A: sin cambio de conjunto no se reoptimiza; aplica también al caso de una parada. | humano, vía leader, 2026-10-29 | R1, R2, R6, R7 |
| D2 | Bloque B: la gestión que no cambia las paradas no encola; la que sí, con debounce como la recogida. | humano, vía leader, 2026-10-29 | R21-R26 |
| D3 | Bloque C: 401/403 no se reintentan; se baja el máximo de intentos. | humano, vía leader, 2026-10-29 | R29-R35 |
| D4 | Fuera de alcance: caché de línea recta, caché de `ZERO_RESULTS`, intervalo de botones manuales, reintentos de geocoding. | humano, vía leader, 2026-10-29 | R38 |
| D5 | Sin dependencia nueva. | humano, vía leader, 2026-10-29 | R39 |
| D6 | (P1) Una gestión que solo quita paradas reutiliza el orden anterior, sin `optimizeTours`. **Acotada por D16:** solo si lo quitado es un prefijo. | humano, 2026-10-29 | R41, R12, R17, R18 (R11 retirado por D16) |
| D7 | (P1b) El trazado se rehace con los tramos guardados, sin `computeRoutes` («optimizar sin pagar»). Si la parada quitada no es la primera (entrega fuera de orden), el tramo puente lo decide el spec con la opción más barata correcta. **La segunda frase queda sustituida por D16.** | humano, 2026-10-29 | R13, R15 (R14 y R16 retirados por D16) |
| D8 | (P2/P3) Con el conjunto sin cambios, se reoptimiza SOLO si el mensajero se desvió de la ruta dada más de 1 km (`RUTA_REOPT_DISTANCIA_M = 1000`). **Sin criterio de tiempo** (`RUTA_REOPT_MIN_MIN` se retira). | humano, 2026-10-29 | R3, R4, R5, R10, R36, R51 (R19 retirado). **Enmendada por D24:** el desvío solo cuenta en la sincronización manual |
| D9 | (P4) `RUTA_OPT_MAX_INTENTOS = 3`. | humano, 2026-10-29 | R32, R36 |
| D10 | (P5) El precio de los SKU queda informativo: el spec cuenta llamadas, no dinero. | humano, 2026-10-29 | R37 |
| D11 | (P6) El rechazo del endpoint de token queda fuera de esta ficha. | humano, 2026-10-29 | R29 (lo acota a 401/403 de `optimizeTours`) |
| D12 | (P7) El debounce de las gestiones que cambian paradas se queda como se acordó (~2 min de retraso aceptado). Con D7, las entregas en orden ya no esperan a la cola. | humano, 2026-10-29 | R21, R27 |
| D13 | Añadir paradas (nueva asignación, recogida, traspaso) sigue reoptimizando como hoy, con debounce. **Acotada por D23/D25:** la recogida solo encola con el último paquete del día y la primera ruta pendiente; el traspaso solo si la primera ruta del día ya existe. | humano, 2026-10-29 | R20, R58, R60 (R26 retirado por D23) |
| D14 | ~~(P8) Entrega fuera de orden: el tramo puente se pide con una sola llamada a `computeRoutes`…~~ **Sustituida por D16.** | humano, 2026-10-29 («aprobado») | — (R14 retirado) |
| D15 | (P9) La gestión sigue encolando el job con debounce como red de seguridad de la reducción best-effort (0 llamadas si no hay cambios). | humano, 2026-10-29 («aprobado») | R21, R44 |
| D16 | Sustituye a D14 y a la decisión provisional del leader sobre PA-1. Entrega **en orden** (lo quitado es la SIGUIENTE parada de la secuencia guardada) → se recortan los tramos guardados, 0 llamadas (sin cambio). **Cualquier** entrega fuera de orden (lo quitado no es la siguiente parada, incluido «entregar la última antes que las demás») → re-sincronización completa desde la posición actual del mensajero: 1 `optimizeTours` + 1 `computeRoutes`, igual que «Sincronizar ruta». El tramo puente (R14) se retira. Motivo del humano: tras entregar primero la 3, el mapa seguiría mostrando la vuelta desde el origen viejo a la 1 y luego a la 2; desde la 3 quizá conviene la 2 primero. | humano, 2026-10-30 | R41, R42, R43, R44 (retira R11, R14, R16, R27) |
| D17 | La «Sincronizar ruta» manual solo reoptimiza si el mensajero está fuera de ruta (desviado más de `RUTA_REOPT_DISTANCIA_M` = 1 km de la línea de la ruta guardada, D8) o las paradas cambiaron; si no, devuelve la ruta actual con 0 llamadas. Junto con m1: cuando no reoptimiza, no sobrescribe las columnas de origen de la ruta (R6). | humano, 2026-10-30 | R45, R46 |
| D18 | (PA-2 confirmada) Una polilínea `routes` guardada que decodifica a 0 puntos ⇒ desviado ⇒ reoptimizar. | humano, 2026-10-30 | R47 |
| D19 | Corregir los menores de la revisión: m3 (el job no informa «reducida» si no escribió: desenlace distinto), m6 (la escritura de la reducción exige también `estado = 'vigente'`), m2 (test de integración contra Postgres real del `WHERE` de huella/estado de `reducirSecuencia`, con dos empresas, en `tests/integration/db/`, que corre en CI donde existe `DATABASE_URL`). m4 desaparece con D16. | humano, 2026-10-30 | R48, R49, R50 |
| D20 | La evidencia de B1 (T5.2) y B2 (E2E de `mis-asignaciones` y `dos-empresas-humo`) se cierra con el CI del PR (jobs `gate-completo` y e2e), como excepción aceptada por el humano, igual que en SLT-43. | humano, 2026-10-30 | — (proceso, no comportamiento: T5.2 y T6.8 de `tasks.md`) |
| D21 | (P10) La «Sincronizar ruta» manual puede recalcular una ruta `desactualizada` aunque no haya desvío ni cambio de paradas, pero solo cuando hayan pasado `RUTA_RECUPERACION_ENFRIAMIENTO_MIN` (5) minutos desde el fallo. Antes devuelve la ruta actual con 0 llamadas (la forma `omitida` que ya existe). Sin migración. | humano, 2026-10-30 | R53, R54, R55 (instante del fallo: P12) |
| D22 | (P11) Si la sincronización manual encuentra un recorte en orden pendiente, recorta gratis: D16 manda sobre D17. | humano, 2026-10-30 | R56 |
| D23 | (Alcance nuevo) La recogida deja de disparar la optimización: el mensajero sigue en bodega cargando, y recoger 30 paquetes uno por minuto paga hoy 1+2+…+30 = 465 envíos facturados (Route Optimization factura POR ENVÍO). La ruta se optimiza UNA vez cuando el mensajero «sale»: primera gestión del día, posición a más de `RUTA_REOPT_DISTANCIA_M` (1 km) del punto de recogida, o el botón. Traspaso y nueva asignación tampoco la disparan mientras esa primera ruta no exista. Con lo que ya hay de GPS y estado; sin migración. | humano, 2026-10-30 | R57, R59, R60, R61, R62, R63, R65, R66 (retira R26; enmienda 92/R16-R17) |
| D24 | (Enmienda D8) El desvío de más de 1 km NUNCA dispara solo una reoptimización. Los disparos automáticos (job de la gestión, del traspaso, de la recogida) con el conjunto sin cambios no reoptimizan por desvío: devuelven o conservan la ruta (0 llamadas). El desvío solo cuenta al pulsar «Sincronizar ruta». Excepción: la primera ruta del día (D23/D25) sí se dispara sola al alejarse 1 km del punto de recogida. D18 queda solo para el camino manual. | humano, 2026-10-30 | R51, R52, R47 (acotado) (retira R19) |
| D25 | (Afina D23) Disparo principal de la primera ruta: recoger el ÚLTIMO de los paquetes asignados del día (con debounce como la recogida, para que «recoger todas» sea un job). Respaldo si alguno nunca se recoge: con lo recogido, al alejarse más de 1 km del punto de recogida, con la primera gestión o con el botón. El botón, para la primera ruta, solo cuando ya recogió al menos `RUTA_PRIMERA_MIN_RECOGIDO_PCT` (80) % de las asignadas; por debajo, 0 llamadas y un mensaje claro. Siempre una sola vez; después rigen D16, D21 y D24. «Asignadas del día» con el mismo predicado de día que la recogida. Sin migración. | humano, 2026-10-30 | R58, R64, R65, R54 |
| D27 | Registrar CADA llamada pagada a Google con su motivo. Cada llamada de cliente (`optimizeTours`, `computeRoutes`, geocode) recibe un `motivo` obligatorio (unión tipada, snake_case en español) que pasa quien llama. Emite UNA línea de log estructurada en el servidor por petición HTTP, incluido cada reintento, con: api, motivo, empresaId, mensajeroId/ordenId cuando los haya, número de paradas (envíos facturados en `optimizeTours`), intento n/máx y resultado (ok / código de error). Se reutiliza el patrón `optlog`/logger. Sin secretos, direcciones completas ni coordenadas. Solo logs del servidor (Vercel): ninguna tabla (R40). Un contador persistido queda como posible ficha futura. Tests: cada motivo llega a la línea; la jornada de R37 afirma la secuencia de motivos. **Adenda:** toda línea empieza por el prefijo fijo `[google-api]` y lleva `evento: "google_api_llamada"`; `api` distingue `route_optimization` / `routes` / `geocoding`; constante única, con un test de que los tres clientes la emiten. | humano, 2026-10-31 | R68-R75 |
| D28 | (P13) Un job agrupado por debounce registra en el log el `origen`/motivo del PRIMER evento que lo encoló; el conteo de llamadas es exacto. | humano, 2026-10-31 | R68-R75 |
| D29 | (Enmienda D25) Primera ruta del día durante la recogida: se dispara al recoger el ÚLTIMO paquete asignado (debounce de `RUTA_DEBOUNCE_S`, 60 s, como hoy, para que «recoger todas» sea un job) **o** tras `RUTA_PRIMERA_DEBOUNCE_MIN` (10) minutos sin una recogida nueva: debounce deslizante, cada recogida parcial empuja el `runAfter` del job a ahora + 10 min. Una sola vez al día. Los demás respaldos (salida a 1 km, primera gestión, botón ≥ 80 %) siguen. Motivo del caso de 10 min: `primera_ruta_debounce_recogida`. | humano, 2026-10-31 | R76, R77 (enmienda R57, R58) |
| D26 | (P12) `ruta_optimizada.updated_at` vale como instante del fallo para el enfriamiento de D21: es una cota superior (solo puede alargar la espera). Sin migración; una columna `fallo_at` exacta iría en otra ficha. | humano, 2026-10-30 | R54 |

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
| **Reducción** | Persistir la secuencia previa sin las paradas que ya no están. Desde D16 solo existe cuando lo quitado es un prefijo (R41). |
| **Prefijo** | Las paradas quitadas son exactamente las `k` primeras de la secuencia persistida, sin saltarse ninguna (entrega en orden). Si alguna quitada va detrás de una parada que sigue, no es prefijo: eso incluye quitar la última o las últimas (R43). |
| **Fuera de orden** | Conjunto actual subconjunto estricto y no vacío de la secuencia persistida, sin ser prefijo (D16). |
| **Disparo manual** | Ejecución pedida con el botón «Sincronizar ruta» (`motivo: "manual"`). Todo lo demás —jobs de la cola y el disparo de salida (R62)— es **automático**. |
| **Día en curso** | El día de reparto con el mismo predicado que usa la recogida (`fecha_reparto IS NULL OR fecha_reparto <= día`, 🔎 `GestionOrdenRepository.recogerLote`). |
| **Asignadas del día** | Órdenes con `mensajero_asignado_id` = el mensajero, sin borrar, en `por_recoger` dentro del día en curso o ya en `en_reparto`. **Recogidas** = las de ese conjunto en `en_reparto`. |
| **Primera ruta pendiente** | La ruta no existe, o su `calculada_at` es nula o anterior al inicio del día en curso. Una reducción no la cumple (R17 no mueve `calculada_at`). |
| **Punto de recogida** | El origen guardado de la ruta cuando su fuente es `gps` y su `origen_at` cae dentro del día en curso: lo escribió la última recogida con GPS (92/R23). Si no cumple, no hay punto de recogida. |
| **Recalcular** | Que la ejecución pase todas las guardas y reescriba la secuencia: la llamada a `optimizeTours` con 2+ paradas, o la secuencia trivial de 92/R35 con 0 o 1 parada. Lo contrario es omitir (R1, R2), reducir (R41) o cortar en otra guarda (92/R20, 92/R34). |
| **Tramo** | La polilínea por calles que LLEGA a una parada, guardada en su fila (🔎 `schema.prisma`, `RutaOptimizadaParada.tramoPolilinea`; la fila 1 guarda origen → primera parada). |

---

## Bloque A — No repagar cuando nada relevante cambió

**R1.** SI la ruta del mensajero está `vigente`, el conjunto de paradas (2 o más) es idéntico al de la
secuencia persistida y el mensajero no está desviado, ENTONCES el sistema DEBE completar la ejecución
sin llamar a `optimizeTours` ni a `computeRoutes`.
> Revisión 4: «no está desviado» solo se evalúa en la ejecución manual (R51). Y no aplica mientras la
> primera ruta del día esté pendiente (R59). Lo mismo vale para R2 y R41.

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
> Lectura (m1, D17): «el origen» son las columnas `origen_lat`, `origen_lng`, `origen_at` y
> `origen_fuente` de la ruta, y R6 rige **la ejecución entera**, incluida la ubicación que trae la
> sincronización manual (R46). No rige la ubicación que guarda la gestión o la recogida del
> mensajero antes de la ejecución (92/R23 vía `MisAsignacionesService`, que R44 da por hecha).

**R7.** SI la ruta está `desactualizada`, ENTONCES el sistema NO DEBE aplicar R1, R2 ni R11.
> Desde D16, «R11» se lee R41. Revisión 4: en la ejecución manual R7 lo acota R53 (enfriamiento).

**R8.** El sistema DEBE evaluar las guardas de coste en el mismo orden que hoy (92/R20, 92/R34,
92/R35, 92/R38, 265/R16) y la comprobación de R1 DEBE ocupar la posición que hoy ocupa 92/R36, con la
de R11 inmediatamente después.
> Desde D16, «R11» se lee R41/R42.

**R9.** Las comprobaciones de R1-R5 y R11 NO DEBEN añadir lecturas de base de datos ni llamadas
facturadas a las que la ejecución ya hace hoy antes de la guarda 92/R36.
> Desde D16, «R11» se lee R41/R42.

**R10.** El sistema NO DEBE usar el tiempo transcurrido desde el último cálculo como motivo para
reoptimizar un conjunto sin cambios.

---

## Bloque A' — Una gestión que solo quita paradas

**R11.** ~~SI la ruta está `vigente`, el conjunto actual es un subconjunto estricto y no vacío de la
secuencia persistida y el mensajero no está desviado, ENTONCES el sistema DEBE persistir la secuencia
previa sin las paradas que faltan, conservando su orden relativo y sin huecos, y NO DEBE llamar a
`optimizeTours`.~~ **Retirado por D16** → R41 (prefijo) y R42/R43 (fuera de orden).

**R12.** CUANDO el sistema persista una reducción, DEBE conservar la procedencia (`secuencia_fuente`)
de la secuencia de la que se deriva.

**R13.** SI las paradas quitadas son un prefijo y el trazado persistido es por calles con tramo en
todas las paradas restantes, ENTONCES el sistema DEBE rehacer el trazado de la reducción
concatenando esos tramos, sin llamar a `computeRoutes`, con distancia y duración iguales a la suma de
los tramos.

**R14.** ~~SI las paradas quitadas no son un prefijo (entrega fuera de orden) y el trazado persistido es
por calles con tramos completos, ENTONCES el sistema DEBE hacer **exactamente una** llamada a
`computeRoutes` para el tramo puente…~~ **Retirado por D16** → R42. Lo que sí sobrevive, como
consecuencia de R41 y R13: una reducción nunca inserta un segmento recto en un trazado por calles.

**R15.** SI el trazado persistido no es por calles o le falta el tramo de alguna parada restante,
ENTONCES el sistema DEBE persistir la reducción sin llamar a `computeRoutes` y sin trazado.
> Desde D16 aplica solo a la reducción de R41 (prefijo). Fuera de orden sin tramos también es R42.

**R16.** ~~SI la llamada de R14 falla, ENTONCES el sistema DEBE persistir igualmente la reducción…~~
**Retirado por D16**: la reducción ya no hace ninguna llamada. Un fallo de la re-sincronización de R42
sigue las reglas de siempre (92/R27, R29-R33).

**R17.** CUANDO el sistema persista una reducción, NO DEBE modificar `calculada_at`.
> Motivo: 92/R20 descarta los jobs creados antes de `calculada_at`. Si la reducción la moviera, un job
> de recogida en vuelo se daría por cubierto sin que nadie hubiera optimizado las paradas nuevas.

**R18.** El sistema DEBE escribir la reducción solo si la ruta conserva la misma huella que tenía al
leerla; SI la huella cambió, ENTONCES NO DEBE escribir nada y NO DEBE lanzar.
> D19 lo completa: R48 añade el estado a la condición, R49 fija qué se informa cuando no se escribe y
> R50 lo verifica contra Postgres real.

**R19.** ~~SI el mensajero está desviado, ENTONCES el sistema DEBE reoptimizar el conjunto completo como
hoy, aunque el conjunto sea igual o un subconjunto de la secuencia persistida.~~ **Retirado por D24** →
R51 (automático: nunca) y R52 (manual: sí).

**R20.** SI el conjunto contiene alguna parada que no está en la secuencia persistida, ENTONCES el
sistema DEBE reoptimizar el conjunto completo como hoy.

---

## Bloque B — Encolado y reducción desde la gestión del mensajero

**R21.** CUANDO un mensajero registre una gestión sobre una orden que tiene coordenadas, el sistema
DEBE encolar la reoptimización de su ruta con `runAfter = ahora + RUTA_DEBOUNCE_S`, dentro de la
misma transacción que registra la gestión.

**R22.** SI la orden gestionada no tiene coordenadas, ENTONCES el sistema NO DEBE encolar ninguna
reoptimización por esa gestión.
> Revisión 4: salvo que la primera ruta del día esté pendiente (R59).

**R23.** MIENTRAS exista un job de reoptimización con debounce del mismo mensajero en la misma
ventana —lo haya encolado una recogida, un traspaso o una gestión—, una gestión NO DEBE crear un job
nuevo ni adelantar el existente.

**R24.** La clave de deduplicación del encolado por gestión DEBE cumplir 92/R18: nunca puede quedar
ocupada para siempre por una fila `done`.

**R25.** SI la gestión no es gestionable o su transacción revierte, ENTONCES el sistema NO DEBE dejar
ningún job de reoptimización encolado por ella.

**R26.** ~~El sistema NO DEBE cambiar el encolado de la recogida ni del traspaso.~~ **Retirado por D23**
→ R57, R58 (recogida) y R60 (traspaso).

**R27.** ~~CUANDO se registre una gestión con éxito, el sistema DEBE aplicar en la misma petición…
la reducción de R11 SI se resuelve por R13 o R15; SI requiere una llamada (R14) o una reoptimización
(R19, R20)… la deja al job de R21.~~ **Retirado por D16** → R44.

**R28.** SI la reducción de R27 falla, ENTONCES la gestión DEBE responder igual que si no se hubiera
intentado.
> Desde D16, «R27» se lee R44.

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
> Revisión 4: la tabla de §8 se rehízo con D21-D25 (incluye la carga en bodega y la salida).

**R38.** El sistema NO DEBE cambiar el intervalo mínimo de los botones manuales
(`RUTA_SYNC_MIN_INTERVALO_S`, default 10) ni el máximo de intentos de la geocodificación.

**R39.** La feature NO DEBE añadir ninguna dependencia de terceros.

**R40.** La feature NO DEBE requerir migración de esquema, columna nueva ni relleno de datos.

---

## Revisión 3 — D16-D19 (2026-10-30)

### Entrega en orden y fuera de orden (D16)

**R41.** SI la ruta está `vigente`, el conjunto actual es un subconjunto estricto y no vacío de la
secuencia persistida, las paradas quitadas son un prefijo y el mensajero no está desviado, ENTONCES el
sistema DEBE persistir la secuencia previa sin esas paradas, conservando el orden relativo de las
restantes y sin huecos, y NO DEBE llamar a `optimizeTours` ni a `computeRoutes`.

**R42.** SI la ruta está `vigente` y el conjunto actual es un subconjunto estricto y no vacío de la
secuencia persistida pero las paradas quitadas NO son un prefijo, ENTONCES el sistema NO DEBE
persistir ninguna reducción y DEBE recalcular el conjunto completo desde la posición actual del
mensajero, igual que la sincronización manual con el conjunto cambiado:
- con 2 o más paradas, exactamente 1 llamada a `optimizeTours` y, si hay cliente de Routes, exactamente
  1 llamada a `computeRoutes`;
- con 1 parada, 0 llamadas a `optimizeTours` (92/R35) y, si hay cliente de Routes, exactamente 1 a
  `computeRoutes`.

**R43.** SI alguna parada quitada va detrás de la última parada que sigue en la secuencia persistida
(por ejemplo, de s1, s2, s3 se entrega s3 primero y quedan s1, s2), ENTONCES el sistema DEBE tratarlo
como fuera de orden (R42), aunque no quede ningún hueco entre las restantes.

**R44.** CUANDO se registre una gestión con éxito, el sistema DEBE aplicar en la misma petición,
después de guardar la ubicación recibida, la reducción de R41 (resuelta por R13 o R15, sin llamadas
facturadas); SI la ejecución requiere recalcular (R7, R19, R20, R42), ENTONCES NO DEBE hacerlo en la
petición y lo deja al job de R21.

### Sincronización manual (D17, m1)

**R45.** CUANDO la sincronización manual termine sin recalcular porque la ruta está `vigente`, el
conjunto de paradas no cambió y el mensajero no está desviado (R1, R2), la acción DEBE devolver
`status: "ok"`, `omitida: true`, `secuenciaFuente: null` y el trazado persistido si existe, con 0
llamadas a `optimizeTours` y 0 a `computeRoutes`; y la pantalla DEBE mostrar el aviso de ruta ya al
día que hoy muestra para `omitida`.

**R46.** MIENTRAS una sincronización manual que trae ubicación no recalcule —omitida por R1/R2,
reducida por R41, cortada por el intervalo mínimo (92/R34) o con la reducción no aplicada (R49)—, el
sistema NO DEBE modificar las columnas de origen de la ruta. La ubicación recibida DEBE usarse igual
como posición del mensajero para medir el desvío (R3) y como origen si la ejecución recalcula; SOLO
CUANDO la ejecución vaya a recalcular, el sistema DEBE persistirla como origen `gps` antes de llamar
al proveedor, como hoy (92/R23).

### Polilínea vacía (D18)

**R47.** SI hay posición del mensajero y la polilínea `routes` persistida de la ruta decodifica a 0
puntos, ENTONCES el sistema DEBE considerarlo desviado y recalcular (R19), y NO DEBE caer a la línea
recta entre paradas de R4.
> Revisión 4 (D24): solo en una ejecución manual, y «R19» se lee R52. En una automática no aplica (R51).

### Menores de la revisión (D19)

**R48.** El sistema DEBE escribir la reducción solo si la ruta, en el momento de escribir, conserva la
huella que tenía al leerla Y sigue en estado `vigente`; SI no cumple alguna de las dos, ENTONCES NO DEBE
escribir nada (ni cabecera ni paradas) y NO DEBE lanzar.

**R49.** SI la reducción no se escribe por R48, ENTONCES la ejecución DEBE terminar con un desenlace
distinto del de una reducción aplicada (`omitida` con razón `reduccion_descartada`, no `reducida`), sin
trazado, y el job DEBE terminar `done` sin reintento.

**R50.** MIENTRAS el sistema escriba una reducción en el contexto de una empresa, NO DEBE modificar la
cabecera ni las paradas de la ruta de otra empresa, aunque la huella coincida. R48 y R50 se verifican
contra Postgres real (D19/m2), no solo con Prisma simulado.

---

## Revisión 4 — D21-D25 (2026-10-30)

### El desvío solo cuenta a mano (D24)

**R51.** MIENTRAS una ejecución sea automática, el sistema NO DEBE usar el desvío como motivo para
reoptimizar: DEBE tratar al mensajero como no desviado al aplicar R1, R2, R41 y R44, y con el
conjunto sin cambios DEBE omitir con 0 llamadas aunque la posición esté a más de
`RUTA_REOPT_DISTANCIA_M` de la ruta. (La única excepción es la salida de R62, que no mide contra la
ruta sino contra el punto de recogida.)

**R52.** CUANDO una ejecución manual encuentre al mensajero desviado (R3), el sistema DEBE recalcular
el conjunto completo, aunque el conjunto sea igual o un prefijo reducido de la secuencia persistida.
> Sustituye a R19 (retirado por D24). R47 (D18, polilínea vacía ⇒ desviado) queda **solo** en este
> camino: en una ejecución automática la polilínea vacía no cambia nada (R51).

### Recuperar una ruta desactualizada a mano (D21)

**R53.** CUANDO una ejecución manual encuentre la ruta `desactualizada`, el conjunto sin paradas
nuevas, sin entrega fuera de orden y el mensajero no desviado, ENTONCES:
- SI han pasado al menos `RUTA_RECUPERACION_ENFRIAMIENTO_MIN` minutos desde el instante del fallo
  (R54), el sistema DEBE recalcular el conjunto completo;
- SI no, el sistema DEBE terminar con 0 llamadas, sin escribir nada (R6, R46), con la forma de R45
  (`status: "ok"`, `omitida: true`, `secuenciaFuente: null`, trazado persistido si existe).

Con paradas nuevas, entrega fuera de orden o desvío, la ejecución manual recalcula como hoy, sin
enfriamiento. Las ejecuciones automáticas sobre una ruta `desactualizada` siguen R7 sin cambio.

**R54.** El sistema DEBE tomar como instante del fallo la última escritura de la fila de la ruta
(`ruta_optimizada.updated_at`), sin columna nueva (R40).
> 🔎 No existe una columna con el instante del fallo: `marcarDesactualizada` escribe `estado` y
> `ultimo_error`, sin fecha. `updated_at` (`@updatedAt`) se mueve con esa escritura, pero también con
> cualquier escritura posterior a la fila: `upsertOrigen` de una gestión o recogida, `tramo_vivo_at`.
> Por eso es una **cota superior** del enfriamiento: nunca deja recalcular antes de 5 min desde el
> fallo, pero puede hacer esperar más. Ver P12.

**R55.** El sistema DEBE leer `RUTA_RECUPERACION_ENFRIAMIENTO_MIN` (default 5) y
`RUTA_PRIMERA_MIN_RECOGIDO_PCT` (default 80) del mismo punto de configuración que R36, con las mismas
reglas: un valor ausente, vacío o inválido cae al default sin lanzar. Un porcentaje mayor que 100
también es inválido.

### Recorte pendiente en la sincronización manual (D22)

**R56.** CUANDO una ejecución manual encuentre la ruta `vigente`, el conjunto como prefijo reducido de
la secuencia persistida y el mensajero no desviado, el sistema DEBE aplicar la reducción de R41 con 0
llamadas, y la acción DEBE devolver la forma de R45 con el trazado reducido si existe.

### La primera ruta del día (D23, D25)

**R57.** CUANDO un mensajero recoja órdenes, el sistema NO DEBE encolar la reoptimización de su ruta,
salvo en el caso de R58.
> Sustituye a R26 (retirado por D23) y enmienda 92/R16-R17.

**R58.** CUANDO una recogida deje al mensajero sin ninguna orden asignada del día en `por_recoger` y
su primera ruta del día esté pendiente, el sistema DEBE encolar una reoptimización con
`runAfter = ahora + RUTA_DEBOUNCE_S`, dentro de la misma transacción de la recogida. Un «recoger
todas» DEBE producir un solo job.

**R59.** MIENTRAS la primera ruta del día esté pendiente, el sistema DEBE recalcular (no omitir ni
reducir) en cualquier ejecución que llegue a la guarda de R8, y CUANDO un mensajero registre una
gestión DEBE encolar la reoptimización de R21 aunque la orden gestionada no tenga coordenadas.
> Acota R22: sin coordenadas no se encola solo si la primera ruta del día ya existe.

**R60.** MIENTRAS la primera ruta del día de un mensajero esté pendiente, un traspaso NO DEBE encolar la
reoptimización de ese mensajero; con la primera ruta ya calculada, encola como hoy (con debounce).
La regla se evalúa por separado para el mensajero de origen y el de destino.

**R61.** Una nueva asignación NO DEBE encolar ninguna reoptimización.
> 🔎 Hoy ya no encola: crea órdenes `por_recoger`, que no son paradas, y solo encolan la recogida, la
> gestión y el traspaso (`GestionOrdenRepository.ts:728`, `:837`; `OrdenRepository.ts:4989`). R61 lo
> fija para que nadie lo añada. D13 se escribió suponiendo lo contrario.

**R62.** CUANDO la pantalla de reparto tenga la posición en vivo del mensajero, su primera ruta del día
esté pendiente, exista punto de recogida, haya al menos una orden recogida con coordenadas y la
posición esté a más de `RUTA_REOPT_DISTANCIA_M` del punto de recogida, el sistema DEBE calcular la
primera ruta una sola vez, con lo recogido y desde esa posición, sin pedir al mensajero ninguna acción
ni permiso nuevo.

**R63.** CUANDO llegue al servidor un disparo de salida (R62), el sistema DEBE comprobar con la
posición recibida que la primera ruta sigue pendiente, que hay punto de recogida y que la distancia
supera el umbral; SI alguna falla, o la ruta está `desactualizada` y no ha pasado el enfriamiento de
R53/R54, ENTONCES DEBE terminar con 0 llamadas y sin escribir.

**R64.** CUANDO una ejecución manual encuentre la primera ruta del día pendiente:
- SI las recogidas son menos del `RUTA_PRIMERA_MIN_RECOGIDO_PCT` % de las asignadas del día, el
  sistema DEBE terminar con 0 llamadas y sin escribir, y la acción DEBE devolver `status:
  "conflict"` con el motivo «Todavía no se calcula la ruta: recoge al menos el 80 % de tus paquetes
  (llevas X de Y).», con X, Y y el porcentaje reales;
- SI no, DEBE recalcular con lo recogido, aunque no haya desvío ni enfriamiento.

**R65.** MIENTRAS la primera ruta del día esté pendiente, la pantalla de reparto DEBE mostrar lo mismo
que hoy muestra sin ruta calculada: las paradas con coordenadas como marcadores sin número ni línea,
las cards sin posición al final con «Pendiente de optimizar» y el aviso «El orden mostrado no está
actualizado».

**R66.** El sistema DEBE calcular la primera ruta del día como mucho una vez por los disparos de R58,
R59, R62 y R64: con la primera ruta ya calculada, ninguno vuelve a dispararse, y rigen R41-R56.

**R67.** Las comprobaciones de R58-R64 NO DEBEN añadir llamadas facturadas, y NO DEBEN añadir lecturas
a una ejecución cuya primera ruta del día ya existe. Con la primera ruta pendiente se admite una
lectura de conteo por ejecución manual (R64) y una consulta dentro de la transacción de la recogida,
de la gestión y del traspaso (R58-R60).

---

## Revisión 5 — D27: cada llamada pagada, con su motivo (2026-10-31)

**R68.** Cada método de cliente que hace una petición facturada a Google (`optimizeTours`,
`computeRoutes`, geocode) DEBE exigir un parámetro `motivo` de un tipo unión cerrado; el sistema NO
DEBE compilar una llamada sin él.

**R69.** CUANDO un cliente haga una petición HTTP facturada, el sistema DEBE emitir exactamente una
línea de log estructurada en el servidor. La línea DEBE empezar por el prefijo fijo `[google-api]`,
común a las tres APIs, y llevar estos campos:
- `evento: "google_api_llamada"`;
- `api`: `route_optimization`, `routes` o `geocoding`;
- `motivo`;
- `empresaId`;
- `mensajeroId` u `ordenId` cuando los haya (si no, `null`);
- `paradas` (en `optimizeTours`, los envíos enviados; en `computeRoutes`, las paradas pedidas; en
  geocode, `null`);
- `intento` y `maxIntentos`;
- `resultado`: `ok`, o el código del fallo (estado HTTP o `red`/`timeout`).

Con un fallo, la línea DEBE emitirse también. El prefijo y el valor de `evento` DEBEN salir de una
única constante compartida por los tres clientes (adenda de D27).

**R70.** CUANDO un job reintente una llamada facturada, cada intento DEBE producir su propia línea de
R69 con su número de intento. Una llamada que no viene de la cola DEBE registrar `intento: 1,
maxIntentos: 1`.

**R71.** La línea de R69 NO DEBE contener la credencial, el token, la URL, una dirección, ni
coordenadas (92/R14, `docs/architecture.md`: nada de secretos ni PII en logs).

**R72.** El sistema NO DEBE emitir la línea de R69 cuando no hay petición facturada: cálculo local,
línea recta de respaldo, guarda que corta antes de llamar, o la petición del token OAuth.

**R73.** Los motivos de rutas DEBEN ser exactamente los de design §13.1, y cada disparo de
D16-D25 DEBE producir el suyo. Los motivos de geocode DEBEN ser exactamente los de design §13.2. El
botón de prueba de integración usa `prueba_integracion` en las dos APIs.

**R74.** El sistema NO DEBE persistir las líneas de R69 en base de datos (R40): su destino son los
logs del servidor.

**R75.** CUANDO se ejecute la jornada de referencia de design §8.0, la secuencia de motivos registrada
DEBE ser exactamente la de design §13.3.

## Enmienda D29 — debounce deslizante de la primera ruta durante la recogida (2026-10-31)

> Enmienda R57 y R58: R58 (último paquete, `RUTA_DEBOUNCE_S`) sigue vigente; R57 deja de ser absoluto
> por R76. Ver design §12.2, nota D29.

**R76.** CUANDO una recogida deje al mensajero con órdenes del día aún en `por_recoger` y su primera
ruta del día esté pendiente, el sistema DEBE dejar un único job de reoptimización pendiente para ese
mensajero y ese día con `runAfter = ahora + RUTA_PRIMERA_DEBOUNCE_MIN` (10 min, configurable), y cada
recogida posterior del mismo día DEBE mover ese `runAfter` en lugar de crear otro job. Una recogida que
cumpla R58 DEBE mover el mismo job a `ahora + RUTA_DEBOUNCE_S`. El motivo registrado (R69) del job que
corre por esta espera DEBE ser `primera_ruta_debounce_recogida`; el de R58, `primera_ruta_recogida_completa`.

**R77.** El sistema NO DEBE crear ni mover el job de R76/R58 cuando el de ese mensajero y ese día ya no
esté `pending` (en curso, hecho o muerto): la primera ruta por recogida corre como mucho una vez al día
(R66).

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
| R11, R14, R16, R27 | **retirados por D16**: sus casos se borran o se convierten a R41-R44 (T6.1, T6.3) |
| R12, R13, R15, R17-R20 | `tests/unit/services/optimizacion-ruta-reduccion.test.ts` |
| R18 | + `tests/integration/repositories/ruta-optimizada-repo.test.ts` |
| R21-R26 | `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts` |
| R23, R24, R32 | `tests/unit/services/optimizacion-ruta-encolado.test.ts` |
| R28 | `tests/unit/actions/mis-asignaciones-action.test.ts` |
| R41, R42, R43 | `tests/unit/services/optimizacion-ruta-reduccion.test.ts` |
| R44 | `tests/unit/services/optimizacion-ruta-reduccion.test.ts` (`reducirSinLlamadas`) + `tests/unit/actions/mis-asignaciones-action.test.ts` |
| R45 | `tests/unit/actions/sincronizar-ruta.test.ts` + `tests/unit/services/optimizacion-ruta-desvio.test.ts` (motivo `manual`) + `tests/components/SincronizarRutaButton.test.tsx` (existente: aviso con `omitida`) |
| R46 | `tests/unit/services/optimizacion-ruta-origen.test.ts` + `tests/unit/services/optimizacion-ruta-desvio.test.ts` |
| R47 | `tests/unit/services/optimizacion-ruta-desvio.test.ts` (el caso PA-2, renombrado a D18/R47) |
| R48 | `tests/integration/repositories/ruta-optimizada-repo.test.ts` + `tests/integration/db/ruta-optimizada-reduccion-sql-real.test.ts` |
| R49 | `tests/unit/services/optimizacion-ruta-reduccion.test.ts` |
| R50 | `tests/integration/db/ruta-optimizada-reduccion-sql-real.test.ts` (se salta sin `DATABASE_URL`; corre en CI) |
| R19, R26 | **retirados por D24 / D23**: sus casos pasan a R51/R52 y R57/R58/R60 (T7.1, T7.4) |
| R51, R52 | `tests/unit/services/optimizacion-ruta-desvio.test.ts` (tabla con `manual` frente a automático) |
| R53, R54 | `tests/unit/services/optimizacion-ruta-recuperacion.test.ts` |
| R55 | `tests/unit/config/route-optimization-config.test.ts` |
| R56 | `tests/unit/services/optimizacion-ruta-reduccion.test.ts` (motivo `manual`) + `tests/unit/actions/sincronizar-ruta.test.ts` |
| R57, R58, R60, R61 | `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts` |
| R59, R63, R64, R66, R67 | `tests/unit/services/optimizacion-ruta-primera-del-dia.test.ts` |
| R62, R65 | `tests/components/RepartoModule.test.tsx` |
| R63 (borde) | `tests/unit/actions/sincronizar-ruta.test.ts` (acción de salida: rol, validación, traducción) |
| R68 | `pnpm run typecheck` (el parámetro es obligatorio) + `tests/unit/clients/google-registro-llamada.test.ts` |
| R69-R72 | `tests/unit/clients/google-registro-llamada.test.ts` (`fetch` y logger simulados) |
| R73 | `tests/unit/services/optimizacion-ruta-motivo.test.ts` (rutas) + `tests/unit/services/geocodificacion-motivo.test.ts` (geocode) |
| R74 | revisión del diff: `db/` sin cambios |
| R75 | `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` |
| R76, R77 | `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts` (encolado y desplazamiento) + `tests/integration/repositories/job-repo-posponer.test.ts` (SQL del `ON CONFLICT … DO UPDATE … WHERE pending`) + `tests/unit/services/optimizacion-ruta-motivo.test.ts` (motivo) + `tests/unit/config/route-optimization-config.test.ts` (`RUTA_PRIMERA_DEBOUNCE_MIN`) |
| R64 (mensaje) | `tests/unit/actions/sincronizar-ruta.test.ts` + `tests/components/SincronizarRutaButton.test.tsx` (existente: `conflict` → `toast.warning(motivo)`) |
| R29, R30, R35 | `tests/unit/services/optimizacion-ruta-credencial-rechazada.test.ts` |
| R29, R33, R34 | `tests/unit/services/job-queue-service-permanente.test.ts` |
| R31 | `tests/unit/actions/sincronizar-ruta.test.ts` |
| R36, R38 | `tests/unit/config/route-optimization-config.test.ts` |
| R37 | `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` |
| R39 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente, sin cambios) |
| R40 | revisión del diff por el reviewer: `db/` sin cambios (`git diff --stat dev -- db/` vacío) |

---

## Preguntas abiertas

P8 y P9 se cerraron como D14 y D15 (humano, 2026-10-29, «aprobado»). PA-1 y PA-2 (bitácora del
implementer) se cerraron como D16 y D18 (humano, 2026-10-30).

P10 y P11 se cerraron como D21 y D22 (humano, 2026-10-30).

P12 se cerró como D26 (humano, 2026-10-30). Spec revisión 4 aprobado por el humano el 2026-10-30 («Aprobado»).

P13 se cerró como D28 (humano, 2026-10-31). Revisión 5 (D27, Fase 8) aprobada por el humano el 2026-10-31 («Aprobado»).

Historia — las dos preguntas de la revisión 3, ya cerradas, nacidas de leer D17 al pie de la letra. El spec seguía el
default 🧭 PROPUESTO hasta que el humano diga otra cosa.

- **P10. ¿La sincronización manual sigue recalculando una ruta `desactualizada` sin desvío ni cambio
  de paradas?** D17 nombra solo dos motivos para reoptimizar (fuera de ruta, paradas cambiadas). R7
  (D1) dice que una ruta `desactualizada` no se omite: es la única forma de que el botón recupere la
  ruta tras un fallo del proveedor. 🧭 PROPUESTO: R7 se mantiene (el botón recalcula una ruta
  `desactualizada`). Si el humano lee D17 como exhaustivo, R7 se retira para el motivo `manual` y la
  ruta solo se recupera con el siguiente cambio de paradas o desvío.
- **P11. Sincronización manual con un conjunto reducido EN ORDEN que aún no se reflejó** (la reducción
  de la petición falló, o la parada salió por otra vía: traspaso, ayuda abierta). D17 dice «reoptimiza
  si las paradas cambiaron»; D16 dice que la entrega en orden se recorta con 0 llamadas. 🧭 PROPUESTO:
  manda D16, la misma decisión para la cola y para el botón (R41: recorte sin llamadas). La
  alternativa es que el botón pague 1 `optimizeTours` + 1 `computeRoutes` en ese caso.
