// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  VisorEvidencia,
  type EvidenciaAbierta,
} from "@/components/private/cierres/dialogos/VisorEvidencia";

/**
 * SLT-103 «Diálogos del módulo de cierres y trato tú» — el visor único de evidencia
 * (R54, R137, R138, R139).
 *
 * Los textos se comparan contra LITERALES escritos a mano, nunca contra `dialogos-labels.ts`.
 */

const URL_1 = "https://signed.example/evidencias/visor-0.jpg?token=alfa";
const URL_2 = "https://signed.example/evidencias/visor-1.jpg?token=beta";
const URL_3 = "https://signed.example/evidencias/visor-2.jpg?token=gamma";
const SOLA = "https://signed.example/evidencias/visor-unica.jpg?token=delta";

afterEach(() => {
  cleanup();
});

/** Monta el visor controlado por un botón externo, como lo montan las tres pantallas. */
function Arnes({ inicial, onClose }: { inicial: EvidenciaAbierta | null; onClose?: () => void }) {
  const [evidencia, setEvidencia] = useState<EvidenciaAbierta | null>(inicial);
  return (
    <>
      <button
        type="button"
        onClick={() => setEvidencia({ urls: [URL_1, URL_2, URL_3], contexto: "Orden REM-022 · Berta Ruiz" })}
      >
        abrir otra
      </button>
      <VisorEvidencia
        evidencia={evidencia}
        onClose={() => {
          onClose?.();
          setEvidencia(null);
        }}
      />
    </>
  );
}

function srcDe(dialogo: HTMLElement): string | null {
  return within(dialogo).getByRole("img").getAttribute("src");
}

describe("SLT-103 · VisorEvidencia", () => {
  it("R137/R139: n = 3 abre en la foto 1, con título, alt y «foto 1 de 3»; «Anterior» deshabilitado", () => {
    render(
      <VisorEvidencia
        evidencia={{ urls: [URL_1, URL_2, URL_3], contexto: "Orden REM-011 · Andrés Mora" }}
        onClose={vi.fn()}
      />,
    );
    const dialogo = screen.getByRole("dialog", { name: "Evidencia de la gestión" });
    const img = within(dialogo).getByRole("img", { name: "Evidencia fotográfica de la gestión" });
    expect(img).toHaveAttribute("src", URL_1);
    expect(dialogo).toHaveAccessibleDescription("Orden REM-011 · Andrés Mora · foto 1 de 3");
    expect(within(dialogo).getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(within(dialogo).getByRole("button", { name: "Siguiente" })).toBeEnabled();
    // «Anterior» y «Siguiente» van en el cuerpo, en su grupo, DESPUÉS de la foto (PA4).
    const grupo = within(dialogo).getByRole("group", { name: "Fotos de la evidencia" });
    expect(img.compareDocumentPosition(grupo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
  });

  it("R139: «Siguiente» ×2 llega a la 3.ª (Siguiente deshabilitado) y «Anterior» vuelve a la 2.ª", async () => {
    const user = userEvent.setup();
    render(
      <VisorEvidencia
        evidencia={{ urls: [URL_1, URL_2, URL_3], contexto: "Orden REM-011 · Andrés Mora" }}
        onClose={vi.fn()}
      />,
    );
    const dialogo = screen.getByRole("dialog", { name: "Evidencia de la gestión" });
    const siguiente = within(dialogo).getByRole("button", { name: "Siguiente" });
    await user.click(siguiente);
    expect(srcDe(dialogo)).toBe(URL_2);
    expect(dialogo).toHaveAccessibleDescription("Orden REM-011 · Andrés Mora · foto 2 de 3");
    await user.click(siguiente);
    expect(srcDe(dialogo)).toBe(URL_3);
    expect(dialogo).toHaveAccessibleDescription("Orden REM-011 · Andrés Mora · foto 3 de 3");
    expect(siguiente).toBeDisabled();
    expect(within(dialogo).getByRole("button", { name: "Anterior" })).toBeEnabled();

    await user.click(within(dialogo).getByRole("button", { name: "Anterior" }));
    expect(srcDe(dialogo)).toBe(URL_2);
    expect(dialogo).toHaveAccessibleDescription("Orden REM-011 · Andrés Mora · foto 2 de 3");
  });

  it("R139: cerrar y reabrir con otro objeto vuelve a la foto 1", async () => {
    const user = userEvent.setup();
    render(
      <Arnes inicial={{ urls: [URL_1, URL_2, URL_3], contexto: "Orden REM-011 · Andrés Mora" }} />,
    );
    let dialogo = screen.getByRole("dialog", { name: "Evidencia de la gestión" });
    await user.click(within(dialogo).getByRole("button", { name: "Siguiente" }));
    await user.click(within(dialogo).getByRole("button", { name: "Siguiente" }));
    expect(dialogo).toHaveAccessibleDescription("Orden REM-011 · Andrés Mora · foto 3 de 3");

    await user.click(within(dialogo).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog", { name: "Evidencia de la gestión" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "abrir otra" }));
    dialogo = await screen.findByRole("dialog", { name: "Evidencia de la gestión" });
    expect(dialogo).toHaveAccessibleDescription("Orden REM-022 · Berta Ruiz · foto 1 de 3");
    expect(srcDe(dialogo)).toBe(URL_1);
    expect(within(dialogo).getByRole("button", { name: "Anterior" })).toBeDisabled();
  });

  it("R139: sin contexto la descripción es «Foto 1 de 3»", () => {
    render(<VisorEvidencia evidencia={{ urls: [URL_1, URL_2, URL_3] }} onClose={vi.fn()} />);
    const dialogo = screen.getByRole("dialog", { name: "Evidencia de la gestión" });
    expect(dialogo).toHaveAccessibleDescription("Foto 1 de 3");
  });

  it("R138: con una foto no hay «Anterior», «Siguiente» ni «foto 1 de 1»", () => {
    render(
      <VisorEvidencia
        evidencia={{ urls: [SOLA], contexto: "Orden REM-011 · Andrés Mora" }}
        onClose={vi.fn()}
      />,
    );
    const dialogo = screen.getByRole("dialog", { name: "Evidencia de la gestión" });
    expect(srcDe(dialogo)).toBe(SOLA);
    expect(within(dialogo).queryByRole("button", { name: "Anterior" })).toBeNull();
    expect(within(dialogo).queryByRole("button", { name: "Siguiente" })).toBeNull();
    expect(within(dialogo).queryByRole("group", { name: "Fotos de la evidencia" })).toBeNull();
    expect(document.body.textContent).not.toContain("foto 1 de 1");
    expect(document.body.textContent).not.toContain("Foto 1 de 1");
    expect(dialogo).toHaveAccessibleDescription("Orden REM-011 · Andrés Mora");
  });

  it("R137: «Cerrar» llama a onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<VisorEvidencia evidencia={{ urls: [SOLA] }} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("R137: Escape cierra el visor", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Arnes inicial={{ urls: [SOLA] }} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Evidencia de la gestión" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Evidencia de la gestión" })).toBeNull();
  });

  it("cerrado (`null`) no pinta el diálogo", () => {
    render(<VisorEvidencia evidencia={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
