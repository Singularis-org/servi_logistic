// @vitest-environment jsdom
//
// SLT-73 (R14) — «Desmarcar» una consolidación cuya marca ya asentó el dinero en los libros: la
// acción responde `con_asientos` sin cambiar nada, y la pantalla lo dice con su aviso propio
// —no con el genérico «No se pudo completar la operación»— dentro del diálogo.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";

const revertirMock = vi.fn();

vi.mock("@/lib/actions/conciliacion-satelites", () => ({
  corregirConsolidacionRecibidaAction: vi.fn(),
  marcarConsolidacionRecibidaAction: vi.fn(),
  revertirConciliacionAction: (...a: unknown[]) => revertirMock(...a),
}));

import { ConciliacionAcciones } from "@/components/shared/conciliacion/ConciliacionAcciones";

const onCambio = vi.fn();

type Marca = {
  conciliado: boolean;
  faltaPorRecibir: string;
  montoRecibido: string | null;
  desmarcable: boolean;
};

/** Recibida entera y SIN dinero asentado: la que el servidor da por desmarcable. */
const RECIBIDA_DESMARCABLE: Marca = {
  conciliado: true,
  faltaPorRecibir: "0.00",
  montoRecibido: "67090.25",
  desmarcable: true,
};

function montar(marca: Marca = RECIBIDA_DESMARCABLE) {
  render(
    <ToastProvider>
      <ConciliacionAcciones
        cierreBodegaId="cb-1"
        bodega="FGAM Limón"
        fecha="15 sept"
        declarado="67090.25"
        marca={marca}
        puedeConciliar
        onCambio={onCambio}
      />
    </ToastProvider>,
  );
}

async function desmarcar() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Desmarcar la consolidación de FGAM Limón del 15 sept" }),
  );
  const dialogo = await screen.findByRole("dialog");
  await user.click(within(dialogo).getByRole("button", { name: "Desmarcar" }));
  return dialogo;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SLT-73 R14 — revertir con asientos se rechaza con aviso propio", () => {
  it("pinta el mensaje de la acción en el diálogo, sin el aviso genérico ni refrescar", async () => {
    revertirMock.mockResolvedValue({
      status: "con_asientos",
      mensaje: "Ya entró a la caja: corrige el monto en vez de revertir",
    });
    montar();
    const dialogo = await desmarcar();

    const aviso = await within(dialogo).findByRole("alert");
    expect(aviso).toHaveTextContent("No se puede desmarcar.");
    expect(aviso).toHaveTextContent("Ya entró a la caja: corrige el monto en vez de revertir");
    expect(document.body.textContent ?? "").not.toContain(
      "No se pudo completar la operación. Intentá de nuevo.",
    );
    // No cambió nada: ni se refresca la lista ni se puede volver a pulsar.
    expect(onCambio).not.toHaveBeenCalled();
    expect(within(dialogo).getByRole("button", { name: "Desmarcar" })).toBeDisabled();
  });

  it("una reversión normal sigue cerrando con su aviso de éxito y refresca", async () => {
    revertirMock.mockResolvedValue({ status: "ok", cierreBodegaId: "cb-1" });
    montar();
    await desmarcar();
    expect(
      await screen.findByText("Marca deshecha. La consolidación vuelve a estar pendiente de conciliar."),
    ).toBeInTheDocument();
    expect(onCambio).toHaveBeenCalledTimes(1);
  });
});

// ── SLT-76 (R3/R4) — «Desmarcar» sólo cuando el servidor dice que se puede ──────────────────────
// `desmarcable` lo deriva el servidor con el mismo predicado con el que `revertirConciliacion`
// responde `con_asientos`. Aquí se mide que el componente lo RESPETA: con `false` no se ofrece.
describe("SLT-76 R3 — «Desmarcar» sólo si la marca es desmarcable", () => {
  const DESMARCAR = /^Desmarcar la consolidación/;
  const CORREGIR = /^Corregir el monto recibido/;

  it("recibida con dinero asentado (desmarcable: false): no hay «Desmarcar»", () => {
    montar({ conciliado: true, faltaPorRecibir: "0.00", montoRecibido: "67090.25", desmarcable: false });
    // Recibida entera: tampoco «Marcar recibido» ni «Corregir». Que la ausencia no sea un montaje
    // vacío lo prueba el caso siguiente (misma marca con `true`) y la mutación «el componente ignora el campo» de T2.
    expect(screen.queryByRole("button", { name: /Desmarcar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Marcar recibido|Corregir/ })).toBeNull();
  });

  it("recibida sin dinero asentado (desmarcable: true): sí hay «Desmarcar»", () => {
    montar({ conciliado: true, faltaPorRecibir: "0.00", montoRecibido: "67090.25", desmarcable: true });
    expect(screen.getByRole("button", { name: DESMARCAR })).toBeInTheDocument();
  });

  it("recibido incompleto con dinero asentado: «Corregir» sí, «Desmarcar» no", () => {
    montar({ conciliado: true, faltaPorRecibir: "7090.25", montoRecibido: "60000.00", desmarcable: false });
    expect(screen.getByRole("button", { name: CORREGIR })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Desmarcar/ })).toBeNull();
  });

  it("recibido incompleto sin dinero asentado: «Corregir» y «Desmarcar»", () => {
    montar({ conciliado: true, faltaPorRecibir: "7090.25", montoRecibido: "60000.00", desmarcable: true });
    expect(screen.getByRole("button", { name: CORREGIR })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: DESMARCAR })).toBeInTheDocument();
  });
});
