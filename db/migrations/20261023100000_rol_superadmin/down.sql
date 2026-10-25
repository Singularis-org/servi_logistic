-- DOWN (SL-32, R21): Postgres no tiene `ALTER TYPE ... DROP VALUE`, asi que el tipo se RECREA sin
-- 'superadmin'. Patron de 20260716140000_rol_api_key/down.sql, con una diferencia: desde entonces
-- `rol_value` lo usan mas columnas que `rol.value` (`actor_rol` de los historiales, `rol_autor`,
-- `destinatario_rol`, ...). Por eso las columnas se buscan en el catalogo en vez de listarlas: una
-- lista a mano dejaria el `DROP TYPE` fallando en cuanto otra feature use el tipo.
--
-- Precondicion: ninguna fila con 'superadmin' en esas columnas. La fila de `rol` la borra antes el
-- down.sql de 20261023100100_seed_rol_superadmin (orden inverso). Si quedara alguna, el cast
-- `::text::"rol_value"` falla RUIDOSAMENTE y el rollback aborta sin cambiar nada.
--
-- La lista de valores es la del enum ANTES de esta migracion:
--   maestro | admin | mensajero | 'Admin Tienda' (@map adminTienda) | adminSatelite | apiKey
BEGIN;

ALTER TYPE "rol_value" RENAME TO "rol_value_old";
CREATE TYPE "rol_value" AS ENUM ('maestro', 'admin', 'mensajero', 'Admin Tienda', 'adminSatelite', 'apiKey');

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT n.nspname AS esquema, t.relname AS tabla, a.attname AS columna
    FROM pg_attribute a
    JOIN pg_class t ON t.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE a.atttypid = '"rol_value_old"'::regtype
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND t.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE "rol_value" USING (%I::text::"rol_value")',
      c.esquema, c.tabla, c.columna, c.columna
    );
  END LOOP;
END $$;

DROP TYPE "rol_value_old";

COMMIT;
