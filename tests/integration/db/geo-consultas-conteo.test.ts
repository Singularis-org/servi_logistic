import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import type { NivelGeografico } from "@/lib/types/geografia-nodo";
import * as hoy from "@/scripts/geo-equivalencia/consultas-de-hoy";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais } from "@/tests/fabricas/paises";
import type { EmpresaGeo44 } from "./_fixtures/geo-44";
import { crearEscenarioGeo65, sembrarOrdenIncoherente, type EscenarioGeo65 } from "./_fixtures/geo-65";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-65 (T3.4; R9–R12; design §5, §14) — EL CONTEO DE ORDENES SIN ENTREGAR BAJO UN NODO, POR EL
// LUGAR DE LA ORDEN Y EL CATALOGO DEL PAIS, contra la copia congelada de hoy
// (`scripts/geo-equivalencia/consultas-de-hoy.ts`) y sobre Postgres real.
//
// El conteo corre en produccion en `comoPlataforma` (superadmin, sin empresa), y asi corre aqui:
// como dueño de la conexion, sin RLS de empresa, sobre la transaccion revertida del test.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface NodoContado {
  nivel: NivelGeografico;
  id: string;
}

/** Todos los nodos de la geografia de una empresa del fixture, con su nivel. */
function nodosDe(e: EmpresaGeo44): NodoContado[] {
  const g = e.geo;
  return [
    { nivel: "provincia", id: g.provinciaId },
    { nivel: "canton", id: g.cantonId },
    { nivel: "canton", id: g.cantonRetiradoId },
    { nivel: "distrito", id: g.distritoCentralId },
    { nivel: "distrito", id: g.distritoDosZonasId },
    { nivel: "distrito", id: g.distritoSinZonaId },
    { nivel: "distrito", id: g.distritoRetiradoId },
    { nivel: "distrito", id: g.distritoBajoCantonRetiradoId },
  ];
}

function enPlataforma<T>(fn: () => Promise<T>): Promise<T> {
  return comoPlataforma("SLT-65", "test del conteo sin entregar", fn);
}

/** Para cada nodo, el conteo nuevo y el de hoy, leidos en la misma foto. */
async function contarAmbos(tx: TxDeTest, nodos: readonly NodoContado[]) {
  const cliente = clienteConSavepoint(tx);
  return enPlataforma(async () => {
    const salida: { nodo: NodoContado; nuevo: number; deHoy: number }[] = [];
    for (const nodo of nodos) {
      salida.push({
        nodo,
        nuevo: await new OrdenRepository(cliente).contarSinEntregarPorNodoGeografico(nodo.nivel, nodo.id),
        deHoy: await hoy.contarSinEntregarDeHoy(cliente, nodo.nivel, nodo.id),
      });
    }
    return salida;
  });
}

/** Los nodos donde el nuevo y el de hoy no dan lo mismo, con la diferencia (nuevo - hoy). */
function diferencias(conteos: { nodo: NodoContado; nuevo: number; deHoy: number }[]) {
  return conteos.filter((c) => c.nuevo !== c.deHoy).map((c) => ({ id: c.nodo.id, delta: c.nuevo - c.deHoy }));
}

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, provincia_id, canton_id, distrito_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-65', '70706565', 'Direccion SLT-65', $4, $5, $6, $7, $8, '1000', 'caja', now(), now())`;

/** Una segunda empresa en el pais de `e`, con una orden viva en el distrito central de `e`. */
async function otraEmpresaConOrdenEn(tx: TxDeTest, e: EmpresaGeo44): Promise<string> {
  await comoDueno(tx);
  const { id: empresaId } = await crearOrganizacionEnPais(tx, e.paisId);
  await fijarEmpresa(tx, empresaId);
  const fks = await crearFksDeOrden(tx);
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    INSERTAR_ORDEN,
    id,
    `SLT65-${id.slice(0, 8)}`,
    fks.estatusId,
    fks.tiendaId,
    fks.zonaId,
    e.geo.provinciaId,
    e.geo.cantonId,
    e.geo.distritoCentralId,
  );
  return id;
}

describeSiHayBase("SLT-65 T3.4 — el conteo sin entregar cuenta por el lugar y el catalogo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo65) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioGeo65(tx)));
  }

  it("R9, R11: para cada provincia, canton y distrito del fixture, el nuevo da lo de hoy", async () => {
    const r = await conEscenario(async (tx, e) => ({
      cr: await contarAmbos(tx, nodosDe(e.cr.base)),
      xa: await contarAmbos(tx, nodosDe(e.xa.base)),
    }));

    for (const conteos of [r.cr, r.xa]) {
      expect(diferencias(conteos)).toEqual([]);
      const de = (nivel: NivelGeografico) => conteos.filter((c) => c.nodo.nivel === nivel).map((c) => c.nuevo);
      // Antivacio: la provincia cuenta las diez ordenes vivas (las once del fixture menos la
      // entregada), y los cantones cuentan tambien las que no tienen distrito.
      expect(de("provincia")).toEqual([10]);
      expect(de("canton").reduce((a, b) => a + b, 0)).toBe(10);
      // Y los distritos solo las que tienen distrito: las tres sin distrito no caen en ninguno.
      expect(de("distrito").reduce((a, b) => a + b, 0)).toBe(7);
    }
  });

  it("R10: un nodo que no existe, o pedido con otro nivel, cuenta 0 (como hoy)", async () => {
    const r = await conEscenario(async (tx, e) => {
      const g = e.cr.base.geo;
      return contarAmbos(tx, [
        { nivel: "provincia", id: randomUUID() },
        { nivel: "distrito", id: g.cantonId },
        { nivel: "canton", id: g.distritoCentralId },
        { nivel: "provincia", id: g.cantonId },
        { nivel: "canton", id: g.provinciaId },
      ]);
    });
    expect(r.map((c) => c.nuevo)).toEqual([0, 0, 0, 0, 0]);
    expect(r.map((c) => c.deHoy)).toEqual([0, 0, 0, 0, 0]);
  });

  it("R11 (contraprueba): con una orden de cadena incoherente, la diferencia aparece y es solo esa orden", async () => {
    const r = await conEscenario(async (tx, e) => {
      const ordenId = await sembrarOrdenIncoherente(tx, e.cr.base);
      await comoDueno(tx);
      const conIncoherente = await contarAmbos(tx, nodosDe(e.cr.base));
      // Sin esa orden (borrada), las cifras vuelven a coincidir: la diferencia era solo ella.
      await tx.orden.update({ where: { id: ordenId }, data: { deletedAt: new Date() } });
      const sinElla = await contarAmbos(tx, nodosDe(e.cr.base));
      return { g: e.cr.base.geo, conIncoherente, sinElla };
    });

    // Su distrito cuelga del canton retirado, pero su `canton_id` es el activo: hoy cuenta en el
    // activo y lo nuevo en el retirado. La provincia y el distrito dan lo mismo.
    expect(diferencias(r.conIncoherente)).toEqual([
      { id: r.g.cantonId, delta: -1 },
      { id: r.g.cantonRetiradoId, delta: 1 },
    ]);
    expect(diferencias(r.sinElla)).toEqual([]);
  });

  it("R12: en plataforma, un nodo de XA cuenta con el catalogo de XA y suma ordenes de dos empresas", async () => {
    const r = await conEscenario(async (tx, e) => {
      const nodo: NodoContado = { nivel: "distrito", id: e.xa.base.geo.distritoCentralId };
      const [antes] = await contarAmbos(tx, [nodo]);
      await otraEmpresaConOrdenEn(tx, e.xa.base);
      await comoDueno(tx);
      const despues = await contarAmbos(tx, [nodo, { nivel: "provincia", id: e.xa.base.geo.provinciaId }]);
      return { antes, despues };
    });

    // El distrito central de XA tiene cuatro vivas de la empresa del fixture (`conDistritoConMarca`
    // y las tres desalineadas); la orden de la segunda empresa suma una.
    expect(r.antes.nuevo).toBe(4);
    expect(r.despues.map((c) => c.nuevo)).toEqual([5, 11]);
    expect(diferencias(r.despues)).toEqual([]);
  });
});
