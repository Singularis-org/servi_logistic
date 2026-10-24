import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { DeudaPlataformaDTO } from "@/lib/types/cobro-plataforma";

// SL-40 (design §5, §8) — lo que la empresa debe a la plataforma, para la wallet. SL-45 (design §3):
// el DTO gana `estado` e `importe` y se muda a `lib/types/cobro-plataforma.ts`, porque también lo
// usa la pantalla «Empresas». Se reexporta aquí para que los importadores de SL-40 no cambien.

export type { DeudaPlataformaDTO };

export type VerDeudaPlataformaResult =
  | { status: "ok"; deudaPlataforma: DeudaPlataformaDTO }
  | { status: "forbidden" }; // R25

export interface IDeudaPlataformaService {
  /**
   * La deuda de la empresa del actor: Σ cargos − Σ reversos − Σ pagos vigentes de toda su historia
   * (SL-40 R23, R24; SL-45 R13, R14). Sin acceso total, `forbidden` antes de consultar la base (R25).
   */
  verDeuda(actor: Actor | null): Promise<VerDeudaPlataformaResult>;
}
