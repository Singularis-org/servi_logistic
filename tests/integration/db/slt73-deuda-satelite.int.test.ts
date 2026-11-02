import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { SaldosSatelitesRepository } from "@/lib/repositories/SaldosSatelitesRepository";
import type { ResumenSatelitesDTO, SaldoSateliteDTO } from "@/lib/types/conciliacion-satelites";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SLT-73 · T6 (R4-R8) — LA DEUDA DE LA SATELITE, CONTRA POSTGRES.
//
// La deuda vive en dos `groupBy` sobre `cierre_dia` y en el recibido de `cierre_bodega`. Un doble
// de Prisma no ve el `WHERE`, asi que se mide aqui, con filas reales (memoria «probar el WHERE
// donde vive»).
//
// UNA SOLA SIEMBRA, una zona por caso. Cada zona tiene cifras distintas, de forma que si una
// agregacion mezclara zonas, el numero de alguna cambiaria:
//
//   SIN     un cierre aprobado sin consolidar: 1000.00 − 100.00 − 50.25 = 849.75. Mas tres que NO
//           cuentan: uno `solicitado`, uno `rechazado` y uno con destino `bodega_central`.
//   CONSOL  dos cierres consolidados en una consolidacion SIN conciliar: 250.00 + 170.10 = 420.10.
//   PARCIAL un cierre consolidado y conciliado por menos (900.00 esperado, 885.00 recibido → 15.00)
//           y otro sin consolidar de 100.00 → 115.00. El efectivo del consolidado es 1000.00: con
//           la formula de la 431 faltarian 115.00 solo por la consolidacion.
//   RECH    un cierre aprobado de 400.00 cuya consolidacion esta RECHAZADA: cuenta igual (R5).
//   SINPE   el caso de produccion en forma: todo SINPE, sin consolidar, 76890.00 − 6000.00 =
//           70890.00. Con la formula de la 431 salia «al dia» (0.00).
//   NEG     un cierre sin recaudo con pago al mensajero: −3400.15, con su signo (R4).
//   CERO    un cierre de 500.00 consolidado y recibido completo: deuda 0.00.
//   Y FUERA de la tabla: un cierre `bodega_satelite` hacia una zona CENTRAL (777.00), que no
//   es una bodega satelite y no debe sumar en la cabecera; y una empresa B con su satelite.
//
// Cada test crea sus datos y falla si no los encuentra. Los esperados van escritos a mano.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Destino = "bodega_satelite" | "bodega_central";
type Estado = "solicitado" | "aprobado" | "rechazado";

interface CierreSemilla {
  zonaId: string;
  general: string;
  efectivo?: string;
  pago?: string;
  gana?: string;
  estado?: Estado;
  destino?: Destino;
  cierreBodegaId?: string | null;
}

interface Zonas {
  sin: string;
  consol: string;
  parcial: string;
  rech: string;
  sinpe: string;
  neg: string;
  cero: string;
  central: string;
  /** La consolidacion sin conciliar de CONSOL, para leer su DTO. */
  consolidacionConsol: string;
}

describeSiHayBase("SLT-73 T6 — la deuda de la satelite (R4-R8), con filas reales", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function zona(tx: TxDeTest, marca: string, esCentral = false): Promise<string> {
    const z = await tx.zona.create({
      data: {
        nombre: `Zona slt73-deuda ${marca} ${Date.now().toString(36)}`,
        sinpeNumero: "80000000",
        sinpeNombre: "Titular de Prueba",
        cobroVehiculo: false,
        esCentral,
      },
      select: { id: true },
    });
    return z.id;
  }

  async function cierre(tx: TxDeTest, mensajeroId: string, s: CierreSemilla): Promise<string> {
    const efectivo = s.efectivo ?? s.general;
    const c = await tx.cierreDia.create({
      data: {
        mensajeroId,
        estado: s.estado ?? "aprobado",
        destinoTipo: s.destino ?? "bodega_satelite",
        destinoZonaId: s.zonaId,
        totalEfectivo: new Prisma.Decimal(efectivo),
        totalSimpe: new Prisma.Decimal(s.general).minus(efectivo),
        totalGeneral: new Prisma.Decimal(s.general),
        totalPagoMensajero: new Prisma.Decimal(s.pago ?? "0.00"),
        totalIngresoBodegaRechazos: new Prisma.Decimal(s.gana ?? "0.00"),
        cierreBodegaId: s.cierreBodegaId ?? null,
      },
      select: { id: true },
    });
    return c.id;
  }

  async function consolidacion(
    tx: TxDeTest,
    usuarioId: string,
    s: {
      zonaId: string;
      estado: Estado;
      efectivo: string;
      general: string;
      pago: string;
      gana: string;
      recibido?: string;
    },
  ): Promise<string> {
    const marcada = s.recibido !== undefined;
    const c = await tx.cierreBodega.create({
      data: {
        zonaId: s.zonaId,
        solicitadoPor: usuarioId,
        estado: s.estado,
        totalEfectivo: new Prisma.Decimal(s.efectivo),
        totalSimpe: new Prisma.Decimal(s.general).minus(s.efectivo),
        totalGeneral: new Prisma.Decimal(s.general),
        totalPagoMensajero: new Prisma.Decimal(s.pago),
        totalIngresoBodegaRechazos: new Prisma.Decimal(s.gana),
        ...(marcada
          ? {
              conciliadoAt: new Date(),
              conciliadoPor: usuarioId,
              montoRecibido: new Prisma.Decimal(s.recibido as string),
              resueltoAt: new Date(),
              resueltoPor: usuarioId,
            }
          : {}),
      },
      select: { id: true },
    });
    return c.id;
  }

  /** La siembra de la cabecera del archivo, en la empresa activa de la transaccion. */
  async function sembrar(tx: TxDeTest): Promise<Zonas> {
    const admin = await crearUsuarioDePrueba(tx, "adminSatelite");
    const mens = await crearUsuarioDePrueba(tx, "mensajero");
    const z: Zonas = {
      sin: await zona(tx, "sin"),
      consol: await zona(tx, "consol"),
      parcial: await zona(tx, "parcial"),
      rech: await zona(tx, "rech"),
      sinpe: await zona(tx, "sinpe"),
      neg: await zona(tx, "neg"),
      cero: await zona(tx, "cero"),
      central: await zona(tx, "central", true),
      consolidacionConsol: "",
    };

    // SIN
    await cierre(tx, mens.id, { zonaId: z.sin, general: "1000.00", efectivo: "600.00", pago: "100.00", gana: "50.25" });
    await cierre(tx, mens.id, { zonaId: z.sin, general: "5000.00", estado: "solicitado" });
    await cierre(tx, mens.id, { zonaId: z.sin, general: "6000.00", estado: "rechazado" });
    await cierre(tx, mens.id, { zonaId: z.sin, general: "7000.00", destino: "bodega_central" });

    // CONSOL
    const cbConsol = await consolidacion(tx, admin.id, {
      zonaId: z.consol,
      estado: "solicitado",
      efectivo: "500.10",
      general: "500.10",
      pago: "70.00",
      gana: "10.00",
    });
    z.consolidacionConsol = cbConsol;
    await cierre(tx, mens.id, { zonaId: z.consol, general: "300.00", pago: "50.00", cierreBodegaId: cbConsol });
    await cierre(tx, mens.id, {
      zonaId: z.consol,
      general: "200.10",
      pago: "20.00",
      gana: "10.00",
      cierreBodegaId: cbConsol,
    });

    // PARCIAL
    const cbParcial = await consolidacion(tx, admin.id, {
      zonaId: z.parcial,
      estado: "aprobado",
      efectivo: "1000.00",
      general: "1000.00",
      pago: "100.00",
      gana: "0.00",
      recibido: "885.00",
    });
    await cierre(tx, mens.id, { zonaId: z.parcial, general: "1000.00", pago: "100.00", cierreBodegaId: cbParcial });
    await cierre(tx, mens.id, { zonaId: z.parcial, general: "100.00" });

    // RECH
    const cbRech = await consolidacion(tx, admin.id, {
      zonaId: z.rech,
      estado: "rechazado",
      efectivo: "400.00",
      general: "400.00",
      pago: "0.00",
      gana: "0.00",
    });
    await cierre(tx, mens.id, { zonaId: z.rech, general: "400.00", cierreBodegaId: cbRech });

    // SINPE (todo SINPE, sin consolidar)
    await cierre(tx, mens.id, { zonaId: z.sinpe, general: "76890.00", efectivo: "0.00", pago: "6000.00" });

    // NEG
    await cierre(tx, mens.id, { zonaId: z.neg, general: "0.00", pago: "3400.15" });

    // CERO
    const cbCero = await consolidacion(tx, admin.id, {
      zonaId: z.cero,
      estado: "aprobado",
      efectivo: "500.00",
      general: "500.00",
      pago: "0.00",
      gana: "0.00",
      recibido: "500.00",
    });
    await cierre(tx, mens.id, { zonaId: z.cero, general: "500.00", cierreBodegaId: cbCero });

    // FUERA: destino satelite hacia una zona central.
    await cierre(tx, mens.id, { zonaId: z.central, general: "777.00" });

    return z;
  }

  /** Empresa B con una satelite que debe 999.00. Deja la empresa activa como estaba (A). */
  async function sembrarOtraEmpresa(tx: TxDeTest, empresaA: string): Promise<string> {
    const empresaB = (await crearOrganizacion(tx)).id;
    await fijarEmpresa(tx, empresaB);
    const mens = await crearUsuarioDePrueba(tx, "mensajero");
    const zB = await zona(tx, "empresa-b");
    await cierre(tx, mens.id, { zonaId: zB, general: "999.00" });
    await fijarEmpresa(tx, empresaA);
    return zB;
  }

  async function empresaActiva(tx: TxDeTest): Promise<string> {
    const [{ id }] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT current_setting('app.organizacion_id', true) AS id`,
    );
    return id;
  }

  function fila(todas: SaldoSateliteDTO[], zonaId: string): SaldoSateliteDTO {
    const f = todas.find((s) => s.zonaId === zonaId);
    if (f === undefined) throw new Error(`la zona sembrada ${zonaId} no aparece en el listado`);
    return f;
  }

  it("⭑ R5/R6: la deuda por zona cuenta todos los metodos, consolidados o no, menos lo recibido", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const z = await sembrar(tx);
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      return { z, todas: await repo.findSaldosCompleto() };
    });
    const { z, todas } = r;
    const cifras = (id: string) => {
      const f = fila(todas, id);
      return [f.saldoSinConciliar, f.aporteSinConsolidar, f.cierresSinConsolidar];
    };

    // SIN: solo el aprobado satelite; ni el solicitado, ni el rechazado, ni el de la central.
    expect(cifras(z.sin)).toEqual(["849.75", "849.75", 1]);
    // CONSOL: consolidado sin conciliar → debe todo, y nada queda «sin consolidar».
    expect(cifras(z.consol)).toEqual(["420.10", "0.00", 0]);
    // PARCIAL: 900.00 − 885.00 + 100.00 sin consolidar.
    expect(cifras(z.parcial)).toEqual(["115.00", "100.00", 1]);
    // RECH: el cierre aprobado cuenta aunque su consolidacion este rechazada.
    expect(cifras(z.rech)).toEqual(["400.00", "0.00", 0]);
    // SINPE: el caso de produccion. NO esta al dia (R6).
    expect(cifras(z.sinpe)).toEqual(["70890.00", "70890.00", 1]);
    // NEG: con su signo, sin recortar a cero (R4).
    expect(cifras(z.neg)).toEqual(["-3400.15", "-3400.15", 1]);
    // CERO: recibido completo.
    expect(cifras(z.cero)).toEqual(["0.00", "0.00", 0]);
    // La zona central no es una bodega satelite: no sale en la tabla.
    expect(todas.some((s) => s.zonaId === z.central)).toBe(false);
  });

  it("⭑ R8/R9: el desglose trae la cascada y `faltaPorRecibir` = paraLaCentral − recibido", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const z = await sembrar(tx);
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      return {
        z,
        consol: await repo.findConsolidacionesCompleto(z.consol),
        parcial: await repo.findConsolidacionesCompleto(z.parcial),
        todas: await repo.findSaldosCompleto(),
      };
    });

    expect(r.consol).toHaveLength(1);
    expect(r.consol[0]).toMatchObject({
      cierreBodegaId: r.z.consolidacionConsol,
      pagoMensajero: "70.00",
      gananciaSatelite: "10.00",
      paraLaCentral: "420.10",
      montoRecibido: null,
      faltaPorRecibir: "420.10",
    });

    expect(r.parcial).toHaveLength(1);
    expect(r.parcial[0]).toMatchObject({
      pagoMensajero: "100.00",
      gananciaSatelite: "0.00",
      paraLaCentral: "900.00",
      montoRecibido: "885.00",
      faltaPorRecibir: "15.00", // con el efectivo (1000.00) serian 115.00
    });

    // La ultima recibida usa la misma cifra.
    expect(fila(r.todas, r.z.parcial).ultimaRecibida).toMatchObject({
      monto: "885.00",
      declarado: "900.00",
      faltaPorRecibir: "15.00",
    });
  });

  it("⭑ R7: Σ filas = cabecera, `bodegasConPendiente` y otra empresa que no se mezcla", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const empresaA = await empresaActiva(tx);
      const z = await sembrar(tx);
      const zB = await sembrarOtraEmpresa(tx, empresaA);
      // Como la app de la empresa A: RLS activa, igual que con la extension en produccion. La
      // empresa A nacio vacia en esta transaccion, asi que la cabecera es SOLO lo sembrado.
      await comoApp(tx, empresaA);
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const resumen: ResumenSatelitesDTO = await repo.findResumen();
      const todas = await repo.findSaldosCompleto();
      return { z, zB, resumen, todas };
    });

    // Control: las siete satelites de A estan, la de B no.
    expect(r.todas).toHaveLength(7);
    expect(r.todas.some((s) => s.zonaId === r.zB)).toBe(false);

    // 849.75 + 420.10 + 115.00 + 400.00 + 70890.00 − 3400.15 + 0.00 = 69274.70. Sin la de la zona
    // central (777.00) ni la de la empresa B (999.00).
    expect(r.resumen.pendienteTotal).toBe("69274.70");
    const sumaFilas = r.todas
      .reduce((acc, f) => acc.plus(f.saldoSinConciliar), new Prisma.Decimal(0))
      .toFixed(2);
    expect(sumaFilas).toBe("69274.70");

    // Seis zonas con deuda distinta de cero (CERO no cuenta).
    expect(r.resumen.bodegasConPendiente).toBe(6);
    // Una consolidacion sin conciliar (CONSOL; la rechazada no cuenta).
    expect(r.resumen.consolidacionesSinConciliar).toBe(1);
    // «Con diferencia»: solo PARCIAL, por 15.00 (paraLaCentral − recibido, no el efectivo).
    expect(r.resumen.consolidacionesConDiferencia).toBe(1);
    expect(r.resumen.diferenciaTotal).toBe("15.00");
  });
});
