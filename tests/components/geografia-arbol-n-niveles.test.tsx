// @vitest-environment jsdom
// SLT-46 (T6.1; design §4.6, §4.7, §6) — EL PANEL «LUGARES»: el árbol de N niveles del superadmin.
//
// Cubre R21 (árbol a cualquier profundidad con el singular del tipo de cada lugar, y «agregar hijo»
// solo donde hay tipo siguiente), R14 (el tipo del alta no se elige), R22 (no hay mover), R58/R59
// para las cuatro escrituras (validación con el esquema del servidor antes del modal, antes → después,
// cancelar no llama, confirmar llama una vez), R61 (el aviso del cambio concurrente del renombre),
// R20 (el conteo del retiro) y R12 (Costa Rica con sus tres niveles de siempre).
//
// Se monta el módulo real; lo doblado es el borde: las Server Actions, el router y el toast.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { NodoArbolPlataformaDTO, TipoNivelDTO } from "@/lib/types/geografia-nodo";

const routerMock = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

const toastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() };
vi.mock("@/hooks/useToast", () => ({ useToast: () => toastMock }));

const acciones = {
  crearNodoAction: vi.fn(),
  renombrarNodoAction: vi.fn(),
  cambiarActivacionNodoAction: vi.fn(),
  contarOrdenesSinEntregarAction: vi.fn(),
};
vi.mock("@/lib/actions/geografia-plataforma", () => ({
  crearNodoAction: (...a: unknown[]) => acciones.crearNodoAction(...a),
  renombrarNodoAction: (...a: unknown[]) => acciones.renombrarNodoAction(...a),
  cambiarActivacionNodoAction: (...a: unknown[]) => acciones.cambiarActivacionNodoAction(...a),
  contarOrdenesSinEntregarAction: (...a: unknown[]) => acciones.contarOrdenesSinEntregarAction(...a),
}));

import { GeografiaAdminModule } from "@/app/(app)/plataforma/geografia/_components/GeografiaAdminModule";

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

// Un país de CUATRO niveles que no se llama como Costa Rica.
const TIPOS_4 = [
  tipo(1, "Región", "Regiones"),
  tipo(2, "Comuna", "Comunas"),
  tipo(3, "Barrio", "Barrios"),
  tipo(4, "Manzana", "Manzanas"),
];

const RAICES_4: NodoArbolPlataformaDTO[] = [
  nodo("r1", "Norte", 1, {
    codigo: "01",
    hijos: [
      nodo("c1", "Arica", 2, {
        codigo: "0101",
        hijos: [nodo("b1", "Centro", 3, { hijos: [nodo("m1", "Manzana Uno", 4, { codigo: "M-1" })] })],
      }),
      nodo("c2", "Putre", 2, { activo: false }),
    ],
  }),
  nodo("r2", "Sur", 1, { activo: false }),
];

function montar(props: { tipos?: TipoNivelDTO[]; raices?: NodoArbolPlataformaDTO[]; paisId?: string; paisNombre?: string } = {}) {
  return render(
    <GeografiaAdminModule
      paisId={props.paisId ?? "CL"}
      paisNombre={props.paisNombre ?? "Chile"}
      tipos={props.tipos ?? TIPOS_4}
      raices={props.raices ?? RAICES_4}
    />,
  );
}

async function expandir(user: ReturnType<typeof userEvent.setup>, ...nombres: string[]) {
  for (const nombre of nombres) await user.click(screen.getByRole("button", { name: `Expandir ${nombre}` }));
}

function fila(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-nodo="${id}"]`);
  if (el === null) throw new Error(`No se pinta la fila ${id}`);
  return el;
}

/** Las filas de la tabla antes → después del modal, sin el encabezado: [dato, antes, después]. */
function filasDelModal(dialogo: HTMLElement): string[][] {
  return within(dialogo)
    .getAllByRole("row")
    .slice(1)
    .map((r) => Array.from(r.children).map((c) => c.textContent ?? ""));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("R21 — el árbol a cualquier profundidad", () => {
  it("pinta el chip con el singular del tipo en cada uno de los cuatro niveles, y el código", async () => {
    const user = userEvent.setup();
    const { container } = montar();
    await expandir(user, "Norte", "Arica", "Centro");

    expect(within(fila(container, "r1")).getByText("Región")).toBeInTheDocument();
    expect(within(fila(container, "r1")).getByText("01")).toBeInTheDocument();
    expect(within(fila(container, "c1")).getByText("Comuna")).toBeInTheDocument();
    expect(within(fila(container, "b1")).getByText("Barrio")).toBeInTheDocument();
    expect(within(fila(container, "m1")).getByText("Manzana")).toBeInTheDocument();
    expect(within(fila(container, "m1")).getByText("M-1")).toBeInTheDocument();
  });

  it("el chevron es un botón con aria-expanded y nombre", async () => {
    const user = userEvent.setup();
    montar();
    const chevron = screen.getByRole("button", { name: "Expandir Norte" });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    await user.click(chevron);
    expect(screen.getByRole("button", { name: "Contraer Norte" })).toHaveAttribute("aria-expanded", "true");
  });

  it("marca «Retirado» y ofrece «Reactivar» solo en los retirados", async () => {
    const user = userEvent.setup();
    const { container } = montar();
    await expandir(user, "Norte");

    expect(within(fila(container, "r2")).getByText("Retirado")).toBeInTheDocument();
    expect(within(fila(container, "c2")).getByText("Retirado")).toBeInTheDocument();
    expect(within(fila(container, "r1")).queryByText("Retirado")).toBeNull();
    expect(screen.getByRole("button", { name: "Reactivar Sur" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirar Norte" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirar Sur" })).toBeNull();
  });

  it("«+ <tipo siguiente>» solo con tipo siguiente, y nunca en un retirado ni en el último nivel (R14: sin elegir tipo)", async () => {
    const user = userEvent.setup();
    const { container } = montar();
    await expandir(user, "Norte", "Arica", "Centro");

    expect(screen.getByRole("button", { name: "Añadir región" })).toHaveTextContent("Región");
    expect(screen.getByRole("button", { name: "Añadir comuna a Norte" })).toHaveTextContent("Comuna");
    expect(screen.getByRole("button", { name: "Añadir barrio a Arica" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir manzana a Centro" })).toBeInTheDocument();

    expect(within(fila(container, "m1")).queryByRole("button", { name: /^Añadir/ })).toBeNull();
    expect(within(fila(container, "r2")).queryByRole("button", { name: /^Añadir/ })).toBeNull();
    expect(within(fila(container, "c2")).queryByRole("button", { name: /^Añadir/ })).toBeNull();

    // Ningún control para elegir el tipo del alta.
    await user.click(screen.getByRole("button", { name: "Añadir comuna a Norte" }));
    const formulario = screen.getByRole("form", { name: "Alta: Comuna" });
    expect(within(formulario).queryByRole("combobox")).toBeNull();
    expect(within(formulario).queryByLabelText(/tipo/i)).toBeNull();
  });

  it("con un país sin tipo para la profundidad siguiente, no ofrece agregar hijo", async () => {
    const user = userEvent.setup();
    const { container } = montar({ tipos: TIPOS_4.slice(0, 2) });
    await expandir(user, "Norte");
    expect(screen.getByRole("button", { name: "Añadir comuna a Norte" })).toBeInTheDocument();
    expect(within(fila(container, "c1")).queryByRole("button", { name: /^Añadir/ })).toBeNull();
  });
});

describe("R22 — no hay mover", () => {
  it("ninguna fila ofrece mover ni se puede arrastrar", async () => {
    const user = userEvent.setup();
    const { container } = montar();
    await expandir(user, "Norte", "Arica", "Centro");
    expect(screen.queryAllByRole("button", { name: /mover|cambiar de padre/i })).toHaveLength(0);
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0);
  });
});

describe("R58, R59 — alta de un lugar", () => {
  async function abrirAltaEnNorte() {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Añadir comuna a Norte" }));
    return user;
  }

  it("un nombre inválido da el error del esquema en el campo, sin modal y sin action", async () => {
    const user = await abrirAltaEnNorte();
    await user.type(screen.getByLabelText(/^Nombre/), "A");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El nombre debe tener al menos 2 caracteres.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nombre/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(acciones.crearNodoAction).not.toHaveBeenCalled();
  });

  it("válido: modal con «—» → nombre, código y tipo, y la cadena del padre; cancelar no llama", async () => {
    const user = await abrirAltaEnNorte();
    await user.type(screen.getByLabelText(/^Nombre/), "Pozo Almonte");
    await user.type(screen.getByLabelText(/^Código oficial/), "0102");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Dentro de Chile › Norte.")).toBeInTheDocument();
    expect(filasDelModal(dialogo)).toEqual([
      ["Nombre", "—Sin valor", "Pozo Almonte"],
      ["Código", "—Sin valor", "0102"],
      ["Tipo", "—Sin valor", "Comuna"],
    ]);

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.crearNodoAction).not.toHaveBeenCalled();
  });

  it("confirmar llama una vez con el padre, el nombre y el código, y refresca", async () => {
    acciones.crearNodoAction.mockResolvedValue({ status: "ok", id: "c-new" });
    const user = await abrirAltaEnNorte();
    await user.type(screen.getByLabelText(/^Nombre/), "Pozo Almonte");
    await user.type(screen.getByLabelText(/^Código oficial/), "0102");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, crear" }));

    await waitFor(() => expect(acciones.crearNodoAction).toHaveBeenCalledTimes(1));
    expect(acciones.crearNodoAction).toHaveBeenCalledWith({ padreId: "r1", nombre: "Pozo Almonte", codigo: "0102" });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(toastMock.success).toHaveBeenCalledWith("Se dio de alta «Pozo Almonte» (Comuna).");
  });

  it("un `conflict` por nombre de hermano vuelve al campo con el mensaje de siempre", async () => {
    acciones.crearNodoAction.mockResolvedValue({ status: "conflict" });
    const user = await abrirAltaEnNorte();
    await user.type(screen.getByLabelText(/^Nombre/), "Arica");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, crear" }));

    expect(await screen.findByText("Ya existe un nodo con ese nombre o ese código.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nombre/)).toHaveAttribute("aria-invalid", "true");
  });
});

describe("R58, R59, R61 — renombre de un lugar", () => {
  async function abrirRenombreDeArica() {
    const user = userEvent.setup();
    montar();
    await expandir(user, "Norte");
    await user.click(screen.getByRole("button", { name: "Renombrar Arica" }));
    const campo = screen.getByLabelText(/^Nombre/);
    await user.clear(campo);
    return { user, campo };
  }

  it("un nombre inválido da el error en el campo, sin modal y sin action", async () => {
    const { user, campo } = await abrirRenombreDeArica();
    await user.type(campo, "X");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El nombre debe tener al menos 2 caracteres.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(acciones.renombrarNodoAction).not.toHaveBeenCalled();
  });

  it("válido: modal con el nombre actual → el nuevo; cancelar no llama", async () => {
    const { user, campo } = await abrirRenombreDeArica();
    await user.type(campo, "Arica Nueva");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const dialogo = await screen.findByRole("dialog");
    expect(filasDelModal(dialogo)).toEqual([["Nombre", "Arica", "Arica Nueva"]]);
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.renombrarNodoAction).not.toHaveBeenCalled();
  });

  it("confirmar llama una vez con `nombreAnterior`", async () => {
    acciones.renombrarNodoAction.mockResolvedValue({ status: "ok", id: "c1", nombre: "Arica Nueva" });
    const { user, campo } = await abrirRenombreDeArica();
    await user.type(campo, "Arica Nueva");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, renombrar" }));

    await waitFor(() => expect(acciones.renombrarNodoAction).toHaveBeenCalledTimes(1));
    expect(acciones.renombrarNodoAction).toHaveBeenCalledWith({
      id: "c1",
      nombre: "Arica Nueva",
      nombreAnterior: "Arica",
    });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(toastMock.success).toHaveBeenCalledWith("«Arica» ahora es «Arica Nueva».");
  });

  it("R61 — un `conflict` con `motivo: cambio_concurrente` avisa en el modal y refresca", async () => {
    acciones.renombrarNodoAction.mockResolvedValue({ status: "conflict", motivo: "cambio_concurrente" });
    const { user, campo } = await abrirRenombreDeArica();
    await user.type(campo, "Arica Nueva");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Sí, renombrar" }));

    expect(
      await within(dialogo).findByText("Otra persona cambió este dato mientras tanto; revisa el valor actual."),
    ).toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(acciones.renombrarNodoAction).toHaveBeenCalledTimes(1);
  });
});

// Un lugar cuyo id no pasa `cambiarActivacionGeograficaSchema` (id vacío): la única forma de que el
// esquema del retiro o la reactivación falle desde la pantalla.
const RAICES_ID_ROTO: NodoArbolPlataformaDTO[] = [nodo("", "Fantasma", 1)];
const RAICES_ID_ROTO_RETIRADO: NodoArbolPlataformaDTO[] = [nodo("", "Fantasma", 1, { activo: false })];

describe("R58, R59, R20 — retiro de un lugar", () => {
  it("si no pasa el esquema, error en la fila, sin modal, sin conteo y sin action", async () => {
    const user = userEvent.setup();
    montar({ raices: RAICES_ID_ROTO });
    await user.click(screen.getByRole("button", { name: "Retirar Fantasma" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Este lugar no tiene un identificador válido; recarga la página.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(acciones.contarOrdenesSinEntregarAction).not.toHaveBeenCalled();
    expect(acciones.cambiarActivacionNodoAction).not.toHaveBeenCalled();
  });

  it("válido: modal Activo → Retirado con el conteo de órdenes; cancelar no llama", async () => {
    acciones.contarOrdenesSinEntregarAction.mockResolvedValue({ status: "ok", ordenes: 3 });
    const user = userEvent.setup();
    montar();
    await expandir(user, "Norte");
    await user.click(screen.getByRole("button", { name: "Retirar Arica" }));

    const dialogo = await screen.findByRole("dialog");
    expect(filasDelModal(dialogo)).toEqual([["Estado", "Activo", "Retirado"]]);
    expect(
      await within(dialogo).findByText("Órdenes sin entregar en este nodo, de todas las empresas: 3."),
    ).toBeInTheDocument();
    expect(acciones.contarOrdenesSinEntregarAction).toHaveBeenCalledWith({ id: "c1" });

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.cambiarActivacionNodoAction).not.toHaveBeenCalled();
  });

  it("confirmar llama una vez con `activo: false`; si el conteo falla no bloquea", async () => {
    acciones.contarOrdenesSinEntregarAction.mockResolvedValue({ status: "error" });
    acciones.cambiarActivacionNodoAction.mockResolvedValue({ status: "ok", id: "c1", activo: false });
    const user = userEvent.setup();
    montar();
    await expandir(user, "Norte");
    await user.click(screen.getByRole("button", { name: "Retirar Arica" }));

    const dialogo = await screen.findByRole("dialog");
    expect(
      await within(dialogo).findByText(
        "No se pudo contar las órdenes sin entregar de este nodo. Puedes retirarlo igual.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Sí, retirar" }));

    await waitFor(() => expect(acciones.cambiarActivacionNodoAction).toHaveBeenCalledTimes(1));
    expect(acciones.cambiarActivacionNodoAction).toHaveBeenCalledWith({ id: "c1", activo: false });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
  });
});

describe("R58, R59 — reactivación de un lugar", () => {
  it("si no pasa el esquema, error en la fila, sin modal y sin action", async () => {
    const user = userEvent.setup();
    montar({ raices: RAICES_ID_ROTO_RETIRADO });
    await user.click(screen.getByRole("button", { name: "Reactivar Fantasma" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Este lugar no tiene un identificador válido; recarga la página.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(acciones.cambiarActivacionNodoAction).not.toHaveBeenCalled();
  });

  it("válido: modal Retirado → Activo; cancelar no llama", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Reactivar Sur" }));

    const dialogo = await screen.findByRole("dialog");
    expect(filasDelModal(dialogo)).toEqual([["Estado", "Retirado", "Activo"]]);
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.cambiarActivacionNodoAction).not.toHaveBeenCalled();
    expect(acciones.contarOrdenesSinEntregarAction).not.toHaveBeenCalled();
  });

  it("confirmar llama una vez con `activo: true`; si ya estaba activo (P12) es éxito y refresca", async () => {
    acciones.cambiarActivacionNodoAction.mockResolvedValue({ status: "ok", id: "r2", activo: true });
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Reactivar Sur" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, reactivar" }));

    await waitFor(() => expect(acciones.cambiarActivacionNodoAction).toHaveBeenCalledTimes(1));
    expect(acciones.cambiarActivacionNodoAction).toHaveBeenCalledWith({ id: "r2", activo: true });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(toastMock.success).toHaveBeenCalledWith("Se reactivó «Sur».");
  });
});

describe("R12 — Costa Rica, los mismos tres niveles", () => {
  const TIPOS_CR = [tipo(1, "Provincia", "Provincias"), tipo(2, "Cantón", "Cantones"), tipo(3, "Distrito", "Distritos")];
  const RAICES_CR = [
    nodo("p1", "San José", 1, {
      codigo: "1",
      hijos: [nodo("c1", "Escazú", 2, { codigo: "102", hijos: [nodo("d1", "San Rafael", 3, { codigo: "10203" })] })],
    }),
  ];

  it("Provincia, Cantón y Distrito con sus acciones, y el alta de una provincia confirmada", async () => {
    acciones.crearNodoAction.mockResolvedValue({ status: "ok", id: "p-new" });
    const user = userEvent.setup();
    const { container } = montar({ tipos: TIPOS_CR, raices: RAICES_CR, paisId: "CR", paisNombre: "Costa Rica" });
    await expandir(user, "San José", "Escazú");

    expect(within(fila(container, "p1")).getByText("Provincia")).toBeInTheDocument();
    expect(within(fila(container, "c1")).getByText("Cantón")).toBeInTheDocument();
    expect(within(fila(container, "d1")).getByText("Distrito")).toBeInTheDocument();
    expect(screen.getByText("(1 cantón)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir cantón a San José" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir distrito a Escazú" })).toBeInTheDocument();
    expect(within(fila(container, "d1")).queryByRole("button", { name: /^Añadir/ })).toBeNull();
    for (const nombre of ["San José", "Escazú", "San Rafael"]) {
      expect(screen.getByRole("button", { name: `Renombrar ${nombre}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Retirar ${nombre}` })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Añadir provincia" }));
    await user.type(screen.getByLabelText(/^Nombre/), "Limón");
    await user.type(screen.getByLabelText(/^Código oficial/), "7");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Dentro de Costa Rica.")).toBeInTheDocument();
    expect(filasDelModal(dialogo)).toEqual([
      ["Nombre", "—Sin valor", "Limón"],
      ["Código", "—Sin valor", "7"],
      ["Tipo", "—Sin valor", "Provincia"],
    ]);
    expect(acciones.crearNodoAction).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Sí, crear" }));

    await waitFor(() => expect(acciones.crearNodoAction).toHaveBeenCalledTimes(1));
    expect(acciones.crearNodoAction).toHaveBeenCalledWith({ paisId: "CR", nombre: "Limón", codigo: "7" });
    expect(toastMock.success).toHaveBeenCalledWith("Se dio de alta «Limón» (Provincia).");
  });
});
