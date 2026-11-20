import { describe, it, expect } from "vitest";

import { motivoObligatoriasPendientes } from "@/lib/services/CierreDiaService";
import { toSinGestionRow } from "@/lib/utils/cierre-sin-gestion";

/**
 * SLT-247 — las dos piezas puras de la tanda de backend:
 *   R1782  el motivo del conflicto al reenviar con barridas sin gestionar (design §4);
 *   R1791  la marca `fueraDeNovedadInterna` de la barrida que el rechazo devolvio (design §6).
 * Los textos son el CONTRATO que lee el mensajero: van literales a proposito.
 */

describe("SLT-247/R1782 — motivoObligatoriasPendientes", () => {
  it("plural: cuantas faltan y sus guias, la ultima con «y»", () => {
    expect(motivoObligatoriasPendientes([1201, 1202, 1250], 3)).toBe(
      "Antes de enviar de nuevo este cierre tienes que gestionar 3 órdenes que pasaron a Novedad interna: " +
        "guía 1201, 1202 y 1250. Están en Entregas.",
    );
  });

  it("singular: «1 orden que pasó» y «Está»", () => {
    expect(motivoObligatoriasPendientes([1201], 1)).toBe(
      "Antes de enviar de nuevo este cierre tienes que gestionar 1 orden que pasó a Novedad interna: " +
        "guía 1201. Está en Entregas.",
    );
  });

  it("mas de 10: nombra 10 y resume el resto con «y N más»", () => {
    const guias = Array.from({ length: 13 }, (_, i) => 900 + i);
    expect(motivoObligatoriasPendientes(guias, 13)).toBe(
      "Antes de enviar de nuevo este cierre tienes que gestionar 13 órdenes que pasaron a Novedad interna: " +
        "guía 900, 901, 902, 903, 904, 905, 906, 907, 908, 909 y 3 más. Están en Entregas.",
    );
  });

  it("una guia nula se nombra «una orden sin guía»", () => {
    expect(motivoObligatoriasPendientes([1201, null], 2)).toBe(
      "Antes de enviar de nuevo este cierre tienes que gestionar 2 órdenes que pasaron a Novedad interna: " +
        "guía 1201 y una orden sin guía. Están en Entregas.",
    );
  });
});

describe("SLT-247/R1791 — toSinGestionRow marca la barrida que ya no esta en novedad_interna", () => {
  const fila = (value: string | undefined) => ({
    ordenId: "o1",
    numGuia: 5,
    numRemision: "R-5",
    destinatario: "Ana",
    producto: "Sobre",
    tiendaNombre: "T",
    zonaNombre: "Z",
    estatusOrigen: { value: "en_reparto" },
    orden: value === undefined ? undefined : { estatus: { value } },
  });

  it("en `en_reparto` (devuelta por el rechazo) -> `fueraDeNovedadInterna: true`", () => {
    expect(toSinGestionRow(fila("en_reparto") as never)).toMatchObject({ fueraDeNovedadInterna: true });
  });

  it("en `novedad_interna` -> sin la marca (como hoy)", () => {
    expect(toSinGestionRow(fila("novedad_interna") as never)).not.toHaveProperty("fueraDeNovedadInterna");
  });

  it("sin el estado de la orden en la fila -> sin la marca", () => {
    expect(toSinGestionRow(fila(undefined) as never)).not.toHaveProperty("fueraDeNovedadInterna");
  });
});
