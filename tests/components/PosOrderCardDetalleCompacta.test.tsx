// @vitest-environment jsdom
// SLT-156 rebanada B (SLT-163, B5; R508) — la vista Detalle de Reparto es una tarjeta COMPACTA: una
// fila con la parada, la guía (arriba, en mono) y el destinatario debajo, y en columna fija a la
// derecha «Valor a cobrar» con el monto. Toda la fila es el disparador: al tocarla despliega la
// dirección completa y las acciones («Gestionar más tarde» / «Gestionar»).
//
// jsdom no aplica Tailwind: se afirman las clases. Los datos son largos a propósito y ninguno se
// recorta (R490); la medida en el navegador es del E2E de la rebanada (B8).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import { COLUMNA_FIJA, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import { formatMonto } from "@/lib/config/moneda";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// El modal de ubicación arrastra Leaflet vía `next/dynamic`; irrelevante aquí.
vi.mock("@/app/(app)/mis-asignaciones/_components/UbicacionMapa", () => ({ UbicacionMapa: () => null }));

const DESTINATARIO = "María Fernanda de los Ángeles Rodríguez VillalobosSinEspaciosNiPausasHastaElFinal";
const DIRECCION =
  "Del antiguo Higuerón de San Pedro 300 metros al este y 25 al oeste, casa esquinera color verde";

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-7731",
    estatusValue: "en_reparto",
    destinatario: DESTINATARIO,
    telefonoDest: "70001111",
    direccion: DIRECCION,
    producto: "Caja",
    peso: 1.2,
    montoCobrar: 99999999.99,
    latitud: 9.93,
    longitud: -84.08,
    notas: null,
    tiendaNombre: "Tienda Norte",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Montes de Oca",
    distritoNombre: "San Pedro",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 4,
    marcarLuego: false,
    intentosEntrega: 2,
    ...over,
  };
}

/** `Intl` usa espacio duro (U+00A0); testing-library normaliza el DOM, no el esperado. */
const norm = (texto: string) => texto.replace(/\s/g, " ");

function clases(el: Element): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/);
}

function montar(over: Partial<MiAsignacionDTO> = {}) {
  return render(
    <PosOrderCardDetalle
      orden={makeOrden(over)}
      total={9}
      compacta
      acciones={
        <div>
          <button type="button">Gestionar más tarde</button>
          <button type="button">Gestionar</button>
        </div>
      }
    />,
  );
}

afterEach(cleanup);

describe("SLT-156 R508 — tarjeta compacta de la vista Detalle", () => {
  it("la fila principal: parada, guía arriba en mono, destinatario debajo y «Valor a cobrar» en columna fija", () => {
    montar();
    const fila = screen.getByRole("button", { expanded: false });

    expect(within(fila).getByText("Parada 4 de 9")).toBeInTheDocument();
    const guia = within(fila).getByText("REM-7731");
    expect(clases(guia)).toContain("font-mono");
    const destinatario = within(fila).getByText(DESTINATARIO);
    // La guía va ARRIBA del destinatario.
    expect(guia.compareDocumentPosition(destinatario) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    // El destinatario se parte en líneas: nunca «…» (R490).
    for (const clase of TEXTO_ENTERO.split(" ")) expect(clases(destinatario)).toContain(clase);
    expect(clases(destinatario)).not.toContain("truncate");

    expect(within(fila).getByText("Valor a cobrar")).toBeInTheDocument();
    const monto = within(fila).getByText(norm(formatMonto(99999999.99)));
    for (const clase of COLUMNA_FIJA.split(" ")) expect(clases(monto)).toContain(clase);
    expect(clases(monto)).toContain("text-right");
  });

  it("plegada no muestra dirección ni acciones; al tocar la fila las despliega enteras", async () => {
    const user = userEvent.setup();
    montar();

    expect(screen.queryByText(new RegExp(DIRECCION))).toBeNull();
    expect(screen.queryByRole("button", { name: "Gestionar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Gestionar más tarde" })).toBeNull();

    await user.click(screen.getByRole("button", { expanded: false }));

    const fila = screen.getByRole("button", { expanded: true });
    const despliegue = document.getElementById(fila.getAttribute("aria-controls") ?? "");
    expect(despliegue).not.toBeNull();
    const direccion = within(despliegue!).getByText(new RegExp(DIRECCION));
    expect(clases(direccion)).not.toContain("truncate");
    expect(within(despliegue!).getByRole("button", { name: "Gestionar más tarde" })).toBeInTheDocument();
    expect(within(despliegue!).getByRole("button", { name: "Gestionar" })).toBeInTheDocument();
    // Intentos y marcas no se esconden: van en el despliegue, en líneas propias.
    expect(within(despliegue!).getByText("Intentos: 2")).toBeInTheDocument();

    // Volver a tocar la fila la pliega.
    await user.click(fila);
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar" })).toBeNull();
  });

  it("sin `compacta`, la fila de siempre: nada se pliega (Novedades y las demás pantallas no cambian)", () => {
    render(<PosOrderCardDetalle orden={makeOrden()} total={9} acciones={<button type="button">Gestionar</button>} />);
    // Sin fila-disparador: ningún botón lleva la guía en su nombre.
    expect(screen.queryByRole("button", { name: /REM-7731/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Gestionar" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(DIRECCION))).toBeInTheDocument();
  });
});
