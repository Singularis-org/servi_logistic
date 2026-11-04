-- DOWN (SLT-76, design §9.1, R20) — NO RECUPERA NADA.
--
-- Los datos de `respaldo.slt73_asientos` y `respaldo.slt75_zona_distrito_duplicado` se borraron con
-- la migración y no se recuperan: no hay copia en ninguna otra parte.
--
-- ⚠️ NO RECREA LAS TABLAS, NI SIQUIERA VACÍAS. Si lo hiciera, el down de SLT-73 encontraría su tabla
-- y «devolvería» cero filas sin avisar: volver al código anterior a SLT-73 dejaría los libros sin los
-- asientos retirados, un agujero de dinero silencioso. Sin la tabla, ese down falla con un mensaje
-- que nombra SLT-76 (R18), y el de datos de SLT-75 no hace nada y lo avisa (R19).
DO $slt76$
BEGIN
  RAISE NOTICE 'slt76: los respaldos retirados no se recrean';
END
$slt76$;
