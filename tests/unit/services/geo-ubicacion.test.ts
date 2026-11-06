import { describe, expect, it } from "vitest";

import { crearAsignaciones, nodo, type CatalogoGeografico, type ZonaAsignada } from "@/lib/services/geografia-dominio";
import {
  MSG_PAIS_NO_HABILITADO,
  MSG_UBICACION_UNA_DE_LAS_DOS,
  admiteGuardado,
  esPaisDeTresNiveles,
  fksDeNodo,
  resolverUbicacion,
  rutaPublica,
  type EntradaUbicacion,
  type ResultadoUbicacion,
} from "@/lib/services/geo-ubicacion";
import { catalogoEnMemoria } from "../../fixtures/doble-catalogo-geografico";

// SLT-45 (T2.1; design §2.2, §3.1, §5) — el motor de N niveles, sin base. Cubre R13–R16, R21 y la
// parte pura de R25 y R33. Nombres inventados: el motor no mira ningun pais real.
//
// Catalogo de 3 niveles (la forma que hoy se guarda):
//
//   Montaña(1) ─┬─ Río Claro(101) ─┬─ Peñas(10101)        zona norte propia
//               │                  ├─ Llano(10102)        retirado, sin zona
//               │                  └─ Valle(10103)        sin zona (0)
//               ├─ Cerro(102) [retirado] ── Cima(10201)   retirado en cascada
//               └─ Ambiguo(103) [zona sur, marca] ─┬─ Sauce / Saucé  (mismo nombre normalizado)
//                                                  └─ Roble          hereda sur (1) y la marca
//   Llanura(2) ─┬─ Bajo(201)        canton sin zona
//               ├─ Meseta(202)      canton con zona centro propia
//               │
//               └─ Doble(999) [zonas norte y sur] ── Hoja(20301)  hereda >1 → sin zona
//   Costa / Cósta     dos raices con el mismo nombre normalizado
//   Pico(999)         raiz: comparte codigo con Doble (otro tipo)

const Z: Record<string, ZonaAsignada> = {
  norte: { id: "z-norte", nombre: "Norte", esCentral: false },
  sur: { id: "z-sur", nombre: "Sur", esCentral: false },
  centro: { id: "z-centro", nombre: "Centro", esCentral: true },
};

const TRES = catalogoEnMemoria([
  { id: "R1", nombre: "Montaña", codigoOficial: "1" },
  { id: "C1", padreId: "R1", nombre: "Río Claro", codigoOficial: "101" },
  { id: "D1", padreId: "C1", nombre: "Peñas", codigoOficial: "10101" },
  { id: "D2", padreId: "C1", nombre: "Llano", codigoOficial: "10102", activo: false },
  { id: "D3", padreId: "C1", nombre: "Valle", codigoOficial: "10103" },
  { id: "C2", padreId: "R1", nombre: "Cerro", codigoOficial: "102", activo: false },
  { id: "D4", padreId: "C2", nombre: "Cima", codigoOficial: "10201" },
  { id: "C3", padreId: "R1", nombre: "Ambiguo", codigoOficial: "103" },
  { id: "D5", padreId: "C3", nombre: "Sauce" },
  { id: "D6", padreId: "C3", nombre: "Saucé" },
  { id: "D7", padreId: "C3", nombre: "Roble", codigoOficial: "10303" },
  { id: "R2", nombre: "Llanura", codigoOficial: "2" },
  { id: "C4", padreId: "R2", nombre: "Bajo", codigoOficial: "201" },
  { id: "C5", padreId: "R2", nombre: "Meseta", codigoOficial: "202" },
  { id: "C6", padreId: "R2", nombre: "Doble", codigoOficial: "999" },
  { id: "D8", padreId: "C6", nombre: "Hoja", codigoOficial: "20301" },
  { id: "R3", nombre: "Costa" },
  { id: "R4", nombre: "Cósta" },
  { id: "R5", nombre: "Pico", codigoOficial: "999" },
]);

const ASIG = crearAsignaciones(
  [
    { nodoId: "D1", zona: Z.norte },
    { nodoId: "C3", zona: Z.sur },
    { nodoId: "C5", zona: Z.centro },
    { nodoId: "C6", zona: Z.norte },
    { nodoId: "C6", zona: Z.sur },
  ],
  ["C3"],
);

// Pais de prueba de 2 niveles y de 4 niveles (R33): todos sus nodos con zona, para que lo unico que
// pueda fallar sea la regla de guardado.
const DOS = catalogoEnMemoria([
  { id: "A", nombre: "Alfa", codigoOficial: "A" },
  { id: "A1", padreId: "A", nombre: "Uno", codigoOficial: "A1" },
]);
const CUATRO = catalogoEnMemoria([
  { id: "X", nombre: "Equis", codigoOficial: "X" },
  { id: "X1", padreId: "X", nombre: "Uno", codigoOficial: "X1" },
  { id: "X2", padreId: "X1", nombre: "Dos", codigoOficial: "X2" },
  { id: "X3", padreId: "X2", nombre: "Tres", codigoOficial: "X3" },
]);
const TODO_CON_ZONA = crearAsignaciones(
  ["A", "A1", "X", "X1", "X2", "X3"].map((nodoId) => ({ nodoId, zona: Z.norte })),
  [],
);

const ruta = (...nombres: string[]): EntradaUbicacion => ({ tipo: "ruta", nombres });
const codigo = (c: string): EntradaUbicacion => ({ tipo: "codigo", codigo: c });

function error(r: ResultadoUbicacion): Record<string, string[]> {
  if (r.ok) throw new Error(`se esperaba un error y resolvio ${r.u.nodo.id}`);
  return r.fieldErrors;
}

function resuelto(r: ResultadoUbicacion) {
  if (!r.ok) throw new Error(`se esperaba resolver y fallo: ${JSON.stringify(r.fieldErrors)}`);
  return r.u;
}

function nodoDe(cat: CatalogoGeografico, id: string) {
  const n = nodo(cat, id);
  if (!n) throw new Error(`el nodo ${id} no esta en el catalogo del test`);
  return n;
}

// =================================================================================================
// R13 — por ruta
// =================================================================================================

describe("R13 — una ruta de nombres se resuelve nivel a nivel", () => {
  it("resuelve un distrito comparando nombres normalizados (mayusculas, acentos, espacios)", () => {
    const u = resuelto(resolverUbicacion(ruta("  MONTANA ", "rio   claro", "penas"), TRES, ASIG));
    expect(u.nodo.id).toBe("D1");
    expect(u.ruta.map((n) => n.id)).toEqual(["R1", "C1", "D1"]);
  });

  it("un nombre vacio dice el nivel", () => {
    expect(error(resolverUbicacion(ruta(""), TRES, ASIG))).toEqual({ ubicacion: ["nivel 1: el nombre esta vacio"] });
    expect(error(resolverUbicacion(ruta("Montaña", "Río Claro", "   "), TRES, ASIG))).toEqual({
      ubicacion: ["nivel 3: el nombre esta vacio"],
    });
  });

  it("no encontrado en la raiz no nombra padre", () => {
    expect(error(resolverUbicacion(ruta("  Nada  "), TRES, ASIG))).toEqual({ ubicacion: ["nivel 1: 'Nada' no encontrado"] });
  });

  it("no encontrado en n > 1 nombra al padre tal como esta en el catalogo, no como llego", () => {
    expect(error(resolverUbicacion(ruta("montana", "Nada"), TRES, ASIG))).toEqual({
      ubicacion: ["nivel 2: 'Nada' no encontrado en 'Montaña'"],
    });
  });

  it("solo busca entre los hijos del nodo anterior: un distrito de otro canton no se encuentra", () => {
    expect(error(resolverUbicacion(ruta("Montaña", "Río Claro", "Roble"), TRES, ASIG))).toEqual({
      ubicacion: ["nivel 3: 'Roble' no encontrado en 'Río Claro'"],
    });
  });

  it("una ruta mas larga que el arbol falla en el nivel que sobra", () => {
    expect(error(resolverUbicacion(ruta("Montaña", "Río Claro", "Peñas", "Extra"), TRES, ASIG))).toEqual({
      ubicacion: ["nivel 4: 'Extra' no encontrado en 'Peñas'"],
    });
  });

  it("ambiguo en la raiz y en n > 1", () => {
    expect(error(resolverUbicacion(ruta("Costa"), TRES, ASIG))).toEqual({ ubicacion: ["nivel 1: 'Costa' es ambiguo"] });
    expect(error(resolverUbicacion(ruta("Montaña", "Ambiguo", "Sauce"), TRES, ASIG))).toEqual({
      ubicacion: ["nivel 3: 'Sauce' es ambiguo en 'Ambiguo'"],
    });
  });

  it("retirado: el propio nodo, o el primer nivel retirado de la cadena", () => {
    expect(error(resolverUbicacion(ruta("Montaña", "Río Claro", "Llano"), TRES, ASIG))).toEqual({
      ubicacion: ["nivel 3: 'Llano' esta retirado del catalogo"],
    });
    expect(error(resolverUbicacion(ruta("Montaña", "Cerro", "Cima"), TRES, ASIG))).toEqual({
      ubicacion: ["nivel 2: 'Cerro' esta retirado del catalogo"],
    });
  });

  it("para en el primer fallo: un nivel 1 no encontrado gana a un nivel 2 vacio", () => {
    expect(error(resolverUbicacion(ruta("Nada", ""), TRES, ASIG))).toEqual({ ubicacion: ["nivel 1: 'Nada' no encontrado"] });
  });

  it("una lista vacia es «ni una ni otra» (R12), no un nivel", () => {
    expect(error(resolverUbicacion(ruta(), TRES, ASIG))).toEqual({ ubicacion: [MSG_UBICACION_UNA_DE_LAS_DOS] });
  });
});

// =================================================================================================
// R14 — por codigo
// =================================================================================================

describe("R14 — un codigo oficial se resuelve contra los nodos del pais", () => {
  it("1 coincidencia exacta tras trim resuelve", () => {
    const u = resuelto(resolverUbicacion(codigo("  10101 "), TRES, ASIG));
    expect(u.nodo.id).toBe("D1");
    expect(u.ruta.map((n) => n.id)).toEqual(["R1", "C1", "D1"]);
  });

  it("0 coincidencias: no encontrado", () => {
    expect(error(resolverUbicacion(codigo("777"), TRES, ASIG))).toEqual({ ubicacion: ["ubicacion_codigo '777' no encontrado"] });
  });

  it("no hay coincidencia parcial ni por prefijo", () => {
    expect(error(resolverUbicacion(codigo("1010"), TRES, ASIG))).toEqual({ ubicacion: ["ubicacion_codigo '1010' no encontrado"] });
  });

  it("> 1 coincidencias (dos tipos con el mismo codigo): ambiguo, no se elige uno", () => {
    expect(error(resolverUbicacion(codigo("999"), TRES, ASIG))).toEqual({
      ubicacion: ["ubicacion_codigo '999' es ambiguo: lo comparten varios niveles"],
    });
  });

  it("retirado, propio o en cascada", () => {
    expect(error(resolverUbicacion(codigo("10102"), TRES, ASIG))).toEqual({
      ubicacion: ["ubicacion_codigo '10102' esta retirado del catalogo"],
    });
    expect(error(resolverUbicacion(codigo("10201"), TRES, ASIG))).toEqual({
      ubicacion: ["ubicacion_codigo '10201' esta retirado del catalogo"],
    });
  });

  it("un codigo en blanco es «ni una ni otra» (R12)", () => {
    expect(error(resolverUbicacion(codigo("   "), TRES, ASIG))).toEqual({ ubicacion: [MSG_UBICACION_UNA_DE_LAS_DOS] });
  });
});

// =================================================================================================
// R15, R33 — regla de guardado
// =================================================================================================

describe("R15/R33 — forma del pais y regla de guardado", () => {
  it("es de 3 niveles solo si la profundidad maxima es 3", () => {
    expect(esPaisDeTresNiveles(DOS)).toBe(false);
    expect(esPaisDeTresNiveles(TRES)).toBe(true);
    expect(esPaisDeTresNiveles(CUATRO)).toBe(false);
    expect(esPaisDeTresNiveles(catalogoEnMemoria([]))).toBe(false);
  });

  it("en un pais de 3 niveles admite las profundidades 2 y 3, no la 1", () => {
    expect(admiteGuardado(TRES, nodoDe(TRES, "R1"))).toBe(false);
    expect(admiteGuardado(TRES, nodoDe(TRES, "C1"))).toBe(true);
    expect(admiteGuardado(TRES, nodoDe(TRES, "D1"))).toBe(true);
  });

  it("en paises de 2 y 4 niveles no admite ninguna profundidad (1 a 4)", () => {
    expect(["A", "A1"].map((id) => admiteGuardado(DOS, nodoDe(DOS, id)))).toEqual([false, false]);
    expect(["X", "X1", "X2", "X3"].map((id) => admiteGuardado(CUATRO, nodoDe(CUATRO, id)))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("una raiz de un pais de 3 niveles da «pais no habilitado», aunque ademas no tenga zona", () => {
    expect(error(resolverUbicacion(ruta("Montaña"), TRES, ASIG))).toEqual({ ubicacion: [MSG_PAIS_NO_HABILITADO] });
    expect(error(resolverUbicacion(codigo("1"), TRES, ASIG))).toEqual({ ubicacion: [MSG_PAIS_NO_HABILITADO] });
  });

  it("R33: en un pais de 2 niveles encuentra nodos de cualquier profundidad, por nombre y por codigo, y no los admite", () => {
    for (const entrada of [ruta("Alfa"), ruta("alfa", "uno"), codigo("A"), codigo("A1")]) {
      expect(error(resolverUbicacion(entrada, DOS, TODO_CON_ZONA))).toEqual({ ubicacion: [MSG_PAIS_NO_HABILITADO] });
    }
  });

  it("R33: en un pais de 4 niveles llega hasta la profundidad 4, y no admite ninguna", () => {
    expect(error(resolverUbicacion(ruta("Equis", "Uno", "Dos", "Tres", "Cuatro"), CUATRO, TODO_CON_ZONA))).toEqual({
      ubicacion: ["nivel 5: 'Cuatro' no encontrado en 'Tres'"],
    });
    for (const entrada of [ruta("Equis", "Uno", "Dos", "Tres"), ruta("Equis", "Uno", "Dos"), codigo("X3"), codigo("X2")]) {
      expect(error(resolverUbicacion(entrada, CUATRO, TODO_CON_ZONA))).toEqual({ ubicacion: [MSG_PAIS_NO_HABILITADO] });
    }
  });

  it("el retirado gana a la regla de guardado (va antes en el orden)", () => {
    const retirada = catalogoEnMemoria([{ id: "X", nombre: "Equis", activo: false }, { id: "X1", padreId: "X", nombre: "Uno" }]);
    expect(error(resolverUbicacion(ruta("Equis"), retirada, TODO_CON_ZONA))).toEqual({
      ubicacion: ["nivel 1: 'Equis' esta retirado del catalogo"],
    });
  });
});

// =================================================================================================
// R16 — zona
// =================================================================================================

describe("R16 — la zona que cubre la ubicacion", () => {
  it("1 zona propia: resuelve con esa zona y sin marca", () => {
    const u = resuelto(resolverUbicacion(ruta("Montaña", "Río Claro", "Peñas"), TRES, ASIG));
    expect(u.zona).toEqual(Z.norte);
    expect(u.esZonaEspecial).toBe(false);
  });

  it("1 zona heredada del canton: resuelve con ella, y la marca del canton tambien se hereda", () => {
    const u = resuelto(resolverUbicacion(ruta("Montaña", "Ambiguo", "Roble"), TRES, ASIG));
    expect(u.zona).toEqual(Z.sur);
    expect(u.esZonaEspecial).toBe(true);
  });

  it("0 zonas en el nodo y sus ancestros: «sin zona» con el nombre del catalogo", () => {
    expect(error(resolverUbicacion(ruta("montana", "rio claro", "VALLE"), TRES, ASIG))).toEqual({
      ubicacion: ["la ubicacion 'Valle' no tiene zona asignada"],
    });
    expect(error(resolverUbicacion(codigo("10103"), TRES, ASIG))).toEqual({
      ubicacion: ["la ubicacion 'Valle' no tiene zona asignada"],
    });
  });

  it("> 1 zonas heredadas: «sin zona», no se elige una", () => {
    expect(error(resolverUbicacion(ruta("Llanura", "Doble", "Hoja"), TRES, ASIG))).toEqual({
      ubicacion: ["la ubicacion 'Hoja' no tiene zona asignada"],
    });
  });

  it("un canton (profundidad 2) sin zona pasa la regla de guardado y cae en «sin zona»", () => {
    expect(error(resolverUbicacion(ruta("Llanura", "Bajo"), TRES, ASIG))).toEqual({
      ubicacion: ["la ubicacion 'Bajo' no tiene zona asignada"],
    });
  });

  it("un canton con zona propia resuelve en profundidad 2", () => {
    const u = resuelto(resolverUbicacion(codigo("202"), TRES, ASIG));
    expect(u.nodo.id).toBe("C5");
    expect(u.zona).toEqual(Z.centro);
    expect(u.fks).toEqual({ provinciaId: "R2", cantonId: "C5", distritoId: null });
  });

  it("un retirado sin zona dice «retirado», no «sin zona»", () => {
    expect(error(resolverUbicacion(ruta("Montaña", "Río Claro", "Llano"), TRES, ASIG))).toEqual({
      ubicacion: ["nivel 3: 'Llano' esta retirado del catalogo"],
    });
  });
});

// =================================================================================================
// R25 (parte pura) — las tres FK viejas
// =================================================================================================

describe("R25 — las tres FK se derivan de la ruta del nodo", () => {
  it("profundidad 3: abuelo, padre y el nodo", () => {
    expect(fksDeNodo(TRES, nodoDe(TRES, "D1"))).toEqual({ provinciaId: "R1", cantonId: "C1", distritoId: "D1" });
  });

  it("profundidad 2: padre, el nodo y distrito vacio", () => {
    expect(fksDeNodo(TRES, nodoDe(TRES, "C4"))).toEqual({ provinciaId: "R2", cantonId: "C4", distritoId: null });
  });

  it("sin regla de guardado no hay FK: raiz, y paises de 2 y 4 niveles", () => {
    expect(fksDeNodo(TRES, nodoDe(TRES, "R1"))).toBeNull();
    expect(fksDeNodo(DOS, nodoDe(DOS, "A1"))).toBeNull();
    expect(fksDeNodo(CUATRO, nodoDe(CUATRO, "X2"))).toBeNull();
  });

  it("la resolucion completa trae las FK del nodo resuelto", () => {
    const u = resuelto(resolverUbicacion(ruta("Montaña", "Río Claro", "Peñas"), TRES, ASIG));
    expect(u.fks).toEqual({ provinciaId: "R1", cantonId: "C1", distritoId: "D1" });
  });
});

// =================================================================================================
// R21 — ruta publica
// =================================================================================================

describe("R21 — `rutaPublica` de la raiz al nodo", () => {
  it("cada eslabon trae profundidad, id, nombre, codigo y tipo (clave y nombre singular)", () => {
    expect(rutaPublica(TRES, "D1")).toEqual([
      { profundidad: 1, id: "R1", nombre: "Montaña", codigoOficial: "1", tipo: { clave: "nivel_1", nombre: "Nivel 1" } },
      { profundidad: 2, id: "C1", nombre: "Río Claro", codigoOficial: "101", tipo: { clave: "nivel_2", nombre: "Nivel 2" } },
      { profundidad: 3, id: "D1", nombre: "Peñas", codigoOficial: "10101", tipo: { clave: "nivel_3", nombre: "Nivel 3" } },
    ]);
  });

  it("el codigo puede ser null", () => {
    expect(rutaPublica(TRES, "D5").at(-1)).toMatchObject({ id: "D5", codigoOficial: null });
  });

  it("el nombre es el actual del catalogo", () => {
    const renombrado = catalogoEnMemoria([
      { id: "R1", nombre: "Montaña Nueva" },
      { id: "C1", padreId: "R1", nombre: "Río Claro" },
    ]);
    expect(rutaPublica(renombrado, "C1").map((e) => e.nombre)).toEqual(["Montaña Nueva", "Río Claro"]);
  });

  it("una raiz es una ruta de un eslabon; un id que no existe, una ruta vacia", () => {
    expect(rutaPublica(TRES, "R2").map((e) => e.id)).toEqual(["R2"]);
    expect(rutaPublica(TRES, "no-existe")).toEqual([]);
  });

  it("funciona en un pais de 4 niveles", () => {
    expect(rutaPublica(CUATRO, "X3").map((e) => [e.profundidad, e.tipo.clave])).toEqual([
      [1, "nivel_1"],
      [2, "nivel_2"],
      [3, "nivel_3"],
      [4, "nivel_4"],
    ]);
  });
});
