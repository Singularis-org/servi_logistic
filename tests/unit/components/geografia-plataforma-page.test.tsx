// @vitest-environment jsdom
// SL-20 (T5.3, T5.7; design §8) — LA PANTALLA `/plataforma/geografia` DEL SUPERADMIN.
//
// Cubre R20 (los niveles con los nombres del país elegido), R21 (404 a un rol de empresa ANTES de
// leer), R22 (`/configuracion/geografia` ya no existe), R23/R42 (alta de país eligiéndolo del
// catálogo, sin campo de código), R24/R25 (resumen y errores del CSV con su línea), R31 (el conteo
// que no bloquea el retiro) y R47 en la UI (el interruptor «Disponible» y su aviso).
//
// Se monta la página REAL y sus módulos reales; lo único doblado es el borde: las Server Actions,
// la sesión, el router de Next y el toast. Los textos van LITERALES: son el contrato de pantalla.
import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ProvinciaPlataformaDTO } from "@/lib/types/geografia-nodo";
import type { PaisDTO } from "@/lib/types/pais";

vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));

const routerMock = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => routerMock,
  usePathname: () => "/plataforma/geografia",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn() }));

const acciones = {
  listarPaisesAction: vi.fn(),
  crearPaisAction: vi.fn(),
  cambiarDisponibilidadPaisAction: vi.fn(),
  arbolDePaisAction: vi.fn(),
  crearNodoAction: vi.fn(),
  renombrarNodoAction: vi.fn(),
  cambiarActivacionNodoAction: vi.fn(),
  contarOrdenesSinEntregarAction: vi.fn(),
  cargarDivisionAction: vi.fn(),
};
vi.mock("@/lib/actions/geografia-plataforma", () => ({
  listarPaisesAction: (...a: unknown[]) => acciones.listarPaisesAction(...a),
  crearPaisAction: (...a: unknown[]) => acciones.crearPaisAction(...a),
  cambiarDisponibilidadPaisAction: (...a: unknown[]) => acciones.cambiarDisponibilidadPaisAction(...a),
  arbolDePaisAction: (...a: unknown[]) => acciones.arbolDePaisAction(...a),
  crearNodoAction: (...a: unknown[]) => acciones.crearNodoAction(...a),
  renombrarNodoAction: (...a: unknown[]) => acciones.renombrarNodoAction(...a),
  cambiarActivacionNodoAction: (...a: unknown[]) => acciones.cambiarActivacionNodoAction(...a),
  contarOrdenesSinEntregarAction: (...a: unknown[]) => acciones.contarOrdenesSinEntregarAction(...a),
  cargarDivisionAction: (...a: unknown[]) => acciones.cargarDivisionAction(...a),
}));

const toastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() };
vi.mock("@/hooks/useToast", () => ({ useToast: () => toastMock }));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import GeografiaPlataformaPage from "@/app/(app)/plataforma/geografia/page";

// Un país de prueba que NO llama a sus niveles como Costa Rica: es lo que separa R20 de un texto fijo.
function pais(id: string, nombre: string, extra: Partial<PaisDTO> = {}): PaisDTO {
  return {
    id,
    nombre,
    nivel1Singular: "Departamento",
    nivel1Plural: "Departamentos",
    nivel2Singular: "Municipio",
    nivel2Plural: "Municipios",
    nivel3Singular: "Aldea",
    nivel3Plural: "Aldeas",
    disponible: true,
    digitosCodigoNivel1: null,
    digitosCodigoNivel2: null,
    digitosCodigoNivel3: null,
    ...extra,
  };
}

const GUATEMALA = pais("GT", "Guatemala");
const HONDURAS = pais("HN", "Honduras", { disponible: false });

const ARBOL: ProvinciaPlataformaDTO[] = [
  {
    id: "p-gua",
    nombre: "Escuintla",
    codigo: "05",
    activo: true,
    cantones: [
      {
        id: "c-mas",
        nombre: "Masagua",
        codigo: null,
        activo: true,
        distritos: [{ id: "d-obe", nombre: "Obero", codigo: null, activo: true }],
      },
      { id: "c-tiq", nombre: "Tiquisate", codigo: null, activo: true, distritos: [] },
    ],
  },
];

function actorDe(rol: string) {
  return { usuarioId: "u-1", rol };
}

async function montar(paisPedido?: string) {
  const ui = await GeografiaPlataformaPage({ searchParams: Promise.resolve({ pais: paisPedido }) });
  return render(ui);
}

beforeEach(() => {
  vi.mocked(resolveActorFromSession).mockResolvedValue(actorDe("superadmin") as never);
  acciones.listarPaisesAction.mockResolvedValue({ status: "ok", paises: [HONDURAS, GUATEMALA] });
  acciones.arbolDePaisAction.mockResolvedValue({ status: "ok", provincias: ARBOL });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("R21 — la puerta, antes de leer", () => {
  it.each(["maestro", "operador", "mensajero"])("responde 404 a %s sin pedir países ni árbol", async (rol) => {
    vi.mocked(resolveActorFromSession).mockResolvedValue(actorDe(rol) as never);
    await expect(montar()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(acciones.listarPaisesAction).not.toHaveBeenCalled();
    expect(acciones.arbolDePaisAction).not.toHaveBeenCalled();
  });

  it("responde 404 sin sesión", async () => {
    vi.mocked(resolveActorFromSession).mockResolvedValue(null);
    await expect(montar()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(acciones.listarPaisesAction).not.toHaveBeenCalled();
  });

  it("al superadmin le carga el país de ?pais= y, sin él, el primero por nombre", async () => {
    await montar("HN");
    expect(acciones.arbolDePaisAction).toHaveBeenCalledWith({ paisId: "HN" });
    cleanup();
    acciones.arbolDePaisAction.mockClear();
    await montar();
    expect(acciones.arbolDePaisAction).toHaveBeenCalledWith({ paisId: "GT" });
    expect(screen.getByRole("heading", { name: "División de Guatemala" })).toBeInTheDocument();
  });
});

describe("R22 — /configuracion/geografia ya no existe", () => {
  it("no queda ninguna página en esa ruta", () => {
    const raiz = path.resolve(__dirname, "../../..");
    expect(existsSync(path.join(raiz, "app/(app)/configuracion/geografia"))).toBe(false);
  });
});

describe("R20 — los niveles con los nombres del país elegido", () => {
  it("el árbol, sus botones y la tabla del CSV dicen Departamento, Municipio y Aldea", async () => {
    const user = userEvent.setup();
    await montar("GT");

    expect(screen.getByRole("button", { name: "Añadir departamento" })).toBeInTheDocument();
    expect(screen.getByText("(2 municipios)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir municipio a Escuintla" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expandir Escuintla" }));
    await user.click(screen.getByRole("button", { name: "Expandir Masagua" }));
    expect(screen.getByRole("button", { name: "Añadir aldea a Masagua" })).toBeInTheDocument();

    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("Departamento")).toBeInTheDocument();
    expect(within(tabla).getByText("Código de municipio (opcional)")).toBeInTheDocument();
    expect(within(tabla).getByText("Aldea")).toBeInTheDocument();

    expect(screen.queryByText(/provincia|cant[oó]n|distrito/i)).toBeNull();
  });

  it("el alta de un nodo lleva el país y el código opcional", async () => {
    const user = userEvent.setup();
    acciones.crearNodoAction.mockResolvedValue({ status: "ok", id: "p-new", nivel: "provincia" });
    await montar("GT");

    await user.click(screen.getByRole("button", { name: "Añadir departamento" }));
    expect(screen.getByRole("heading", { name: "Alta: Departamento" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Nombre/), "Petén");
    await user.type(screen.getByLabelText(/^Código oficial/), "17");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(acciones.crearNodoAction).toHaveBeenCalledWith({
      nivel: "provincia",
      nombre: "Petén",
      paisId: "GT",
      codigo: "17",
    });
  });
});

describe("R31 — el conteo de la confirmación no bloquea el retiro", () => {
  it("muestra las órdenes sin entregar de todas las empresas", async () => {
    const user = userEvent.setup();
    acciones.contarOrdenesSinEntregarAction.mockResolvedValue({ status: "ok", ordenes: 7 });
    await montar("GT");

    await user.click(screen.getByRole("button", { name: "Desactivar Escuintla" }));
    const dialogo = await screen.findByRole("dialog");
    expect(
      await within(dialogo).findByText("Órdenes sin entregar en este nodo, de todas las empresas: 7."),
    ).toBeInTheDocument();
    expect(acciones.contarOrdenesSinEntregarAction).toHaveBeenCalledWith({ nivel: "provincia", id: "p-gua" });
  });

  it("si el conteo falla, lo dice y deja retirar", async () => {
    const user = userEvent.setup();
    acciones.contarOrdenesSinEntregarAction.mockResolvedValue({ status: "error" });
    acciones.cambiarActivacionNodoAction.mockResolvedValue({
      status: "ok",
      nivel: "provincia",
      id: "p-gua",
      activo: false,
    });
    await montar("GT");

    await user.click(screen.getByRole("button", { name: "Desactivar Escuintla" }));
    const dialogo = await screen.findByRole("dialog");
    expect(
      await within(dialogo).findByText(
        "No se pudo contar las órdenes sin entregar de este nodo. Puedes retirarlo igual.",
      ),
    ).toBeInTheDocument();

    const retirar = within(dialogo).getByRole("button", { name: "Retirar" });
    expect(retirar).toBeEnabled();
    await user.click(retirar);
    await waitFor(() =>
      expect(acciones.cambiarActivacionNodoAction).toHaveBeenCalledWith({
        nivel: "provincia",
        id: "p-gua",
        activo: false,
      }),
    );
  });
});

describe("R23, R42 — alta de país eligiéndolo del catálogo", () => {
  async function abrirAlta() {
    const user = userEvent.setup();
    await montar("GT");
    await user.click(screen.getByRole("button", { name: "Nuevo país" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo país" });
    return { user, dialogo };
  }

  it("no hay campo para teclear el código ni el nombre; sí los seis nombres de nivel", async () => {
    const { dialogo } = await abrirAlta();
    expect(within(dialogo).queryByLabelText(/c[oó]digo/i)).toBeNull();
    expect(within(dialogo).queryByRole("textbox", { name: /^nombre/i })).toBeNull();
    expect(within(dialogo).getByRole("combobox", { name: /^País/ })).toBeInTheDocument();
    for (const etiqueta of [
      "Nivel 1, en singular",
      "Nivel 1, en plural",
      "Nivel 2, en singular",
      "Nivel 2, en plural",
      "Nivel 3, en singular",
      "Nivel 3, en plural",
    ]) {
      expect(within(dialogo).getByLabelText(new RegExp(`^${etiqueta}`))).toBeInTheDocument();
    }
  });

  it("busca por nombre (sin acentos) y por código", async () => {
    const { user, dialogo } = await abrirAlta();
    const buscador = within(dialogo).getByRole("combobox", { name: /^País/ });

    await user.type(buscador, "peru");
    expect(await screen.findByRole("option", { name: "Perú (PE)" })).toBeInTheDocument();

    await user.clear(buscador);
    await user.type(buscador, "sv");
    expect(await screen.findByRole("option", { name: "El Salvador (SV)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Perú (PE)" })).toBeNull();
  });

  it("el envío lleva el id elegido y los seis nombres, sin nombre de país", async () => {
    acciones.crearPaisAction.mockResolvedValue({ status: "ok", pais: pais("SV", "El Salvador") });
    const { user, dialogo } = await abrirAlta();

    await user.type(within(dialogo).getByRole("combobox", { name: /^País/ }), "salvador");
    await user.click(await screen.findByRole("option", { name: "El Salvador (SV)" }));

    const valores: [string, string][] = [
      ["Nivel 1, en singular", "Departamento"],
      ["Nivel 1, en plural", "Departamentos"],
      ["Nivel 2, en singular", "Municipio"],
      ["Nivel 2, en plural", "Municipios"],
      ["Nivel 3, en singular", "Distrito"],
      ["Nivel 3, en plural", "Distritos"],
    ];
    for (const [etiqueta, valor] of valores) {
      await user.type(within(dialogo).getByLabelText(new RegExp(`^${etiqueta}`)), valor);
    }
    await user.click(within(dialogo).getByRole("button", { name: "Dar de alta" }));

    await waitFor(() => expect(acciones.crearPaisAction).toHaveBeenCalledTimes(1));
    expect(acciones.crearPaisAction).toHaveBeenCalledWith({
      id: "SV",
      nivel1Singular: "Departamento",
      nivel1Plural: "Departamentos",
      nivel2Singular: "Municipio",
      nivel2Plural: "Municipios",
      nivel3Singular: "Distrito",
      nivel3Plural: "Distritos",
    });
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/plataforma/geografia?pais=SV"));
  });

  it("sin país elegido no envía y lo pide", async () => {
    const { user, dialogo } = await abrirAlta();
    await user.click(within(dialogo).getByRole("button", { name: "Dar de alta" }));
    expect(await within(dialogo).findByText("Elige un país de la lista.")).toBeInTheDocument();
    expect(acciones.crearPaisAction).not.toHaveBeenCalled();
  });

  it("un país ya dado de alta se dice junto al buscador", async () => {
    acciones.crearPaisAction.mockResolvedValue({ status: "conflict", campo: "id" });
    const { user, dialogo } = await abrirAlta();
    await user.type(within(dialogo).getByRole("combobox", { name: /^País/ }), "GT");
    await user.click(await screen.findByRole("option", { name: "Guatemala (GT)" }));
    for (const campo of [
      "Nivel 1, en singular",
      "Nivel 1, en plural",
      "Nivel 2, en singular",
      "Nivel 2, en plural",
      "Nivel 3, en singular",
      "Nivel 3, en plural",
    ]) {
      await user.type(within(dialogo).getByLabelText(new RegExp(`^${campo}`)), "Nombre");
    }
    await user.click(within(dialogo).getByRole("button", { name: "Dar de alta" }));
    expect(await within(dialogo).findByText("Ese país ya está dado de alta.")).toBeInTheDocument();
  });
});

describe("R47 — el interruptor «Disponible» del país elegido", () => {
  it("llama a la action con el estado deseado y avisa de que no afecta a las empresas existentes", async () => {
    const user = userEvent.setup();
    acciones.cambiarDisponibilidadPaisAction.mockResolvedValue({ status: "ok", id: "GT", disponible: false });
    await montar("GT");

    const interruptor = screen.getByRole("switch", { name: "Disponible: Guatemala" });
    expect(interruptor).toHaveAttribute("aria-checked", "true");
    expect(interruptor).toHaveAccessibleDescription(/Apagarlo no afecta a las empresas que ya están en él/);

    await user.click(interruptor);
    await waitFor(() =>
      expect(acciones.cambiarDisponibilidadPaisAction).toHaveBeenCalledWith({ id: "GT", disponible: false }),
    );
    await waitFor(() => expect(interruptor).toHaveAttribute("aria-checked", "false"));
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("refleja un país ya apagado", async () => {
    await montar("HN");
    expect(screen.getByRole("switch", { name: "Disponible: Honduras" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("R24, R25, R28, R48 — la carga CSV", () => {
  async function subir(resultado: unknown) {
    const user = userEvent.setup();
    acciones.cargarDivisionAction.mockResolvedValue(resultado);
    await montar("GT");
    const archivo = new File(["nivel_1,codigo_nivel_1\n"], "division.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("Archivo CSV"), archivo);
    await user.click(screen.getByRole("button", { name: "Cargar" }));
    await waitFor(() => expect(acciones.cargarDivisionAction).toHaveBeenCalledTimes(1));
    const datos = acciones.cargarDivisionAction.mock.calls[0][0] as FormData;
    expect(datos.get("paisId")).toBe("GT");
    expect((datos.get("archivo") as File).name).toBe("division.csv");
  }

  it("lista cada error con su línea, y los avisos", async () => {
    await subir({
      status: "invalido",
      errores: [
        { linea: 3, mensaje: "Falta el nombre del nivel 2." },
        { linea: 5, mensaje: "El código 0101 ya es de «Masagua»." },
      ],
      total: 2,
      avisos: ["La columna «x» no es del formato y se ignoró."],
    });
    const alerta = await screen.findByRole("alert");
    expect(within(alerta).getByText("El archivo tiene 2 errores. No se cargó nada.")).toBeInTheDocument();
    expect(within(alerta).getByText("Línea 3: Falta el nombre del nivel 2.")).toBeInTheDocument();
    expect(within(alerta).getByText("Línea 5: El código 0101 ya es de «Masagua».")).toBeInTheDocument();
    expect(within(alerta).getByText("La columna «x» no es del formato y se ignoró.")).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("con una carga buena muestra el resumen con los nombres del país", async () => {
    await subir({
      status: "ok",
      creados: { provincia: 1, canton: 2, distrito: 3 },
      existentes: 4,
      codigosCompletados: 5,
      avisos: [],
    });
    const resumen = await screen.findByRole("status");
    expect(within(resumen).getByText("Departamentos: 1")).toBeInTheDocument();
    expect(within(resumen).getByText("Municipios: 2")).toBeInTheDocument();
    expect(within(resumen).getByText("Aldeas: 3")).toBeInTheDocument();
    expect(within(resumen).getByText("Ya existían: 4")).toBeInTheDocument();
    expect(within(resumen).getByText("Códigos completados: 5")).toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("un archivo rechazado dice el motivo", async () => {
    await subir({ status: "archivo_rechazado", motivo: "Falta la columna nivel_3." });
    expect(await screen.findByText("Archivo rechazado: Falta la columna nivel_3.")).toBeInTheDocument();
  });
});
