// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FiltroUbicacion } from "@/app/(app)/mis-asignaciones/_components/FiltroUbicacion";
import { useFiltroUbicacion } from "@/app/(app)/mis-asignaciones/_components/useFiltroUbicacion";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import {
  filtrarAsignaciones,
  listasDeLugar,
  opcionesOfrecidas,
} from "@/lib/utils/filtro-ubicacion-asignaciones";
import { EtiquetasGeograficasProvider, NivelesGeograficosProvider } from "@/providers/EtiquetasGeograficasProvider";
import { ETIQUETAS_CR, NIVELES_CR, NIVELES_XA } from "../../fabricas/etiquetas-geograficas";

// SLT-47 / T5.1 (design §5.4; R7, R9, R13) — el filtro de lugar del mensajero. Sustituye a
// `tests/unit/filtro-canton-distrito.test.ts` (feature 117): cada caso de aquel archivo está aquí con
// la MISMA expectativa (mismas órdenes, mismas opciones y rótulos), ahora sobre ids. El mapeo caso a
// caso está en `progress/impl_SLT-47.md > T5.1 y T5.2`.

afterEach(() => cleanup());

type Paso = readonly [id: string, nombre: string];

/** Una asignación con su ruta de lugar (nivel 1 → lugar). El resto es relleno estable. */
function orden(id: string, ruta: readonly Paso[], over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id,
    numGuia: 1001,
    numRemision: `REM-${id}`,
    estatusValue: "en_reparto",
    destinatario: "Ana Pérez",
    telefonoDest: "88880000",
    direccion: "Calle 1",
    producto: "Caja",
    peso: 1,
    montoCobrar: 0,
    latitud: null,
    longitud: null,
    notas: null,
    tiendaNombre: "Tienda X",
    zonaNombre: "GAM",
    provinciaNombre: ruta[0]?.[1] ?? "",
    cantonNombre: ruta[1]?.[1] ?? "",
    distritoNombre: ruta[2]?.[1] ?? null,
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: null,
    lugarRuta: ruta.map(([pid, nombre]) => ({ id: pid, nombre })),
    ...over,
  };
}

// Lugares de Costa Rica para los casos (ids inventados, nombres reales).
const SJ: Paso = ["p-sj", "San José"];
const ALA: Paso = ["p-ala", "Alajuela"];
const CENTRAL_SJ: Paso = ["c-central-sj", "Central"];
const CENTRAL_ALA: Paso = ["c-central-ala", "Central"];
const ESCAZU: Paso = ["c-escazu", "Escazú"];
const ALAJUELA_C: Paso = ["c-alajuela", "Alajuela"];
const PZ: Paso = ["c-pz", "Pérez Zeledón"];
const CARMEN: Paso = ["d-carmen", "Carmen"];
const MERCED: Paso = ["d-merced", "Merced"];
const SAN_RAFAEL: Paso = ["d-san-rafael-esc", "San Rafael"];
const SAN_ISIDRO: Paso = ["d-san-isidro", "San Isidro"];
const HOSPITAL: Paso = ["d-hospital", "Hospital"];

/** Opciones de la primera lista (nivel 2) como `{ value, label }`. */
const primera = (ordenes: MiAsignacionDTO[], niveles: NivelDeFiltroDTO[] = NIVELES_CR) =>
  opcionesOfrecidas(listasDeLugar(ordenes, niveles)[0], null);

/** Opciones de la lista `i` bajo el lugar `padre`. */
const bajo = (ordenes: MiAsignacionDTO[], i: number, padre: string, niveles: NivelDeFiltroDTO[] = NIVELES_CR) =>
  opcionesOfrecidas(listasDeLugar(ordenes, niveles)[i], padre);

describe("R7 — primera lista: el nivel 2 rotulado «lugar (lugar de nivel 1)»", () => {
  // Viejo «R2: una opción por cantón único, etiqueta 'Cantón (Provincia)', ordenadas».
  it("una opción por lugar, deduplicada y ordenada por su rótulo", () => {
    const opciones = primera([
      orden("a", [SJ, ESCAZU]),
      orden("b", [ALA, ALAJUELA_C]),
      orden("c", [SJ, ESCAZU]),
    ]);
    expect(opciones).toEqual([
      { value: "c-alajuela", label: "Alajuela (Alajuela)" },
      { value: "c-escazu", label: "Escazú (San José)" },
    ]);
  });

  // Viejo «R2: dedup insensible a mayúsculas/acentos/espacios». El nombre suelto de la orden ya no
  // decide nada: el mismo lugar es el mismo id, se escriba como se escriba en la raíz del DTO.
  it("el mismo lugar es una sola opción aunque el nombre de la orden venga escrito distinto", () => {
    const opciones = primera([
      orden("a", [SJ, PZ], { cantonNombre: "Pérez Zeledón", provinciaNombre: "San José" }),
      orden("b", [SJ, PZ], { cantonNombre: "  perez  zeledon ", provinciaNombre: "SAN JOSÉ" }),
    ]);
    expect(opciones).toEqual([{ value: "c-pz", label: "Pérez Zeledón (San José)" }]);
  });

  // Viejo «R2: cantones HOMÓNIMOS en distinta provincia son DOS opciones». R13: ahora además con
  // valor distinto, así que elegir uno no trae el otro.
  it("R13 — dos «Central» de provincias distintas son dos opciones con su provincia y su id", () => {
    const opciones = primera([orden("a", [SJ, CENTRAL_SJ]), orden("b", [ALA, CENTRAL_ALA])]);
    expect(opciones).toEqual([
      { value: "c-central-ala", label: "Central (Alajuela)" },
      { value: "c-central-sj", label: "Central (San José)" },
    ]);
  });

  it("país de 4 niveles: una lista por nivel de 2 a 4, la primera con su nivel 1 entre paréntesis", () => {
    const listas = listasDeLugar(
      [orden("a", [["r-costa", "Costa"], ["p-litoral", "Litoral"], ["m-norte", "Norte"], ["b-centro", "Centro"]])],
      NIVELES_XA,
    );
    expect(listas.map((l) => l.singular)).toEqual(["Provincia", "Comuna", "Barrio"]);
    expect(opcionesOfrecidas(listas[0], null)).toEqual([{ value: "p-litoral", label: "Litoral (Costa)" }]);
    expect(opcionesOfrecidas(listas[1], "p-litoral")).toEqual([{ value: "m-norte", label: "Norte" }]);
    expect(opcionesOfrecidas(listas[2], "m-norte")).toEqual([{ value: "b-centro", label: "Centro" }]);
  });

  it("país de 2 niveles: una sola lista", () => {
    const listas = listasDeLugar([orden("a", [["d1", "Norte"], ["m1", "Lima"]])], NIVELES_CR.slice(0, 2));
    expect(listas).toHaveLength(1);
    expect(opcionesOfrecidas(listas[0], null)).toEqual([{ value: "m1", label: "Lima (Norte)" }]);
  });
});

describe("R7 — listas de nivel 3 en adelante: hijos del lugar elegido arriba", () => {
  // Viejo «R4: distritos del cantón dado, deduplicados, sin nulos y ordenados».
  it("solo los hijos del lugar elegido, deduplicados, sin las órdenes sin ese nivel y ordenados", () => {
    const ordenes = [
      orden("a", [SJ, CENTRAL_SJ, MERCED]),
      orden("b", [SJ, CENTRAL_SJ, CARMEN]),
      orden("c", [SJ, CENTRAL_SJ, CARMEN]),
      orden("d", [SJ, CENTRAL_SJ]),
      orden("e", [SJ, ESCAZU, SAN_RAFAEL]),
    ];
    expect(bajo(ordenes, 1, "c-central-sj")).toEqual([
      { value: "d-carmen", label: "Carmen" },
      { value: "d-merced", label: "Merced" },
    ]);
  });

  // Viejo «R4: el cantón se compara normalizado (tolera acentos/caso)». Ahora se compara por id.
  it("el lugar de arriba se reconoce por su id, no por cómo esté escrito su nombre", () => {
    const ordenes = [orden("a", [SJ, PZ, SAN_ISIDRO], { cantonNombre: "perez zeledon" })];
    expect(bajo(ordenes, 1, "c-pz")).toEqual([{ value: "d-san-isidro", label: "San Isidro" }]);
  });
});

describe("R9 — filtrarAsignaciones por id", () => {
  const ordenes = [
    orden("a", [SJ, CENTRAL_SJ, CARMEN]),
    orden("b", [SJ, CENTRAL_SJ, MERCED]),
    orden("c", [SJ, CENTRAL_SJ]),
    orden("d", [SJ, ESCAZU, SAN_RAFAEL]),
  ];

  // Viejo «R7: sin cantón devuelve la MISMA lista sin filtrar».
  it("sin lugar elegido devuelve la MISMA lista", () => {
    expect(filtrarAsignaciones(ordenes, "")).toBe(ordenes);
  });

  // Viejo «R6: solo cantón muestra todas las de ese cantón (incluidas las de distrito nulo)».
  it("eligiendo el nivel 2, todas las de ese lugar, también las que no tienen nivel 3", () => {
    expect(filtrarAsignaciones(ordenes, "c-central-sj").map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  // Viejo «R6: cantón+distrito muestra solo las coincidentes y EXCLUYE distrito nulo».
  it("eligiendo el nivel 3, solo las de ese lugar; la que no tiene nivel 3 queda fuera", () => {
    expect(filtrarAsignaciones(ordenes, "d-carmen").map((o) => o.id)).toEqual(["a"]);
  });

  // Viejo «R6: la comparación de cantón y distrito es insensible a acentos/caso». Por id, el nombre
  // de la orden no interviene.
  it("el nombre escrito en la orden no interviene: decide el id", () => {
    const conNombresRaros = ordenes.map((o) => ({ ...o, cantonNombre: o.cantonNombre.toUpperCase() }));
    expect(filtrarAsignaciones(conNombresRaros, "d-merced").map((o) => o.id)).toEqual(["b"]);
  });

  // Viejo «R6: distrito inexistente en el cantón produce lista vacía».
  it("un lugar que ninguna orden tiene produce lista vacía", () => {
    expect(filtrarAsignaciones(ordenes, HOSPITAL[0])).toEqual([]);
  });

  it("R13 — eligiendo un «Central» no sale ninguna orden del otro «Central»", () => {
    const dos = [orden("sj", [SJ, CENTRAL_SJ]), orden("ala", [ALA, CENTRAL_ALA])];
    expect(filtrarAsignaciones(dos, "c-central-ala").map((o) => o.id)).toEqual(["ala"]);
  });
});

describe("estabilidad de opciones", () => {
  // Viejo «las opciones de cantón salen del conjunto COMPLETO, no del ya filtrado».
  it("las opciones salen del conjunto COMPLETO, no del ya filtrado", () => {
    const todas = [orden("a", [SJ, CENTRAL_SJ]), orden("b", [SJ, ESCAZU])];
    const completas = primera(todas);
    const soloFiltrado = filtrarAsignaciones(todas, "c-central-sj");

    expect(completas.map((o) => o.label)).toEqual(["Central (San José)", "Escazú (San José)"]);
    expect(primera(soloFiltrado).map((o) => o.label)).toEqual(["Central (San José)"]);
    expect(completas.length).toBeGreaterThan(primera(soloFiltrado).length);
  });
});

// ---------------------------------------------------------------------------------------------
// El componente con su hook, como lo monta `RepartoModule`
// ---------------------------------------------------------------------------------------------

function Pantalla({ ordenes }: { ordenes: MiAsignacionDTO[] }) {
  const filtro = useFiltroUbicacion(ordenes);
  return (
    <>
      <FiltroUbicacion
        listas={filtro.listas}
        hayFiltro={filtro.hayFiltro}
        onElegir={filtro.elegir}
        onLimpiar={filtro.limpiar}
      />
      <ul aria-label="Órdenes">
        {filtro.aplicar(ordenes).map((o) => (
          <li key={o.id}>{o.id}</li>
        ))}
      </ul>
    </>
  );
}

function montar(ordenes: MiAsignacionDTO[], niveles: NivelDeFiltroDTO[]) {
  return render(
    <NivelesGeograficosProvider niveles={niveles}>
      <EtiquetasGeograficasProvider etiquetas={ETIQUETAS_CR}>
        <Pantalla ordenes={ordenes} />
      </EtiquetasGeograficasProvider>
    </NivelesGeograficosProvider>,
  );
}

const visibles = () =>
  within(screen.getByRole("list", { name: "Órdenes" }))
    .queryAllByRole("listitem")
    .map((li) => li.textContent);

async function elegir(user: ReturnType<typeof userEvent.setup>, combobox: string, opcion: string) {
  await user.click(screen.getByRole("combobox", { name: combobox }));
  await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: opcion }));
}

async function opcionesDe(user: ReturnType<typeof userEvent.setup>, combobox: string) {
  await user.click(screen.getByRole("combobox", { name: combobox }));
  const textos = within(await screen.findByRole("listbox"))
    .getAllByRole("option")
    .map((o) => o.textContent);
  await user.keyboard("{Escape}");
  return textos;
}

describe("R7 — en Costa Rica se ve como hoy (cantón y distrito)", () => {
  const ordenes = [
    orden("a", [SJ, CENTRAL_SJ, CARMEN]),
    orden("b", [SJ, CENTRAL_SJ, MERCED]),
    orden("c", [ALA, CENTRAL_ALA]),
    orden("d", [SJ, ESCAZU, SAN_RAFAEL]),
  ];

  it("dos selects rotulados Cantón y Distrito, en su región, y el distrito deshabilitado sin cantón", () => {
    montar(ordenes, NIVELES_CR);
    expect(screen.getByRole("region", { name: "Filtrar por cantón y distrito" })).toBeInTheDocument();
    expect(screen.getByText("Cantón")).toBeInTheDocument();
    expect(screen.getByText("Distrito")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar por cantón" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Filtrar por distrito" })).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Filtrar por provincia" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).toBeNull();
  });

  it("R13 — el cantón ofrece los dos «Central» con su provincia, y elegir uno no trae el otro", async () => {
    const user = userEvent.setup();
    montar(ordenes, NIVELES_CR);
    expect(await opcionesDe(user, "Filtrar por cantón")).toEqual([
      "Todos los cantones",
      "Central (Alajuela)",
      "Central (San José)",
      "Escazú (San José)",
    ]);

    await elegir(user, "Filtrar por cantón", "Central (San José)");
    expect(visibles()).toEqual(["a", "b"]);
    expect(await opcionesDe(user, "Filtrar por distrito")).toEqual(["Todos los distritos", "Carmen", "Merced"]);

    await elegir(user, "Filtrar por distrito", "Merced");
    expect(visibles()).toEqual(["b"]);

    // Cambiar de cantón vacía el distrito.
    await elegir(user, "Filtrar por cantón", "Central (Alajuela)");
    expect(visibles()).toEqual(["c"]);
    expect(
      within(screen.getByRole("combobox", { name: "Filtrar por distrito" })).getByText("Todos los distritos"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(visibles()).toEqual(["a", "b", "c", "d"]);
    expect(screen.getByRole("combobox", { name: "Filtrar por distrito" })).toBeDisabled();
  });
});

describe("R7 — país de 4 niveles: tres listas encadenadas desde el nivel 2", () => {
  const COSTA: Paso = ["r-costa", "Costa"];
  const SIERRA: Paso = ["r-sierra", "Sierra"];
  const LITORAL: Paso = ["p-litoral", "Litoral"];
  const ANDINA: Paso = ["p-andina", "Andina"];
  const NORTE: Paso = ["m-norte", "Norte"];
  const SUR: Paso = ["m-sur", "Sur"];
  const CENTRO: Paso = ["b-centro", "Centro"];
  const ordenes = [
    orden("x1", [COSTA, LITORAL, NORTE, CENTRO]),
    orden("x2", [COSTA, LITORAL, SUR]),
    orden("x3", [SIERRA, ANDINA, ["m-alto", "Alto"]]),
  ];

  it("rótulos del país, primera lista con su nivel 1 y el resto encadenado por id", async () => {
    const user = userEvent.setup();
    montar(ordenes, NIVELES_XA);
    expect(screen.getByRole("region", { name: "Filtrar por provincia, comuna y barrio" })).toBeInTheDocument();
    expect(await opcionesDe(user, "Filtrar por provincia")).toEqual([
      "Todas las provincias",
      "Andina (Sierra)",
      "Litoral (Costa)",
    ]);
    expect(screen.getByRole("combobox", { name: "Filtrar por comuna" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Filtrar por barrio" })).toBeDisabled();

    await elegir(user, "Filtrar por provincia", "Litoral (Costa)");
    expect(visibles()).toEqual(["x1", "x2"]);
    expect(await opcionesDe(user, "Filtrar por comuna")).toEqual(["Todas las comunas", "Norte", "Sur"]);

    await elegir(user, "Filtrar por comuna", "Norte");
    expect(visibles()).toEqual(["x1"]);
    expect(await opcionesDe(user, "Filtrar por barrio")).toEqual(["Todos los barrios", "Centro"]);

    await elegir(user, "Filtrar por barrio", "Centro");
    expect(visibles()).toEqual(["x1"]);
  });

  it("sin niveles del país (layout sin datos) no pinta ningún filtro", () => {
    montar(ordenes, []);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(visibles()).toEqual(["x1", "x2", "x3"]);
  });
});
