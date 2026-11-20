-- SLT-224 (T5, design §5, R1708-R1712) — correccion UNICA de la zona de las ordenes vivas que ya
-- estan en la bodega central (`en_bodega_central`) o en ruta a ella (`en_ruta_bodega_central`) con
-- una zona que no es la de su distrito.
--
-- POR QUE. Una orden en el estante de una satelite conserva su zona aunque su distrito se pase a
-- otra (ficha 377). SLT-197 añadio el retiro a la central, y ni el retiro ni la recepcion volvian a
-- derivar la zona: la orden llegaba a la central con la zona de la satelite y la central no la podia
-- asignar. Desde esta ficha la recepcion la corrige; esta migracion corrige las que ya estaban.
--
-- LA REGLA es la del helper `lib/repositories/_shared/reconciliar-zona-ordenes.ts` (366/377), escrita
-- en SQL, generica y para TODAS las empresas (corre como dueño, sin RLS). El JOIN a `zona_distrito`
-- por (organizacion_id, distrito_id) devuelve como mucho una fila por el indice unico de SLT-75: es
-- el colapso `zonaUnicaDeDistrito` (0 filas = distrito sin zona = fuera). El corte de dinero es el
-- de `whereBaseElegible`: ni cierre_detail, ni gestion vigente que ya decidio dinero.
--
-- SOLO DOS ESTADOS (design §5.2): el estante de la satelite lo retiene la 377; las devoluciones
-- dependen de la zona para que alguien las envie o ya van a la tienda; las entregadas tienen cierre.
--
-- RESPALDO en un esquema PROPIO, `respaldo_slt224`, fuera de `public` (la app no lo ve y Prisma no
-- lo compara). No se usa el esquema compartido `respaldo`: SLT-76 lo retira y sus pruebas esperan
-- poder borrarlo vacio. Columnas con nombre, nunca `o.*`.
--
-- Sin candidatas, el respaldo queda vacio y el UPDATE y el INSERT no escriben nada (R1712).

CREATE SCHEMA IF NOT EXISTS respaldo_slt224;
REVOKE ALL ON SCHEMA respaldo_slt224 FROM PUBLIC;

-- Un lote por empresa (R1710): un `gen_random_uuid()` por cada empresa con candidatas.
CREATE TABLE respaldo_slt224.orden_zona AS
WITH candidatas AS (
  SELECT o.id AS orden_id, o.organizacion_id, o.zona_id AS zona_id_anterior, zd.zona_id AS zona_id_nueva
  FROM orden o
  JOIN order_status s ON s.id = o.estatus_id
  JOIN zona_distrito zd ON zd.organizacion_id = o.organizacion_id AND zd.distrito_id = o.distrito_id
  WHERE o.deleted_at IS NULL
    AND s.value IN ('en_bodega_central', 'en_ruta_bodega_central')
    AND o.zona_id <> zd.zona_id
    AND NOT EXISTS (SELECT 1 FROM cierre_detail cd WHERE cd.orden_id = o.id)
    AND NOT EXISTS (
      SELECT 1 FROM gestion_orden g
      WHERE g.orden_id = o.id
        AND g.anulada_at IS NULL
        AND g.resultado IN ('entregado', 'devolucion_a_origen_por_rechazo', 'incidente')
    )
),
lotes AS (
  SELECT e.organizacion_id, gen_random_uuid()::text AS lote_id
  FROM (SELECT DISTINCT organizacion_id FROM candidatas) e
)
SELECT c.orden_id, c.organizacion_id, c.zona_id_anterior, c.zona_id_nueva, l.lote_id, now() AS respaldado_at
FROM candidatas c
JOIN lotes l ON l.organizacion_id = c.organizacion_id;

REVOKE ALL ON respaldo_slt224.orden_zona FROM PUBLIC;

-- R1707: solo la zona y la fecha de actualizacion. Nada de estado, mensajero, montos ni tablas de dinero.
UPDATE orden o
SET zona_id = r.zona_id_nueva, updated_at = now()
FROM respaldo_slt224.orden_zona r
WHERE o.id = r.orden_id;

-- R1710: una accion `orden_zona_reconciliada` por orden corregida, actor «sistema» (los tres campos
-- NULL, como el cron), etiqueta = la de `etiquetaDeEnvio` (guia, o remision, o «(sin guía)»), el lote
-- de su empresa y `organizacion_id` EXPLICITO: su DEFAULT lee el contexto de sesion, que aqui no hay.
-- `monto`, `valor_anterior` y `valor_nuevo` quedan NULL, como en la 366/R10.
INSERT INTO historial_accion (
  id, accion, entidad_tipo, entidad_id, entidad_etiqueta,
  actor_usuario_id, actor_nombre, actor_rol, lote_id, organizacion_id
)
SELECT
  gen_random_uuid()::text,
  'orden_zona_reconciliada',
  'orden',
  o.id,
  left(COALESCE(NULLIF(btrim(o.num_guia::text), ''), NULLIF(btrim(o.num_remision), ''), '(sin guía)'), 120),
  NULL,
  NULL,
  NULL,
  r.lote_id,
  r.organizacion_id
FROM respaldo_slt224.orden_zona r
JOIN orden o ON o.id = r.orden_id;
