-- SL-40 (design §3.1, §3.2, §3.4) — lo que la plataforma cobra a cada empresa por orden.
--
-- Dos datos de PLATAFORMA, los dos de solo superadmin:
--   · el valor global, una sola fila en `cobro_plataforma_tarifa`. Que no haya fila quiere decir «sin
--     configurar» (0,00, D11);
--   · la excepción de cada empresa, una columna nulable en `organizacion`. NULL = usa el global.
--
-- Una empresa no los lee ni los escribe (R8):
--   · la tabla nueva nace con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de
--     20261022130000_organizacion_y_rol_app), así que hace falta el REVOKE. La RLS sin ninguna
--     política es la segunda red;
--   · la columna hereda el «solo lectura» que `organizacion` ya tiene (REVOKE de la misma migración).
--     La política `organizacion_propia` le deja ver solo su propia fila.
-- La leen el trigger de 20261023130200 (SECURITY DEFINER) y el superadmin (`comoPlataforma`, como dueño).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TABLE "cobro_plataforma_tarifa" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "monto" DECIMAL(12,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_plataforma_tarifa_pkey" PRIMARY KEY ("id"),
    -- La PK booleana con este CHECK solo admite la fila `true`: una única tarifa global.
    CONSTRAINT "cobro_plataforma_tarifa_fila_unica_check" CHECK ("id"),
    CONSTRAINT "cobro_plataforma_tarifa_monto_check" CHECK ("monto" >= 0)
);

ALTER TABLE "cobro_plataforma_tarifa" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "cobro_plataforma_tarifa" FROM servi_app;

ALTER TABLE "organizacion" ADD COLUMN "cobro_plataforma_por_orden" DECIMAL(12,2);
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_cobro_plataforma_por_orden_check"
    CHECK ("cobro_plataforma_por_orden" IS NULL OR "cobro_plataforma_por_orden" >= 0);
