-- SLT-46 (design §2.2; R2–R7) — el nodo pasa a ser la fuente: cada escritura de un nodo de
-- profundidad 1, 2 o 3 se copia, en la misma sentencia, a su fila de `provincia`, `canton` o
-- `distrito` con el mismo id. Los nodos de profundidad 4 o más no tienen fila vieja (R3).
--
--   · AFTER: la fila del nodo ya pasó su trigger de invariantes (SLT-43) y sus únicos. Si la copia
--     falla (un único literal de la tabla vieja, una FK), falla toda la sentencia con el mismo
--     SQLSTATE: ni nodo, ni fila vieja, ni historial (R5; un 23505 llega a la action como P2002).
--   · Upsert por id con `WHERE … IS DISTINCT FROM`: si la fila vieja ya tiene esos valores no se
--     escribe nada (R4). `canton.pais_id` y `distrito.pais_id` los pone `geografia_pais_del_padre`
--     (SL-20, BEFORE), que no se toca; la provincia lleva el país del nodo.
--   · Cambiar la profundidad de un nodo que tiene o tendría 1–3 lo cambiaría de tabla vieja: se
--     rechaza con SQLSTATE propio `SLT46` (R6). Casi siempre lo frena antes el invariante de SLT-43
--     (un nodo con hijos no cambia de profundidad); esto cubre la hoja.
--   · DELETE (solo SQL a mano o limpieza de tests: la app nunca borra) borra la fila vieja (R7).
--
-- CONVIVENCIA con la sincronía vieja → nodo de SLT-43 (`geo_sincronizar_*`, 20261104120300), que NO
-- se toca (R4). Cada lado recibe el eco del otro y lo encuentra igual:
--   1. La app escribe el nodo → esta copia escribe la fila vieja → la sincronía hace su upsert del
--      nodo, lo encuentra idéntico y, por su `WHERE … IS DISTINCT FROM`, no actualiza: fin.
--   2. Alguien escribe la fila vieja por SQL → la sincronía actualiza el nodo → esta copia hace su
--      upsert de la fila vieja, que ya tiene esos valores: no actualiza, fin.
--   3. En los DELETE, el segundo lado ya no encuentra la fila y borra 0.
-- La condición es que el `tipo_id` del nodo sea el `nivel_<profundidad>` de su país (P1, design
-- §2.1): la sincronía vieja pone siempre ese tipo. Un nodo de profundidad 1–3 con OTRO tipo solo
-- puede nacer por SQL a mano, y el eco lo devolvería al tipo de su profundidad.
--
-- SECURITY DEFINER con `search_path` fijo, como la sincronía de SLT-43: escribe tablas de plataforma
-- sea quien sea el que escribe el nodo (hoy, el dueño en `comoPlataforma`; `servi_app` no puede, R41).
--
-- La migración no copia datos: la geografía vieja y los nodos ya son iguales (SLT-43 R13, R15). No
-- toca `orden` (R10). `CREATE TRIGGER` toma SHARE ROW EXCLUSIVE sobre `nodo_geografico` (≈600 filas
-- por país, la escribe solo el superadmin).
--
-- Solo aditiva (R8). A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

CREATE FUNCTION geo_copiar_nodo_a_geografia_vieja() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.profundidad = 1 THEN
      DELETE FROM provincia WHERE id = OLD.id;
    ELSIF OLD.profundidad = 2 THEN
      DELETE FROM canton WHERE id = OLD.id;
    ELSIF OLD.profundidad = 3 THEN
      DELETE FROM distrito WHERE id = OLD.id;
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.profundidad <> OLD.profundidad
     AND least(NEW.profundidad, OLD.profundidad) <= 3 THEN
    RAISE EXCEPTION 'nodo_geografico %: no puede pasar de profundidad % a %: cambiaria de tabla en la geografia vieja',
      NEW.id, OLD.profundidad, NEW.profundidad
      USING ERRCODE = 'SLT46';
  END IF;

  IF NEW.profundidad = 1 THEN
    INSERT INTO provincia AS v (id, nombre, codigo_dta, activo, pais_id)
    VALUES (NEW.id, NEW.nombre, NEW.codigo_oficial, NEW.activo, NEW.pais_id)
    ON CONFLICT (id) DO UPDATE
      SET nombre = EXCLUDED.nombre, codigo_dta = EXCLUDED.codigo_dta, activo = EXCLUDED.activo
      WHERE (v.nombre, v.codigo_dta, v.activo)
            IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.codigo_dta, EXCLUDED.activo);
  ELSIF NEW.profundidad = 2 THEN
    INSERT INTO canton AS v (id, nombre, provincia_id, codigo_dta, activo)
    VALUES (NEW.id, NEW.nombre, NEW.padre_id, NEW.codigo_oficial, NEW.activo)
    ON CONFLICT (id) DO UPDATE
      SET nombre = EXCLUDED.nombre, provincia_id = EXCLUDED.provincia_id,
          codigo_dta = EXCLUDED.codigo_dta, activo = EXCLUDED.activo
      WHERE (v.nombre, v.provincia_id, v.codigo_dta, v.activo)
            IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.provincia_id, EXCLUDED.codigo_dta, EXCLUDED.activo);
  ELSIF NEW.profundidad = 3 THEN
    INSERT INTO distrito AS v (id, nombre, canton_id, codigo_dta, activo)
    VALUES (NEW.id, NEW.nombre, NEW.padre_id, NEW.codigo_oficial, NEW.activo)
    ON CONFLICT (id) DO UPDATE
      SET nombre = EXCLUDED.nombre, canton_id = EXCLUDED.canton_id,
          codigo_dta = EXCLUDED.codigo_dta, activo = EXCLUDED.activo
      WHERE (v.nombre, v.canton_id, v.codigo_dta, v.activo)
            IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.canton_id, EXCLUDED.codigo_dta, EXCLUDED.activo);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "nodo_geografico_copia_a_geografia_vieja"
  AFTER INSERT OR UPDATE OF "nombre", "codigo_oficial", "activo", "padre_id", "profundidad" OR DELETE
  ON "nodo_geografico"
  FOR EACH ROW EXECUTE FUNCTION geo_copiar_nodo_a_geografia_vieja();

COMMIT;
