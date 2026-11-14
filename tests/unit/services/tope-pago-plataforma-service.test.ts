import { describe, it, expect, vi } from "vitest";

import type { IPagoPlataformaRepository } from "@/lib/interfaces/repositories/IPagoPlataformaRepository";
import type { TopePagoPlataformaTx } from "@/lib/interfaces/services/ITopePagoPlataformaService";
import { TopePagoPlataformaService } from "@/lib/services/TopePagoPlataformaService";

// SL-45 (design §6, §12.3) y SLT-60 (design §4.2; R2, R3, R5) — el tope del pago a la plataforma, con
// dobles. Lo disponible (saldo de las facturas cerradas − pagos por confirmar) lo calcula la base; aquí
// se prueba la comparación y el orden. El SQL se prueba contra Postgres en
// `pago-plataforma-confirmacion.test.ts` y en `pago-plataforma-sl45-concurrencia.test.ts`.

const TX = { marca: "tx-del-registro" } as unknown as TopePagoPlataformaTx;

function montar(disponible: string, claveYa = false) {
  const orden: string[] = [];
  const bloquear = vi.fn<IPagoPlataformaRepository["bloquear"]>(async () => {
    orden.push("candado");
  });
  const claveYaRegistrada = vi.fn<IPagoPlataformaRepository["claveYaRegistrada"]>(async () => {
    orden.push("clave");
    return claveYa;
  });
  const disponibleParaRegistrar = vi.fn<IPagoPlataformaRepository["disponibleParaRegistrar"]>(async () => {
    orden.push("disponible");
    return disponible;
  });
  // La deuda no decide el tope (decisión del 2026-11-13): si el servicio la leyera, el doble lo delata.
  const sumaPagosConfirmados = vi.fn<IPagoPlataformaRepository["sumaPagosConfirmados"]>(async () => "0.00");
  const tope = new TopePagoPlataformaService({
    sumaPagosConfirmados,
    disponibleParaRegistrar,
    bloquear,
    claveYaRegistrada,
  });
  return { tope, orden, bloquear, claveYaRegistrada, disponibleParaRegistrar, sumaPagosConfirmados };
}

const pago = (monto: string) => ({ organizacionId: "org-a", monto, claveIdempotencia: "clave-1" });

describe("SLT-60 — TopePagoPlataformaService.comprobar compara con lo disponible (R2)", () => {
  it("R2: con 180 000,00 disponibles (380 000 cerradas − 200 000 por confirmar), pagar 180 000,00 cabe (el borde exacto)", async () => {
    const { tope } = montar("180000.00");
    expect(await tope.comprobar(TX, pago("180000.00"))).toBe("cabe");
  });

  it("R2: con 180 000,00 disponibles, pagar 180 000,01 supera (un céntimo más)", async () => {
    const { tope } = montar("180000.00");
    expect(await tope.comprobar(TX, pago("180000.01"))).toBe("supera");
  });

  it("R2: con 180 000,00 disponibles, pagar 0,01 cabe", async () => {
    const { tope } = montar("180000.00");
    expect(await tope.comprobar(TX, pago("0.01"))).toBe("cabe");
  });

  it("R2: los importes grandes se comparan sin perder céntimos", async () => {
    const { tope } = montar("1234567890123456.78");
    expect(await tope.comprobar(TX, pago("1234567890123456.78"))).toBe("cabe");
    expect(await tope.comprobar(TX, pago("1234567890123456.79"))).toBe("supera");
  });

  it("no lee la deuda: el tope sale solo de lo disponible", async () => {
    const { tope, sumaPagosConfirmados } = montar("500.00");
    await tope.comprobar(TX, pago("100.00"));
    expect(sumaPagosConfirmados).not.toHaveBeenCalled();
  });
});

describe("SLT-60 — sin nada disponible, cualquier pago supera (R3)", () => {
  it("R3: con 0,00 disponibles (sin facturas cerradas con saldo), pagar 0,01 supera", async () => {
    const { tope } = montar("0.00");
    expect(await tope.comprobar(TX, pago("0.01"))).toBe("supera");
  });

  it("R3: con lo disponible negativo (−30 000,00, una cerrada a favor), pagar 0,01 supera", async () => {
    const { tope } = montar("-30000.00");
    expect(await tope.comprobar(TX, pago("0.01"))).toBe("supera");
  });

  it("R3: con lo disponible negativo, ni un monto negativo cabe (el ≤ 0 se mira antes de comparar)", async () => {
    // El borde ya rechaza montos ≤ 0; el tope no se fía de él: con −30 000 disponibles, −40 000 sería
    // «menor» y cabría si solo se comparara.
    const { tope } = montar("-30000.00");
    expect(await tope.comprobar(TX, pago("-40000.00"))).toBe("supera");
  });
});

describe("SL-45 / SLT-60 — el candado, la clave y la transacción (R5, R11 de SL-45)", () => {
  it("R5: toma el candado ANTES de mirar la clave y de leer lo disponible, y todo con el tx del registro", async () => {
    const { tope, orden, bloquear, claveYaRegistrada, disponibleParaRegistrar } = montar("500.00");
    await tope.comprobar(TX, pago("100.00"));
    expect(orden).toEqual(["candado", "clave", "disponible"]);
    expect(bloquear).toHaveBeenCalledWith(TX);
    expect(claveYaRegistrada).toHaveBeenCalledWith("org-a", "clave-1", TX);
    expect(disponibleParaRegistrar).toHaveBeenCalledWith("org-a", TX);
  });

  it("si la clave ya tiene su pago, responde reenvío sin comparar, aunque el monto supere lo disponible", async () => {
    const { tope, orden, disponibleParaRegistrar } = montar("0.00", true);
    expect(await tope.comprobar(TX, pago("1000.00"))).toBe("reenvio");
    expect(orden).toEqual(["candado", "clave"]);
    expect(disponibleParaRegistrar).not.toHaveBeenCalled();
  });
});
