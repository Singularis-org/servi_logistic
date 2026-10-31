import { Prisma, type PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { SumaCobroPlataformaPorTipo } from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";
import type { IEmpresasPlataformaRepository } from "@/lib/interfaces/repositories/IEmpresasPlataformaRepository";
import type { FuenteDelCosto } from "@/lib/types/consumo-plan";
import type { EmpresaListada, EstadoIntegracionDeEmpresa } from "@/lib/types/empresas-plataforma";
import { SERVICIOS_INTEGRACION } from "@/lib/types/integraciones";
import { derivarDeudaPlataforma } from "@/lib/utils/deuda-plataforma";

/** Lo que lee el listado: las empresas, sus cargos de la plataforma y sus pagos (SL-45). */
/** SL-36 (R37): y el estado de sus integraciones. SLT-66 (R31, R32): y su plan y cobro vigente (`$queryRaw`). */
export type EmpresasPlataformaPrismaClient = Pick<
  PrismaClient,
  "organizacion" | "cobroPlataformaMovimiento" | "walletMovimiento" | "integracion" | "$queryRaw"
>;

/** SLT-66 (R31, R32): una fila de `planYCobroVigente`. */
type PlanYCobroLeido = {
  id: string;
  monto: string;
  fuente: FuenteDelCosto;
  plan_id: string | null;
  plan_nombre: string | null;
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
          cobroPlataformaPorOrden: true,
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
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        slug: f.slug,
        creadaEn: f.createdAt,
        maestros: f.usuarios,
        cobroPorOrden: f.cobroPlataformaPorOrden === null ? null : f.cobroPlataformaPorOrden.toFixed(2),
        ...planYCobroDe(f.id),
        deudaPlataforma: derivarDeudaPlataforma(cargosDe(f.id), pagadoDe(f.id)),
        pagadoPlataforma: pagadoDe(f.id),
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
   * una empresa sin excepción ni plan. Los enums van como texto: el driver no conoce el tipo de Postgres.
   */
  private async planYCobroVigente(organizacionIds: string[]) {
    const filas = await this.prisma.$queryRaw<PlanYCobroLeido[]>`
      SELECT i."id", t."monto"::text AS "monto", t."fuente"::text AS "fuente",
             p."id" AS "plan_id", p."nombre" AS "plan_nombre"
        FROM unnest(${organizacionIds}::text[]) AS i("id")
        LEFT JOIN "organizacion" o ON o."id" = i."id"
        LEFT JOIN "plan" p ON p."id" = o."plan_id"
        CROSS JOIN LATERAL cobro_plataforma_tarifa_de(i."id") t`;
    const porEmpresa = new Map(filas.map((f) => [f.id, f]));
    return (id: string): Pick<EmpresaListada, "cobroVigente" | "plan"> => {
      const f = porEmpresa.get(id);
      if (f === undefined) throw new Error(`EmpresasPlataformaRepository.listar: sin cobro vigente para ${id}`);
      return {
        cobroVigente: { monto: f.monto, fuente: f.fuente },
        plan: f.plan_id === null || f.plan_nombre === null ? null : { id: f.plan_id, nombre: f.plan_nombre },
      };
    };
  }

  /**
   * SL-45 (design §3, §9) — por empresa, las sumas de cargos y reversos y la Σ de los pagos vigentes.
   * «Vigente» es la regla de `PagoPlataformaRepository.sumaPagosVigentes`: un pago con contra-asiento
   * (`ingreso_ajuste`, `origen_tipo = gasto`, `origen_id` = el pago) está anulado y no cuenta.
   *
   * Cada consulta acota a las empresas del listado: en plataforma no hay extensión que filtre, y el
   * `organizacion_id` de la fila es lo que reparte cada suma a su empresa.
   */
  private async cuentasConLaPlataforma(organizacionIds: string[]) {
    const cargos = await this.prisma.cobroPlataformaMovimiento.groupBy({
      by: ["organizacionId", "tipo"],
      where: { organizacionId: { in: organizacionIds } },
      _sum: { monto: true },
    });
    const pagos = await this.prisma.walletMovimiento.findMany({
      where: { organizacionId: { in: organizacionIds }, tipo: "egreso", categoria: "egreso_pago_plataforma" },
      select: { id: true, organizacionId: true, monto: true },
    });
    const contra =
      pagos.length === 0
        ? []
        : await this.prisma.walletMovimiento.findMany({
            where: {
              organizacionId: { in: organizacionIds },
              tipo: "ingreso",
              categoria: "ingreso_ajuste",
              origenTipo: "gasto",
              origenId: { in: pagos.map((p) => p.id) },
            },
            select: { origenId: true },
          });

    const sumasPorEmpresa = new Map<string, SumaCobroPlataformaPorTipo[]>();
    for (const c of cargos) {
      const lista = sumasPorEmpresa.get(c.organizacionId) ?? [];
      lista.push({ tipo: c.tipo, monto: c._sum.monto === null ? "0.00" : c._sum.monto.toFixed(2) });
      sumasPorEmpresa.set(c.organizacionId, lista);
    }
    const anulados = new Set(contra.map((c) => c.origenId));
    const pagadoPorEmpresa = new Map<string, Prisma.Decimal>();
    for (const p of pagos) {
      if (anulados.has(p.id)) continue;
      pagadoPorEmpresa.set(p.organizacionId, (pagadoPorEmpresa.get(p.organizacionId) ?? new Prisma.Decimal(0)).add(p.monto));
    }

    return {
      cargosDe: (id: string): SumaCobroPlataformaPorTipo[] => sumasPorEmpresa.get(id) ?? [],
      pagadoDe: (id: string): string => (pagadoPorEmpresa.get(id) ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
