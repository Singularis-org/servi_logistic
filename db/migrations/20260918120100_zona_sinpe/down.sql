-- DOWN (ficha 429) — revierte EXACTAMENTE `migration.sql`: quita las tres columnas de `zona`.
--
-- ⚠️ DATO PERDIDO AL REVERTIR, DECLARADO: los SINPE por bodega y las fechas de revision. Ninguna
-- migracion ni ningun script los reconstruye: son dato de cada empresa y se vuelven a cargar desde
-- la aplicacion. Antes de revertir se mira `historial_accion` con
-- `accion = 'zona_sinpe_cambiado'`.
--
-- `IF EXISTS` en las tres: este `down` tiene que poder correr tambien cuando el `down` de
-- `20260918120200_zona_sinpe_no_nulo` ya quito los `CHECK` y dejo las columnas nullables — que es
-- el orden real de un rollback (`db:rollback` va de la ULTIMA hacia atras).
--
-- NO se toca ninguna otra columna de `zona`, ni la RLS, ni ningun indice.

ALTER TABLE "zona" DROP COLUMN IF EXISTS "sinpe_revisado_at";
ALTER TABLE "zona" DROP COLUMN IF EXISTS "sinpe_nombre";
ALTER TABLE "zona" DROP COLUMN IF EXISTS "sinpe_numero";
