import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { EmpresasPlataformaRepository } from "@/lib/repositories/EmpresasPlataformaRepository";
import type { EmpresaListada } from "@/lib/types/empresas-plataforma";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConTransaccionAnidada, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import {
  asignar,
  condicionDe,
  crearEmpresa,
  crearOrden,
  crearPlanConCosto,
  movimientos,
} from "./_fixtures/cobro-porcentual";
import { revertida } from "./_fixtures/planes";

// SLT-83 (design §4.3, §6.3; R22) — la columna «Cobro por orden» del listado de «Empresas» con un plan
// porcentual. El listado lee la MISMA `cobro_plataforma_tarifa_de` que el trigger de alta (SLT-66 §3.2):
// se afirma lo que dice el listado y, además, lo que hace una orden creada justo después (congela esas
// condiciones o se carga el fijo). Todo como dueño en una transacción que se revierte.
// SLT-126: sin valor propio de la empresa; se quitó el caso «la excepción gana al porcentual».

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const GLOBAL = "500.00";

let base: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;

function fila(listado: EmpresaListada[], id: string): EmpresaListada {
  const f = listado.find((e) => e.id === id);
  if (f === undefined) throw new Error(`el listado no trae la empresa ${id}`);
  return f;
}

describeSiHayBase("SLT-83 R22 — el cobro vigente del listado de «Empresas» con un plan porcentual", () => {
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
   * A: plan al 2 % con mínimo 500. B: plan al 2,35 % sin mínimo. D: plan fijo de 100 (no cambia).
   * Lee el listado y después crea una orden de 100.000 por empresa.
   */
  async function tresEmpresas(tx: TxDeTest) {
    const a = await crearEmpresa(tx);
    const b = await crearEmpresa(tx);
    const d = await crearEmpresa(tx);
    const conMinimo = await crearPlanConCosto(tx, { pct: "2", minimo: "500" });
    await asignar(tx, a, conMinimo);
    await asignar(tx, b, await crearPlanConCosto(tx, { pct: "2.35", minimo: null }));
    await asignar(tx, d, await crearPlanConCosto(tx, { fijo: "100" }));

    const listado = await new EmpresasPlataformaRepository(clienteConTransaccionAnidada(tx)).listar();
    const resultado: Record<string, { listado: EmpresaListada["cobroVigente"]; condicion: unknown; movimientos: unknown }> = {};
    for (const [k, e] of Object.entries({ A: a, B: b, D: d })) {
      const orden = await crearOrden(tx, e, { montoCobrar: "100000" });
      resultado[k] = {
        listado: fila(listado, e.id).cobroVigente,
        condicion: await condicionDe(tx, orden),
        movimientos: await movimientos(tx, orden),
      };
    }
    return resultado;
  }

  it("R22: con plan porcentual el listado dice porcentaje y mínimo «del plan», lo mismo que congela la orden", async () => {
    const r = await revertida(base, tresEmpresas);
    expect(r.A.listado).toEqual({ modo: "porcentual", porcentaje: "2.00", minimo: "500.00", fuente: "plan" });
    expect(r.A.condicion).toEqual({ porcentaje: "2.00", minimo: "500.00" });
    expect(r.A.movimientos).toEqual([]);
  });

  it("R22: sin mínimo, el mínimo es null", async () => {
    const r = await revertida(base, tresEmpresas);
    expect(r.B.listado).toEqual({ modo: "porcentual", porcentaje: "2.35", minimo: null, fuente: "plan" });
    expect(r.B.condicion).toEqual({ porcentaje: "2.35", minimo: null });
  });

  it("R22, R29: un plan fijo sigue saliendo como hoy, con su modo", async () => {
    const r = await revertida(base, tresEmpresas);
    expect(r.D.listado).toEqual({ modo: "fijo", monto: "100.00", fuente: "plan" });
    expect(r.D.movimientos).toEqual([{ tipo: "cargo", fuente: "plan", monto: "100.00", secuencia: 1 }]);
  });

  it("R22, R29: una empresa sin plan lee el global fijo", async () => {
    const r = await revertida(base, async (tx) => {
      const { id } = await crearOrganizacion(tx);
      const listado = await new EmpresasPlataformaRepository(clienteConTransaccionAnidada(tx)).listar();
      return fila(listado, id).cobroVigente;
    });
    expect(r).toEqual({ modo: "fijo", monto: GLOBAL, fuente: "global" });
  });
});
