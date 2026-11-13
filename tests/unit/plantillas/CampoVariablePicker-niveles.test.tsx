// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { CampoVariablePicker } from "@/app/(app)/configuracion/plantillas/_components/CampoVariablePicker";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import { CAMPOS_PLANTILLA_OFRECIDOS } from "@/lib/types/plantilla-datos";
import { NivelesGeograficosProvider } from "@/providers/EtiquetasGeograficasProvider";
import { NIVELES_CR, NIVELES_XA } from "@/tests/fabricas/etiquetas-geograficas";

// SLT-125 (design §4.6; R30, P2, A4) — el selector de variables del editor de plantillas ofrece
// `{{nivel_1}}`…`{{nivel_P}}`, cada uno rotulado con el tipo del nivel k del país de la empresa, en
// bloque justo antes de `{{ubicacion}}` (maqueta aprobada, sección 6). Nunca un `nivel_k` con k > P.
// `{{provincia}}`, `{{canton}}` y `{{distrito}}` siguen ocultas. Sin proveedor (P = 0), la oferta es
// exactamente `CAMPOS_PLANTILLA_OFRECIDOS`.

afterEach(() => cleanup());

const NIVELES_2: NivelDeFiltroDTO[] = [
  { profundidad: 1, singular: "Departamento", plural: "Departamentos" },
  { profundidad: 2, singular: "Municipio", plural: "Municipios" },
];

function montar(niveles: readonly NivelDeFiltroDTO[] | null, onSeleccionar = vi.fn()) {
  const picker = <CampoVariablePicker onSeleccionar={onSeleccionar} />;
  render(niveles === null ? picker : <NivelesGeograficosProvider niveles={niveles}>{picker}</NivelesGeograficosProvider>);
  return onSeleccionar;
}

/** Las claves ofrecidas, en orden, leídas de la línea `{{clave}}` de cada opción. */
function clavesOfrecidas(): string[] {
  return screen.getAllByRole("option").map((op) => {
    const m = /\{\{([^}]+)\}\}/.exec(op.textContent ?? "");
    if (m === null) throw new Error("Una opción sin su línea {{clave}}.");
    return m[1];
  });
}

function opcionDe(clave: string): HTMLElement {
  const op = document.getElementById(`campo-opcion-${clave}`);
  if (op === null) throw new Error(`No se ofrece {{${clave}}}.`);
  return op;
}

const nivelesOfrecidos = () => clavesOfrecidas().filter((c) => /^nivel_\d+$/.test(c));

describe.each([
  { pais: "de 2 niveles", niveles: NIVELES_2 },
  { pais: "de 4 niveles", niveles: NIVELES_XA },
  { pais: "Costa Rica (3 niveles)", niveles: NIVELES_CR },
])("R30 — país $pais", ({ niveles }) => {
  const P = niveles.length;

  it("ofrece exactamente nivel_1..nivel_P, nunca un nivel_k con k > P", () => {
    montar(niveles);
    expect(nivelesOfrecidos()).toEqual(Array.from({ length: P }, (_, i) => `nivel_${i + 1}`));
    expect(document.getElementById(`campo-opcion-nivel_${P + 1}`)).toBeNull();
  });

  it("rotula cada nivel_k con el singular del tipo del nivel k", () => {
    montar(niveles);
    for (const nivel of niveles) {
      const op = opcionDe(`nivel_${nivel.profundidad}`);
      expect(within(op).getByText(nivel.singular)).toBeInTheDocument();
      expect(within(op).queryByText(`Nivel ${nivel.profundidad}`)).toBeNull();
    }
  });

  it("los pone en bloque justo antes de {{ubicacion}}, en el sitio de la maqueta", () => {
    montar(niveles);
    const claves = clavesOfrecidas();
    const iUbicacion = claves.indexOf("ubicacion");
    expect(claves.slice(iUbicacion - P, iUbicacion + 1)).toEqual([
      ...Array.from({ length: P }, (_, i) => `nivel_${i + 1}`),
      "ubicacion",
    ]);
  });

  it("el resto de la oferta es CAMPOS_PLANTILLA_OFRECIDOS en su orden, sin provincia/canton/distrito", () => {
    montar(niveles);
    const claves = clavesOfrecidas();
    expect(claves.filter((c) => !/^nivel_\d+$/.test(c))).toEqual(CAMPOS_PLANTILLA_OFRECIDOS.map((c) => c.clave));
    for (const oculta of ["provincia", "canton", "distrito"]) expect(claves).not.toContain(oculta);
  });

  it("elegir un nivel inserta su clave", () => {
    const onSeleccionar = montar(niveles);
    fireEvent.click(opcionDe(`nivel_${P}`));
    expect(onSeleccionar).toHaveBeenCalledWith(`nivel_${P}`);
  });
});

describe("R30 — sin proveedor de niveles (P = 0)", () => {
  it("ofrece exactamente CAMPOS_PLANTILLA_OFRECIDOS, sin ningún nivel_k", () => {
    montar(null);
    expect(clavesOfrecidas()).toEqual(CAMPOS_PLANTILLA_OFRECIDOS.map((c) => c.clave));
    expect(nivelesOfrecidos()).toEqual([]);
  });

  it("con un proveedor vacío, lo mismo", () => {
    montar([]);
    expect(clavesOfrecidas()).toEqual(CAMPOS_PLANTILLA_OFRECIDOS.map((c) => c.clave));
  });
});

describe("R30 — un catálogo inyectado (variables de informe) no gana niveles", () => {
  it("usa los campos inyectados tal cual aunque haya país", () => {
    const CLIENTE = CAMPOS_PLANTILLA_OFRECIDOS.find((c) => c.clave === "cliente");
    if (CLIENTE === undefined) throw new Error("Fixture inválido: falta `cliente`.");
    render(
      <NivelesGeograficosProvider niveles={NIVELES_XA}>
        <CampoVariablePicker onSeleccionar={vi.fn()} campos={[CLIENTE]} />
      </NivelesGeograficosProvider>,
    );
    expect(clavesOfrecidas()).toEqual(["cliente"]);
  });
});

describe("R30 — el filtro encuentra un nivel por su tipo", () => {
  it("«barrio» en un país de 4 niveles deja {{nivel_4}}", () => {
    montar(NIVELES_XA);
    fireEvent.change(screen.getByRole("textbox", { name: /campo/i }), { target: { value: "barrio" } });
    expect(clavesOfrecidas()).toContain("nivel_4");
  });
});
