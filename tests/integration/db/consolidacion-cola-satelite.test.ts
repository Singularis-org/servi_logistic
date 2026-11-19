import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-106 «Bodega satélite: A consolidar con la cola única» — el SQL de lo que añade, contra Postgres.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Lo que se mide vive en el `WHERE` y en el `_count` de la sentencia: un doble de Prisma no lo ve
// (R67, R194 de la fila; R199/R47 de los nombres sin resolver). Los datos los siembra el test en una
// transacción revertida, y cada caso exige primero que haya filas: un test sin datos no sale verde.
//
// Dataset:
//   zona A (la del actor):
//     · M1 — `aprobado` SIN consolidar: 60000.00 / 2000.00 / 300.00, dos gestiones (una con DOS
//       ajustes de pago, otra sin ninguno), `resuelto_at` fijo;
//     · M1 — `aprobado` YA consolidado (con `cierre_bodega_id`);
//     · M2, M3 — `solicitado`;
//     · M4 — `rechazado`;
//   zona B (vecina):
//     · M5 — `solicitado`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SATELITE: Actor = { usuarioId: "adm-sat-106", rol: "adminSatelite" };
const APROBADO_AT = new Date("2026-11-10T15:30:00.000Z");

const NOMBRES = {
  m1: ["Ana", "Aprobada"],
  m2: ["Bruno", "Solicitado"],
  m3: ["Carla", "Solicitada"],
  m4: ["Diego", "Rechazado"],
  m5: ["Elena", "Vecina"],
} as const;

interface Dataset {
  zonaA: string;
  zonaB: string;
  cierreM1: string;
  cierreConsolidado: string;
}

let siguienteGuia = 930_000_000 + Math.floor(Math.random() * 20_000_000);

async function sembrar(tx: TxDeTest): Promise<Dataset> {
  const fks = await crearFksDeOrden(tx);
  const admin = await crearUsuarioDePrueba(tx, "admin");

  const zona = async (marca: string) =>
    (
      await tx.zona.create({
        data: {
          nombre: `Zona 106 ${marca} ${randomUUID().slice(0, 8)}`,
          sinpeNumero: "80000000",
          sinpeNombre: "Titular de Prueba",
          esCentral: false,
        },
        select: { id: true },
      })
    ).id;
  const zonaA = await zona("A");
  const zonaB = await zona("B");

  const mensajero = async (clave: keyof typeof NOMBRES) => {
    const u = await crearUsuarioDePrueba(tx, "mensajero");
    const [nombre, primerApellido] = NOMBRES[clave];
    await tx.usuario.update({
      where: { id: u.id },
      data: { nombre, primerApellido, segundoApellido: null },
    });
    return u.id;
  };
  const m1 = await mensajero("m1");
  const m2 = await mensajero("m2");
  const m3 = await mensajero("m3");
  const m4 = await mensajero("m4");
  const m5 = await mensajero("m5");

  const cierre = async (
    mensajeroId: string,
    estado: "solicitado" | "aprobado" | "rechazado",
    destinoZonaId: string,
    dinero = { general: "1000.00", pago: "100.00", bodega: "0.00" },
    cierreBodegaId: string | null = null,
  ) =>
    (
      await tx.cierreDia.create({
        data: {
          mensajeroId,
          estado,
          destinoTipo: "bodega_satelite",
          destinoZonaId,
          totalEfectivo: new Prisma.Decimal(dinero.general),
          totalSimpe: new Prisma.Decimal("0.00"),
          totalTransferencia: new Prisma.Decimal("0.00"),
          totalGeneral: new Prisma.Decimal(dinero.general),
          totalPagoMensajero: new Prisma.Decimal(dinero.pago),
          totalIngresoBodegaRechazos: new Prisma.Decimal(dinero.bodega),
          cierreBodegaId,
          ...(estado === "solicitado"
            ? {}
            : {
                resueltoPor: admin.id,
                resueltoAt: APROBADO_AT,
                motivoRechazo: estado === "rechazado" ? "faltan comprobantes" : null,
              }),
        },
        select: { id: true },
      })
    ).id;

  // M1 aprobado sin consolidar, con dos gestiones: una ajustada DOS veces y otra sin ajustes.
  const cierreM1 = await cierre(m1, "aprobado", zonaA, {
    general: "60000.00",
    pago: "2000.00",
    bodega: "300.00",
  });
  const gestion = async (clave: string, cierreId: string) => {
    siguienteGuia += 1;
    const orden = await tx.orden.create({
      data: {
        numGuia: siguienteGuia,
        numRemision: `R-106-${randomUUID().slice(0, 8)}-${clave}`,
        destinatario: "Corpus 106",
        telefonoDest: "88880000",
        producto: "caja",
        estatusId: fks.estatusId,
        tiendaId: fks.tiendaId,
        zonaId: fks.zonaId,
        provinciaId: fks.provinciaId,
        cantonId: fks.cantonId,
      },
      select: { id: true },
    });
    return (
      await tx.gestionOrden.create({
        data: {
          ordenId: orden.id,
          mensajeroId: m1,
          resultado: "entregado",
          montoRecibido: new Prisma.Decimal("30000.00"),
          cierreId,
          pagoMensajero: new Prisma.Decimal("1000.00"),
          ingresoBodegaRechazo: new Prisma.Decimal("0.00"),
        },
        select: { id: true },
      })
    ).id;
  };
  const gAjustada = await gestion("a", cierreM1);
  await gestion("b", cierreM1);
  for (const [anterior, nuevo] of [
    ["1000.00", "1200.00"],
    ["1200.00", "1000.00"],
  ] as const) {
    await tx.gestionPagoMensajeroAjuste.create({
      data: {
        gestionId: gAjustada,
        cierreId: cierreM1,
        pagoAnterior: new Prisma.Decimal(anterior),
        pagoNuevo: new Prisma.Decimal(nuevo),
        actorUsuarioId: admin.id,
        actorRol: "admin",
        motivo: "ajuste de prueba",
      },
    });
  }

  // M1 aprobado YA consolidado: no es de «A consolidar».
  const solicitante = await crearUsuarioDePrueba(tx, "adminSatelite");
  const cb = await tx.cierreBodega.create({
    data: { zonaId: zonaA, solicitadoPor: solicitante.id },
    select: { id: true },
  });
  const cierreConsolidado = await cierre(m1, "aprobado", zonaA, undefined, cb.id);

  await cierre(m2, "solicitado", zonaA);
  await cierre(m3, "solicitado", zonaA);
  await cierre(m4, "rechazado", zonaA);
  await cierre(m5, "solicitado", zonaB);

  return { zonaA, zonaB, cierreM1, cierreConsolidado };
}

describeSiHayBase("SLT-106 — «A consolidar» de la satélite contra Postgres", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const conDataset = <T>(fn: (tx: TxDeTest, d: Dataset) => Promise<T>): Promise<T> =>
    enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      return fn(tx, await sembrar(tx));
    });

  it("R67/R194: página y conjunto completo de A traen solo el aprobado sin consolidar de M1, con sus campos", async () => {
    const r = await conDataset(async (tx, d) => {
      const repo = new CierreBodegaRepository(tx as unknown as PrismaClient);
      return {
        d,
        completo: await repo.findCierresDiaConsolidables(d.zonaA),
        pagina: await repo.findCierresDiaConsolidablesPaginado(d.zonaA, { skip: 0, take: 25 }),
      };
    });

    // Precondición: sin filas no se mira nada.
    expect(r.completo.length).toBeGreaterThan(0);
    expect(r.pagina.items.length).toBeGreaterThan(0);

    for (const filas of [r.completo, r.pagina.items]) {
      expect(filas.map((f) => f.cierreDiaId)).toEqual([r.d.cierreM1]);
      const [m1] = filas;
      expect(m1.mensajeroNombre).toBe("Ana Aprobada");
      expect(m1.gestionesAjustadas).toBe(1); // dos ajustes de la MISMA gestión cuentan una
      expect(m1.aprobadoAt).toBe("2026-11-10T15:30:00.000Z");
      expect(m1.paraLaCentral).toBe("57700.00"); // 60000.00 − 2000.00 − 300.00, a mano
    }
    expect(r.pagina.total).toBe(1);
    expect(r.completo.map((f) => f.cierreDiaId)).not.toContain(r.d.cierreConsolidado);
  });

  it("R199: los nombres sin resolver de A son M2 y M3 (sin M4 ni M5), tantos como cuenta la puerta", async () => {
    const r = await conDataset(async (tx, d) => {
      const repo = new CierreBodegaRepository(tx as unknown as PrismaClient);
      return {
        nombres: await repo.findMensajerosConCierreSinResolver(d.zonaA),
        conteo: await repo.contarCierresDiaSolicitados(d.zonaA),
        nombresB: await repo.findMensajerosConCierreSinResolver(d.zonaB),
      };
    });

    expect(r.nombres.length).toBeGreaterThan(0);
    expect([...r.nombres].sort()).toEqual(["Bruno Solicitado", "Carla Solicitada"]);
    expect(r.nombres).not.toContain("Ana Aprobada");
    expect(r.nombres).not.toContain("Diego Rechazado");
    expect(r.nombres).not.toContain("Elena Vecina");
    expect(r.nombres.length).toBe(r.conteo);
    expect(r.conteo).toBe(2);
    // Y la zona vecina tiene lo suyo, que no se cuela en A.
    expect(r.nombresB).toEqual(["Elena Vecina"]);
  });

  it("R47/R195: `listarConsolidacion` real nombra a M2 y M3 y bloquea por `sin_resolver`", async () => {
    const r = await conDataset(async (tx, d) => {
      const svc = new CierreBodegaService(
        new CierreBodegaRepository(tx as unknown as PrismaClient),
        { findUsuarioZonaId: async () => d.zonaA } as never,
        reglasPaisFijas(),
      );
      return svc.listarConsolidacion(SATELITE);
    });

    if (r.status !== "ok") throw new Error(`esperaba ok, llegó ${r.status}`);
    expect(r.consolidables.length).toBeGreaterThan(0);
    expect(r.motivoBloqueo).toBe(
      "Todavía no puedes consolidar: Bruno Solicitado y Carla Solicitada tienen cierres sin resolver. Apruébalos o recházalos primero.",
    );
    expect(r.bloqueo).toBe("sin_resolver");
    expect(r.puedesSolicitar).toBe(false);
    expect(r.cierresAConsolidar).toBe(1);
    expect(r.mensajerosAConsolidar).toBe(1);
    expect(r.paraLaCentralAgregado).toBe("57700.00");
  });
});
