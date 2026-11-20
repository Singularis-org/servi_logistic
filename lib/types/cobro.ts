import { z } from "zod";

// SLT-226 (design §4.1) — el cobro en línea de una factura de la plataforma. Los importes viajan como texto
// (`numeric` de la base, normalizado a dos decimales): nunca pasan por `number`, como en SLT-60.

export const ESTADOS_COBRO = [
  "creado",
  "pendiente",
  "aprobado",
  "rechazado",
  "expirado",
  "anulado",
  "devuelto",
  "contracargo",
] as const;
export type EstadoCobro = (typeof ESTADOS_COBRO)[number];

/** El único proveedor que admite el CHECK de `cobro_intento.proveedor` y de `cobro_webhook_evento.proveedor`. */
export const PROVEEDORES_COBRO = ["rebill"] as const;
export type ProveedorCobroId = (typeof PROVEEDORES_COBRO)[number];

export interface CobroIntentoDTO {
  id: string;
  facturaId: string;
  proveedor: ProveedorCobroId;
  estado: EstadoCobro;
  montoLocal: string;
  monedaLocal: string;
  montoCobrado: string;
  monedaCobro: string;
  tasa: string | null;
  tasaFuente: string | null;
  tasaAt: Date | null;
  idExterno: string | null;
  pagoProveedorId: string | null;
  createdAt: Date;
  estadoAt: Date;
  aprobadoAt: Date | null;
}

/**
 * R12: lo único que se guarda de un evento del proveedor. Ni el cuerpo ni datos de la tarjeta o del pagador: el
 * borde (SLT-228) extrae estos cuatro campos y descarta el resto.
 */
export const eventoProveedorSchema = z.object({
  proveedor: z.enum(PROVEEDORES_COBRO),
  logId: z.string().min(1),
  tipo: z.string().min(1),
  pagoProveedorId: z.string().min(1),
});
export type EventoProveedor = z.infer<typeof eventoProveedorSchema>;

export type ObtenerIntentoResult =
  | { estado: "ok"; intento: CobroIntentoDTO; nuevo: boolean }
  | { estado: "factura_no_valida" }
  | { estado: "sin_saldo" };

export type RegistrarEnlaceResult = { estado: "ok" | "ya_pendiente" | "no_vivo" };

/** Los resultados que admite el CHECK `cobro_webhook_evento_resultado`. */
export type ResultadoDelEvento = "aplicado" | "sin_cambio" | "sin_intento" | "requiere_revision";

export type ProcesarEventoResult =
  | { estado: "ignorado" } // R13: ya procesado
  | { estado: "procesado"; resultado: ResultadoDelEvento };

export type IntentosDeFacturaResult = { estado: "ok"; intentos: CobroIntentoDTO[] } | { estado: "forbidden" };

/**
 * design §3.9 — la base rechazó un cambio del intento (`SL226`): una transición fuera de la tabla de R7 o una
 * columna fija (R8). Solo sale si alguien se salta las funciones del dueño; la app no lo muestra.
 */
export class CobroIntentoInvalido extends Error {
  readonly codigo: "transicion_invalida" | "columna_fija";

  constructor(codigo: "transicion_invalida" | "columna_fija", opciones?: { cause?: unknown }) {
    super(`La base rechazó el cambio del intento de cobro: ${codigo}`, opciones);
    this.name = "CobroIntentoInvalido";
    this.codigo = codigo;
  }
}
