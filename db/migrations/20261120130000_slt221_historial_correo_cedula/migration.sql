-- SLT-221 (PR 1) — el Histórico de acciones admite el cambio de cédula y el de correo de un usuario.
--
-- 1) DOS VALORES DE ENUM, JUNTOS: `usuario_cedula_cambiada` (lo escribe `UserRepository.update` en este
--    PR) y `usuario_email_cambiado` (su escritor llega en el PR 2 de la misma ficha). Una sola migración
--    de enum porque su `down.sql` es caro: recrea el tipo. Postgres permite AÑADIR un valor dentro de la
--    transacción de Prisma Migrate; lo que prohíbe es USARLO en ella (55P04), y aquí no se usa.
--
-- 2) `valor_anterior`/`valor_nuevo` PASAN DE 60 A 254 (D10): el correo (hasta 254) y el documento de un
--    usuario caben enteros, sin recortar (R1608). Ensanchar un `varchar` no reescribe la tabla.
--    Comprobado con `pg_depend` el 2026-11-19: ninguna vista depende de esas dos columnas.
--
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'usuario_cedula_cambiada';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'usuario_email_cambiado';

ALTER TABLE "historial_accion"
  ALTER COLUMN "valor_anterior" TYPE varchar(254),
  ALTER COLUMN "valor_nuevo" TYPE varchar(254);
