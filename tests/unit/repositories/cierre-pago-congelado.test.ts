import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierreDiaRepository, ModelosDeTarifaMezclados } from "@/lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import type { ITarifaVigenteRepository } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { CrearCierreInput } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type {
  ContextoPagoGestion,
  PagoCongelado,
  TarifaPago,
  TarifaTienda,
  ValorCobro,
  ValorPago,
} from "@/lib/types/tarifa-flexible";
import { clavePar } from "@/lib/utils/cascada-tarifa";
import { sembrarCatalogoEstados } from "@/tests/fixtures/catalogo-estados";

// La re-solicitud (477) y la correccion (398) resuelven el pago DENTRO de su transaccion con el
// resolver unico. Aqui se sustituye SOLO esa funcion para poder afirmar con que contextos se llama y
// que se escribe con lo que devuelve; la regla del resolver la prueban sus tests contra Postgres
// (`tests/integration/db/tarifas-flexibles-resolver.test.ts`).
const resolverPagosCon = vi.hoisted(() =>
  vi.fn<(db: unknown, ctxs: readonly ContextoPagoGestion[]) => Promise<Map<string, TarifaPago | null>>>(),
);
vi.mock("@/lib/repositories/_shared/resolver-tarifas", async (original) => ({
  ...(await original<typeof import("@/lib/repositories/_shared/resolver-tarifas")>()),
  resolverPagosCon,
}));

/**
 * SLT-52 T5.1/T5.2 (design §2.5 y §7; R33, R40, R46) — lo que el cierre CONGELA en el modelo nuevo,
 * en la misma transaccion que crea el detalle: `cierre_detail.tarifa_modelo`, los conceptos de cobro
 * a la tienda (`cierre_detail_concepto`) y el pago de cada gestion (`gestion_pago_congelado`).
 *
 * TODOS LOS ESPERADOS ESTAN ESCRITOS A MANO.
 */

beforeEach(async () => {
  resolverPagosCon.mockReset();
  await sembrarCatalogoEstados();
});

function cobro(concepto: ValorCobro["concepto"], modo: ValorCobro["modo"], v: string, iva: string): ValorCobro {
  return { concepto, modo, valor: v, ivaPct: iva, nivel: "tienda_zona", tarifaValorId: `tv-${concepto}` };
}

function pago(concepto: ValorPago["concepto"], modo: ValorPago["modo"], v: string): ValorPago {
  return { concepto, modo, valor: v, nivel: "grupo", tarifaValorId: `tv-${concepto}` };
}

/** El cobro del modelo nuevo de la orden o1: flete por entregado, comision y fulfillment con su IVA. */
const COBRO_NUEVO: TarifaTienda = {
  modelo: "nuevo",
  valores: {
    tienda_flete_entregado: cobro("tienda_flete_entregado", "monto", "2000.00", "13.00"),
    tienda_comision_cod: cobro("tienda_comision_cod", "porcentaje", "3.50", "13.00"),
    tienda_fulfillment: cobro("tienda_fulfillment", "monto", "500.00", "13.00"),
  },
};

function snapshotRow(ordenId: string) {
  return {
    ordenId,
    orden: {
      montoCobrar: new Prisma.Decimal("25000.00"),
      cobraComision: true,
      zonaId: "z1",
      tiendaId: "t1",
      numGuia: 10,
      numRemision: `REM-${ordenId}`,
      destinatario: "Ana",
      direccion: "Av 1",
      producto: "Caja",
      provinciaId: "p1",
      cantonId: "ct1",
      distritoId: "d1",
    },
  };
}

/**
 * SLT-52 (T5.5) — el `cierre_detail` congelado del modelo nuevo de una orden, como lo devuelve
 * `DETALLE_SELECT`: la 398 y la 477 lo leen para rebasar el % del pago (R52/R53). Aqui los pagos son
 * en monto, asi que la base no mueve ningun importe de estos casos.
 */
function detalleNuevo(ordenId: string) {
  return {
    ordenId,
    montoCobrar: new Prisma.Decimal("25000.00"),
    cobraComision: true,
    esCentral: false,
    esZonaEspecial: false,
    tiendaId: "t1",
    tarifaModelo: "nuevo",
    tarifaId: null,
    tarifaValorFlete: null,
    tarifaValorFleteGam: null,
    tarifaValorFleteDevuelto: null,
    tarifaValorFleteDevueltoGam: null,
    tarifaComisionCod: null,
    tarifaIvaFlete: null,
    tarifaIvaComisionCod: null,
    tarifaEspecial: null,
    tarifaEspecialDevuelta: null,
    conceptos: [
      {
        concepto: "tienda_flete_entregado",
        modo: "monto",
        valor: new Prisma.Decimal("2000.00"),
        ivaPct: new Prisma.Decimal("13.00"),
        nivel: "tienda_zona",
        tarifaValorId: "tv-tienda_flete_entregado",
      },
    ],
  };
}

function catalogo(fila: Record<string, unknown>) {
  return {
    findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) =>
      args.where.id.in.map((id) => ({ id, ...fila })),
    ),
  };
}

/** La tx de `crearCierre` (camino de la solicitud) con lo que el modelo nuevo escribe. */
function txCrear(opts: { vinculadas?: string[] } = {}) {
  const vinculadas = opts.vinculadas ?? ["g1", "g2"];
  return {
    cierreDia: { create: vi.fn(async () => ({ id: "c1" })), update: vi.fn(async () => ({ id: "c1" })) },
    gestionOrden: {
      updateMany: vi.fn(async () => ({ count: vinculadas.length })),
      findMany: vi.fn(
        async (args: { where: { cierreId?: string | null; id?: { in: string[] } }; select?: Record<string, unknown> }) => {
          if (typeof args.where.cierreId !== "string") return []; // rechazos de tienda sueltos
          // La relectura del pago congelado pide ids (SLT-52 T5.5: con su orden y su resultado,
          // para rebasar el %); la suma de los totales del nuevo, los snapshots; la del snapshot,
          // las filas de la orden.
          if (args.where.id !== undefined) {
            return args.where.id.in
              .filter((id) => vinculadas.includes(id))
              .map((id) => ({ id, ordenId: "o1", resultado: "entregado" }));
          }
          if (args.select !== undefined && "pagoMensajero" in args.select) return [];
          return [snapshotRow("o1")];
        },
      ),
    },
    cierreDetail: {
      createMany: vi.fn(async () => ({ count: 1 })),
      createManyAndReturn: vi.fn(async (args: { data: { ordenId: string }[] }) =>
        args.data.map((d) => ({ id: `cd-${d.ordenId}`, ordenId: d.ordenId })),
      ),
    },
    cierreDetailConcepto: { createMany: vi.fn(async () => ({ count: 3 })) },
    gestionPagoCongelado: { createMany: vi.fn(async () => ({ count: 2 })) },
    zona: catalogo({ nombre: "Cartago", esCentral: false }),
    usuario: catalogo({ nombre: "Tienda X" }),
    provincia: catalogo({ nombre: "Cartago" }),
    canton: catalogo({ nombre: "Central" }),
    distrito: catalogo({ nombre: "Oriental", zonasEspeciales: [] }),
  };
}

function repoCrear(tx: ReturnType<typeof txCrear>, cobroDeO1: TarifaTienda | null) {
  const prisma = { $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  const tarifaRepo = {
    resolveTarifas: vi.fn(
      async () =>
        new Map([[clavePar({ tiendaId: "t1", zonaId: "z1", distritoId: "d1" }), cobroDeO1]]),
    ),
  } as unknown as ITarifaVigenteRepository;
  return new CierreDiaRepository(prisma as unknown as PrismaClient, tarifaRepo);
}

const CONGELADOS: PagoCongelado[] = [
  {
    gestionId: "g1",
    actor: "mensajero",
    valor: pago("mensajero_entregado", "monto", "1500.00"),
    base: null,
    importe: "1500.00",
  },
  {
    gestionId: "g1",
    actor: "satelite",
    valor: pago("satelite_entregado", "porcentaje", "10.00"),
    base: "2000.00",
    importe: "200.00",
  },
  {
    gestionId: "g-ajena", // la leyo el servicio, pero OTRO cierre se la llevo antes de esta tx
    actor: "mensajero",
    valor: pago("mensajero_entregado", "monto", "1500.00"),
    base: null,
    importe: "1500.00",
  },
];

function input(extra: Partial<CrearCierreInput> = {}): CrearCierreInput {
  return {
    mensajeroId: "m1",
    destinoTipo: "bodega_satelite",
    destinoZonaId: "z1",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    pagoByGestionId: { g1: "1500.00" },
    totalPagoMensajero: "1500.00",
    ingresoByGestionId: { g1: "200.00" },
    totalIngresoBodegaRechazos: "200.00",
    pagos: { modelo: "nuevo", congelados: CONGELADOS },
    ...extra,
  };
}

const dataDe = (mock: { mock: { calls: unknown[][] } }) =>
  (mock.mock.calls[0]![0] as { data: Record<string, unknown>[] }).data;

describe("SLT-52 R40 — `crearCierre` congela el modelo nuevo en la MISMA transaccion", () => {
  it("SLT-52 R40/R42 — el detalle se marca `nuevo` y las columnas `tarifa_*` del viejo van NULL", async () => {
    const tx = txCrear();
    const id = await repoCrear(tx, COBRO_NUEVO).crearCierre(input());

    expect(id).toBe("c1");
    expect(tx.cierreDetail.createMany).not.toHaveBeenCalled();
    const [detalle] = dataDe(tx.cierreDetail.createManyAndReturn);
    expect(detalle).toMatchObject({
      cierreId: "c1",
      ordenId: "o1",
      tarifaModelo: "nuevo",
      tarifaId: null,
      tarifaValorFlete: null,
      tarifaFulfillment: null,
      tarifaIvaFlete: null,
    });
  });

  it("SLT-52 R40/R46 — un concepto de cobro por fila, con modo, valor, IVA, nivel y valor de origen (fulfillment con su IVA)", async () => {
    const tx = txCrear();
    await repoCrear(tx, COBRO_NUEVO).crearCierre(input());

    const filas = dataDe(tx.cierreDetailConcepto.createMany).map((f) => ({
      ...f,
      valor: (f.valor as Prisma.Decimal).toFixed(2),
      ivaPct: (f.ivaPct as Prisma.Decimal).toFixed(2),
    }));
    expect(filas).toEqual([
      { cierreDetailId: "cd-o1", concepto: "tienda_flete_entregado", modo: "monto", valor: "2000.00", ivaPct: "13.00", nivel: "tienda_zona", tarifaValorId: "tv-tienda_flete_entregado" },
      { cierreDetailId: "cd-o1", concepto: "tienda_comision_cod", modo: "porcentaje", valor: "3.50", ivaPct: "13.00", nivel: "tienda_zona", tarifaValorId: "tv-tienda_comision_cod" },
      { cierreDetailId: "cd-o1", concepto: "tienda_fulfillment", modo: "monto", valor: "500.00", ivaPct: "13.00", nivel: "tienda_zona", tarifaValorId: "tv-tienda_fulfillment" },
    ]);
  });

  it("SLT-52 R40/R34 — el pago congelado de cada gestion VINCULADA aqui, sin IVA y con base solo en %", async () => {
    const tx = txCrear();
    await repoCrear(tx, COBRO_NUEVO).crearCierre(input());

    const filas = dataDe(tx.gestionPagoCongelado.createMany).map((f) => ({
      ...f,
      valor: (f.valor as Prisma.Decimal).toFixed(2),
      base: f.base === null ? null : (f.base as Prisma.Decimal).toFixed(2),
      importe: (f.importe as Prisma.Decimal).toFixed(2),
    }));
    expect(filas).toEqual([
      { gestionOrdenId: "g1", actor: "mensajero", concepto: "mensajero_entregado", modo: "monto", valor: "1500.00", nivel: "grupo", tarifaValorId: "tv-mensajero_entregado", base: null, importe: "1500.00" },
      { gestionOrdenId: "g1", actor: "satelite", concepto: "satelite_entregado", modo: "porcentaje", valor: "10.00", nivel: "grupo", tarifaValorId: "tv-satelite_entregado", base: "2000.00", importe: "200.00" },
    ]);
    // La gestion que otro cierre se llevo no se congela aqui: se pregunta por ESTE cierre.
    const relectura = tx.gestionOrden.findMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown> })
      .find((a) => a.where.id !== undefined);
    expect(relectura?.where).toEqual({ cierreId: "c1", id: { in: ["g1", "g-ajena"] } });
  });

  it("SLT-52 R23 — un cobro sin conceptos (todo «sin tarifa») no escribe filas de concepto, y el cierre se crea", async () => {
    const tx = txCrear();
    const id = await repoCrear(tx, { modelo: "nuevo", valores: {} }).crearCierre(input());

    expect(id).toBe("c1");
    expect(tx.cierreDetailConcepto.createMany).not.toHaveBeenCalled();
    expect(dataDe(tx.cierreDetail.createManyAndReturn)[0]).toMatchObject({ tarifaModelo: "nuevo" });
  });

  it("SLT-52 R37 — en el modelo nuevo, sin el pago congelado, LANZA (no se crea un cierre a medias)", async () => {
    const tx = txCrear();
    await expect(
      repoCrear(tx, COBRO_NUEVO).crearCierre(input({ pagos: undefined })),
    ).rejects.toBeInstanceOf(ModelosDeTarifaMezclados);
  });

  it("SLT-52 R37 — cobro nuevo y pago viejo (la empresa cambio entre medias): LANZA", async () => {
    const tx = txCrear();
    await expect(
      repoCrear(tx, COBRO_NUEVO).crearCierre(input({ pagos: { modelo: "viejo", congelados: [] } })),
    ).rejects.toBeInstanceOf(ModelosDeTarifaMezclados);
  });

  it("SLT-52 R42 — en el modelo viejo el detalle se escribe como antes y no se congela nada nuevo", async () => {
    const tx = txCrear();
    const viejo: TarifaTienda = {
      modelo: "viejo",
      tarifa: {
        tarifaId: "ta-1",
        valorFlete: "1000.00",
        valorFleteGam: "1000.00",
        valorFleteDevuelto: "500.00",
        valorFleteDevueltoGam: "500.00",
        comisionCod: "3.00",
        ivaFlete: "13.00",
        ivaComisionCod: "13.00",
        fulfillment: "0.00",
        tarifaEspecial: null,
        tarifaEspecialDevuelta: null,
      },
    };
    await repoCrear(tx, viejo).crearCierre(input({ pagos: { modelo: "viejo", congelados: [] } }));

    expect(tx.cierreDetail.createManyAndReturn).not.toHaveBeenCalled();
    const [detalle] = dataDe(tx.cierreDetail.createMany);
    expect(detalle).not.toHaveProperty("tarifaModelo"); // DEFAULT `viejo`: la fila de siempre
    expect(detalle).toMatchObject({ tarifaId: "ta-1" });
    expect(tx.cierreDetailConcepto.createMany).not.toHaveBeenCalled();
    expect(tx.gestionPagoCongelado.createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// Re-solicitud de un rechazado (477): el pago de las rehechas se resuelve DENTRO de la tx.
// ---------------------------------------------------------------------------------------------

function txResolicitud() {
  const tx = {
    $queryRaw: vi.fn(async (q: unknown) => {
      const texto = ((q as { strings?: readonly string[] }).strings ?? []).join(" ");
      // El predicado de «orden en correccion» (SQL crudo): o1 esta en correccion en c-rech.
      return texto.includes("FOR UPDATE") ? [] : [{ orden_id: "o1", cierre_id: "c-rech" }];
    }),
    cierreDia: { updateMany: vi.fn(async () => ({ count: 1 })) },
    gestionOrden: {
      findMany: vi.fn(async (args: { select: Record<string, unknown> }) => {
        if ("orden" in args.select) {
          return [
            {
              id: "g1b",
              ordenId: "o1",
              resultado: "entregado",
              orden: {
                distritoId: "d-norte",
                tiendaId: "t1",
                zonaId: "z-orden",
                montoCobrar: new Prisma.Decimal("25000.00"),
                cobraComision: true,
              },
            },
          ];
        }
        if ("pagoMensajero" in args.select) return []; // recalculo de totales
        return [{ id: "g1b" }]; // candidatas
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    gestionPagoCongelado: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 1 })),
    },
    cierreDetail: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async () => [detalleNuevo("o1")]), // SLT-52 T5.5: el cobro congelado de la rehecha
    },
  };
  const prisma = { $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  const repo = new CierreDiaRepository(prisma as unknown as PrismaClient, {} as ITarifaVigenteRepository);
  return { tx, repo };
}

describe("SLT-52 R33/R40 — la re-solicitud de un rechazado paga y congela cada rehecha con SU contexto", () => {
  it("SLT-52 R19/R33 — resuelve con la zona DESTINO del cierre, el vehiculo y el distrito de la orden", async () => {
    resolverPagosCon.mockResolvedValue(
      new Map([
        [
          "g1b",
          { modelo: "nuevo", mensajero: pago("mensajero_entregado", "monto", "1750.00"), satelite: null, baseFlete: "2000.00" },
        ],
      ]),
    );
    const { tx, repo } = txResolicitud();

    const ok = await repo.resolicitarCierreRechazado({
      cierreId: "c-rech",
      mensajeroId: "m1",
      zonaId: "z-destino",
      vehiculoId: "veh-moto",
    });

    expect(ok).toBe(true);
    expect(resolverPagosCon).toHaveBeenCalledWith(tx, [
      {
        gestionId: "g1b",
        resultado: "entregado",
        mensajeroId: "m1",
        zonaId: "z-destino",
        vehiculoId: "veh-moto",
        distritoId: "d-norte",
        tiendaId: "t1",
        zonaOrdenId: "z-orden",
        montoCobrar: "25000.00",
        cobraComision: true,
      },
    ]);
    // El pago de la rehecha es el de SU valor (1750), escrito agrupado y guardado por el cierre.
    const escrituras = (tx.gestionOrden.updateMany.mock.calls as unknown[][]).map(
      (c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> },
    );
    const pagoEscrito = escrituras.find((e) => "pagoMensajero" in e.data);
    expect(pagoEscrito?.where).toEqual({ id: { in: ["g1b"] }, cierreId: "c-rech" });
    expect((pagoEscrito?.data.pagoMensajero as Prisma.Decimal).toFixed(2)).toBe("1750.00");
  });

  it("SLT-52 R40 — re-congela: borra el congelado de la rehecha y escribe el nuevo", async () => {
    resolverPagosCon.mockResolvedValue(
      new Map([
        [
          "g1b",
          { modelo: "nuevo", mensajero: pago("mensajero_entregado", "monto", "1750.00"), satelite: null, baseFlete: "2000.00" },
        ],
      ]),
    );
    const { tx, repo } = txResolicitud();

    await repo.resolicitarCierreRechazado({ cierreId: "c-rech", mensajeroId: "m1", zonaId: "z-destino", vehiculoId: null });

    expect(tx.gestionPagoCongelado.deleteMany).toHaveBeenCalledWith({ where: { gestionOrdenId: { in: ["g1b"] } } });
    const [fila] = dataDe(tx.gestionPagoCongelado.createMany);
    expect(fila).toMatchObject({ gestionOrdenId: "g1b", actor: "mensajero", concepto: "mensajero_entregado", base: null });
    expect((fila!.importe as Prisma.Decimal).toFixed(2)).toBe("1750.00");
  });
});

// ---------------------------------------------------------------------------------------------
// Correccion de un resultado (398): re-congela el pago de UNA gestion.
// ---------------------------------------------------------------------------------------------

function txCorreccion() {
  const tx = {
    gestionOrden: {
      findFirst: vi.fn(async () => ({
        cierreId: "c-1",
        mensajeroId: "m1",
        eventos: [{ id: "ev" }], // gestion PENDIENTE (rama sin transicion de la orden)
        orden: {
          id: "o-1",
          numGuia: 1,
          numRemision: "REM-1",
          distritoId: "d-sur",
          tiendaId: "t1",
          zonaId: "z-orden",
          montoCobrar: null,
          cobraComision: false,
        },
        cierre: { destinoZonaId: "z-cierre", mensajero: { vehiculoId: "veh-1" } },
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => ({ orden: { numGuia: 1, numRemision: "REM-1" } })),
    },
    gestionOrdenPago: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    // SLT-52 T5.5: el cobro congelado de la orden en ese cierre, base del % del rechazo (R52).
    cierreDetail: { findFirst: vi.fn(async () => detalleNuevo("o-1")) },
    gestionPagoCongelado: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      createMany: vi.fn(async () => ({ count: 2 })),
    },
    cierreDia: { updateMany: vi.fn(async () => ({ count: 1 })) },
    orden: { updateMany: vi.fn(async () => ({ count: 1 })) },
    ordenEvento: { create: vi.fn(async () => ({ id: "oe-1" })) },
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 0),
    $queryRawUnsafe: vi.fn(async () => []),
    $executeRawUnsafe: vi.fn(async () => 0),
    ordenHistorialEstado: { createMany: vi.fn(async () => ({ count: 1 })) },
    historialAccion: { createMany: vi.fn(async () => ({ count: 1 })) },
    usuario: {
      findUnique: vi.fn(async () => ({ nombre: "Admin", primerApellido: "Uno", rol: { value: "admin" } })),
    },
    webhookSuscripcion: { findMany: vi.fn(async () => []) },
    notificacion: { createMany: vi.fn(async () => ({ count: 0 })) },
    job: { createMany: vi.fn(async () => ({ count: 0 })) },
  };
  const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const sinUsar = {} as never;
  const repo = new CierresAdminRepository(
    prisma as unknown as PrismaClient,
    sinUsar,
    sinUsar,
    sinUsar,
    sinUsar,
    sinUsar,
    sinUsar,
    sinUsar,
  );
  return { tx, repo };
}

describe("SLT-52 R33/R40 — la correccion de un resultado paga y re-congela con el resolver unico", () => {
  it("SLT-52 R19/R33 — resuelve el rechazo con la zona del cierre, el vehiculo y el distrito de la orden; el mensajero cobra su concepto de rechazo", async () => {
    resolverPagosCon.mockResolvedValue(
      new Map([
        [
          "g-1",
          {
            modelo: "nuevo",
            mensajero: pago("mensajero_rechazo", "monto", "300.00"),
            satelite: pago("satelite_rechazo", "monto", "450.50"),
            baseFlete: "0.00",
          },
        ],
      ]),
    );
    const { tx, repo } = txCorreccion();

    const r = await repo.corregirResultadoGestionEnCierre({
      gestionId: "g-1",
      alcance: { destinoTipo: "bodega_central", destinoZonaId: null },
      motivo: "el cliente lo rechazo",
      corregidoPor: "adm",
      estatusEntregadaId: "os-entregada",
      estatusRechazadaId: "os-rechazada",
    });

    expect(r.status).toBe("updated");
    expect(resolverPagosCon).toHaveBeenCalledWith(tx, [
      {
        gestionId: "g-1",
        resultado: "devolucion_a_origen_por_rechazo",
        mensajeroId: "m1",
        zonaId: "z-cierre",
        vehiculoId: "veh-1",
        distritoId: "d-sur",
        tiendaId: "t1",
        zonaOrdenId: "z-orden",
        montoCobrar: null,
        cobraComision: false,
      },
    ]);
    const sello = (tx.gestionOrden.updateMany.mock.calls as unknown[][])[0]![0] as {
      data: Record<string, unknown>;
    };
    expect((sello.data.pagoMensajero as Prisma.Decimal).toFixed(2)).toBe("300.00");
    expect((sello.data.ingresoBodegaRechazo as Prisma.Decimal).toFixed(2)).toBe("450.50");
  });

  it("SLT-52 R40 — borra el congelado de ESA gestion y escribe el del resultado corregido", async () => {
    resolverPagosCon.mockResolvedValue(
      new Map([
        [
          "g-1",
          {
            modelo: "nuevo",
            mensajero: pago("mensajero_rechazo", "monto", "300.00"),
            satelite: pago("satelite_rechazo", "monto", "450.50"),
            baseFlete: "0.00",
          },
        ],
      ]),
    );
    const { tx, repo } = txCorreccion();

    await repo.corregirResultadoGestionEnCierre({
      gestionId: "g-1",
      alcance: { destinoTipo: "bodega_central", destinoZonaId: null },
      motivo: "el cliente lo rechazo",
      corregidoPor: "adm",
      estatusEntregadaId: "os-entregada",
      estatusRechazadaId: "os-rechazada",
    });

    expect(tx.gestionPagoCongelado.deleteMany).toHaveBeenCalledWith({ where: { gestionOrdenId: "g-1" } });
    const filas = dataDe(tx.gestionPagoCongelado.createMany).map((f) => [
      f.gestionOrdenId,
      f.actor,
      f.concepto,
      (f.importe as Prisma.Decimal).toFixed(2),
    ]);
    expect(filas).toEqual([
      ["g-1", "mensajero", "mensajero_rechazo", "300.00"],
      ["g-1", "satelite", "satelite_rechazo", "450.50"],
    ]);
  });
});
