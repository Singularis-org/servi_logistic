import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "../../_postgres-real";
import {
  MARCA_C02,
  barrerComprometidosHuerfanos,
  limpiarComprometido,
  prepararMundo,
  sembrarComprometido,
  type Mundo,
} from "../_escenario";

/**
 * SLT-204 (D80) — los restos de `corte-concurrencia` (C02) se barren en el SIGUIENTE arranque.
 *
 * C02 confirma su escenario (dos conexiones reales) y lo borra en `afterAll`. Si el worker de vitest
 * muere a medias (SLT-188, T7: «Worker exited unexpectedly» en su `beforeAll`), `afterAll` no corre y
 * el escenario queda: 1 organizacion, su orden, sus 2 zonas y sus 5 usuarios. Un `finally` no lo
 * arregla, porque muere el proceso. Por eso C02 marca su empresa (`MARCA_C02` en el nombre) y, al
 * arrancar, barre las empresas con esa marca antes de sembrar las suyas.
 *
 * POR QUE ESTE ARCHIVO CONFIRMA FILAS (D79): simula la caida, y una caida solo deja filas confirmadas.
 * Usa SU propia marca, no la de C02: si corre a la vez que C02 en otro worker, no le barre el escenario
 * vivo. Lo que siembra lo borra el propio barrido bajo prueba, y `afterAll` lo repite por si el caso
 * fallo a mitad.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

// Marca propia, imposible de encontrar por casualidad en otra empresa de prueba.
const MARCA_PRUEBA = "SLT-204 resto simulado k3v9";

describeSiHayBase("SLT-204 (D80) — barrido de escenarios confirmados huerfanos (Postgres real)", () => {
  let mundo: Mundo;

  beforeAll(async () => {
    mundo = await prepararMundo();
    // Lo mismo que hace C02: si una corrida anterior de ESTE archivo murio, su resto se barre aqui y el
    // conteo exacto del caso (1 empresa barrida) no lo cuenta (medido: con un resto previo daba 2).
    await barrerComprometidosHuerfanos(mundo.prisma, MARCA_PRUEBA);
  }, 120_000);

  afterAll(async () => {
    if (mundo) {
      await barrerComprometidosHuerfanos(mundo.prisma, MARCA_PRUEBA);
      await mundo.prisma.$disconnect();
    }
  }, 120_000);

  it("la marca de C02 no es la de esta prueba (si coincidieran, este archivo barreria a C02 en vivo)", () => {
    expect(MARCA_C02).not.toBe(MARCA_PRUEBA);
    expect(MARCA_C02.startsWith(MARCA_PRUEBA) || MARCA_PRUEBA.startsWith(MARCA_C02)).toBe(false);
  });

  it("un escenario confirmado que nadie limpio (worker muerto) desaparece entero con el barrido", async () => {
    // La «caida»: se siembra con la marca y NO se llama a `limpiarComprometido`.
    const s = await sembrarComprometido(
      mundo,
      async (e) => {
        const o = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 4000 });
        return { ordenIds: [o.ordenId] };
      },
      { marca: MARCA_PRUEBA },
    );
    const org = s.organizacionId;

    // Control positivo: lo que deja un worker muerto esta de verdad confirmado y lleva la marca.
    const empresa = await mundo.prisma.organizacion.findUnique({ where: { id: org }, select: { nombre: true } });
    expect(empresa?.nombre.startsWith(MARCA_PRUEBA), "SLT-204: la empresa lleva la marca").toBe(true);
    expect(await mundo.prisma.orden.count({ where: { organizacionId: org } }), "SLT-204: orden sembrada").toBe(1);
    expect(await mundo.prisma.zona.count({ where: { organizacionId: org } }), "SLT-204: central + satelite").toBe(2);
    expect(await mundo.prisma.usuario.count({ where: { organizacionId: org } }), "SLT-204: 5 usuarios").toBe(5);

    const barridas = await barrerComprometidosHuerfanos(mundo.prisma, MARCA_PRUEBA);

    expect(barridas, "SLT-204: el barrido cuenta la empresa huerfana").toBe(1);
    expect(await mundo.prisma.organizacion.count({ where: { id: org } }), "SLT-204: empresa barrida").toBe(0);
    expect(await mundo.prisma.orden.count({ where: { organizacionId: org } })).toBe(0);
    expect(await mundo.prisma.zona.count({ where: { organizacionId: org } })).toBe(0);
    expect(await mundo.prisma.usuario.count({ where: { organizacionId: org } })).toBe(0);
  }, 120_000);

  it("el barrido no toca empresas sin la marca", async () => {
    const ajena = await sembrarComprometido(mundo, async (e) => {
      const o = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 4000 });
      return { ordenIds: [o.ordenId] };
    });
    try {
      await barrerComprometidosHuerfanos(mundo.prisma, MARCA_PRUEBA);
      expect(
        await mundo.prisma.organizacion.count({ where: { id: ajena.organizacionId } }),
        "SLT-204: una empresa sin la marca sigue",
      ).toBe(1);
    } finally {
      await limpiarComprometido(mundo.prisma, ajena);
    }
  }, 120_000);
});
