import { describe, expect, it } from "vitest";

import {
  TRADUCTOR_URL_NOVEDADES,
  construirFiltrosNovedades,
  filtrarNovedades,
  hayValoresSeleccionados,
} from "@/app/(app)/novedades/_components/novedades-filtros";
import type { FilterDef, FilterSelection } from "@/components/shared/FilterComponent";
import type { NovedadDTO } from "@/lib/types/novedad";
import { claveDeNivel } from "@/lib/utils/filtro-ubicacion";
import { valoresDeParam } from "@/lib/utils/filtros-url";
import { NIVELES_CR, NIVELES_XA } from "../../fabricas/etiquetas-geograficas";

// SLT-47 / T5.2 (design §5.3; R8, R9, R13, R19) — el lugar en `/novedades`: una lista por nivel del
// país con opciones sacadas solo del conjunto, valor por id, y los enlaces viejos por nombre
// traducidos al entrar.

type Paso = readonly [id: string, nombre: string];

const base: NovedadDTO = {
  id: "x",
  numGuia: 1,
  numRemision: "REM-1",
  estatusValue: "novedad",
  intentosContacto: 0,
  mensajeroNombre: "Marta Mensajera",
  destinatario: "Ana Cliente",
  telefonoDest: "88887777",
  causa: "not_found",
  producto: "Zapatos",
  peso: 1,
  direccion: "Av. Central",
  montoCobrar: 0,
  latitud: null,
  longitud: null,
  notas: null,
  tiendaNombre: "Tienda Demo",
  zonaNombre: "GAM",
  provinciaNombre: "",
  cantonNombre: "",
  distritoNombre: null,
  sinpeNumero: "80000000",
  sinpeNombre: "Titular de Prueba",
  secuenciaRuta: null,
};

function novedad(id: string, ruta: readonly Paso[]): NovedadDTO {
  return {
    ...base,
    id,
    provinciaNombre: ruta[0]?.[1] ?? "",
    cantonNombre: ruta[1]?.[1] ?? "",
    distritoNombre: ruta[2]?.[1] ?? null,
    lugarRuta: ruta.map(([pid, nombre]) => ({ id: pid, nombre })),
  };
}

const SJ: Paso = ["p-sj", "San José"];
const ALA: Paso = ["p-ala", "Alajuela"];
const HER: Paso = ["p-her", "Heredia"];
const CAR: Paso = ["p-car", "Cartago"];
const ESCAZU: Paso = ["c-esc", "Escazú"];
const CENTRAL_SJ: Paso = ["c-cen-sj", "Central"];
const CENTRAL_ALA: Paso = ["c-cen-ala", "Central"];
const CENTRAL_HER: Paso = ["c-cen-her", "Central"];
const OREAMUNO: Paso = ["c-ore", "Oreamuno"];
const SAN_RAFAEL_ESC: Paso = ["d-sr-esc", "San Rafael"];
const SAN_RAFAEL_ORE: Paso = ["d-sr-ore", "San Rafael"];
const CARMEN: Paso = ["d-carmen", "Carmen"];

const CONJUNTO = [
  novedad("n1", [SJ, ESCAZU, SAN_RAFAEL_ESC]),
  novedad("n2", [SJ, CENTRAL_SJ, CARMEN]),
  novedad("n3", [ALA, CENTRAL_ALA]),
  novedad("n4", [HER, CENTRAL_HER]),
  novedad("n5", [SJ, ESCAZU]),
  novedad("n6", [CAR, OREAMUNO, SAN_RAFAEL_ORE]),
];

const ids = (items: readonly NovedadDTO[]) => items.map((n) => n.id);
const N1 = claveDeNivel(1);
const N2 = claveDeNivel(2);
const N3 = claveDeNivel(3);

const lugares = (defs: readonly FilterDef[]) => defs.filter((f) => f.key.startsWith("nivel_"));

describe("R8 — una lista por nivel del país, con opciones del conjunto y valor por id", () => {
  it("Costa Rica: Provincia, Cantón y Distrito (gana el nivel 3), encadenadas y en su sitio", () => {
    const defs = construirFiltrosNovedades("devolucion", CONJUNTO, NIVELES_CR);
    expect(defs.map((f) => f.key)).toEqual(["mensajero", "zona", N1, N2, N3, "causa"]);
    const [p, c, d] = lugares(defs);
    expect([p.label, c.label, d.label]).toEqual(["Provincia", "Cantón", "Distrito"]);
    expect(p.dependsOn).toBeUndefined();
    expect(c.dependsOn).toBe(N1);
    expect(d.dependsOn).toBe(N2);
  });

  it("las opciones salen SOLO del conjunto, ordenadas por su etiqueta, con el id como valor y su padre", () => {
    const [p, c, d] = lugares(construirFiltrosNovedades("ayuda", CONJUNTO, NIVELES_CR));
    expect(p.options).toEqual([
      { value: "p-ala", label: "Alajuela" },
      { value: "p-car", label: "Cartago" },
      { value: "p-her", label: "Heredia" },
      { value: "p-sj", label: "San José" },
    ]);
    expect(c.options?.map((o) => [o.value, o.label, o.parentValue])).toEqual([
      ["c-cen-sj", "Central · San José", "p-sj"],
      ["c-cen-ala", "Central · Alajuela", "p-ala"],
      ["c-cen-her", "Central · Heredia", "p-her"],
      ["c-esc", "Escazú", "p-sj"],
      ["c-ore", "Oreamuno", "p-car"],
    ]);
    // Dos «San Rafael»: dos opciones, cada una bajo su cantón.
    expect(d.options?.map((o) => [o.value, o.label, o.parentValue])).toEqual([
      ["d-carmen", "Carmen", "c-cen-sj"],
      ["d-sr-esc", "San Rafael · Escazú, San José", "c-esc"],
      ["d-sr-ore", "San Rafael · Oreamuno, Cartago", "c-ore"],
    ]);
  });

  it("un país de 4 niveles da 4 listas, rotuladas con sus tipos", () => {
    const xa = [novedad("x", [["r1", "Costa"], ["p1", "Litoral"], ["m1", "Norte"], ["b1", "Centro"]])];
    const defs = lugares(construirFiltrosNovedades("devolucion", xa, NIVELES_XA));
    expect(defs.map((f) => [f.key, f.label])).toEqual([
      [N1, "Región"],
      [N2, "Provincia"],
      [N3, "Comuna"],
      [claveDeNivel(4), "Barrio"],
    ]);
  });

  it("sin conjunto cargado: las mismas listas, deshabilitadas y sin opciones", () => {
    const defs = lugares(construirFiltrosNovedades("devolucion", null, NIVELES_CR));
    expect(defs.map((f) => f.key)).toEqual([N1, N2, N3]);
    expect(defs.every((f) => f.disabled === true && (f.options ?? []).length === 0)).toBe(true);
  });
});

describe("R9, R13 — filtra por el id del lugar elegido, nunca por su nombre", () => {
  const filtrar = (sel: FilterSelection) => ids(filtrarNovedades(CONJUNTO, "", sel));

  it("eligiendo un cantón «Central» no sale ninguna novedad de los otros «Central»", () => {
    expect(filtrar({ [N2]: ["c-cen-sj"] })).toEqual(["n2"]);
    expect(filtrar({ [N2]: ["c-cen-ala", "c-cen-her"] })).toEqual(["n3", "n4"]);
  });

  it("eligiendo un distrito «San Rafael» no sale el del otro cantón", () => {
    expect(filtrar({ [N3]: ["d-sr-esc"] })).toEqual(["n1"]);
  });

  it("filtra por la lista más honda con elección; la de un nivel sin ese lugar queda fuera", () => {
    expect(filtrar({ [N1]: ["p-sj"] })).toEqual(["n1", "n2", "n5"]);
    expect(filtrar({ [N1]: ["p-sj"], [N2]: ["c-esc"] })).toEqual(["n1", "n5"]);
    expect(filtrar({ [N1]: ["p-sj"], [N2]: ["c-esc"], [N3]: ["d-sr-esc"] })).toEqual(["n1"]);
  });

  it("una lista montada sin elegir no acota ni cuenta como filtro", () => {
    expect(hayValoresSeleccionados({ [N1]: [], [N2]: [] })).toBe(false);
    expect(filtrar({ [N1]: [], [N2]: [] })).toEqual(ids(CONJUNTO));
    expect(hayValoresSeleccionados({ [N3]: ["d-carmen"] })).toBe(true);
  });

  it("el lugar se suma en Y al resto de filtros", () => {
    expect(filtrar({ [N1]: ["p-sj"], zona: ["Otra"] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R19 — los enlaces viejos por nombre
// ---------------------------------------------------------------------------------------------

/** La selección que la URL deja en las listas de lugar, como la siembra de `FilterComponent`. */
function seleccionDeUrl(query: string, defs: readonly FilterDef[]): FilterSelection {
  const vista = TRADUCTOR_URL_NOVEDADES.traducir(new URLSearchParams(query), defs);
  const sel: FilterSelection = {};
  for (const f of lugares(defs)) {
    const valores = valoresDeParam(vista, f.key);
    if (valores.length > 0) sel[f.key] = valores;
  }
  return sel;
}

/** Lo de hoy: provincia y cantón por NOMBRE exacto, en Y, sobre el conjunto. */
function comoHoy(provincias: string[], cantones: string[]): string[] {
  return ids(
    CONJUNTO.filter(
      (n) =>
        (provincias.length === 0 || provincias.includes(n.provinciaNombre)) &&
        (cantones.length === 0 || cantones.includes(n.cantonNombre)),
    ),
  );
}

describe("R19 — `?provincia=` y `?canton=` por nombre se traducen al entrar", () => {
  const defs = construirFiltrosNovedades("devolucion", CONJUNTO, NIVELES_CR);
  const filtrarUrl = (query: string) => ids(filtrarNovedades(CONJUNTO, "", seleccionDeUrl(query, defs)));

  it("una provincia pasa a sus lugares de nivel 1 con ese nombre: las mismas novedades que hoy", () => {
    expect(seleccionDeUrl("provincia=San José", defs)).toEqual({ [N1]: ["p-sj"] });
    expect(filtrarUrl("provincia=San José")).toEqual(comoHoy(["San José"], []));
  });

  it("el cantón se busca solo entre los hijos de la provincia traducida", () => {
    expect(seleccionDeUrl("provincia=San José&canton=Central", defs)).toEqual({
      [N1]: ["p-sj"],
      [N2]: ["c-cen-sj"],
    });
    expect(filtrarUrl("provincia=San José&canton=Central")).toEqual(comoHoy(["San José"], ["Central"]));
  });

  it("sin provincia, el cantón pasa a TODOS los de ese nombre, como hoy", () => {
    expect(seleccionDeUrl("canton=Central", defs)).toEqual({ [N2]: ["c-cen-sj", "c-cen-ala", "c-cen-her"] });
    expect(filtrarUrl("canton=Central")).toEqual(comoHoy([], ["Central"]));
  });

  it("varias provincias, separadas por coma o repetidas", () => {
    expect(filtrarUrl("provincia=Alajuela,Heredia&canton=Central")).toEqual(
      comoHoy(["Alajuela", "Heredia"], ["Central"]),
    );
    expect(filtrarUrl("provincia=Alajuela&provincia=Heredia")).toEqual(comoHoy(["Alajuela", "Heredia"], []));
  });

  it("un cantón que no cuelga de la provincia elegida se descarta y queda la provincia, como la poda de hoy", () => {
    expect(seleccionDeUrl("provincia=Alajuela&canton=Escazú", defs)).toEqual({ [N1]: ["p-ala"] });
    expect(filtrarUrl("provincia=Alajuela&canton=Escazú")).toEqual(["n3"]);
  });

  it("un nombre sin coincidencia se descarta", () => {
    expect(seleccionDeUrl("canton=Narnia", defs)).toEqual({});
    expect(filtrarUrl("canton=Narnia")).toEqual(ids(CONJUNTO));
    // La provincia desconocida no estrecha la búsqueda del cantón.
    expect(seleccionDeUrl("provincia=Narnia&canton=Escazú", defs)).toEqual({ [N2]: ["c-esc"] });
  });

  it("`?lugar_id=` sube hasta el nivel 1 y gana sobre los nombres", () => {
    expect(seleccionDeUrl("lugar_id=d-sr-ore&provincia=San José", defs)).toEqual({
      [N1]: ["p-car"],
      [N2]: ["c-ore"],
      [N3]: ["d-sr-ore"],
    });
  });

  it("«Limpiar todo» también retira `lugar_id`, `provincia` y `canton` (R20)", () => {
    expect([...TRADUCTOR_URL_NOVEDADES.claves].sort()).toEqual(["canton", "lugar_id", "provincia"]);
  });

  it("sin conjunto todavía, activa las listas que la URL pide para que el conjunto se cargue", () => {
    const sinConjunto = construirFiltrosNovedades("devolucion", null, NIVELES_CR);
    const vista = TRADUCTOR_URL_NOVEDADES.traducir(
      new URLSearchParams("provincia=San José&canton=Escazú&zona=GAM"),
      sinConjunto,
    );
    expect(valoresDeParam(vista, N1)).toEqual(["San José"]);
    expect(valoresDeParam(vista, N2)).toEqual(["Escazú"]);
    expect(valoresDeParam(vista, N3)).toEqual([]);
    expect(valoresDeParam(vista, "zona")).toEqual(["GAM"]);
    expect(valoresDeParam(vista, "provincia")).toEqual([]);

    const porId = TRADUCTOR_URL_NOVEDADES.traducir(new URLSearchParams("lugar_id=d-sr-esc"), sinConjunto);
    expect([N1, N2, N3].map((k) => valoresDeParam(porId, k))).toEqual([["d-sr-esc"], ["d-sr-esc"], ["d-sr-esc"]]);
  });
});
