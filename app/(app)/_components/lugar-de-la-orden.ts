import { dosMasHondos, type NivelDelPais, type Ruta } from "@/lib/utils/ubicacion-presentacion";

// SLT-125 (design §5; R11, R12, R15, P7) — LOS DOS LUGARES QUE ENSEÑAN LAS TARJETAS DE UNA ORDEN: la
// tarjeta POS (mosaico, detalle y bloque de navegación), la de satélite, el chat y el detalle de
// asignación. Cada superficie conserva su orden y su separador de hoy; aquí solo se decide QUÉ dos
// nombres son.
//
// Módulo PURO: sin React ni DOM. Las pantallas pasan los niveles del país (`useNivelesGeograficos`).
// Sin ellos (sin proveedor: superadmin sin país, componentes montados sueltos en un test) o sin la
// ruta de la orden (`lugarRuta`, opcional en los DTO), los campos de hoy: el cantón arriba y el
// distrito abajo. Así nada cambia donde los niveles o la ruta no llegan.
//
// Ningún texto de nivel va escrito aquí (R42).

/** Lo que una orden trae de su lugar: los nombres de hoy y, si llega, la ruta del nivel 1 al lugar. */
export interface OrdenConLugar {
  cantonNombre: string;
  distritoNombre: string | null;
  lugarRuta?: Ruta;
}

/**
 * Los dos lugares más hondos de la ruta de la orden (R11): `arriba` es el nivel D−1 y `abajo` el D
 * (`dosMasHondos`). Una orden sin el nivel más hondo da `abajo: null` y la tarjeta enseña solo
 * `arriba`, como hoy una orden de Costa Rica sin distrito (P7).
 */
export function dosLugaresDeLaOrden(
  orden: OrdenConLugar,
  niveles: readonly NivelDelPais[],
): { arriba: string | null; abajo: string | null } {
  if (!Array.isArray(orden.lugarRuta) || niveles.length === 0) {
    return { arriba: orden.cantonNombre, abajo: orden.distritoNombre };
  }
  return dosMasHondos(orden.lugarRuta, niveles.length);
}

/**
 * Los nombres del lugar de la orden en cada nivel del país, del 1 a P (R12), o `null` si no hay
 * niveles o ruta: entonces quien llama pinta los campos de hoy. Un nivel al que la ruta no llega da
 * `nombre: null` y la pantalla pinta «—».
 */
export function camposDeNivelDeLaOrden(
  orden: OrdenConLugar,
  niveles: readonly NivelDelPais[],
): { profundidad: number; tipo: string; nombre: string | null }[] | null {
  const ruta = orden.lugarRuta;
  if (!Array.isArray(ruta) || niveles.length === 0) return null;
  return [...niveles]
    .sort((a, b) => a.profundidad - b.profundidad)
    .map((n) => ({
      profundidad: n.profundidad,
      tipo: n.singular,
      nombre: ruta[n.profundidad - 1]?.nombre || null,
    }));
}
