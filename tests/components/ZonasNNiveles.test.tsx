// @vitest-environment jsdom
// SLT-48 (R45; reglas 5 y la sección 4 de la maqueta aprobada) — EL SELECTOR DE ZONAS EN UN PAÍS DE N NIVELES.
//
// El árbol llega hasta P con los tipos del país. El buscador nombra los 3 primeros tipos y luego «…»; el
// resumen cuenta los lugares del ÚLTIMO nivel del país (en Costa Rica, los distritos, como hoy).
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GeografiaSelector } from "@/app/(app)/configuracion/zonas/_components/GeografiaSelector";
import {
  lugaresDelNivelBajo,
  profundidadDelUltimoNivel,
} from "@/app/(app)/configuracion/zonas/_components/seleccion-de-zona";
import type { ArbolDeZonasDTO, NodoDeZonasDTO } from "@/lib/types/geografia-nodo";

afterEach(cleanup);

function tipos(...nombres: string[]): ArbolDeZonasDTO["tipos"] {
  return nombres.map((t, i) => {
    const [nombreSingular, nombrePlural] = t.split("/") as [string, string];
    return { profundidad: i + 1, nombreSingular, nombrePlural };
  });
}

function nodo(id: string, nombre: string, profundidad: number, hijos: NodoDeZonasDTO[] = []): NodoDeZonasDTO {
  return { id, nombre, profundidad, activo: true, asignadaA: null, heredaDe: null, hijos };
}

const CR: ArbolDeZonasDTO = {
  tipos: tipos("Provincia/Provincias", "Cantón/Cantones", "Distrito/Distritos"),
  raices: [
    nodo("sj", "San José", 1, [
      nodo("escazu", "Escazú", 2, [
        nodo("san-rafael", "San Rafael", 3),
        nodo("san-antonio", "San Antonio", 3),
        nodo("escazu-d", "Escazú", 3),
      ]),
    ]),
  ],
};

const CUATRO: ArbolDeZonasDTO = {
  tipos: tipos("Región/Regiones", "Provincia/Provincias", "Comuna/Comunas", "Barrio/Barrios"),
  raices: [
    nodo("costa", "Costa", 1, [
      nodo("litoral", "Litoral", 2, [
        nodo("vina", "Viña", 3, [nodo("miraflores", "Miraflores", 4), nodo("recreo", "Recreo", 4)]),
      ]),
    ]),
  ],
};

const DOS: ArbolDeZonasDTO = {
  tipos: tipos("Departamento/Departamentos", "Municipio/Municipios"),
  raices: [nodo("bolivar", "Bolívar", 1, [nodo("turbaco", "Turbaco", 2), nodo("arjona", "Arjona", 2)])],
};

const DIEZ: ArbolDeZonasDTO = {
  tipos: tipos(
    "Región/Regiones",
    "Subregión/Subregiones",
    "Provincia/Provincias",
    "Departamento/Departamentos",
    "Municipio/Municipios",
    "Comuna/Comunas",
    "Sector/Sectores",
    "Barrio/Barrios",
    "Manzana/Manzanas",
    "Lote/Lotes",
  ),
  raices: [
    ["norte", "Norte"],
    ["alto-norte", "Alto Norte"],
    ["andina", "Andina"],
    ["cordillera", "Cordillera"],
    ["san-pedro", "San Pedro"],
    ["la-loma", "La Loma"],
    ["sector-4", "Sector 4"],
    ["el-mirador", "El Mirador"],
    ["manzana-12", "Manzana 12"],
    ["lote-7", "Lote 7"],
  ]
    .reverse()
    .reduce<NodoDeZonasDTO[]>((hijos, [id, nombre], i) => [nodo(id!, nombre!, 10 - i, hijos)], []),
};

async function marcar(nivel: string, nombre: string) {
  const user = userEvent.setup();
  // El nombre accesible empieza por «Seleccionar <tipo> <nombre>» (la fila lo completa con su detalle).
  await user.click(screen.getByRole("checkbox", { name: (accesible) => accesible.startsWith(`Seleccionar ${nivel} ${nombre} `) }));
}

async function abrirHasta(...nombres: string[]) {
  const user = userEvent.setup();
  for (const n of nombres) await user.click(screen.getByRole("button", { name: `Abrir ${n}` }));
}

describe("SLT-48 / R45 — el buscador nombra los 3 primeros tipos del país y luego «…»", () => {
  it("Costa Rica, igual que hoy", () => {
    render(<GeografiaSelector arbol={CR} />);
    expect(screen.getByPlaceholderText("Buscar provincia, cantón, distrito…")).toBeInTheDocument();
  });

  it("país de 4 niveles: los tres primeros y «…»", () => {
    render(<GeografiaSelector arbol={CUATRO} />);
    expect(screen.getByPlaceholderText("Buscar región, provincia, comuna…")).toBeInTheDocument();
  });

  it("país de 10 niveles: los tres primeros y «…»", () => {
    render(<GeografiaSelector arbol={DIEZ} />);
    expect(screen.getByPlaceholderText("Buscar región, subregión, provincia…")).toBeInTheDocument();
  });

  it("país de 2 niveles: los dos que tiene", () => {
    render(<GeografiaSelector arbol={DOS} />);
    expect(screen.getByPlaceholderText("Buscar departamento, municipio…")).toBeInTheDocument();
  });
});

describe("SLT-48 / R45 — el resumen cuenta los lugares del último nivel del país", () => {
  it("Costa Rica: «Escazú (cantón, 3 distritos)», igual que hoy", async () => {
    render(<GeografiaSelector arbol={CR} />);
    await abrirHasta("San José");
    await marcar("cantón", "Escazú");
    expect(screen.getByText("1 lugar elegido: Escazú (cantón, 3 distritos).")).toBeInTheDocument();
  });

  it("país de 4 niveles: «Viña (comuna, 2 barrios)»", async () => {
    render(<GeografiaSelector arbol={CUATRO} />);
    await abrirHasta("Costa", "Litoral");
    await marcar("comuna", "Viña");
    expect(screen.getByText("1 lugar elegido: Viña (comuna, 2 barrios).")).toBeInTheDocument();
  });

  it("país de 2 niveles: «Bolívar (departamento, 2 municipios)»", async () => {
    render(<GeografiaSelector arbol={DOS} />);
    await marcar("departamento", "Bolívar");
    expect(screen.getByText("1 lugar elegido: Bolívar (departamento, 2 municipios).")).toBeInTheDocument();
  });

  it("país de 10 niveles: el árbol llega al nivel 10 con su tipo", async () => {
    render(<GeografiaSelector arbol={DIEZ} />);
    await abrirHasta("Norte", "Alto Norte", "Andina", "Cordillera", "San Pedro", "La Loma", "Sector 4", "El Mirador", "Manzana 12");
    expect(screen.getByRole("checkbox", { name: (accesible) => accesible.startsWith("Seleccionar lote Lote 7 ") })).toBeInTheDocument();
    await marcar("barrio", "El Mirador");
    expect(screen.getByText("1 lugar elegido: El Mirador (barrio, 1 lote).")).toBeInTheDocument();
  });
});

describe("SLT-48 / R45 — la cuenta, en funciones puras", () => {
  it("el último nivel es el mayor de los tipos del país", () => {
    expect(profundidadDelUltimoNivel(CR)).toBe(3);
    expect(profundidadDelUltimoNivel(CUATRO)).toBe(4);
    expect(profundidadDelUltimoNivel(DIEZ)).toBe(10);
  });

  it("cuenta los lugares de ese nivel a cualquier profundidad por debajo", () => {
    expect(lugaresDelNivelBajo(CR.raices[0]!, 3)).toBe(3);
    expect(lugaresDelNivelBajo(CUATRO.raices[0]!, 4)).toBe(2);
    expect(lugaresDelNivelBajo(DIEZ.raices[0]!, 10)).toBe(1);
  });
});
