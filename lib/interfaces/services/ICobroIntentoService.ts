import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  IntentosDeFacturaResult,
  MarcarPagadoManualInput,
  MarcarPagadoManualResult,
  MetodoCobro,
  ObtenerIntentoResult,
  ProcesarEventoResult,
  ProveedorCobroId,
  RegistrarEnlaceResult,
} from "@/lib/types/cobro";

// SLT-226 (design §4.4) — el servicio del cobro en línea. No hay actions ni rutas: el borde lo ponen SLT-228
// «Cobro automático: webhook de Rebill», SLT-230 «Cobro automático: enlace de pago por factura» y SLT-231
// «Cobro automático: botón «Pagar» y estado de la factura».

export interface ObtenerOCrearIntentoInput {
  /** La empresa la resuelve quien llama (desde la sesión); la función de la base la valida contra la factura (R5). */
  organizacionId: string;
  facturaId: string;
  /** Los elige quien llama (SLT-230 y SLT-231, con lo que diga SLT-251): el servicio no fija ninguno (R31). */
  proveedor: ProveedorCobroId;
  metodo: MetodoCobro;
  actorUsuarioId: string | null;
}

export interface RegistrarEnlaceInput {
  organizacionId: string;
  intentoId: string;
  idExterno: string;
}

export interface ICobroIntentoService {
  /** R1–R5. No autoriza: la empresa y el actor los resuelve quien llama. */
  obtenerOCrearIntento(input: ObtenerOCrearIntentoInput): Promise<ObtenerIntentoResult>;
  /** R10. */
  registrarEnlace(input: RegistrarEnlaceInput): Promise<RegistrarEnlaceResult>;
  /**
   * R12–R24. El evento se valida con `eventoProveedorSchema`; si no encaja, lanza. Si la consulta al proveedor
   * falla, lanza con el `logId` y deja el evento sin cerrar para que un reintento lo procese (R16).
   */
  procesarEvento(evento: unknown): Promise<ProcesarEventoResult>;
  /** R27: `maestro` y `admin` de su empresa; el superadmin, de cualquiera; los demás, `forbidden` sin leer. */
  intentosDeFactura(actor: Actor, facturaId: string): Promise<IntentosDeFacturaResult>;
  /**
   * R35–R39: solo el superadmin; los demás, `forbidden` sin leer ni escribir. La entrada se valida otra vez con
   * `marcarPagadoManualSchema`: una referencia en blanco da `referencia_vacia`; otro fallo de forma lanza.
   */
  marcarPagadoManual(actor: Actor, entrada: MarcarPagadoManualInput): Promise<MarcarPagadoManualResult>;
}
