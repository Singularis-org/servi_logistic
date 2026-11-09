import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { PaisService } from "@/lib/services/PaisService";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { PAIS_CUATRO_NIVELES, claveDeRuta, sembrarPaisDePruebaGeo } from "@/tests/fixtures/paises-de-prueba-geo";
import { revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  clienteConSavepoint,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SLT-46 (T3.3, T3.4; 2026-11-09, design §2.4 «Candado del país», §4.7) — R61 contra Postgres: la
// pantalla manda el «antes» que mostró su modal de confirmación y el repositorio lo compara con la
// base. Si otra persona lo cambió mientras tanto, nada se escribe (`cambio_concurrente`); si la base
// ya tiene lo pedido, rige el éxito sin escribir (R18, R26).
//   · Nodos: renombre con un `nombreAnterior` viejo (a profundidad 4, la que no tiene copia vieja).
//   · Tipos: edición de nombres con un «antes» viejo; agregar nivel con una `profundidad` vieja; dos
//     agregar nivel en paralelo con la misma profundidad → uno `ok` y otro `conflict`.
//
// Casi todo va en una transacción del dueño que se revierte. La carrera NO puede: la segunda alta
// solo ve el nivel nuevo si la primera COMMITEA. Ese caso commitea el país `XS` bajo el lock de
// escrituras reales y lo borra en un `finally` (el `afterAll` exige que no quede).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const PAIS_CARRERA = "XS";

const TRES = [
  { singular: "Región", plural: "Regiones" },
  { singular: "Provincia", plural: "Provincias" },
  { singular: "Comuna", plural: "Comunas" },
];

const nombres = (nombreSingular: string, nombrePlural: string) => ({ nombreSingular, nombrePlural });

async function actorDePrueba(tx: TxDeTest): Promise<string> {
  const org = await crearOrganizacion(tx);
  const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
  if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
  return u.id;
}

type Tx = Pick<PrismaClient, "pais" | "tipoNivelGeografico" | "historialPlataforma">;

async function fotoDePais(tx: Tx, paisId: string) {
  return {
    pais: await tx.pais.findUnique({ where: { id: paisId } }),
    tipos: await tx.tipoNivelGeografico.findMany({ where: { paisId }, orderBy: { clave: "asc" } }),
    historial: await tx.historialPlataforma.count({ where: { paisId } }),
  };
}

/** El país XT de 3 tipos y el id del tipo de cada profundidad. */
async function paisDeTres(tx: TxDeTest, actorId: string): Promise<(k: number) => string> {
  const alta = await new PaisRepository(clienteConSavepoint(tx)).crear({ id: "XT", nombre: "País XT", tipos: TRES }, { usuarioId: actorId });
  if (alta.estado !== "creado") throw new Error(`no se creó XT: ${JSON.stringify(alta)}`);
  return (k) => {
    const t = alta.tipos.find((x) => x.profundidad === k);
    if (!t) throw new Error(`XT sin tipo ${k}`);
    return t.id;
  };
}

describeSiHayBase("SLT-46 R61 — cambio concurrente en los tipos de nivel, contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    const residuos = await base?.pais.count({ where: { id: PAIS_CARRERA } });
    await base?.$disconnect();
    expect(residuos).toBe(0);
  });

  it("edición de un tipo con un «antes» viejo → `cambio_concurrente`, sin escribir el tipo, pais ni historial", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const tipo = await paisDeTres(tx, actorId);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      // Otra persona renombra el tipo 2 primero (con el «antes» bueno).
      const ajena = await repo.renombrarTipo(tipo(2), nombres("Departamento", "Departamentos"), nombres("Provincia", "Provincias"), {
        usuarioId: actorId,
      });
      const antes = await fotoDePais(tx, "XT");
      // Esta persona guarda con lo que su modal mostró: «Provincia», que ya no está.
      const resultado = await repo.renombrarTipo(tipo(2), nombres("Municipio", "Municipios"), nombres("Provincia", "Provincias"), {
        usuarioId: actorId,
      });
      return { ajena, resultado, antes, despues: await fotoDePais(tx, "XT") };
    });

    expect(r.ajena).toBe("renombrado");
    expect(r.resultado).toBe("cambio_concurrente");
    expect(r.despues).toEqual(r.antes);
    expect(r.despues.pais).toMatchObject({ nivel2Singular: "Departamento" });
  });

  it("edición de un tipo con un «antes» viejo pero la base ya tiene lo pedido → `sin_cambio` (R26), sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const tipo = await paisDeTres(tx, actorId);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      await repo.renombrarTipo(tipo(2), nombres("Departamento", "Departamentos"), nombres("Provincia", "Provincias"), { usuarioId: actorId });
      const antes = await fotoDePais(tx, "XT");
      const resultado = await repo.renombrarTipo(tipo(2), nombres("Departamento", "Departamentos"), nombres("Provincia", "Provincias"), {
        usuarioId: actorId,
      });
      return { resultado, igual: JSON.stringify(await fotoDePais(tx, "XT")) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ resultado: "sin_cambio", igual: true });
  });

  it("CONTRAPRUEBA: la misma edición con el «antes» vigente sí escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const tipo = await paisDeTres(tx, actorId);
      return new PaisRepository(clienteConSavepoint(tx)).renombrarTipo(
        tipo(2),
        nombres("Municipio", "Municipios"),
        nombres("Provincia", "Provincias"),
        { usuarioId: actorId },
      );
    });

    expect(r).toBe("renombrado");
  });

  it("agregar nivel con una `profundidad` vieja (otra persona ya agregó uno) → `cambio_concurrente`, sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      await paisDeTres(tx, actorId);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const ajena = await repo.agregarNivel("XT", nombres("Sector", "Sectores"), 4, { usuarioId: actorId });
      const antes = await fotoDePais(tx, "XT");
      const resultado = await repo.agregarNivel("XT", nombres("Barrio", "Barrios"), 4, { usuarioId: actorId });
      return { ajena: typeof ajena === "string" ? ajena : ajena.clave, resultado, antes, despues: await fotoDePais(tx, "XT") };
    });

    expect(r.ajena).toBe("nivel_4");
    expect(r.resultado).toBe("cambio_concurrente");
    expect(r.despues).toEqual(r.antes);
  });

  it("con 10 tipos el `tope` se mira antes que la profundidad: una profundidad vieja sigue siendo `tope`", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const diez = Array.from({ length: 10 }, (_, i) => ({ singular: `Nivel ${i + 1}`, plural: `Niveles ${i + 1}` }));
      await repo.crear({ id: "XT", nombre: "País XT", tipos: diez }, { usuarioId: actorId });
      return repo.agregarNivel("XT", nombres("Once", "Onces"), 5, { usuarioId: actorId });
    });

    expect(r).toBe("tope");
  });

  it("dos agregar nivel en paralelo con la misma profundidad → uno `ok` y el otro `conflict` por cambio concurrente; un solo tipo nuevo", async () => {
    // Un cliente por participante: el de `crearPrismaDeTest` tiene un pool de 2 conexiones, y el
    // bloqueo, las dos altas y la consulta que las vigila necesitan cuatro a la vez.
    const [clienteA, clienteB, clienteBloqueo] = [crearPrismaDeTest(), crearPrismaDeTest(), crearPrismaDeTest()];
    const limpiar = async () => {
      await base.historialPlataforma.deleteMany({ where: { paisId: PAIS_CARRERA } });
      await base.pais.deleteMany({ where: { id: PAIS_CARRERA } }); // los tipos se van en cascada
    };
    const superadmin = { usuarioId: randomUUID(), rol: ROLES_PLATAFORMA[0] }; // sin usuario: el historial congela al sistema
    const r = await bajoLockDeEscrituraReal(async () => {
      try {
        await limpiar(); // por si una corrida anterior murió a mitad
        const alta = await new PaisRepository(base).crear(
          { id: PAIS_CARRERA, nombre: "País de la carrera XS", tipos: TRES.slice(0, 2) },
          { usuarioId: superadmin.usuarioId },
        );
        if (alta.estado !== "creado") throw new Error(`no se creó ${PAIS_CARRERA}: ${JSON.stringify(alta)}`);

        // Una tercera transacción toma el candado del país; las dos altas, con la misma profundidad
        // mostrada (3), se quedan esperando el suyo. Cuando las dos esperan, se suelta.
        let carrera: Promise<unknown[]> | null = null;
        await clienteBloqueo.$transaction(
          async (bloqueo) => {
            await bloqueo.$executeRawUnsafe(`SELECT 1 FROM "pais" WHERE "id" = $1 FOR UPDATE`, PAIS_CARRERA);
            const entrada = (singular: string, plural: string) => ({
              paisId: PAIS_CARRERA,
              nombreSingular: singular,
              nombrePlural: plural,
              profundidad: 3,
            });
            carrera = Promise.all([
              new PaisService(new PaisRepository(clienteA)).agregarNivel(entrada("Comuna", "Comunas"), superadmin),
              new PaisService(new PaisRepository(clienteB)).agregarNivel(entrada("Barrio", "Barrios"), superadmin),
            ]);
            const limite = Date.now() + 15_000;
            for (;;) {
              const [{ n }] = await base.$queryRawUnsafe<{ n: number }[]>(
                `SELECT count(*)::int AS n FROM pg_stat_activity
                  WHERE datname = current_database()
                    AND cardinality(pg_blocking_pids(pid)) > 0
                    AND query ILIKE '%FROM "pais"%FOR UPDATE%'`,
              );
              if (n >= 2) break;
              if (Date.now() > limite) throw new Error(`solo ${n} de las 2 altas llegaron a esperar el candado`);
              await new Promise((ok) => setTimeout(ok, 50));
            }
          },
          { timeout: 30_000, maxWait: 15_000 },
        );
        const resultados = (await (carrera as unknown as Promise<{ status: string; motivo?: string }[]>)).map((x) =>
          x.status === "conflict" ? `conflict:${x.motivo}` : x.status,
        );
        return {
          resultados: resultados.sort(),
          claves: (await base.tipoNivelGeografico.findMany({ where: { paisId: PAIS_CARRERA }, orderBy: { clave: "asc" } })).map(
            (t) => t.clave,
          ),
        };
      } finally {
        await limpiar();
        await Promise.all([clienteA.$disconnect(), clienteB.$disconnect(), clienteBloqueo.$disconnect()]);
      }
    });

    expect(r).toEqual({ resultados: ["conflict:cambio_concurrente", "ok"], claves: ["nivel_1", "nivel_2", "nivel_3"] });
  }, 60_000);
});

describeSiHayBase("SLT-46 R61 — cambio concurrente en el renombre de un nodo, contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  const RUTA = ["Valparaíso", "Marga Marga", "Quilpué", "El Belloto"];

  async function fotoDeNodo(tx: TxDeTest, id: string, paisId: string) {
    return {
      nodo: await tx.nodoGeografico.findUnique({ where: { id } }),
      historial: await tx.historialPlataforma.count({ where: { paisId, accion: "nodo_geografico_renombrado" } }),
    };
  }

  it("renombre con un «antes» viejo (otra persona ya lo renombró) → `cambio_concurrente`, sin escribir ni historial", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const { paisId, nodoPorRuta } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      const id = nodoPorRuta.get(claveDeRuta(RUTA)) ?? "";
      const geo = new GeoRepository(clienteConSavepoint(tx));
      const ajeno = await geo.renombrar(id, "El Belloto Alto", "El Belloto", actorId);
      const antes = await fotoDeNodo(tx, id, paisId);
      // Esta persona guarda con lo que su modal mostró: «El Belloto», que ya no está.
      const resultado = await geo.renombrar(id, "Belloto Norte", "El Belloto", actorId);
      return { ajeno, resultado, antes, despues: await fotoDeNodo(tx, id, paisId) };
    });

    expect(r.ajeno).toBe("renombrado");
    expect(r.resultado).toBe("cambio_concurrente");
    expect(r.despues).toEqual(r.antes);
    expect(r.despues.nodo?.nombre).toBe("El Belloto Alto");
  });

  it("renombre con un «antes» viejo pero la base ya tiene el nombre pedido → `sin_cambio` (R18), sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const { paisId, nodoPorRuta } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      const id = nodoPorRuta.get(claveDeRuta(RUTA)) ?? "";
      const geo = new GeoRepository(clienteConSavepoint(tx));
      await geo.renombrar(id, "El Belloto Alto", "El Belloto", actorId);
      const antes = await fotoDeNodo(tx, id, paisId);
      const resultado = await geo.renombrar(id, "El Belloto Alto", "El Belloto", actorId);
      return { resultado, igual: JSON.stringify(await fotoDeNodo(tx, id, paisId)) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ resultado: "sin_cambio", igual: true });
  });

  it("CONTRAPRUEBA: con el «antes» vigente el renombre escribe y deja su fila", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const { paisId, nodoPorRuta } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      const id = nodoPorRuta.get(claveDeRuta(RUTA)) ?? "";
      const resultado = await new GeoRepository(clienteConSavepoint(tx)).renombrar(id, "Belloto Norte", "El Belloto", actorId);
      return { resultado, despues: await fotoDeNodo(tx, id, paisId) };
    });

    expect(r.resultado).toBe("renombrado");
    expect(r.despues.nodo?.nombre).toBe("Belloto Norte");
    expect(r.despues.historial).toBe(1);
  });
});
