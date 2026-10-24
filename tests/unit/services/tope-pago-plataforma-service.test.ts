import { describe, it, expect, vi } from "vitest";

import type {
  ICobroPlataformaMovimientoRepository,
  SumaCobroPlataformaPorTipo,
} from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";
import type { IPagoPlataformaRepository } from "@/lib/interfaces/repositories/IPagoPlataformaRepository";
import type { TopePagoPlataformaTx } from "@/lib/interfaces/services/ITopePagoPlataformaService";
import { TopePagoPlataformaService } from "@/lib/services/TopePagoPlataformaService";

// SL-45 (design §6, §12.3; R9, R10, R11) — el tope del pago a la plataforma, con dobles. El SQL del
// candado y de las sumas se prueba contra Postgres en `pago-plataforma-sl45.test.ts` y en
// `pago-plataforma-sl45-concurrencia.test.ts`.

const TX = { marca: "tx-del-registro" } as unknown as TopePagoPlataformaTx;

function montar(sumas: SumaCobroPlataformaPorTipo[], pagosVigentes: string, claveYa = false) {
  const orden: string[] = [];
  const sumasPorTipo = vi.fn<ICobroPlataformaMovimientoRepository["sumasPorTipo"]>(async () => {
    orden.push("sumas");
    return sumas;
  });
  const sumaPagosVigentes = vi.fn<IPagoPlataformaRepository["sumaPagosVigentes"]>(async () => {
    orden.push("pagos");
    return pagosVigentes;
  });
  const bloquear = vi.fn<IPagoPlataformaRepository["bloquear"]>(async () => {
    orden.push("candado");
  });
  const claveYaRegistrada = vi.fn<IPagoPlataformaRepository["claveYaRegistrada"]>(async () => {
    orden.push("clave");
    return claveYa;
  });
  const tope = new TopePagoPlataformaService({ sumasPorTipo }, { sumaPagosVigentes, bloquear, claveYaRegistrada });
  return { tope, orden, sumasPorTipo, sumaPagosVigentes, bloquear, claveYaRegistrada };
}

const cargo = (monto: string): SumaCobroPlataformaPorTipo => ({ tipo: "cargo", monto });
const reverso = (monto: string): SumaCobroPlataformaPorTipo => ({ tipo: "reverso", monto });
const pago = (monto: string) => ({ organizacionId: "org-a", monto, claveIdempotencia: "clave-1" });

describe("SL-45 — TopePagoPlataformaService.comprobar (R9)", () => {
  it("con una deuda de 500,00, pagar 500,00 cabe (el borde exacto)", async () => {
    const { tope } = montar([cargo("1500.00")], "1000.00");
    expect(await tope.comprobar(TX, pago("500.00"))).toBe("cabe");
  });

  it("con una deuda de 500,00, pagar 500,01 supera (un céntimo más)", async () => {
    const { tope } = montar([cargo("1500.00")], "1000.00");
    expect(await tope.comprobar(TX, pago("500.01"))).toBe("supera");
  });

  it("con una deuda de 500,00, pagar 1,00 cabe", async () => {
    const { tope } = montar([cargo("1500.00")], "1000.00");
    expect(await tope.comprobar(TX, pago("1.00"))).toBe("cabe");
  });

  it("al día (deuda 0,00), cualquier pago supera, aunque sea un céntimo", async () => {
    const { tope } = montar([cargo("500.00")], "500.00");
    expect(await tope.comprobar(TX, pago("0.01"))).toBe("supera");
  });

  it("sin cargos ni pagos, supera", async () => {
    const { tope } = montar([], "0.00");
    expect(await tope.comprobar(TX, pago("1.00"))).toBe("supera");
  });

  it("con saldo a favor (deuda −500,00), supera", async () => {
    const { tope } = montar([cargo("1500.00"), reverso("500.00")], "1500.00");
    expect(await tope.comprobar(TX, pago("1.00"))).toBe("supera");
  });

  it("los importes grandes se comparan sin perder céntimos", async () => {
    const { tope } = montar([cargo("1234567890123456.78")], "0.00");
    expect(await tope.comprobar(TX, pago("1234567890123456.78"))).toBe("cabe");
    expect(await tope.comprobar(TX, pago("1234567890123456.79"))).toBe("supera");
  });
});

describe("SL-45 — el candado, la clave y la transacción (R10, R11, R20)", () => {
  it("toma el candado ANTES de mirar la clave y de leer la deuda, y todo con el tx del registro", async () => {
    const { tope, orden, bloquear, claveYaRegistrada, sumasPorTipo, sumaPagosVigentes } = montar([cargo("500.00")], "0.00");
    await tope.comprobar(TX, pago("100.00"));
    expect(orden).toEqual(["candado", "clave", "sumas", "pagos"]);
    expect(bloquear).toHaveBeenCalledWith(TX);
    expect(claveYaRegistrada).toHaveBeenCalledWith("org-a", "clave-1", TX);
    expect(sumasPorTipo).toHaveBeenCalledWith("org-a", TX);
    expect(sumaPagosVigentes).toHaveBeenCalledWith("org-a", TX);
  });

  it("si la clave ya tiene su pago, responde reenvío sin comparar, aunque el monto supere la deuda", async () => {
    const { tope, orden, sumasPorTipo, sumaPagosVigentes } = montar([cargo("500.00")], "0.00", true);
    expect(await tope.comprobar(TX, pago("1000.00"))).toBe("reenvio");
    expect(orden).toEqual(["candado", "clave"]);
    expect(sumasPorTipo).not.toHaveBeenCalled();
    expect(sumaPagosVigentes).not.toHaveBeenCalled();
  });
});
