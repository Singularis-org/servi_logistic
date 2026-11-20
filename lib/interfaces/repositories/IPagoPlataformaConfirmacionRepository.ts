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

/** SLT-143 (design §4.2; R1, R8, R10) — lo que escribe `pago_plataforma_registrar_por_fuera`. */
export interface RegistrarPorFueraRepoInput {
  organizacionId: string;
  /** El id del movimiento, generado por el servicio. */
  pagoId: string;
  /** Texto con dos decimales, > 0. */
  monto: string;
  /** El instante del movimiento, o `null` para «ahora». */
  fecha: Date | null;
  referencia: string;
  claveIdempotencia: string;
  aplicaciones: readonly AplicacionAConfirmar[];
  /** El usuario superadmin que registra; también es quien confirma. */
  por: string;
  ahora: Date;
  /** El comprobante ya subido, o `null` (R8). */
  comprobante: { storagePath: string; contentType: string } | null;
}

/**
 * - `ok`: pago, comprobante, confirmación y aplicaciones guardados (R1);
 * - `ya_registrado`: la clave ya tenía pago; no se escribió nada (R10);
 * - `tope_superado`: el monto supera lo disponible para registrar (R6);
 * - `rechazado`: el reparto no es válido (`SL060`, R5).
 */
export type RegistrarPorFueraRepoResult =
  | { estado: "ok" }
  | { estado: "ya_registrado" }
  | { estado: "tope_superado" }
  | { estado: "rechazado"; error: ErrorDeConfirmacion };

/** SLT-143 (design §4.2; R21) — lo que recibe `pago_plataforma_anular_confirmado`. */
export interface AnularConfirmadoRepoInput {
  organizacionId: string;
  pagoId: string;
  motivo: string;
  /** El usuario superadmin que anula. */
  por: string;
  ahora: Date;
}

/**
 * - `ok`: anulación, constancia y contra-asiento guardados (R21);
 * - `ya_anulado`: ya tenía contra-asiento; no se escribió nada (R24, R27);
 * - `rechazado`: `SL060` (`pago_no_encontrado`, `pago_no_confirmado`, `motivo_vacio`; R23, R25).
 */
export type AnularConfirmadoRepoResult =
  | { estado: "ok" }
  | { estado: "ya_anulado" }
  | { estado: "rechazado"; error: ErrorDeConfirmacion };

export interface IPagoPlataformaConfirmacionRepository {
  /**
   * Los pagos por confirmar de la empresa (del más viejo al más nuevo, con quién los registró y si tienen
   * comprobante) y sus facturas cerradas con saldo > 0 (de la más vieja a la más nueva). R12, R14, R32.
   * SLT-143 (R16): también los pagos confirmados vigentes, del confirmado más reciente al más viejo.
   */
  leer(organizacionId: string): Promise<PagosDeEmpresa>;
  /** Confirma el pago y guarda su reparto en una sola operación (R16). Un error que no es `SL060` se propaga. */
  confirmar(input: ConfirmarPagoRepoInput): Promise<ConfirmarPagoRepoResult>;
  /**
   * El pago a la plataforma `pagoId` de la empresa, o `null` si no existe, no es un pago a la plataforma o
   * es de otra empresa (R34). Corre dentro de `conEmpresa(organizacionId)`: la extensión y la RLS acotan a
   * esa empresa, y el filtro por empresa va además escrito.
   */
  pagoDeLaEmpresa(organizacionId: string, pagoId: string): Promise<{ id: string } | null>;
  /** SLT-143 (R1–R12): registra un pago hecho por fuera, ya confirmado y repartido, en una sola operación. */
  registrarPorFuera(input: RegistrarPorFueraRepoInput): Promise<RegistrarPorFueraRepoResult>;
  /** SLT-143 (R21–R27): anula un pago confirmado en una sola operación. */
  anularConfirmado(input: AnularConfirmadoRepoInput): Promise<AnularConfirmadoRepoResult>;
}
