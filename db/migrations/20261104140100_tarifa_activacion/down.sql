-- DOWN de SLT-54 T1.1 — revierte 20261104140100_tarifa_activacion.
--
-- ORDEN: va ANTES del down de 20261104140000 (los downs van en orden inverso).
--
-- ⚠️ CONSECUENCIA: el codigo que se baja decide por la existencia de valores. Toda empresa con valores
-- queda en el modelo nuevo y toda empresa sin valores en el viejo; una empresa activada SIN valores
-- vuelve a la vieja, y una NO activada con valores pasa a la nueva. Conviene medirlo antes de bajar
-- (design §2.3). No se aborta: la fila no guarda dinero y lo congelado de los cierres no se toca.
--
-- La politica, los triggers, los indices y las FK se van con la tabla.

DROP TABLE "tarifa_activacion";
