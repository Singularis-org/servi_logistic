import { Prisma } from "@prisma/client";
import type { CierreDiaDeBodegaLoteRow } from "@/lib/interfaces/repositories/ICifrasBodegaLoteLectura";
import type { ILiquidacionPagoRepository } from "@/lib/interfaces/repositories/ILiquidacionPagoRepository";
import type {
  IPagadoPorSateliteLectura,
  IPagoMensajeroMovimientoRepository,
} from "@/lib/interfaces/repositories/IPagoMensajeroMovimientoRepository";
import type {
  CierreBodegaResumen,
  CifrasCierreBodegaDescargaDTO,
} from "@/lib/interfaces/services/ICierreBodegaService";
import { cifrasAgregadasBodega } from "@/lib/utils/cifras-cierre-bodega";
import {
  derivarPagoEntregadoCierre,
  LecturaPagadoSateliteAusenteError,
} from "@/lib/utils/pendiente-cierre";

/**
 * SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» — las TRES lecturas por lista de lo
 * pagado al mensajero, solo de LECTURA (`Pick`): la descarga puede derivar «Pago entregado» y no
 * puede registrar, anular ni tocar un pago. `sumarPagadoSatelitePorCierre` es opcional en el tipo
 * (SLT-139) y ruidosa si falta con un cierre del dia con la marca.
 */
export interface LecturasPagoEntregadoBodega {
  liquidaciones: Pick<ILiquidacionPagoRepository, "sumarVigentesPorCierre">;
  premios: Pick<IPagoMensajeroMovimientoRepository, "sumarPremiosVivosPorCierre"> &
    Partial<IPagadoPorSateliteLectura>;
}

/**
 * SLT-141 (R389, patron de `LecturaPagadoSateliteAusenteError`) — un servicio con un cierre de bodega
 * NUEVO delante y sin la lectura en lote (o, la central, sin las de pago) no puede dar sus cifras:
 * lanza en vez de devolver el archivo sin ellas. En produccion no ocurre (las acciones las inyectan;
 * lo prueba `tests/unit/actions/cierre-bodega-cifras-cableado.test.ts`).
 */
export class LecturaCifrasBodegaAusenteError extends Error {
  constructor(contexto: string) {
    super(`SLT-141: falta la lectura de las cifras de los cierres de bodega (${contexto}); no se descarga sin ellas`);
    this.name = "LecturaCifrasBodegaAusenteError";
  }
}

/** Los cierres de bodega del modelo nuevo del conjunto, en el orden de `items` (D40). */
export function cierresBodegaModeloNuevo(items: readonly CierreBodegaResumen[]): CierreBodegaResumen[] {
  return items.filter((c) => c.incluyeModeloNuevo === true);
}

/** Las filas del lote agrupadas por cierre de bodega, en el orden del lote (el del detalle). */
function porBodega(filas: readonly CierreDiaDeBodegaLoteRow[]): Map<string, CierreDiaDeBodegaLoteRow[]> {
  const grupos = new Map<string, CierreDiaDeBodegaLoteRow[]>();
  for (const f of filas) {
    const lista = grupos.get(f.cierreBodegaId);
    if (lista === undefined) grupos.set(f.cierreBodegaId, [f]);
    else lista.push(f);
  }
  return grupos;
}

/**
 * SLT-141 (R387, R388) — las cifras de cada cierre de bodega NUEVO, en el orden de `nuevos`. Los
 * importes salen de `cifrasAgregadasBodega` (la misma funcion que el detalle) con el snapshot
 * AGREGADO del cierre de bodega y las gestiones de TODOS sus cierres del dia. Sin `pagoEntregado`:
 * esa clave la anade solo la central (F481).
 */
export function cifrasBodegaDescarga(
  nuevos: readonly CierreBodegaResumen[],
  filas: readonly CierreDiaDeBodegaLoteRow[],
): CifrasCierreBodegaDescargaDTO[] {
  const grupos = porBodega(filas);
  return nuevos.map((c) => {
    const dias = grupos.get(c.cierreBodegaId) ?? [];
    const gestiones = dias.flatMap((d) => d.gestiones);
    const cifras = cifrasAgregadasBodega(c, gestiones);
    return {
      cierreBodegaId: c.cierreBodegaId,
      gestiones: gestiones.length,
      pagosAjustados: dias.reduce((n, d) => n + d.gestionesAjustadas, 0),
      totalFacturado: cifras.totalesIngreso.total,
      ivaFacturado: cifras.ivaFacturado,
      netoEmpresa: cifras.netoEmpresa,
      ganaLaTienda: cifras.ganaLaTienda,
      partesPorTienda: cifras.partesPorTienda,
    };
  });
}

/**
 * SLT-141 (R388, PA1) — «Pago entregado» de cada cierre de bodega de `ids`: la suma, sobre sus
 * cierres del dia, de `derivarPagoEntregadoCierre` (SLT-140), `(P + premios vivos) − pendiente`;
 * `null` si alguno de sus cierres del dia no esta aprobado.
 *
 * Una llamada por lectura para TODO el lote, nunca una por cierre (R389): pagos vigentes y premios
 * con los aprobados; lo pagado por la satelite solo con los aprobados con la marca (SLT-139), y sin
 * ninguno no se consulta. Suma con `Prisma.Decimal`, sin coma flotante.
 */
export async function pagoEntregadoPorBodega(
  ids: readonly string[],
  filas: readonly CierreDiaDeBodegaLoteRow[],
  lecturas: LecturasPagoEntregadoBodega,
  contexto: string,
): Promise<Map<string, string | null>> {
  const aprobados = filas.filter((f) => f.estado === "aprobado");
  const idsAprobados = aprobados.map((f) => f.cierreDiaId);
  const pagados = await lecturas.liquidaciones.sumarVigentesPorCierre(idsAprobados);
  const premios = await lecturas.premios.sumarPremiosVivosPorCierre(idsAprobados);
  const idsConMarca = aprobados.filter((f) => f.pagoIndependienteEfectivo).map((f) => f.cierreDiaId);
  let pagadoSatelite: Record<string, string> = {};
  if (idsConMarca.length > 0) {
    if (typeof lecturas.premios.sumarPagadoSatelitePorCierre !== "function") {
      throw new LecturaPagadoSateliteAusenteError(contexto);
    }
    pagadoSatelite = await lecturas.premios.sumarPagadoSatelitePorCierre(idsConMarca);
  }

  const grupos = porBodega(filas);
  const resultado = new Map<string, string | null>();
  for (const id of ids) {
    const dias = grupos.get(id) ?? [];
    if (dias.some((d) => d.estado !== "aprobado")) {
      resultado.set(id, null); // PA1: alguno sin aprobar -> vacio
      continue;
    }
    let suma = new Prisma.Decimal(0);
    for (const d of dias) {
      const base = {
        pagoDebido: d.totalPagoMensajero, // P, snapshot
        efectivo: d.totalEfectivo, // E, snapshot
        premiosVivos: premios[d.cierreDiaId] ?? "0.00",
        pagadoVigente: pagados[d.cierreDiaId] ?? "0.00",
      };
      const entregado = d.pagoIndependienteEfectivo
        ? derivarPagoEntregadoCierre({
            ...base,
            pagoIndependienteEfectivo: true,
            pagadoPorSatelite: pagadoSatelite[d.cierreDiaId] ?? "0.00",
          })
        : derivarPagoEntregadoCierre({ ...base, pagoIndependienteEfectivo: false });
      suma = suma.add(entregado);
    }
    resultado.set(id, suma.toFixed(2));
  }
  return resultado;
}
