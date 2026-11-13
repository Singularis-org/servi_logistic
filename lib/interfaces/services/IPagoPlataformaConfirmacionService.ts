import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { ConfirmarPagoResult, VerPagosDeEmpresaResult } from "@/lib/types/pago-plataforma";

// SLT-60 (design §4.5) — la confirmación del pago a la plataforma, solo para el superadmin (R24). La entrada
// llega sin tipar desde la action y se valida aquí, después de la autorización.

export interface IPagoPlataformaConfirmacionService {
  /** Los pagos por confirmar y las facturas con saldo de una empresa (R12, R14). */
  verDeEmpresa(actor: Actor | null, input: unknown): Promise<VerPagosDeEmpresaResult>;
  /** Confirma un pago con su reparto (R16, R17, R19, R20). */
  confirmar(actor: Actor | null, input: unknown): Promise<ConfirmarPagoResult>;
}
