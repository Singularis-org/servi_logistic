-- DOWN de SLT-89 (design §2.5, R33) — revierte 20261110130000_slt89_zona_nodo.
--
-- ORDEN: va DESPUÉS del down de 20261110130100 (el valor de enum, que se queda).
--
-- ⚠️ DESTRUCTIVO para lo que se haya escrito en las tablas nuevas: las asignaciones de zonas a nodos
-- que no son distritos y los miembros de grupo que no son distritos asignados. Tras la bajada esas
-- zonas dejan de cubrir esos lugares. Con las tablas vacías (Costa Rica) no se pierde nada.
--
-- El trigger nuevo de `grupo_distritos_distrito` se suelta antes que la tabla que consulta; el resto
-- de triggers, políticas, índices y FK se van con cada tabla. `orden_nodo_geografico` vuelve al
-- cuerpo de SLT-43 (20261104120400) CARÁCTER POR CARÁCTER: la ida y vuelta compara su definición.

BEGIN;

DROP TRIGGER "grupo_distritos_distrito_sin_duplicado" ON "grupo_distritos_distrito";
DROP FUNCTION grupo_distritos_distrito_sin_duplicado();

DROP TABLE "grupo_distritos_nodo";
DROP TABLE "zona_nodo";

DROP FUNCTION grupo_distritos_nodo_valido();
DROP FUNCTION zona_nodo_valido();

CREATE OR REPLACE FUNCTION orden_nodo_geografico() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.nodo_geografico_id := COALESCE(NEW.distrito_id, NEW.canton_id);
  RETURN NEW;
END $$;

COMMIT;
