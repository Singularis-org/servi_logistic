// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AjustarPagoMensajeroDialog } from "@/app/(app)/cierres-admin/_components/AjustarPagoMensajeroDialog";
import { ajustarPagoMensajeroGestion } from "@/lib/actions/cierres-admin";
import type { CierreDetalleGestion } from "@/lib/interfaces/services/ICierreDiaService";
import { gestion478 } from "@/tests/fixtures/gestion-detalle-478";

/**
 * SLT-56 (T8; R16, R21) — EL DIÁLOGO «Ajustar pago».
 *
 * Lo que el servidor ya cubre (rol, alcance, estado del cierre, formato, igual al vigente,
 * desfase) vive en `tests/unit/services/cierres-admin-ajustar-pago.test.ts` y en la integración.
 * Aquí se afirma lo que sólo se ve montando la pantalla:
 *   1. que se pinta el pago vigente y que ESE es el `pagoAnterior` que viaja (R9);
 *   2. que el valor nuevo viaja como STRING, tal como se tecleó (R16);
 *   3. que sin valor o sin motivo no se puede pulsar ni viaja nada (R7/R21);
 *   4. cada desenlace del servidor, con su mensaje.
 *
 * Los textos esperados son LITERALES escritos a mano, nunca leídos de la constante que los pinta.
 */

vi.mock("@/lib/actions/cierres-admin", () => ({
  ajustarPagoMensajeroGestion: vi.fn(),
}));

const { successMock } = vi.hoisted(() => ({ successMock: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

const accionMock = vi.mocked(ajustarPagoMensajeroGestion);

const RECHAZO: CierreDetalleGestion = gestion478({
  gestionId: "11111111-1111-4111-8111-111111111111",
  resultado: "devolucion_a_origen_por_rechazo",
  numRemision: "REM-D1",
  destinatario: "Diana Devuelta",
  pagoMensajero: "0.00",
});

const ENTREGA: CierreDetalleGestion = gestion478({
  gestionId: "22222222-2222-4222-8222-222222222222",
  resultado: "entregado",
  numRemision: "REM-E1",
  destinatario: "Carla Entregada",
  pagoMensajero: "1500.00",
});

const AJUSTE = {
  creadoAt: "2026-10-29T14:30:00.000Z",
  actorNombre: "Marta Maestra",
  actorRol: "maestro" as const,
  pagoAnterior: "1500.00",
  pagoNuevo: "2000.50",
  motivo: "Entrega en zona lejana",
};

const BOTON_GUARDAR = "Guardar ajuste";

function renderDialogo(g: CierreDetalleGestion | null, onAjustado = vi.fn()) {
  render(
    <AjustarPagoMensajeroDialog gestion={g} onOpenChange={vi.fn()} onAjustado={onAjustado} />,
  );
  return { user: userEvent.setup(), onAjustado };
}

async function rellenar(
  user: ReturnType<typeof userEvent.setup>,
  valor: string,
  motivo: string,
) {
  if (valor) await user.type(screen.getByLabelText("Valor nuevo"), valor);
  if (motivo) await user.type(screen.getByLabelText("Motivo del ajuste"), motivo);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("SLT-56 R21 — el diálogo muestra el pago vigente y pide valor y motivo", () => {
  it("nombra la orden y pinta el pago vigente", () => {
    renderDialogo(ENTREGA);
    const dialogo = screen.getByRole("dialog", { name: "Ajustar el pago al mensajero" });
    expect(dialogo).toHaveTextContent("Orden REM-E1 · Carla Entregada");
    expect(dialogo).toHaveTextContent("Pago vigente₡1.500");
  });

  it("sin valor nuevo no se puede guardar y no viaja nada", async () => {
    const { user } = renderDialogo(ENTREGA);
    await rellenar(user, "", "Un motivo");
    expect(screen.getByRole("button", { name: BOTON_GUARDAR })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));
    expect(accionMock).not.toHaveBeenCalled();
  });

  it("R7 — sin motivo no se puede guardar y no viaja nada", async () => {
    const { user } = renderDialogo(ENTREGA);
    await rellenar(user, "2000", "");
    expect(screen.getByRole("button", { name: BOTON_GUARDAR })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));
    expect(accionMock).not.toHaveBeenCalled();
  });

  it("R7 — un motivo de solo espacios tampoco cuenta", async () => {
    const { user } = renderDialogo(ENTREGA);
    await rellenar(user, "2000", "    ");
    expect(screen.getByRole("button", { name: BOTON_GUARDAR })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));
    expect(accionMock).not.toHaveBeenCalled();
  });
});

describe("SLT-56 R9/R16 — lo que viaja", () => {
  it("envía pagoAnterior = el vigente pintado y el valor nuevo como STRING tal cual", async () => {
    accionMock.mockResolvedValue({ status: "conflict" });
    const { user } = renderDialogo(ENTREGA);
    await rellenar(user, "2000.50", "Entrega en zona lejana");
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));

    await waitFor(() => expect(accionMock).toHaveBeenCalledTimes(1));
    expect(accionMock.mock.calls[0]![0]).toEqual({
      gestionId: "22222222-2222-4222-8222-222222222222",
      pagoAnterior: "1500.00",
      pagoNuevo: "2000.50",
      motivo: "Entrega en zona lejana",
    });
  });

  it("R6 — también en un rechazo que hoy paga 0: el anterior viaja como «0.00»", async () => {
    accionMock.mockResolvedValue({ status: "conflict" });
    const { user } = renderDialogo(RECHAZO);
    await rellenar(user, "700", "Rechazo por dirección errónea de la tienda");
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));

    await waitFor(() => expect(accionMock).toHaveBeenCalledTimes(1));
    const enviado = accionMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(enviado.pagoAnterior).toBe("0.00");
    expect(enviado.pagoNuevo).toBe("700");
  });
});

describe("SLT-56 — cada desenlace del servidor", () => {
  it("ok: pinta lo que devolvió el servidor y avisa al padre con esos valores", async () => {
    accionMock.mockResolvedValue({
      status: "ok",
      gestionId: ENTREGA.gestionId,
      pagoMensajero: "2000.50",
      totalPagoMensajero: "3500.50",
      ajuste: AJUSTE,
    });
    const { user, onAjustado } = renderDialogo(ENTREGA);
    await rellenar(user, "2000.50", "Entrega en zona lejana");
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));

    await waitFor(() => expect(onAjustado).toHaveBeenCalledTimes(1));
    expect(onAjustado).toHaveBeenCalledWith({
      gestionId: ENTREGA.gestionId,
      pagoMensajero: "2000.50",
      totalPagoMensajero: "3500.50",
      ajuste: AJUSTE,
    });
    expect(successMock).toHaveBeenCalledWith("Pago al mensajero ajustado.");
    const dialogo = screen.getByRole("dialog", { name: "Ajustar el pago al mensajero" });
    expect(dialogo).toHaveTextContent("Pago de esta orden₡2.000,50");
    expect(dialogo).toHaveTextContent("Total de pago al mensajero del cierre₡3.500,50");
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeEnabled();
  });

  it("validation_error en el valor: el mensaje va junto al campo del valor", async () => {
    accionMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { pagoNuevo: ["El valor nuevo es igual al pago vigente."] },
    });
    const { user } = renderDialogo(ENTREGA);
    await rellenar(user, "1500", "Motivo");
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));

    const campo = screen.getByLabelText("Valor nuevo");
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveAccessibleDescription("El valor nuevo es igual al pago vigente.");
  });

  it("validation_error en el motivo: el mensaje va junto al motivo", async () => {
    accionMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { motivo: ["El motivo es obligatorio."] },
    });
    const { user } = renderDialogo(ENTREGA);
    await rellenar(user, "1800", "x");
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));

    const campo = screen.getByLabelText("Motivo del ajuste");
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveAccessibleDescription("El motivo es obligatorio.");
  });

  it.each([
    [
      "conflict",
      "El cierre dejó de estar abierto o el pago de esta orden cambió mientras ajustabas: recarga el detalle para ver el valor vigente.",
    ],
    ["no_encontrada", "Esta gestión ya no está disponible para ajustar."],
    ["forbidden", "No tienes permiso para ajustar el pago al mensajero."],
    ["unauthenticated", "Tu sesión expiró. Inicia sesión de nuevo."],
  ] as const)("%s: pinta su mensaje y no avisa al padre", async (status, mensaje) => {
    accionMock.mockResolvedValue({ status } as Awaited<
      ReturnType<typeof ajustarPagoMensajeroGestion>
    >);
    const { user, onAjustado } = renderDialogo(ENTREGA);
    await rellenar(user, "1800", "Motivo");
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));

    expect(await screen.findByRole("alert")).toHaveTextContent(mensaje);
    expect(onAjustado).not.toHaveBeenCalled();
  });

  it("un fallo inesperado pinta el mensaje genérico", async () => {
    accionMock.mockRejectedValue(new Error("boom"));
    const { user, onAjustado } = renderDialogo(ENTREGA);
    await rellenar(user, "1800", "Motivo");
    await user.click(screen.getByRole("button", { name: BOTON_GUARDAR }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo ajustar el pago. Inténtalo de nuevo.",
    );
    expect(onAjustado).not.toHaveBeenCalled();
  });
});
