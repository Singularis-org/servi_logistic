-- SLT-46 — revierte 20261106120100_slt46_nodo_copia_a_geografia_vieja (design §3, R9). Va DESPUÉS
-- del down de 20261106120200 y ANTES del de 20261106120000.
--
-- Solo suelta el trigger y su función: la geografía vieja y los nodos no se tocan (eran iguales por
-- la copia). La sincronía vieja → nodo de SLT-43 sigue puesta y vuelve a ser la única dirección.
-- Tras la vuelta, el código de SLT-46 que escribe el nodo ya no llega a la geografía vieja: el
-- código servido tiene que ser el de antes de SLT-46 (design §10).

BEGIN;

DROP TRIGGER "nodo_geografico_copia_a_geografia_vieja" ON "nodo_geografico";
DROP FUNCTION geo_copiar_nodo_a_geografia_vieja();

COMMIT;
