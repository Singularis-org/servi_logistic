import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import {
  filtrosConLimites,
  tieneRangoDeFechas,
  type FiltrosEnRepositorio,
  type RangoDeFechasCierres,
} from "@/lib/types/filtros-cierres";

// SLT-42 (design §4.3; R22, R28, R30) — la zona horaria con la que un servicio calcula «hoy», un dia
// de reparto o los limites de un dia: la del pais de la empresa en curso, leida UNA vez por operacion.
//
// Los servicios reciben `IReglasPaisEmpresa` por constructor (la implementacion real la pone su
// composition root, `construirReglasPaisEmpresa`). Si un composition root la olvida, la operacion
// falla aqui con un mensaje que lo nombra, en vez de calcular con una zona inventada. Sin zona en
// el pais, `zonaHoraria()` lanza `PaisSinZonaHoraria` (R28). Nada se guarda entre llamadas (R30).

export async function zonaDeLaEmpresa(
  reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria"> | undefined,
  operacion: string,
): Promise<string> {
  if (!reglasPais) {
    throw new Error(
      `${operacion} requiere las reglas del pais de la empresa: sin ellas no hay zona horaria con ` +
        "que calcular el dia (SLT-42)",
    );
  }
  return reglasPais.zonaHoraria();
}

/** SLT-42 (R22, R28): la zona de una operacion, perezosa: se lee como mucho UNA vez y solo si hace falta. */
export type ZonaDeLaOperacion = () => Promise<string>;

/**
 * Una `ZonaDeLaOperacion` para `operacion`: la primera llamada lee la zona y las siguientes reusan
 * esa misma lectura. Vive lo que vive la operacion (nada de variables de modulo, R30).
 */
export function zonaPerezosa(
  reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria"> | undefined,
  operacion: string,
): ZonaDeLaOperacion {
  let leida: Promise<string> | undefined;
  return () => (leida ??= zonaDeLaEmpresa(reglasPais, operacion));
}

/**
 * Los filtros de cierres tal como los recibe el repositorio: `desde`/`hasta` (fechas del calendario
 * del pais) resueltos en instantes con la zona de la empresa (R22, R23). Sin rango no se lee la zona.
 */
export async function filtrosParaRepo<F extends RangoDeFechasCierres>(
  filtros: F | undefined,
  zona: ZonaDeLaOperacion,
): Promise<FiltrosEnRepositorio<F> | undefined> {
  if (filtros === undefined) return undefined;
  return filtrosConLimites(filtros, tieneRangoDeFechas(filtros) ? await zona() : null);
}

/**
 * SLT-42 (R22, R28) — la zona horaria del pais de UNA empresa nombrada por id, para quien no corre
 * en el contexto de esa empresa (el superadmin, en plataforma, que muestra fechas de una empresa).
 * Empresa inexistente: error; sin zona en su pais, `PaisSinZonaHoraria` (R28).
 */
export type ZonaDeOrganizacion = (organizacionId: string) => Promise<string>;

export function zonaDeOrganizacionCon(repo: Pick<IPaisRepository, "deLaEmpresa">): ZonaDeOrganizacion {
  return async (organizacionId) => {
    const pais = await repo.deLaEmpresa(organizacionId);
    if (pais === null) throw new Error(`zonaDeOrganizacion: la empresa ${organizacionId} no existe`);
    if (pais.zonaHoraria === null) throw new PaisSinZonaHoraria(pais.id);
    return pais.zonaHoraria;
  };
}
