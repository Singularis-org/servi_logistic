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
//   · R23/R41: el alta crea el país del catálogo sin geografía, con el nombre del catálogo, y deja su
//     fila `pais_creado` (R33) en la misma transacción; un código o un nombre que ya están los rechaza la base como `duplicado`.
//   · R19 (datos): `deLaEmpresa`, en el contexto de la empresa (`servi_app`, RLS), lee el país de esa
//     empresa; `etiquetasDeEmpresa` da sus nombres de nivel.
//   · R9/R45 (enmienda 2026-10-26): `listarDisponibles` trae `{ id, nombre }` solo de los países con
//     `disponible = true`, por nombre; `listar` sigue trayéndolos todos, con su `disponible`.
//   · R47 (T4.6): `cambiarDisponible` escribe su fila `pais_disponibilidad_*` en la misma transacción,
//     y pedir el estado que ya tiene no escribe nada.
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

/** La entrada del alta por el servicio (R23, R41): el código del catálogo y los seis nombres de nivel. */
const NIVELES_PE = {
  id: "PE",
  nivel1Singular: "Departamento",
  nivel1Plural: "Departamentos",
  nivel2Singular: "Provincia",
  nivel2Plural: "Provincias",
  nivel3Singular: "Distrito",
  nivel3Plural: "Distritos",
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

  it("R23/R33/R41: crea el país del catálogo sin geografía, con el nombre del catálogo, y su fila `pais_creado` con el actor congelado", async () => {
    // El alta por el servicio solo acepta códigos del catálogo (R41): `PE`, que en la base no está
    // (R43: solo `CR`). La transacción se revierte.
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const servicio = new PaisService(new PaisRepository(clienteConSavepoint(tx)));
      const alta = await servicio.crear(NIVELES_PE, { usuarioId: actorId, rol: "superadmin" });
      const fila = await tx.pais.findUnique({ where: { id: "PE" } });
      const provincias = await tx.provincia.count({ where: { paisId: "PE" } });
      const historial = await tx.historialPlataforma.findMany({
        where: { paisId: "PE" },
        select: { accion: true, entidadTipo: true, entidadId: true, entidadEtiqueta: true, actorUsuarioId: true, actorNombre: true },
      });
      return { actorId, alta, fila, provincias, historial };
    });

    const esperado = { ...NIVELES_PE, nombre: "Perú" };
    expect(r.alta).toEqual({
      status: "ok",
      // R44: nace disponible por el `DEFAULT true` de 20261026120500.
      pais: { ...esperado, digitosCodigoNivel1: null, digitosCodigoNivel2: null, digitosCodigoNivel3: null, disponible: true },
    });
    expect(r.fila).toMatchObject(esperado);
    expect(r.provincias).toBe(0);
    expect(r.historial).toEqual([
      {
        accion: "pais_creado",
        entidadTipo: "pais",
        entidadId: "PE",
        entidadEtiqueta: "Perú",
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

  it("R47 (T4.6): apagar y encender un país deja UNA fila `pais_disponibilidad_*` por cambio; pedir el mismo estado no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      await crearPaisDePrueba(tx, "XA");
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const actor = { usuarioId: actorId };
      const pasos = [
        await repo.cambiarDisponible("XA", false, actor),
        await repo.cambiarDisponible("XA", false, actor),
        await repo.cambiarDisponible("XA", true, actor),
        await repo.cambiarDisponible("XA", true, actor),
        await repo.cambiarDisponible("XZ", false, actor),
      ];
      const disponible = (await tx.pais.findUnique({ where: { id: "XA" }, select: { disponible: true } }))?.disponible;
      const historial = await tx.historialPlataforma.findMany({
        where: { paisId: { in: ["XA", "XZ"] } },
        orderBy: { createdAt: "asc" },
        select: { accion: true, entidadTipo: true, entidadId: true, entidadEtiqueta: true, actorUsuarioId: true, actorNombre: true },
      });
      return { actorId, pasos, disponible, historial };
    });

    expect(r.pasos).toEqual(["cambiado", "sin_cambio", "cambiado", "sin_cambio", "no_existe"]);
    expect(r.disponible).toBe(true);
    const fila = (accion: string) => ({
      accion,
      entidadTipo: "pais",
      entidadId: "XA",
      entidadEtiqueta: "País de prueba XA",
      actorUsuarioId: r.actorId,
      actorNombre: expect.any(String),
    });
    // `created_at` es el de la transacción del test: el orden de las dos filas no se puede fijar por fecha.
    expect(r.historial).toHaveLength(2);
    expect(r.historial).toEqual(
      expect.arrayContaining([fila("pais_disponibilidad_desactivada"), fila("pais_disponibilidad_activada")]),
    );
  });

  it("R47: si el registro en el historial falla, la disponibilidad tampoco cambia (misma transacción)", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      await crearPaisDePrueba(tx, "XA");
      const repo = new PaisRepository(clienteConSavepoint(tx, "plataforma"));
      const fallo = await repo.cambiarDisponible("XA", false, { usuarioId: actorId }).then(
        () => null,
        (e: unknown) => (e instanceof Error ? e.name : String(e)),
      );
      const disponible = (await tx.pais.findUnique({ where: { id: "XA" }, select: { disponible: true } }))?.disponible;
      // Contraprueba del mismo camino sin romper el registro: sí cambia.
      const sano = await new PaisRepository(clienteConSavepoint(tx)).cambiarDisponible("XA", false, { usuarioId: actorId });
      return { fallo, disponible, sano };
    });
    expect(r).toEqual({ fallo: "RegistroCaido", disponible: true, sano: "cambiado" });
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
