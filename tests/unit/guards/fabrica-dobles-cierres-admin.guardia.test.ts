import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, vi } from "vitest";

import { dobleCierresAdmin } from "@/tests/fixtures/dobles/cierres-admin-repository";

/**
 * SLT-149 (D69) · R430-R433 — COMPLETITUD DE LA FABRICA DEL DOBLE DE `ICierresAdminRepository`.
 *
 * Lee el TEXTO del interfaz (no un tipo, que en ejecucion no existe), extrae sus miembros y
 * comprueba que la fabrica dobla cada obligatorio con su valor por defecto, y ningun opcional.
 *
 * Los valores esperados van escritos a mano (tabla D2/D3 del spec), no leidos de la fabrica:
 * compararla consigo misma estaria siempre en verde.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const INTERFAZ = "lib/interfaces/repositories/ICierresAdminRepository.ts";

/** Tabla D2/D3 del spec: lo que devuelve cada metodo obligatorio por defecto. */
const POR_DEFECTO: Record<string, unknown> = {
  leerTopeIntentos: 3,
  findCierresByAlcance: [],
  findHistoricoCompleto: [],
  findColaCompleta: [],
  findGestionesIncidenteDelCierre: [],
  findGestionesRetornablesDelCierre: [],
  findBarridasDelCierre: [],
  findGestionesPorAlcanceCompleto: [],
  findRechazosTiendaModeloNuevoCompleto: [],
  findHistoricoPaginado: { items: [], total: 0 },
  findColaPaginada: { items: [], total: 0 },
  findCatalogoFiltros: { zonas: [], mensajeros: [], mensajerosFiltro: [] },
  findCierreByIdEnAlcance: null,
  findGestionEditableEnCierre: null,
  findGestionesDeCierresEnAlcance: new Map(),
  resolverCierre: "updated",
  forzarSolicitudVencido: "updated",
  actualizarPagosGestion: { status: "conflict" },
  corregirResultadoGestionEnCierre: { status: "conflict" },
  ajustarPagoMensajeroEnCierre: { status: "conflict" },
};

/** Los miembros del bloque `interface ICierresAdminRepository`, partidos en obligatorios y opcionales. */
function miembrosDelInterfaz(): { obligatorios: string[]; opcionales: string[] } {
  const texto = readFileSync(path.join(RAIZ, INTERFAZ), "utf8").replace(/\r\n/g, "\n");
  const inicio = texto.indexOf("export interface ICierresAdminRepository {");
  expect(inicio, `no encuentro el interfaz en ${INTERFAZ}`).toBeGreaterThanOrEqual(0);
  const fin = texto.indexOf("\n}", inicio);
  const bloque = texto.slice(inicio, fin);
  const obligatorios: string[] = [];
  const opcionales: string[] = [];
  for (const m of bloque.matchAll(/^ {2}([A-Za-z_]\w*)(\?)?\(/gm)) {
    (m[2] ? opcionales : obligatorios).push(m[1]);
  }
  return { obligatorios, opcionales };
}

describe("SLT-149 · R430-R433 — la fabrica dobla el interfaz entero", () => {
  const { obligatorios, opcionales } = miembrosDelInterfaz();

  it("la extraccion no esta vacia: al menos 20 obligatorios y el opcional conocido", () => {
    // Sin esto, una expresion mal escrita dejaria la guardia verde sin comprobar nada.
    expect(obligatorios.length).toBeGreaterThanOrEqual(20);
    expect(opcionales).toContain("contarSenalesPorCierre");
  });

  it("R430/R433: cada obligatorio del interfaz esta en la fabrica y es un mock", () => {
    const doble = dobleCierresAdmin() as unknown as Record<string, unknown>;
    const faltan = obligatorios.filter((m) => !vi.isMockFunction(doble[m]));
    expect(faltan, "metodos obligatorios sin doble en la fabrica").toEqual([]);
  });

  it("R430: cada obligatorio tiene su valor por defecto de la tabla D2/D3", async () => {
    const sinValorEnLaTabla = obligatorios.filter((m) => !(m in POR_DEFECTO));
    expect(sinValorEnLaTabla, "metodos del interfaz sin fila en la tabla de defaults").toEqual([]);
    const doble = dobleCierresAdmin() as unknown as Record<string, () => Promise<unknown>>;
    for (const m of obligatorios) {
      await expect(doble[m](), `default de ${m}`).resolves.toEqual(POR_DEFECTO[m]);
    }
  });

  it("R432: ningun opcional viene por defecto; sobrescrito, existe y es un mock", () => {
    const doble = dobleCierresAdmin() as unknown as Record<string, unknown>;
    const presentes = opcionales.filter((m) => m in doble);
    expect(presentes, "metodos opcionales presentes sin sobrescribirlos").toEqual([]);

    const conSenales = dobleCierresAdmin({ contarSenalesPorCierre: async () => new Map() });
    expect(vi.isMockFunction(conSenales.contarSenalesPorCierre)).toBe(true);
  });

  it("R431: una sobrescritura reemplaza solo ese metodo y se inspecciona como mock sin cast", async () => {
    const doble = dobleCierresAdmin({ leerTopeIntentos: async () => 7 });
    await expect(doble.leerTopeIntentos()).resolves.toBe(7);
    expect(doble.leerTopeIntentos.mock.calls).toHaveLength(1);
    await expect(doble.resolverCierre({} as never)).resolves.toBe("updated");
    await expect(doble.findCierreByIdEnAlcance("c1", {} as never, "UTC")).resolves.toBeNull();

    const propio = vi.fn(async () => 9);
    const conPropio = dobleCierresAdmin({ leerTopeIntentos: propio });
    expect(conPropio.leerTopeIntentos).toBe(propio);
  });
});
