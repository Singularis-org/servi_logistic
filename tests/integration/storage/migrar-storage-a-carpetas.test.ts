// SL-19 (design §4 y §6; R23–R28) — el comando que mueve lo ya guardado a la carpeta de su empresa,
// contra Postgres REAL y el doble HTTP de Storage del E2E (`e2e/_storage-falso/servidor.mjs`) con el
// SDK real de `@supabase/supabase-js`.
//
// Cada caso:
//   - abre una transaccion del dueno que SIEMPRE se revierte, crea dos empresas (A y B) y siembra una
//     evidencia (`gestion_orden_evidencia`) y un comprobante (`wallet_comprobante`) de cada una, mas
//     una evidencia de B sin objeto;
//   - arranca su propio doble y sube a la RAIZ los objetos de esas filas (como los dejo la app antes
//     de SL-19), un huerfano, un temporal de descargas en la raiz y otro ya dentro de la carpeta de A.
//
// POR QUE EL MODO REPLICA AL SEMBRAR. Una evidencia cuelga de gestion -> orden -> tienda, zona,
// mensajero…, y un comprobante de un movimiento y un usuario. El comando solo lee `organizacion_id`
// y la ruta: la cadena de FK no cambia nada de lo que se mide, y la base de los tests no trae
// catalogo. Las FK (triggers) se apagan solo dentro de la transaccion revertida; los CHECK siguen.
//
// Las filas se leen con `soloEmpresas: [A, B]`: la base es compartida y otras filas de otros tests no
// pueden mover los conteos. Sin base, el describe se salta; con base, nada retorna antes de tiempo.
//
// Mutaciones medidas (progress/impl_SL-19.md > Mutaciones): (a) mover a la raiz en vez de a la carpeta
// -> rojo R24; (b) no comprobar el destino -> rojo R25.

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";

import { arrancarStorageFalso } from "@/e2e/_storage-falso/servidor.mjs";
import { loadDescargaConfig } from "@/lib/config/descarga";
import { loadGestionConfig } from "@/lib/config/gestion";
import { loadWalletComprobanteConfig } from "@/lib/config/wallet-comprobante";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { SupabaseSignedUrlProvider, type SignedUrlClientLike } from "@/lib/storage/SupabaseSignedUrlProvider";
import {
  lineasDelResumen,
  migrarStorageACarpetas,
  type ClienteDeStorage,
  type ConteoDeBucket,
  type Modo,
  type ResumenDeMigracion,
} from "@/scripts/migrar-storage-a-carpetas";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { CLAVE_LOCK_ESCRITURA_REAL, HAY_BASE_DE_DATOS, crearPrismaDeTest } from "../db/_postgres-real";

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const EVIDENCIAS = loadGestionConfig().EVIDENCIA_BUCKET;
const COMPROBANTES = loadWalletComprobanteConfig().BUCKET;
const DESCARGAS = loadDescargaConfig().BUCKET;

const texto = (s: string) => new TextEncoder().encode(s);

let base: PrismaClient;
let doble: Awaited<ReturnType<typeof arrancarStorageFalso>>;
let cliente: SupabaseClient;

const storage = () => cliente.storage as unknown as ClienteDeStorage;

/** Lo sembrado en la base y en el doble. Los contenidos nunca pueden salir por consola. */
interface Escenario {
  A: string;
  B: string;
  /** ruta -> contenido, de cada fila con objeto. */
  evidencia: { A: string; B: string };
  comprobante: { A: string; B: string };
  sinObjeto: string;
  huerfano: string;
  temporalEnRaiz: string;
  temporalDeA: string;
  contenidos: Map<string, string>;
}

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transaccion del dueno, siempre revertida, con el escenario sembrado. */
async function conEscenario<T>(fn: (tx: Prisma.TransactionClient, e: Escenario) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx, await sembrar(tx)));
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

async function subirARaiz(bucket: string, ruta: string, contenido: string, tipo = "image/jpeg"): Promise<void> {
  const { error } = await cliente.storage.from(bucket).upload(ruta, texto(contenido), { contentType: tipo, upsert: false });
  expect(error, `no se pudo sembrar ${bucket}/${ruta}`).toBeNull();
}

async function sembrar(tx: Prisma.TransactionClient): Promise<Escenario> {
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;
  const s = randomUUID().slice(0, 8);
  const e: Escenario = {
    A,
    B,
    evidencia: { A: `orden-${s}-a/gestion-1.jpg`, B: `orden-${s}-b/gestion-1.jpg` },
    comprobante: { A: `caja/${s}-a.pdf`, B: `caja/${s}-b.pdf` },
    sinObjeto: `orden-${s}-b/gestion-2.jpg`,
    huerfano: `suelto-${s}/sin-fila.jpg`,
    temporalEnRaiz: `tmp/${randomUUID()}.json.gz`,
    temporalDeA: `${A}/tmp/${randomUUID()}.json.gz`,
    contenidos: new Map(),
  };

  await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
  const evidencia = (organizacionId: string, storagePath: string, indice: number) =>
    tx.gestionOrdenEvidencia.create({
      data: { gestionId: randomUUID(), storagePath, contentType: "image/jpeg", indice, organizacionId },
    });
  const comprobante = (organizacionId: string, storagePath: string) =>
    tx.walletComprobante.create({
      data: {
        cajaMovimientoId: randomUUID(),
        storagePath,
        contentType: "application/pdf",
        subidoPor: randomUUID(),
        organizacionId,
      },
    });
  await evidencia(A, e.evidencia.A, 0);
  await evidencia(B, e.evidencia.B, 0);
  await evidencia(B, e.sinObjeto, 1);
  await comprobante(A, e.comprobante.A);
  await comprobante(B, e.comprobante.B);

  const sembrados: [string, string, string, string?][] = [
    [EVIDENCIAS, e.evidencia.A, `evidencia de A ${s}`],
    [EVIDENCIAS, e.evidencia.B, `evidencia de B ${s}`],
    [COMPROBANTES, e.comprobante.A, `comprobante de A ${s}`, "application/pdf"],
    [COMPROBANTES, e.comprobante.B, `comprobante de B ${s}`, "application/pdf"],
  ];
  for (const [bucket, ruta, contenido, tipo] of sembrados) {
    await subirARaiz(bucket, ruta, contenido, tipo);
    e.contenidos.set(ruta, contenido);
  }
  await subirARaiz(EVIDENCIAS, e.huerfano, `huerfano ${s}`);
  await subirARaiz(DESCARGAS, e.temporalEnRaiz, `temporal ${s}`, "application/gzip");
  await subirARaiz(DESCARGAS, e.temporalDeA, `temporal de A ${s}`, "application/gzip");
  return e;
}

/** Bytes de un objeto por su clave completa, con el cliente crudo; `null` si no existe. */
async function leer(bucket: string, clave: string): Promise<string | null> {
  const { data, error } = await cliente.storage.from(bucket).download(clave);
  if (error || !data) return null;
  return new TextDecoder().decode(await data.arrayBuffer());
}

/** Todas las claves de un bucket con su contenido, recorriendo carpetas con el cliente crudo. */
async function foto(bucket: string): Promise<Record<string, string | null>> {
  const salida: Record<string, string | null> = {};
  const pendientes = [""];
  while (pendientes.length > 0) {
    const carpeta = pendientes.pop()!;
    const { data, error } = await cliente.storage.from(bucket).list(carpeta, { limit: 1000 });
    expect(error).toBeNull();
    for (const o of data ?? []) {
      const ruta = carpeta === "" ? o.name : `${carpeta}/${o.name}`;
      if (o.id === null) pendientes.push(ruta);
      else salida[ruta] = await leer(bucket, ruta);
    }
  }
  return salida;
}

async function fotoDeTodo() {
  return { ev: await foto(EVIDENCIAS), co: await foto(COMPROBANTES), de: await foto(DESCARGAS) };
}

function correr(tx: Prisma.TransactionClient, e: Escenario, modo: Modo): Promise<ResumenDeMigracion> {
  return migrarStorageACarpetas({ db: tx, storage: storage(), modo, soloEmpresas: [e.A, e.B] });
}

function de(r: ResumenDeMigracion, bucket: string): ConteoDeBucket {
  const c = r.buckets.find((b) => b.bucket === bucket);
  expect(c, `el resumen no trae el bucket ${bucket}`).toBeDefined();
  return c!;
}

/** Firma con el adaptador REAL dentro de la empresa y devuelve lo que sirve la URL. */
async function firmadoPor(empresa: string, bucket: string, ruta: string): Promise<string> {
  const url = await conEmpresa(empresa, () =>
    new SupabaseSignedUrlProvider(cliente.storage as unknown as SignedUrlClientLike, bucket).createSignedUrl(ruta, 60),
  );
  const r = await fetch(url);
  expect(r.status).toBe(200);
  return new TextDecoder().decode(await r.arrayBuffer());
}

describeSiHayBase("SL-19 · migrar-storage-a-carpetas contra Postgres real y el doble de Storage", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  beforeEach(async () => {
    doble = await arrancarStorageFalso({ puerto: 0 });
    cliente = createClient(doble.url, "clave-falsa");
  });

  afterEach(async () => {
    await doble.cerrar();
  });

  it("R23 — sin --aplicar cuenta por bucket (a mover, sin objeto, temporales, huerfanos) y no toca nada", async () => {
    await conEscenario(async (tx, e) => {
      const antes = await fotoDeTodo();
      const r = await correr(tx, e, "prueba");

      expect(r.codigoDeSalida).toBe(0);
      expect(de(r, EVIDENCIAS)).toMatchObject({ aMover: 2, yaEnSuSitio: 0, filasSinObjeto: 1, fallos: 0 });
      expect(de(r, EVIDENCIAS).huerfanos).toEqual([e.huerfano]);
      expect(de(r, COMPROBANTES)).toMatchObject({ aMover: 2, yaEnSuSitio: 0, filasSinObjeto: 0, huerfanos: [] });
      expect(de(r, DESCARGAS)).toMatchObject({ aMover: 0, temporales: 1, huerfanos: [] });

      expect(await fotoDeTodo()).toEqual(antes);
    });
  });

  it("R23 — la salida son conteos y huerfanos (bucket y ruta): ni contenido, ni URLs, ni rutas de filas", async () => {
    await conEscenario(async (tx, e) => {
      const salida = lineasDelResumen(await correr(tx, e, "aplicar")).join("\n");
      expect(salida).toContain(`huerfano ${EVIDENCIAS} ${e.huerfano}`);
      expect(salida).toMatch(new RegExp(`\\[${EVIDENCIAS}\\] movidos: 2 `));
      for (const contenido of e.contenidos.values()) expect(salida).not.toContain(contenido);
      for (const ruta of e.contenidos.keys()) expect(salida).not.toContain(ruta);
      expect(salida).not.toMatch(/https?:|token=/);
    });
  });

  it("R24 — con --aplicar cada objeto pasa a la carpeta de su fila; A lo firma con el adaptador real y B no lo alcanza", async () => {
    await conEscenario(async (tx, e) => {
      const r = await correr(tx, e, "aplicar");
      expect(r.codigoDeSalida).toBe(0);
      expect(de(r, EVIDENCIAS)).toMatchObject({ aMover: 2, fallos: 0 });
      expect(de(r, COMPROBANTES)).toMatchObject({ aMover: 2, fallos: 0 });

      for (const [empresa, otra, clave] of [
        [e.A, e.B, "A"],
        [e.B, e.A, "B"],
      ] as const) {
        for (const [bucket, ruta] of [
          [EVIDENCIAS, e.evidencia[clave]],
          [COMPROBANTES, e.comprobante[clave]],
        ] as const) {
          const contenido = e.contenidos.get(ruta)!;
          expect(await leer(bucket, `${empresa}/${ruta}`)).toBe(contenido);
          expect(await leer(bucket, ruta)).toBeNull();
          // La ruta guardada en la base es la misma: la app la firma dentro de su empresa.
          expect(await firmadoPor(empresa, bucket, ruta)).toBe(contenido);
          await expect(firmadoPor(otra, bucket, ruta)).rejects.toThrow();
        }
      }
    });
  });

  it("R26 — con --aplicar borra los temporales de descargas de la raiz y deja los de la carpeta de A", async () => {
    await conEscenario(async (tx, e) => {
      const r = await correr(tx, e, "aplicar");
      expect(de(r, DESCARGAS)).toMatchObject({ temporales: 1, fallos: 0 });
      expect(await leer(DESCARGAS, e.temporalEnRaiz)).toBeNull();
      expect(await leer(DESCARGAS, e.temporalDeA)).not.toBeNull();
    });
  });

  it("R27 — el huerfano de la raiz no se mueve ni se borra, y se lista con su bucket y su ruta", async () => {
    await conEscenario(async (tx, e) => {
      const r = await correr(tx, e, "aplicar");
      expect(de(r, EVIDENCIAS).huerfanos).toEqual([e.huerfano]);
      expect(await leer(EVIDENCIAS, e.huerfano)).not.toBeNull();
      expect(await leer(EVIDENCIAS, `${e.A}/${e.huerfano}`)).toBeNull();
      expect(await leer(EVIDENCIAS, `${e.B}/${e.huerfano}`)).toBeNull();
    });
  });

  it("R25 — otra corrida sobre lo migrado no mueve nada ni falla: lo de la carpeta cuenta como ya movido", async () => {
    await conEscenario(async (tx, e) => {
      expect((await correr(tx, e, "aplicar")).codigoDeSalida).toBe(0);
      const migrado = await fotoDeTodo();

      for (const modo of ["aplicar", "prueba"] as const) {
        const r = await correr(tx, e, modo);
        expect(r.codigoDeSalida).toBe(0);
        expect(de(r, EVIDENCIAS)).toMatchObject({ aMover: 0, yaEnSuSitio: 2, filasSinObjeto: 1, fallos: 0 });
        expect(de(r, COMPROBANTES)).toMatchObject({ aMover: 0, yaEnSuSitio: 2, filasSinObjeto: 0, fallos: 0 });
        expect(de(r, DESCARGAS)).toMatchObject({ temporales: 0 });
        expect(await fotoDeTodo()).toEqual(migrado);
      }
    });
  });

  it("R25 — una corrida cortada (copia en la carpeta y original aun en la raiz, iguales) se completa sin fallar", async () => {
    await conEscenario(async (tx, e) => {
      expect((await correr(tx, e, "aplicar")).codigoDeSalida).toBe(0);
      // El original que la corrida cortada no llego a borrar.
      await subirARaiz(EVIDENCIAS, e.evidencia.A, e.contenidos.get(e.evidencia.A)!);

      const r = await correr(tx, e, "aplicar");
      expect(r.codigoDeSalida).toBe(0);
      expect(de(r, EVIDENCIAS)).toMatchObject({ aMover: 0, yaEnSuSitio: 1, duplicadosIguales: 1, fallos: 0 });
      expect(await leer(EVIDENCIAS, e.evidencia.A)).toBeNull();
      expect(await leer(EVIDENCIAS, `${e.A}/${e.evidencia.A}`)).toBe(e.contenidos.get(e.evidencia.A));
    });
  });

  it("R25 — si raiz y carpeta tienen bytes distintos, no toca ninguno y sale con 1", async () => {
    await conEscenario(async (tx, e) => {
      expect((await correr(tx, e, "aplicar")).codigoDeSalida).toBe(0);
      await subirARaiz(EVIDENCIAS, e.evidencia.A, "otra cosa");

      const r = await correr(tx, e, "aplicar");
      expect(r.codigoDeSalida).toBe(1);
      expect(de(r, EVIDENCIAS)).toMatchObject({ discrepancias: 1, aMover: 0 });
      expect(await leer(EVIDENCIAS, e.evidencia.A)).toBe("otra cosa");
      expect(await leer(EVIDENCIAS, `${e.A}/${e.evidencia.A}`)).toBe(e.contenidos.get(e.evidencia.A));
    });
  });

  it("R28 — --revertir devuelve a la raiz lo que se movio (una app anterior lo vuelve a leer); ida y vuelta", async () => {
    await conEscenario(async (tx, e) => {
      const inicial = await fotoDeTodo();
      expect((await correr(tx, e, "aplicar")).codigoDeSalida).toBe(0);

      const vuelta = await correr(tx, e, "revertir");
      expect(vuelta.codigoDeSalida).toBe(0);
      expect(de(vuelta, EVIDENCIAS)).toMatchObject({ aMover: 2, fallos: 0 });
      expect(de(vuelta, COMPROBANTES)).toMatchObject({ aMover: 2, fallos: 0 });
      for (const [ruta, contenido] of e.contenidos) {
        const bucket = ruta.startsWith("caja/") ? COMPROBANTES : EVIDENCIAS;
        // Como leia la app antes de SL-19: la ruta guardada, en la raiz.
        expect(await leer(bucket, ruta)).toBe(contenido);
        expect(await leer(bucket, `${e.A}/${ruta}`)).toBeNull();
        expect(await leer(bucket, `${e.B}/${ruta}`)).toBeNull();
      }
      // Lo unico que no vuelve es el temporal de la raiz, que --aplicar borro (R26).
      const descargasSinTemporal = Object.fromEntries(
        Object.entries(inicial.de).filter(([ruta]) => ruta !== e.temporalEnRaiz),
      );
      expect(Object.keys(descargasSinTemporal)).toHaveLength(Object.keys(inicial.de).length - 1);
      expect(await fotoDeTodo()).toEqual({ ...inicial, de: descargasSinTemporal });

      const ida = await correr(tx, e, "aplicar");
      expect(ida.codigoDeSalida).toBe(0);
      expect(de(ida, EVIDENCIAS)).toMatchObject({ aMover: 2, fallos: 0 });
      expect(await firmadoPor(e.A, EVIDENCIAS, e.evidencia.A)).toBe(e.contenidos.get(e.evidencia.A));
    });
  });
});
