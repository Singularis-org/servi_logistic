-- SLT-43 (design §2.2, §3; R4–R14) — el nodo geográfico.
--
-- T2.1 (esta parte, primero): `geo_normalizar_nombre`, la traducción a SQL de `normalizeName`
-- (`lib/utils/normalize.ts`). T2.2 añade aquí, en este orden: las comprobaciones previas de R14, la
-- tabla, sus únicos e índices, las FK compuestas, los triggers de invariantes y de descendientes, la
-- RLS y la copia de la geografía.
--
-- Solo aditiva (R19). A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

-- R10. Mismos pasos y en el mismo orden que `normalizeName`: NFD → quitar marcas combinantes →
-- minúsculas → espacios colapsados y recortados.
--   · Sin `unaccent`: no está instalada y es STABLE (lo explica 20260731160000_orden_busqueda_trgm);
--     `normalize()` sí es IMMUTABLE (Postgres 13+, base UTF-8), y la función tiene que serlo porque la
--     usa el trigger de invariantes para un único.
--   · Las marcas son el bloque U+0300–U+036F, no todo `\p{Mn}` como en JS: el regex de Postgres no
--     tiene clases Unicode. Cubre todos los nombres de la geografía (lo comprueba
--     `geo-normalizar-nombre.test.ts` sobre la base entera).
--   · Los espacios son la lista exacta de `\s` de JS y no `[[:space:]]`, que en Postgres depende de la
--     configuración regional del servidor: así un espacio duro (U+00A0) colapsa igual en los dos.
CREATE FUNCTION geo_normalizar_nombre(p_nombre text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(
           regexp_replace(
             lower(regexp_replace(normalize(p_nombre, NFD), '[̀-ͯ]', '', 'g')),
             '[\t\n\u000b\f\r    -     　﻿]+',
             ' ',
             'g'),
           ' ')
$$;

COMMIT;
