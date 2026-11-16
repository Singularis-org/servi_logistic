// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HojaParadaMapa } from "@/app/(app)/mis-asignaciones/_components/HojaParadaMapa";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

// SLT-166 «PWA del mensajero: mapa de ruta» (R540, canvas v35: RepartoMapaCompleto) — la hoja
// inferior del marcador: los datos de la parada completos, «Navegar» abre la fila «Abrir en:» de hoy
// y «Gestionar» pasa por el MISMO «¿Gestionar esta orden?» de la tarjeta.

afterEach(cleanup);

// Datos largos y fijos (no leídos del componente): la hoja no recorta nada.
const DESTINATARIO = "Ana María Rodríguez Villalobosdelosangelesmontealto Sáenz";
const DIRECCION = "De la iglesia católica 300 metros al norte y 50 al oeste, casa esquinera de dos plantas con portón negro";

function orden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-0042",
    estatusValue: "en_reparto",
    destinatario: DESTINATARIO,
    telefonoDest: "88880000",
    direccion: DIRECCION,
    producto: "Caja mediana",
    peso: 1.5,
    montoCobrar: 12500,
    latitud: 9.93,
    longitud: -84.09,
    notas: null,
    tiendaNombre: "Tienda X",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 2,
    ...over,
  };
}

function montar(over: Partial<Parameters<typeof HojaParadaMapa>[0]> = {}) {
  const props = {
    orden: orden(),
    total: 5,
    onOpenChange: vi.fn(),
    gestionarDeshabilitado: false,
    onGestionar: vi.fn(),
    ...over,
  };
  render(<HojaParadaMapa {...props} />);
  return props;
}

describe("SLT-166 R540 — hoja inferior de la parada", () => {
  it("muestra número, remisión, destinatario, estado, dirección enteros y «Cobrar» con su monto", () => {
    montar();
    const hoja = screen.getByRole("dialog", { name: "Parada 2 de 5" });
    expect(within(hoja).getByText("REM-0042")).toBeInTheDocument();
    expect(within(hoja).getByText(DESTINATARIO)).toBeInTheDocument();
    expect(within(hoja).getByText("En reparto")).toBeInTheDocument();
    expect(within(hoja).getByText(DIRECCION)).toBeInTheDocument();
    expect(within(hoja).getByText("Cobrar")).toBeInTheDocument();
    expect(within(hoja).getByText(/12[\s.,  ]?500/)).toBeInTheDocument();
  });

  it("tiene asa de arrastre (44 px) que amplía y pliega la hoja", async () => {
    const user = userEvent.setup();
    montar();
    const asa = screen.getByRole("button", { name: "Arrastrar para ampliar la hoja" });
    expect(asa.className).toContain("h-11");
    expect(asa).toHaveAttribute("aria-expanded", "false");
    await user.click(asa);
    expect(asa).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toHaveAttribute("data-ampliada", "true");
  });

  it("«Navegar» abre la fila «Abrir en:» de hoy", async () => {
    const user = userEvent.setup();
    montar();
    expect(screen.queryByText("Abrir en:")).toBeNull();
    const navegar = screen.getByRole("button", { name: "Navegar" });
    expect(navegar.className).toContain("h-11");
    await user.click(navegar);
    expect(navegar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Abrir en:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir en Google Maps" })).toBeInTheDocument();
  });

  it("«Gestionar» pide «¿Gestionar esta orden?» y al aceptar avisa con la orden", async () => {
    const user = userEvent.setup();
    const props = montar();
    const gestionar = screen.getByRole("button", { name: "Gestionar la orden REM-0042" });
    expect(gestionar.className).toContain("h-11");
    await user.click(gestionar);
    const confirmar = screen.getByRole("dialog", { name: "¿Gestionar esta orden?" });
    expect(props.onGestionar).not.toHaveBeenCalled();
    await user.click(within(confirmar).getByRole("button", { name: "Aceptar" }));
    expect(props.onGestionar).toHaveBeenCalledWith(expect.objectContaining({ id: "o1" }));
  });

  it("con las condiciones que apagan la tarjeta, «Gestionar» también se apaga", () => {
    montar({ gestionarDeshabilitado: true });
    expect(screen.getByRole("button", { name: "Gestionar la orden REM-0042" })).toBeDisabled();
  });

  it("«Cerrar» (44 px) devuelve al mapa", async () => {
    const user = userEvent.setup();
    const props = montar();
    const cerrar = screen.getByRole("button", { name: "Cerrar" });
    expect(cerrar.className).toContain("size-11");
    await user.click(cerrar);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sin orden no hay hoja", () => {
    montar({ orden: null });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
