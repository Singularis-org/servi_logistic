import type { Prisma, PrismaClient } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type {
  CrearSuperadminData,
  CrearSuperadminResultado,
  IArranqueSuperadminRepository,
} from "@/lib/interfaces/repositories/IArranqueSuperadminRepository";
import { textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";

/**
 * SL-32 (R12, R14, R15, R17) — la escritura del comando `pnpm arranque:superadmin`.
 *
 * Corre en contexto de plataforma: el superadmin no tiene empresa, y las comprobaciones de email y
 * documento son contra TODA la base, porque sus unicos son globales (R36 de SL-17). En ese contexto
 * la extension del cliente no filtra, y solo exige que el usuario lleve la empresa escrita (R35 de
 * SL-17): por eso el `organizacionId: null` va explicito.
 */

/**
 * Clave del cerrojo que pone en fila dos ejecuciones simultaneas (R17). Tiene que ser distinta de
 * la de los tests (`CLAVE_LOCK_SUPERADMIN`, sostenida EN SESION por el test mientras el comando
 * corre): con la misma, el comando esperaria al test que lo espera a el.
 */
export const CLAVE_LOCK_ARRANQUE_SUPERADMIN = 32_1023_00;

/** El indice de R27 (`20261023100100_seed_rol_superadmin`). */
export const INDICE_UN_SOLO_SUPERADMIN = "usuario_un_solo_superadmin";

const MOTIVO = "arranque del superadmin: crea el unico usuario sin empresa (R12)";

// Hoy la plataforma es un solo rol. Si un dia tuviera dos, el comando seguiria creando este.
const [ROL_DEL_ARRANQUE] = ROLES_PLATAFORMA;

export class ArranqueSuperadminRepository implements IArranqueSuperadminRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "$transaction">) {}

  async crearSiNoExiste(data: CrearSuperadminData): Promise<CrearSuperadminResultado> {
    try {
      return await comoPlataforma("SL-32", MOTIVO, () =>
        this.prisma.$transaction((tx) => crearEnTransaccion(tx, data)),
      );
    } catch (error) {
      // El rechazo ya revirtio la transaccion entera: no queda nada escrito.
      const desenlace = desenlaceDeP2002(error);
      if (desenlace) return desenlace;
      throw error;
    }
  }
}

async function crearEnTransaccion(
  tx: Prisma.TransactionClient,
  data: CrearSuperadminData,
): Promise<CrearSuperadminResultado> {
  // Primera sentencia: la segunda ejecucion espera aqui a que la primera confirme, y luego la ve.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ARRANQUE_SUPERADMIN}::bigint)`;

  // R14: si ya hay uno, no se toca nada de el, ni la contrasena ni el estado.
  const existente = await tx.usuario.findFirst({
    where: { rol: { value: { in: [...ROLES_PLATAFORMA] } } },
    select: { id: true },
  });
  if (existente) return { status: "ya_existe" };

  // Son catalogo: el comando no los siembra, los pide (`pnpm db:seed`).
  const rol = await tx.rol.findUnique({ where: { value: ROL_DEL_ARRANQUE }, select: { id: true } });
  if (!rol) return { status: "catalogo_incompleto", falta: "rol" };
  const tipo = await tx.tipoIdentificacion.findUnique({
    where: { value: data.tipoDocumento },
    select: { id: true },
  });
  if (!tipo) return { status: "catalogo_incompleto", falta: "tipo_identificacion" };

  // R15: se comprueba antes del INSERT para no depender del P2002, que no dice nada del otro usuario.
  const ocupado = await tx.usuario.findFirst({
    where: { OR: [{ email: data.email }, { cedula: data.documento }] },
    select: { email: true },
  });
  if (ocupado) return { status: "conflicto", campo: ocupado.email === data.email ? "email" : "documento" };

  await tx.usuario.create({
    data: {
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      cedula: data.documento,
      tipoIdentificacionId: tipo.id,
      rolId: rol.id,
      passwordHash: data.passwordHash,
      estado: "activo",
      organizacionId: null,
    },
    select: { id: true },
  });
  return { status: "creado" };
}

/**
 * Un P2002 que llega pese a las comprobaciones: otro escritor confirmo entre ellas y el INSERT, sin
 * pasar por el cerrojo. Se decide por el NOMBRE del indice: bajo el driver adapter no hay
 * `meta.target`, y el nombre llega en el mensaje original (`textoConstraintP2002`).
 *  - el de R27 es que ya hay un superadmin: `ya_existe`, con codigo 0 (R17);
 *  - el de email o el de cedula es un `conflicto` (R15).
 * Cualquier otro P2002, o ningun nombre conocido, se relanza: no se adivina.
 */
export function desenlaceDeP2002(error: unknown): CrearSuperadminResultado | null {
  const texto = textoConstraintP2002(error);
  if (!texto) return null;
  if (texto.includes(INDICE_UN_SOLO_SUPERADMIN)) return { status: "ya_existe" };
  if (texto.includes("usuario_email_key")) return { status: "conflicto", campo: "email" };
  if (texto.includes("usuario_cedula_key")) return { status: "conflicto", campo: "documento" };
  return null;
}
