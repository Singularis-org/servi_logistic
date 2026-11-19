# SLT-85 — traza-facturacion-cobros · requirements.md

> **Zona** backend · **Complejidad** medium · **depends_on** SLT-83, SL-40 ·
> **Rama** `feature/SLT-85-traza-facturacion-cobros`
>
> **Alcance.** Una tabla de traza de facturación con una fila por cada cargo y por cada reverso de los
> cobros de la plataforma por orden (SL-40, SLT-66, SLT-83), venga el cobro de donde venga: plan fijo o
> porcentual, excepción de la empresa o valor global. Cada fila es una copia del momento del cobro: datos
> de la orden, regla aplicada, valor cobrado y período de cobro de la empresa. Solo se escribe. La
> migración rellena los cobros ya registrados.
>
> **Lo que NO entra.** Pantalla y exportación de la traza: irán en una ficha aparte cuando se pidan.
> Cobrar el costo base del plan (sigue informativo, SLT-66 R21 y SLT-86 R14). IVA. Moneda (SL-21).
>
> Sembrado por `/afinar-feature` el 2026-11-09. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-09. «Movimiento» es una fila de `cobro_plataforma_movimiento`
> (SL-40); «traza» es la fila nueva de esta ficha. «La plataforma» es el rol dueño de la base, el que usa el
> superadmin (`comoPlataforma`); «la app» es el rol `servi_app` en contexto de empresa.

### Cuándo se escribe

- **R1** — El sistema DEBE tener exactamente una fila de traza por cada movimiento, ligada a él por su
  identificador, y ninguna fila de traza sin su movimiento.
- **R2** — CUANDO se registra un movimiento por cualquiera de los caminos que hoy lo escriben (alta de una
  orden de cobro fijo, alta de una orden que nace anulada, anulación, recuperación, y la conciliación del
  cobro porcentual al entrar en un estado final, al salir de él, al anular o al recuperar), el sistema DEBE
  escribir su fila de traza en la misma transacción.
- **R3** — SI la transacción que registra un movimiento se deshace, ENTONCES el sistema NO DEBE conservar ni
  el movimiento ni su fila de traza; y SI la fila de traza no se puede escribir, ENTONCES el sistema NO DEBE
  registrar el movimiento.
- **R4** — El sistema NO DEBE cambiar, por escribir la traza, ningún movimiento ni ningún importe cobrado:
  los movimientos y la deuda de cada empresa DEBEN ser los mismos que sin ella.

### Qué guarda cada fila

- **R5** — CUANDO escribe una fila de traza, el sistema DEBE copiar de la orden, tal como está en ese
  instante: su número de guía (vacío si aún no tiene), su `monto_cobrar` (vacío si no tiene) y el código de
  su estado.
- **R6** — CUANDO cambian después la guía, el `monto_cobrar` o el estado de la orden, el sistema NO DEBE
  cambiar las filas de traza ya escritas.
- **R7** — SI la orden tiene condiciones porcentuales congeladas (SLT-83), ENTONCES el sistema DEBE
  escribir el tipo de cobro `porcentual`, el porcentaje y el mínimo congelados, y dejar vacío el valor
  fijo.
- **R8** — SI la orden no tiene condiciones porcentuales congeladas, ENTONCES el sistema DEBE escribir el
  tipo de cobro `fijo`, el valor fijo igual al importe del movimiento, y dejar vacíos el porcentaje y el
  mínimo.
- **R9** — El sistema DEBE escribir en la traza la fuente del movimiento: `empresa`, `plan`, `global` o
  `sin_configurar`. SI la fuente es `sin_configurar`, ENTONCES el valor fijo y el valor cobrado DEBEN ser
  0,00.
- **R10** — CUANDO escribe una fila de traza, el sistema DEBE copiar el identificador y el nombre
  del plan asignado a la empresa en ese instante; SI la empresa no tiene plan, ENTONCES DEBE dejar los dos
  vacíos.
- **R11** — El sistema DEBE escribir como valor cobrado el importe del movimiento, positivo en un cargo y
  negativo en un reverso, con el mismo valor absoluto exacto que el movimiento y sin impuestos.
- **R12** — El sistema DEBE escribir como fecha de cobro el instante del movimiento.
- **R13** — CUANDO el movimiento es un reverso, el sistema DEBE escribir el tipo de movimiento `reverso` y
  apuntar a la fila de traza del cargo que anula. CUANDO es un cargo, DEBE escribir `cargo` y no apuntar a
  ninguna fila.
- **R14** — MIENTRAS la empresa tiene un plan asignado, el sistema DEBE escribir, en cada fila de traza, su
  tipo de período (`quincenal`, `mensual`, `bimestral` o `anual`) y el inicio y el fin del período de
  calendario de ese tipo que contiene la fecha de cobro, con la regla de SLT-86 (bordes a las 00:00 de la
  plataforma).
- **R15** — SI la empresa no tiene plan asignado en el instante del movimiento, ENTONCES el sistema DEBE
  dejar vacíos el tipo de período, su inicio y su fin.
- **R16** — Una fila de traza escrita junto a su movimiento DEBE salir con `reconstruido = false`.

### Históricos

- **R17** — CUANDO se aplica la migración, el sistema DEBE escribir una fila de traza por cada movimiento
  ya registrado, con `reconstruido = true`, con lo que sí se guardó entonces (empresa, orden, movimiento,
  tipo de movimiento, cargo anulado, fuente, valor cobrado, fecha de cobro, y el tipo de cobro con su
  porcentaje y mínimo o su valor fijo) y con vacíos el número de guía, el `monto_cobrar`, el estado de la
  orden, el plan y su nombre.
- **R18** — CUANDO la migración rellena una fila, el sistema DEBE calcular su período con la
  regla de SLT-86 a partir de la fecha de cobro y del tipo de cobro que tiene la empresa al aplicar la
  migración; SI la empresa no tiene plan en ese momento, ENTONCES DEBE dejar el período vacío.
- **R19** — SI al terminar el relleno queda algún movimiento sin su fila de traza, ENTONCES la migración
  DEBE fallar sin dejar nada aplicado.
- **R20** — La migración DEBE poder revertirse sin tocar ningún movimiento; SI hay alguna fila de
  traza con `reconstruido = false`, ENTONCES la reversión DEBE negarse sin cambiar nada.

### Quién lee y quién escribe

- **R21** — MIENTRAS la app trabaja en el contexto de una empresa, el sistema DEBE devolverle solo las filas
  de traza de esa empresa, y ninguna sin contexto de empresa.
- **R22** — La plataforma DEBE poder leer las filas de traza de todas las empresas.
- **R23** — SI la app intenta insertar, cambiar o borrar una fila de traza, ENTONCES el sistema DEBE
  rechazarlo (`42501`) sin cambiar nada.
- **R24** — SI cualquier rol, incluida la plataforma, intenta cambiar una fila de traza, ENTONCES
  el sistema DEBE rechazarlo sin cambiar nada.
- **R25** — Ningún archivo de `lib/` ni de `app/` DEBE escribir, cambiar ni borrar filas de traza.
- **R26** — SI una fila de traza apunta a una orden, a un movimiento o a otra fila de traza de otra
  empresa, o intenta cambiar de empresa, ENTONCES el sistema DEBE rechazarlo (`SL017`).

### Forma de los datos

- **R27** — La tabla de traza DEBE tener exactamente las columnas de la tabla «Campos de cada fila» y del
  período, con nombres `snake_case` en español, los importes en decimal con 2 decimales (el porcentaje con
  2 decimales), sin columnas de impuesto ni de moneda.

### Mapa decisiones → requisitos

| Decisión cerrada | Requisitos |
|---|---|
| ¿Qué cobros cubre? | R1, R2, R7, R8, R9 |
| ¿Se edita o se borra? | R6, R11, R13, R23, R24, R25 |
| Campos de cada fila | R5, R7–R13, R16, R27 |
| Número de guía | R5, R6 |
| Históricos | R17, R18, R19, R20 |
| Quién la lee | R21, R22 |
| IVA y moneda | R11, R27 |
| ¿Guarda el período de cobro? | R14, R15, R18 |
| Importes | R11, R27 |
| Nombres en la base | R27 |
| Cuándo se escribe | R1, R2, R3 |
| Ruta | Sin R: es de proceso. Lo hace cumplir `scripts/validate-features.mjs` (la migración exige la ruta completa) |
| P1 · plan que se copia | R10 |
| P2 · período de los históricos | R18 |
| P3 · nadie cambia ni borra | R23, R24, R25 |
| P4 · reversión de la migración | R20 |
| Tamaño del PR | Sin R: es de proceso. La línea `tamano-pr-aceptado` va en `progress/features/SLT-85.md` |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Qué cobros cubre? | Todos los cobros de la plataforma por orden: plan (fijo o porcentual), excepción de la empresa y valor global. Una fila por cargo y otra por reverso. |
| 2026-11-05 | ¿Se edita o se borra? | Solo se escribe; nunca se edita ni se borra. Un reverso es una fila nueva con valor negativo que apunta al cargo que anula (`reverso_de`). |
| 2026-11-05 | Campos de cada fila | `id`, `organizacion_id`, `orden_id` (relación), `num_guia`, `monto_cobrar` de la orden en ese momento, tipo de cobro (fijo \| porcentual), `fuente` (empresa \| plan \| global \| sin_configurar), `plan_id` y `plan_nombre`, porcentaje y mínimo (si es porcentual), `valor_fijo` (si es fijo), valor cobrado, fecha de cobro, `estado_orden` al cobrar, `tipo_movimiento` (cargo \| reverso), `reverso_de`, `movimiento_id` (1 a 1 con `cobro_plataforma_movimiento`), `reconstruido`, `created_at`. |
| 2026-11-05 | Número de guía | El de la orden en el momento del cobro; vacío si la orden aún no tiene guía. No se actualiza después. |
| 2026-11-05 | Históricos | La migración rellena desde `cobro_plataforma_movimiento`. Lo que no se guardó entonces queda vacío y la fila sale con `reconstruido = true`. |
| 2026-11-05 | Quién la lee | Solo datos. La empresa lee solo las suyas (RLS); el superadmin, todas. Sin pantalla ni exportación. |
| 2026-11-05 | IVA y moneda | Sin IVA (SLT-66 R14). Moneda abierta hasta SL-21. |
| 2026-11-09 | ¿Guarda el período de cobro? | Sí. Cada fila guarda el tipo de período de la empresa al cobrar (quincenal \| mensual \| bimestral \| anual) y el inicio y fin del período de calendario en que cae el cobro (SLT-86). En los históricos se calcula con la regla de SLT-86 y la fila sale como `reconstruido`. Una empresa sin plan al cobrar deja el período vacío. |
| 2026-11-09 | Importes | Decimal con 2 decimales, igual que `cobro_plataforma_movimiento` (heredado de SL-40). Nunca float. |
| 2026-11-09 | Nombres en la base | `snake_case` en español, como el resto de la base (`docs/conventions.md`). |
| 2026-11-09 | Cuándo se escribe | En la misma transacción que el movimiento de `cobro_plataforma_movimiento`: no puede haber movimiento sin su fila de traza ni al revés. |
| 2026-11-09 | Ruta | Completa: toca dinero y hace migración (`docs/specs.md > Tres rutas`). |
| 2026-11-09 | P1 · ¿Qué plan se copia en `plan_id` y `plan_nombre`? | El plan asignado a la empresa en el instante del movimiento, sea cual sea la fuente. No el plan que fijó la regla al crear la orden. |
| 2026-11-09 | P2 · Período de los históricos: ¿con qué tipo de cobro? | Con el tipo de cobro que tiene la empresa al aplicar la migración; vacío si en ese momento no tiene plan. La fila sale `reconstruido`. |
| 2026-11-09 | P3 · «Nunca se borra»: ¿también para el dueño de la base? | Igual que los movimientos: nadie cambia una fila (ni el dueño). Borrar está cerrado para la app y para el código; solo se borra en cascada en el borrado de la demo de QA y en las limpiezas de los tests. |
| 2026-11-09 | P4 · ¿Puede revertirse la migración con filas escritas en vivo? | No: el `down.sql` se niega si hay alguna fila con `reconstruido = false`. |
| 2026-11-09 | Tamaño del PR | Se acepta el exceso de líneas sobre `gate.tamano_pr` en un solo PR (migración y relleno no se pueden partir). |
