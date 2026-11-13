import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { DetalleFacturaResult, FacturasResult } from "@/lib/types/factura-plataforma";

// SLT-119 (design §4) — las facturas de la plataforma que ve la empresa: el maestro las de la suya, en «Mi
// plan», y el superadmin las de la empresa que nombra. Solo lectura (R16). La autorización va antes que la
// base (R13) y la entrada se valida antes que la base (R15).

export interface IFacturaPlataformaService {
  /** R1, R13: las facturas de la empresa del maestro, de la más reciente a la más antigua. */
  deMiEmpresa(actor: Actor | null): Promise<FacturasResult>;

  /** R6–R11, R13–R15: el detalle de una factura de la empresa del maestro; `input` es `{ facturaId, pagina? }`. */
  detalleDeMiEmpresa(actor: Actor | null, input: unknown): Promise<DetalleFacturaResult>;

  /**
   * R12, R13: las facturas de la empresa que nombra el superadmin, de la más reciente a la más antigua.
   * `input` es `{ organizacionId }`. `FacturasResult` no tiene `validation_error` (design §3): un
   * `organizacionId` que no es uuid lanza sin leer la base, y la página lo aísla como un fallo (R17).
   */
  deEmpresa(actor: Actor | null, input: unknown): Promise<FacturasResult>;

  /** R12–R15: el detalle de una factura de la empresa que nombra el superadmin; `{ organizacionId, facturaId, pagina? }`. */
  detalleDeEmpresa(actor: Actor | null, input: unknown): Promise<DetalleFacturaResult>;
}
