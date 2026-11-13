import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import type { ITarifaVigenteRepository } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { ITarifaZonaMensajeroRepository } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import type {
  CierrePasadoDTO,
  ResumenGananciaServiceResult,
} from "@/lib/interfaces/services/ICierreDiaService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type EventoSqlDeTest,
  type TxDeTest,
} from "./_postgres-real";

/**
 * SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» (T3.1; R350, R351, R352,
 * R354, R356, R72) — las dos cifras de «Cierres solicitados», contra Postgres real.
 *
 * Los tests del servicio usan dobles y no ven el `WHERE` de las tres consultas (actor, estado,
 * vigencia, rango de fechas). Aqui son las reales, con el servicio real encima.
 *
 * EL CORPUS (transaccion que SIEMPRE se revierte; «hoy» = 2026-11-20T15:00Z; zona America/Costa_Rica).
 * Empresa A, mensajero M (P = `total_pago_mensajero`, E = `total_efectivo`; «nuevo» = con la marca
 * `pago_independiente_efectivo` de SLT-123):
 *   C1 aprobado viejo  P 50 000,55 / E  5 000      sin pagos                         → 45 000,55
 *   C2 aprobado nuevo  P  4 000,00 / E 10 000      pago 1 500 (3 nov); 700 (4 nov) ANULADO → 2 500,00
 *   C3 aprobado nuevo  P  3 000,00 / E      0      pago 3 000 (31 oct)               → 0,00
 *   C4 aprobado nuevo  P  2 000,00 / E      0      pago 2 000 (1 nov)                → 0,00
 *   C5 aprobado nuevo  P    500,00 / E      0      pago   500 (1 dic)                → 0,00
 *   C6 aprobado viejo  P  1 000,00 / E  1 000      — (dado por pagado con el efectivo) → 0,00
 *   C7 solicitado      P  9 999,00                                                    no cuenta
 *   C8 rechazado       P  7 777,00                                                    no cuenta
 * Ademas: M2 (empresa A) con un aprobado nuevo P 10 000 y pago 1 000 (5 nov); M3 (empresa A) con un
 * solo aprobado nuevo P 700 sin pagos; y la empresa B con su mensajero MB, aprobado nuevo P 8 000 y
 * pago 600 (5 nov).
 *
 * ESPERADO PARA M (a mano):
 *   pendiente = 45 000,55 + 2 500,00 = "47500.55", 2 cierres con algo pendiente.
 *   pagada este mes = 1 500 (3 nov) + 2 000 (1 nov) = "3500.00", 2 pagos. Fuera: el anulado 700,
 *   el de octubre 3 000, el del 1 de diciembre 500, M2 y la empresa B.
 *
 * Sin base se SALTA (`describe.skip`, visible en la salida); con base y sin catalogos, FALLA.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `slt112-${Date.now().toString(36)}`;
const AHORA = new Date("2026-11-20T15:00:00.000Z");
/** 21:00 del 30 de noviembre en Costa Rica: en UTC ya es diciembre (mutacion 9). */
const AHORA_FIN_DE_MES = new Date("2026-12-01T03:00:00.000Z");

type Clave = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";

interface Corpus {
  m: string;
  m2: string;
  m3: string;
  mb: string;
  c: Record<Clave, string>;
}

interface Medida {
  corpus: Corpus;
  resumenM: ResumenGananciaServiceResult;
  resumenFinDeMes: ResumenGananciaServiceResult;
  resumenM2: ResumenGananciaServiceResult;
  resumenM3: ResumenGananciaServiceResult;
  resumenMB: ResumenGananciaServiceResult;
  resumenComoApp: ResumenGananciaServiceResult;
  resumenTrasFiltrar: ResumenGananciaServiceResult;
  pagina: CierrePasadoDTO[];
  paginaFiltrada: CierrePasadoDTO[];
  sentenciasM: string[];
  sentenciasM3: string[];
  filasAntes: Record<string, number>;
  filasDespues: Record<string, number>;
}

async function usuario(
  tx: TxDeTest,
  clave: string,
  cat: { rolMensajero: string; tipoIdentificacion: string },
): Promise<string> {
  return (
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
}

async function zona(tx: TxDeTest, clave: string): Promise<string> {
  return (
    await tx.zona.create({
      data: { nombre: `Zona ${clave} ${SUFIJO}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba" },
      select: { id: true },
    })
  ).id;
}

async function cierre(
  tx: TxDeTest,
  o: {
    mensajeroId: string;
    zonaId: string;
    estado: "aprobado" | "solicitado" | "rechazado";
    pago: string;
    efectivo: string;
    dia: string; // YYYY-MM-DD
    nuevo: boolean;
  },
): Promise<string> {
  return (
    await tx.cierreDia.create({
      data: {
        mensajeroId: o.mensajeroId,
        estado: o.estado,
        destinoTipo: "bodega_central",
        destinoZonaId: o.zonaId,
        totalPagoMensajero: new Prisma.Decimal(o.pago),
        totalEfectivo: new Prisma.Decimal(o.efectivo),
        totalGeneral: new Prisma.Decimal(o.efectivo),
        solicitadoAt: new Date(`${o.dia}T15:00:00.000Z`),
        pagoIndependienteEfectivo: o.nuevo,
      },
      select: { id: true },
    })
  ).id;
}

async function pagar(
  tx: TxDeTest,
  o: { mensajeroId: string; cierreId: string; monto: string; fecha: string; registrador: string },
): Promise<string> {
  return (
    await tx.liquidacionPago.create({
      data: {
        claveIdempotencia: randomUUID(),
        mensajeroId: o.mensajeroId,
        cierreId: o.cierreId,
        monto: new Prisma.Decimal(o.monto),
        metodo: "efectivo",
        fechaPago: new Date(`${o.fecha}T00:00:00.000Z`),
        registradoPor: o.registrador,
      },
      select: { id: true },
    })
  ).id;
}

async function sembrar(
  tx: TxDeTest,
  cat: { rolMensajero: string; tipoIdentificacion: string },
  empresaA: string,
): Promise<Corpus> {
  const z = await zona(tx, "A");
  const m = await usuario(tx, "m", cat);
  const m2 = await usuario(tx, "m2", cat);
  const m3 = await usuario(tx, "m3", cat);
  const reg = await usuario(tx, "admin", cat);

  const C1 = await cierre(tx, { mensajeroId: m, zonaId: z, estado: "aprobado", pago: "50000.55", efectivo: "5000.00", dia: "2026-11-01", nuevo: false });
  const C2 = await cierre(tx, { mensajeroId: m, zonaId: z, estado: "aprobado", pago: "4000.00", efectivo: "10000.00", dia: "2026-11-02", nuevo: true });
  const C3 = await cierre(tx, { mensajeroId: m, zonaId: z, estado: "aprobado", pago: "3000.00", efectivo: "0.00", dia: "2026-11-03", nuevo: true });
  const C4 = await cierre(tx, { mensajeroId: m, zonaId: z, estado: "aprobado", pago: "2000.00", efectivo: "0.00", dia: "2026-11-04", nuevo: true });
  const C5 = await cierre(tx, { mensajeroId: m, zonaId: z, estado: "aprobado", pago: "500.00", efectivo: "0.00", dia: "2026-11-05", nuevo: true });
  const C6 = await cierre(tx, { mensajeroId: m, zonaId: z, estado: "aprobado", pago: "1000.00", efectivo: "1000.00", dia: "2026-11-06", nuevo: false });
  const C7 = await cierre(tx, { mensajeroId: m, zonaId: z, estado: "solicitado", pago: "9999.00", efectivo: "0.00", dia: "2026-11-07", nuevo: true });
  const C8 = await cierre(tx, { mensajeroId: m, zonaId: z, estado: "rechazado", pago: "7777.00", efectivo: "0.00", dia: "2026-11-08", nuevo: true });

  await pagar(tx, { mensajeroId: m, cierreId: C2, monto: "1500.00", fecha: "2026-11-03", registrador: reg });
  const anulado = await pagar(tx, { mensajeroId: m, cierreId: C2, monto: "700.00", fecha: "2026-11-04", registrador: reg });
  await tx.liquidacionAnulacion.create({
    data: { pagoId: anulado, motivo: "Monto equivocado SLT-112", anuladoPor: reg },
  });
  await pagar(tx, { mensajeroId: m, cierreId: C3, monto: "3000.00", fecha: "2026-10-31", registrador: reg });
  await pagar(tx, { mensajeroId: m, cierreId: C4, monto: "2000.00", fecha: "2026-11-01", registrador: reg });
  await pagar(tx, { mensajeroId: m, cierreId: C5, monto: "500.00", fecha: "2026-12-01", registrador: reg });

  const cM2 = await cierre(tx, { mensajeroId: m2, zonaId: z, estado: "aprobado", pago: "10000.00", efectivo: "0.00", dia: "2026-11-05", nuevo: true });
  await pagar(tx, { mensajeroId: m2, cierreId: cM2, monto: "1000.00", fecha: "2026-11-05", registrador: reg });
  await cierre(tx, { mensajeroId: m3, zonaId: z, estado: "aprobado", pago: "700.00", efectivo: "0.00", dia: "2026-11-05", nuevo: true });

  // Empresa B: sus filas nacen con SU `organizacion_id` (el DEFAULT sale de `app.organizacion_id`).
  const empresaB = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, empresaB);
  const zB = await zona(tx, "B");
  const mb = await usuario(tx, "mb", cat);
  const regB = await usuario(tx, "adminb", cat);
  const cB = await cierre(tx, { mensajeroId: mb, zonaId: zB, estado: "aprobado", pago: "8000.00", efectivo: "0.00", dia: "2026-11-05", nuevo: true });
  await pagar(tx, { mensajeroId: mb, cierreId: cB, monto: "600.00", fecha: "2026-11-05", registrador: regB });
  await fijarEmpresa(tx, empresaA);

  return { m, m2, m3, mb, c: { C1, C2, C3, C4, C5, C6, C7, C8 } };
}

function servicio(tx: TxDeTest, ahora: Date = AHORA): CierreDiaService {
  const cliente = tx as unknown as PrismaClient;
  return new CierreDiaService(
    new CierreDiaRepository(cliente, {} as unknown as ITarifaVigenteRepository),
    {} as unknown as IZonaRepository,
    {} as unknown as IOrdenRepository,
    {} as unknown as ISignedUrlProvider,
    {} as unknown as ITarifaZonaMensajeroRepository,
    undefined,
    undefined,
    reglasPaisFijas(),
    {
      liquidaciones: new LiquidacionPagoRepository(cliente),
      premios: new PagoMensajeroMovimientoRepository(cliente),
    },
    {
      pagos: new LiquidacionPagoRepository(cliente),
      // SLT-139 (R345 -> R353): como el composition root de /cierre-dia.
      pagadoPorSatelite: new PagoMensajeroMovimientoRepository(cliente),
      ahora: () => ahora,
    },
  );
}

async function filas(tx: TxDeTest): Promise<Record<string, number>> {
  return {
    cierre_dia: await tx.cierreDia.count(),
    liquidacion_pago: await tx.liquidacionPago.count(),
    liquidacion_anulacion: await tx.liquidacionAnulacion.count(),
    pago_mensajero_movimiento: await tx.pagoMensajeroMovimiento.count(),
  };
}

/** El texto de una sentencia sin la lista de parametros del `IN`, que crece con los ids. */
function forma(e: EventoSqlDeTest): string {
  return e.query.replace(/\$\d+(\s*,\s*\$\d+)*/g, "$*");
}

describeSiHayBase("SLT-112 — cifras de la ganancia del mensajero, contra Postgres real", () => {
  let prisma: PrismaClient;
  let eventos: EventoSqlDeTest[];
  let medida: Medida | undefined;
  let fallo: unknown;

  function m(): Medida {
    if (fallo !== undefined) throw fallo;
    if (medida === undefined) throw new Error("la medida no llego a tomarse");
    return medida;
  }

  function ok(r: ResumenGananciaServiceResult) {
    if (r.status !== "ok") throw new Error(`se esperaba ok y llego ${r.status}`);
    return r.resumen;
  }

  beforeAll(async () => {
    ({ prisma, eventos } = crearPrismaDeTestConEspia());
    const rol = await prisma.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } });
    const tipo = await prisma.tipoIdentificacion.findFirst({ select: { id: true } });
    if (rol === null || tipo === null) {
      throw new Error(
        "faltan catalogos (`rol` mensajero o `tipo_identificacion`): corre " +
          "`pnpm exec prisma migrate deploy` y `pnpm run db:seed` antes de esta suite.",
      );
    }

    try {
      medida = await enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);
        const [{ empresa }] = await tx.$queryRawUnsafe<Array<{ empresa: string }>>(
          `SELECT current_setting('app.organizacion_id') AS empresa`,
        );
        const corpus = await sembrar(tx, { rolMensajero: rol.id, tipoIdentificacion: tipo.id }, empresa);
        const actor = (usuarioId: string) => ({ usuarioId, rol: "mensajero" as const });

        const filasAntes = await filas(tx);

        let i = eventos.length;
        const resumenM = await servicio(tx).resumenGanancia(actor(corpus.m));
        const sentenciasM = eventos.slice(i).map(forma);
        i = eventos.length;
        const resumenM3 = await servicio(tx).resumenGanancia(actor(corpus.m3));
        const sentenciasM3 = eventos.slice(i).map(forma);

        const resumenFinDeMes = await servicio(tx, AHORA_FIN_DE_MES).resumenGanancia(actor(corpus.m));
        const resumenM2 = await servicio(tx).resumenGanancia(actor(corpus.m2));
        const resumenMB = await servicio(tx).resumenGanancia(actor(corpus.mb));

        const p = await servicio(tx).listarCierresPasadosPaginado({ page: 1, pageSize: 50 }, actor(corpus.m));
        // R354: un filtro que deja fuera a C1 (solicitado el 1 de noviembre).
        const pf = await servicio(tx).listarCierresPasadosPaginado(
          { page: 1, pageSize: 50, filtros: { desde: "2026-11-02" } },
          actor(corpus.m),
        );
        if (p.status !== "ok" || pf.status !== "ok") {
          throw new Error(`el listado no salio ok: ${p.status} / ${pf.status}`);
        }
        const resumenTrasFiltrar = await servicio(tx).resumenGanancia(actor(corpus.m));

        const filasDespues = await filas(tx);

        // Ultimo: como la app en produccion (rol sin BYPASSRLS, empresa A), el mismo resultado.
        await comoApp(tx, empresa);
        const resumenComoApp = await servicio(tx).resumenGanancia(actor(corpus.m));

        return {
          corpus,
          resumenM,
          resumenFinDeMes,
          resumenM2,
          resumenM3,
          resumenMB,
          resumenComoApp,
          resumenTrasFiltrar,
          pagina: p.items,
          paginaFiltrada: pf.items,
          sentenciasM,
          sentenciasM3,
          filasAntes,
          filasDespues,
        };
      });
    } catch (e) {
      fallo = e;
    }
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R350: «Ganancia pendiente de pago» de M = 47 500,55 en 2 cierres (C7 y C8 no cuentan)", () => {
    expect(ok(m().resumenM).pendiente).toEqual({ monto: "47500.55", conteo: 2 });
  });

  it("R352: «Ganancia pagada este mes» de M = 3 500,00 en 2 pagos (sin anulado, octubre ni diciembre)", () => {
    expect(ok(m().resumenM).pagadaEsteMes).toEqual({ monto: "3500.00", conteo: 2 });
  });

  it("R352: el mes es el de la zona de la empresa: a las 21:00 del 30 de noviembre sigue siendo noviembre", () => {
    expect(ok(m().resumenFinDeMes).pagadaEsteMes).toEqual({ monto: "3500.00", conteo: 2 });
  });

  it("R351: lo pendiente de cada cierre es el de la celda «Pago» y la tarjeta es la suma de la pagina", () => {
    const { pagina, corpus } = m();
    expect(pagina).toHaveLength(8);
    const pendienteDe = new Map(pagina.map((c) => [c.cierreId, c.pendientePagoMensajero]));
    expect(pendienteDe.get(corpus.c.C1)).toBe("45000.55");
    expect(pendienteDe.get(corpus.c.C2)).toBe("2500.00");
    expect(pendienteDe.get(corpus.c.C3)).toBe("0.00");
    expect(pendienteDe.get(corpus.c.C4)).toBe("0.00");
    expect(pendienteDe.get(corpus.c.C5)).toBe("0.00");
    expect(pendienteDe.get(corpus.c.C6)).toBe("0.00");
    expect(pendienteDe.get(corpus.c.C7)).toBeNull();
    expect(pendienteDe.get(corpus.c.C8)).toBeNull();
    const suma = pagina
      .map((c) => c.pendientePagoMensajero)
      .filter((v): v is string => typeof v === "string")
      .reduce((acc, v) => acc.plus(new Prisma.Decimal(v)), new Prisma.Decimal(0))
      .toFixed(2);
    expect(suma).toBe("47500.55");
    expect(ok(m().resumenM).pendiente.monto).toBe(suma);
  });

  it("R354: otro mensajero de la empresa y otra empresa no suman en M, y cada uno ve solo lo suyo", () => {
    expect(ok(m().resumenM2)).toEqual({
      pendiente: { monto: "9000.00", conteo: 1 },
      pagadaEsteMes: { monto: "1000.00", conteo: 1 },
    });
    expect(ok(m().resumenMB)).toEqual({
      pendiente: { monto: "7400.00", conteo: 1 },
      pagadaEsteMes: { monto: "600.00", conteo: 1 },
    });
    expect(ok(m().resumenM3)).toEqual({
      pendiente: { monto: "700.00", conteo: 1 },
      pagadaEsteMes: { monto: "0.00", conteo: 0 },
    });
  });

  it("R354: con un filtro, la cola cambia y las cifras no", () => {
    const { pagina, paginaFiltrada, corpus, resumenM, resumenTrasFiltrar } = m();
    expect(paginaFiltrada.map((c) => c.cierreId)).not.toContain(corpus.c.C1);
    expect(paginaFiltrada.length).toBeLessThan(pagina.length);
    expect(resumenTrasFiltrar).toEqual(resumenM);
  });

  it("R354: con el rol de la app (RLS de la empresa A) las cifras de M son las mismas", () => {
    expect(m().resumenComoApp).toEqual(m().resumenM);
  });

  it("R356: mismas sentencias con seis aprobados (M) que con uno (M3)", () => {
    const { sentenciasM, sentenciasM3 } = m();
    // aprobados + pagos vigentes por cierre + premios vivos por cierre + pagos del mes; SLT-139 suma
    // lo pagado por la satelite por cierre (M y M3 tienen cierres nuevos) y lo de la satelite del mes.
    expect(sentenciasM).toHaveLength(6);
    expect(sentenciasM3).toEqual(sentenciasM);
  });

  it("R72: leer las cifras no escribe nada", () => {
    const { filasAntes, filasDespues } = m();
    // Anti-vacuidad: los 11 cierres sembrados (8 de M, 1 de M2, 1 de M3, 1 de MB) estan.
    expect(filasAntes.cierre_dia).toBeGreaterThanOrEqual(11);
    expect(filasAntes.liquidacion_anulacion).toBeGreaterThanOrEqual(1);
    expect(filasDespues).toEqual(filasAntes);
  });
});
