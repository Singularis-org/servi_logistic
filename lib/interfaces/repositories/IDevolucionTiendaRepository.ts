// FICHA 419 — contrato del repositorio de la confirmacion CENTRAL de entrega a la tienda.
// Solo queries: la autorizacion, la validacion y la clasificacion por orden viven en
// `DevolucionTiendaService`.

/** Un archivo del comprobante YA SUBIDO, listo para persistir. */
export interface EvidenciaComprobanteSubida {
  storagePath: string;
  contentType: string;
  /** 0..N-1 en el orden en que llegaron. */
  indice: number;
}

export interface ConfirmarEntregaLoteInput {
  tiendaId: string;
  /** maestro/admin que confirma: autor del comprobante y actor del historial. */
  subidoPor: string;
  ordenIds: string[];
  /** id de `devolviendo_a_tienda` (guarda del UPDATE y origen del historial). */
  origenEstatusId: string;
  /** id de `devuelta_a_tienda`. */
  destinoEstatusId: string;
  evidencias: EvidenciaComprobanteSubida[];
}

export interface ConfirmarEntregaLoteResultado {
  comprobanteId: string;
  /** ids que transicionaron EN ESTE lote (los del `RETURNING`). */
  transicionadas: string[];
}

/**
 * Lanzado por `confirmarEntregaLote` cuando el `UPDATE` no devuelve ninguna fila: revierte el
 * comprobante y sus evidencias ya insertados en la misma transaccion (R11).
 */
export class SinTransicionesError extends Error {
  constructor() {
    super("ninguna orden del lote era elegible");
    this.name = "SinTransicionesError";
  }
}

/** Foto de una orden pedida, para clasificar su desenlace (R7). */
export interface OrdenParaReporte {
  id: string;
  numGuia: number | null;
  tiendaId: string;
  deletedAt: Date | null;
  estatusValue: string;
}

/** El comprobante enlazado a una orden (R22). `storagePath` NUNCA sale del servidor (R23). */
export interface ComprobanteDeOrden {
  createdAt: Date;
  subidoPorNombre: string;
  evidencias: { storagePath: string; contentType: string; indice: number }[];
}

export interface IDevolucionTiendaRepository {
  /** id del estado del catalogo, o `null` si no existe. */
  findEstatusIdByValue(value: string): Promise<string | null>;

  /** `true` si el usuario existe y tiene rol `adminTienda`. */
  esTienda(usuarioId: string): Promise<boolean>;

  /**
   * En UNA transaccion (design D4): inserta el comprobante y sus evidencias; `UPDATE ...
   * RETURNING` guardado por id + tienda + estado `devolviendo_a_tienda` + no borrada; si no
   * devuelve filas lanza `SinTransicionesError` (revierte todo); append del historial (+ webhook)
   * SOLO para las devueltas por el `RETURNING`; enlaza cada una al comprobante.
   */
  confirmarEntregaLote(input: ConfirmarEntregaLoteInput): Promise<ConfirmarEntregaLoteResultado>;

  /** Lectura de las ordenes pedidas (incluidas las borradas) para el reporte por orden. */
  findOrdenesParaReporte(ordenIds: string[]): Promise<OrdenParaReporte[]>;

  /** El comprobante enlazado a la orden, o `null` si no tiene. */
  findComprobanteDeOrden(ordenId: string): Promise<ComprobanteDeOrden | null>;
}
