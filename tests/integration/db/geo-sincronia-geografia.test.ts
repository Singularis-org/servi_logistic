import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { altaPorNivel } from "./_fixtures/alta-por-nivel-46";
import { planificarDivision } from "@/lib/utils/division-csv";
import { crearPaisDePrueba, crearNodoDeNivel } from "@/tests/fabricas/paises";
import { tiposDeNivel } from "./_fixtures/geo-43";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-43 (T3.1; design §2.3) — la sincronía de la geografía vieja al nodo, contra Postgres real.
//   · R15: el alta de SL-20 (`GeoRepository.crear`) y la carga CSV (`importarDivision`) crean el nodo
//     con el mismo id y los datos de R13.
//   · R16: renombre (`renombrar`), retiro y reactivación (`cambiarActivacion`) y código (la carga
//     completa códigos) se reflejan en el nodo.
//   · SLT-48 T5.1 retiró los casos de la sincronía tabla vieja → nodo (cambio de padre, UPDATE sin
//     cambios, borrado físico, `canton.pais_id` y el homónimo que tumbaba): las tablas viejas son
//     vistas del nodo y la sincronía ya no existe (SLT-48 R1, R2, R5).
//
// Los repositorios corren sobre `clienteConSavepoint`, como en las suites de SL-20, dentro de una
// transacción del dueño (el camino del superadmin) que siempre se revierte. Actor `null`: el
// historial de plataforma lo congela como sistema, sin depender de un usuario sembrado.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface FilaNodo {
  id: string;
  pais_id: string;
  tipo_id: string;
  padre_id: string | null;
  profundidad: number;
  nombre: string;
  nombre_normalizado: string;
  codigo_oficial: string | null;
  activo: boolean;
}

async function nodo(tx: TxDeTest, id: string): Promise<FilaNodo | undefined> {
  const filas = await tx.$queryRawUnsafe<FilaNodo[]>(
    `SELECT id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial, activo
       FROM nodo_geografico WHERE id = $1`,
    id,
  );
  return filas[0];
}

const sufijo = () => randomUUID().replace(/-/g, "").slice(0, 8);

function conGeo<T>(fn: (ctx: { tx: TxDeTest; geo: GeoRepository }) => Promise<T>): Promise<T> {
  return revertida(base, async (tx) => {
    await crearPaisDePrueba(tx, "XA");
    return fn({ tx, geo: new GeoRepository(clienteConSavepoint(tx)) });
  });
}

describeSiHayBase("SLT-43 — sincronía de la geografía vieja al nodo (R15, R16)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R15: el alta de SL-20 crea el nodo de cada nivel con el mismo id, país, tipo, padre, profundidad y código", async () => {
    const r = await conGeo(async ({ tx, geo }) => {
      const s = sufijo();
      const t = await tiposDeNivel(tx, "XA");
      const p = await altaPorNivel(geo, "provincia", `Región Ñuble ${s}`, null, { paisId: "XA", codigo: "7" }, null);
      const c = await altaPorNivel(geo, "canton", `Comuna ${s}`, p, { paisId: "XA", codigo: "7" }, null);
      const d = await altaPorNivel(geo, "distrito", `Barrio ${s}`, c, { paisId: "XA", codigo: null }, null);
      return { t, s, p, c, d, np: await nodo(tx, p), nc: await nodo(tx, c), nd: await nodo(tx, d) };
    });
    expect(r.np).toEqual({
      id: r.p, pais_id: "XA", tipo_id: r.t.nivel1, padre_id: null, profundidad: 1,
      nombre: `Región Ñuble ${r.s}`, nombre_normalizado: `region nuble ${r.s}`, codigo_oficial: "7", activo: true,
    });
    // Provincia y cantón con el mismo código «7»: conviven, como en SL-20 (único por país y tipo).
    expect(r.nc).toMatchObject({ id: r.c, pais_id: "XA", tipo_id: r.t.nivel2, padre_id: r.p, profundidad: 2, codigo_oficial: "7" });
    expect(r.nd).toMatchObject({ id: r.d, pais_id: "XA", tipo_id: r.t.nivel3, padre_id: r.c, profundidad: 3, codigo_oficial: null, activo: true });
  });

  it("R15, R16: la carga CSV (`importarDivision`) crea los nodos de sus altas y les pasa los códigos que completa", async () => {
    const r = await conGeo(async ({ tx, geo }) => {
      // Un existente sin código, que la carga completa (R26 de SL-20): el UPDATE llega al nodo.
      const existente = await crearNodoDeNivel(tx, 1, { nombre: "Región Norte", paisId: "XA" });
      // SLT-46 (T4): la division se lee y se planifica por profundidad; mismas filas que en SLT-43.
      const division = await geo.leerDivisionDePais("XA");
      const fila = (linea: number, ...celdas: [string, string][]) => ({
        linea,
        niveles: celdas.map(([nombre, codigo]) => ({ nombre, codigo })),
      });
      const plan = planificarDivision(
        [
          fila(2, ["Región Norte", "RN"], ["Comuna Uno", "RN-1"], ["Barrio A", "RN-1-A"]),
          fila(3, ["Región Sur", "RS"], ["Comuna Dos", ""], ["", ""]),
        ],
        division!.nodos,
        division!.tipos,
      );
      if (!("plan" in plan)) throw new Error("el plan de prueba tenia errores");
      const resumen = await geo.importarDivision("XA", plan.plan, null);

      const nodos = await tx.$queryRawUnsafe<{ nombre: string; profundidad: number; codigo_oficial: string | null; padre: string | null }[]>(
        `SELECT n.nombre, n.profundidad, n.codigo_oficial, p.nombre AS padre
           FROM nodo_geografico n LEFT JOIN nodo_geografico p ON p.id = n.padre_id
          WHERE n.pais_id = 'XA' ORDER BY n.profundidad, n.nombre`,
      );
      // Mismos ids que la geografía vieja, nivel por nivel.
      const [faltan] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM (
           SELECT id FROM provincia WHERE pais_id = 'XA' UNION ALL
           SELECT id FROM canton WHERE pais_id = 'XA' UNION ALL
           SELECT id FROM distrito WHERE pais_id = 'XA') v
          WHERE NOT EXISTS (SELECT 1 FROM nodo_geografico n WHERE n.id = v.id)`,
      );
      return { resumen, nodos, faltan: faltan.n, existente: (await nodo(tx, existente.id))?.codigo_oficial };
    });
    // SLT-46 (R33): `creados` va por profundidad (1/2/3 = provincia/cantón/distrito); mismas cifras.
    expect(r.resumen).toMatchObject({ creados: { 1: 1, 2: 2, 3: 1 }, codigosCompletados: 1 });
    expect(r.faltan).toBe(0);
    expect(r.existente).toBe("RN");
    expect(r.nodos).toEqual([
      { nombre: "Región Norte", profundidad: 1, codigo_oficial: "RN", padre: null },
      { nombre: "Región Sur", profundidad: 1, codigo_oficial: "RS", padre: null },
      { nombre: "Comuna Dos", profundidad: 2, codigo_oficial: null, padre: "Región Sur" },
      { nombre: "Comuna Uno", profundidad: 2, codigo_oficial: "RN-1", padre: "Región Norte" },
      { nombre: "Barrio A", profundidad: 3, codigo_oficial: "RN-1-A", padre: "Comuna Uno" },
    ]);
  });

  it("R16: `renombrar` y `cambiarActivacion` de SL-20/374 llegan al nodo (nombre, normalizado, retiro y reactivación)", async () => {
    const r = await conGeo(async ({ tx, geo }) => {
      const s = sufijo();
      const p = await altaPorNivel(geo, "provincia", `Región ${s}`, null, { paisId: "XA", codigo: null }, null);
      const c = await altaPorNivel(geo, "canton", `Comuna ${s}`, p, { paisId: "XA", codigo: null }, null);

      const renombrado = await geo.renombrar(c, `Comuna Peñalolén ${s}`, `Comuna ${s}`, null);
      const trasRenombrar = await nodo(tx, c);
      const retiro = await geo.cambiarActivacion(p, false, null);
      const trasRetirar = (await nodo(tx, p))?.activo;
      const hijoTrasRetirar = (await nodo(tx, c))?.activo;
      const reactivacion = await geo.cambiarActivacion(p, true, null);
      const trasReactivar = (await nodo(tx, p))?.activo;
      return { s, renombrado, trasRenombrar, retiro, trasRetirar, hijoTrasRetirar, reactivacion, trasReactivar };
    });
    expect(r.renombrado).toBe("renombrado");
    expect(r.trasRenombrar).toMatchObject({ nombre: `Comuna Peñalolén ${r.s}`, nombre_normalizado: `comuna penalolen ${r.s}` });
    expect([r.retiro, r.trasRetirar, r.reactivacion, r.trasReactivar]).toEqual(["cambiado", false, "cambiado", true]);
    // El flag es de la fila, como en 374: retirar la provincia no toca el nodo del cantón.
    expect(r.hijoTrasRetirar).toBe(true);
  });

});
