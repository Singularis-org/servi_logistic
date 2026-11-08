import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { precioQueRigeEn } from "@/lib/planes/precio-que-rige";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PrecioPlan, VersionPlan } from "@/lib/types/planes";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearPlan, planesEnTx, revertida } from "./_fixtures/planes";

// SLT-86 (design §1.2; R15, R25; review m4) — `PlanesRepository.preciosQueRigenDesde` contra Postgres real,
// como dueño (`comoPlataforma`). Lo que solo la base puede decir:
//   · el corte: la fila con el mayor `desde_at <= desde` y las posteriores; las anteriores a la vigente no
//     salen, y `desde_at = desde` cuenta como vigente (mismo `<=` que `plan_de_la_empresa`);
//   · el `-infinity` del alta sale como `null`, no rompe el `Date`;
//   · el filtro por plan (`ANY`): un plan no pedido no sale;
//   · el precio de un cambio programado, que aún no está en el historial, sale con su `vigente_desde`.
// Las filas con fecha del historial se insertan a mano: las del repositorio caen en «hoy». Todo se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };

/** Las 00:00 de la plataforma (−06:00) de cada fecha, como las escribe el repositorio. */
const D_2026_01_01 = new Date("2026-01-01T06:00:00.000Z");
const D_2026_06_01 = new Date("2026-06-01T06:00:00.000Z");
const D_2026_11_20 = new Date("2026-11-20T06:00:00.000Z");
const D_2027_03_01 = new Date("2027-03-01T06:00:00.000Z");

const P31: PrecioPlan = { tipo: "monto", mensual: "31000.00", descuentos: {} };
const P33: PrecioPlan = { tipo: "monto", mensual: "33000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } };
const P35: PrecioPlan = { tipo: "monto", mensual: "35000.00", descuentos: {} };
const P40: PrecioPlan = { tipo: "monto", mensual: "40000.00", descuentos: {} };

let base: PrismaClient;

const comoTexto = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

/** El precio de alta (la fila `-infinity` que siembra `crearPlan`). */
async function precioDeAlta(tx: TxDeTest, planId: string, mensual: string): Promise<void> {
  await tx.$executeRawUnsafe(`UPDATE "plan_precio_historial" SET "precio_mensual" = $2::numeric WHERE "plan_id" = $1`, planId, mensual);
}

async function filaDelHistorial(tx: TxDeTest, planId: string, desde: Date, precio: PrecioPlan): Promise<void> {
  const mensual = precio.tipo === "monto" ? precio.mensual : null;
  const descuentos = precio.tipo === "monto" ? JSON.stringify(precio.descuentos) : "{}";
  await tx.$executeRawUnsafe(
    `INSERT INTO "plan_precio_historial" ("plan_id", "desde_at", "precio_mensual", "descuentos")
     VALUES ($1, $2::timestamp, $3::numeric, $4::jsonb)`,
    planId,
    comoTexto(desde),
    mensual,
    descuentos,
  );
}

async function programar(tx: TxDeTest, planId: string, vigenteDesde: Date, precio: PrecioPlan): Promise<void> {
  const version: VersionPlan = {
    nombre: "Programado",
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio,
    costoPorOrden: "100.00",
    costoPorOrdenPorcentual: null,
  };
  await tx.planCambioProgramado.create({
    data: { planId, vigenteDesde, version, avisosAlProgramar: [], actorUsuarioId: randomUUID(), actorNombre: "Ana Pérez" },
  });
}

describeSiHayBase("SLT-86 — los precios que regirán a un plan (R15, R25; review m4)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R15: sin ediciones, solo la fila del alta, con `desde` null (el `-infinity`)", async () => {
    const leidos = await revertida(base, async (tx) => {
      const planId = await crearPlan(tx);
      return planesEnTx(tx).preciosQueRigenDesde([planId], D_2026_06_01);
    });
    expect(leidos).toEqual([{ planId: expect.any(String), desde: null, precio: { tipo: "sin_precio" }, programado: false }]);
  });

  it("R15: la vigente en `desde` y las posteriores; las anteriores a la vigente no salen", async () => {
    const { planId, leidos } = await revertida(base, async (tx) => {
      const id = await crearPlan(tx);
      await precioDeAlta(tx, id, "31000.00");
      await filaDelHistorial(tx, id, D_2026_01_01, P33);
      await filaDelHistorial(tx, id, D_2027_03_01, P40);
      return { planId: id, leidos: await planesEnTx(tx).preciosQueRigenDesde([id], D_2026_06_01) };
    });
    expect(leidos).toEqual([
      { planId, desde: D_2026_01_01, precio: P33, programado: false },
      { planId, desde: D_2027_03_01, precio: P40, programado: false },
    ]);
  });

  it("R15: una fila con `desde_at` igual a `desde` es la vigente (`<=`), y la anterior ya no sale", async () => {
    const leidos = await revertida(base, async (tx) => {
      const id = await crearPlan(tx);
      await precioDeAlta(tx, id, "31000.00");
      await filaDelHistorial(tx, id, D_2026_06_01, P33);
      return planesEnTx(tx).preciosQueRigenDesde([id], D_2026_06_01);
    });
    expect(leidos.map((l) => l.desde)).toEqual([D_2026_06_01]);
    expect(leidos[0].precio).toEqual(P33);
  });

  it("R15: el precio del cambio programado sale con su `vigente_desde`, marcado como programado", async () => {
    const { planId, leidos } = await revertida(base, async (tx) => {
      const id = await crearPlan(tx);
      await precioDeAlta(tx, id, "31000.00");
      await programar(tx, id, D_2026_11_20, P35);
      return { planId: id, leidos: await planesEnTx(tx).preciosQueRigenDesde([id], D_2026_06_01) };
    });
    expect(leidos).toEqual([
      { planId, desde: null, precio: P31, programado: false },
      { planId, desde: D_2026_11_20, precio: P35, programado: true },
    ]);
  });

  it("solo los planes pedidos: el historial y el programado de otro plan no salen; sin planes, nada", async () => {
    const { pedido, leidos, vacio } = await revertida(base, async (tx) => {
      const pedido = await crearPlan(tx);
      const otro = await crearPlan(tx);
      await precioDeAlta(tx, otro, "99000.00");
      await filaDelHistorial(tx, otro, D_2027_03_01, P40);
      await programar(tx, otro, D_2026_11_20, P35);
      const repo = planesEnTx(tx);
      return { pedido, leidos: await repo.preciosQueRigenDesde([pedido], D_2026_06_01), vacio: await repo.preciosQueRigenDesde([], D_2026_06_01) };
    });
    expect(leidos.map((l) => l.planId)).toEqual([pedido]);
    expect(vacio).toEqual([]);
  });

  it("R25 de punta a punta: el servicio entrega el historial y `precioQueRigeEn` elige el precio de la fecha de efecto", async () => {
    const { planId, r } = await revertida(base, async (tx) => {
      const id = await crearPlan(tx);
      await precioDeAlta(tx, id, "31000.00");
      await programar(tx, id, D_2026_11_20, P35);
      // «Hoy» = 2026-11-06 en la plataforma.
      const servicio = new PlanesService(planesEnTx(tx), () => new Date("2026-11-06T18:00:00.000Z"));
      return { planId: id, r: await servicio.preciosQueRigen(SUPERADMIN, { planIds: [id] }) };
    });
    if (r.estado !== "ok") throw new Error(`no se leyeron los precios: ${JSON.stringify(r)}`);
    const historial = r.precios[planId];
    expect(precioQueRigeEn(historial, "2026-11-19")).toEqual(P31);
    expect(precioQueRigeEn(historial, "2026-11-20")).toEqual(P35);
    expect(precioQueRigeEn(historial, "2026-12-01")).toEqual(P35);
  });
});
