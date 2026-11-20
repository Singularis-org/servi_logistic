import { describe, it, expect, vi } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IVehiculoService";

// FICHA 374 / D3 — el composition root de la LECTURA del arbol, ejercitado de verdad: se mockea
// `getPrismaClient` y se llama a la accion REAL sin `deps.geografiaService`.
//
// SL-20 (design §4): el conteo de la confirmacion (la mitad que exigia el SEGUNDO repositorio) se mudo
// a `lib/actions/geografia-plataforma.ts`; su cableado lo fija
// `geografia-plataforma.composition-root.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

// SLT-44 (design §10, «cambian de entrada, no de salida»): el arbol sale del catalogo
// (`nodo_geografico`) y de las asignaciones de la empresa, no de `provincia.findMany`. El doble da
// la misma provincia como nodo; el aserto de anti-vacuidad mira ahora la consulta de nodos.
const nodoGeograficoFindMany = vi.fn(async () => [
  {
    id: "p1",
    nombre: "Puntarenas",
    nombreNormalizado: "puntarenas",
    profundidad: 1,
    padreId: null,
    tipoId: "t1",
    codigoOficial: null,
    activo: true,
  },
]);

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    orden: {},
    provincia: {},
    canton: {},
    distrito: {},
    organizacion: { findFirst: vi.fn(async () => ({ paisId: "CR" })) },
    tipoNivelGeografico: { findMany: vi.fn(async () => []) },
    nodoGeografico: { findMany: nodoGeograficoFindMany },
    zonaDistrito: { findMany: vi.fn(async () => []) },
    distritoZonaEspecial: { findMany: vi.fn(async () => []) },
  }),
  PRISMA_OMIT: {},
}));

const { listarArbolGeografico } = await import("@/lib/actions/geografia");

describe("374/D3 — el composition root de la lectura", () => {
  it("`listarArbolGeografico` sin deps llega al repositorio real", async () => {
    const r = await listarArbolGeografico({ getActor: async () => MAESTRO });
    expect(r.status).toBe("ok");
    expect(nodoGeograficoFindMany).toHaveBeenCalled();
  });
});
