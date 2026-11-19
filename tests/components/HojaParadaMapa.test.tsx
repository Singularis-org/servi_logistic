// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";
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
    const hoja = screen.getByRole("dialog", { name: "Parada 2" });
    expect(within(hoja).getByText("REM-0042")).toBeInTheDocument();
    expect(within(hoja).getByText(DESTINATARIO)).toBeInTheDocument();
    expect(within(hoja).getByText("En reparto")).toBeInTheDocument();
    expect(within(hoja).getByText(`Central · Carmen — ${DIRECCION}`)).toBeInTheDocument();
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

  it("sin orden no hay hoja", () => {
    montar({ orden: null });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("SLT-192 R887 — cabecera en una fila: número · remisión · destinatario · estado", () => {
  it("los cuatro datos van en una fila que se parte sin recortar, en ese orden", () => {
    montar();
    const cabecera = screen.getByTestId("hoja-parada-cabecera");
    expect(cabecera.className).toContain("flex-wrap");

    const numero = within(cabecera).getByText("2");
    const remision = within(cabecera).getByText("REM-0042");
    const destinatario = within(cabecera).getByText(DESTINATARIO);
    const estado = within(cabecera).getByText("En reparto");
    const sigue = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(sigue(numero, remision)).toBe(true);
    expect(sigue(remision, destinatario)).toBe(true);
    expect(sigue(destinatario, estado)).toBe(true);

    // La remisión en mono; ningún dato con recorte (`truncate`).
    expect(remision.className).toContain("font-mono");
    expect(cabecera.innerHTML).not.toContain("truncate");
  });

  it("no muestra «Parada {n} de {total}»", () => {
    montar();
    expect(screen.queryByText(/Parada 2 de/)).toBeNull();
    expect(screen.getByRole("dialog").textContent).not.toMatch(/Parada \d+ de \d+/);
  });

  it("sin posición en la ruta, el número es «·»", () => {
    montar({ orden: orden({ secuenciaRuta: null }) });
    expect(within(screen.getByTestId("hoja-parada-cabecera")).getByText("·")).toBeInTheDocument();
  });
});

describe("SLT-192 R888 — dirección «Cantón · Distrito — dirección»", () => {
  it("con las tres partes", () => {
    montar();
    expect(screen.getByText(`Central · Carmen — ${DIRECCION}`)).toBeInTheDocument();
  });

  it("sin cantón ni distrito, solo la dirección y sin separador sobrante", () => {
    montar({ orden: orden({ cantonNombre: "", distritoNombre: null }) });
    expect(screen.getByText(DIRECCION)).toBeInTheDocument();
    expect(screen.queryByText(/—/)).toBeNull();
  });

  it("sin dirección, solo «Cantón · Distrito»", () => {
    montar({ orden: orden({ direccion: null }) });
    expect(screen.getByText("Central · Carmen")).toBeInTheDocument();
  });

  it("sin ninguna de las tres, «Sin dirección»", () => {
    montar({ orden: orden({ direccion: null, cantonNombre: "", distritoNombre: null }) });
    expect(screen.getByText("Sin dirección")).toBeInTheDocument();
  });
});

describe("SLT-192 R889 — la hoja no tiene «Cerrar»: se cierra con Escape o el asa", () => {
  it("no hay botón «Cerrar»", () => {
    montar();
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
  });

  it("Escape la cierra (`onOpenChange(false)`)", async () => {
    const user = userEvent.setup();
    const props = montar();
    await user.keyboard("{Escape}");
    // La `Sheet` puede pasar un segundo argumento (detalles del evento): lo que cuenta es el `false`.
    expect(props.onOpenChange).toHaveBeenCalled();
    expect(vi.mocked(props.onOpenChange).mock.calls.at(-1)?.[0]).toBe(false);
  });

  it("arrastrar el asa hacia abajo con la hoja plegada la cierra", () => {
    const props = montar();
    const asa = screen.getByRole("button", { name: "Arrastrar para ampliar la hoja" });
    fireEvent.pointerDown(asa, { clientY: 100 });
    fireEvent.pointerUp(asa, { clientY: 200 });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("SLT-192 R890 — nombre accesible «Parada {n}»", () => {
  it("con posición, «Parada 2»", () => {
    montar();
    expect(screen.getByRole("dialog", { name: "Parada 2" })).toBeInTheDocument();
  });

  it("sin posición, «Parada sin posición»", () => {
    montar({ orden: orden({ secuenciaRuta: null }) });
    expect(screen.getByRole("dialog", { name: "Parada sin posición" })).toBeInTheDocument();
  });
});
