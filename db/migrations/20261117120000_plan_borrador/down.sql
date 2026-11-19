-- DOWN de SLT-129 (design §1.2; R24) — quita el borrador del formulario de planes. La RLS, el REVOKE, los CHECK,
-- el UNIQUE y la FK caen con la tabla; la migración no tocó nada más, así que no hay nada que reponer. Los
-- borradores que hubiera se pierden: ninguno era todavía un plan ni un cambio programado.

BEGIN;

DROP TABLE IF EXISTS "plan_borrador";

COMMIT;
