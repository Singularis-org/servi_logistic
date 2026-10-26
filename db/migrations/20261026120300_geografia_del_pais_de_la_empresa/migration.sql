-- SL-20 (design §2.5, §3; R13, R38) — una empresa solo apunta a geografía de su país.
--
-- La RLS de 20261026120200 hace que una empresa no VEA la geografía de otro país, pero una FK no pasa
-- por la RLS: un id de otro país enviado a mano (API, corrección de datos, SQL) entraría. Este trigger
-- lo cierra en las tres tablas de negocio que apuntan a la geografía:
--   · `orden`: provincia, cantón y distrito (el distrito es opcional, R14: un NULL no se mira);
--   · `zona_distrito` y `distrito_zona_especial` (la marca de zona especial, R38): el distrito.
--
-- SECURITY DEFINER con `search_path` fijo (precedente: `verificar_misma_empresa`, SL-17 M3): como
-- `servi_app`, la RLS le escondería justo los nodos de otro país y el trigger los daría por
-- inexistentes. Un nodo inexistente no se mira aquí: lo rechaza su FK.
--
-- Se dispara solo cuando cambia una columna de geografía (`UPDATE OF`): el resto de escrituras de
-- `orden` no pagan la consulta. El cambio de empresa ya lo impide `*_sin_cambio_de_empresa` (SL017).
--
-- SQLSTATE SL021. `lib/db/errores-pais.ts` lo traduce a `GeografiaDeOtroPais`.

BEGIN;

CREATE FUNCTION geografia_del_pais_de_la_empresa() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pais_empresa text;
  v_columna text;
BEGIN
  SELECT o.pais_id INTO v_pais_empresa FROM organizacion o WHERE o.id = NEW.organizacion_id;
  -- Sin empresa no hay país con que comparar; la fila la rechaza su NOT NULL o su FK.
  IF v_pais_empresa IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'orden' THEN
    IF NEW.provincia_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM provincia p WHERE p.id = NEW.provincia_id AND p.pais_id <> v_pais_empresa) THEN
      v_columna := 'provincia_id';
    ELSIF NEW.canton_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM canton c WHERE c.id = NEW.canton_id AND c.pais_id <> v_pais_empresa) THEN
      v_columna := 'canton_id';
    ELSIF NEW.distrito_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM distrito d WHERE d.id = NEW.distrito_id AND d.pais_id <> v_pais_empresa) THEN
      v_columna := 'distrito_id';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM distrito d WHERE d.id = NEW.distrito_id AND d.pais_id <> v_pais_empresa) THEN
    v_columna := 'distrito_id';
  END IF;

  IF v_columna IS NOT NULL THEN
    RAISE EXCEPTION 'geografía de otro país: %.% no es del país % de la empresa', TG_TABLE_NAME, v_columna, v_pais_empresa
      USING ERRCODE = 'SL021';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "orden_geografia_del_pais_de_la_empresa"
  BEFORE INSERT OR UPDATE OF "provincia_id", "canton_id", "distrito_id" ON "orden"
  FOR EACH ROW EXECUTE FUNCTION geografia_del_pais_de_la_empresa();
CREATE TRIGGER "zona_distrito_geografia_del_pais_de_la_empresa"
  BEFORE INSERT OR UPDATE OF "distrito_id" ON "zona_distrito"
  FOR EACH ROW EXECUTE FUNCTION geografia_del_pais_de_la_empresa();
CREATE TRIGGER "distrito_zona_especial_geografia_del_pais_de_la_empresa"
  BEFORE INSERT OR UPDATE OF "distrito_id" ON "distrito_zona_especial"
  FOR EACH ROW EXECUTE FUNCTION geografia_del_pais_de_la_empresa();

COMMIT;
