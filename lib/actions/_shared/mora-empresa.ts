import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IMoraEmpresaService } from "@/lib/interfaces/services/IMoraEmpresaService";
import { MoraEmpresaRepository } from "@/lib/repositories/MoraEmpresaRepository";
import { MoraEmpresaService } from "@/lib/services/MoraEmpresaService";

// SLT-121 (design §5.4) — el composition root de la mora. Vive fuera del archivo "use server" a propósito: ahí
// toda función exportada es un endpoint, y construir el servicio no debe poder llamarse desde el navegador.

/** El servicio con su repositorio real (el cliente con la extensión de empresa). */
export function construirMoraEmpresaService(prisma = getPrismaClient()): IMoraEmpresaService {
  return new MoraEmpresaService(new MoraEmpresaRepository(prisma));
}
