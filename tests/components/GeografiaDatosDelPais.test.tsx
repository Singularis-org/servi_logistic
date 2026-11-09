// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PaisDTO, TipoDocumentoDTO } from "@/lib/types/pais";

// SLT-81 (design §6, §11; R2, R3, R8, R10, R11, R13, R15, R26) — la sección «Datos del país» de
// Plataforma › Geografía. Se monta el componente real; lo único doblado es el borde: las Server
// Actions y el toast. Los textos van literales: son el contrato de pantalla.

const acciones = {
  actualizarDatosPaisAction: vi.fn(),
  crearTipoDocumentoAction: vi.fn(),
  editarTipoDocumentoAction: vi.fn(),
  cambiarActivoTipoDocumentoAction: vi.fn(),
};
vi.mock("@/lib/actions/geografia-plataforma", () => ({
  actualizarDatosPaisAction: (...a: unknown[]) => acciones.actualizarDatosPaisAction(...a),
  crearTipoDocumentoAction: (...a: unknown[]) => acciones.crearTipoDocumentoAction(...a),
  editarTipoDocumentoAction: (...a: unknown[]) => acciones.editarTipoDocumentoAction(...a),
  cambiarActivoTipoDocumentoAction: (...a: unknown[]) => acciones.cambiarActivoTipoDocumentoAction(...a),
}));

const toastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() };
vi.mock("@/hooks/useToast", () => ({ useToast: () => toastMock }));

import { DatosDelPais } from "@/app/(app)/plataforma/geografia/_components/DatosDelPais";

// Panamá: un país real con prefijo oficial (+507), que no es el sembrado por SLT-42.
function pais(extra: Partial<PaisDTO> = {}): PaisDTO {
  return {
    id: "PA",
    nombre: "Panamá",
    nivel1Singular: "Provincia",
    nivel1Plural: "Provincias",
    nivel2Singular: "Distrito",
    nivel2Plural: "Distritos",
    nivel3Singular: "Corregimiento",
    nivel3Plural: "Corregimientos",
    digitosCodigoNivel1: null,
    digitosCodigoNivel2: null,
    digitosCodigoNivel3: null,
    disponible: true,
    prefijoTelefonico: "507",
    telefonoDigitosNacionales: 8,
    zonaHoraria: "America/Panama",
    ...extra,
  };
}

function tipo(extra: Partial<TipoDocumentoDTO> & Pick<TipoDocumentoDTO, "id" | "nombre">): TipoDocumentoDTO {
  return {
    value: `PA_${extra.id}`,
    paisId: "PA",
    clave: extra.id,
    caracteres: "digitos",
    largoMin: 9,
    largoMax: 9,
    activo: true,
    ...extra,
  };
}

const CEDULA = tipo({ id: "11111111-1111-4111-8111-111111111111", nombre: "Cédula" });
const PASAPORTE = tipo({
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Pasaporte",
  caracteres: "alfanumerico",
  largoMin: 11,
  largoMax: 12,
  activo: false,
});

const ZONAS = ["America/Costa_Rica", "America/Panama", "Europe/Madrid"];

function montar(
  props: Partial<{ pais: PaisDTO; tipos: TipoDocumentoDTO[]; tiposError: boolean; prefijoOficial: string | null }> = {},
) {
  const onCambio = vi.fn();
  render(
    <DatosDelPais
      pais={props.pais ?? pais()}
      tipos={props.tipos ?? [CEDULA, PASAPORTE]}
      tiposError={props.tiposError}
      zonas={ZONAS}
      prefijoOficial={props.prefijoOficial === undefined ? "507" : props.prefijoOficial}
      onCambio={onCambio}
    />,
  );
  return { user: userEvent.setup(), onCambio };
}

async function abrirEdicionDeDatos(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Editar teléfono y hora" }));
  return screen.findByRole("dialog", { name: "Teléfono y hora de Panamá" });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("R2 — la sección muestra los cuatro datos del país, también los tipos inactivos", () => {
  it("prefijo, dígitos, zona y cada tipo con sus caracteres, su largo y su estado", () => {
    montar();
    const seccion = screen.getByRole("region", { name: "Datos del país" });

    expect(within(seccion).getByText("+507")).toBeInTheDocument();
    expect(within(seccion).getByText("8")).toBeInTheDocument();
    expect(within(seccion).getByText("America/Panama")).toBeInTheDocument();

    const tabla = within(seccion).getByRole("table", { name: "Tipos de documento de Panamá" });
    const [, filaCedula, filaPasaporte] = within(tabla).getAllByRole("row");
    expect(within(filaCedula).getByText("Cédula")).toBeInTheDocument();
    expect(within(filaCedula).getByText("Solo dígitos")).toBeInTheDocument();
    expect(within(filaCedula).getByText("9")).toBeInTheDocument();
    expect(within(filaPasaporte).getByText("Pasaporte")).toBeInTheDocument();
    expect(within(filaPasaporte).getByText("Letras y dígitos")).toBeInTheDocument();
    expect(within(filaPasaporte).getByText("11 a 12")).toBeInTheDocument();

    expect(screen.getByRole("switch", { name: "Activo: Cédula" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Activo: Pasaporte" })).toHaveAttribute("aria-checked", "false");
  });

  it("un país completo no dice que le falte nada", () => {
    montar();
    expect(screen.queryByText(/Datos incompletos/)).toBeNull();
  });
});

describe("R3 — un país incompleto nombra cada dato que falta", () => {
  it("sin zona y sin tipos activos → «falta zona horaria, tipo de documento activo»", () => {
    montar({ pais: pais({ zonaHoraria: null }), tipos: [PASAPORTE] });
    expect(screen.getByRole("note")).toHaveTextContent("Datos incompletos: falta zona horaria, tipo de documento activo.");
  });

  it("un país dado de alta antes de SLT-81, sin nada, nombra los cuatro y dice que no tiene tipos", () => {
    montar({
      pais: pais({ prefijoTelefonico: null, telefonoDigitosNacionales: null, zonaHoraria: null }),
      tipos: [],
    });
    expect(screen.getByRole("note")).toHaveTextContent(
      "Datos incompletos: falta prefijo telefónico, dígitos nacionales, zona horaria, tipo de documento activo.",
    );
    expect(screen.getByText("Este país aún no tiene tipos de documento.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("si la lista de tipos falla, lo dice y no lo disfraza de «falta tipo de documento»", () => {
    montar({ tipos: [], tiposError: true });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los tipos de documento del país.");
    expect(screen.queryByText(/Datos incompletos/)).toBeNull();
    expect(screen.queryByText("Este país aún no tiene tipos de documento.")).toBeNull();
  });
});

describe("R26 — el formulario trae cargado el prefijo oficial", () => {
  it("con el prefijo guardado distinto del oficial, carga el oficial y explica el cambio", async () => {
    const { user } = montar({ pais: pais({ prefijoTelefonico: "508" }) });
    const dialogo = await abrirEdicionDeDatos(user);

    expect(within(dialogo).getByLabelText(/^Prefijo telefónico/)).toHaveValue("507");
    expect(within(dialogo).getByText("El prefijo guardado (+508) no es el oficial (+507).")).toBeInTheDocument();
  });

  it("un país sin prefijo todavía lo trae cargado con el oficial", async () => {
    const { user } = montar({ pais: pais({ prefijoTelefonico: null }) });
    const dialogo = await abrirEdicionDeDatos(user);
    expect(within(dialogo).getByLabelText(/^Prefijo telefónico/)).toHaveValue("507");
  });
});

describe("R8 — el selector de zona busca por texto y solo ofrece las de la lista del servidor", () => {
  it("filtra por texto sin `_` ni mayúsculas y no ofrece una zona fuera de la lista", async () => {
    const { user } = montar({ pais: pais({ zonaHoraria: null }) });
    const dialogo = await abrirEdicionDeDatos(user);
    const zona = within(dialogo).getByRole("combobox", { name: /^Zona horaria/ });

    await user.type(zona, "costa rica");
    expect(await screen.findByRole("option", { name: "America/Costa_Rica" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Europe/Madrid" })).toBeNull();

    await user.clear(zona);
    await user.type(zona, "olympus");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(await screen.findByText("Ninguna zona casa con lo escrito.")).toBeInTheDocument();
  });

  it("sin zona elegida no envía y la pide", async () => {
    const { user } = montar({ pais: pais({ zonaHoraria: null }) });
    const dialogo = await abrirEdicionDeDatos(user);
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByText("Elige una zona horaria de la lista.")).toBeInTheDocument();
    expect(acciones.actualizarDatosPaisAction).not.toHaveBeenCalled();
  });
});

describe("R10, R11 — la confirmación dice cuántas empresas afecta", () => {
  it("R10: con empresas, un segundo paso dice «afecta a 3 empresas» y reenvía con 3", async () => {
    acciones.actualizarDatosPaisAction
      .mockResolvedValueOnce({ status: "requiere_confirmacion", empresas: 3 })
      .mockResolvedValueOnce({ status: "ok", pais: pais({ telefonoDigitosNacionales: 7 }), cambiado: true });
    const { user, onCambio } = montar();
    const dialogo = await abrirEdicionDeDatos(user);

    const digitos = within(dialogo).getByLabelText(/^Dígitos nacionales/);
    await user.clear(digitos);
    await user.type(digitos, "7");
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(
      await within(dialogo).findByText(
        "Este cambio afecta a 3 empresas de Panamá. Rige desde ahora; lo ya guardado no cambia.",
      ),
    ).toBeInTheDocument();
    expect(acciones.actualizarDatosPaisAction).toHaveBeenNthCalledWith(1, {
      id: "PA",
      prefijoTelefonico: "507",
      telefonoDigitosNacionales: 7,
      zonaHoraria: "America/Panama",
    });
    expect(onCambio).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Confirmar cambio" }));
    await waitFor(() =>
      expect(acciones.actualizarDatosPaisAction).toHaveBeenNthCalledWith(2, {
        id: "PA",
        prefijoTelefonico: "507",
        telefonoDigitosNacionales: 7,
        zonaHoraria: "America/Panama",
        empresasConfirmadas: 3,
      }),
    );
    await waitFor(() => expect(onCambio).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("R10: si al confirmar ya son más, vuelve a preguntar con el número nuevo", async () => {
    acciones.actualizarDatosPaisAction
      .mockResolvedValueOnce({ status: "requiere_confirmacion", empresas: 1 })
      .mockResolvedValueOnce({ status: "requiere_confirmacion", empresas: 2 });
    const { user, onCambio } = montar();
    const dialogo = await abrirEdicionDeDatos(user);
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByText(/Este cambio afecta a 1 empresa de Panamá\./)).toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "Confirmar cambio" }));
    expect(await within(dialogo).findByText(/Este cambio afecta a 2 empresas de Panamá\./)).toBeInTheDocument();
    expect(onCambio).not.toHaveBeenCalled();
  });

  it("R11: sin empresas guarda a la primera, sin segundo paso", async () => {
    acciones.actualizarDatosPaisAction.mockResolvedValue({ status: "ok", pais: pais(), cambiado: true });
    const { user, onCambio } = montar();
    const dialogo = await abrirEdicionDeDatos(user);
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onCambio).toHaveBeenCalledTimes(1));
    expect(acciones.actualizarDatosPaisAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Este cambio afecta/)).toBeNull();
  });

  it("un error del servidor por campo vuelve al formulario y se muestra en ese campo", async () => {
    acciones.actualizarDatosPaisAction.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { prefijoTelefonico: ["El prefijo de Panamá es +507"] },
    });
    const { user } = montar();
    const dialogo = await abrirEdicionDeDatos(user);
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByText("El prefijo de Panamá es +507")).toBeInTheDocument();
  });
});

describe("R13 — alta, edición y activación de tipos; sin borrar", () => {
  it("no ofrece ninguna acción de borrar", () => {
    montar();
    expect(screen.queryByRole("button", { name: /borrar|eliminar|quitar/i })).toBeNull();
  });

  it("«Nuevo tipo» envía el país y la regla del tipo", async () => {
    acciones.crearTipoDocumentoAction.mockResolvedValue({ status: "ok", tipo: CEDULA });
    const { user, onCambio } = montar();
    await user.click(screen.getByRole("button", { name: "Nuevo tipo" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo tipo de documento" });

    await user.type(within(dialogo).getByLabelText(/^Documento/), "Carné de residente");
    await user.type(within(dialogo).getByLabelText(/^Largo mínimo/), "6");
    await user.type(within(dialogo).getByLabelText(/^Largo máximo/), "10");
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(acciones.crearTipoDocumentoAction).toHaveBeenCalledWith({
        paisId: "PA",
        nombre: "Carné de residente",
        caracteres: "digitos",
        largoMin: 6,
        largoMax: 10,
      }),
    );
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
  });

  it("«Editar» abre el tipo con sus datos y envía su id", async () => {
    acciones.editarTipoDocumentoAction.mockResolvedValue({ status: "ok", tipo: PASAPORTE, cambiado: true });
    const { user } = montar();
    await user.click(screen.getByRole("button", { name: "Editar Pasaporte" }));
    const dialogo = await screen.findByRole("dialog", { name: "Editar Pasaporte" });

    const maximo = within(dialogo).getByLabelText(/^Largo máximo/);
    expect(maximo).toHaveValue(12);
    await user.clear(maximo);
    await user.type(maximo, "15");
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(acciones.editarTipoDocumentoAction).toHaveBeenCalledWith({
        id: PASAPORTE.id,
        nombre: "Pasaporte",
        caracteres: "alfanumerico",
        largoMin: 11,
        largoMax: 15,
      }),
    );
  });

  it("un nombre repetido en el país se dice junto al nombre", async () => {
    acciones.crearTipoDocumentoAction.mockResolvedValue({ status: "conflict", campo: "nombre" });
    const { user } = montar();
    await user.click(screen.getByRole("button", { name: "Nuevo tipo" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo tipo de documento" });
    await user.type(within(dialogo).getByLabelText(/^Documento/), "cedula");
    await user.type(within(dialogo).getByLabelText(/^Largo mínimo/), "9");
    await user.type(within(dialogo).getByLabelText(/^Largo máximo/), "9");
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByText("Ya hay un tipo con ese nombre en este país.")).toBeInTheDocument();
  });

  it("activar un tipo inactivo llama a la action con el estado deseado", async () => {
    acciones.cambiarActivoTipoDocumentoAction.mockResolvedValue({ status: "ok", tipo: { ...PASAPORTE, activo: true } });
    const { user, onCambio } = montar();
    const interruptor = screen.getByRole("switch", { name: "Activo: Pasaporte" });
    await user.click(interruptor);

    await waitFor(() =>
      expect(acciones.cambiarActivoTipoDocumentoAction).toHaveBeenCalledWith({ id: PASAPORTE.id, activo: true }),
    );
    await waitFor(() => expect(interruptor).toHaveAttribute("aria-checked", "true"));
    expect(onCambio).toHaveBeenCalled();
  });
});

describe("R15 — desactivar el único tipo activo", () => {
  it("si el servidor lo rechaza, el interruptor vuelve a activo y se muestra el mensaje", async () => {
    acciones.cambiarActivoTipoDocumentoAction.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { activo: ["Es el único tipo activo del país: activa otro antes de desactivarlo."] },
    });
    const { user, onCambio } = montar();
    const interruptor = screen.getByRole("switch", { name: "Activo: Cédula" });
    await user.click(interruptor);

    await waitFor(() =>
      expect(acciones.cambiarActivoTipoDocumentoAction).toHaveBeenCalledWith({ id: CEDULA.id, activo: false }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Es el único tipo activo del país: activa otro antes de desactivarlo.",
    );
    expect(interruptor).toHaveAttribute("aria-checked", "true");
    expect(onCambio).not.toHaveBeenCalled();
  });
});
