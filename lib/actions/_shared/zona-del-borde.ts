// SLT-42 (design §4.3; R22, R28) — la zona horaria del pais de la empresa para un BORDE (Server Action)
// que construye un schema con «hoy» (`(zona) => schema`, T5.2). La lee la implementacion real de
// `IReglasPaisEmpresa` (la empresa sale de la sesion); los tests la inyectan con `reglasPaisFijas`.
// Sin zona en el pais, `PaisSinZonaHoraria` (R28): la accion falla antes de tocar nada.
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { construirReglasPaisEmpresa } from "@/lib/services/ReglasPaisEmpresaService";

export function zonaDelBorde(reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">): Promise<string> {
  return (reglasPais ?? construirReglasPaisEmpresa(getPrismaClient())).zonaHoraria();
}
