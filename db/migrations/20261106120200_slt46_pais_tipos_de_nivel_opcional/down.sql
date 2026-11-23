-- SLT-46 — revierte 20261106120200_slt46_pais_tipos_de_nivel_opcional (design §3, R9). Va PRIMERO en
-- la vuelta de SLT-46 (antes del down de 20261106120100).
--
-- Vuelve a poner la función `pais_tipos_de_nivel` de SLT-43 con su cuerpo copiado LITERAL de
-- 20261104120100_tipo_nivel_geografico (solo cambia `CREATE` por `CREATE OR REPLACE`): tras la vuelta,
-- `pg_get_functiondef` es el de SLT-43 (lo comprueba `migracion-slt46-ida-y-vuelta.test.ts`).
--
-- OJO: un país de 2 niveles creado con SLT-46 puesta conserva sus dos tipos tras la vuelta, pero un
-- UPDATE de su fila `pais` (de las columnas del trigger) con esta función le crearía un `nivel_3` de
-- nombre vacío. El ensayo (design §10) lo anota: no se crean países de 2 niveles hasta confirmar que
-- no hay vuelta.

BEGIN;

CREATE OR REPLACE FUNCTION pais_tipos_de_nivel() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO tipo_nivel_geografico
    (id, pais_id, clave, nombre_singular, nombre_plural, digitos_codigo, codigo_hereda_prefijo)
  VALUES
    (gen_random_uuid()::text, NEW.id, 'nivel_1', NEW.nivel_1_singular, NEW.nivel_1_plural,
     NEW.digitos_codigo_nivel_1, false),
    (gen_random_uuid()::text, NEW.id, 'nivel_2', NEW.nivel_2_singular, NEW.nivel_2_plural,
     NEW.digitos_codigo_nivel_2, NEW.digitos_codigo_nivel_2 IS NOT NULL),
    (gen_random_uuid()::text, NEW.id, 'nivel_3', NEW.nivel_3_singular, NEW.nivel_3_plural,
     NEW.digitos_codigo_nivel_3, NEW.digitos_codigo_nivel_3 IS NOT NULL)
  ON CONFLICT (pais_id, clave) DO UPDATE
    SET nombre_singular = EXCLUDED.nombre_singular,
        nombre_plural = EXCLUDED.nombre_plural,
        digitos_codigo = EXCLUDED.digitos_codigo,
        codigo_hereda_prefijo = EXCLUDED.codigo_hereda_prefijo;
  RETURN NULL;
END $$;

COMMIT;
