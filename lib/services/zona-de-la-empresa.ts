import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { normalizarFolio } from "@/lib/utils/folio-cierre";
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
 * SLT-153 (R457) — lo que un listado hace con sus filtros: `vacio` (un folio que no puede existir:
 * cero cierres y `total` 0 SIN leer la base) o `aplicar` (los filtros para el repositorio, o
 * `undefined` si no vino el bloque). Discriminado para que ningun llamador pueda olvidar el `vacio`.
 */
export type FiltrosResueltos<F extends RangoDeFechasCierres> =
  | { tipo: "vacio" }
  | { tipo: "aplicar"; filtros: FiltrosEnRepositorio<F> | undefined };

/**
 * Los filtros de cierres tal como los recibe el repositorio: `desde`/`hasta` (fechas del calendario
 * del pais) resueltos en instantes con la zona de la empresa (R22, R23). Sin rango no se lee la zona.
 *
 * SLT-153 (R456, R457): el `folio` sale NORMALIZADO con `normalizarFolio`, la misma regla de
 * `/cierre-dia` (SLT-138, R171). Vacio tras normalizar → la clave desaparece (no recorta). Imposible
 * (un caracter fuera de `0-9A-F` o mas de 8) → `vacio`, antes de leer la zona o la base.
 */
export async function filtrosParaRepo<F extends RangoDeFechasCierres & { folio?: string }>(
  filtros: F | undefined,
  zona: ZonaDeLaOperacion,
): Promise<FiltrosResueltos<F>> {
  if (filtros === undefined) return { tipo: "aplicar", filtros: undefined };
  const { folio, ...resto } = filtros;
  const normalizado = folio === undefined ? { tipo: "ignorar" as const } : normalizarFolio(folio);
  if (normalizado.tipo === "imposible") return { tipo: "vacio" };
  const conLimites = filtrosConLimites(resto, tieneRangoDeFechas(resto) ? await zona() : null);
  return {
    tipo: "aplicar",
    // El cast solo reintroduce `folio`, que `resto` perdio al desestructurar: ya normalizado.
    filtros: {
      ...conLimites,
      ...(normalizado.tipo === "buscar" ? { folio: normalizado.texto } : {}),
    } as FiltrosEnRepositorio<F>,
  };
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
