import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { apiKeysYaPasadas, ordenesYaPasadas, rolYaPasado } from "@/lib/planes/mensajes";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO, TopeExcedido } from "@/lib/types/planes";

// SLT-58 (design §11.4; R29, R30, R31, R36, R37, R42) — la fecha de inicio del ciclo en la primera
// asignación y su vista previa, con un repositorio doble y el reloj fijo. Lo que se mide aquí es el
// borde: el rango con el reloj del servicio, «solo en la primera asignación» y que ningún rechazo
// llegue al repositorio. El SQL (ancla, ciclo corto, uso, triggers, carrera) se mide contra Postgres
// en `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const EMPRESA = randomUUID();
const OTRA = randomUUID();
const PLAN = randomUUID();

const ROLES_DE_EMPRESA: RolValue[] = ["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"];

/** 2026-10-29 12:00 en la plataforma (−06:00). Hoy = 2026-10-29; rango 2026-09-29 … 2026-11-29. */
const AHORA = new Date("2026-10-29T18:00:00.000Z");

function plan(extra: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: PLAN,
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: 2, porRol: { adminTienda: 2 }, apiKeys: 1 },
    modulos: ["analitica"],
    // SLT-66 R28: el plan que se asigna tiene costo concreto (design §9.3); lo que se afirma no cambia.
    precio: { tipo: "monto", mensual: "1000.00", anual: null },
    costoPorOrden: "100.00",
    archivado: false,
    ...extra,
  };
}

const AVISOS: TopeExcedido[] = [
  { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "ordenes", usados: 3, maximo: 2 },
  { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "adminTienda", usados: 3, maximo: 2 },
  { organizacionId: EMPRESA, empresa: "Mensajería Uno", tope: "api_keys", usados: 2, maximo: 1 },
];

function doble() {
  return {
    empresa: vi.fn<IPlanesRepository["empresa"]>(async (id) => ({ id, nombre: "Mensajería Uno", planId: null })),
    plan: vi.fn<IPlanesRepository["plan"]>(async () => plan()),
    crear: vi.fn<IPlanesRepository["crear"]>(async () => PLAN),
    editar: vi.fn<IPlanesRepository["editar"]>(async () => ({ estado: "not_found" })),
    archivar: vi.fn<IPlanesRepository["archivar"]>(async () => ({ estado: "not_found" })),
    asignar: vi.fn<IPlanesRepository["asignar"]>(async () => ({ estado: "ok", cambio: true, avisos: [] })),
    vistaPreviaAsignacion: vi.fn<IPlanesRepository["vistaPreviaAsignacion"]>(async () => ({
      avisos: [],
      siguienteCiclo: new Date("2026-11-29T18:00:00.000Z"),
    })),
    cancelarCambio: vi.fn<IPlanesRepository["cancelarCambio"]>(async () => ({ estado: "not_found" })),
    programarCambio: vi.fn<IPlanesRepository["programarCambio"]>(async () => ({ estado: "not_found" })),
    aplicarCambioProgramado: vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(async () => ({ estado: "sin_pendiente" })),
    cambiosVencidos: vi.fn<IPlanesRepository["cambiosVencidos"]>(async () => []),
    repartirRecordatorio: vi.fn<IPlanesRepository["repartirRecordatorio"]>(async () => ({ estado: "sin_pendiente" })),
    destinatariosDelAviso: vi.fn<IPlanesRepository["destinatariosDelAviso"]>(async () => null),
    asignables: vi.fn<IPlanesRepository["asignables"]>(async () => []),
    publicos: vi.fn<IPlanesRepository["publicos"]>(async () => []),
    catalogo: vi.fn<IPlanesRepository["catalogo"]>(async () => []),
    detalle: vi.fn<IPlanesRepository["detalle"]>(async () => null),
    planDeEmpresa: vi.fn<IPlanesRepository["planDeEmpresa"]>(async () => null),
  } satisfies IPlanesRepository;
}

let repo: ReturnType<typeof doble>;

function servicioA(ahora: Date): PlanesService {
  return new PlanesService(repo, () => ahora);
}

function llamadasAlRepositorio(): number {
  return Object.values(repo).reduce((n, f) => n + f.mock.calls.length, 0);
}

const asignar = (inicioCiclo?: unknown, ahora = AHORA) =>
  servicioA(ahora).asignar(
    SUPERADMIN,
    inicioCiclo === undefined ? { organizacionId: EMPRESA, planId: PLAN } : { organizacionId: EMPRESA, planId: PLAN, inicioCiclo },
  );

const previsualizar = (inicioCiclo: unknown, actor: Actor | null = SUPERADMIN, ahora = AHORA) =>
  servicioA(ahora).previsualizarAsignacion(actor, { organizacionId: EMPRESA, planId: PLAN, inicioCiclo });

beforeEach(() => {
  repo = doble();
});

describe("SLT-58 — R29: la fecha de inicio es opcional; sin ella, SL-24 R9", () => {
  it("sin fecha, el repositorio recibe «sin fecha»: la llamada de SL-24 con tres argumentos", async () => {
    expect(await asignar()).toEqual({ estado: "ok", planId: PLAN, cambio: true, avisos: [], vigenteDesde: null });
    expect(repo.asignar).toHaveBeenCalledTimes(1);
    expect(repo.asignar.mock.calls[0]).toEqual([EMPRESA, PLAN, "u-sa"]);
    expect(repo.asignar.mock.calls[0]).toHaveLength(3);
  });

  it("con «hoy», el ancla es el instante de la asignación (P9); con otra fecha, sus 00:00 de la plataforma", async () => {
    await asignar("2026-10-29");
    expect(repo.asignar).toHaveBeenLastCalledWith(EMPRESA, PLAN, "u-sa", { fecha: "2026-10-29", ancla: "ahora" });
    await asignar("2026-10-14");
    expect(repo.asignar).toHaveBeenLastCalledWith(EMPRESA, PLAN, "u-sa", {
      fecha: "2026-10-14",
      ancla: new Date("2026-10-14T06:00:00.000Z"),
    });
    await asignar("2026-11-05");
    expect(repo.asignar).toHaveBeenLastCalledWith(EMPRESA, PLAN, "u-sa", {
      fecha: "2026-11-05",
      ancla: new Date("2026-11-05T06:00:00.000Z"),
    });
  });

  it("«hoy» es la fecha de la plataforma, no la UTC: a las 23:00 del 29 en la plataforma ya es 30 en UTC", async () => {
    const tarde = new Date("2026-10-30T05:00:00.000Z");
    await asignar("2026-10-29", tarde);
    expect(repo.asignar).toHaveBeenLastCalledWith(EMPRESA, PLAN, "u-sa", { fecha: "2026-10-29", ancla: "ahora" });
  });
});

describe("SLT-58 — R30: el rango lo valida el servicio con su reloj, sin llamar al repositorio", () => {
  const RANGO = ["Elige una fecha entre el 2026-09-29 y el 2026-11-29."];

  it.each([
    ["hoy − 1 mes entra", "2026-09-29"],
    ["hoy + 1 mes entra", "2026-11-29"],
  ])("%s", async (_c, fecha) => {
    expect((await asignar(fecha)).estado).toBe("ok");
    expect(repo.asignar).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["el día anterior a hoy − 1 mes", "2026-09-28"],
    ["el día siguiente a hoy + 1 mes", "2026-11-30"],
  ])("%s → validation_error en inicioCiclo, cero llamadas", async (_c, fecha) => {
    expect(await asignar(fecha)).toEqual({ estado: "validation_error", fieldErrors: { inicioCiclo: RANGO } });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("hoy 31 de marzo: el límite pasado es el 28 de febrero (año normal) y el 29 (bisiesto)", async () => {
    const marzo = new Date("2026-03-31T18:00:00.000Z");
    expect((await asignar("2026-02-28", marzo)).estado).toBe("ok");
    expect(await asignar("2026-02-27", marzo)).toEqual({
      estado: "validation_error",
      fieldErrors: { inicioCiclo: ["Elige una fecha entre el 2026-02-28 y el 2026-04-30."] },
    });
    const bisiesto = new Date("2028-03-31T18:00:00.000Z");
    expect((await asignar("2028-02-29", bisiesto)).estado).toBe("ok");
    expect((await asignar("2028-02-28", bisiesto)).estado).toBe("validation_error");
    expect(repo.asignar).toHaveBeenCalledTimes(2);
  });

  it.each([["2026-02-30"], ["ayer"], ["2026-10-29T00:00"], [20261029]])(
    "%s no es una fecha AAAA-MM-DD válida → validation_error en inicioCiclo, cero llamadas",
    async (fecha) => {
      const r = await asignar(fecha);
      expect(r.estado).toBe("validation_error");
      if (r.estado === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["inicioCiclo"]);
      expect(llamadasAlRepositorio()).toBe(0);
    },
  );
});

describe("SLT-58 — R31: la fecha solo en la primera asignación", () => {
  const SOLO = { estado: "validation_error", fieldErrors: { inicioCiclo: ["La fecha de inicio solo se elige en la primera asignación."] } };

  it("empresa con plan + fecha → validation_error sin llamar a asignar (tampoco con el mismo plan)", async () => {
    repo.empresa.mockResolvedValue({ id: EMPRESA, nombre: "Mensajería Uno", planId: randomUUID() });
    expect(await asignar("2026-10-29")).toEqual(SOLO);
    repo.empresa.mockResolvedValue({ id: EMPRESA, nombre: "Mensajería Uno", planId: PLAN });
    expect(await asignar("2026-10-29")).toEqual(SOLO);
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it("cambiar de plan sin fecha sigue como SL-24 (P2a)", async () => {
    repo.empresa.mockResolvedValue({ id: EMPRESA, nombre: "Mensajería Uno", planId: randomUUID() });
    expect((await asignar()).estado).toBe("ok");
    expect(repo.asignar.mock.calls[0]).toEqual([EMPRESA, PLAN, "u-sa"]);
  });

  it("carrera: si el repositorio, bajo cerrojo, ve que ya tenía plan, su validation_error llega tal cual", async () => {
    repo.asignar.mockResolvedValueOnce({ estado: "validation_error", fieldErrors: { inicioCiclo: ["x"] } });
    expect(await asignar("2026-10-29")).toEqual({ estado: "validation_error", fieldErrors: { inicioCiclo: ["x"] } });
  });
});

describe("SLT-58 — R36, R42: los topes ya pasados viajan en `avisos` del ok", () => {
  it("órdenes, un rol y las API keys pasados: ok con los tres avisos", async () => {
    repo.asignar.mockResolvedValueOnce({ estado: "ok", cambio: true, avisos: AVISOS });
    expect(await asignar("2026-10-14")).toEqual({
      estado: "ok",
      planId: PLAN,
      cambio: true,
      avisos: AVISOS,
      vigenteDesde: null,
    });
  });
});

describe("SLT-58 — R37: vista previa de la primera asignación", () => {
  it.each(ROLES_DE_EMPRESA)("%s → forbidden, cero llamadas", async (rol) => {
    expect(await previsualizar("2026-10-29", { usuarioId: "u", rol, organizacionId: EMPRESA })).toEqual({ estado: "forbidden" });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("sin sesión → forbidden, cero llamadas", async () => {
    expect(await previsualizar("2026-10-29", null)).toEqual({ estado: "forbidden" });
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("fecha fuera de rango o inválida → validation_error, cero llamadas", async () => {
    expect(await previsualizar("2026-11-30")).toEqual({
      estado: "validation_error",
      fieldErrors: { inicioCiclo: ["Elige una fecha entre el 2026-09-29 y el 2026-11-29."] },
    });
    expect((await previsualizar("2026-02-30")).estado).toBe("validation_error");
    expect((await previsualizar(undefined)).estado).toBe("validation_error");
    expect(llamadasAlRepositorio()).toBe(0);
  });

  it("R31: empresa con plan → validation_error, sin leer la vista previa", async () => {
    repo.empresa.mockResolvedValue({ id: EMPRESA, nombre: "Mensajería Uno", planId: randomUUID() });
    expect(await previsualizar("2026-10-29")).toEqual({
      estado: "validation_error",
      fieldErrors: { inicioCiclo: ["La fecha de inicio solo se elige en la primera asignación."] },
    });
    expect(repo.vistaPreviaAsignacion).not.toHaveBeenCalled();
  });

  it("existe, archivado y custom de otra empresa, como asignar", async () => {
    repo.plan.mockResolvedValueOnce(null);
    expect(await previsualizar("2026-10-29")).toEqual({ estado: "not_found" });
    repo.plan.mockResolvedValueOnce(plan({ archivado: true }));
    expect(await previsualizar("2026-10-29")).toEqual({ estado: "archivado" });
    repo.plan.mockResolvedValueOnce(plan({ visibilidad: "custom", organizacionId: OTRA }));
    expect(await previsualizar("2026-10-29")).toEqual({ estado: "custom_de_otra_empresa" });
    repo.vistaPreviaAsignacion.mockResolvedValueOnce(null);
    expect(await previsualizar("2026-10-29")).toEqual({ estado: "not_found" });
    expect(repo.vistaPreviaAsignacion).toHaveBeenCalledTimes(1);
  });

  it("ok: los avisos del repositorio y el siguiente ciclo como fecha de la plataforma (P10)", async () => {
    repo.vistaPreviaAsignacion.mockResolvedValueOnce({ avisos: AVISOS, siguienteCiclo: new Date("2026-11-14T06:00:00.000Z") });
    expect(await previsualizar("2026-10-14")).toEqual({ estado: "ok", avisos: AVISOS, siguienteCiclo: "2026-11-14" });
    expect(repo.vistaPreviaAsignacion).toHaveBeenCalledWith(EMPRESA, PLAN, {
      fecha: "2026-10-14",
      ancla: new Date("2026-10-14T06:00:00.000Z"),
    });
    expect(repo.asignar).not.toHaveBeenCalled();
  });

  it("textos de los avisos (design §6.5, P15)", () => {
    expect(ordenesYaPasadas("3.200", "3.000", "2026-11-14")).toBe(
      "La empresa ya lleva 3.200 de 3.000 órdenes en este ciclo: no podrá crear más hasta 2026-11-14.",
    );
    expect(rolYaPasado("3", "2", "adminTienda")).toBe(
      "La empresa ya tiene 3 de 2 Admin de tienda: no podrá activar ni crear más hasta bajar del tope.",
    );
    expect(apiKeysYaPasadas("2", "1")).toBe(
      "La empresa ya tiene 2 de 1 API keys activas: no podrá crear ni activar más hasta bajar del tope.",
    );
  });
});
