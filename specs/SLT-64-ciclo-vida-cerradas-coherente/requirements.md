# SLT-64 «Ciclo de vida dice 0 cerradas con entregas registradas» · requirements

> Zona: backend · complejidad: medium · rama `feature/SLT-64-ciclo-vida-cerradas-coherente`.
> Evidencia con datos de producción: `progress/verificacion-analitica-monitoreo-2026-10-29.md` §5
> (en el checkout de `dev`, sin commitear).

## Alcance

**El problema medido.** En `/analitica`, sección «Detalle - Movimiento de las órdenes», conviven
«Entregado 11» y «Ciclo de vida promedio (0 órdenes cerradas)».

- La primera cifra sale de la **gestión**: `COALESCE(última gestión vigente, estatus)`, en
  `ConteoPorStatusRepository`.
- La segunda sale de la **transición terminal** del historial de estatus (`CicloVidaRepository`).
  Desde la ficha 454, esa transición solo se escribe al **aprobar el cierre** del mensajero
  (`CierresAdminRepository`, bloque «APLICACION DE GESTIONES»).
- En producción no hay ningún cierre aprobado, así que el ciclo de vida sale siempre vacío.

**Lo que entra.**

1. «Cerrada», en la lectura del ciclo de vida de Analítica, pasa a significar **gestión final del
   mensajero**, no cierre aprobado.
2. La cifra sigue a la **última gestión vigente** en el momento de la consulta. Una anulación o una
   corrección la mueven.
3. La caché de las lecturas de entregas de Analítica (TTL de 15 min, hoy sin invalidador por evento)
   se invalida cuando se anula o se corrige una gestión.
4. El inicio del reloj (`orden.created_at`) no cambia. El fin pasa a ser el instante de la gestión
   final.

**Lo que NO entra** (con su porqué en `design.md > §2 Consumidores`):

- **El recálculo por evento del rollup `analytics_daily`** (los antiguos R18–R23): va a ficha aparte
  (por crear), por decisión de Carlos del 2026-10-30, porque añade un tipo de job con migración y
  escribe dentro de las transacciones de anular y corregir; lo imprescindible está en `design.md > §8`.
- **La tabla de cohorte de carga.** Su desenlace sigue en la transición terminal (Q2, decidida).
- **La métrica `tiempo_ciclo` del rollup** (Q5 de `AnaliticaRollupRepository`), que se publica por
  API key, ni su gemela en vivo (`AnaliticaOperativaVivaRepository`) (Q3, decidida).
- **Madurez, efectividad, anillo, desglose por status y productos.** Ya leen la última gestión
  vigente y no cambian de lógica; solo ganan la invalidación de caché.
- **Monitoreo** (`TableroDiaRepository`): no es Analítica.
- **El registro de una gestión nueva.** No invalida nada: la frescura de 15 min la sigue dando el TTL
  (decisión humana del 2026-08-17 en `lib/config/conteo-entregas-cache.ts`).

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión | Requisitos que la cubren |
|---|---|---|---|
| D1 | 2026-10-30 · Carlos | «Cerrada» en Analítica es la **gestión final del mensajero** (entregado, devolución, incidente), no el cierre aprobado. Del código sale el conjunto exacto: `entregado`, `devolucion_a_origen_por_rechazo` e `incidente` (ver Q1 sobre `novedad`). | R1, R2, R6, R10 |
| D2 | 2026-10-30 · Carlos | Si una gestión se anula o se corrige, el dato de Analítica se mueve con la corrección: la cifra sigue a la última gestión vigente al consultar y la caché se invalida aquí. El rollup `analytics_daily` queda para la ficha aparte (por crear). | R5, R7, R8, R12–R17 |
| D3 | 2026-10-30 · Carlos (vía leader) | El inicio de la métrica no cambia (`orden.created_at`). El fin pasa a ser el instante de la gestión final vigente. | R3 |
| D4 | 2026-10-30 · spec_author (técnica, D2 la deriva) | La ventana del filtro cae sobre el instante de la gestión final, igual que hoy cae sobre la transición terminal: lo que cerró en el periodo, con su duración. | R4 |

## Requisitos (EARS)

### A. Qué es una orden cerrada para el ciclo de vida

**R1.** El sistema DEBE contar como cerrada, en la lectura del ciclo de vida, la orden cuya **última
gestión vigente** tiene resultado `entregado`, `devolucion_a_origen_por_rechazo` o `incidente`, esté
o no aprobado el cierre que la contiene.
- «Vigente» quiere decir `anulada_at` nulo.
- «Última» es la de `created_at` más reciente y, si hay empate, la de `id` mayor.

**R2.** SI la última gestión vigente de una orden tiene resultado `reprogramado` o `novedad`, o la
orden no tiene ninguna gestión vigente, ENTONCES el sistema NO DEBE contarla como cerrada, aunque
tenga en `orden_historial_estado` una transición a un estado de `ESTADOS_TERMINALES`.

**R3.** Por cada orden cerrada, el sistema DEBE sumar al ciclo los segundos que van de
`orden.created_at` al `created_at` de su gestión final, y DEBE contarla **una sola vez** en `n`.

**R4.** CUANDO la consulta trae rango, el sistema DEBE contar solo las órdenes cuya gestión final
tiene `created_at` en `[desde, hasta)`. CUANDO la consulta no trae rango, el sistema DEBE contar
todas las órdenes cerradas del recorte.

**R5.** El sistema DEBE elegir la gestión final entre **todas** las gestiones vigentes de la orden,
no solo entre las que caen en la ventana. SI una orden tiene una gestión de cierre dentro de la
ventana y otra gestión vigente posterior que no es de cierre, ENTONCES el sistema NO DEBE contarla.

**R6.** CUANDO se apruebe el cierre que contiene la gestión final de una orden y se escriba su
transición terminal en el historial, la lectura del ciclo de vida DEBE devolver el mismo `n` y los
mismos segundos que antes de la aprobación.

**R7.** CUANDO se anula la gestión final de una orden, la siguiente lectura sin caché DEBE usar la
nueva última gestión vigente:
- si queda una de cierre, la orden cuenta con el instante de esa gestión;
- si queda una que no es de cierre, o no queda ninguna, la orden deja de contar.

**R8.** CUANDO un administrador corrige el resultado de una gestión final de `entregado` a
`devolucion_a_origen_por_rechazo`, la orden DEBE seguir contando como cerrada, con el `created_at`
de esa gestión como fin del reloj y no con el instante de la corrección.

**R9.** La lectura del ciclo de vida DEBE conservar los recortes que tiene hoy:
- el alcance por rol, como primera condición;
- `orden.deleted_at IS NULL`;
- las facetas de zona, provincia, cantón, distrito y tienda;
- el filtro de mensajero, que exige que ese mensajero tenga alguna gestión vigente de la orden.

Una orden de otra empresa, o fuera del alcance del rol, NO DEBE contar.

**R10.** El conjunto de resultados que cierran una orden DEBE declararse en un solo sitio del código y
DEBE ser exactamente `entregado`, `devolucion_a_origen_por_rechazo` e `incidente`. El repositorio del
ciclo de vida DEBE importarlo y NO DEBE escribir esos valores a mano.

**R11.** Para un recorte sin rango cuyas órdenes tienen todas al menos una gestión vigente, el `n` del
ciclo de vida DEBE ser igual a la suma de los buckets `entregado`, `devolucion_a_origen_por_rechazo`
e `incidente` del desglose por status del mismo recorte.

### B. Caché de las lecturas de entregas

**R12.** CUANDO se deshace (anula) una gestión con éxito por cualquiera de sus tres vías, el sistema
DEBE invalidar, para la empresa de la orden, las ocho etiquetas de caché de las lecturas de entregas
de Analítica **antes** de responder. Las tres vías son:
- la gestión pendiente sin cierre;
- la gestión de un cierre rechazado propio;
- la rama legada.

La primera lectura de esas etiquetas tras responder DEBE traer la cifra nueva, no la entrada anterior
de la caché (deriva de D2). Evidencia: `progress/impl_SLT-64.md > Cierre del hallazgo: la primera
lectura tras invalidar`.

**R13.** CUANDO se corrige con éxito el resultado de una gestión en un cierre abierto, el sistema
DEBE invalidar las mismas etiquetas que en R12 antes de responder. La primera lectura tras responder
DEBE traer la cifra nueva (deriva de D2). Evidencia: `progress/impl_SLT-64.md > Vuelta 2`.

**R14.** SI el deshacer o la corrección no se aplica (`conflict`, `forbidden`, `validation_error`,
`unauthenticated` o, en la corrección, `no_encontrada`), ENTONCES el sistema NO DEBE invalidar ninguna
etiqueta.

**R15.** SI la invalidación falla después de que la escritura se confirmó, ENTONCES el sistema:
- DEBE registrar el fallo en el log, sin PII ni ids de dominio;
- DEBE responder el resultado de la escritura, sin convertirlo en error.

**R16.** Cada invalidación de R12 y R13 DEBE quedar registrada con el origen `correccion_gestion` y
la lista de etiquetas invalidadas (registro de la 128, R23).

**R17.** La lista de etiquetas que invalidan R12 y R13 DEBE ser la misma constante que usa el botón
«Actualizar» de Analítica (`refrescarCacheAnalitica`) para las lecturas de entregas. NO DEBE haber
una segunda lista escrita a mano.

## Trazabilidad prevista

Las mutaciones que cada test debe matar están en `design.md > §7`.

| R | Test |
|---|---|
| R1, R2, R3, R4, R5, R6, R7, R8, R9, R11 | `tests/integration/db/ciclo-vida-gestion-final.int.test.ts` (Postgres real) |
| R10 | `tests/unit/analytics/ciclo-vida-resultados-de-cierre.guardia.test.ts` |
| R12, R14, R15, R16 | `tests/unit/actions/deshacer-gestion-invalida-analitica.test.ts` |
| R13, R14, R15, R16 | `tests/unit/actions/corregir-resultado-invalida-analitica.test.ts` |
| R12, R13 (cableado real) | `tests/unit/analytics/cache-invalidacion-correccion-cableado.test.ts` |
| R13 (primera lectura, en navegador) | `e2e/cierres-admin.spec.ts`, caso (c) |
| R17 | `tests/unit/analytics/tags-entregas-fuente-unica.test.ts` |

## Preguntas abiertas

Ninguna. Q1, Q2 y Q3 quedaron decididas con su supuesto por defecto: **No, 2026-10-30, Carlos**.
Q4 salió de este spec con el rollup y pasa a la ficha aparte (`design.md > §8`).

- **Q1 — ¿`novedad` cierra? No.** «Devolución» = `devolucion_a_origen_por_rechazo`. Tampoco cierra la
  llegada a `devuelta_a_tienda`.
  - **Por qué:** `novedad` no es final; la tienda la resuelve con plazo y la orden puede volver a
    reparto (spec 100, «resolver novedad»).
  - **Consecuencia aceptada:** una orden con `novedad` que termina devuelta a la tienda **no** cuenta
    como cerrada en el ciclo de vida.
- **Q2 — ¿Se alinea la cohorte de carga? No.** Su desenlace y sus «días promedio» siguen en la
  transición terminal.
  - **Consecuencia aceptada:** mientras no haya cierres aprobados, la cohorte mostrará todo «viva» al
    lado de un ciclo de vida con cerradas.
- **Q3 — ¿Se toca `tiempo_ciclo` del rollup y de la API? No.** Es un contrato público
  (`METRICAS_API_KEY`).
  - **Consecuencia aceptada:** hay dos «tiempos de ciclo» con definiciones distintas, el de la
    pantalla y el de la API.
