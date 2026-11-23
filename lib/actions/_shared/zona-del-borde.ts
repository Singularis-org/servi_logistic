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

/**
 * Zona neutra para preparar una consulta SIN actor. Sin sesion no hay empresa de la que leer el
 * pais, y la preparacion responde `validation_error` o `sin_sesion` sin usar el rango que resuelve:
 * esta zona nunca llega a un repositorio ni a una respuesta.
 */
const ZONA_SIN_SESION = "UTC";

/**
 * SLT-42 (R22, R28) — la zona para los bordes de analitica, que preparan la consulta (y su rango)
 * ANTES de saber si el actor puede leer. Con actor, la del pais de su empresa (`zonaDelBorde`); sin
 * actor, la neutra, para que la respuesta siga siendo `validation_error` o `unauthenticated` en
 * vez de un fallo por no tener empresa.
 */
export function zonaDelBordeConActor(
  actor: unknown,
  reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
): Promise<string> {
  return actor === null || actor === undefined ? Promise.resolve(ZONA_SIN_SESION) : zonaDelBorde(reglasPais);
}
