import type { PrismaClient } from "@prisma/client";

import type {
  ActorDeAltaDePais,
  CrearPaisRepoResultado,
  IPaisRepository,
} from "@/lib/interfaces/repositories/IPaisRepository";
import { textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import { appendAccionPlataforma } from "@/lib/repositories/registrar-accion-plataforma";
import { resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import type { DatosDeAltaDePais, PaisDisponibleDTO, PaisDTO } from "@/lib/types/pais";

/**
 * SL-20 (design §2.1, §5; R23, R33) — la tabla `pais`, de plataforma.
 *
 * No abre `comoPlataforma`: el contexto lo pone quien llama (la action del superadmin para leer y
 * crear; el layout, en el contexto de la empresa, para `deLaEmpresa`). Una empresa lee `pais` y no
 * lo escribe (R3): un `crear` fuera de plataforma lo rechaza la base.
 */
export type PaisPrismaClient = Pick<PrismaClient, "pais" | "organizacion" | "$transaction">;

/** Lo que sale de la base de cada país: el DTO entero, nada más (`created_at` no lo usa nadie). */
const SELECT_PAIS = {
  id: true,
  nombre: true,
  nivel1Singular: true,
  nivel1Plural: true,
  nivel2Singular: true,
  nivel2Plural: true,
  nivel3Singular: true,
  nivel3Plural: true,
  digitosCodigoNivel1: true,
  digitosCodigoNivel2: true,
  digitosCodigoNivel3: true,
  disponible: true,
} as const;

export class PaisRepository implements IPaisRepository {
  constructor(private readonly prisma: PaisPrismaClient) {}

  listar(): Promise<PaisDTO[]> {
    return this.prisma.pais.findMany({ orderBy: [{ nombre: "asc" }], select: SELECT_PAIS });
  }

  /** R9/R45: el filtro va en el SQL, no en la pantalla; un país apagado no sale de la base. */
  listarDisponibles(): Promise<PaisDisponibleDTO[]> {
    return this.prisma.pais.findMany({
      where: { disponible: true },
      orderBy: [{ nombre: "asc" }],
      select: { id: true, nombre: true },
    });
  }

  porId(id: string): Promise<PaisDTO | null> {
    return this.prisma.pais.findUnique({ where: { id }, select: SELECT_PAIS });
  }

  /**
   * El país y su fila `pais_creado` en la MISMA transacción (R33): si el registro falla, el país no
   * queda. Un único violado (otra alta igual que ganó la carrera) es `duplicado`; cualquier otro
   * error sube tal cual, para que la action lo registre y responda `error` (R36).
   */
  async crear(datos: DatosDeAltaDePais, actor: ActorDeAltaDePais): Promise<CrearPaisRepoResultado> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const pais = await tx.pais.create({ data: datos, select: SELECT_PAIS });
        const congelado = await resolverActorCongelado(tx, actor.usuarioId);
        await appendAccionPlataforma(tx, [
          {
            accion: "pais_creado",
            entidadTipo: "pais",
            entidadId: pais.id,
            entidadEtiqueta: pais.nombre,
            paisId: pais.id,
            actorUsuarioId: congelado.actorUsuarioId,
            actorNombre: congelado.actorNombre,
          },
        ]);
        return { estado: "creado", pais };
      });
    } catch (error) {
      const campo = campoDuplicado(error);
      if (campo) return { estado: "duplicado", campo };
      throw error;
    }
  }

  /**
   * R47. El `updateMany` con `disponible <> $2` es el «IS DISTINCT FROM» de §5 (la columna es NOT
   * NULL): decide en una sola sentencia si hubo cambio, así que dos peticiones iguales a la vez dejan
   * una sola fila en el historial. Solo con cero filas se mira si el país existe.
   */
  async cambiarDisponible(
    id: string,
    disponible: boolean,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "sin_cambio" | "cambiado"> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.pais.updateMany({
        where: { id, disponible: { not: disponible } },
        data: { disponible },
      });
      const pais = await tx.pais.findUnique({ where: { id }, select: { nombre: true } });
      if (pais === null) return "no_existe";
      if (count === 0) return "sin_cambio";

      const congelado = await resolverActorCongelado(tx, actor.usuarioId);
      await appendAccionPlataforma(tx, [
        {
          accion: disponible ? "pais_disponibilidad_activada" : "pais_disponibilidad_desactivada",
          entidadTipo: "pais",
          entidadId: id,
          entidadEtiqueta: pais.nombre,
          paisId: id,
          actorUsuarioId: congelado.actorUsuarioId,
          actorNombre: congelado.actorNombre,
        },
      ]);
      return "cambiado";
    });
  }

  async deLaEmpresa(organizacionId: string): Promise<PaisDTO | null> {
    const fila = await this.prisma.organizacion.findUnique({
      where: { id: organizacionId },
      select: { pais: { select: SELECT_PAIS } },
    });
    return fila?.pais ?? null;
  }
}

/**
 * El campo de un P2002. En esta transacción solo `pais` tiene únicos: `pais_nombre_key` (o
 * `target: ["nombre"]` sin adapter) es el nombre, y el otro, `pais_pkey`, el código. No se busca
 * «id» en el texto: el mensaje en español dice «unicidad», que lo contiene.
 */
function campoDuplicado(error: unknown): "id" | "nombre" | null {
  const texto = textoConstraintP2002(error);
  if (!texto) return null;
  return texto.includes("nombre") ? "nombre" : "id";
}
