import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { NivelReordenado } from "@/lib/interfaces/repositories/IPaisRepository";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { PAIS_CUATRO_NIVELES, sembrarPaisDePruebaGeo } from "@/tests/fixtures/paises-de-prueba-geo";
import { revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T3.3; 2026-11-09, design §2.4 «Reordenar niveles», §4.7, §7) — `PaisRepository.reordenarTipos`
// contra Postgres.
//   · R55: el tipo de cada profundidad k toma los nombres del que quedó en la posición k y, si k ≤ 3,
//     los copia a `pais.nivel_k_*`; ids, claves, reglas de código y nodos no cambian. Costa Rica
//     conserva sus reglas de código por profundidad; un país de 2 tipos sigue sin `nivel_3` (R46).
//   · R56: una fila `tipo_nivel_geografico_renombrado` por nombre cambiado con `detalle.campo` y
//     `detalle.origen = "reordenado"`; el orden actual no escribe nada; si el historial falla no
//     queda ningún nombre cambiado.
//   · R57: país inexistente → `no_existe`; falta un tipo, sobra uno, uno es de otro país o un nombre
//     no es el actual → `cambio_concurrente`, sin escribir.
//
// Todo en una transacción del dueño que se revierte (el repositorio abre un SAVEPOINT real).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const DOS = [
  { singular: "Región", plural: "Regiones" },
  { singular: "Provincia", plural: "Provincias" },
];

async function actorDePrueba(tx: TxDeTest): Promise<string> {
  const org = await crearOrganizacion(tx);
  const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
  if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
  return u.id;
}

type Tx = Pick<PrismaClient, "pais" | "tipoNivelGeografico" | "nodoGeografico" | "historialPlataforma">;

/** Los tipos del país por profundidad (clave `nivel_<k>`, ordenada numéricamente). */
async function tiposDe(tx: Tx, paisId: string) {
  const tipos = await tx.tipoNivelGeografico.findMany({ where: { paisId } });
  return tipos.sort((a, b) => Number(a.clave.slice(6)) - Number(b.clave.slice(6)));
}

/** La lista de `reordenarTipos` con el orden pedido (índices 0-based sobre los tipos actuales). */
function ordenDe(tipos: Awaited<ReturnType<typeof tiposDe>>, orden: number[]): NivelReordenado[] {
  return orden.map((i) => ({ tipoId: tipos[i].id, nombreSingular: tipos[i].nombreSingular, nombrePlural: tipos[i].nombrePlural }));
}

async function foto(tx: Tx, paisId: string) {
  return {
    pais: await tx.pais.findUnique({ where: { id: paisId } }),
    tipos: await tiposDe(tx, paisId),
    nodos: await tx.nodoGeografico.findMany({ where: { paisId }, orderBy: { id: "asc" } }),
  };
}

const historialDe = (tx: Tx, paisId: string) =>
  tx.historialPlataforma.findMany({
    where: { paisId, accion: "tipo_nivel_geografico_renombrado" },
    select: { entidadTipo: true, entidadId: true, entidadEtiqueta: true, valorAnterior: true, valorNuevo: true, detalle: true },
  });

describeSiHayBase("SLT-46 — PaisRepository.reordenarTipos contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R55: país de 4 tipos con nodos en las 4 profundidades — invertir 1↔2 y mover el 4 al 1 deja los nombres por profundidad, los copia a pais.nivel_1..3_* y no toca ids, claves, reglas de código ni nodos", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const { paisId } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      const antes = await foto(tx, paisId);
      // [Región, Provincia, Comuna, Sector] → invertir 1↔2 → [Provincia, Región, Comuna, Sector] →
      // mover el 4.º al 1.º → [Sector, Provincia, Región, Comuna].
      const resultado = await new PaisRepository(clienteConSavepoint(tx)).reordenarTipos(
        paisId,
        ordenDe(antes.tipos, [3, 1, 0, 2]),
        { usuarioId: actorId },
      );
      return { resultado, antes, despues: await foto(tx, paisId) };
    });

    expect(r.resultado).toBe("reordenado");
    expect(r.despues.tipos.map((t) => [t.clave, t.nombreSingular, t.nombrePlural])).toEqual([
      ["nivel_1", "Sector", "Sectores"],
      ["nivel_2", "Provincia", "Provincias"],
      ["nivel_3", "Región", "Regiones"],
      ["nivel_4", "Comuna", "Comunas"],
    ]);
    const sinNombres = (t: (typeof r.antes.tipos)[number]) => ({ ...t, nombreSingular: null, nombrePlural: null });
    expect(r.despues.tipos.map(sinNombres)).toEqual(r.antes.tipos.map(sinNombres));
    expect(r.despues.pais).toEqual({
      ...r.antes.pais,
      nivel1Singular: "Sector",
      nivel1Plural: "Sectores",
      nivel3Singular: "Región",
      nivel3Plural: "Regiones",
    });
    expect(r.antes.nodos.map((n) => n.profundidad)).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    expect(r.despues.nodos).toEqual(r.antes.nodos);
  });

  it("R55: Costa Rica — intercambiar los nombres de los tipos 1 y 2 no mueve las reglas de código de ninguna profundidad", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const antes = await tiposDe(tx, "CR");
      const paisAntes = await tx.pais.findUnique({ where: { id: "CR" } });
      const orden = antes.map((_, i) => i);
      [orden[0], orden[1]] = [orden[1], orden[0]];
      const resultado = await new PaisRepository(clienteConSavepoint(tx)).reordenarTipos("CR", ordenDe(antes, orden), {
        usuarioId: actorId,
      });
      return { resultado, antes, paisAntes, despues: await tiposDe(tx, "CR"), paisDespues: await tx.pais.findUnique({ where: { id: "CR" } }) };
    });

    expect(r.resultado).toBe("reordenado");
    const regla = (t: (typeof r.antes)[number]) => ({ id: t.id, clave: t.clave, digitosCodigo: t.digitosCodigo, hereda: t.codigoHeredaPrefijo });
    expect(r.despues.map(regla)).toEqual(r.antes.map(regla));
    expect(r.despues[0].nombreSingular).toBe(r.antes[1].nombreSingular);
    expect(r.despues[1].nombreSingular).toBe(r.antes[0].nombreSingular);
    expect(r.paisDespues).toMatchObject({
      digitosCodigoNivel1: r.paisAntes?.digitosCodigoNivel1,
      digitosCodigoNivel2: r.paisAntes?.digitosCodigoNivel2,
      digitosCodigoNivel3: r.paisAntes?.digitosCodigoNivel3,
      nivel1Singular: r.antes[1].nombreSingular,
      nivel2Singular: r.antes[0].nombreSingular,
    });
  });

  it("R46/R55: un país de 2 tipos reordenado sigue sin nivel_3 y con '' en pais.nivel_3_*", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      await repo.crear({ id: "XT", nombre: "País XT", tipos: DOS }, { usuarioId: actorId });
      const antes = await tiposDe(tx, "XT");
      const resultado = await repo.reordenarTipos("XT", ordenDe(antes, [1, 0]), { usuarioId: actorId });
      const pais = await tx.pais.findUnique({ where: { id: "XT" } });
      return { resultado, despues: await tiposDe(tx, "XT"), pais };
    });

    expect(r.resultado).toBe("reordenado");
    expect(r.despues.map((t) => [t.clave, t.nombreSingular])).toEqual([
      ["nivel_1", "Provincia"],
      ["nivel_2", "Región"],
    ]);
    expect(r.pais).toMatchObject({
      nivel1Singular: "Provincia",
      nivel2Singular: "Región",
      nivel3Singular: "",
      nivel3Plural: "",
    });
  });

  it("R56: una fila por nombre cambiado, con detalle.campo y origen «reordenado»; la etiqueta es el singular nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      await repo.crear({ id: "XT", nombre: "País XT", tipos: DOS }, { usuarioId: actorId });
      const antes = await tiposDe(tx, "XT");
      await repo.reordenarTipos("XT", ordenDe(antes, [1, 0]), { usuarioId: actorId });
      return { ids: antes.map((t) => t.id), historial: await historialDe(tx, "XT") };
    });

    const fila = (k: number, campo: string, valorAnterior: string, valorNuevo: string, etiqueta: string) => ({
      entidadTipo: "tipo_nivel_geografico",
      entidadId: r.ids[k],
      entidadEtiqueta: etiqueta,
      valorAnterior,
      valorNuevo,
      detalle: { campo, origen: "reordenado" },
    });
    expect(r.historial).toHaveLength(4);
    expect(r.historial).toEqual(
      expect.arrayContaining([
        fila(0, "singular", "Región", "Provincia", "Provincia"),
        fila(0, "plural", "Regiones", "Provincias", "Provincia"),
        fila(1, "singular", "Provincia", "Región", "Región"),
        fila(1, "plural", "Provincias", "Regiones", "Región"),
      ]),
    );
  });

  it("R56: el orden actual es `sin_cambio` sin escribir ni historial", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const { paisId } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      const antes = await foto(tx, paisId);
      const resultado = await new PaisRepository(clienteConSavepoint(tx)).reordenarTipos(
        paisId,
        ordenDe(antes.tipos, [0, 1, 2, 3]),
        { usuarioId: actorId },
      );
      return { resultado, igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes), historial: await historialDe(tx, paisId) };
    });

    expect(r).toEqual({ resultado: "sin_cambio", igual: true, historial: [] });
  });

  it("R56: si el historial falla, ningún nombre cambia ni en los tipos ni en pais (misma transacción)", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const { paisId } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      const antes = await foto(tx, paisId);
      const fallo = await new PaisRepository(clienteConSavepoint(tx, "plataforma"))
        .reordenarTipos(paisId, ordenDe(antes.tipos, [3, 2, 1, 0]), { usuarioId: actorId })
        .then(
          () => null,
          (e: unknown) => (e instanceof Error ? e.name : String(e)),
        );
      const igual = JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes);
      // CONTRAPRUEBA del mismo camino sin romper el registro: sí reordena.
      const sano = await new PaisRepository(clienteConSavepoint(tx)).reordenarTipos(paisId, ordenDe(antes.tipos, [3, 2, 1, 0]), {
        usuarioId: actorId,
      });
      return { fallo, igual, sano };
    });

    expect(r).toEqual({ fallo: "RegistroCaido", igual: true, sano: "reordenado" });
  });

  it("R57: un país que no existe es `no_existe` y no escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const resultado = await new PaisRepository(clienteConSavepoint(tx)).reordenarTipos(
        "XY",
        [
          { tipoId: randomUUID(), nombreSingular: "Uno", nombrePlural: "Unos" },
          { tipoId: randomUUID(), nombreSingular: "Dos", nombrePlural: "Doses" },
        ],
        { usuarioId: actorId },
      );
      return { resultado, historial: await tx.historialPlataforma.count({ where: { actorUsuarioId: actorId } }) };
    });

    expect(r).toEqual({ resultado: "no_existe", historial: 0 });
  });

  it("R57: falta un tipo, sobra uno, uno es de otro país o un nombre no es el actual → `cambio_concurrente`, sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const { paisId } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      await repo.crear({ id: "XT", nombre: "País XT", tipos: DOS }, { usuarioId: actorId });
      const ajeno = (await tiposDe(tx, "XT"))[0];
      const antes = await foto(tx, paisId);
      const invertida = ordenDe(antes.tipos, [3, 2, 1, 0]);
      const casos = {
        falta: invertida.slice(0, 3),
        sobra: [...invertida, { tipoId: ajeno.id, nombreSingular: ajeno.nombreSingular, nombrePlural: ajeno.nombrePlural }],
        deOtroPais: [
          ...invertida.slice(0, 3),
          { tipoId: ajeno.id, nombreSingular: ajeno.nombreSingular, nombrePlural: ajeno.nombrePlural },
        ],
        nombreViejo: invertida.map((n, i) => (i === 0 ? { ...n, nombrePlural: `${n.nombrePlural} de antes` } : n)),
        repetido: [invertida[0], invertida[0], invertida[2], invertida[3]],
      };
      const resultados: Record<string, string> = {};
      for (const [caso, niveles] of Object.entries(casos)) {
        resultados[caso] = await repo.reordenarTipos(paisId, niveles, { usuarioId: actorId });
      }
      return {
        resultados,
        igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes),
        historial: await historialDe(tx, paisId),
      };
    });

    expect(r).toEqual({
      resultados: {
        falta: "cambio_concurrente",
        sobra: "cambio_concurrente",
        deOtroPais: "cambio_concurrente",
        nombreViejo: "cambio_concurrente",
        repetido: "cambio_concurrente",
      },
      igual: true,
      historial: [],
    });
  });
});
