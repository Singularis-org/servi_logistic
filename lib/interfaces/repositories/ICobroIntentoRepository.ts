import type { EstadoPagoProveedor } from "@/lib/interfaces/external/IProveedorCobro";
import type { CobroIntentoDTO, ProveedorCobroId, ResultadoDelEvento } from "@/lib/types/cobro";

// SLT-226 (design §4.3) — el acceso a las funciones del dueño de `20261124120100_cobro_intento`. Cada escritura es
// una sola sentencia: su propia transacción, bajo el candado `pago_plataforma:` de la empresa.

export interface ObtenerOCrearRepoInput {
  organizacionId: string;
  facturaId: string;
  proveedor: ProveedorCobroId;
  /** La moneda local de la empresa: el intento cobra en ella (R1). */
  monedaLocal: string;
  /** Quien pidió el intento; `null` si lo pidió el sistema. */
  por: string | null;
  ahora: Date;
}

export type ObtenerOCrearRepoResult =
  | { estado: "creado" | "existente"; intento: CobroIntentoDTO }
  | { estado: "factura_no_valida" }
  | { estado: "sin_saldo" };

export interface RegistrarEnlaceRepoInput {
  organizacionId: string;
  intentoId: string;
  idExterno: string;
  ahora: Date;
}

/** Los destinos que admite `cobro_intento_avanzar`: `aprobado` solo se alcanza registrando el pago (R9). */
export type DestinoDeAvance = Exclude<EstadoPagoProveedor, "aprobado">;

export interface AvanzarRepoInput {
  proveedor: ProveedorCobroId;
  idExterno: string;
  destino: DestinoDeAvance;
  ahora: Date;
}

export interface AvanzarRepoResult {
  resultado: "ok" | "sin_cambio" | "no_alcanzable" | "sin_intento";
  /** El intento del `idExterno`, para cerrar el evento con él; `null` con `sin_intento`. */
  intentoId: string | null;
}

export interface RegistrarPagoAprobadoRepoInput {
  proveedor: ProveedorCobroId;
  pagoProveedorId: string;
  idExterno: string;
  /** En texto decimal: la base lo compara con `monto_cobrado` sin pasar por `number` (R21). */
  monto: string;
  moneda: string;
  ahora: Date;
}

export interface RegistrarPagoAprobadoRepoResult {
  resultado: "ok" | "ya_registrado" | "sin_intento" | "requiere_revision";
  intentoId: string | null;
}

export interface RegistrarEventoRepoInput {
  proveedor: ProveedorCobroId;
  logId: string;
  tipo: string;
  pagoProveedorId: string;
  ahora: Date;
}

export interface CerrarEventoRepoInput {
  proveedor: ProveedorCobroId;
  logId: string;
  resultado: ResultadoDelEvento;
  intentoId: string | null;
  ahora: Date;
}

/** Con qué alcance se leen los intentos (R27): la empresa de la sesión, o la plataforma (superadmin). */
export type AlcanceDeLectura = { tipo: "empresa"; organizacionId: string } | { tipo: "plataforma" };

export interface ICobroIntentoRepository {
  /** design §3.1 (R1–R5) y después la lectura del intento. */
  obtenerOCrear(input: ObtenerOCrearRepoInput): Promise<ObtenerOCrearRepoResult>;
  /** design §3.2 (R10). */
  registrarEnlace(input: RegistrarEnlaceRepoInput): Promise<"ok" | "ya_pendiente" | "no_vivo">;
  /** design §3.3 (R14, R15, R23, R24). */
  avanzar(input: AvanzarRepoInput): Promise<AvanzarRepoResult>;
  /** design §3.5 (R17–R22). */
  registrarPagoAprobado(input: RegistrarPagoAprobadoRepoInput): Promise<RegistrarPagoAprobadoRepoResult>;
  /** design §3.8 (R12, R13): `repetido` = ya procesado; `pendiente` = llegó y no terminó. */
  registrarEvento(input: RegistrarEventoRepoInput): Promise<"nuevo" | "repetido" | "pendiente">;
  /** design §3.8: se cierra una sola vez. */
  cerrarEvento(input: CerrarEventoRepoInput): Promise<"ok" | "ya_cerrado" | "sin_evento">;
  /** R27: los intentos de una factura, del más nuevo al más viejo. */
  intentosDeFactura(alcance: AlcanceDeLectura, facturaId: string): Promise<CobroIntentoDTO[]>;
}
