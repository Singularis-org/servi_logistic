-- DOWN de SLT-215 (design §2.5) — quita los niveles de beneficio por volumen.
--
-- PIERDE LOS NIVELES, EL ESTADO Y EL HISTORIAL A SABIENDAS: el esquema de antes no tiene dónde guardarlos. Se
-- pierden los niveles de los planes (`plan_nivel`), los de los borradores (el paso `niveles`), los de las
-- versiones programadas y propias de cada empresa (la clave `niveles`), el nivel de cada empresa
-- (`plan_nivel_empresa`) y su historial (`plan_nivel_historial`). La clave se quita porque `versionPlanSchema` de
-- antes es `.strict()` y rechazaría la versión al aplicarla.
--
-- En orden inverso a la subida: el borrador y las versiones, las funciones (dejan de leer las tablas) y las tablas
-- al final. ORDEN entre migraciones: va ANTES del down de 20261121120000 (el valor de `job_tipo`).

BEGIN;

UPDATE "plan_borrador" SET "pasos" = "pasos" - 'niveles' WHERE "pasos" ? 'niveles';
ALTER TABLE "plan_borrador" DROP CONSTRAINT "plan_borrador_pasos_conocidos";
ALTER TABLE "plan_borrador" ADD CONSTRAINT "plan_borrador_pasos_conocidos"
  CHECK (("pasos" - ARRAY['general','precio','orden','topes','modulos','beneficios','vigencia']) = '{}'::jsonb);

UPDATE "plan_cambio_programado" SET "version" = "version" - 'niveles' WHERE "version" ? 'niveles';
UPDATE "plan_version_empresa" SET "version" = "version" - 'niveles' WHERE "version" ? 'niveles';

DROP FUNCTION plan_nivel_tomar_plan(text, timestamp);
DROP FUNCTION plan_nivel_recalcular(text, timestamp, text);
DROP FUNCTION plan_nivel_cerrar_meses(text, timestamp);
DROP FUNCTION plan_nivel_metas_de_la_empresa(text);
DROP FUNCTION plan_nivel_ordenes_efectivas(text, timestamp, timestamp);

DROP TABLE "plan_nivel_historial";
DROP TABLE "plan_nivel_empresa";
DROP TABLE "plan_nivel";

COMMIT;
