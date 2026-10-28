-- SL-38 M2 (design §2.2, R6, R7) — sale la columna global `distrito.zona_especial`.
--
-- La marca es de la empresa (`distrito_zona_especial`, M1). La columna global no tiene informacion
-- en ninguna base desplegada: nacio con DEFAULT false, nadie escribe NULL, y desde SL-17 la empresa
-- no puede escribirla. Si alguna fila la tiene a true, es una base local antigua: se aborta en vez
-- de perder la marca en silencio, y como todo esto corre en la misma transaccion de la migracion,
-- la columna se queda donde estaba.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "distrito" WHERE "zona_especial" IS TRUE) THEN
    RAISE EXCEPTION 'SL-38: hay distritos con zona_especial = true; la marca ahora es por empresa (distrito_zona_especial). Rehaz la base local con pnpm run db:reset.';
  END IF;
END $$;

ALTER TABLE "distrito" DROP COLUMN "zona_especial";
