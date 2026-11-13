// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { DataTable } from "@/components/shared/DataTable";
import {
  ordenesColumnsDe,
  ordenesColumnsReprogramadaDe,
} from "@/app/(app)/ordenes/_components/ordenes-columns";
import { recibidasColumns } from "@/app/(app)/recepcion-satelite/_components/recibidas-columns";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import type { OrdenListItemDTO } from "@/lib/types/orden";
import { ETIQUETAS_CR, NIVELES_CR } from "../../fabricas/etiquetas-geograficas";
import { ORDENES_CR, SATELITE_CR } from "@/tests/fixtures/descargas-cr/entrada";

// SLT-125 T3.3 (design §5, P4; R5) — la tabla de `/ordenes` y la de recepción satélite muestran una
// columna de lugar por nivel del país, con el criterio de las descargas (R1–R3): encabezado = tipo del
// nivel, `nivel_<k>` si choca; ids `provincia`, `canton`, `distrito` y `nivel_<k>` desde el 4; la celda,
// el paso k de la ruta de la orden, o «—» si no llega. En Costa Rica, igual que hoy.
//
// Los textos de Costa Rica van literales (R42: solo los tests de CR los llevan).

afterEach(() => cleanup());

const niveles = (...singulares: string[]): NivelDeFiltroDTO[] =>
  singulares.map((singular, i) => ({ profundidad: i + 1, singular, plural: singular }));

const DOS = niveles("Departamento", "Municipio");
const CUATRO = niveles("Región", "Provincia", "Comuna", "Barrio");
const DIEZ = niveles(
  "Región",
  "Subregión",
  "Provincia",
  "Departamento",
  "Municipio",
  "Comuna",
  "Sector",
  "Barrio",
  "Manzana",
  "Lote",
);

/** Los ids de las columnas entre «Zona» y «Monto a cobrar»: el sitio de las tres de hoy. */
function idsDeLugar(columnas: { id: string }[]): string[] {
  const ids = columnas.map((c) => c.id);
  return ids.slice(ids.indexOf("zona") + 1, ids.indexOf("montoCobrar"));
}

const conRuta = (...nombres: string[]): OrdenListItemDTO => ({
  ...ORDENES_CR[0]!,
  id: "o-ruta",
  numRemision: "REM-RUTA",
  // Las relaciones de hoy se vacían: la celda tiene que salir de la ruta.
  relaciones: { ...ORDENES_CR[0]!.relaciones!, provincia: null, canton: null, distrito: null },
  lugarRuta: nombres.map((nombre, i) => ({ id: `n${i + 1}`, nombre })),
});

function celdasDeLugar(columnas: ReturnType<typeof ordenesColumnsDe>, orden: OrdenListItemDTO): string[] {
  render(<DataTable columns={columnas} data={[orden]} rowKey="id" ariaLabel="Órdenes" />);
  const encabezados = screen.getAllByRole("columnheader").map((th) => th.textContent ?? "");
  const celdas = within(screen.getByRole("row", { name: new RegExp(orden.numRemision) }))
    .getAllByRole("cell")
    .map((td) => td.textContent ?? "");
  const desde = encabezados.indexOf("Zona") + 1;
  const hasta = encabezados.indexOf("Monto a cobrar");
  return celdas.slice(desde, hasta);
}

describe("R5 — Costa Rica: la tabla se ve igual que hoy", () => {
  it("con los niveles de CR, las mismas columnas (ids, encabezados y orden) que sin ellos", () => {
    const conNiveles = ordenesColumnsDe(ETIQUETAS_CR, NIVELES_CR);
    const deHoy = ordenesColumnsDe(ETIQUETAS_CR);
    expect(conNiveles.map((c) => [c.id, c.value])).toEqual(deHoy.map((c) => [c.id, c.value]));
    expect(idsDeLugar(conNiveles)).toEqual(["provincia", "canton", "distrito"]);
    expect(conNiveles.filter((c) => ["provincia", "canton", "distrito"].includes(c.id)).map((c) => c.value)).toEqual([
      "Provincia",
      "Cantón",
      "Distrito",
    ]);
  });

  it("las celdas: provincia, cantón y distrito; sin distrito, «—»", () => {
    expect(celdasDeLugar(ordenesColumnsDe(ETIQUETAS_CR, NIVELES_CR), { ...ORDENES_CR[0]!, lugarRuta: undefined })).toEqual(
      ["San José", "San José", "Carmen"],
    );
    cleanup();
    expect(celdasDeLugar(ordenesColumnsDe(ETIQUETAS_CR, NIVELES_CR), conRuta("Limón", "Pococí"))).toEqual([
      "Limón",
      "Pococí",
      "—",
    ]);
  });

  it("el mismo par etiquetas + niveles devuelve el mismo arreglo (la tabla no ve columnas nuevas en cada render)", () => {
    expect(ordenesColumnsDe(ETIQUETAS_CR, NIVELES_CR)).toBe(ordenesColumnsDe(ETIQUETAS_CR, NIVELES_CR));
    expect(ordenesColumnsDe(ETIQUETAS_CR, [])).toBe(ordenesColumnsDe(ETIQUETAS_CR));
    expect(ordenesColumnsReprogramadaDe(ETIQUETAS_CR, NIVELES_CR)).toBe(
      ordenesColumnsReprogramadaDe(ETIQUETAS_CR, NIVELES_CR),
    );
  });
});

describe("R5 — un país de P niveles: una columna de lugar por nivel", () => {
  it.each([
    ["2", DOS, ["provincia", "canton"]],
    ["4", CUATRO, ["provincia", "canton", "distrito", "nivel_4"]],
    ["10", DIEZ, ["provincia", "canton", "distrito", ...Array.from({ length: 7 }, (_, i) => `nivel_${i + 4}`)]],
  ] as const)("país de %s niveles: ids y encabezados por nivel, en su sitio", (_, n, ids) => {
    const columnas = ordenesColumnsDe(ETIQUETAS_CR, n);
    expect(idsDeLugar(columnas)).toEqual(ids);
    expect(columnas.filter((c) => (ids as readonly string[]).includes(c.id)).map((c) => c.value)).toEqual(
      n.map((x) => x.singular),
    );
    // Las demás columnas no cambian ni de orden.
    const otras = (cs: { id: string }[]) => cs.map((c) => c.id).filter((id) => !/^(provincia|canton|distrito|nivel_\d+)$/.test(id));
    expect(otras(columnas)).toEqual(otras(ordenesColumnsDe(ETIQUETAS_CR)));
  });

  it("país de 4 niveles: la ruta llega al 3 y la cuarta celda sale «—» (maqueta)", () => {
    expect(celdasDeLugar(ordenesColumnsDe(ETIQUETAS_CR, CUATRO), conRuta("Costa", "Litoral", "Viña"))).toEqual([
      "Costa",
      "Litoral",
      "Viña",
      "—",
    ]);
  });

  it("país de 2 niveles: solo dos celdas, sin una tercera vacía", () => {
    expect(celdasDeLugar(ordenesColumnsDe(ETIQUETAS_CR, DOS), conRuta("Bolívar", "Cartagena"))).toEqual([
      "Bolívar",
      "Cartagena",
    ]);
  });

  it("país de 10 niveles: diez celdas; las que la ruta no alcanza, «—»", () => {
    expect(celdasDeLugar(ordenesColumnsDe(ETIQUETAS_CR, DIEZ), conRuta("Norte", "Norte Alto", "Andina"))).toEqual([
      "Norte",
      "Norte Alto",
      "Andina",
      ...Array(7).fill("—"),
    ]);
  });

  it("R2: un nivel «Zona» choca con la columna Zona de la tabla y pasa a nivel_<k>", () => {
    const columnas = ordenesColumnsDe(ETIQUETAS_CR, niveles("Región", "Zona", "Barrio"));
    expect(columnas.find((c) => c.id === "canton")?.value).toBe("nivel_2");
    expect(columnas.filter((c) => c.value === "Zona").map((c) => c.id)).toEqual(["zona"]);
  });

  it("la tabla de recepción satélite lleva las mismas columnas de lugar", () => {
    const columnas = recibidasColumns(ETIQUETAS_CR, CUATRO);
    expect(idsDeLugar(columnas)).toEqual(["provincia", "canton", "distrito", "nivel_4"]);
    const fila = { ...SATELITE_CR[0]!, lugarRuta: [{ id: "a", nombre: "Costa" }, { id: "b", nombre: "Litoral" }] };
    render(<DataTable columns={columnas} data={[fila]} rowKey="id" ariaLabel="Bodega" />);
    const nivel4 = columnas.findIndex((c) => c.id === "nivel_4");
    const celdas = within(screen.getByRole("row", { name: new RegExp(fila.numRemision) })).getAllByRole("cell");
    expect(celdas[nivel4]?.textContent).toBe("—");
    expect(screen.getByRole("columnheader", { name: "Barrio" })).toBeInTheDocument();
  });
});
