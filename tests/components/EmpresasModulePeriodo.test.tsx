// @vitest-environment jsdom
// SLT-86 (design §7.2; R29) — «EMPRESAS»: JUNTO AL PLAN, EL TIPO DE COBRO VIGENTE CON LAS CUATRO ETIQUETAS.
//
// Se monta el `EmpresasModule` real con una empresa por tipo; el tipo llega del servidor
// (`EmpresasPlataformaRepository`) y la pantalla solo lo nombra.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import type { EmpresaListada } from "@/lib/types/empresas-plataforma";
import type { TipoCobro } from "@/lib/types/planes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { EmpresasModule } from "@/app/(app)/plataforma/empresas/_components/EmpresasModule";

function empresa(id: string, nombre: string, plan: EmpresaListada["plan"]): EmpresaListada {
  return {
    id,
    nombre,
    slug: id,
    creadaEn: new Date("2026-10-20T12:00:00Z"),
    maestros: [],
    deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    pagadoPlataforma: "0.00",
    pais: { id: "CR", nombre: "Costa Rica" },
    cobroPorOrden: null,
    cobroVigente: { modo: "fijo", monto: "100.00", fuente: "plan" },
    plan,
  };
}

const CASOS: [string, TipoCobro, string][] = [
  ["Envíos Norte", "quincenal", "Quincenal"],
  ["Reparto Sur", "mensual", "Mensual"],
  ["Mensajería Este", "bimestral", "Bimestral"],
  ["Correos Oeste", "anual", "Anual"],
];

const EMPRESAS: EmpresaListada[] = [
  ...CASOS.map(([nombre, tipoCobro], i) => empresa(`org-${i}`, nombre, { id: `plan-${i}`, nombre: "Pro", tipoCobro })),
  empresa("org-9", "Sin Plan SA", null),
];

function montar() {
  return render(
    <EmpresasModule
      empresas={EMPRESAS}
      paises={[{ id: "CR", nombre: "Costa Rica", prefijoTelefonico: null, tiposDocumento: [] }]}
      altaEmpresa={vi.fn()}
      cobroGlobal={{ monto: "999.00" }}
      fijarCobroGlobal={vi.fn()}
      fijarCobroEmpresa={vi.fn()}
      reenviarBienvenida={vi.fn()}
      bienvenidaPendiente={[]}
    />,
  );
}

/** La celda «Plan» de la fila de `nombre`. */
function celdaPlan(nombre: string): HTMLElement {
  const indice = screen.getAllByRole("columnheader").map((c) => c.textContent).indexOf("Plan");
  expect(indice, "no hay columna «Plan»").toBeGreaterThan(-1);
  const fila = screen.getAllByRole("row").find((f) => within(f).queryByText(nombre) !== null);
  if (!fila) throw new Error(`no hay fila de ${nombre}`);
  return within(fila).getAllByRole("cell")[indice];
}

afterEach(() => cleanup());

describe("SLT-86 R29 — el tipo de cobro vigente junto al plan", () => {
  it.each(CASOS)("%s (%s): «Pro · %s»", (nombre, _tipo, etiqueta) => {
    montar();
    expect(celdaPlan(nombre)).toHaveTextContent(`Pro · ${etiqueta}`);
  });

  it("R29: sin plan no hay tipo de cobro", () => {
    montar();
    const celda = celdaPlan("Sin Plan SA");
    for (const [, , etiqueta] of CASOS) expect(celda).not.toHaveTextContent(etiqueta);
  });
});
