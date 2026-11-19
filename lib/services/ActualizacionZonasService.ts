import { esAccesoTotal } from "@/lib/auth/acceso-total";
import { ForbiddenError } from "@/lib/errors";
import type { IActualizacionZonasRepository } from "@/lib/interfaces/repositories/IActualizacionZonasRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IActualizacionZonasService } from "@/lib/interfaces/services/IActualizacionZonasService";
import type {
  FilaZonaErrada,
  GrupoActualizacionZonasDTO,
  MotivoSaltada,
  OrdenSaltadaDTO,
  ResultadoActualizacionZonasDTO,
  VistaPreviaZonasDTO,
} from "@/lib/types/actualizacion-zonas";
import {
  ESTADOS_DEVOLUCION_SIN_RECONCILIAR,
  paqueteEnEstanteSatelite,
} from "@/lib/utils/estados-bodega-satelite";

/**
 * SLT-224 (R1713) — por que una orden con zona errada NO se actualiza, con la precedencia
 * estante -> devolucion -> cierre o dinero. `null` = se actualiza.
 *
 * Es la MISMA decision que toma el `WHERE` del helper compartido al escribir (el estante por la 377,
 * las devoluciones por `excluirEstados`, el cierre y la gestion por `whereBaseElegible`); aqui solo se
 * le pone nombre para enseñarla. Lo que se escribe lo decide siempre el `WHERE`, no esta funcion.
 */
export function motivoDeSaltada(fila: FilaZonaErrada): MotivoSaltada | null {
  if (paqueteEnEstanteSatelite(fila.estado)) return "estante_satelite";
  if ((ESTADOS_DEVOLUCION_SIN_RECONCILIAR as readonly string[]).includes(fila.estado)) return "devolucion";
  if (fila.conCierre || fila.conGestion) return "cierre_o_dinero";
  return null;
}

function saltadasDe(filas: readonly FilaZonaErrada[]): OrdenSaltadaDTO[] {
  const saltadas: OrdenSaltadaDTO[] = [];
  for (const f of filas) {
    const motivo = motivoDeSaltada(f);
    if (motivo !== null) saltadas.push({ guia: f.guia, motivo });
  }
  return saltadas;
}

/** R1715: las que se actualizarian, agrupadas por zona actual -> nueva, y las saltadas. Pura. */
export function agruparVistaPrevia(filas: readonly FilaZonaErrada[]): VistaPreviaZonasDTO {
  const grupos = new Map<string, GrupoActualizacionZonasDTO>();
  let total = 0;
  for (const f of filas) {
    if (motivoDeSaltada(f) !== null) continue;
    const clave = JSON.stringify([f.zonaActual, f.zonaNueva]);
    const grupo = grupos.get(clave) ?? { zonaActual: f.zonaActual, zonaNueva: f.zonaNueva, cantidad: 0 };
    grupo.cantidad += 1;
    grupos.set(clave, grupo);
    total += 1;
  }
  const ordenados = [...grupos.values()].sort(
    (a, b) =>
      b.cantidad - a.cantidad ||
      a.zonaActual.localeCompare(b.zonaActual) ||
      a.zonaNueva.localeCompare(b.zonaNueva),
  );
  return { grupos: ordenados, total, saltadas: saltadasDe(filas) };
}

/**
 * SLT-224 (design §3b) — «Actualizar zonas». No conoce Prisma ni HTTP. La autorizacion la valida la
 * Server Action antes de instanciarlo (R1714); `actualizar` la vuelve a comprobar porque es la
 * escritura.
 */
export class ActualizacionZonasService implements IActualizacionZonasService {
  constructor(private readonly repo: IActualizacionZonasRepository) {}

  async vistaPrevia(): Promise<VistaPreviaZonasDTO> {
    return agruparVistaPrevia(await this.repo.leerZonaErrada());
  }

  async actualizar(actor: Actor): Promise<ResultadoActualizacionZonasDTO> {
    if (!esAccesoTotal(actor.rol)) throw new ForbiddenError();
    const { actualizadas, restantes } = await this.repo.actualizar(actor.usuarioId);
    return { actualizadas, saltadas: saltadasDe(restantes) };
  }
}
