import { collapseSpaces } from "@/lib/geo/normalize";

// SLT-125 (design §8; R33, R34) — LA CONSULTA DE GEOCODIFICACION DE HOY, CONGELADA.
//
// Copia de `construirQueryDireccion` tal como estaba antes de SLT-125 (`lib/geo/direccion-query.ts` en
// `dfdd78de`): los tres nombres de las tablas viejas y el pais fijo. `geo:equivalencia-presentacion` la
// compara con la nueva (ruta del catalogo y `pais.nombre` de la empresa) para contar las ordenes cuya
// huella de `GeocodeCache` cambiaria. No se importa la de `lib/`: esa ya es la nueva, y una comparacion
// contra si misma daria siempre 0.
//
// El pais va escrito a mano porque ASI era el codigo de hoy: es lo que se mide, no una regla nueva. No
// se usa fuera de este script.

const PAIS_DE_HOY = "Costa Rica";

export interface ComponentesDeHoy {
  direccion: string | null | undefined;
  distritoNombre: string | null | undefined;
  cantonNombre: string | null | undefined;
  provinciaNombre: string | null | undefined;
}

function normalizar(raw: string | null | undefined): string {
  return raw === null || raw === undefined ? "" : collapseSpaces(raw);
}

/** La consulta de hoy; `null` si la direccion esta vacia (sin consulta, como hoy). */
export function consultaDeHoy(c: ComponentesDeHoy): string | null {
  const direccion = normalizar(c.direccion);
  if (direccion === "") return null;
  const partes = [
    direccion,
    normalizar(c.distritoNombre),
    normalizar(c.cantonNombre),
    normalizar(c.provinciaNombre),
    PAIS_DE_HOY,
  ];
  return partes.filter((p) => p !== "").join(", ");
}
