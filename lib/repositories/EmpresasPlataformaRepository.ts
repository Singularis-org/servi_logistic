import { Prisma, type PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { SumaCobroPlataformaPorTipo } from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";
import type { IEmpresasPlataformaRepository } from "@/lib/interfaces/repositories/IEmpresasPlataformaRepository";
import { costoVigenteDeLaTarifa, type TarifaLeida } from "@/lib/planes/costeo";
import type { EmpresaListada, EstadoIntegracionDeEmpresa } from "@/lib/types/empresas-plataforma";
import { tipoCobroSchema, type TipoCobro } from "@/lib/types/planes";
import { SERVICIOS_INTEGRACION } from "@/lib/types/integraciones";
import { derivarDeudaPlataforma } from "@/lib/utils/deuda-plataforma";

/** Lo que lee el listado: las empresas, sus cargos de la plataforma y sus pagos (SL-45). */
/** SL-36 (R37): y el estado de sus integraciones. SLT-66 (R31, R32): y su plan y cobro vigente (`$queryRaw`). */
/** SLT-118 (design §5; R18): y las cuotas de sus facturas cerradas. */
/** SLT-60 (design §4.7; R7, R8, R27): los pagos son los confirmados (sus aplicaciones), y el contador por confirmar. */
export type EmpresasPlataformaPrismaClient = Pick<
  PrismaClient,
  "organizacion" | "cobroPlataformaMovimiento" | "pagoPlataformaAplicacion" | "integracion" | "facturaPlataforma" | "$queryRaw"
>;

/** SLT-66 (R31, R32): una fila de `planYCobroVigente`. SLT-83 (R22): la tarifa con su modo. */
type PlanYCobroLeido = TarifaLeida & {
  id: string;
  plan_id: string | null;
  plan_nombre: string | null;
  /** Ajuste planes-custom (D9): `organizacion.plan_tipo_cobro`; `null` solo si la empresa ya no está. */
  plan_tipo_cobro: TipoCobro | null;
};

/**
 * SL-32 (R29) — el listado de la pantalla «Empresas» del superadmin.
 *
 * Es una lectura de TODAS las empresas, asi que corre en contexto de plataforma: ahi la extension
 * del cliente no filtra por empresa. Quien decide que el actor puede verla es el servicio (R35);
 * aqui solo se elige que sale, y sale lo minimo que pinta la tabla.
 *
 * SL-45 (design §9, R28): cada empresa trae ademas su deuda con la plataforma (la regla de R13, la
 * misma que ve la empresa en su wallet) y lo que ha pagado (Σ pagos vigentes). Son tres consultas
 * agrupadas por `organizacion_id` para todas las empresas a la vez, no tres por empresa.
 *
 * SLT-66 (design §6.4; R31, R32): y su plan y su cobro vigente, en una consulta más para todas.
 *
 * SLT-60 (design §4.7; R7, R8, R27): «Pagado» y la deuda cuentan solo los pagos CONFIRMADOS, y cada empresa
 * trae cuántos pagos tiene por confirmar, en una consulta más para todas.
 */
export class EmpresasPlataformaRepository implements IEmpresasPlataformaRepository {
  constructor(private readonly prisma: EmpresasPlataformaPrismaClient) {}

  listar(): Promise<EmpresaListada[]> {
    return comoPlataforma("SL-32", "listado de empresas del superadmin", async () => {
      const filas = await this.prisma.organizacion.findMany({
        // El `slug` (unico) desempata dos altas con la misma fecha: el orden no depende del plan.
        orderBy: [{ createdAt: "desc" }, { slug: "asc" }],
        select: {
          id: true,
          nombre: true,
          slug: true,
          createdAt: true,
          // SL-20 (R9): el país, solo código y nombre.
          pais: { select: { id: true, nombre: true } },
          // Solo nombre y email: ni `password_hash`, ni telefono, ni documento salen de la base.
          usuarios: {
            where: { rol: { value: "maestro" } },
            orderBy: [{ createdAt: "asc" }, { email: "asc" }],
            select: { nombre: true, email: true },
          },
        },
      });
      if (filas.length === 0) return [];
      const ids = filas.map((f) => f.id);
      const { cargosDe, pagadoDe } = await this.cuentasConLaPlataforma(ids);
      const planYCobroDe = await this.planYCobroVigente(ids);
      const porConfirmarDe = await this.pagosPorConfirmar(ids);
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        slug: f.slug,
        creadaEn: f.createdAt,
        maestros: f.usuarios,
        ...planYCobroDe(f.id),
        deudaPlataforma: derivarDeudaPlataforma(cargosDe(f.id), pagadoDe(f.id)),
        pagadoPlataforma: pagadoDe(f.id),
        pagosPorConfirmar: porConfirmarDe(f.id),
        pais: f.pais,
      }));
    });
  }

  /**
   * SL-36 (design §11, R37) — el estado de cada integración de cada empresa, para SL-26.
   *
   * El `select` es el requisito: solo `organizacion_id`, `servicio` y `estado`. Ni los secretos, ni
   * los datos públicos, ni el código del último error salen de la base, así que no pueden filtrarse
   * después por un spread. Los servicios sin fila se completan como `sin_configurar` aquí, con la
   * lista de organizaciones, para que SL-26 no tenga que saber cuántos servicios hay.
   */
  estadoIntegraciones(): Promise<EstadoIntegracionDeEmpresa[]> {
    return comoPlataforma("SL-36", "estado de las integraciones de cada empresa para el superadmin", async () => {
      const organizaciones = await this.prisma.organizacion.findMany({
        orderBy: [{ createdAt: "desc" }, { slug: "asc" }],
        select: { id: true },
      });
      if (organizaciones.length === 0) return [];
      const filas = await this.prisma.integracion.findMany({
        where: { organizacionId: { in: organizaciones.map((o) => o.id) } },
        select: { organizacionId: true, servicio: true, estado: true },
      });
      const estadoDe = new Map(filas.map((f) => [`${f.organizacionId}|${f.servicio}`, f.estado]));
      return organizaciones.flatMap((o) =>
        SERVICIOS_INTEGRACION.map((servicio) => ({
          organizacionId: o.id,
          servicio,
          estado: estadoDe.get(`${o.id}|${servicio}`) ?? ("sin_configurar" as const),
        })),
      );
    });
  }

  /**
   * SLT-66 (design §6.4, §3.2; R31, R32) — por empresa, su plan y lo que se cobraría hoy por una orden
   * nueva. Una sola consulta para todas, con la MISMA `cobro_plataforma_tarifa_de` que usa el trigger del
   * cargo: si el listado tuviera su propia regla, podría decir un importe y cobrarse otro.
   *
   * Parte de la lista de ids (`unnest`) y no de `organizacion`: cada id pedido tiene su fila aunque la
   * empresa ya no esté (p. ej. borrada entre las dos lecturas); la función le da entonces la regla de
   * una empresa sin plan. Los enums van como texto: el driver no conoce el tipo de Postgres.
   */
  private async planYCobroVigente(organizacionIds: string[]) {
    const filas = await this.prisma.$queryRaw<PlanYCobroLeido[]>`
      SELECT i."id", t."monto"::text AS "monto", t."fuente"::text AS "fuente",
             t."porcentaje"::text AS "porcentaje", t."minimo"::text AS "minimo",
             p."id" AS "plan_id", p."nombre" AS "plan_nombre", o."plan_tipo_cobro" AS "plan_tipo_cobro"
        FROM unnest(${organizacionIds}::text[]) AS i("id")
        LEFT JOIN "organizacion" o ON o."id" = i."id"
        LEFT JOIN "plan" p ON p."id" = o."plan_id"
        CROSS JOIN LATERAL cobro_plataforma_tarifa_de(i."id") t`;
    const porEmpresa = new Map(filas.map((f) => [f.id, f]));
    return (id: string): Pick<EmpresaListada, "cobroVigente" | "plan"> => {
      const f = porEmpresa.get(id);
      if (f === undefined) throw new Error(`EmpresasPlataformaRepository.listar: sin cobro vigente para ${id}`);
      return {
        cobroVigente: costoVigenteDeLaTarifa(f),
        plan:
          f.plan_id === null || f.plan_nombre === null
            ? null
            : // SLT-86 (R1, R29): el CHECK de 20261106120000 deja los cuatro tipos; con plan la empresa existe.
              { id: f.plan_id, nombre: f.plan_nombre, tipoCobro: tipoCobroSchema.parse(f.plan_tipo_cobro) },
      };
    };
  }

  /**
   * SLT-60 (design §4.7; R27) — por empresa, cuántos pagos tiene por confirmar. Una sola consulta para todas,
   * con la MISMA `pago_plataforma_por_confirmar` que usan lo disponible y la lectura del detalle: si el
   * contador tuviera su propia regla, podría contar un pago que el detalle no lista. Parte de la lista de ids
   * (`unnest`), como `planYCobroVigente`: cada empresa pedida tiene su fila.
   */
  private async pagosPorConfirmar(organizacionIds: string[]) {
    const filas = await this.prisma.$queryRaw<{ id: string; n: number }[]>`
      SELECT i."id", (SELECT count(*) FROM pago_plataforma_por_confirmar(i."id"))::int AS "n"
        FROM unnest(${organizacionIds}::text[]) AS i("id")`;
    const porEmpresa = new Map(filas.map((f) => [f.id, Number(f.n)]));
    return (id: string): number => porEmpresa.get(id) ?? 0;
  }

  /**
   * SL-45 (design §3, §9) — por empresa, las sumas de cargos y reversos y la Σ de lo pagado.
   * SLT-60 (design §4.7; R7, R8): lo pagado es la Σ de las aplicaciones de la empresa, que es la Σ de sus pagos
   * CONFIRMADOS (cada confirmación reparte exactamente el monto de su pago). Un pago por confirmar o anulado
   * no tiene aplicaciones: no cuenta. La misma regla que `PagoPlataformaRepository.sumaPagosConfirmados`.
   *
   * Cada consulta acota a las empresas del listado: en plataforma no hay extensión que filtre, y el
   * `organizacion_id` de la fila es lo que reparte cada suma a su empresa.
   *
   * SLT-118 (design §5; R18): y las cuotas de sus facturas cerradas (`cuota` + `primera_cuota`), como el
   * tipo `cuota` de `CobroPlataformaMovimientoRepository.sumasPorTipo`: la misma deuda que la wallet.
   */
  private async cuentasConLaPlataforma(organizacionIds: string[]) {
    const cargos = await this.prisma.cobroPlataformaMovimiento.groupBy({
      by: ["organizacionId", "tipo"],
      where: { organizacionId: { in: organizacionIds } },
      _sum: { monto: true },
    });
    const cuotas = await this.prisma.facturaPlataforma.groupBy({
      by: ["organizacionId"],
      where: { organizacionId: { in: organizacionIds }, estado: "cerrada" },
      _sum: { cuota: true, primeraCuota: true },
    });
    const confirmados = await this.prisma.pagoPlataformaAplicacion.groupBy({
      by: ["organizacionId"],
      where: { organizacionId: { in: organizacionIds } },
      _sum: { monto: true },
    });

    const sumasPorEmpresa = new Map<string, SumaCobroPlataformaPorTipo[]>();
    for (const c of cargos) {
      const lista = sumasPorEmpresa.get(c.organizacionId) ?? [];
      lista.push({ tipo: c.tipo, monto: c._sum.monto === null ? "0.00" : c._sum.monto.toFixed(2) });
      sumasPorEmpresa.set(c.organizacionId, lista);
    }
    // SLT-118 (R18): las dos cuotas (P18) se suman en decimal; sin ninguna, la empresa no lleva entrada.
    for (const c of cuotas) {
      if (c._sum.cuota === null && c._sum.primeraCuota === null) continue;
      const total = (c._sum.cuota ?? new Prisma.Decimal(0)).add(c._sum.primeraCuota ?? new Prisma.Decimal(0));
      const lista = sumasPorEmpresa.get(c.organizacionId) ?? [];
      lista.push({ tipo: "cuota", monto: total.toFixed(2) });
      sumasPorEmpresa.set(c.organizacionId, lista);
    }
    const pagadoPorEmpresa = new Map<string, Prisma.Decimal>();
    for (const c of confirmados) {
      if (c._sum.monto !== null) pagadoPorEmpresa.set(c.organizacionId, c._sum.monto);
    }

    return {
      cargosDe: (id: string): SumaCobroPlataformaPorTipo[] => sumasPorEmpresa.get(id) ?? [],
      pagadoDe: (id: string): string => (pagadoPorEmpresa.get(id) ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
