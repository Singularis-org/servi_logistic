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
import type { CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

/**
 * SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» (T1.3; R164, R165) — el pendiente
 * de pago de «Cierres solicitados», contra Postgres real.
 *
 * Los tests de servicio usan dobles de las dos lecturas: no ven el `WHERE` de los pagos vigentes, el
 * de los premios vivos ni el `mensajero_id` del listado. Aqui las tres consultas son las reales.
 *
 * EL CORPUS (una empresa propia, dentro de una transaccion que SIEMPRE se revierte), mensajero M:
 *   C1 aprobado   P 4 500 / E 1 000, pago vigente 1 000 y pago ANULADO 500 → 3 500 − 1 000 = 2500.00
 *   C2 aprobado   P 2 000 / E 5 000, sin pagos                               → 0.00
 *   C3 solicitado P   800 / E     0                                          → null
 *   C4 aprobado   P 1 000 / E     0, premio vivo 250, sin pagos             → 1 000 + 250 = 1250.00
 * y otro mensajero M2 con un cierre aprobado y un pago vigente, que no puede salir en la pagina de M.
 *
 * Sin base se SALTA (`describe.skip`, visible en la salida); con base y sin catalogos, FALLA.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `slt137-${Date.now().toString(36)}`;
const PREMIO_DIA = new Date("2026-11-05T00:00:00.000Z");
const FECHA_PAGO = new Date("2026-11-06T00:00:00.000Z");

interface Corpus {
  m: string;
  c: { C1: string; C2: string; C3: string; C4: string };
  cierreM2: string;
}

interface Medida {
  corpus: Corpus;
  items: CierrePasadoDTO[];
  total: number;
  sinLecturas: CierrePasadoDTO[];
  snapshotsAntes: Array<{ id: string; pago: string; efectivo: string }>;
  snapshotsDespues: Array<{ id: string; pago: string; efectivo: string }>;
}

async function sembrar(
  tx: TxDeTest,
  cat: { rolMensajero: string; tipoIdentificacion: string },
): Promise<Corpus> {
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
  const m2 = await usuario("m2");
  const registrador = await usuario("admin");

  const cierre = async (
    mensajeroId: string,
    estado: "aprobado" | "solicitado",
    pago: string,
    efectivo: string,
    dia: number,
  ) =>
    (
      await tx.cierreDia.create({
        data: {
          mensajeroId,
          estado,
          destinoTipo: "bodega_central",
          destinoZonaId: zonaId,
          totalPagoMensajero: new Prisma.Decimal(pago),
          totalEfectivo: new Prisma.Decimal(efectivo),
          totalGeneral: new Prisma.Decimal(efectivo),
          solicitadoAt: new Date(`2026-11-0${dia}T15:00:00.000Z`),
        },
        select: { id: true },
      })
    ).id;

  const C1 = await cierre(m, "aprobado", "4500.00", "1000.00", 1);
  const C2 = await cierre(m, "aprobado", "2000.00", "5000.00", 2);
  const C3 = await cierre(m, "solicitado", "800.00", "0.00", 3);
  const C4 = await cierre(m, "aprobado", "1000.00", "0.00", 4);
  const cierreM2 = await cierre(m2, "aprobado", "3000.00", "0.00", 5);

  const pagar = async (mensajeroId: string, cierreId: string, monto: string) =>
    (
      await tx.liquidacionPago.create({
        data: {
          claveIdempotencia: randomUUID(),
          mensajeroId,
          cierreId,
          monto: new Prisma.Decimal(monto),
          metodo: "efectivo",
          fechaPago: FECHA_PAGO,
          registradoPor: registrador,
        },
        select: { id: true },
      })
    ).id;

  await pagar(m, C1, "1000.00");
  const anulado = await pagar(m, C1, "500.00");
  await tx.liquidacionAnulacion.create({
    data: { pagoId: anulado, motivo: "Monto equivocado SLT-137", anuladoPor: registrador },
  });
  await pagar(m2, cierreM2, "700.00");

  await tx.pagoMensajeroMovimiento.create({
    data: {
      mensajeroId: m,
      tipo: "devengo",
      categoria: "premio_ranking",
      monto: new Prisma.Decimal("250.00"),
      origenTipo: "cierre_dia",
      origenId: C4,
      premioDia: PREMIO_DIA,
      descripcion: "Premio sembrado SLT-137",
    },
  });

  return { m, c: { C1, C2, C3, C4 }, cierreM2 };
}

function servicio(tx: TxDeTest, conLecturas: boolean): CierreDiaService {
  const cliente = tx as unknown as PrismaClient;
  return new CierreDiaService(
    // El listado no congela tarifas: el resolver no se llama.
    new CierreDiaRepository(cliente, {} as unknown as ITarifaVigenteRepository),
    {} as unknown as IZonaRepository,
    {} as unknown as IOrdenRepository,
    {} as unknown as ISignedUrlProvider,
    {} as unknown as ITarifaZonaMensajeroRepository,
    undefined,
    undefined,
    reglasPaisFijas(),
    conLecturas
      ? {
          liquidaciones: new LiquidacionPagoRepository(cliente),
          premios: new PagoMensajeroMovimientoRepository(cliente),
        }
      : undefined,
  );
}

async function snapshots(tx: TxDeTest, ids: string[]) {
  const filas = await tx.cierreDia.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: { id: true, totalPagoMensajero: true, totalEfectivo: true },
  });
  return filas.map((f) => ({
    id: f.id,
    pago: f.totalPagoMensajero.toFixed(2),
    efectivo: f.totalEfectivo.toFixed(2),
  }));
}

describeSiHayBase("SLT-137 — pendiente de pago en «Cierres solicitados», contra Postgres real", () => {
  let prisma: PrismaClient;
  let medida: Medida | undefined;
  let fallo: unknown;

  function m(): Medida {
    if (fallo !== undefined) throw fallo;
    if (medida === undefined) throw new Error("la medida no llego a tomarse");
    return medida;
  }

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
      medida = await enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);
        const corpus = await sembrar(tx, { rolMensajero: rol.id, tipoIdentificacion: tipo.id });
        const actor = { usuarioId: corpus.m, rol: "mensajero" as const };
        const idsM = Object.values(corpus.c);

        const snapshotsAntes = await snapshots(tx, idsM);
        const r = await servicio(tx, true).listarCierresPasadosPaginado({ page: 1, pageSize: 50 }, actor);
        const snapshotsDespues = await snapshots(tx, idsM);
        const s = await servicio(tx, false).listarCierresPasadosPaginado({ page: 1, pageSize: 50 }, actor);
        if (r.status !== "ok" || s.status !== "ok") {
          throw new Error(`el listado no salio ok: ${r.status} / ${s.status}`);
        }
        return {
          corpus,
          items: r.items,
          total: r.total,
          sinLecturas: s.items,
          snapshotsAntes,
          snapshotsDespues,
        };
      });
    } catch (e) {
      fallo = e;
    }
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("1. la pagina de M trae sus cuatro cierres y el total del conjunto", () => {
    const { items, total } = m();
    expect(items).toHaveLength(4);
    expect(total).toBe(4);
  });

  it("2. el pendiente de cada cierre: anulado no resta, premio suma, solicitado null (R164)", () => {
    const { items, corpus } = m();
    const pendienteDe = new Map(items.map((i) => [i.cierreId, i.pendientePagoMensajero]));
    expect(pendienteDe.get(corpus.c.C1)).toBe("2500.00");
    expect(pendienteDe.get(corpus.c.C2)).toBe("0.00");
    expect(pendienteDe.get(corpus.c.C3)).toBeNull();
    expect(pendienteDe.get(corpus.c.C4)).toBe("1250.00");
  });

  it("3. ningun cierre de otro mensajero sale en la pagina de M", () => {
    const { items, corpus } = m();
    expect(items.map((i) => i.cierreId)).not.toContain(corpus.cierreM2);
  });

  it("4. leer el pendiente no cambia lo que se le paga ni el efectivo congelado (R164)", () => {
    const { snapshotsAntes, snapshotsDespues } = m();
    expect(snapshotsAntes).toHaveLength(4);
    expect(snapshotsDespues).toEqual(snapshotsAntes);
  });

  it("5. un servicio sin las lecturas devuelve los mismos cierres sin el campo (R165)", () => {
    const { items, sinLecturas } = m();
    expect(sinLecturas.map((i) => i.cierreId)).toEqual(items.map((i) => i.cierreId));
    for (const i of sinLecturas) expect(i).not.toHaveProperty("pendientePagoMensajero");
  });
});
