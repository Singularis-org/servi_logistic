import { describe, it, expect, vi } from "vitest";

import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CorteDiarioService } from "@/lib/services/CorteDiarioService";
import { contextosPagoDe, pagosDelCierre } from "@/lib/utils/cierre-totales";
import type {
  CrearCierreInput,
  GestionPendienteDeCierreRow,
  ICierreDiaRepository,
} from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { ICorteDiarioRepository } from "@/lib/interfaces/repositories/ICorteDiarioRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { ITarifaZonaMensajeroRepository } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { ContextoPagoGestion, TarifaPago, ValorPago } from "@/lib/types/tarifa-flexible";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { conPagos } from "@/tests/fixtures/cierre-pagos";

/**
 * SLT-52 T5.1/T5.2 (design §5 y §7; R19, R20, R24, R33, R40) — el cierre resuelve el pago al
 * mensajero y a la satelite POR GESTION, con el resolver unico (`resolvePagos`), y entrega a
 * `crearCierre` el pago congelado de cada una.
 *
 * El doble del resolver contesta SEGUN EL DISTRITO de cada contexto, como el real (el distrito elige
 * el grupo): si el servicio volviera a resolver una sola tarifa para todo el lote, o se olvidara del
 * distrito, las dos entregas pagarian lo mismo y los literales de abajo caerian.
 *
 * TODOS LOS ESPERADOS ESTAN ESCRITOS A MANO.
 */

const MENSAJERO: Actor = { usuarioId: "m1", rol: "mensajero" };
const ZONA_MENSAJERO = "z-mensajero";
const VEHICULO = "veh-moto";

function valor(concepto: ValorPago["concepto"], modo: ValorPago["modo"], v: string): ValorPago {
  return { concepto, modo, valor: v, nivel: "grupo", tarifaValorId: `tv-${concepto}-${v}` };
}

function gestion(
  gestionId: string,
  resultado: GestionPendienteDeCierreRow["resultado"],
  distritoId: string | null,
): GestionPendienteDeCierreRow {
  return conPagos({
    gestionId,
    ordenId: `o-${gestionId}`,
    fechaGestion: "2026-11-03",
    numGuia: 1,
    numRemision: `REM-${gestionId}`,
    destinatario: "Ana",
    direccion: null,
    zonaNombre: "Cartago",
    provinciaNombre: "Cartago",
    cantonNombre: "Central",
    distritoNombre: null,
    producto: "Caja",
    tiendaId: "t1",
    tiendaNombre: "Tienda X",
    resultado,
    montoRecibido: null,
    metodoPago: null,
    motivo: null,
    fechaReprogramacion: null,
    evidenciaStoragePath: null,
    evidenciaStoragePaths: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: null,
    indemnizacion: null,
    distritoId,
    zonaOrdenId: "z-orden",
    montoCobrar: "25000.00",
    cobraComision: true,
  });
}

/**
 * Tres gestiones del MISMO mensajero, el mismo dia:
 *  - g1 entrega en `d-norte` (grupo A): mensajero 1500 en monto; satelite 10 % del flete 2000 = 200.
 *  - g2 entrega en `d-sur` (grupo B): mensajero 1700; la satelite no tiene valor (sin tarifa).
 *  - g3 rechazo en `d-norte`: el mensajero no tiene valor para el rechazo (R24: paga 0); la
 *    satelite cobra 450.50 por el rechazo.
 */
const GESTIONES = [
  gestion("g1", "entregado", "d-norte"),
  gestion("g2", "entregado", "d-sur"),
  gestion("g3", "devolucion_a_origen_por_rechazo", "d-norte"),
];

function tarifaPorDistrito(c: ContextoPagoGestion): TarifaPago {
  if (c.resultado === "devolucion_a_origen_por_rechazo") {
    return {
      modelo: "nuevo",
      mensajero: null,
      satelite: valor("satelite_rechazo", "monto", "450.50"),
      baseFlete: "0.00",
    };
  }
  return c.distritoId === "d-norte"
    ? {
        modelo: "nuevo",
        mensajero: valor("mensajero_entregado", "monto", "1500.00"),
        satelite: valor("satelite_entregado", "porcentaje", "10.00"),
        baseFlete: "2000.00",
      }
    : {
        modelo: "nuevo",
        mensajero: valor("mensajero_entregado", "monto", "1700.00"),
        satelite: null,
        baseFlete: "2000.00",
      };
}

function tarifaRepoNuevo() {
  return {
    resolvePagoTarifa: vi.fn(async () => ({ cobroEntregado: "9999.00", cobroRechazado: "8888.00" })),
    resolvePagos: vi.fn(async (ctxs: readonly ContextoPagoGestion[]) =>
      new Map(ctxs.map((c) => [c.gestionId, tarifaPorDistrito(c)] as const)),
    ),
  } satisfies ITarifaZonaMensajeroRepository;
}

/** Lo que el servicio tiene que pedir al resolver: zona y vehiculo del mensajero, lo demas de la orden. */
function contextoEsperado(
  gestionId: string,
  resultado: ContextoPagoGestion["resultado"],
  distritoId: string,
  zonaId = ZONA_MENSAJERO,
): ContextoPagoGestion {
  return {
    gestionId,
    resultado,
    mensajeroId: "m1",
    zonaId,
    vehiculoId: VEHICULO,
    distritoId,
    tiendaId: "t1",
    zonaOrdenId: "z-orden",
    montoCobrar: "25000.00",
    cobraComision: true,
  };
}

const CONTEXTOS = [
  contextoEsperado("g1", "entregado", "d-norte"),
  contextoEsperado("g2", "entregado", "d-sur"),
  contextoEsperado("g3", "devolucion_a_origen_por_rechazo", "d-norte"),
];

/** El pago congelado esperado (R40): una fila por actor CON valor; sin IVA; base solo en %. */
const CONGELADOS_ESPERADOS = [
  { gestionId: "g1", actor: "mensajero", valor: valor("mensajero_entregado", "monto", "1500.00"), base: null, importe: "1500.00" },
  { gestionId: "g1", actor: "satelite", valor: valor("satelite_entregado", "porcentaje", "10.00"), base: "2000.00", importe: "200.00" },
  { gestionId: "g2", actor: "mensajero", valor: valor("mensajero_entregado", "monto", "1700.00"), base: null, importe: "1700.00" },
  { gestionId: "g3", actor: "satelite", valor: valor("satelite_rechazo", "monto", "450.50"), base: null, importe: "450.50" },
];

function montarSolicitud() {
  const crearCierre = vi.fn<(input: CrearCierreInput) => Promise<string | null>>(async () => "c1");
  const repo = {
    findGestionesPendientes: vi.fn(async () => GESTIONES),
    contarOrdenesPendientesGestion: vi.fn(async () => 0),
    findCierreResolicitableMasViejo: vi.fn(async () => null),
    findCierresByMensajero: vi.fn(async () => []),
    findCierreParaAviso: vi.fn(async () => null),
    crearCierre,
  } as unknown as ICierreDiaRepository;
  const ordenRepo = {
    findUsuarioZonaId: vi.fn(async () => ZONA_MENSAJERO),
    findUsuarioVehiculoId: vi.fn(async () => VEHICULO),
    findEstatusIdByValue: vi.fn(async () => "s-reparto"),
    findBloqueoDetalle: vi.fn(async () => SIN_BLOQUEO),
    findOrdenesEnCorreccion: vi.fn(async () => new Set<string>()),
  } as unknown as IOrdenRepository;
  const zonaRepo = { findCentralZonaId: vi.fn(async () => null) } as unknown as IZonaRepository;
  const signedUrls = { createSignedUrls: vi.fn(async () => ({})) } as unknown as ISignedUrlProvider;
  const tarifaRepo = tarifaRepoNuevo();
  const service = new CierreDiaService(repo, zonaRepo, ordenRepo, signedUrls, tarifaRepo);
  return { service, crearCierre, tarifaRepo };
}

describe("SLT-52 R19/R20 — la solicitud resuelve el pago POR GESTION con el resolver unico", () => {
  it("SLT-52 R19 — pide el pago con la zona y el vehiculo del MENSAJERO y el distrito de CADA orden", async () => {
    const { service, tarifaRepo } = montarSolicitud();

    const r = await service.solicitarCierre(MENSAJERO);

    expect(r.status).toBe("ok");
    expect(tarifaRepo.resolvePagos).toHaveBeenCalledTimes(1);
    expect(tarifaRepo.resolvePagos).toHaveBeenCalledWith(CONTEXTOS);
    // La tarifa unica del modelo viejo ya no se pide desde el cierre.
    expect(tarifaRepo.resolvePagoTarifa).not.toHaveBeenCalled();
  });

  it("SLT-52 R19/R20/R33 — cada gestion paga lo de SU grupo: 1500 y 1700 al mensajero, 200 y 450.50 a la satelite", async () => {
    const { service, crearCierre } = montarSolicitud();

    await service.solicitarCierre(MENSAJERO);

    const input = crearCierre.mock.calls[0]![0];
    expect(input.pagoByGestionId).toEqual({ g1: "1500.00", g2: "1700.00", g3: "0.00" });
    expect(input.totalPagoMensajero).toBe("3200.00");
    expect(input.ingresoByGestionId).toEqual({ g1: "200.00", g2: "0.00", g3: "450.50" });
    expect(input.totalIngresoBodegaRechazos).toBe("650.50");
  });

  it("SLT-52 R24 — un concepto sin tarifa cuenta 0 y el cierre se crea igual", async () => {
    const { service, crearCierre } = montarSolicitud();

    const r = await service.solicitarCierre(MENSAJERO);

    expect(r).toMatchObject({ status: "ok", via: "creado", cierreId: "c1" });
    const input = crearCierre.mock.calls[0]![0];
    expect(input.pagoByGestionId.g3).toBe("0.00"); // el mensajero no tiene valor por rechazo
    expect(input.ingresoByGestionId.g2).toBe("0.00"); // la satelite no tiene valor en d-sur
  });

  it("SLT-52 R40 — entrega a `crearCierre` el pago congelado de cada gestion, sin IVA", async () => {
    const { service, crearCierre } = montarSolicitud();

    await service.solicitarCierre(MENSAJERO);

    expect(crearCierre.mock.calls[0]![0].pagos).toEqual({
      modelo: "nuevo",
      congelados: CONGELADOS_ESPERADOS,
    });
  });

  it("SLT-52 R19 — la vista EN VIVO paga cada gestion con su propio valor", async () => {
    const { service } = montarSolicitud();

    const r = await service.listarCierreDia(MENSAJERO);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalPagoMensajero).toBe("3200.00");
    expect(r.totalIngresoBodegaRechazos).toBe("650.50");
    const pagos = Object.fromEntries(
      [...r.grupos.entregado, ...r.grupos.devolucion_a_origen_por_rechazo].map((g) => [
        g.gestionId,
        [g.pagoMensajero, g.ingresoBodegaRechazo, g.tarifaFaltante],
      ]),
    );
    expect(pagos).toEqual({
      g1: ["1500.00", "200.00", false],
      g2: ["1700.00", "0.00", false],
      g3: ["0.00", "450.50", false],
    });
  });
});

describe("SLT-52 R19/R33 — el corte diario resuelve igual, con la zona del mensajero del corte", () => {
  function montarCorte() {
    const crearCierre = vi.fn<(input: CrearCierreInput) => Promise<string | null>>(async () => "c-v");
    const corteRepo = {
      findMensajerosConActividadSinCierre: vi.fn(async () => [{ mensajeroId: "m1", zonaId: "z-del-corte" }]),
    } as unknown as ICorteDiarioRepository;
    const cierreRepo = { findGestionesPendientes: vi.fn(async () => GESTIONES), crearCierre };
    const zonaRepo = { findCentralZonaId: vi.fn(async () => null) };
    const ordenRepo = {
      findUsuarioVehiculoId: vi.fn(async () => VEHICULO),
      findEstatusIdByValue: vi.fn(async () => null),
    };
    const tarifaRepo = tarifaRepoNuevo();
    const service = new CorteDiarioService(corteRepo, cierreRepo, zonaRepo, ordenRepo, tarifaRepo, {
      warn: vi.fn(),
    });
    return { service, crearCierre, tarifaRepo };
  }

  it("SLT-52 R19 — contextos con la zona del corte, el vehiculo y el distrito de cada orden", async () => {
    const { service, tarifaRepo } = montarCorte();

    await service.ejecutarCorte(new Date("2026-11-04T06:05:00.000Z"));

    expect(tarifaRepo.resolvePagos).toHaveBeenCalledWith([
      contextoEsperado("g1", "entregado", "d-norte", "z-del-corte"),
      contextoEsperado("g2", "entregado", "d-sur", "z-del-corte"),
      contextoEsperado("g3", "devolucion_a_origen_por_rechazo", "d-norte", "z-del-corte"),
    ]);
    expect(tarifaRepo.resolvePagoTarifa).not.toHaveBeenCalled();
  });

  it("SLT-52 R33/R40 — el `vencido` paga cada gestion lo suyo y lleva su pago congelado", async () => {
    const { service, crearCierre } = montarCorte();

    await service.ejecutarCorte(new Date("2026-11-04T06:05:00.000Z"));

    const input = crearCierre.mock.calls[0]![0];
    expect(input.estado).toBe("vencido");
    expect(input.pagoByGestionId).toEqual({ g1: "1500.00", g2: "1700.00", g3: "0.00" });
    expect(input.ingresoByGestionId).toEqual({ g1: "200.00", g2: "0.00", g3: "450.50" });
    expect(input.pagos).toEqual({ modelo: "nuevo", congelados: CONGELADOS_ESPERADOS });
  });
});

describe("SLT-52 R40 — `pagosDelCierre` (puro)", () => {
  it("SLT-52 R40 — el modelo viejo no congela filas (sigue escribiendo solo pago_mensajero)", () => {
    const viejo = new Map<string, TarifaPago | null>([
      ["g1", { modelo: "viejo", tarifa: { cobroEntregado: "5.00", cobroRechazado: "3.00" } }],
    ]);
    expect(pagosDelCierre([{ gestionId: "g1", resultado: "entregado" }], viejo)).toEqual({
      modelo: "viejo",
      congelados: [],
    });
  });

  it("SLT-52 R24 — zona sin tarifa en el viejo: modelo viejo y nada que congelar; sin gestiones: null", () => {
    expect(pagosDelCierre([{ gestionId: "g1", resultado: "entregado" }], new Map())).toEqual({
      modelo: "viejo",
      congelados: [],
    });
    expect(pagosDelCierre([], new Map())).toEqual({ modelo: null, congelados: [] });
  });

  it("SLT-52 R19 — `contextosPagoDe` toma zona y vehiculo del pagador y lo demas de la orden", () => {
    expect(
      contextosPagoDe([GESTIONES[1]!], { mensajeroId: "m1", zonaId: "z-x", vehiculoId: null }),
    ).toEqual([
      {
        gestionId: "g2",
        resultado: "entregado",
        mensajeroId: "m1",
        zonaId: "z-x",
        vehiculoId: null,
        distritoId: "d-sur",
        tiendaId: "t1",
        zonaOrdenId: "z-orden",
        montoCobrar: "25000.00",
        cobraComision: true,
      },
    ]);
  });
});
