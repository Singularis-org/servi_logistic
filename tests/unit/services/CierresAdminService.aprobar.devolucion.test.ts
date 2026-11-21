import { describe, it, expect, vi } from "vitest";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { dobleCierresAdmin } from "@/tests/fixtures/dobles/cierres-admin-repository";

// Feature 139 (T1.4) — el service resuelve la config del DISPARO de la devolucion de `rechazada`
// (origen `rechazada` + destinos `por_devolver`/`por_devolver_a_tienda` + zona central) y la pasa
// SOLO al aprobar (R5). El rechazo NO la pasa (R10). Catalogo incompleto -> undefined (defensivo).

const MAESTRO: Actor = { usuarioId: "adm-maestro", rol: "maestro" };

// Ids del catalogo que `aprobarCierre` resuelve (109 + 139). El default trae todos -> la config
// de devolucion se puede construir.
const ESTATUS_IDS: Record<string, string | null> = {
  novedad_interna: "s-sin-gestionar",
  en_bodega_central: "s-en-bodega",
  en_bodega_satelite: "s-en-bodega-sat",
  devolucion_a_origen_por_rechazo: "s-rechazada",
  por_devolver_a_bodega_central: "s-por-devolver",
  por_devolver_a_tienda: "s-por-devolver-a-tienda",
  // Feature 239 -> FICHA 454: `devuelta` sigue siendo obligatorio al aprobar (fallo cerrado).
  novedad: "s-devuelta",
  // FICHA 454 (T1.7): los de la APLICACION DE GESTIONES (origen + destino de cada resultado).
  // Sin cualquiera de ellos la aprobacion NO ocurre (fallo cerrado, heredado de la 239/R9).
  en_reparto: "s-en-reparto",
  entregado: "s-entregada",
  reprogramado: "s-reprogramada",
  incidente: "s-incidente",
};

function fakeRepo() {
  return dobleCierresAdmin();
}

function newService(estatusIds: Record<string, string | null> = ESTATUS_IDS) {
  const repo = fakeRepo();
  const zonaRepo = {
    findCentralZonaId: vi.fn(async () => "z-central"),
  } as unknown as IZonaRepository;
  const ordenRepo = {
    findUsuarioZonaId: vi.fn(async () => "z-cartago"),
    findEstatusIdByValue: vi.fn(async (v: string) => estatusIds[v] ?? null),
  } as unknown as IOrdenRepository;
  const signedUrls = {
    createSignedUrl: vi.fn(),
    createSignedUrls: vi.fn(async () => ({})),
  } as unknown as ISignedUrlProvider;
  // Feature 172 (T C.2): lectura de los pagos registrados para derivar el pendiente. Aqui no
  // hay ninguno; lo que esta suite mide es la config de la devolucion, no el dinero.
  const service = new CierresAdminService(repo, zonaRepo, ordenRepo, signedUrls, {
    sumarVigentesPorCierre: vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, "0.00"])),
    ),
    obtenerCierreParaPago: vi.fn(async () => null),
  },
  // Feature 293 (T2.3): la lectura de PREMIOS que el servicio ahora exige. Este caso no
  // ejercita el premio, asi que devuelve "0.00" por cada id — con lo que lo pagable es
  // EXACTAMENTE el de antes, que es la no-regresion que interesa aqui.
  {
    sumarPremiosVivosPorCierre: vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, "0.00"])),
    ),
  }, sinRetenidas(),
  undefined,
  undefined,
  undefined,
  undefined,
  reglasPaisFijas(),); // FICHA 462: 7.o argumento requerido; este archivo no mide la marca
  return { service, repo, ordenRepo };
}

describe("CierresAdminService.aprobarCierre — config de devolucion de `rechazada` (feature 139/R5/R10)", () => {
  it("R5: resuelve rechazada/por_devolver_a_bodega_central/por_devolver_a_tienda + zona central y los pasa al aprobar", async () => {
    const { service, repo, ordenRepo } = newService();

    await service.aprobarCierre("c1", MAESTRO);

    const arg = (repo.resolverCierre as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.devolucionRechazadas).toEqual({
      rechazadaId: "s-rechazada",
      porDevolverId: "s-por-devolver",
      porDevolverATiendaId: "s-por-devolver-a-tienda",
      centralZonaId: "z-central",
    });
    expect(ordenRepo.findEstatusIdByValue).toHaveBeenCalledWith("devolucion_a_origen_por_rechazo");
    expect(ordenRepo.findEstatusIdByValue).toHaveBeenCalledWith("por_devolver_a_bodega_central");
    expect(ordenRepo.findEstatusIdByValue).toHaveBeenCalledWith("por_devolver_a_tienda");
  });

  it("R5 defensivo: catalogo sin `por_devolver_a_bodega_central` (seed pendiente) -> devolucionRechazadas undefined", async () => {
    const { service, repo } = newService({ ...ESTATUS_IDS, por_devolver_a_bodega_central: null });

    await service.aprobarCierre("c1", MAESTRO);

    const arg = (repo.resolverCierre as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.devolucionRechazadas).toBeUndefined();
  });

  it("R10: rechazar NO pasa la config de devolucion (solo la aprobacion dispara)", async () => {
    const { service, repo } = newService();

    await service.rechazarCierre("c1", "cuadre no coincide", MAESTRO);

    const arg = (repo.resolverCierre as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.nuevoEstado).toBe("rechazado");
    expect(arg.devolucionRechazadas).toBeUndefined();
  });

  it("la aprobacion sigue devolviendo ok/aprobado (la config no altera el resultado)", async () => {
    const { service } = newService();
    const r = await service.aprobarCierre("c1", MAESTRO);
    expect(r).toEqual({
      status: "ok",
      cierreId: "c1",
      estado: "aprobado",
      pendientePagoMensajero: "0.00", // feature 172/T C.2
    });
  });
});
