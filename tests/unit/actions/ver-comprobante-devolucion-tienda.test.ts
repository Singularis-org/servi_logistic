import { describe, it, expect, vi } from "vitest";
import { verComprobanteDevolucionTienda } from "@/lib/actions/devolucion-tienda";
import { DevolucionTiendaService } from "@/lib/services/DevolucionTiendaService";
import type { IDevolucionTiendaRepository } from "@/lib/interfaces/repositories/IDevolucionTiendaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// FICHA 419 (B9; R22/R23) — `verComprobanteDevolucionTienda` con el SERVICIO REAL y un repo doble:
// un rol ajeno y una orden sin comprobante reciben EXACTAMENTE el mismo resultado (no se revela si
// el comprobante existe); maestro/admin reciben URLs firmadas y nunca la ruta interna.

vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn(async () => null) }));

const CON = "33333333-3333-4333-8333-333333333331";
const SIN = "33333333-3333-4333-8333-333333333332";
const RUTA = "devolucion-tienda/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp";

function service() {
  const repo: IDevolucionTiendaRepository = {
    findEstatusIdByValue: vi.fn(),
    esTienda: vi.fn(),
    confirmarEntregaLote: vi.fn(),
    findOrdenesParaReporte: vi.fn(),
    findComprobanteDeOrden: vi.fn(async (id: string) =>
      id === CON
        ? {
            createdAt: new Date("2026-10-21T12:00:00.000Z"),
            subidoPorNombre: "Admin Central",
            evidencias: [{ storagePath: RUTA, contentType: "image/webp", indice: 0 }],
          }
        : null,
    ),
  };
  return new DevolucionTiendaService(
    repo,
    { upload: vi.fn(), remove: vi.fn() },
    {
      createSignedUrl: vi.fn(),
      createSignedUrls: vi.fn(async (ps: string[]) => Object.fromEntries(ps.map((p) => [p, `https://f/${p}?t=1`]))),
    },
  );
}

const as = (rol: Actor["rol"]): (() => Promise<Actor>) => async () => ({ usuarioId: `u-${rol}`, rol });

describe("419/R22 — ver el comprobante de entrega", () => {
  it("rol ajeno sobre una orden CON comprobante y admin sobre una orden SIN comprobante: mismo resultado", async () => {
    const svc = service();
    const ajenos = await Promise.all(
      (["adminSatelite", "adminTienda", "mensajero"] as const).map((rol) =>
        verComprobanteDevolucionTienda({ ordenId: CON }, { service: svc, getActor: as(rol) }),
      ),
    );
    const sinEnlace = await verComprobanteDevolucionTienda({ ordenId: SIN }, { service: svc, getActor: as("admin") });
    for (const r of ajenos) expect(r).toEqual(sinEnlace);
    expect(sinEnlace).toEqual({ status: "no_encontrado" });
  });

  it.each(["maestro", "admin"] as const)("%s recibe la URL firmada y nunca la ruta interna (R23)", async (rol) => {
    const r = await verComprobanteDevolucionTienda({ ordenId: CON }, { service: service(), getActor: as(rol) });
    expect(r).toEqual({
      status: "ok",
      confirmadoAt: "2026-10-21T12:00:00.000Z",
      confirmadoPor: "Admin Central",
      archivos: [{ url: `https://f/${RUTA}?t=1`, contentType: "image/webp", indice: 0 }],
    });
    expect(JSON.stringify(r)).not.toContain("storagePath");
  });

  it("sin sesion -> unauthenticated; ordenId mal formado -> validation_error", async () => {
    expect(await verComprobanteDevolucionTienda({ ordenId: CON }, { service: service(), getActor: async () => null })).toEqual({
      status: "unauthenticated",
    });
    const r = await verComprobanteDevolucionTienda({ ordenId: "x" }, { service: service(), getActor: as("admin") });
    expect(r.status).toBe("validation_error");
  });
});
