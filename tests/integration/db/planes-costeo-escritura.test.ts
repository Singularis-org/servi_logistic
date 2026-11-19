import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput } from "@/lib/types/planes";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { planesEnTx, revertida } from "./_fixtures/planes";

// SLT-66 (design §4.2; R11) — el costo por orden contra Postgres, con `PlanesService` y
// `PlanesRepository` REALES: crear y programar lo guardan con la versión; `plan_rastro` deja antes y
// después como texto con dos decimales; una edición sin cambio real no escribe; aplicar el programado deja
// la columna. Todo en una transacción que se revierte. SLT-135: ya no hay edición inmediata; editar con
// F = hoy programa y, sin empresas, lo aplica la siguiente pasada de la cola (`aplicarCambioProgramado`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 2026-10-31 12:00 UTC = 06:00 en la plataforma. */
const AHORA = new Date("2026-10-31T12:00:00.000Z");
/** SLT-135: el día de `AHORA` en la plataforma, la F de una edición que rige hoy. */
const HOY = "2026-10-31";
/** 2026-12-01 a las 00:00 de la plataforma (−06:00), más un minuto: ya rige. */
const YA_RIGE = new Date("2026-12-01T06:01:00.000Z");

let base: PrismaClient;

function entrada(costoPorOrden: string | null): CrearPlanInput {
  return {
    nombre: `slt66 ${randomUUID().slice(0, 8)}`,
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: { admin: 2 }, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "50000", descuentos: {} },
    costoPorOrden,
    costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
  };
}

async function preparar(tx: TxDeTest, costoPorOrden: string | null) {
  await fijarEmpresa(tx, "");
  const servicio = new PlanesService(planesEnTx(tx), () => AHORA);
  const e = entrada(costoPorOrden);
  const creado = await servicio.crear(SUPERADMIN, e);
  if (creado.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(creado)}`);
  const { visibilidad: _v, organizacionId: _o, ...version } = e;
  void _v;
  void _o;
  const editar = (cambio: { costoPorOrden: string | null }, vigenteDesde: string = HOY) =>
    servicio.editar(SUPERADMIN, { planId: creado.planId, ...version, ...cambio, vigenteDesde });
  /** SLT-135: edita con F = hoy y la cola lo aplica en su siguiente pasada (el plan no tiene empresas). */
  const editarYAplicar = async (cambio: { costoPorOrden: string | null }) => {
    const res = await editar(cambio);
    const pendiente = await tx.planCambioProgramado.findUnique({ where: { planId: creado.planId }, select: { id: true } });
    if (pendiente !== null) {
      const aplicado = await planesEnTx(tx).aplicarCambioProgramado({ planId: creado.planId, cambioId: pendiente.id }, AHORA);
      if (aplicado.estado !== "aplicado") throw new Error(`aplicar: ${JSON.stringify(aplicado)}`);
    }
    return res;
  };
  return { planId: creado.planId, editar, editarYAplicar };
}

async function columna(tx: TxDeTest, planId: string): Promise<string | null> {
  const p = await tx.plan.findUniqueOrThrow({ where: { id: planId }, select: { costoPorOrden: true } });
  return p.costoPorOrden === null ? null : p.costoPorOrden.toFixed(2);
}

async function rastro(tx: TxDeTest, planId: string) {
  const filas = await tx.planRastro.findMany({
    where: { planId },
    select: { accion: true, cambios: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return filas.map((f) => ({ accion: f.accion, costoPorOrden: (f.cambios as Record<string, unknown>).costoPorOrden }));
}

describeSiHayBase("SLT-66 R11 — el costo por orden se guarda con la versión del plan", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("crear lo guarda en la columna y en el rastro de alta, como texto con dos decimales", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, "100");
      const sinCosto = await preparar(tx, null);
      return {
        columna: await columna(tx, p.planId),
        rastro: await rastro(tx, p.planId),
        columnaSinCosto: await columna(tx, sinCosto.planId),
        rastroSinCosto: await rastro(tx, sinCosto.planId),
      };
    });
    expect(r.columna).toBe("100.00");
    expect(r.rastro).toEqual([{ accion: "creado", costoPorOrden: { antes: null, despues: "100.00" } }]);
    expect(r.columnaSinCosto).toBeNull();
    expect(r.rastroSinCosto).toEqual([{ accion: "creado", costoPorOrden: { antes: null, despues: null } }]);
  });

  it("editar con F hoy lo cambia y deja antes y después; vaciarlo también es un cambio", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, "100");
      const cambio = await p.editarYAplicar({ costoPorOrden: "150.5" });
      const despues = await columna(tx, p.planId);
      const vaciado = await p.editarYAplicar({ costoPorOrden: null });
      return { cambio, despues, vaciado, final: await columna(tx, p.planId), rastro: await rastro(tx, p.planId) };
    });
    expect(r.cambio).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: HOY });
    expect(r.despues).toBe("150.50");
    expect(r.vaciado).toMatchObject({ estado: "ok", cambio: true });
    expect(r.final).toBeNull();
    // SLT-135: el antes y el después quedan en la fila `cambio_aplicado` de cada cambio.
    expect(r.rastro.filter((f) => f.accion === "cambio_aplicado")).toEqual([
      { accion: "cambio_aplicado", costoPorOrden: { antes: "100.00", despues: "150.50" } },
      { accion: "cambio_aplicado", costoPorOrden: { antes: "150.50", despues: null } },
    ]);
  });

  it("una edición sin cambio real («100» = «100.00») no escribe rastro", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, "100.00");
      const editado = await p.editar({ costoPorOrden: "100" });
      return { editado, rastro: await rastro(tx, p.planId) };
    });
    expect(r.editado).toMatchObject({ estado: "ok", cambio: false });
    expect(r.rastro.map((f) => f.accion)).toEqual(["creado"]);
  });

  it("programarlo no toca la columna; aplicar el programado la deja con el costo nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, "100");
      const programado = await p.editar({ costoPorOrden: "80" }, "2026-12-01");
      const enEspera = await columna(tx, p.planId);
      const pendiente = await tx.planCambioProgramado.findUniqueOrThrow({
        where: { planId: p.planId },
        select: { id: true, version: true },
      });
      const aplicado = await planesEnTx(tx).aplicarCambioProgramado(
        { planId: p.planId, cambioId: pendiente.id },
        YA_RIGE,
      );
      return {
        programado,
        enEspera,
        version: pendiente.version,
        aplicado,
        final: await columna(tx, p.planId),
        rastro: await rastro(tx, p.planId),
      };
    });
    expect(r.programado).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: "2026-12-01" });
    expect(r.enEspera).toBe("100.00");
    expect(r.version).toMatchObject({ costoPorOrden: "80" });
    expect(r.aplicado).toMatchObject({ estado: "aplicado" });
    expect(r.final).toBe("80.00");
    expect(r.rastro.find((f) => f.accion === "cambio_aplicado")?.costoPorOrden).toEqual({
      antes: "100.00",
      despues: "80.00",
    });
  });
});
