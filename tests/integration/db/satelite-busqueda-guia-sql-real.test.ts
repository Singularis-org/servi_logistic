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
  listarIdsVigentesBodegaSchema,
  listarOrdenesBodegaCompletoSchema,
  listarOrdenesBodegaPaginadoSchema,
} from "@/lib/types/recepcion-satelite";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";

/**
 * SLT-160 «Buscar escaneando en los listados» (R606-R608) — LA GUIA EXACTA DE LA SATELITE CONTRA
 * POSTGRES DE VERDAD. Un `WHERE` probado con dobles pasa en verde con cualquier criterio (medido
 * en este repo); aqui las filas las elige Postgres.
 *
 * Las guias las fija el test (`num_guia` es unico en toda la base): `GUIA` y `GUIA_PARECIDA`, que
 * la CONTIENE (`GUIA_PARECIDA = GUIA * 10 + 5`). Lejos de la secuencia real para no chocar con
 * filas existentes. `PREFIJO` no es la guia de ninguna orden y casa con las dos por contencion.
 *
 * Todo dentro de `enTransaccionRevertida`: no queda ni una fila. Sin base, el archivo se SALTA.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const GUIA = 209_102_401;
const GUIA_PARECIDA = 2_091_024_015;
const PREFIJO = "20910240";

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
    throw new Error("la base local no tiene catalogos (geografia / roles / identificacion)");
  }
  const mapa = new Map(
    (await tx.orderStatus.findMany({ select: { id: true, value: true } })).map((s) => [
      s.value,
      s.id,
    ]),
  );
  return {
    tx,
    sufijo: `s160-${randomUUID().slice(0, 8)}`,
    estatus: (value) => {
      const id = mapa.get(value);
      if (id === undefined) throw new Error(`el catalogo local no tiene el estatus ${value}`);
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

/** Una bodega (zona) con su `adminSatelite` y una tienda. */
async function bodega(c: Contexto, nombre: string) {
  const zonaId = (
    await c.tx.zona.create({
      data: {
        sinpeNumero: "80000000",
        sinpeNombre: "Titular de Prueba",
        nombre: `${c.sufijo}-${nombre}`,
      },
      select: { id: true },
    })
  ).id;
  const usuario = async (quien: string, rolId: string, zona: string | null) =>
    (
      await c.tx.usuario.create({
        data: {
          nombre: quien,
          primerApellido: "Prueba",
          email: `${c.sufijo}-${nombre}-${quien}@s160.local`,
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

/** Una orden con su guia fijada, que PASO por la bodega (ruteo + recepcion), en `estado`. */
async function ordenEnBodega(
  c: Contexto,
  b: { zonaId: string; admin: string; tienda: string },
  numGuia: number,
  estado: string,
): Promise<string> {
  const id = (
    await c.tx.orden.create({
      data: {
        numGuia,
        numRemision: `${c.sufijo}-${numGuia}`,
        destinatario: `Cliente ${numGuia}`,
        telefonoDest: "80000000",
        direccion: "Direccion de prueba",
        producto: "caja",
        estatusId: c.estatus(estado),
        tiendaId: b.tienda,
        zonaId: b.zonaId,
        provinciaId: c.catalogo.provinciaId,
        cantonId: c.catalogo.cantonId,
        cobraComision: true,
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

async function idsDePagina(tx: Tx, usuarioId: string, entrada: Record<string, unknown>) {
  const r = await servicio(tx).listarOrdenesBodegaPaginado(
    listarOrdenesBodegaPaginadoSchema.parse({ page: 1, pageSize: 100, ...entrada }),
    actor(usuarioId),
  );
  if (r.status !== "ok") throw new Error(`pagina: ${r.status}`);
  return r.items.map((o) => o.id).sort();
}

describeSiHayBase("SLT-160 · guia exacta en el listado de la bodega satelite (SQL real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("R606 — la guia trae solo su orden; un trozo que no es guia trae las dos por contencion", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const c = await contexto(tx);
      const a = await bodega(c, "a");
      const guia = await ordenEnBodega(c, a, GUIA, "en_bodega_satelite");
      const parecida = await ordenEnBodega(c, a, GUIA_PARECIDA, "entregado");
      return {
        guia,
        parecida,
        exacta: await idsDePagina(tx, a.admin, { q: String(GUIA) }),
        prefijo: await idsDePagina(tx, a.admin, { q: PREFIJO }),
        parecidaExacta: await idsDePagina(tx, a.admin, { q: String(GUIA_PARECIDA) }),
      };
    });
    // Control positivo: el prefijo ve las dos (las dos estan en el listado de la bodega).
    expect(r.prefijo).toEqual([r.guia, r.parecida].sort());
    // `GUIA` no trae `GUIA_PARECIDA`, que la contiene.
    expect(r.exacta).toEqual([r.guia]);
    expect(r.parecidaExacta).toEqual([r.parecida]);
  });

  it("R606 — con los filtros puestos: si la guia queda fuera del filtro, contencion", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const c = await contexto(tx);
      const a = await bodega(c, "a");
      const guia = await ordenEnBodega(c, a, GUIA, "en_bodega_satelite");
      const parecida = await ordenEnBodega(c, a, GUIA_PARECIDA, "entregado");
      return {
        guia,
        parecida,
        conFiltro: await idsDePagina(tx, a.admin, { q: String(GUIA), estados: ["entregado"] }),
      };
    });
    // La orden `GUIA` no esta en `entregado`: no activa la exacta y la parecida sale por contencion.
    expect(r.conFiltro).toEqual([r.parecida]);
  });

  it("R607 — la pagina, la descarga y la vigencia de la seleccion devuelven el mismo id", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const c = await contexto(tx);
      const a = await bodega(c, "a");
      const guia = await ordenEnBodega(c, a, GUIA, "en_bodega_satelite");
      const parecida = await ordenEnBodega(c, a, GUIA_PARECIDA, "entregado");
      const srv = servicio(tx);
      const completo = await srv.listarOrdenesBodegaCompleto(
        listarOrdenesBodegaCompletoSchema.parse({ q: String(GUIA) }),
        actor(a.admin),
      );
      const vigentes = await srv.listarIdsVigentesBodega(
        listarIdsVigentesBodegaSchema.parse({ q: String(GUIA), ids: [guia, parecida] }),
        actor(a.admin),
      );
      if (completo.status !== "ok" || vigentes.status !== "ok") throw new Error("no ok");
      return {
        guia,
        pagina: await idsDePagina(tx, a.admin, { q: String(GUIA) }),
        completo: completo.items.map((o) => o.id),
        vigentes: [...vigentes.ids],
      };
    });
    expect(r.pagina).toEqual([r.guia]);
    expect(r.completo).toEqual([r.guia]);
    expect(r.vigentes).toEqual([r.guia]);
  });

  it("R608 — la guia de OTRA ZONA no sale ni activa la exacta (la propia la ve)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const c = await contexto(tx);
      const a = await bodega(c, "a");
      const b = await bodega(c, "b");
      const ajena = await ordenEnBodega(c, b, GUIA, "en_bodega_satelite");
      const parecida = await ordenEnBodega(c, a, GUIA_PARECIDA, "entregado");
      const repo = new OrdenRepository(tx as unknown as PrismaClient);
      return {
        ajena,
        parecida,
        enA: await idsDePagina(tx, a.admin, { q: String(GUIA) }),
        enB: await idsDePagina(tx, b.admin, { q: String(GUIA) }),
        existeEnA: await repo.existeGuiaEnBodega({
          zonaId: a.zonaId,
          estatusValues: ["en_bodega_satelite", "entregado"],
          numGuia: GUIA,
        }),
      };
    });
    // Control positivo: su bodega la ve, y solo a ella.
    expect(r.enB).toEqual([r.ajena]);
    // En A: la ajena no sale y la exacta no se activa -> la parecida de A por contencion.
    expect(r.existeEnA).toBe(false);
    expect(r.enA).not.toContain(r.ajena);
    expect(r.enA).toEqual([r.parecida]);
  });

  it("R608 — la guia de OTRA EMPRESA no sale ni activa la exacta", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const c = await contexto(tx);
      const a = await bodega(c, "a");
      const parecida = await ordenEnBodega(c, a, GUIA_PARECIDA, "entregado");
      const [{ empresa }] = await tx.$queryRaw<{ empresa: string }[]>`
        SELECT current_setting('app.organizacion_id') AS "empresa"`;
      const otra = (await crearOrganizacion(tx, { nombre: "Otra empresa de SLT-160" })).id;
      await fijarEmpresa(tx, otra);
      const b = await bodega(c, "otra-empresa");
      const ajena = await ordenEnBodega(c, b, GUIA, "en_bodega_satelite");
      const orgAjena = await tx.orden.findUniqueOrThrow({
        where: { id: ajena },
        select: { organizacionId: true },
      });
      await fijarEmpresa(tx, empresa);
      return {
        empresa,
        otra,
        orgAjena: orgAjena.organizacionId,
        ajena,
        parecida,
        enA: await idsDePagina(tx, a.admin, { q: String(GUIA) }),
      };
    });
    // La siembra dice la verdad: la orden ajena es de la otra empresa.
    expect(r.orgAjena).toBe(r.otra);
    expect(r.otra).not.toBe(r.empresa);
    expect(r.enA).not.toContain(r.ajena);
    expect(r.enA).toEqual([r.parecida]);
  });
});
