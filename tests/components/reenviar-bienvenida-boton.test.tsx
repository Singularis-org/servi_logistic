// @vitest-environment jsdom
// SL-41 (R31) — «Reenviar bienvenida»: lo que ve el superadmin cuando termina el reenvío.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ReenviarBienvenidaBoton,
  type ReenviarBienvenidaBotonProps,
} from "@/app/(app)/plataforma/empresas/_components/ReenviarBienvenidaBoton";

const ORG = "3f1c2d4e-0000-4000-8000-000000000042";

afterEach(() => cleanup());

// Sin el tipo de la action a propósito: el test le da también respuestas fuera del contrato, que
// pueden llegar porque la respuesta cruza la red.
type Reenviar = ReenviarBienvenidaBotonProps["reenviarBienvenida"];

function montar(reenviarBienvenida: ReturnType<typeof vi.fn>) {
  render(
    <ReenviarBienvenidaBoton
      organizacionId={ORG}
      reenviarBienvenida={reenviarBienvenida as unknown as Reenviar}
    />,
  );
  return screen.getByRole("button", { name: "Reenviar bienvenida" });
}

async function pulsarCon(reenviarBienvenida: ReturnType<typeof vi.fn>) {
  const user = userEvent.setup();
  const boton = montar(reenviarBienvenida);
  await user.click(boton);
  await waitFor(() => expect(boton).toBeEnabled());
  return boton;
}

describe("SL-41 (R31) — el resultado del reenvío en la fila", () => {
  it("antes de pulsar, la región de estado existe y está vacía", () => {
    montar(vi.fn());
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("llama a la action una vez con el id de la empresa", async () => {
    const reenviar = vi.fn().mockResolvedValue({ estado: "enviada", email: "ana@norte.test" });
    await pulsarCon(reenviar);
    expect(reenviar).toHaveBeenCalledTimes(1);
    expect(reenviar).toHaveBeenCalledWith({ organizacionId: ORG });
  });

  it.each([
    ["enviada", { estado: "enviada", email: "ana@norte.test" }, "Enviada a ana@norte.test."],
    ["no_enviada", { estado: "no_enviada", email: "ana@norte.test" }, "No salió. Inténtalo de nuevo."],
    [
      "sin_correo",
      { estado: "sin_correo", email: "ana@norte.test" },
      "No salió: el correo no está configurado.",
    ],
    ["sin_maestro", { estado: "sin_maestro" }, "Esta empresa no tiene maestro."],
    ["no_autorizado", { estado: "no_autorizado" }, "No salió. Inténtalo de nuevo."],
    ["invalida", { estado: "invalida" }, "No salió. Inténtalo de nuevo."],
    ["una respuesta fuera del contrato", undefined, "No salió. Inténtalo de nuevo."],
  ])("con %s pinta su resultado", async (_nombre, respuesta, texto) => {
    await pulsarCon(vi.fn().mockResolvedValue(respuesta));
    expect(screen.getByRole("status")).toHaveTextContent(texto);
  });

  it("una excepción de red cuenta como «No salió», sin su detalle", async () => {
    await pulsarCon(vi.fn().mockRejectedValue(new Error("ECONNRESET 10.0.0.5 ana@norte.test")));
    expect(screen.getByRole("status")).toHaveTextContent("No salió. Inténtalo de nuevo.");
    expect(document.body.textContent).not.toContain("ECONNRESET");
  });

  it("mientras envía, el botón queda ocupado y no admite un segundo envío", async () => {
    const user = userEvent.setup();
    let resolver: (v: unknown) => void = () => {};
    const reenviar = vi.fn().mockReturnValue(new Promise((r) => (resolver = r)));
    const boton = montar(reenviar);

    await user.click(boton);
    await waitFor(() => expect(boton).toBeDisabled());
    expect(boton).toHaveAttribute("aria-busy", "true");

    resolver({ estado: "enviada", email: "ana@norte.test" });
    await waitFor(() => expect(boton).toBeEnabled());
    expect(reenviar).toHaveBeenCalledTimes(1);
  });
});
