import type { LecturaModeloViejo, PedidoModeloViejo } from "@/lib/repositories/_shared/resolver-tarifas";
import type { ValorDeNivel } from "@/lib/tarifas/faltantes";
import type { ArbolCubiertoDTO } from "@/lib/types/geografia-nodo";
import type { GrupoDistritosDTO, TarifaValorDTO } from "@/lib/types/tarifa-flexible";

/**
 * SLT-54 (design §7) — las lecturas de la pantalla de Tarifas. La empresa no viaja en ningun metodo: la
 * pone la extension del cliente y la respalda la RLS (R12).
 */
export interface ZonaDePantalla {
  id: string;
  nombre: string;
  esCentral: boolean;
}

export interface GrupoDeEmpresa {
  id: string;
  zonaId: string;
  nombre: string;
  /** Cuantos distritos tiene: el detalle de la lista de zonas, sin abrir cada zona. */
  distritos: number;
}

export interface VehiculoDePantalla {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface TiendaDePantalla {
  id: string;
  nombre: string;
}

export interface DistritoDeZona {
  id: string;
  nombre: string;
  zonaEspecial: boolean;
  /**
   * SLT-89 (R22; decision humana del 2026-11-10): el nombre del padre del distrito (su canton), para
   * pintar cada miembro de un grupo como «San Antonio · distrito de Escazu» tambien cuando la zona solo
   * tiene distritos y la pantalla no recibe el arbol. Opcional en el tipo para que los dobles de hoy
   * sigan valiendo; el repositorio lo pone siempre.
   */
  padre?: string | null;
}

export interface ITarifasPantallaRepository {
  leerActivacion(): Promise<{ activadaAt: Date } | null>;
  listarZonas(): Promise<ZonaDePantalla[]>;
  buscarZona(zonaId: string): Promise<ZonaDePantalla | null>;
  listarGruposDeEmpresa(): Promise<GrupoDeEmpresa[]>;
  gruposConDistritos(zonaId: string): Promise<GrupoDistritosDTO[]>;
  /** Solo filas de nivel zona o grupo (`tiendaId` y `mensajeroId` nulos): lo que juzgan los faltantes. */
  valoresDeZonaOGrupo(): Promise<ValorDeNivel[]>;
  valoresDeZona(zonaId: string): Promise<TarifaValorDTO[]>;
  preciosDeTienda(): Promise<TarifaValorDTO[]>;
  /** Todo el catalogo, en orden por nombre. Se pide en cada carga: un alta aparece sin tocar nada (R48). */
  listarVehiculos(): Promise<VehiculoDePantalla[]>;
  /** Las cuentas de rol `adminTienda` o `apiKey`. */
  listarTiendas(): Promise<TiendaDePantalla[]>;
  /**
   * `conMarca: false` no lee la marca: tras activar no decide nada y no se muestra (R45). SLT-89 (R23,
   * design §4.4): los distritos que la zona CUBRE, tambien los heredados de un canton o una provincia
   * asignados; con asignaciones solo a distritos, los de `zona_distrito`, como hoy.
   */
  distritosDeZona(zonaId: string, opciones: { conMarca: boolean }): Promise<DistritoDeZona[]>;
  /**
   * SLT-89 (R23, design §4.4): el sub-arbol que la zona cubre, a todas sus profundidades. `null` si la
   * zona solo tiene distritos asignados y nada cuelga de ellos: los posibles miembros son entonces
   * exactamente `distritosDeZona`, y no se carga el catalogo (R38).
   */
  nodosDeZona(zonaId: string): Promise<ArbolCubiertoDTO | null>;
  leerModeloViejo(pedido: PedidoModeloViejo): Promise<LecturaModeloViejo>;
}
