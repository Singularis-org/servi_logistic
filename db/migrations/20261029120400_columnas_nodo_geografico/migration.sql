-- SLT-43 (design §2.4; R19–R21, R24) — las tablas de negocio que hoy apuntan a la geografía vieja
-- ganan su puntero al nodo, y `cierre_detail` gana el hueco del snapshot.
--
--   · ADD COLUMN nullable y sin DEFAULT: solo toca el catálogo, no reescribe la tabla. Las filas que ya
--     existen quedan NULL hasta que las llene `scripts/geo-backfill-nodo.ts` (design §4).
--   · FK `NOT VALID`: no recorre las filas viejas (todas NULL) ni bloquea `orden` mientras lo haría; sí
--     comprueba cada fila nueva o cambiada. El `VALIDATE` lo hace el script (`--validar`, R24), no una
--     migración: así el deploy no queda atado a que el script haya corrido. Prisma no ve el NOT VALID:
--     el diff sale vacío igual (mismo caso que `orden_clave_remision`).
--   · Los triggers BEFORE no consultan nada: los ids de los nodos son los de la geografía vieja (R13), así
--     que el nodo es la propia FK vieja. El coste por fila es la comprobación de la FK nueva (R22).
--     `nodo_geografico_id` está en la lista de columnas para que nadie la deje distinta de las FK viejas
--     mientras éstas son la fuente: la pisan siempre (SLT-46 lo cambiará).
--   · En `orden`, `canton_id` es NOT NULL: el COALESCE nunca da NULL en una fila escrita. Una orden vieja
--     que solo cambia otras columnas no dispara el trigger (lista de columnas) y su NULL no comprueba FK.
--   · Ningún trigger de los que ya tiene `orden` responde a un UPDATE que solo pone `nodo_geografico_id`
--     (todos llevan lista de columnas sin ella; design §2.4, R30).
--   · ON DELETE: `orden` RESTRICT, como sus FK de geografía; las de zona CASCADE, como su `distrito_id`.
--     Cuando la app (o un test) borra un distrito, las acciones de las FK viejas corren antes que la
--     sincronía (design §2.3): la orden pasa a `distrito_id` NULL, su trigger la mueve al cantón, y las
--     filas de zona ya no están cuando cae el nodo.
--   · FK de negocio → plataforma, como `orden.provincia_id`: sin trigger de misma empresa
--     (`fk-misma-empresa.guardia` solo mira FK entre modelos de negocio).
--   · Sin trigger en `cierre_detail` (decisión 2026-10-29, R40): la columna la llena solo el script.
--   · Sin índices aquí: van en 20261029120500, para aislar el bloqueo largo sobre `orden`.
--
-- Solo aditiva (R19). A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

ALTER TABLE "orden" ADD COLUMN "nodo_geografico_id" TEXT;
ALTER TABLE "zona_distrito" ADD COLUMN "nodo_geografico_id" TEXT;
ALTER TABLE "distrito_zona_especial" ADD COLUMN "nodo_geografico_id" TEXT;
ALTER TABLE "cierre_detail" ADD COLUMN "ubicacion_snapshot" JSONB;

ALTER TABLE "orden" ADD CONSTRAINT "orden_nodo_geografico_id_fkey"
  FOREIGN KEY ("nodo_geografico_id") REFERENCES "nodo_geografico"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "zona_distrito" ADD CONSTRAINT "zona_distrito_nodo_geografico_id_fkey"
  FOREIGN KEY ("nodo_geografico_id") REFERENCES "nodo_geografico"("id")
  ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "distrito_zona_especial" ADD CONSTRAINT "distrito_zona_especial_nodo_geografico_id_fkey"
  FOREIGN KEY ("nodo_geografico_id") REFERENCES "nodo_geografico"("id")
  ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

CREATE FUNCTION orden_nodo_geografico() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.nodo_geografico_id := COALESCE(NEW.distrito_id, NEW.canton_id);
  RETURN NEW;
END $$;

-- Una sola función para las dos tablas de zona: las dos tienen `distrito_id` NOT NULL.
CREATE FUNCTION zona_nodo_geografico_del_distrito() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.nodo_geografico_id := NEW.distrito_id;
  RETURN NEW;
END $$;

CREATE TRIGGER "orden_nodo_geografico"
  BEFORE INSERT OR UPDATE OF "provincia_id", "canton_id", "distrito_id", "nodo_geografico_id" ON "orden"
  FOR EACH ROW EXECUTE FUNCTION orden_nodo_geografico();
CREATE TRIGGER "zona_distrito_nodo_geografico"
  BEFORE INSERT OR UPDATE OF "distrito_id", "nodo_geografico_id" ON "zona_distrito"
  FOR EACH ROW EXECUTE FUNCTION zona_nodo_geografico_del_distrito();
CREATE TRIGGER "distrito_zona_especial_nodo_geografico"
  BEFORE INSERT OR UPDATE OF "distrito_id", "nodo_geografico_id" ON "distrito_zona_especial"
  FOR EACH ROW EXECUTE FUNCTION zona_nodo_geografico_del_distrito();

COMMIT;
