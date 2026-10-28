import { describe, it, expect, vi } from "vitest";

import * as geografia from "@/lib/actions/geografia";
import { listarArbolGeografico } from "@/lib/actions/geografia";
import type { IGeoRepository } from "@/lib/interfaces/repositories/IGeoRepository";
import type { IGeografiaService } from "@/lib/interfaces/services/IGeografiaService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { GeografiaService } from "@/lib/services/GeografiaService";

// FICHA 374 (R23) + SL-32 (R25) — el borde de la LECTURA del arbol, lo unico de geografia que sigue
// siendo de la empresa.
//
// SL-20 (design §4): el alta, el renombrado, el retiro y el conteo se mudaron a
// `lib/actions/geografia-plataforma.ts` (su borde lo mide `geografia-plataforma-action.test.ts`).
// Aqui se fija ademas que este modulo YA NO los exporta: una escritura de geografia que volviera a
// salir sin `comoPlataforma` caeria en `EmpresaNoResuelta` con el superadmin (R32).

const SUPERADMIN: Actor = { usuarioId: "u-superadmin", rol: "superadmin" };
const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

function serviceDoble(): IGeografiaService & { listarArbol: ReturnType<typeof vi.fn> } {
  return {
    listarArbol: vi.fn(async () => ({ status: "ok" as const, provincias: [] })),
  } as unknown as IGeografiaService & { listarArbol: ReturnType<typeof vi.fn> };
}

describe("374/R23 — sin sesion -> unauthenticated, sin instanciar el service", () => {
  it("listarArbolGeografico", async () => {
    const service = serviceDoble();
    const r = await listarArbolGeografico({ getActor: async () => null, geografiaService: service });
    expect(r).toEqual({ status: "unauthenticated" });
    expect(service.listarArbol).not.toHaveBeenCalled();
  });
});

describe("374 — la lectura delega en el service", () => {
  it("con sesion de plataforma devuelve lo que devuelve el service", async () => {
    const service = serviceDoble();
    const r = await listarArbolGeografico({ getActor: async () => SUPERADMIN, geografiaService: service });
    expect(r).toEqual({ status: "ok", provincias: [] });
    expect(service.listarArbol).toHaveBeenCalledWith(SUPERADMIN);
  });

  it("listarArbolGeografico CONSERVA su firma: se puede llamar sin argumentos", () => {
    // Lo llaman `configuracion/tarifas/page.tsx` y `ZonasTarifasModule.tsx` sin argumentos.
    expect(listarArbolGeografico.length).toBe(0);
  });
});

describe("SL-20 (design §4) — las escrituras ya no salen de este modulo", () => {
  it.each(["crearNodoGeografico", "cambiarActivacionGeografica", "renombrarNodoGeografico", "contarOrdenesSinEntregarDeNodo"])(
    "%s no se exporta",
    (nombre) => {
      expect(Object.keys(geografia)).not.toContain(nombre);
    },
  );

  it("control positivo: la lectura y la marca de zona especial siguen exportadas", () => {
    expect(Object.keys(geografia)).toEqual(
      expect.arrayContaining(["listarArbolGeografico", "actualizarDistritosEspeciales"]),
    );
  });
});

// SL-32 (R25) — el `maestro` sigue leyendo el arbol de su pais (Tarifas), con el servicio REAL.
describe("SL-32 (R25) / SL-20 (R37) — el `maestro` sigue leyendo el arbol", () => {
  it("listarArbolGeografico da `ok` al `maestro`", async () => {
    const repo = { listArbol: vi.fn(async () => []) } as unknown as IGeoRepository & {
      listArbol: ReturnType<typeof vi.fn>;
    };
    const ordenes = { contarSinEntregarPorNodoGeografico: vi.fn(async () => 0) };
    const r = await listarArbolGeografico({
      getActor: async () => MAESTRO,
      geografiaService: new GeografiaService(repo, ordenes),
    });
    expect(r).toEqual({ status: "ok", provincias: [] });
    expect(repo.listArbol).toHaveBeenCalledTimes(1);
  });
});
