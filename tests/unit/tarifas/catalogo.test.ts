import { describe, it, expect } from "vitest";
import { GestionResultado, TarifaConcepto } from "@prisma/client";

import {
  CATALOGO_CONCEPTOS,
  CONCEPTOS,
  CONCEPTOS_PAGO,
  CONCEPTOS_TIENDA,
  actorDe,
  conceptoPorResultado,
} from "@/lib/tarifas/catalogo";

/**
 * SLT-52 T2.1 (R1, R2, R27, R28) — el catalogo de conceptos frente a DOS fuentes que no son el:
 * el enum `TarifaConcepto` generado desde `db/schema.prisma` (lo que la base acepta) y el enum
 * `GestionResultado` (los resultados que la app sabe registrar). Nunca se compara el catalogo
 * consigo mismo: eso estaria siempre en verde.
 *
 * `RESULTADOS` sale del enum generado y no de una lista escrita aqui a proposito: R2 pide que un
 * resultado NUEVO de la app ponga esto en rojo, y solo una lista viva puede enterarse de el.
 */
const RESULTADOS: string[] = [...Object.values(GestionResultado)];
const ACTORES = ["tienda", "mensajero", "satelite"] as const;

describe("R1 · el catalogo es exactamente el enum `tarifa_concepto`", () => {
  it("tiene los mismos conceptos que el enum de la base, ni uno mas ni uno menos", () => {
    expect([...CONCEPTOS].sort()).toEqual(Object.values(TarifaConcepto).sort());
  });

  it("son 17: 5 fletes + fulfillment + comision a la tienda, 5 pagos al mensajero y 5 a la satelite", () => {
    // Literal a mano: si un dia cambia, cambia la decision de negocio, no un detalle.
    expect(CONCEPTOS).toHaveLength(17);
    expect(CONCEPTOS_TIENDA).toHaveLength(7);
    expect(CONCEPTOS_PAGO).toHaveLength(10);
  });

  it("los conceptos de cobro a la tienda son los siete esperados (escritos a mano)", () => {
    expect([...CONCEPTOS_TIENDA].sort()).toEqual([
      "tienda_comision_cod",
      "tienda_flete_entregado",
      "tienda_flete_incidente",
      "tienda_flete_novedad",
      "tienda_flete_rechazo",
      "tienda_flete_reprogramado",
      "tienda_fulfillment",
    ]);
  });

  it("fulfillment y comision COD son de la tienda y no dependen de ningun resultado", () => {
    expect(CATALOGO_CONCEPTOS.tienda_fulfillment).toEqual({ actor: "tienda", resultado: null, base: "pedido" });
    expect(CATALOGO_CONCEPTOS.tienda_comision_cod).toEqual({ actor: "tienda", resultado: null, base: "pedido" });
  });

  it("ningun concepto de pago (mensajero o satelite) existe sin un resultado de gestion", () => {
    for (const c of CONCEPTOS_PAGO) {
      expect(CATALOGO_CONCEPTOS[c].resultado, c).not.toBeNull();
      expect(actorDe(c), c).not.toBe("tienda");
    }
  });

  it("todo resultado del catalogo es un valor real de `GestionResultado`", () => {
    for (const c of CONCEPTOS) {
      const r = CATALOGO_CONCEPTOS[c].resultado;
      if (r !== null) expect(RESULTADOS, c).toContain(r);
    }
  });
});

describe("R2 · cada resultado de gestion tiene flete a la tienda, pago al mensajero y pago a la satelite", () => {
  it("la lista de resultados no esta vacia (el test no puede pasar sin datos)", () => {
    expect(RESULTADOS.length).toBeGreaterThan(0);
  });

  it.each(RESULTADOS.flatMap((r) => ACTORES.map((a) => [r, a] as const)))(
    "resultado %s tiene exactamente un concepto para %s",
    (resultado, actor) => {
      const conceptos = CONCEPTOS.filter(
        (c) => CATALOGO_CONCEPTOS[c].actor === actor && CATALOGO_CONCEPTOS[c].resultado === resultado,
      );
      expect(conceptos).toHaveLength(1);
    },
  );

  it("`conceptoPorResultado` traduce el rechazo al nombre corto del enum", () => {
    expect(conceptoPorResultado("tienda", "devolucion_a_origen_por_rechazo")).toBe("tienda_flete_rechazo");
    expect(conceptoPorResultado("mensajero", "devolucion_a_origen_por_rechazo")).toBe("mensajero_rechazo");
    expect(conceptoPorResultado("satelite", "devolucion_a_origen_por_rechazo")).toBe("satelite_rechazo");
    expect(conceptoPorResultado("tienda", "entregado")).toBe("tienda_flete_entregado");
    expect(conceptoPorResultado("mensajero", "incidente")).toBe("mensajero_incidente");
    expect(conceptoPorResultado("satelite", "reprogramado")).toBe("satelite_reprogramado");
  });

  it("`conceptoPorResultado` lanza ante un resultado sin catalogar en vez de cobrar 0 en silencio", () => {
    expect(() => conceptoPorResultado("mensajero", "extraviado" as GestionResultado)).toThrow(
      /sin concepto para actor=mensajero resultado=extraviado/,
    );
  });
});

describe("R27/R28 · base del porcentaje fijada por la app", () => {
  it("todo cobro a la tienda va sobre el valor del pedido (R27)", () => {
    for (const c of CONCEPTOS_TIENDA) expect(CATALOGO_CONCEPTOS[c].base, c).toBe("pedido");
  });

  it("todo pago al mensajero o a la satelite va sobre el flete (R28)", () => {
    for (const c of CONCEPTOS_PAGO) expect(CATALOGO_CONCEPTOS[c].base, c).toBe("flete");
  });
});
