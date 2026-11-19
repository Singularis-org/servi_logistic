import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IUsuarioService";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { ReglasPaisEmpresaService } from "@/lib/services/ReglasPaisEmpresaService";
import { UsuarioService } from "@/lib/services/UsuarioService";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba, crearTipoDocumentoDePrueba } from "@/tests/fabricas/paises";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-42 (T4.1; R5, R31) — la lista de tipos de documento que recibe una empresa, contra Postgres real
// y con dos empresas en dos países: A en Costa Rica y B en el país de prueba `XA`.
//
// Dos cosas, porque son dos redes distintas:
//   - el `WHERE` del repositorio (país y `activo`, en el orden del catálogo) se mide como DUEÑO, sin
//     RLS: tiene que dar lo mismo aunque la política no exista;
//   - el camino entero (servicio + reglas del país + repositorio) se mide como `servi_app` con la
//     empresa puesta, que es como corre la app.
//
// Todo corre en una transacción del dueño que se revierte (`revertida`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const MAESTRO: Actor = { usuarioId: "maestro-slt42", rol: "maestro" };
const CLAVES_CR = ["cedula_fisica", "cedula_juridica", "dimex", "nite", "pasaporte"];

let base: PrismaClient;

interface Mundo {
  A: string;
  B: string;
}

async function sembrarMundo(tx: TxDeTest): Promise<Mundo> {
  await crearPaisDePrueba(tx, "XA", { prefijoTelefonico: "999", telefonoDigitosNacionales: 7, zonaHoraria: "Europe/Madrid" });
  // En desorden a propósito: el orden lo tiene que dar `orden`, no la inserción ni el `value`.
  await crearTipoDocumentoDePrueba(tx, "XA", { clave: "carne", orden: 2 });
  await crearTipoDocumentoDePrueba(tx, "XA", { clave: "viejo", orden: 3, activo: false });
  await crearTipoDocumentoDePrueba(tx, "XA", { clave: "nacional", orden: 1 });
  const A = (await crearOrganizacion(tx, { nombre: `Empresa CR ${randomUUID().slice(0, 6)}` })).id;
  const B = (await crearOrganizacionEnPais(tx, "XA", { nombre: `Empresa XA ${randomUUID().slice(0, 6)}` })).id;
  return { A, B };
}

/** El servicio real sobre la tx del test, con la empresa que daría la sesión. */
function servicioDe(tx: TxDeTest, organizacionId: string): UsuarioService {
  const cliente = tx as unknown as PrismaClient;
  const reglas = new ReglasPaisEmpresaService({
    repo: new PaisRepository(cliente),
    empresaDeLaSesion: async () => organizacionId,
  });
  return new UsuarioService(new UserRepository(cliente), undefined, undefined, undefined, undefined, reglas);
}

async function clavesDelServicio(tx: TxDeTest, organizacionId: string): Promise<string[]> {
  const r = await servicioDe(tx, organizacionId).listarTiposIdentificacion(MAESTRO);
  if (r.status !== "ok") throw new Error(`listarTiposIdentificacion: ${r.status}`);
  return r.tipos.map((t) => t.clave);
}

describeSiHayBase("SLT-42 — la lista de tipos de documento es la del país de la empresa (CR y XA)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R5: el WHERE del repositorio deja solo los activos del país pedido, en el orden del catálogo, también sin RLS", async () => {
    const r = await revertida(base, async (tx) => {
      await sembrarMundo(tx);
      const repo = new UserRepository(tx as unknown as PrismaClient);
      const claves = async (paisId: string) => (await repo.listTiposIdentificacion(paisId)).map((t) => t.clave);
      const [xaCompleto] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "tipo_identificacion" WHERE "pais_id" = 'XA'`,
      );
      const primeroCR = (await repo.listTiposIdentificacion("CR"))[0];
      return { xa: await claves("XA"), cr: await claves("CR"), xaEnLaBase: xaCompleto.n, primeroCR };
    });

    // CONTROL: el inactivo existe en la base; si no sale, es por el WHERE.
    expect(r.xaEnLaBase).toBe(3);
    expect(r.xa).toEqual(["nacional", "carne"]);
    expect(r.cr).toEqual(CLAVES_CR);
    // `TipoIdentificacionItem` trae la etiqueta del catálogo y su clave (design §4.2).
    expect(r.primeroCR).toEqual({ id: expect.any(String), value: "cedula", nombre: "Cédula física", clave: "cedula_fisica" });
  });

  it("R5, R31: por el servicio, cada empresa recibe los tipos activos de SU país y nada del otro", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);

      await comoApp(tx, m.A);
      const deA = await clavesDelServicio(tx, m.A);
      await comoDueno(tx);

      await comoApp(tx, m.B);
      const deB = await clavesDelServicio(tx, m.B);
      await comoDueno(tx);

      return { deA, deB };
    });

    expect(r.deA).toEqual(CLAVES_CR);
    expect(r.deB).toEqual(["nacional", "carne"]);
  });
});
