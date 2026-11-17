// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecibirPaquetesEntrada } from "@/components/shared/RecibirPaquetesEntrada";
import { TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";

// SLT-159 «Escaneo continuo en recepciones y recogidas» (R611) — la entrada a la recepción
// continua: enlace con puntero fino, diálogo con táctil.

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = vi.fn();
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
}));

const matchMediaOriginal = window.matchMedia;

function conPuntero(fino: boolean) {
  window.matchMedia = ((consulta: string) => ({
    matches: fino && consulta === "(pointer: fine)",
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function entrada() {
  return (
    <RecibirPaquetesEntrada href="/ordenes/recibir">
      <TarjetaEscaneoContinuo
        sinEncabezado
        recibir={async () => ({ tipo: "recibida" })}
        titulo="Recibir paquetes"
        descripcion="Escanea las guías una tras otra"
        ariaLabel="Recepción continua"
        submitLabel="Recibir"
      />
    </RecibirPaquetesEntrada>
  );
}

beforeEach(() => conPuntero(true));

afterEach(() => {
  cleanup();
  window.matchMedia = matchMediaOriginal;
});

describe("RecibirPaquetesEntrada (R611)", () => {
  it("con puntero fino es un enlace a la página y no un botón", () => {
    render(entrada());

    expect(screen.getByRole("link", { name: "Recibir paquetes" })).toHaveAttribute(
      "href",
      "/ordenes/recibir",
    );
    expect(screen.queryByRole("button", { name: "Recibir paquetes" })).toBeNull();
  });

  it("con táctil es un botón que abre el diálogo con la lista de la sesión", async () => {
    conPuntero(false);
    const user = userEvent.setup();
    render(entrada());

    expect(screen.queryByRole("link", { name: "Recibir paquetes" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Recibir paquetes" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Lecturas" })).toBeInTheDocument();
  });
});

// SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (R925-R927): el diálogo de la
// recepción continua lleva «Recibir paquetes» en la barra de `EscanerModal`, con un solo «Cerrar»
// de 44 px; la tarjeta de dentro va sin encabezado (lo comprueban los tests de cada tarjeta).
describe("RecibirPaquetesEntrada — un solo título, en la barra (SLT-193)", () => {
  it("R925/R927: «Recibir paquetes» en la barra, un único título y un único «Cerrar» de 44 px", async () => {
    conPuntero(false);
    const user = userEvent.setup();
    render(entrada());
    await user.click(screen.getByRole("button", { name: "Recibir paquetes" }));

    const dialogo = await screen.findByRole("dialog", { name: "Recibir paquetes" });
    const titulos = within(dialogo).getAllByRole("heading");
    expect(titulos.map((h) => h.textContent)).toEqual(["Recibir paquetes"]);
    expect(titulos[0]).not.toHaveClass("sr-only");
    const cerrar = within(dialogo).getAllByRole("button", { name: "Cerrar" });
    expect(cerrar).toHaveLength(1);
    expect(cerrar[0].className.split(/\s+/)).toContain("size-11");
    // El nombre de la sección y el botón de envío no cambian.
    expect(within(dialogo).getByRole("region", { name: "Recepción continua" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Recibir" })).toBeInTheDocument();
  });

  it("R926: «Cerrar» cierra el diálogo y desmonta la sesión", async () => {
    conPuntero(false);
    const user = userEvent.setup();
    render(entrada());
    await user.click(screen.getByRole("button", { name: "Recibir paquetes" }));
    await user.click(await screen.findByRole("button", { name: "Cerrar" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("log", { name: "Lecturas" })).toBeNull();
  });
});
