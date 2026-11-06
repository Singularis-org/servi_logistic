import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type {
  ActorDeAltaDePais,
  CrearPaisRepoResultado,
  IPaisRepository,
} from "@/lib/interfaces/repositories/IPaisRepository";
import { textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import { appendAccionPlataforma } from "@/lib/repositories/registrar-accion-plataforma";
import { resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import type { DatosDeAltaDePais, PaisDisponibleDTO, PaisDTO, TipoDocumentoDTO } from "@/lib/types/pais";
import type { ReglaDocumento } from "@/lib/utils/documento";

/**
 * SL-20 (design §2.1, §5; R23, R33) — la tabla `pais`, de plataforma.
 *
 * No abre `comoPlataforma`: el contexto lo pone quien llama (la action del superadmin para leer y
 * crear; el layout, en el contexto de la empresa, para `deLaEmpresa`). Una empresa lee `pais` y no
 * lo escribe (R3): un `crear` fuera de plataforma lo rechaza la base.
 *
 * SLT-42: la única excepción es `zonasConEmpresas`, que abre `comoPlataforma` ella misma (design §6.1).
 */
export type PaisPrismaClient = Pick<PrismaClient, "pais" | "organizacion" | "tipoIdentificacion" | "$transaction">;

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
  // SLT-42 (R1): teléfono y hora del país.
  prefijoTelefonico: true,
  telefonoDigitosNacionales: true,
  zonaHoraria: true,
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

  /**
   * SLT-42 (R11). El país va en el `WHERE`: un `id` o un `value` de otro país no casa. Si el texto
   * casara con el `id` de un tipo y el `value` de otro, gana el `id`.
   */
  async tipoDocumentoDelPais(paisId: string, idOValue: string): Promise<TipoDocumentoDTO | null> {
    // Sin `select`: la fila es corta y el DTO se arma campo a campo abajo. (Un `select` con el
    // literal del flag lo confundiría la guardia de 374, que lo reserva a la geografía.)
    const filas = await this.prisma.tipoIdentificacion.findMany({
      where: { paisId, OR: [{ id: idOValue }, { value: idOValue }] },
    });
    const fila = filas.find((f) => f.id === idOValue) ?? filas[0];
    if (!fila) return null;
    return {
      id: fila.id,
      value: fila.value,
      paisId: fila.paisId,
      clave: fila.clave,
      nombre: fila.nombre,
      caracteres: caracteresDeDocumento(fila.caracteres),
      largoMin: fila.largoMin,
      largoMax: fila.largoMax,
      activo: fila.activo,
    };
  }

  /** SLT-42 (R6). El inactivo no cuenta: no se puede elegir en ningún alta (R11). */
  async tieneTipoDocumentoActivo(paisId: string): Promise<boolean> {
    const fila = await this.prisma.tipoIdentificacion.findFirst({ where: { paisId, activo: true }, select: { id: true } });
    return fila !== null;
  }

  /**
   * SLT-42 (design §6.1, R25): `SELECT DISTINCT p.zona_horaria FROM pais p JOIN organizacion o ON
   * o.pais_id = p.id WHERE p.zona_horaria IS NOT NULL`, escrito con el cliente. En plataforma porque
   * la cola de jobs no tiene empresa y la RLS de `organizacion` solo deja ver la propia.
   */
  zonasConEmpresas(): Promise<string[]> {
    return comoPlataforma("SL-20", "SLT-42: zonas horarias de los países con empresas, para agendar los jobs diarios por zona", async () => {
      const filas = await this.prisma.pais.findMany({
        where: { zonaHoraria: { not: null }, organizaciones: { some: {} } },
        distinct: ["zonaHoraria"],
        orderBy: [{ zonaHoraria: "asc" }],
        select: { zonaHoraria: true },
      });
      return filas.flatMap((f) => (f.zonaHoraria === null ? [] : [f.zonaHoraria]));
    });
  }
}

/**
 * La columna es `TEXT` con el CHECK `tipo_identificacion_caracteres` (`digitos` | `alfanumerico`).
 * Otro valor es una base que no cumple su propia regla: se lanza en vez de validar con una regla inventada.
 */
function caracteresDeDocumento(valor: string): ReglaDocumento["caracteres"] {
  if (valor === "digitos" || valor === "alfanumerico") return valor;
  throw new Error(`tipo_identificacion.caracteres inesperado: ${valor}`);
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
