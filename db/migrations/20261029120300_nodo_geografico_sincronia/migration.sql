-- SLT-43 (design §2.3; R15–R18) — la geografía vieja sigue siendo la que la app escribe; estos
-- triggers copian cada cambio de `provincia`, `canton` y `distrito` a su nodo, en la misma
-- transacción.
--
--   · AFTER y no BEFORE: así se ve el `pais_id` que ya puso `geografia_pais_del_padre` (SL-20), que
--     no se toca (R18). Si la escritura vieja falla, la sincronía no llega a correr.
--   · Upsert por id: una alta crea el nodo y un UPDATE de una fila cuyo nodo faltara lo crea; el
--     `WHERE` del DO UPDATE no escribe nada si el nodo ya está igual (un UPDATE de `zona_id` de una
--     provincia, por ejemplo, no toca su nodo).
--   · Un error del modelo nuevo (un único de 20261029120200) tumba la escritura vieja entera con el
--     mismo SQLSTATE: a SL-20 le llega como el P2002 de siempre (design §2.3).
--   · DELETE borra el nodo. El orden en cascada funciona solo: las acciones de las FK viejas
--     (`zona_distrito`, `distrito_zona_especial`, `orden.distrito_id`) son triggers `RI_…`, que se
--     disparan antes que estos por orden de nombre, y la geografía vieja se borra de abajo arriba
--     (sus FK hacia el padre son RESTRICT), así que el nodo hijo ya no está cuando cae el del padre.
--   · No escriben historial (R18): el de la geografía lo sigue escribiendo `GeoRepository`.
--   · SECURITY DEFINER con `search_path` fijo (precedente 20261026130300): `servi_app` no escribe en
--     `nodo_geografico`, y la sincronía tiene que poder hacerlo sea quien sea el que escribe.
--
-- Una función por tabla (design §2.3): cada una sabe su profundidad, su padre y su tipo sin ramas.
-- El tipo se busca con una subconsulta escalar: si un país no tuviera su `nivel_N` (lo crea siempre
-- `pais_tipos_de_nivel`), el NOT NULL de `tipo_id` lo grita en vez de dejar la geografía sin nodo.
-- `nombre_normalizado` y `ruta` van con un valor cualquiera: los pisa el trigger de invariantes del
-- nodo, que es el único que los calcula.
--
-- Solo aditiva (R19). A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

CREATE FUNCTION geo_sincronizar_provincia() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM nodo_geografico WHERE id = OLD.id;
    RETURN NULL;
  END IF;

  INSERT INTO nodo_geografico AS n
      (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial, activo, ruta)
  VALUES (NEW.id, NEW.pais_id,
          (SELECT t.id FROM tipo_nivel_geografico t WHERE t.pais_id = NEW.pais_id AND t.clave = 'nivel_1'),
          NULL, 1, NEW.nombre, '', NEW.codigo_dta, NEW.activo, ARRAY[NEW.id])
  ON CONFLICT (id) DO UPDATE
    SET pais_id = EXCLUDED.pais_id, tipo_id = EXCLUDED.tipo_id, padre_id = EXCLUDED.padre_id,
        profundidad = EXCLUDED.profundidad, nombre = EXCLUDED.nombre,
        codigo_oficial = EXCLUDED.codigo_oficial, activo = EXCLUDED.activo
    WHERE (n.pais_id, n.tipo_id, n.padre_id, n.profundidad, n.nombre, n.codigo_oficial, n.activo)
          IS DISTINCT FROM
          (EXCLUDED.pais_id, EXCLUDED.tipo_id, EXCLUDED.padre_id, EXCLUDED.profundidad, EXCLUDED.nombre,
           EXCLUDED.codigo_oficial, EXCLUDED.activo);
  RETURN NULL;
END $$;

CREATE FUNCTION geo_sincronizar_canton() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM nodo_geografico WHERE id = OLD.id;
    RETURN NULL;
  END IF;

  INSERT INTO nodo_geografico AS n
      (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial, activo, ruta)
  VALUES (NEW.id, NEW.pais_id,
          (SELECT t.id FROM tipo_nivel_geografico t WHERE t.pais_id = NEW.pais_id AND t.clave = 'nivel_2'),
          NEW.provincia_id, 2, NEW.nombre, '', NEW.codigo_dta, NEW.activo, ARRAY[NEW.id])
  ON CONFLICT (id) DO UPDATE
    SET pais_id = EXCLUDED.pais_id, tipo_id = EXCLUDED.tipo_id, padre_id = EXCLUDED.padre_id,
        profundidad = EXCLUDED.profundidad, nombre = EXCLUDED.nombre,
        codigo_oficial = EXCLUDED.codigo_oficial, activo = EXCLUDED.activo
    WHERE (n.pais_id, n.tipo_id, n.padre_id, n.profundidad, n.nombre, n.codigo_oficial, n.activo)
          IS DISTINCT FROM
          (EXCLUDED.pais_id, EXCLUDED.tipo_id, EXCLUDED.padre_id, EXCLUDED.profundidad, EXCLUDED.nombre,
           EXCLUDED.codigo_oficial, EXCLUDED.activo);
  RETURN NULL;
END $$;

CREATE FUNCTION geo_sincronizar_distrito() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM nodo_geografico WHERE id = OLD.id;
    RETURN NULL;
  END IF;

  INSERT INTO nodo_geografico AS n
      (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial, activo, ruta)
  VALUES (NEW.id, NEW.pais_id,
          (SELECT t.id FROM tipo_nivel_geografico t WHERE t.pais_id = NEW.pais_id AND t.clave = 'nivel_3'),
          NEW.canton_id, 3, NEW.nombre, '', NEW.codigo_dta, NEW.activo, ARRAY[NEW.id])
  ON CONFLICT (id) DO UPDATE
    SET pais_id = EXCLUDED.pais_id, tipo_id = EXCLUDED.tipo_id, padre_id = EXCLUDED.padre_id,
        profundidad = EXCLUDED.profundidad, nombre = EXCLUDED.nombre,
        codigo_oficial = EXCLUDED.codigo_oficial, activo = EXCLUDED.activo
    WHERE (n.pais_id, n.tipo_id, n.padre_id, n.profundidad, n.nombre, n.codigo_oficial, n.activo)
          IS DISTINCT FROM
          (EXCLUDED.pais_id, EXCLUDED.tipo_id, EXCLUDED.padre_id, EXCLUDED.profundidad, EXCLUDED.nombre,
           EXCLUDED.codigo_oficial, EXCLUDED.activo);
  RETURN NULL;
END $$;

CREATE TRIGGER "provincia_sincroniza_nodo_geografico"
  AFTER INSERT OR UPDATE OR DELETE ON "provincia"
  FOR EACH ROW EXECUTE FUNCTION geo_sincronizar_provincia();
CREATE TRIGGER "canton_sincroniza_nodo_geografico"
  AFTER INSERT OR UPDATE OR DELETE ON "canton"
  FOR EACH ROW EXECUTE FUNCTION geo_sincronizar_canton();
CREATE TRIGGER "distrito_sincroniza_nodo_geografico"
  AFTER INSERT OR UPDATE OR DELETE ON "distrito"
  FOR EACH ROW EXECUTE FUNCTION geo_sincronizar_distrito();

COMMIT;
