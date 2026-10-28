import { describe, it, expect, vi, beforeEach } from "vitest";
import { RolValue } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";

// SL-20 (enmienda 2026-10-26, decisión 6; R9, R45) — EL COMPOSITION ROOT DE LOS PAÍSES DEL ALTA,
// EJERCITADO DE VERDAD (memoria «el composition root que no inyecta»). Se llama sin servicio
// inyectado y se exige que la lectura llegue al cliente de `getPrismaClient` con el filtro
// `disponible = true` y solo `{ id, nombre }`, y que un rol de empresa no lea nada.

const findMany = vi.fn(async () => [{ id: "CR", nombre: "Costa Rica" }]);

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ pais: { findMany } }),
  PRISMA_OMIT: {},
}));

const { listarPaisesDisponibles } = await import("@/lib/actions/_shared/paises-plataforma");

beforeEach(() => {
  findMany.mockClear();
});

describe("SL-20 — listarPaisesDisponibles cablea PaisService y PaisRepository reales", () => {
  it("la plataforma recibe los países disponibles, leídos con `disponible = true` y por nombre", async () => {
    const r = await listarPaisesDisponibles({ usuarioId: "u-super", rol: ROLES_PLATAFORMA[0] });

    expect(r).toEqual({ status: "ok", paises: [{ id: "CR", nombre: "Costa Rica" }] });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { disponible: true },
      orderBy: [{ nombre: "asc" }],
      select: { id: true, nombre: true },
    });
  });

  it("un rol de empresa recibe `forbidden` sin leer nada (R37)", async () => {
    const r = await listarPaisesDisponibles({ usuarioId: "u-maestro", rol: RolValue.maestro });
    expect(r).toEqual({ status: "forbidden" });
    expect(findMany).not.toHaveBeenCalled();
  });
});
