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

// SLT-73 · T3 · R1/R2 — APROBAR UN CIERRE DE LA SATELITE NO ESCRIBE DINERO, PERO HACE TODO LO DEMAS.
//
// R1: ni una fila con origen `cierre_dia` y este cierre en la caja de la central, en el libro por
// tienda ni en el del pago al mensajero. El dinero entra al CONCILIAR su consolidacion (R10, T4).
// R2: la transicion a `aprobado` con su actor y su fecha, la indemnizacion capturada en su gestion,
// la aplicacion de la gestion de calle con su historial y el registro de la accion, IGUAL que en la
// central (`slt73-aprobar-central-igual.int.test.ts` afirma lo mismo para la central).
//
// La siembra es la MISMA que la de la central (mismas gestiones, misma tarifa, mismos totales): lo
// unico que cambia es `destino_tipo`. Asi los ceros de abajo no pueden venir de un cierre sin dinero:
// el mismo cierre en la central escribe 7 + 5 + 2 filas.
//
// Contra Postgres real, en una transaccion que SIEMPRE se revierte, con los servicios reales.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("SLT-73 R1/R2 — aprobar un cierre de la satelite no asienta dinero", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("CONTROL: el cierre es de la satelite, esta `solicitado`, tiene sus dos gestiones y dinero que asentar", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_satelite");
      return {
        cierre: await tx.cierreDia.findUniqueOrThrow({
          where: { id: k.cierreId },
          select: { destinoTipo: true, estado: true, totalGeneral: true, totalPagoMensajero: true },
        }),
        gestiones: await tx.gestionOrden.count({ where: { cierreId: k.cierreId } }),
        detalle: await tx.cierreDetail.count({ where: { cierreId: k.cierreId } }),
      };
    });
    expect(r.cierre.destinoTipo).toBe("bodega_satelite");
    expect(r.cierre.estado).toBe("solicitado");
    expect(r.cierre.totalGeneral.toFixed(2)).toBe("20000.00");
    expect(r.cierre.totalPagoMensajero.toFixed(2)).toBe("1500.00");
    expect(r.gestiones).toBe(2);
    expect(r.detalle).toBe(2);
  });

  it("R1: tras aprobar, ninguno de los tres libros tiene una fila de este cierre", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_satelite");
      const status = await aprobar(k);
      const estado = (
        await tx.cierreDia.findUniqueOrThrow({ where: { id: k.cierreId }, select: { estado: true } })
      ).estado;
      return { status, estado, libros: await filasDeLibros(tx, k.cierreId) };
    });
    // La aprobacion OCURRIO (si no, los ceros no dirian nada).
    expect(r.status).toBe("ok");
    expect(r.estado).toBe("aprobado");
    expect(r.libros).toEqual({ caja: [], tienda: [], mensajero: [] });
  });

  it("R2: lo que no es dinero ocurre igual que en la central (estado, actor, fecha, indemnizacion, aplicacion, historial)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_satelite");
      const status = await aprobar(k);
      return { status, efectos: await efectosNoDinero(tx, k) };
    });
    expect(r.status).toBe("ok");
    expect(r.efectos).toEqual({
      estado: "aprobado",
      resueltoPorAprobador: true,
      conFecha: true,
      // La indemnizacion capturada es dato de la gestion (no dinero): se persiste aunque el egreso
      // de la caja espere a la conciliacion, que la LEE de aqui.
      indemnizacion: "6000.00",
      ordenEntregaAplicada: true,
      historialEntrega: 1,
      accion: 1,
    });
  });
});
