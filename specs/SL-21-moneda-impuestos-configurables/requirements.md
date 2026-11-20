# SL-21 — moneda-impuestos-configurables · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SL-20 · **Rama:** `feature/SL-21-moneda-impuestos-configurables`
>
> **Alcance:** cada país guarda su moneda (código, símbolo, separador de miles, separador
> decimal y cuántos decimales usa) y el nombre de su impuesto. Costa Rica queda cargado por
> migración con CRC, «₡» e «IVA». Lo que arma el servidor toma la moneda y el nombre del
> impuesto del país de la empresa: correos, WhatsApp, PDF de etiquetas y de facturas, y la nota
> «Montos en …». Para Costa Rica nada cambia a la vista.
>
> **Lo que NO entra:**
> - Pantallas de la empresa con su moneda y los textos «IVA» tomados del país → SLT-235
>   «Moneda e impuesto del país en las pantallas de la empresa».
> - Editar moneda e impuesto en «Datos del país» del superadmin → SLT-236 «Datos del país:
>   editar moneda e impuesto» (después de SLT-81).
> - Precio del plan por moneda o país; las facturas de planes siguen en CRC para todas las
>   empresas → SLT-237 «Planes: precio por moneda del país» (relacionada con SLT-229).
> - Céntimos en el monto a cobrar de la carga de órdenes → SLT-238 «Carga de órdenes con
>   céntimos según la moneda del país».
> - Tasa de impuesto por país: la tasa sigue en cada tarifa (SLT-54, SL-39).
> - Métodos de pago y SINPE → SL-22. Fechas con `es-CR` → SLT-92.
>
> Sembrado por `/afinar-feature` el 2026-11-20. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | ¿Qué es «impuestos» en esta ficha? | Solo el nombre del impuesto por país («IVA», «IGV»…). La tasa sigue en cada tarifa, sin valor por defecto (heredado de SLT-54 y SL-39 D6). |
| 2026-11-20 | Corte de la ficha | Datos del país + lo que arma el servidor. Pantallas y textos «IVA» en SLT-235. |
| 2026-11-20 | Dónde se edita | Costa Rica se carga por migración. La edición va a «Datos del país» en SLT-236, después de SLT-81. |
| 2026-11-20 | Moneda de las facturas de planes | Siguen en CRC para todas las empresas. El precio por moneda va a SLT-237. |
| 2026-11-20 | Monedas con céntimos | El país guarda cuántos decimales usa su moneda; la regla del entero en la carga de órdenes no cambia aquí (SLT-238). |
| 2026-11-20 | Patrón | Heredado de SLT-42: columnas en `pais`, relleno de CR en la migración, lectura por el puerto `IReglasPaisEmpresa` y guardia de literales del país. |
| 2026-11-20 | Impuestos en facturas de planes | Sin impuestos, heredado de SLT-118. |
| 2026-11-20 | Nombres internos con «iva» en la base | No se renombran (enums de caja y conceptos del libro). |
| 2026-11-20 | E2E | No hace falta uno nuevo: para Costa Rica la salida es idéntica. Lo cubren tests de integración con un país de prueba y los E2E existentes. |
