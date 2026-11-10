import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";

import {
  comoLaEmpresa,
  crearEscenarioSlt89,
  guardado,
  repoDeZonas,
  type EscenarioSlt89,
} from "./_fixtures/slt89-zonas";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-89 · R30 (T3.6; design §2.4, §5.1 paso 9) — EL HISTORIAL DE LOS NODOS DE UNA ZONA, contra
 * Postgres real (`slt89-zonas.ts`, empresa `XA`, como la app):
 *
 *   · un guardado que añade o quita nodos que no son distritos deja una fila `zona_nodo_cambiado` por
 *     nodo (entidad `zona`, la de despues; añadido → solo valor nuevo; quitado → solo valor anterior;
 *     «nombre (padre)», y una raiz solo con su nombre), con un lote propio;
 *   · los distritos del mismo guardado dejan `zona_distrito_cambiado` como SLT-76, en otro lote;
 *   · crear una zona con nodos no deja ninguna de las dos;
 *   · el actor queda congelado en la fila.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const ACCIONES = ["zona_nodo_cambiado", "zona_distrito_cambiado"] as const;

async function filas(tx: TxDeTest, entidadId: string) {
  return tx.historialAccion.findMany({
    where: { accion: { in: [...ACCIONES] }, entidadId },
    select: {
      accion: true,
      entidadTipo: true,
      entidadEtiqueta: true,
      valorAnterior: true,
      valorNuevo: true,
      loteId: true,
      actorUsuarioId: true,
    },
    orderBy: [{ accion: "asc" }, { valorNuevo: "asc" }, { valorAnterior: "asc" }],
  });
}

async function nombre(tx: TxDeTest, id: string): Promise<string> {
  const [f] = await tx.$queryRawUnsafe<{ nombre: string }[]>(`SELECT nombre FROM nodo_geografico WHERE id = $1`, id);
  if (f === undefined) throw new Error(`el nodo ${id} no esta en el catalogo`);
  return f.nombre;
}

describeSiHayBase("SLT-89 · R30 — `zona_nodo_cambiado`, una fila por nodo y un lote propio", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  async function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioSlt89) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioSlt89(tx)));
  }

  it("⭑ añadir un canton, un sector y un distrito: dos filas de nodos (su lote) y una de distrito (otro lote)", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const datos = await guardado(tx, zonas.surId, {
        nombre: "Zona sur SLT89 renombrada",
        distritoIds: [geo.distritoBajoCantonRetiradoId, geo.distritoSinZonaId],
        nodoIds: [geo.cantonId, e.sectorId],
      });
      const res = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos, e.maestroId));
      return {
        e,
        res,
        filas: await filas(tx, zonas.surId),
        nombres: {
          canton: await nombre(tx, geo.cantonId),
          provincia: await nombre(tx, geo.provinciaId),
          sector: await nombre(tx, e.sectorId),
          sinZona: await nombre(tx, geo.distritoSinZonaId),
        },
      };
    });
    expect(r.res.estado).toBe("ok");
    const etiqueta = etiquetaDeEntidad("zona", { nombre: "Zona sur SLT89 renombrada" });
    const nodos = r.filas.filter((f) => f.accion === "zona_nodo_cambiado");
    const distritos = r.filas.filter((f) => f.accion === "zona_distrito_cambiado");
    expect(nodos.map((f) => f.valorNuevo).sort()).toEqual(
      [`${r.nombres.canton} (${r.nombres.provincia})`, `${r.nombres.sector} (${r.nombres.sinZona})`].sort(),
    );
    for (const f of nodos) {
      expect(f).toMatchObject({ entidadTipo: "zona", entidadEtiqueta: etiqueta, valorAnterior: null, actorUsuarioId: r.e.maestroId });
    }
    expect(new Set(nodos.map((f) => f.loteId)).size).toBe(1);
    // Los distritos, como SLT-76: su propia fila y su propio lote.
    expect(distritos).toHaveLength(1);
    expect(distritos[0].valorNuevo).toBe(`${r.nombres.sinZona} (${r.nombres.canton})`);
    expect(distritos[0].loteId).not.toBe(nodos[0].loteId);
  });

  it("quitar un nodo deja solo el valor anterior; una provincia (raiz) va solo con su nombre", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const update = async (nodoIds: string[]) => {
        const datos = await guardado(tx, zonas.surId, { distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds });
        return comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos, e.maestroId));
      };
      await update([geo.provinciaId]);
      const primeras = (await filas(tx, zonas.surId)).length;
      await update([]);
      const todas = await filas(tx, zonas.surId);
      return { primeras, todas, provincia: await nombre(tx, geo.provinciaId) };
    });
    expect(r.primeras).toBe(1);
    const quitada = r.todas.filter((f) => f.valorAnterior !== null);
    expect(quitada).toHaveLength(1);
    expect(quitada[0]).toMatchObject({ accion: "zona_nodo_cambiado", valorAnterior: r.provincia, valorNuevo: null });
    const anadida = r.todas.filter((f) => f.valorNuevo !== null);
    expect(anadida[0]).toMatchObject({ valorNuevo: r.provincia, valorAnterior: null });
  });

  it("guardar sin cambiar nodos ni distritos no escribe ninguna de las dos", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const update = async () => {
        const datos = await guardado(tx, zonas.surId, { distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds: [geo.cantonId] });
        return comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos, e.maestroId));
      };
      await update();
      const tras1 = (await filas(tx, zonas.surId)).length;
      await update();
      return { tras1, tras2: (await filas(tx, zonas.surId)).length };
    });
    expect(r.tras2).toBe(r.tras1);
  });

  it("crear una zona con nodos y distritos no deja `zona_nodo_cambiado` ni `zona_distrito_cambiado`", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo } = e.emp.base;
      const creada = await comoLaEmpresa(tx, e.empresaId, () =>
        repoDeZonas(tx).create(
          {
            nombre: "Zona SLT89 creada con nodos",
            cobroVehiculo: false,
            esCentral: false,
            distritoIds: [geo.distritoSinZonaId],
            nodoIds: [geo.cantonRetiradoId],
            tarifas: [],
            sinpeNumero: "80000000",
            sinpeNombre: "Titular de Prueba",
          },
          e.maestroId,
        ),
      );
      if (creada.estado !== "ok") throw new Error(`crear dio ${creada.estado}`);
      return { filas: await filas(tx, creada.zona.id) };
    });
    expect(r.filas).toEqual([]);
  });
});
