import type { NivelDelPais, Ruta } from "@/lib/utils/ubicacion-presentacion";

// SLT-125 (A10) — la `ruta` y los `niveles` que `FilaTransito` gano, para las filas simuladas de los
// tests del informe de transito. Es ENTRADA: con ella el PDF sigue titulando «CANTÓN · DISTRITO» y
// pintando «cantón · distrito», como antes, y ninguna salida esperada cambia.
//
// Costa Rica: los textos de nivel van literales a proposito (R42 lo permite en los tests de CR).

export const NIVELES_CR: readonly NivelDelPais[] = [
  { profundidad: 1, singular: "Provincia" },
  { profundidad: 2, singular: "Cantón" },
  { profundidad: 3, singular: "Distrito" },
];

/**
 * La ruta de una fila de CR a partir de su cantón y su distrito. La provincia no se pinta en el
 * informe (va en el nivel 1, fuera de los dos más hondos); se usa el nombre del cantón como relleno.
 */
export function rutaDeCR(canton: string, distrito: string | null): Ruta {
  return [
    { id: null, nombre: canton },
    { id: null, nombre: canton },
    ...(distrito === null ? [] : [{ id: null, nombre: distrito }]),
  ];
}
