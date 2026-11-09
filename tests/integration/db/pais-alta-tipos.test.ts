import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T3.2; design §2.4, §7) — el alta de un país con su lista de 2 a 10 tipos, contra Postgres.
//   · R23: 2, 3 y 4 tipos → exactamente P tipos, `nivel_1`…`nivel_P` en el orden de la lista, y
//     `pais.nivel_N_*` = los tipos 1–3 que existan (`''` en el 3 de un país de 2).
//   · R46: un país de 2 tipos no tiene `nivel_3` tras el alta, tras renombrar su tipo 1 y su tipo 2, ni
//     tras un `UPDATE pais SET nombre`.
//   · R37: `pais_creado` + una `tipo_nivel_geografico_creado` por tipo, con `origen: "alta_de_pais"`
//     y su profundidad; todo en la misma transacción (si el historial falla, no queda nada).
//
// Todo en una transacción del dueño que se revierte (`revertida`); el repositorio abre la suya
// sobre `clienteConSavepoint`. Códigos `XT`, `XU`, `XV`: del rango reservado y sin uso en otras suites.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const TIPOS = [
  { singular: "Región", plural: "Regiones" },
  { singular: "Provincia", plural: "Provincias" },
  { singular: "Comuna", plural: "Comunas" },
  { singular: "Sector", plural: "Sectores" },
];

/** Un usuario real para el actor: `historial_plataforma.actor_usuario_id` tiene FK a `usuario`. */
async function actorDePrueba(tx: TxDeTest): Promise<string> {
  const org = await crearOrganizacion(tx);
  const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
  if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
  return u.id;
}

async function tiposDe(tx: TxDeTest, paisId: string) {
  return tx.tipoNivelGeografico.findMany({
    where: { paisId },
    orderBy: { clave: "asc" },
    select: { clave: true, nombreSingular: true, nombrePlural: true, digitosCodigo: true, codigoHeredaPrefijo: true },
  });
}

async function nivelesDePais(tx: TxDeTest, paisId: string) {
  return tx.pais.findUnique({
    where: { id: paisId },
    select: {
      nivel1Singular: true,
      nivel1Plural: true,
      nivel2Singular: true,
      nivel2Plural: true,
      nivel3Singular: true,
      nivel3Plural: true,
    },
  });
}

const esperadoTipo = (k: number) => ({
  clave: `nivel_${k}`,
  nombreSingular: TIPOS[k - 1].singular,
  nombrePlural: TIPOS[k - 1].plural,
  digitosCodigo: null,
  codigoHeredaPrefijo: false,
});

describeSiHayBase("SLT-46 — PaisRepository.crear contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R23: con 2, 3 y 4 tipos crea exactamente P tipos en orden, y pais.nivel_N_* = los tipos 1–3 que existan", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const altas = {
        XT: await repo.crear({ id: "XT", nombre: "País XT", tipos: TIPOS.slice(0, 2) }, { usuarioId: actorId }),
        XU: await repo.crear({ id: "XU", nombre: "País XU", tipos: TIPOS.slice(0, 3) }, { usuarioId: actorId }),
        XV: await repo.crear({ id: "XV", nombre: "País XV", tipos: TIPOS.slice(0, 4) }, { usuarioId: actorId }),
      };
      const tipos = { XT: await tiposDe(tx, "XT"), XU: await tiposDe(tx, "XU"), XV: await tiposDe(tx, "XV") };
      const pais = { XT: await nivelesDePais(tx, "XT"), XU: await nivelesDePais(tx, "XU"), XV: await nivelesDePais(tx, "XV") };
      return { altas, tipos, pais };
    });

    expect(r.tipos.XT).toEqual([1, 2].map(esperadoTipo));
    expect(r.tipos.XU).toEqual([1, 2, 3].map(esperadoTipo));
    expect(r.tipos.XV).toEqual([1, 2, 3, 4].map(esperadoTipo));

    const nivelesEnPais = (n3: { singular: string; plural: string }) => ({
      nivel1Singular: "Región",
      nivel1Plural: "Regiones",
      nivel2Singular: "Provincia",
      nivel2Plural: "Provincias",
      nivel3Singular: n3.singular,
      nivel3Plural: n3.plural,
    });
    // P = 2: el '' de la convención de §2.4. P ≥ 3: el tipo 3; el 4 no tiene columna en `pais`.
    expect(r.pais.XT).toEqual(nivelesEnPais({ singular: "", plural: "" }));
    expect(r.pais.XU).toEqual(nivelesEnPais(TIPOS[2]));
    expect(r.pais.XV).toEqual(nivelesEnPais(TIPOS[2]));

    // Lo que devuelve el repositorio es lo que quedó en la base, por profundidad.
    for (const id of ["XT", "XU", "XV"] as const) {
      const alta = r.altas[id];
      expect(alta.estado).toBe("creado");
      if (alta.estado !== "creado") continue;
      expect(alta.pais.id).toBe(id);
      expect(alta.tipos.map((t) => [t.clave, t.profundidad, t.nombreSingular])).toEqual(
        r.tipos[id].map((t, i) => [t.clave, i + 1, t.nombreSingular]),
      );
    }
  });

  it("R37: pais_creado y una tipo_nivel_geografico_creado por tipo, con origen alta_de_pais, su profundidad y el actor congelado", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      await repo.crear({ id: "XV", nombre: "País XV", tipos: TIPOS }, { usuarioId: actorId });
      const ids = await tx.tipoNivelGeografico.findMany({ where: { paisId: "XV" }, select: { id: true, clave: true } });
      const historial = await tx.historialPlataforma.findMany({
        where: { paisId: "XV" },
        select: {
          accion: true,
          entidadTipo: true,
          entidadId: true,
          entidadEtiqueta: true,
          actorUsuarioId: true,
          actorNombre: true,
          detalle: true,
        },
      });
      return { actorId, ids, historial };
    });

    const idDe = (clave: string) => r.ids.find((t) => t.clave === clave)?.id;
    const actor = { actorUsuarioId: r.actorId, actorNombre: expect.any(String) };
    // Mismo `created_at` (la transacción): se comparan como conjunto.
    expect(r.historial).toHaveLength(5);
    expect(r.historial).toEqual(
      expect.arrayContaining([
        { accion: "pais_creado", entidadTipo: "pais", entidadId: "XV", entidadEtiqueta: "País XV", ...actor, detalle: null },
        ...TIPOS.map((t, i) => ({
          accion: "tipo_nivel_geografico_creado",
          entidadTipo: "tipo_nivel_geografico",
          entidadId: idDe(`nivel_${i + 1}`),
          entidadEtiqueta: t.singular,
          ...actor,
          detalle: { origen: "alta_de_pais", profundidad: i + 1 },
        })),
      ]),
    );
  });

  it("R46: un país de 2 tipos sigue sin nivel_3 tras el alta, tras renombrar el tipo 1 y el 2 y tras un UPDATE pais SET nombre", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const claves = async () => (await tiposDe(tx, "XT")).map((t) => t.clave);
      const pasos: Record<string, string[]> = {};

      await repo.crear({ id: "XT", nombre: "País XT", tipos: TIPOS.slice(0, 2) }, { usuarioId: actorId });
      pasos.alta = await claves();
      const ids = await tx.tipoNivelGeografico.findMany({ where: { paisId: "XT" }, select: { id: true, clave: true } });
      const idDe = (clave: string) => ids.find((t) => t.clave === clave)?.id ?? "";
      await repo.renombrarTipo(
        idDe("nivel_1"),
        { nombreSingular: "Estado", nombrePlural: "Estados" },
        { nombreSingular: "Región", nombrePlural: "Regiones" },
        { usuarioId: actorId },
      );
      pasos.tipo1 = await claves();
      await repo.renombrarTipo(
        idDe("nivel_2"),
        { nombreSingular: "Municipio", nombrePlural: "Municipios" },
        { nombreSingular: "Provincia", nombrePlural: "Provincias" },
        { usuarioId: actorId },
      );
      pasos.tipo2 = await claves();
      await tx.$executeRawUnsafe(`UPDATE "pais" SET "nombre" = 'País XT renombrado' WHERE "id" = 'XT'`);
      pasos.nombre = await claves();
      const nivel3 = await nivelesDePais(tx, "XT");

      // CONTRAPRUEBA: la misma lectura sí ve un `nivel_3` cuando el país deja de tener el ''. Sin
      // ella, `claves()` vacía o rota dejaría el caso en verde.
      await tx.$executeRawUnsafe(`UPDATE "pais" SET "nivel_3_singular" = 'Aldea', "nivel_3_plural" = 'Aldeas' WHERE "id" = 'XT'`);
      const contraprueba = await claves();
      return { pasos, nivel3, contraprueba };
    });

    expect(r.pasos).toEqual({
      alta: ["nivel_1", "nivel_2"],
      tipo1: ["nivel_1", "nivel_2"],
      tipo2: ["nivel_1", "nivel_2"],
      nombre: ["nivel_1", "nivel_2"],
    });
    expect(r.nivel3).toMatchObject({ nivel3Singular: "", nivel3Plural: "" });
    expect(r.contraprueba).toEqual(["nivel_1", "nivel_2", "nivel_3"]);
  });

  it("R23/R37: si el historial falla no queda ni el país ni sus tipos (misma transacción); sin romperlo, sí", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const roto = new PaisRepository(clienteConSavepoint(tx, "plataforma"));
      const fallo = await roto
        .crear({ id: "XV", nombre: "País XV", tipos: TIPOS }, { usuarioId: actorId })
        .then(
          () => null,
          (e: unknown) => (e instanceof Error ? e.name : String(e)),
        );
      const tras = { paises: await tx.pais.count({ where: { id: "XV" } }), tipos: (await tiposDe(tx, "XV")).length };
      const sano = await new PaisRepository(clienteConSavepoint(tx)).crear(
        { id: "XV", nombre: "País XV", tipos: TIPOS },
        { usuarioId: actorId },
      );
      return { fallo, tras, sano: sano.estado, tiposSano: (await tiposDe(tx, "XV")).length };
    });

    expect(r).toEqual({ fallo: "RegistroCaido", tras: { paises: 0, tipos: 0 }, sano: "creado", tiposSano: 4 });
  });

  it("R23: un código que ya está es `duplicado` y no escribe tipos ni historial; un nombre ya usado también", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const crTiposAntes = await tiposDe(tx, "CR");
      const mismoCodigo = await repo.crear({ id: "CR", nombre: "Otro", tipos: TIPOS }, { usuarioId: actorId });
      const mismoNombre = await repo.crear({ id: "XU", nombre: "Costa Rica", tipos: TIPOS }, { usuarioId: actorId });
      return {
        mismoCodigo,
        mismoNombre,
        crTiposIguales: JSON.stringify(await tiposDe(tx, "CR")) === JSON.stringify(crTiposAntes),
        xu: await tx.pais.count({ where: { id: "XU" } }),
        historial: await tx.historialPlataforma.count({ where: { paisId: { in: ["CR", "XU"] }, actorUsuarioId: actorId } }),
      };
    });

    expect(r).toEqual({
      mismoCodigo: { estado: "duplicado", campo: "id" },
      mismoNombre: { estado: "duplicado", campo: "nombre" },
      crTiposIguales: true,
      xu: 0,
      historial: 0,
    });
  });

  it("R24 (defensa): 1 u 11 tipos no llegan a la base; 2 y 10 sí", async () => {
    const r = await revertida(base, async (tx) => {
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const once = Array.from({ length: 11 }, (_, i) => ({ singular: `Nivel ${i + 1}`, plural: `Niveles ${i + 1}` }));
      const rechazo = async (n: number, id: "XT" | "XU") =>
        repo.crear({ id, nombre: `País ${id}`, tipos: once.slice(0, n) }, { usuarioId: randomUUID() }).then(
          (x) => x.estado,
          (e: unknown) => (e instanceof Error ? "lanza" : String(e)),
        );
      const uno = await rechazo(1, "XT");
      const diez = await rechazo(10, "XT");
      const doce = await rechazo(11, "XU");
      return {
        uno,
        diez,
        doce,
        tiposXT: (await tiposDe(tx, "XT")).length,
        paisXU: await tx.pais.count({ where: { id: "XU" } }),
      };
    });

    expect(r).toEqual({ uno: "lanza", diez: "creado", doce: "lanza", tiposXT: 10, paisXU: 0 });
  });
});
