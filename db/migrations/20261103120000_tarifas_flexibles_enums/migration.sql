-- SLT-52 (T1.1, design §2.1, R1, R44) — los cinco enums del modelo nuevo de tarifas.
--
-- Van en su propia migracion, antes de las tablas (design §3): asi el down de las tablas no toca
-- tipos, y el nucleo puro de T2 (catalogo, tipos TS) depende solo de esta migracion.
--
-- `tarifa_concepto` es la lista CERRADA de la app (R1): la empresa no la edita. El catalogo TS
-- (`lib/tarifas/catalogo.ts`, T2.1) la repite con actor, resultado y base, y su test la compara con
-- este enum. `*_rechazo` es `devolucion_a_origen_por_rechazo`.
--
-- ADITIVA (R44): solo tipos; ninguna tabla ni fila existente se toca.

CREATE TYPE "tarifa_actor" AS ENUM ('tienda', 'mensajero', 'satelite');

CREATE TYPE "tarifa_concepto" AS ENUM (
  'tienda_flete_entregado',
  'tienda_flete_reprogramado',
  'tienda_flete_novedad',
  'tienda_flete_rechazo',
  'tienda_flete_incidente',
  'tienda_fulfillment',
  'tienda_comision_cod',
  'mensajero_entregado',
  'mensajero_reprogramado',
  'mensajero_novedad',
  'mensajero_rechazo',
  'mensajero_incidente',
  'satelite_entregado',
  'satelite_reprogramado',
  'satelite_novedad',
  'satelite_rechazo',
  'satelite_incidente'
);

CREATE TYPE "tarifa_modo" AS ENUM ('monto', 'porcentaje');

CREATE TYPE "tarifa_nivel" AS ENUM (
  'tienda_grupo',
  'tienda_zona',
  'tienda_general',
  'grupo',
  'zona',
  'mensajero',
  'grupo_vehiculo',
  'zona_vehiculo'
);

CREATE TYPE "tarifa_modelo" AS ENUM ('viejo', 'nuevo');
