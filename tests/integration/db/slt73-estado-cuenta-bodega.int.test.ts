import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { EstadoCuentaRepository } from "@/lib/repositories/EstadoCuentaRepository";
import { OrigenLegibleRepository } from "@/lib/repositories/OrigenLegibleRepository";
import { RechazoTiendaCobroAnulacionRepository } from "@/lib/repositories/RechazoTiendaCobroAnulacionRepository";
import { SaldosSatelitesRepository } from "@/lib/repositories/SaldosSatelitesRepository";
import { EstadoCuentaService } from "@/lib/services/EstadoCuentaService";
import { OrigenLegibleService } from "@/lib/services/OrigenLegibleService";
import type { EstadoCuentaDTO, FilaEstadoCuentaDTO } from "@/lib/types/estado-cuenta";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { busquedaPorGuiaDe } from "./_fixtures/busqueda-469";

// SL-23 (design §10): la puerta de modulo con todo encendido; aqui no se prueba el modulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());

// SLT-73 · T13 (enmienda 2, D16; R31–R33) — EL ESTADO DE CUENTA DE LA BODEGA = LA DEUDA, CONTRA POSTGRES.
//
// El libro de la bodega es una UNION en SQL a mano (`EstadoCuentaRepository.movimientosDeBodegaSql`):
// un doble de Prisma no ve su `WHERE`, asi que se mide aqui con filas reales. Este archivo crea TODOS
// sus datos (corre en una base vacia) y falla si no los encuentra. Los esperados van escritos a mano.
//
// La bodega Z (instantes UTC; dia en Costa Rica, UTC−6):
//
//   A   consolidacion SOLICITADA, sin marcar (1 oct). Sus cierres:
//         a1 general 1 000 (efectivo 400 + SINPE 600), pago 100, ganancia 50 → 850
//         a2 general   300                                                  → 300
//       declarado = 1 150,00 (su efectivo es 700: con la formula vieja serian 700,00)
//   B   consolidacion APROBADA y recibida de menos (pedida el 2 oct, marcada el 3): su cierre b1 de
//       600 → declarado 600,00; recibido 500,00
//   R   consolidacion RECHAZADA: no sale. Su cierre r1 (400, aprobado el 4 oct) SI cuenta: rechazar no
//       suelta los cierres (Q11) y R5 lo sigue contando → fila «sin consolidar» de 400,00
//   s1  un cierre SIN consolidar sin recaudo, con pago al mensajero (5 oct) → −200,00, con su signo
//   NO cuentan: un cierre `solicitado` (5 000), uno `rechazado` (6 000), uno con destino
//   `bodega_central` hacia la zona Z (7 000) y uno de OTRA bodega satelite W (999).
//
//   Corrido: 1 150 → 1 750 → 1 250 → 1 650 → 1 450.
//   Deuda R5 = 850 + 300 + 600 + 400 − 200 − 500 = 1 450,00 (la fila de `/wallet/satelites`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const D1 = new Date("2026-10-01T15:00:00.000Z");
const D2 = new Date("2026-10-02T15:00:00.000Z");
const D3 = new Date("2026-10-03T15:00:00.000Z");
const D4 = new Date("2026-10-04T15:00:00.000Z");
const D5 = new Date("2026-10-05T15:00:00.000Z");
const antes = (d: Date) => new Date(d.getTime() - 3_600_000);

interface Siembra {
  zonaZ: string;
  consolidacionA: string;
  consolidacionB: string;
  cierreR1: string;
  cierreS1: string;
}

interface Medida {
  s: Siembra;
  entero: EstadoCuentaDTO;
  periodo3a4: EstadoCuentaDTO;
  descarga: EstadoCuentaDTO;
  deudaDeLaTabla: string;
  totalesActuales: { declarado: string; recibido: string };
  totalesAntesDel3: { declarado: string; recibido: string };
  periodoEntero: number;
}

function lineaDe(f: FilaEstadoCuentaDTO): string {
  return `${f.fecha}|${f.cargo ?? "-"}|${f.abono ?? "-"}|${f.saldoCorrido}|${f.chip}`;
}

describeSiHayBase("SLT-73 T13 — el estado de cuenta de la bodega es la deuda (R31–R33), con filas reales", () => {
  let prisma: PrismaClient;
  let medida: Medida | undefined;
  let fallo: unknown;

  function m(): Medida {
    if (fallo !== undefined) throw fallo;
    if (medida === undefined) throw new Error("la medida no llego a tomarse");
    return medida;
  }

  async function zona(tx: TxDeTest, marca: string): Promise<string> {
    const z = await tx.zona.create({
      data: {
        nombre: `Zona slt73-ec ${marca} ${Date.now().toString(36)}`,
        sinpeNumero: "80000000",
        sinpeNombre: "Titular de Prueba",
        cobroVehiculo: false,
      },
      select: { id: true },
    });
    return z.id;
  }

  async function sembrar(tx: TxDeTest): Promise<Siembra & { maestro: Actor }> {
    const admin = await crearUsuarioDePrueba(tx, "adminSatelite");
    const mens = await crearUsuarioDePrueba(tx, "mensajero");
    const maestro = await crearUsuarioDePrueba(tx, "maestro");
    const zonaZ = await zona(tx, "Z");
    const zonaW = await zona(tx, "W");

    const cierre = async (d: {
      zonaId?: string;
      general: string;
      efectivo?: string;
      pago?: string;
      gana?: string;
      estado?: "aprobado" | "solicitado" | "rechazado";
      destino?: "bodega_satelite" | "bodega_central";
      aprobadoAt: Date;
      cierreBodegaId?: string;
    }) => {
      const efectivo = d.efectivo ?? d.general;
      const c = await tx.cierreDia.create({
        data: {
          mensajeroId: mens.id,
          estado: d.estado ?? "aprobado",
          destinoTipo: d.destino ?? "bodega_satelite",
          destinoZonaId: d.zonaId ?? zonaZ,
          totalEfectivo: new Prisma.Decimal(efectivo),
          totalSimpe: new Prisma.Decimal(d.general).minus(efectivo),
          totalGeneral: new Prisma.Decimal(d.general),
          totalPagoMensajero: new Prisma.Decimal(d.pago ?? "0.00"),
          totalIngresoBodegaRechazos: new Prisma.Decimal(d.gana ?? "0.00"),
          // Pedido DOS dias antes de aprobarse: la fila «sin consolidar» va fechada en la aprobacion (R32).
          solicitadoAt: new Date(d.aprobadoAt.getTime() - 2 * 86_400_000),
          resueltoAt: d.estado === "solicitado" ? null : d.aprobadoAt,
          resueltoPor: d.estado === "solicitado" ? null : admin.id,
          cierreBodegaId: d.cierreBodegaId ?? null,
        },
        select: { id: true },
      });
      return c.id;
    };

    const consolidacionA = (
      await tx.cierreBodega.create({
        data: {
          zonaId: zonaZ,
          solicitadoPor: admin.id,
          estado: "solicitado",
          totalEfectivo: "700.00",
          totalSimpe: "600.00",
          totalGeneral: "1300.00",
          totalPagoMensajero: "100.00",
          totalIngresoBodegaRechazos: "50.00",
          solicitadoAt: D1,
        },
        select: { id: true },
      })
    ).id;
    await cierre({ general: "1000.00", efectivo: "400.00", pago: "100.00", gana: "50.00", aprobadoAt: antes(D1), cierreBodegaId: consolidacionA });
    await cierre({ general: "300.00", aprobadoAt: antes(D1), cierreBodegaId: consolidacionA });

    const consolidacionB = (
      await tx.cierreBodega.create({
        data: {
          zonaId: zonaZ,
          solicitadoPor: admin.id,
          estado: "aprobado",
          totalEfectivo: "600.00",
          totalGeneral: "600.00",
          solicitadoAt: D2,
          resueltoPor: maestro.id,
          resueltoAt: D3,
          conciliadoAt: D3,
          conciliadoPor: maestro.id,
          montoRecibido: "500.00",
        },
        select: { id: true },
      })
    ).id;
    await cierre({ general: "600.00", aprobadoAt: antes(D2), cierreBodegaId: consolidacionB });

    const consolidacionR = (
      await tx.cierreBodega.create({
        data: {
          zonaId: zonaZ,
          solicitadoPor: admin.id,
          estado: "rechazado",
          totalEfectivo: "400.00",
          totalGeneral: "400.00",
          solicitadoAt: D4,
          resueltoPor: maestro.id,
          resueltoAt: D4,
          motivoRechazo: "Rechazada T13",
        },
        select: { id: true },
      })
    ).id;
    const cierreR1 = await cierre({ general: "400.00", aprobadoAt: D4, cierreBodegaId: consolidacionR });
    const cierreS1 = await cierre({ general: "0.00", pago: "200.00", aprobadoAt: D5 });

    // Lo que NO cuenta en la deuda de Z.
    await cierre({ general: "5000.00", estado: "solicitado", aprobadoAt: D5 });
    await cierre({ general: "6000.00", estado: "rechazado", aprobadoAt: D5 });
    await cierre({ general: "7000.00", destino: "bodega_central", aprobadoAt: D5 });
    await cierre({ zonaId: zonaW, general: "999.00", aprobadoAt: D5 });

    return {
      zonaZ,
      consolidacionA,
      consolidacionB,
      cierreR1,
      cierreS1,
      maestro: { usuarioId: maestro.id, rol: "maestro" },
    };
  }

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    try {
      medida = await enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);
        const { maestro, ...s } = await sembrar(tx);
        const cliente = clienteConSavepoint(tx);
        const repo = new EstadoCuentaRepository(cliente);
        const ec = new EstadoCuentaService(
          repo,
          new RechazoTiendaCobroAnulacionRepository(cliente),
          new OrigenLegibleService(new OrigenLegibleRepository(cliente)),
          busquedaPorGuiaDe(cliente),
        );
        const leer = async (extra: Record<string, unknown>): Promise<EstadoCuentaDTO> => {
          const r = await ec.leer(
            { cuenta: { tipo: "bodega", id: s.zonaZ }, page: 1, pageSize: 50, sortBy: "fecha", sortDir: "asc", ...extra },
            maestro,
          );
          if (r.status !== "ok") throw new Error(`estado de cuenta: ${JSON.stringify(r)}`);
          return r.estado;
        };
        const completo = await ec.leerCompleto({ cuenta: { tipo: "bodega", id: s.zonaZ }, sortBy: "fecha", sortDir: "asc" }, maestro);
        if (completo.status !== "ok") throw new Error(`descarga: ${completo.status}`);
        const saldos = await new SaldosSatelitesRepository(tx as unknown as PrismaClient).findSaldosCompleto();
        const filaZ = saldos.find((f) => f.zonaId === s.zonaZ);
        if (filaZ === undefined) throw new Error("la bodega Z no aparece en `/wallet/satelites`");
        return {
          s,
          entero: await leer({}),
          periodo3a4: await leer({ desde: "2026-10-03", hasta: "2026-10-04" }),
          descarga: completo.estado,
          deudaDeLaTabla: filaZ.saldoSinConciliar,
          totalesActuales: await repo.totalesDeBodega(s.zonaZ),
          totalesAntesDel3: await repo.totalesDeBodega(s.zonaZ, D3),
          periodoEntero: (await repo.periodoDeBodega(s.zonaZ)).length,
        };
      });
    } catch (error) {
      fallo = error;
    }
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("⭑ R31: sin filtros, el corrido final y el pendiente = la deuda de la zona en `/wallet/satelites`", () => {
    const e = m().entero;
    expect(e.saldoActual).toBe("1450.00");
    expect(e.saldoFinal).toBe("1450.00");
    expect(e.filas[e.filas.length - 1].saldoCorrido).toBe("1450.00");
    expect(m().deudaDeLaTabla).toBe("1450.00");
  });

  it("⭑ R32: declarado = el neto de cada consolidacion; una fila «sin consolidar» por cierre fuera de una no rechazada", () => {
    const e = m().entero;
    expect(e.filas.map(lineaDe)).toEqual([
      "2026-10-01|1150.00|-|1150.00|declarado",
      "2026-10-02|600.00|-|1750.00|declarado",
      "2026-10-03|-|500.00|1250.00|recibido",
      "2026-10-04|400.00|-|1650.00|sin_consolidar",
      "2026-10-05|-200.00|-|1450.00|sin_consolidar",
    ]);
    expect(e.total).toBe(5);
    // Las de una consolidacion llevan su id (marcar/desmarcar); las de un cierre, ninguna.
    expect(e.filas.map((f) => f.consolidacionId)).toEqual([
      m().s.consolidacionA,
      m().s.consolidacionB,
      m().s.consolidacionB,
      null,
      null,
    ]);
    expect([e.saldoInicial, e.abonos, e.cargos, e.sentido]).toEqual(["0.00", "500.00", "1950.00", "por_entregar"]);
  });

  it("R32: las filas «sin consolidar» son el cierre de la RECHAZADA y el sin consolidar, con su origen", () => {
    const sin = m().entero.filas.filter((f) => f.chip === "sin_consolidar");
    expect(sin.map((f) => f.origenTipo)).toEqual(["cierre_dia", "cierre_dia"]);
    expect(m().periodoEntero).toBe(5);
  });

  it("⭑ R33: los totales del repositorio y del periodo salen de la misma union que la pagina", () => {
    expect(m().totalesActuales).toEqual({ declarado: "1950.00", recibido: "500.00" });
    expect(m().totalesAntesDel3).toEqual({ declarado: "1750.00", recibido: "0.00" });
    const p = m().periodo3a4;
    expect(p.filas.map(lineaDe)).toEqual([
      "2026-10-03|-|500.00|1250.00|recibido",
      "2026-10-04|400.00|-|1650.00|sin_consolidar",
    ]);
    expect([p.saldoInicial, p.abonos, p.cargos, p.saldoFinal, p.saldoActual]).toEqual([
      "1750.00",
      "500.00",
      "400.00",
      "1650.00",
      "1450.00",
    ]);
  });

  it("R33: la descarga trae las mismas filas y las mismas tarjetas que la pantalla", () => {
    const d = m().descarga;
    expect(d.filas.map(lineaDe)).toEqual(m().entero.filas.map(lineaDe));
    expect([d.saldoInicial, d.abonos, d.cargos, d.saldoFinal, d.saldoActual]).toEqual([
      "0.00",
      "500.00",
      "1950.00",
      "1450.00",
      "1450.00",
    ]);
  });
});
