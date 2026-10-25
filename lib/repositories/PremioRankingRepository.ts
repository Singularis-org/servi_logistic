import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  IPremioRankingRepository,
  UpsertPremioInput,
} from "@/lib/interfaces/repositories/IPremioRankingRepository";
import type { PremioRankingDTO } from "@/lib/types/ranking";
import { contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";

// Feature 76 (design §4.3) — repositorio de PREMIOS del ranking. SOLO queries Prisma. Las 3
// filas (posicion 1,2,3) de cada empresa las siembra el alta de la empresa (SL-17 T3.9; las de
// empresas previas, la migracion `20261023090000_unicos_por_empresa`); este repo nunca
// crea/borra, solo lee y actualiza el monto. Money-safe (R12): Decimal -> STRING escala 2 (nunca number/parseFloat);
// null se preserva como null ("sin premio", R9).
type PremioPrismaClient = Pick<PrismaClient, "premioRanking">;

type PremioRow = Prisma.PremioRankingGetPayload<Record<string, never>>;

/**
 * La empresa del contexto. La extension filtraria igual, pero el `where` unico de `update` necesita
 * el valor: sin empresa no hay podio que tocar, y se falla como cualquier operacion sin empresa.
 */
function empresaEnCurso(): string {
  const contexto = contextoActual();
  if (contexto?.tipo !== "empresa") throw new EmpresaNoResuelta("PremioRanking", "update");
  return contexto.organizacionId;
}

function toDTO(r: PremioRow): PremioRankingDTO {
  return {
    posicion: r.posicion as 1 | 2 | 3,
    monto: r.monto === null ? null : r.monto.toFixed(2), // R9/R12: null = sin premio; STRING
    descripcion: r.descripcion, // rotulo libre; null = sin descripcion
  };
}

export class PremioRankingRepository implements IPremioRankingRepository {
  constructor(private readonly prisma: PremioPrismaClient) {}

  /** R8: las 3 posiciones del podio ordenadas por `posicion` asc. */
  async listar(): Promise<PremioRankingDTO[]> {
    const rows = await this.prisma.premioRanking.findMany({ orderBy: { posicion: "asc" } });
    return rows.map(toDTO);
  }

  /** R10: fija monto Y descripcion de una posicion (STRING -> Decimal; null -> sin premio). */
  async upsertPremio(posicion: 1 | 2 | 3, input: UpsertPremioInput): Promise<PremioRankingDTO> {
    const row = await this.prisma.premioRanking.update({
      // SL-17 T3.9: el unico es (organizacion_id, posicion) y `update` exige el unico entero.
      where: { organizacionId_posicion: { organizacionId: empresaEnCurso(), posicion } },
      data: {
        monto: input.monto === null ? null : new Prisma.Decimal(input.monto),
        descripcion: input.descripcion,
      },
    });
    return toDTO(row);
  }
}
