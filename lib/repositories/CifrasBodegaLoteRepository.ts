import type { PrismaClient } from "@prisma/client";
import type {
  CierreDiaDeBodegaLoteRow,
  ICifrasBodegaLoteLectura,
} from "@/lib/interfaces/repositories/ICifrasBodegaLoteLectura";
import type { AlcanceLecturaBodega } from "@/lib/interfaces/repositories/ICierresBodegaAdminRepository";
import {
  DETALLE_ADMIN_SELECT,
  GESTION_ADMIN_SELECT,
  toPendienteRowDesdeSnapshot,
} from "@/lib/repositories/CierresAdminRepository";
import {
  DETALLE_CIERRE_SELECT,
  toDetalleCierreRow,
} from "@/lib/repositories/CierresBodegaAdminRepository";
import { CierreDetalleFaltanteError } from "@/lib/utils/cierre-detalle";

/** Solo LECTURA de las tres tablas del lote: este repositorio no puede escribir nada (R387). */
type CifrasBodegaLotePrismaClient = Pick<PrismaClient, "cierreDia" | "gestionOrden" | "cierreDetail">;

/**
 * SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (R387-R389) — los cierres del dia de
 * VARIOS cierres de bodega en TRES consultas, sea uno o sean cien (mas las de las relaciones de
 * `GESTION_ADMIN_SELECT`, que Prisma carga por lote, no por gestion).
 *
 * Mismas proyecciones, mismo orden y mismo mapper que `findCierreBodegaConDetalle`, para que
 * `cifrasAgregadasBodega` de aqui lo mismo que en el detalle. El alcance va en el `WHERE` de la
 * primera consulta (`cierreBodega: { zonaId }` para la satelite); las otras dos solo ven los cierres
 * del dia que esa devolvio. Sin el cargo de fulfillment: no entra en ninguna cifra de estas hojas.
 */
export class CifrasBodegaLoteRepository implements ICifrasBodegaLoteLectura {
  constructor(private readonly prisma: CifrasBodegaLotePrismaClient) {}

  async leerCierresDiaDeBodegas(
    ids: readonly string[],
    alcance: AlcanceLecturaBodega,
    zona: string,
  ): Promise<CierreDiaDeBodegaLoteRow[]> {
    if (ids.length === 0) return [];
    const cierresDia = await this.prisma.cierreDia.findMany({
      where: {
        cierreBodegaId: { in: [...ids] },
        // R389: el alcance en el WHERE; un cierre de bodega de otra zona no llega a leerse.
        cierreBodega: alcance.lectura === "zona" ? { zonaId: alcance.zonaId } : {},
      },
      orderBy: { solicitadoAt: "desc" }, // el orden del detalle
      select: {
        ...DETALLE_CIERRE_SELECT,
        cierreBodegaId: true,
        estado: true,
        pagoIndependienteEfectivo: true,
      },
    });
    if (cierresDia.length === 0) return [];
    const idsDia = cierresDia.map((cd) => cd.id);
    const [gestiones, detalle] = await Promise.all([
      this.prisma.gestionOrden.findMany({
        where: { cierreId: { in: idsDia } },
        orderBy: { createdAt: "desc" }, // el orden del detalle: `partesPorTienda` empata igual
        select: { ...GESTION_ADMIN_SELECT, cierreId: true },
      }),
      this.prisma.cierreDetail.findMany({
        where: { cierreId: { in: idsDia } },
        select: { ...DETALLE_ADMIN_SELECT, cierreId: true },
      }),
    ]);

    // Grano: N gestiones de una orden comparten su UNICA fila congelada, la de SU cierre del dia.
    const porCierreYOrden = new Map(detalle.map((d) => [`${d.cierreId}:${d.ordenId}`, d]));
    const gestionesPorDia = new Map<string, typeof gestiones>();
    for (const g of gestiones) {
      const cierreId = g.cierreId ?? ""; // no es null: el `in` del WHERE lo exige
      const lista = gestionesPorDia.get(cierreId);
      if (lista === undefined) gestionesPorDia.set(cierreId, [g]);
      else lista.push(g);
    }

    return cierresDia.map((cd) => {
      const resumen = toDetalleCierreRow(cd);
      return {
        cierreBodegaId: cd.cierreBodegaId ?? "", // no es null: el `in` del WHERE lo exige
        cierreDiaId: cd.id,
        estado: cd.estado,
        totalPagoMensajero: resumen.totalPagoMensajero,
        totalEfectivo: resumen.totales.efectivo,
        pagoIndependienteEfectivo: cd.pagoIndependienteEfectivo,
        gestionesAjustadas: resumen.gestionesAjustadas,
        gestiones: (gestionesPorDia.get(cd.id) ?? []).map((g) => {
          const d = porCierreYOrden.get(`${cd.id}:${g.ordenId}`);
          // Sin fallback (feature 69, R14): sin la fila congelada es un error DURO, como el detalle.
          if (d === undefined) throw new CierreDetalleFaltanteError(cd.id, g.ordenId);
          return toPendienteRowDesdeSnapshot(g, d, zona, { cargoFulfillmentAt: null });
        }),
      };
    });
  }
}
