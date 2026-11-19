import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { RecepcionSateliteService } from "@/lib/services/RecepcionSateliteService";
import {
  listarOrdenesBodegaCompletoSchema,
  listarOrdenesBodegaPaginadoSchema,
} from "@/lib/types/recepcion-satelite";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";

/**
 * SLT-210 «Satélite: Vistas y ordenamiento en Órdenes de la bodega» (R1401, R1403, R1404, R1406)
 * — EL `ORDER BY` DE LA SATELITE CONTRA POSTGRES DE VERDAD.
 *
 * Un doble de `$queryRaw` acepta cualquier texto: no ve que `clave_remision` exista, ni que ordene
 * `NA-107` antes que `NA-1069`, ni que el orden deje el `WHERE` intacto. Aqui las filas las elige
 * y las ordena Postgres.
 *
 * La siembra, en dos bodegas (zonas):
 *   · A — cuatro ordenes `en_bodega_satelite` con fechas de creacion y remisiones CRUZADAS (el
 *     orden por fecha y el orden por remision no coinciden en ningun sentido), y una `novedad`,
 *     la MAS NUEVA y con la remision MAS BAJA, que por grupo de estado tiene que salir la ultima
 *     en las cuatro combinaciones (P2: el orden manda DENTRO del grupo).
 *   · B — dos ordenes de otra zona, mas nuevas que todas: no pueden aparecer nunca (R1404).
 *
 * Las remisiones `NA-1069` / `NA-107` son la pareja que el texto crudo ordena AL REVES que la
 * clave (ficha 423): si el `ORDER BY` usara `num_remision`, el caso «remision asc» se pone rojo.
 *
 * Todo dentro de `enTransaccionRevertida`: no queda ni una fila. Sin base, el archivo se SALTA.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Guias lejos de la secuencia real (`num_guia` es unico en toda la base). */
const GUIA_BASE = 210_210_000;

interface Contexto {
  readonly tx: Tx;
  readonly sufijo: string;
  readonly estatus: (value: string) => string;
  readonly catalogo: { cantonId: string; provinciaId: string; tipoIdentificacionId: string };
  readonly roles: { tienda: string; satelite: string };
}

async function contexto(tx: Tx): Promise<Contexto> {
  await serializarEscriturasReales(tx);
  const canton = await tx.canton.findFirst({ select: { id: true, provinciaId: true } });
  const [tipoIdentificacion, rolTienda, rolSatelite] = await Promise.all([
    tx.tipoIdentificacion.findFirst({ select: { id: true } }),
    tx.rol.findFirst({ where: { value: "adminTienda" }, select: { id: true } }),
    tx.rol.findFirst({ where: { value: "adminSatelite" }, select: { id: true } }),
  ]);
  // Fallo RUIDOSO: un `return` silencioso dejaria el caso en «passed» sin comprobar nada.
  if (!canton || !tipoIdentificacion || !rolTienda || !rolSatelite) {
    throw new Error("SLT-210: la base local no tiene catalogos (geografia / roles / identificacion)");
  }
  const mapa = new Map(
    (await tx.orderStatus.findMany({ select: { id: true, value: true } })).map((s) => [
      s.value,
      s.id,
    ]),
  );
  return {
    tx,
    sufijo: `s210-${randomUUID().slice(0, 8)}`,
    estatus: (value) => {
      const id = mapa.get(value);
      if (id === undefined) throw new Error(`SLT-210: el catalogo local no tiene el estatus ${value}`);
      return id;
    },
    catalogo: {
      cantonId: canton.id,
      provinciaId: canton.provinciaId,
      tipoIdentificacionId: tipoIdentificacion.id,
    },
    roles: { tienda: rolTienda.id, satelite: rolSatelite.id },
  };
}

interface Bodega {
  zonaId: string;
  admin: string;
  tienda: string;
}

/** Una bodega (zona) con su `adminSatelite` y una tienda. */
async function bodega(c: Contexto, nombre: string): Promise<Bodega> {
  const zonaId = (
    await c.tx.zona.create({
      data: { sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba", nombre: `${c.sufijo}-${nombre}` },
      select: { id: true },
    })
  ).id;
  const usuario = async (quien: string, rolId: string, zona: string | null) =>
    (
      await c.tx.usuario.create({
        data: {
          nombre: quien,
          primerApellido: "Prueba",
          email: `${c.sufijo}-${nombre}-${quien}@s210.local`,
          telefono: "88880000",
          passwordHash: "no-es-una-credencial",
          cedula: `${c.sufijo}-${nombre}-${quien}`,
          tipoIdentificacionId: c.catalogo.tipoIdentificacionId,
          rolId,
          zonaId: zona,
        },
        select: { id: true },
      })
    ).id;
  const admin = await usuario("Sara", c.roles.satelite, zonaId);
  const tienda = await usuario("Tienda", c.roles.tienda, null);
  return { zonaId, admin, tienda };
}

let siguienteGuia = GUIA_BASE;

/** Una orden que PASO por la bodega (ruteo + recepcion), con su fecha y su remision fijadas. */
async function ordenEnBodega(
  c: Contexto,
  b: Bodega,
  o: { remision: string; creada: string; estado: string },
): Promise<string> {
  siguienteGuia += 1;
  const id = (
    await c.tx.orden.create({
      data: {
        numGuia: siguienteGuia,
        numRemision: o.remision,
        destinatario: `Cliente ${o.remision}`,
        telefonoDest: "80000000",
        direccion: "Direccion de prueba",
        producto: "caja",
        estatusId: c.estatus(o.estado),
        tiendaId: b.tienda,
        zonaId: b.zonaId,
        provinciaId: c.catalogo.provinciaId,
        cantonId: c.catalogo.cantonId,
        cobraComision: true,
        createdAt: new Date(o.creada),
      },
      select: { id: true },
    })
  ).id;
  await c.tx.ordenHistorialEstado.create({
    data: {
      ordenId: id,
      estatusOrigenId: c.estatus("en_bodega_central"),
      estatusDestinoId: c.estatus("en_ruta_bodega_satelite"),
      actorUsuarioId: null,
      origenTipo: "ruteo_satelite",
    },
  });
  await c.tx.ordenHistorialEstado.create({
    data: {
      ordenId: id,
      estatusOrigenId: c.estatus("en_ruta_bodega_satelite"),
      estatusDestinoId: c.estatus("en_bodega_satelite"),
      actorUsuarioId: b.admin,
      origenTipo: "recepcion_satelite",
    },
  });
  return id;
}

/** El servicio REAL, atado a la transaccion del test. */
function servicio(tx: Tx): RecepcionSateliteService {
  const prisma = tx as unknown as PrismaClient;
  const ordenes = new OrdenRepository(prisma);
  return new RecepcionSateliteService(
    ordenes,
    new OrdenHistorialService(
      ordenes,
      new OrdenHistorialRepository(prisma),
      new OrdenDiaRepartoCambioRepository(prisma),
      new OrdenTraspasoRepository(prisma),
    ),
    undefined,
    reglasPaisFijas(),
  );
}

const actor = (usuarioId: string) => ({ usuarioId, rol: "adminSatelite" as const });

/** Las ordenes de A con nombre, para leer las aserciones. */
interface Sembradas {
  a1: string; // creada 1.ª, «NA-1069»
  a2: string; // creada 2.ª, «NA-2»
  a3: string; // creada 3.ª, «NA-107»
  a4: string; // creada 4.ª, «NA-5000»
  novedad: string; // la mas nueva y la remision mas baja, pero de un grupo POSTERIOR
  ajenas: string[]; // zona B
  adminA: string;
}

async function sembrar(tx: Tx): Promise<Sembradas> {
  const c = await contexto(tx);
  const a = await bodega(c, "a");
  const b = await bodega(c, "b");
  const enBodega = "en_bodega_satelite";
  const a1 = await ordenEnBodega(c, a, { remision: "NA-1069", creada: "2020-01-01T10:00:00Z", estado: enBodega });
  const a2 = await ordenEnBodega(c, a, { remision: "NA-2", creada: "2020-01-02T10:00:00Z", estado: enBodega });
  const a3 = await ordenEnBodega(c, a, { remision: "NA-107", creada: "2020-01-03T10:00:00Z", estado: enBodega });
  const a4 = await ordenEnBodega(c, a, { remision: "NA-5000", creada: "2020-01-04T10:00:00Z", estado: enBodega });
  const novedad = await ordenEnBodega(c, a, { remision: "NA-1", creada: "2020-01-09T10:00:00Z", estado: "novedad" });
  const ajenas = [
    await ordenEnBodega(c, b, { remision: "NA-3", creada: "2020-01-08T10:00:00Z", estado: enBodega }),
    await ordenEnBodega(c, b, { remision: "NA-4", creada: "2020-01-07T10:00:00Z", estado: "novedad" }),
  ];
  return { a1, a2, a3, a4, novedad, ajenas, adminA: a.admin };
}

async function pagina(tx: Tx, usuarioId: string, entrada: Record<string, unknown>) {
  const r = await servicio(tx).listarOrdenesBodegaPaginado(
    listarOrdenesBodegaPaginadoSchema.parse({ page: 1, pageSize: 100, ...entrada }),
    actor(usuarioId),
  );
  if (r.status !== "ok") throw new Error(`SLT-210 pagina: ${r.status}`);
  return { ids: r.items.map((o) => o.id), total: r.total };
}

async function descarga(tx: Tx, usuarioId: string, entrada: Record<string, unknown>) {
  const r = await servicio(tx).listarOrdenesBodegaCompleto(
    listarOrdenesBodegaCompletoSchema.parse(entrada),
    actor(usuarioId),
  );
  if (r.status !== "ok") throw new Error(`SLT-210 descarga: ${r.status}`);
  return r.items.map((o) => o.id);
}

const COMBINACIONES = [
  { sortBy: "created_at", sortDir: "desc" },
  { sortBy: "created_at", sortDir: "asc" },
  { sortBy: "num_remision", sortDir: "desc" },
  { sortBy: "num_remision", sortDir: "asc" },
] as const;

describeSiHayBase("SLT-210 · el orden de «Órdenes de la bodega» (SQL real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("R1401/R1403/R1404/R1406 — cada combinación ordena dentro del grupo, sin cambiar conjunto ni total", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      const sinOrden = await pagina(tx, s.adminA, {});
      const porCombinacion = [];
      for (const orden of COMBINACIONES) {
        porCombinacion.push({
          orden,
          pagina: await pagina(tx, s.adminA, orden),
          descarga: await descarga(tx, s.adminA, orden),
        });
      }
      return { s, sinOrden, porCombinacion };
    });

    const { s } = r;
    // Control positivo: la siembra llego y el listado la ve. Sin esto, un listado vacio
    // pasaria todos los «no aparece» de abajo.
    expect(r.sinOrden.total, "SLT-210: la bodega A deberia listar sus 5 ordenes").toBe(5);

    // R1401: sin orden en la entrada, el de siempre — fecha de creacion descendente.
    expect(r.sinOrden.ids).toEqual([s.a4, s.a3, s.a2, s.a1, s.novedad]);

    const esperado: Record<string, string[]> = {
      "created_at:desc": [s.a4, s.a3, s.a2, s.a1],
      "created_at:asc": [s.a1, s.a2, s.a3, s.a4],
      // Por la CLAVE de remision: NA-5000 > NA-1069 > NA-107 > NA-2 (el texto crudo diria
      // NA-5000 > NA-2 > NA-107 > NA-1069).
      "num_remision:desc": [s.a4, s.a1, s.a3, s.a2],
      "num_remision:asc": [s.a2, s.a3, s.a1, s.a4],
    };

    for (const { orden, pagina: p, descarga: d } of r.porCombinacion) {
      const clave = `${orden.sortBy}:${orden.sortDir}`;
      // R1403: el grupo de estado sigue delante; la `novedad` sale ultima en las cuatro.
      expect(p.ids, clave).toEqual([...esperado[clave]!, s.novedad]);
      // R1404: el mismo conjunto y el mismo total que sin orden; nada de la otra zona.
      expect(p.total, clave).toBe(r.sinOrden.total);
      expect([...p.ids].sort(), clave).toEqual([...r.sinOrden.ids].sort());
      for (const ajena of s.ajenas) expect(p.ids, clave).not.toContain(ajena);
      // R1406: la descarga sale en el MISMO orden que la pantalla, fila por fila.
      expect(d, clave).toEqual(p.ids);
      for (const ajena of s.ajenas) expect(d, clave).not.toContain(ajena);
    }
  });
});
