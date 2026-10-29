-- SLT-43 — revierte 20261029120500_indices_nodo_geografico (R34). Es el primer down de SLT-43: va ANTES
-- del de 20261029120400_columnas_nodo_geografico. Solo suelta índices; no pierde datos.

BEGIN;

DROP INDEX "distrito_zona_especial_nodo_geografico_id_idx";
DROP INDEX "zona_distrito_nodo_geografico_id_idx";
DROP INDEX "orden_nodo_geografico_id_idx";

COMMIT;
