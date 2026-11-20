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
import { CLASE_RECONCILIACION_ZONA } from "@/lib/utils/estados-bodega-satelite";

/**
 * SLT-224 PR 2 (R1726) — por que una orden con zona errada NO se actualiza. `null` = se actualiza.
 * Primero la clase de su estado (si no es `se_mueve`, ese es el motivo); despues el cobro en curso.
 * La precedencia de R1726 sale por construccion: el estado manda sobre el cobro.
 *
 * Es la MISMA decision que toma el `WHERE` del helper compartido al escribir (el `notIn` de
 * `ESTADOS_QUE_NO_SE_MUEVEN` y el corte de dinero de `whereBaseElegible`); aqui solo se le pone
 * nombre para enseñarla. Lo que se escribe lo decide siempre el `WHERE`, no esta funcion.
 */
export function motivoDeSaltada(fila: FilaZonaErrada): MotivoSaltada | null {
  const clase = CLASE_RECONCILIACION_ZONA[fila.estado];
  if (clase !== "se_mueve") return clase;
  return fila.cobroEnCurso ? "cobro_en_curso" : null;
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
