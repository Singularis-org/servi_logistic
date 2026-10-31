# SLT-63 — recoleccion-recibida-libera-mensajero · requirements.md

> Zona: backend · Complejidad: medium · depends_on: — · Rama: feature/SLT-63-recoleccion-recibida-libera-mensajero
>
> **Alcance.** Cuando la bodega central recibe una orden que un mensajero recolectó en la tienda,
> la orden sigue a nombre de ese mensajero (`mensajero_asignado_id`). Medido en producción el
> 2026-10-29 (`progress/verificacion-analitica-monitoreo-2026-10-29.md` §4 y §6), tiene dos efectos:
> el filtro «Reasignables» de `/ordenes` no la muestra, y Monitoreo la cuenta en «Asignados / Otros
> estados» del mensajero (Jason Alfaro: 43 en vez de 38; guías 15383266, 24335845, 31084953,
> 79389505 y 79796683). Esta ficha arregla exactamente eso.
>
> **Lo que NO entra.**
> - La recepción de devoluciones en la central (`devolviendo_a_bodega_central → por_devolver_a_tienda`):
>   no está evidenciada y conserva su comportamiento.
> - La bodega satélite: no tiene el defecto (ver `design.md §2.3`).
> - Rediseñar Monitoreo, «Reasignables» o la rama de recolección del tablero.
> - Corregir las órdenes que ya están en este estado: depende de Q1.
>
> Escrito por `spec_author` el 2026-10-30. No venía sembrado: la única decisión humana previa está
> en `progress/features/SLT-63.md > Decisiones` y se copia abajo tal cual.

## Decisiones cerradas (no reabrir)

| # | Fecha | Quién | Decisión | Cubierta por |
|---|---|---|---|---|
| D1 | 2026-10-30 | Carlos | «Arreglemos todo eso». Arreglo mínimo de lo evidenciado: que la recolección recibida en central aparezca en «Reasignables» y no cuente en Monitoreo del mensajero. | R1, R5, R6 |

## Requisitos (EARS)

Vocabulario:

- **Recepción central de una recolección**: la recepción en bodega central (feature 138) que
  transiciona una orden de `en_ruta_bodega_central` a `en_bodega_central`. A `en_ruta_bodega_central`
  se llega por la recolección en tienda (157), por la carga API (sin mensajero) o por revertir un
  incidente en tránsito (#56).
- **Asignación de la orden**: el trío `mensajero_asignado_id`, `asignado_at` y `fecha_reparto`, que
  se escriben y se limpian juntos (guardia `fecha-reparto-acompana-asignado-at`).
- **Día de Monitoreo**: el día natural de Costa Rica que representa el tablero (`TableroDiaRepository`).

### La recepción libera la orden

- **R1.** CUANDO la recepción central transiciona una orden de `en_ruta_bodega_central` a
  `en_bodega_central`, el sistema DEBE dejar la orden sin asignación (sin mensajero, sin
  `asignado_at` y sin `fecha_reparto`) en la misma operación atómica que el cambio de estado.
- **R2.** SI la recepción central no transiciona la orden (perdió la carrera, ya estaba recibida, el
  estado no es un origen válido, la orden no existe o está borrada), ENTONCES el sistema NO DEBE
  modificar su asignación.
- **R3.** CUANDO la recepción central transiciona una orden de `devolviendo_a_bodega_central` a
  `por_devolver_a_tienda`, el sistema DEBE conservar su asignación sin cambios.
- **R4.** CUANDO la recepción central transiciona una orden, el sistema DEBE conservar su `num_guia`
  y registrar exactamente una fila de historial con origen `recepcion_bodega_central`, y NO DEBE
  registrar ninguna fila adicional por la liberación.

### Efectos que pidió el humano (D1)

- **R5.** CUANDO la central recibe una recolección, el filtro «Reasignables» de `/ordenes` DEBE
  incluir esa orden.
- **R6.** CUANDO la central recibe una recolección, Monitoreo NO DEBE contar esa orden en la tarjeta
  de ningún mensajero del día (ni en «Asignados» ni en ningún cubo de resultado o estado).
- **R7.** MIENTRAS una orden asignada hoy a recolección siga en `recolectando` o en
  `en_ruta_bodega_central`, Monitoreo DEBE seguir contándola en la tarjeta del mensajero asignado.

### Lo que no se debe romper

- **R8.** CUANDO la central recibe una orden que un mensajero recolectó hoy, la lista «Recolectadas
  hoy» de ese mensajero DEBE seguir mostrándola mientras la orden no tenga otro mensajero asignado
  (167/R26).
- **R9.** La lectura de datos de «Recolectadas hoy» DEBE devolver una orden solo si está asignada al
  mensajero que la pide, o si no tiene mensajero asignado y ese mensajero registró su recolección en
  tienda. En cualquier otro caso NO DEBE devolverla.
- **R10.** El sistema NO DEBE crear, modificar ni anular gestiones, pagos al mensajero, movimientos
  de wallet ni cierres del día como consecuencia de liberar la orden en la recepción (157/R36).

## Trazabilidad prevista (la completa el implementer en `progress/impl_SLT-63.md`)

| R | Test |
|---|---|
| R1 | `tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts` → «R1: recibir una recolección deja mensajero, asignado_at y fecha_reparto en NULL»; `tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts` → «SLT-63/R1: el data del updateMany limpia la asignación» |
| R2 | integración → «R2: una recepción que no transiciona no toca la asignación» (orden ya en `en_bodega_central` con mensajero y orden en otro estado) |
| R3 | integración → «R3: la recepción de una devolución conserva el mensajero»; unitario del repo → `data` sin la asignación en el caso 139 |
| R4 | integración → «R4: num_guia intacto y una sola fila de historial recepcion_bodega_central» |
| R5 | integración → «R5: tras recibir la recolección, el listado con `reasignables` la trae» (con su hermana: una en `en_bodega_central` con mensajero sembrado a mano no sale) |
| R6 | integración → «R6: tras recibir la recolección, `contarPorMensajero` no la cuenta para nadie» |
| R7 | integración → «R7: la hermana en `en_ruta_bodega_central` sigue contando para su mensajero» |
| R8 | integración → «R8: Recolectadas hoy sigue trayendo la recibida en central» (lectura real de `findMisAsignacionesByIds`) |
| R9 | integración → «R9: no trae la recolectada por otro, ni la recolectada por mí y ya asignada a otro» |
| R10 | integración → «R10: recibir no crea gestion_orden, wallet_movimiento ni cierre_dia» (conteos antes/después) |

Cada test de R1, R5, R6, R8 y R9 se da por bueno solo después de verlo en rojo con una mutación del
SQL o del `data` donde vive el criterio (`tasks.md > T5`).

## Preguntas abiertas

- **Q1 (para el humano, bloquea solo T6).** Las órdenes que ya están en `en_bodega_central` con el
  mensajero de la recolección (en producción, al menos las 5 de Jason Alfaro) no se arreglan solas:
  el cambio solo actúa en recepciones nuevas. Hoy siguen saliendo en el Monitoreo de Alfaro de los
  días en que se asignó la recolección y no aparecen en «Reasignables». Se pueden asignar desde
  `/ordenes` sin ese filtro, y al asignarlas se corrigen. ¿Qué prefieres?
  - **(a)** Una migración de datos que deje sin asignación a toda orden viva en `en_bodega_central`
    cuya última fila de historial sea `recepcion_bodega_central` desde `en_ruta_bodega_central`.
    Su `down.sql` repone el mensajero desde el actor de la última `recoleccion_tienda` de cada orden.
    Es la propuesta (`design.md §5`).
  - **(b)** No tocar datos: el operador las asigna desde el listado sin filtro.
- **Nota (no es pregunta).** Este spec deja sin efecto dos requisitos anteriores, y lo dice para que
  no se lea como contradicción: 138/R18 («la recepción no toca `mensajero_asignado_id`») pasa a valer
  solo para la devolución (R3), y la rama de recolección de Monitoreo (259/R10) cuenta la orden hasta
  que la central la recibe (R6, R7). Las dos cosas salen de D1.
