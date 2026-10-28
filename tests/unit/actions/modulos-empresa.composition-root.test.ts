import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-23 · T6 (design §5.2) — EL COMPOSITION ROOT PASA EL REPOSITORIO REAL, no solo lo importa
// (precedente SL-40 §5). Se mockea solo `getPrismaClient`, con un cliente falso que responde lo que el
// repositorio REAL le pide, y se llaman la action y la lectura reales sin servicio inyectado. Si el
// root montara el servicio con otro repositorio, o con ninguno, el cliente falso no vería las llamadas.

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const MAESTRO: Actor = { usuarioId: "u-m", rol: "maestro", organizacionId: "org-a" };
const EMPRESA = randomUUID();

const organizacionFindUnique = vi.fn(async () => ({ id: EMPRESA, nombre: "Mensajería Uno" }));
const moduloFindMany = vi.fn(async () => [{ modulo: "ranking" }]);
const txCreateMany = vi.fn(async () => ({ count: 1 }));
const txHistorialCreateMany = vi.fn(async () => ({ count: 1 }));
const txUsuarioFindUnique = vi.fn(async () => ({
  nombre: "Sara",
  primerApellido: "Admin",
  rol: { value: "superadmin" },
}));
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    organizacionModulo: { createMany: txCreateMany },
    historialAccion: { createMany: txHistorialCreateMany },
    usuario: { findUnique: txUsuarioFindUnique },
  }),
);

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    organizacion: { findUnique: organizacionFindUnique },
    organizacionModulo: { findMany: moduloFindMany },
    $transaction: transaction,
  }),
  PRISMA_OMIT: {},
}));

const { fijarModuloEmpresaAction } = await import("@/lib/actions/modulos-empresa");
const { verModulosEmpresa } = await import("@/lib/actions/_shared/modulos-empresa");

beforeEach(() => vi.clearAllMocks());

describe("SL-23 — el composition root de modulos-empresa pasa ModulosEmpresaRepository", () => {
  it("fijarModuloEmpresaAction, sin deps.service, enciende por el repositorio real y registra la acción", async () => {
    const r = await fijarModuloEmpresaAction(
      { organizacionId: EMPRESA, modulo: "monitoreo", activo: true },
      { getActor: async () => SUPERADMIN },
    );
    expect(r).toEqual({ estado: "ok", cambio: true });
    expect(organizacionFindUnique).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    const [{ data, skipDuplicates }] = txCreateMany.mock.calls[0] as unknown as [{ data: { organizacionId: string; modulo: string }[]; skipDuplicates: boolean }];
    expect(skipDuplicates).toBe(true);
    expect(data).toMatchObject([{ organizacionId: EMPRESA, modulo: "monitoreo" }]);
    // Anti-vacuidad: la fila del historial solo puede salir del repositorio real.
    const [{ data: filas }] = txHistorialCreateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown>[] }];
    expect(filas).toEqual([
      expect.objectContaining({
        accion: "modulo_activado",
        entidadTipo: "organizacion_modulo",
        entidadEtiqueta: "Monitoreo",
        valorNuevo: "monitoreo",
        organizacionId: EMPRESA,
        actorUsuarioId: "u-sa",
        actorRol: "superadmin",
      }),
    ]);
  });

  it("verModulosEmpresa, sin servicio inyectado, lee la empresa y sus módulos por el repositorio real", async () => {
    const r = await verModulosEmpresa(SUPERADMIN, { organizacionId: EMPRESA });
    if (r.estado !== "ok") throw new Error(`se esperaba ok: ${r.estado}`);
    expect(r.empresa.nombre).toBe("Mensajería Uno");
    expect(r.empresa.modulos.filter((m) => m.activo).map((m) => m.clave)).toEqual(["ranking"]);
    expect(moduloFindMany).toHaveBeenCalledTimes(1);
    expect(moduloFindMany.mock.calls[0] as unknown[]).toEqual([{ where: { organizacionId: EMPRESA }, select: { modulo: true } }]);
  });

  it("un maestro recibe forbidden y el cliente no se toca", async () => {
    expect(
      await fijarModuloEmpresaAction({ organizacionId: EMPRESA, modulo: "ranking", activo: false }, { getActor: async () => MAESTRO }),
    ).toEqual({ estado: "forbidden" });
    expect(await verModulosEmpresa(MAESTRO, { organizacionId: EMPRESA })).toEqual({ estado: "forbidden" });
    expect(organizacionFindUnique).not.toHaveBeenCalled();
    expect(moduloFindMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
