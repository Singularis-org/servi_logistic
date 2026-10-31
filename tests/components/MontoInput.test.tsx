// @vitest-environment jsdom
// SLT-67 — el campo de monto compartido: muestra «500» y no «500.00», normaliza al salir del
// campo y no reescribe lo que el usuario está tecleando. Lo que sale por `onChange` es string.
import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MontoInput } from "@/components/shared/MontoInput";

afterEach(() => cleanup());

/** Un padre controlado como el de un formulario real; expone cada valor que recibe. */
function Controlado({ inicial, espia }: { inicial: string; espia: (v: string) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <label htmlFor="monto">Monto</label>
      <MontoInput
        id="monto"
        aria-describedby="ayuda"
        value={valor}
        onChange={(v) => {
          espia(v);
          setValor(v);
        }}
      />
      <button type="button">Otro</button>
    </>
  );
}

describe("SLT-67 — MontoInput", () => {
  it("muestra «500» cuando el valor es «500.00»", () => {
    render(<Controlado inicial="500.00" espia={vi.fn()} />);
    expect(screen.getByLabelText("Monto")).toHaveValue("500");
  });

  it("muestra «500.50» cuando el valor es «500.5»", () => {
    render(<Controlado inicial="500.5" espia={vi.fn()} />);
    expect(screen.getByLabelText("Monto")).toHaveValue("500.50");
  });

  it("es un campo de texto con teclado decimal y reenvía id y aria-*", () => {
    render(<Controlado inicial="" espia={vi.fn()} />);
    const campo = screen.getByRole("textbox", { name: "Monto" });
    expect(campo).toHaveAttribute("inputmode", "decimal");
    expect(campo).toHaveAttribute("id", "monto");
    expect(campo).toHaveAttribute("aria-describedby", "ayuda");
  });

  it("no reescribe mientras se escribe: «500.» conserva el punto y «500.5» no se completa", async () => {
    const user = userEvent.setup();
    render(<Controlado inicial="" espia={vi.fn()} />);
    const campo = screen.getByLabelText("Monto");

    await user.type(campo, "500.");
    expect(campo).toHaveValue("500.");
    await user.type(campo, "5");
    expect(campo).toHaveValue("500.5");
  });

  it("normaliza al salir del campo y lo entrega por onChange", async () => {
    const user = userEvent.setup();
    const espia = vi.fn();
    render(<Controlado inicial="" espia={espia} />);
    const campo = screen.getByLabelText("Monto");

    await user.type(campo, "500.5");
    await user.click(screen.getByRole("button", { name: "Otro" }));
    expect(campo).toHaveValue("500.50");
    expect(espia).toHaveBeenLastCalledWith("500.50");

    await user.clear(campo);
    await user.type(campo, "500.00");
    await user.tab();
    expect(campo).toHaveValue("500");
    expect(espia).toHaveBeenLastCalledWith("500");
  });

  it("onChange entrega siempre string, nunca number", async () => {
    const user = userEvent.setup();
    const espia = vi.fn();
    render(<Controlado inicial="" espia={espia} />);

    await user.type(screen.getByLabelText("Monto"), "12");
    await user.tab();
    expect(espia.mock.calls.length).toBeGreaterThan(0);
    for (const [valor] of espia.mock.calls) expect(typeof valor).toBe("string");
    expect(espia).toHaveBeenLastCalledWith("12");
  });

  it("al enfocar un «500.00» del servidor se edita «500», no reaparece «.00»", async () => {
    const user = userEvent.setup();
    const espia = vi.fn();
    render(<Controlado inicial="500.00" espia={espia} />);
    const campo = screen.getByLabelText("Monto");

    await user.click(campo);
    expect(campo).toHaveValue("500");
    expect(espia).toHaveBeenCalledWith("500");
  });
});
