import type { LecturaModeloViejo, PedidoModeloViejo } from "@/lib/repositories/_shared/resolver-tarifas";
import type { ValorDeNivel } from "@/lib/tarifas/faltantes";
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
  /** `conMarca: false` no lee la marca: tras activar no decide nada y no se muestra (R45). */
  distritosDeZona(zonaId: string, opciones: { conMarca: boolean }): Promise<DistritoDeZona[]>;
  leerModeloViejo(pedido: PedidoModeloViejo): Promise<LecturaModeloViejo>;
}
