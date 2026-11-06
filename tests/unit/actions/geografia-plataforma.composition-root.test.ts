import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";

// SL-20 (T4.3, T4.6; design §5) — EL COMPOSITION ROOT DE LA GEOGRAFÍA DEL SUPERADMIN, EJERCITADO DE
// VERDAD (memoria «el composition root que no inyecta»). Se mockea `getPrismaClient` con un cliente
// falso y se llama a cada action REAL sin servicio inyectado: si un root se quedara sin un
// repositorio (el de órdenes del conteo, el de geografía de la carga), la llamada lanzaría en vez de
// llegar al cliente.

const SUPERADMIN: Actor = { usuarioId: "u-super", rol: ROLES_PLATAFORMA[0] };

const ordenCount = vi.fn<(args: { where: Record<string, unknown> }) => Promise<number>>(async () => 7);
const provinciaFindMany = vi.fn<(args: { where: Record<string, unknown> }) => Promise<never[]>>(async () => []);
// SLT-44 (design §10, «cambian de entrada, no de salida»): el arbol del superadmin sale del catalogo
// del pais (`nodo_geografico`), no de `provincia.findMany`. El aserto del `where` por pais mira ahora
// esa consulta; la salida (un pais sin nodos -> arbol vacio) no cambia.
const nodoGeograficoFindMany = vi.fn<(args: { where: Record<string, unknown> }) => Promise<never[]>>(async () => []);
const tipoNivelFindMany = vi.fn<(args: { where: Record<string, unknown> }) => Promise<never[]>>(async () => []);
const paisFindMany = vi.fn(async () => []);
const paisFindUnique = vi.fn<(args: { where: { id: string } }) => Promise<{ nombre: string } | null>>(async () => null);
const paisUpdateMany = vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 1 }));
const historialCreateMany = vi.fn<(args: { data: unknown[] }) => Promise<{ count: number }>>(async () => ({ count: 1 }));
const usuarioFindUnique = vi.fn(async () => ({ nombre: "Super", primerApellido: "Admin", rol: { value: "superadmin" } }));

const cliente = {
  orden: { count: ordenCount },
  provincia: { findMany: provinciaFindMany },
  canton: {},
  distrito: {},
  pais: { findMany: paisFindMany, findUnique: paisFindUnique, updateMany: paisUpdateMany },
  historialPlataforma: { createMany: historialCreateMany },
  usuario: { findUnique: usuarioFindUnique },
  organizacion: {},
  nodoGeografico: { findMany: nodoGeograficoFindMany },
  tipoNivelGeografico: { findMany: tipoNivelFindMany },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(cliente)),
};

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => cliente,
  PRISMA_OMIT: {},
}));

const acciones = await import("@/lib/actions/geografia-plataforma");
const deps = { getActor: async () => SUPERADMIN };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SL-20 — cada action del superadmin, sin servicio inyectado, llega al cliente real", () => {
  it("R31: el conteo usa el repositorio de órdenes (el SEGUNDO argumento del root)", async () => {
    const r = await acciones.contarOrdenesSinEntregarAction({ nivel: "canton", id: "c-1" }, deps);
    expect(r).toEqual({ status: "ok", ordenes: 7 });
    expect(ordenCount).toHaveBeenCalledTimes(1);
    expect(ordenCount.mock.calls[0][0].where).toMatchObject({ cantonId: "c-1", deletedAt: null });
  });

  it("el árbol de un país lee las provincias de ESE país", async () => {
    const r = await acciones.arbolDePaisAction({ paisId: "XA" }, deps);
    expect(r).toEqual({ status: "ok", provincias: [] });
    expect(nodoGeograficoFindMany.mock.calls[0][0].where).toEqual({ paisId: "XA" });
    expect(tipoNivelFindMany.mock.calls[0][0].where).toEqual({ paisId: "XA" });
  });

  it("la lista de países llega a `pais.findMany`", async () => {
    expect(await acciones.listarPaisesAction(deps)).toEqual({ status: "ok", paises: [] });
    expect(paisFindMany).toHaveBeenCalledTimes(1);
  });

  it("la carga CSV llega al repositorio de geografía: un país que no está es `not_found`", async () => {
    const fd = new FormData();
    fd.set("paisId", "XZ");
    fd.set("archivo", new File(["nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3\nA,,B,,,\n"], "d.csv"));
    expect(await acciones.cargarDivisionAction(fd, deps)).toEqual({ status: "not_found" });
    expect(paisFindUnique.mock.calls.some(([a]) => a.where.id === "XZ")).toBe(true);
  });

  it("R47 (T4.6): la disponibilidad abre UNA transacción, cambia el país y escribe su fila en el historial de plataforma", async () => {
    paisFindUnique.mockResolvedValueOnce({ nombre: "Costa Rica" });
    const r = await acciones.cambiarDisponibilidadPaisAction({ id: "CR", disponible: false }, deps);

    expect(r).toEqual({ status: "ok", id: "CR", disponible: false });
    expect(cliente.$transaction).toHaveBeenCalledTimes(1);
    expect(paisUpdateMany).toHaveBeenCalledWith({ where: { id: "CR", disponible: { not: false } }, data: { disponible: false } });
    expect(historialCreateMany).toHaveBeenCalledTimes(1);
    expect(historialCreateMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        accion: "pais_disponibilidad_desactivada",
        entidadTipo: "pais",
        entidadId: "CR",
        entidadEtiqueta: "Costa Rica",
        paisId: "CR",
        actorUsuarioId: "u-super",
        actorNombre: "Super Admin",
      }),
    ]);
  });

  it("R47: pedir el estado que el país ya tiene es `ok` y NO escribe historial", async () => {
    paisUpdateMany.mockResolvedValueOnce({ count: 0 });
    paisFindUnique.mockResolvedValueOnce({ nombre: "Costa Rica" });
    const r = await acciones.cambiarDisponibilidadPaisAction({ id: "CR", disponible: true }, deps);
    expect(r).toEqual({ status: "ok", id: "CR", disponible: true });
    expect(historialCreateMany).not.toHaveBeenCalled();
  });
});
