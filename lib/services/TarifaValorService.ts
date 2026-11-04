import { z } from "zod";

import type { ITarifaValorRepository } from "@/lib/interfaces/repositories/ITarifaValorRepository";
import type {
  Actor,
  FijarValorResult,
  ITarifaValorService,
  ListarValoresResult,
  QuitarValorResult,
} from "@/lib/interfaces/services/ITarifaValorService";
import { nivelDeValor } from "@/lib/tarifas/niveles";
import { escrituraValorSchema, type FijarValorInput } from "@/lib/types/tarifa-flexible";

// R13 (matriz de `TarifaService`, D4): maestro escribe; maestro y admin leen; cualquier otro rol,
// incluido uno que no se reconozca, `forbidden`.
const ROLES_QUE_LEEN = new Set<string>(["maestro", "admin"]);
const ROLES_QUE_ESCRIBEN = new Set<string>(["maestro"]);

type ValidationError = { status: "validation_error"; fieldErrors: Record<string, string[]> };

function errorEn(campo: string, mensaje: string): ValidationError {
  return { status: "validation_error", fieldErrors: { [campo]: [mensaje] } };
}

/**
 * SLT-52 (design §8) — escribe y lee `tarifa_valor`. La empresa sale del contexto (la extension del
 * cliente), nunca del input; el historial lo escribe el repositorio en la misma transaccion (R14).
 */
export class TarifaValorService implements ITarifaValorService {
  constructor(private readonly repo: ITarifaValorRepository) {}

  async fijarValor(input: FijarValorInput, actor: Actor): Promise<FijarValorResult> {
    if (!ROLES_QUE_ESCRIBEN.has(actor.rol)) return { status: "forbidden" };

    // R3/R4/R45: rangos, IVA obligatorio en el cobro y prohibido (tambien "0") en el pago.
    const parseado = escrituraValorSchema.safeParse(input);
    if (!parseado.success) {
      return { status: "validation_error", fieldErrors: z.flattenError(parseado.error).fieldErrors };
    }
    const dato = parseado.data;

    // R7: el nivel tiene que ser de los que admite el actor del concepto.
    const nivel = nivelDeValor(dato.concepto, { ...dato, mensajeroId: null });
    if (!nivel.ok) return errorEn(nivel.campo, nivel.mensaje);

    const referencias = await this.referenciasInvalidas(dato);
    if (referencias !== null) return referencias;

    const { id } = await this.repo.fijar(
      {
        concepto: dato.concepto,
        modo: dato.modo,
        valor: dato.valor,
        ivaPct: "ivaPct" in dato && dato.ivaPct !== undefined ? dato.ivaPct : null,
        nivel: nivel.nivel,
        zonaId: dato.zonaId,
        grupoId: dato.grupoId,
        tiendaId: dato.tiendaId,
        vehiculoId: dato.vehiculoId,
      },
      actor.usuarioId,
    );
    return { status: "ok", id };
  }

  async quitarValor(id: string, actor: Actor): Promise<QuitarValorResult> {
    if (!ROLES_QUE_ESCRIBEN.has(actor.rol)) return { status: "forbidden" };
    const res = await this.repo.quitar(id, actor.usuarioId);
    return { status: res };
  }

  async listarValores(filtro: { zonaId?: string }, actor: Actor): Promise<ListarValoresResult> {
    if (!ROLES_QUE_LEEN.has(actor.rol)) return { status: "forbidden" };
    return { status: "ok", items: await this.repo.listar(filtro) };
  }

  /**
   * Que cada referencia exista EN LA EMPRESA (la extension filtra) y sea coherente: el grupo de ESA
   * zona y la tienda con rol tarifable. Sin esto, un id ajeno escaparia como error crudo de FK.
   */
  private async referenciasInvalidas(dato: {
    zonaId: string | null;
    grupoId: string | null;
    tiendaId: string | null;
    vehiculoId: string | null;
  }): Promise<ValidationError | null> {
    if (dato.zonaId !== null && !(await this.repo.existeZona(dato.zonaId))) {
      return errorEn("zonaId", "La zona indicada no existe.");
    }
    if (dato.grupoId !== null && dato.zonaId !== null && !(await this.repo.grupoEnZona(dato.grupoId, dato.zonaId))) {
      return errorEn("grupoId", "El grupo indicado no es de esa zona.");
    }
    if (dato.tiendaId !== null && !(await this.repo.esTiendaTarifable(dato.tiendaId))) {
      return errorEn("tiendaId", "El valor debe asignarse a un adminTienda o a una API key.");
    }
    if (dato.vehiculoId !== null && !(await this.repo.existeVehiculo(dato.vehiculoId))) {
      return errorEn("vehiculoId", "El vehículo indicado no existe.");
    }
    return null;
  }
}
