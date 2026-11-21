import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { ComprobanteRecibido } from "@/lib/interfaces/services/IWalletComprobanteService";
import type {
  AnularPagoConfirmadoResult,
  ConfirmarPagoResult,
  RegistrarPagoPorFueraResult,
  VerComprobantePagoResult,
  VerPagosDeEmpresaResult,
} from "@/lib/types/pago-plataforma";

// SLT-60 (design §4.5) — la confirmación del pago a la plataforma, solo para el superadmin (R24). La entrada
// llega sin tipar desde la action y se valida aquí, después de la autorización.

export interface IPagoPlataformaConfirmacionService {
  /** Los pagos por confirmar y las facturas con saldo de una empresa (R12, R14). */
  verDeEmpresa(actor: Actor | null, input: unknown): Promise<VerPagosDeEmpresaResult>;
  /** Confirma un pago con su reparto (R16, R17, R19, R20). */
  confirmar(actor: Actor | null, input: unknown): Promise<ConfirmarPagoResult>;
  /** El enlace temporal al comprobante de un pago de la empresa, sin su ruta (R33, R34). */
  verComprobante(actor: Actor | null, input: unknown): Promise<VerComprobantePagoResult>;
  /** SLT-143: registra un pago hecho por fuera, ya confirmado y repartido, con comprobante opcional (R1–R12). */
  registrarPorFuera(actor: Actor | null, input: unknown, comprobante: ComprobanteRecibido | null): Promise<RegistrarPagoPorFueraResult>;
  /** SLT-143: anula un pago confirmado con motivo (R21–R27). */
  anularConfirmado(actor: Actor | null, input: unknown): Promise<AnularPagoConfirmadoResult>;
}
