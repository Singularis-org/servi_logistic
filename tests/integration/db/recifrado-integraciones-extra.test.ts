import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { construirServicioRecifrado, handleRecifrarIntegraciones } from "@/app/api/cron/recifrar-integraciones/route";
import type { AnilloDeClaves } from "@/lib/config/integraciones";
import { BovedaIntegraciones, ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { CLAVE_LOCK_ESCRITURA_REAL, HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-268 T3.1 (design §5; R9-R12, R17) — el paso de v1 a v9 contra Postgres real, con la MISMA
// composicion que usa la ruta (`construirServicioRecifrado`) y entrando por el handler HTTP, dentro de
// una transaccion que siempre se revierte.
//
// Anillo, como quedara en prod tras los pasos operativos: `INTEGRACIONES_CLAVES_CIFRADO = v1`,
// `INTEGRACIONES_CLAVES_CIFRADO_EXTRA = v9`, activa `v9`. Las dos claves se generan aqui.
//
// Siembra (una empresa creada por el propio caso, comprobada como dueno antes de medir):
//   - optimizacion_rutas en `error`, con dos secretos en v1, `ultimo_error_codigo`, `ultima_prueba_at`
//     y `datos_publicos` con valor (el caso real de prod, D10);
//   - whatsapp `conectada`, con dos secretos en v1 y las columnas `whatsapp_*` y `ultimo_webhook_at`;
//   - google_maps con su unico valor ILEGIBLE (cifrado con los datos asociados de otra integracion).
//
// Archivo aparte de `recifrado-integraciones.test.ts` por D12 (choque con fichas de otra persona).
// `revertida` y `Revertir` son copia de ese archivo: alli no estan exportados.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const V1 = randomBytes(32);
const V9 = randomBytes(32);
const soloV1: AnilloDeClaves = { activa: "v1", claves: new Map([["v1", V1]]) };
/** El anillo de la copia entregada, que comparte la base: solo v9. */
const soloV9: AnilloDeClaves = { activa: "v9", claves: new Map([["v9", V9]]) };

const enV1 = new BovedaIntegraciones(() => soloV1);
const deLaCopia = new BovedaIntegraciones(() => soloV9);

const ENV = {
  INTEGRACIONES_CLAVES_CIFRADO: `v1:${V1.toString("base64")}`,
  INTEGRACIONES_CLAVES_CIFRADO_EXTRA: `v9:${V9.toString("base64")}`,
  INTEGRACIONES_CLAVE_ACTIVA: "v9",
};

const SECRETO = `cron-${randomBytes(12).toString("hex")}`;

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
  org: string;
  /** id de integracion -> { campo -> texto en claro }, de lo LEGIBLE. */
  claros: Map<string, Record<string, string>>;
  ilegibleId: string;
  /** Lo que nunca puede salir en la respuesta: claros, cifrados, ids. */
  prohibidos: string[];
}

async function sembrar(tx: TxDeTest): Promise<Sembrada> {
  const org = (await crearOrganizacion(tx, { nombre: `Empresa recifrado v9 ${randomUUID()}` })).id;
  const claros = new Map<string, Record<string, string>>();
  const prohibidos: string[] = [org];

  async function cifradosEnV1(id: string, valores: Record<string, string>, aadId = id): Promise<Record<string, string>> {
    const salida: Record<string, string> = {};
    for (const [campo, claro] of Object.entries(valores)) {
      salida[campo] = await enV1.cifrar(claro, { organizacionId: org, integracionId: aadId, campo });
      prohibidos.push(claro, salida[campo]);
    }
    return salida;
  }

  const rutas = randomUUID();
  const clarosRutas = { clave_api: `rutas-${randomUUID()}`, cuenta_servicio: `cuenta-${randomUUID()}` };
  claros.set(rutas, clarosRutas);
  await tx.integracion.create({
    data: {
      id: rutas,
      organizacionId: org,
      servicio: "optimizacion_rutas",
      estado: "error",
      secretos: await cifradosEnV1(rutas, clarosRutas),
      datosPublicos: { proyecto: "proyecto-test", region: "us-central1" },
      ultimoErrorCodigo: "credencial_rechazada",
      ultimaPruebaAt: new Date("2026-11-20T15:04:05.000Z"),
    },
  });

  const wa = randomUUID();
  const clarosWa = { token_acceso: `tok-${randomUUID()}`, app_secret: `app-secret-${randomUUID()}` };
  claros.set(wa, clarosWa);
  await tx.integracion.create({
    data: {
      id: wa,
      organizacionId: org,
      servicio: "whatsapp",
      estado: "conectada",
      secretos: await cifradosEnV1(wa, clarosWa),
      datosPublicos: { nombreVisible: "Mensajeria", wabaId: "120000000000001", telefonoVisible: "+0 000", nombreVerificado: "M" },
      whatsappNumeroId: `9${Date.now()}${Math.floor(Math.random() * 1e6)}`,
      whatsappResumenVerificacion: new ResumenSecretoSha256().resumen(randomUUID()),
      ultimaPruebaAt: new Date("2026-11-21T10:00:00.000Z"),
      ultimoWebhookAt: new Date("2026-11-22T11:30:00.000Z"),
    },
  });

  // Ilegible: cifrado con los datos asociados de OTRA integracion (un cifrado copiado de fila).
  const maps = randomUUID();
  await tx.integracion.create({
    data: {
      id: maps,
      organizacionId: org,
      servicio: "google_maps",
      estado: "conectada",
      secretos: await cifradosEnV1(maps, { clave_api: `maps-${randomUUID()}` }, randomUUID()),
      datosPublicos: {},
    },
  });

  prohibidos.push(rutas, wa, maps, V1.toString("base64"), V9.toString("base64"));
  // Siembra comprobada como dueno: sin esto un recifrado que no encuentra nada pasaria en verde.
  expect(await tx.integracion.count({ where: { organizacionId: org } })).toBe(3);
  return { org, claros, ilegibleId: maps, prohibidos };
}

/** La foto de TODAS las columnas de las filas de la empresa, y de la propia empresa (otra tabla). */
async function foto(tx: TxDeTest, s: Sembrada) {
  const filas = await tx.integracion.findMany({ where: { organizacionId: s.org }, orderBy: { id: "asc" } });
  const organizacion = await tx.organizacion.findUniqueOrThrow({ where: { id: s.org } });
  return { filas: new Map(filas.map((f) => [f.id, f])), organizacion };
}

/** La fila sin `secretos` ni `updated_at`: lo unico que el recifrado puede cambiar (R12, D8). */
function sinSecretosNiFecha(fila: object): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...fila };
  delete copia.secretos;
  delete copia.updatedAt;
  return copia;
}

/** Corre el disparador por su handler HTTP con la composicion real de la ruta. */
async function disparar(tx: TxDeTest, s: Sembrada, query: string) {
  const soloLaDelCaso: ClienteDeOrganizaciones = { organizacion: { findMany: async () => [{ id: s.org }] } };
  const res = await handleRecifrarIntegraciones(
    new Request(`https://servi.test/api/cron/recifrar-integraciones${query}`, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRETO}` },
    }),
    {
      getSecret: () => SECRETO,
      servicio: () =>
        construirServicioRecifrado({
          prisma: tx as unknown as Pick<PrismaClient, "integracion">,
          env: ENV,
          recorrerEmpresas: (fn) => paraCadaEmpresa(fn, { cliente: soloLaDelCaso }),
        }),
    },
  );
  const texto = await res.text();
  for (const prohibido of s.prohibidos) expect(texto).not.toContain(prohibido);
  return { status: res.status, cuerpo: JSON.parse(texto) as Record<string, unknown> };
}

describeSiHayBase("SLT-268 T3.1 — de v1 a v9 con la composicion de la ruta, contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R9: ?solo-contar=1 cuenta por version e ilegibles y deja las filas identicas, updated_at incluido", async () => {
    await revertida(async (tx) => {
      const s = await sembrar(tx);
      const antes = await foto(tx, s);

      const { status, cuerpo } = await disparar(tx, s, "?solo-contar=1");
      expect(status).toBe(200);
      expect(cuerpo).toEqual({
        soloContar: true,
        versionActiva: "v9",
        porVersion: { v1: 4 },
        ilegibles: 1,
        recifrados: 0,
        conflictos: 0,
        empresasConError: 0,
      });
      expect(await foto(tx, s)).toEqual(antes);
    });
  }, 60_000);

  it("R10/R12/R17/R11: recifra a v9, cambia solo secretos, la copia entregada lo lee con solo v9 y la segunda corrida no hace nada", async () => {
    await revertida(async (tx) => {
      const s = await sembrar(tx);
      const antes = await foto(tx, s);

      // R10: recifra todo lo legible que no estaba en la activa.
      const primera = await disparar(tx, s, "");
      expect(primera.status).toBe(200);
      expect(primera.cuerpo).toEqual({
        soloContar: false,
        versionActiva: "v9",
        porVersion: { v9: 4 },
        ilegibles: 1,
        recifrados: 4,
        conflictos: 0,
        empresasConError: 0,
      });

      const despues = await foto(tx, s);
      // R12: ninguna otra tabla se escribe (la empresa, intacta).
      expect(despues.organizacion).toEqual(antes.organizacion);
      expect([...despues.filas.keys()]).toEqual([...antes.filas.keys()]);
      for (const [id, previa] of antes.filas) {
        const ahora = despues.filas.get(id);
        if (ahora === undefined) throw new Error("fila desaparecida");
        if (id === s.ilegibleId) {
          // El ilegible no se toca: la fila entera igual, updated_at incluido.
          expect(ahora).toEqual(previa);
          continue;
        }
        // R12: solo `secretos` (y `updated_at`, D8) cambian; el resto, columna a columna, igual.
        const sAntes = previa.secretos;
        const sAhora = ahora.secretos;
        expect(sinSecretosNiFecha(ahora)).toEqual(sinSecretosNiFecha(previa));
        // Control: la foto sin esas dos columnas sigue teniendo las demas (no compara dos objetos vacios).
        expect(Object.keys(sinSecretosNiFecha(previa)).length).toBeGreaterThanOrEqual(11);
        expect(sAhora).not.toEqual(sAntes);
        expect(Object.keys(sAhora as object).sort()).toEqual(Object.keys(sAntes as object).sort());

        // R17: cada valor quedo en v9 y lo descifra un anillo que SOLO tiene v9 (el de la copia entregada).
        for (const [campo, claro] of Object.entries(s.claros.get(id) as Record<string, string>)) {
          const guardado = (sAhora as Record<string, string>)[campo];
          expect(guardado.startsWith("v9:")).toBe(true);
          expect(await deLaCopia.descifrar(guardado, { organizacionId: s.org, integracionId: id, campo })).toBe(claro);
        }
      }

      // R11: la segunda corrida no tiene nada que mover y no escribe ninguna fila.
      const segunda = await disparar(tx, s, "");
      expect(segunda.status).toBe(200);
      expect(segunda.cuerpo).toMatchObject({ recifrados: 0, porVersion: { v9: 4 }, ilegibles: 1, conflictos: 0 });
      expect(await foto(tx, s)).toEqual(despues);
    });
  }, 60_000);
});
