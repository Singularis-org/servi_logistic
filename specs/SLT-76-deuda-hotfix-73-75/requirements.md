# SLT-76 «Deuda de los hotfix SLT-73 y SLT-75» (HOTFIX)

## Alcance (de `progress/features/SLT-76.md`)

Cerrar la deuda que dejaron SLT-73 y SLT-75 antes de volver a EP-8. La rama sale de `origin/prod`.
Cada bloque es un arreglo mínimo y no rediseña nada:

1. La fecha de las tarjetas de cierre se pinta en UTC.
2. El diálogo «Desmarcar» se ofrece sobre una marca que ya no se puede desmarcar.
3. Revertir una conciliación no tiene en cuenta los ajustes de diferencia (m4 de SLT-73).
4. El esperado de la diferencia se calcula en dos sitios (m5 de SLT-73).
5. El SQL a mano del estado de cuenta de la bodega no tiene test de dos empresas (m3 de SLT-73).
6. Los distritos que entran y salen de una zona no dejan rastro en `historial_accion` (Q1 de SLT-75).
7. Hay cuatro tests rojos o inestables: D32, `geografia-por-pais`, `indices-rutas-calientes` y
   `salida-a-reparto-sql-real`.
8. Los textos de SLT-73 pasan a definitivos.
9. Se borran los respaldos de migración de SLT-73 y SLT-75.

**Lo que NO entra:**
- La zona horaria por país. La fecha usa la utilidad del repo, que fija la de Costa Rica; hacerla
  depender del país es SLT-42 (ver Q2).
- Las fechas recortadas con `slice(0, 10)` fuera de las superficies de dinero
  (`app/(app)/incidentes/**`). Quedan anotadas en `design.md §1`.
- El texto del diálogo «Desmarcar» cuando la marca sí se puede desmarcar: Carlos dio los textos de
  SLT-73 por definitivos.
- Meter tests en `tests/baseline-rojos.json`. Ningún bloque lo necesita.

## Decisiones cerradas (no reabrir)

| Fecha | Quién | Decisión | Cubierta por |
|---|---|---|---|
| 2026-11-01 | Carlos | Hotfix a `prod`: `dev` no puede ir a producción hasta terminar EP-8. | Proceso, no es comportamiento. La rama y el worktree ya existen. |
| 2026-11-01 | Carlos | Los textos provisionales de SLT-73 (Q10, pistas del bloque «Por cobrar a satélites», dueño «Satélite») quedan como definitivos. | R16 |
| 2026-11-01 | Carlos | El distrito sin zona con 1 orden se queda sin zona (Q2 de SLT-75, cerrada). | R19: ninguna migración de esta ficha toca `zona_distrito` |
| 2026-11-01 | Carlos | Los respaldos `respaldo.slt73_asientos` y `respaldo.slt75_zona_distrito_duplicado` se BORRAN en este hotfix, después de verificar en prod que SLT-73 y SLT-75 quedaron bien. Es irreversible. | R17, R18, R19, R20 |

## Requisitos (EARS)

### Bloque 1 — Fecha del cierre en el calendario del negocio

- **R1** — CUANDO una tarjeta o un comprobante de cierre (de mensajero, de bodega o el propio del
  mensajero) muestra una fecha de solicitud, de resolución o de conciliación, el sistema DEBE
  mostrar el día calendario de la zona horaria del negocio que ya usa el repo (la de
  `lib/utils/fecha-cr.ts`), no el día UTC.
  Ejemplo: un instante `2026-11-01T05:03:00Z` se muestra como `2026-10-31`. Una fecha ausente
  sigue mostrándose como «—».
- **R2** — El código de `app/(app)/cierres-admin/**` y de `app/(app)/cierre-dia/**` NO DEBE obtener
  el día de una fecha recortando su texto a 10 caracteres.

### Bloque 2 — «Desmarcar» solo cuando se puede

- **R3** — MIENTRAS una consolidación conciliada tiene dinero asentado por su conciliación (asientos
  de caja de sus cierres del día, o al menos un ajuste de diferencia), el sistema NO DEBE ofrecer la
  acción «Desmarcar» para ella, ni en `/wallet/satelites` ni en `/cierres-admin`. Se sigue
  ofreciendo «Corregir» cuando la marca está «Recibido incompleto».
- **R4** — El sistema DEBE decidir si ofrece «Desmarcar» con el mismo criterio con el que el
  servidor rechaza la reversión (R5). Para cualquier consolidación conciliada, «se ofrece
  Desmarcar» DEBE ser equivalente a «revertir no devolvería `con_asientos`».

### Bloque 3 — Revertir no deja una diferencia huérfana

- **R5** — SI se pide revertir la conciliación de una consolidación que tiene al menos un ajuste de
  diferencia, aunque ninguno de sus cierres del día tenga asientos de caja, ENTONCES el sistema
  DEBE rechazar la reversión con el desenlace `con_asientos`. No DEBE cambiar la marca, ni
  `conciliacion_bodega_ajuste`, ni ningún libro, ni `historial_accion`.

### Bloque 4 — Una sola fórmula del esperado

- **R6** — El sistema DEBE calcular lo esperado de una consolidación con una única fórmula,
  compartida por el ajuste de diferencia de la marca o la corrección y por el «Falta por recibir»
  de las dos pantallas. Para el snapshot `total_general` 9.000, `total_pago_mensajero` 1.500 y
  `total_ingreso_bodega_rechazos` 500, el esperado DEBE ser 7.000. Una marca con recibido 6.900
  DEBE dejar un ajuste de diferencia de 100.

### Bloque 5 — El estado de cuenta de la bodega aislado por empresa

- **R7** — CUANDO una empresa B lee el estado de cuenta de una bodega de la empresa A (totales,
  periodo o página) con el rol de la aplicación, el sistema NO DEBE devolver ninguna fila de A: el
  periodo y la página quedan vacíos y los totales en 0,00. CUANDO lo lee A, DEBE devolver sus
  cifras.

### Bloque 6 — Rastro de los distritos de una zona *(forma sujeta a Q1)*

- **R8** — CUANDO el maestro guarda la edición de una zona y su lista de distritos cambia, el
  sistema DEBE escribir en `historial_accion`, en la misma transacción del guardado, una fila por
  cada distrito añadido y una por cada distrito quitado. Todas las filas del guardado DEBEN
  compartir el mismo lote.
- **R9** — Cada fila de R8 DEBE identificar la zona (después del guardado) y el distrito. En un
  distrito añadido, el distrito va en el valor nuevo y el valor anterior queda vacío. En uno
  quitado es al revés. El texto del distrito DEBE caber en 60 caracteres.
- **R10** — SI el guardado no cambia la lista de distritos, o se rechaza (R1/R2 de SLT-75), ENTONCES
  el sistema NO DEBE escribir ninguna fila de R8.
- **R11** — La pantalla y la descarga de `/historico/acciones` DEBEN mostrar la acción de R8 con su
  etiqueta y su categoría, y el filtro por categoría DEBE encontrarla.

### Bloque 7 — Tests deterministas

- **R12** — `liquidacion-reparto-migration` DEBE tomar sus bloqueos en el orden del protocolo del
  repo antes de su primer DDL: primero el lock de escritura real (`CLAVE_LOCK_ESCRITURA_REAL`) y
  después `public.usuario` en modo `ACCESS EXCLUSIVE`. El test DEBE comprobar que ambos están
  tomados antes del primer DDL.
- **R13** — `geografia-por-pais` DEBE aceptar el rechazo de una restricción `ON UPDATE RESTRICT`
  con hijos tanto si Postgres lo reporta como `23503` como si lo reporta como `23001`, y DEBE
  seguir comprobando que nada cambió. Los rechazos que no vienen de esa restricción con hijos
  DEBEN seguir exigiendo `23503` exacto.
- **R14** — En `indices-rutas-calientes`, el plan de `AnaliticaOperativaRollupRepository.agregarCubos`
  DEBE nombrar `analytics_daily_organizacion_id_fecha_idx` con independencia de los datos y de las
  estadísticas que la base ya tenga fuera del corpus del test. Si ese índice falta, el test DEBE
  seguir poniéndose rojo.
- **R15** — `salida-a-reparto-sql-real` DEBE sembrar su geografía con un cantón del país de la
  empresa del test, elegido con un orden total. El resultado NO DEBE depender de los cantones de
  otros países que haya en la base compartida ni del orden en que estén guardados.

### Bloque 8 — Textos de SLT-73 definitivos

- **R16** — El sistema DEBE seguir mostrando literalmente la nota de Q10 («Marcar recibido asienta
  el dinero en la caja. Después no se puede desmarcar: si el monto no es el correcto, usa
  «Corregir»»), las pistas del bloque «Por cobrar a satélites» y el dueño «Satélite» del libro. El
  spec de SLT-73 y los tests que los fijan NO DEBEN llamarlos provisionales.

### Bloque 9 — Retirar los respaldos

- **R17** — CUANDO se aplica la migración de retirada, el sistema DEBE borrar
  `respaldo.slt73_asientos` y `respaldo.slt75_zona_distrito_duplicado`, y el esquema `respaldo`
  SOLO si queda vacío. SI el esquema conserva otro objeto, ENTONCES DEBE dejarlo intacto con sus
  filas y la migración NO DEBE fallar. Toda la migración es todo o nada.
- **R18** — SI se ejecuta el `down.sql` de SLT-73 (migración C) y su respaldo ya no existe, ENTONCES
  el sistema DEBE fallar con un mensaje que nombre SLT-76 y diga que los asientos retirados no se
  pueden devolver. Ningún libro DEBE cambiar.
- **R19** — SI se ejecuta el `down.sql` de datos de SLT-75 y su respaldo ya no existe, ENTONCES el
  sistema NO DEBE fallar ni cambiar `zona_distrito`, y DEBE dejar un aviso (`NOTICE`) que nombre
  SLT-76. Ninguna migración de esta ficha DEBE tocar `zona_distrito` ni otra tabla de `public`.
- **R20** — El `down.sql` de la migración de retirada NO DEBE recrear los respaldos, ni siquiera
  vacíos, y DEBE decir por escrito que los datos no se recuperan.

## Preguntas abiertas

**Q1 · Forma del rastro de distritos (bloque 6). [BLOQUEA T6; Carlos confirma o cambia cada punto]**

Lo que cuesta ya está estudiado: un enum nuevo cuyo `down.sql` recrea el tipo, tres mapas en
`lib/types/historial-accion.ts` y conteos fijos en guardias y tests (Q1 de SLT-75). El `down.sql`
se abarata con el patrón de SL-23 (`design.md §6.2`). R8-R11 están escritos con estos valores por
defecto:

- **(a) Granularidad.** *Defecto:* una fila por distrito, con todas las del guardado en el mismo
  lote. *Por qué no una fila por guardado:* `valor_anterior` y `valor_nuevo` son `VARCHAR(60)`, así
  que una lista de distritos no cabe sin ensanchar la columna.
- **(b) Valores.** *Defecto:* añadido → `valor_anterior` vacío y `valor_nuevo` = distrito;
  quitado → al revés. La pantalla ya los muestra como «Valor anterior» y «Valor nuevo».
- **(c) Texto del distrito.** *Defecto:* `«<distrito> (<cantón>)»` recortado a 60. Con el nombre
  solo no basta, porque hay distritos que se llaman igual en cantones distintos.
- **(d) Categoría.** *Defecto:* `mueve_dinero`, por el mismo motivo escrito de
  `orden_zona_reconciliada`: el distrito decide la zona, y la zona decide la tarifa.
- **(e) Cuándo.** *Defecto:* solo al editar. Crear o borrar una zona no deja estas filas, igual que
  `zona_pago_mensajero_cambiado` (Q3 de la ficha 380) y como ya cubre `zona_borrada`.
- **(f) Nombre y etiqueta.** *Defecto:* acción `zona_distrito_cambiado`, etiqueta «Cambió los
  distritos de una zona».

**Q2 · Solape con SLT-42 «Teléfono, documento y hora por país» (pending). [NO BLOQUEA; confirmar
la acotación]**

SLT-42 hará que la zona horaria dependa del país. El bloque 1 no la re-crea: llama a la utilidad
única del repo (`fechaCalendarioCR`), la misma que SLT-42 tendrá que cambiar, y suma dos lectores
más al censo de SLT-42. Propuesta: se acota así y queda escrito en «Lo que NO entra». Si Carlos
prefiere esperar a SLT-42, el bloque 1 sale de esta ficha.
