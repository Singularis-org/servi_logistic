-- DOWN de SL-38 M2 (design §2.2, R8) — devuelve la columna con la forma exacta de
-- 20260824180000_distrito_zona_especial: BOOLEAN, nulable y DEFAULT false.
-- Con la precondicion de M2 (ninguna fila en true), `false` es el valor verdadero de todas las filas:
-- el down no inventa nada. Las marcas de las empresas siguen en `distrito_zona_especial` y no vuelven
-- a la columna.

ALTER TABLE "distrito" ADD COLUMN "zona_especial" BOOLEAN DEFAULT false;
