import type {
  DistritoDeZona,
  TiendaDePantalla,
  VehiculoDePantalla,
  ZonaDePantalla,
} from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import type { Actor } from "@/lib/interfaces/services/ITarifaService";
import type { EstadoZona } from "@/lib/tarifas/faltantes";
import type { ReferenciaDeZona } from "@/lib/tarifas/referencia-vigente";
import type { GrupoDistritosDTO, TarifaValorDTO } from "@/lib/types/tarifa-flexible";

export type { Actor } from "@/lib/interfaces/services/ITarifaService";

export type ZonaResumen = ZonaDePantalla & EstadoZona;

/** El distrito con su marca (de solo lectura, R45) y el grupo en el que ya esta (R42). */
export interface DistritoDeSelector extends DistritoDeZona {
  grupoId: string | null;
}

export type CargarPantallaResult =
  | {
      status: "ok";
      /** `null` = la empresa no esta activada. */
      activacion: { activadaAt: Date } | null;
      zonas: ZonaResumen[];
      vehiculos: VehiculoDePantalla[];
      tiendas: TiendaDePantalla[];
      /** R41: todos los valores con tienda, de cualquier zona, para su lista. */
      preciosTienda: TarifaValorDTO[];
      /** R55: lo decide el servidor; la pantalla no compara roles. */
      puedeEscribir: boolean;
    }
  | { status: "forbidden" };

export type CargarZonaResult =
  | {
      status: "ok";
      grupos: GrupoDistritosDTO[];
      distritos: DistritoDeSelector[];
      valores: TarifaValorDTO[];
      /** `null` tras activar: no se lee el modelo viejo (R24). */
      referencia: ReferenciaDeZona | null;
    }
  | { status: "forbidden" }
  | { status: "not_found" };

export interface ITarifasPantallaService {
  cargarPantalla(actor: Actor): Promise<CargarPantallaResult>;
  /** `tiendaId`: la tienda elegida en el selector de nivel, para su referencia. */
  cargarZona(input: { zonaId: string; tiendaId?: string }, actor: Actor): Promise<CargarZonaResult>;
}
