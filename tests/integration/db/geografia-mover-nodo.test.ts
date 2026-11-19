import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { DatosDeMover } from "@/lib/interfaces/repositories/IGeoRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { PAIS_CUATRO_NIVELES, claveDeRuta, sembrarPaisDePruebaGeo, type PaisSembrado } from "@/tests/fixtures/paises-de-prueba-geo";
import { revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, RegistroCaido, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-48 (T3.1, T3.2; design §7.1; R34–R38, P4) — MOVER UN NODO, contra Postgres.
//
// El pais de prueba `XP` de 4 niveles (`tests/fixtures/paises-de-prueba-geo.ts`):
//
//   Valparaíso ── Marga Marga ─┬─ Quilpué ── El Belloto
//                              └─ Villa Alemana [retirada] ── Peñablanca
//   Ñuble ── Diguillín ── Chillán ── Centro
//
// Cada caso corre en una transaccion del dueño que se revierte (como corre la plataforma). Se mira que
// el exito escribe solo `padre_id` y su fila de historial en la misma transaccion (R38), que cada
// rechazo de R35 y el cambio concurrente (R37) no escriben nada, y que la vista previa (R36) da las
// rutas, los descendientes por nivel y corre las mismas validaciones sin escribir.
//
// Las ordenes del subarbol (R39–R41, P1) estan en `geografia-mover-nodo-ordenes.test.ts`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Escenario {
  tx: TxDeTest;
  repo: GeoRepository;
  pais: PaisSembrado;
  actorId: string;
  nodo: (...ruta: string[]) => string;
  /** El arbol de `XP` y su historial de plataforma: si no cambia, nada se escribio. */
  huella: () => Promise<string>;
}

async function conEscenario<T>(fn: (e: Escenario) => Promise<T>): Promise<T> {
  return revertida(base, async (tx) => {
    const pais = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
    const actor = await insertarUsuario(tx, await idDeRol(tx, "superadmin"), null);
    if (!actor.desenlace.ok) throw new Error(`no se sembro el superadmin: ${JSON.stringify(actor.desenlace)}`);
    const nodo = (...ruta: string[]) => {
      const id = pais.nodoPorRuta.get(claveDeRuta(ruta));
      if (id === undefined) throw new Error(`el fixture no tiene ${claveDeRuta(ruta)}`);
      return id;
    };
    const huella = async () => {
      const [f] = await tx.$queryRawUnsafe<{ h: string }[]>(
        `SELECT md5(
                  (SELECT string_agg(to_jsonb(n)::text, ',' ORDER BY n.id) FROM nodo_geografico n WHERE n.pais_id = 'XP')
                  || (SELECT count(*)::text FROM historial_plataforma h WHERE h.pais_id = 'XP')
                ) AS h`,
      );
      return f.h;
    };
    return fn({ tx, repo: new GeoRepository(clienteConSavepoint(tx)), pais, actorId: actor.id, nodo, huella });
  });
}

async function padreDe(tx: TxDeTest, id: string): Promise<string | null> {
  return (await tx.nodoGeografico.findUniqueOrThrow({ where: { id }, select: { padreId: true } })).padreId;
}

describeSiHayBase("SLT-48 R34–R38 — mover un nodo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R36: la vista previa da las rutas, los descendientes por nivel y el padre de hoy, sin escribir", async () => {
    const r = await conEscenario(async (e) => {
      const antes = await e.huella();
      const vista = await e.repo.vistaPreviaMover(e.nodo("Valparaíso", "Marga Marga"), e.nodo("Ñuble"));
      return { vista, igual: (await e.huella()) === antes, e: { nodo: e.nodo } };
    });

    expect(r.igual).toBe(true);
    expect(r.vista).toEqual({
      estado: "ok",
      vista: {
        nodo: { id: r.e.nodo("Valparaíso", "Marga Marga"), nombre: "Marga Marga", profundidad: 2, tipoSingular: "Provincia" },
        padreIdAnterior: r.e.nodo("Valparaíso"),
        rutaActual: [
          { id: r.e.nodo("Valparaíso"), nombre: "Valparaíso" },
          { id: r.e.nodo("Valparaíso", "Marga Marga"), nombre: "Marga Marga" },
        ],
        rutaNueva: [
          { id: r.e.nodo("Ñuble"), nombre: "Ñuble" },
          { id: r.e.nodo("Valparaíso", "Marga Marga"), nombre: "Marga Marga" },
        ],
        // Regla 1 de la maqueta: «2 comunas y 2 sectores» (la retirada y lo de debajo tambien cuelgan).
        descendientes: {
          total: 4,
          porNivel: [
            { profundidad: 3, tipoSingular: "Comuna", tipoPlural: "Comunas", cantidad: 2 },
            { profundidad: 4, tipoSingular: "Sector", tipoPlural: "Sectores", cantidad: 2 },
          ],
        },
        ordenesQueCambianDeNombre: 0,
        bloqueo: null,
      },
    });
  });

  it("R34, R38: mover escribe solo `padre_id` y su fila `nodo_geografico_movido`, en la misma transaccion", async () => {
    const r = await conEscenario(async (e) => {
      const quilpue = e.nodo("Valparaíso", "Marga Marga", "Quilpué");
      const belloto = e.nodo("Valparaíso", "Marga Marga", "Quilpué", "El Belloto");
      const diguillin = e.nodo("Ñuble", "Diguillín");
      const filaAntes = await e.tx.nodoGeografico.findUniqueOrThrow({ where: { id: quilpue } });
      const desenlace = await e.repo.mover(
        { id: quilpue, padreIdNuevo: diguillin, padreIdAnterior: e.nodo("Valparaíso", "Marga Marga") },
        e.actorId,
      );
      const filaDespues = await e.tx.nodoGeografico.findUniqueOrThrow({ where: { id: quilpue } });
      const historial = await e.tx.historialPlataforma.findMany({ where: { paisId: "XP" } });
      // R5: la vista `distrito` lo muestra bajo el canton nuevo en la misma transaccion.
      const [enVista] = await e.tx.$queryRawUnsafe<{ canton_id: string }[]>(`SELECT canton_id FROM distrito WHERE id = $1`, quilpue);
      return { desenlace, filaAntes, filaDespues, historial, enVista, quilpue, belloto, diguillin, actorId: e.actorId, padreBelloto: await padreDe(e.tx, belloto) };
    });

    expect(r.desenlace).toEqual({ estado: "movido" });
    const { padreId: padreAntes, ...restoAntes } = r.filaAntes;
    const { padreId: padreDespues, ...restoDespues } = r.filaDespues;
    expect(padreDespues).toBe(r.diguillin);
    expect(padreDespues).not.toBe(padreAntes);
    expect(restoDespues).toEqual(restoAntes);
    // Lo que cuelga sigue colgando del nodo, que no cambia de profundidad.
    expect(r.padreBelloto).toBe(r.quilpue);
    expect(r.enVista).toEqual({ canton_id: r.diguillin });

    expect(r.historial).toHaveLength(1);
    expect(r.historial[0]).toMatchObject({
      accion: "nodo_geografico_movido",
      entidadTipo: "nodo_geografico",
      entidadId: r.quilpue,
      entidadEtiqueta: "Quilpué · Diguillín · Ñuble",
      paisId: "XP",
      actorUsuarioId: r.actorId,
      valorAnterior: "Marga Marga · Valparaíso",
      valorNuevo: "Diguillín · Ñuble",
    });
    expect(r.historial[0].actorNombre).toEqual(expect.any(String));
  });

  it("R38: si la fila de historial no se puede escribir, el movimiento no persiste", async () => {
    const r = await conEscenario(async (e) => {
      const quilpue = e.nodo("Valparaíso", "Marga Marga", "Quilpué");
      const antes = await e.huella();
      const roto = new GeoRepository(clienteConSavepoint(e.tx, "plataforma"));
      const error = await roto
        .mover({ id: quilpue, padreIdNuevo: e.nodo("Ñuble", "Diguillín"), padreIdAnterior: e.nodo("Valparaíso", "Marga Marga") }, e.actorId)
        .then(() => null, (x: unknown) => x);
      return { error, igual: (await e.huella()) === antes, padre: await padreDe(e.tx, quilpue), margaMarga: e.nodo("Valparaíso", "Marga Marga") };
    });
    expect(r.error).toBeInstanceOf(RegistroCaido);
    expect(r.padre).toBe(r.margaMarga);
    expect(r.igual).toBe(true);
  });

  it("R35, P4: cada motivo se rechaza en la vista previa y al mover, sin escribir nada", async () => {
    const r = await conEscenario(async (e) => {
      const cr = await e.tx.nodoGeografico.findFirstOrThrow({ where: { paisId: "CR", profundidad: 2 }, select: { id: true } });
      const quilpue = e.nodo("Valparaíso", "Marga Marga", "Quilpué");
      const margaMarga = e.nodo("Valparaíso", "Marga Marga");
      const belloto = e.nodo("Valparaíso", "Marga Marga", "Quilpué", "El Belloto");
      const casos: [string, DatosDeMover][] = [
        ["es_raiz", { id: e.nodo("Valparaíso"), padreIdNuevo: e.nodo("Ñuble"), padreIdAnterior: e.nodo("Ñuble") }],
        ["destino_no_existe", { id: quilpue, padreIdNuevo: randomUUID(), padreIdAnterior: margaMarga }],
        ["destino_de_otro_pais", { id: quilpue, padreIdNuevo: cr.id, padreIdAnterior: margaMarga }],
        ["destino_de_otra_profundidad", { id: quilpue, padreIdNuevo: e.nodo("Ñuble"), padreIdAnterior: margaMarga }],
        ["destino_es_el_padre_actual", { id: quilpue, padreIdNuevo: margaMarga, padreIdAnterior: margaMarga }],
        // P4: Villa Alemana esta retirada (su propio flag).
        [
          "destino_retirado",
          { id: belloto, padreIdNuevo: e.nodo("Valparaíso", "Marga Marga", "Villa Alemana"), padreIdAnterior: quilpue },
        ],
      ];
      const antes = await e.huella();
      const salida: { caso: string; previa: unknown; mover: unknown }[] = [];
      for (const [caso, datos] of casos) {
        salida.push({
          caso,
          previa: await e.repo.vistaPreviaMover(datos.id, datos.padreIdNuevo),
          mover: await e.repo.mover(datos, e.actorId),
        });
      }
      const noExiste = {
        previa: await e.repo.vistaPreviaMover(randomUUID(), margaMarga),
        mover: await e.repo.mover({ id: randomUUID(), padreIdNuevo: margaMarga, padreIdAnterior: margaMarga }, e.actorId),
      };
      return { salida, noExiste, igual: (await e.huella()) === antes };
    });

    for (const { caso, previa, mover } of r.salida) {
      expect(previa, caso).toEqual({ estado: "invalido", motivo: caso });
      expect(mover, caso).toEqual({ estado: "invalido", motivo: caso });
    }
    expect(r.noExiste).toEqual({ previa: { estado: "no_existe" }, mover: { estado: "no_existe" } });
    expect(r.igual).toBe(true);
  });

  it("P4: un destino activo bajo un antepasado retirado tambien esta retirado (en cascada)", async () => {
    const r = await conEscenario(async (e) => {
      const belloto = e.nodo("Valparaíso", "Marga Marga", "Quilpué", "El Belloto");
      const chillan = e.nodo("Ñuble", "Diguillín", "Chillán");
      await e.tx.nodoGeografico.update({ where: { id: e.nodo("Ñuble", "Diguillín") }, data: { activo: false } });
      const antes = await e.huella();
      const datos = { id: belloto, padreIdNuevo: chillan, padreIdAnterior: e.nodo("Valparaíso", "Marga Marga", "Quilpué") };
      return {
        previa: await e.repo.vistaPreviaMover(datos.id, datos.padreIdNuevo),
        mover: await e.repo.mover(datos, e.actorId),
        igual: (await e.huella()) === antes,
      };
    });
    expect(r.previa).toEqual({ estado: "invalido", motivo: "destino_retirado" });
    expect(r.mover).toEqual({ estado: "invalido", motivo: "destino_retirado" });
    expect(r.igual).toBe(true);
  });

  it("R35: un hermano con el mismo nombre (normalizado) en el destino es `conflict`, sin escribir", async () => {
    const r = await conEscenario(async (e) => {
      const diguillin = e.nodo("Ñuble", "Diguillín");
      const tipo3 = await e.tx.tipoNivelGeografico.findFirstOrThrow({ where: { paisId: "XP", clave: "nivel_3" }, select: { id: true } });
      await e.tx.nodoGeografico.create({
        data: { paisId: "XP", tipoId: tipo3.id, padreId: diguillin, profundidad: 3, nombre: "QUILPUE", nombreNormalizado: "x" },
      });
      const antes = await e.huella();
      const quilpue = e.nodo("Valparaíso", "Marga Marga", "Quilpué");
      return {
        previa: await e.repo.vistaPreviaMover(quilpue, diguillin),
        mover: await e.repo.mover({ id: quilpue, padreIdNuevo: diguillin, padreIdAnterior: e.nodo("Valparaíso", "Marga Marga") }, e.actorId),
        igual: (await e.huella()) === antes,
      };
    });
    expect(r.previa).toEqual({ estado: "conflict" });
    expect(r.mover).toEqual({ estado: "conflict" });
    expect(r.igual).toBe(true);
  });

  it("R37: si el padre ya no es el que mostro el modal, `cambio_concurrente` sin escribir", async () => {
    const r = await conEscenario(async (e) => {
      const quilpue = e.nodo("Valparaíso", "Marga Marga", "Quilpué");
      const diguillin = e.nodo("Ñuble", "Diguillín");
      // Otra persona ya lo movio a Diguillín; esta pantalla sigue creyendo que cuelga de Marga Marga.
      const primera = await e.repo.mover({ id: quilpue, padreIdNuevo: diguillin, padreIdAnterior: e.nodo("Valparaíso", "Marga Marga") }, e.actorId);
      const antes = await e.huella();
      const segunda = await e.repo.mover(
        { id: quilpue, padreIdNuevo: diguillin, padreIdAnterior: e.nodo("Valparaíso", "Marga Marga") },
        e.actorId,
      );
      return { primera, segunda, igual: (await e.huella()) === antes, padre: await padreDe(e.tx, quilpue), diguillin };
    });
    expect(r.primera).toEqual({ estado: "movido" });
    expect(r.segunda).toEqual({ estado: "cambio_concurrente" });
    expect(r.igual).toBe(true);
    expect(r.padre).toBe(r.diguillin);
  });
});
