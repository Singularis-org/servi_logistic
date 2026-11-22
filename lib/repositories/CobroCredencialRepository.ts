import type { Prisma, PrismaClient } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { llevaSqlstate } from "@/lib/db/sqlstate";
import type { TrioCredencialCobro } from "@/lib/interfaces/external/IProveedorCobro";
import type {
  EstadoCredencialGuardada,
  GuardarCredencialRepoInput,
  GuardarCredencialRepoResult,
  ICobroCredencialRepository,
} from "@/lib/interfaces/repositories/ICobroCredencialRepository";
import type { SecretosGuardados } from "@/lib/interfaces/repositories/IIntegracionRecifradoRepository";
import { esViolacionDeClaveForanea } from "@/lib/repositories/_shared/prisma-fk";

// SLT-227 (design §8.2) — `cobro_proveedor_credencial`, una tabla de plataforma sin `organizacion_id`: ninguna
// empresa la lee ni la escribe (RLS sin políticas y `REVOKE ALL` a `servi_app`, R6). Por eso todo corre en
// `comoPlataforma`, como dueño. `FichaJira` no admite `SLT` (deuda D29): lleva `SL-36`, la ficha de la bóveda.
//
// Los secretos entran y salen CIFRADOS. `estado` no lee ni un valor: solo los nombres de los campos (R9).

type CobroCredencialPrismaClient = Pick<PrismaClient, "$queryRaw" | "cobroProveedorCredencial" | "usuario">;

const FICHA = "SL-36";
const MOTIVO =
  "SLT-227: las credenciales de los proveedores de cobro, de plataforma y sin empresa; las lee el adaptador sin sesión y las escribe el superadmin (R5–R13)";

/** El instante como `TIMESTAMP` sin zona en UTC, como lo guarda la base. */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

/** Los secretos como `{ campo: texto }`; un valor que no es texto no se puede descifrar ni recifrar. */
function comoTextos(secretos: Prisma.JsonValue): Record<string, string> {
  const salida: Record<string, string> = {};
  if (secretos === null || typeof secretos !== "object" || Array.isArray(secretos)) return salida;
  for (const [campo, valor] of Object.entries(secretos)) {
    if (typeof valor === "string") salida[campo] = valor;
  }
  return salida;
}

function claveDe(trio: TrioCredencialCobro) {
  return { proveedor_paisId_entorno: { proveedor: trio.proveedor, paisId: trio.paisId, entorno: trio.entorno } };
}

export class CobroCredencialRepository implements ICobroCredencialRepository {
  constructor(private readonly prisma: CobroCredencialPrismaClient) {}

  idDe(trio: TrioCredencialCobro): Promise<string | null> {
    return comoPlataforma(FICHA, MOTIVO, async () => {
      const fila = await this.prisma.cobroProveedorCredencial.findUnique({ where: claveDe(trio), select: { id: true } });
      return fila?.id ?? null;
    });
  }

  async guardar(input: GuardarCredencialRepoInput): Promise<GuardarCredencialRepoResult> {
    const { id, trio, secretos, por, ahora } = input;
    try {
      return await comoPlataforma(FICHA, MOTIVO, async () => {
        // Una sola sentencia: crea el trío o reemplaza sus secretos. El `WHERE` del `DO UPDATE` exige el MISMO id
        // que se usó para cifrar: si otra escritura creó el trío con otro id, reemplazar dejaría secretos atados a
        // un id que no es el de la fila, ilegibles (R7). Entonces no escribe nada y es `conflicto`.
        const filas = await this.prisma.$queryRaw<{ id: string }[]>`
          INSERT INTO "cobro_proveedor_credencial"
                 ("id", "proveedor", "pais_id", "entorno", "secretos", "actualizado_por", "updated_at")
          VALUES (${id}, ${trio.proveedor}, ${trio.paisId}, ${trio.entorno}, ${JSON.stringify(secretos)}::jsonb,
                  ${por}, ${comoTimestamp(ahora)}::timestamp)
          ON CONFLICT ("proveedor", "pais_id", "entorno") DO UPDATE
             SET "secretos" = EXCLUDED."secretos",
                 "actualizado_por" = EXCLUDED."actualizado_por",
                 "updated_at" = EXCLUDED."updated_at"
           WHERE "cobro_proveedor_credencial"."id" = EXCLUDED."id"
          RETURNING "id"`;
        return filas.length === 1 ? "ok" : "conflicto";
      });
    } catch (e) {
      // La única FK de la tabla es la del país.
      if (esViolacionDeClaveForanea(e) || llevaSqlstate(e, "23503")) return "pais_no_existe";
      throw e;
    }
  }

  estado(trio: TrioCredencialCobro): Promise<EstadoCredencialGuardada | null> {
    return comoPlataforma(FICHA, MOTIVO, async () => {
      // Solo las claves del JSON, nunca los valores (R9). La fecha sale como texto ISO en UTC para no depender de
      // cómo el driver lee un `timestamp` sin zona.
      const [fila] = await this.prisma.$queryRaw<{ campos: string[]; actualizado_at: string; actualizado_por: string | null }[]>`
        SELECT ARRAY(SELECT k FROM jsonb_object_keys(c."secretos") AS k ORDER BY k) AS "campos",
               to_char(c."updated_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "actualizado_at",
               c."actualizado_por"
          FROM "cobro_proveedor_credencial" c
         WHERE c."proveedor" = ${trio.proveedor} AND c."pais_id" = ${trio.paisId} AND c."entorno" = ${trio.entorno}`;
      if (!fila) return null;
      return { campos: fila.campos, actualizadoAt: new Date(fila.actualizado_at), actualizadoPor: fila.actualizado_por };
    });
  }

  secretosDe(trio: TrioCredencialCobro): Promise<SecretosGuardados | null> {
    return comoPlataforma(FICHA, MOTIVO, async () => {
      const fila = await this.prisma.cobroProveedorCredencial.findUnique({
        where: claveDe(trio),
        select: { id: true, secretos: true },
      });
      return fila ? { id: fila.id, secretos: comoTextos(fila.secretos) } : null;
    });
  }

  idSuperadmin(): Promise<string | null> {
    return comoPlataforma(FICHA, MOTIVO, async () => {
      // Hay a lo sumo uno: lo asegura `usuario_un_solo_superadmin`.
      const fila = await this.prisma.usuario.findFirst({
        where: { organizacionId: null, rol: { value: { in: [...ROLES_PLATAFORMA] } } },
        select: { id: true },
      });
      return fila?.id ?? null;
    });
  }

  // ─── El recifrado (design §9.2, R13) ───────────────────────────────────────────────────────────────────────────

  listarSecretos(): Promise<SecretosGuardados[]> {
    return comoPlataforma(FICHA, MOTIVO, async () => {
      const filas = await this.prisma.cobroProveedorCredencial.findMany({
        select: { id: true, secretos: true },
        orderBy: { id: "asc" },
      });
      return filas.map((fila) => ({ id: fila.id, secretos: comoTextos(fila.secretos) }));
    });
  }

  reemplazarSecretos(
    id: string,
    anteriores: Readonly<Record<string, string>>,
    nuevos: Readonly<Record<string, string>>,
  ): Promise<boolean> {
    return comoPlataforma(FICHA, MOTIVO, async () => {
      // El mismo `equals` sobre el JSON entero que `IntegracionRecifradoRepository`: si el superadmin cargó otra
      // credencial mientras corría el recifrado, su valor nuevo gana.
      const { count } = await this.prisma.cobroProveedorCredencial.updateMany({
        where: { id, secretos: { equals: anteriores } },
        data: { secretos: nuevos },
      });
      return count === 1;
    });
  }
}
