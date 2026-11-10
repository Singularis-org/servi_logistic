// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

import { DestinatariosField } from "@/app/(app)/configuracion/envios-whatsapp/_components/DestinatariosField";
import { AVISO_SIN_PREFIJO } from "@/components/shared/PrefijoTelefonico";
import type { DestinatarioPreviewDTO, PreviewDestinatariosDTO } from "@/lib/types/envios-whatsapp";
import type { TelefonoDelPais } from "@/lib/types/pais";
import { PaisDeLaEmpresaProvider } from "@/providers/PaisDeLaEmpresaProvider";

// SLT-81 (design §7.6; R22, R23) — el aviso de los teléfonos que no sirven dice la regla del país de
// la empresa: su prefijo y su cantidad de dígitos nacionales.

afterEach(cleanup);

const ANA: DestinatarioPreviewDTO = {
  usuarioId: "u-ana",
  nombre: "Ana Pérez",
  rol: "mensajero",
  telefonoEnmascarado: "•••• 7777",
  telefonoValido: false,
  telefonoCompartido: false,
};
const LUIS: DestinatarioPreviewDTO = { ...ANA, usuarioId: "u-luis", nombre: "Luis Gómez", telefonoValido: true };

function preview(destinatarios: DestinatarioPreviewDTO[]): PreviewDestinatariosDTO {
  return { destinatarios, total: destinatarios.length, avisos: [], excedeTope: false, tope: 50 };
}

function campo(destinatarios: DestinatarioPreviewDTO[]): ReactElement {
  return (
    <DestinatariosField
      personas={destinatarios}
      roles={[]}
      usuarioIds={destinatarios.map((d) => d.usuarioId)}
      onCambiar={vi.fn()}
      preview={preview(destinatarios)}
      informeNoAptoAdminTienda={false}
    />
  );
}

function conPais(ui: ReactElement, telefono: TelefonoDelPais | null) {
  return render(<PaisDeLaEmpresaProvider telefono={telefono}>{ui}</PaisDeLaEmpresaProvider>);
}

describe("DestinatariosField — regla del teléfono del país (SLT-81)", () => {
  it("R22: con un teléfono que no sirve, el aviso dice +<prefijo> y <n> dígitos del país", () => {
    conPais(campo([ANA, LUIS]), { paisNombre: "Panamá", prefijo: "507", digitosNacionales: 8 });
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("1 persona no lo va a recibir");
    expect(aviso).toHaveTextContent("En Panamá el número es +507 seguido de 8 dígitos.");
    // El enmascarado no cambia.
    expect(screen.getAllByText("•••• 7777").length).toBeGreaterThan(0);
  });

  it("R22: con otro país, la regla es la de ese país", () => {
    conPais(campo([ANA]), { paisNombre: "Guatemala", prefijo: "502", digitosNacionales: 8 });
    expect(screen.getByRole("status")).toHaveTextContent("En Guatemala el número es +502 seguido de 8 dígitos.");
  });

  it("R23: si el país no tiene prefijo cargado, el aviso lo dice y no inventa una regla", () => {
    conPais(campo([ANA]), null);
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent(AVISO_SIN_PREFIJO);
    expect(aviso.textContent ?? "").not.toMatch(/\+\d/);
  });

  it("sin teléfonos que no sirvan, no hay aviso de regla", () => {
    conPais(campo([LUIS]), { paisNombre: "Panamá", prefijo: "507", digitosNacionales: 8 });
    expect(screen.queryByText(/seguido de/)).toBeNull();
  });
});
