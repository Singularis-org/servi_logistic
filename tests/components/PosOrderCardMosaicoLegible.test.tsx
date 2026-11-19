// @vitest-environment jsdom
// SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview» (punto 3) — la tarjeta
// de Mosaico se leía con lupa en el teléfono: guía en mono de 12 px y textos de 9-11 px («Sin
// posición», producto, «Intentos», «COBRAR», «VER DETALLE COMPLETO», chips). Carlos aprobó subirlos:
// lo secundario a 12 px como mínimo (`text-xs`) y lo principal a 14 px (`text-sm`), con las clases
// de la escala que ya usa la PWA. La estructura no cambia.
//
// jsdom no aplica Tailwind: se afirman las clases.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PosOrderCardMosaico } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// El modal de ubicación arrastra Leaflet vía `next/dynamic`; irrelevante para los tamaños.
vi.mock("@/app/(app)/mis-asignaciones/_components/UbicacionMapa", () => ({ UbicacionMapa: () => null }));

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-QX-7",
    estatusValue: "en_reparto",
    destinatario: "Ana Lucía Vargas",
    telefonoDest: "70001111",
    direccion: "100 m norte de la iglesia",
    producto: "Caja de prueba",
    peso: null,
    montoCobrar: 5000,
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
    secuenciaRuta: null,
    marcarLuego: false,
    intentosEntrega: 0,
    ...over,
  };
}

afterEach(cleanup);

const clases = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

/** Píxeles de una clase de tamaño de texto de Tailwind, o `null` si la clase no es de tamaño. */
function px(clase: string): number | null {
  const fijo: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
  const m = /^text-(xs|sm|base|lg|xl|\[(\d+(?:\.\d+)?)(px|rem)\])$/.exec(clase);
  if (!m) return null;
  if (m[2]) return m[3] === "rem" ? Number(m[2]) * 16 : Number(m[2]);
  return fijo[m[1]!] ?? null;
}

/**
 * Tamaño efectivo de un elemento en un ancho: el de la variante (`max-md:` en el móvil, `md:` desde
 * md) si la hay, si no el de la clase base. jsdom no aplica Tailwind: se leen las clases.
 */
function tamano(el: Element, ancho: "movil" | "escritorio"): number | null {
  const variante = ancho === "movil" ? "max-md:" : "md:";
  const lista = clases(el);
  for (const c of [...lista].reverse()) {
    if (c.startsWith(variante) && px(c.slice(variante.length)) !== null) return px(c.slice(variante.length));
  }
  for (const c of [...lista].reverse()) if (px(c) !== null) return px(c);
  return null;
}

function montar() {
  return render(<PosOrderCardMosaico orden={makeOrden()} total={3} />);
}

describe("SLT-200 — Mosaico legible en el móvil (por debajo de md)", () => {
  it("ningún texto de la tarjeta queda por debajo de 12 px en el móvil", () => {
    const { container } = montar();
    const articulo = container.querySelector("article")!;
    const pequenos = Array.from(articulo.querySelectorAll("*"))
      .filter((el) => {
        const t = tamano(el, "movil");
        return t !== null && t < 12;
      })
      .map((el) => `${el.tagName.toLowerCase()} «${(el.textContent ?? "").trim().slice(0, 25)}» ${tamano(el, "movil")}px`);
    expect(pequenos).toEqual([]);
  });

  it("en el móvil la guía va a 14 px y sin mono", () => {
    montar();
    const guia = clases(screen.getByText("REM-QX-7"));
    expect(guia).toEqual(expect.arrayContaining(["max-md:text-sm", "max-md:font-sans"]));
    expect(tamano(screen.getByText("REM-QX-7"), "movil")).toBe(14);
  });

  it("en el móvil «Sin posición», producto, «Intentos», «Cobrar» y «Ver detalle completo» van a 12 px como mínimo", () => {
    montar();
    const sinPosicion = screen.getByText(/Sin posición/);
    const producto = screen.getAllByText("Caja de prueba")[0]!.closest("p")!;
    const intentos = screen.getAllByText(/Intentos/)[0]!.closest("p")!;
    const cobrar = screen.getByText("Cobrar");
    const detalle = screen.getByRole("button", { name: /Ver detalle completo/ });
    for (const el of [sinPosicion, producto, intentos, cobrar, detalle]) {
      expect(tamano(el, "movil"), (el.textContent ?? "").slice(0, 30)).toBeGreaterThanOrEqual(12);
    }
    // El producto deja la mono en el móvil: en 12 px se leía peor que la sans del resto.
    expect(clases(producto)).toContain("max-md:font-sans");
  });

  it("el destinatario y el monto siguen siendo lo principal, a 14 px", () => {
    montar();
    expect(clases(screen.getAllByText("Ana Lucía Vargas")[0]!)).toContain("text-sm");
    const monto = screen.getByText("Cobrar").parentElement!.lastElementChild!;
    expect(clases(monto)).toContain("text-sm");
  });
});

// Regla de Carlos: escritorio = prod. Desde md la tarjeta conserva los tamaños de dev (`8dad4167`),
// también en Novedades, que es pantalla de oficina. Los valores van escritos a mano: son el contrato.
describe("SLT-200 — desde md, la tarjeta Mosaico como antes", () => {
  it("la guía, en mono de 12 px", () => {
    montar();
    const guia = screen.getByText("REM-QX-7");
    expect(clases(guia)).toEqual(expect.arrayContaining(["font-mono", "text-xs"]));
    expect(tamano(guia, "escritorio")).toBe(12);
  });

  it("«Sin posición», producto, «Intentos», chip, «Cobrar» y «Ver detalle completo», con sus 10-11 px", () => {
    montar();
    const casos: [Element, number][] = [
      [screen.getByText(/Sin posición/), 11],
      [screen.getAllByText("Caja de prueba")[0]!.closest("p")!, 11],
      [screen.getAllByText(/Intentos/)[0]!.closest("p")!, 11],
      [screen.getByText("Cobrar"), 10],
      [screen.getByRole("button", { name: /Ver detalle completo/ }), 10],
    ];
    for (const [el, esperado] of casos) {
      expect(tamano(el, "escritorio"), (el.textContent ?? "").slice(0, 30)).toBe(esperado);
    }
    expect(clases(screen.getAllByText("Caja de prueba")[0]!.closest("p")!)).toContain("font-mono");
  });

  it("ninguna clase `md:` cambia el tamaño, y el icono del producto sigue en `size-3`", () => {
    const { container } = montar();
    const articulo = container.querySelector("article")!;
    const conMd = Array.from(articulo.querySelectorAll("*")).flatMap((el) =>
      clases(el).filter((c) => c.startsWith("md:") && px(c.slice(3)) !== null),
    );
    expect(conMd).toEqual([]);
    const icono = screen.getAllByText("Caja de prueba")[0]!.closest("p")!.querySelector("svg")!;
    expect(clases(icono)).toEqual(expect.arrayContaining(["size-3", "max-md:size-3.5"]));
  });
});

// SLT-200 (CI del #226): con los chips más grandes, la columna de los chips (`shrink-0`) estrujaba la de
// la guía (`min-w-0`) hasta 0 px y la guía quedaba oculta en «Recoger en bodega». En el móvil (donde los
// chips van a 12 px) la cabecera envuelve; desde md los chips vuelven a 10 px y queda como en dev (m6):
// si los chips no caben, bajan de línea y la guía conserva su ancho. La medida es del E2E
// `mis-asignaciones` (la guía visible en «Recoger en bodega»).
describe("SLT-200 — la guía no se queda sin ancho por los chips", () => {
  it("en el móvil la cabecera envuelve (`max-md:flex-wrap`) en vez de estrujar la guía", () => {
    const { container } = montar();
    const cabecera = container.querySelector("article > header")!;
    expect(clases(cabecera)).toEqual(expect.arrayContaining(["flex", "max-md:flex-wrap"]));
    // Un solo nodo con la guía en la cabecera.
    expect(Array.from(cabecera.querySelectorAll("p")).filter((p) => p.textContent === "REM-QX-7")).toHaveLength(1);
  });
});

// SLT-200 (review m7): el resto de textos secundarios, contra sus clases de dev (`8dad4167`), escritas a
// mano. Desde md manda la clase base (no hay `md:` de tamaño); el móvil, `max-md:text-xs`.
describe("SLT-200 — desde md: chip, insignia, dirección, mensajero y aviso como en dev", () => {
  function montarCompleta() {
    return render(
      <PosOrderCardMosaico
        orden={makeOrden({ secuenciaRuta: 2, esParaManana: true, fechaRepartoISO: null })}
        total={3}
        mensajero="Pedro Mora"
      />,
    );
  }

  it("cada uno conserva su tamaño de dev desde md y sube a 12 px en el móvil", () => {
    const { container } = montarCompleta();
    const cabecera = container.querySelector("article > header")!;
    const casos: [string, Element, string, number][] = [
      ["chip de estado", cabecera.querySelector("[class*='rounded-full'][class*='px-2']")!, "text-[10px]", 10],
      ["insignia de parada", cabecera.querySelector("span.size-6")!, "text-[11px]", 11],
      ["dirección", screen.getAllByText("100 m norte de la iglesia")[0]!, "text-[0.6875rem]", 11],
      ["mensajero", screen.getAllByText(/Pedro Mora/)[0]!, "text-[11px]", 11],
      ["aviso de reserva", screen.getByRole("note"), "text-[11px]", 11],
    ];
    for (const [nombre, el, claseDev, pxDev] of casos) {
      expect(el, nombre).toBeTruthy();
      expect(clases(el), nombre).toEqual(expect.arrayContaining([claseDev, "max-md:text-xs"]));
      expect(tamano(el, "escritorio"), nombre).toBe(pxDev);
      expect(tamano(el, "movil"), nombre).toBe(12);
    }
  });

  it("la cabecera solo envuelve en el móvil (`max-md:flex-wrap`); desde md, como en dev", () => {
    const { container } = montarCompleta();
    const cabecera = clases(container.querySelector("article > header")!);
    expect(cabecera).toContain("max-md:flex-wrap");
    expect(cabecera).not.toContain("flex-wrap");
  });
});
