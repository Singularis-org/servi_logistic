// SLT-121 (design §3.1, R2) — la gracia global del plazo de pago de las facturas de la plataforma.
//
// Rige para toda empresa sin gracia propia (`organizacion.factura_dias_gracia`). La base no lee el entorno:
// las funciones de la mora la reciben por parámetro (`p_gracia_global`), así que este es el único sitio
// que la resuelve.
//
// El rango es el de la gracia propia (1 a 60, el `CHECK` de la columna): con otro, la global y la propia
// podrían divergir (design §13.5).

export const GRACIA_GLOBAL_POR_DEFECTO = 7;
const GRACIA_MIN = 1;
const GRACIA_MAX = 60;

/** `FACTURA_DIAS_GRACIA` si es un entero de 1 a 60; si falta o no lo es, 7. */
export function diasDeGraciaGlobal(env: NodeJS.ProcessEnv = process.env): number {
  const crudo = env.FACTURA_DIAS_GRACIA?.trim();
  // Solo dígitos: `Number.parseInt` aceptaría «7.5» o «15abc» como 7 y 15.
  if (crudo === undefined || !/^\d+$/.test(crudo)) return GRACIA_GLOBAL_POR_DEFECTO;
  const dias = Number(crudo);
  return dias >= GRACIA_MIN && dias <= GRACIA_MAX ? dias : GRACIA_GLOBAL_POR_DEFECTO;
}
