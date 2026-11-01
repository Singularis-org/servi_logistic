import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import type { UpdateZonaData, UpdateZonaResult } from "@/lib/interfaces/repositories/IZonaRepository";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ SLT-76 / T6 (R8, R9, R10) — EL RASTRO DE LOS DISTRITOS DE UNA ZONA, CONTRA POSTGRES REAL.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// La geografia es SINTETICA y propia del caso: una provincia con nombre unico y dentro dos
// cantones, «C1» y «C3», con los distritos «D1», «D2» (en C1) y «D3» (en C3). Asi los textos que
// se esperan —«D1 (C1)», «D3 (C3)»— van escritos a mano y no salen de la funcion que los genera.
//
// El guardado corre con el repositorio REAL en el rol de la app (`comoApp`), asi que la RLS de
// `zona_distrito` e `historial_accion` actua como en produccion.
//
// EL CLIENTE DEL REPOSITORIO SOLO SABE ABRIR SU TRANSACCION (`clienteSoloTransaccion`): su
// `$transaction` abre un SAVEPOINT real sobre la tx del test, y cualquier otro uso de
// `this.prisma` LANZA. Con `clienteConSavepoint` a secas, `this.prisma` y la `tx` del callback son
// el mismo objeto, y escribir el rastro por `this.prisma` (fuera de la transaccion en produccion)
// pasaria en verde.
//
// ⚠️ NADA DE `if (!datos) return;`: cada caso afirma su premisa antes de su efecto.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ACCION = "zona_distrito_cambiado";
const SUFIJO = `SLT76-${Date.now().toString(36)}`;
const unico = (): string => `${SUFIJO}-${randomUUID().slice(0, 6)}`;
const SINPE = { sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" };

/** Solo `$transaction`: cualquier otro acceso a `this.prisma` revienta con un mensaje. */
function clienteSoloTransaccion(tx: TxDeTest): PrismaClient {
  const dentro = clienteConSavepoint(tx);
  return new Proxy({} as object, {
    get(_objetivo, prop) {
      if (prop === "$transaction") return dentro.$transaction;
      if (prop === "then") return undefined;
      throw new Error(`\`this.prisma.${String(prop)}\` usado fuera de la transaccion del guardado`);
    },
  }) as PrismaClient;
}

function soloOk(res: UpdateZonaResult): Extract<UpdateZonaResult, { estado: "ok" }> {
  if (res.estado !== "ok") throw new Error(`se esperaba \`ok\` y llego \`${res.estado}\``);
  return res;
}

interface Escenario {
  tx: TxDeTest;
  repo: ZonaRepository;
  maestro: string;
  zona: { id: string; nombre: string };
  otraZona: { id: string; nombre: string };
  d: { d1: string; d2: string; d3: string; dOtra: string; dLargo: string };
  datos: (distritoIds: string[], nombre?: string) => UpdateZonaData;
  filas: () => Promise<
    {
      entidadTipo: string;
      entidadId: string | null;
      entidadEtiqueta: string;
      valorAnterior: string | null;
      valorNuevo: string | null;
      loteId: string;
      actorUsuarioId: string | null;
      actorRol: string | null;
    }[]
  >;
}

describeSiHayBase("SLT-76 — rastro de los distritos de una zona (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function conEscenario<T>(fn: (e: Escenario) => Promise<T>): Promise<T> {
    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);

      // ── La siembra, como dueno de las tablas. ────────────────────────────────────────────
      const empresa = (await crearOrganizacion(tx, { nombre: `Empresa ${unico()}` })).id;
      const provincia = await tx.provincia.create({
        data: { nombre: `Provincia ${unico()}` },
        select: { id: true },
      });
      const c1 = await tx.canton.create({ data: { nombre: "C1", provinciaId: provincia.id }, select: { id: true } });
      const c3 = await tx.canton.create({ data: { nombre: "C3", provinciaId: provincia.id }, select: { id: true } });
      const distrito = async (nombre: string, cantonId: string) =>
        (await tx.distrito.create({ data: { nombre, cantonId }, select: { id: true } })).id;
      const d = {
        d1: await distrito("D1", c1.id),
        d2: await distrito("D2", c1.id),
        d3: await distrito("D3", c3.id),
        dOtra: await distrito("DOtra", c3.id),
        // 70 caracteres de nombre: con « (C1)» el texto mide 75 y la columna, 60.
        dLargo: await distrito(`L${"x".repeat(69)}`, c1.id),
      };

      await fijarEmpresa(tx, empresa);
      const maestro = (await crearUsuarioDePrueba(tx, "maestro")).id;
      const crearZona = async (etiqueta: string) => {
        const nombre = `Zona ${etiqueta} ${unico()}`;
        const z = await tx.zona.create({ data: { ...SINPE, nombre }, select: { id: true } });
        return { id: z.id, nombre };
      };
      const zona = await crearZona("Z");
      const otraZona = await crearZona("Otra");
      await tx.zonaDistrito.create({ data: { zonaId: zona.id, distritoId: d.d1 } });
      await tx.zonaDistrito.create({ data: { zonaId: zona.id, distritoId: d.d2 } });
      await tx.zonaDistrito.create({ data: { zonaId: otraZona.id, distritoId: d.dOtra } });

      // ── A partir de aqui, la app: rol `servi_app` y la empresa del caso. ─────────────────
      await comoApp(tx, empresa);
      const [{ rol }] = await tx.$queryRawUnsafe<{ rol: string }[]>(`SELECT current_user AS rol`);
      if (rol !== "servi_app") throw new Error(`el escenario no bajo al rol de la app: ${rol}`);

      return fn({
        tx,
        repo: new ZonaRepository(clienteSoloTransaccion(tx)),
        maestro,
        zona,
        otraZona,
        d,
        datos: (distritoIds, nombre = zona.nombre) => ({
          nombre,
          cobroVehiculo: false,
          distritoIds,
          tarifas: [],
        }),
        filas: () =>
          tx.historialAccion.findMany({
            where: { accion: ACCION },
            select: {
              entidadTipo: true,
              entidadId: true,
              entidadEtiqueta: true,
              valorAnterior: true,
              valorNuevo: true,
              loteId: true,
              actorUsuarioId: true,
              actorRol: true,
            },
            orderBy: [{ valorAnterior: { sort: "asc", nulls: "last" } }],
          }),
      });
    });
  }

  it("⭑ R8/R9: {D1, D2} -> {D2, D3} deja DOS filas con el mismo lote: D1 quitado y D3 añadido", async () => {
    const medido = await conEscenario(async (e) => {
      const antes = await e.filas();
      const nombreNuevo = `Zona Renombrada ${unico()}`;
      const res = soloOk(await e.repo.update(e.zona.id, e.datos([e.d.d2, e.d.d3], nombreNuevo), e.maestro));
      return { antes, res, filas: await e.filas(), zonaId: e.zona.id, maestro: e.maestro, nombreNuevo };
    });

    // Premisa: la empresa recien creada no tenia ninguna fila de esta accion.
    expect(medido.antes).toEqual([]);
    expect(medido.res.estado).toBe("ok");

    expect(medido.filas).toHaveLength(2);
    const [quitado, anadido] = medido.filas;
    // Literales escritos a mano (design §6.5).
    expect({ anterior: quitado.valorAnterior, nuevo: quitado.valorNuevo }).toEqual({
      anterior: "D1 (C1)",
      nuevo: null,
    });
    expect({ anterior: anadido.valorAnterior, nuevo: anadido.valorNuevo }).toEqual({
      anterior: null,
      nuevo: "D3 (C3)",
    });
    // R8: un solo lote por guardado.
    expect(new Set(medido.filas.map((f) => f.loteId)).size).toBe(1);
    // R9: la zona, con su nombre DESPUES del guardado, y el actor congelado.
    for (const f of medido.filas) {
      expect(f.entidadTipo).toBe("zona");
      expect(f.entidadId).toBe(medido.zonaId);
      expect(f.entidadEtiqueta).toBe(medido.nombreNuevo);
      expect(f.actorUsuarioId).toBe(medido.maestro);
      expect(f.actorRol).toBe("maestro");
    }
  }, 60_000);

  it("⭑ R10: guardar otra vez {D2, D3} (y reordenados) no deja ninguna fila nueva", async () => {
    const medido = await conEscenario(async (e) => {
      soloOk(await e.repo.update(e.zona.id, e.datos([e.d.d2, e.d.d3]), e.maestro));
      const trasPrimero = (await e.filas()).length;
      soloOk(await e.repo.update(e.zona.id, e.datos([e.d.d3, e.d.d2]), e.maestro));
      return { trasPrimero, trasSegundo: (await e.filas()).length };
    });

    // Premisa: el primer guardado SI escribio (si no, el 0 de abajo no diria nada).
    expect(medido.trasPrimero).toBe(2);
    expect(medido.trasSegundo).toBe(2);
  }, 60_000);

  it("⭑ R10: un guardado rechazado por un distrito de otra zona no deja ninguna fila", async () => {
    const medido = await conEscenario(async (e) => {
      const res = await e.repo.update(e.zona.id, e.datos([e.d.d2, e.d.dOtra, e.d.d3]), e.maestro);
      const distritos = (
        await e.tx.zonaDistrito.findMany({ where: { zonaId: e.zona.id }, select: { distritoId: true } })
      )
        .map((f) => f.distritoId)
        .sort();
      return { res, filas: await e.filas(), distritos, esperados: [e.d.d1, e.d.d2].sort() };
    });

    expect(medido.res.estado).toBe("distrito_en_otra_zona");
    // Premisa: el guardado no se aplico, la zona sigue con {D1, D2}.
    expect(medido.distritos).toEqual(medido.esperados);
    expect(medido.filas).toEqual([]);
  }, 60_000);

  it("⭑ R9: un distrito con nombre de 70 caracteres queda recortado a 60 en la fila", async () => {
    const medido = await conEscenario(async (e) => {
      soloOk(await e.repo.update(e.zona.id, e.datos([e.d.d1, e.d.d2, e.d.dLargo]), e.maestro));
      return { filas: await e.filas() };
    });

    expect(medido.filas).toHaveLength(1);
    expect(medido.filas[0].valorAnterior).toBeNull();
    // «L» + 59 «x»: los 60 primeros de «Lxxx…x (C1)».
    expect(medido.filas[0].valorNuevo).toBe(`L${"x".repeat(59)}`);
    expect(medido.filas[0].valorNuevo).toHaveLength(60);
  }, 60_000);
});
