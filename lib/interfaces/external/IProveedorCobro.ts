import type { EntornoCobro, MetodoCobro, ProveedorCobroId } from "@/lib/types/cobro";

// SLT-226 (design §4.2) — el puerto mínimo del proveedor de cobro, `IConsultaPagoProveedor`. SLT-227 (design §3) lo
// amplía en `IProveedorCobro` (`crearEnlace`, `verificarFirma`, `devolver`). Se parte en dos porque
// `CobroIntentoService` solo consulta: con el puerto entero, su doble tendría que implementar tres métodos que no usa.
// Toda operación que falla lanza `ProveedorCobroError` (`lib/types/cobro.ts`).

/** `aprobado` no lo produce `cobro_intento_avanzar`: se llega registrando el pago (design §3.5, R9). */
export type EstadoPagoProveedor = "pendiente" | "aprobado" | "rechazado" | "expirado" | "devuelto" | "contracargo";

export interface PagoDelProveedor {
  pagoProveedorId: string;
  /** El id del cobro que el proveedor creó para el intento (`cobro_intento.id_externo`, R10). */
  idExterno: string;
  estado: EstadoPagoProveedor;
  /** En texto decimal, como lo compara la base con `monto_cobrado` (R21). */
  monto: string;
  moneda: string;
}

/** El puerto que ya usa SLT-226 (§4.2). Su firma no cambia (SLT-227 R1, R27). */
export interface IConsultaPagoProveedor {
  readonly proveedor: ProveedorCobroId;
  /** El estado REAL del pago (R14). `null` si el proveedor no lo conoce. Lanza si la consulta falla (R16). */
  consultarPago(pagoProveedorId: string): Promise<PagoDelProveedor | null>;
}

export interface CrearEnlaceEntrada {
  /** Va en la `metadata` del enlace, para atar el pago al intento sin depender solo del id del enlace. */
  intentoId: string;
  facturaId: string;
  /** Decimal en texto, > 0, con dos decimales. Nunca pasa por `Number`. */
  monto: string;
  /** ISO 4217. La pasa quien llama (la del intento): el adaptador no elige moneda. */
  moneda: string;
  metodo: MetodoCobro;
  /** La arma quien llama (SLT-230). */
  descripcion: string;
}

export interface EnlaceDelProveedor {
  idExterno: string;
  url: string;
  venceAt: Date | null;
}

export interface AvisoFirmado {
  /** Los bytes tal cual llegaron: la firma es sobre el cuerpo crudo (SLT-228). */
  cuerpoCrudo: string;
  /** Con los nombres en minúsculas. */
  cabeceras: Readonly<Record<string, string | undefined>>;
}

/** `monto` es parcial o total. */
export interface DevolverEntrada {
  pagoProveedorId: string;
  monto: string;
  moneda: string;
}

export type EstadoDevolucion = "pendiente" | "aprobada" | "rechazada";

/** Rebill solo responde `{ status }`: no hay id de devolución (P3). */
export interface DevolucionDelProveedor {
  estado: EstadoDevolucion;
}

export interface IProveedorCobro extends IConsultaPagoProveedor {
  /** Nunca se reintenta (R22): un reintento tras un tiempo agotado podría crear dos enlaces. */
  crearEnlace(entrada: CrearEnlaceEntrada): Promise<EnlaceDelProveedor>;
  /** Sin red (R18). Asíncrona porque lee el secreto del webhook de la bóveda. */
  verificarFirma(aviso: AvisoFirmado): Promise<boolean>;
  /** Nunca se reintenta (R22): un reintento podría devolver dos veces. */
  devolver(entrada: DevolverEntrada): Promise<DevolucionDelProveedor>;
}

export interface TrioCredencialCobro {
  proveedor: ProveedorCobroId;
  paisId: string;
  entorno: EntornoCobro;
}

/**
 * Lo único que el adaptador sabe de las credenciales (design §8.3, R11): los secretos descifrados del trío, o `null`
 * si no hay fila. Es un tipo de función y no una interfaz para que el adaptador no reciba nada más.
 */
export type LeerCredencialesCobro = (clave: TrioCredencialCobro) => Promise<Readonly<Record<string, string>> | null>;
