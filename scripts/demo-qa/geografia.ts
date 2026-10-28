// SL-43 (design §6.1, D22; R20) — dónde caen las órdenes de la demo.
//
// QA no procesa la cola, así que nadie geocodifica: la demo escribe las coordenadas ella misma. El
// catálogo geográfico no trae coordenadas, por eso el punto de cada distrito va fijo aquí (D22). Los
// distritos se nombran por `codigo_dta`, la clave estable del catálogo (ficha 375): el nombre es una
// etiqueta que se puede renombrar.
//
// Los tres existen en la geografía que siembran las migraciones (`20260713005000_seed_geografia_cr` y
// el backfill de `20260907120000_geografia_codigo_dta`).
//
// SL-20 (decisión 3; T6.4): la demo vive en Costa Rica. Sus empresas nacen en `CR` y sus distritos se
// buscan por país y código, porque el código ya no es único global sino por país.

/** El país de la demo de QA (SL-20, decisión 3). */
export const PAIS_DEMO = "CR";

export type PapelDistritoDemo = "central" | "satelite" | "especial";

export type DistritoDemo = Readonly<{
  papel: PapelDistritoDemo;
  codigoDta: string;
  /** Punto de referencia del distrito, en grados decimales (WGS84). */
  latitud: number;
  longitud: number;
}>;

/**
 * Un distrito por papel. La zona central y la satélite caen en cabeceras de provincia distintas, para
 * que el mapa enseñe dos zonas separadas; el de zona especial es un vecino de la central, que es donde
 * una empresa suele marcar recargos.
 */
export const DISTRITOS_DEMO: Readonly<Record<PapelDistritoDemo, DistritoDemo>> = {
  central: { papel: "central", codigoDta: "10101", latitud: 9.9355, longitud: -84.0767 },
  satelite: { papel: "satelite", codigoDta: "20101", latitud: 10.0162, longitud: -84.214 },
  especial: { papel: "especial", codigoDta: "10109", latitud: 9.948, longitud: -84.134 },
};

/**
 * La clave única del distrito en el catálogo: país y código (`@@unique([paisId, codigoDta])`). Con
 * solo el código, un país que repita `10101` pondría la demo fuera de Costa Rica.
 */
export function claveDeDistritoDemo(distrito: DistritoDemo): {
  paisId_codigoDta: { paisId: typeof PAIS_DEMO; codigoDta: string };
} {
  return { paisId_codigoDta: { paisId: PAIS_DEMO, codigoDta: distrito.codigoDta } };
}

/** Metros por grado de latitud (y de longitud en el ecuador). Basta para desplazar unos cientos de metros. */
const METROS_POR_GRADO = 111_320;
const RADIO_MINIMO_M = 100;
const RADIO_EXTRA_M = 100;
/** Ángulo áureo: los puntos sucesivos se reparten alrededor del centro sin repetir dirección. */
const ANGULO_AUREO_RAD = Math.PI * (3 - Math.sqrt(5));

/** Siete decimales: la escala de `orden.latitud`/`longitud` (`DECIMAL(10, 7)`). */
function redondear(grados: number): number {
  return Math.round(grados * 1e7) / 1e7;
}

/**
 * El punto de la orden número `indice` de un distrito: su punto fijo desplazado entre 100 y 200 m, en
 * una dirección que cambia con el índice. Determinista, para que dos ejecuciones dejen el mismo mapa,
 * y separado, para que los marcadores no se pisen.
 */
export function puntoDeOrden(distrito: DistritoDemo, indice: number): { latitud: number; longitud: number } {
  if (!Number.isInteger(indice) || indice < 0) {
    throw new RangeError("puntoDeOrden: el índice tiene que ser un entero >= 0");
  }
  const angulo = indice * ANGULO_AUREO_RAD;
  // El 37 es primo con 101: el radio recorre los 101 valores antes de repetirse.
  const radio = RADIO_MINIMO_M + ((indice * 37) % (RADIO_EXTRA_M + 1));
  const dLat = (radio * Math.cos(angulo)) / METROS_POR_GRADO;
  const dLon = (radio * Math.sin(angulo)) / (METROS_POR_GRADO * Math.cos((distrito.latitud * Math.PI) / 180));
  return { latitud: redondear(distrito.latitud + dLat), longitud: redondear(distrito.longitud + dLon) };
}
