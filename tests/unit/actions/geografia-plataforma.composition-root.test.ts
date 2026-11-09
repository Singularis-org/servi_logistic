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
const nodoGeograficoFindMany = vi.fn<(args: { where: Record<string, unknown> }) => Promise<unknown[]>>(async () => []);
// SLT-65 (design §5, R9–R12): el conteo ya no cuenta por la columna del nivel. Lee el nodo pedido
// (`findUnique`, para su pais y su profundidad), carga el catalogo de ESE pais (`dePais`, los dos
// `findMany` de arriba) y cuenta `lugar ∈ {nodo} ∪ nodosBajo`. El mock de SL-20 solo tenia
// `orden.count`: el conteo lanzaba `TypeError: findUnique is not a function` y la action devolvia
// `error`. Por defecto el nodo no existe (-> 0 sin consultar); el caso R31 lo prepara.
const nodoGeograficoFindUnique = vi.fn<
  (args: { where: { id: string } }) => Promise<{ paisId: string; profundidad: number } | null>
>(async () => null);
const tipoNivelFindMany = vi.fn<(args: { where: Record<string, unknown> }) => Promise<never[]>>(async () => []);
// SLT-46 (T4.4): renombrar un tipo lo lee primero por id; por defecto no existe (-> `not_found`).
const tipoNivelFindUnique = vi.fn<(args: { where: { id: string } }) => Promise<null>>(async () => null);
const paisFindMany = vi.fn(async () => []);
const paisFindUnique = vi.fn<(args: { where: { id: string } }) => Promise<{ nombre: string } | null>>(async () => null);
const paisUpdateMany = vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 1 }));
const historialCreateMany = vi.fn<(args: { data: unknown[] }) => Promise<{ count: number }>>(async () => ({ count: 1 }));
// SLT-46 (2026-11-09, design §2.4 «Candado del país»): agregar, renombrar y reordenar tipos toman el
// `SELECT … FOR UPDATE` de la fila `pais` con `$queryRaw`; sin filas, el país no existe.
const queryRaw = vi.fn<(sql: TemplateStringsArray, ...valores: unknown[]) => Promise<unknown[]>>(async () => []);
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
  nodoGeografico: { findMany: nodoGeograficoFindMany, findUnique: nodoGeograficoFindUnique },
  tipoNivelGeografico: { findMany: tipoNivelFindMany, findUnique: tipoNivelFindUnique },
  $queryRaw: queryRaw,
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
    // El canton c-1 (profundidad 2) de CR, con un distrito d-1 debajo.
    // SLT-46 (R20): el servicio lee primero la profundidad del nodo (la misma consulta) para saber
    // que es un canton; luego el repositorio de ordenes vuelve a leerlo.
    nodoGeograficoFindUnique
      .mockResolvedValueOnce({ paisId: "CR", profundidad: 2 })
      .mockResolvedValueOnce({ paisId: "CR", profundidad: 2 });
    const nodo = { tipoId: "t", nombreNormalizado: "", codigoOficial: null };
    nodoGeograficoFindMany.mockResolvedValueOnce([
      { ...nodo, id: "p-1", padreId: null, profundidad: 1, nombre: "P" },
      { ...nodo, id: "c-1", padreId: "p-1", profundidad: 2, nombre: "C" },
      { ...nodo, id: "d-1", padreId: "c-1", profundidad: 3, nombre: "D" },
    ]);

    const r = await acciones.contarOrdenesSinEntregarAction({ id: "c-1" }, deps);
    expect(r).toEqual({ status: "ok", ordenes: 7 });
    expect(nodoGeograficoFindUnique.mock.calls[0][0].where).toEqual({ id: "c-1" });
    expect(nodoGeograficoFindMany.mock.calls[0][0].where).toEqual({ paisId: "CR" });
    expect(ordenCount).toHaveBeenCalledTimes(1);
    // SLT-65 (design §5, `whereLugarEn`): el `cantonId` del canton pedido sigue en el `where`, ahora
    // como lugar ∈ {c-1} ∪ nodosBajo(c-1), con el distrito incluido.
    expect(ordenCount.mock.calls[0][0].where).toMatchObject({
      OR: [{ distritoId: { in: ["c-1", "d-1"] } }, { distritoId: null, cantonId: { in: ["c-1", "d-1"] } }],
      deletedAt: null,
    });
  });

  it("el árbol de un país lee las provincias de ESE país", async () => {
    // SLT-46 (R21): el árbol de N niveles mira antes que el país exista; un país sin nodos ni tipos
    // sigue siendo un árbol vacío, ahora con la forma `{tipos, raices}`.
    paisFindUnique.mockResolvedValueOnce({ id: "XA" } as unknown as { nombre: string });
    const r = await acciones.arbolDePaisAction({ paisId: "XA" }, deps);
    expect(r).toEqual({ status: "ok", tipos: [], raices: [] });
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

  it("SLT-46 R25: renombrar un tipo llega al repositorio de países: un tipo que no está es `not_found` y no escribe", async () => {
    const r = await acciones.renombrarTipoNivelAction(
      {
        tipoId: "t-x",
        nombreSingular: "Región",
        nombrePlural: "Regiones",
        anterior: { nombreSingular: "Provincia", nombrePlural: "Provincias" },
      },
      deps,
    );
    expect(r).toEqual({ status: "not_found" });
    expect(tipoNivelFindUnique.mock.calls[0][0].where).toEqual({ id: "t-x" });
    expect(historialCreateMany).not.toHaveBeenCalled();
  });

  it("SLT-46 R49: agregar un nivel llega al repositorio de países: un país que no está es `not_found` y no escribe", async () => {
    const r = await acciones.agregarNivelPaisAction({ paisId: "XZ", nombreSingular: "Barrio", nombrePlural: "Barrios", profundidad: 3 }, deps);
    expect(r).toEqual({ status: "not_found" });
    // SLT-46 (2026-11-09): el país se busca con el candado (`FOR UPDATE`), no con `findUnique` (§2.4).
    expect(queryRaw.mock.calls.some(([sql, ...valores]) => sql.join("?").includes('FROM "pais"') && valores.includes("XZ"))).toBe(
      true,
    );
    expect(historialCreateMany).not.toHaveBeenCalled();
  });

  it("R47: pedir el estado que el país ya tiene es `ok` y NO escribe historial", async () => {
    paisUpdateMany.mockResolvedValueOnce({ count: 0 });
    paisFindUnique.mockResolvedValueOnce({ nombre: "Costa Rica" });
    const r = await acciones.cambiarDisponibilidadPaisAction({ id: "CR", disponible: true }, deps);
    expect(r).toEqual({ status: "ok", id: "CR", disponible: true });
    expect(historialCreateMany).not.toHaveBeenCalled();
  });
});
