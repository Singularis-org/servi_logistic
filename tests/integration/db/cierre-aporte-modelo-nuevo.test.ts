import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type GestionResultado, type PrismaClient, type TarifaConcepto } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CierreAporteRepository } from "@/lib/repositories/CierreAporteRepository";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { CRITERIO_COD_RECAUDADO, CRITERIO_DE_APORTE, aporteDeOrden, type FuenteDeAporte } from "@/lib/utils/aporte-por-orden";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// SLT-54 T3.2 (design §11, R64) — EL DETALLE POR ORDEN DEL MODELO NUEVO, CONTRA POSTGRES REAL.
//
// Una orden sin el concepto de su gestion no aporta nada al movimiento, y antes se listaba con 0,00 y
// se contaba. Lo que se prueba es el `WHERE`: que un doble no ve. El cierre lo crea la solicitud real,
// que es quien decide que conceptos se congelan, y el detalle se lee como `servi_app`.
//
// Todo en una transaccion que siempre se revierte. Cada caso afirma lo sembrado antes de medir, y los
// importes esperados estan escritos a mano.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RECHAZO = "devolucion_a_origen_por_rechazo" as const;
const RANGO = { skip: 0, take: 25 };

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

let siguienteGuia = 930_000_000 + Math.floor(Math.random() * 15_000_000);

async function crearOrden(tx: TxDeTest, fks: FksDeOrden, distritoId: string, monto: string): Promise<string> {
  siguienteGuia += 1;
  const orden = await tx.orden.create({
    data: {
      numGuia: siguienteGuia,
      numRemision: `R-SLT54C-${randomUUID().slice(0, 12)}`,
      destinatario: "Aporte SLT-54",
      telefonoDest: "88880000",
      producto: "caja",
      estatusId: fks.estatusId,
      tiendaId: fks.tiendaId,
      zonaId: fks.zonaId,
      provinciaId: fks.provinciaId,
      cantonId: fks.cantonId,
      distritoId,
      montoCobrar: new Prisma.Decimal(monto),
      cobraComision: true,
    },
    select: { id: true },
  });
  return orden.id;
}

async function crearGestion(tx: TxDeTest, ordenId: string, mensajeroId: string, resultado: GestionResultado, monto: string) {
  if (resultado === "entregado") {
    await tx.gestionOrden.create({
      data: {
        ordenId,
        mensajeroId,
        resultado,
        montoRecibido: new Prisma.Decimal(monto),
        pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal(monto) }] },
      },
    });
    return;
  }
  await tx.gestionOrden.create({
    data: {
      ordenId,
      mensajeroId,
      resultado,
      motivo: "sin recibir",
      ...(resultado === "reprogramado" ? { fechaReprogramacion: new Date("2030-01-15T00:00:00.000Z") } : {}),
    },
  });
}

interface Escenario {
  A: string;
  Z: string;
  M: string;
  T: string;
  /** La orden de cada caso. */
  o: Record<"completa" | "entregaSinFlete" | "rechazo" | "rechazoSinConcepto" | "novedadEnCero" | "reprogramadoSinConcepto", string>;
}

/**
 * Empresa activada, con los valores por grupo para que dos ordenes de la misma zona congelen cosas
 * distintas:
 *
 *   G1 (d1): flete entregado 1500.00, comision 2 %, flete rechazo 300.00, flete novedad 0.00 ESCRITO.
 *            Sin flete por reprogramado.
 *   G2 (d2): solo comision 2 %. Sin ningun flete.
 */
async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const A = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, A);
  const fks = await crearFksDeOrden(tx);
  const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const distritos = await tx.distrito.findMany({
    where: { cantonId: fks.cantonId },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 2,
  });
  if (distritos.length < 2) throw new Error("Cartago/Cartago necesita al menos 2 distritos");
  const [d1, d2] = distritos.map((d) => d.id) as [string, string];
  const Z = fks.zonaId;
  await tx.zonaDistrito.createMany({ data: [{ zonaId: Z, distritoId: d1 }, { zonaId: Z, distritoId: d2 }] });
  const grupo = async (nombre: string, distritoId: string) => {
    const g = await tx.grupoDistritos.create({ data: { zonaId: Z, nombre }, select: { id: true } });
    await tx.grupoDistritosDistrito.create({ data: { grupoId: g.id, zonaId: Z, distritoId } });
    return g.id;
  };
  const G1 = await grupo("G1", d1);
  const G2 = await grupo("G2", d2);
  await sembrarActivacion(tx, A);

  const valor = (concepto: TarifaConcepto, modo: "monto" | "porcentaje", v: string, grupoId: string) =>
    tx.tarifaValor.create({ data: { concepto, modo, valor: v, ivaPct: "13.00", zonaId: Z, grupoId } });
  await valor("tienda_flete_entregado", "monto", "1500.00", G1);
  await valor("tienda_comision_cod", "porcentaje", "2.00", G1);
  await valor("tienda_flete_rechazo", "monto", "300.00", G1);
  await valor("tienda_flete_novedad", "monto", "0.00", G1);
  await valor("tienda_comision_cod", "porcentaje", "2.00", G2);

  const orden = async (distritoId: string, resultado: GestionResultado) => {
    const id = await crearOrden(tx, fks, distritoId, "10000.00");
    await crearGestion(tx, id, M, resultado, "10000.00");
    return id;
  };
  const o = {
    completa: await orden(d1, "entregado"),
    entregaSinFlete: await orden(d2, "entregado"),
    rechazo: await orden(d1, RECHAZO),
    rechazoSinConcepto: await orden(d2, RECHAZO),
    novedadEnCero: await orden(d1, "novedad"),
    reprogramadoSinConcepto: await orden(d1, "reprogramado"),
  };
  return { A, Z, M, T: fks.tiendaId, o };
}

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

function servicioCierre(cli: PrismaClient, e: Pick<Escenario, "Z">) {
  return new CierreDiaService(
    new CierreDiaRepository(cli, new TarifaVigenteRepository(cli)),
    { findCentralZonaId: async () => e.Z } as never,
    {
      findUsuarioZonaId: async () => e.Z,
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
    undefined,
    undefined,
    reglasPaisFijas(),
  );
}

async function solicitar(tx: TxDeTest, e: Pick<Escenario, "A" | "Z" | "M">): Promise<string> {
  const actor: Actor = { usuarioId: e.M, rol: "mensajero" };
  const r = await comoEmpresa(tx, e.A, () => servicioCierre(clienteConSavepoint(tx), e).solicitarCierre(actor));
  if (r.status !== "ok" || r.via !== "creado" || r.cierreId === undefined) {
    throw new Error(`la solicitud no creo el cierre: ${JSON.stringify(r)}`);
  }
  return r.cierreId;
}

/** Lo sembrado, medido en el cierre ya creado: sin esto, un caso pasaria con el cierre vacio. */
async function afirmarCongelado(tx: TxDeTest, e: Escenario, cierreId: string) {
  const filas = await tx.cierreDetail.findMany({
    where: { cierreId },
    select: { ordenId: true, tarifaModelo: true, conceptos: { select: { concepto: true } } },
  });
  const porOrden = new Map(filas.map((f) => [f.ordenId, f.conceptos.map((c) => c.concepto).sort()]));
  expect(filas.map((f) => f.tarifaModelo)).toEqual(Array(6).fill("nuevo"));
  const delG1 = ["tienda_comision_cod", "tienda_flete_entregado", "tienda_flete_novedad", "tienda_flete_rechazo"];
  expect(porOrden.get(e.o.completa)).toEqual(delG1);
  expect(porOrden.get(e.o.rechazo)).toEqual(delG1);
  expect(porOrden.get(e.o.novedadEnCero)).toEqual(delG1);
  expect(porOrden.get(e.o.reprogramadoSinConcepto)).toEqual(delG1);
  expect(porOrden.get(e.o.entregaSinFlete)).toEqual(["tienda_comision_cod"]);
  expect(porOrden.get(e.o.rechazoSinConcepto)).toEqual(["tienda_comision_cod"]);
}

const ids = (filas: Array<{ ordenId: string }>) => filas.map((f) => f.ordenId).sort();

describeSiHayBase("SLT-54 R64 — el detalle por orden del modelo nuevo, contra Postgres", () => {
  it("una orden sin el concepto queda fuera de la lista y del count, y con el concepto en 0 queda dentro", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrar(tx);
      const cierreId = await solicitar(tx, e);
      await afirmarCongelado(tx, e, cierreId);
      const listar = (criterio: (typeof CRITERIO_DE_APORTE)[keyof typeof CRITERIO_DE_APORTE]) =>
        comoEmpresa(tx, e.A, () =>
          new CierreAporteRepository(clienteConSavepoint(tx)).listarOrdenesQueAportan({ cierreId, criterio, rango: RANGO }),
        );
      return {
        e,
        flete: await listar(CRITERIO_DE_APORTE.ingreso_flete),
        ivaFlete: await listar(CRITERIO_DE_APORTE.ingreso_iva_flete),
        devolucion: await listar(CRITERIO_DE_APORTE.ingreso_flete_devolucion),
        ivaDevolucion: await listar(CRITERIO_DE_APORTE.ingreso_iva_flete_devolucion),
        comision: await listar(CRITERIO_DE_APORTE.ingreso_comision_cod),
        recaudo: await listar(CRITERIO_COD_RECAUDADO),
      };
    });
    const { e } = r;

    // Solo la entrega con flete: la de G2 no tiene el concepto, aunque tenga comision.
    expect(ids(r.flete.items)).toEqual([e.o.completa]);
    expect(r.flete.total).toBe(1);
    expect(ids(r.ivaFlete.items)).toEqual([e.o.completa]);
    expect(r.ivaFlete.total).toBe(1);

    // El rechazo con su concepto y la novedad con un 0 ESCRITO, que aporta 0,00 y es una decision de la
    // empresa (SLT-52 R23). Fuera: el rechazo sin concepto, y el reprogramado, cuya fila SI tiene otros
    // fletes congelados pero no el suyo.
    expect(ids(r.devolucion.items)).toEqual([e.o.rechazo, e.o.novedadEnCero].sort());
    expect(r.devolucion.total).toBe(2);
    expect(ids(r.ivaDevolucion.items)).toEqual([e.o.rechazo, e.o.novedadEnCero].sort());
    expect(r.ivaDevolucion.total).toBe(2);

    // La comision no depende de ningun flete: entran las dos entregas, y solo ellas.
    expect(ids(r.comision.items)).toEqual([e.o.completa, e.o.entregaSinFlete].sort());
    expect(r.comision.total).toBe(2);

    // El recaudo no mira la tarifa: las dos entregas recaudaron.
    expect(ids(r.recaudo.items)).toEqual([e.o.completa, e.o.entregaSinFlete].sort());
    expect(r.recaudo.total).toBe(2);
  });

  it("lo listado suma, centimo a centimo, lo que el feed real escribe en la wallet", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrar(tx);
      const cierreId = await solicitar(tx, e);
      await afirmarCongelado(tx, e, cierreId);
      return comoEmpresa(tx, e.A, async () => {
        const repo = new CierreAporteRepository(clienteConSavepoint(tx));
        const movimientos = await new WalletFeedService().construirMovimientosDeIngreso(cierreId, tx);
        const suma = async (concepto: keyof typeof CRITERIO_DE_APORTE) => {
          const fuente: FuenteDeAporte = { tipo: "concepto_empresa", concepto };
          const pagina = await repo.listarOrdenesQueAportan({ cierreId, criterio: CRITERIO_DE_APORTE[concepto], rango: RANGO });
          return pagina.items
            .reduce((acc, f) => acc.plus(aporteDeOrden(fuente, f.orden, f.gestiones) ?? 0), new Prisma.Decimal(0))
            .toFixed(2);
        };
        return {
          movimientos: Object.fromEntries(movimientos.map((m) => [m.categoria, m.monto])),
          flete: await suma("ingreso_flete"),
          devolucion: await suma("ingreso_flete_devolucion"),
          comision: await suma("ingreso_comision_cod"),
        };
      });
    });
    // Flete 1500.00. Rechazo 300.00 + novedad 0.00. Comision 2 % de 10000.00, dos entregas: 400.00.
    expect(r.flete).toBe("1500.00");
    expect(r.devolucion).toBe("300.00");
    expect(r.comision).toBe("400.00");
    // El importe no se escribe a mano: lo da el feed de la aprobacion.
    expect(r.movimientos.ingreso_flete).toBe(r.flete);
    expect(r.movimientos.ingreso_flete_devolucion).toBe(r.devolucion);
    expect(r.movimientos.ingreso_comision_cod).toBe(r.comision);
  });

  it("los otros caminos del mismo `WHERE` (conteo, lote y «donde aporta») dicen lo mismo que la lista", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrar(tx);
      const cierreId = await solicitar(tx, e);
      await afirmarCongelado(tx, e, cierreId);
      return comoEmpresa(tx, e.A, async () => {
        const repo = new CierreAporteRepository(clienteConSavepoint(tx));
        const criterio = CRITERIO_DE_APORTE.ingreso_flete_devolucion;
        const lote = { cierreIds: [cierreId], criterio };
        return {
          e,
          cierreId,
          conteo: await repo.contarAportesPorCierre(lote),
          filas: await repo.listarAportesDeCierres(lote),
          donde: await repo.cierresDondeAporta({
            criterio,
            pares: Object.values(e.o).map((ordenId) => ({ cierreId, ordenId })),
          }),
        };
      });
    });
    const esperadas = [r.e.o.rechazo, r.e.o.novedadEnCero].sort();
    expect(r.conteo.get(r.cierreId)).toBe(2);
    expect(ids(r.filas)).toEqual(esperadas);
    expect(ids(r.donde)).toEqual(esperadas);
  });

  it("el acotamiento por tienda sigue valiendo: otra tienda no ve ninguna", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrar(tx);
      const cierreId = await solicitar(tx, e);
      await afirmarCongelado(tx, e, cierreId);
      const otra = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
      return comoEmpresa(tx, e.A, async () => {
        const repo = new CierreAporteRepository(clienteConSavepoint(tx));
        const criterio = CRITERIO_DE_APORTE.ingreso_flete_devolucion;
        return {
          propia: await repo.listarOrdenesQueAportan({ cierreId, criterio, tiendaId: e.T, rango: RANGO }),
          ajena: await repo.listarOrdenesQueAportan({ cierreId, criterio, tiendaId: otra, rango: RANGO }),
        };
      });
    });
    expect(r.propia.total).toBe(2);
    expect(r.ajena).toEqual({ items: [], total: 0 });
  });

  it("R12: como `servi_app`, la empresa B no ve ni cuenta nada del cierre de A", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrar(tx);
      const cierreId = await solicitar(tx, e);
      await afirmarCongelado(tx, e, cierreId);
      const B = (await crearOrganizacion(tx)).id;
      const leer = (org: string) =>
        comoEmpresa(tx, org, async () => {
          const repo = new CierreAporteRepository(clienteConSavepoint(tx));
          return {
            pagina: await repo.listarOrdenesQueAportan({
              cierreId,
              criterio: CRITERIO_DE_APORTE.ingreso_flete_devolucion,
              rango: RANGO,
            }),
            // Solo lee `cierre_detail`: la lista se apoya ademas en la RLS de `orden` y `gestion_orden`,
            // y sin esto la de `cierre_detail` no se mediria (medido: apagarla sola la deja en verde).
            filasDelCierre: await repo.contarOrdenesDelCierre({ cierreId }),
          };
        });
      return { desdeA: await leer(e.A), desdeB: await leer(B) };
    });
    // Control positivo: si A tampoco viera nada, el «B no ve» no diria nada.
    expect(r.desdeA.pagina.total).toBe(2);
    expect(r.desdeA.filasDelCierre).toBe(6);
    expect(r.desdeB.pagina).toEqual({ items: [], total: 0 });
    expect(r.desdeB.filasDelCierre).toBe(0);
  });

  it("en el modelo viejo no cambia nada: entra el rechazo con tarifa y no la novedad, con el importe de siempre", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const A = (await crearOrganizacion(tx)).id;
      await fijarEmpresa(tx, A);
      const fks = await crearFksDeOrden(tx);
      const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
      const d = await tx.distrito.findFirstOrThrow({ where: { cantonId: fks.cantonId }, select: { id: true } });
      await tx.zonaDistrito.create({ data: { zonaId: fks.zonaId, distritoId: d.id } });
      await tx.tarifa.create({
        data: {
          tiendaId: null,
          zonaId: fks.zonaId,
          valorFlete: "1000.00",
          valorFleteGam: "1500.00",
          valorFleteDevuelto: "400.00",
          valorFleteDevueltoGam: "600.00",
          fulfillment: "0.00",
          comisionCod: "5.00",
          ivaFlete: "13.00",
          ivaComisionCod: "13.00",
        },
      });
      const orden = async (resultado: GestionResultado) => {
        const id = await crearOrden(tx, fks, d.id, "10000.00");
        await crearGestion(tx, id, M, resultado, "10000.00");
        return id;
      };
      const rechazo = await orden(RECHAZO);
      const novedad = await orden("novedad");
      const cierreId = await solicitar(tx, { A, Z: fks.zonaId, M });
      const modelos = await tx.cierreDetail.findMany({ where: { cierreId }, select: { tarifaModelo: true } });
      const pagina = await comoEmpresa(tx, A, () =>
        new CierreAporteRepository(clienteConSavepoint(tx)).listarOrdenesQueAportan({
          cierreId,
          criterio: CRITERIO_DE_APORTE.ingreso_flete_devolucion,
          rango: RANGO,
        }),
      );
      return { rechazo, novedad, modelos, pagina };
    });
    expect(r.modelos).toEqual([{ tarifaModelo: "viejo" }, { tarifaModelo: "viejo" }]);
    expect(ids(r.pagina.items)).toEqual([r.rechazo]);
    expect(r.pagina.total).toBe(1);
    const fuente: FuenteDeAporte = { tipo: "concepto_empresa", concepto: "ingreso_flete_devolucion" };
    const fila = r.pagina.items[0];
    expect(aporteDeOrden(fuente, fila.orden, fila.gestiones)?.toFixed(2)).toBe("400.00");
  });
});
