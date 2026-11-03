import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { EmpresasPlataformaRepository } from "@/lib/repositories/EmpresasPlataformaRepository";
import type { EmpresaListada } from "@/lib/types/empresas-plataforma";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConTransaccionAnidada, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { asignarPlan, crearPlan, revertida } from "./_fixtures/planes";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-66 (design §6.4, §3.2, §9.1; R31, R32) — el listado de «Empresas» trae el plan de cada empresa y
// su cobro vigente.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// R31: `cobroVigente` es lo que se cobraría hoy por una orden nueva, con su fuente. Se afirma por su
// efecto (§3.2): para cada empresa, lo que dice el listado es el monto y la fuente del cargo de una orden
// creada justo después, en la misma transacción. Una regla propia en el repositorio (p. ej. la vieja
// `excepción ?? global`) se ve en la empresa con plan y sin excepción.
//
// R32: `plan` es `{ id, nombre }` del plan asignado, o `null`.
//
// Cada caso corre en una transacción del dueño que se revierte. El valor global se fija bajo el lock de
// SL-40 (`tomarTarifaGlobal`) y se deja como estaba.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const GLOBAL = "500.00";

let base: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;

/** Una orden viva de la empresa fijada, por `INSERT` directo: el cargo lo escribe el trigger. */
async function cargoDeUnaOrdenNueva(tx: TxDeTest, organizacionId: string): Promise<{ monto: string; fuente: string }[]> {
  await fijarEmpresa(tx, organizacionId);
  const fks = await crearFksDeOrden(tx);
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
                          "provincia_id", "canton_id", "producto", "updated_at", "created_at")
     VALUES ($1, $2, $3, 'Destinatario SLT-66', '88880000', $4, $5, $6, $7, 'Caja', now(), now() AT TIME ZONE 'UTC')`,
    id,
    `SLT66-${randomUUID().slice(0, 12)}`,
    fks.estatusId,
    fks.tiendaId,
    fks.zonaId,
    fks.provinciaId,
    fks.cantonId,
  );
  return tx.$queryRawUnsafe<{ monto: string; fuente: string }[]>(
    `SELECT "monto"::text AS monto, "fuente"::text AS fuente FROM "cobro_plataforma_movimiento"
      WHERE "orden_id" = $1 AND "tipo" = 'cargo'`,
    id,
  );
}

/** Un plan de base «monto» con el costo por orden pedido, asignado a la empresa. */
async function conPlan(tx: TxDeTest, organizacionId: string, costoPorOrden: string | null): Promise<{ id: string; nombre: string }> {
  const id = await crearPlan(tx, { custom: organizacionId });
  const plan = await tx.plan.update({
    where: { id },
    data: { precioMensual: "1000.00", costoPorOrden },
    select: { id: true, nombre: true },
  });
  await asignarPlan(tx, organizacionId, id);
  return plan;
}

function fila(listado: EmpresaListada[], id: string): EmpresaListada {
  const f = listado.find((e) => e.id === id);
  if (f === undefined) throw new Error(`el listado no trae la empresa ${id}`);
  return f;
}

interface Caso {
  listado: Pick<EmpresaListada, "plan" | "cobroVigente" | "cobroPorOrden">;
  plan: { id: string; nombre: string } | null;
  cargo: { monto: string; fuente: string }[];
}

describeSiHayBase("SLT-66 — el listado de «Empresas»: plan y cobro vigente (R31, R32)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    tarifaGlobal = await tomarTarifaGlobal();
    await tarifaGlobal.fijar(GLOBAL);
  }, 60_000);

  afterAll(async () => {
    await tarifaGlobal?.soltar();
    await base?.$disconnect();
  });

  /**
   * Cuatro empresas: A con plan de 100 («plan»), B con ese mismo tipo de plan y una excepción de 80
   * («empresa»), C con un plan sin costo por orden («global») y D sin plan («global»). Lee el listado y,
   * después, crea una orden por empresa y lee su cargo.
   */
  async function cuatroEmpresas(tx: TxDeTest): Promise<Record<"A" | "B" | "C" | "D", Caso>> {
    const ids = {
      A: (await crearOrganizacion(tx)).id,
      B: (await crearOrganizacion(tx)).id,
      C: (await crearOrganizacion(tx)).id,
      D: (await crearOrganizacion(tx)).id,
    };
    const planes = {
      A: await conPlan(tx, ids.A, "100.00"),
      B: await conPlan(tx, ids.B, "100.00"),
      C: await conPlan(tx, ids.C, null),
      D: null,
    };
    await tx.organizacion.update({ where: { id: ids.B }, data: { cobroPlataformaPorOrden: "80.00" } });

    const listado = await new EmpresasPlataformaRepository(clienteConTransaccionAnidada(tx)).listar();
    const resultado = {} as Record<"A" | "B" | "C" | "D", Caso>;
    for (const k of ["A", "B", "C", "D"] as const) {
      const f = fila(listado, ids[k]);
      resultado[k] = {
        listado: { plan: f.plan, cobroVigente: f.cobroVigente, cobroPorOrden: f.cobroPorOrden },
        plan: planes[k],
        cargo: await cargoDeUnaOrdenNueva(tx, ids[k]),
      };
    }
    return resultado;
  }

  it("R31, §3.2: por cada fuente, el cobro vigente del listado es el cargo de una orden creada justo después", async () => {
    const r = await revertida(base, cuatroEmpresas);
    const esperado = {
      A: { monto: "100.00", fuente: "plan" },
      B: { monto: "80.00", fuente: "empresa" },
      C: { monto: GLOBAL, fuente: "global" },
      D: { monto: GLOBAL, fuente: "global" },
    } as const;
    for (const k of ["A", "B", "C", "D"] as const) {
      expect(r[k].cargo, `cargo de ${k}`).toEqual([esperado[k]]);
      expect(r[k].listado.cobroVigente, `listado de ${k}`).toEqual(esperado[k]);
    }
  });

  it("R31: la excepción sigue saliendo aparte en cobroPorOrden (la edición de la celda no cambia)", async () => {
    const r = await revertida(base, cuatroEmpresas);
    expect(r.B.listado.cobroPorOrden).toBe("80.00");
    expect(r.A.listado.cobroPorOrden).toBeNull();
    expect(r.D.listado.cobroPorOrden).toBeNull();
  });

  it("R32: plan trae id y nombre del plan asignado, o null sin plan", async () => {
    const r = await revertida(base, cuatroEmpresas);
    for (const k of ["A", "B", "C"] as const) {
      expect(r[k].plan).not.toBeNull();
      expect(r[k].listado.plan, `plan de ${k}`).toEqual(r[k].plan);
    }
    expect(r.D.listado.plan).toBeNull();
  });

  it("R31: sin valor global ni plan con costo, la fuente es sin_configurar con 0.00, como el cargo", async () => {
    await tarifaGlobal?.fijar(null);
    try {
      const r = await revertida(base, async (tx) => {
        const { id } = await crearOrganizacion(tx);
        const listado = await new EmpresasPlataformaRepository(clienteConTransaccionAnidada(tx)).listar();
        return { listado: fila(listado, id), cargo: await cargoDeUnaOrdenNueva(tx, id) };
      });
      const esperado = { monto: "0.00", fuente: "sin_configurar" };
      expect(r.cargo).toEqual([esperado]);
      expect(r.listado.cobroVigente).toEqual(esperado);
      expect(r.listado.plan).toBeNull();
    } finally {
      await tarifaGlobal?.fijar(GLOBAL);
    }
  });
});
