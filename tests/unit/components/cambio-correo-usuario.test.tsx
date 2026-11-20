// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

// SLT-221 (design §7; R1617-R1620): el bloque «Cambiar correo» de «Editar usuario». Las acciones van
// con dobles: aquí se prueba qué ve y qué pide la pantalla, no el servicio.
const obtenerMock = vi.fn();
const solicitarMock = vi.fn();
const cancelarMock = vi.fn();
vi.mock("@/lib/actions/usuarios", () => ({
  obtenerCambioCorreoPendiente: (...args: unknown[]) => obtenerMock(...args),
  solicitarCambioCorreoUsuario: (...args: unknown[]) => solicitarMock(...args),
  cancelarCambioCorreoUsuario: (...args: unknown[]) => cancelarMock(...args),
}));

import { CambioCorreoUsuario } from "@/app/(app)/configuracion/_components/CambioCorreoUsuario";
// El formato de fecha es el compartido de Configuración; aquí se prueba que la fecha QUE SE MUESTRA
// es la del pendiente (y la nueva tras reenviar), no el formato.
import { formatFechaHoraLegible } from "@/app/(app)/configuracion/api/_components/fecha-legible";

const ID = "6f1c2b3a-0000-4000-8000-000000000001";

// Literales a propósito: son el contrato con el usuario (requirements R1617 y design §7).
const ENVIO_FALLIDO = "No se pudo enviar el correo de confirmación. Inténtalo de nuevo.";
const EN_USO = "Ya está en uso por otro usuario";
// Review PR 2 (m5): el servicio redacta este motivo cuando llegan dos pedidos a la vez.
const SIMULTANEO =
  "Se estaba pidiendo otro cambio de correo para este usuario al mismo tiempo. Vuelve a intentarlo.";

const PENDIENTE = {
  emailNuevo: "nuevo.correo@example.test",
  expiraAt: "2031-03-04T15:30:00.000Z",
  vencido: false,
};

function renderBloque() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CambioCorreoUsuario usuarioId={ID} />
    </SWRConfig>,
  );
}

beforeEach(() => {
  obtenerMock.mockReset();
  solicitarMock.mockReset();
  cancelarMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("CambioCorreoUsuario — R1618: lo que ve el maestro", () => {
  it("sin pendiente: ofrece «Cambiar correo» y no muestra ningún pendiente", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: null });
    renderBloque();

    expect(await screen.findByRole("button", { name: "Cambiar correo" })).toBeTruthy();
    expect(obtenerMock).toHaveBeenCalledWith(ID);
    expect(screen.queryByText(/Pendiente de confirmar/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Reenviar" })).toBeNull();
  });

  it("con pendiente: muestra el correo nuevo, cuándo vence y «Reenviar» y «Cancelar»", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: PENDIENTE });
    renderBloque();

    expect(await screen.findByText(PENDIENTE.emailNuevo)).toBeTruthy();
    expect(screen.getByText(/Pendiente de confirmar:/)).toBeTruthy();
    expect(
      screen.getByText(`El enlace vence el ${formatFechaHoraLegible(PENDIENTE.expiraAt)}`),
    ).toBeTruthy();
    expect(screen.queryByText("Vencido")).toBeNull();
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cambiar correo" })).toBeNull();
  });

  it("vencido: dice «Vencido» en vez de la fecha y sigue ofreciendo «Reenviar»", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: { ...PENDIENTE, vencido: true } });
    renderBloque();

    expect(await screen.findByText("Vencido")).toBeTruthy();
    expect(screen.queryByText(/El enlace vence el/)).toBeNull();
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("si no se puede leer el pendiente, no ofrece «Cambiar correo» a ciegas", async () => {
    obtenerMock.mockResolvedValue({ status: "forbidden" });
    renderBloque();

    expect(
      await screen.findByText("No se pudo consultar si hay un cambio de correo pendiente."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cambiar correo" })).toBeNull();
  });
});

describe("CambioCorreoUsuario — pedir el cambio", () => {
  it("pide el cambio con el correo escrito y pasa a mostrar el pendiente", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: null });
    solicitarMock.mockResolvedValue({ status: "ok", pendiente: PENDIENTE });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Cambiar correo" }));
    await user.type(screen.getByLabelText("Correo nuevo"), PENDIENTE.emailNuevo);
    await user.click(screen.getByRole("button", { name: "Enviar confirmación" }));

    expect(solicitarMock).toHaveBeenCalledWith(ID, { email: PENDIENTE.emailNuevo });
    expect(await screen.findByText(/Pendiente de confirmar:/)).toBeTruthy();
    expect(screen.getByText(PENDIENTE.emailNuevo)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Enviamos el enlace de confirmación al correo nuevo.",
    );
  });

  it("un correo mal escrito no llega al servidor", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: null });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Cambiar correo" }));
    await user.type(screen.getByLabelText("Correo nuevo"), "sin-arroba");
    await user.click(screen.getByRole("button", { name: "Enviar confirmación" }));

    expect(await screen.findByText("Escribe un correo válido.")).toBeTruthy();
    expect(solicitarMock).not.toHaveBeenCalled();
  });

  it("conflict: dice junto al campo que el correo ya está en uso y no muestra pendiente", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: null });
    solicitarMock.mockResolvedValue({ status: "conflict", campo: "email" });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Cambiar correo" }));
    const campo = screen.getByLabelText("Correo nuevo");
    await user.type(campo, "otro@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar confirmación" }));

    expect(await screen.findByText(EN_USO)).toBeTruthy();
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText(/Pendiente de confirmar/)).toBeNull();
  });

  it("m5 conflict con mensaje: muestra junto al campo el motivo del servidor, no «en uso»", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: null });
    solicitarMock.mockResolvedValue({ status: "conflict", campo: "email", mensaje: SIMULTANEO });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Cambiar correo" }));
    const campo = screen.getByLabelText("Correo nuevo");
    await user.type(campo, "otro@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar confirmación" }));

    expect(await screen.findByText(SIMULTANEO)).toBeTruthy();
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText(EN_USO)).toBeNull();
  });

  it("validation_error: repite el motivo que redacta el servidor", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: null });
    solicitarMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { email: ["El correo nuevo es igual al actual"] },
    });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Cambiar correo" }));
    await user.type(screen.getByLabelText("Correo nuevo"), "igual@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar confirmación" }));

    expect(await screen.findByText("El correo nuevo es igual al actual")).toBeTruthy();
  });

  it("R1617 envio_fallido: avisa y vuelve a leer el pendiente (no queda ninguno)", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: null });
    solicitarMock.mockResolvedValue({ status: "envio_fallido" });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Cambiar correo" }));
    await user.type(screen.getByLabelText("Correo nuevo"), "nuevo@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar confirmación" }));

    expect((await screen.findByRole("alert")).textContent).toContain(ENVIO_FALLIDO);
    await waitFor(() => expect(obtenerMock).toHaveBeenCalledTimes(2));
  });
});

describe("CambioCorreoUsuario — R1619: cancelar", () => {
  it("anula el pendiente y deja de mostrarlo", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: PENDIENTE });
    cancelarMock.mockResolvedValue({ status: "ok" });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(cancelarMock).toHaveBeenCalledWith(ID);
    expect(await screen.findByRole("button", { name: "Cambiar correo" })).toBeTruthy();
    expect(screen.queryByText(PENDIENTE.emailNuevo)).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Se canceló el cambio de correo.");
  });

  it("si la cancelación falla, lo dice y no oculta el pendiente", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: PENDIENTE });
    cancelarMock.mockResolvedValue({ status: "not_found" });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No se pudo completar la acción. Inténtalo de nuevo.",
    );
    expect(screen.getByText(PENDIENTE.emailNuevo)).toBeTruthy();
  });
});

describe("CambioCorreoUsuario — R1620: reenviar", () => {
  it("vuelve a pedir el MISMO correo nuevo y muestra el vencimiento nuevo", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: { ...PENDIENTE, vencido: true } });
    solicitarMock.mockResolvedValue({
      status: "ok",
      pendiente: { ...PENDIENTE, expiraAt: "2032-06-07T10:00:00.000Z", vencido: false },
    });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Reenviar" }));

    expect(solicitarMock).toHaveBeenCalledWith(ID, { email: PENDIENTE.emailNuevo });
    expect(
      await screen.findByText(`El enlace vence el ${formatFechaHoraLegible("2032-06-07T10:00:00.000Z")}`),
    ).toBeTruthy();
    expect(screen.queryByText("Vencido")).toBeNull();
  });

  it("m5 al reenviar: un conflict con mensaje se avisa con ese mensaje", async () => {
    obtenerMock.mockResolvedValue({ status: "ok", pendiente: PENDIENTE });
    solicitarMock.mockResolvedValue({ status: "conflict", campo: "email", mensaje: SIMULTANEO });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Reenviar" }));

    expect((await screen.findByRole("alert")).textContent).toContain(SIMULTANEO);
    expect(screen.queryByText(EN_USO)).toBeNull();
  });

  it("R1617/m6 al reenviar: envio_fallido avisa, relee el estado y el bloque queda sin pendiente", async () => {
    obtenerMock
      .mockResolvedValueOnce({ status: "ok", pendiente: PENDIENTE })
      .mockResolvedValue({ status: "ok", pendiente: null });
    solicitarMock.mockResolvedValue({ status: "envio_fallido" });
    const user = userEvent.setup();
    renderBloque();

    await user.click(await screen.findByRole("button", { name: "Reenviar" }));

    expect((await screen.findByRole("alert")).textContent).toContain(ENVIO_FALLIDO);
    expect(await screen.findByRole("button", { name: "Cambiar correo" })).toBeTruthy();
    // m6 (review PR 2): el reenvío fallido anuló el pendiente en el servidor; la pantalla lo relee
    // (segunda lectura) en vez de seguir mostrando el anterior.
    expect(obtenerMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(PENDIENTE.emailNuevo)).toBeNull();
    expect(screen.queryByText(/Pendiente de confirmar/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Reenviar" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(ENVIO_FALLIDO);
  });
});
