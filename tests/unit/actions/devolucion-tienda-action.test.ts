import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IDevolucionTiendaService } from "@/lib/interfaces/services/IDevolucionTiendaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// FICHA 419 (B9) — borde de `confirmarEntregaTienda`: sesion, zod (R3/R4/R5) y lectura del
// FormData; y el COMPOSITION ROOT, que debe PASAR el bucket de gestion a storage y firmador (no
// basta con importarlo).

const infra = vi.hoisted(() => ({
  storageCtor: vi.fn<(...args: unknown[]) => void>(),
  urlsCtor: vi.fn<(...args: unknown[]) => void>(),
  // El repo REAL sobre este doble: `findUnique` del enlace -> null (orden sin comprobante).
  prisma: vi.fn<() => unknown>(() => ({ devolucionTiendaOrden: { findUnique: async () => null } })),
}));

vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: infra.prisma }));
vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn(async () => null) }));
vi.mock("@/lib/storage/SupabaseFileStorage", () => ({
  SupabaseFileStorage: class {
    constructor(...args: unknown[]) {
      infra.storageCtor(...args);
    }
  },
}));
vi.mock("@/lib/storage/SupabaseSignedUrlProvider", () => ({
  SupabaseSignedUrlProvider: class {
    constructor(...args: unknown[]) {
      infra.urlsCtor(...args);
    }
  },
}));

import {
  confirmarEntregaTienda,
  verComprobanteDevolucionTienda,
} from "@/lib/actions/devolucion-tienda";
import { gestionConfig } from "@/lib/config/gestion";

const TIENDA = "11111111-1111-4111-8111-111111111111";
const O1 = "22222222-2222-4222-8222-222222222221";
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };

function archivo(type = "image/jpeg", size = 10) {
  return new File([new Uint8Array(size)], "foto", { type });
}

function form(opts: { tienda?: string | null; ordenes?: string[]; archivos?: File[] } = {}): FormData {
  const fd = new FormData();
  if (opts.tienda !== null) fd.append("tiendaId", opts.tienda ?? TIENDA);
  for (const o of opts.ordenes ?? [O1]) fd.append("ordenId", o);
  for (const a of opts.archivos ?? [archivo()]) fd.append("evidencia", a);
  return fd;
}

function servicio(): IDevolucionTiendaService {
  return {
    confirmarEntrega: vi.fn(async () => ({ status: "ok" as const, devueltas: 1, desenlaces: [] })),
    verComprobante: vi.fn(async () => ({ status: "no_encontrado" as const })),
  };
}

describe("419 — confirmarEntregaTienda (borde)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sin sesion -> unauthenticated, sin llamar al servicio", async () => {
    const s = servicio();
    const r = await confirmarEntregaTienda(form(), { service: s, getActor: async () => null });
    expect(r).toEqual({ status: "unauthenticated" });
    expect(s.confirmarEntrega).not.toHaveBeenCalled();
  });

  const invalidos: [string, FormData, string][] = [
    ["R3: sin comprobante", form({ archivos: [] }), "evidencias"],
    ["R4: tipo no admitido", form({ archivos: [archivo("application/pdf")] }), "evidencias"],
    ["R4: vacio", form({ archivos: [archivo("image/png", 0)] }), "evidencias"],
    ["R4: mas de 3", form({ archivos: [archivo(), archivo(), archivo(), archivo()] }), "evidencias"],
    ["R5: sin ordenes", form({ ordenes: [] }), "ordenIds"],
    ["R5: id mal formado", form({ ordenes: ["no-es-uuid"] }), "ordenIds"],
    ["R5: sin tienda", form({ tienda: null }), "tiendaId"],
  ];
  it.each(invalidos)("%s -> validation_error, sin llamar al servicio", async (_n, fd, campo) => {
    const s = servicio();
    const r = await confirmarEntregaTienda(fd, { service: s, getActor: async () => ADMIN });
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toContain(campo);
    expect(s.confirmarEntrega).not.toHaveBeenCalled();
  });

  it("valido -> el servicio recibe tienda, ordenes y los BINARIOS de cada archivo, con el actor", async () => {
    const s = servicio();
    const fd = form({ ordenes: [O1], archivos: [archivo("image/png", 4), archivo("image/webp", 2)] });
    const r = await confirmarEntregaTienda(fd, { service: s, getActor: async () => ADMIN });
    expect(r.status).toBe("ok");
    const [input, actor] = vi.mocked(s.confirmarEntrega).mock.calls[0];
    expect(actor).toBe(ADMIN);
    expect(input.tiendaId).toBe(TIENDA);
    expect(input.ordenIds).toEqual([O1]);
    expect(input.evidencias.map((e) => [e.contentType, e.bytes.byteLength])).toEqual([
      ["image/png", 4],
      ["image/webp", 2],
    ]);
  });

  it("composition root: storage y firmador sobre el bucket de gestion (`gestion-evidencias`)", async () => {
    // Sin `service` inyectado: el borde construye el servicio REAL (repo + storage + firmador).
    const r = await verComprobanteDevolucionTienda(
      { ordenId: O1 },
      { getActor: async () => ADMIN },
    );
    expect(r).toEqual({ status: "no_encontrado" });
    expect(infra.prisma).toHaveBeenCalled();
    expect(infra.storageCtor).toHaveBeenCalledWith(undefined, gestionConfig.EVIDENCIA_BUCKET);
    expect(infra.urlsCtor).toHaveBeenCalledWith(undefined, gestionConfig.EVIDENCIA_BUCKET);
    expect(gestionConfig.EVIDENCIA_BUCKET).toBe(process.env.GESTION_EVIDENCIA_BUCKET?.trim() || "gestion-evidencias");
  });
});
