import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type TarifaModelo } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { cierresConModeloNuevo } from "@/lib/repositories/_shared/detalle-modelo-nuevo";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { EstadoCuentaRepository } from "@/lib/repositories/EstadoCuentaRepository";
import { OrigenLegibleRepository } from "@/lib/repositories/OrigenLegibleRepository";
import { RechazoTiendaCobroAnulacionRepository } from "@/lib/repositories/RechazoTiendaCobroAnulacionRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { EstadoCuentaService } from "@/lib/services/EstadoCuentaService";
import { OrigenLegibleService } from "@/lib/services/OrigenLegibleService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";
import type { FilaEstadoCuentaDTO } from "@/lib/types/estado-cuenta";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { busquedaPorGuiaDe } from "./_fixtures/busqueda-469";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type EventoSqlDeTest,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// SLT-54 (D38, R71) — `incluyeModeloNuevo` EN LA FILA DEL ESTADO DE CUENTA DE LA TIENDA, CONTRA POSTGRES REAL.
//
// Las dos pantallas que escriben «te cobró el flete por devolución a origen» (`/mi-wallet` y
// `/wallet/tiendas`) y sus descargas pintan `FilaEstadoCuentaDTO`, no `WalletTiendaMovimientoDTO`. Cada
// caso lee por las cuatro entradas del servicio, como `servi_app` y con la RLS puesta, y consulta cada fila
// por el id sembrado: un id ausente da `undefined` y el caso sale rojo, asi que ninguno pasa con la lectura vacia.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const MAESTRO: Actor = { usuarioId: "00000000-0000-4000-8000-0000000000aa", rol: "maestro" };
const CRONOLOGICO = { sortBy: "fecha", sortDir: "asc" } as const;
const PAGINA = { page: 1, pageSize: 50, ...CRONOLOGICO };

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

let siguienteGuia = 949_000_000 + Math.floor(Math.random() * 900_000);

interface Empresa {
  org: string;
  fks: FksDeOrden;
  M: string;
}

async function crearEmpresa(tx: TxDeTest): Promise<Empresa> {
  const org = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, org);
  const fks = await crearFksDeOrden(tx);
  const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  return { org, fks, M };
}

async function crearOrden(tx: TxDeTest, fks: FksDeOrden, tiendaId: string = fks.tiendaId): Promise<string> {
  siguienteGuia += 1;
  const orden = await tx.orden.create({
    data: {
      numGuia: siguienteGuia,
      numRemision: `R-SLT54I-${randomUUID().slice(0, 12)}`,
      destinatario: "Modelo SLT-54",
      telefonoDest: "88880000",
      producto: "caja",
      estatusId: fks.estatusId,
      tiendaId,
      zonaId: fks.zonaId,
      provinciaId: fks.provinciaId,
      cantonId: fks.cantonId,
      montoCobrar: new Prisma.Decimal("1000.00"),
      cobraComision: false,
    },
    select: { id: true },
  });
  return orden.id;
}

async function crearDetalle(
  tx: TxDeTest,
  e: Empresa,
  cierreId: string,
  modelo: TarifaModelo,
  tiendaId: string = e.fks.tiendaId,
  ordenId?: string,
): Promise<{ id: string; ordenId: string }> {
  const orden = ordenId ?? (await crearOrden(tx, e.fks, tiendaId));
  const detalle = await tx.cierreDetail.create({
    data: {
      cierreId,
      ordenId: orden,
      cobraComision: false,
      zonaId: e.fks.zonaId,
      tiendaId,
      esCentral: false,
      tarifaModelo: modelo,
      numRemision: "R-1",
      destinatario: "Modelo SLT-54",
      producto: "caja",
      tiendaNombre: "T",
      zonaNombre: "Z",
      provinciaNombre: "P",
      cantonNombre: "C",
    },
    select: { id: true },
  });
  return { id: detalle.id, ordenId: orden };
}

/** Un `cierre_dia` aprobado con una fila de detalle por cada `[modelo, tienda]` pedido. */
async function crearCierre(
  tx: TxDeTest,
  e: Empresa,
  filas: readonly (TarifaModelo | readonly [TarifaModelo, string])[],
): Promise<string> {
  const cierre = await tx.cierreDia.create({
    data: { mensajeroId: e.M, estado: "aprobado", destinoTipo: "bodega_satelite", destinoZonaId: e.fks.zonaId },
    select: { id: true },
  });
  for (const fila of filas) {
    const [modelo, tienda] = typeof fila === "string" ? [fila, e.fks.tiendaId] : fila;
    await crearDetalle(tx, e, cierre.id, modelo, tienda);
  }
  return cierre.id;
}

/** Una fila del libro de la tienda, como las que asienta el feed del cierre. */
async function crearFila(
  tx: TxDeTest,
  tiendaId: string,
  origenId: string,
  origenTipo: "cierre_dia" | "gestion_orden" = "cierre_dia",
): Promise<string> {
  const fila = await tx.walletTiendaMovimiento.create({
    data: {
      tiendaId,
      tipo: "debito",
      categoria: "flete_devolucion",
      monto: new Prisma.Decimal("250.00"),
      origenTipo,
      origenId,
    },
    select: { id: true },
  });
  return fila.id;
}

function servicio(cli: PrismaClient): EstadoCuentaService {
  return new EstadoCuentaService(
    new EstadoCuentaRepository(cli),
    new RechazoTiendaCobroAnulacionRepository(cli),
    new OrigenLegibleService(new OrigenLegibleRepository(cli)),
    busquedaPorGuiaDe(cli),
  );
}

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

type Filas = Map<string, FilaEstadoCuentaDTO>;

interface Lectura {
  oficina: Filas;
  oficinaDescarga: Filas;
  miWallet: Filas;
  miWalletDescarga: Filas;
}

function porId(filas: readonly FilaEstadoCuentaDTO[]): Filas {
  return new Map(
    filas.flatMap((f) => (f.ref !== null && "movimientoId" in f.ref ? [[f.ref.movimientoId, f] as const] : [])),
  );
}

/** El libro de `tiendaId` por las cuatro entradas: las dos pantallas y sus dos descargas. */
async function leer(tx: TxDeTest, org: string, tiendaId: string): Promise<Lectura> {
  const cuenta = { tipo: "tienda" as const, id: tiendaId };
  const tienda: Actor = { usuarioId: tiendaId, rol: "adminTienda" };
  return comoEmpresa(tx, org, async () => {
    const s = servicio(clienteConSavepoint(tx));
    const oficina = await s.leer({ ...PAGINA, cuenta }, MAESTRO);
    const oficinaDescarga = await s.leerCompleto({ ...CRONOLOGICO, cuenta }, MAESTRO);
    const miWallet = await s.leerMiTienda(PAGINA, tienda);
    const miWalletDescarga = await s.leerMiTiendaCompleto(CRONOLOGICO, tienda);
    if (
      oficina.status !== "ok" ||
      oficinaDescarga.status !== "ok" ||
      miWallet.status !== "ok" ||
      miWalletDescarga.status !== "ok"
    ) {
      throw new Error(`la lectura no devolvio ok: ${JSON.stringify([oficina.status, oficinaDescarga.status, miWallet.status])}`);
    }
    return {
      oficina: porId(oficina.estado.filas),
      oficinaDescarga: porId(oficinaDescarga.estado.filas),
      miWallet: porId(miWallet.estado.filas),
      miWalletDescarga: porId(miWalletDescarga.estado.filas),
    };
  });
}

function afirmar(l: Lectura, movimientoId: string, esperado: boolean) {
  expect(l.oficina.get(movimientoId)?.incluyeModeloNuevo).toBe(esperado);
  expect(l.oficinaDescarga.get(movimientoId)?.incluyeModeloNuevo).toBe(esperado);
  expect(l.miWallet.get(movimientoId)?.incluyeModeloNuevo).toBe(esperado);
  expect(l.miWalletDescarga.get(movimientoId)?.incluyeModeloNuevo).toBe(esperado);
}

describeSiHayBase("SLT-54 D38 — incluyeModeloNuevo en la fila del estado de cuenta de la tienda, contra Postgres", () => {
  it("solo viejo: falso en las dos pantallas y en sus descargas, con el importe intacto", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["viejo", "viejo"]);
      const fila = await crearFila(tx, e.fks.tiendaId, cierre);
      return { fila, l: await leer(tx, e.org, e.fks.tiendaId) };
    });
    afirmar(r.l, r.fila, false);
    expect(r.l.oficina.get(r.fila)?.cargo).toBe("250.00");
    expect(r.l.oficina.get(r.fila)?.saldoCorrido).toBe("-250.00");
  });

  it("un cierre sin ninguna fila de detalle se lee como viejo", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const fila = await crearFila(tx, e.fks.tiendaId, await crearCierre(tx, e, []));
      return { fila, l: await leer(tx, e.org, e.fks.tiendaId) };
    });
    afirmar(r.l, r.fila, false);
  });

  it("reprogramado del modelo nuevo: verdadero, con las dos filas que asienta el feed real y sus importes", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, []);
      const { id: detalle, ordenId } = await crearDetalle(tx, e, cierre, "nuevo");
      await tx.cierreDetailConcepto.create({
        data: {
          cierreDetailId: detalle,
          concepto: "tienda_flete_reprogramado",
          modo: "monto",
          valor: new Prisma.Decimal("250.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          nivel: "tienda_general",
        },
      });
      await tx.gestionOrden.create({
        data: { ordenId, mensajeroId: e.M, resultado: "reprogramado", motivo: "Sin nadie en casa", cierreId: cierre },
      });
      const asientos = await new WalletTiendaFeedService({ TIENDA_DEBITA_FLETE_DEVOLUCION: true }).construirMovimientosPorTienda(
        cierre,
        tx as never,
      );
      await tx.walletTiendaMovimiento.createMany({ data: asientos });
      return { tienda: e.fks.tiendaId, cierre, l: await leer(tx, e.org, e.fks.tiendaId) };
    });

    for (const lectura of [r.l.oficina, r.l.oficinaDescarga, r.l.miWallet, r.l.miWalletDescarga]) {
      const filas = [...lectura.values()].map((f) => [f.categoria, f.origenTipo, f.cargo, f.incluyeModeloNuevo]);
      expect(filas).toEqual(
        expect.arrayContaining([
          ["flete_devolucion", "cierre_dia", "250.00", true],
          ["iva_flete_devolucion", "cierre_dia", "32.50", true],
        ]),
      );
      expect(filas).toHaveLength(2);
    }
  });

  it("mixto dentro de un cierre: verdadero", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const fila = await crearFila(tx, e.fks.tiendaId, await crearCierre(tx, e, ["viejo", "nuevo", "viejo"]));
      return { fila, l: await leer(tx, e.org, e.fks.tiendaId) };
    });
    afirmar(r.l, r.fila, true);
  });

  it("entre cierres, cada fila dice el suyo", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const vieja = await crearFila(tx, e.fks.tiendaId, await crearCierre(tx, e, ["viejo"]));
      const nueva = await crearFila(tx, e.fks.tiendaId, await crearCierre(tx, e, ["nuevo"]));
      return { vieja, nueva, l: await leer(tx, e.org, e.fks.tiendaId) };
    });
    afirmar(r.l, r.vieja, false);
    afirmar(r.l, r.nueva, true);
  });

  it("empresa activada: la fila del cierre de antes de activar sigue en falso y la del siguiente sale verdadera", async () => {
    const solicitar = async (tx: TxDeTest, e: Empresa, M: string): Promise<string> => {
      const ordenId = await crearOrden(tx, e.fks);
      await tx.gestionOrden.create({
        data: {
          ordenId,
          mensajeroId: M,
          resultado: "entregado",
          montoRecibido: new Prisma.Decimal("1000.00"),
          pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal("1000.00") }] },
        },
      });
      const s = await comoEmpresa(tx, e.org, () => {
        const cli = clienteConSavepoint(tx);
        return new CierreDiaService(
          new CierreDiaRepository(cli, new TarifaVigenteRepository(cli)),
          { findCentralZonaId: async () => e.fks.zonaId } as never,
          {
            findUsuarioZonaId: async () => e.fks.zonaId,
            findUsuarioVehiculoId: async () => null,
            findEstatusIdByValue: async () => null,
            findOrdenesEnCorreccion: async () => new Set<string>(),
            findBloqueoDetalle: async () => ({
              bloqueado: false,
              cierresAbiertos: 0,
              cierresPorReenviar: 0,
              aResolverPrimero: null,
              resolicitableMasViejo: null,
            }),
          } as never,
          {} as never,
          new TarifaZonaMensajeroRepository(cli),
        ).solicitarCierre({ usuarioId: M, rol: "mensajero" });
      });
      if (s.status !== "ok" || s.cierreId === undefined) {
        throw new Error(`la solicitud no creo el cierre: ${JSON.stringify(s)}`);
      }
      return s.cierreId;
    };

    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const anterior = await solicitar(tx, e, e.M);
      const filaAnterior = await crearFila(tx, e.fks.tiendaId, anterior);
      await sembrarActivacion(tx, e.org);
      const conSoloAnterior = await leer(tx, e.org, e.fks.tiendaId);

      const M2 = (await crearUsuarioDePrueba(tx, "mensajero")).id;
      const posterior = await solicitar(tx, e, M2);
      const filaPosterior = await crearFila(tx, e.fks.tiendaId, posterior);

      const modelos = await tx.cierreDetail.findMany({
        where: { cierreId: { in: [anterior, posterior] } },
        select: { cierreId: true, tarifaModelo: true },
      });
      return {
        anterior,
        posterior,
        filaAnterior,
        filaPosterior,
        modelos: new Map(modelos.map((m) => [m.cierreId, m.tarifaModelo])),
        conSoloAnterior,
        l: await leer(tx, e.org, e.fks.tiendaId),
      };
    });

    // Lo sembrado, medido: la solicitud real congelo cada cierre con su modelo.
    expect(r.modelos.get(r.anterior)).toBe("viejo");
    expect(r.modelos.get(r.posterior)).toBe("nuevo");

    afirmar(r.conSoloAnterior, r.filaAnterior, false);
    afirmar(r.l, r.filaAnterior, false);
    afirmar(r.l, r.filaPosterior, true);
  });

  it("otra tienda del mismo cierre no contamina: cada tienda responde solo por su detalle", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const otra = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
      const cierre = await crearCierre(tx, e, [["viejo", e.fks.tiendaId], ["nuevo", otra]]);
      const mia = await crearFila(tx, e.fks.tiendaId, cierre);
      const suya = await crearFila(tx, otra, cierre);
      return {
        mia,
        suya,
        lecturaMia: await leer(tx, e.org, e.fks.tiendaId),
        lecturaSuya: await leer(tx, e.org, otra),
      };
    });
    afirmar(r.lecturaMia, r.mia, false);
    afirmar(r.lecturaSuya, r.suya, true);
    // Y ninguna ve la fila de la otra.
    expect(r.lecturaMia.oficina.has(r.suya)).toBe(false);
    expect(r.lecturaSuya.miWallet.has(r.mia)).toBe(false);
  });

  it("otra empresa no contamina: A con `origen_id` en un cierre de B lee falso, y la RLS corta la lectura", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const B = await crearEmpresa(tx);
      const deB = await crearCierre(tx, B, ["nuevo"]);
      const filaDeB = await crearFila(tx, B.fks.tiendaId, deB);
      // Sin el rol de la app, el dueño de las tablas si ve el cierre de B: es la contraprueba de la RLS.
      const sinRls = await cierresConModeloNuevo(tx, [deB], B.fks.tiendaId);

      const A = await crearEmpresa(tx);
      const deA = await crearCierre(tx, A, ["viejo"]);
      const filaDeA = await crearFila(tx, A.fks.tiendaId, deA);
      // `origen_id` no tiene FK, asi que esta fila de A puede apuntar a un cierre de B.
      const filaDeAConOrigenEnB = await crearFila(tx, A.fks.tiendaId, deB);
      const lecturaDeA = await leer(tx, A.org, A.fks.tiendaId);
      const comoA = await comoEmpresa(tx, A.org, () =>
        cierresConModeloNuevo(clienteConSavepoint(tx), [deB], B.fks.tiendaId),
      );

      await fijarEmpresa(tx, B.org);
      const lecturaDeB = await leer(tx, B.org, B.fks.tiendaId);
      return { deB, filaDeA, filaDeB, filaDeAConOrigenEnB, sinRls, comoA, lecturaDeA, lecturaDeB };
    });

    expect([...r.sinRls]).toEqual([r.deB]);
    expect([...r.comoA]).toEqual([]);

    afirmar(r.lecturaDeA, r.filaDeA, false);
    afirmar(r.lecturaDeA, r.filaDeAConOrigenEnB, false);
    expect(r.lecturaDeA.oficina.has(r.filaDeB)).toBe(false);
    afirmar(r.lecturaDeB, r.filaDeB, true);
  });

  it("solo una fila con origen `cierre_dia` mira el detalle, aunque su id coincida con un cierre nuevo", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["nuevo"]);
      const deRechazo = await crearFila(tx, e.fks.tiendaId, cierre, "gestion_orden");
      // Con el cierre en la lectura: la fila de rechazo tiene que descartarse por su origen, no por su ausencia.
      const deCierre = await crearFila(tx, e.fks.tiendaId, cierre);
      return { deRechazo, deCierre, l: await leer(tx, e.org, e.fks.tiendaId) };
    });
    afirmar(r.l, r.deRechazo, false);
    afirmar(r.l, r.deCierre, true);
  });

  it("la fila del mensajero no lleva el campo: el dato es del libro de la tienda", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["nuevo"]);
      await tx.pagoMensajeroMovimiento.create({
        data: {
          mensajeroId: e.M,
          tipo: "devengo",
          categoria: "pago_devengado",
          monto: new Prisma.Decimal("100.00"),
          origenTipo: "cierre_dia",
          origenId: cierre,
        },
      });
      return comoEmpresa(tx, e.org, () =>
        servicio(clienteConSavepoint(tx)).leer({ ...PAGINA, cuenta: { tipo: "mensajero", id: e.M } }, MAESTRO),
      );
    });
    if (r.status !== "ok") throw new Error("la lectura del mensajero no devolvio ok");
    expect(r.estado.filas).toHaveLength(1);
    expect(r.estado.filas[0]).not.toHaveProperty("incluyeModeloNuevo");
  });

  describe("sin una consulta por fila, y sin leer de mas", () => {
    const { prisma: espia, eventos } = HAY_BASE_DE_DATOS
      ? crearPrismaDeTestConEspia()
      : { prisma: undefined as unknown as PrismaClient, eventos: [] as EventoSqlDeTest[] };

    afterAll(async () => {
      if (HAY_BASE_DE_DATOS) await espia.$disconnect();
    });

    async function sentencias<T>(fn: () => Promise<T>): Promise<{ valor: T; n: number }> {
      eventos.length = 0;
      const valor = await fn();
      return { valor, n: eventos.filter((ev) => ev.query.includes('"cierre_detail"')).length };
    }

    it("tres cierres cuestan una sentencia, y un libro sin filas de cierre ninguna", async () => {
      const r = await enTransaccionRevertida(espia, async (tx) => {
        await serializarEscriturasReales(tx);
        const e = await crearEmpresa(tx);
        const cuenta = { tipo: "tienda" as const, id: e.fks.tiendaId };
        const leerOficina = () => servicio(clienteConSavepoint(tx)).leer({ ...PAGINA, cuenta }, MAESTRO);
        await tx.walletTiendaMovimiento.create({
          data: { tiendaId: e.fks.tiendaId, tipo: "debito", categoria: "cobro_manual", monto: new Prisma.Decimal("1.00"), origenTipo: "manual" },
        });
        await crearFila(tx, e.fks.tiendaId, randomUUID(), "gestion_orden");
        const sinCierres = await comoEmpresa(tx, e.org, () => sentencias(leerOficina));
        for (let i = 0; i < 3; i += 1) {
          await crearFila(tx, e.fks.tiendaId, await crearCierre(tx, e, ["nuevo"]));
        }
        const conCierres = await comoEmpresa(tx, e.org, () => sentencias(leerOficina));
        return { sinCierres, conCierres };
      });

      if (r.sinCierres.valor.status !== "ok" || r.conCierres.valor.status !== "ok") throw new Error("la lectura no devolvio ok");
      expect(r.sinCierres.valor.estado.filas).toHaveLength(2);
      expect(r.sinCierres.n).toBe(0);
      expect(r.conCierres.valor.estado.filas.filter((f) => f.incluyeModeloNuevo === true)).toHaveLength(3);
      expect(r.conCierres.n).toBe(1);
    });

    // Menor 8 de la revision F2.2: sin el filtro por cierre, la respuesta de las pantallas seria la misma,
    // porque preguntan por id, pero cada pagina leeria todos los cierres nuevos de la empresa.
    it("el lote lee solo los cierres pedidos: otro cierre nuevo de la empresa no llega, y un cierre es una fila", async () => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        await serializarEscriturasReales(tx);
        const e = await crearEmpresa(tx);
        const pedido = await crearCierre(tx, e, ["nuevo", "nuevo"]);
        const otro = await crearCierre(tx, e, ["nuevo"]);
        const filasLeidas: number[] = [];
        const lector = {
          cierreDetail: {
            findMany: async (args: Parameters<typeof tx.cierreDetail.findMany>[0]) => {
              const filas = (await tx.cierreDetail.findMany(args)) as { cierreId: string }[];
              filasLeidas.push(filas.length);
              return filas;
            },
          },
        };
        const respuesta = await comoEmpresa(tx, e.org, () => cierresConModeloNuevo(lector, [pedido]));
        const sinIds = await comoEmpresa(tx, e.org, () => cierresConModeloNuevo(lector, []));
        return { pedido, otro, respuesta, sinIds, filasLeidas };
      });

      expect([...r.respuesta]).toEqual([r.pedido]);
      expect(r.respuesta.has(r.otro)).toBe(false);
      expect([...r.sinIds]).toEqual([]);
      // Una lectura para los ids, de una fila aunque el cierre tenga dos nuevas; ninguna para la lista vacia.
      expect(r.filasLeidas).toEqual([1]);
    });
  });
});
