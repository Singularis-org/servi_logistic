-- SL-32 (R1, R27): siembra la fila `superadmin` del catalogo `rol` y el indice que deja un solo
-- superadmin en toda la base.
--
-- EL `id` ES FIJO, y no un uuid() de la base: el indice parcial de abajo y el CHECK de
-- 20261023100200_usuario_empresa_o_superadmin lo necesitan como literal (ni un indice parcial ni un
-- CHECK admiten subconsultas). El codigo no lo repite: busca el rol por `value`. `seedRoles` hace
-- upsert por `value` con `update: {}`, asi que conserva este `id`.
--
-- Sin filas en `rol_permiso`, igual que `apiKey`: el superadmin no es un rol de empresa.
INSERT INTO "rol" ("id", "value")
VALUES ('e070603f-a477-466f-8bc1-92fcfaceb6f4', 'superadmin')
ON CONFLICT ("value") DO NOTHING;

-- Si la fila ya existia con otro `id` (sembrada a mano o por `seedRoles` antes de esta migracion),
-- el `ON CONFLICT` la deja como esta y el indice quedaria filtrando por un `id` que no tiene nadie:
-- no protegeria nada. Se aborta para que se vea.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "rol"
    WHERE "value" = 'superadmin'
      AND "id" <> 'e070603f-a477-466f-8bc1-92fcfaceb6f4'
  ) THEN
    RAISE EXCEPTION 'rol superadmin existe con otro id; el indice usuario_un_solo_superadmin no lo cubriria';
  END IF;
END $$;

-- R27: un unico superadmin. Indice unico sobre una constante, filtrado por el rol: dos filas con ese
-- `rol_id` chocan en el mismo valor (`true`). Para el INSERT y para el UPDATE que pasaria a alguien a
-- superadmin, venga la escritura de donde venga. Es global a proposito: con `organizacion_id` en la
-- clave, Postgres trataria cada NULL como distinto y dejaria pasar varios.
CREATE UNIQUE INDEX "usuario_un_solo_superadmin" ON "usuario" ((true))
WHERE "rol_id" = 'e070603f-a477-466f-8bc1-92fcfaceb6f4';
