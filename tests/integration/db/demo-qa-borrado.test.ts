// SL-43 (design §4 y §9; R7, R8, R9, R10) — el borrado de las empresas demo, contra Postgres REAL y
// el doble HTTP de Storage del E2E (`e2e/_storage-falso/servidor.mjs`) con el SDK real.
//
// Las filas se COMMITEAN: el borrado abre su propia transacción, como en el build. Cada caso crea sus
// empresas y el `afterAll` borra lo que quede (marca como demo lo que sembró y borra por catálogo).
// `borrarEmpresasDemo` borra TODA empresa demo de la base: esta base de test no debe tener otras.
//
// Lo que se afirma se lee con el cliente dueño y con el cliente crudo de Storage (sin carpeta), no
// con el código que se prueba. Sin base, el describe se salta; con base, nada retorna temprano y
// cada «no cambió» va precedido de su control de no vacuidad.
//
// Mutaciones medidas (progress/impl_SL-43.md): D9.3 (1) quitar el filtro `es_demo` de
// `empresasDemo`; (2) borrar la base antes que Storage; (9) sacar `orden` de la pasada.

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { arrancarStorageFalso } from "@/e2e/_storage-falso/servidor.mjs";
import { loadDescargaConfig } from "@/lib/config/descarga";
import { loadEtiquetasConfig } from "@/lib/config/etiquetas";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { SupabaseAlmacenDescargas, type AlmacenStorageClientLike } from "@/lib/storage/SupabaseAlmacenDescargas";
import { SupabaseFileStorage, type StorageClientLike } from "@/lib/storage/SupabaseFileStorage";
import {
  BorradoDemoBloqueado,
  SlugDemoEnEmpresaReal,
  borrarEmpresasDemo,
  type AlmacenesDemo,
} from "@/scripts/demo-qa/borrar";

import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ETIQUETAS = loadEtiquetasConfig().ETIQUETAS_BUCKET;
const DESCARGAS = loadDescargaConfig().BUCKET;
const texto = (s: string) => new TextEncoder().encode(s);

let base: PrismaClient;
let doble: Awaited<ReturnType<typeof arrancarStorageFalso>>;
let cliente: SupabaseClient;
let almacenes: AlmacenesDemo;
let tablas: string[];
/** Toda organización que crea el archivo, para el `afterAll`. */
const creadas: string[] = [];

interface Sembrada {
  organizacionId: string;
  maestroId: string;
  ordenId: string;
  /** Claves completas (`<org>/<ruta>`) en el doble. */
  objetos: { bucket: string; clave: string }[];
}

/** Las tablas con `organizacion_id`, leídas aquí (no con la función que se prueba). */
async function tablasConEmpresa(): Promise<string[]> {
  const filas = await base.$queryRawUnsafe<{ t: string }[]>(
    `SELECT c.table_name AS t
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'organizacion_id'
        AND t.table_type = 'BASE TABLE'
      ORDER BY 1`,
  );
  return filas.map((f) => f.t);
}

/**
 * Huella de una empresa: recuento por tabla con su `organizacion_id`, más su fila de `organizacion`
 * y las filas de plataforma de sus usuarios (sesión y dispositivo confiado).
 */
async function huella(organizacionId: string): Promise<Record<string, number>> {
  const h: Record<string, number> = {};
  for (const t of tablas) {
    const [f] = await base.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "${t}" WHERE organizacion_id = $1`,
      organizacionId,
    );
    h[t] = f.n;
  }
  h["organizacion"] = await base.organizacion.count({ where: { id: organizacionId } });
  const usuarios = (await base.usuario.findMany({ where: { organizacionId }, select: { id: true } })).map((u) => u.id);
  h["Session"] = await base.session.count({ where: { userId: { in: usuarios } } });
  h["trusted_device"] = await base.trustedDevice.count({ where: { usuarioId: { in: usuarios } } });
  return h;
}

async function existeEnDoble(bucket: string, clave: string): Promise<boolean> {
  const { data, error } = await cliente.storage.from(bucket).download(clave);
  return !error && data !== null;
}

async function temporalesEnDoble(organizacionId: string): Promise<number> {
  const { data } = await cliente.storage.from(DESCARGAS).list(`${organizacionId}/tmp`, { limit: 1000 });
  return (data ?? []).filter((o) => o.id !== null).length;
}

/**
 * Una empresa con datos en todas las familias: una orden (y el cargo de SL-40 que le pone su
 * trigger), un movimiento de caja, la sesión y el dispositivo confiado de su maestro (plataforma,
 * colgados de `usuario`), y dos objetos en el doble: la guía que nombra la orden y un temporal.
 */
async function sembrar(etiqueta: string, demo: boolean): Promise<Sembrada> {
  const organizacionId = (await crearOrganizacion(base, { nombre: `SL-43 borrado ${etiqueta}` })).id;
  creadas.push(organizacionId);
  if (demo) await base.organizacion.update({ where: { id: organizacionId }, data: { esDemo: true } });

  const rutaGuia = `guias/${randomUUID()}.pdf`;
  const { maestroId, ordenId } = await base.$transaction(
    async (tx) => {
      await fijarEmpresa(tx, organizacionId);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const fks = await crearFksDeOrden(tx);
      const orden = await tx.orden.create({
        data: {
          numRemision: `SL43-${etiqueta}-${organizacionId.slice(0, 8)}`,
          destinatario: `Destinatario ${etiqueta}`,
          telefonoDest: "88880000",
          producto: "Producto",
          estatusId: fks.estatusId,
          tiendaId: fks.tiendaId,
          zonaId: fks.zonaId,
          provinciaId: fks.provinciaId,
          cantonId: fks.cantonId,
          downloadStoragePath: rutaGuia,
        },
        select: { id: true },
      });
      await tx.walletMovimiento.create({
        data: {
          tipo: "ingreso",
          categoria: "ingreso_ajuste",
          monto: 1,
          origenTipo: "manual",
          descripcion: "SL-43 borrado",
          registradoPor: maestro.id,
        },
      });
      return { maestroId: maestro.id, ordenId: orden.id };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
  await base.session.create({ data: { userId: maestroId, expiresAt: new Date(Date.now() + 3_600_000) } });
  await base.trustedDevice.create({ data: { usuarioId: maestroId, deviceHash: randomUUID(), ipAddress: "127.0.0.1" } });

  const guia = conEmpresa(organizacionId, () =>
    new SupabaseFileStorage(cliente.storage as unknown as StorageClientLike, ETIQUETAS).upload({
      path: rutaGuia,
      bytes: texto(`guía ${etiqueta}`),
      contentType: "application/pdf",
    }),
  );
  await guia;
  const { ruta: rutaTemporal } = await conEmpresa(organizacionId, () =>
    new SupabaseAlmacenDescargas(cliente.storage as unknown as AlmacenStorageClientLike, DESCARGAS).guardar(
      texto(`temporal ${etiqueta}`),
    ),
  );
  return {
    organizacionId,
    maestroId,
    ordenId,
    objetos: [
      { bucket: ETIQUETAS, clave: `${organizacionId}/${rutaGuia}` },
      { bucket: DESCARGAS, clave: `${organizacionId}/${rutaTemporal}` },
    ],
  };
}

/**
 * Limpieza propia, sin el código que se prueba (una mutación no debe dejar basura para la siguiente
 * corrida): las filas de plataforma de sus usuarios y, por pasadas en `SAVEPOINT`, las de empresa.
 */
async function limpiar(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await base.$transaction(
    async (tx) => {
      const usuarios = (await tx.usuario.findMany({ where: { organizacionId: { in: ids } }, select: { id: true } })).map(
        (u) => u.id,
      );
      await tx.session.deleteMany({ where: { userId: { in: usuarios } } });
      await tx.trustedDevice.deleteMany({ where: { usuarioId: { in: usuarios } } });
      await tx.loginAttempt.deleteMany({ where: { usuarioId: { in: usuarios } } });
      await tx.emailOtpChallenge.deleteMany({ where: { usuarioId: { in: usuarios } } });
      let pendientes = tablas.filter((t) => t !== "organizacion");
      while (pendientes.length > 0) {
        const fallidas: string[] = [];
        for (const t of pendientes) {
          await tx.$executeRawUnsafe(`SAVEPOINT limpiar_sl43`);
          try {
            await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organizacion_id = ANY($1::text[])`, ids);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT limpiar_sl43`);
          } catch {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT limpiar_sl43`);
            fallidas.push(t);
          }
        }
        if (fallidas.length === pendientes.length) throw new Error(`SL-43: no se pudo limpiar ${fallidas.join(", ")}`);
        pendientes = fallidas;
      }
      await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE id = ANY($1::text[])`, ids);
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}

/** Las familias que el caso exige con filas: si falta una, el «no cambió» no prueba nada. */
function exigirFamilias(h: Record<string, number>): void {
  for (const t of ["orden", "cobro_plataforma_movimiento", "wallet_movimiento", "usuario", "organizacion", "Session", "trusted_device"]) {
    expect(h[t], `la huella no tiene filas en ${t}`).toBeGreaterThan(0);
  }
}

describeSiHayBase("SL-43 — el borrado de las empresas demo", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    tablas = await tablasConEmpresa();
    doble = await arrancarStorageFalso({ puerto: 0 });
    cliente = createClient(doble.url, "clave-falsa");
    almacenes = {
      archivos: (bucket) => new SupabaseFileStorage(cliente.storage as unknown as StorageClientLike, bucket),
      descargas: () => new SupabaseAlmacenDescargas(cliente.storage as unknown as AlmacenStorageClientLike, DESCARGAS),
    };
    // La base de este test no puede traer empresas demo de otro: se borrarían con las de aquí.
    expect(await base.organizacion.count({ where: { esDemo: true } })).toBe(0);
  }, 60_000);

  afterAll(async () => {
    try {
      const quedan = (await base.organizacion.findMany({ where: { id: { in: creadas } }, select: { id: true } })).map(
        (o) => o.id,
      );
      await limpiar(quedan);
    } finally {
      await doble?.cerrar();
      await base?.$disconnect();
    }
  }, 120_000);

  it("R7, R9: borra la empresa demo entera (filas y archivos) y deja intacta la real", async () => {
    const real = await sembrar("real", false);
    const demo = await sembrar("demo", true);
    const huellaReal = await huella(real.organizacionId);
    const huellaDemo = await huella(demo.organizacionId);
    exigirFamilias(huellaReal);
    exigirFamilias(huellaDemo);
    for (const o of [...real.objetos, ...demo.objetos]) expect(await existeEnDoble(o.bucket, o.clave)).toBe(true);

    const r = await borrarEmpresasDemo(base, { almacenes });

    expect(r.empresas).toEqual([demo.organizacionId]);
    // La demo: ninguna fila en ninguna tabla, ni sus usuarios, ni lo que cuelga de ellos.
    const despues = await huella(demo.organizacionId);
    expect(Object.entries(despues).filter(([, n]) => n > 0)).toEqual([]);
    expect(await base.usuario.count({ where: { id: demo.maestroId } })).toBe(0);
    expect(await base.session.count({ where: { userId: demo.maestroId } })).toBe(0);
    expect(await base.trustedDevice.count({ where: { usuarioId: demo.maestroId } })).toBe(0);
    for (const o of demo.objetos) expect(await existeEnDoble(o.bucket, o.clave)).toBe(false);
    expect(await temporalesEnDoble(demo.organizacionId)).toBe(0);

    // La real: idéntica, y sus objetos siguen.
    expect(await huella(real.organizacionId)).toEqual(huellaReal);
    for (const o of real.objetos) expect(await existeEnDoble(o.bucket, o.clave)).toBe(true);
  }, 120_000);

  it("R8: una FK que bloquea deja todo como estaba y el error nombra la tabla", async () => {
    const demo = await sembrar("bloqueada", true);
    const antes = await huella(demo.organizacionId);
    exigirFamilias(antes);
    const sintetica = `sl43_bloqueo_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await base.$executeRawUnsafe(
      `CREATE TABLE "${sintetica}" ("id" text PRIMARY KEY, "orden_id" text NOT NULL REFERENCES "orden"("id") ON DELETE RESTRICT)`,
    );
    try {
      await base.$executeRawUnsafe(`INSERT INTO "${sintetica}" ("id", "orden_id") VALUES ('x', $1)`, demo.ordenId);

      const error = await borrarEmpresasDemo(base, { almacenes }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(BorradoDemoBloqueado);
      expect((error as BorradoDemoBloqueado).tablas).toContain("orden");
      expect((error as Error).message).toMatch(/\borden\b/);
      // Nada borrado: ni la organización, ni una fila de ninguna tabla.
      expect(await huella(demo.organizacionId)).toEqual(antes);
    } finally {
      await base.$executeRawUnsafe(`DROP TABLE IF EXISTS "${sintetica}"`);
    }
    // Sin el bloqueo, la siguiente ejecución la borra (R28: sigue marcada).
    await borrarEmpresasDemo(base, { almacenes });
    expect(await base.organizacion.count({ where: { id: demo.organizacionId } })).toBe(0);
  }, 120_000);

  it("R10: una empresa real con slug demo aborta sin tocar nada", async () => {
    const real = await sembrar("slug", false);
    const demo = await sembrar("con-real", true);
    const slugOriginal = (await base.organizacion.findUniqueOrThrow({ where: { id: real.organizacionId } })).slug;
    await base.organizacion.update({ where: { id: real.organizacionId }, data: { slug: "demo-qa-a" } });
    try {
      const antesReal = await huella(real.organizacionId);
      const antesDemo = await huella(demo.organizacionId);
      exigirFamilias(antesReal);
      exigirFamilias(antesDemo);

      await expect(borrarEmpresasDemo(base, { almacenes })).rejects.toBeInstanceOf(SlugDemoEnEmpresaReal);

      expect(await huella(real.organizacionId)).toEqual(antesReal);
      expect(await huella(demo.organizacionId)).toEqual(antesDemo);
      for (const o of [...real.objetos, ...demo.objetos]) expect(await existeEnDoble(o.bucket, o.clave)).toBe(true);
    } finally {
      await base.organizacion.update({ where: { id: real.organizacionId }, data: { slug: slugOriginal } });
    }
  }, 120_000);
});
