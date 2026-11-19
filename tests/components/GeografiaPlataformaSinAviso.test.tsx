// @vitest-environment jsdom
// SLT-48 (T4.1; design §4.3 y §7.3; maqueta T0.2 §1) — /plataforma/geografia sin el aviso de «país aún no
// habilitado» y con la acción «Mover».
//
// R21: el alta de país ya no avisa de que sus empresas verán «país aún no habilitado» con otra forma que 3
// niveles: los países de 2 a 10 niveles crean órdenes (R18). R34 (en la pantalla): cada lugar que no es
// raíz ofrece «Mover», que abre el modal; una raíz no lo ofrece.
//
// Se monta el módulo real; lo doblado es el borde: las Server Actions, el router y el toast.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { NodoArbolPlataformaDTO, TipoNivelDTO } from "@/lib/types/geografia-nodo";
import type { PaisDTO } from "@/lib/types/pais";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

const vistaPreviaMock = vi.fn();
vi.mock("@/lib/actions/geografia-plataforma", () => ({
  cambiarDisponibilidadPaisAction: vi.fn(),
  cargarDivisionAction: vi.fn(),
  crearPaisAction: vi.fn(),
  crearNodoAction: vi.fn(),
  renombrarNodoAction: vi.fn(),
  cambiarActivacionNodoAction: vi.fn(),
  contarOrdenesSinEntregarAction: vi.fn(),
  vistaPreviaMoverNodoAction: (...a: unknown[]) => vistaPreviaMock(...a),
  moverNodoAction: vi.fn(),
}));

import { GeografiaPlataformaModule } from "@/app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule";

function tipo(profundidad: number, nombreSingular: string, nombrePlural: string): TipoNivelDTO {
  return {
    id: `t${profundidad}`,
    clave: `nivel_${profundidad}`,
    profundidad,
    nombreSingular,
    nombrePlural,
    digitosCodigo: null,
    codigoHeredaPrefijo: false,
  };
}

function nodo(
  id: string,
  nombre: string,
  profundidad: number,
  extra: Partial<NodoArbolPlataformaDTO> = {},
): NodoArbolPlataformaDTO {
  return { id, nombre, codigo: null, activo: true, profundidad, tipoId: `t${profundidad}`, hijos: [], ...extra };
}

const CHILE: PaisDTO = {
  id: "CL",
  nombre: "Chile",
  nivel1Singular: "Región",
  nivel1Plural: "Regiones",
  nivel2Singular: "Provincia",
  nivel2Plural: "Provincias",
  nivel3Singular: "Comuna",
  nivel3Plural: "Comunas",
  digitosCodigoNivel1: null,
  digitosCodigoNivel2: null,
  digitosCodigoNivel3: null,
  disponible: true,
};

const TIPOS_4 = [
  tipo(1, "Región", "Regiones"),
  tipo(2, "Provincia", "Provincias"),
  tipo(3, "Comuna", "Comunas"),
  tipo(4, "Barrio", "Barrios"),
];

const RAICES_4: NodoArbolPlataformaDTO[] = [
  nodo("costa", "Costa", 1, {
    hijos: [
      nodo("litoral", "Litoral", 2, { hijos: [nodo("vina", "Viña", 3)] }),
      nodo("marga", "Marga Marga", 2, { hijos: [nodo("quilpue", "Quilpué", 3)] }),
    ],
  }),
];

function montar() {
  const user = userEvent.setup();
  const vista = render(
    <GeografiaPlataformaModule paises={[CHILE]} paisElegido={CHILE} tipos={TIPOS_4} raices={RAICES_4} />,
  );
  return { user, ...vista };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SLT-48 R21 — sin el aviso de «país aún no habilitado»", () => {
  it("el alta de país no lo pinta con 2, 3, 4 ni 10 niveles, ni lo da como descripción de «Disponible»", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("button", { name: "Nuevo país" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo país" });
    const casilla = within(dialogo).getByRole("checkbox", { name: "Disponible para crear empresas" });

    const sinAviso = () => {
      expect(within(dialogo).queryByText(/aún no habilitado/)).toBeNull();
      expect(casilla).not.toHaveAttribute("aria-describedby");
    };

    sinAviso(); // 3
    await user.click(within(dialogo).getByRole("button", { name: "Quitar nivel 3" }));
    sinAviso(); // 2
    for (let n = 3; n <= 10; n += 1) {
      await user.click(within(dialogo).getByRole("button", { name: "Agregar nivel" }));
      sinAviso();
    }
  });

  it("la pantalla entera no lo dice en ningún sitio", () => {
    const { container } = montar();
    expect(container.textContent).not.toMatch(/aún no habilitado/);
  });
});

describe("SLT-48 R34 — la acción «Mover» del árbol", () => {
  it("sale en los lugares que no son raíz y abre el modal del nodo", async () => {
    const { user, container } = montar();
    await user.click(screen.getByRole("button", { name: "Expandir Costa" }));

    const raiz = container.querySelector<HTMLElement>('[data-nodo="costa"]');
    expect(raiz).not.toBeNull();
    expect(within(raiz as HTMLElement).queryByRole("button", { name: /^Mover/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Mover Litoral" }));
    const dialogo = await screen.findByRole("dialog", { name: "Mover «Litoral»" });
    expect(dialogo).toHaveAccessibleDescription("Elige el lugar al que pasa. Solo se ofrecen regiones de Chile.");
    expect(within(dialogo).getByRole("radiogroup", { name: "Región de destino" })).toBeInTheDocument();
    expect(vistaPreviaMock).not.toHaveBeenCalled();
  });
});
