import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais } from "@/tests/fabricas/paises";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T3.2; design §2.4, §7) — `PaisRepository.renombrarTipo` contra Postgres.
//   · R25: el tipo 2 cambia en el tipo y en `pais.nivel_2_*`; el tipo 4 solo en el tipo.
//   · R26: los mismos nombres no escriben nada ni dejan historial; un tipo que no existe es `no_existe`.
//   · R37: una fila `tipo_nivel_geografico_renombrado` por nombre cambiado, con anterior, nuevo y
//     `detalle.campo`; en la misma transacción.
//   · R27 (datos): `deLaEmpresa`, en el contexto de la empresa, devuelve el nombre nuevo.
//
// Todo en una transacción del dueño que se revierte. País `XU` de 4 tipos, creado por el propio
// repositorio (`crear`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const TIPOS = [
  { singular: "Región", plural: "Regiones" },
  { singular: "Provincia", plural: "Provincias" },
  { singular: "Comuna", plural: "Comunas" },
  { singular: "Sector", plural: "Sectores" },
];

// SLT-46 (2026-11-09, design §4.7): la entrada gana el «antes»; aquí siempre es el vigente, así que
// los resultados de cada caso no cambian. El «antes» viejo lo mide `geografia-cambio-concurrente`.
const nombres = (nombreSingular: string, nombrePlural: string) => ({ nombreSingular, nombrePlural });
const ANTES: Record<number, { nombreSingular: string; nombrePlural: string }> = Object.fromEntries(
  TIPOS.map((t, i) => [i + 1, nombres(t.singular, t.plural)]),
);

async function actorDePrueba(tx: TxDeTest): Promise<string> {
  const org = await crearOrganizacion(tx);
  const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
  if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
  return u.id;
}

/** El país XU de 4 tipos y el id de cada tipo por profundidad. */
async function paisDeCuatro(tx: TxDeTest, actorId: string): Promise<(k: number) => string> {
  const alta = await new PaisRepository(clienteConSavepoint(tx)).crear(
    { id: "XU", nombre: "País XU", tipos: TIPOS },
    { usuarioId: actorId },
  );
  if (alta.estado !== "creado") throw new Error(`no se creó XU: ${JSON.stringify(alta)}`);
  return (k) => {
    const t = alta.tipos.find((x) => x.profundidad === k);
    if (!t) throw new Error(`XU sin tipo ${k}`);
    return t.id;
  };
}

async function foto(tx: TxDeTest) {
  const [pais, tipos] = await Promise.all([
    tx.pais.findUnique({ where: { id: "XU" } }),
    tx.tipoNivelGeografico.findMany({ where: { paisId: "XU" }, orderBy: { clave: "asc" } }),
  ]);
  return { pais, tipos };
}

const historialDeRenombre = (tx: TxDeTest) =>
  tx.historialPlataforma.findMany({
    where: { paisId: "XU", accion: "tipo_nivel_geografico_renombrado" },
    select: {
      entidadTipo: true,
      entidadId: true,
      entidadEtiqueta: true,
      valorAnterior: true,
      valorNuevo: true,
      detalle: true,
      actorUsuarioId: true,
    },
  });

describeSiHayBase("SLT-46 — PaisRepository.renombrarTipo contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R25: renombrar el tipo 2 cambia el tipo y pais.nivel_2_*; nada más cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const tipo = await paisDeCuatro(tx, actorId);
      const antes = await foto(tx);
      const resultado = await new PaisRepository(clienteConSavepoint(tx)).renombrarTipo(
        tipo(2),
        { nombreSingular: "Departamento", nombrePlural: "Departamentos" },
        ANTES[2],
        { usuarioId: actorId },
      );
      return { resultado, antes, despues: await foto(tx) };
    });

    expect(r.resultado).toBe("renombrado");
    expect(r.despues.pais).toEqual({ ...r.antes.pais, nivel2Singular: "Departamento", nivel2Plural: "Departamentos" });
    expect(r.despues.tipos).toEqual(
      r.antes.tipos.map((t) =>
        t.clave === "nivel_2" ? { ...t, nombreSingular: "Departamento", nombrePlural: "Departamentos" } : t,
      ),
    );
  });

  it("R25: renombrar el tipo 4 cambia solo el tipo; la fila pais queda igual", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const tipo = await paisDeCuatro(tx, actorId);
      const antes = await foto(tx);
      const resultado = await new PaisRepository(clienteConSavepoint(tx)).renombrarTipo(tipo(4), nombres("Barrio", "Barrios"), ANTES[4], {
        usuarioId: actorId,
      });
      return { resultado, antes, despues: await foto(tx) };
    });

    expect(r.resultado).toBe("renombrado");
    expect(r.despues.pais).toEqual(r.antes.pais);
    expect(r.despues.tipos).toEqual(
      r.antes.tipos.map((t) => (t.clave === "nivel_4" ? { ...t, nombreSingular: "Barrio", nombrePlural: "Barrios" } : t)),
    );
  });

  it("R26: los mismos nombres son `sin_cambio` sin escribir ni historial; CONTRAPRUEBA: cambiar solo el plural sí escribe una fila", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const tipo = await paisDeCuatro(tx, actorId);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const antes = await foto(tx);
      const igual = await repo.renombrarTipo(tipo(2), nombres("Provincia", "Provincias"), ANTES[2], { usuarioId: actorId });
      const trasIgual = { foto: await foto(tx), historial: await historialDeRenombre(tx) };
      const soloPlural = await repo.renombrarTipo(tipo(2), nombres("Provincia", "Provincias del país"), ANTES[2], { usuarioId: actorId });
      return { antes, igual, trasIgual, soloPlural, historial: await historialDeRenombre(tx), id: tipo(2), actorId };
    });

    expect(r.igual).toBe("sin_cambio");
    expect(r.trasIgual.foto).toEqual(r.antes);
    expect(r.trasIgual.historial).toEqual([]);
    expect(r.soloPlural).toBe("renombrado");
    expect(r.historial).toEqual([
      {
        entidadTipo: "tipo_nivel_geografico",
        entidadId: r.id,
        entidadEtiqueta: "Provincia",
        valorAnterior: "Provincias",
        valorNuevo: "Provincias del país",
        detalle: { campo: "plural" },
        actorUsuarioId: r.actorId,
      },
    ]);
  });

  it("R26: un tipo que no existe es `no_existe` y no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      await paisDeCuatro(tx, actorId);
      const antes = await foto(tx);
      const resultado = await new PaisRepository(clienteConSavepoint(tx)).renombrarTipo(randomUUID(), nombres("Barrio", "Barrios"), ANTES[4], {
        usuarioId: actorId,
      });
      return {
        resultado,
        igual: JSON.stringify(await foto(tx)) === JSON.stringify(antes),
        historial: await tx.historialPlataforma.count({ where: { accion: "tipo_nivel_geografico_renombrado", actorUsuarioId: actorId } }),
      };
    });

    expect(r).toEqual({ resultado: "no_existe", igual: true, historial: 0 });
  });

  it("R37: cambiar los dos nombres deja dos filas, una por campo, con anterior y nuevo y la etiqueta = singular nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const tipo = await paisDeCuatro(tx, actorId);
      await new PaisRepository(clienteConSavepoint(tx)).renombrarTipo(tipo(1), nombres("Estado", "Estados"), ANTES[1], {
        usuarioId: actorId,
      });
      return { id: tipo(1), actorId, historial: await historialDeRenombre(tx) };
    });

    const fila = (campo: string, valorAnterior: string, valorNuevo: string) => ({
      entidadTipo: "tipo_nivel_geografico",
      entidadId: r.id,
      entidadEtiqueta: "Estado",
      valorAnterior,
      valorNuevo,
      detalle: { campo },
      actorUsuarioId: r.actorId,
    });
    expect(r.historial).toHaveLength(2);
    expect(r.historial).toEqual(
      expect.arrayContaining([fila("singular", "Región", "Estado"), fila("plural", "Regiones", "Estados")]),
    );
  });

  it("R25/R37: si el historial falla, ni el tipo ni pais cambian (misma transacción)", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const tipo = await paisDeCuatro(tx, actorId);
      const antes = await foto(tx);
      const fallo = await new PaisRepository(clienteConSavepoint(tx, "plataforma"))
        .renombrarTipo(tipo(1), nombres("Estado", "Estados"), ANTES[1], { usuarioId: actorId })
        .then(
          () => null,
          (e: unknown) => (e instanceof Error ? e.name : String(e)),
        );
      return { fallo, igual: JSON.stringify(await foto(tx)) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ fallo: "RegistroCaido", igual: true });
  });

  it("R27: en el contexto de la empresa, deLaEmpresa devuelve el nombre nuevo del tipo 1 (antes, el viejo)", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const tipo = await paisDeCuatro(tx, actorId);
      const empresa = await crearOrganizacionEnPais(tx, "XU");
      const repo = new PaisRepository(clienteConSavepoint(tx));

      await comoApp(tx, empresa.id);
      const antes = await repo.deLaEmpresa(empresa.id);
      await comoDueno(tx);
      await repo.renombrarTipo(tipo(1), nombres("Estado", "Estados"), ANTES[1], { usuarioId: actorId });
      await comoApp(tx, empresa.id);
      const despues = await repo.deLaEmpresa(empresa.id);
      return { antes, despues };
    });

    expect(r.antes).toMatchObject({ id: "XU", nivel1Singular: "Región", nivel1Plural: "Regiones" });
    expect(r.despues).toMatchObject({ id: "XU", nivel1Singular: "Estado", nivel1Plural: "Estados" });
  });
});
