import type { ErrorDeConfirmacion } from "@/lib/db/errores-pago-plataforma";
import type { PagosDeEmpresa } from "@/lib/types/pago-plataforma";

// SLT-60 (design §4.3) — el acceso a datos de la confirmación del pago a la plataforma. La autorización (solo
// el superadmin, R24) la decide el servicio antes de llamar; las reglas del reparto (R15, R17, R19, R20) las
// decide la base en `pago_plataforma_confirmar`, bajo el candado de los pagos de la empresa.

export interface AplicacionAConfirmar {
  facturaId: string;
  /** Texto con dos decimales, > 0 (los de 0 los quita el servicio). */
  monto: string;
}

export interface ConfirmarPagoRepoInput {
  organizacionId: string;
  pagoId: string;
  aplicaciones: readonly AplicacionAConfirmar[];
  /** El usuario superadmin que confirma. */
  por: string;
  ahora: Date;
}

/**
 * - `ok`: confirmación y aplicaciones guardadas (R16);
 * - `ya_confirmado`: el pago ya tenía confirmación; no se escribió nada (R19);
 * - `rechazado`: la base rechazó con `SL060` (R15, R17, R20), con su código y, si aplica, la factura.
 */
export type ConfirmarPagoRepoResult =
  | { estado: "ok" }
  | { estado: "ya_confirmado" }
  | { estado: "rechazado"; error: ErrorDeConfirmacion };

export interface IPagoPlataformaConfirmacionRepository {
  /**
   * Los pagos por confirmar de la empresa (del más viejo al más nuevo, con quién los registró y si tienen
   * comprobante) y sus facturas cerradas con saldo > 0 (de la más vieja a la más nueva). R12, R14, R32.
   */
  leer(organizacionId: string): Promise<PagosDeEmpresa>;
  /** Confirma el pago y guarda su reparto en una sola operación (R16). Un error que no es `SL060` se propaga. */
  confirmar(input: ConfirmarPagoRepoInput): Promise<ConfirmarPagoRepoResult>;
}
