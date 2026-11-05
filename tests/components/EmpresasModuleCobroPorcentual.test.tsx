// @vitest-environment jsdom
// SLT-83 (design §6.3; R22) — la columna «Cobro por orden» del listado de «Empresas» con un plan
// porcentual: «{p} % (mín. {m})» o «{p} %», con la fuente «del plan». Con excepción sigue el importe y
// «propio» (SLT-66 R31). Se monta el `EmpresasModule` real con las actions como dobles.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import type { EmpresaListada } from "@/lib/types/empresas-plataforma";
import { money } from "@/lib/config/moneda";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { EmpresasModule } from "@/app/(app)/plataforma/empresas/_components/EmpresasModule";

function empresa(id: string, nombre: string, extra: Pick<EmpresaListada, "cobroPorOrden" | "cobroVigente">): EmpresaListada {
  return {
    id,
    nombre,
    slug: id,
    creadaEn: new Date("2026-10-20T12:00:00Z"),
    maestros: [],
    plan: null,
    deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    pagadoPlataforma: "0.00",
    pais: { id: "CR", nombre: "Costa Rica" },
    ...extra,
  };
}

const CON_MINIMO = empresa("org-1", "Envíos Norte", {
  cobroPorOrden: null,
  cobroVigente: { modo: "porcentual", porcentaje: "2.00", minimo: "500.00", fuente: "plan" },
});
const SIN_MINIMO = empresa("org-2", "Reparto Sur", {
  cobroPorOrden: null,
  cobroVigente: { modo: "porcentual", porcentaje: "2.35", minimo: null, fuente: "plan" },
});
const CON_EXCEPCION = empresa("org-3", "Mensajería Este", {
  cobroPorOrden: "300.00",
  cobroVigente: { modo: "fijo", monto: "300.00", fuente: "empresa" },
});

function montar(empresas: EmpresaListada[]) {
  render(
    <EmpresasModule
      empresas={empresas}
      tiposDocumento={[{ id: "t-1", value: "cedula" }]}
      paises={[{ id: "CR", nombre: "Costa Rica" }]}
      altaEmpresa={vi.fn()}
      cobroGlobal={{ monto: "100.00" }}
      fijarCobroGlobal={vi.fn()}
      fijarCobroEmpresa={vi.fn()}
      reenviarBienvenida={vi.fn()}
      bienvenidaPendiente={[]}
    />,
  );
}

/** La celda «Cobro por orden» de una fila, buscada por el nombre de la empresa. */
function celdaCobro(nombre: string) {
  const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
  const indice = cabeceras.indexOf("Cobro por orden");
  expect(indice).toBeGreaterThan(-1);
  const fila = screen.getAllByRole("row").find((f) => within(f).queryByText(nombre) !== null);
  if (!fila) throw new Error(`no hay fila de ${nombre}`);
  return within(within(fila).getAllByRole("cell")[indice]);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-83 R22 — la columna «Cobro por orden» con un plan porcentual", () => {
  it("R22: con mínimo pinta «{p} % (mín. {m})» y «del plan», sin el importe global", () => {
    montar([CON_MINIMO, SIN_MINIMO, CON_EXCEPCION]);
    const celda = celdaCobro("Envíos Norte");
    expect(celda.getByText("2.00 % (mín. 500.00)")).toBeInTheDocument();
    expect(celda.getByText("del plan")).toBeInTheDocument();
    expect(celda.queryByText(money("100.00"))).toBeNull();
    expect(celda.queryByText("global")).toBeNull();
  });

  it("R22: sin mínimo pinta «{p} %» y «del plan»", () => {
    montar([CON_MINIMO, SIN_MINIMO, CON_EXCEPCION]);
    const celda = celdaCobro("Reparto Sur");
    expect(celda.getByText("2.35 %")).toBeInTheDocument();
    expect(celda.queryByText(/mín\./)).toBeNull();
    expect(celda.getByText("del plan")).toBeInTheDocument();
  });

  it("R22: con excepción sigue el importe con «propio» (SLT-66 R31)", () => {
    montar([CON_MINIMO, SIN_MINIMO, CON_EXCEPCION]);
    const celda = celdaCobro("Mensajería Este");
    expect(celda.getByText(money("300.00"))).toBeInTheDocument();
    expect(celda.getByText("propio")).toBeInTheDocument();
    expect(celda.queryByText(/%/)).toBeNull();
  });
});
