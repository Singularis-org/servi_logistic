# Requisitos — SLT-212 «Rojos en dev: demo-qa (pago a la plataforma) y escenario 459 (gestión que no vuelve en el cierre)»

> **Origen.** Dos rojos de `tests/integration/db` medidos el 2026-11-19 sobre `origin/dev` (`ab489908`) en bases locales:
> A) `demo-qa.test.ts` cae con `validation_error (monto)` en `registrarEgreso(pago_plataforma)`; B) los usuarios del
> escenario 459 caen con «Esta gestión no pertenece a lo que vuelve en este cierre» al aprobar el cierre.
>
> **Ruta.** Nació como directa y urgente; la review (`progress/review_SLT-212.md`, B3) la subió a completa porque el diff trae
> una migración que redefine funciones del cobro de la plataforma (dinero). Estos requisitos salen del diagnóstico y del mapa de
> `progress/impl_SLT-212.md`; cada uno apunta a un test que ya existe.
>
> **Alcance.** El instante que guardan los movimientos del cobro de la plataforma (`cobro_plataforma_movimiento.ocurrido_at`) y el
> fixture del escenario 459. **Fuera de alcance:** importes, fuentes, secuencias y condiciones del cobro (no cambian); los
> `DEFAULT CURRENT_TIMESTAMP` de columnas `timestamp` sin zona (menor m2 de la review, para otra ficha); `findCentralZonaId` de la
> app, que en producción ya acota la RLS.

## Decisiones cerradas (no reabrir)

| Decisión | Quién y cuándo | R |
|---|---|---|
| A se arregla en la app con el reloj UTC, no con la zona de la base local | leader, 2026-11-19 («si es un bug de la app, arréglalo con el cambio mínimo») | R1–R3 |
| B se arregla en el fixture: es el test el que salta la RLS, no la app | leader, 2026-11-19 | R5 |

## El instante del cobro de la plataforma

- **R1 (ubicuo):** El sistema DEBE guardar en `ocurrido_at` de cada cargo, reverso y re-cobro que escriben sus triggers el instante
  real en UTC, cualquiera que sea el `TimeZone` de la sesión de base de datos.
- **R2 (evento):** CUANDO una orden de una empresa con plan nace, se anula, se restaura o cambia a o desde un estado final, el
  movimiento del cobro de la plataforma DEBE llevar los mismos importe, fuente y secuencia que antes de esta ficha; solo cambia el
  reloj.
- **R3 (condicional):** SI la sesión de base de datos está en UTC, ENTONCES el valor escrito DEBE ser idéntico al de antes de esta
  ficha (no hay datos que corregir en producción ni en Preview).
- **R4 (evento):** CUANDO la demo de QA cierra la factura de la plataforma y registra el pago a la plataforma, el pago DEBE caber en
  lo facturado a cualquier hora del día, también entre las 00:00 y las 05:00 de la plataforma con una base en otra zona.

## El escenario 459

- **R5 (estado):** MIENTRAS el escenario 459 solicita y aprueba su cierre, DEBE hacerlo con el rol de la app y la empresa de su
  transacción, de modo que una zona central de OTRA empresa en la base no cambie el destino del cierre.
- **R6 (ubicuo):** Los tests que usan el escenario 459 DEBEN seguir comprobando las mismas cifras: el arreglo no cambia ninguna
  aserción ni ningún dato sembrado.

## Trazabilidad

| R | Test |
|---|---|
| R1 | `tests/integration/db/cobro-plataforma-ocurrido-utc.test.ts` (dos casos, sesión en `Pacific/Kiritimati`, +14 h) |
| R2 | `tests/integration/db/cobro-plataforma-ocurrido-utc.test.ts` (control de tipos y secuencias); `cobro-plataforma-cargos.test.ts`, `cobro-plataforma-porcentual.test.ts` sin cambios |
| R3 | `tests/integration/db/cobro-plataforma-ocurrido-utc.test.ts` (diferencia 0 con `now() AT TIME ZONE 'UTC'`); review 1c |
| R4 | `tests/integration/db/demo-qa.test.ts`; E2E del proyecto `dinero` y de cobro/factura/pago de la plataforma (`progress/impl_SLT-212.md`) |
| R5 | `tests/integration/db/libro-caja-revision-458e.test.ts`, `como-quedo.test.ts` con una central ajena commiteada |
| R6 | los 45 archivos que usan `_fixtures/caja-459.ts` |
