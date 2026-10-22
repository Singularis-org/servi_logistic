import { describe, it, expect } from "vitest";
import {
  TOPE_ORDENES_POR_LOTE,
  confirmarEntregaTiendaSchema,
  rutaComprobanteDevolucionTienda,
} from "@/lib/types/devolucion-tienda";

// FICHA 419 (B3; R3/R4/R5/R23) — schema del borde de `confirmarEntregaTienda`. El comprobante usa
// los MISMOS limites que la evidencia de gestion de la 119 (jpeg/png/webp, 5 MB, 1..3).

const TIENDA = "11111111-1111-4111-8111-111111111111";
const O1 = "22222222-2222-4222-8222-222222222221";
const MB = 1024 * 1024;
const foto = (type = "image/jpeg", size = 10) => ({ type, size });

const valido = () => ({ tiendaId: TIENDA, ordenIds: [O1], evidencias: [foto()] });

function campos(input: unknown): string[] {
  const r = confirmarEntregaTiendaSchema.safeParse(input);
  if (r.success) return [];
  return Object.keys(r.error.flatten().fieldErrors);
}

describe("419 — confirmarEntregaTiendaSchema", () => {
  it("acepta un lote valido (1 orden, 1..3 archivos de los tres tipos)", () => {
    expect(confirmarEntregaTiendaSchema.safeParse(valido()).success).toBe(true);
    const tres = { ...valido(), evidencias: [foto("image/jpeg"), foto("image/png"), foto("image/webp", 5 * MB)] };
    expect(confirmarEntregaTiendaSchema.safeParse(tres).success).toBe(true);
  });

  it("R3: sin archivos (lista vacia o ausente) -> error en evidencias", () => {
    expect(campos({ ...valido(), evidencias: [] })).toEqual(["evidencias"]);
    const { evidencias: _e, ...sin } = valido();
    void _e;
    expect(campos(sin)).toEqual(["evidencias"]);
  });

  it.each([
    ["tipo no admitido (pdf)", [foto("application/pdf")]],
    ["archivo vacio", [foto("image/jpeg", 0)]],
    ["supera 5 MB", [foto("image/jpeg", 5 * MB + 1)]],
    ["mas de 3 archivos", [foto(), foto(), foto(), foto()]],
  ])("R4: %s -> error en evidencias", (_n, evidencias) => {
    expect(campos({ ...valido(), evidencias })).toEqual(["evidencias"]);
  });

  it.each([
    ["sin ordenes", []],
    ["uuid mal formado", ["no-es-uuid"]],
    [`mas de ${TOPE_ORDENES_POR_LOTE}`, Array.from({ length: TOPE_ORDENES_POR_LOTE + 1 }, () => O1)],
  ])("R5: %s -> error en ordenIds", (_n, ordenIds) => {
    expect(campos({ ...valido(), ordenIds })).toEqual(["ordenIds"]);
  });

  it("R5: exactamente el tope pasa", () => {
    const ordenIds = Array.from({ length: TOPE_ORDENES_POR_LOTE }, () => O1);
    expect(confirmarEntregaTiendaSchema.safeParse({ ...valido(), ordenIds }).success).toBe(true);
    expect(TOPE_ORDENES_POR_LOTE).toBe(300);
  });

  it("R5: sin tienda o tienda mal formada -> error en tiendaId", () => {
    const { tiendaId: _t, ...sin } = valido();
    void _t;
    expect(campos(sin)).toEqual(["tiendaId"]);
    expect(campos({ ...valido(), tiendaId: "x" })).toEqual(["tiendaId"]);
  });

  it("R23: la ruta es devolucion-tienda/<uuid>.<ext>", () => {
    const u = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(rutaComprobanteDevolucionTienda(u, "image/jpeg")).toBe(`devolucion-tienda/${u}.jpg`);
    expect(rutaComprobanteDevolucionTienda(u, "image/png")).toBe(`devolucion-tienda/${u}.png`);
    expect(rutaComprobanteDevolucionTienda(u, "image/webp")).toBe(`devolucion-tienda/${u}.webp`);
  });
});
