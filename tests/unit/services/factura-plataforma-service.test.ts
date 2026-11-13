import { describe, expect, it } from "vitest";

import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { FacturaPlataformaService } from "@/lib/services/FacturaPlataformaService";
import type { DetalleDeFactura, FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";

// SLT-119 · T2.2 (design §4; R1, R13, R14, R15) — el servicio de las facturas con un repositorio doble que
// FALLA si se le llama cuando no toca. Lo que se mide: quién (R13) y la entrada (R15) van antes que la base, un
// `null` del repositorio es `not_found` (R14) y la lista sale de la más reciente a la más antigua (R1). El SQL
// (qué factura y qué líneas ve cada empresa) lo mide `tests/integration/db/factura-plataforma-detalle.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };
const SUPERADMIN: Actor = { usuarioId: "u-super", rol: "superadmin" };

const EMPRESA = "0b7c6a2e-5d1f-4e3a-9c8b-1a2b3c4d5e6f";
const FACTURA = "6f5e4d3c-2b1a-4c9d-8e7f-a1b2c3d4e5f6";

function factura(id: string, desde: string, estado: FacturaPlataformaDTO["estado"] = "cerrada"): FacturaPlataformaDTO {
  return {
    id,
    estado,
    numero: estado === "cerrada" ? 1 : null,
    desde: new Date(desde),
    hasta: new Date(new Date(desde).getTime() + 15 * 86_400_000),
    hastaPrevisto: estado === "en_curso",
    periodicidad: "quincenal",
    plan: null,
    cargos: "0.00",
    reversos: "0.00",
    movimientos: 0,
    totalOrdenes: "0.00",
    cuota: null,
    primeraCuota: null,
    total: "0.00",
    cerradaAt: null,
  };
}

/** Lo que el repositorio da: por `desde` ascendente, las no cerradas al final (SLT-118 `deLaEmpresa`). */
const DEL_REPO = [
  factura("f-1", "2026-10-01T06:00:00.000Z"),
  factura("f-2", "2026-10-16T06:00:00.000Z"),
  factura("f-3", "2026-11-01T06:00:00.000Z", "por_cerrar"),
  factura("f-4", "2026-11-16T06:00:00.000Z", "en_curso"),
];

const DETALLE: DetalleDeFactura = {
  factura: DEL_REPO[0],
  lineas: { lineas: [], pagina: 1, porPagina: 100, total: 0 },
};

type Metodo = keyof IFacturaPlataformaRepository;

/** El repositorio doble: cuenta y anota cada llamada; si `prohibido`, cualquier llamada lanza. */
class RepoDoble implements IFacturaPlataformaRepository {
  readonly llamadas: { metodo: Metodo; args: unknown[] }[] = [];
  constructor(
    private readonly opciones: { prohibido?: boolean; detalle?: DetalleDeFactura | null } = {},
  ) {}

  private anotar(metodo: Metodo, args: unknown[]): void {
    if (this.opciones.prohibido) throw new Error(`el repositorio no debía leerse: ${metodo}`);
    this.llamadas.push({ metodo, args });
  }

  async empresasACerrar(): Promise<string[]> {
    this.anotar("empresasACerrar", []);
    return [];
  }
  async cerrar(organizacionId: string, ahora: Date): Promise<number> {
    this.anotar("cerrar", [organizacionId, ahora]);
    return 0;
  }
  async deLaEmpresa(): Promise<FacturaPlataformaDTO[]> {
    this.anotar("deLaEmpresa", []);
    return [...DEL_REPO];
  }
  async deEmpresaParaPlataforma(organizacionId: string): Promise<FacturaPlataformaDTO[]> {
    this.anotar("deEmpresaParaPlataforma", [organizacionId]);
    return [...DEL_REPO];
  }
  async detalleDeLaEmpresa(facturaId: string, pagina: number): Promise<DetalleDeFactura | null> {
    this.anotar("detalleDeLaEmpresa", [facturaId, pagina]);
    return this.opciones.detalle === undefined ? DETALLE : this.opciones.detalle;
  }
  async detalleParaPlataforma(organizacionId: string, facturaId: string, pagina: number): Promise<DetalleDeFactura | null> {
    this.anotar("detalleParaPlataforma", [organizacionId, facturaId, pagina]);
    return this.opciones.detalle === undefined ? DETALLE : this.opciones.detalle;
  }
}

function servicioProhibido() {
  return new FacturaPlataformaService(new RepoDoble({ prohibido: true }));
}

describe("SLT-119 — FacturaPlataformaService: quién, la entrada y el orden (R1, R13, R14, R15)", () => {
  describe("R13: la vía del maestro (su empresa)", () => {
    it.each([
      ["sin sesión", null],
      ["el admin de la empresa", ADMIN],
      ["el superadmin por la vía del maestro", SUPERADMIN],
      ["un mensajero", { usuarioId: "u-m", rol: "mensajero" } as Actor],
    ])("R13: %s pide la lista o el detalle de su empresa → forbidden sin leer la base", async (_, actor) => {
      const s = servicioProhibido();
      await expect(s.deMiEmpresa(actor)).resolves.toEqual({ estado: "forbidden" });
      await expect(s.detalleDeMiEmpresa(actor, { facturaId: FACTURA })).resolves.toEqual({ estado: "forbidden" });
    });

    it("R13: el maestro lee la lista de su empresa (sin empresa en la entrada) y el detalle con la página pedida", async () => {
      const repo = new RepoDoble();
      const s = new FacturaPlataformaService(repo);
      expect((await s.deMiEmpresa(MAESTRO)).estado).toBe("ok");
      await expect(s.detalleDeMiEmpresa(MAESTRO, { facturaId: FACTURA, pagina: 3 })).resolves.toEqual({ estado: "ok", detalle: DETALLE });
      expect(repo.llamadas).toEqual([
        { metodo: "deLaEmpresa", args: [] },
        { metodo: "detalleDeLaEmpresa", args: [FACTURA, 3] },
      ]);
    });

    it("R15: sin página, el detalle del maestro pide la 1", async () => {
      const repo = new RepoDoble();
      await new FacturaPlataformaService(repo).detalleDeMiEmpresa(MAESTRO, { facturaId: FACTURA });
      expect(repo.llamadas).toEqual([{ metodo: "detalleDeLaEmpresa", args: [FACTURA, 1] }]);
    });
  });

  describe("R13: la vía del superadmin (la empresa que nombra)", () => {
    it.each([
      ["sin sesión", null],
      ["el maestro por la vía del superadmin", MAESTRO],
      ["el admin de la empresa", ADMIN],
    ])("R13: %s pide la lista o el detalle de una empresa por su id → forbidden sin leer la base", async (_, actor) => {
      const s = servicioProhibido();
      await expect(s.deEmpresa(actor, { organizacionId: EMPRESA })).resolves.toEqual({ estado: "forbidden" });
      await expect(s.detalleDeEmpresa(actor, { organizacionId: EMPRESA, facturaId: FACTURA })).resolves.toEqual({
        estado: "forbidden",
      });
    });

    it("R13: el superadmin lee la lista y el detalle de la empresa que nombra", async () => {
      const repo = new RepoDoble();
      const s = new FacturaPlataformaService(repo);
      expect((await s.deEmpresa(SUPERADMIN, { organizacionId: EMPRESA })).estado).toBe("ok");
      await expect(s.detalleDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA, facturaId: FACTURA, pagina: 2 })).resolves.toEqual({
        estado: "ok",
        detalle: DETALLE,
      });
      expect(repo.llamadas).toEqual([
        { metodo: "deEmpresaParaPlataforma", args: [EMPRESA] },
        { metodo: "detalleParaPlataforma", args: [EMPRESA, FACTURA, 2] },
      ]);
    });

    it("R15 (lista): una empresa que no es uuid lanza sin leer la base (la lista no tiene validation_error, design §3)", async () => {
      await expect(servicioProhibido().deEmpresa(SUPERADMIN, { organizacionId: "no-es-uuid" })).rejects.toThrow();
    });
  });

  describe("R15: la entrada del detalle, antes que la base", () => {
    it.each([
      ["facturaId no uuid", { facturaId: "abc" }, "facturaId"],
      ["sin facturaId", {}, "facturaId"],
      ["página 0", { facturaId: FACTURA, pagina: 0 }, "pagina"],
      ["página negativa", { facturaId: FACTURA, pagina: -1 }, "pagina"],
      ["página no entera", { facturaId: FACTURA, pagina: 1.5 }, "pagina"],
      ["página en texto", { facturaId: FACTURA, pagina: "2" }, "pagina"],
    ])("R15: maestro, %s → validation_error sin leer la base", async (_, input, campo) => {
      const r = await servicioProhibido().detalleDeMiEmpresa(MAESTRO, input);
      expect(r.estado).toBe("validation_error");
      if (r.estado === "validation_error") expect(Object.keys(r.errores)).toContain(campo);
    });

    it.each([
      ["organizacionId no uuid", { organizacionId: "empresa-1", facturaId: FACTURA }, "organizacionId"],
      ["facturaId no uuid", { organizacionId: EMPRESA, facturaId: "f-1" }, "facturaId"],
      ["página 0", { organizacionId: EMPRESA, facturaId: FACTURA, pagina: 0 }, "pagina"],
    ])("R15: superadmin, %s → validation_error sin leer la base", async (_, input, campo) => {
      const r = await servicioProhibido().detalleDeEmpresa(SUPERADMIN, input);
      expect(r.estado).toBe("validation_error");
      if (r.estado === "validation_error") expect(Object.keys(r.errores)).toContain(campo);
    });

    it("R15: una entrada que no es un objeto → validation_error sin leer la base", async () => {
      expect((await servicioProhibido().detalleDeMiEmpresa(MAESTRO, "x")).estado).toBe("validation_error");
      expect((await servicioProhibido().detalleDeEmpresa(SUPERADMIN, null)).estado).toBe("validation_error");
    });
  });

  describe("R14: una factura que no es de la empresa", () => {
    it("R14: el repositorio da null (no es de su empresa) → not_found, sin ningún dato, por las dos vías", async () => {
      const s = new FacturaPlataformaService(new RepoDoble({ detalle: null }));
      await expect(s.detalleDeMiEmpresa(MAESTRO, { facturaId: FACTURA })).resolves.toEqual({ estado: "not_found" });
      await expect(s.detalleDeEmpresa(SUPERADMIN, { organizacionId: EMPRESA, facturaId: FACTURA })).resolves.toEqual({
        estado: "not_found",
      });
    });
  });

  describe("R1: el orden de la lista", () => {
    it("R1: de la más reciente a la más antigua, también para el superadmin; no toca la lista del repositorio", async () => {
      const s = new FacturaPlataformaService(new RepoDoble());
      const delMaestro = await s.deMiEmpresa(MAESTRO);
      const delSuper = await s.deEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
      const ids = (r: typeof delMaestro) => (r.estado === "ok" ? r.facturas.map((f) => f.id) : []);
      expect(ids(delMaestro)).toEqual(["f-4", "f-3", "f-2", "f-1"]);
      expect(ids(delSuper)).toEqual(["f-4", "f-3", "f-2", "f-1"]);
      expect(DEL_REPO.map((f) => f.id)).toEqual(["f-1", "f-2", "f-3", "f-4"]);
    });

    it("R1: una empresa sin facturas → ok con la lista vacía", async () => {
      const repo = new RepoDoble();
      repo.deLaEmpresa = async () => [];
      await expect(new FacturaPlataformaService(repo).deMiEmpresa(MAESTRO)).resolves.toEqual({ estado: "ok", facturas: [] });
    });
  });
});
