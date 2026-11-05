import type {
  ITarifasPantallaRepository,
  VehiculoDePantalla,
  ZonaDePantalla,
} from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import type {
  FaltantesPorZona,
  IFaltantesDeActivacion,
} from "@/lib/interfaces/services/ITarifaActivacionService";
import type {
  Actor,
  CargarPantallaResult,
  CargarZonaResult,
  DistritoDeSelector,
  ITarifasPantallaService,
  ZonaResumen,
} from "@/lib/interfaces/services/ITarifasPantallaService";
import {
  claveCobroViejo,
  clavePagoViejo,
  SIN_TIENDA,
  type ParModeloViejo,
} from "@/lib/repositories/_shared/resolver-tarifas";
import { faltantesDeZona } from "@/lib/tarifas/faltantes";
import { referenciaDeZona, type ReferenciaDeZona } from "@/lib/tarifas/referencia-vigente";
import type { GrupoDistritosDTO } from "@/lib/types/tarifa-flexible";

// SLT-52 R13 y SLT-54 R55: maestro y admin leen; cualquier otro rol, incluido uno que no se reconozca,
// `forbidden`. Solo el maestro escribe.
const ROLES_QUE_LEEN = new Set<string>(["maestro", "admin"]);

/**
 * SLT-54 (design §5, §6, §7) — lo que lee `/configuracion/tarifas`. Es tambien quien calcula los
 * faltantes al activar: la lista que ve el maestro y la que decide la confirmacion (R6) son la misma.
 */
export class TarifasPantallaService implements ITarifasPantallaService, IFaltantesDeActivacion {
  constructor(private readonly repo: ITarifasPantallaRepository) {}

  async cargarPantalla(actor: Actor): Promise<CargarPantallaResult> {
    if (!ROLES_QUE_LEEN.has(actor.rol)) return { status: "forbidden" };
    const activacion = await this.repo.leerActivacion();
    const vehiculos = await this.repo.listarVehiculos();
    const zonas = await this.zonasConEstado(vehiculos);
    return {
      status: "ok",
      activacion,
      zonas,
      vehiculos,
      tiendas: await this.repo.listarTiendas(),
      preciosTienda: await this.repo.preciosDeTienda(),
      puedeEscribir: actor.rol === "maestro",
    };
  }

  async cargarZona(input: { zonaId: string; tiendaId?: string }, actor: Actor): Promise<CargarZonaResult> {
    if (!ROLES_QUE_LEEN.has(actor.rol)) return { status: "forbidden" };
    const zona = await this.repo.buscarZona(input.zonaId);
    // Una zona de otra empresa no se ve (R12): para esta es como si no existiera.
    if (zona === null) return { status: "not_found" };

    const activada = (await this.repo.leerActivacion()) !== null;
    const grupos = await this.repo.gruposConDistritos(zona.id);
    const distritos = conGrupo(await this.repo.distritosDeZona(zona.id, { conMarca: !activada }), grupos);
    return {
      status: "ok",
      grupos,
      distritos,
      valores: await this.repo.valoresDeZona(zona.id),
      referencia: activada ? null : await this.referencia(zona, grupos, distritos, input.tiendaId ?? null),
    };
  }

  /** Puerta de `TarifaActivacionService`: quien la llama ya comprobo el rol (R5). */
  async faltantesPorZona(): Promise<readonly FaltantesPorZona[]> {
    const zonas = await this.zonasConEstado(await this.repo.listarVehiculos());
    return zonas.map((z) => ({
      zonaId: z.id,
      zonaNombre: z.nombre,
      faltantes: z.faltantes,
      usaZona: z.usaZona,
    }));
  }

  /** Consultas fijas, sin N+1: la empresa entera de una vez y se reparte en memoria. */
  private async zonasConEstado(vehiculos: readonly VehiculoDePantalla[]): Promise<ZonaResumen[]> {
    const zonas = await this.repo.listarZonas();
    const grupos = await this.repo.listarGruposDeEmpresa();
    const valores = await this.repo.valoresDeZonaOGrupo();
    const vehiculosActivos = vehiculos.filter((v) => v.activo);
    return zonas.map((zona) => {
      const deLaZona = grupos.filter((g) => g.zonaId === zona.id);
      return {
        ...zona,
        grupos: deLaZona.map(({ nombre, distritos }) => ({ nombre, distritos })),
        ...faltantesDeZona({ zona, grupos: deLaZona, valores, vehiculosActivos }),
      };
    });
  }

  private async referencia(
    zona: ZonaDePantalla,
    grupos: readonly GrupoDistritosDTO[],
    distritos: readonly DistritoDeSelector[],
    tiendaId: string | null,
  ): Promise<ReferenciaDeZona> {
    const vehiculos = await this.repo.listarVehiculos();
    const parZona: ParModeloViejo = { tiendaId: SIN_TIENDA, zonaId: zona.id };
    const parTiendaZona: ParModeloViejo | null = tiendaId === null ? null : { tiendaId, zonaId: zona.id };
    const parTiendaGeneral: ParModeloViejo | null = tiendaId === null ? null : { tiendaId, zonaId: null };

    const lectura = await this.repo.leerModeloViejo({
      pares: [parZona, parTiendaZona, parTiendaGeneral].filter((p): p is ParModeloViejo => p !== null),
      pagos: [{ zonaId: zona.id, vehiculoId: null }, ...vehiculos.map((v) => ({ zonaId: zona.id, vehiculoId: v.id }))],
    });
    const cobroDe = (par: ParModeloViejo) => lectura.cobros.get(claveCobroViejo(par)) ?? null;

    return referenciaDeZona({
      esCentral: zona.esCentral,
      distritos,
      grupoIds: grupos.map((g) => g.id),
      cobroZona: cobroDe(parZona),
      pagoGeneral: lectura.pagos.get(clavePagoViejo(zona.id, null)) ?? null,
      pagosPorVehiculo: new Map(
        vehiculos.map((v) => [v.id, lectura.pagos.get(clavePagoViejo(zona.id, v.id)) ?? null]),
      ),
      tienda:
        parTiendaZona === null || parTiendaGeneral === null
          ? null
          : { cobroEnZona: cobroDe(parTiendaZona), cobroEnTodasSusZonas: cobroDe(parTiendaGeneral) },
    });
  }
}

/** R42: cada distrito con el grupo en el que ya esta. R46: la marca y el grupo no se tocan entre si. */
function conGrupo(
  distritos: readonly Omit<DistritoDeSelector, "grupoId">[],
  grupos: readonly GrupoDistritosDTO[],
): DistritoDeSelector[] {
  const grupoDe = new Map(grupos.flatMap((g) => g.distritos.map((d) => [d.id, g.id] as const)));
  return distritos.map((d) => ({ ...d, grupoId: grupoDe.get(d.id) ?? null }));
}
