import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { VentanaDeLibro } from "@/lib/interfaces/repositories/IEstadoCuentaRepository";
import { EstadoCuentaRepository } from "@/lib/repositories/EstadoCuentaRepository";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SLT-76 · T5 · R7 — EL ESTADO DE CUENTA DE LA BODEGA, AISLADO POR EMPRESA (checkpoint de
// `docs/checkpoints-proyecto.md` para SQL a mano).
//
// `totalesDeBodega`, `periodoDeBodega` y `paginaDeBodega` leen `movimientosDeBodegaSql` con `$queryRaw`
// SIN `organizacion_id`: los cubre la RLS (`EXCEPCIONES_SQL_A_MANO`, `porRls`). Aqui se mide con dos
// empresas reales, como `servi_app` (`comoApp`), que es el rol sin `BYPASSRLS` que pone la app. La
// conexion del test es la del dueno de las tablas: con ella la RLS no actua, y por eso el CONTROL lee
// como dueno y SI ve la fuga. No cambia codigo de la app.
//
// Siembra (instantes UTC), en cada empresa, una bodega satelite con:
//   - una consolidacion CONCILIADA (pedida D1, marcada D2) con UN cierre del dia aprobado → declarado
//     y recibido;
//   - un cierre del dia aprobado SIN consolidar (D3) → fila «sin consolidar».
//
//   Empresa A: cierre consolidado 1.000, recibido 900, sin consolidar 250.
//     declarado = 1.000 + 250 = 1.250,00; recibido = 900,00; corrido 1.000 → 100 → 350.
//   Empresa B: cierre consolidado 4.000, recibido 3.500, sin consolidar 700 (otros importes, para que
//     una fuga de B en A, o al reves, cambie las cifras).
//
// Mutacion del reviewer (NO entra en la suite): antes de `comoApp(tx, empresaB)` en el caso R7,
//   await tx.$executeRawUnsafe(`ALTER TABLE cierre_bodega DISABLE ROW LEVEL SECURITY`);
// → B ve la consolidacion de A y el caso cae (la transaccion se revierte y el DDL con ella).
//
// Transaccion SIEMPRE revertida; la siembra la hace el test y los CONTROL fallan si no estan.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const D0 = new Date("2026-10-10T15:00:00.000Z");
const D1 = new Date("2026-10-11T15:00:00.000Z");
const D2 = new Date("2026-10-12T15:00:00.000Z");
const D3 = new Date("2026-10-13T15:00:00.000Z");

const VENTANA: VentanaDeLibro = {
  pares: null,
  sortDir: "asc",
  conNombreRegistrador: true,
  skip: 0,
  take: 50,
};

interface Importes {
  consolidado: string;
  recibido: string;
  sinConsolidar: string;
}

/** La bodega de la empresa YA FIJADA en la transaccion (el DEFAULT de `organizacion_id` la pone). */
async function sembrarBodega(tx: TxDeTest, marca: string, imp: Importes): Promise<string> {
  const admin = await crearUsuarioDePrueba(tx, "adminSatelite");
  const mens = await crearUsuarioDePrueba(tx, "mensajero");
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const { id: zonaId } = await tx.zona.create({
    data: {
      nombre: `Zona slt76-ec ${marca} ${Date.now().toString(36)}`,
      sinpeNumero: "80000000",
      sinpeNombre: "Titular de Prueba",
      cobroVehiculo: false,
    },
    select: { id: true },
  });
  const cierre = (general: string, aprobadoAt: Date, cierreBodegaId: string | null) =>
    tx.cierreDia.create({
      data: {
        mensajeroId: mens.id,
        estado: "aprobado",
        destinoTipo: "bodega_satelite",
        destinoZonaId: zonaId,
        totalEfectivo: new Prisma.Decimal(general),
        totalGeneral: new Prisma.Decimal(general),
        solicitadoAt: new Date(aprobadoAt.getTime() - 3_600_000),
        resueltoAt: aprobadoAt,
        resueltoPor: admin.id,
        cierreBodegaId,
      },
      select: { id: true },
    });

  const { id: consolidacion } = await tx.cierreBodega.create({
    data: {
      zonaId,
      solicitadoPor: admin.id,
      estado: "aprobado",
      totalEfectivo: new Prisma.Decimal(imp.consolidado),
      totalGeneral: new Prisma.Decimal(imp.consolidado),
      solicitadoAt: D1,
      resueltoPor: maestro.id,
      resueltoAt: D2,
      conciliadoAt: D2,
      conciliadoPor: maestro.id,
      montoRecibido: new Prisma.Decimal(imp.recibido),
    },
    select: { id: true },
  });
  await cierre(imp.consolidado, D0, consolidacion);
  await cierre(imp.sinConsolidar, D3, null);
  return zonaId;
}

async function comoDueno(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
}

/** Las tres lecturas de la bodega `zonaId`, con el rol y la empresa que la transaccion tenga. */
async function leer(tx: TxDeTest, zonaId: string) {
  const repo = new EstadoCuentaRepository(tx as unknown as PrismaClient);
  const pagina = await repo.paginaDeBodega(zonaId, VENTANA);
  const periodo = await repo.periodoDeBodega(zonaId);
  return {
    totales: await repo.totalesDeBodega(zonaId),
    periodo: periodo.map((p) => `${p.tipo}|${p.monto}`).sort(),
    pagina: {
      total: pagina.total,
      filas: pagina.filas.map((f) => `${f.tipo}|${f.monto}|${f.saldoCorrido}`),
    },
  };
}

describeSiHayBase("SLT-76 R7 — estado de cuenta de la bodega con dos empresas (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R7: B no ve la bodega de A (vacio y 0,00), A ve sus cifras, y el dueno (CONTROL) SI ve la fuga", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const empresaA = (
        await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT NULLIF(current_setting('app.organizacion_id', true), '') AS id`,
        )
      )[0].id;
      const zonaA = await sembrarBodega(tx, "A", { consolidado: "1000.00", recibido: "900.00", sinConsolidar: "250.00" });

      const empresaB = (await crearOrganizacion(tx)).id;
      await fijarEmpresa(tx, empresaB);
      const zonaB = await sembrarBodega(tx, "B", { consolidado: "4000.00", recibido: "3500.00", sinConsolidar: "700.00" });

      // CONTROL: el dueno de las tablas (sin RLS), con la empresa B fijada, SI ve la bodega de A.
      const controlDueno = await leer(tx, zonaA);

      await comoApp(tx, empresaB);
      const bLeeA = await leer(tx, zonaA);
      const bLeeB = await leer(tx, zonaB);
      await comoDueno(tx);

      await comoApp(tx, empresaA);
      const aLeeA = await leer(tx, zonaA);
      const aLeeB = await leer(tx, zonaB);
      await comoDueno(tx);

      return { empresaA, empresaB, controlDueno, bLeeA, bLeeB, aLeeA, aLeeB };
    });

    expect(r.empresaA).toBeTruthy();
    expect(r.empresaB).not.toBe(r.empresaA);

    const DE_A = {
      totales: { declarado: "1250.00", recibido: "900.00" },
      periodo: ["declarado|1000.00", "recibido|900.00", "sin_consolidar|250.00"],
      pagina: {
        total: 3,
        filas: ["declarado|1000.00|1000.00", "recibido|900.00|100.00", "sin_consolidar|250.00|350.00"],
      },
    };
    const VACIO = { totales: { declarado: "0.00", recibido: "0.00" }, periodo: [], pagina: { total: 0, filas: [] } };

    // CONTROL: la lectura es capaz de ver una fuga (sin RLS, la bodega de A sale entera).
    expect(r.controlDueno).toEqual(DE_A);

    // R7: B con el rol de la app no ve nada de A.
    expect(r.bLeeA).toEqual(VACIO);
    // R7: A ve lo suyo, escrito a mano.
    expect(r.aLeeA).toEqual(DE_A);

    // Y en espejo: B ve lo suyo y A no ve lo de B.
    expect(r.bLeeB).toEqual({
      totales: { declarado: "4700.00", recibido: "3500.00" },
      periodo: ["declarado|4000.00", "recibido|3500.00", "sin_consolidar|700.00"],
      pagina: {
        total: 3,
        filas: ["declarado|4000.00|4000.00", "recibido|3500.00|500.00", "sin_consolidar|700.00|1200.00"],
      },
    });
    expect(r.aLeeB).toEqual(VACIO);
  });
});
