// @vitest-environment jsdom
// SLT-66 (design §6.4; R31, R32) — «EMPRESAS»: EL COBRO VIGENTE CON SU FUENTE Y LA COLUMNA «PLAN».
//
// Se monta el `EmpresasModule` real. Cada fila trae un `cobroVigente` distinto del global de la página
// (999) para que derivar el importe en la pantalla, como hacía SL-40, no pueda pasar en verde.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EmpresaListada } from "@/lib/types/empresas-plataforma";
import { money } from "@/lib/config/moneda";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { EmpresasModule } from "@/app/(app)/plataforma/empresas/_components/EmpresasModule";

function empresa(
  id: string,
  nombre: string,
  extra: Pick<EmpresaListada, "cobroPorOrden" | "cobroVigente" | "plan">,
): EmpresaListada {
  return {
    id,
    nombre,
    slug: id,
    creadaEn: new Date("2026-10-20T12:00:00Z"),
    maestros: [],
    deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    pagadoPlataforma: "0.00",
    pais: { id: "CR", nombre: "Costa Rica" },
    ...extra,
  };
}

const PROPIA = empresa("org-1", "Envíos Norte", {
  cobroPorOrden: "80.00",
  cobroVigente: { monto: "80.00", fuente: "empresa" },
  plan: { id: "plan-1", nombre: "Plan Crecer" },
});
const DEL_PLAN = empresa("org-2", "Reparto Sur", {
  cobroPorOrden: null,
  cobroVigente: { monto: "100.00", fuente: "plan" },
  plan: { id: "plan-2", nombre: "Plan Custom Sur" },
});
const GLOBAL = empresa("org-3", "Mensajería Este", {
  cobroPorOrden: null,
  cobroVigente: { monto: "500.00", fuente: "global" },
  plan: null,
});
const SIN_CONFIGURAR = empresa("org-4", "Correos Oeste", {
  cobroPorOrden: null,
  cobroVigente: { monto: "0.00", fuente: "sin_configurar" },
  plan: null,
});

function montar(empresas: EmpresaListada[] = [PROPIA, DEL_PLAN, GLOBAL, SIN_CONFIGURAR]) {
  return render(
    <EmpresasModule
      empresas={empresas}
      tiposDocumento={[{ id: "t-1", value: "cedula" }]}
      paises={[{ id: "CR", nombre: "Costa Rica" }]}
      altaEmpresa={vi.fn()}
      cobroGlobal={{ monto: "999.00" }}
      fijarCobroGlobal={vi.fn()}
      fijarCobroEmpresa={vi.fn()}
      reenviarBienvenida={vi.fn()}
      bienvenidaPendiente={[]}
    />,
  );
}

/** La celda de la columna `cabecera` en la fila de `nombre`. */
function celda(cabecera: string, nombre: string): HTMLElement {
  const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
  const indice = cabeceras.indexOf(cabecera);
  expect(indice, `no hay columna «${cabecera}»`).toBeGreaterThan(-1);
  const fila = screen.getAllByRole("row").find((f) => within(f).queryByText(nombre) !== null);
  if (!fila) throw new Error(`no hay fila de ${nombre}`);
  return within(fila).getAllByRole("cell")[indice];
}

afterEach(() => cleanup());

describe("SLT-66 R31 — «Cobro por orden» pinta lo que se cobraría hoy y su fuente", () => {
  it.each([
    ["Envíos Norte", "80.00", "propio"],
    ["Reparto Sur", "100.00", "del plan"],
    ["Mensajería Este", "500.00", "global"],
    ["Correos Oeste", "0.00", "global"],
  ])("%s: %s con «%s»", (nombre, monto, etiqueta) => {
    montar();
    const c = within(celda("Cobro por orden", nombre));
    expect(c.getByText(money(monto))).toBeInTheDocument();
    expect(c.getByText(etiqueta)).toBeInTheDocument();
    // El global de la página (999) nunca se cuela en la fila: lo vigente llega del servidor.
    expect(c.queryByText(money("999.00"))).toBeNull();
  });

  it("la fila «del plan» no dice «propio» ni «global»", () => {
    montar();
    const c = within(celda("Cobro por orden", "Reparto Sur"));
    expect(c.queryByText("propio")).toBeNull();
    expect(c.queryByText("global")).toBeNull();
  });

  it("«Cambiar» sigue editando la excepción: la fila «del plan» no ofrece «Usar el global»", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Cambiar · Reparto Sur" }));
    const c = within(celda("Cobro por orden", "Reparto Sur"));
    expect((c.getByRole("textbox") as HTMLInputElement).value).toBe("");
    expect(c.queryByRole("button", { name: "Usar el global" })).toBeNull();
  });
});

describe("SLT-66 R32 — la columna «Plan»", () => {
  it("va entre «Nombre» y «Plan y módulos»", () => {
    montar();
    const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabeceras.slice(0, 3)).toEqual(["Nombre", "Plan", "Plan y módulos"]);
  });

  it("con plan: su nombre y «Cambiar plan», que lleva al bloque «Plan» del detalle", () => {
    montar();
    const c = within(celda("Plan", "Reparto Sur"));
    expect(c.getByText("Plan Custom Sur")).toBeInTheDocument();
    const enlace = c.getByRole("link", { name: "Cambiar el plan de Reparto Sur" });
    expect(enlace).toHaveTextContent("Cambiar plan");
    expect(enlace).toHaveAttribute("href", "/plataforma/empresas/org-2#plan");
    expect(c.queryByText("Sin plan")).toBeNull();
  });

  it("sin plan: «Sin plan» en gris y «Asignar plan», que lleva al bloque «Plan» del detalle", () => {
    montar();
    const c = within(celda("Plan", "Mensajería Este"));
    expect(c.getByText("Sin plan")).toHaveClass("text-muted-foreground");
    const enlace = c.getByRole("link", { name: "Asignar plan a Mensajería Este" });
    expect(enlace).toHaveTextContent("Asignar plan");
    expect(enlace).toHaveAttribute("href", "/plataforma/empresas/org-3#plan");
    expect(c.queryByRole("link", { name: /Cambiar el plan/ })).toBeNull();
  });

  it("el enlace del detalle se llama «Plan y módulos de {empresa}» y va al detalle sin ancla", () => {
    montar();
    const enlace = screen.getByRole("link", { name: "Plan y módulos de Envíos Norte" });
    expect(enlace).toHaveTextContent("Plan y módulos");
    expect(enlace).toHaveAttribute("href", "/plataforma/empresas/org-1");
    expect(screen.queryByRole("link", { name: "Módulos de Envíos Norte" })).toBeNull();
  });
});
