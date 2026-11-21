# SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)» — requirements

> Ruta: **completa** (toca pruebas de dinero). Zona: fullstack. Depende de SLT-177 «siembra del
> baseline» (mergeada). Rango reservado: **R1190–R1219** (usados R1190–R1210).
> Escrito por spec_author el 2026-11-17. Sin detalles de implementación: el CÓMO y la evidencia
> completa viven en `design.md`.

## Alcance

**El problema.** 21 archivos de prueba están en `tests/baseline-rojos.json` citando esta ficha
(medido en SLT-177, base desechable, 2026-11-16; `progress/impl_SLT-177.md:157-158`):
- **Grupo 1 (14 archivos):** usan el escenario `tests/integration/db/_fixtures/caja-459.ts`, que cae
  en su paso `repartoMensajero` con `sin_saldo` (`caja-459.ts:773`).
- **Grupo 2 (7 archivos):** `477-aprobacion-tras-correccion-sql-real`,
  `454/registro-gestion-sin-transicion-sql-real`, `454/caracterizacion/{cierre-rechazado, deshacer,
  dinero-aprobacion, multi-dia-271}` y `455/caracterizacion/dinero-aprobacion`.

**Diagnóstico (detalle y evidencia en `design.md > Diagnóstico`).** **No se encontró un fallo real
de dinero en producción.** Las 21 pruebas se quedaron atrás de reglas escritas y aprobadas que
llegaron mientras no corrían (estaban en el baseline por la app vacía, SL-31):
- **14 del grupo 1:** desactualizadas por **SLT-122** (R9/R10: la central solo reparte y paga
  cierres de la central; si el mensajero solo tiene cierres de satélite, el reparto responde
  `sin_saldo`) y por **SLT-139** (R317: el pago de un cierre nuevo de satélite lo pone la satélite).
  El mensajero del escenario es de la satélite: la central ya no puede pagarle.
- **4 del grupo 2** (`477`, `cierre-rechazado`, `deshacer`, `multi-dia-271`): desactualizadas por
  **SLT-73** R1 (aprobar un cierre de satélite no escribe dinero; entra al conciliar). Esperan dinero
  justo después de aprobar.
- **2 del grupo 2** (`454` y `455` `dinero-aprobacion`): desactualizadas por **SLT-139** R317/R336.
  Esperan `pago_efectivo` y el código escribe `pago_satelite` por el mismo importe.
- **1 del grupo 2** (`registro-gestion-sin-transicion`): **no es de dinero**. Desactualizada por
  **SLT-79** «Primera ruta del día solo manual con «Sincronizar ruta»»: con la primera ruta del día
  pendiente, una gestión ya no encola la reoptimización.

**Lo que entra.**
- Poner al día las 21 pruebas con las reglas escritas, sin tocar código de producción.
- El escenario 459 pasa a un mensajero de la central (la propuesta de D64).
- Control positivo de cada prueba recuperada (una mutación la pone roja).
- Sacarlas del baseline y cerrar D64.

**Lo que NO entra.**
- Código de producción (`lib/`, `app/`, `components/`, `hooks/`, `db/`): no hay fallo medido.
  Si la re-medición lo encuentra, se para (R1203).
- Los otros rojos del lote de SLT-177: los de SLT-185, SLT-184 y SLT-187 (sin empresa en contexto,
  base vacía propia, índice único por empresa).
- Cambiar reglas de dinero, o recalcular o compensar cierres ya aprobados.

## Decisiones cerradas (no reabrir)

Son reglas que ya están aprobadas en otras fichas. Esta ficha no las cambia: las aplica a las pruebas.

| # | Decisión | Quién / cuándo | Cubierta por |
|---|---|---|---|
| D1 | Aprobar un cierre de satélite no escribe nada en la caja, el libro por tienda ni el libro del mensajero. Su dinero entra al conciliar (SLT-73 D2, R1, R10). | Carlos, 2026-10-31 | R1190, R1191, R1192, R1193 |
| D2 | La central solo reparte y paga cierres `bodega_central`. Un mensajero que solo tiene cierres de satélite da `sin_saldo` al repartir (SLT-122 R9, R10; SLT-139 D7). | Carlos, 2026-11-10 | R1198, R1199 |
| D3 | Un cierre de satélite aprobado desde SLT-139 lleva la marca `pago_independiente_efectivo`. Al conciliar escribe `pago_devengado = P` y `pago_satelite = P`, y ningún `pago_efectivo` (SLT-139 D3, R317, R336). | Carlos, 2026-11-12 | R1194, R1195 |
| D4 | Un cierre de la central aprobado desde SLT-123 solo devenga P en el libro del mensajero; la caja sigue con `egreso_pago_mensajero = P` (SLT-123 R313, R314). | Carlos, ficha SLT-123 | R1200, R1201 |
| D5 | «Todo manual»: con la primera ruta del día pendiente, una gestión no encola reoptimización. Con la ruta ya calculada, solo encola si la orden tiene coordenadas (SLT-79). | Carlos, 2026-11-03 | R1196, R1197 |
| D6 | El ranking y los premios son solo de la central (SLT-124 R1, R12). El escenario 459 ya imputa su premio a un cierre central; su mensajero de satélite con un cierre central es la incoherencia que anota D64. | Carlos, 2026-11-11 | R1198 |
| D7 | La ficha existe para estas 21 pruebas: averiguar la causa, arreglar lo que corresponda y sacarlas del baseline. Va al final de la cola. | Carlos, 2026-11-16 | R1203, R1207, R1208, R1210 |
| D8 | No hay fallo real medido: el diff no toca producción. Las pruebas se ponen al día con literales calculados a mano a partir de la regla escrita, nunca copiados de la salida. | spec_author, 2026-11-17 (se revisa al aprobar el spec) | R1202, R1209 |

## Requisitos (EARS)

Vocabulario: **P** = `cierre_dia.total_pago_mensajero`. **E** = `cierre_dia.total_efectivo`.
**Asentar** = escribir los movimientos de un cierre con el escritor que usa la conciliación
(SLT-73 R10). **Archivo recuperado** = uno de los 21 que sale del baseline.

### A. Aprobar y asentar un cierre de satélite (477, cierre-rechazado, deshacer, multi-dia-271)

- **R1190.** CUANDO se aprueba un `cierre_dia` con destino `bodega_satelite`, el sistema NO DEBE
  escribir por ese cierre ninguna fila en la caja, en el libro por tienda ni en el libro del
  mensajero. Cada uno de los cuatro archivos lo afirma con un conteo igual a 0 justo después de
  aprobar.
- **R1191.** CUANDO se asienta un cierre de satélite que se rechazó, se volvió a solicitar y se
  aprobó, el sistema DEBE escribir sus movimientos. Y CUANDO ese cierre se vuelve a aprobar, el
  sistema NO DEBE escribir ningún movimiento ni ninguna fila de historial más.
- **R1192.** CUANDO se asienta un cierre de satélite con una gestión deshecha, el sistema DEBE cobrar
  a la tienda solo la contra-entrega de las gestiones vigentes:
  - en `deshacer`, `cod_recaudado` = `["2000.00"]`;
  - en `477`, `["cod_recaudado|4000.00", "ingreso_cod_recaudado|4000.00"]`.
- **R1193.** MIENTRAS un mensajero tenga dos cierres abiertos, CUANDO se aprueba uno, el sistema NO
  DEBE escribir dinero del otro. Y CUANDO el otro se aprueba y se asienta, el sistema DEBE escribir
  su dinero: al menos un movimiento de caja con origen en él.

### B. El pago al mensajero de un cierre nuevo de satélite (454 y 455 `dinero-aprobacion`)

- **R1194.** CUANDO se asienta un cierre de satélite aprobado con la marca en `true` y P > 0, el
  libro del mensajero DEBE llevar exactamente `pago_devengado = P` y `pago_satelite = P`, y ningún
  `pago_efectivo`. Con los datos de los dos archivos (P = 1500.00, E = 6000.00):
  `mensajero|devengo|pago_devengado|1500.00` y `mensajero|pago|pago_satelite|1500.00`.
- **R1195.** En esos mismos dos archivos, los otros 16 movimientos (caja y tienda) DEBEN seguir
  iguales, al céntimo, a los literales de hoy. Y re-aprobar NO DEBE añadir ninguno.

### C. Gestión y reoptimización de la ruta (`registro-gestion-sin-transicion`)

- **R1196.** CUANDO el mensajero registra una gestión sobre una orden con coordenadas y su ruta del
  día ya está calculada, el sistema DEBE encolar exactamente un job `optimizacion_ruta` para ese
  mensajero.
- **R1197.** SI la primera ruta del día del mensajero está pendiente, ENTONCES registrar una gestión
  NO DEBE encolar ningún job `optimizacion_ruta`.

### D. El escenario de la caja 459 (14 archivos)

- **R1198.** El escenario 459 DEBE armar su cierre del día con un mensajero de la zona central:
  destino `bodega_central`, aprobado por un actor con acceso total. Los asientos los DEBE escribir la
  propia aprobación, sin llamar aparte al escritor de la conciliación.
- **R1199.** CUANDO el escenario registra desde la central el reparto de 1000.00 y el pago de 664.00
  contra el cierre del día, la liquidación DEBE responder `ok` en los dos pasos, y en la anulación del
  reparto.
- **R1200.** El libro del mensajero del escenario DEBE seguir la regla del cierre nuevo de la
  central: `pago_devengado = P` (4500.00) y ningún `pago_efectivo` por el cierre del día. La caja DEBE
  llevar `egreso_pago_mensajero = P`.
- **R1201.** Las cifras de la caja y del libro por tienda que no dependen del libro del mensajero NO
  DEBEN cambiar en ninguno de los 14 archivos respecto de los literales de hoy.

### E. Literales y paradas

- **R1202.** CUANDO cambie un literal de dinero de cualquiera de los 21 archivos, el cambio DEBE
  llevar al lado, en un comentario, el cálculo a mano y la regla escrita que lo explica (ficha y
  `R<n>`). Un literal copiado de la salida de la prueba no vale.
- **R1203.** SI al volver a medir aparece en un archivo una aserción que falla y no se explica con D1
  a D6, ENTONCES:
  - ese archivo se queda en el baseline con la causa medida;
  - la pregunta para Carlos se anota en `progress/impl_SLT-195.md`;
  - el literal NO DEBE ajustarse;
  - producción NO DEBE tocarse.

### F. Verificación

- **R1204.** Cada archivo recuperado DEBE pasar entero en una base desechable migrada y sembrada,
  con la base presente y 0 casos saltados.
- **R1205.** Para cada archivo recuperado, una mutación del código de producción que la prueba
  vigila DEBE ponerlo rojo, y al restaurarla DEBE volver a verde. Queda escrito en
  `progress/impl_SLT-195.md`: la mutación, la aserción que cayó y el árbol limpio después.
- **R1206.** La verificación NO DEBE usar la base de datos del `.env` ni `prisma migrate reset`.

### G. Baseline y deuda

- **R1207.** CUANDO un archivo queda verde, su entrada DEBE salir de `tests/baseline-rojos.json` en el
  mismo cambio, con una línea de poda en `_lee_esto`.
- **R1208.** Tras el cambio, ninguna entrada del baseline DEBE citar SLT-195, salvo las que deje
  R1203.
- **R1209.** El diff NO DEBE tocar código de producción: `lib/`, `app/`, `components/`, `hooks/`,
  `db/`, `scripts/`, `package.json`.
- **R1210.** D64 DEBE quedar cerrada en `progress/deudas.md`, con la referencia a esta ficha y a lo
  medido.

## Preguntas abiertas

Ninguna bloquea el spec: si se aprueba tal cual, valen las recomendaciones.

- **PA1 — El escenario de la caja 459, ¿pasa a la central?** Hoy el escenario usa un mensajero de la
  satélite y luego hace que la central le pague: le reparte 1000 y le paga 664. Con las reglas
  actuales la central ya no paga a mensajeros de satélite (los paga la satélite, fuera del sistema),
  así que el escenario se cae. Opciones:
  - (a) **El mensajero del escenario pasa a ser de la central.** La central aprueba su cierre y le
    paga. Las 14 pruebas siguen cubriendo pagos, anulaciones y comprobantes. Cambia una cifra que se
    ve: el mensajero ya no aparece «pagado con su efectivo» (2000) porque desde SLT-123 la central le
    debe el pago completo.
  - (b) **Se queda en la satélite y se quitan del escenario el reparto y el pago al mensajero.** Unas
    5 pruebas de comprobantes y anulación de pagos se quedan sin nada que probar.

  **Recomendación: (a).** Es lo que ya proponía D64.
- **PA2 — `registro-gestion-sin-transicion` no es de dinero.** Su rojo viene de la ruta manual
  (SLT-79), no del cierre de satélite. Opciones: (a) arreglarla aquí, porque son unas 30 líneas de
  prueba y su entrada del baseline ya cita esta ficha; (b) llevarla a una ficha aparte.
  **Recomendación: (a).**
