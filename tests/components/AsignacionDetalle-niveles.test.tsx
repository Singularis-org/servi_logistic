// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { AsignacionDetalle } from "@/app/(app)/mis-asignaciones/_components/AsignacionDetalle";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import { EtiquetasGeograficasProvider, NivelesGeograficosProvider } from "@/providers/EtiquetasGeograficasProvider";
import { ETIQUETAS_CR, NIVELES_CR, NIVELES_XA } from "@/tests/fabricas/etiquetas-geograficas";

// SLT-125 (design §5 fila «Detalle de asignación»; R12, R15, P7) — el detalle de asignación del mensajero:
// bajo la dirección, la línea de R11 con su orden y separador de hoy (el lugar más hondo primero, «, »), y
// un campo por nivel del país, de 1 a P, rotulado con el tipo del nivel y con «—» cuando la ruta de la
// orden no llega a él (maqueta aprobada). Países de 2, 3 (Costa Rica) y 4 niveles; los textos de Costa
// Rica son los de hoy, literales.

afterEach(() => cleanup());

const NIVELES_2: NivelDeFiltroDTO[] = [
  { profundidad: 1, singular: "Departamento", plural: "Departamentos" },
  { profundidad: 2, singular: "Municipio", plural: "Municipios" },
];

const ruta = (...nombres: string[]) => nombres.map((nombre, i) => ({ id: `n-${i + 1}`, nombre }));

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-1",
    estatusValue: "en_reparto",
    destinatario: "Ana",
    telefonoDest: "70001111",
    direccion: "200m sur de la iglesia",
    producto: "Caja",
    peso: 1.2,
    montoCobrar: 25000,
    latitud: 9.93,
    longitud: -84.08,
    notas: null,
    tiendaNombre: "Tienda Norte",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 1,
    marcarLuego: false,
    intentosEntrega: 0,
    ...over,
  };
}

function conPais(niveles: readonly NivelDeFiltroDTO[]) {
  return function Envoltorio({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <EtiquetasGeograficasProvider etiquetas={ETIQUETAS_CR}>
        <NivelesGeograficosProvider niveles={niveles}>{children}</NivelesGeograficosProvider>
      </EtiquetasGeograficasProvider>
    );
  };
}

/** Los campos de lugar del detalle, en orden: [rótulo, valor]. Es la lista de definición tras la dirección. */
function camposDeLugar(): [string, string][] {
  const direccion = screen.getByText(/200m sur de la iglesia|Calle 30 #12|Av\. Libertad 99/);
  const bloque = direccion.closest("div.mb-4");
  const dl = bloque?.nextElementSibling;
  expect(dl?.tagName).toBe("DL");
  return [...(dl as HTMLElement).querySelectorAll("dt")].map((dt) => [
    dt.textContent ?? "",
    dt.nextElementSibling?.textContent ?? "",
  ]);
}

/** La línea bajo la dirección (R11 con el orden de hoy del detalle). */
function lineaBajoLaDireccion(): string | null | undefined {
  const direccion = screen.getByText(/200m sur de la iglesia|Calle 30 #12|Av\. Libertad 99/);
  return direccion.nextElementSibling?.textContent;
}

describe("R12 — un campo por nivel del país, rotulado con su tipo", () => {
  it("país de 2 niveles: dos campos y la línea «Municipio, Departamento»", () => {
    const orden = makeOrden({
      direccion: "Calle 30 #12",
      provinciaNombre: "Bolívar",
      cantonNombre: "Cartagena",
      distritoNombre: null,
      lugarRuta: ruta("Bolívar", "Cartagena"),
    });
    render(<AsignacionDetalle orden={orden} />, { wrapper: conPais(NIVELES_2) });
    expect(lineaBajoLaDireccion()).toBe("Cartagena, Bolívar");
    expect(camposDeLugar()).toEqual([
      ["Departamento", "Bolívar"],
      ["Municipio", "Cartagena"],
    ]);
  });

  it("país de 4 niveles: cuatro campos; el nivel 4, al que la ruta no llega, con «—»", () => {
    const orden = makeOrden({
      direccion: "Av. Libertad 99",
      provinciaNombre: "Costa",
      cantonNombre: "Litoral",
      distritoNombre: "Viña",
      lugarRuta: ruta("Costa", "Litoral", "Viña"),
    });
    render(<AsignacionDetalle orden={orden} />, { wrapper: conPais(NIVELES_XA) });
    expect(lineaBajoLaDireccion()).toBe("Viña, Litoral");
    expect(camposDeLugar()).toEqual([
      ["Región", "Costa"],
      ["Provincia", "Litoral"],
      ["Comuna", "Viña"],
      ["Barrio", "—"],
    ]);
  });

  it("teléfono primero: con 4 niveles, dos campos por fila", () => {
    const orden = makeOrden({ direccion: "Av. Libertad 99", lugarRuta: ruta("Costa", "Litoral", "Viña") });
    render(<AsignacionDetalle orden={orden} />, { wrapper: conPais(NIVELES_XA) });
    const dl = screen.getByText("Barrio").closest("dl");
    expect(dl?.className).toContain("grid-cols-2");
  });

  it("cada campo es una pareja <dt>/<dd> accesible", () => {
    const orden = makeOrden({ lugarRuta: ruta("Costa", "Litoral") });
    render(<AsignacionDetalle orden={orden} />, { wrapper: conPais(NIVELES_XA) });
    const tipo = screen.getByText("Comuna");
    expect(tipo.tagName).toBe("DT");
    expect(tipo.nextElementSibling?.tagName).toBe("DD");
    expect(tipo.nextElementSibling).toHaveTextContent("—");
  });
});

describe("R15 / P7 — Costa Rica, igual que hoy", () => {
  it("con distrito: «San Rafael, Escazú» y los tres campos de hoy, en una fila de tres", () => {
    const orden = makeOrden({ lugarRuta: ruta("San José", "Escazú", "San Rafael") });
    render(<AsignacionDetalle orden={orden} />, { wrapper: conPais(NIVELES_CR) });
    expect(lineaBajoLaDireccion()).toBe("San Rafael, Escazú");
    expect(camposDeLugar()).toEqual([
      ["Provincia", "San José"],
      ["Cantón", "Escazú"],
      ["Distrito", "San Rafael"],
    ]);
    expect(screen.getByText("Distrito").closest("dl")?.className).toContain("grid-cols-3");
  });

  it("sin distrito: solo «Escazú» y el distrito con «—»", () => {
    const orden = makeOrden({ distritoNombre: null, lugarRuta: ruta("San José", "Escazú") });
    render(<AsignacionDetalle orden={orden} />, { wrapper: conPais(NIVELES_CR) });
    expect(lineaBajoLaDireccion()).toBe("Escazú");
    expect(camposDeLugar()).toEqual([
      ["Provincia", "San José"],
      ["Cantón", "Escazú"],
      ["Distrito", "—"],
    ]);
  });

  it("sin niveles del país o sin `lugarRuta`: los campos de hoy con las etiquetas", () => {
    render(<AsignacionDetalle orden={makeOrden()} />, { wrapper: conPais(NIVELES_CR) });
    expect(lineaBajoLaDireccion()).toBe("San Rafael, Escazú");
    expect(camposDeLugar()).toEqual([
      ["Provincia", "San José"],
      ["Cantón", "Escazú"],
      ["Distrito", "San Rafael"],
    ]);
    cleanup();

    const conRuta = makeOrden({ lugarRuta: ruta("Costa", "Litoral", "Viña", "Puerto") });
    render(<AsignacionDetalle orden={conRuta} />, { wrapper: conPais([]) });
    expect(camposDeLugar()).toEqual([
      ["Provincia", "San José"],
      ["Cantón", "Escazú"],
      ["Distrito", "San Rafael"],
    ]);
  });
});
