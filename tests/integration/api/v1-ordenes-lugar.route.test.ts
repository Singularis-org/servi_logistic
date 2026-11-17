import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { ApiOrdenLecturaService } from "@/lib/services/ApiOrdenLecturaService";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo65, type EmpresaGeo65 } from "../db/_fixtures/geo-65";
import { comoDueno, revertida } from "../db/_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "../db/_postgres-real";

// SLT-48 (T2.7; design §5; R28) — LAS RESPUESTAS DE LA API v1 SALEN DEL NODO Y SON LAS DE HOY.
//
// La lectura de v1 (`ApiOrdenLecturaService`: listado y detalle, con el repositorio y la tarifa reales)
// sobre Postgres y el fixture `geo-65`, dos veces sobre las MISMAS ordenes viejas: con sus 3 FK y con
// las 3 FK en NULL (el nodo intacto, como una orden nueva). Las dos respuestas deben ser identicas: el
// costo estimado (zona, grupo de tarifas y marca) sale del nodo, y ningun campo publicado lee las FK.
//
// Hoy el contrato publico de v1 no publica provincia, canton ni distrito (`ApiZonaDTO`: «ni la
// geografia»), asi que R28 se cumple conservando la respuesta tal cual; lo vigila ademas la guardia
// `orden-fk-geo-sin-uso` (R29).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** URLs firmadas deterministas: la respuesta de las dos lecturas tiene que poder compararse. */
const SIN_URLS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => `https://firmada.test/${ruta}`,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, `https://firmada.test/${r}`])),
};

async function lecturaV1(tx: TxDeTest, e: EmpresaGeo65, ids: readonly string[]) {
  await comoApp(tx, e.base.empresaId);
  try {
    return await conEmpresa(e.base.empresaId, async () => {
      const cliente = clienteConSavepoint(tx);
      const servicio = new ApiOrdenLecturaService(new OrdenRepository(cliente), SIN_URLS, new TarifaVigenteRepository(cliente));
      const actor = { usuarioId: e.base.tiendaId, rol: "apiKey" as const };
      const listado = await servicio.listar(actor, { limit: 100, offset: 0 });
      const detalles = [];
      for (const id of ids) detalles.push(await servicio.detallePorOrdenId(actor, id));
      return { listado, detalles };
    });
  } finally {
    await comoDueno(tx);
  }
}

describeSiHayBase("SLT-48 R28 — la API v1 responde lo mismo con y sin las 3 FK (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("listado y detalle identicos en CR y en XA; ningun campo publicado nombra la geografia", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo65(tx);
      const salida = [];
      for (const empresa of [e.cr, e.xa]) {
        const ids = Object.values(empresa.ordenes);
        const antes = await lecturaV1(tx, empresa, ids);
        await comoDueno(tx);
        await tx.$executeRawUnsafe(
          `UPDATE orden SET provincia_id = NULL, canton_id = NULL, distrito_id = NULL WHERE id = ANY($1::text[])`,
          ids,
        );
        const despues = await lecturaV1(tx, empresa, ids);
        salida.push({ antes, despues });
      }
      return salida;
    });

    for (const { antes, despues } of r) {
      // Antivacio: el listado trae ordenes y cada detalle existe.
      expect(JSON.stringify(antes.listado).length).toBeGreaterThan(200);
      expect(antes.detalles.every((d) => d !== null)).toBe(true);
      expect(despues).toEqual(antes);
      // Ni una clave de geografia vieja en lo que se publica.
      expect(JSON.stringify(despues)).not.toMatch(/"(provincia|canton|distrito)(Id|_id)?"/);
    }
  }, 240_000);
});
