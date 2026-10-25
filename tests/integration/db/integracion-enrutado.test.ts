import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { BovedaIntegraciones, ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { EXCEPCIONES_DE_PLATAFORMA } from "@/lib/db/excepciones-aislamiento";
import { IntegracionEnrutadoRepository } from "@/lib/repositories/IntegracionEnrutadoRepository";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  crearPrismaDeTestConEspia,
  type EventoSqlDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SL-36 T3.3 (design §10; R22) — la traducción del webhook de WhatsApp contra Postgres real: un
// número o un resumen de token lleva a SU empresa y a su integración, entre dos empresas, y la
// consulta que lo hace selecciona SOLO `id` y `organizacion_id`.
//
// POR QUÉ SE MIRA EL SQL Y NO SOLO EL RESULTADO. El repositorio arma el resultado campo a campo:
// añadir `secretos` al `select` no cambiaría lo que devuelve, pero sí lo que sale de la base en
// plataforma, sin filtro de empresa. Lo que se afirma es la consulta que Prisma mandó al servidor,
// capturada con el cliente espía.
//
// Mutación medida (progress/impl_SL-36-T3.md): un campo más en el `select` pone rojo «solo id y
// organizacion_id».

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let prisma: PrismaClient;
let eventos: EventoSqlDeTest[];

const boveda = new BovedaIntegraciones(() => ({ activa: "v1", claves: new Map([["v1", Buffer.alloc(32, 0x5a)]]) }));
const resumidor = new ResumenSecretoSha256();

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

interface Sembrada {
  org: string;
  id: string;
  numero: string;
  token: string;
}

/** Una empresa nueva con su WhatsApp, insertada como dueño con la empresa fijada. */
async function empresaConWhatsapp(tx: TxDeTest): Promise<Sembrada> {
  const org = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, org);
  const id = randomUUID();
  const numero = `8${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const token = `verificacion-${randomUUID()}`;
  const secretos = JSON.stringify({
    token_acceso: await boveda.cifrar("t", { organizacionId: org, integracionId: id, campo: "token_acceso" }),
    app_secret: await boveda.cifrar("s", { organizacionId: org, integracionId: id, campo: "app_secret" }),
  });
  await tx.$executeRawUnsafe(
    `INSERT INTO integracion (id, servicio, estado, secretos, whatsapp_numero_id, whatsapp_resumen_verificacion)
     VALUES ($1, 'whatsapp', 'conectada', $2::jsonb, $3, $4)`,
    id,
    secretos,
    numero,
    resumidor.resumen(token),
  );
  return { org, id, numero, token };
}

/** Las columnas que lista cada SELECT sobre `integracion` emitido desde `desde`. */
function columnasSeleccionadas(desde: number): string[][] {
  return eventos
    .slice(desde)
    .map((e) => e.query)
    .filter((q) => /^\s*SELECT\b/i.test(q) && /FROM\s+"public"\."integracion"/i.test(q))
    .map((q) => {
      const lista = /^\s*SELECT\s+([\s\S]*?)\s+FROM\s/i.exec(q)?.[1] ?? "";
      return lista.split(",").map((c) => /"([^"]+)"\s*(?:AS\s+.*)?$/i.exec(c.trim())?.[1] ?? c.trim()).sort();
    });
}

describeSiHayBase("SL-36 T3.3 — IntegracionEnrutadoRepository contra Postgres (R22)", () => {
  beforeAll(() => {
    ({ prisma, eventos } = crearPrismaDeTestConEspia());
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("está en EXCEPCIONES_DE_PLATAFORMA con la ficha SL-36", () => {
    const entrada = EXCEPCIONES_DE_PLATAFORMA.find((e) => e.archivo === "lib/repositories/IntegracionEnrutadoRepository.ts");
    expect(entrada?.ficha).toBe("SL-36");
  });

  it("número y resumen llevan a SU empresa entre dos; lo desconocido no aparece; select solo id y organizacion_id", async () => {
    const r = await revertida(async (tx) => {
      const a = await empresaConWhatsapp(tx);
      const b = await empresaConWhatsapp(tx);
      const repo = new IntegracionEnrutadoRepository(tx);
      const desde = eventos.length;
      // Desde DENTRO del contexto de B: la traducción no puede quedar acotada a la empresa en curso.
      const salida = await conEmpresa(b.org, async () => ({
        numeros: await repo.porNumeros([a.numero, b.numero, "000000000", a.numero]),
        porTokenA: await repo.porResumenVerificacion(resumidor.resumen(a.token)),
        porTokenDesconocido: await repo.porResumenVerificacion(resumidor.resumen(`otro-${randomUUID()}`)),
      }));
      return { a, b, salida, columnas: columnasSeleccionadas(desde) };
    });

    expect([...r.salida.numeros.entries()].sort()).toEqual(
      [
        [r.a.numero, { organizacionId: r.a.org, integracionId: r.a.id }],
        [r.b.numero, { organizacionId: r.b.org, integracionId: r.b.id }],
      ].sort(),
    );
    expect(r.salida.porTokenA).toEqual({ organizacionId: r.a.org, integracionId: r.a.id });
    expect(r.salida.porTokenDesconocido).toBeNull();

    // R22: tres números distintos + dos resúmenes = cinco consultas, y cada una pide solo los dos ids.
    expect(r.columnas).toHaveLength(5);
    for (const columnas of r.columnas) expect(columnas).toEqual(["id", "organizacion_id"]);
  });
});
