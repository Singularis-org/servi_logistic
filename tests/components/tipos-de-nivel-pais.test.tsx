// @vitest-environment jsdom
// SLT-46 (T6.3; design §2.4, §4.7, §6) — EL PANEL «NIVELES DEL PAÍS» de un país ya creado.
//
// Cubre R53 (reordenar por la manija con el teclado, sin flechas visibles), R55 (el orden nuevo se ve
// sin guardarse y se envía con los nombres del «antes»), R25/R26 (editar singular y plural con
// `anterior`; los rechazos van al campo), R48/R49 (agregar al final con profundidad P+1, oculto con
// 10), R50 (no hay quitar), R58/R59 (validación antes del modal, antes → después, cancelar no llama),
// R61 (aviso de cambio concurrente) y R12 (Costa Rica con sus tres niveles y las mismas acciones).
//
// Se monta el componente real; lo doblado es el borde: las Server Actions, el router y el toast.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { TipoNivelDTO } from "@/lib/types/geografia-nodo";

const routerMock = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

const toastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() };
vi.mock("@/hooks/useToast", () => ({ useToast: () => toastMock }));

const acciones = {
  renombrarTipoNivelAction: vi.fn(),
  agregarNivelPaisAction: vi.fn(),
  reordenarTiposAction: vi.fn(),
};
vi.mock("@/lib/actions/geografia-plataforma", () => ({
  renombrarTipoNivelAction: (...a: unknown[]) => acciones.renombrarTipoNivelAction(...a),
  agregarNivelPaisAction: (...a: unknown[]) => acciones.agregarNivelPaisAction(...a),
  reordenarTiposAction: (...a: unknown[]) => acciones.reordenarTiposAction(...a),
}));

import { TiposDeNivelPais } from "@/app/(app)/plataforma/geografia/_components/TiposDeNivelPais";

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

// Un país de tres niveles que no se llama como Costa Rica. Llegan desordenados a propósito: el panel
// los pinta por profundidad.
const TIPOS = [tipo(2, "Comuna", "Comunas"), tipo(1, "Región", "Regiones"), tipo(3, "Barrio", "Barrios")];

function montar(tipos: TipoNivelDTO[] = TIPOS) {
  return render(<TiposDeNivelPais paisId="CL" tipos={tipos} />);
}

function filasDeLaLista(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Niveles del país" })).getAllByRole("listitem");
}

function singularesEnPantalla(): string[] {
  return filasDeLaLista().map((li) => within(li).getByRole("button", { name: /^Editar nivel/ }).getAttribute("aria-label") ?? "");
}

/** Las filas del antes → después del modal, como [dato, antes, después]. */
function filasDelModal(dialogo: HTMLElement): string[][] {
  return within(dialogo)
    .getAllByRole("row")
    .slice(1)
    .map((fila) => Array.from(fila.querySelectorAll("th, td")).map((c) => c.textContent ?? ""));
}

async function moverPrimeroAbajo(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole("button", { name: "Mover Región, posición 1 de 3" }).focus();
  await user.keyboard("{ArrowDown}");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("R25, R48, R54 — la lista de niveles del país", () => {
  it("pinta cada nivel por profundidad con su número, singular, plural y columna CSV nivel_k", () => {
    montar();

    expect(screen.getByRole("heading", { name: "Niveles del país" })).toBeInTheDocument();
    const filas = filasDeLaLista();
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveTextContent("1Nivel 1: RegiónPlural: Regiones · CSV: nivel_1");
    expect(filas[1]).toHaveTextContent("Plural: Comunas · CSV: nivel_2");
    expect(filas[2]).toHaveTextContent("Plural: Barrios · CSV: nivel_3");
    expect(singularesEnPantalla()).toEqual([
      "Editar nivel 1, Región",
      "Editar nivel 2, Comuna",
      "Editar nivel 3, Barrio",
    ]);
  });

  it("R50: no hay ningún control para quitar un nivel", () => {
    montar();
    expect(screen.queryByRole("button", { name: /quitar|eliminar|borrar|retirar/i })).toBeNull();
  });

  it("si los tipos no se pudieron leer, lo dice y no pinta lista ni acciones", () => {
    montar([]);
    expect(screen.getByText("No se pudieron leer los niveles del país. Recarga la página.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("R53, R55 — reordenar sin guardar hasta confirmar", () => {
  it("ArrowDown en la manija cambia el orden en pantalla sin llamar a la action y avisa «Orden sin guardar»", async () => {
    const user = userEvent.setup();
    montar();

    await moverPrimeroAbajo(user);

    expect(singularesEnPantalla()).toEqual([
      "Editar nivel 1, Comuna",
      "Editar nivel 2, Región",
      "Editar nivel 3, Barrio",
    ]);
    // La columna del CSV sigue a la posición en pantalla.
    expect(filasDeLaLista()[0]).toHaveTextContent("Plural: Comunas · CSV: nivel_1");
    expect(screen.getByText("Orden sin guardar")).toBeInTheDocument();
    expect(acciones.reordenarTiposAction).not.toHaveBeenCalled();
    // Mientras está sin guardar no se edita ni se agrega.
    for (const li of filasDeLaLista()) expect(within(li).getByRole("button", { name: /^Editar/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar nivel al final" })).toBeDisabled();
    // R53: sin flechas ni botones de subir y bajar.
    expect(screen.queryByRole("button", { name: /subir|bajar/i })).toBeNull();
  });

  it("«Descartar» vuelve al orden de hoy", async () => {
    const user = userEvent.setup();
    montar();
    await moverPrimeroAbajo(user);

    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(singularesEnPantalla()).toEqual([
      "Editar nivel 1, Región",
      "Editar nivel 2, Comuna",
      "Editar nivel 3, Barrio",
    ]);
    expect(screen.queryByText("Orden sin guardar")).toBeNull();
    expect(acciones.reordenarTiposAction).not.toHaveBeenCalled();
  });

  it("R58, R59: «Guardar orden…» abre el modal con el antes → después por profundidad; cancelar no llama", async () => {
    const user = userEvent.setup();
    montar();
    await moverPrimeroAbajo(user);

    await user.click(screen.getByRole("button", { name: "Guardar orden…" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Guardar el nuevo orden de niveles?" });
    expect(filasDelModal(dialogo)).toEqual([
      ["Nivel 1", "Región / Regiones", "Comuna / Comunas"],
      ["Nivel 2", "Comuna / Comunas", "Región / Regiones"],
      ["Nivel 3", "Barrio / Barrios", "Barrio / Barrios"],
    ]);

    await user.click(within(dialogo).getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.reordenarTiposAction).not.toHaveBeenCalled();
    // Cancelar no descarta: el orden sigue en pantalla sin guardar.
    expect(screen.getByText("Orden sin guardar")).toBeInTheDocument();
  });

  it("R55: confirmar llama una vez con el orden nuevo y los nombres de cada tipo («antes»)", async () => {
    const user = userEvent.setup();
    acciones.reordenarTiposAction.mockResolvedValue({ status: "ok" });
    montar();
    await moverPrimeroAbajo(user);

    await user.click(screen.getByRole("button", { name: "Guardar orden…" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Guardar el nuevo orden de niveles?" });
    await user.click(within(dialogo).getByRole("button", { name: "Sí, guardar" }));

    await waitFor(() => expect(acciones.reordenarTiposAction).toHaveBeenCalledTimes(1));
    expect(acciones.reordenarTiposAction).toHaveBeenCalledWith({
      paisId: "CL",
      niveles: [
        { tipoId: "t2", nombreSingular: "Comuna", nombrePlural: "Comunas" },
        { tipoId: "t1", nombreSingular: "Región", nombrePlural: "Regiones" },
        { tipoId: "t3", nombreSingular: "Barrio", nombrePlural: "Barrios" },
      ],
    });
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(screen.queryByText("Orden sin guardar")).toBeNull();
  });

  // D2 (humano, 2026-11-09): el modal se cierra y el aviso queda en la pantalla (antes, dentro del modal).
  it("R61: con motivo «cambio_concurrente» el modal se cierra, la pantalla avisa y la página se refresca", async () => {
    const user = userEvent.setup();
    acciones.reordenarTiposAction.mockResolvedValue({ status: "conflict", motivo: "cambio_concurrente" });
    montar();
    await moverPrimeroAbajo(user);

    await user.click(screen.getByRole("button", { name: "Guardar orden…" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Guardar el nuevo orden de niveles?" });
    await user.click(within(dialogo).getByRole("button", { name: "Sí, guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Este dato cambió mientras tanto; revisa el valor actual.")).toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(acciones.reordenarTiposAction).toHaveBeenCalledTimes(1);
  });
});

describe("R25, R26 — editar singular y plural", () => {
  it("R59: un nombre inválido deja el error en su campo, sin modal ni action", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Editar nivel 2, Comuna" }));
    const singular = screen.getByLabelText(/^Singular/);
    expect(singular).toHaveFocus();
    await user.clear(singular);
    await user.type(singular, "C");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Debe tener al menos 2 caracteres.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(acciones.renombrarTipoNivelAction).not.toHaveBeenCalled();
  });

  it("R58, R61: uno válido muestra singular y plural antes → después y envía `anterior`", async () => {
    const user = userEvent.setup();
    acciones.renombrarTipoNivelAction.mockResolvedValue({ status: "ok" });
    montar();

    await user.click(screen.getByRole("button", { name: "Editar nivel 2, Comuna" }));
    await user.clear(screen.getByLabelText(/^Singular/));
    await user.type(screen.getByLabelText(/^Singular/), "  Zona ");
    await user.clear(screen.getByLabelText(/^Plural/));
    await user.type(screen.getByLabelText(/^Plural/), "Zonas");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const dialogo = await screen.findByRole("dialog", { name: "¿Guardar el cambio del nivel 2?" });
    expect(filasDelModal(dialogo)).toEqual([
      ["Singular", "Comuna", "Zona"],
      ["Plural", "Comunas", "Zonas"],
    ]);
    await user.click(within(dialogo).getByRole("button", { name: "Sí, guardar" }));

    await waitFor(() => expect(acciones.renombrarTipoNivelAction).toHaveBeenCalledTimes(1));
    expect(acciones.renombrarTipoNivelAction).toHaveBeenCalledWith({
      tipoId: "t2",
      nombreSingular: "Zona",
      nombrePlural: "Zonas",
      anterior: { nombreSingular: "Comuna", nombrePlural: "Comunas" },
    });
    expect(routerMock.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("form", { name: "Editar nivel 2" })).toBeNull());
  });

  it("cancelar el modal no llama a la action", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Editar nivel 1, Región" }));
    await user.type(screen.getByLabelText(/^Plural/), "s");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Guardar el cambio del nivel 1?" });
    await user.click(within(dialogo).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.renombrarTipoNivelAction).not.toHaveBeenCalled();
  });

  it("R26: un `validation_error` del servidor va al campo y un `not_found` se dice en el formulario", async () => {
    const user = userEvent.setup();
    acciones.renombrarTipoNivelAction.mockResolvedValueOnce({
      status: "validation_error",
      fieldErrors: { nombrePlural: ["No puede superar los 40 caracteres."] },
    });
    montar();

    await user.click(screen.getByRole("button", { name: "Editar nivel 3, Barrio" }));
    await user.type(screen.getByLabelText(/^Plural/), "x");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, guardar" }));

    const formulario = await screen.findByRole("form", { name: "Editar nivel 3" });
    expect(await within(formulario).findByText("No puede superar los 40 caracteres.")).toBeInTheDocument();

    acciones.renombrarTipoNivelAction.mockResolvedValueOnce({ status: "not_found" });
    await user.click(within(formulario).getByRole("button", { name: "Guardar" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, guardar" }));
    expect(
      await within(formulario).findByText("Ese nivel o su país ya no existe; recarga la página."),
    ).toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});

describe("R48, R49 — agregar un nivel al final", () => {
  it("con 10 niveles no se ofrece", () => {
    montar(Array.from({ length: 10 }, (_, i) => tipo(i + 1, `Nivel ${i + 1}`, `Niveles ${i + 1}`)));
    expect(screen.queryByRole("button", { name: /Agregar nivel/ })).toBeNull();
  });

  it("R59: nombres inválidos dejan el error en su campo, sin modal ni action", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Agregar nivel al final" }));
    expect(screen.getByLabelText(/^Singular/)).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getAllByText("Debe tener al menos 2 caracteres.")).toHaveLength(2);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(acciones.agregarNivelPaisAction).not.toHaveBeenCalled();
  });

  it("R58: uno válido muestra los niveles de hoy y el nuevo como P+1, y llama con profundidad P+1", async () => {
    const user = userEvent.setup();
    acciones.agregarNivelPaisAction.mockResolvedValue({ status: "ok", tipo: tipo(4, "Manzana", "Manzanas") });
    montar();

    await user.click(screen.getByRole("button", { name: "Agregar nivel al final" }));
    await user.type(screen.getByLabelText(/^Singular/), "Manzana");
    await user.type(screen.getByLabelText(/^Plural/), "Manzanas");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    const dialogo = await screen.findByRole("dialog", { name: "¿Agregar el nivel 4?" });
    expect(filasDelModal(dialogo)).toEqual([
      ["Nivel 1", "Región / Regiones", "Región / Regiones"],
      ["Nivel 2", "Comuna / Comunas", "Comuna / Comunas"],
      ["Nivel 3", "Barrio / Barrios", "Barrio / Barrios"],
      ["Nivel 4", "—Sin valor", "Manzana / Manzanas"],
    ]);
    await user.click(within(dialogo).getByRole("button", { name: "Sí, agregar" }));

    await waitFor(() => expect(acciones.agregarNivelPaisAction).toHaveBeenCalledTimes(1));
    expect(acciones.agregarNivelPaisAction).toHaveBeenCalledWith({
      paisId: "CL",
      nombreSingular: "Manzana",
      nombrePlural: "Manzanas",
      profundidad: 4,
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("R49: el tope que devuelve el servidor se dice en el formulario", async () => {
    const user = userEvent.setup();
    acciones.agregarNivelPaisAction.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { paisId: ["Un país tiene como mucho 10 niveles."] },
    });
    montar();

    await user.click(screen.getByRole("button", { name: "Agregar nivel al final" }));
    await user.type(screen.getByLabelText(/^Singular/), "Manzana");
    await user.type(screen.getByLabelText(/^Plural/), "Manzanas");
    await user.click(screen.getByRole("button", { name: "Agregar" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, agregar" }));

    expect(await screen.findByText("Un país tiene como mucho 10 niveles.")).toBeInTheDocument();
  });
});

describe("R12 — Costa Rica con sus tres niveles y las mismas acciones", () => {
  it("se ven Provincia, Cantón y Distrito, cada uno con su manija y «Editar», y se puede agregar", () => {
    render(
      <TiposDeNivelPais
        paisId="CR"
        tipos={[tipo(1, "Provincia", "Provincias"), tipo(2, "Cantón", "Cantones"), tipo(3, "Distrito", "Distritos")]}
      />,
    );

    expect(filasDeLaLista()[0]).toHaveTextContent("Plural: Provincias · CSV: nivel_1");
    expect(filasDeLaLista()[1]).toHaveTextContent("Plural: Cantones · CSV: nivel_2");
    expect(filasDeLaLista()[2]).toHaveTextContent("Plural: Distritos · CSV: nivel_3");
    for (const [k, nombre] of [[1, "Provincia"], [2, "Cantón"], [3, "Distrito"]] as const) {
      expect(screen.getByRole("button", { name: `Editar nivel ${k}, ${nombre}` })).toBeEnabled();
      expect(screen.getByRole("button", { name: `Mover ${nombre}, posición ${k} de 3` })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Agregar nivel al final" })).toBeEnabled();
  });
});
