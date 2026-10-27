import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { ModulosActivosRepository } from "@/lib/repositories/ModulosActivosRepository";
import { ModulosEmpresaRepository } from "@/lib/repositories/ModulosEmpresaRepository";
import { PremioRankingRepository } from "@/lib/repositories/PremioRankingRepository";
import { RankingSnapshotRepository } from "@/lib/repositories/RankingSnapshotRepository";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { exigirSinSuperadmin, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, tomarLockDeEscrituraReal } from "./_postgres-real";

// SL-23 (R22; design §5.2) — apagar un módulo NO toca los datos de negocio de la empresa, y al
// reencenderlo la app lee las mismas filas. Contra Postgres real, con «Ranking» como módulo:
//   · siembra: el podio de premios (3 filas) y una foto diaria del ranking con sus filas;
//   · se apaga por `ModulosEmpresaRepository.apagar` (la única escritura de `organizacion_modulo`);
//   · recuento y filas, medidos como dueño (sin RLS), idénticos antes y después;
//   · se reenciende por `ModulosEmpresaRepository.encender` y los repositorios de lectura de la app,
//     por el cliente con la extensión y en contexto de empresa, devuelven lo mismo que antes de apagar.
//
// LOCKS. Como `modulos-empresa-historial.test.ts`: este archivo COMMITEA un superadmin (el actor de
// apagar/encender) y filas de historial que viven hasta el `afterAll`. Orden: superadmin, luego 227.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const FECHA_FOTO = new Date("2026-10-20T00:00:00.000Z");

let base: PrismaClient;
let app: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};
let soltarEscritura: () => Promise<void> = async () => {};
let empresa: string;
let mensajero: string;
let superadmin: string;

/** Todo lo de Ranking de la empresa, medido como dueño: recuentos y filas completas. */
async function fotoComoDueno(organizacionId: string) {
  const [premios, dias, filas] = await Promise.all([
    base.premioRanking.findMany({ where: { organizacionId }, orderBy: { posicion: "asc" } }),
    base.rankingSnapshotDia.findMany({ where: { organizacionId }, orderBy: { fecha: "asc" } }),
    base.rankingSnapshotFila.findMany({ where: { organizacionId }, orderBy: { puesto: "asc" } }),
  ]);
  return {
    recuento: { premios: premios.length, dias: dias.length, filas: filas.length },
    // Decimal a string: `toEqual` sobre `Prisma.Decimal` compararía la instancia, no el valor.
    premios: premios.map((p) => ({ ...p, monto: p.monto?.toFixed(2) ?? null })),
    dias,
    filas: filas.map((f) => ({ ...f, premioMonto: f.premioMonto?.toFixed(2) ?? null })),
  };
}

/** Lo que lee la app de Ranking: el cliente con la extensión, en contexto de la empresa. */
function loQueLeeLaApp(organizacionId: string) {
  return conEmpresa(organizacionId, async () => ({
    premios: await new PremioRankingRepository(app).listar(),
    foto: await new RankingSnapshotRepository(app).obtenerPorFecha(FECHA_FOTO),
  }));
}

const rankingEncendido = (organizacionId: string) =>
  conEmpresa(organizacionId, async () => (await new ModulosActivosRepository(app).activos()).includes("ranking"));

describeSiHayBase("SL-23 — apagar un módulo no borra ni cambia sus datos; al reencender vuelven (R22)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
    soltarSuperadmin = await tomarLockDeSuperadmin();
    soltarEscritura = await tomarLockDeEscrituraReal();
    await exigirSinSuperadmin(base);
    const s = await base.$transaction(
      async (tx) => {
        const e = (await crearOrganizacion(tx, { nombre: "Empresa SL-23 R22" })).id;
        await fijarEmpresa(tx, e);
        const m = (await crearUsuarioDePrueba(tx, "mensajero")).id;
        await tx.premioRanking.createMany({
          data: [
            { organizacionId: e, posicion: 1, monto: "15000.00", descripcion: "Primer lugar" },
            { organizacionId: e, posicion: 2, monto: "7500.50", descripcion: null },
            { organizacionId: e, posicion: 3, monto: null, descripcion: "Mención" },
          ],
        });
        await tx.rankingSnapshotDia.create({
          data: {
            organizacionId: e,
            fecha: FECHA_FOTO,
            minAsignadasPodio: 5,
            filas: 1,
            filasSnapshot: {
              create: [
                {
                  organizacionId: e,
                  puesto: 1,
                  posicion: 1,
                  mensajeroId: m,
                  mensajeroNombre: "Mensajero R22",
                  entregadas: 9,
                  asignadas: 10,
                  premioMonto: "15000.00",
                  premioDescripcion: "Primer lugar",
                },
              ],
            },
          },
        });
        await tx.organizacionModulo.create({ data: { organizacionId: e, modulo: "ranking" } });
        // '' vuelve NULL el DEFAULT de `usuario.organizacion_id`: el superadmin no tiene empresa.
        await fijarEmpresa(tx, "");
        const sa = (await crearUsuarioDePrueba(tx, "superadmin")).id;
        return { e, m, sa };
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
    empresa = s.e;
    mensajero = s.m;
    superadmin = s.sa;
    // Siembra comprobada: si no está, «los datos siguen» no diría nada.
    const foto = await fotoComoDueno(empresa);
    expect(foto.recuento).toEqual({ premios: 3, dias: 1, filas: 1 });
    expect(await rankingEncendido(empresa)).toBe(true);
  }, 60_000);

  afterAll(async () => {
    try {
      if (base && empresa) {
        await base.historialAccion.deleteMany({ where: { organizacionId: empresa } });
        // Las filas de la foto caen con su día (ON DELETE CASCADE); los módulos, con la empresa.
        await base.rankingSnapshotDia.deleteMany({ where: { organizacionId: empresa } });
        await base.premioRanking.deleteMany({ where: { organizacionId: empresa } });
        if (mensajero) await base.usuario.deleteMany({ where: { id: mensajero } });
        await base.organizacion.deleteMany({ where: { id: empresa } });
      }
      if (base && superadmin) await base.usuario.deleteMany({ where: { id: superadmin } });
    } finally {
      await soltarEscritura();
      await soltarSuperadmin();
      await base?.$disconnect();
    }
  }, 120_000);

  it("R22 — apagar Ranking deja el mismo recuento y las mismas filas; al reencenderlo la app lee las mismas filas", async () => {
    const repo = new ModulosEmpresaRepository(app);
    const antes = await fotoComoDueno(empresa);
    const appAntes = await loQueLeeLaApp(empresa);
    // Control de la lectura de la app: con datos de verdad, no un vacío que coincidiría con otro vacío.
    expect(appAntes.premios).toHaveLength(3);
    expect(appAntes.foto?.filas).toHaveLength(1);

    expect(await repo.apagar(empresa, "ranking", superadmin)).toBe(true);
    expect(await rankingEncendido(empresa)).toBe(false);
    expect(await fotoComoDueno(empresa)).toEqual(antes);

    expect(await repo.encender(empresa, "ranking", superadmin)).toBe(true);
    expect(await rankingEncendido(empresa)).toBe(true);
    expect(await fotoComoDueno(empresa)).toEqual(antes);
    expect(await loQueLeeLaApp(empresa)).toEqual(appAntes);
  }, 60_000);
});
