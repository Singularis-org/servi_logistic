-- SL-19 (design §2.1; R1-R5, R9) — la cola `jobs` pasa a separarse por empresa en la propia base.
--
--   · Las politicas permisivas se suman con OR: con `jobs_abierta` viva, la de empresa no serviria
--     (R9). Por eso se suelta en la misma transaccion en que nace la nueva.
--   · Mismo predicado que las `<t>_por_empresa` de negocio. `NULL = x` es NULL, que la RLS trata
--     como falso: un job sin empresa (recurrente de plataforma) no lo ve ni lo toca ninguna empresa,
--     y sin empresa fijada `servi_app` no ve ni inserta nada (R5).
--   · Sin `FORCE`: el drenador reclama y cierra como dueno de las tablas (plataforma) y tiene que
--     seguir viendo los jobs de todas las empresas y los sin empresa (R6).
--   · La RLS de `jobs` ya esta activa desde `20260717120000_jobs_cola`; la columna y su indice, desde
--     `20261022130200_jobs_organizacion_id`.

BEGIN;

DROP POLICY "jobs_abierta" ON "jobs";
CREATE POLICY "jobs_por_empresa" ON "jobs" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

COMMIT;
