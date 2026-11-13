import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { resumenGananciaMensajero } from "@/lib/actions/cierre-dia";
import type { ResumenGananciaResult } from "@/lib/types/cierre";
import { comoApp } from "@/tests/fabricas/organizaciones";

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
 * SLT-139 «Pago al mensajero independiente del efectivo: satelite» (R345 -> R353, PA1 de SLT-112):
 * ademas, en el libro (`pago_satelite`, `fecha_movimiento` = la PRIMERA marca de conciliacion):
 *   - S1 de M, P 700, pagado por la satelite 700 AHORA (en el mes)            → cuenta
 *   - S2 de M, P 400, pagado por la satelite 400 un minuto ANTES del mes; su consolidacion se
 *     corrigio despues (`cierre_bodega.conciliado_at` = ahora)                 → no cuenta
 *   - otro mensajero M2, 900 en el mes                                          → no cuenta
 *   - la empresa B, su mensajero MB con 999 en el mes                           → no cuenta
 * Pagada = 1 200 + 700 = 1 900,00 con 2 movimientos. S1 y S2 quedan con pendiente 0 (lo pago la
 * satelite entero), asi que el pendiente sigue en 3 800,00 con 1 cierre.
 * La accion corre como la app (`comoApp`, rol sin BYPASSRLS): la empresa la acota la RLS.
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
  // ── SLT-139: lo pagado por la satelite ───────────────────────────────────────────────
  const orgA = (await tx.cierreDia.findUniqueOrThrow({ where: { id: cierreId }, select: { organizacionId: true } }))
    .organizacionId;
  const ahora = new Date();
  const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit" })
    .format(ahora); // "YYYY-MM"
  // 00:00 del dia 1 en Costa Rica (UTC−6, sin horario de verano) menos un minuto: el mes anterior.
  const antesDelMes = new Date(new Date(`${mes}-01T06:00:00.000Z`).getTime() - 60_000);
  const consolidacion = (
    await tx.cierreBodega.create({
      data: {
        zonaId,
        solicitadoPor: registrador,
        estado: "aprobado",
        conciliadoAt: ahora, // la CORRECCION del recibido reescribe esto; la fila del libro no se mueve
        conciliadoPor: registrador,
        montoRecibido: new Prisma.Decimal("0.00"),
      },
      select: { id: true },
    })
  ).id;
  const cierreNuevo = async (mensajeroId: string, p: string, conConsolidacion: boolean) =>
    (
      await tx.cierreDia.create({
        data: {
          mensajeroId,
          estado: "aprobado",
          destinoTipo: "bodega_satelite",
          destinoZonaId: zonaId,
          totalPagoMensajero: new Prisma.Decimal(p),
          totalEfectivo: new Prisma.Decimal("0.00"),
          totalGeneral: new Prisma.Decimal("0.00"),
          solicitadoAt: new Date("2026-10-02T15:00:00.000Z"),
          pagoIndependienteEfectivo: true,
          ...(conConsolidacion ? { cierreBodegaId: consolidacion } : {}),
        },
        select: { id: true },
      })
    ).id;
  const pagoSatelite = (mensajeroId: string, origenId: string, monto: string, fecha: Date, org: string) =>
    tx.$executeRawUnsafe(
      `INSERT INTO "pago_mensajero_movimiento"
         ("id","mensajero_id","tipo","categoria","monto","origen_tipo","origen_id","fecha_movimiento","organizacion_id")
       VALUES ($1,$2,'pago','pago_satelite',$3::numeric,'cierre_dia',$4,$5,$6)`,
      randomUUID(),
      mensajeroId,
      monto,
      origenId,
      fecha,
      org,
    );
  const s1 = await cierreNuevo(m, "700.00", false);
  const s2 = await cierreNuevo(m, "400.00", true);
  await pagoSatelite(m, s1, "700.00", ahora, orgA);
  await pagoSatelite(m, s2, "400.00", antesDelMes, orgA);
  const m2 = await usuario("m2");
  const s3 = await cierreNuevo(m2, "900.00", false);
  await pagoSatelite(m2, s3, "900.00", ahora, orgA);
  // Empresa B: su mensajero MB con 999 en el mes (el trigger SL017 no deja colgar de M una fila de
  // otra empresa). La lectura corre con la RLS de A; la empresa no la filtra el WHERE.
  const orgB = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "organizacion" ("id","nombre","slug") VALUES ($1,'SLT139 ganancia B',$2)`,
    orgB,
    `slt139-g-${orgB.slice(0, 8)}`,
  );
  const mb = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "usuario" ("id","nombre","email","telefono","password_hash","cedula","tipo_identificacion_id","rol_id","organizacion_id","updated_at")
     VALUES ($1,'MB SLT139',$2,'88880000','x',$3,$4,$5,$6,now())`,
    mb,
    `slt139-mb-${mb.slice(0, 8)}@example.test`,
    `SLT139MB-${mb.slice(0, 8)}`,
    cat.tipoIdentificacion,
    cat.rolMensajero,
    orgB,
  );
  await pagoSatelite(mb, randomUUID(), "999.00", ahora, orgB);

  return { m, orgA };
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
        const { m, orgA } = await sembrar(tx, { rolMensajero: rol.id, tipoIdentificacion: tipo.id });
        await comoApp(tx, orgA); // SLT-139: la empresa B solo la deja fuera la RLS
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

  it("R350/R352/R357 + SLT-139 R345/PA1: la accion real da `ok`; la pagada del mes incluye lo de la satelite", () => {
    if (fallo !== undefined) throw fallo;
    expect(resultado).toEqual({
      status: "ok",
      resumen: {
        pendiente: { monto: "3800.00", conteo: 1 },
        pagadaEsteMes: { monto: "1900.00", conteo: 2 },
      },
    });
  });
});
