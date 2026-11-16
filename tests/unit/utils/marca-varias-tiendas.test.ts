// SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres sin uso» (R642) —
// `marcaDeVariasTiendas` se mudó de `DesglosePorTienda.tsx` (retirado) a `cierre-labels.ts`, con la
// misma firma. Los textos esperados van escritos a mano: compararlos con `totalDeVariasTiendasNota`
// estaría siempre en verde aunque la frase cambiara.
import { describe, expect, it } from "vitest";

import { marcaDeVariasTiendas } from "@/app/(app)/cierres-admin/_components/cierre-labels";
import type { ParteDeTienda } from "@/lib/utils/ingreso-empresa";

function tiendas(cuantas: number): ParteDeTienda[] {
  return Array.from({ length: cuantas }, (_, i) => ({
    tiendaId: `t-${i + 1}`,
    tiendaNombre: `Tienda ${i + 1}`,
    recaudado: "1000.00",
    pagoTienda: "900.00",
    ganaLaTienda: "900.00",
  }));
}

describe("R642 — marcaDeVariasTiendas vive en cierre-labels y conserva su umbral", () => {
  it("sin tiendas no hay marca", () => {
    expect(marcaDeVariasTiendas([])).toBeNull();
  });

  it("con una sola tienda no hay marca", () => {
    expect(marcaDeVariasTiendas(tiendas(1))).toBeNull();
  });

  it("con dos tiendas dice «2»", () => {
    expect(marcaDeVariasTiendas(tiendas(2))).toBe(
      "Es el total de las 2 tiendas de este cierre, sumadas. Abajo, cuánto le toca a cada una.",
    );
  });

  it("con tres tiendas dice «3», no un plural genérico", () => {
    expect(marcaDeVariasTiendas(tiendas(3))).toBe(
      "Es el total de las 3 tiendas de este cierre, sumadas. Abajo, cuánto le toca a cada una.",
    );
  });
});
