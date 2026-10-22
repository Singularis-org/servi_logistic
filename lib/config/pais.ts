// SL-13 (R16, D7) — configuracion minima del pais de operacion. Solo constantes y tipos: sin
// `process.env`, sin Prisma y sin `server-only`, para que la pueda importar un componente de
// cliente (el mapa de Leaflet de `mis-asignaciones`).

/** Mínimo de la fase 1. La fase 3 (SL-20) lo amplía y lo resuelve por empresa. */
export interface ConfiguracionPais {
  /** ISO 3166-1 alfa-2. */
  codigo: string;
  /** Centro del mapa cuando no hay ningún punto que encuadrar: [lat, lng]. */
  centroMapa: readonly [number, number];
}

/** Costa Rica, el mismo pais que fija `lib/geo/direccion-query.ts`. Centro: San José. */
export const PAIS_DE_OPERACION: ConfiguracionPais = { codigo: "CR", centroMapa: [9.9281, -84.0907] };
