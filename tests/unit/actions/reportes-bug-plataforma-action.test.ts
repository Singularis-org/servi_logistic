import { afterEach, describe, expect, it, vi } from "vitest";
import { RolValue } from "@prisma/client";

import {
  cambiarEstadoReporteBugAction,
  listarReportesBugAction,
  verReporteBugAction,
  type ReportesBugPlataformaDeps,
} from "@/lib/actions/reportes-bug-plataforma";
import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { EXCEPCIONES_DE_PLATAFORMA } from "@/lib/db/excepciones-aislamiento";
import type { IAlmacenImagenesReporte } from "@/lib/interfaces/external/IAlmacenImagenesReporte";
import type { IBugReportRepository } from "@/lib/interfaces/repositories/IBugReportRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IReportesBugPlataformaService } from "@/lib/interfaces/services/IReportesBugPlataformaService";
import { MODULO_POR_ACTION } from "@/lib/modulos/reparto";
import { ReportesBugPlataformaService } from "@/lib/services/ReportesBugPlataformaService";
import {
  ESTADOS_PENDIENTES,
  NOTA_MAX,
  REPORTES_POR_PAGINA,
  RESUMEN_MAX,
  TRANSICIONES_REPORTE,
  cambiarEstadoReporteSchema,
  filtrosReportesSchema,
  resumenDeDescripcion,
  verReporteSchema,
} from "@/lib/types/reporte-bug";

// SLT-97 (design §3, §6; R2, R9, R11, R15, R18, R20) — el borde del módulo de reportes del superadmin,
// con un servicio doble y el actor inyectado: ni sesión ni base. Incluye los casos de los contratos de
// T3 (`lib/types/reporte-bug.ts`). El SQL está en `tests/integration/db/bug-report.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "sa-1", rol: "superadmin" };
const ROLES_DE_EMPRESA: Actor[] = Object.values(RolValue)
  .filter((rol) => !(ROLES_PLATAFORMA as readonly string[]).includes(rol))
  .map((rol) => ({ usuarioId: `u-${rol}`, rol, organizacionId: "org-1" }));

const REPORTE_ID = "6f1c1d5e-2b8a-4c1e-9f3a-1b2c3d4e5f60";
const NOTA_SECRETA = "La clave del cliente es 1234";

function fakeService(overrides: Partial<IReportesBugPlataformaService> = {}) {
  return {
    listar: vi.fn<IReportesBugPlataformaService["listar"]>(async () => ({ status: "ok", items: [], total: 0, pagina: 1 })),
    detalle: vi.fn<IReportesBugPlataformaService["detalle"]>(async () => ({ status: "not_found" })),
    cambiarEstado: vi.fn<IReportesBugPlataformaService["cambiarEstado"]>(async () => ({ status: "ok", estado: "resolved" })),
    ...overrides,
  };
}

function deps(actor: Actor | null, servicio: IReportesBugPlataformaService): ReportesBugPlataformaDeps {
  return { getActor: async () => actor, servicio };
}

/** Las tres actions con una entrada válida, para los barridos de R2. */
const ACCIONES: { nombre: string; llamar: (d: ReportesBugPlataformaDeps) => Promise<{ status: string }> }[] = [
  { nombre: "listar", llamar: (d) => listarReportesBugAction({}, d) },
  { nombre: "ver", llamar: (d) => verReporteBugAction({ reporteId: REPORTE_ID }, d) },
  {
    nombre: "cambiarEstado",
    llamar: (d) => cambiarEstadoReporteBugAction({ reporteId: REPORTE_ID, estado: "resolved", nota: "" }, d),
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SLT-97 — contratos del módulo de reportes (T3)", () => {
  it("P3/P4/R6 — la nota admite 500, las páginas son de 25 y el resumen de 120", () => {
    expect({ NOTA_MAX, REPORTES_POR_PAGINA, RESUMEN_MAX }).toEqual({
      NOTA_MAX: 500,
      REPORTES_POR_PAGINA: 25,
      RESUMEN_MAX: 120,
    });
  });

  it("R5/R7/R17 — pendientes son new e in_review, y las transiciones solo avanzan", () => {
    expect(ESTADOS_PENDIENTES).toEqual(["new", "in_review"]);
    expect(TRANSICIONES_REPORTE).toEqual({
      new: ["in_review", "resolved", "dismissed"],
      in_review: ["resolved", "dismissed"],
      resolved: [],
      dismissed: [],
    });
  });

  it("R5 — sin filtros el estado es pendientes, sin empresa ni fechas, página 1", () => {
    expect(filtrosReportesSchema.parse({})).toEqual({ estado: "pendientes", pagina: 1 });
  });

  it("R7 — el filtro de estado admite las seis opciones", () => {
    for (const estado of ["pendientes", "todos", "new", "in_review", "resolved", "dismissed"]) {
      expect(filtrosReportesSchema.safeParse({ estado }).success).toBe(true);
    }
  });

  it("R9 — las fechas son AAAA-MM-DD de un día que existe, y desde igual a hasta vale", () => {
    expect(filtrosReportesSchema.safeParse({ desde: "2026-02-28", hasta: "2026-02-28" }).success).toBe(true);
    expect(filtrosReportesSchema.safeParse({ desde: "2024-02-29" }).success).toBe(true);
    expect(filtrosReportesSchema.safeParse({ desde: "2026-02-29" }).success).toBe(false);
    expect(filtrosReportesSchema.safeParse({ hasta: "9/11/2026" }).success).toBe(false);
    expect(filtrosReportesSchema.safeParse({ hasta: "2026-11-09T00:00:00Z" }).success).toBe(false);
  });

  it("R8/R15 — la empresa y el id del reporte son uuid; un campo de más se rechaza", () => {
    expect(filtrosReportesSchema.safeParse({ empresa: "no-es-uuid" }).success).toBe(false);
    expect(filtrosReportesSchema.safeParse({ orden: "asc" }).success).toBe(false);
    expect(verReporteSchema.safeParse({ reporteId: "abc" }).success).toBe(false);
    expect(verReporteSchema.safeParse({ reporteId: REPORTE_ID }).success).toBe(true);
  });

  it("R11 — una página no entera es la 1 y una negativa pasa tal cual (la recorta el servicio)", () => {
    expect(filtrosReportesSchema.parse({ pagina: "abc" }).pagina).toBe(1);
    expect(filtrosReportesSchema.parse({ pagina: "2.5" }).pagina).toBe(1);
    expect(filtrosReportesSchema.parse({ pagina: "3" }).pagina).toBe(3);
    expect(filtrosReportesSchema.parse({ pagina: "-2" }).pagina).toBe(-2);
  });

  it("R17 — new nunca es destino de un cambio", () => {
    expect(cambiarEstadoReporteSchema.safeParse({ reporteId: REPORTE_ID, estado: "new" }).success).toBe(false);
    expect(cambiarEstadoReporteSchema.parse({ reporteId: REPORTE_ID, estado: "in_review" })).toEqual({
      reporteId: REPORTE_ID,
      estado: "in_review",
      nota: "",
    });
  });

  it("R6 — el resumen corta en 120 letras y añade «…» solo si cortó, sin partir un emoji", () => {
    expect(resumenDeDescripcion("a".repeat(120))).toBe("a".repeat(120));
    expect(resumenDeDescripcion("a".repeat(121))).toBe(`${"a".repeat(120)}…`);
    expect(resumenDeDescripcion(`${"a".repeat(119)}🐞🐞`)).toBe(`${"a".repeat(119)}🐞…`);
  });
});

describe("SLT-97 — borde del módulo de reportes del superadmin", () => {
  it("R2 — sin sesión da unauthenticated y un rol de empresa forbidden en las tres actions, sin llamar al servicio", async () => {
    for (const { nombre, llamar } of ACCIONES) {
      const anonimo = fakeService();
      expect(await llamar(deps(null, anonimo)), nombre).toEqual({ status: "unauthenticated" });
      for (const actor of ROLES_DE_EMPRESA) {
        const s = fakeService();
        expect(await llamar(deps(actor, s)), `${nombre} ${actor.rol}`).toEqual({ status: "forbidden" });
        expect(s.listar).not.toHaveBeenCalled();
        expect(s.detalle).not.toHaveBeenCalled();
        expect(s.cambiarEstado).not.toHaveBeenCalled();
      }
      expect(anonimo.listar).not.toHaveBeenCalled();
      expect(anonimo.detalle).not.toHaveBeenCalled();
      expect(anonimo.cambiarEstado).not.toHaveBeenCalled();
    }
  });

  it("R2 — a un rol de empresa no se le cuenta el contrato: una entrada inválida también es forbidden", async () => {
    const maestro = ROLES_DE_EMPRESA.find((a) => a.rol === "maestro")!;
    expect(await listarReportesBugAction({ estado: "x" }, deps(maestro, fakeService()))).toEqual({ status: "forbidden" });
    expect(await verReporteBugAction({ reporteId: "x" }, deps(maestro, fakeService()))).toEqual({ status: "forbidden" });
  });

  it("R9 — desde posterior a hasta, 2026-02-30 y un estado desconocido dan validation_error", async () => {
    const entradas = [
      { desde: "2026-11-10", hasta: "2026-11-09" },
      { desde: "2026-02-30" },
      { hasta: "2026-02-30" },
      { estado: "abiertos" },
    ];
    for (const entrada of entradas) {
      const s = fakeService();
      const r = await listarReportesBugAction(entrada, deps(SUPERADMIN, s));
      expect(r.status, JSON.stringify(entrada)).toBe("validation_error");
      expect(s.listar).not.toHaveBeenCalled();
    }
    const invertidas = await listarReportesBugAction({ desde: "2026-11-10", hasta: "2026-11-09" }, deps(SUPERADMIN, fakeService()));
    expect(invertidas).toMatchObject({ status: "validation_error", fieldErrors: { hasta: expect.any(Array) } });
  });

  it("R11 — pagina no numérica es 1", async () => {
    const s = fakeService();
    await listarReportesBugAction({ pagina: "dos" }, deps(SUPERADMIN, s));
    expect(s.listar).toHaveBeenCalledWith(SUPERADMIN, { estado: "pendientes", pagina: 1 });
  });

  it("R10 — los filtros válidos llegan al servicio ya parseados, y la respuesta vuelve tal cual", async () => {
    const empresa = "0b6f0f43-6f1c-4d5e-8a2b-9c3d4e5f6a7b";
    const s = fakeService({
      listar: vi.fn<IReportesBugPlataformaService["listar"]>(async () => ({ status: "ok", items: [], total: 60, pagina: 3 })),
    });
    const r = await listarReportesBugAction(
      { estado: "resolved", empresa, desde: "2026-11-01", hasta: "2026-11-09", pagina: "3" },
      deps(SUPERADMIN, s),
    );
    expect(s.listar).toHaveBeenCalledWith(SUPERADMIN, {
      estado: "resolved",
      empresa,
      desde: "2026-11-01",
      hasta: "2026-11-09",
      pagina: 3,
    });
    expect(r).toEqual({ status: "ok", items: [], total: 60, pagina: 3 });
  });

  it("R15 — un id que no es uuid da validation_error sin llamar al servicio, y not_found pasa tal cual", async () => {
    const s = fakeService();
    expect((await verReporteBugAction({ reporteId: "../etc" }, deps(SUPERADMIN, s))).status).toBe("validation_error");
    expect(s.detalle).not.toHaveBeenCalled();
    expect(await verReporteBugAction({ reporteId: REPORTE_ID }, deps(SUPERADMIN, s))).toEqual({ status: "not_found" });
    expect(s.detalle).toHaveBeenCalledWith(SUPERADMIN, REPORTE_ID);
  });

  it("R18 — transicion_invalida vuelve con el estado actual", async () => {
    const s = fakeService({
      cambiarEstado: vi.fn<IReportesBugPlataformaService["cambiarEstado"]>(async () => ({
        status: "transicion_invalida",
        actual: "resolved",
      })),
    });
    const r = await cambiarEstadoReporteBugAction({ reporteId: REPORTE_ID, estado: "dismissed" }, deps(SUPERADMIN, s));
    expect(r).toEqual({ status: "transicion_invalida", actual: "resolved" });
  });

  it("R20 — una nota de 501 tras recortar da validation_error; 500 con espacios alrededor pasa; solo espacios llega como sin nota", async () => {
    const s = fakeService();
    const larga = await cambiarEstadoReporteBugAction(
      { reporteId: REPORTE_ID, estado: "in_review", nota: ` ${"x".repeat(501)} ` },
      deps(SUPERADMIN, s),
    );
    expect(larga).toMatchObject({ status: "validation_error", fieldErrors: { nota: expect.any(Array) } });
    expect(s.cambiarEstado).not.toHaveBeenCalled();

    const justa = await cambiarEstadoReporteBugAction(
      { reporteId: REPORTE_ID, estado: "in_review", nota: `   ${"x".repeat(500)}\n ` },
      deps(SUPERADMIN, s),
    );
    expect(justa.status).toBe("ok");
    expect(s.cambiarEstado).toHaveBeenCalledWith(SUPERADMIN, {
      reporteId: REPORTE_ID,
      estado: "in_review",
      nota: "x".repeat(500),
    });

    // Con el servicio real y un repositorio doble: lo que llega a guardar es `null`.
    const repo = {
      crear: vi.fn(),
      listar: vi.fn(),
      detalle: vi.fn(),
      cambiarEstado: vi.fn<IBugReportRepository["cambiarEstado"]>(async () => ({ resultado: "ok" })),
    } satisfies IBugReportRepository;
    // SLT-98 (design §7): el constructor gana el almacén de imágenes; cambiar el estado no lo usa.
    const almacen = { prepararSubida: vi.fn(), leer: vi.fn(), firmar: vi.fn(), borrar: vi.fn() } satisfies IAlmacenImagenesReporte;
    const real = new ReportesBugPlataformaService(repo, almacen);
    expect(
      await cambiarEstadoReporteBugAction({ reporteId: REPORTE_ID, estado: "resolved", nota: "   \n " }, deps(SUPERADMIN, real)),
    ).toEqual({ status: "ok", estado: "resolved" });
    expect(repo.cambiarEstado).toHaveBeenCalledWith({
      reporteId: REPORTE_ID,
      destino: "resolved",
      nota: null,
      actorUsuarioId: "sa-1",
    });
  });

  it("un fallo del servicio es error y el log lleva la operación y el nombre de la causa, nunca la nota", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const falla = new Error(`violates check constraint: ${NOTA_SECRETA}`);
    falla.name = "PrismaClientKnownRequestError";
    const s = fakeService({
      listar: vi.fn<IReportesBugPlataformaService["listar"]>(async () => Promise.reject(falla)),
      detalle: vi.fn<IReportesBugPlataformaService["detalle"]>(async () => Promise.reject(falla)),
      cambiarEstado: vi.fn<IReportesBugPlataformaService["cambiarEstado"]>(async () => Promise.reject(falla)),
    });
    expect(await listarReportesBugAction({}, deps(SUPERADMIN, s))).toEqual({ status: "error" });
    expect(await verReporteBugAction({ reporteId: REPORTE_ID }, deps(SUPERADMIN, s))).toEqual({ status: "error" });
    expect(
      await cambiarEstadoReporteBugAction(
        { reporteId: REPORTE_ID, estado: "resolved", nota: NOTA_SECRETA },
        deps(SUPERADMIN, s),
      ),
    ).toEqual({ status: "error" });
    const lineas = log.mock.calls.map((c) => String(c[0]));
    expect(lineas).toHaveLength(3);
    for (const l of lineas) {
      expect(l).toMatch(/^\[reportes-bug-plataforma\] fallo .+ causa=PrismaClientKnownRequestError$/);
      expect(l).not.toContain(NOTA_SECRETA);
    }
  });

  it("es de núcleo y no está en EXCEPCIONES_DE_PLATAFORMA: el comoPlataforma lo abre el repositorio", () => {
    expect(MODULO_POR_ACTION["reportes-bug-plataforma"]).toBe("nucleo");
    expect(EXCEPCIONES_DE_PLATAFORMA.map((e) => e.archivo)).not.toContain("lib/actions/reportes-bug-plataforma.ts");
  });
});
