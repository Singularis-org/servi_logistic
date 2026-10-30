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
3. Lo precalculado se invalida o se recalcula cuando se anula o se corrige una gestión:
   - la caché de las lecturas de entregas de Analítica (TTL de 15 min, hoy sin invalidador por evento);
   - el rollup diario `analytics_daily` de la fecha afectada.
4. El inicio del reloj (`orden.created_at`) no cambia. El fin pasa a ser el instante de la gestión
   final.

**Lo que NO entra** (con su porqué en `design.md > §2 Consumidores`):

- **La tabla de cohorte de carga.** Su desenlace sigue en la transición terminal. Se decide en Q2.
- **La métrica `tiempo_ciclo` del rollup** (Q5 de `AnaliticaRollupRepository`), que se publica por
  API key, ni su gemela en vivo (`AnaliticaOperativaVivaRepository`). Se decide en Q3.
- **Madurez, efectividad, anillo, desglose por status y productos.** Ya leen la última gestión
  vigente y no cambian de lógica; solo ganan la invalidación de caché.
- **Monitoreo** (`TableroDiaRepository`): no es Analítica.
- **El registro de una gestión nueva.** No invalida nada: la frescura de 15 min la sigue dando el TTL
  (decisión humana del 2026-08-17 en `lib/config/conteo-entregas-cache.ts`).

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión | Requisitos que la cubren |
|---|---|---|---|
| D1 | 2026-10-30 · Carlos | «Cerrada» en Analítica es la **gestión final del mensajero** (entregado, devolución, incidente), no el cierre aprobado. Del código sale el conjunto exacto: `entregado`, `devolucion_a_origen_por_rechazo` e `incidente` (ver Q1 sobre `novedad`). | R1, R2, R6, R10 |
| D2 | 2026-10-30 · Carlos | Si una gestión se anula o se corrige, el dato de Analítica se mueve con la corrección: se usa la última gestión vigente al consultar, y la caché y el rollup se invalidan o se recalculan. | R5, R7, R8, R12–R23 |
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

**R13.** CUANDO se corrige con éxito el resultado de una gestión en un cierre abierto, el sistema
DEBE invalidar las mismas etiquetas que en R12 antes de responder.

**R14.** SI el deshacer o la corrección no se aplica (`conflict`, `forbidden`, `validation_error`,
`unauthenticated` o `fuera_de_alcance`), ENTONCES el sistema NO DEBE invalidar ninguna etiqueta.

**R15.** SI la invalidación falla después de que la escritura se confirmó, ENTONCES el sistema:
- DEBE registrar el fallo en el log, sin PII ni ids de dominio;
- DEBE responder el resultado de la escritura, sin convertirlo en error.

**R16.** Cada invalidación de R12 y R13 DEBE quedar registrada con el origen `correccion_gestion` y
la lista de etiquetas invalidadas (registro de la 128, R23).

**R17.** La lista de etiquetas que invalidan R12 y R13 DEBE ser la misma constante que usa el botón
«Actualizar» de Analítica (`refrescarCacheAnalitica`) para las lecturas de entregas. NO DEBE haber
una segunda lista escrita a mano.

### C. Rollup diario

**R18.** CUANDO se anula o se corrige con éxito una gestión cuyo `created_at`, en fecha de Costa
Rica, es **anterior** a la fecha de hoy en Costa Rica, el sistema DEBE encolar, **en la misma
transacción** que la escritura, un trabajo `analitica_reagregar_fecha` para esa fecha y con la
empresa de la orden.

**R19.** SI la fecha de Costa Rica del `created_at` de la gestión es la de hoy, ENTONCES el sistema
NO DEBE encolar ese trabajo.

**R20.** SI la escritura de anulación o de corrección revierte, ENTONCES NO DEBE quedar ningún
trabajo `analitica_reagregar_fecha` encolado por ella.

**R21.** CUANDO el drenador procesa un trabajo `analitica_reagregar_fecha`, el sistema DEBE
re-agregar **exactamente** la fecha de su payload con el mismo agregado del job diario y, después,
DEBE invalidar las etiquetas del dominio `operativa`. SI la re-agregación o la invalidación fallan,
ENTONCES el trabajo NO DEBE reportar éxito.

**R22.** CUANDO se re-agrega la fecha D después de anular una gestión `entregado` de D,
`analytics_daily` DEBE dejar de contar esa gestión en la medida `entregas` de D.

**R23.** La migración que añade el valor `analitica_reagregar_fecha` al enum `job_tipo` DEBE traer
su `down.sql`, que lo retira recreando el tipo con el criterio de
`20260803140000_job_tipo_analitica_invalidacion_cache`.

## Trazabilidad prevista

Las mutaciones que cada test debe matar están en `design.md > §7`.

| R | Test |
|---|---|
| R1, R2, R3, R4, R5, R6, R7, R8, R9, R11 | `tests/integration/db/ciclo-vida-gestion-final.int.test.ts` (Postgres real) |
| R10 | `tests/unit/analytics/ciclo-vida-resultados-de-cierre.guardia.test.ts` |
| R12, R14, R15, R16 | `tests/unit/actions/deshacer-gestion-invalida-analitica.test.ts` |
| R13, R14, R15 | `tests/unit/actions/corregir-resultado-invalida-analitica.test.ts` |
| R12, R13 (cableado real) | `tests/unit/analytics/cache-invalidacion-correccion-cableado.test.ts` |
| R17 | `tests/unit/analytics/tags-entregas-fuente-unica.test.ts` |
| R18, R19, R20 | `tests/integration/db/reagregacion-por-correccion.int.test.ts` (Postgres real) |
| R21 | `tests/unit/services/analitica-reagregar-fecha-handler.test.ts` |
| R22 | `tests/integration/db/rollup-reagregado-tras-anulacion.int.test.ts` (Postgres real) |
| R23 | `tests/integration/db/job-tipo-analitica-reagregar-fecha-migration.test.ts` |

## Preguntas abiertas

Ninguna bloquea el diseño: el spec avanza con el **supuesto por defecto** de cada una, y la
aprobación del spec en `spec_ready` lo confirma o lo cambia.

- **Q1 — ¿`novedad` cierra?**
  - **Lo que dijo Carlos:** «entregado, devolución, incidente».
  - **Lo que hay en el código:**
    - `novedad` no es final: lleva la orden a `novedad`, la tienda la resuelve con plazo y la orden
      puede volver a reparto (spec 100, «resolver novedad»);
    - `devolucion_a_origen_por_rechazo` sí lo es: lleva a `rechazada`, de ahí a `por_devolver` y de
      ahí a `devuelta_a_tienda`, que es terminal, sin otra gestión de entrega;
    - pero el rollup llama «devoluciones» a las `novedad` y «rechazos» a las de rechazo
      (`AnaliticaRollupRepository` Q3).
  - **Consecuencia del supuesto:** una orden con `novedad` que termina devuelta a la tienda **no**
    cuenta como cerrada en el ciclo de vida.
  - **Supuesto por defecto:** «devolución» = `devolucion_a_origen_por_rechazo`, y `novedad` no cierra.
  - **Hay que confirmar:** si `novedad` cierra, o si la llegada a `devuelta_a_tienda` también debe
    cerrar la orden.
- **Q2 — La cohorte de carga.** Su desenlace y sus «días promedio» siguen en la transición terminal.
  Su DTO lo declara a propósito: «`devuelta` significa devolución anclada, no lote cerrado».
  - **Consecuencia:** mientras no haya cierres aprobados, la cohorte mostrará todo «viva» al lado de
    un ciclo de vida con cerradas.
  - **Supuesto por defecto:** la cohorte no cambia en esta ficha. Cambiarla toca su tipo de cubos,
    la tabla y ocho tests de integración.
  - **Hay que confirmar:** ¿se alinea aquí, en otra ficha o no se alinea?
- **Q3 — `tiempo_ciclo` del rollup y de la API.** El catálogo publica `tiempo_ciclo` por API key
  (`METRICAS_API_KEY`) y lo calcula sobre la transición terminal (Q5 del rollup), igual que el
  tablero operativo en vivo. Hoy ese tablero no se pinta: su región del shell está comentada.
  - **Consecuencia:** tras esta ficha hay dos «tiempos de ciclo» con definiciones distintas, el de la
    pantalla y el de la API.
  - **Supuesto por defecto:** no se toca, porque es un contrato público.
  - **Hay que confirmar:** ¿se acepta la divergencia o se abre una ficha para la API?
- **Q4 — El rollup se recalcula por evento.**
  - **La regla de hoy:** D3+D8 de la 124 dice que el job diario nunca recomputa fechas pasadas y que
    corregir es un acto deliberado del backfill (125).
  - **Lo que pide D2 de esta ficha:** recalcular la fecha cuando se anula o se corrige una gestión.
    R18 lo hace con un trabajo **aparte** del diario, que no toca R35 de la 124.
  - **Supuesto por defecto:** D2 deroga D8 para este caso.
  - **Hay que confirmar:** ¿se acepta?
