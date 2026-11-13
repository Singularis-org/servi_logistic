// Ficha 465 (design §3.2) — contrato del repositorio del Excel de cobertura por distrito.
//
// DE SOLO LECTURA (R21): no hay ni un metodo de escritura, y el test del servicio comprueba que
// el doble del repositorio solo expone estos dos.

/** Un distrito del catalogo con su cadena y TODAS sus zonas, SIN colapsar. */
export interface DistritoCoberturaRow {
  provincia: { nombre: string; activo: boolean };
  canton: { nombre: string; activo: boolean };
  /** `zonaEspecial`: la marca de la EMPRESA del actor (SL-38). Dos valores: hay marca o no. */
  distrito: { nombre: string; activo: boolean; zonaEspecial: boolean };
  /**
   * SLT-125 (design §4.2, P5) — la ruta del lugar de la fila, del nivel 1 al nivel P del pais, con el
   * flag PROPIO de cada nivel. Los tres campos de arriba son sus niveles 1, 2 y 3 (vacios y activos si
   * el pais no llega). El motivo «retirado» nombra el primer nivel inactivo de esta ruta.
   * Opcional por el patron aditivo (R37): el repositorio SIEMPRE la envia.
   */
  ruta?: { id: string; nombre: string; activo: boolean }[];
  /** Disponibilidad efectiva (`disponibleDesdeCadena`), calculada en el repositorio. */
  disponible: boolean;
  /**
   * TODAS las zonas de `zona_distrito`. Sin colapsar a proposito: `GeoRepository.listArbol` ya
   * colapsa >1 a `null` y asi no se distingue «sin zona» de «varias zonas» (R9, R11). El colapso
   * 1/0/>1 se aplica en la regla pura, con `zonaUnicaDeDistrito`.
   */
  zonas: { id: string; nombre: string; esCentral: boolean }[];
}

export interface ICoberturaRepository {
  /**
   * Todos los lugares del nivel mas hondo del pais (los distritos en Costa Rica), ACTIVOS E
   * INACTIVOS (R4; SLT-125 P5). Sin orden garantizado.
   */
  listDistritos(): Promise<DistritoCoberturaRow[]>;

  /**
   * Los `zona_id` que tienen tarifa GENERAL: `tienda_id IS NULL AND zona_id IS NOT NULL` (nivel 3
   * de la cascada). La fila (NULL, NULL) NO cuenta (R14). Sin duplicados.
   */
  listZonaIdsConTarifaGeneral(): Promise<string[]>;
}
