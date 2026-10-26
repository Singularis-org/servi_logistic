-- SL-20 (design §2.2, §3; R4, R5, R7, R10) — el país de cada empresa, fijado en el alta.
--
-- ORDEN (decisión F2.1 del 2026-10-26, opción A, enmienda el design §3): corre ANTES que
-- 20261026120200_geografia_por_pais, porque las políticas `*_del_pais` de esa migración leen
-- `organizacion.pais_id`. Con el orden original del design la 120100 fallaba con 42703.
--
-- El `DEFAULT 'CR'` hace el backfill de las empresas que ya existen (R5) y deja en Costa Rica a los
-- tests y al SQL a mano que crean empresas sin conocer el país (R10). La app no depende de él: el alta
-- exige `paisId` por zod (R6, T2.2).
--
-- El país no cambia nunca (R7). Lo impide un trigger y no un privilegio porque tiene que valer también
-- para el dueño de las tablas: el superadmin (`comoPlataforma`) y el SQL a mano corren como dueño, y a
-- ellos ni el REVOKE ni la RLS les alcanzan.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

ALTER TABLE "organizacion" ADD COLUMN "pais_id" TEXT NOT NULL DEFAULT 'CR';

ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_pais_id_fkey"
  FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "organizacion_pais_id_idx" ON "organizacion"("pais_id");

CREATE FUNCTION organizacion_pais_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pais_id IS DISTINCT FROM OLD.pais_id THEN
    RAISE EXCEPTION 'el país de una empresa no cambia (organizacion %)', OLD.id USING ERRCODE = 'SL020';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "organizacion_pais_inmutable" BEFORE UPDATE OF "pais_id" ON "organizacion"
  FOR EACH ROW EXECUTE FUNCTION organizacion_pais_inmutable();
