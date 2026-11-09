// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GeografiaPlataformaModule } from "@/app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule";
import { PAISES_ISO_3166_1, paisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import type { PaisDTO } from "@/lib/types/pais";

// SL-20 (design §8; R42; decisión 11 tras la review 1) — el autocompletado del alta de país NO
// ofrece los países que ya están dados de alta (los que la pantalla recibe en `paises`): elegirlos
// solo llevaría a un `conflict` al guardar. Con todos dados de alta, la lista lo dice.
//
// SLT-46 (design §6, maqueta T0.2 v7; R23, R53, R54, R58, R59, R62) — la lista ordenada de niveles
// del alta, su validación con `crearPaisSchema` y la confirmación antes de escribir.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// Evita que jsdom arrastre Prisma por las Server Actions. `crearPaisAction` se espía (R58).
const crearPaisAction = vi.fn();
vi.mock("@/lib/actions/geografia-plataforma", () => ({
  cambiarDisponibilidadPaisAction: vi.fn(),
  cargarDivisionAction: vi.fn(),
  crearPaisAction: (...a: unknown[]) => crearPaisAction(...a),
}));

function paisDadoDeAlta(id: string): PaisDTO {
  const delCatalogo = paisDelCatalogo(id);
  if (delCatalogo === null) throw new Error(`El catálogo no tiene ${id}`);
  return {
    id,
    nombre: delCatalogo.nombre,
    nivel1Singular: "Región",
    nivel1Plural: "Regiones",
    nivel2Singular: "Comuna",
    nivel2Plural: "Comunas",
    nivel3Singular: "Barrio",
    nivel3Plural: "Barrios",
    digitosCodigoNivel1: null,
    digitosCodigoNivel2: null,
    digitosCodigoNivel3: null,
    disponible: true,
  };
}

async function abrirAltaYEscribir(paises: PaisDTO[], consulta: string) {
  const user = userEvent.setup();
  render(<GeografiaPlataformaModule paises={paises} paisElegido={null} tipos={[]} raices={[]} />);
  await user.click(screen.getByRole("button", { name: "Nuevo país" }));
  const input = await screen.findByRole("combobox", { name: /País/ });
  await user.type(input, consulta);
  return { user, input };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GeografiaPlataformaModule > alta de país: oculta los ya dados de alta (R42, decisión 11)", () => {
  const dadosDeAlta = [paisDadoDeAlta("NI"), paisDadoDeAlta("ES")];

  it("no ofrece un país ya dado de alta, buscado por nombre", async () => {
    await abrirAltaYEscribir(dadosDeAlta, "Nicar");

    expect(screen.queryByRole("option", { name: "Nicaragua (NI)" })).toBeNull();
    expect(await screen.findByText("Ningún país casa con lo escrito.")).toBeTruthy();
  });

  it("no ofrece un país ya dado de alta, buscado por código", async () => {
    await abrirAltaYEscribir(dadosDeAlta, "es");

    expect(screen.queryByRole("option", { name: "España (ES)" })).toBeNull();
  });

  it("sí ofrece un país que aún no está dado de alta", async () => {
    await abrirAltaYEscribir(dadosDeAlta, "Franc");

    expect(await screen.findByRole("option", { name: "Francia (FR)" })).toBeTruthy();
  });

  it("con todo el catálogo dado de alta, la lista lo dice en vez de quedar en blanco", async () => {
    const todos = PAISES_ISO_3166_1.map((p) => paisDadoDeAlta(p.id));
    await abrirAltaYEscribir(todos, "a");

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(
      await screen.findByText("Todos los países del catálogo ya están dados de alta."),
    ).toBeTruthy();
  });
});

describe("GeografiaPlataformaModule > alta de país: lista de niveles (SLT-46)", () => {
  type Usuario = ReturnType<typeof userEvent.setup>;

  async function abrirAlta() {
    const user = userEvent.setup();
    render(<GeografiaPlataformaModule paises={[]} paisElegido={null} tipos={[]} raices={[]} />);
    await user.click(screen.getByRole("button", { name: "Nuevo país" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo país" });
    return { user, dialogo };
  }

  function filas(dialogo: HTMLElement) {
    const lista = within(dialogo).getByRole("list", { name: /^Niveles \d+ \(máximo 10\)$/ });
    return within(lista).getAllByRole("listitem");
  }

  async function elegirPais(user: Usuario, dialogo: HTMLElement) {
    await user.type(within(dialogo).getByRole("combobox", { name: /^País/ }), "salvador");
    await user.click(await screen.findByRole("option", { name: "El Salvador (SV)" }));
  }

  async function escribirNivel(user: Usuario, dialogo: HTMLElement, posicion: number, singular: string, plural: string) {
    await user.type(within(dialogo).getByLabelText(new RegExp(`^Nivel ${posicion}, en singular`)), singular);
    await user.type(within(dialogo).getByLabelText(new RegExp(`^Nivel ${posicion}, en plural`)), plural);
  }

  async function pedirAlta(user: Usuario, dialogo: HTMLElement) {
    await user.click(within(dialogo).getByRole("button", { name: "Dar de alta" }));
    return screen.findByRole("dialog", { name: "Dar de alta un país" });
  }

  function filaDelModal(modal: HTMLElement, dato: string) {
    return within(modal).getByRole("rowheader", { name: dato }).closest("tr");
  }

  it("R62: arranca con 3 filas vacías y el título dice «Niveles 3 (máximo 10)»", async () => {
    const { dialogo } = await abrirAlta();
    expect(within(dialogo).getByRole("heading", { name: "Niveles 3 (máximo 10)" })).toBeInTheDocument();
    expect(filas(dialogo)).toHaveLength(3);
    expect(within(dialogo).getByLabelText(/^Nivel 1, en singular/)).toHaveValue("");
  });

  it("R62: con 2 filas el título dice 2 y no hay forma de quitar otra", async () => {
    const { user, dialogo } = await abrirAlta();
    await user.click(within(dialogo).getByRole("button", { name: "Quitar nivel 3" }));

    expect(within(dialogo).getByRole("heading", { name: "Niveles 2 (máximo 10)" })).toBeInTheDocument();
    expect(filas(dialogo)).toHaveLength(2);
    expect(within(dialogo).queryByRole("button", { name: /^Quitar nivel/ })).toBeNull();
  });

  it("R62: solo la última fila se puede quitar", async () => {
    const { dialogo } = await abrirAlta();
    expect(within(dialogo).getAllByRole("button", { name: /^Quitar nivel/ })).toHaveLength(1);
    expect(within(dialogo).getByRole("button", { name: "Quitar nivel 3" })).toBeInTheDocument();
  });

  it("R62: llega a 10 filas y entonces no deja agregar una 11.ª", async () => {
    const { user, dialogo } = await abrirAlta();
    for (let i = 0; i < 7; i++) await user.click(within(dialogo).getByRole("button", { name: "Agregar nivel" }));

    expect(within(dialogo).getByRole("heading", { name: "Niveles 10 (máximo 10)" })).toBeInTheDocument();
    expect(filas(dialogo)).toHaveLength(10);
    expect(within(dialogo).queryByRole("button", { name: "Agregar nivel" })).toBeNull();
    expect(within(dialogo).getByRole("button", { name: "Quitar nivel 10" })).toBeInTheDocument();
  });

  it("R53: cada fila tiene su manija ⠿ y no hay flechas ni botones de subir o bajar", async () => {
    const { dialogo } = await abrirAlta();
    expect(within(dialogo).getAllByRole("button", { name: /^Mover / })).toHaveLength(3);
    expect(within(dialogo).queryByRole("button", { name: /subir|bajar|arriba|abajo/i })).toBeNull();
  });

  it("R54: la equivalencia del CSV se ve en vivo, en el orden en pantalla", async () => {
    const { user, dialogo } = await abrirAlta();
    expect(within(dialogo).getByText("nivel_1 = — · nivel_2 = — · nivel_3 = —")).toBeInTheDocument();

    await escribirNivel(user, dialogo, 1, "Región", "Regiones");
    await escribirNivel(user, dialogo, 2, "Comuna", "Comunas");
    expect(within(dialogo).getByText("nivel_1 = Región · nivel_2 = Comuna · nivel_3 = —")).toBeInTheDocument();

    within(dialogo).getByRole("button", { name: "Mover Región, posición 1 de 3" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(within(dialogo).getByText("nivel_1 = Comuna · nivel_2 = Región · nivel_3 = —")).toBeInTheDocument();
  });

  it("R58, R59: un dato inválido marca el campo y no abre el modal ni llama a la action", async () => {
    const { user, dialogo } = await abrirAlta();
    await elegirPais(user, dialogo);
    await escribirNivel(user, dialogo, 1, "Región", "Regiones");
    await escribirNivel(user, dialogo, 2, "C", "Comunas");
    await escribirNivel(user, dialogo, 3, "Barrio", "Barrios");
    await user.click(within(dialogo).getByRole("button", { name: "Dar de alta" }));

    expect(within(dialogo).getByLabelText(/^Nivel 2, en singular/)).toHaveAttribute("aria-invalid", "true");
    expect(within(dialogo).getByText("Debe tener al menos 2 caracteres.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Dar de alta un país" })).toBeNull();
    expect(crearPaisAction).not.toHaveBeenCalled();
  });

  it("R58, R59: datos válidos abren la confirmación «—» → código, nombre y niveles; cancelar no llama", async () => {
    const { user, dialogo } = await abrirAlta();
    await elegirPais(user, dialogo);
    await escribirNivel(user, dialogo, 1, "Departamento", "Departamentos");
    await escribirNivel(user, dialogo, 2, "Municipio", "Municipios");
    await escribirNivel(user, dialogo, 3, "Aldea", "Aldeas");
    const confirmar = await pedirAlta(user, dialogo);

    expect(filaDelModal(confirmar, "Código")).toHaveTextContent("SV");
    expect(filaDelModal(confirmar, "Nombre")).toHaveTextContent("El Salvador");
    expect(filaDelModal(confirmar, "nivel_1")).toHaveTextContent("Departamento / Departamentos");
    expect(filaDelModal(confirmar, "nivel_2")).toHaveTextContent("Municipio / Municipios");
    expect(filaDelModal(confirmar, "nivel_3")).toHaveTextContent("Aldea / Aldeas");
    // R63: el resumen gana la fila «Disponibilidad» (también sin «antes»): 5 → 6.
    expect(filaDelModal(confirmar, "Disponibilidad")).toHaveTextContent("No disponible");
    expect(within(confirmar).getAllByText("Sin valor")).toHaveLength(6);

    await user.click(within(confirmar).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Dar de alta un país" })).toBeNull());
    expect(crearPaisAction).not.toHaveBeenCalled();
  });

  it("R23, R54: confirmar llama una vez a la action con `{ id, tipos }` en el orden en pantalla", async () => {
    crearPaisAction.mockResolvedValue({ status: "ok", pais: paisDadoDeAlta("SV") });
    const { user, dialogo } = await abrirAlta();
    await elegirPais(user, dialogo);
    await escribirNivel(user, dialogo, 1, "Departamento", "Departamentos");
    await escribirNivel(user, dialogo, 2, "Municipio", "Municipios");
    await user.click(within(dialogo).getByRole("button", { name: "Quitar nivel 3" }));

    // R53: con la manija enfocada, la flecha mueve la fila; Municipio pasa a ser el nivel 1.
    within(dialogo).getByRole("button", { name: "Mover Municipio, posición 2 de 2" }).focus();
    await user.keyboard("{ArrowUp}");
    expect(within(dialogo).getByLabelText(/^Nivel 1, en singular/)).toHaveValue("Municipio");

    const confirmar = await pedirAlta(user, dialogo);
    await user.click(within(confirmar).getByRole("button", { name: "Sí, crear" }));

    await waitFor(() => expect(crearPaisAction).toHaveBeenCalledTimes(1));
    // R63: `disponible` siempre viaja; sin tocar la casilla, false.
    expect(crearPaisAction).toHaveBeenCalledWith({
      id: "SV",
      tipos: [
        { singular: "Municipio", plural: "Municipios" },
        { singular: "Departamento", plural: "Departamentos" },
      ],
      disponible: false,
    });
  });

  it("R63: la casilla «Disponible para crear empresas» arranca desmarcada", async () => {
    const { dialogo } = await abrirAlta();
    expect(within(dialogo).getByRole("checkbox", { name: "Disponible para crear empresas" })).not.toBeChecked();
  });

  it("R63: marcada, el resumen dice «Disponible» y la action la recibe en la misma alta", async () => {
    crearPaisAction.mockResolvedValue({ status: "ok", pais: paisDadoDeAlta("SV") });
    const { user, dialogo } = await abrirAlta();
    await elegirPais(user, dialogo);
    await escribirNivel(user, dialogo, 1, "Departamento", "Departamentos");
    await escribirNivel(user, dialogo, 2, "Municipio", "Municipios");
    await escribirNivel(user, dialogo, 3, "Aldea", "Aldeas");
    await user.click(within(dialogo).getByRole("checkbox", { name: "Disponible para crear empresas" }));
    const confirmar = await pedirAlta(user, dialogo);

    expect(filaDelModal(confirmar, "Disponibilidad")).toHaveTextContent("Disponible");
    expect(filaDelModal(confirmar, "Disponibilidad")).not.toHaveTextContent("No disponible");
    await user.click(within(confirmar).getByRole("button", { name: "Sí, crear" }));

    await waitFor(() => expect(crearPaisAction).toHaveBeenCalledTimes(1));
    expect(crearPaisAction).toHaveBeenCalledWith({
      id: "SV",
      tipos: [
        { singular: "Departamento", plural: "Departamentos" },
        { singular: "Municipio", plural: "Municipios" },
        { singular: "Aldea", plural: "Aldeas" },
      ],
      disponible: true,
    });
  });

  it("R63: con 3 niveles no hay aviso; con 2 o 4, avisa «país aún no habilitado» hasta SLT-48", async () => {
    const { user, dialogo } = await abrirAlta();
    const aviso = () => within(dialogo).queryByText(/«país aún no habilitado».*SLT-48/);
    expect(aviso()).toBeNull();

    await user.click(within(dialogo).getByRole("button", { name: "Quitar nivel 3" }));
    expect(aviso()).toHaveTextContent("Con 2 niveles");
    expect(within(dialogo).getByRole("checkbox", { name: "Disponible para crear empresas" })).toHaveAccessibleDescription(
      /país aún no habilitado/,
    );

    await user.click(within(dialogo).getByRole("button", { name: "Agregar nivel" }));
    expect(aviso()).toBeNull();
    await user.click(within(dialogo).getByRole("button", { name: "Agregar nivel" }));
    expect(aviso()).toHaveTextContent("Con 4 niveles");
  });

  it("un `validation_error` del servidor vuelve al formulario con su mensaje", async () => {
    crearPaisAction.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { tipos: ["Un país tiene al menos 2 niveles."] },
    });
    const { user, dialogo } = await abrirAlta();
    await elegirPais(user, dialogo);
    await escribirNivel(user, dialogo, 1, "Departamento", "Departamentos");
    await escribirNivel(user, dialogo, 2, "Municipio", "Municipios");
    await escribirNivel(user, dialogo, 3, "Aldea", "Aldeas");
    const confirmar = await pedirAlta(user, dialogo);
    await user.click(within(confirmar).getByRole("button", { name: "Sí, crear" }));

    expect(await within(dialogo).findByText("Un país tiene al menos 2 niveles.")).toBeInTheDocument();
    expect(crearPaisAction).toHaveBeenCalledTimes(1);
  });
});
