// @vitest-environment jsdom
// SLT-48 (R45, P3; regla 4 de la maqueta aprobada) — LOS GRUPOS DE TARIFAS EN UN PAÍS DE N NIVELES.
//
// Los grupos se nombran por el nivel 3 del país (P3: el grupo cuenta desde ahí), con su tipo y no con un
// literal. Cada lugar del árbol se rotula con el tipo de su nivel hasta P. En un país de 2 niveles la
// sección se ve vacía, con la explicación y sin el botón de crear. Costa Rica, igual que hoy.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TarifasGrupos, type TarifasGruposProps } from "@/app/(app)/configuracion/tarifas/_components/TarifasGrupos";
import { TarifasZonas } from "@/app/(app)/configuracion/tarifas/_components/TarifasZonas";
import { TEXTOS } from "@/app/(app)/configuracion/tarifas/_components/tarifas-textos";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import { EtiquetasGeograficasContexto, NivelesGeograficosContexto } from "@/providers/EtiquetasGeograficasProvider";

import { ETIQUETAS_CR, NIVELES_CR, NIVELES_XA } from "../fabricas/etiquetas-geograficas";

vi.mock("@/lib/actions/tarifas", () => ({
  crearGrupoDistritos: vi.fn(),
  renombrarGrupoDistritos: vi.fn(),
  cambiarDistritosDeGrupo: vi.fn(),
  borrarGrupoDistritos: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

const NIVELES_2: NivelDeFiltroDTO[] = [
  { profundidad: 1, singular: "Departamento", plural: "Departamentos" },
  { profundidad: 2, singular: "Municipio", plural: "Municipios" },
];

const NIVELES_10: NivelDeFiltroDTO[] = [
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
].map((t, i) => {
  const [singular, plural] = t.split("/") as [string, string];
  return { profundidad: i + 1, singular, plural };
});

function props(extra: Partial<TarifasGruposProps> = {}): TarifasGruposProps {
  return {
    zona: { id: "z1", nombre: "Costa Norte" },
    grupos: [],
    distritos: [],
    valores: [],
    activada: true,
    puedeEscribir: true,
    onCambio: vi.fn(),
    ...extra,
  };
}

function montar(niveles: readonly NivelDeFiltroDTO[], extra: Partial<TarifasGruposProps> = {}) {
  render(
    <EtiquetasGeograficasContexto.Provider value={ETIQUETAS_CR}>
      <NivelesGeograficosContexto.Provider value={niveles}>
        <TarifasGrupos {...props(extra)} />
      </NivelesGeograficosContexto.Provider>
    </EtiquetasGeograficasContexto.Provider>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SLT-48 / R45 — los grupos se nombran por el nivel 3 del país", () => {
  it("Costa Rica: «grupos de distritos», como hoy", () => {
    montar(NIVELES_CR, {
      zona: { id: "z1", nombre: "GAM Oeste" },
      grupos: [
        { id: "g1", zonaId: "z1", nombre: "Escazú centro", distritos: [{ id: "d1", nombre: "San Rafael" }, { id: "d2", nombre: "San Antonio" }, { id: "d3", nombre: "Escazú" }] },
      ],
    });
    expect(screen.getByRole("heading", { name: "GAM Oeste: grupos de distritos" })).toBeInTheDocument();
    expect(screen.getByText("3 distritos: San Rafael, San Antonio, Escazú")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXTOS.crearGrupo })).toBeInTheDocument();
  });

  it("país de 4 niveles: «grupos de comunas», y el lugar de nivel 4 con su tipo", () => {
    montar(NIVELES_XA, {
      grupos: [
        {
          id: "g1",
          zonaId: "z1",
          nombre: "Viña centro",
          distritos: [{ id: "vina", nombre: "Viña" }, { id: "concon", nombre: "Concón" }],
          nodos: [{ id: "miraflores", nombre: "Miraflores", profundidad: 4 }],
        },
      ],
    });
    expect(screen.getByRole("heading", { name: "Costa Norte: grupos de comunas" })).toBeInTheDocument();
    expect(screen.getByText("2 comunas: Viña, Concón")).toBeInTheDocument();
    expect(screen.getByText(`${TEXTOS.otrosLugares}: Miraflores (barrio)`)).toBeInTheDocument();
  });

  it("país de 4 niveles: el modal «Editar lugares» rotula cada nivel hasta el último, aunque el árbol no traiga el tipo", async () => {
    const user = userEvent.setup();
    montar(NIVELES_XA, {
      grupos: [{ id: "g1", zonaId: "z1", nombre: "Viña centro", distritos: [{ id: "vina", nombre: "Viña" }] }],
      nodos: {
        // Sin el tipo del nivel 4: sale de los niveles del país.
        tipos: [],
        raices: [
          {
            id: "costa",
            nombre: "Costa",
            profundidad: 1,
            activo: true,
            hijos: [
              {
                id: "litoral",
                nombre: "Litoral",
                profundidad: 2,
                activo: true,
                hijos: [
                  {
                    id: "vina",
                    nombre: "Viña",
                    profundidad: 3,
                    activo: true,
                    hijos: [{ id: "miraflores", nombre: "Miraflores", profundidad: 4, activo: true, hijos: [] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    await user.click(screen.getByRole("button", { name: TEXTOS.editarLugaresDe("Viña centro") }));
    const dialogo = await screen.findByRole("dialog");
    for (const [lugar, tipo] of [["Costa", "región"], ["Litoral", "provincia"], ["Viña", "comuna"], ["Miraflores", "barrio"]]) {
      const fila = within(dialogo).getByText(lugar).closest("label");
      expect(fila, lugar).not.toBeNull();
      expect(within(fila as HTMLElement).getByText(tipo)).toBeInTheDocument();
    }
  });

  it("país de 10 niveles: «grupos de provincias» (el nivel 3 de ese país)", () => {
    montar(NIVELES_10, { zona: { id: "z1", nombre: "Norte" } });
    expect(screen.getByRole("heading", { name: "Norte: grupos de provincias" })).toBeInTheDocument();
  });
});

// Decisión del humano del 2026-11-18 (d): el artículo de la regla de unicidad concuerda con el género del
// tipo del nivel 3, con la regla de SLT-47 (`esFemenino`).
describe("SLT-48 / R45 — «Un <tipo>» concuerda con el género del tipo", () => {
  it("tipo femenino (Comuna): «Una comuna está en un solo grupo por zona.»", () => {
    montar(NIVELES_XA);
    expect(screen.getByText(/Una comuna está en un solo grupo por zona\./)).toBeInTheDocument();
    expect(screen.queryByText(/Un comuna/)).not.toBeInTheDocument();
  });

  it("tipo masculino (Distrito, Costa Rica): «Un distrito está en un solo grupo por zona.», como hoy", () => {
    montar(NIVELES_CR);
    expect(screen.getByText(/Un distrito está en un solo grupo por zona\./)).toBeInTheDocument();
  });
});

describe("SLT-48 / R45, P3 — un país de 2 niveles no tiene grupos (regla 4 de la maqueta)", () => {
  it("la sección se ve vacía, con la explicación y sin el botón de crear", () => {
    montar(NIVELES_2, { zona: { id: "z1", nombre: "Bolívar" } });
    const seccion = screen.getByRole("region", { name: TEXTOS.gruposSinNivelEtiqueta });
    expect(within(seccion).getByRole("heading", { name: TEXTOS.gruposSinNivelTitulo("Bolívar") })).toBeInTheDocument();
    expect(within(seccion).getByText(TEXTOS.gruposSinNivelDetalle)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: TEXTOS.crearGrupo })).toBeNull();
    // Ningún nombre de nivel prestado de otro país (R47).
    expect(seccion.textContent).not.toMatch(/distrito/i);
  });

  it("contraprueba: con 3 niveles el botón de crear sí está", () => {
    montar(NIVELES_CR);
    expect(screen.getByRole("button", { name: TEXTOS.crearGrupo })).toBeInTheDocument();
  });
});

describe("SLT-48 / R45 — la lista de zonas de Tarifas cuenta por el nivel 3 del país", () => {
  it("país de 4 niveles: «Viña centro: 2 comunas»", () => {
    render(
      <EtiquetasGeograficasContexto.Provider value={ETIQUETAS_CR}>
        <NivelesGeograficosContexto.Provider value={NIVELES_XA}>
          <TarifasZonas
            zonas={[
              { id: "z1", nombre: "Costa Norte", esCentral: false, estado: "completa", faltantes: [], usaZona: [], grupos: [{ nombre: "Viña centro", distritos: 2 }] },
            ]}
            seleccionada="z1"
            gruposPorZona={{}}
            onElegir={() => {}}
          />
        </NivelesGeograficosContexto.Provider>
      </EtiquetasGeograficasContexto.Provider>,
    );
    expect(screen.getByText("Viña centro: 2 comunas")).toBeInTheDocument();
  });
});
