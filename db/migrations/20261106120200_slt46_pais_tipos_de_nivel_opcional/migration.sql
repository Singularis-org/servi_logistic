-- SLT-46 (design §2.4, §3; R46, R47; decisión P2) — un país puede tener 2 niveles: el trigger
-- `pais_tipos_de_nivel` deja de crear `nivel_3` cuando el país no lo tiene.
--
-- CONVENCIÓN DE DATO: un país sin nivel 3 guarda texto vacío ('') en `pais.nivel_3_singular` y
-- `pais.nivel_3_plural`. Cumple el NOT NULL de SL-20 (quitarlo sería ALTER COLUMN) y `pais` no tiene
-- CHECK sobre esas columnas. Lo pone solo `PaisRepository` en el alta de un país de 2 tipos; zod nunca
-- acepta '' como nombre (2–40). Todo lector de esas columnas tiene que saber que vacío es «sin nivel
-- 3»: hoy, `etiquetasDePais` (con respaldo a la etiqueta del nivel 2, P10).
--
-- La función es la de SLT-43 (20261104120100) con UNA sola diferencia: la fila de `nivel_3` del VALUES
-- solo entra si `NEW.nivel_3_singular <> ''`. Mismo nombre, mismo RETURNS trigger, SECURITY DEFINER
-- y `search_path` fijo. El trigger `pais_tipos_de_nivel` y sus columnas no se tocan.
--   · CR y todo país anterior a SLT-46 (`nivel_3_singular` lleno): el WHERE deja pasar las tres filas,
--     idéntico a SLT-43 (R47).
--   · País de 2 tipos (''): INSERT y cualquier UPDATE posterior hacen el upsert de `nivel_1` y
--     `nivel_2` y nunca crean `nivel_3` (R46).
--   · La función no borra nunca un tipo (R50): poner '' en un país que ya tiene `nivel_3` no lo quita.
--
-- `CREATE OR REPLACE FUNCTION` solo sobre esta función (R8, P2). No bloquea `pais` más allá del
-- catálogo, no escribe datos y no toca `orden` (R10).
--
-- Solo aditiva (R8). A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

CREATE OR REPLACE FUNCTION pais_tipos_de_nivel() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO tipo_nivel_geografico
    (id, pais_id, clave, nombre_singular, nombre_plural, digitos_codigo, codigo_hereda_prefijo)
  SELECT v.id, v.pais_id, v.clave, v.nombre_singular, v.nombre_plural, v.digitos_codigo, v.codigo_hereda_prefijo
    FROM (VALUES
      (gen_random_uuid()::text, NEW.id, 'nivel_1', NEW.nivel_1_singular, NEW.nivel_1_plural,
       NEW.digitos_codigo_nivel_1, false),
      (gen_random_uuid()::text, NEW.id, 'nivel_2', NEW.nivel_2_singular, NEW.nivel_2_plural,
       NEW.digitos_codigo_nivel_2, NEW.digitos_codigo_nivel_2 IS NOT NULL),
      (gen_random_uuid()::text, NEW.id, 'nivel_3', NEW.nivel_3_singular, NEW.nivel_3_plural,
       NEW.digitos_codigo_nivel_3, NEW.digitos_codigo_nivel_3 IS NOT NULL)
    ) AS v (id, pais_id, clave, nombre_singular, nombre_plural, digitos_codigo, codigo_hereda_prefijo)
   WHERE v.clave <> 'nivel_3' OR NEW.nivel_3_singular <> ''
  ON CONFLICT (pais_id, clave) DO UPDATE
    SET nombre_singular = EXCLUDED.nombre_singular,
        nombre_plural = EXCLUDED.nombre_plural,
        digitos_codigo = EXCLUDED.digitos_codigo,
        codigo_hereda_prefijo = EXCLUDED.codigo_hereda_prefijo;
  RETURN NULL;
END $$;

COMMIT;
