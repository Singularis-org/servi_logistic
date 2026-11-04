import { describe, expect, it } from "vitest";

import { CATEGORIA_PAGO_LABEL } from "@/app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels";
import { ROTULOS_MENSAJERO } from "@/app/(app)/wallet/mensajeros/_components/EstadoCuentaMensajero";
import { CHIP_LABEL, CHIPS_POR_TIPO } from "@/components/shared/estado-cuenta/estado-cuenta-labels";
import type { FilaEstadoCuentaDTO } from "@/lib/types/estado-cuenta";
import { claveDeParMensajero } from "@/lib/utils/estado-cuenta";
import { chipDeMensajero } from "@/lib/utils/estado-cuenta-chips";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-68 (T10, R18) — el libro del mensajero rotula el devengo como «Incentivo» y su contraasiento
// como «Anulación de incentivo» (vista de la oficina, `/mi-wallet` y descargas derivan del MISMO
// diccionario); el estado de cuenta los agrupa en «Incentivos» y los empareja como original y
// contraasiento.
//
// Los textos esperados van ESCRITOS A MANO: comparar el diccionario contra sí mismo estaría siempre
// verde (lección «aserción contra su propia fuente»).
// ═════════════════════════════════════════════════════════════════════════════════════════════

const INCENTIVO_ID = "11111111-1111-4111-8111-111111111111";
const CIERRE_ID = "22222222-2222-4222-8222-222222222222";
const REVERSO_ID = "33333333-3333-4333-8333-333333333333";

describe("SLT-68 R18 — rótulos del libro del mensajero", () => {
  it("el devengo es «Incentivo» y su contraasiento «Anulación de incentivo», distintos del premio y de los ajustes", () => {
    expect(CATEGORIA_PAGO_LABEL.incentivo).toBe("Incentivo");
    expect(CATEGORIA_PAGO_LABEL.reverso_incentivo).toBe("Anulación de incentivo");
    // D6: categoría propia; no se confunde con el premio ni con los ajustes.
    const otros = [
      CATEGORIA_PAGO_LABEL.premio_ranking,
      CATEGORIA_PAGO_LABEL.ajuste_devengo,
      CATEGORIA_PAGO_LABEL.ajuste_pago,
    ];
    expect(otros).not.toContain("Incentivo");
    expect(otros).not.toContain("Anulación de incentivo");
  });

  it("la columna «Concepto» del estado de cuenta de la oficina usa esos rótulos", () => {
    const fila = (categoria: string) => ({ categoria, origenTipo: "cierre_dia" }) as unknown as FilaEstadoCuentaDTO;
    expect(ROTULOS_MENSAJERO.concepto(fila("incentivo"))).toBe("Incentivo");
    expect(ROTULOS_MENSAJERO.concepto(fila("reverso_incentivo"))).toBe("Anulación de incentivo");
  });
});

describe("SLT-68 R18 — el filtro «Incentivos» del estado de cuenta", () => {
  it("el chip se llama «Incentivos» y el mensajero lo ofrece entre «Premios» y «Correcciones»", () => {
    expect(CHIP_LABEL.incentivos).toBe("Incentivos");
    expect(CHIPS_POR_TIPO.mensajero.map((c) => CHIP_LABEL[c])).toEqual([
      "Todo",
      "Cierres",
      "Pagos",
      "Premios",
      "Incentivos",
      "Correcciones",
    ]);
    // Solo el mensajero: ni la tienda ni la bodega tienen incentivos.
    expect(CHIPS_POR_TIPO.tienda).not.toContain("incentivos");
    expect(CHIPS_POR_TIPO.bodega).not.toContain("incentivos");
  });

  it("el incentivo y su anulación caen en «Incentivos» (no en «Premios» ni en «Correcciones»)", () => {
    expect(chipDeMensajero("incentivo", "cierre_dia", false)).toBe("incentivos");
    expect(chipDeMensajero("reverso_incentivo", "incentivo_mensajero", false)).toBe("incentivos");
  });
});

describe("SLT-68 R18 — el estado de cuenta empareja original y contraasiento", () => {
  it("el incentivo es el original y su reverso, que lo nombra por `origen_id`, el contraasiento del MISMO par", () => {
    const original = claveDeParMensajero({
      id: INCENTIVO_ID,
      tipo: "devengo",
      categoria: "incentivo",
      origenTipo: "cierre_dia",
      origenId: CIERRE_ID,
      premioDia: null,
    });
    const contra = claveDeParMensajero({
      id: REVERSO_ID,
      tipo: "pago",
      categoria: "reverso_incentivo",
      origenTipo: "incentivo_mensajero",
      origenId: INCENTIVO_ID,
      premioDia: null,
    });
    expect(original).toEqual({ clave: `incentivo:${INCENTIVO_ID}`, esContra: false });
    expect(contra).toEqual({ clave: `incentivo:${INCENTIVO_ID}`, esContra: true });
  });

  it("dos incentivos del mismo cierre NO se emparejan entre sí (cada uno es su propio documento)", () => {
    const otro = "44444444-4444-4444-8444-444444444444";
    const a = claveDeParMensajero({ id: INCENTIVO_ID, tipo: "devengo", categoria: "incentivo", origenTipo: "cierre_dia", origenId: CIERRE_ID, premioDia: null });
    const b = claveDeParMensajero({ id: otro, tipo: "devengo", categoria: "incentivo", origenTipo: "cierre_dia", origenId: CIERRE_ID, premioDia: null });
    expect(a?.clave).not.toBe(b?.clave);
  });
});
