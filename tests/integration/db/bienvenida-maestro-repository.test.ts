import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { BienvenidaMaestroRepository } from "@/lib/repositories/BienvenidaMaestroRepository";
import { crearOrganizacion } from "../../fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";

// SL-41 / T4 y T14 (design §6.2 y §16.2, R12, R30, R38) — las dos lecturas de plataforma de la
// bienvenida, con su SQL contra Postgres real.
//
// Un test de servicio con dobles no ve el `where`: quitar el filtro por empresa o por rol, o
// invertir el orden del «primer maestro», lo dejaria en verde. Aqui el repositorio REAL corre sobre
// la transaccion del test (cliente base, sin la extension: lo mismo que ve dentro del
// `comoPlataforma` de la action), con datos propios, en una transaccion revertida y serializada.
//
// La base puede traer organizaciones de otros tests: los casos de la lista miran solo las suyas.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let prisma: PrismaClient;

/** Un usuario del rol dado, con `created_at` fijo: dentro de la transaccion `now()` es el mismo. */
async function usuario(
  tx: TxDeTest,
  rolId: string,
  organizacionId: string,
  nombre: string,
  creado: string,
  contrasenaDefinida: boolean = false,
): Promise<{ id: string; nombre: string; email: string }> {
  const u = await insertarUsuario(tx, rolId, organizacionId);
  if (!u.desenlace.ok) throw new Error(`no se sembro ${nombre}: ${JSON.stringify(u.desenlace)}`);
  const [f] = await tx.$queryRawUnsafe<{ email: string }[]>(
    `UPDATE "usuario" SET "nombre" = $2, "created_at" = $3::timestamp,
            "contrasena_definida_at" = CASE WHEN $4 THEN now() ELSE NULL END
      WHERE "id" = $1 RETURNING "email"`,
    u.id,
    nombre,
    creado,
    contrasenaDefinida,
  );
  return { id: u.id, nombre, email: f.email };
}

async function nombreDe(tx: TxDeTest, organizacionId: string): Promise<string> {
  const [f] = await tx.$queryRawUnsafe<{ nombre: string }[]>(
    `SELECT "nombre" FROM "organizacion" WHERE "id" = $1`,
    organizacionId,
  );
  return f.nombre;
}

function conRepo<T>(fn: (tx: TxDeTest, repo: BienvenidaMaestroRepository) => Promise<T>): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    await serializarEscriturasReales(tx);
    return fn(tx, new BienvenidaMaestroRepository(clienteConTransaccionAnidada(tx)));
  });
}

describeSiHayBase("SL-41 — BienvenidaMaestroRepository contra Postgres", () => {
  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("maestroParaBienvenida (design §6.2)", () => {
    it("devuelve el maestro MAS ANTIGUO de esa empresa, con el nombre de esa empresa", async () => {
      const r = await conRepo(async (tx, repo) => {
        const maestro = await idDeRol(tx, "maestro");
        const admin = await idDeRol(tx, "admin");
        const a = await crearOrganizacion(tx);
        const b = await crearOrganizacion(tx);
        // El de otra empresa es el mas antiguo de todos: sin el filtro por empresa saldria el.
        await usuario(tx, maestro, b.id, "Maestro de B", "1990-01-01T00:00:00");
        // Un admin de A anterior a los maestros: sin el filtro por rol saldria el.
        await usuario(tx, admin, a.id, "Admin de A", "1995-01-01T00:00:00");
        // El mas nuevo se inserta primero: el orden lo pone `created_at`, no el de insercion.
        await usuario(tx, maestro, a.id, "Maestro nuevo de A", "2000-06-01T00:00:00");
        const viejo = await usuario(tx, maestro, a.id, "Maestro viejo de A", "2000-01-01T00:00:00");
        return {
          obtenido: await repo.maestroParaBienvenida(a.id),
          esperado: {
            usuarioId: viejo.id,
            nombre: viejo.nombre,
            email: viejo.email,
            empresaNombre: await nombreDe(tx, a.id),
          },
          nombreB: await nombreDe(tx, b.id),
        };
      });

      expect(r.obtenido).toEqual(r.esperado);
      expect(r.esperado.empresaNombre).not.toBe(r.nombreB);
    });

    it("con dos maestros del mismo instante, desempata por id", async () => {
      const r = await conRepo(async (tx, repo) => {
        const maestro = await idDeRol(tx, "maestro");
        const a = await crearOrganizacion(tx);
        const x = await usuario(tx, maestro, a.id, "Maestro X", "2000-01-01T00:00:00");
        const y = await usuario(tx, maestro, a.id, "Maestro Y", "2000-01-01T00:00:00");
        return { obtenido: await repo.maestroParaBienvenida(a.id), menor: [x.id, y.id].sort()[0] };
      });

      expect(r.obtenido?.usuarioId).toBe(r.menor);
    });

    it("una empresa sin maestro devuelve null, aunque tenga otros usuarios y otra empresa tenga maestro", async () => {
      const r = await conRepo(async (tx, repo) => {
        const maestro = await idDeRol(tx, "maestro");
        const admin = await idDeRol(tx, "admin");
        const sinMaestro = await crearOrganizacion(tx);
        const otra = await crearOrganizacion(tx);
        await usuario(tx, admin, sinMaestro.id, "Admin solo", "2000-01-01T00:00:00");
        await usuario(tx, maestro, otra.id, "Maestro de otra", "1990-01-01T00:00:00");
        return repo.maestroParaBienvenida(sinMaestro.id);
      });

      expect(r).toBeNull();
    });
  });

  describe("organizacionesConBienvenidaPendiente (design §16.2, R38)", () => {
    it("sale la empresa cuyo PRIMER maestro no fijo contrasena, y no la que si; el mas nuevo no cuenta", async () => {
      const r = await conRepo(async (tx, repo) => {
        const maestro = await idDeRol(tx, "maestro");
        const admin = await idDeRol(tx, "admin");
        // P: el primero pendiente; el segundo ya la fijo. Sale (el segundo no cuenta).
        const p = await crearOrganizacion(tx);
        await usuario(tx, maestro, p.id, "P primero", "2000-01-01T00:00:00", false);
        await usuario(tx, maestro, p.id, "P segundo", "2000-02-01T00:00:00", true);
        // Q: el primero ya la fijo; el segundo pendiente. No sale.
        const q = await crearOrganizacion(tx);
        await usuario(tx, maestro, q.id, "Q primero", "2000-01-01T00:00:00", true);
        await usuario(tx, maestro, q.id, "Q segundo", "2000-02-01T00:00:00", false);
        // R: su unico maestro ya la fijo, pero tiene un admin pendiente MAS ANTIGUO. No sale.
        const rr = await crearOrganizacion(tx);
        await usuario(tx, admin, rr.id, "R admin", "1990-01-01T00:00:00", false);
        await usuario(tx, maestro, rr.id, "R maestro", "2000-01-01T00:00:00", true);
        // S: sin maestros. No sale.
        const s = await crearOrganizacion(tx);
        await usuario(tx, admin, s.id, "S admin", "2000-01-01T00:00:00", false);
        const lista = await repo.organizacionesConBienvenidaPendiente();
        const mias = new Set([p.id, q.id, rr.id, s.id]);
        return { mias: lista.filter((id) => mias.has(id)).sort(), p: p.id };
      });

      expect(r.mias).toEqual([r.p]);
    });

    it("cada empresa sale una sola vez y las de otras no se mezclan", async () => {
      const r = await conRepo(async (tx, repo) => {
        const maestro = await idDeRol(tx, "maestro");
        const a = await crearOrganizacion(tx);
        const b = await crearOrganizacion(tx);
        await usuario(tx, maestro, a.id, "A1", "2000-01-01T00:00:00", false);
        await usuario(tx, maestro, a.id, "A2", "2000-01-02T00:00:00", false);
        // B: su primero ya la fijo; que A tenga pendientes no la arrastra.
        await usuario(tx, maestro, b.id, "B1", "1990-01-01T00:00:00", true);
        await usuario(tx, maestro, b.id, "B2", "2000-01-03T00:00:00", false);
        const lista = await repo.organizacionesConBienvenidaPendiente();
        return { lista, a: a.id, b: b.id };
      });

      expect(r.lista.filter((id) => id === r.a)).toHaveLength(1);
      expect(r.lista).not.toContain(r.b);
      expect(new Set(r.lista).size).toBe(r.lista.length);
    });
  });
});
