import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ITarifaActivacionRepository } from "@/lib/interfaces/repositories/ITarifaActivacionRepository";
import type {
  Actor,
  FaltantesPorZona,
  IFaltantesDeActivacion,
} from "@/lib/interfaces/services/ITarifaActivacionService";
import { activarTarifasNuevas } from "@/lib/actions/tarifas";
import { TarifaActivacionService } from "@/lib/services/TarifaActivacionService";

// SLT-54 T1.4 (design §4, R5, R6, R7) — la decision de activar, con dobles. Lo que el SQL hace (la
// transaccion, el unico, la carrera) esta en `tests/integration/db/tarifa-activacion.test.ts`.

const FECHA = new Date("2026-11-04T15:00:00.000Z");
const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

const ZONA_CON_FALTANTES: FaltantesPorZona = {
  zonaId: "z1",
  zonaNombre: "Norte",
  faltantes: [{ concepto: "tienda_flete_entregado" }, { concepto: "mensajero_entregado" }],
  usaZona: [],
};
const OTRA_CON_FALTANTES: FaltantesPorZona = {
  zonaId: "z2",
  zonaNombre: "Sur",
  faltantes: [{ concepto: "tienda_flete_rechazo" }],
  usaZona: [],
};
const ZONA_COMPLETA: FaltantesPorZona = { zonaId: "z3", zonaNombre: "Este", faltantes: [], usaZona: [] };

function montar(zonas: readonly FaltantesPorZona[] = []) {
  const repo = {
    leer: vi.fn<ITarifaActivacionRepository["leer"]>().mockResolvedValue(null),
    activar: vi.fn<ITarifaActivacionRepository["activar"]>().mockResolvedValue({ creada: true, activadaAt: FECHA }),
  };
  const faltantes = {
    faltantesPorZona: vi.fn<IFaltantesDeActivacion["faltantesPorZona"]>().mockResolvedValue(zonas),
  };
  return { repo, faltantes, servicio: new TarifaActivacionService(repo, faltantes) };
}

describe("SLT-54 TarifaActivacionService.activar", () => {
  describe("R5 — matriz de roles", () => {
    it.each(["admin", "mensajero", "adminTienda", "apiKey", "Admin Tienda", "bodega", "superadmin", "", "MAESTRO"])(
      "%j responde forbidden sin leer ni escribir",
      async (rol) => {
        const { repo, faltantes, servicio } = montar();
        const res = await servicio.activar({ confirmaFaltantes: true }, { usuarioId: "u", rol: rol as Actor["rol"] });
        expect(res).toEqual({ status: "forbidden" });
        expect(repo.leer).not.toHaveBeenCalled();
        expect(faltantes.faltantesPorZona).not.toHaveBeenCalled();
        expect(repo.activar).not.toHaveBeenCalled();
      },
    );

    it("un rol sin permiso con un input invalido sigue siendo forbidden", async () => {
      const { servicio } = montar();
      expect(await servicio.activar("basura", { usuarioId: "u", rol: "admin" })).toEqual({ status: "forbidden" });
    });

    it("maestro activa, con su id como actor", async () => {
      const { repo, servicio } = montar();
      const res = await servicio.activar({ confirmaFaltantes: false }, MAESTRO);
      expect(res).toEqual({ status: "ok", activadaAt: FECHA });
      expect(repo.activar).toHaveBeenCalledExactlyOnceWith("u-maestro", 0);
    });
  });

  describe("R6 — con faltantes pide confirmación", () => {
    it("sin la confirmacion no activa y devuelve la lista del servidor, sin las zonas completas", async () => {
      const { repo, servicio } = montar([ZONA_CON_FALTANTES, ZONA_COMPLETA, OTRA_CON_FALTANTES]);
      const res = await servicio.activar({ confirmaFaltantes: false }, MAESTRO);
      expect(res).toEqual({
        status: "confirmacion_requerida",
        faltantes: [ZONA_CON_FALTANTES, OTRA_CON_FALTANTES],
      });
      expect(repo.activar).not.toHaveBeenCalled();
    });

    it("con la confirmacion activa y guarda cuantos faltaban en total", async () => {
      const { repo, servicio } = montar([ZONA_CON_FALTANTES, ZONA_COMPLETA, OTRA_CON_FALTANTES]);
      const res = await servicio.activar({ confirmaFaltantes: true }, MAESTRO);
      expect(res).toEqual({ status: "ok", activadaAt: FECHA });
      expect(repo.activar).toHaveBeenCalledExactlyOnceWith("u-maestro", 3);
    });

    it("sin faltantes activa aunque no se haya confirmado: solo hay zonas completas", async () => {
      const { repo, servicio } = montar([ZONA_COMPLETA]);
      expect(await servicio.activar({ confirmaFaltantes: false }, MAESTRO)).toEqual({ status: "ok", activadaAt: FECHA });
      expect(repo.activar).toHaveBeenCalledExactlyOnceWith("u-maestro", 0);
    });

    it.each([
      ["sin la clave", {}],
      ["texto", { confirmaFaltantes: "true" }],
      ["numero", { confirmaFaltantes: 1 }],
      ["null", { confirmaFaltantes: null }],
      ["sin objeto", undefined],
    ])("%s no se toma por confirmacion: validation_error sin escribir", async (_nombre, input) => {
      const { repo, faltantes, servicio } = montar([ZONA_CON_FALTANTES]);
      const res = await servicio.activar(input, MAESTRO);
      expect(res.status).toBe("validation_error");
      expect(faltantes.faltantesPorZona).not.toHaveBeenCalled();
      expect(repo.activar).not.toHaveBeenCalled();
    });
  });

  describe("R7 — ya activada", () => {
    it("ya activada responde su fecha sin calcular faltantes ni escribir", async () => {
      const { repo, faltantes, servicio } = montar([ZONA_CON_FALTANTES]);
      repo.leer.mockResolvedValue({ activadaAt: FECHA, activadaPor: "u-otro" });
      expect(await servicio.activar({ confirmaFaltantes: false }, MAESTRO)).toEqual({
        status: "ya_activada",
        activadaAt: FECHA,
      });
      expect(faltantes.faltantesPorZona).not.toHaveBeenCalled();
      expect(repo.activar).not.toHaveBeenCalled();
    });

    it("si otra sesion gana la carrera en el repositorio, ya_activada y no error", async () => {
      const { repo, servicio } = montar();
      repo.activar.mockResolvedValue({ creada: false, activadaAt: FECHA });
      expect(await servicio.activar({ confirmaFaltantes: true }, MAESTRO)).toEqual({
        status: "ya_activada",
        activadaAt: FECHA,
      });
    });
  });
});

describe("SLT-54 action activarTarifasNuevas", () => {
  const llamada = vi.fn();
  beforeEach(() => {
    llamada.mockReset();
  });

  it("sin sesion: unauthenticated, sin llegar al servicio", async () => {
    const res = await activarTarifasNuevas(
      { confirmaFaltantes: true },
      { getActor: async () => null, servicio: { activar: llamada } },
    );
    expect(res).toEqual({ status: "unauthenticated" });
    expect(llamada).not.toHaveBeenCalled();
  });

  it("le pasa al servicio el input y el actor de la sesion, y devuelve su respuesta", async () => {
    llamada.mockResolvedValue({ status: "ok", activadaAt: FECHA });
    const res = await activarTarifasNuevas(
      { confirmaFaltantes: true },
      { getActor: async () => MAESTRO, servicio: { activar: llamada } },
    );
    expect(res).toEqual({ status: "ok", activadaAt: FECHA });
    expect(llamada).toHaveBeenCalledExactlyOnceWith({ confirmaFaltantes: true }, MAESTRO);
  });

  it("un fallo inesperado es `error`, nunca una excepcion ni un falso ok", async () => {
    llamada.mockRejectedValue(new Error("se cayo la base"));
    const res = await activarTarifasNuevas(
      { confirmaFaltantes: true },
      { getActor: async () => MAESTRO, servicio: { activar: llamada } },
    );
    expect(res).toEqual({ status: "error" });
  });
});
