-- DOWN de SLT-52 T1.1 — quita los cinco enums del modelo nuevo de tarifas.
--
-- ORDEN: va DESPUES del down de 20261103120100_tarifas_flexibles_tablas, que suelta las columnas que
-- los usan. Sin IF EXISTS a proposito: si una columna aun usa el tipo, el DROP falla y el rollback se
-- para en vez de dejar un esquema a medias.

DROP TYPE "tarifa_modelo";
DROP TYPE "tarifa_nivel";
DROP TYPE "tarifa_modo";
DROP TYPE "tarifa_concepto";
DROP TYPE "tarifa_actor";
