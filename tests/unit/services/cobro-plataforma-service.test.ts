import { describe, it, expect, vi } from "vitest";
import { RolValue } from "@prisma/client";

import type { ICobroPlataformaTarifaRepository } from "@/lib/interfaces/repositories/ICobroPlataformaTarifaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroPlataformaService } from "@/lib/services/CobroPlataformaService";
import { MENSAJE_MONTO_COBRO_INVALIDO } from "@/lib/types/cobro-plataforma";

// SL-40 T5 — la configuración del cobro por orden con un repositorio doble (R4–R7). El servicio usa
// el `esPlataforma` REAL: es lo que se prueba en R6. El SQL (que la escritura toca una sola empresa)
// lo prueba `tests/integration/db/empresas-plataforma-cobro.test.ts`. SLT-126 R2: solo quedan las dos
// operaciones del valor global.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };

// Los roles de empresa salen del enum generado: un rol de empresa nuevo queda cubierto sin tocar esto.
const ROLES_DE_EMPRESA = (Object.values(RolValue) as RolValue[]).filter((rol) => rol !== "superadmin");

const ORG = "00000000-0000-4000-8000-000000000040";

function repoDoble(opciones: { global?: string | null } = {}) {
  const leerGlobal = vi.fn<ICobroPlataformaTarifaRepository["leerGlobal"]>(async () => opciones.global ?? null);
  const fijarGlobal = vi.fn<ICobroPlataformaTarifaRepository["fijarGlobal"]>(async () => {});
  const repo: ICobroPlataformaTarifaRepository = { leerGlobal, fijarGlobal };
  const llamadas = () => leerGlobal.mock.calls.length + fijarGlobal.mock.calls.length;
  return { repo, leerGlobal, fijarGlobal, llamadas };
}

describe("SL-40 R6 / SLT-126 R2 — solo el superadmin, y el rechazo va antes de la base", () => {
  it("el censo de roles de empresa no está vacío (si lo estuviera, el it.each no probaría nada)", () => {
    expect(ROLES_DE_EMPRESA.length).toBeGreaterThanOrEqual(6);
  });

  it.each(ROLES_DE_EMPRESA)("el rol %s recibe forbidden en las dos operaciones sin ninguna llamada al repositorio", async (rol) => {
    const d = repoDoble();
    const s = new CobroPlataformaService(d.repo);
    const actor: Actor = { usuarioId: "u-1", rol, organizacionId: ORG };

    expect(await s.verGlobal(actor)).toEqual({ status: "forbidden" });
    expect(await s.fijarGlobal(actor, { monto: "500.00" })).toEqual({ status: "forbidden" });
    expect(d.llamadas()).toBe(0);
  });

  it("sin actor también es forbidden, sin llamadas", async () => {
    const d = repoDoble();
    const s = new CobroPlataformaService(d.repo);

    expect(await s.verGlobal(null)).toEqual({ status: "forbidden" });
    expect(await s.fijarGlobal(null, { monto: "500.00" })).toEqual({ status: "forbidden" });
    expect(d.llamadas()).toBe(0);
  });

  it("un rol de empresa con una entrada inválida recibe forbidden, no validation_error", async () => {
    const d = repoDoble();
    const s = new CobroPlataformaService(d.repo);
    const maestro: Actor = { usuarioId: "u-1", rol: "maestro", organizacionId: ORG };

    expect(await s.fijarGlobal(maestro, { monto: "-1" })).toEqual({ status: "forbidden" });
  });
});

describe("SL-40 R1/R9 — el superadmin lee y fija el valor global", () => {
  it("lee el global tal cual viene de la base, como texto", async () => {
    const d = repoDoble({ global: "500.00" });
    expect(await new CobroPlataformaService(d.repo).verGlobal(SUPERADMIN)).toEqual({
      status: "ok",
      cobroGlobal: { monto: "500.00" },
    });
  });

  it("sin global configurado, monto null (la pantalla dice «sin configurar (0,00)»)", async () => {
    const d = repoDoble({ global: null });
    expect(await new CobroPlataformaService(d.repo).verGlobal(SUPERADMIN)).toEqual({
      status: "ok",
      cobroGlobal: { monto: null },
    });
  });

  it("fija el global con el texto validado", async () => {
    const d = repoDoble();
    expect(await new CobroPlataformaService(d.repo).fijarGlobal(SUPERADMIN, { monto: "600.00" })).toEqual({ status: "ok" });
    expect(d.fijarGlobal).toHaveBeenCalledExactlyOnceWith("600.00");
  });
});

describe("SL-40 R4 — validation_error con el campo, sin escribir nada", () => {
  it.each(["-1", "1.001", "10000000000", "", "abc"])("el global %j no se escribe", async (monto) => {
    const d = repoDoble();
    const r = await new CobroPlataformaService(d.repo).fijarGlobal(SUPERADMIN, { monto });

    expect(r).toEqual({ status: "validation_error", fieldErrors: { monto: [MENSAJE_MONTO_COBRO_INVALIDO] } });
    expect(d.llamadas()).toBe(0);
  });

  it("un número en vez de texto no se escribe", async () => {
    const d = repoDoble();
    const r = await new CobroPlataformaService(d.repo).fijarGlobal(SUPERADMIN, { monto: 500 });
    expect(r.status).toBe("validation_error");
    expect(d.llamadas()).toBe(0);
  });
});

describe("SLT-126 R2 — no hay operación que fije o quite el cobro por orden de una empresa", () => {
  it("el servicio expone solo verGlobal y fijarGlobal", () => {
    const s = new CobroPlataformaService(repoDoble().repo);
    const metodos = Object.getOwnPropertyNames(CobroPlataformaService.prototype).filter((n) => n !== "constructor");

    expect(metodos.sort()).toEqual(["fijarGlobal", "verGlobal"]);
    expect("fijarDeEmpresa" in s).toBe(false);
  });

});
