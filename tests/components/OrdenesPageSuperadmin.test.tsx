import { describe, it, expect, vi, beforeEach } from "vitest";
import { RolValue } from "@prisma/client";

import OrdenesPage from "@/app/(app)/ordenes/page";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { zonaDelBorde } from "@/lib/actions/_shared/zona-del-borde";
import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";

/**
 * SLT-250 (R1820, R1821, R1822): en producción el `superadmin` (sin empresa) llegaba a `/ordenes`
 * y la página caía con `EmpresaNoResuelta: Sin empresa en contexto para Pais.zonaHoraria`. Aquí
 * `zonaDelBorde` se dobla para lanzar ESE error, como lo hace con una sesión sin empresa, y
 * `notFound` para lanzar uno marcado: la página tiene que rechazar con el segundo, nunca con el
 * primero. Los hijos de la página se doblan: aquí no se pinta nada, solo se decide la puerta.
 */

const NOT_FOUND = new Error("SLT-250:notFound");

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw NOT_FOUND;
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/actions/_shared/zona-del-borde", async () => {
  const { EmpresaNoResuelta: SinEmpresa } = await import("@/lib/db/contexto-empresa");
  return {
    zonaDelBorde: vi.fn(async () => {
      throw new SinEmpresa("Pais", "zonaHoraria");
    }),
  };
});
vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn(async () => null) }));
vi.mock("@/lib/actions/filtros-ordenes", () => ({
  obtenerCatalogoFiltrosOrdenes: vi.fn(async () => ({ status: "error" })),
}));
vi.mock("@/lib/actions/reprogramadas-retenidas", () => ({
  resumenReprogramadasRetenidasCentral: vi.fn(async () => ({ status: "error" })),
}));
vi.mock("@/app/(app)/ordenes/_components/OrdenesListado", () => ({ OrdenesListado: () => null }));
vi.mock("@/app/(app)/ordenes/_components/OrdenesModule", () => ({ OrdenesModule: () => null }));
vi.mock("@/app/(app)/ordenes/_components/FranjaReprogramadasRetenidas", () => ({
  FranjaReprogramadasRetenidas: () => null,
}));
vi.mock("@/components/shared/AppPage", () => ({ AppPage: () => null }));

const actorMock = vi.mocked(resolveActorFromSession);
const zonaMock = vi.mocked(zonaDelBorde);

beforeEach(() => {
  zonaMock.mockClear();
  actorMock.mockReset();
});

describe("SLT-250 — /ordenes y el actor de plataforma", () => {
  it("superadmin: notFound antes de leer la zona (R1820, R1821)", async () => {
    actorMock.mockResolvedValueOnce({ usuarioId: "u-plataforma", rol: RolValue.superadmin });

    const rechazo = await OrdenesPage().then(
      () => null,
      (e: unknown) => e,
    );

    // El rechazo es el 404, no la `EmpresaNoResuelta` que veía producción.
    expect(rechazo).toBe(NOT_FOUND);
    expect(rechazo).not.toBeInstanceOf(EmpresaNoResuelta);
    expect(zonaMock).not.toHaveBeenCalled();
  });

  it("roles de empresa: leen la zona y no hay notFound (R1822)", async () => {
    // Con empresa, la zona se lee de verdad: aquí da la de Costa Rica.
    zonaMock.mockResolvedValue("America/Costa_Rica");
    for (const rol of [RolValue.maestro, RolValue.admin, RolValue.adminTienda]) {
      actorMock.mockResolvedValueOnce({ usuarioId: `u-${rol}`, rol });
      zonaMock.mockClear();

      await expect(OrdenesPage()).resolves.toBeDefined();
      expect(zonaMock).toHaveBeenCalledTimes(1);
    }
  });
});
