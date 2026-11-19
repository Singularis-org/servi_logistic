import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { TopeExcedido } from "@/lib/types/planes";

// SLT-144 (design §3.1; R22) — la vista previa del cambio de un plan, con un repositorio doble: el orden del contrato
// (quién → zod → el plan existe) y la fecha de cada empresa que sale de `fechaDeRecepcion`. Que esa fecha y los
// avisos son los que deja programar se mide contra Postgres en `tests/integration/db/planes-previsualizar-cambio.test.ts`.
// SLT-135 (R13): F es obligatoria; ya no hay vista previa «De inmediato».

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const PLAN = randomUUID();
const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];
const TOPES = { porRol: { admin: 1 }, apiKeys: null };
const AHORA = new Date("2026-10-28T12:00:00.000Z");

const AVISO: TopeExcedido = { organizacionId: "e-q", empresa: "Quincenal", tope: "admin", usados: 2, maximo: 1 };

function doble() {
  return {
    vistaPreviaCambio: vi.fn<IPlanesRepository["vistaPreviaCambio"]>(async () => ({
      empresas: [
        { id: "e-a", nombre: "Anual", tipoCobro: "anual" },
        { id: "e-b", nombre: "Bimestral", tipoCobro: "bimestral" },
        { id: "e-m", nombre: "Mensual", tipoCobro: "mensual" },
        { id: "e-q", nombre: "Quincenal", tipoCobro: "quincenal" },
      ],
      avisos: [AVISO],
    })),
  };
}

let repo: ReturnType<typeof doble>;
let servicio: PlanesService;

beforeEach(() => {
  repo = doble();
  // Solo `vistaPreviaCambio`: si el servicio llamara a otro método del repositorio, el test fallaría al no existir.
  servicio = new PlanesService(repo as unknown as IPlanesRepository, () => AHORA);
});

const recibeEl = async (vigenteDesde: string) => {
  const r = await servicio.previsualizarCambio(SUPERADMIN, { planId: PLAN, vigenteDesde, topes: TOPES });
  if (r.estado !== "ok") throw new Error(JSON.stringify(r));
  return Object.fromEntries(r.empresas.map((e) => [e.tipoCobro, e.recibeEl]));
};

describe("PlanesService.previsualizarCambio (SLT-144)", () => {
  it.each([null, ...ROLES_DE_EMPRESA])("R22: forbidden por rol sin llamar al repositorio (%s)", async (rol) => {
    const actor: Actor | null = rol === null ? null : { usuarioId: "u", rol, organizacionId: randomUUID() };
    const r = await servicio.previsualizarCambio(actor, { planId: PLAN, vigenteDesde: "2026-11-16", topes: TOPES });
    expect(r).toEqual({ estado: "forbidden" });
    expect(repo.vistaPreviaCambio).not.toHaveBeenCalled();
  });

  it("R22: forbidden también con una entrada inválida: quién va antes que zod", async () => {
    const actor: Actor = { usuarioId: "u", rol: "maestro", organizacionId: randomUUID() };
    expect(await servicio.previsualizarCambio(actor, { planId: "x" })).toEqual({ estado: "forbidden" });
    expect(repo.vistaPreviaCambio).not.toHaveBeenCalled();
  });

  it.each([
    ["planId no uuid", { planId: "no-uuid", vigenteDesde: "2026-11-16", topes: TOPES }, "planId"],
    ["fecha imposible", { planId: PLAN, vigenteDesde: "2026-02-31", topes: TOPES }, "vigenteDesde"],
    ["sin vigenteDesde", { planId: PLAN, topes: TOPES }, "vigenteDesde"],
    ["topes con un rol desconocido", { planId: PLAN, vigenteDesde: "2026-11-16", topes: { porRol: { superadmin: 1 }, apiKeys: null } }, "topes.porRol.superadmin"],
    ["campo de más", { planId: PLAN, vigenteDesde: "2026-11-16", topes: TOPES, extra: 1 }, "_"],
  ])("R22: entrada inválida (%s) → validation_error sin llamar al repositorio", async (_caso, input, campo) => {
    const r = await servicio.previsualizarCambio(SUPERADMIN, input);
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toContain(campo);
    expect(repo.vistaPreviaCambio).not.toHaveBeenCalled();
  });

  it("R22: plan inexistente → not_found", async () => {
    repo.vistaPreviaCambio.mockResolvedValueOnce(null);
    const r = await servicio.previsualizarCambio(SUPERADMIN, { planId: PLAN, vigenteDesde: "2026-11-16", topes: TOPES });
    expect(r).toEqual({ estado: "not_found" });
    expect(repo.vistaPreviaCambio).toHaveBeenCalledWith(PLAN, TOPES);
  });

  it("R21: devuelve las empresas en el orden del repositorio, con su tipo, y los avisos tal cual", async () => {
    const r = await servicio.previsualizarCambio(SUPERADMIN, { planId: PLAN, vigenteDesde: "2026-11-16", topes: TOPES });
    expect(r).toEqual({
      estado: "ok",
      empresas: [
        { empresaId: "e-a", empresa: "Anual", tipoCobro: "anual", recibeEl: "2027-01-01" },
        { empresaId: "e-b", empresa: "Bimestral", tipoCobro: "bimestral", recibeEl: "2027-01-01" },
        { empresaId: "e-m", empresa: "Mensual", tipoCobro: "mensual", recibeEl: "2026-12-01" },
        { empresaId: "e-q", empresa: "Quincenal", tipoCobro: "quincenal", recibeEl: "2026-11-16" },
      ],
      avisos: [AVISO],
    });
  });

  it("recibeEl: quincenal con F a mitad de quincena pasa al inicio de la siguiente; en su inicio, ese mismo día", async () => {
    expect((await recibeEl("2026-11-10")).quincenal).toBe("2026-11-16");
    expect((await recibeEl("2026-11-20")).quincenal).toBe("2026-12-01");
    expect((await recibeEl("2026-12-01")).quincenal).toBe("2026-12-01");
  });

  it("recibeEl: mensual con F a mitad de mes pasa al 1 del siguiente; el día 1, ese mismo día", async () => {
    expect((await recibeEl("2026-11-16")).mensual).toBe("2026-12-01");
    expect((await recibeEl("2026-12-01")).mensual).toBe("2026-12-01");
  });

  // SLT-135 (R13): sustituye «con F null no hay fechas»: sin F no hay vista previa y no se lee nada.
  it("R13: sin fecha es validation_error", async () => {
    for (const input of [{ planId: PLAN, vigenteDesde: null, topes: TOPES }, { planId: PLAN, topes: TOPES }]) {
      const r = await servicio.previsualizarCambio(SUPERADMIN, input);
      expect(r.estado).toBe("validation_error");
      if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["vigenteDesde"]);
    }
    expect(repo.vistaPreviaCambio).not.toHaveBeenCalled();
  });

  it("R13: con F, cada empresa lleva siempre una fecha", async () => {
    const r = await servicio.previsualizarCambio(SUPERADMIN, { planId: PLAN, vigenteDesde: "2026-10-28", topes: TOPES });
    expect(r.estado === "ok" && r.empresas.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.recibeEl))).toBe(true);
  });

  it("no mira el rango de F: una F pasada también se previsualiza (lo decide confirmar)", async () => {
    expect((await recibeEl("2026-01-10")).mensual).toBe("2026-02-01");
  });
});
