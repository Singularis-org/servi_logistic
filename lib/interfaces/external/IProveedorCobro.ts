import type { ProveedorCobroId } from "@/lib/types/cobro";

// SLT-226 (design §4.2) — el puerto mínimo del proveedor de cobro. SLT-227 «Cobro automático: proveedor de cobro
// y adaptador de Rebill» lo amplía (`crearEnlace`, `verificarFirma`, `devolver`) y escribe el adaptador; aquí los
// tests usan un doble en memoria.

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

export interface IProveedorCobro {
  readonly proveedor: ProveedorCobroId;
  /** El estado REAL del pago (R14). `null` si el proveedor no lo conoce. Lanza si la consulta falla (R16). */
  consultarPago(pagoProveedorId: string): Promise<PagoDelProveedor | null>;
}
