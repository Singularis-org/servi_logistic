import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { PaisService } from "@/lib/services/PaisService";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";
import { revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SL-20 (T2.1, T2.3; design §5) — `PaisRepository` contra Postgres real.
//   · R23: el alta crea el país sin geografía y deja su fila `pais_creado` (R33) en la misma
//     transacción; un código o un nombre que ya están los rechaza la base como `duplicado`.
//   · R19 (datos): `deLaEmpresa`, en el contexto de la empresa (`servi_app`, RLS), lee el país de esa
//     empresa; `etiquetasDeEmpresa` da sus nombres de nivel.
//   · R9/R45 (enmienda 2026-10-26): `listarDisponibles` trae `{ id, nombre }` solo de los países con
//     `disponible = true`, por nombre; `listar` sigue trayéndolos todos, con su `disponible`.
//
// Todo en una transacción del dueño que se revierte. El repositorio abre su propia transacción: va
// sobre `clienteConSavepoint`, que abre un SAVEPOINT real, para que un único violado no aborte el caso.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const DATOS_XA = {
  id: "XA",
  nombre: "País de alta XA",
  nivel1Singular: "Región",
  nivel1Plural: "Regiones",
  nivel2Singular: "Comuna",
  nivel2Plural: "Comunas",
  nivel3Singular: "Barrio",
  nivel3Plural: "Barrios",
};

/** Un usuario real para el actor: `historial_plataforma.actor_usuario_id` tiene FK a `usuario`. */
async function actorDePrueba(tx: TxDeTest): Promise<string> {
  const org = await crearOrganizacion(tx);
  const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
  if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
  return u.id;
}

describeSiHayBase("SL-20 — PaisRepository contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R23/R33: crea el país sin geografía y su fila `pais_creado` con el actor congelado", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const servicio = new PaisService(new PaisRepository(clienteConSavepoint(tx)));
      const alta = await servicio.crear(DATOS_XA, { usuarioId: actorId, rol: "superadmin" });
      const fila = await tx.pais.findUnique({ where: { id: "XA" } });
      const provincias = await tx.provincia.count({ where: { paisId: "XA" } });
      const historial = await tx.historialPlataforma.findMany({
        where: { paisId: "XA" },
        select: { accion: true, entidadTipo: true, entidadId: true, entidadEtiqueta: true, actorUsuarioId: true, actorNombre: true },
      });
      return { actorId, alta, fila, provincias, historial };
    });

    expect(r.alta).toEqual({
      status: "ok",
      // R44: nace disponible por el `DEFAULT true` de 20261026120500.
      pais: { ...DATOS_XA, digitosCodigoNivel1: null, digitosCodigoNivel2: null, digitosCodigoNivel3: null, disponible: true },
    });
    expect(r.fila).toMatchObject(DATOS_XA);
    expect(r.provincias).toBe(0);
    expect(r.historial).toEqual([
      {
        accion: "pais_creado",
        entidadTipo: "pais",
        entidadId: "XA",
        entidadEtiqueta: DATOS_XA.nombre,
        actorUsuarioId: r.actorId,
        actorNombre: expect.any(String),
      },
    ]);
  });

  it("R23: un código o un nombre que ya están los rechaza la base como `duplicado`, sin escribir nada", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const primera = await repo.crear(DATOS_XA, { usuarioId: actorId });
      const mismoCodigo = await repo.crear({ ...DATOS_XA, nombre: "Otro nombre" }, { usuarioId: actorId });
      const mismoNombre = await repo.crear({ ...DATOS_XA, id: "XB" }, { usuarioId: actorId });
      const paises = await tx.pais.count({ where: { id: { in: ["XA", "XB"] } } });
      const historial = await tx.historialPlataforma.count({ where: { paisId: { in: ["XA", "XB"] } } });
      return { primera: primera.estado, mismoCodigo, mismoNombre, paises, historial };
    });

    expect(r.primera).toBe("creado");
    expect(r.mismoCodigo).toEqual({ estado: "duplicado", campo: "id" });
    expect(r.mismoNombre).toEqual({ estado: "duplicado", campo: "nombre" });
    expect(r.paises).toBe(1);
    expect(r.historial).toBe(1);
  });

  it("listar y porId leen el país con su regla de código: Costa Rica la tiene, un país nuevo no", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const repo = new PaisRepository(clienteConSavepoint(tx));
      return { lista: await repo.listar(), cr: await repo.porId("CR"), xa: await repo.porId("XA"), nada: await repo.porId("XZ") };
    });

    const ids = r.lista.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["CR", "XA"]));
    // Por nombre: «Costa Rica» antes que «País de prueba XA».
    expect(ids.indexOf("CR")).toBeLessThan(ids.indexOf("XA"));
    expect(r.cr).toMatchObject({ digitosCodigoNivel1: 1, digitosCodigoNivel2: 3, digitosCodigoNivel3: 5 });
    expect(r.xa).toMatchObject({ digitosCodigoNivel1: null, digitosCodigoNivel2: null, digitosCodigoNivel3: null });
    expect(r.nada).toBeNull();
  });

  it("R9/R45: listarDisponibles trae solo los países disponibles, por nombre; listar los trae todos con su disponibilidad", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      await crearPaisDePrueba(tx, "XB");
      await tx.pais.update({ where: { id: "XB" }, data: { disponible: false } });
      const repo = new PaisRepository(clienteConSavepoint(tx));
      return { disponibles: await repo.listarDisponibles(), todos: await repo.listar() };
    });

    const deLaPrueba = (ids: string[]) => ids.filter((id) => ["CR", "XA", "XB"].includes(id));
    expect(deLaPrueba(r.disponibles.map((p) => p.id))).toEqual(["CR", "XA"]);
    expect(r.disponibles.find((p) => p.id === "XA")).toEqual({ id: "XA", nombre: "País de prueba XA" });
    expect(Object.keys(r.disponibles[0]).sort()).toEqual(["id", "nombre"]);
    expect(
      r.todos.filter((p) => ["CR", "XA", "XB"].includes(p.id)).map((p) => `${p.id}=${p.disponible}`),
    ).toEqual(["CR=true", "XA=true", "XB=false"]);
  });

  it("R19/T2.3: en el contexto de una empresa (RLS), sus etiquetas son las de su país: XA y CR", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const enXa = await crearOrganizacionEnPais(tx, "XA");
      const enCr = await crearOrganizacion(tx);
      const servicio = new PaisService(new PaisRepository(clienteConSavepoint(tx)));

      await comoApp(tx, enXa.id);
      const deXa = await servicio.etiquetasDeEmpresa(enXa.id);
      // La RLS de `organizacion` no deja a una empresa leer otra: su país no se ve.
      const ajena = await new PaisRepository(clienteConSavepoint(tx)).deLaEmpresa(enCr.id);
      await comoApp(tx, enCr.id);
      const deCr = await servicio.etiquetasDeEmpresa(enCr.id);
      return { deXa, deCr, ajena };
    });

    expect(r.deXa).toEqual({
      provincia: { singular: "Región", plural: "Regiones" },
      canton: { singular: "Comuna", plural: "Comunas" },
      distrito: { singular: "Barrio", plural: "Barrios" },
    });
    expect(r.deCr).toEqual({
      provincia: { singular: "Provincia", plural: "Provincias" },
      canton: { singular: "Cantón", plural: "Cantones" },
      distrito: { singular: "Distrito", plural: "Distritos" },
    });
    expect(r.ajena).toBeNull();
  });
});
