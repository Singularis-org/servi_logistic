import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-52 T6.5 (R12) — GUARDAR UNA ZONA NO VACIA SUS GRUPOS DE DISTRITOS (Postgres real).
//
// `grupo_distritos_distrito` cuelga de `zona_distrito` con una FK CASCADE por `(zona_id,
// distrito_id)`: sacar un distrito de la zona lo saca de su grupo (R12). Con el `deleteMany({
// zonaId })` + `createMany` que `ZonaRepository.update` hacia en cada guardado, esa misma cascada
// vaciaba TODOS los grupos de la zona aunque no cambiara ningun distrito. Lo que se mide vive en la
// FK, asi que solo se ve contra la base: un doble de Prisma no tiene cascadas.
//
// Dentro de una transaccion que siempre se revierte. Cada caso afirma su PREMISA (los grupos
// sembrados tienen sus distritos) antes del efecto. Sin base, `describe.skip` VISIBLE.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Escenario {
  tx: TxDeTest;
  repo: ZonaRepository;
  usuarioId: string;
  zonaId: string;
  nombre: string;
  d1: string;
  d2: string;
  d3: string;
  d4: string;
  /** Norte = {d1, d2}; Sur = {d3}. d4 es del canton pero no de la zona. */
  norte: string;
  sur: string;
  /** Un valor de cobro al nivel del grupo Norte. */
  valorNorte: string;
}

async function distritosDelGrupo(tx: TxDeTest, grupoId: string): Promise<string[]> {
  const filas = await tx.grupoDistritosDistrito.findMany({
    where: { grupoId },
    select: { distritoId: true },
    orderBy: { distritoId: "asc" },
  });
  return filas.map((f) => f.distritoId);
}

async function distritosDeLaZona(tx: TxDeTest, zonaId: string): Promise<string[]> {
  const filas = await tx.zonaDistrito.findMany({
    where: { zonaId },
    select: { distritoId: true },
    orderBy: { distritoId: "asc" },
  });
  return filas.map((f) => f.distritoId);
}

/** El `id` de cada fila de `zona_distrito` por distrito: un reemplazo completo los regenera. */
async function idsDeZonaDistrito(tx: TxDeTest, zonaId: string): Promise<Record<string, string>> {
  const filas = await tx.zonaDistrito.findMany({ where: { zonaId }, select: { id: true, distritoId: true } });
  return Object.fromEntries(filas.map((f) => [f.distritoId, f.id]));
}

describeSiHayBase("SLT-52 T6.5 — ZonaRepository.update conserva los grupos de distritos (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function conEscenario(fn: (e: Escenario) => Promise<void>): Promise<void> {
    await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const fks = await crearFksDeOrden(tx);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const distritos = await tx.distrito.findMany({
        where: { cantonId: fks.cantonId },
        select: { id: true },
        orderBy: { id: "asc" },
        take: 4,
      });
      if (distritos.length < 4) throw new Error("Cartago/Cartago necesita al menos 4 distritos");
      const [d1, d2, d3, d4] = distritos.map((d) => d.id) as [string, string, string, string];
      const zonaId = fks.zonaId;
      const { nombre } = await tx.zona.findUniqueOrThrow({ where: { id: zonaId }, select: { nombre: true } });
      await tx.zonaDistrito.createMany({ data: [d1, d2, d3].map((distritoId) => ({ zonaId, distritoId })) });
      const norte = (await tx.grupoDistritos.create({ data: { zonaId, nombre: "Norte" }, select: { id: true } })).id;
      const sur = (await tx.grupoDistritos.create({ data: { zonaId, nombre: "Sur" }, select: { id: true } })).id;
      await tx.grupoDistritosDistrito.createMany({
        data: [
          { grupoId: norte, zonaId, distritoId: d1 },
          { grupoId: norte, zonaId, distritoId: d2 },
          { grupoId: sur, zonaId, distritoId: d3 },
        ],
      });
      const valorNorte = (
        await tx.tarifaValor.create({
          data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ivaPct: "13.00", zonaId, grupoId: norte },
          select: { id: true },
        })
      ).id;

      // PREMISA: lo sembrado esta, o el «se conserva» seria verde por vacio.
      expect(await distritosDelGrupo(tx, norte)).toEqual([d1, d2].sort());
      expect(await distritosDelGrupo(tx, sur)).toEqual([d3]);

      await fn({
        tx,
        repo: new ZonaRepository(clienteConSavepoint(tx)),
        usuarioId: maestro.id,
        zonaId,
        nombre,
        d1,
        d2,
        d3,
        d4,
        norte,
        sur,
        valorNorte,
      });
    });
  }

  it("R12 — guardar la zona SIN cambiar distritos conserva cada grupo con sus distritos, y el valor del grupo", async () => {
    await conEscenario(async (e) => {
      const r = await e.repo.update(e.zonaId, { nombre: e.nombre, distritoIds: [e.d1, e.d2, e.d3] }, e.usuarioId);
      expect(r.estado).toBe("ok");

      expect(await distritosDeLaZona(e.tx, e.zonaId)).toEqual([e.d1, e.d2, e.d3].sort());
      expect(await distritosDelGrupo(e.tx, e.norte)).toEqual([e.d1, e.d2].sort());
      expect(await distritosDelGrupo(e.tx, e.sur)).toEqual([e.d3]);
      expect(await e.tx.tarifaValor.count({ where: { id: e.valorNorte } })).toBe(1);
    });
  });

  it("R12 — quitar d2 de la zona (y meter d4) saca a d2 de su grupo, y SOLO a el", async () => {
    await conEscenario(async (e) => {
      const idsAntes = await idsDeZonaDistrito(e.tx, e.zonaId);
      const r = await e.repo.update(e.zonaId, { nombre: e.nombre, distritoIds: [e.d1, e.d3, e.d4] }, e.usuarioId);
      expect(r.estado).toBe("ok");

      expect(await distritosDeLaZona(e.tx, e.zonaId)).toEqual([e.d1, e.d3, e.d4].sort());
      // Los que se quedan conservan su fila; solo d4 es nueva.
      const idsDespues = await idsDeZonaDistrito(e.tx, e.zonaId);
      expect([idsDespues[e.d1], idsDespues[e.d3]]).toEqual([idsAntes[e.d1], idsAntes[e.d3]]);
      expect(await distritosDelGrupo(e.tx, e.norte)).toEqual([e.d1]);
      expect(await distritosDelGrupo(e.tx, e.sur)).toEqual([e.d3]);
      // El grupo sigue existiendo (con un distrito menos) y su valor tambien.
      expect(await e.tx.grupoDistritos.count({ where: { zonaId: e.zonaId } })).toBe(2);
      expect(await e.tx.tarifaValor.count({ where: { id: e.valorNorte } })).toBe(1);
    });
  });
});
