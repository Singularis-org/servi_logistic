-- SL-20 — revierte 20261026130200_geografia_por_pais. Va DESPUÉS del down de
-- 20261026130300_geografia_del_pais_de_la_empresa (su trigger lee `pais_id`) y ANTES del de
-- 20261026130100_organizacion_pais (las políticas `*_del_pais` leen `organizacion.pais_id`).
--
-- ABORTA SI YA HAY UN SEGUNDO PAÍS CON NOMBRES O CÓDIGOS QUE CHOCAN. Los únicos vuelven a ser
-- globales (nombre de provincia, código de cada nivel) y dos países pueden repetirlos: en ese caso el
-- down para con RAISE antes de tocar nada, en vez de fallar a medias o de borrar nodos. Quien
-- revierta tiene que resolver antes los nodos de los otros países (están en `pais_id <> 'CR'`).
--
-- Los nodos de otros países que no choquen se quedan, ya sin país: el down no borra geografía.
-- Las políticas `*_lectura` se vuelven a crear porque el down de 20261022130000 las borra por nombre.

BEGIN;

DO $$
DECLARE
  v_choques text;
BEGIN
  SELECT string_agg(x, '; ') INTO v_choques FROM (
    SELECT 'provincia.nombre ' || quote_literal(nombre) AS x FROM provincia GROUP BY nombre HAVING count(*) > 1
    UNION ALL
    SELECT 'provincia.codigo_dta ' || quote_literal(codigo_dta) FROM provincia WHERE codigo_dta IS NOT NULL GROUP BY codigo_dta HAVING count(*) > 1
    UNION ALL
    SELECT 'canton.codigo_dta ' || quote_literal(codigo_dta) FROM canton WHERE codigo_dta IS NOT NULL GROUP BY codigo_dta HAVING count(*) > 1
    UNION ALL
    SELECT 'distrito.codigo_dta ' || quote_literal(codigo_dta) FROM distrito WHERE codigo_dta IS NOT NULL GROUP BY codigo_dta HAVING count(*) > 1
  ) choques;
  IF v_choques IS NOT NULL THEN
    RAISE EXCEPTION 'rollback SL-20: hay nombres o códigos repetidos entre países (%); se aborta sin tocar nada', v_choques;
  END IF;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────────────────────
DROP POLICY "distrito_del_pais" ON "distrito";
DROP POLICY "canton_del_pais" ON "canton";
DROP POLICY "provincia_del_pais" ON "provincia";
CREATE POLICY "provincia_lectura" ON "provincia" FOR SELECT TO servi_app USING (true);
CREATE POLICY "canton_lectura" ON "canton" FOR SELECT TO servi_app USING (true);
CREATE POLICY "distrito_lectura" ON "distrito" FOR SELECT TO servi_app USING (true);

-- ─── trigger ─────────────────────────────────────────────────────────────────────────────────
DROP TRIGGER "distrito_pais_del_padre" ON "distrito";
DROP TRIGGER "canton_pais_del_padre" ON "canton";
DROP FUNCTION geografia_pais_del_padre();

-- ─── distrito (primero: su FK apunta al único compuesto de canton) ───────────────────────────
ALTER TABLE "distrito" DROP CONSTRAINT "distrito_canton_id_pais_id_fkey";
DROP INDEX "distrito_pais_id_idx";
DROP INDEX "distrito_pais_id_codigo_dta_key";
CREATE UNIQUE INDEX "distrito_codigo_dta_key" ON "distrito"("codigo_dta");
ALTER TABLE "distrito" ADD CONSTRAINT "distrito_canton_id_fkey" FOREIGN KEY ("canton_id")
  REFERENCES "canton"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "distrito" DROP COLUMN "pais_id";

-- ─── canton ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "canton" DROP CONSTRAINT "canton_provincia_id_pais_id_fkey";
DROP INDEX "canton_pais_id_idx";
DROP INDEX "canton_id_pais_id_key";
DROP INDEX "canton_pais_id_codigo_dta_key";
CREATE UNIQUE INDEX "canton_codigo_dta_key" ON "canton"("codigo_dta");
ALTER TABLE "canton" ADD CONSTRAINT "canton_provincia_id_fkey" FOREIGN KEY ("provincia_id")
  REFERENCES "provincia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "canton" DROP COLUMN "pais_id";

-- ─── provincia ───────────────────────────────────────────────────────────────────────────────
DROP INDEX "provincia_id_pais_id_key";
DROP INDEX "provincia_pais_id_codigo_dta_key";
CREATE UNIQUE INDEX "provincia_codigo_dta_key" ON "provincia"("codigo_dta");
DROP INDEX "provincia_pais_id_nombre_key";
CREATE UNIQUE INDEX "provincia_nombre_key" ON "provincia"("nombre");
-- La FK `provincia_pais_id_fkey` cae con la columna.
ALTER TABLE "provincia" DROP COLUMN "pais_id";

COMMIT;
