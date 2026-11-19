import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "../../_postgres-real";
import {
  ESCENARIO_C02,
  MARCA_C02,
  barrerComprometidosHuerfanos,
  escenarioConfirmadoDe,
  limpiarComprometido,
  prepararMundo,
  sembrarComprometido,
  type Escenario,
  type Mundo,
} from "../_escenario";

/**
 * SLT-204 (D80) — los restos de `corte-concurrencia` (C02) se barren en el SIGUIENTE arranque.
 *
 * C02 confirma su escenario (dos conexiones reales) y lo borra en `afterAll`. Si el worker de vitest
 * muere a medias (SLT-188, T7: «Worker exited unexpectedly» en su `beforeAll`), `afterAll` no corre y
 * el escenario queda: 1 organizacion, su orden, sus 2 zonas y sus 5 usuarios. Un `finally` no lo
 * arregla, porque muere el proceso. Por eso C02 arranca y siembra con `ESCENARIO_C02`
 * (`escenarioConfirmadoDe(MARCA_C02)`): `preparar` barre los restos marcados y `sembrar` marca los suyos.
 *
 * Tres piezas, tres pruebas: el COMPORTAMIENTO de `escenarioConfirmadoDe` (con una marca propia), que
 * `ESCENARIO_C02` lleva la marca de C02, y que C02 arranca y siembra por `ESCENARIO_C02` (guardia de texto:
 * sembrar restos con `MARCA_C02` aqui barreria o ensuciaria a C02 si corre a la vez en otro worker).
 *
 * POR QUE ESTE ARCHIVO CONFIRMA FILAS (D79): simula la caida, y una caida solo deja filas confirmadas.
 * Usa SU propia marca, no la de C02. Lo que siembra lo borra el propio barrido bajo prueba, y `afterAll`
 * lo repite por si el caso fallo a mitad.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

// Marca propia, imposible de encontrar por casualidad en otra empresa de prueba.
const MARCA_PRUEBA = "SLT-204 resto simulado k3v9";
const PRUEBA = escenarioConfirmadoDe(MARCA_PRUEBA);

const sembrarUnaOrden = async (e: Escenario) => {
  const o = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 4000 });
  return { ordenIds: [o.ordenId] };
};

/** El codigo de C02 sin comentarios (los comentarios citan los nombres y no cuentan como llamada). */
function codigoDeC02(): string {
  const fuente = readFileSync(join(__dirname, "corte-concurrencia.test.ts"), "utf8");
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("SLT-204 (D80) — C02 arranca y siembra por ESCENARIO_C02 (guardia de texto)", () => {
  it("ESCENARIO_C02 lleva la marca de C02, distinta de la de esta prueba", () => {
    expect(ESCENARIO_C02.marca).toBe(MARCA_C02);
    expect(MARCA_C02.startsWith(MARCA_PRUEBA) || MARCA_PRUEBA.startsWith(MARCA_C02)).toBe(false);
  });

  it("el beforeAll de C02 llama a ESCENARIO_C02.preparar() y su siembra a ESCENARIO_C02.sembrar(", () => {
    const codigo = codigoDeC02();
    expect(codigo, "SLT-204: C02 tiene que arrancar con el barrido").toMatch(/mundo\s*=\s*await\s+ESCENARIO_C02\.preparar\(\)/);
    expect(codigo, "SLT-204: C02 tiene que sembrar con su marca").toMatch(/await\s+ESCENARIO_C02\.sembrar\(\s*mundo\s*,/);
  });

  it("C02 no arranca ni siembra por los caminos sin marca", () => {
    const codigo = codigoDeC02();
    expect(codigo).not.toMatch(/\bprepararMundo\s*\(/);
    expect(codigo).not.toMatch(/\bsembrarComprometido\s*\(/);
  });
});

describeSiHayBase("SLT-204 (D80) — escenarioConfirmadoDe: barre al arrancar y siembra marcado (Postgres real)", () => {
  let mundo: Mundo;

  beforeAll(async () => {
    // El mismo arranque que C02, con la marca de la prueba: si una corrida anterior de ESTE archivo
    // murio, su resto se barre aqui y el conteo exacto de abajo no lo cuenta.
    mundo = await PRUEBA.preparar();
  }, 120_000);

  afterAll(async () => {
    if (mundo) {
      await barrerComprometidosHuerfanos(mundo.prisma, MARCA_PRUEBA);
      await mundo.prisma.$disconnect();
    }
  }, 120_000);

  it("sembrar marca la empresa; el preparar SIGUIENTE barre el escenario huerfano entero", async () => {
    // La «caida»: se siembra y NO se llama a `limpiarComprometido`.
    const s = await PRUEBA.sembrar(mundo, sembrarUnaOrden);
    const org = s.organizacionId;

    // Control positivo: lo que deja un worker muerto esta confirmado y lleva la marca.
    const empresa = await mundo.prisma.organizacion.findUnique({ where: { id: org }, select: { nombre: true } });
    expect(empresa?.nombre.startsWith(`${MARCA_PRUEBA} `), "SLT-204: la empresa lleva la marca").toBe(true);
    expect(await mundo.prisma.orden.count({ where: { organizacionId: org } }), "SLT-204: orden sembrada").toBe(1);
    expect(await mundo.prisma.zona.count({ where: { organizacionId: org } }), "SLT-204: central + satelite").toBe(2);
    expect(await mundo.prisma.usuario.count({ where: { organizacionId: org } }), "SLT-204: 5 usuarios").toBe(5);

    // El arranque siguiente (otro proceso en la vida real: aqui, otro `preparar`).
    const siguiente = await PRUEBA.preparar();
    try {
      expect(await mundo.prisma.organizacion.count({ where: { id: org } }), "SLT-204: empresa barrida").toBe(0);
      expect(await mundo.prisma.orden.count({ where: { organizacionId: org } })).toBe(0);
      expect(await mundo.prisma.zona.count({ where: { organizacionId: org } })).toBe(0);
      expect(await mundo.prisma.usuario.count({ where: { organizacionId: org } })).toBe(0);
    } finally {
      await siguiente.prisma.$disconnect();
    }
  }, 120_000);

  it("barrerComprometidosHuerfanos cuenta lo que barre y no toca empresas sin la marca", async () => {
    const marcada = await PRUEBA.sembrar(mundo, sembrarUnaOrden);
    const ajena = await sembrarComprometido(mundo, sembrarUnaOrden);
    try {
      expect(await barrerComprometidosHuerfanos(mundo.prisma, MARCA_PRUEBA), "SLT-204: barre la marcada").toBe(1);
      expect(await mundo.prisma.organizacion.count({ where: { id: marcada.organizacionId } })).toBe(0);
      expect(
        await mundo.prisma.organizacion.count({ where: { id: ajena.organizacionId } }),
        "SLT-204: una empresa sin la marca sigue",
      ).toBe(1);
    } finally {
      await limpiarComprometido(mundo.prisma, ajena);
    }
  }, 120_000);

  it("prepararMundo a secas NO barre (por eso C02 tiene que usar ESCENARIO_C02.preparar)", async () => {
    const s = await PRUEBA.sembrar(mundo, sembrarUnaOrden);
    const sinBarrido = await prepararMundo();
    try {
      expect(await mundo.prisma.organizacion.count({ where: { id: s.organizacionId } })).toBe(1);
    } finally {
      await sinBarrido.prisma.$disconnect();
      await barrerComprometidosHuerfanos(mundo.prisma, MARCA_PRUEBA);
    }
  }, 120_000);
});
