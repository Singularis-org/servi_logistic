import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";
import {
  aprobar,
  efectosNoDinero,
  filasDeLibros,
  sembrarCierreAprobable,
} from "./_fixtures/slt73-cierre-aprobable";

// SLT-73 · T3 · R3 — APROBAR UN CIERRE DE LA CENTRAL ESCRIBE EN LOS TRES LIBROS EXACTAMENTE LO DE
// ANTES DE LA FICHA.
//
// Las filas esperadas van ESCRITAS A MANO, calculadas desde la siembra (`_fixtures/slt73-cierre-
// aprobable.ts`), y NO se leen de los feeds: comparar contra la funcion que las produce estaria
// siempre verde (memoria «asercion contra su propia fuente»).
//
//   ENTREGA de 20.000,00 en efectivo, tarifa congelada flete 2.500,00 · comision 3,50 % · IVA 13 %:
//     flete 2.500,00 · IVA del flete 325,00 · comision 700,00 · IVA de la comision 91,00
//     contra-entrega 20.000,00 (credito a la tienda y su ingreso en la caja, 173)
//   INCIDENTE indemnizado con 6.000,00 (egreso de la caja, 158); no factura nada.
//   PAGO AL MENSAJERO 1.500,00 con 20.000,00 de efectivo: devengo 1.500,00, pagado 1.500,00 y el
//     egreso de la caja por 1.500,00 (44).
//
// Contra Postgres real, en una transaccion que SIEMPRE se revierte, con los servicios reales.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const CAJA_CENTRAL = [
  { tipo: "egreso", categoria: "egreso_indemnizacion", monto: "6000.00" },
  { tipo: "egreso", categoria: "egreso_pago_mensajero", monto: "1500.00" },
  { tipo: "ingreso", categoria: "ingreso_cod_recaudado", monto: "20000.00" },
  { tipo: "ingreso", categoria: "ingreso_comision_cod", monto: "700.00" },
  { tipo: "ingreso", categoria: "ingreso_flete", monto: "2500.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_comision_cod", monto: "91.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_flete", monto: "325.00" },
];

const TIENDA_CENTRAL = [
  { tipo: "credito", categoria: "cod_recaudado", monto: "20000.00" },
  { tipo: "debito", categoria: "comision_cod", monto: "700.00" },
  { tipo: "debito", categoria: "flete", monto: "2500.00" },
  { tipo: "debito", categoria: "iva_comision_cod", monto: "91.00" },
  { tipo: "debito", categoria: "iva_flete", monto: "325.00" },
];

const MENSAJERO_CENTRAL = [
  { tipo: "devengo", categoria: "pago_devengado", monto: "1500.00" },
  { tipo: "pago", categoria: "pago_efectivo", monto: "1500.00" },
];

describeSiHayBase("SLT-73 R3 — aprobar un cierre de la central asienta igual que antes", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("CONTROL: el cierre sembrado es de la central, esta `solicitado` y no tiene ni una fila en los libros", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_central");
      return {
        cierre: await tx.cierreDia.findUniqueOrThrow({
          where: { id: k.cierreId },
          select: { destinoTipo: true, estado: true },
        }),
        gestiones: await tx.gestionOrden.count({ where: { cierreId: k.cierreId } }),
        libros: await filasDeLibros(tx, k.cierreId),
      };
    });
    expect(r.cierre).toEqual({ destinoTipo: "bodega_central", estado: "solicitado" });
    expect(r.gestiones).toBe(2);
    expect(r.libros).toEqual({ caja: [], tienda: [], mensajero: [] });
  });

  it("R3: tras aprobar, los tres libros tienen exactamente las filas de siempre (literal)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_central");
      const status = await aprobar(k);
      return { status, libros: await filasDeLibros(tx, k.cierreId) };
    });
    expect(r.status).toBe("ok");
    expect(r.libros.caja).toEqual(CAJA_CENTRAL);
    expect(r.libros.tienda).toEqual(TIENDA_CENTRAL);
    expect(r.libros.mensajero).toEqual(MENSAJERO_CENTRAL);
  });

  it("R3 (contra R2): lo que no es dinero tambien ocurre en la central", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_central");
      const status = await aprobar(k);
      return { status, efectos: await efectosNoDinero(tx, k) };
    });
    expect(r.status).toBe("ok");
    expect(r.efectos).toEqual({
      estado: "aprobado",
      resueltoPorAprobador: true,
      conFecha: true,
      indemnizacion: "6000.00",
      ordenEntregaAplicada: true,
      historialEntrega: 1,
      accion: 1,
    });
  });
});
