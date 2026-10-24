import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-40 (design §5, §8) — lo que la empresa debe a la plataforma, para la wallet.
//
// Los dos tipos de abajo viven aquí y no en `lib/types/cobro-plataforma.ts` (donde los pone design
// §8) porque ese archivo es de T5, que se escribe en paralelo: así ninguna de las dos tasks pisa a la
// otra. La forma es la de design §8.

/** La deuda, derivada en el servidor: texto con dos decimales (R26). */
export type DeudaPlataformaDTO = { deuda: string };

export type VerDeudaPlataformaResult =
  | { status: "ok"; deudaPlataforma: DeudaPlataformaDTO }
  | { status: "forbidden" }; // R25

export interface IDeudaPlataformaService {
  /**
   * La deuda de la empresa del actor: Σ cargos − Σ reversos de toda su historia (R23, R24). Sin
   * acceso total, `forbidden` antes de consultar la base (R25).
   */
  verDeuda(actor: Actor | null): Promise<VerDeudaPlataformaResult>;
}
