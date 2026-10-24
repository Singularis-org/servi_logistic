import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { UserRepository } from "@/lib/repositories/UserRepository";
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

// SL-41 / T14 (design §16.1, R38) — `updatePasswordHash` marca `contrasena_definida_at` en el mismo
// UPDATE que el hash, contra Postgres real: el doble de `tests/integration/user-repository-update-
// password.test.ts` ve el objeto `data`, no si la columna existe y se escribe de verdad.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let prisma: PrismaClient;

type Fila = { password_hash: string; contrasena_definida_at: Date | null };

async function leer(tx: TxDeTest, id: string): Promise<Fila> {
  const [f] = await tx.$queryRawUnsafe<Fila[]>(
    `SELECT "password_hash", "contrasena_definida_at" FROM "usuario" WHERE "id" = $1`,
    id,
  );
  return f;
}

describeSiHayBase("SL-41 — updatePasswordHash marca contrasena_definida_at (R38)", () => {
  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("tras llamarlo, la columna deja de ser NULL y el hash es el nuevo; otro usuario no se toca", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const rol = await idDeRol(tx, "maestro");
      const org = await crearOrganizacion(tx);
      const yo = await insertarUsuario(tx, rol, org.id);
      const otro = await insertarUsuario(tx, rol, org.id);
      if (!yo.desenlace.ok || !otro.desenlace.ok) throw new Error("no se sembraron los usuarios");

      const antes = await leer(tx, yo.id);
      await new UserRepository(clienteConTransaccionAnidada(tx)).updatePasswordHash(yo.id, "hash-sl41-nuevo");
      return { antes, despues: await leer(tx, yo.id), otro: await leer(tx, otro.id) };
    });

    // Control: la fila nace sin la marca, asi que el cambio lo hizo la llamada.
    expect(r.antes.contrasena_definida_at).toBeNull();
    expect(r.despues.password_hash).toBe("hash-sl41-nuevo");
    expect(r.despues.password_hash).not.toBe(r.antes.password_hash);
    expect(r.despues.contrasena_definida_at).toBeInstanceOf(Date);
    expect(r.otro.contrasena_definida_at).toBeNull();
  });
});
