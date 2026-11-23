-- DOWN (SLT-224, T5, design §5.3, R1711) — devuelve a cada orden corregida la zona que tenia, borra
-- las acciones que la correccion registro y el respaldo.
--
-- * Solo restaura si la zona de la orden SIGUE siendo la que puso la correccion: una zona cambiada
--   despues (a mano, por un guardado de zona o por una recepcion) no se pisa.
-- * Solo si la zona anterior sigue existiendo: no se apunta a una zona borrada (la FK tumbaria el
--   rollback).
-- * Borra SOLO las acciones `orden_zona_reconciliada` de los lotes de esta correccion: cualquier
--   otra accion, incluida una `orden_zona_reconciliada` anterior o posterior, se queda.
-- * Las 73 ordenes que el leader corrigio a mano en produccion el 2026-11-19 NO estan en este
--   respaldo y no se revierten aqui (design §6).

UPDATE orden o
SET zona_id = r.zona_id_anterior, updated_at = now()
FROM respaldo_slt224.orden_zona r
WHERE o.id = r.orden_id
  AND o.zona_id = r.zona_id_nueva
  AND EXISTS (SELECT 1 FROM zona z WHERE z.id = r.zona_id_anterior);

DELETE FROM historial_accion h
USING (SELECT DISTINCT lote_id FROM respaldo_slt224.orden_zona) l
WHERE h.lote_id = l.lote_id
  AND h.accion = 'orden_zona_reconciliada';

DROP TABLE respaldo_slt224.orden_zona;
DROP SCHEMA respaldo_slt224;
