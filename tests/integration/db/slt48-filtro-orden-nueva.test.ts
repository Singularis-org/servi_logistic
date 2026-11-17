import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { ListOrdenesWhere } from "@/lib/interfaces/repositories/IOrdenRepository";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { condicionesDeLugar, resolverLugar } from "@/lib/repositories/_shared/lugares-del-filtro";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo47, DATOS_PERSONALES_GEO47, type EmpresaGeo47 } from "./_fixtures/geo-47";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-48 (T2.5; design §5; R23, R24) — EL FILTRO DE LUGAR Y EL CONTEO SIN ENTREGAR VEN LA ORDEN NUEVA.
//
// Una orden nueva guarda su nodo y deja las 3 FK en NULL (R15). Sobre el fixture `geo-47` se le suma a
// cada empresa una orden asi en un distrito («San Rafael» 1), y en `XA` otra en un sector de nivel 4
// (solo en el catalogo). El filtro de `/ordenes`, el de analitica (`sqlLugarEn`) y el conteo sin
// entregar de un lugar la encuentran por su nodo y por cualquier ancestro; por las FK no la veria nadie.
// Que sobre las ordenes viejas den lo de hoy lo prueban `geo-filtros-lugar`, `geo-analitica-lugar` y
// `geografia-ordenes-sin-entregar`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo47, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.base.base.empresaId);
  try {
    return await conEmpresa(e.base.base.empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

/** Una orden «nueva»: con su nodo y las 3 FK en NULL, en `en_preparacion` y la zona central. */
async function ordenNueva(tx: TxDeTest, e: EmpresaGeo47, nodoId: string): Promise<string> {
  await comoDueno(tx);
  await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', $1, true)`, e.base.base.empresaId);
  const estado = await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_preparacion" }, select: { id: true } });
  const [destinatario, telefono, direccion] = DATOS_PERSONALES_GEO47;
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id, zona_id,
                        nodo_geografico_id, producto, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'caja', now(), now())`,
    id,
    `SLT48-${id.slice(0, 8)}`,
    estado.id,
    destinatario,
    telefono,
    direccion,
    e.base.base.tiendaId,
    e.base.base.zonas.centralId,
    nodoId,
  );
  return id;
}

/** Un sector de nivel 4 bajo el distrito, con el tipo `nivel_4` del pais (se crea si no esta). */
async function sectorBajo(tx: TxDeTest, e: EmpresaGeo47, distritoId: string): Promise<string> {
  await comoDueno(tx);
  const paisId = e.base.base.paisId;
  const tipo = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM tipo_nivel_geografico WHERE pais_id = $1 AND clave = 'nivel_4'`,
    paisId,
  );
  let tipoId = tipo[0]?.id;
  if (tipoId === undefined) {
    tipoId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural) VALUES ($1, $2, 'nivel_4', 'Sector', 'Sectores')`,
      tipoId,
      paisId,
    );
  }
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, activo)
     VALUES ($1, $2, $3, $4, 4, $5, '', true)`,
    id,
    paisId,
    tipoId,
    distritoId,
    `Sector SLT48 ${id.slice(0, 6)}`,
  );
  return id;
}

async function listado(tx: TxDeTest, where: ListOrdenesWhere): Promise<string[]> {
  const r = await new OrdenRepository(clienteConSavepoint(tx)).list({
    where,
    sortBy: "created_at",
    sortDir: "desc",
    skip: 0,
    take: 500,
  });
  return r.items.map((o) => o.id);
}

/** La lectura de analitica: `orden o` con la condicion de lugar resuelta por el catalogo. */
async function analitica(tx: TxDeTest, lugarIds: string[]): Promise<string[]> {
  const cliente = clienteConSavepoint(tx);
  const { catalogo } = await new CatalogoGeograficoRepository(cliente).deLaEmpresa();
  const [cond] = condicionesDeLugar({ lugar: resolverLugar(catalogo, lugarIds) });
  const filas = await cliente.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT o."id" FROM "orden" o WHERE o."deleted_at" IS NULL AND ${cond}`,
  );
  return filas.map((f) => f.id);
}

describeSiHayBase("SLT-48 R23/R24 — la orden nueva (FK en NULL) entra por su nodo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R23: el filtro de /ordenes y el de analitica la ven por su distrito, su canton y su provincia; R24: el conteo sin entregar tambien", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const salida = [];
      for (const emp of [e.cr, e.xa]) {
        const h = emp.homonimos;
        const nueva = await ordenNueva(tx, emp, h.sanRafael1Id);
        const fks = await tx.$queryRawUnsafe<{ p: string | null; c: string | null; d: string | null; n: string }[]>(
          `SELECT provincia_id AS p, canton_id AS c, distrito_id AS d, nodo_geografico_id AS n FROM orden WHERE id = $1`,
          nueva,
        );
        const lugares = [h.sanRafael1Id, h.cantonCentral1Id, emp.base.base.geo.provinciaId];
        const leido = await comoLaEmpresa(tx, emp, async () => {
          const porLugar = [];
          for (const lugar of lugares) {
            porLugar.push({
              listado: await listado(tx, { lugarIds: [lugar] }),
              analitica: await analitica(tx, [lugar]),
            });
          }
          const repo = new OrdenRepository(clienteConSavepoint(tx));
          return {
            porLugar,
            otroDistrito: await listado(tx, { lugarIds: [h.sanRafael2Id] }),
            sinEntregar: {
              distrito: await repo.contarSinEntregarPorNodoGeografico("distrito", h.sanRafael1Id),
              canton: await repo.contarSinEntregarPorNodoGeografico("canton", h.cantonCentral1Id),
            },
          };
        });
        salida.push({ emp, nueva, fks: fks[0], ...leido });
      }
      return salida;
    });

    for (const x of r) {
      // Es de verdad una orden nueva: nodo puesto y las 3 FK en NULL (el trigger no las rellena).
      expect(x.fks).toEqual({ p: null, c: null, d: null, n: x.emp.homonimos.sanRafael1Id });
      for (const { listado: l, analitica: a } of x.porLugar) {
        expect(l).toContain(x.nueva);
        expect(a).toContain(x.nueva);
      }
      // Y no entra por un lugar que no es el suyo.
      expect(x.otroDistrito).not.toContain(x.nueva);
      // La vieja de San Rafael 1 y la nueva; el canton suma ademas la vieja sin distrito.
      expect(x.sinEntregar.distrito).toBe(2);
      expect(x.sinEntregar.canton).toBe(3);
    }
  }, 180_000);

  it("R23: en XA una orden de nivel 4 entra por el sector, por su distrito y por su canton", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const h = e.xa.homonimos;
      const sector = await sectorBajo(tx, e.xa, h.sanRafael1Id);
      const nueva = await ordenNueva(tx, e.xa, sector);
      return comoLaEmpresa(tx, e.xa, async () => ({
        nueva,
        sector: await listado(tx, { lugarIds: [sector] }),
        distrito: await listado(tx, { lugarIds: [h.sanRafael1Id] }),
        canton: await analitica(tx, [h.cantonCentral1Id]),
      }));
    });
    expect(r.sector).toEqual([r.nueva]);
    expect(r.distrito).toContain(r.nueva);
    expect(r.canton).toContain(r.nueva);
  }, 180_000);
});
