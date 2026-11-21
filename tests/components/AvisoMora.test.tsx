// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AvisoMora } from "@/app/(app)/_components/AvisoMora";
import type { EstadoMora } from "@/lib/planes/mora";

// SLT-121 (design §7.1; R24) — el banner de la mora. Los textos esperados van escritos a mano: si `MORA_TEXTOS`
// cambia sin querer, el caso se pone rojo.

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: ReactNode; href: string } & ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const FACTURA = { facturaId: "f1", numero: 7, fechaLimite: "2026-11-10", saldo: "120000.00" };

const EN_PLAZO: EstadoMora = { estado: "en_plazo", fechaLimite: "2026-12-05" };
const VENCIDA: EstadoMora = { estado: "vencida", facturas: [FACTURA], saldoVencido: "120000.00" };
const CONGELADA: EstadoMora = {
  estado: "congelada",
  desde: new Date("2026-11-12T05:00:00Z"),
  facturas: [FACTURA],
  saldoVencido: "120000.00",
};
const DESCONGELADA: EstadoMora = { estado: "descongelada_a_mano", hasta: "2026-11-30" };

describe("SLT-121 R24 — AvisoMora", () => {
  it("R24: en plazo, la fecha límite como aviso (`status`) y el enlace «Ver facturas» a /mi-plan para el maestro", () => {
    render(<AvisoMora estado={EN_PLAZO} rol="maestro" />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(
      "Tienes una factura de la plataforma por pagar. Fecha límite: 05/12/2026.",
    );
    expect(screen.getByRole("link", { name: "Ver facturas" })).toHaveAttribute("href", "/mi-plan");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("R24 (SLT-91): el admin ve el aviso en plazo, pero sin el enlace a «Mi plan»", () => {
    render(<AvisoMora estado={EN_PLAZO} rol="admin" />);
    expect(screen.getByRole("status")).toHaveTextContent("Fecha límite: 05/12/2026.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each(["maestro", "admin"] as const)(
    "R24: con facturas vencidas, la alerta (`alert`) de que se congela esta madrugada (%s)",
    (rol) => {
      render(<AvisoMora estado={VENCIDA} rol={rol} />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Tienes facturas vencidas. Si no se pagan, la operación se congela esta madrugada.",
      );
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("link")).toBeNull();
    },
  );

  it("R24: congelada, la alerta con lo que se puede hacer", () => {
    render(<AvisoMora estado={CONGELADA} rol="maestro" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Empresa congelada por falta de pago. Puedes ver tus datos, cambiar tu cuenta y pagar a la plataforma desde la wallet.",
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("R24: descongelada a mano, el aviso (`status`) con la fecha hasta", () => {
    render(<AvisoMora estado={DESCONGELADA} rol="admin" />);
    expect(screen.getByRole("status")).toHaveTextContent("La operación está habilitada hasta el 30/11/2026.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("R24: al día, sin banner", () => {
    const { container } = render(<AvisoMora estado={{ estado: "al_dia" }} rol="maestro" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("R24: con `null` (otro rol, o la lectura falló), sin banner", () => {
    const { container } = render(<AvisoMora estado={null} rol="maestro" />);
    expect(container).toBeEmptyDOMElement();
  });
});
