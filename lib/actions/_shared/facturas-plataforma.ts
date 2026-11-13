import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IFacturaPlataformaService } from "@/lib/interfaces/services/IFacturaPlataformaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";
import { FacturaPlataformaService } from "@/lib/services/FacturaPlataformaService";
import type { FacturasResult } from "@/lib/types/factura-plataforma";

// SLT-119 (design §5) — el composition root de las facturas de la plataforma. No es una Server Action (sin
// "use server"): la lista la piden las páginas, que ya resolvieron el actor de la sesión, y no necesita
// endpoint. Patrón de `lib/actions/_shared/mi-plan.ts`. El detalle sí es una action (`lib/actions/facturas-plataforma.ts`).

/** El servicio con su repositorio real (el cliente con la extensión de empresa). */
export function construirFacturaPlataformaService(prisma = getPrismaClient()): IFacturaPlataformaService {
  return new FacturaPlataformaService(new FacturaPlataformaRepository(prisma));
}

/** R1, R13: las facturas de la empresa de la sesión; `forbidden` sin leer nada si no es `maestro`. */
export async function verFacturasDeMiPlan(
  actor: Actor | null,
  servicio: IFacturaPlataformaService = construirFacturaPlataformaService(),
): Promise<FacturasResult> {
  return servicio.deMiEmpresa(actor);
}

/** R12, R13: las facturas de la empresa `organizacionId`; `forbidden` sin leer nada si no es el superadmin. */
export async function verFacturasDeEmpresa(
  actor: Actor | null,
  input: { organizacionId: string },
  servicio: IFacturaPlataformaService = construirFacturaPlataformaService(),
): Promise<FacturasResult> {
  return servicio.deEmpresa(actor, input);
}
