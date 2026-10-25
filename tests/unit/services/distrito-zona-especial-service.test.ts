import { describe, it, expect, vi } from "vitest";

import type {
  AplicarCambiosZonaEspecialResult,
  IDistritoZonaEspecialRepository,
} from "@/lib/interfaces/repositories/IDistritoZonaEspecialRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { RolValue } from "@prisma/client";
import { DistritoZonaEspecialService } from "@/lib/services/DistritoZonaEspecialService";

// SL-38 / T6 (design §3) — el servicio que guarda la marca de zona especial de la empresa, con un
// repositorio doble: R9 (suma de cambios efectivos, duplicados), R11 (solo `maestro`, sin tocar el
// repositorio) y R12 (lote contradictorio y listas vacias, sin tocar el repositorio). R13 se traduce
// aqui y se mide contra Postgres en `distrito-zona-especial-por-empresa.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

function repoDoble(r: AplicarCambiosZonaEspecialResult = { estado: "ok", creadas: 0, borradas: 0 }) {
  const aplicarCambios = vi.fn<IDistritoZonaEspecialRepository["aplicarCambios"]>(async () => r);
  return { repo: { aplicarCambios }, aplicarCambios };
}

describe("SL-38 — DistritoZonaEspecialService.actualizar", () => {
  // `superadmin` (SL-32) es de la plataforma y no tiene empresa: tampoco marca la zona especial.
  it.each<RolValue>(["admin", "adminTienda", "adminSatelite", "mensajero", "apiKey", "superadmin"])(
    "R11: el rol %s recibe forbidden sin llamar al repositorio",
    async (rol) => {
      const { repo, aplicarCambios } = repoDoble({ estado: "ok", creadas: 1, borradas: 0 });
      const r = await new DistritoZonaEspecialService(repo).actualizar(
        { marcar: ["d1"], desmarcar: [] },
        { usuarioId: "u-x", rol },
      );
      expect(r).toEqual({ status: "forbidden" });
      expect(aplicarCambios).not.toHaveBeenCalled();
    },
  );

  it("R12: un id en marcar y en desmarcar da validation_error sin llamar al repositorio", async () => {
    const { repo, aplicarCambios } = repoDoble();
    const r = await new DistritoZonaEspecialService(repo).actualizar(
      { marcar: ["d1", "d2"], desmarcar: ["d3", "d2"] },
      MAESTRO,
    );
    expect(r).toEqual({ status: "validation_error" });
    expect(aplicarCambios).not.toHaveBeenCalled();
  });

  it("R12: las dos listas vacias dan ok con 0 sin llamar al repositorio", async () => {
    const { repo, aplicarCambios } = repoDoble({ estado: "ok", creadas: 5, borradas: 5 });
    const r = await new DistritoZonaEspecialService(repo).actualizar({ marcar: [], desmarcar: [] }, MAESTRO);
    expect(r).toEqual({ status: "ok", actualizados: 0 });
    expect(aplicarCambios).not.toHaveBeenCalled();
  });

  it("R9: delega el lote sin duplicados y responde creadas + borradas", async () => {
    const { repo, aplicarCambios } = repoDoble({ estado: "ok", creadas: 2, borradas: 1 });
    const r = await new DistritoZonaEspecialService(repo).actualizar(
      { marcar: ["d1", "d2", "d1"], desmarcar: ["d3", "d3"] },
      MAESTRO,
    );
    expect(r).toEqual({ status: "ok", actualizados: 3 });
    expect(aplicarCambios).toHaveBeenCalledTimes(1);
    expect(aplicarCambios).toHaveBeenCalledWith({ marcar: ["d1", "d2"], desmarcar: ["d3"] });
  });

  it("R9: marcar lo ya marcado no cuenta: actualizados es lo que el repositorio cambio de verdad", async () => {
    const { repo } = repoDoble({ estado: "ok", creadas: 0, borradas: 0 });
    const r = await new DistritoZonaEspecialService(repo).actualizar({ marcar: ["d1"], desmarcar: ["d9"] }, MAESTRO);
    expect(r).toEqual({ status: "ok", actualizados: 0 });
  });

  it("R13: un distrito inexistente en el repositorio se responde como validation_error", async () => {
    const { repo, aplicarCambios } = repoDoble({ estado: "distrito_inexistente" });
    const r = await new DistritoZonaEspecialService(repo).actualizar({ marcar: ["no-existe"], desmarcar: [] }, MAESTRO);
    expect(r).toEqual({ status: "validation_error" });
    expect(aplicarCambios).toHaveBeenCalledTimes(1);
  });
});
