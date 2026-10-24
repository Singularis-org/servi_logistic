-- DOWN (SL-32, R21): quita el indice de un solo superadmin y la fila `superadmin` de `rol`.
--
-- Si existe el superadmin, ABORTA antes de tocar nada: borrar la fila de `rol` exigiria borrar
-- tambien al usuario, y eso no lo decide un rollback. Primero se retira ese usuario a mano.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "usuario"
    WHERE "rol_id" = 'e070603f-a477-466f-8bc1-92fcfaceb6f4'
  ) THEN
    RAISE EXCEPTION 'hay un usuario superadmin; retiralo antes de revertir 20261023100100_seed_rol_superadmin';
  END IF;
END $$;

DROP INDEX "usuario_un_solo_superadmin";

DELETE FROM "rol" WHERE "id" = 'e070603f-a477-466f-8bc1-92fcfaceb6f4';

COMMIT;
