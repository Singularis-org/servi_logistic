import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import type { AnilloDeClaves } from "@/lib/config/integraciones";
import { BovedaIntegraciones, ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { IntegracionRecifradoRepository } from "@/lib/repositories/IntegracionRecifradoRepository";
import { RecifradoIntegracionesService } from "@/lib/services/RecifradoIntegracionesService";
import { ejecutarRecifrado } from "@/scripts/recifrar-integraciones";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { CLAVE_LOCK_ESCRITURA_REAL, HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SL-36 T5.4 (design §12; R39, R40) — el recifrado contra Postgres real, con DOS empresas creadas por
// el propio caso dentro de una transaccion que siempre se revierte.
//
// Siembra (comprobada como dueno antes de medir):
//   - A: WhatsApp con sus dos secretos en v1, y Maps ya en v2;
//   - B: el asistente en v1, y Maps ILEGIBLE (cifrado con los datos asociados de la empresa A).
// Anillo del comando: v1 + v2, activa v2.
//
// POR QUE EL CLIENTE BASE. Es el dueno de las tablas, sin extension: lo unico que separa a A de B es
// el `where` del repositorio y la empresa que `paraCadaEmpresa` pone en contexto. Las empresas que
// recorre son SOLO las dos del caso (el `cliente` de `paraCadaEmpresa` es un doble que las lista):
// la base local puede tener otras con integraciones cifradas con otras claves, y contarlas haria
// el conteo dependiente de la base.
//
// Mutaciones medidas (progress/impl_SL-36-T5b.md): `--solo-contar` que escribe -> rojo R40; sin
// `organizacionId` en el `where` de `listarSecretos` -> rojo R39.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const V1 = Buffer.alloc(32, 0x11);
const V2 = Buffer.alloc(32, 0x22);
const soloV1: AnilloDeClaves = { activa: "v1", claves: new Map([["v1", V1]]) };
const rotado: AnilloDeClaves = { activa: "v2", claves: new Map([["v1", V1], ["v2", V2]]) };
const soloV2: AnilloDeClaves = { activa: "v2", claves: new Map([["v2", V2]]) };

const enV1 = new BovedaIntegraciones(() => soloV1);
const enV2 = new BovedaIntegraciones(() => soloV2);
const delComando = new BovedaIntegraciones(() => rotado);

let base: PrismaClient;

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transaccion del dueno que siempre se revierte, bajo el lock de escritura real de la 227. */
async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

interface Sembrada {
  A: string;
  B: string;
  /** id de integracion -> su empresa y { campo -> texto en claro }, de lo LEGIBLE. */
  claros: Map<string, { org: string; valores: Record<string, string> }>;
  ilegibleId: string;
  /** Lo que nunca puede salir por consola: claros, cifrados, ids de integracion y de empresa. */
  prohibidos: string[];
  nombres: string[];
}

async function insertar(
  tx: TxDeTest,
  fila: {
    id: string;
    organizacionId: string;
    servicio: "whatsapp" | "google_maps" | "asistente";
    secretos: Record<string, string>;
    datosPublicos?: Record<string, string>;
    whatsappNumeroId?: string;
    whatsappResumenVerificacion?: string;
  },
): Promise<void> {
  await tx.integracion.create({ data: { estado: "conectada", datosPublicos: {}, ...fila } });
}

async function sembrar(tx: TxDeTest): Promise<Sembrada> {
  const nombres = [`Empresa A recifrado ${randomUUID()}`, `Empresa B recifrado ${randomUUID()}`];
  const A = (await crearOrganizacion(tx, { nombre: nombres[0] })).id;
  const B = (await crearOrganizacion(tx, { nombre: nombres[1] })).id;
  const claros = new Map<string, { org: string; valores: Record<string, string> }>();
  const prohibidos: string[] = [A, B];

  async function cifradosDe(
    boveda: BovedaIntegraciones,
    org: string,
    id: string,
    valores: Record<string, string>,
  ): Promise<Record<string, string>> {
    const salida: Record<string, string> = {};
    for (const [campo, claro] of Object.entries(valores)) {
      salida[campo] = await boveda.cifrar(claro, { organizacionId: org, integracionId: id, campo });
      prohibidos.push(claro, salida[campo]);
    }
    return salida;
  }

  const waA = randomUUID();
  const clarosWa = { token_acceso: `tok-${randomUUID()}`, app_secret: `app-secret-${randomUUID()}` };
  claros.set(waA, { org: A, valores: clarosWa });
  await insertar(tx, {
    id: waA,
    organizacionId: A,
    servicio: "whatsapp",
    secretos: await cifradosDe(enV1, A, waA, clarosWa),
    datosPublicos: { nombreVisible: "Mensajeria", wabaId: "120000000000001", telefonoVisible: "+0 000", nombreVerificado: "M" },
    whatsappNumeroId: `9${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    whatsappResumenVerificacion: new ResumenSecretoSha256().resumen(randomUUID()),
  });

  const mapsA = randomUUID();
  const clarosMapsA = { clave_api: `maps-a-${randomUUID()}` };
  claros.set(mapsA, { org: A, valores: clarosMapsA });
  await insertar(tx, { id: mapsA, organizacionId: A, servicio: "google_maps", secretos: await cifradosDe(enV2, A, mapsA, clarosMapsA) });

  const asisB = randomUUID();
  const clarosAsisB = { clave_api: `asistente-b-${randomUUID()}` };
  claros.set(asisB, { org: B, valores: clarosAsisB });
  await insertar(tx, { id: asisB, organizacionId: B, servicio: "asistente", secretos: await cifradosDe(enV1, B, asisB, clarosAsisB) });

  // Ilegible: cifrado con los datos asociados de A y guardado en B (un cifrado copiado de empresa).
  const mapsB = randomUUID();
  await insertar(tx, {
    id: mapsB,
    organizacionId: B,
    servicio: "google_maps",
    secretos: await cifradosDe(enV1, A, mapsB, { clave_api: `maps-b-${randomUUID()}` }),
  });

  prohibidos.push(waA, mapsA, asisB, mapsB);
  // Siembra comprobada como dueno: sin esto un recifrado que no encuentra nada pasaria en verde.
  expect(await tx.integracion.count({ where: { organizacionId: { in: [A, B] } } })).toBe(4);
  return { A, B, claros, ilegibleId: mapsB, prohibidos, nombres };
}

async function secretosEnBase(tx: TxDeTest, s: Sembrada): Promise<Map<string, Record<string, string>>> {
  const filas = await tx.integracion.findMany({
    where: { organizacionId: { in: [s.A, s.B] } },
    select: { id: true, secretos: true },
  });
  return new Map(filas.map((f) => [f.id, f.secretos as Record<string, string>]));
}

function servicioDe(tx: TxDeTest, s: Sembrada): RecifradoIntegracionesService {
  const soloLasDos: ClienteDeOrganizaciones = {
    organizacion: { findMany: async () => [{ id: s.A }, { id: s.B }] },
  };
  return new RecifradoIntegracionesService({
    cifrador: delComando,
    versionActiva: () => rotado.activa,
    repositorio: new IntegracionRecifradoRepository(tx as unknown as Pick<PrismaClient, "integracion">),
    recorrerEmpresas: (fn) => paraCadaEmpresa(fn, { cliente: soloLasDos }),
  });
}

/** Todo lo que sale por consola o por stdout/stderr mientras corre `fn`. */
async function capturarSalida<T>(fn: () => Promise<T>): Promise<{ valor: T; texto: string }> {
  const trozos: string[] = [];
  const guardar = (...args: unknown[]) => {
    trozos.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a) ?? String(a))).join(" "));
  };
  const espias = [
    vi.spyOn(console, "log").mockImplementation(guardar),
    vi.spyOn(console, "info").mockImplementation(guardar),
    vi.spyOn(console, "warn").mockImplementation(guardar),
    vi.spyOn(console, "error").mockImplementation(guardar),
    vi.spyOn(process.stdout, "write").mockImplementation((c: string | Uint8Array) => {
      guardar(String(c));
      return true;
    }),
    vi.spyOn(process.stderr, "write").mockImplementation((c: string | Uint8Array) => {
      guardar(String(c));
      return true;
    }),
  ];
  try {
    const valor = await fn();
    return { valor, texto: trozos.join("\n") };
  } finally {
    for (const e of espias) e.mockRestore();
  }
}

describeSiHayBase("SL-36 T5.4 — recifrado de integraciones contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("recifra a la activa en dos empresas; conteo por versión e ilegibles; no imprime valores", async () => {
    await revertida(async (tx) => {
      const s = await sembrar(tx);
      const antes = await secretosEnBase(tx, s);

      const { valor: codigo, texto } = await capturarSalida(() => ejecutarRecifrado(servicioDe(tx, s), []));
      expect(codigo).toBe(0);

      // Conteo: los 4 legibles quedan en v2 (3 movidos + el de Maps de A, que ya estaba); 1 ilegible.
      expect(texto).toContain("Recifrados a v2: 3.");
      expect(texto).toContain("  v2 -> 4");
      expect(texto).not.toContain("v1 ->");
      expect(texto).toContain("ilegibles: 1");
      for (const prohibido of [...s.prohibidos, ...s.nombres]) expect(texto).not.toContain(prohibido);

      const despues = await secretosEnBase(tx, s);
      for (const [id, { org, valores }] of s.claros) {
        const guardados = despues.get(id) as Record<string, string>;
        for (const [campo, claro] of Object.entries(valores)) {
          // Legible SOLO con v2: la v1 ya se podria retirar del anillo.
          expect(guardados[campo].startsWith("v2:")).toBe(true);
          expect(await enV2.descifrar(guardados[campo], { organizacionId: org, integracionId: id, campo })).toBe(claro);
        }
      }
      // El ilegible no se toca: byte a byte el mismo valor.
      expect(despues.get(s.ilegibleId)).toEqual(antes.get(s.ilegibleId));

      // Una segunda pasada no tiene nada que mover.
      const otra = await servicioDe(tx, s).ejecutar({ soloContar: false });
      expect(otra).toMatchObject({ recifrados: 0, porVersion: { v2: 4 }, ilegibles: 1, conflictos: 0, empresasConError: 0 });
    });
  }, 60_000);

  it("--solo-contar no escribe", async () => {
    await revertida(async (tx) => {
      const s = await sembrar(tx);
      const antes = await secretosEnBase(tx, s);

      const { valor: codigo, texto } = await capturarSalida(() =>
        ejecutarRecifrado(servicioDe(tx, s), ["--solo-contar"]),
      );
      expect(codigo).toBe(0);
      expect(texto).toContain("Solo contar: no se escribio nada.");
      // El mismo conteo, como esta hoy: 3 legibles en v1, 1 en v2, 1 ilegible.
      expect(texto).toContain("  v1 -> 3");
      expect(texto).toContain("  v2 -> 1");
      expect(texto).toContain("ilegibles: 1");
      for (const prohibido of [...s.prohibidos, ...s.nombres]) expect(texto).not.toContain(prohibido);

      expect(await secretosEnBase(tx, s)).toEqual(antes);
    });
  }, 60_000);

  it("un argumento desconocido sale con 1 sin tocar la base ni repetir el argumento", async () => {
    await revertida(async (tx) => {
      const s = await sembrar(tx);
      const antes = await secretosEnBase(tx, s);
      const { valor: codigo, texto } = await capturarSalida(() =>
        ejecutarRecifrado(servicioDe(tx, s), ["--clave=secreta-pegada"]),
      );
      expect(codigo).toBe(1);
      expect(texto).not.toContain("secreta-pegada");
      expect(await secretosEnBase(tx, s)).toEqual(antes);
    });
  }, 60_000);
});
