import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { esViolacionDeUnico } from "@/lib/repositories/_shared/prisma-unique";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { PAIS_CUATRO_NIVELES, sembrarPaisDePruebaGeo } from "@/tests/fixtures/paises-de-prueba-geo";
import { revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  clienteConSavepoint,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SLT-46 (T3.2; design §2.4 «Agregar un nivel», P3) — `PaisRepository.agregarNivel` contra Postgres.
//   · R48: 2 → 3 crea `nivel_3` y copia sus nombres a `pais.nivel_3_*`; 4 → 5 crea solo el tipo; los
//     nodos y los demás tipos quedan intactos.
//   · R49: con 10 tipos, `tope`; sin país, `no_existe`; dos altas en paralelo → una choca con el único
//     `(pais_id, clave)` (`P2002`, que la action traduce a `conflict`). Ningún rechazo escribe.
//   · R37: una fila `tipo_nivel_geografico_creado` con `origen: "nivel_agregado"` y su profundidad.
//
// Casi todo va en una transacción del dueño que se revierte. La carrera NO puede: el segundo `INSERT`
// solo choca con el único si el primero COMMITEA (si revierte, entra). Ese caso commitea el país
// `XV` bajo el lock de escrituras reales y lo borra en un `finally` (el `afterAll` exige que no quede).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const DOS = [
  { singular: "Región", plural: "Regiones" },
  { singular: "Provincia", plural: "Provincias" },
];

const PAIS_CARRERA = "XV";

async function actorDePrueba(tx: TxDeTest): Promise<string> {
  const org = await crearOrganizacion(tx);
  const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
  if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
  return u.id;
}

const tiposDe = (tx: Pick<PrismaClient, "tipoNivelGeografico">, paisId: string) =>
  tx.tipoNivelGeografico.findMany({ where: { paisId }, orderBy: { clave: "asc" } });

const historialDeNivel = (tx: Pick<PrismaClient, "historialPlataforma">, paisId: string) =>
  tx.historialPlataforma.findMany({
    where: { paisId, accion: "tipo_nivel_geografico_creado" },
    select: { entidadTipo: true, entidadId: true, entidadEtiqueta: true, actorUsuarioId: true, detalle: true },
  });

const deNivelAgregado = (filas: { detalle: unknown }[]) =>
  filas.filter((f) => (f.detalle as { origen?: string } | null)?.origen === "nivel_agregado");

describeSiHayBase("SLT-46 — PaisRepository.agregarNivel contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    const residuos = await base?.pais.count({ where: { id: PAIS_CARRERA } });
    await base?.$disconnect();
    expect(residuos).toBe(0);
  });

  it("R48/R37: 2 → 3 crea nivel_3, lo copia a pais.nivel_3_* y deja su fila nivel_agregado; los tipos 1 y 2 no cambian", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      await repo.crearConTipos({ id: "XT", nombre: "País XT", tipos: DOS }, { usuarioId: actorId });
      const antes = await tiposDe(tx, "XT");
      const tipo = await repo.agregarNivel("XT", "Comuna", "Comunas", { usuarioId: actorId });
      const despues = await tiposDe(tx, "XT");
      const pais = await tx.pais.findUnique({ where: { id: "XT" }, select: { nivel3Singular: true, nivel3Plural: true } });
      return { actorId, antes, tipo, despues, pais, historial: deNivelAgregado(await historialDeNivel(tx, "XT")) };
    });

    expect(r.tipo).toEqual({
      id: expect.any(String),
      clave: "nivel_3",
      profundidad: 3,
      nombreSingular: "Comuna",
      nombrePlural: "Comunas",
      digitosCodigo: null,
      codigoHeredaPrefijo: false,
    });
    expect(r.pais).toEqual({ nivel3Singular: "Comuna", nivel3Plural: "Comunas" });
    expect(r.despues.slice(0, 2)).toEqual(r.antes);
    expect(r.despues.map((t) => t.clave)).toEqual(["nivel_1", "nivel_2", "nivel_3"]);
    const id = typeof r.tipo === "string" ? null : r.tipo.id;
    expect(r.historial).toEqual([
      {
        entidadTipo: "tipo_nivel_geografico",
        entidadId: id,
        entidadEtiqueta: "Comuna",
        actorUsuarioId: r.actorId,
        detalle: { origen: "nivel_agregado", profundidad: 3 },
      },
    ]);
  });

  it("R48: 4 → 5 crea solo el tipo; la fila pais, los otros tipos y todos los nodos quedan intactos", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const { paisId } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      const foto = async () => ({
        pais: await tx.pais.findUnique({ where: { id: paisId } }),
        tipos: await tiposDe(tx, paisId),
        nodos: await tx.nodoGeografico.findMany({ where: { paisId }, orderBy: { id: "asc" } }),
      });
      const antes = await foto();
      const tipo = await new PaisRepository(clienteConSavepoint(tx)).agregarNivel(paisId, "Manzana", "Manzanas", {
        usuarioId: actorId,
      });
      return { antes, tipo, despues: await foto() };
    });

    expect(r.tipo).toMatchObject({ clave: "nivel_5", profundidad: 5, nombreSingular: "Manzana", nombrePlural: "Manzanas" });
    expect(r.despues.pais).toEqual(r.antes.pais);
    expect(r.despues.nodos).toEqual(r.antes.nodos);
    expect(r.antes.nodos.length).toBe(PAIS_CUATRO_NIVELES.nodos.length);
    expect(r.despues.tipos.slice(0, 4)).toEqual(r.antes.tipos);
    expect(r.despues.tipos.map((t) => t.clave)).toEqual(["nivel_1", "nivel_2", "nivel_3", "nivel_4", "nivel_5"]);
  });

  it("R49: con 10 tipos es `tope` sin escribir; CONTRAPRUEBA: con 9 crea nivel_10 y la siguiente ya es `tope`", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const nombres = (n: number) => Array.from({ length: n }, (_, i) => ({ singular: `Nivel ${i + 1}`, plural: `Niveles ${i + 1}` }));
      await repo.crearConTipos({ id: "XT", nombre: "País XT", tipos: nombres(10) }, { usuarioId: actorId });
      await repo.crearConTipos({ id: "XU", nombre: "País XU", tipos: nombres(9) }, { usuarioId: actorId });
      const antesXT = await tiposDe(tx, "XT");

      const diez = await repo.agregarNivel("XT", "Once", "Onces", { usuarioId: actorId });
      const nueve = await repo.agregarNivel("XU", "Diez", "Dieces", { usuarioId: actorId });
      const otraVez = await repo.agregarNivel("XU", "Once", "Onces", { usuarioId: actorId });
      return {
        diez,
        nueve: typeof nueve === "string" ? nueve : nueve.clave,
        otraVez,
        xtIgual: JSON.stringify(await tiposDe(tx, "XT")) === JSON.stringify(antesXT),
        historialXT: deNivelAgregado(await historialDeNivel(tx, "XT")).length,
        tiposXU: (await tiposDe(tx, "XU")).length,
        historialXU: deNivelAgregado(await historialDeNivel(tx, "XU")).length,
      };
    });

    expect(r).toEqual({
      diez: "tope",
      nueve: "nivel_10",
      otraVez: "tope",
      xtIgual: true,
      historialXT: 0,
      tiposXU: 10,
      historialXU: 1,
    });
  });

  it("R49: sin país es `no_existe` y no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const resultado = await new PaisRepository(clienteConSavepoint(tx)).agregarNivel("XY", "Comuna", "Comunas", {
        usuarioId: actorId,
      });
      return {
        resultado,
        tipos: await tx.tipoNivelGeografico.count({ where: { paisId: "XY" } }),
        historial: await tx.historialPlataforma.count({ where: { actorUsuarioId: actorId } }),
      };
    });

    expect(r).toEqual({ resultado: "no_existe", tipos: 0, historial: 0 });
  });

  it("R48/R37: si el historial falla, ni el tipo ni pais.nivel_3_* quedan (misma transacción)", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      await new PaisRepository(clienteConSavepoint(tx)).crearConTipos({ id: "XT", nombre: "País XT", tipos: DOS }, { usuarioId: actorId });
      const fallo = await new PaisRepository(clienteConSavepoint(tx, "plataforma"))
        .agregarNivel("XT", "Comuna", "Comunas", { usuarioId: actorId })
        .then(
          () => null,
          (e: unknown) => (e instanceof Error ? e.name : String(e)),
        );
      return {
        fallo,
        claves: (await tiposDe(tx, "XT")).map((t) => t.clave),
        pais: await tx.pais.findUnique({ where: { id: "XT" }, select: { nivel3Singular: true } }),
      };
    });

    expect(r).toEqual({ fallo: "RegistroCaido", claves: ["nivel_1", "nivel_2"], pais: { nivel3Singular: "" } });
  });

  it("R49: dos altas de nivel en paralelo sobre el mismo país → una crea nivel_3 y la otra choca con el único (P2002), sin escribir", async () => {
    // Un cliente por participante: el de `crearPrismaDeTest` tiene un pool de 2 conexiones, y el
    // bloqueo, las dos altas y la consulta que las vigila necesitan cuatro a la vez.
    const [clienteA, clienteB, clienteBloqueo] = [crearPrismaDeTest(), crearPrismaDeTest(), crearPrismaDeTest()];
    const limpiar = async () => {
      await base.historialPlataforma.deleteMany({ where: { paisId: PAIS_CARRERA } });
      await base.pais.deleteMany({ where: { id: PAIS_CARRERA } }); // los tipos se van en cascada
    };
    const r = await bajoLockDeEscrituraReal(async () => {
      const actor = { usuarioId: randomUUID() }; // sin usuario: el historial congela al sistema
      try {
        await limpiar(); // por si una corrida anterior murió a mitad
        const alta = await new PaisRepository(base).crearConTipos(
          { id: PAIS_CARRERA, nombre: "País de la carrera XV", tipos: DOS },
          actor,
        );
        if (alta.estado !== "creado") throw new Error(`no se creó ${PAIS_CARRERA}: ${JSON.stringify(alta)}`);

        // Para que las dos lean P = 2 ANTES de que ninguna commitee, una tercera transacción bloquea la
        // fila del país. La primera en insertar el tipo se queda esperando en la comprobación de la FK
        // (`FOR KEY SHARE` contra este `FOR UPDATE`); la segunda, en el único, detrás de la primera.
        // Cuando las dos esperan (las dos ya leyeron país y cuenta), se suelta.
        let carrera: Promise<PromiseSettledResult<unknown>[]> | null = null;
        await clienteBloqueo.$transaction(
          async (bloqueo) => {
            await bloqueo.$executeRawUnsafe(`SELECT 1 FROM "pais" WHERE "id" = $1 FOR UPDATE`, PAIS_CARRERA);
            carrera = Promise.allSettled([
              new PaisRepository(clienteA).agregarNivel(PAIS_CARRERA, "Comuna", "Comunas", actor),
              new PaisRepository(clienteB).agregarNivel(PAIS_CARRERA, "Barrio", "Barrios", actor),
            ]);
            const limite = Date.now() + 15_000;
            for (;;) {
              const [{ n }] = await base.$queryRawUnsafe<{ n: number }[]>(
                `SELECT count(*)::int AS n FROM pg_stat_activity
                  WHERE datname = current_database()
                    AND cardinality(pg_blocking_pids(pid)) > 0
                    AND query ILIKE '%INSERT INTO%tipo_nivel_geografico%'`,
              );
              if (n >= 2) break;
              if (Date.now() > limite) throw new Error(`solo ${n} de las 2 altas llegaron a esperar el bloqueo`);
              await new Promise((ok) => setTimeout(ok, 50));
            }
          },
          { timeout: 30_000, maxWait: 15_000 },
        );
        const resultados = await (carrera as unknown as Promise<PromiseSettledResult<unknown>[]>);

        return {
          ganadas: resultados.filter((x) => x.status === "fulfilled").map((x) => (x as PromiseFulfilledResult<{ clave: string }>).value.clave),
          unicos: resultados.filter((x) => x.status === "rejected" && esViolacionDeUnico(x.reason)).length,
          claves: (await tiposDe(base, PAIS_CARRERA)).map((t) => t.clave),
          historial: deNivelAgregado(await historialDeNivel(base, PAIS_CARRERA)).length,
        };
      } finally {
        await limpiar();
        await Promise.all([clienteA.$disconnect(), clienteB.$disconnect(), clienteBloqueo.$disconnect()]);
      }
    });

    expect(r).toEqual({ ganadas: ["nivel_3"], unicos: 1, claves: ["nivel_1", "nivel_2", "nivel_3"], historial: 1 });
  }, 60_000);

  it("R49 CONTRAPRUEBA de la carrera: las mismas dos altas, una detrás de otra, entran las dos (nivel_3 y nivel_4)", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      await repo.crearConTipos({ id: "XT", nombre: "País XT", tipos: DOS }, { usuarioId: actorId });
      const a = await repo.agregarNivel("XT", "Comuna", "Comunas", { usuarioId: actorId });
      const b = await repo.agregarNivel("XT", "Barrio", "Barrios", { usuarioId: actorId });
      return [a, b].map((x) => (typeof x === "string" ? x : x.clave));
    });

    expect(r).toEqual(["nivel_3", "nivel_4"]);
  });
});
