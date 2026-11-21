import type { JobTipo } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { contextoActual } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa } from "@/lib/db/para-cada-empresa";
import { permisoEnMoraActual } from "@/lib/db/permiso-en-mora";
import type { JobConEmpresa } from "@/lib/interfaces/repositories/IJobRepository";

// SLT-121 (design §6.1, decision P1; R17) — con la empresa congelada, la cola y los crons siguen corriendo
// para ella. Los dos unicos sitios por donde un trabajo entra en una empresa (`conSuEmpresa` y
// `paraCadaEmpresa`) conceden el permiso `sistema`; lo que corre como plataforma no lo necesita (el dueno no
// pasa por el bloqueo) y no lo lleva.

// La puerta de modulos real, con todo encendido: aqui no se prueba un modulo apagado.
vi.mock("@/lib/repositories/ModulosActivosRepository", () => ({
  ModulosActivosRepository: class {
    async activos() {
      return [];
    }
  },
}));

const { conSuEmpresa } = await import("@/app/api/cron/procesar-jobs/route");

const AHORA = new Date("2026-11-20T06:30:00.000Z");

function job(tipo: JobTipo, organizacionId: string | null): JobConEmpresa {
  return {
    id: "j-1",
    tipo,
    payload: {},
    estado: "processing",
    intentos: 1,
    maxIntentos: 5,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    organizacionId,
  };
}

type Visto = { permiso: string | null; contexto: string | null };

function espia() {
  const vistos: Visto[] = [];
  const anotar = () => {
    const ctx = contextoActual();
    vistos.push({
      permiso: permisoEnMoraActual(),
      contexto: ctx === undefined ? null : ctx.tipo === "empresa" ? ctx.organizacionId : "plataforma",
    });
  };
  return { vistos, anotar };
}

const empresas = (ids: string[], listados: (string | null)[] = []) => ({
  organizacion: {
    findMany: async () => {
      listados.push(permisoEnMoraActual());
      return ids.map((id) => ({ id }));
    },
  },
});

describe("R17 — conSuEmpresa: todo trabajo con empresa corre con el permiso sistema", () => {
  it("un trabajo por evento con empresa", async () => {
    const { vistos, anotar } = espia();
    await conSuEmpresa(async () => anotar(), false)(job("mora_aviso_correo", "org-a"));
    expect(vistos).toEqual([{ permiso: "sistema", contexto: "org-a" }]);
    expect(permisoEnMoraActual()).toBeNull();
  });

  it("un recurrente sin empresa corre por paraCadaEmpresa, cada empresa con el permiso", async () => {
    const { vistos, anotar } = espia();
    await conSuEmpresa(async () => anotar(), true, { empresas: empresas(["org-a", "org-b"]) })(
      job("liberar_reprogramadas", null),
    );
    expect(vistos).toEqual([
      { permiso: "sistema", contexto: "org-a" },
      { permiso: "sistema", contexto: "org-b" },
    ]);
  });

  it("un trabajo sin empresa y por evento corre como plataforma, sin permiso (no lo necesita)", async () => {
    const { vistos, anotar } = espia();
    await conSuEmpresa(async () => anotar(), false)(job("factura_plataforma_cerrar", null));
    expect(vistos).toEqual([{ permiso: null, contexto: "plataforma" }]);
  });
});

describe("R17 — paraCadaEmpresa: cada empresa con el permiso, el listado sin el", () => {
  it("lista como plataforma sin permiso y corre cada empresa con sistema", async () => {
    const { vistos, anotar } = espia();
    const listados: (string | null)[] = [];
    const resumen = await paraCadaEmpresa(async () => anotar(), { cliente: empresas(["org-a", "org-b"], listados) });
    expect(resumen.ok).toEqual(["org-a", "org-b"]);
    expect(listados).toEqual([null]);
    expect(vistos.map((v) => v.permiso)).toEqual(["sistema", "sistema"]);
  });

  it("una empresa que falla no deja el permiso puesto para la siguiente ni fuera", async () => {
    const vistos: (string | null)[] = [];
    const resumen = await paraCadaEmpresa(
      async (id) => {
        vistos.push(permisoEnMoraActual());
        if (id === "org-a") throw new Error("falla");
      },
      { cliente: empresas(["org-a", "org-b"]) },
    );
    expect(resumen.fallidas.map((f) => f.organizacionId)).toEqual(["org-a"]);
    expect(vistos).toEqual(["sistema", "sistema"]);
    expect(permisoEnMoraActual()).toBeNull();
  });
});
