import { describe, it, expect, vi } from "vitest";

import { GeografiaApiService, type GeografiaPaisRepository } from "@/lib/services/GeografiaApiService";
import { crearAsignaciones, type CatalogoGeografico } from "@/lib/services/geografia-dominio";
import type { ICatalogoGeograficoRepository } from "@/lib/interfaces/repositories/ICatalogoGeograficoRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { PaisDTO } from "@/lib/types/pais";
import { geografiaQuerySchema } from "@/lib/types/api-v2";
import { catalogoEnMemoria } from "../../fixtures/doble-catalogo-geografico";

// SLT-45 (T4.4, design §6) — el catalogo de `GET /api/v2/geografia`:
//   R22 — el pais de la empresa con sus tipos y todos sus nodos (activo en cascada), en 2, 3 y 4 niveles;
//   R23 — `pais` mal formado es 422 (schema); pais ajeno e inexistente, el mismo `not_found`;
//   R11 — solo el rol `apiKey`.

const APIKEY: Actor = { usuarioId: "key-user-1", rol: "apiKey" };
const PAIS_DEL_DOBLE = "XX";

const TRES = catalogoEnMemoria(
  [
    { id: "p1", nombre: "Alta", codigoOficial: "1" },
    { id: "c1", padreId: "p1", nombre: "Media", codigoOficial: "101", activo: false },
    { id: "d1", padreId: "c1", nombre: "Baja", codigoOficial: "10101" },
  ],
  PAIS_DEL_DOBLE,
);
const DOS = catalogoEnMemoria([{ id: "A", nombre: "Alfa" }, { id: "A1", padreId: "A", nombre: "Uno" }], PAIS_DEL_DOBLE);
const CUATRO = catalogoEnMemoria(
  [
    { id: "X", nombre: "Equis" },
    { id: "X1", padreId: "X", nombre: "Uno" },
    { id: "X2", padreId: "X1", nombre: "Dos" },
    { id: "X3", padreId: "X2", nombre: "Tres" },
  ],
  PAIS_DEL_DOBLE,
);

function catalogoRepo(catalogo: CatalogoGeografico): ICatalogoGeograficoRepository & {
  deLaEmpresa: ReturnType<typeof vi.fn>;
} {
  return {
    deLaEmpresa: vi.fn(async () => ({ catalogo, asignaciones: crearAsignaciones([], []) })),
    dePais: vi.fn(async () => catalogo),
  };
}

function paisRepo(existe = true): GeografiaPaisRepository & { porId: ReturnType<typeof vi.fn> } {
  return {
    porId: vi.fn(async (id: string) => (existe ? ({ id, nombre: "Pais del doble" } as PaisDTO) : null)),
  };
}

describe("R11 — autorizacion en el servicio", () => {
  it.each(["adminTienda", "admin", "mensajero"] as const)("rol %s → `forbidden`, sin leer el catalogo", async (rol) => {
    const cat = catalogoRepo(TRES);
    const paises = paisRepo();
    const r = await new GeografiaApiService(cat, paises).catalogo({ usuarioId: "u1", rol }, PAIS_DEL_DOBLE);
    expect(r).toEqual({ status: "forbidden" });
    expect(cat.deLaEmpresa).not.toHaveBeenCalled();
    expect(paises.porId).not.toHaveBeenCalled();
  });

  it("rol `apiKey` → `ok`", async () => {
    const r = await new GeografiaApiService(catalogoRepo(TRES), paisRepo()).catalogo(APIKEY, PAIS_DEL_DOBLE);
    expect(r.status).toBe("ok");
  });
});

describe("R22 — el catalogo del pais de la empresa", () => {
  it("pais, tipos y todos los nodos con id, padre, profundidad, tipo, nombre, codigo y activo en cascada", async () => {
    const r = await new GeografiaApiService(catalogoRepo(TRES), paisRepo()).catalogo(APIKEY, PAIS_DEL_DOBLE);
    expect(r).toEqual({
      status: "ok",
      catalogo: {
        pais: { id: PAIS_DEL_DOBLE, nombre: "Pais del doble" },
        tipos: [
          { clave: "nivel_1", nombreSingular: "Nivel 1", nombrePlural: "Niveles 1" },
          { clave: "nivel_2", nombreSingular: "Nivel 2", nombrePlural: "Niveles 2" },
          { clave: "nivel_3", nombreSingular: "Nivel 3", nombrePlural: "Niveles 3" },
        ],
        nodos: [
          { id: "p1", padreId: null, profundidad: 1, tipo: "nivel_1", nombre: "Alta", codigoOficial: "1", activo: true },
          { id: "c1", padreId: "p1", profundidad: 2, tipo: "nivel_2", nombre: "Media", codigoOficial: "101", activo: false },
          // Activo en su fila, pero su padre esta retirado: se lista, con `false` (proyecta, no recorta).
          { id: "d1", padreId: "c1", profundidad: 3, tipo: "nivel_3", nombre: "Baja", codigoOficial: "10101", activo: false },
        ],
      },
    });
  });

  it.each([
    ["2 niveles", DOS, 2],
    ["4 niveles", CUATRO, 4],
  ])("funciona igual para un pais de %s", async (_n, cat, niveles) => {
    const r = await new GeografiaApiService(catalogoRepo(cat), paisRepo()).catalogo(APIKEY, PAIS_DEL_DOBLE);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.catalogo.tipos).toHaveLength(niveles);
    expect(r.catalogo.nodos.map((n) => n.profundidad)).toEqual(cat.nodos.map((n) => n.profundidad));
    expect(Math.max(...r.catalogo.nodos.map((n) => n.profundidad))).toBe(niveles);
  });
});

describe("R23 — pais ajeno, inexistente o mal formado", () => {
  it("un pais que no es el de la empresa → `not_found`, sin leer `pais`", async () => {
    const paises = paisRepo();
    const r = await new GeografiaApiService(catalogoRepo(TRES), paises).catalogo(APIKEY, "YY");
    expect(r).toEqual({ status: "not_found" });
    expect(paises.porId).not.toHaveBeenCalled();
  });

  it("un pais inexistente da el mismo `not_found` que uno ajeno", async () => {
    const svc = new GeografiaApiService(catalogoRepo(TRES), paisRepo());
    expect(await svc.catalogo(APIKEY, "ZZZ")).toEqual(await svc.catalogo(APIKEY, "YY"));
  });

  it("si `pais` no devuelve la fila de la empresa, tambien `not_found` (nunca un nombre inventado)", async () => {
    const r = await new GeografiaApiService(catalogoRepo(TRES), paisRepo(false)).catalogo(APIKEY, PAIS_DEL_DOBLE);
    expect(r).toEqual({ status: "not_found" });
  });

  it.each([
    ["ausente", {}],
    ["minusculas", { pais: "ab" }],
    ["una letra", { pais: "A" }],
    ["cuatro letras", { pais: "ABCD" }],
    ["con digitos", { pais: "A1" }],
  ])("`pais` %s no pasa el schema de la query (422 en el borde)", (_caso, query) => {
    const r = geografiaQuerySchema.safeParse(query);
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(r.error.flatten().fieldErrors)).toEqual(["pais"]);
  });

  it.each(["AB", "ABC"])("`pais` %s pasa el schema", (pais) => {
    expect(geografiaQuerySchema.safeParse({ pais }).success).toBe(true);
  });
});

// SLT-45 (T5.2, design §4.3) — la `ubicacion` del detalle de `GET /api/v2/ordenes/{id}` (R20, R21).
describe("R20/R21 — `ubicacionDeOrden`: la ruta del lugar de una orden propia", () => {
  function ordenRepo(lugar: string | null) {
    return { findLugarDeOrdenForOwner: vi.fn(async () => lugar) };
  }

  it("orden propia → la ruta de la raiz al lugar, con el dueño de la key forzado", async () => {
    const ordenes = ordenRepo("d1");
    const r = await new GeografiaApiService(catalogoRepo(TRES), paisRepo(), ordenes).ubicacionDeOrden(APIKEY, "orden-1");
    expect(ordenes.findLugarDeOrdenForOwner).toHaveBeenCalledWith("orden-1", APIKEY.usuarioId);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.ubicacion.map((u) => [u.profundidad, u.id, u.nombre, u.codigoOficial])).toEqual([
      [1, "p1", "Alta", "1"],
      [2, "c1", "Media", "101"],
      [3, "d1", "Baja", "10101"],
    ]);
  });

  it("orden ajena, borrada o inexistente (el repo da `null`) → `not_found`, sin leer el catalogo", async () => {
    const cat = catalogoRepo(TRES);
    const r = await new GeografiaApiService(cat, paisRepo(), ordenRepo(null)).ubicacionDeOrden(APIKEY, "otra");
    expect(r).toEqual({ status: "not_found" });
    expect(cat.deLaEmpresa).not.toHaveBeenCalled();
  });

  it.each(["adminTienda", "admin", "mensajero"] as const)("rol %s → `forbidden`, sin leer la orden", async (rol) => {
    const ordenes = ordenRepo("d1");
    const r = await new GeografiaApiService(catalogoRepo(TRES), paisRepo(), ordenes).ubicacionDeOrden(
      { usuarioId: "u1", rol },
      "orden-1",
    );
    expect(r).toEqual({ status: "forbidden" });
    expect(ordenes.findLugarDeOrdenForOwner).not.toHaveBeenCalled();
  });
});
