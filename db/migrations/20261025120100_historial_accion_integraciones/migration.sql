-- SL-36 T1.2 (design §13, R33) — el rastro de las integraciones en el historial de acciones.
--
-- Cinco tipos, uno por operacion que cambia algo (la guardia del censo mide POR METODO): conectar,
-- actualizar, probar, regenerar el token y desconectar. La entidad `integracion` es 1:1 con su
-- tabla, como las demas del enum.
--
-- ⚠️ LA FILA NUNCA LLEVA LA CREDENCIAL, SU VALOR CIFRADO NI EL MENSAJE DEL PROVEEDOR (R33, R5):
-- `entidad_etiqueta` es el nombre del servicio y, en una prueba, `valor_nuevo` es `ok` o el codigo
-- del catalogo. Y SOBREVIVE a la desconexion: `entidad_id` es opaco y sin FK.
--
-- VA SOLA: Postgres prohibe USAR un valor de enum en la misma transaccion que lo anade (55P04).
-- Nada aqui escribe filas; el primer uso ocurre en runtime. No toca tablas ni la RLS.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'integracion_conectada';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'integracion_actualizada';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'integracion_probada';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'integracion_token_regenerado';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'integracion_desconectada';

ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'integracion';
