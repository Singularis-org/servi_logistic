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
    // SLT-89 (T7.3): toda escritura pasa por el antes → después del mismo modal.
    await u.click(await within(d).findByRole("button", { name: "Sí, guardar" }));

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
    await u.click(await within(d).findByRole("button", { name: "Sí, guardar" }));

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
    await u.click(await within(d).findByRole("button", { name: "Sí, guardar" }));
    expect(await within(d).findByText("Ya hay un grupo con ese nombre en la zona.")).toBeInTheDocument();
  });

  it("R42: cambiar distritos arranca con los suyos y no los marca como de otro grupo", async () => {
    cambiarMock.mockResolvedValue({ status: "ok" });
    const u = userEvent.setup();
    montar();
    // SLT-89 (maqueta): «Cambiar barrios» pasa a «Editar lugares…».
    await u.click(screen.getByRole("button", { name: "Editar lugares de Costa" }));
    const d = await screen.findByRole("dialog");

    expect(within(d).getByRole("checkbox", { name: /Alfa/ })).toBeChecked();
    expect(within(d).queryByText("En el grupo Costa")).toBeNull();
    await u.click(within(d).getByRole("checkbox", { name: /Beta/ }));
    await u.click(within(d).getByRole("button", { name: "Guardar" }));
    await u.click(await within(d).findByRole("button", { name: "Sí, guardar" }));
    // SLT-89 (R43, decisión del 2026-11-09): la llamada gana el «antes» (los miembros que mostró el modal).
    await waitFor(() =>
      expect(cambiarMock).toHaveBeenCalledWith({
        id: "g1",
        distritoIds: ["d1"],
        antes: { distritoIds: ["d1", "d2"], nodoIds: [] },
      }),
    );
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
    await u.click(await within(d).findByRole("button", { name: "Sí, guardar" }));
    // SLT-89 (R44, T5.6): la llamada gana `nombreAnterior` (cambio de aserción autorizado).
    await waitFor(() =>
      expect(renombrarMock).toHaveBeenCalledWith({ id: "g1", nombre: "Playa", nombreAnterior: "Costa" }),
    );
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

    // SLT-89 (maqueta): el botón del modal es «Sí, borrar».
    await u.click(within(d).getByRole("button", { name: "Sí, borrar" }));
    // SLT-89 (R45, T5.6): la llamada gana el «antes» (cambio de aserción autorizado).
    await waitFor(() =>
      expect(borrarMock).toHaveBeenCalledWith({
        id: "g1",
        antes: { nombre: "Costa", distritoIds: ["d1", "d2"], nodoIds: [], valores: 3 },
      }),
    );
    await waitFor(() => expect(p.onCambio).toHaveBeenCalled());
  });

  it("R43: cancelar no borra", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Borrar Costa" }));
    const d = await screen.findByRole("dialog");
    // SLT-89 (maqueta): en el antes → después, cancelar es «Volver».
    await u.click(within(d).getByRole("button", { name: "Volver" }));
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

// ── SLT-89 (R22, R23, R47; design §8.3; maqueta aprobada el 2026-11-10) ────────────────────────────

/** El sub-árbol cubierto por la zona: una comuna entera y un barrio con un sector debajo. */
const NODOS = {
  tipos: [
    { profundidad: 1, nombreSingular: "Región", nombrePlural: "Regiones" },
    { profundidad: 2, nombreSingular: "Comuna", nombrePlural: "Comunas" },
    { profundidad: 3, nombreSingular: "Barrio", nombrePlural: "Barrios" },
    { profundidad: 4, nombreSingular: "Sector", nombrePlural: "Sectores" },
  ],
  raices: [
    {
      id: "c1",
      nombre: "Llano",
      profundidad: 2,
      activo: true,
      hijos: [
        { id: "d1", nombre: "Alfa", profundidad: 3, activo: true, hijos: [] },
        { id: "d2", nombre: "Beta", profundidad: 3, activo: true, hijos: [] },
        { id: "d3", nombre: "Gama", profundidad: 3, activo: true, hijos: [{ id: "s1", nombre: "Muelle", profundidad: 4, activo: true, hijos: [] }] },
      ],
    },
  ],
};

async function abrirCrear(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole("button", { name: "Crear grupo" }));
  return screen.findByRole("dialog");
}

describe("SLT-89 R22 — validación previa y antes → después en las cuatro escrituras", () => {
  it("crear con el nombre vacío: error en su campo, sin antes → después y sin llamada", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirCrear(u);
    await u.click(within(d).getByRole("button", { name: "Guardar" }));

    expect(await within(d).findByText("El grupo necesita un nombre.")).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: "Sí, guardar" })).toBeNull();
    expect(crearMock).not.toHaveBeenCalled();
  });

  it("crear: «Sin grupo» → nombre y lugares con su nivel; «Volver» no escribe", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirCrear(u);
    await u.type(within(d).getByLabelText(/Nombre del grupo/), "Lejanos");
    await u.click(within(d).getByRole("checkbox", { name: /Gama/ }));
    await u.click(within(d).getByRole("button", { name: "Guardar" }));

    expect(await within(d).findByText("¿Crear el grupo Lejanos?")).toBeInTheDocument();
    expect(within(d).getByRole("region", { name: "Antes" })).toHaveTextContent("Sin grupo");
    const despues = within(d).getByRole("region", { name: "Después" });
    expect(despues).toHaveTextContent("Lejanos");
    expect(despues).toHaveTextContent("Gama · barrio");

    await u.click(within(d).getByRole("button", { name: "Volver" }));
    expect(await within(d).findByLabelText(/Nombre del grupo/)).toHaveValue("Lejanos");
    expect(crearMock).not.toHaveBeenCalled();
  });

  it("renombrar: nombre de antes → nombre nuevo, sin llamar hasta confirmar", async () => {
    renombrarMock.mockResolvedValue({ status: "ok" });
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Renombrar Costa" }));
    const d = await screen.findByRole("dialog");
    const campo = within(d).getByLabelText(/Nombre del grupo/);
    await u.clear(campo);
    await u.type(campo, "Playa");
    await u.click(within(d).getByRole("button", { name: "Guardar" }));

    expect(within(d).getByRole("region", { name: "Antes" })).toHaveTextContent("Costa");
    expect(within(d).getByRole("region", { name: "Después" })).toHaveTextContent("Playa");
    expect(renombrarMock).not.toHaveBeenCalled();
  });

  it("renombrar a un nombre vacío no abre el antes → después", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Renombrar Costa" }));
    const d = await screen.findByRole("dialog");
    await u.clear(within(d).getByLabelText(/Nombre del grupo/));
    await u.click(within(d).getByRole("button", { name: "Guardar" }));

    expect(await within(d).findByText("El grupo necesita un nombre.")).toBeInTheDocument();
    expect(renombrarMock).not.toHaveBeenCalled();
  });

  it("cambiar lugares: los que entran y los que salen", async () => {
    const u = userEvent.setup();
    montar({ nodos: NODOS, grupos: [{ ...GRUPO, distritos: [{ id: "d1", nombre: "Alfa" }] }] });
    await u.click(screen.getByRole("button", { name: "Editar lugares de Costa" }));
    const d = await screen.findByRole("dialog");
    await u.click(within(d).getByRole("checkbox", { name: /Alfa/ }));
    await u.click(within(d).getByRole("checkbox", { name: /Muelle/ }));
    await u.click(within(d).getByRole("button", { name: "Guardar" }));

    expect(within(d).getByRole("region", { name: "Entran" })).toHaveTextContent("Muelle · sector de Gama");
    expect(within(d).getByRole("region", { name: "Salen" })).toHaveTextContent("Alfa · barrio de Llano");
    expect(cambiarMock).not.toHaveBeenCalled();
  });

  it("borrar: nombre y número de lugares → «Sin grupo», con el texto de SLT-54 R43", async () => {
    const u = userEvent.setup();
    montar({ valores: [valor("tienda_flete_entregado", { id: "a", grupoId: "g1", nivel: "grupo" })] });
    await u.click(screen.getByRole("button", { name: "Borrar Costa" }));
    const d = await screen.findByRole("dialog");

    expect(within(d).getByText("¿Borrar el grupo Costa?")).toBeInTheDocument();
    expect(within(d).getByRole("region", { name: "Antes" })).toHaveTextContent("Costa · 2 lugares");
    expect(within(d).getByRole("region", { name: "Después" })).toHaveTextContent("Sin grupo");
    expect(within(d).getByText("Se borra 1 valor con él. Sus lugares pasan a usar el valor de la zona.")).toBeInTheDocument();
    expect(borrarMock).not.toHaveBeenCalled();
  });
});

describe("SLT-89 R23 — los posibles miembros son los lugares que la zona cubre, en árbol", () => {
  it("ofrece todas las profundidades, con el nombre del tipo de cada nivel, y manda cada lista", async () => {
    crearMock.mockResolvedValue({ status: "ok", id: "g2" });
    const u = userEvent.setup();
    montar({ nodos: NODOS, grupos: [] });
    const d = await abrirCrear(u);

    expect(within(d).getAllByRole("checkbox")).toHaveLength(5);
    expect(within(d).getByRole("checkbox", { name: /Llano/ }).closest("label")).toHaveTextContent("comuna");
    expect(within(d).getByRole("checkbox", { name: /Muelle/ }).closest("label")).toHaveTextContent("sector");

    await u.type(within(d).getByLabelText(/Nombre del grupo/), "Llano entero");
    await u.click(within(d).getByRole("checkbox", { name: /Llano/ }));
    await u.click(within(d).getByRole("checkbox", { name: /Beta/ }));
    await u.click(within(d).getByRole("button", { name: "Guardar" }));
    expect(within(d).getByRole("region", { name: "Después" })).toHaveTextContent("Llano · comuna");
    await u.click(within(d).getByRole("button", { name: "Sí, guardar" }));

    await waitFor(() =>
      expect(crearMock).toHaveBeenCalledWith({ zonaId: "z1", nombre: "Llano entero", distritoIds: ["d2"], nodoIds: ["c1"] }),
    );
  });

  it("un lugar que ya es miembro de otro grupo sale bloqueado y dice en cuál", async () => {
    const u = userEvent.setup();
    montar({
      nodos: NODOS,
      grupos: [{ ...GRUPO, distritos: [], nodos: [{ id: "s1", nombre: "Muelle", profundidad: 4 }] }],
    });
    const d = await abrirCrear(u);
    const muelle = within(d).getByRole("checkbox", { name: /Muelle/ });
    expect(muelle).toHaveAttribute("aria-disabled", "true");
    expect(muelle.closest("label")).toHaveTextContent("En el grupo Costa");
  });

  it("antes de activar, la marca especial de los distritos sigue de solo lectura en el árbol", async () => {
    const u = userEvent.setup();
    montar({ nodos: NODOS });
    const d = await abrirCrear(u);
    expect(within(d).getAllByText("Zona especial hoy")).toHaveLength(2);
    expect(within(d).queryByRole("button", { name: /especial/i })).toBeNull();
  });

  it("el listado nombra los miembros que no son distritos con su nivel", () => {
    montar({ nodos: NODOS, grupos: [{ ...GRUPO, nodos: [{ id: "c1", nombre: "Llano", profundidad: 2 }] }] });
    expect(screen.getByText("Otros lugares: Llano (comuna)")).toBeInTheDocument();
  });
});

describe("SLT-89 R47 — cambio concurrente: cierra, avisa con `aria-live` y recarga", () => {
  it.each([
    ["renombrar", "Renombrar Costa"],
    ["cambiar lugares", "Editar lugares de Costa"],
  ])("al %s", async (_caso, boton) => {
    renombrarMock.mockResolvedValue({ status: "conflict", motivo: "cambio_concurrente" });
    cambiarMock.mockResolvedValue({ status: "conflict", motivo: "cambio_concurrente" });
    const u = userEvent.setup();
    const p = montar();
    await u.click(screen.getByRole("button", { name: boton }));
    const d = await screen.findByRole("dialog");
    if (boton.startsWith("Renombrar")) await u.type(within(d).getByLabelText(/Nombre del grupo/), "s");
    else await u.click(within(d).getByRole("checkbox", { name: /Beta/ }));
    await u.click(within(d).getByRole("button", { name: "Guardar" }));
    await u.click(within(d).getByRole("button", { name: "Sí, guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const aviso = screen.getByText("Este dato cambió mientras tanto; revisa el valor actual");
    expect(aviso).toHaveAttribute("aria-live", "polite");
    expect(p.onCambio).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("al borrar", async () => {
    borrarMock.mockResolvedValue({ status: "conflict", motivo: "cambio_concurrente" });
    const u = userEvent.setup();
    const p = montar();
    await u.click(screen.getByRole("button", { name: "Borrar Costa" }));
    const d = await screen.findByRole("dialog");
    await u.click(within(d).getByRole("button", { name: "Sí, borrar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Este dato cambió mientras tanto; revisa el valor actual")).toBeInTheDocument();
    expect(p.onCambio).toHaveBeenCalledTimes(1);
  });
});
