// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ImpedimentosDesactivacion, ZonaDTO } from "@/lib/types/zona";

/**
 * SLT-225 «Desactivar zona: sacarla del trabajo nuevo sin borrar su historia» — la pantalla de zonas.
 *
 * R1759: cada zona activa ofrece Editar, Desactivar y Eliminar; cada desactivada lleva la marca
 * «Desactivada» y ofrece Reactivar y Eliminar, nunca Editar ni Desactivar. El orden lo da el
 * servidor y la pantalla lo respeta.
 * R1760: el rechazo por impedimentos deja la confirmación abierta y nombra lo que hay que mover;
 * el éxito avisa y refresca. Reactivar igual.
 *
 * Los textos se afirman como literales: son los de design §3.7, aprobados con el spec.
 */

const { desactivarMock, reactivarMock, listarMock, successMock, errorMock, infoMock } =
  vi.hoisted(() => ({
    desactivarMock: vi.fn(),
    reactivarMock: vi.fn(),
    listarMock: vi.fn(),
    successMock: vi.fn(),
    errorMock: vi.fn(),
    infoMock: vi.fn(),
  }));

vi.mock("@/lib/actions/zonas", () => ({
  listarZonas: (...a: unknown[]) => listarMock(...a),
  obtenerZona: vi.fn(),
  borrarZona: vi.fn(),
  crearZona: vi.fn(),
  actualizarZona: vi.fn(),
  impactoZonaCentral: vi.fn().mockResolvedValue({ status: "ok", impacto: [] }),
  desactivarZona: (...a: unknown[]) => desactivarMock(...a),
  reactivarZona: (...a: unknown[]) => reactivarMock(...a),
}));
vi.mock("@/lib/actions/geografia", () => ({
  listarArbolGeografico: vi.fn().mockResolvedValue({ status: "ok", provincias: [] }),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    warning: vi.fn(),
    info: infoMock,
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

const { ZonasModule } = await import(
  "@/app/(app)/configuracion/zonas/_components/ZonasModule"
);

function zona(id: string, nombre: string, activa: boolean): ZonaDTO {
  return { id, nombre, cobroVehiculo: false, distritosCount: activa ? 2 : 0, esCentral: false, activa };
}

const ZONAS: ZonaDTO[] = [zona("z1", "Este", true), zona("z2", "Oeste", true), zona("z3", "Kevin", false)];

function fila(nombre: string): HTMLElement {
  return screen.getByText(nombre).closest("li") as HTMLElement;
}

function botones(nombre: string): string[] {
  return within(fila(nombre))
    .getAllByRole("button")
    .map((b) => b.textContent?.trim() ?? "");
}

const IMPEDIMENTOS: ImpedimentosDesactivacion = {
  esCentral: true,
  distritos: 3,
  usuarios: [
    { nombre: "Ana Mora", rol: "mensajero", estado: "activo" },
    { nombre: "Luis Rojas", rol: "adminSatelite", estado: "inactivo" },
  ],
  ordenesVivas: {
    total: 23,
    porEstado: [
      { estado: "en_reparto", cantidad: 20 },
      { estado: "por_devolver_a_tienda", cantidad: 3 },
    ],
    muestra: Array.from({ length: 20 }, (_, i) => `#${9100 + i}`),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  listarMock.mockResolvedValue({ status: "ok", items: ZONAS, page: 1, pageSize: 100, total: 3 });
});

afterEach(cleanup);

describe("R1759 — orden, marca y botones por estado", () => {
  it("orden, marca y botones por estado", () => {
    render(<ZonasModule initialZonas={ZONAS} provincias={[]} />);

    // El orden que manda el servidor (activas primero) se pinta tal cual.
    const nombres = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector("span")?.firstChild?.textContent);
    expect(nombres).toEqual(["Este", "Oeste", "Kevin"]);

    expect(botones("Este")).toEqual(["Editar", "Desactivar", "Eliminar"]);
    expect(botones("Kevin")).toEqual(["Reactivar", "Eliminar"]);

    expect(within(fila("Kevin")).getByText("Desactivada")).toBeInTheDocument();
    expect(within(fila("Este")).queryByText("Desactivada")).toBeNull();
    expect(screen.getAllByText("Desactivada")).toHaveLength(1);
  });
});

describe("R1760 — confirmación de desactivar y reactivar", () => {
  it("el rechazo deja abierta la confirmación con usuarios, órdenes, distritos y bodega principal; el éxito avisa y refresca", async () => {
    const user = userEvent.setup();
    render(<ZonasModule initialZonas={ZONAS} provincias={[]} />);

    await user.click(within(fila("Este")).getByRole("button", { name: "Desactivar" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Desactivar zona")).toBeInTheDocument();
    // Pide confirmación: nada se envía hasta pulsar el botón del diálogo.
    expect(desactivarMock).not.toHaveBeenCalled();

    desactivarMock.mockResolvedValueOnce({
      status: "conflict",
      motivo: "impedimentos",
      impedimentos: IMPEDIMENTOS,
    });
    await user.click(within(dialogo).getByRole("button", { name: "Desactivar" }));

    const alerta = await within(dialogo).findByRole("alert");
    const texto = alerta.textContent ?? "";
    expect(texto).toContain(
      "Es la zona de bodega principal. Marca otra zona como bodega principal antes.",
    );
    expect(texto).toContain("Tiene 3 distritos. Quítalos editando la zona.");
    expect(texto).toContain("Tiene 2 usuarios asignados. Cámbiales la zona:");
    expect(texto).toContain("Ana Mora · Mensajero · Activo");
    expect(texto).toContain("Luis Rojas · Admin satélite · Inactivo");
    expect(texto).toContain("Tiene 23 órdenes sin terminar:");
    expect(texto).toContain("En reparto (20)");
    expect(texto).toContain("Por devolver a tienda (3)");
    expect(texto).toContain("Guías: #9100, #9101");
    expect(texto).toContain("#9119 y 3 más.");
    expect(desactivarMock).toHaveBeenCalledWith("z1");
    // Sigue abierta, sin aviso de éxito ni toast de error genérico.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(successMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();

    // Con lo movido, el segundo intento sale bien: avisa, refresca y cierra.
    desactivarMock.mockResolvedValueOnce({ status: "ok" });
    await user.click(within(dialogo).getByRole("button", { name: "Desactivar" }));
    await waitFor(() => expect(successMock).toHaveBeenCalledWith("Zona desactivada"));
    expect(listarMock).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("un impedimento solo nombra ese, con singular", async () => {
    const user = userEvent.setup();
    render(<ZonasModule initialZonas={ZONAS} provincias={[]} />);
    desactivarMock.mockResolvedValueOnce({
      status: "conflict",
      motivo: "impedimentos",
      impedimentos: {
        esCentral: false,
        distritos: 0,
        usuarios: [{ nombre: "Ana Mora", rol: "mensajero", estado: "pendiente" }],
        ordenesVivas: { total: 0, porEstado: [], muestra: [] },
      },
    });

    await user.click(within(fila("Oeste")).getByRole("button", { name: "Desactivar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Desactivar" }));

    const texto = (await within(dialogo).findByRole("alert")).textContent ?? "";
    expect(texto).toContain("Tiene 1 usuario asignado. Cámbiale la zona:");
    expect(texto).toContain("Ana Mora · Mensajero · Pendiente");
    expect(texto).not.toContain("bodega principal");
    expect(texto).not.toContain("distrito");
    expect(texto).not.toContain("sin terminar");
  });

  it("reactivar pide confirmación, avisa y refresca", async () => {
    const user = userEvent.setup();
    render(<ZonasModule initialZonas={ZONAS} provincias={[]} />);
    reactivarMock.mockResolvedValueOnce({ status: "ok" });

    await user.click(within(fila("Kevin")).getByRole("button", { name: "Reactivar" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Reactivar zona")).toBeInTheDocument();
    expect(reactivarMock).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Reactivar" }));
    await waitFor(() => expect(successMock).toHaveBeenCalledWith("Zona reactivada"));
    expect(reactivarMock).toHaveBeenCalledWith("z3");
    expect(listarMock).toHaveBeenCalled();
  });

  it("un fallo inesperado avisa con el texto genérico y no pinta impedimentos", async () => {
    const user = userEvent.setup();
    render(<ZonasModule initialZonas={ZONAS} provincias={[]} />);
    desactivarMock.mockResolvedValueOnce({ status: "forbidden" });

    await user.click(within(fila("Este")).getByRole("button", { name: "Desactivar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Desactivar" }));

    await waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("No se pudo desactivar la zona."),
    );
    expect(within(dialogo).queryByRole("alert")).toBeNull();
  });
});
