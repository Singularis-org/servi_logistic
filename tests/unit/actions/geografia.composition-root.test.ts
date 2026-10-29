import { describe, it, expect, vi } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IVehiculoService";

// FICHA 374 / D3 — el composition root de la LECTURA del arbol, ejercitado de verdad: se mockea
// `getPrismaClient` y se llama a la accion REAL sin `deps.geografiaService`.
//
// SL-20 (design §4): el conteo de la confirmacion (la mitad que exigia el SEGUNDO repositorio) se mudo
// a `lib/actions/geografia-plataforma.ts`; su cableado lo fija
// `geografia-plataforma.composition-root.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

const provinciaFindMany = vi.fn(async () => [
  { id: "p1", nombre: "Puntarenas", activo: true, cantones: [] },
]);

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    orden: {},
    provincia: { findMany: provinciaFindMany },
    canton: {},
    distrito: {},
  }),
  PRISMA_OMIT: {},
}));

const { listarArbolGeografico } = await import("@/lib/actions/geografia");

describe("374/D3 — el composition root de la lectura", () => {
  it("`listarArbolGeografico` sin deps llega al repositorio real", async () => {
    const r = await listarArbolGeografico({ getActor: async () => MAESTRO });
    expect(r.status).toBe("ok");
    expect(provinciaFindMany).toHaveBeenCalled();
  });
});
