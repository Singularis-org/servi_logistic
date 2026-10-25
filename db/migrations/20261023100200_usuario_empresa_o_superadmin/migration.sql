-- SL-32 (R28), contrato de SL-17 (§10): un usuario tiene empresa si y solo si no es el superadmin.
--
-- SL-17 dejo `usuario.organizacion_id` nulable y sin regla porque, cuando corrio su migracion, el rol
-- `superadmin` aun no existia. El `id` del rol va como literal porque un CHECK no admite subconsultas
-- (es el `id` fijo de 20261023100100_seed_rol_superadmin). Las dos caras nunca son NULL: `IS NULL`
-- da verdadero o falso y `rol_id` es NOT NULL, asi que la igualdad no puede quedar indeterminada.
--
-- Postgres la valida contra las filas que ya hay. Una base local con usuarios anteriores a SL-17
-- (con NULL) la hace fallar: esa base se rehace con `pnpm run db:reset` (D9 de SL-17).
--
-- Carpeta propia, y no dentro de la anterior, para revertirla sin tocar el indice de R27.
ALTER TABLE "usuario"
  ADD CONSTRAINT "usuario_empresa_o_superadmin"
  CHECK (("organizacion_id" IS NULL) = ("rol_id" = 'e070603f-a477-466f-8bc1-92fcfaceb6f4'));
