# SLT-60 — confirmar-pago-plataforma · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SL-45 «Pago a la plataforma desde la wallet», SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes» · **Rama** `feature/SLT-60-confirmar-pago-plataforma`
>
> **Alcance.** El pago a la plataforma que la empresa registra en su wallet (SL-45) queda «Por confirmar»: la
> caja baja al registrar, pero la deuda no baja hasta que el superadmin lo confirme. Solo se pagan facturas
> **cerradas**: el tope de registro es el saldo de las facturas cerradas menos los pagos por confirmar. En el
> detalle de la empresa (Plataforma > Empresas), el superadmin ve los pagos por confirmar y los confirma
> repartiéndolos entre una o varias facturas cerradas, con pago parcial (el sistema propone las más viejas
> primero). Una factura queda pagada cuando su saldo llega a 0. La empresa anula su pago solo mientras está por
> confirmar. Empresas muestra el contador de pagos por confirmar.
>
> **Lo que NO entra.**
> - Rechazar un pago con motivo y mostrar el estado de cada pago en la wallet: SLT-142 «Rechazo del pago a la plataforma
>   y su estado en la wallet» (sale de este corte).
> - Que el superadmin registre un pago hecho por fuera y anule un pago confirmado: SLT-143 «El superadmin registra un pago
>   hecho por fuera y anula un pago confirmado» (sale de este corte).
> - Los correos al superadmin y al maestro: SLT-132 «Correos del pago a la plataforma».
> - El período de gracia, la mora y la operación congelada: SLT-121 «Planes: plazo de pago de la factura y
>   operación congelada por mora».
> - Las pantallas de lista y detalle de facturas: SLT-119 «Planes: pantallas de facturas para el superadmin y
>   el maestro».
> - Cobrar de verdad (pasarela, conciliación bancaria): sigue fuera, como en SL-45.
> - Absorbe SLT-131 «Planes: el superadmin marca pagada la factura de un ciclo», cancelada el 2026-11-11.
>
> Sembrado por `/afinar-feature` el 2026-11-11 y acotado el 2026-11-13 (corte en tres por tamaño). El bloque de
> Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no
> los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **Quién pinta el saldo de la factura.** SLT-119 «Planes: pantallas de facturas para el superadmin y el
  maestro» (en vuelo, misma persona) también toca el detalle de la empresa y la lectura de facturas. Esta ficha
  necesita el saldo de cada factura cerrada para proponer el reparto. spec_author decide en el design dónde vive
  el cálculo del saldo y anota el cruce de archivos con SLT-119; no se reabre con el humano salvo que choque.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-11 | SLT-60 y SLT-131 se pisan | Un solo flujo: el pago de la wallet se confirma y se reparte entre facturas. SLT-131 se cancela (humano). |
| 2026-11-11 | ¿Cuándo baja la caja de la empresa? | **Al registrar**: el dinero ya salió. La deuda baja solo al confirmar (humano). |
| 2026-11-11 | Pagos registrados antes de esta feature | Quedan confirmados (humano). **2026-11-13:** en producción no hay pagos registrados y solo existe el período en curso: no hace falta aplicarlos a facturas. Comprobación antes del deploy: contar los pagos en prod; con más de 0, se decide (humano). |
| 2026-11-11 | ¿Cómo se aplica un pago a las facturas? | A **una o varias** facturas y se admite **pago parcial**. El sistema propone las más viejas primero y el superadmin ajusta. Ejemplo: un pago de 300 000 contra la factura 1–15 nov (200 000, queda pagada) y la 16–30 nov (100 000, queda con saldo de 80 000). Una factura queda pagada cuando su saldo llega a 0 (humano). |
| 2026-11-13 | Pago mayor que el saldo de las facturas cerradas | **Solo se pagan facturas cerradas, sin excedentes.** No se confirma más que el saldo de las cerradas, y la factura en curso no recibe pagos (humano). |
| 2026-11-13 | Tope al registrar | Saldo de las facturas **cerradas** menos los pagos **por confirmar**. Ejemplo: tiene cerradas por 380 000 y 200 000 por confirmar, así que puede registrar hasta 180 000. Sin facturas cerradas, no puede registrar. Ajusta la decisión del 2026-11-11 (deuda menos pagos vigentes) y D4 de SL-45 (humano). |
| 2026-11-11 | ¿Cuándo anula la empresa su propio pago? | **Solo mientras está «Por confirmar»**. Una vez confirmado, solo lo toca el superadmin (humano). |
| 2026-11-13 | Corte por tamaño | Tres fichas: esta (confirmar y repartir), SLT-142 «Rechazo del pago a la plataforma y su estado en la wallet» y SLT-143 «El superadmin registra un pago hecho por fuera y anula un pago confirmado» (humano). |
| 2026-11-11 | Avisos | En esta ficha, **solo en la app**: contador de «pagos por confirmar» en Empresas. El estado de cada pago en la wallet va a SLT-142. Los correos van a SLT-132 (humano). |
| 2026-11-11 | Datos del pago | Heredados de SL-45: monto, fecha, referencia y comprobante opcional. |
| 2026-11-11 | Quién registra en la empresa | Heredado de SL-45 D5: `maestro` y `admin`. Confirmar y repartir: solo el superadmin. |
| 2026-11-11 | Libro y categoría | Heredado de SL-45 D6, D8 y D13: categoría `egreso_pago_plataforma`, anulación por contra-asiento con motivo y libro append-only en la base. |
| 2026-11-11 | Deuda | Heredada de SLT-118: cargos − reversos + cuotas de facturas cerradas − pagos, pero ahora solo cuentan los pagos **confirmados**. |
| 2026-11-11 | E2E | Obligatorio: toca el flujo crítico «Dinero: wallet» (`docs/checkpoints-proyecto.md`). |
| 2026-11-11 | Tamaño | Los correos salen a SLT-132 para que quepa en el tope del PR (humano). |
