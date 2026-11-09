// @vitest-environment jsdom
// SLT-54 (R42-R46, R61) — los grupos de una zona. La zona especial es un grupo más: lo único propio es la
// marca que se enseña, de solo lectura, antes de activar.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TarifasGrupos, type TarifasGruposProps } from "@/app/(app)/configuracion/tarifas/_components/TarifasGrupos";
import { EtiquetasGeograficasContexto } from "@/providers/EtiquetasGeograficasProvider";

import { valor } from "../fixtures/tarifas-pantalla";

const { crearMock, renombrarMock, cambiarMock, borrarMock, toast } = vi.hoisted(() => ({
  crearMock: vi.fn(),
  renombrarMock: vi.fn(),
  cambiarMock: vi.fn(),
  borrarMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/tarifas", () => ({
  crearGrupoDistritos: (i: unknown) => crearMock(i),
  renombrarGrupoDistritos: (i: unknown) => renombrarMock(i),
  cambiarDistritosDeGrupo: (i: unknown) => cambiarMock(i),
  borrarGrupoDistritos: (i: unknown) => borrarMock(i),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

const ETIQUETAS = {
  provincia: { singular: "Región", plural: "Regiones" },
  canton: { singular: "Comuna", plural: "Comunas" },
  distrito: { singular: "Barrio", plural: "Barrios" },
};

const GRUPO = { id: "g1", zonaId: "z1", nombre: "Costa", distritos: [{ id: "d1", nombre: "Alfa" }, { id: "d2", nombre: "Beta" }] };

function props(extra: Partial<TarifasGruposProps> = {}): TarifasGruposProps {
  return {
    zona: { id: "z1", nombre: "Norte" },
    grupos: [GRUPO],
    distritos: [
      { id: "d1", nombre: "Alfa", zonaEspecial: true, grupoId: "g1" },
      { id: "d2", nombre: "Beta", zonaEspecial: false, grupoId: "g1" },
      { id: "d3", nombre: "Gama", zonaEspecial: true, grupoId: null },
    ],
    valores: [],
    activada: false,
    puedeEscribir: true,
    onCambio: vi.fn(),
    ...extra,
  };
}

function montar(extra: Partial<TarifasGruposProps> = {}) {
  const p = props(extra);
  render(
    <EtiquetasGeograficasContexto.Provider value={ETIQUETAS}>
      <TarifasGrupos {...p} />
    </EtiquetasGeograficasContexto.Provider>,
  );
  return p;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-54 — grupos", () => {
  it("R61: los nombres de nivel salen del país de la empresa", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Norte: grupos de barrios" })).toBeInTheDocument();
    expect(screen.getByText("2 barrios: Alfa, Beta")).toBeInTheDocument();
    expect(screen.getByText(/Un barrio está en un solo grupo por zona/)).toBeInTheDocument();
  });

  it("R42: crear ofrece solo los de la zona, dice cuáles ya están en otro grupo y manda lo elegido", async () => {
    crearMock.mockResolvedValue({ status: "ok", id: "g2" });
    const u = userEvent.setup();
    const p = montar();

    await u.click(screen.getByRole("button", { name: "Crear grupo" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(d).getByRole("checkbox", { name: /Alfa/ }).closest("label")).toHaveTextContent("En el grupo Costa");
    expect(within(d).getByRole("checkbox", { name: /Gama/ }).closest("label")).not.toHaveTextContent("En el grupo");

    await u.type(within(d).getByLabelText(/Nombre del grupo/), "Zona especial");
    await u.click(within(d).getByRole("checkbox", { name: /Gama/ }));
    await u.click(within(d).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(crearMock).toHaveBeenCalledWith({ zonaId: "z1", nombre: "Zona especial", distritoIds: ["d3"] }),
    );
    await waitFor(() => expect(p.onCambio).toHaveBeenCalled());
  });

  it("R42: el rechazo se muestra nombrando el distrito, sin cerrar", async () => {
    crearMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { distritoIds: ["Alfa ya está en el grupo Costa."] },
    });
    const u = userEvent.setup();
    const p = montar();
    await u.click(screen.getByRole("button", { name: "Crear grupo" }));
    const d = await screen.findByRole("dialog");
    await u.type(within(d).getByLabelText(/Nombre del grupo/), "Otro");
    await u.click(within(d).getByRole("checkbox", { name: /Alfa/ }));
    await u.click(within(d).getByRole("button", { name: "Guardar" }));

    expect(await within(d).findByText("Alfa ya está en el grupo Costa.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(p.onCambio).not.toHaveBeenCalled();
  });

  it("R42: un nombre repetido se pinta en su campo", async () => {
    crearMock.mockResolvedValue({ status: "validation_error", fieldErrors: { nombre: ["Ya hay un grupo con ese nombre en la zona."] } });
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Crear grupo" }));
    const d = await screen.findByRole("dialog");
    await u.type(within(d).getByLabelText(/Nombre del grupo/), "Costa");
    await u.click(within(d).getByRole("button", { name: "Guardar" }));
    expect(await within(d).findByText("Ya hay un grupo con ese nombre en la zona.")).toBeInTheDocument();
  });

  it("R42: cambiar distritos arranca con los suyos y no los marca como de otro grupo", async () => {
    cambiarMock.mockResolvedValue({ status: "ok" });
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Cambiar barrios de Costa" }));
    const d = await screen.findByRole("dialog");

    expect(within(d).getByRole("checkbox", { name: /Alfa/ })).toBeChecked();
    expect(within(d).queryByText("En el grupo Costa")).toBeNull();
    await u.click(within(d).getByRole("checkbox", { name: /Beta/ }));
    await u.click(within(d).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(cambiarMock).toHaveBeenCalledWith({ id: "g1", distritoIds: ["d1"] }));
  });

  it("R42: renombrar", async () => {
    renombrarMock.mockResolvedValue({ status: "ok" });
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Renombrar Costa" }));
    const d = await screen.findByRole("dialog");
    const campo = within(d).getByLabelText(/Nombre del grupo/);
    await u.clear(campo);
    await u.type(campo, "Playa");
    await u.click(within(d).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(renombrarMock).toHaveBeenCalledWith({ id: "g1", nombre: "Playa" }));
  });

  it("R43: borrar pide confirmación con cuántos valores caen, también los de tienda en el grupo", async () => {
    borrarMock.mockResolvedValue({ status: "ok" });
    const u = userEvent.setup();
    const p = montar({
      valores: [
        valor("tienda_flete_entregado", { id: "a", grupoId: "g1", nivel: "grupo" }),
        valor("mensajero_entregado", { id: "b", grupoId: "g1", nivel: "grupo" }),
        valor("tienda_flete_rechazo", { id: "c", grupoId: "g1", tiendaId: "t1", nivel: "tienda_grupo" }),
        valor("tienda_flete_rechazo", { id: "d", grupoId: null }),
      ],
    });

    await u.click(screen.getByRole("button", { name: "Borrar Costa" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText(/Se borran 3 valores con él/)).toBeInTheDocument();
    expect(borrarMock).not.toHaveBeenCalled();

    await u.click(within(d).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(borrarMock).toHaveBeenCalledWith({ id: "g1" }));
    await waitFor(() => expect(p.onCambio).toHaveBeenCalled());
  });

  it("R43: cancelar no borra", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Borrar Costa" }));
    const d = await screen.findByRole("dialog");
    await u.click(within(d).getByRole("button", { name: "Cancelar" }));
    expect(borrarMock).not.toHaveBeenCalled();
  });

  it("R44: sin campo ni trato propio de zona especial fuera de la marca", async () => {
    const u = userEvent.setup();
    montar({ activada: true });
    await u.click(screen.getByRole("button", { name: "Crear grupo" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).queryByText(/especial/i)).toBeNull();
    expect(within(d).getAllByRole("textbox")).toHaveLength(1);
  });

  it("R44: un grupo llamado «Zona especial» se pinta como cualquier otro", () => {
    montar({ grupos: [{ ...GRUPO, nombre: "Zona especial" }], activada: true });
    expect(screen.getByText("Zona especial")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Borrar Zona especial" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renombrar Zona especial" })).toBeInTheDocument();
  });

  it("R45: antes de activar, la marca se ve de solo lectura: no hay control que la cambie", async () => {
    crearMock.mockResolvedValue({ status: "ok", id: "g2" });
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Crear grupo" }));
    const d = await screen.findByRole("dialog");

    expect(within(d).getAllByText("Zona especial hoy")).toHaveLength(2);
    expect(within(d).getByText(/es de solo lectura/)).toBeInTheDocument();
    expect(within(d).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(d).queryByRole("button", { name: /especial/i })).toBeNull();
  });

  it("R45: tras activar, la marca no se muestra", async () => {
    const u = userEvent.setup();
    montar({ activada: true });
    await u.click(screen.getByRole("button", { name: "Crear grupo" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).queryByText("Zona especial hoy")).toBeNull();
    expect(within(d).queryByText(/solo lectura/)).toBeNull();
  });

  it("R46: la marca y el grupo se ven por separado en el mismo distrito", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Crear grupo" }));
    const d = await screen.findByRole("dialog");
    const alfa = within(d).getByRole("checkbox", { name: /Alfa/ }).closest("label") as HTMLElement;
    expect(within(alfa).getByText("En el grupo Costa")).toBeInTheDocument();
    expect(within(alfa).getByText("Zona especial hoy")).toBeInTheDocument();
  });

  it("R57: una zona sin grupos enseña el siguiente paso", () => {
    montar({ grupos: [] });
    expect(screen.getByText("Esta zona no tiene grupos")).toBeInTheDocument();
    expect(screen.getByText(/Crea un grupo si algunos lugares/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeInTheDocument();
  });

  it("El resumen dice lo propio del grupo o que usa el de la zona, con el IVA en el cobro", () => {
    montar({ valores: [valor("tienda_flete_entregado", { grupoId: "g1", nivel: "grupo", valor: "3200.00" })] });
    expect(screen.getByText("₡3.200 + 13 % IVA")).toBeInTheDocument();
    expect(screen.getAllByText("Usa el de la zona")).toHaveLength(3);
  });

  it("R55: `admin` ve los grupos sin ningún botón de escritura y sin llamadas", () => {
    montar({ puedeEscribir: false });
    expect(screen.getByText("Costa")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(crearMock).not.toHaveBeenCalled();
    expect(borrarMock).not.toHaveBeenCalled();
  });
});
