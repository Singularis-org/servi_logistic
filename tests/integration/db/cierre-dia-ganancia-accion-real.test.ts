import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { resumenGananciaMensajero } from "@/lib/actions/cierre-dia";
import type { ResumenGananciaResult } from "@/lib/types/cierre";

import {
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

/**
 * SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» (T2.4; R350, R352, R357)
 * — LA RUTA REAL: la Server Action `resumenGananciaMensajero` SIN `deps.service`, o sea su
 * `buildService()` con los repositorios reales y `construirReglasPaisEmpresa(prisma)`.
 *
 * El parametro `ganancia` del servicio es opcional: si el composition root no lo pasara, la accion
 * daria `sin_dato` y la cola no pintaria tarjetas, con el resto de la suite en verde. Aqui se exige
 * `ok` con las cifras del mensajero sembrado.
 *
 * `getPrismaClient` se redirige a la transaccion del test (patron de
 * `corregir-datos-cliente.pais-real.test.ts`): el SQL es el real y el rollback se lleva todo. La
 * empresa es la que crea `enTransaccionRevertida` (pais CR por `DEFAULT`, con su zona horaria).
 *
 * Corpus, mensajero M: cierre aprobado NUEVO P 5 000 / E 0, pago vigente 1 200 con fecha de HOY en
 * Costa Rica → pendiente 3 800,00 (1 cierre) y pagada 1 200,00 (1 pago).
 *
 * Sin base se SALTA (`describe.skip`, visible en la salida); con base y sin catalogos, FALLA.
 */

const cliente = vi.hoisted(() => ({ actual: null as unknown }));

vi.mock("@/lib/db/prisma-client", async (original) => {
  const real = await original<typeof import("@/lib/db/prisma-client")>();
  return {
    ...real,
    getPrismaClient: () => {
      if (cliente.actual === null) throw new Error("SLT-112: cliente de test no fijado");
      return cliente.actual;
    },
  };
});

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `slt112a-${Date.now().toString(36)}`;

/** La fecha calendario de hoy en Costa Rica (UTC−6), para que el pago caiga en el mes en curso. */
function hoyEnCostaRica(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

async function sembrar(tx: TxDeTest, cat: { rolMensajero: string; tipoIdentificacion: string }) {
  const zonaId = (
    await tx.zona.create({
      data: { nombre: `Zona ${SUFIJO}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba" },
      select: { id: true },
    })
  ).id;
  const usuario = async (clave: string) =>
    (
      await tx.usuario.create({
        data: {
          nombre: `U ${clave}`,
          email: `u-${clave}-${SUFIJO}@example.test`,
          telefono: "88880000",
          passwordHash: "x",
          cedula: `C-${clave}-${SUFIJO}`,
          tipoIdentificacionId: cat.tipoIdentificacion,
          rolId: cat.rolMensajero,
        },
        select: { id: true },
      })
    ).id;
  const m = await usuario("m");
  const registrador = await usuario("admin");
  const cierreId = (
    await tx.cierreDia.create({
      data: {
        mensajeroId: m,
        estado: "aprobado",
        destinoTipo: "bodega_central",
        destinoZonaId: zonaId,
        totalPagoMensajero: new Prisma.Decimal("5000.00"),
        totalEfectivo: new Prisma.Decimal("0.00"),
        totalGeneral: new Prisma.Decimal("0.00"),
        solicitadoAt: new Date("2026-11-02T15:00:00.000Z"),
        pagoIndependienteEfectivo: true,
      },
      select: { id: true },
    })
  ).id;
  await tx.liquidacionPago.create({
    data: {
      claveIdempotencia: randomUUID(),
      mensajeroId: m,
      cierreId,
      monto: new Prisma.Decimal("1200.00"),
      metodo: "efectivo",
      fechaPago: hoyEnCostaRica(),
      registradoPor: registrador,
    },
  });
  return { m };
}

describeSiHayBase("SLT-112 — resumenGananciaMensajero por la ruta real (buildService), contra Postgres", () => {
  let prisma: PrismaClient;
  let resultado: ResumenGananciaResult | undefined;
  let fallo: unknown;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const rol = await prisma.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } });
    const tipo = await prisma.tipoIdentificacion.findFirst({ select: { id: true } });
    if (rol === null || tipo === null) {
      throw new Error(
        "faltan catalogos (`rol` mensajero o `tipo_identificacion`): corre " +
          "`pnpm exec prisma migrate deploy` y `pnpm run db:seed` antes de esta suite.",
      );
    }
    try {
      resultado = await enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);
        const { m } = await sembrar(tx, { rolMensajero: rol.id, tipoIdentificacion: tipo.id });
        cliente.actual = clienteConTransaccionAnidada(tx);
        try {
          return await resumenGananciaMensajero({
            getActor: async () => ({ usuarioId: m, rol: "mensajero" }),
          });
        } finally {
          cliente.actual = null;
        }
      });
    } catch (e) {
      fallo = e;
    }
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R350/R352/R357: la accion real da `ok` con las cifras del mensajero (no `sin_dato` ni error)", () => {
    if (fallo !== undefined) throw fallo;
    expect(resultado).toEqual({
      status: "ok",
      resumen: {
        pendiente: { monto: "3800.00", conteo: 1 },
        pagadaEsteMes: { monto: "1200.00", conteo: 1 },
      },
    });
  });
});
