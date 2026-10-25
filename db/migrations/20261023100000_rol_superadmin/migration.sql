-- SL-32 (R1, R2): añade el 7.º valor al enum `rol_value`, el rol de la plataforma `superadmin`.
--
-- Va sola, y la fila de `rol` se siembra en la siguiente (20261023100100_seed_rol_superadmin):
-- Postgres no deja USAR un valor de enum en la misma transaccion que lo añade (55P04), y Prisma
-- corre cada migration.sql en una transaccion. Mismo precedente que 20260716140000_rol_api_key.
--
-- Aditiva: no altera ninguna tabla.
ALTER TYPE "rol_value" ADD VALUE IF NOT EXISTS 'superadmin';
