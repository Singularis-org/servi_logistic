// @vitest-environment jsdom
// SLT-89 (R12, R13, R16; design §8.2) — EL MODAL ÚNICO DE GUARDADO DE ZONA.
//
// Guardar valida con el esquema del servidor; si es válido abre UN modal con el antes → después (lugares
// que entran y salen, con su nivel y su padre) y las cifras del aviso de impacto, calculadas en el
// servidor con los lugares pedidos. «Sí, guardar» no se habilita sin las cifras; «Volver» no escribe; al
// guardar una zona existente viaja SIEMPRE el «antes»; un `cambio_concurrente` cierra, avisa y recarga.
// Datos sintéticos.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ArbolDeZonasDTO, NodoDeZonasDTO } from "@/lib/types/geografia-nodo";

const crearZonaMock = vi.fn();
const actualizarZonaMock = vi.fn();
const impactoMock = vi.fn();
vi.mock("@/lib/actions/zonas", () => ({
  crearZona: (...a: unknown[]) => crearZonaMock(...a),
  actualizarZona: (...a: unknown[]) => actualizarZonaMock(...a),
  impactoAsignacionZona: (...a: unknown[]) => impactoMock(...a),
  impactoZonaCentral: vi.fn().mockResolvedValue({ status: "ok", impacto: [] }),
}));

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() },
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

const { CrearZonaForm } = await import("@/app/(app)/configuracion/zonas/_components/CrearZonaForm");

const OESTE = { id: "z-oeste", nombre: "Zona Oeste" };
const SUR = { id: "z-sur", nombre: "Zona Sur" };

function n(
  id: string,
  nombre: string,
  profundidad: number,
  hijos: NodoDeZonasDTO[] = [],
  asignadaA: { id: string; nombre: string } | null = null,
): NodoDeZonasDTO {
  return { id, nombre, profundidad, activo: true, asignadaA, heredaDe: null, hijos };
}

//  San José
//    Escazú → Escazú (d) · San Antonio (d) · San Rafael (d, Zona Sur)
//    Mora   → Colón (d, Zona Oeste)
const ARBOL: ArbolDeZonasDTO = {
  tipos: [
    { profundidad: 1, nombreSingular: "Provincia", nombrePlural: "Provincias" },
    { profundidad: 2, nombreSingular: "Cantón", nombrePlural: "Cantones" },
    { profundidad: 3, nombreSingular: "Distrito", nombrePlural: "Distritos" },
  ],
  raices: [
    n("sj", "San José", 1, [
      n("esc", "Escazú", 2, [n("d-esc", "Escazú", 3), n("d-san", "San Antonio", 3), n("d-sr", "San Rafael", 3, [], SUR)]),
      n("mora", "Mora", 2, [n("d-colon", "Colón", 3, [], OESTE)]),
    ]),
  ],
};

const IMPACTO = {
  status: "ok" as const,
  impacto: {
    cambianDeZona: 24,
    cambianDeTarifa: 9,
    noSeMueven: { enBodegaSatelite: 2, conGestionFinal: 3, enCierre: 1 },
  },
};

function montar(extra: { onCambioConcurrente?: () => void; crear?: boolean } = {}) {
  const onSaved = vi.fn();
  render(
    <CrearZonaForm
      mode={extra.crear ? "crear" : "editar"}
      arbol={ARBOL}
      zonas={[]}
      initial={extra.crear ? undefined : { zonaId: OESTE.id, nombre: OESTE.nombre, distritoIds: ["d-colon"] }}
      onSaved={onSaved}
      onCancel={vi.fn()}
      onCambioConcurrente={extra.onCambioConcurrente}
    />,
  );
  return { onSaved };
}

/** Despliega el árbol (la provincia arrastra su rama) y cambia los lugares: entra Escazú, sale Colón. */
async function cambiarLugares(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }), "san jose");
  await user.click(await screen.findByRole("checkbox", { name: /^Seleccionar cantón Escazú(?:$|\s)/ }));
  await user.click(await screen.findByRole("checkbox", { name: /^Seleccionar distrito Colón(?:$|\s)/ }));
}

const guardarZona = () => screen.getByRole("button", { name: "Guardar zona…" });
const siGuardar = () => screen.getByRole("button", { name: "Sí, guardar" });

beforeEach(() => {
  vi.clearAllMocks();
  impactoMock.mockResolvedValue(IMPACTO);
  actualizarZonaMock.mockResolvedValue({
    status: "ok",
    zona: { id: OESTE.id, nombre: OESTE.nombre, cobroVehiculo: false, distritosCount: 0, esCentral: false },
    ordenesReconciliadas: 24,
    ordenesRetenidasEnBodegaSatelite: 2,
  });
});
afterEach(cleanup);

describe("R12 — validación previa y antes → después", () => {
  it("con la entrada inválida no abre el modal ni pide nada al servidor", async () => {
    const user = userEvent.setup();
    montar();
    await user.clear(screen.getByRole("textbox", { name: "Nombre de la zona" }));
    await user.click(guardarZona());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(impactoMock).not.toHaveBeenCalled();
    expect(actualizarZonaMock).not.toHaveBeenCalled();
  });

  it("el modal dice qué lugares entran y salen, con su nivel y su padre, y las excepciones", async () => {
    const user = userEvent.setup();
    montar();
    await cambiarLugares(user);
    await user.click(guardarZona());

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("¿Guardar los cambios de Zona Oeste?")).toBeInTheDocument();
    const entran = within(modal).getByRole("region", { name: "Entran" });
    expect(entran).toHaveTextContent("Escazú · cantón de San José");
    expect(entran).toHaveTextContent("Incluye sus 2 distritos.");
    expect(entran).toHaveTextContent("San Rafael sigue en Zona Sur (excepción).");
    const salen = within(modal).getByRole("region", { name: "Salen" });
    expect(salen).toHaveTextContent("Colón · distrito de Mora");
    expect(salen).toHaveTextContent("Queda sin zona si nadie más lo cubre.");
    expect(actualizarZonaMock).not.toHaveBeenCalled();
  });

  it("«Volver» cierra sin escribir nada", async () => {
    const user = userEvent.setup();
    montar();
    await cambiarLugares(user);
    await user.click(guardarZona());
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(actualizarZonaMock).not.toHaveBeenCalled();
  });
});

describe("R13 — las cifras del servidor, y «Sí, guardar» bloqueado hasta tenerlas", () => {
  it("pide el impacto con los lugares pedidos y pinta las cifras por categoría", async () => {
    let resolver: (v: unknown) => void = () => {};
    impactoMock.mockReturnValue(new Promise((r) => (resolver = r)));
    const user = userEvent.setup();
    montar();
    await cambiarLugares(user);
    await user.click(guardarZona());

    expect(await screen.findByText("Calculando qué pasa con las órdenes pendientes…")).toBeInTheDocument();
    expect(siGuardar()).toBeDisabled();
    expect(impactoMock).toHaveBeenCalledWith({ zonaId: OESTE.id, distritoIds: [], nodoIds: ["esc"] });

    resolver(IMPACTO);
    const ordenes = await screen.findByRole("region", { name: "Órdenes pendientes" });
    await waitFor(() => expect(siGuardar()).toBeEnabled());
    expect(ordenes).toHaveTextContent("24cambian de zona");
    expect(ordenes).toHaveTextContent("9cambian de tarifa");
    expect(ordenes).toHaveTextContent("6 no se mueven aunque su zona cambiaría");
    expect(ordenes).toHaveTextContent("2 en el estante de una bodega satélite");
    expect(ordenes).toHaveTextContent("3 con gestión final");
    expect(ordenes).toHaveTextContent("1 ya en un cierre");
  });

  it("si el aviso falla, NO se puede confirmar; reintentar lo vuelve a pedir", async () => {
    impactoMock.mockResolvedValueOnce({ status: "forbidden" });
    const user = userEvent.setup();
    montar();
    await cambiarLugares(user);
    await user.click(guardarZona());

    expect(await screen.findByText(/No se pudo calcular el impacto en las órdenes/)).toBeInTheDocument();
    expect(siGuardar()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(siGuardar()).toBeEnabled());
    expect(impactoMock).toHaveBeenCalledTimes(2);
  });

  it("sin cambio de lugares no pide cifras y deja confirmar", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(guardarZona());
    await screen.findByRole("dialog");

    expect(impactoMock).not.toHaveBeenCalled();
    expect(siGuardar()).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Órdenes pendientes" })).toBeNull();
  });
});

describe("R16 — el «antes» viaja siempre al guardar una zona existente", () => {
  it("confirmar manda los lugares pedidos y el «antes» que mostró el modal", async () => {
    const user = userEvent.setup();
    const { onSaved } = montar();
    await cambiarLugares(user);
    await user.click(guardarZona());
    await waitFor(() => expect(siGuardar()).toBeEnabled());
    await user.click(siGuardar());

    await waitFor(() => expect(actualizarZonaMock).toHaveBeenCalledTimes(1));
    expect(actualizarZonaMock).toHaveBeenCalledWith(OESTE.id, {
      nombre: OESTE.nombre,
      esCentral: false,
      distritoIds: [],
      nodoIds: ["esc"],
      antes: { distritoIds: ["d-colon"], nodoIds: [] },
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(
      "Zona actualizada (24 órdenes reubicadas). 2 órdenes no cambiaron de zona porque su paquete ya está en una bodega.",
    );
  });

  it("sin cambiar nada, el «antes» viaja igual (los lugares que tenía)", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(guardarZona());
    await user.click(siGuardar());

    await waitFor(() =>
      expect(actualizarZonaMock).toHaveBeenCalledWith(
        OESTE.id,
        expect.objectContaining({ distritoIds: ["d-colon"], antes: { distritoIds: ["d-colon"], nodoIds: [] } }),
      ),
    );
  });

  it("crear una zona no manda «antes»", async () => {
    crearZonaMock.mockResolvedValue({ status: "ok", zona: { id: "z-nueva" } });
    const user = userEvent.setup();
    montar({ crear: true });
    await user.type(screen.getByRole("textbox", { name: "Nombre de la zona" }), "Nueva");
    await user.type(screen.getByRole("textbox", { name: "Número SINPE" }), "80000000");
    await user.type(screen.getByRole("textbox", { name: "A nombre de" }), "Titular de Prueba");
    await user.type(screen.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }), "san jose");
    await user.click(await screen.findByRole("checkbox", { name: /^Seleccionar cantón Escazú(?:$|\s)/ }));
    await user.click(guardarZona());
    expect(await screen.findByText("¿Crear la zona Nueva?")).toBeInTheDocument();
    await waitFor(() => expect(siGuardar()).toBeEnabled());
    await user.click(siGuardar());

    await waitFor(() => expect(crearZonaMock).toHaveBeenCalledTimes(1));
    expect(crearZonaMock.mock.calls[0][0]).not.toHaveProperty("antes");
    expect(impactoMock).toHaveBeenCalledWith({ distritoIds: [], nodoIds: ["esc"] });
  });

  it("`cambio_concurrente`: cierra el modal, avisa con `aria-live` y pide recargar", async () => {
    actualizarZonaMock.mockResolvedValue({ status: "conflict", motivo: "cambio_concurrente" });
    const onCambioConcurrente = vi.fn();
    const user = userEvent.setup();
    const { onSaved } = montar({ onCambioConcurrente });
    await cambiarLugares(user);
    await user.click(guardarZona());
    await waitFor(() => expect(siGuardar()).toBeEnabled());
    await user.click(siGuardar());

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const aviso = screen.getByText("Este dato cambió mientras tanto; revisa el valor actual");
    expect(aviso).toHaveAttribute("aria-live", "polite");
    expect(onCambioConcurrente).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
