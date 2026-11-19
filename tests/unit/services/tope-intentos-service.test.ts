import { describe, expect, it, vi } from "vitest";
import type { RolValue } from "@prisma/client";

import type { ITopeIntentosRepository } from "@/lib/interfaces/repositories/ITopeIntentosRepository";
import type { Actor } from "@/lib/interfaces/services/ITopeIntentosService";
import { TopeIntentosService } from "@/lib/services/TopeIntentosService";

// SLT-77 T2.2 (design §4.1, R4, R5) — lo que el servicio decide sin base. Lo que dice Postgres (empresa, RLS,
// historial) esta en `tests/integration/db/tope-intentos-escritura.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-m", rol: "maestro" };

const SIN_PERMISO: Actor[] = [
  { usuarioId: "u-a", rol: "admin" },
  { usuarioId: "u-t", rol: "adminTienda" },
  { usuarioId: "u-me", rol: "mensajero" },
  { usuarioId: "u-s", rol: "adminSatelite" },
  { usuarioId: "u-k", rol: "apiKey" },
  { usuarioId: "u-su", rol: "superadmin" },
  { usuarioId: "u-x", rol: "invitado" as RolValue },
];

function montar() {
  const guardar = vi.fn<ITopeIntentosRepository["guardar"]>().mockResolvedValue({ cambio: true });
  return { guardar, servicio: new TopeIntentosService({ guardar }) };
}

describe("SLT-77 R4 — solo el maestro guarda", () => {
  it.each(SIN_PERMISO)("$rol recibe forbidden con una entrada valida, sin escribir", async (actor) => {
    const { guardar, servicio } = montar();
    expect(await servicio.guardar({ tope: 5 }, actor)).toEqual({ status: "forbidden" });
    expect(guardar).not.toHaveBeenCalled();
  });

  // El rol va antes que el input: con el orden al reves, esto seria `validation_error`.
  it.each(SIN_PERMISO)("$rol recibe forbidden tambien con una entrada invalida: no se valida", async (actor) => {
    const { guardar, servicio } = montar();
    expect(await servicio.guardar({ tope: 99 }, actor)).toEqual({ status: "forbidden" });
    expect(guardar).not.toHaveBeenCalled();
  });

  it("el rol se comprueba sin leer la entrada: un getter que explota no llega a dispararse", async () => {
    const { servicio } = montar();
    const trampa = {
      get tope(): number {
        throw new Error("se miro el input antes que el rol");
      },
    };
    expect(await servicio.guardar(trampa, { usuarioId: "u-a", rol: "admin" })).toEqual({ status: "forbidden" });
  });

  it("control positivo: el maestro guarda, con su propio id de actor", async () => {
    const { guardar, servicio } = montar();
    expect(await servicio.guardar({ tope: 5 }, MAESTRO)).toEqual({ status: "ok", tope: 5 });
    expect(guardar).toHaveBeenCalledExactlyOnceWith(5, "u-m");
  });
});

describe("SLT-77 R5 — el valor se valida en el servidor, sin efectos", () => {
  it.each([
    ["0", { tope: 0 }],
    ["11", { tope: 11 }],
    ["-1", { tope: -1 }],
    ["2,5", { tope: 2.5 }],
    ["texto", { tope: "3" }],
    ["null", { tope: null }],
    ["vacio", {}],
    ["una clave de mas", { tope: 3, organizacionId: "otra-empresa" }],
    ["sin objeto", 3],
  ])("%s da validation_error en el campo y no escribe", async (_caso, input) => {
    const { guardar, servicio } = montar();
    const res = await servicio.guardar(input, MAESTRO);
    expect(res.status).toBe("validation_error");
    expect(guardar).not.toHaveBeenCalled();
  });

  it("el error de un numero fuera de rango viene en el campo `tope`", async () => {
    const { servicio } = montar();
    const res = await servicio.guardar({ tope: 11 }, MAESTRO);
    if (res.status !== "validation_error") throw new Error(res.status);
    expect(Object.keys(res.fieldErrors)).toEqual(["tope"]);
  });

  it.each([1, 3, 10])("%i se admite", async (tope) => {
    const { guardar, servicio } = montar();
    expect(await servicio.guardar({ tope }, MAESTRO)).toEqual({ status: "ok", tope });
    expect(guardar).toHaveBeenCalledExactlyOnceWith(tope, "u-m");
  });
});

describe("SLT-77 R11 — el mismo valor tambien responde bien", () => {
  it("el repositorio dice que no cambio y el servicio responde ok con ese valor", async () => {
    const { guardar, servicio } = montar();
    guardar.mockResolvedValue({ cambio: false });
    expect(await servicio.guardar({ tope: 4 }, MAESTRO)).toEqual({ status: "ok", tope: 4 });
  });
});

describe("SLT-77 R27 — un fallo de la base no se traga", () => {
  it("el error del repositorio llega a quien llama", async () => {
    const { guardar, servicio } = montar();
    const fallo = new Error("sin empresa");
    guardar.mockRejectedValue(fallo);
    await expect(servicio.guardar({ tope: 4 }, MAESTRO)).rejects.toBe(fallo);
  });
});
