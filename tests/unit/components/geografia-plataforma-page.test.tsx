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

import type { NodoArbolPlataformaDTO, ProvinciaPlataformaDTO, TipoNivelDTO } from "@/lib/types/geografia-nodo";
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
  // SLT-46 T6.3: las del panel «Niveles del país», que la página ahora monta.
  renombrarTipoNivelAction: vi.fn(),
  agregarNivelPaisAction: vi.fn(),
  reordenarTiposAction: vi.fn(),
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
  renombrarTipoNivelAction: (...a: unknown[]) => acciones.renombrarTipoNivelAction(...a),
  agregarNivelPaisAction: (...a: unknown[]) => acciones.agregarNivelPaisAction(...a),
  reordenarTiposAction: (...a: unknown[]) => acciones.reordenarTiposAction(...a),
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

// SLT-46 (T4.1, T6.1): la action devuelve el árbol de N niveles (`raices`) y los tipos del país, y la
// página los pasa tal cual al panel «Lugares». Mismo árbol que `ARBOL`, en la forma nueva del contrato.
const RAICES: NodoArbolPlataformaDTO[] = ARBOL.map((p) => ({
  id: p.id,
  nombre: p.nombre,
  codigo: p.codigo,
  activo: p.activo,
  profundidad: 1,
  tipoId: "t1",
  hijos: p.cantones.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    codigo: c.codigo,
    activo: c.activo,
    profundidad: 2,
    tipoId: "t2",
    hijos: c.distritos.map((d) => ({ ...d, profundidad: 3, tipoId: "t3", hijos: [] })),
  })),
}));

// Los tipos de Guatemala, con los mismos nombres que sus `nivelN*`.
const TIPOS: TipoNivelDTO[] = [
  ["Departamento", "Departamentos"],
  ["Municipio", "Municipios"],
  ["Aldea", "Aldeas"],
].map(([nombreSingular, nombrePlural], i) => ({
  id: `t${i + 1}`,
  clave: `nivel_${i + 1}`,
  profundidad: i + 1,
  nombreSingular,
  nombrePlural,
  digitosCodigo: null,
  codigoHeredaPrefijo: false,
}));

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
  acciones.arbolDePaisAction.mockResolvedValue({ status: "ok", tipos: TIPOS, raices: RAICES });
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
    // SLT-46 T6.1: el panel del árbol se titula «Lugares» (maqueta T0.2, versión 7).
    expect(screen.getByRole("heading", { name: "Lugares" })).toBeInTheDocument();
  });
});

describe("SLT-46 T6.3 — el panel «Niveles del país» junto a «Lugares»", () => {
  it("la página monta «Niveles del país» con los tipos del país elegido, por profundidad", async () => {
    await montar("GT");

    expect(screen.getByRole("heading", { name: "Niveles del país" })).toBeInTheDocument();
    const filas = within(screen.getByRole("list", { name: "Niveles del país" })).getAllByRole("listitem");
    expect(filas.map((li) => within(li).getByRole("button", { name: /^Editar nivel/ }).getAttribute("aria-label"))).toEqual([
      "Editar nivel 1, Departamento",
      "Editar nivel 2, Municipio",
      "Editar nivel 3, Aldea",
    ]);
    expect(filas[1]).toHaveTextContent("Plural: Municipios · CSV: nivel_2");
    expect(screen.getByRole("heading", { name: "Lugares" })).toBeInTheDocument();
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
    acciones.crearNodoAction.mockResolvedValue({ status: "ok", id: "p-new" });
    await montar("GT");

    await user.click(screen.getByRole("button", { name: "Añadir departamento" }));
    expect(screen.getByRole("heading", { name: "Alta: Departamento" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Nombre/), "Petén");
    await user.type(screen.getByLabelText(/^Código oficial/), "17");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // SLT-46 (R58): guardar abre la confirmación; la action se llama al confirmar, sin `nivel` (R14).
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, crear" }));
    await waitFor(() =>
      expect(acciones.crearNodoAction).toHaveBeenCalledWith({
        nombre: "Petén",
        paisId: "GT",
        codigo: "17",
      }),
    );
  });
});

describe("R31 — el conteo de la confirmación no bloquea el retiro", () => {
  it("muestra las órdenes sin entregar de todas las empresas", async () => {
    const user = userEvent.setup();
    acciones.contarOrdenesSinEntregarAction.mockResolvedValue({ status: "ok", ordenes: 7 });
    await montar("GT");

    // SLT-46 T6.1: «Retirar» (maqueta T0.2) y el conteo por id, sin `nivel`.
    await user.click(screen.getByRole("button", { name: "Retirar Escuintla" }));
    const dialogo = await screen.findByRole("dialog");
    expect(
      await within(dialogo).findByText("Órdenes sin entregar en este nodo, de todas las empresas: 7."),
    ).toBeInTheDocument();
    expect(acciones.contarOrdenesSinEntregarAction).toHaveBeenCalledWith({ id: "p-gua" });
  });

  it("si el conteo falla, lo dice y deja retirar", async () => {
    const user = userEvent.setup();
    acciones.contarOrdenesSinEntregarAction.mockResolvedValue({ status: "error" });
    acciones.cambiarActivacionNodoAction.mockResolvedValue({ status: "ok", id: "p-gua", activo: false });
    await montar("GT");

    await user.click(screen.getByRole("button", { name: "Retirar Escuintla" }));
    const dialogo = await screen.findByRole("dialog");
    expect(
      await within(dialogo).findByText(
        "No se pudo contar las órdenes sin entregar de este nodo. Puedes retirarlo igual.",
      ),
    ).toBeInTheDocument();

    const retirar = within(dialogo).getByRole("button", { name: "Sí, retirar" });
    expect(retirar).toBeEnabled();
    await user.click(retirar);
    await waitFor(() =>
      expect(acciones.cambiarActivacionNodoAction).toHaveBeenCalledWith({ id: "p-gua", activo: false }),
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

  // SLT-46 (T6.2; R23, R54, R58): la entrada es `{ id, tipos }` en el orden en pantalla (antes, seis
  // campos `nivelN*`), y la action se llama al confirmar en el modal, no al pulsar «Dar de alta».
  it("el envío lleva el id elegido y los niveles en orden, sin nombre de país", async () => {
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
    expect(acciones.crearPaisAction).not.toHaveBeenCalled();
    const confirmar = await screen.findByRole("dialog", { name: "Dar de alta un país" });
    await user.click(within(confirmar).getByRole("button", { name: "Sí, crear" }));

    await waitFor(() => expect(acciones.crearPaisAction).toHaveBeenCalledTimes(1));
    expect(acciones.crearPaisAction).toHaveBeenCalledWith({
      id: "SV",
      tipos: [
        { singular: "Departamento", plural: "Departamentos" },
        { singular: "Municipio", plural: "Municipios" },
        { singular: "Distrito", plural: "Distritos" },
      ],
    });
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/plataforma/geografia?pais=SV"));
  });

  it("sin país elegido no envía y lo pide", async () => {
    const { user, dialogo } = await abrirAlta();
    await user.click(within(dialogo).getByRole("button", { name: "Dar de alta" }));
    expect(await within(dialogo).findByText("Elige un país de la lista.")).toBeInTheDocument();
    expect(acciones.crearPaisAction).not.toHaveBeenCalled();
  });

  // Los dados de alta ya no se ofrecen (decisión 11): el `conflict` llega si otra sesión da de alta
  // el mismo país mientras el diálogo está abierto. Por eso se elige uno que aquí no está.
  it("un país que otra sesión acaba de dar de alta se dice junto al buscador", async () => {
    acciones.crearPaisAction.mockResolvedValue({ status: "conflict", campo: "id" });
    const { user, dialogo } = await abrirAlta();
    await user.type(within(dialogo).getByRole("combobox", { name: /^País/ }), "sv");
    await user.click(await screen.findByRole("option", { name: "El Salvador (SV)" }));
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
    // SLT-46 (R58): el `conflict` llega tras confirmar; el modal se cierra y el error vuelve al buscador.
    const confirmar = await screen.findByRole("dialog", { name: "Dar de alta un país" });
    await user.click(within(confirmar).getByRole("button", { name: "Sí, crear" }));
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
    // SLT-46 (P11): el interruptor pide confirmación con el antes → después; sin ella no se llama.
    const confirmar = await screen.findByRole("dialog", { name: "Disponibilidad de Guatemala" });
    const estado = within(confirmar).getByRole("rowheader", { name: "Estado" }).closest("tr") as HTMLElement;
    expect(within(estado).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Disponible", "No disponible"]);
    expect(acciones.cambiarDisponibilidadPaisAction).not.toHaveBeenCalled();
    await user.click(within(confirmar).getByRole("button", { name: "Sí, cambiar" }));
    await waitFor(() =>
      expect(acciones.cambiarDisponibilidadPaisAction).toHaveBeenCalledWith({ id: "GT", disponible: false }),
    );
    await waitFor(() => expect(interruptor).toHaveAttribute("aria-checked", "false"));
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("P11: cancelar la confirmación no llama a la action ni mueve el interruptor", async () => {
    const user = userEvent.setup();
    await montar("GT");

    const interruptor = screen.getByRole("switch", { name: "Disponible: Guatemala" });
    await user.click(interruptor);
    const confirmar = await screen.findByRole("dialog", { name: "Disponibilidad de Guatemala" });
    await user.click(within(confirmar).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.cambiarDisponibilidadPaisAction).not.toHaveBeenCalled();
    expect(interruptor).toHaveAttribute("aria-checked", "true");
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
    // SLT-46 (P11): antes de cargar, el modal con el archivo y el país; la action, al confirmar.
    const confirmar = await screen.findByRole("dialog", { name: "Cargar la división" });
    expect(within(confirmar).getByRole("rowheader", { name: "Archivo" }).closest("tr")).toHaveTextContent("division.csv");
    expect(within(confirmar).getByRole("rowheader", { name: "País" }).closest("tr")).toHaveTextContent("Guatemala");
    expect(acciones.cargarDivisionAction).not.toHaveBeenCalled();
    await user.click(within(confirmar).getByRole("button", { name: "Sí, cargar" }));
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
      creados: { 1: 1, 2: 2, 3: 3 },
      existentes: 4,
      codigosCompletados: 5,
      avisos: [],
    });
    // SLT-46 T6.3: la página tiene ahora más de un `role="status"` (la región aria-live de la lista de
    // «Niveles del país»); el resumen se busca por su encabezado, como en «R30, R33».
    const resumen = (await screen.findByText("Carga hecha. Altas:")).parentElement as HTMLElement;
    expect(within(resumen).getByText("Departamentos: 1")).toBeInTheDocument();
    expect(within(resumen).getByText("Municipios: 2")).toBeInTheDocument();
    expect(within(resumen).getByText("Aldeas: 3")).toBeInTheDocument();
    expect(within(resumen).getByText("Ya existían: 4")).toBeInTheDocument();
    expect(within(resumen).getByText("Códigos completados: 5")).toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("P11: cancelar la confirmación no carga nada", async () => {
    const user = userEvent.setup();
    await montar("GT");
    await user.upload(screen.getByLabelText("Archivo CSV"), new File(["x"], "division.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Cargar" }));
    const confirmar = await screen.findByRole("dialog", { name: "Cargar la división" });
    await user.click(within(confirmar).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.cargarDivisionAction).not.toHaveBeenCalled();
  });

  it("un archivo rechazado dice el motivo", async () => {
    await subir({ status: "archivo_rechazado", motivo: "Falta la columna nivel_3." });
    expect(await screen.findByText("Archivo rechazado: Falta la columna nivel_3.")).toBeInTheDocument();
  });
});

// SLT-46 (T6.2; R30, R33): un país de P niveles. La equivalencia de columnas va de `nivel_1` a
// `nivel_P` con el singular de cada tipo, y el resumen pinta `creados` por profundidad con su plural.
describe("R30, R33 — la carga CSV a P niveles", () => {
  const CUATRO: TipoNivelDTO[] = [
    ...TIPOS,
    {
      id: "t4",
      clave: "nivel_4",
      profundidad: 4,
      nombreSingular: "Caserío",
      nombrePlural: "Caseríos",
      digitosCodigo: null,
      codigoHeredaPrefijo: false,
    },
  ];

  function columnasDeLaTabla(): (string | null)[] {
    return within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((fila) => within(fila).getAllByRole("cell")[0].textContent);
  }

  it("la tabla lleva nivel_k y codigo_nivel_k para k = 1..4, con el nombre de cada tipo", async () => {
    acciones.arbolDePaisAction.mockResolvedValue({ status: "ok", tipos: CUATRO, raices: RAICES });
    await montar("GT");

    expect(columnasDeLaTabla()).toEqual([
      "nivel_1",
      "codigo_nivel_1",
      "nivel_2",
      "codigo_nivel_2",
      "nivel_3",
      "codigo_nivel_3",
      "nivel_4",
      "codigo_nivel_4",
    ]);
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("Caserío")).toBeInTheDocument();
    expect(within(tabla).getByText("Código de caserío (opcional)")).toBeInTheDocument();
  });

  it("un país de 2 niveles pide solo cuatro columnas", async () => {
    acciones.arbolDePaisAction.mockResolvedValue({ status: "ok", tipos: TIPOS.slice(0, 2), raices: [] });
    await montar("GT");

    expect(columnasDeLaTabla()).toEqual(["nivel_1", "codigo_nivel_1", "nivel_2", "codigo_nivel_2"]);
  });

  it("el resumen pinta lo creado en cada profundidad con el plural de su tipo", async () => {
    const user = userEvent.setup();
    acciones.arbolDePaisAction.mockResolvedValue({ status: "ok", tipos: CUATRO, raices: RAICES });
    acciones.cargarDivisionAction.mockResolvedValue({
      status: "ok",
      creados: { 1: 1, 2: 2, 3: 3, 4: 9 },
      existentes: 0,
      codigosCompletados: 0,
      avisos: [],
    });
    await montar("GT");
    await user.upload(screen.getByLabelText("Archivo CSV"), new File(["x"], "division.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Cargar" }));
    const confirmar = await screen.findByRole("dialog", { name: "Cargar la división" });
    await user.click(within(confirmar).getByRole("button", { name: "Sí, cargar" }));

    const resumen = (await screen.findByText("Carga hecha. Altas:")).parentElement as HTMLElement;
    expect(within(resumen).getByText("Departamentos: 1")).toBeInTheDocument();
    expect(within(resumen).getByText("Municipios: 2")).toBeInTheDocument();
    expect(within(resumen).getByText("Aldeas: 3")).toBeInTheDocument();
    expect(within(resumen).getByText("Caseríos: 9")).toBeInTheDocument();
  });
});

// Decisión 13 (revisión de diseño de la pantalla): los estados de carga fallida y vacía, y el foco
// del formulario de alta, que se abre lejos de la fila que lo pide.
describe("Decisión 13 — estados vacío y de error, y foco del alta", () => {
  it("si la lista de países falla, lo dice y no lo disfraza de «aún no hay ninguno»", async () => {
    acciones.listarPaisesAction.mockResolvedValue({ status: "error" });
    await montar();

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar la lista de países.");
    expect(screen.queryByText("Aún no hay ningún país dado de alta.")).toBeNull();
    expect(screen.getByRole("button", { name: "Nuevo país" })).toBeInTheDocument();
  });

  it("sin ningún país dado de alta, el estado vacío explica el siguiente paso y ofrece el alta", async () => {
    acciones.listarPaisesAction.mockResolvedValue({ status: "ok", paises: [] });
    await montar();

    expect(screen.getByText("Aún no hay ningún país dado de alta.")).toBeInTheDocument();
    expect(screen.getByText("Da de alta el primero; después podrás cargar su división.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo país" })).toBeInTheDocument();
    expect(acciones.arbolDePaisAction).not.toHaveBeenCalled();
  });

  it("si la división falla, un solo aviso y nada de «aún no tiene división»", async () => {
    acciones.arbolDePaisAction.mockResolvedValue({ status: "error" });
    await montar("GT");

    expect(screen.getAllByText("No se pudo cargar la división del país.")).toHaveLength(1);
    expect(screen.queryByText("Este país aún no tiene división cargada.")).toBeNull();
  });

  it("un país sin división muestra el estado vacío con los nombres del país y sin barra de búsqueda", async () => {
    acciones.arbolDePaisAction.mockResolvedValue({ status: "ok", tipos: TIPOS, raices: [] });
    await montar("GT");

    expect(screen.getByText("Este país aún no tiene división cargada.")).toBeInTheDocument();
    expect(
      // SLT-46 T6.1: el botón dice «+ Departamento» (maqueta T0.2).
      screen.getByText("Carga un CSV con toda la división o usa «+ Departamento» para ir a mano."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("un filtro sin coincidencias lo dice y sugiere qué cambiar", async () => {
    const user = userEvent.setup();
    await montar("GT");

    await user.type(screen.getByRole("searchbox", { name: "Buscar en la división de Guatemala" }), "zzz");
    expect(screen.getByText("Sin resultados.")).toBeInTheDocument();
    expect(screen.getByText("Prueba con otro nombre o cambia el filtro de estado.")).toBeInTheDocument();
  });

  it("el alta lleva el foco al nombre, guarda con Enter y al cancelar el foco vuelve al botón que la abrió", async () => {
    const user = userEvent.setup();
    acciones.crearNodoAction.mockResolvedValue({ status: "ok", id: "c-new" });
    await montar("GT");

    const abrir = screen.getByRole("button", { name: "Añadir municipio a Escuintla" });
    await user.click(abrir);
    const formulario = screen.getByRole("form", { name: "Alta: Municipio" });
    expect(within(formulario).getByLabelText(/^Nombre/)).toHaveFocus();

    await user.click(within(formulario).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("form", { name: "Alta: Municipio" })).toBeNull();
    expect(abrir).toHaveFocus();

    await user.click(abrir);
    await user.keyboard("Palín{Enter}");
    // SLT-46 (R58): Enter pide guardar y abre la confirmación; se llama al confirmar, con el padre.
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, crear" }));
    await waitFor(() =>
      expect(acciones.crearNodoAction).toHaveBeenCalledWith({
        padreId: "p-gua",
        nombre: "Palín",
      }),
    );
    // Decisión 15: el aviso no concuerda en género con el nodo.
    expect(toastMock.success).toHaveBeenCalledWith("Se dio de alta «Palín» (Municipio).");
  });
});
