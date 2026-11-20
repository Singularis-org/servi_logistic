// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MonedaDelPaisProvider } from "@/providers/MonedaDelPaisProvider";
import { useImpuestoDelPais, useMonedaDelPais } from "@/hooks/use-moneda-del-pais";
import { MONEDA_PLATAFORMA, type FormatoMoneda } from "@/lib/config/moneda";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import { MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-235 — Moneda e impuesto del país en las pantallas de la empresa
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Un archivo para toda la ficha (design §10): primero los hooks (T2.1), y después un `describe` por
// pantalla de design §7 (bloque 3) y el censo de R18. Las piezas comunes van arriba para que cada
// pantalla monte con el mismo proveedor de prueba.

/**
 * El país de prueba: una moneda distinta en todo de la de CR y otro nombre de impuesto, para que un
 * test no pase por casualidad con lo de la plataforma.
 */
const IMPUESTO_DE_PRUEBA = "IGV";

/** Envoltorio con el proveedor del portal; sin argumentos, el país de prueba. */
function conPais(moneda: FormatoMoneda = MONEDA_DE_PRUEBA, impuestoNombre: string = IMPUESTO_DE_PRUEBA) {
  return function Envoltorio({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MonedaDelPaisProvider moneda={moneda} impuestoNombre={impuestoNombre}>
        {children}
      </MonedaDelPaisProvider>
    );
  };
}

describe("SLT-235/T2.1 — hooks de la moneda y el impuesto del país", () => {
  it("R15: sin proveedor, useMonedaDelPais da la moneda de la plataforma y no lanza", () => {
    const { result } = renderHook(() => useMonedaDelPais());
    expect(result.current).toBe(MONEDA_PLATAFORMA);
  });

  it("R15: sin proveedor, useImpuestoDelPais da el rótulo de la plataforma", () => {
    const { result } = renderHook(() => useImpuestoDelPais());
    expect(result.current).toBe(IMPUESTO_ROTULO);
  });

  it("R11: con el proveedor de prueba, useMonedaDelPais da la moneda del país, no la de la plataforma", () => {
    const { result } = renderHook(() => useMonedaDelPais(), { wrapper: conPais() });
    expect(result.current).toEqual(MONEDA_DE_PRUEBA);
    expect(result.current).not.toEqual(MONEDA_PLATAFORMA);
  });

  it("R17: con el proveedor de prueba, useImpuestoDelPais da «IGV», el nombre del impuesto del país", () => {
    const { result } = renderHook(() => useImpuestoDelPais(), { wrapper: conPais() });
    expect(result.current).toBe(IMPUESTO_DE_PRUEBA);
    expect(result.current).not.toBe(IMPUESTO_ROTULO);
  });
});
