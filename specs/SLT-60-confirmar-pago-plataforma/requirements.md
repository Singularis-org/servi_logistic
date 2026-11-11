# SLT-60 — confirmar-pago-plataforma · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SL-45 «Pago a la plataforma desde la wallet», SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes» · **Rama** `feature/SLT-60-confirmar-pago-plataforma`
>
> **Alcance.** El pago a la plataforma que la empresa registra en su wallet (SL-45) queda «Por confirmar»: la
> caja baja al registrar, pero la deuda no baja hasta que el superadmin lo confirme. En Plataforma > Empresas,
> el superadmin confirma el pago y lo reparte entre una o varias facturas de SLT-118, con pago parcial (el
> sistema propone las más viejas primero), o lo rechaza con motivo. También registra él mismo un pago hecho por
> fuera sobre una factura y anula con motivo un pago ya confirmado. Una factura queda pagada cuando su saldo
> llega a 0. Los avisos van en la app.
>
> **Lo que NO entra.**
> - Los correos al superadmin y al maestro: SLT-132 «Correos del pago a la plataforma».
> - El período de gracia, la mora y la operación congelada: SLT-121 «Planes: plazo de pago de la factura y
>   operación congelada por mora».
> - Las pantallas de lista y detalle de facturas: SLT-119 «Planes: pantallas de facturas para el superadmin y
>   el maestro».
> - Cobrar de verdad (pasarela, conciliación bancaria): sigue fuera, como en SL-45.
> - Absorbe SLT-131 «Planes: el superadmin marca pagada la factura de un ciclo», cancelada el 2026-11-11.
>
> Sembrado por `/afinar-feature` el 2026-11-11. El bloque de Alcance y la tabla de «Decisiones cerradas» los
> fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.
>
> El spec no arranca hasta que SLT-118 esté en `done`: las facturas salen de ahí (`AGENTS.md > Dependencias`).

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **Reenviar tras un rechazo.** ¿La empresa puede corregir y reenviar el mismo pago rechazado, o registra uno
  nuevo? Propuesta: registra uno nuevo (el rechazado queda en el libro con su contra-asiento).
- **Pagos anteriores y saldo de las facturas.** Los pagos anteriores a esta feature quedan confirmados sin
  aplicarse a ninguna factura. ¿Cómo cuentan al calcular el saldo de cada factura? Por ejemplo: ¿se aplican
  solos a las facturas más viejas al desplegar, o quedan como saldo a favor sin imputar?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-11 | SLT-60 y SLT-131 se pisan | Un solo flujo en SLT-60: el pago de la wallet se confirma y se reparte entre facturas, y el superadmin registra los pagos hechos por fuera. SLT-131 se cancela (humano). |
| 2026-11-11 | ¿Cuándo baja la caja de la empresa? | **Al registrar**: el dinero ya salió. La deuda baja solo al confirmar. Si el superadmin rechaza, contra-asiento con el motivo y el dinero vuelve a la caja (humano). |
| 2026-11-11 | Pagos registrados antes de esta feature | **Quedan confirmados**: la deuda de nadie cambia. No se aplican a ninguna factura (humano). |
| 2026-11-11 | ¿Cómo se aplica un pago a las facturas? | A **una o varias** facturas y se admite **pago parcial**. El sistema propone las más viejas primero y el superadmin ajusta. Ejemplo: un pago de 300 000 contra la factura 1–15 nov (200 000, queda pagada) y la 16–30 nov (100 000, queda con saldo de 80 000). Una factura queda pagada cuando su saldo llega a 0 (humano). |
| 2026-11-11 | Pago que registra el superadmin (la empresa pagó por fuera) | Baja la deuda, se aplica a la factura **y crea el egreso en la caja de la empresa** (humano). |
| 2026-11-11 | ¿Se puede deshacer una confirmación? | Sí: el superadmin **anula con motivo obligatorio**. La factura recupera su saldo, la deuda sube, el dinero vuelve a la caja con un contra-asiento y queda constancia. Si la factura ya venció, aplica la mora de SLT-121 (humano). |
| 2026-11-11 | ¿Cuándo anula la empresa su propio pago? | **Solo mientras está «Por confirmar»**. Una vez confirmado o rechazado, solo lo toca el superadmin (humano). |
| 2026-11-11 | Tope al registrar | Deuda menos **todos** los pagos vigentes, confirmados o por confirmar. Ejemplo: debe 380 000 y tiene 200 000 por confirmar, así que puede registrar hasta 180 000 (humano; ajusta D4 de SL-45). |
| 2026-11-11 | Avisos | En esta ficha, **solo en la app**: contador de «pagos por confirmar» en Empresas, y el estado de cada pago en la wallet de la empresa (por confirmar, confirmado con sus facturas, rechazado con motivo). Los correos van a SLT-132 (humano: el tamaño parte la ficha). |
| 2026-11-11 | Datos del pago | Heredados de SL-45: monto, fecha, referencia y comprobante opcional. |
| 2026-11-11 | Quién registra en la empresa | Heredado de SL-45 D5: `maestro` y `admin`. Confirmar, repartir, rechazar, registrar por fuera y anular un confirmado: solo el superadmin. |
| 2026-11-11 | Libro y categoría | Heredado de SL-45 D6, D8 y D13: categoría `egreso_pago_plataforma`, anulación por contra-asiento con motivo y libro append-only en la base. |
| 2026-11-11 | Deuda | Heredada de SLT-118: cargos − reversos + cuotas de facturas cerradas − pagos, pero ahora solo cuentan los pagos **confirmados**. |
| 2026-11-11 | E2E | Obligatorio: toca el flujo crítico «Dinero: wallet» (`docs/checkpoints-proyecto.md`). |
| 2026-11-11 | Tamaño | Los correos salen a SLT-132 para que quepa en el tope del PR (humano). |
