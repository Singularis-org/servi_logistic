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
import type { ReactNode } from "react";

import {
  CLASE_INFO_TACTIL,
  PosOrderCardDetalle,
} from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
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

// SLT-189 «Reparto del mensajero según el canvas» — la fila de REPARTO (`filaReparto`). La guía y la
// remisión del fixture difieren a propósito (1001 / REM-7731): una fila que volviera a la remisión
// se ve. Los literales van escritos a mano, no derivados del componente.
function montarReparto(over: Partial<MiAsignacionDTO> = {}, fila: "direccion" | "tienda" = "direccion") {
  return render(
    <PosOrderCardDetalle
      orden={makeOrden(over)}
      total={9}
      compacta
      filaReparto={fila}
      acciones={
        <div>
          <button type="button">Gestionar más tarde</button>
          <button type="button">Gestionar</button>
        </div>
      }
    />,
  );
}

describe("SLT-189 — fila compacta de Reparto", () => {
  it("R790: arriba la guía en mono y no la remisión", () => {
    montarReparto();
    const fila = screen.getByRole("button", { expanded: false });
    const guia = within(fila).getByText("1001");
    expect(clases(guia)).toContain("font-mono");
    expect(within(fila).queryByText(/REM-7731/)).toBeNull();
  });

  it("R791: sin guía, la remisión ocupa su sitio", () => {
    montarReparto({ numGuia: null });
    const fila = screen.getByRole("button", { expanded: false });
    const sitio = within(fila).getByText("REM-7731");
    expect(clases(sitio)).toContain("font-mono");
  });

  it("R792: debajo «destinatario · dirección» entero; sin dirección, el nombre solo sin « · »", () => {
    montarReparto();
    const fila = screen.getByRole("button", { expanded: false });
    const linea = within(fila).getByText(
      "María Fernanda de los Ángeles Rodríguez VillalobosSinEspaciosNiPausasHastaElFinal · Del antiguo Higuerón de San Pedro 300 metros al este y 25 al oeste, casa esquinera color verde",
    );
    for (const clase of TEXTO_ENTERO.split(" ")) expect(clases(linea)).toContain(clase);
    expect(clases(linea)).not.toContain("truncate");
    const guia = within(fila).getByText("1001");
    expect(guia.compareDocumentPosition(linea) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    cleanup();

    montarReparto({ direccion: null });
    const sinDireccion = screen.getByRole("button", { expanded: false });
    expect(within(sinDireccion).getByText(DESTINATARIO)).toBeInTheDocument();
    expect(within(sinDireccion).queryByText(/ · /)).toBeNull();
  });

  it("R800 (fila): con `tienda`, debajo «destinatario · tienda»", () => {
    montarReparto({}, "tienda");
    const fila = screen.getByRole("button", { expanded: false });
    expect(within(fila).getByText(`${DESTINATARIO} · Tienda Norte`)).toBeInTheDocument();
    expect(within(fila).getByText("1001")).toBeInTheDocument();
  });

  it("R793: plegada sin «Gestionar»; al tocarla despliega lo de hoy (estado, ubicación con navegar, intentos y acciones)", async () => {
    const user = userEvent.setup();
    montarReparto();
    expect(screen.queryByRole("button", { name: "Gestionar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Gestionar más tarde" })).toBeNull();

    await user.click(screen.getByRole("button", { expanded: false }));
    const fila = screen.getByRole("button", { expanded: true });
    const despliegue = document.getElementById(fila.getAttribute("aria-controls") ?? "")!;
    expect(
      within(despliegue).getByText(
        "Montes de Oca · San Pedro — Del antiguo Higuerón de San Pedro 300 metros al este y 25 al oeste, casa esquinera color verde",
      ),
    ).toBeInTheDocument();
    expect(
      within(despliegue).getByRole("button", { name: `Ver en el mapa la ubicación de ${DESTINATARIO}` }),
    ).toBeInTheDocument();
    expect(within(despliegue).getByText("Intentos: 2")).toBeInTheDocument();
    expect(within(despliegue).getByRole("button", { name: "Gestionar más tarde" })).toBeInTheDocument();
    expect(within(despliegue).getByRole("button", { name: "Gestionar" })).toBeInTheDocument();
  });

  it("R794: sin `filaReparto` (Recoger, Recolección) la fila sigue con la remisión y el destinatario solo", () => {
    montar();
    const fila = screen.getByRole("button", { expanded: false });
    expect(within(fila).getByText("REM-7731")).toBeInTheDocument();
    expect(within(fila).queryByText("1001")).toBeNull();
    expect(within(fila).getByText(DESTINATARIO)).toBeInTheDocument();
    expect(within(fila).queryByText(/ · /)).toBeNull();
  });
});

// SLT-190 «Recoger y Recolección según el canvas» (R862-R866, DS5, DS6) — fila plegada de
// Recolección: número, remisión, destinatario, la tienda (solo su nombre, P3), el nombre VIGENTE
// del estado en texto y «Valor a cobrar»; en «Recogidos hoy», « · Recogido a las {hora}».
function montarRecoleccion(sufijo?: ReactNode, over: Partial<MiAsignacionDTO> = {}) {
  return render(
    <PosOrderCardDetalle
      orden={makeOrden({ estatusValue: "recolectando", secuenciaRuta: null, ...over })}
      total={2}
      mostrarRuta={false}
      posicion={1}
      filaRecoleccion={sufijo === undefined ? {} : { sufijo }}
      compacta
    />,
  );
}

describe("SLT-190 — fila plegada de Recolección", () => {
  it("R862: número, remisión, destinatario, tienda, estado vigente y «Valor a cobrar», enteros", () => {
    montarRecoleccion();
    const fila = screen.getByRole("button", { expanded: false, name: /REM-7731/ });
    expect(within(fila).getByText("Orden 1 de 2")).toBeInTheDocument();
    expect(within(fila).getByText("REM-7731")).toBeInTheDocument();
    expect(within(fila).getByText(DESTINATARIO)).toBeInTheDocument();
    const tienda = within(fila).getByText("Tienda Norte");
    for (const clase of TEXTO_ENTERO.split(" ")) expect(clases(tienda)).toContain(clase);
    expect(clases(tienda)).not.toContain("truncate");
    // El nombre del catálogo para `recolectando`, en texto, en la fila plegada pero FUERA del botón
    // (B1: su (i) es hermano, y un botón no anida otro).
    const tarjeta = fila.closest("article")!;
    const estado = within(tarjeta).getByText("Recolectando");
    expect(fila.contains(estado)).toBe(false);
    expect(within(fila).queryAllByRole("button")).toHaveLength(0);
    expect(within(fila).getByText("Valor a cobrar")).toBeInTheDocument();
    const monto = within(fila).getByText(norm(formatMonto(99999999.99)));
    expect(clases(monto)).toEqual(expect.arrayContaining(COLUMNA_FIJA.split(" ")));
  });

  it("R863: con sufijo, la línea de la tienda termina en « · Recogido a las {hora}»", () => {
    montarRecoleccion(<>Recogido a las <time>10:42</time></>);
    const fila = screen.getByRole("button", { expanded: false, name: /REM-7731/ });
    const linea = within(fila).getByText((_, el) => el?.textContent === "Tienda Norte · Recogido a las 10:42");
    expect(linea.tagName).toBe("SPAN");
  });

  it("R864: el estado plegado nunca es «Por recolectar», «Recolectada» ni «Recolectado»", () => {
    montarRecoleccion();
    const fila = screen.getByRole("button", { expanded: false, name: /REM-7731/ });
    expect(fila.closest("article")!.textContent).not.toMatch(/Por recolectar|Recolectada|Recolectado/);
  });

  it("R864 (B1, decisión de Carlos 2026-11-17): el (i) del estado se ve sin desplegar, fuera del botón de la fila, con 44 px, y tocarlo no despliega", async () => {
    const user = userEvent.setup();
    montarRecoleccion();
    const fila = screen.getByRole("button", { expanded: false, name: /REM-7731/ });
    const info = screen.getByRole("button", { name: "Qué significa «Recolectando»" });
    expect(fila.contains(info)).toBe(false);
    expect(fila.closest("article")!.contains(info)).toBe(true);
    // Hermano del texto del estado (mismo contenedor), no del chip del despliegue.
    expect(info.parentElement!.textContent).toBe("Recolectando");
    // Área táctil: el pseudo-elemento del botón crece a 44 × 44 (jsdom no aplica Tailwind).
    expect(info.parentElement!.classList.contains(CLASE_INFO_TACTIL)).toBe(true);
    expect(CLASE_INFO_TACTIL).toBe("[&_button]:after:-inset-3.5");
    await user.click(info);
    expect(fila).toHaveAttribute("aria-expanded", "false");
    expect(fila).not.toHaveAttribute("aria-controls");
    // El toque abrió la explicación del (i), no el despliegue (sin «Intentos», que solo vive ahí).
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("Intentos: 2")).toBeNull();
  });

  it("R865: al desplegar sigue el chip con su información; el sufijo no se repite", async () => {
    const user = userEvent.setup();
    montarRecoleccion(<>Recogido a las <time>10:42</time></>);
    await user.click(screen.getByRole("button", { expanded: false, name: /REM-7731/ }));
    const fila = screen.getByRole("button", { expanded: true });
    const despliegue = document.getElementById(fila.getAttribute("aria-controls") ?? "")!;
    expect(within(despliegue).getByRole("button", { name: "Qué significa «Recolectando»" })).toBeInTheDocument();
    expect(within(despliegue).getByText("Intentos: 2")).toBeInTheDocument();
    expect(within(despliegue).queryByText(/Recogido a las/)).toBeNull();
    expect(screen.getAllByText(/Recogido a las/)).toHaveLength(1);
  });

  it("R866: sin `filaRecoleccion` (Recoger) la fila sigue con remisión y destinatario, sin tienda ni estado", () => {
    render(
      <PosOrderCardDetalle
        orden={makeOrden({ estatusValue: "recolectando", secuenciaRuta: null })}
        total={2}
        mostrarRuta={false}
        posicion={1}
        compacta
      />,
    );
    const fila = screen.getByRole("button", { expanded: false, name: /REM-7731/ });
    expect(within(fila).getByText("REM-7731")).toBeInTheDocument();
    expect(within(fila).getByText(DESTINATARIO)).toBeInTheDocument();
    expect(within(fila).queryByText("Tienda Norte")).toBeNull();
    expect(within(fila).queryByText("Recolectando")).toBeNull();
    expect(screen.queryByRole("button", { name: /Qué significa/ })).toBeNull();
  });
});
