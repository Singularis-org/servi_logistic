-- SLT-225 — la marca «activa» de la zona y lo que la base frena mientras está desactivada.
--
-- 1) COLUMNA (R1740): `NOT NULL DEFAULT true`. Toda zona que ya existe queda activa al migrar y toda
--    zona nueva nace activa: la migración no cambia el comportamiento de ninguna.
--
-- 2) DOS TRIGGERS (R1754, R1755). La app ya rechaza antes (ZonaRepository.update, UsuarioService),
--    pero la carrera «alguien asigna un distrito o un usuario mientras otro desactiva» solo la cierra la
--    base. Los dos leen la zona con `FOR SHARE`: la desactivación toma el bloqueo de fila con su
--    `UPDATE`, así que una de las dos escrituras espera a la otra. Si la desactivación va primero, el
--    trigger ve `activa = false` y rechaza; si la escritura va primero, la desactivación espera su commit
--    y su conteo de impedimentos ya la ve (design §1.2).
--    `SECURITY INVOKER`: corren con los permisos y la RLS de quien escribe (servi_app tiene UPDATE en
--    `zona`, que es lo que pide `FOR SHARE`).
--    `orden` no lleva trigger: una orden solo recibe zona desde `zona_distrito`, y una zona desactivada
--    no tiene distritos ni puede recibirlos.
--
-- SQLSTATE propio `SL225` para que quien lo vea sepa de dónde sale.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.

ALTER TABLE "zona" ADD COLUMN "activa" BOOLEAN NOT NULL DEFAULT true;

CREATE FUNCTION zona_distrito_exige_zona_activa() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_activa boolean;
BEGIN
  SELECT "activa" INTO v_activa FROM "zona" WHERE "id" = NEW."zona_id" FOR SHARE;
  IF v_activa IS FALSE THEN
    RAISE EXCEPTION 'la zona % está desactivada: no recibe distritos', NEW."zona_id"
      USING ERRCODE = 'SL225';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "zona_distrito_exige_zona_activa" BEFORE INSERT OR UPDATE
  ON "zona_distrito" FOR EACH ROW EXECUTE FUNCTION zona_distrito_exige_zona_activa();

-- Solo una elección NUEVA de zona: el usuario que ya la tenía no se rechaza al guardar otra cosa (R1755).
CREATE FUNCTION usuario_zona_exige_activa() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_activa boolean;
BEGIN
  IF NEW."zona_id" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."zona_id" IS NOT DISTINCT FROM OLD."zona_id" THEN
    RETURN NEW;
  END IF;
  SELECT "activa" INTO v_activa FROM "zona" WHERE "id" = NEW."zona_id" FOR SHARE;
  IF v_activa IS FALSE THEN
    RAISE EXCEPTION 'la zona % está desactivada: no se asigna a usuarios', NEW."zona_id"
      USING ERRCODE = 'SL225';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "usuario_zona_exige_activa" BEFORE INSERT OR UPDATE OF "zona_id"
  ON "usuario" FOR EACH ROW EXECUTE FUNCTION usuario_zona_exige_activa();
