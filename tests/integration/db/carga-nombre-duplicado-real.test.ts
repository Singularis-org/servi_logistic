import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { handleCargaApi, type CargaApiDeps } from "@/app/api/ordenes/api-key/carga/route";
import { ensureCargaEnTx, type CargaTxClient } from "@/lib/repositories/carga-lote";
import { CargaNombreDuplicadoError } from "@/lib/interfaces/repositories/IOrdenRepository";
import { llevaSqlstate } from "@/lib/db/sqlstate";
import type { ApiKeyAuthResult } from "@/lib/interfaces/services/IApiKeyAuthService";
import type { IBulkOrdenService, CargaViaApiResult } from "@/lib/interfaces/services/IBulkOrdenService";
import type { IEtiquetasDescargaService } from "@/lib/interfaces/services/IEtiquetasDescargaService";
import type { IManifiestoService } from "@/lib/interfaces/services/IManifiestoService";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-93 — API v1: NOMBRE DE LOTE REPETIDO RESPONDIA 500 EN VEZ DE 409 (feature 141, R24).
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `ensureCargaEnTx` traduce la violacion del unico `carga_usuario_carga_name_key` a
// `CargaNombreDuplicadoError`, y el borde la convierte en 409. Hasta SLT-93 la deteccion leia SOLO
// `meta.target`; con `@prisma/adapter-pg` ese campo no trae columnas (SLT-45 lo midio el
// 2026-11-05: llega «(not available)»), asi que el P2002 subia crudo y la API respondia 500.
// Los tests del borde (`tests/integration/api/ordenes-api-key-carga.route.test.ts`) no lo veian:
// su service es un doble que YA lanza `CargaNombreDuplicadoError`.
//
// Aqui el error lo produce Postgres de verdad, dentro de una transaccion que siempre se revierte.
// El SQLSTATE de unicidad es 23505 en PG17 (CI) y en PG18 (local): no hace falta ramificar por
// `server_version_num`, pero el primer caso lo comprueba en la base donde corre.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Un nombre imposible de encontrar por casualidad en otra fila. */
function nombreUnico(): string {
  return `slt93-lote-${randomUUID()}`;
}

async function cuantasCargas(tx: TxDeTest, usuarioCarga: string, name: string): Promise<number> {
  return tx.carga.count({ where: { usuarioCarga, name } });
}

/** Crea un lote dentro de un SAVEPOINT, como lo hace la `$transaction` del service real. */
function crearLote(sp: PrismaClient, usuarioCargaId: string, name: string): Promise<string> {
  return sp.$transaction((t) =>
    ensureCargaEnTx(t as unknown as CargaTxClient, { id: null, usuarioCargaId, totalFiles: 1, name }),
  );
}

/**
 * Service de carga cuyo UNICO trabajo real es el lote: corre `ensureCargaEnTx` contra Postgres
 * (en savepoint) y devuelve un resumen sin ordenes. Asi el borde recibe el error tal cual lo
 * produce la base, no uno fabricado.
 */
function bulkServiceReal(sp: PrismaClient): IBulkOrdenService {
  return {
    cargarMasiva: vi.fn(),
    cargarViaApi: vi.fn(async (_filas, actor, opciones) => {
      const cargaId = await crearLote(sp, actor.usuarioId, opciones?.name ?? "");
      return {
        status: "ok",
        summary: {
          total: 0,
          creadas: 0,
          duplicadas: 0,
          conError: 0,
          filas: [],
          errores: [],
          ordenes: [],
          cargaId,
        },
        manifiestoOrdenIds: [],
      } satisfies CargaViaApiResult;
    }),
  } as IBulkOrdenService;
}

function depsDe(usuarioId: string, service: IBulkOrdenService): CargaApiDeps {
  return {
    autenticar: async () =>
      ({ status: "ok", actor: { usuarioId, rol: "apiKey" }, apiKeyId: `k-${usuarioId}` }) as ApiKeyAuthResult,
    bulkService: service,
    descargaService: { generarYFirmar: vi.fn() } as unknown as IEtiquetasDescargaService,
    manifiestoService: {
      armar: vi.fn().mockResolvedValue({ status: "ok", filas: [], omitidas: [] }),
    } as unknown as IManifiestoService,
  };
}

function peticion(name: string): Request {
  return new Request("http://localhost/api/ordenes/api-key/carga", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer svl_slt93secreto1234567890" },
    body: JSON.stringify({
      name,
      ordenes: [{ num_remision: "REM-SLT93", destinatario: "Ana", telefono: "099" }],
    }),
  });
}

describeSiHayBase("SLT-93 · nombre de lote repetido con Postgres real (feature 141 R24)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("forma medida: el adapter da P2002 SIN columnas en meta.target y SQLSTATE 23505 en la cadena", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const actor = await crearUsuarioDePrueba(tx, "apiKey");
      const name = nombreUnico();
      await tx.carga.create({ data: { id: randomUUID(), usuarioCarga: actor.id, name, totalFiles: 1 } });
      const sp = clienteConSavepoint(tx);
      const error = await sp
        .$transaction((t) =>
          t.carga.create({ data: { id: randomUUID(), usuarioCarga: actor.id, name, totalFiles: 1 } }),
        )
        .then(
          () => null,
          (e: unknown) => e,
        );
      const version = await tx.$queryRawUnsafe<Array<{ version: number }>>(
        `SELECT current_setting('server_version_num')::int AS version`,
      );
      return { error, version: version[0].version };
    });

    expect(r.error, "SLT-93: el segundo insert con el mismo (usuario, name) debe fallar").not.toBeNull();
    expect(r.error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const conocido = r.error as Prisma.PrismaClientKnownRequestError;
    expect(conocido.code).toBe("P2002");
    // La causa del bug: el target no nombra columnas con el adapter.
    const target = conocido.meta?.target;
    expect(Array.isArray(target) && (target as unknown[]).includes("name")).toBe(false);
    // Lo que SI llega, igual en PG17 y PG18: el SQLSTATE 23505 y el nombre del indice.
    expect(r.version, "SLT-93: version de Postgres no reconocida").toBeGreaterThanOrEqual(170000);
    expect(llevaSqlstate(r.error, "23505")).toBe(true);
    expect(JSON.stringify(conocido.meta)).toContain("carga_usuario_carga_name_key");
  });

  it("R24 (repositorio): mismo actor y mismo nombre -> CargaNombreDuplicadoError, no el P2002 crudo", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const actor = await crearUsuarioDePrueba(tx, "apiKey");
      const name = nombreUnico();
      const sp = clienteConSavepoint(tx);
      await crearLote(sp, actor.id, name);
      const antes = await cuantasCargas(tx, actor.id, name);
      const error = await crearLote(sp, actor.id, name).then(
        () => null,
        (e: unknown) => e,
      );
      const despues = await cuantasCargas(tx, actor.id, name);
      return { antes, error, despues, name };
    });

    expect(r.antes, "SLT-93: el primer lote debe existir (control positivo)").toBe(1);
    expect(r.error).toBeInstanceOf(CargaNombreDuplicadoError);
    expect((r.error as CargaNombreDuplicadoError).nombre).toBe(r.name);
    expect(r.despues, "SLT-93: el segundo lote no debe quedar").toBe(1);
  });

  it("R24 (borde v1): POST con nombre repetido por la misma key -> 409 CONFLICT con el nombre, no 500", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const actor = await crearUsuarioDePrueba(tx, "apiKey");
      const name = nombreUnico();
      const deps = depsDe(actor.id, bulkServiceReal(clienteConSavepoint(tx)));
      const primera = await handleCargaApi(peticion(name), deps);
      const segunda = await handleCargaApi(peticion(name), deps);
      return {
        name,
        primera: primera.status,
        segunda: segunda.status,
        cuerpo: (await segunda.json()) as { code?: string; message?: string },
        filas: await cuantasCargas(tx, actor.id, name),
      };
    });

    expect(r.primera, "SLT-93: la primera carga debe entrar (control positivo)").toBe(200);
    expect(r.segunda).toBe(409);
    expect(r.cuerpo.code).toBe("CONFLICT");
    expect(r.cuerpo.message).toBe(`ya existe una carga con el nombre '${r.name}'`);
    expect(r.filas).toBe(1);
  });

  it("R24 (borde v1): OTRA key con el mismo nombre -> 200, el unico es por actor", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const a = await crearUsuarioDePrueba(tx, "apiKey");
      const b = await crearUsuarioDePrueba(tx, "apiKey");
      const name = nombreUnico();
      const sp = clienteConSavepoint(tx);
      const deA = await handleCargaApi(peticion(name), depsDe(a.id, bulkServiceReal(sp)));
      const deB = await handleCargaApi(peticion(name), depsDe(b.id, bulkServiceReal(sp)));
      return {
        deA: deA.status,
        deB: deB.status,
        cargaIdB: ((await deB.json()) as { cargaId?: string | null }).cargaId,
        filasA: await cuantasCargas(tx, a.id, name),
        filasB: await cuantasCargas(tx, b.id, name),
      };
    });

    expect(r.deA).toBe(200);
    expect(r.deB).toBe(200);
    expect(typeof r.cargaIdB).toBe("string");
    expect(r.filasA, "SLT-93: lote de la key A").toBe(1);
    expect(r.filasB, "SLT-93: lote de la key B con el mismo nombre").toBe(1);
  });
});
