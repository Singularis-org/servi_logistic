-- SL-20 (enmienda 2026-10-26, decisión 6; design §2.1, §2.6, §3; R44, R45, R46, R47) — si un país
-- tiene cobertura.
--
-- `pais.disponible`: con `false`, el país no se ofrece ni se acepta en un alta NUEVA de empresa (R45,
-- lo frena `OrganizacionRepository.altaEmpresa`); las empresas que ya están en él siguen igual (R46):
-- nada de la RLS ni de los triggers de la geografía lee esta columna.
--   · `NOT NULL DEFAULT true`: Costa Rica, el único país que hay, queda disponible, y un país nuevo
--     nace disponible salvo que se diga lo contrario (R44).
--   · No toca la RLS ni el `REVOKE INSERT, UPDATE, DELETE … FROM servi_app` de 20261026130000: una
--     empresa sigue sin poder cambiar la columna (R3).
--
-- `historial_plataforma_accion` gana los dos valores con los que el superadmin deja rastro del cambio
-- (R47). Nada aquí escribe filas con ellos: Postgres prohíbe USAR un valor de enum en la misma
-- transacción que lo añade (55P04), y el primer uso es en runtime.

BEGIN;

ALTER TABLE "pais" ADD COLUMN "disponible" BOOLEAN NOT NULL DEFAULT true;

ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'pais_disponibilidad_activada';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'pais_disponibilidad_desactivada';

COMMIT;
