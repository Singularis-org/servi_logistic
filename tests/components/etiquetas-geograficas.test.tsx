// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { AsignacionDetalle } from "@/app/(app)/mis-asignaciones/_components/AsignacionDetalle";
import { useEtiquetasGeograficas } from "@/hooks/use-etiquetas-geograficas";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import { ETIQUETAS_NEUTRAS, type EtiquetasGeograficas } from "@/lib/types/pais";
import { EtiquetasGeograficasProvider } from "@/providers/EtiquetasGeograficasProvider";
import { ETIQUETAS_CR, ETIQUETAS_XA } from "../fabricas/etiquetas-geograficas";

// SL-20 / T5.1 (design §7; R19) — el proveedor y el hook de los nombres de nivel.
//
// El layout (`app/(app)/layout.tsx`) resuelve las etiquetas del país de la empresa en el servidor y
// las baja por `EtiquetasGeograficasProvider`; las pantallas las leen con `useEtiquetasGeograficas`.
// Que el layout le pase las de la empresa (y las neutras al superadmin) lo afirma
// `tests/components/AppLayout.test.tsx`. Aquí: lo que llega al proveedor es lo que pinta una pantalla
// de la lista de R19 (el detalle de la asignación del mensajero).

function orden(): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-1",
    estatusValue: "en_reparto",
    destinatario: "Ana",
    telefonoDest: "70001111",
    direccion: "200m sur de la iglesia",
    producto: "Caja",
    peso: 1.2,
    montoCobrar: 25000,
    latitud: 9.93,
    longitud: -84.08,
    notas: null,
    tiendaNombre: "Tienda Norte",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 1,
    marcarLuego: false,
    intentosEntrega: 0,
  };
}

function conEtiquetas(etiquetas: EtiquetasGeograficas) {
  return function Envoltorio({ children }: { children: ReactNode }) {
    return <EtiquetasGeograficasProvider etiquetas={etiquetas}>{children}</EtiquetasGeograficasProvider>;
  };
}

/** El valor (`<dd>`) que acompaña a un rótulo (`<dt>`) del detalle. */
function valorDe(rotulo: string): string | null {
  const dt = screen.getByText(rotulo, { selector: "dt" });
  return dt.nextElementSibling?.textContent ?? null;
}

afterEach(() => {
  cleanup();
});

describe("SL-20 / T5.1 — nombres de nivel del país de la empresa (R19)", () => {
  it("con una empresa de un país de prueba, la pantalla dice «Departamento» y no «Provincia»", () => {
    render(<AsignacionDetalle orden={orden()} />, { wrapper: conEtiquetas(ETIQUETAS_XA) });

    expect(valorDe("Departamento")).toBe("San José");
    expect(valorDe("Municipio")).toBe("Escazú");
    expect(valorDe("Aldea")).toBe("San Rafael");
    expect(screen.queryByText("Provincia")).toBeNull();
    expect(screen.queryByText("Cantón")).toBeNull();
    expect(screen.queryByText("Distrito")).toBeNull();
  });

  it("con una empresa de Costa Rica, la misma pantalla dice «Provincia», «Cantón» y «Distrito»", () => {
    render(<AsignacionDetalle orden={orden()} />, { wrapper: conEtiquetas(ETIQUETAS_CR) });

    expect(valorDe("Provincia")).toBe("San José");
    expect(valorDe("Cantón")).toBe("Escazú");
    expect(valorDe("Distrito")).toBe("San Rafael");
    expect(screen.queryByText("Departamento")).toBeNull();
  });

  it("el hook devuelve el objeto que recibió el proveedor", () => {
    const { result } = renderHook(() => useEtiquetasGeograficas(), {
      wrapper: conEtiquetas(ETIQUETAS_XA),
    });
    expect(result.current).toBe(ETIQUETAS_XA);
  });

  it("sin proveedor, el hook da las neutras y no las de un país (design §7)", () => {
    const { result } = renderHook(() => useEtiquetasGeograficas());
    expect(result.current).toBe(ETIQUETAS_NEUTRAS);
    expect(result.current.provincia.singular).not.toBe(ETIQUETAS_CR.provincia.singular);
  });
});
